"""Oracle -> ERPNext reconcile for Medical Diagnosis Entry.

The source is ``CLINIC2.VISIT_DIAGNOSES_01`` only. ``IP_ADMISSION_DIAGNOSES``
is the inpatient doctor note and is reconciled as a Clinical Note, not as a
Medical Diagnosis Entry.

The visit-diagnosis importer stores ``VD01/{patient}/{sr}/{visit}/{admission}/{code}``
on ``Medical Diagnosis Entry.trans_num``. One run removes extra ERPNext rows
that share that number (the earliest row is kept) and creates only the Oracle
rows that are still missing. Rows already stored are not rewritten.
"""

from __future__ import annotations

import time
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, now_datetime, nowdate

from healthcare.api.oracle_excel_source import (
	current_source,
	excel_source,
	normalize_files,
	oracle_schema,
)
from healthcare.api.oracle_sync import _fetch_rows, _in_clause, _query, _sort_key
from healthcare.api.patient_info_import import _cell_text, _clean_oracle_num, _require_admin
from healthcare.api.visit_diagnoses_op_import import _build_entry_fields as _op_build_fields

OP_TABLE = "VISIT_DIAGNOSES_01"
DOCTYPE = "Medical Diagnosis Entry"

PROGRESS_KEY = "healthcare:medical_diagnosis_reconcile:progress"
WORK_KEY = "healthcare:medical_diagnosis_reconcile:work"
LOCK_KEY = "healthcare:medical_diagnosis_reconcile:lock"
PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6
ERP_PAGE = 50000
IMPORT_CHUNK = 200
TIME_BUDGET = 15 * 60
SAMPLE_LIMIT = 15
ERROR_LIMIT = 5


def _norm_code(value: Any) -> str:
	text = _cell_text(value)
	if text.endswith(".0") and text[:-2].isdigit():
		text = text[:-2]
	if not text:
		return "-"
	if text.isdigit():
		return str(int(text))
	return text


def _norm_num(value: Any, default: str = "0") -> str:
	text = _clean_oracle_num(value)
	if not text:
		return default
	if text.isdigit():
		return str(int(text))
	return text


def op_identity(patient: Any, sr: Any, visit: Any, admission: Any, diagnosis: Any) -> str:
	"""Stable OP key. Leading zeros on numeric ids do not matter."""
	return "VD01/{0}/{1}/{2}/{3}/{4}".format(
		_norm_num(patient),
		_norm_num(sr),
		_norm_num(visit),
		_norm_num(admission),
		_norm_code(diagnosis),
	)


def normalize_stored_trans(trans_num: Any) -> str:
	text = str(trans_num or "").strip()
	if text.startswith("VD01/"):
		parts = text.split("/")
		if len(parts) >= 6:
			return op_identity(parts[1], parts[2], parts[3], parts[4], "/".join(parts[5:]))
	return text


def names_to_remove(docs: list[tuple[str, str]]) -> list[str]:
	"""Keep the earliest row. ``docs`` items are ``(name, creation)``."""
	if len(docs) < 2:
		return []
	ordered = sorted(docs, key=lambda row: (row[1], row[0]))
	return [name for name, _creation in ordered[1:]]


def _set_progress(progress: dict) -> None:
	progress["updated_at"] = str(now_datetime())
	frappe.cache().set_value(PROGRESS_KEY, progress, expires_in_sec=PROGRESS_TTL)


def _load_progress() -> dict:
	return frappe.cache().get_value(PROGRESS_KEY) or {}


def _set_work(work: dict) -> None:
	frappe.cache().set_value(WORK_KEY, work, expires_in_sec=PROGRESS_TTL)


def _load_work() -> dict:
	return frappe.cache().get_value(WORK_KEY) or {}


def _lock_name() -> str:
	db_name = (frappe.local.conf or {}).get("db_name") or frappe.local.site
	return f"{db_name}|{LOCK_KEY}"


def _acquire_lock() -> str | None:
	token = frappe.generate_hash(length=12)
	if not frappe.cache().set(_lock_name(), token.encode(), nx=True, ex=LOCK_TTL):
		return None
	return token


def _owns_lock(token: str | None) -> bool:
	if not token:
		return False
	return (frappe.cache().get(_lock_name()) or b"").decode() == token


