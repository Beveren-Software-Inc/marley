"""One-button Oracle -> ERPNext reconciliation for Insurance Patient Register.

A patient needs a register when they appear on ``CLINIC2.INSURANCE_00_01``
(``PATIENT_NUM``) or on ``CLINIC2.INSURANCE_00_02`` (the claim line's
``TRANS_NUM`` resolved to a patient through the claim header or an existing
Insurance Claim). ``PATIENT_INFO_01`` is not read. Either uploaded table is
enough; a live run reads both.

What one run does
-----------------
1. Collects distinct patients from ``INSURANCE_00_01`` and ``INSURANCE_00_02``.
2. Resolves the Patient by file number (creates a minimal one when missing).
3. Marks the Patient insured (TRICARE).
4. Creates an ``Insurance Patient Register`` when the patient still has none,
   and links ``Patient.insurance_register``.

Usage::

    bench --site <site> execute healthcare.api.insurance_register_reconcile.preview_insurance_register_reconcile
    bench --site <site> execute healthcare.api.insurance_register_reconcile.start_insurance_register_reconcile
    bench --site <site> execute healthcare.api.insurance_register_reconcile.get_insurance_register_reconcile_status
"""

from __future__ import annotations

import time
from typing import Any, Iterable

import frappe
from frappe import _
from frappe.utils import cint, flt, now_datetime, nowdate

from healthcare.api.oracle_excel_source import (
	current_source,
	excel_source,
	normalize_files,
	oracle_schema,
)
from healthcare.api.oracle_sync import _fetch_rows, _in_clause
from healthcare.api.patient_info_import import (
	_cell_text,
	_clean_oracle_num,
	_parse_date_value,
	_require_admin,
)
from healthcare.healthcare.api.insurance_claim import (
	TRICARE,
	_ensure_patient_register,
	_ensure_tricare,
	_mark_patient_insured,
	_resolve_patient_for_import,
)

JOB_KEY = "insurance_register_reconcile"
PROGRESS_KEY = "healthcare:insurance_register_reconcile:progress"
WORK_KEY = "healthcare:insurance_register_reconcile:work"
LOCK_KEY = "healthcare:insurance_register_reconcile:lock"
PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6

ORACLE_MASTER = "INSURANCE_00_01"
ORACLE_CHILD = "INSURANCE_00_02"
REGISTER_DOCTYPE = "Insurance Patient Register"
PATIENT_DOCTYPE = "Patient"

ERP_PAGE = 50000
IMPORT_CHUNK = 200
TIME_BUDGET = 15 * 60
SAMPLE_LIMIT = 15
ERROR_LIMIT = 5


# ---------------------------------------------------------------------------
# Progress, work list and lock
# ---------------------------------------------------------------------------


def _set_progress(progress: dict) -> None:
	progress["updated_at"] = str(now_datetime())
	frappe.cache().set_value(PROGRESS_KEY, progress, expires_in_sec=PROGRESS_TTL)


def _load_progress() -> dict:
	return frappe.cache().get_value(PROGRESS_KEY) or {}


def _set_work(work: dict) -> None:
	frappe.cache().set_value(WORK_KEY, work, expires_in_sec=PROGRESS_TTL)


def _load_work() -> dict:
	return frappe.cache().get_value(WORK_KEY) or {}


def _lock_key() -> str:
	db_name = (frappe.local.conf or {}).get("db_name") or frappe.local.site
	return f"{db_name}|{LOCK_KEY}"


def _acquire_lock() -> str | None:
	token = frappe.generate_hash(length=12)
	if not frappe.cache().set(_lock_key(), token.encode(), nx=True, ex=LOCK_TTL):
		return None
	return token


def _owns_lock(token: str | None) -> bool:
	if not token:
		return False
	return (frappe.cache().get(_lock_key()) or b"").decode() == token


def _refresh_lock(token: str) -> None:
	frappe.cache().set(_lock_key(), token.encode(), ex=LOCK_TTL)


def _release_lock(token: str | None) -> None:
	if _owns_lock(token):
		frappe.cache().delete(_lock_key())


def _lock_held() -> bool:
	return bool(frappe.cache().get(_lock_key()))


def _new_progress(limit: int = 0) -> dict:
	stamp = str(now_datetime())
	return {
		"job_key": JOB_KEY,
		"state": "queued",
		"limit": cint(limit),
		"dry_run": 0,
		"patient": "",
		"files": [],
		"index": 0,
		"processed": 0,
		"total": 0,
		"oracle_insured": 0,
		"erpnext_registers": 0,
		"matched_registers": 0,
		"missing_registers": 0,
		"registers_created": 0,
		"patients_insured": 0,
		"patients_updated": 0,
		"skipped_existing": 0,
		"skipped_no_patient": 0,
		"failed": 0,
		"errors": [],
		"samples": [],
		"started_at": stamp,
		"updated_at": stamp,
	}


def _record_samples(progress: dict, samples: Iterable[str]) -> None:
	room = SAMPLE_LIMIT - len(progress.get("samples") or [])
	if room <= 0:
		return
	for sample in samples or []:
		if room <= 0:
			break
		text = str(sample or "").strip()
		if not text:
			continue
		progress.setdefault("samples", []).append(text)
		room -= 1


def _record_errors(progress: dict, errors: Iterable[str]) -> None:
	for error in errors or []:
		text = str(error or "").strip()
		if not text:
			continue
		progress["failed"] = cint(progress.get("failed")) + 1
		if len(progress.get("errors") or []) < ERROR_LIMIT:
			progress.setdefault("errors", []).append(text[:800])


# ---------------------------------------------------------------------------
# Oracle / ERPNext comparison
# ---------------------------------------------------------------------------


def _file_no_from_raw(raw: dict) -> str:
	return _clean_oracle_num(raw.get("PATIENT_NUM"))


def _table_ready(table: str) -> bool:
	source = current_source()
	if source is None:
		return True
	return source.has_table(table)


def _uploaded_register_tables(files: Any) -> list[str]:
	"""Excel path accepts INSURANCE_00_01, INSURANCE_00_02, or both."""
	chosen: list[str] = []
	for entry in normalize_files(files):
		table = str(entry.get("table") or "").strip().upper()
		if table in (ORACLE_MASTER, ORACLE_CHILD) and table not in chosen:
			chosen.append(table)
	if normalize_files(files) and not chosen:
		frappe.throw(
			_(
				"Upload INSURANCE_00_01 or INSURANCE_00_02. This check does not read PATIENT_INFO_01."
			),
			title=_("Oracle Excel Upload"),
		)
	return chosen


def _oracle_table_label(source=None) -> str:
	schema = oracle_schema()
	if source is None:
		return f"{schema}.{ORACLE_MASTER} or {schema}.{ORACLE_CHILD}"
	parts = [
		source.describe(table)
		for table in (ORACLE_MASTER, ORACLE_CHILD)
		if source.has_table(table)
	]
	return " or ".join(parts) or f"{schema}.{ORACLE_MASTER} or {schema}.{ORACLE_CHILD}"


def _patients_by_claim_trans(trans_nums: list[str]) -> dict[str, str]:
	"""Map a claim number to the patient already stored on Insurance Claim."""
	found: dict[str, str] = {}
	pending = [num for num in dict.fromkeys(trans_nums) if num]
	for start in range(0, len(pending), 500):
		chunk = pending[start : start + 500]
		rows = frappe.db.sql(
			f"""
			select name, ifnull(patient, '') as patient,
				ifnull(patient_num, '') as patient_num
			from `tabInsurance Claim`
			where name in ({", ".join(["%s"] * len(chunk))})
			""",
			tuple(chunk),
			as_dict=True,
		)
		for row in rows or []:
			patient = _clean_oracle_num(row.get("patient")) or _clean_oracle_num(
				row.get("patient_num")
			)
			if patient:
				found[str(row.get("name"))] = patient
	return found