def _release_lock() -> None:
	frappe.cache().delete(_lock_name())


def _lock_held() -> bool:
	return bool(frappe.cache().get(_lock_name()))


def _record_error(progress: dict, error: str) -> None:
	text = str(error or "").strip()
	if not text:
		return
	progress["failed"] = cint(progress.get("failed")) + 1
	errors = progress.setdefault("errors", [])
	if len(errors) < ERROR_LIMIT:
		errors.append(text[:800])


def _record_sample(progress: dict, text: str) -> None:
	if text and len(progress.get("samples") or []) < SAMPLE_LIMIT:
		progress.setdefault("samples", []).append(text)


def _table_ready(table: str) -> bool:
	source = current_source()
	if source is None:
		return True
	return source.has_table(table)


def _excel_tables(files) -> list[str]:
	entries = normalize_files(files)
	if not entries:
		return []
	chosen = []
	for entry in entries:
		table = str(entry.get("table") or "").strip().upper()
		if table == OP_TABLE and table not in chosen:
			chosen.append(table)
	if not chosen:
		frappe.throw(
			_(
				"Upload VISIT_DIAGNOSES_01. That is the Oracle table behind "
				"Medical Diagnosis Entry. IP_ADMISSION_DIAGNOSES is a Clinical Note."
			),
			title=_("Oracle Excel Upload"),
		)
	return chosen


def _op_index() -> dict[str, list[str]]:
	if not _table_ready(OP_TABLE):
		return {}
	rows = _query(
		f"select PATIENT_NUM, SR_NUM, CODE_NUM, VISIT_NUM, ADMISSION_NUM "
		f"from {oracle_schema()}.{OP_TABLE} where PATIENT_NUM is not null"
	)
	index: dict[str, list[str]] = {}
	for row in rows or []:
		if not _cell_text(row.get("CODE_NUM")):
			continue
		key = op_identity(
			row.get("PATIENT_NUM"),
			row.get("SR_NUM"),
			row.get("VISIT_NUM"),
			row.get("ADMISSION_NUM"),
			row.get("CODE_NUM"),
		)
		links = []
		for column in ("PATIENT_NUM", "VISIT_NUM", "ADMISSION_NUM"):
			value = _clean_oracle_num(row.get(column))
			if value and value not in links:
				links.append(value)
		index.setdefault(key, links)
	return index


def _oracle_index() -> dict[str, list[str]]:
	return _op_index()


def _erp_groups() -> tuple[dict[str, list[tuple[str, str, str]]], int]:
	groups: dict[str, list[tuple[str, str, str]]] = {}
	total = 0
	after = ""
	while True:
		rows = frappe.db.sql(
			f"""
			select name, ifnull(trans_num, ''), ifnull(patient, ''), creation
			from `tab{DOCTYPE}`
			where name > %s
			order by name asc
			limit %s
			""",
			(after, ERP_PAGE),
		)
		if not rows:
			break
		for name, trans_num, patient, creation in rows:
			after = name
			key = normalize_stored_trans(trans_num)
			# IP_ADMISSION_DIAGNOSES was stored here by an older import. Those
			# rows are clinical notes, so this reconcile neither counts nor changes them.
			if not key.startswith("VD01/"):
				continue
			total += 1
			groups.setdefault(key, []).append((name, str(creation or ""), patient or ""))
		if len(rows) < ERP_PAGE:
			break
	return groups, total


def _scope_keys(patient: str) -> set[str] | None:
	patient = (patient or "").strip()
	if not patient:
		return None
	keys = {_clean_oracle_num(patient)}
	rows = frappe.db.sql(
		"""
		select name, ifnull(case_no, ''), ifnull(admission_no_old, '')
		from `tabInpatient Admission`
		where patient = %s or name = %s
		""",
		(patient, patient),
	)
	for name, case_no, old in rows:
		for value in (name, case_no, old):
			cleaned = _clean_oracle_num(value)
			if cleaned:
				keys.add(cleaned)
	return {key for key in keys if key}


def _in_scope(key: str, links: list[str], docs: list[tuple[str, str, str]], scope: set[str] | None) -> bool:
	if scope is None:
		return True
	if scope.intersection(links or []):
		return True
	if scope.intersection(normalize_stored_trans(key).split("/")):
		return True
	return any(_clean_oracle_num(patient) in scope for _name, _creation, patient in docs)