def _oracle_insured_index() -> dict[str, dict]:
	"""Patients on INSURANCE_00_01, plus patients reached only through INSURANCE_00_02."""
	index: dict[str, dict] = {}
	trans_patient: dict[str, str] = {}

	if _table_ready(ORACLE_MASTER):
		for raw in _fetch_rows(ORACLE_MASTER, order_by="PATIENT_NUM") or []:
			file_no = _file_no_from_raw(raw)
			trans = _clean_oracle_num(raw.get("TRANS_NUM"))
			if file_no and trans:
				trans_patient[trans] = file_no
			if file_no and file_no not in index:
				index[file_no] = raw

	if _table_ready(ORACLE_CHILD):
		unknown: list[str] = []
		for raw in _fetch_rows(ORACLE_CHILD, order_by="TRANS_NUM") or []:
			trans = _clean_oracle_num(raw.get("TRANS_NUM"))
			if not trans or trans in trans_patient:
				continue
			unknown.append(trans)
		for trans, file_no in _patients_by_claim_trans(unknown).items():
			if file_no not in index:
				index[file_no] = {"PATIENT_NUM": file_no, "TRANS_NUM": trans}

	return index


def _patients_with_register() -> tuple[set[str], int]:
	"""Patients already linked to an Insurance Patient Register + register count."""
	names: set[str] = set()
	register_count = 0
	after = ""
	while True:
		rows = frappe.db.sql(
			"""
			select name, ifnull(patient, '') as patient
			from `tabInsurance Patient Register`
			where name > %s
			order by name asc
			limit %s
			""",
			(after, ERP_PAGE),
			as_dict=True,
		)
		if not rows:
			break
		for row in rows:
			after = row["name"]
			register_count += 1
			patient = (row.get("patient") or "").strip()
			if patient:
				names.add(patient)
		if len(rows) < ERP_PAGE:
			break

	# Also count Patient.insurance_register links (covers renamed / unlinked parents).
	if frappe.db.has_column(PATIENT_DOCTYPE, "insurance_register"):
		after = ""
		while True:
			rows = frappe.db.sql(
				"""
				select name, ifnull(insurance_register, '') as insurance_register
				from `tabPatient`
				where name > %s and ifnull(insurance_register, '') != ''
				order by name asc
				limit %s
				""",
				(after, ERP_PAGE),
				as_dict=True,
			)
			if not rows:
				break
			for row in rows:
				after = row["name"]
				names.add(row["name"])
			if len(rows) < ERP_PAGE:
				break
	return names, register_count


def _scan() -> dict:
	oracle = _oracle_insured_index()
	with_register, register_count = _patients_with_register()
	missing: list[list[str]] = []
	matched = 0
	for file_no in sorted(oracle, key=lambda x: cint(x) or x):
		if file_no in with_register:
			matched += 1
			continue
		missing.append([file_no, file_no])

	return {
		"oracle_insured": len(oracle),
		"erpnext_registers": register_count,
		"matched_registers": matched,
		"missing_registers": missing,
	}


def _oracle_rows_by_file_nos(file_nos: list[str]) -> list[dict[str, str]]:
	if not file_nos:
		return []
	found: dict[str, dict] = {}
	if _table_ready(ORACLE_MASTER):
		where = f"PATIENT_NUM in ({_in_clause(file_nos)})"
		for raw in _fetch_rows(ORACLE_MASTER, where=where, order_by="PATIENT_NUM") or []:
			file_no = _file_no_from_raw(raw)
			if file_no and file_no not in found:
				found[file_no] = raw
	return [found.get(file_no) or {"PATIENT_NUM": file_no} for file_no in file_nos]


def _apply_oracle_insurance_fields(patient: str, raw: dict) -> None:
	"""Copy insurance columns when the claim row still carries them."""
	if not patient or not frappe.db.exists(PATIENT_DOCTYPE, patient):
		return
	meta = frappe.get_meta(PATIENT_DOCTYPE)
	values: dict[str, Any] = {"is_insurance": 1}
	mapping = {
		"insurance_company_no": _cell_text(raw.get("INSUR_COMPANY_NUM")),
		"insurance_policy_no": _cell_text(raw.get("INSUR_POLICY_NUM")),
		"insurance_work_place": _cell_text(raw.get("INSUR_WORK_PLACE")),
		"insurance_isdn_no": _cell_text(raw.get("INSUR_ISDN_NUM")),
		"employee_code": _cell_text(raw.get("INSUR_EMP_NUM")),
		"insurance_special_note": _cell_text(raw.get("INSUR_SPECIAL_NOTE")),
		"insurance_deduction_amount": flt(raw.get("INSUR_DEDUCTION_AMT") or 0),
	}
	expiry = _parse_date_value(raw.get("INSUR_EXP_DATE"))
	if expiry:
		mapping["insurance_expiry_date"] = expiry
		mapping["insurance_valid_till"] = expiry
	for field, value in mapping.items():
		if not meta.has_field(field):
			continue
		if value in (None, "", 0):
			continue
		values[field] = value
	if meta.has_field("insurance"):
		values["insurance"] = TRICARE
	frappe.db.set_value(PATIENT_DOCTYPE, patient, values, update_modified=False)


def _refresh_register_from_oracle(register_name: str, patient: str, raw: dict) -> None:
	if not register_name or not frappe.db.exists(REGISTER_DOCTYPE, register_name):
		return
	meta = frappe.get_meta(REGISTER_DOCTYPE)
	values: dict[str, Any] = {}
	full_name = (
		frappe.db.get_value(PATIENT_DOCTYPE, patient, "patient_name")
		or _cell_text(raw.get("FULL_NAME"))
		or patient
	)
	cpr = frappe.db.get_value(PATIENT_DOCTYPE, patient, "id_number") or _cell_text(
		raw.get("ID_NUM")
	)
	if meta.has_field("full_name") and full_name:
		values["full_name"] = full_name
	if meta.has_field("national_id_cpr_no") and cpr:
		values["national_id_cpr_no"] = cpr
	if meta.has_field("status"):
		values["status"] = "Active"
	if meta.has_field("insurance_provider"):
		values["insurance_provider"] = TRICARE
	if values:
		frappe.db.set_value(REGISTER_DOCTYPE, register_name, values, update_modified=False)


# ---------------------------------------------------------------------------
# Work list and repair
# ---------------------------------------------------------------------------


def _work_items(scan: dict, *, patient: str = "", limit: int = 0) -> list[list[str]]:
	patient = (patient or "").strip()
	items = list(scan.get("missing_registers") or [])
	if patient:
		items = [item for item in items if item[0] == patient]
	if cint(limit):
		items = items[: cint(limit)]
	return items


def _process_chunk(items: list[list[str]], progress: dict, *, dry_run: int = 0) -> None:
	file_nos = [item[0] for item in items]
	raw_by_file = {}
	for raw in _oracle_rows_by_file_nos(file_nos):
		key = _file_no_from_raw(raw)
		if key:
			raw_by_file[key] = raw

	_ensure_tricare()
	for file_no, _patient_num in items:
		raw = raw_by_file.get(file_no) or {}
		if cint(dry_run):
			progress["registers_created"] = cint(progress.get("registers_created")) + 1
			_record_samples(progress, [f"{file_no} · dry run"])
			continue

		try:
			patient = _resolve_patient_for_import(file_no)
			if not patient:
				progress["skipped_no_patient"] = cint(progress.get("skipped_no_patient")) + 1
				continue

			_mark_patient_insured(patient)
			_apply_oracle_insurance_fields(patient, raw)
			progress["patients_insured"] = cint(progress.get("patients_insured")) + 1
			progress["patients_updated"] = cint(progress.get("patients_updated")) + 1

			register_name, created = _ensure_patient_register(patient)
			_refresh_register_from_oracle(register_name, patient, raw)
			if created:
				progress["registers_created"] = cint(progress.get("registers_created")) + 1
				_record_samples(progress, [f"{file_no} · register {register_name}"])
			else:
				progress["skipped_existing"] = cint(progress.get("skipped_existing")) + 1
		except Exception:
			_record_errors(progress, [f"{file_no}: {frappe.get_traceback()}"])