def _scan(patient: str = "") -> dict:
	oracle = _oracle_index()
	groups, erp_count = _erp_groups()
	scope = _scope_keys(patient)
	missing = []
	matched = 0
	for key in sorted(oracle, key=_sort_key):
		docs = groups.get(key) or []
		if not _in_scope(key, oracle[key], docs, scope):
			continue
		if docs:
			matched += 1
		else:
			missing.append([key, oracle[key]])
	duplicates = []
	for key, docs in groups.items():
		links = oracle.get(key) or []
		if not _in_scope(key, links, docs, scope):
			continue
		duplicates.extend(names_to_remove([(name, creation) for name, creation, _patient in docs]))
	return {
		"oracle_rows": len(oracle) if scope is None else matched + len(missing),
		"erpnext_rows": erp_count,
		"matched": matched,
		"missing": missing,
		"duplicates": duplicates,
	}


def _insert_entry(fields: dict) -> str:
	doc = frappe.new_doc(DOCTYPE)
	doc.update(fields)
	doc.flags.ignore_validate = True
	doc.flags.ignore_mandatory = True
	doc.flags.ignore_links = True
	doc.flags.legacy_import = True
	doc.insert(ignore_permissions=True)
	return doc.name


def _op_row(raw: dict) -> dict:
	row = {
		"patient": _clean_oracle_num(raw.get("PATIENT_NUM")),
		"sr_no": _clean_oracle_num(raw.get("SR_NUM")),
		"diagnosis_raw": _cell_text(raw.get("CODE_NUM")),
		"details": _cell_text(raw.get("CODE_MORE_DETAIL")),
		"patient_visit_raw": _clean_oracle_num(raw.get("VISIT_NUM")),
		"inpatient_admission_raw": _clean_oracle_num(raw.get("ADMISSION_NUM")),
		"cr_id": _clean_oracle_num(raw.get("CR_ID")),
		"up_id": _clean_oracle_num(raw.get("UP_ID")),
		"cd_date": raw.get("CR_DATE"),
		"up_date": raw.get("UP_DATE"),
		"group_code_raw": _cell_text(raw.get("GROUP_CODE")),
		"source": _cell_text(raw.get("IP_OP_SOURCE")).upper(),
		"cost_center_raw": raw.get("BRANCH_NUM"),
	}
	row["trans_num"] = op_identity(
		row["patient"],
		row["sr_no"],
		row["patient_visit_raw"],
		row["inpatient_admission_raw"],
		row["diagnosis_raw"],
	)
	return row


def _load_op_rows(keys: list[str]) -> dict[str, dict]:
	patients = sorted({key.split("/")[1] for key in keys if key.count("/") >= 1 and key.split("/")[1] not in ("", "0")})
	if not patients or not _table_ready(OP_TABLE):
		return {}
	found: dict[str, dict] = {}
	for raw in _fetch_rows(OP_TABLE, where=f"PATIENT_NUM in ({_in_clause(patients)})") or []:
		row = _op_row(raw)
		found.setdefault(row["trans_num"], row)
	return found


def _create_prepared(key: str, op_rows: dict[str, dict]) -> str:
	if not key.startswith("VD01/"):
		return "skipped"
	if frappe.db.exists(DOCTYPE, {"trans_num": key}):
		return "exists"
	row = op_rows.get(key)
	if not row:
		return "skipped"
	fields, _stats = _op_build_fields(row)
	if not fields.get("diagnosis"):
		return "skipped"
	fields["trans_num"] = key
	_insert_entry(fields)
	return "created"


def _samples(items: list[list]) -> list[dict]:
	samples = []
	for key, links in items[:10]:
		sample = {"key": key, "text": "create"}
		if links:
			sample["patient"] = links[0]
		samples.append(sample)
	return samples


def _summary(progress: dict) -> str:
	lines = [
		_("Medical Diagnosis Entry reconcile finished."),
		"",
		_("Oracle {0}").format(OP_TABLE),
		_("Oracle rows: {0}").format(cint(progress.get("oracle_rows"))),
		_("Already in ERPNext: {0} ({1} matched)").format(
			cint(progress.get("erpnext_rows")), cint(progress.get("matched"))
		),
		_("Duplicates removed: {0}").format(cint(progress.get("duplicates_removed"))),
		_("Created: {0}").format(cint(progress.get("created"))),
		_("Skipped: {0}").format(cint(progress.get("skipped"))),
	]
	if progress.get("failed"):
		lines.extend(["", _("Failed: {0}").format(cint(progress.get("failed")))])
		for error in progress.get("errors") or []:
			lines.append(f"• {error}")
	return "\n".join(lines)