def _summary_message(progress: dict) -> str:
	lines = [
		_("Reconcile Insurance Register finished."),
		"",
		_("Oracle {0} or {1}").format(ORACLE_MASTER, ORACLE_CHILD),
		_("Insured patients in Oracle: {0}").format(cint(progress.get("oracle_insured"))),
		_("Insurance Patient Registers in ERPNext: {0}").format(
			cint(progress.get("erpnext_registers"))
		),
		_("Already matched: {0}").format(cint(progress.get("matched_registers"))),
		_("Missing registers: {0}").format(cint(progress.get("missing_registers"))),
		"",
		_("Registers created: {0}").format(cint(progress.get("registers_created"))),
		_("Patients marked insured / updated: {0}").format(
			cint(progress.get("patients_updated"))
		),
	]
	if cint(progress.get("dry_run")):
		lines.insert(1, _("DRY RUN — nothing was changed."))
	if progress.get("skipped_existing"):
		lines.append(
			_("Skipped — register already linked: {0}").format(
				cint(progress.get("skipped_existing"))
			)
		)
	if progress.get("skipped_no_patient"):
		lines.append(
			_("Skipped — no Patient: {0}").format(cint(progress.get("skipped_no_patient")))
		)
	if progress.get("failed"):
		lines.extend(["", _("Failed: {0}").format(cint(progress.get("failed")))])
		for error in progress.get("errors") or []:
			lines.append(f"• {error}")
	samples = progress.get("samples") or []
	if samples:
		lines.extend(["", _("Samples")])
		lines.extend(f"• {sample}" for sample in samples)
	return "\n".join(lines)


# ---------------------------------------------------------------------------
# Background job
# ---------------------------------------------------------------------------


def _queue_next(token: str, progress: dict, files: Any = None) -> None:
	frappe.enqueue(
		"healthcare.api.insurance_register_reconcile.run_insurance_register_reconcile",
		queue="long",
		timeout=7200,
		resume=1,
		token=token,
		dry_run=cint(progress.get("dry_run")),
		files=files,
	)


def _run(
	token: str,
	resume: int,
	limit: int,
	dry_run: int = 0,
	patient: str = "",
	files: Any = None,
) -> dict[str, Any]:
	started = time.monotonic()
	progress = (_load_progress() if cint(resume) else {}) or _new_progress(limit)
	if cint(resume):
		limit = cint(progress.get("limit")) or cint(limit)
		dry_run = cint(progress.get("dry_run"))
		patient = progress.get("patient") or patient
		files = progress.get("files") or files

	items = (_load_work().get("items") or []) if cint(resume) else []
	if not items:
		progress.update(
			{
				"state": "scanning",
				"limit": cint(limit),
				"dry_run": cint(dry_run),
				"patient": patient or "",
				"files": files or [],
				"index": 0,
				"processed": 0,
				"message": _("Comparing insurance registers with Oracle…"),
			}
		)
		_set_progress(progress)

		scan = _scan()
		items = _work_items(scan, patient=patient, limit=limit)
		_set_work({"items": items, "built_at": str(now_datetime())})
		progress.update(
			{
				"oracle_insured": scan["oracle_insured"],
				"erpnext_registers": scan["erpnext_registers"],
				"matched_registers": scan["matched_registers"],
				"missing_registers": len(scan["missing_registers"]),
				"total": len(items),
				"state": "running",
			}
		)
		frappe.db.commit()
		_set_progress(progress)

	if not items:
		frappe.db.commit()
		progress.update(
			{
				"state": "finished",
				"finished_at": str(now_datetime()),
				"message": _(
					"Every Oracle-insured patient already has an Insurance Patient Register."
				),
			}
		)
		_set_progress(progress)
		return {"state": "finished", "progress": progress}

	while True:
		offset = cint(progress.get("index"))
		chunk = items[offset : offset + IMPORT_CHUNK]
		if not chunk:
			break
		_process_chunk(chunk, progress, dry_run=cint(dry_run))
		progress["index"] = offset + len(chunk)
		progress["processed"] = cint(progress.get("index"))
		frappe.db.commit()
		_set_progress(progress)
		_refresh_lock(token)

		if time.monotonic() - started > TIME_BUDGET:
			progress["state"] = "queued"
			progress["message"] = _("Still running ({0} of {1}).").format(
				cint(progress.get("processed")), cint(progress.get("total"))
			)
			_set_progress(progress)
			_queue_next(token, progress, files)
			return {"state": "queued", "handed_over": True, "progress": progress}

	frappe.db.commit()
	progress["processed"] = progress.get("total") or progress.get("processed")
	progress["state"] = "finished"
	progress["finished_at"] = str(now_datetime())
	progress["message"] = _summary_message(progress)
	_set_progress(progress)
	return {"state": "finished", "progress": progress}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