def _queue_next(token: str, progress: dict, files) -> None:
	frappe.enqueue(
		"healthcare.api.medical_diagnosis_reconcile.run_medical_diagnosis_reconcile",
		queue="long",
		timeout=7200,
		resume=1,
		token=token,
		dry_run=cint(progress.get("dry_run")),
		patient=progress.get("patient") or "",
		files=files,
	)


def _run(token: str, resume: int, dry_run: int, patient: str, files) -> dict[str, Any]:
	started = time.monotonic()
	if cint(resume):
		progress = _load_progress() or {}
		work = _load_work() or {}
	else:
		scan = _scan(patient)
		progress = {
			"job_key": "medical_diagnosis_reconcile",
			"state": "running",
			"dry_run": cint(dry_run),
			"patient": patient or "",
			"processed": 0,
			"total": len(scan["duplicates"]) + len(scan["missing"]),
			"oracle_rows": scan["oracle_rows"],
			"erpnext_rows": scan["erpnext_rows"],
			"matched": scan["matched"],
			"missing_total": len(scan["missing"]),
			"duplicates": len(scan["duplicates"]),
			"duplicates_removed": 0,
			"created": 0,
			"skipped": 0,
			"failed": 0,
			"errors": [],
			"samples": [],
		}
		work = {
			"duplicates": scan["duplicates"],
			"missing": scan["missing"],
			"duplicate_offset": 0,
			"missing_offset": 0,
		}
		_set_work(work)
		_set_progress(progress)

	def overtime(offset_done: int) -> bool:
		if time.monotonic() - started <= TIME_BUDGET:
			return False
		progress["processed"] = offset_done
		progress["state"] = "running"
		progress["message"] = _("Removed {0} duplicates, created {1}. Continuing.").format(
			cint(progress.get("duplicates_removed")), cint(progress.get("created"))
		)
		_set_work(work)
		_set_progress(progress)
		_queue_next(token, progress, files)
		return True

	duplicates = work.get("duplicates") or []
	offset = cint(work.get("duplicate_offset"))
	while offset < len(duplicates):
		done = offset + cint(work.get("missing_offset"))
		if overtime(done):
			return {"state": "queued", "handed_over": True, "progress": progress}
		chunk = duplicates[offset : offset + IMPORT_CHUNK]
		for name in chunk:
			if cint(dry_run):
				progress["duplicates_removed"] = cint(progress.get("duplicates_removed")) + 1
				continue
			try:
				if frappe.db.exists(DOCTYPE, name):
					frappe.delete_doc(DOCTYPE, name, ignore_permissions=True, force=1)
					progress["duplicates_removed"] = cint(progress.get("duplicates_removed")) + 1
			except Exception:
				_record_error(progress, f"{name}: {frappe.get_traceback()}")
		offset += len(chunk)
		work["duplicate_offset"] = offset
		progress["processed"] = offset
		_set_work(work)
		_set_progress(progress)
		frappe.db.commit()

	missing = work.get("missing") or []
	missing_offset = cint(work.get("missing_offset"))
	while missing_offset < len(missing):
		done = len(duplicates) + missing_offset
		if overtime(done):
			return {"state": "queued", "handed_over": True, "progress": progress}
		chunk = missing[missing_offset : missing_offset + IMPORT_CHUNK]
		keys = [key for key, _links in chunk]
		op_rows = {} if cint(dry_run) else _load_op_rows(keys)
		for key in keys:
			if cint(dry_run):
				progress["created"] = cint(progress.get("created")) + 1
				_record_sample(progress, f"{key} · dry run")
				continue
			try:
				frappe.db.savepoint("mde_one")
				status = _create_prepared(key, op_rows)
				if status == "created":
					progress["created"] = cint(progress.get("created")) + 1
					_record_sample(progress, f"{key} · created")
				else:
					progress["skipped"] = cint(progress.get("skipped")) + 1
			except Exception:
				frappe.db.rollback(save_point="mde_one")
				_record_error(progress, f"{key}: {frappe.get_traceback()}")
		missing_offset += len(chunk)
		work["missing_offset"] = missing_offset
		progress["processed"] = len(duplicates) + missing_offset
		progress["message"] = _("{0} of {1}").format(progress["processed"], progress.get("total"))
		_set_work(work)
		_set_progress(progress)
		frappe.db.commit()

	progress["processed"] = cint(progress.get("total"))
	progress["state"] = "finished"
	progress["finished_at"] = str(now_datetime())
	progress["message"] = _summary(progress)
	_set_progress(progress)
	return {"state": "finished", "progress": progress}


@frappe.whitelist()
def preview_medical_diagnosis_reconcile(patient: str = "", limit: int = 0, files=None) -> dict[str, Any]:
	_require_admin()
	files = normalize_files(files)
	with excel_source(files, tables=_excel_tables(files)) as source:
		scan = _scan(patient)
		result = {
			"ok": True,
			"as_of": str(nowdate()),
			"mode": "patient" if (patient or "").strip() else "site",
			"oracle_table": f"{oracle_schema()}.{OP_TABLE}",
			"oracle_rows": scan["oracle_rows"],
			"erpnext_rows": scan["erpnext_rows"],
			"matched": scan["matched"],
			"missing_total": len(scan["missing"]),
			"duplicates": len(scan["duplicates"]),
			"samples": _samples(scan["missing"]),
		}
		if source is not None:
			loaded = [source.describe(OP_TABLE)] if source.has_table(OP_TABLE) else []
			if loaded:
				result["oracle_table"] = " and ".join(loaded)
	result["in_sync"] = not cint(result["missing_total"]) and not cint(result["duplicates"])
	return result


@frappe.whitelist()
def start_medical_diagnosis_reconcile(
	patient: str = "", limit: int = 0, dry_run: int = 0, files=None
) -> dict[str, Any]:
	_require_admin()
	files = normalize_files(files)
	if _lock_held():
		return {
			"queued": False,
			"running": True,
			"message": _("A medical diagnosis reconciliation is already running."),
			"status": _load_progress(),
		}
	progress = {
		"job_key": "medical_diagnosis_reconcile",
		"state": "queued",
		"dry_run": cint(dry_run),
		"patient": patient or "",
		"processed": 0,
		"total": 0,
		"message": (
			_("Queued. The uploaded Excel export is read in the background.")
			if files
			else _("Queued. Oracle is read in the background.")
		),
	}
	_set_progress(progress)
	frappe.enqueue(
		"healthcare.api.medical_diagnosis_reconcile.run_medical_diagnosis_reconcile",
		queue="long",
		timeout=7200,
		dry_run=cint(dry_run),
		patient=patient or "",
		files=files,
	)
	return {"queued": True, "status": progress}


@frappe.whitelist()
def get_medical_diagnosis_reconcile_status() -> dict[str, Any]:
	_require_admin()
	return _load_progress() or {
		"job_key": "medical_diagnosis_reconcile",
		"state": "idle",
		"processed": 0,
		"total": 0,
	}


def run_medical_diagnosis_reconcile(
	limit: int = 0,
	resume: int = 0,
	token: str | None = None,
	dry_run: int = 0,
	patient: str = "",
	files=None,
) -> dict[str, Any]:
	files = normalize_files(files)
	if cint(resume):
		if not _owns_lock(token):
			return {"state": "skipped", "message": _("This reconciliation run was replaced by a newer one.")}
	else:
		token = _acquire_lock()
		if not token:
			return {"state": "running", "message": _("A medical diagnosis reconciliation is already running.")}

	outcome: dict[str, Any] = {}
	try:
		with excel_source(files, tables=_excel_tables(files)):
			outcome = _run(token, cint(resume), cint(dry_run), patient or "", files)
	except Exception:
		progress = _load_progress() or {"job_key": "medical_diagnosis_reconcile"}
		progress["state"] = "failed"
		progress["message"] = frappe.get_traceback()
		_record_error(progress, frappe.get_traceback())
		_set_progress(progress)
		frappe.log_error(title="Medical diagnosis reconciliation failed")
		raise
	finally:
		if not outcome.get("handed_over"):
			_release_lock()
	return outcome