@frappe.whitelist()
def preview_insurance_register_reconcile(
	patient: str = "", limit: int = 0, files=None
) -> dict[str, Any]:
	"""Read-only: which Oracle-insured patients still lack a register?"""
	_require_admin()
	files = normalize_files(files)
	with excel_source(files, tables=_uploaded_register_tables(files)) as source:
		scan = _scan()
		items = _work_items(scan, patient=patient, limit=limit)
		result: dict[str, Any] = {
			"ok": True,
			"as_of": str(nowdate()),
			"mode": "patient" if patient else "site",
			"oracle_table": _oracle_table_label(source),
			"oracle_insured": scan["oracle_insured"],
			"oracle_rows": scan["oracle_insured"],
			"erpnext_registers": scan["erpnext_registers"],
			"matched_registers": scan["matched_registers"],
			"missing_registers": len(items),
			"missing_total": len(items),
			"samples": [{"key": item[0], "patient": item[0]} for item in items[:10]],
		}
	result["in_sync"] = not cint(result["missing_registers"])
	return result


@frappe.whitelist()
def start_insurance_register_reconcile(
	patient: str = "", limit: int = 0, dry_run: int = 0, files=None
) -> dict[str, Any]:
	"""Queue one insurance-register reconciliation."""
	_require_admin()
	files = normalize_files(files)
	if _lock_held():
		return {
			"queued": False,
			"running": True,
			"message": _("An insurance register reconciliation is already running."),
			"status": _load_progress(),
		}

	progress = _new_progress(limit)
	progress.update(
		{
			"state": "queued",
			"dry_run": cint(dry_run),
			"patient": patient or "",
			"files": files,
			"message": (
				_("Queued. The uploaded Excel export is read in the background.")
				if files
				else _("Queued. Oracle is read in the background.")
			),
		}
	)
	_set_progress(progress)

	frappe.enqueue(
		"healthcare.api.insurance_register_reconcile.run_insurance_register_reconcile",
		queue="long",
		timeout=7200,
		limit=cint(limit),
		dry_run=cint(dry_run),
		patient=patient or "",
		files=files,
	)
	return {"queued": True, "job_key": JOB_KEY, "status": progress}


@frappe.whitelist()
def get_insurance_register_reconcile_status() -> dict[str, Any]:
	_require_admin()
	return _load_progress() or {
		"job_key": JOB_KEY,
		"state": "idle",
		"processed": 0,
		"total": 0,
	}


def run_insurance_register_reconcile(
	limit: int = 0,
	resume: int = 0,
	token: str | None = None,
	dry_run: int = 0,
	patient: str = "",
	files: Any = None,
) -> dict[str, Any]:
	files = normalize_files(files)
	if cint(resume):
		if not _owns_lock(token):
			return {
				"state": "skipped",
				"message": _("This reconciliation run was replaced by a newer one."),
			}
	else:
		token = _acquire_lock()
		if not token:
			return {
				"state": "running",
				"message": _("An insurance register reconciliation is already running."),
			}

	outcome: dict[str, Any] = {}
	try:
		with excel_source(files, tables=_uploaded_register_tables(files)):
			outcome = _run(
				token,
				cint(resume),
				cint(limit),
				cint(dry_run),
				patient or "",
				files,
			)
	except Exception:
		progress = _load_progress() or _new_progress()
		progress["state"] = "failed"
		progress["message"] = frappe.get_traceback()
		_record_errors(progress, [frappe.get_traceback()])
		_set_progress(progress)
		frappe.log_error(title="Insurance register reconciliation failed")
		raise
	finally:
		if not outcome.get("handed_over"):
			_release_lock(token)
	return outcome
