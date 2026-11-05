"""One-button Oracle -> ERPNext reconciliation for inpatient Discharge.

Oracle stores discharge details on ``CLINIC2.IP_ADMISSION_01`` (status,
discharge date, diagnosis, instructions, …). ERPNext holds the same episode in
``Discharge``, named after the admission number. The Excel import
(``healthcare.api.ip_admission_discharge_import``) only runs when somebody
exports the table by hand, so discharged admissions can exist in Oracle while
ERPNext still has no Discharge document.

What one run does
-----------------
1. Reads ``IP_ADMISSION_01`` (live from Oracle, or from its Excel export) and
   finds admissions Oracle marks as discharged.
2. Compares those admission numbers with ``tabDischarge`` (by document name and
   ``admission`` link).
3. Missing discharges are created through ``create_discharge_if_missing``
   (insert-only: existing Discharge rows are never updated).
4. When ``IP_ADMISSION_04`` is available (second Excel sheet or live Oracle),
   discharge checklist lines are applied to newly created discharges only.

Usage::

    bench --site <site> execute healthcare.api.discharge_reconcile.preview_discharge_reconcile
    bench --site <site> execute healthcare.api.discharge_reconcile.start_discharge_reconcile
    bench --site <site> execute healthcare.api.discharge_reconcile.get_discharge_reconcile_status
    bench --site <site> execute healthcare.api.discharge_reconcile.run_discharge_reconcile --kwargs "{'limit': 5}"
"""

from __future__ import annotations

import time
from typing import Any, Iterable

import frappe
from frappe import _
from frappe.utils import cint, now_datetime, nowdate

from healthcare.api.discharge_checklist_import import (
	EXCEL_HEADER_MAP as CHECKLIST_HEADER_MAP,
	import_discharge_checklist_for_admission,
)
from healthcare.api.ip_admission_discharge_import import (
	_is_discharged_status,
	create_discharge_if_missing,
)
from healthcare.api.oracle_excel_source import current_source, excel_source, normalize_files, oracle_schema
from healthcare.api.oracle_sync import _fetch_rows, _in_clause, _row_from_oracle, _status_label
from healthcare.api.patient_info_import import _clean_oracle_num, _require_admin
from healthcare.api.visit_diagnosis_sync import _resolve_inpatient_admission

JOB_KEY = "discharge_reconcile"
PROGRESS_KEY = "healthcare:discharge_reconcile:progress"
WORK_KEY = "healthcare:discharge_reconcile:work"
LOCK_KEY = "healthcare:discharge_reconcile:lock"
PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6

ORACLE_TABLE = "IP_ADMISSION_01"
CHECKLIST_TABLE = "IP_ADMISSION_04"
DOCTYPE = "Discharge"
ADMISSION_DOCTYPE = "Inpatient Admission"

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
	return (frappe.cache().get_value(_lock_key()) or b"").decode() == token


def _refresh_lock(token: str) -> None:
	frappe.cache().set(_lock_key(), token.encode(), ex=LOCK_TTL)


def _release_lock(token: str | None) -> None:
	if _owns_lock(token):
		frappe.cache().delete(_lock_key())


def _lock_held() -> bool:
	return bool(frappe.cache().get_value(_lock_key()))


def _new_progress(limit: int = 0) -> dict:
	stamp = str(now_datetime())
	return {
		"job_key": JOB_KEY,
		"state": "queued",
		"limit": cint(limit),
		"dry_run": 0,
		"apply_checklist": 1,
		"patient": "",
		"admission": "",
		"files": [],
		"index": 0,
		"processed": 0,
		"total": 0,
		"oracle_discharged": 0,
		"erpnext_discharges": 0,
		"matched_discharges": 0,
		"missing_discharges": 0,
		"extra_discharges": 0,
		"created": 0,
		"checklist_applied": 0,
		"skipped_existing": 0,
		"skipped_no_admission": 0,
		"skipped_no_patient": 0,
		"skipped_not_discharged": 0,
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


def _is_oracle_discharged(raw: dict[str, str]) -> bool:
	if _status_label(raw.get("ADMISION_STATUS")) == "Discharged":
		return True
	row = _row_from_oracle(raw)
	if _is_discharged_status(row.get("status")):
		return True
	return bool(row.get("discharge_date"))


def _oracle_discharged_index() -> dict[str, str]:
	rows = _fetch_rows(ORACLE_TABLE, order_by="ADMISSION_NUM")
	index: dict[str, str] = {}
	for raw in rows or []:
		if not _is_oracle_discharged(raw):
			continue
		admission = _clean_oracle_num(raw.get("ADMISSION_NUM"))
		if not admission:
			continue
		index[admission] = _clean_oracle_num(raw.get("PATIENT_NUM"))
	return index


def _oracle_discharged_total() -> int:
	return len(_oracle_discharged_index())


def _erpnext_discharge_page(after: str = "", limit: int = ERP_PAGE) -> list[tuple]:
	return frappe.db.sql(
		"""
		select name, ifnull(admission, '')
		from `tabDischarge`
		where name > %s
		order by name asc
		limit %s
		""",
		(after, limit),
	)


def _scan() -> dict:
	oracle = _oracle_discharged_index()
	missing = set(oracle)
	matched = 0
	extra = 0
	erp_total = 0
	after = ""
	while True:
		rows = _erpnext_discharge_page(after)
		if not rows:
			break
		for name, admission in rows:
			after = name
			erp_total += 1
			nums = {
				n
				for n in (_clean_oracle_num(name), _clean_oracle_num(admission))
				if n
			}
			for num in nums:
				if num in missing:
					missing.discard(num)
			if nums & set(oracle):
				matched += 1
			else:
				extra += 1
		if len(rows) < ERP_PAGE:
			break

	missing_items = [[num, oracle[num]] for num in sorted(missing, key=lambda x: cint(x) or x)]

	return {
		"oracle_discharged": len(oracle),
		"erpnext_discharges": erp_total,
		"matched_discharges": matched,
		"missing_discharges": missing_items,
		"extra_discharges": extra,
	}


def _oracle_rows_by_admissions(admissions: list[str]) -> list[dict[str, str]]:
	if not admissions:
		return []
	where = f"ADMISSION_NUM in ({_in_clause(admissions)})"
	return _fetch_rows(ORACLE_TABLE, where=where, order_by="ADMISSION_NUM")


def _checklist_available() -> bool:
	source = current_source()
	if source is not None:
		return source.has_table(CHECKLIST_TABLE)
	try:
		return bool(_fetch_rows(CHECKLIST_TABLE, limit=1))
	except Exception:
		return False


def _prepare_checklist_line(raw: dict[str, str]) -> dict[str, Any]:
	line: dict[str, Any] = {}
	for name, value in (raw or {}).items():
		key = CHECKLIST_HEADER_MAP.get(str(name or "").strip().upper(), str(name or "").strip().lower())
		line[key] = value
	line["admission_num"] = _clean_oracle_num(line.get("admission_num") or raw.get("ADMISSION_NUM"))
	line["patient_num"] = _clean_oracle_num(line.get("patient_num") or raw.get("PATIENT_NUM"))
	line["sr_num"] = _clean_oracle_num(line.get("sr_num") or raw.get("SR_NUM"))
	return line


def _checklist_by_admissions(admissions: list[str]) -> dict[str, list[dict]]:
	if not admissions or not _checklist_available():
		return {}
	where = f"ADMISSION_NUM in ({_in_clause(admissions)})"
	rows = _fetch_rows(CHECKLIST_TABLE, where=where, order_by="ADMISSION_NUM, SR_NUM")
	grouped: dict[str, list[dict]] = {}
	for raw in rows or []:
		line = _prepare_checklist_line(raw)
		key = line.get("admission_num") or ""
		if not key:
			continue
		grouped.setdefault(key, []).append(line)
	return grouped


# ---------------------------------------------------------------------------
# Repair
# ---------------------------------------------------------------------------


def _allowed_admissions(patient: str = "", admission: str = "") -> set[str] | None:
	if admission:
		return {admission}
	if patient:
		return set(frappe.get_all(ADMISSION_DOCTYPE, filters={"patient": patient}, pluck="name"))
	return None


def _work_items(
	scan: dict,
	*,
	patient: str = "",
	admission: str = "",
	limit: int = 0,
) -> list[list[str]]:
	items = [[num, patient_num] for num, patient_num in scan.get("missing_discharges") or []]
	allowed = _allowed_admissions(patient, admission)
	if allowed is not None:
		filtered: list[list[str]] = []
		for num, patient_num in items:
			resolved = _resolve_inpatient_admission(num, patient_num)
			if resolved in allowed:
				filtered.append([num, patient_num])
		items = filtered
	items.sort(key=lambda item: cint(item[0]) or item[0])
	if cint(limit):
		return items[: cint(limit)]
	return items


def _process_chunk(
	items: list[list[str]],
	progress: dict,
	*,
	dry_run: int = 0,
	apply_checklist: int = 1,
) -> None:
	admissions = [item[0] for item in items]
	raw_rows = { _clean_oracle_num(r.get("ADMISSION_NUM")): r for r in _oracle_rows_by_admissions(admissions) }
	checklist_map = _checklist_by_admissions(admissions) if cint(apply_checklist) else {}

	for admission_num, patient_num in items:
		raw = raw_rows.get(admission_num)
		if not raw or not _is_oracle_discharged(raw):
			progress["skipped_not_discharged"] = cint(progress.get("skipped_not_discharged")) + 1
			continue

		row = _row_from_oracle(raw)
		if not row.get("patient"):
			row["patient"] = patient_num

		if not _resolve_inpatient_admission(admission_num, row.get("patient")):
			progress["skipped_no_admission"] = cint(progress.get("skipped_no_admission")) + 1
			_record_samples(progress, [f"{admission_num}: no Inpatient Admission"])
			continue

		if cint(dry_run):
			progress["created"] = cint(progress.get("created")) + 1
			_record_samples(progress, [f"{admission_num} · dry run"])
			continue

		try:
			status = create_discharge_if_missing(row)
		except Exception:
			_record_errors(progress, [f"{admission_num}: {frappe.get_traceback()}"])
			continue

		if status in ("skip_existing", "skip_finished"):
			progress["skipped_existing"] = cint(progress.get("skipped_existing")) + 1
		elif status == "skip_no_patient":
			progress["skipped_no_patient"] = cint(progress.get("skipped_no_patient")) + 1
		elif status == "skip_no_admission":
			progress["skipped_no_admission"] = cint(progress.get("skipped_no_admission")) + 1
		elif status == "skip_not_discharged":
			progress["skipped_not_discharged"] = cint(progress.get("skipped_not_discharged")) + 1
		elif status.startswith("created"):
			progress["created"] = cint(progress.get("created")) + 1
			_record_samples(progress, [f"{admission_num} · {status}"])
			if cint(apply_checklist):
				lines = checklist_map.get(admission_num) or []
				if lines:
					try:
						result = import_discharge_checklist_for_admission(admission_num, lines)
						if (result or {}).get("status") == "ok":
							progress["checklist_applied"] = cint(progress.get("checklist_applied")) + 1
					except Exception:
						_record_errors(
							progress, [f"{admission_num} checklist: {frappe.get_traceback()}"]
						)
		else:
			_record_errors(progress, [f"{admission_num}: {status or 'unexpected'}"])


def _summary_message(progress: dict) -> str:
	dry = cint(progress.get("dry_run"))
	lines = [
		_("Reconcile Discharge finished."),
		"",
		_("Oracle {0}").format(ORACLE_TABLE),
		_("Discharged admissions in Oracle: {0}").format(cint(progress.get("oracle_discharged"))),
		_("Discharge documents in ERPNext: {0}").format(cint(progress.get("erpnext_discharges"))),
		_("Already matched: {0}").format(cint(progress.get("matched_discharges"))),
		_("Missing Discharge documents: {0}").format(cint(progress.get("missing_discharges"))),
		"",
		_("Discharges created: {0}").format(cint(progress.get("created"))),
		_("Checklists applied: {0}").format(cint(progress.get("checklist_applied"))),
	]
	if progress.get("skipped_existing"):
		lines.append(
			_("Skipped — Discharge already exists: {0}").format(cint(progress.get("skipped_existing")))
		)
	if progress.get("skipped_no_admission"):
		lines.append(
			_("Skipped — no Inpatient Admission: {0}").format(cint(progress.get("skipped_no_admission")))
		)
	if dry:
		lines.insert(1, _("DRY RUN — nothing was changed."))
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
		"healthcare.api.discharge_reconcile.run_discharge_reconcile",
		queue="long",
		timeout=7200,
		resume=1,
		token=token,
		dry_run=cint(progress.get("dry_run")),
		apply_checklist=cint(progress.get("apply_checklist")),
		files=files,
	)


def _run(
	token: str,
	resume: int,
	limit: int,
	dry_run: int = 0,
	apply_checklist: int = 1,
	patient: str = "",
	admission: str = "",
	files: Any = None,
) -> dict[str, Any]:
	started = time.monotonic()
	progress = (_load_progress() if cint(resume) else {}) or _new_progress(limit)
	if cint(resume):
		limit = cint(progress.get("limit")) or cint(limit)
		dry_run = cint(progress.get("dry_run"))
		apply_checklist = cint(progress.get("apply_checklist"))
		patient = progress.get("patient") or patient
		admission = progress.get("admission") or admission
		files = progress.get("files") or files

	items = (_load_work().get("items") or []) if cint(resume) else []
	if not items:
		progress.update(
			{
				"state": "scanning",
				"limit": cint(limit),
				"dry_run": cint(dry_run),
				"apply_checklist": cint(apply_checklist),
				"patient": patient or "",
				"admission": admission or "",
				"files": files or [],
				"index": 0,
				"processed": 0,
				"message": _("Comparing discharges with Oracle…"),
			}
		)
		_set_progress(progress)

		scan = _scan()
		items = _work_items(scan, patient=patient, admission=admission, limit=limit)
		_set_work({"items": items, "built_at": str(now_datetime())})
		progress.update(
			{
				"oracle_discharged": scan["oracle_discharged"],
				"erpnext_discharges": scan["erpnext_discharges"],
				"matched_discharges": scan["matched_discharges"],
				"missing_discharges": len(scan["missing_discharges"]),
				"extra_discharges": scan["extra_discharges"],
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
				"message": _("ERPNext already has a Discharge for every Oracle-discharged admission."),
			}
		)
		_set_progress(progress)
		return {"state": "finished", "progress": progress}

	while True:
		offset = cint(progress.get("index"))
		chunk = items[offset : offset + IMPORT_CHUNK]
		if not chunk:
			break
		_process_chunk(chunk, progress, dry_run=cint(dry_run), apply_checklist=cint(apply_checklist))
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
def preview_discharge_reconcile(
	patient: str = "", admission: str = "", limit: int = 0, files=None
) -> dict[str, Any]:
	"""Read-only: does every Oracle-discharged admission have a Discharge?"""
	_require_admin()
	files = normalize_files(files)
	with excel_source(files, tables=[ORACLE_TABLE]) as source:
		scan = _scan()
		items = _work_items(scan, patient=patient, admission=admission, limit=limit)
		result: dict[str, Any] = {
			"ok": True,
			"as_of": str(nowdate()),
			"mode": "admission" if admission else ("patient" if patient else "site"),
			"oracle_table": f"{oracle_schema()}.{ORACLE_TABLE}",
			"checklist_table": CHECKLIST_TABLE,
			"checklist_available": _checklist_available(),
			"oracle_discharged": scan["oracle_discharged"],
			"erpnext_discharges": scan["erpnext_discharges"],
			"matched_discharges": scan["matched_discharges"],
			"extra_discharges": scan["extra_discharges"],
			"missing_discharges": len(items),
			"admissions_with_missing": len({item[0] for item in items}),
			"samples": [{"admission": item[0], "patient": item[1]} for item in items[:10]],
		}
		if source is not None:
			result["oracle_table"] = source.describe(ORACLE_TABLE)
	result["in_sync"] = not cint(result["missing_discharges"])
	return result


@frappe.whitelist()
def start_discharge_reconcile(
	patient: str = "",
	admission: str = "",
	limit: int = 0,
	dry_run: int = 0,
	apply_checklist: int = 1,
	files=None,
) -> dict[str, Any]:
	"""Queue one discharge reconciliation (Healthcare Settings entry point)."""
	_require_admin()
	files = normalize_files(files)
	if _lock_held():
		return {
			"queued": False,
			"running": True,
			"message": _("A discharge reconciliation is already running."),
			"status": _load_progress(),
		}

	progress = _new_progress(limit)
	progress.update(
		{
			"state": "queued",
			"dry_run": cint(dry_run),
			"apply_checklist": cint(apply_checklist),
			"patient": patient or "",
			"admission": admission or "",
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
		"healthcare.api.discharge_reconcile.run_discharge_reconcile",
		queue="long",
		timeout=7200,
		limit=cint(limit),
		dry_run=cint(dry_run),
		apply_checklist=cint(apply_checklist),
		patient=patient or "",
		admission=admission or "",
		files=files,
	)
	return {"queued": True, "job_key": JOB_KEY, "status": progress}


@frappe.whitelist()
def get_discharge_reconcile_status() -> dict[str, Any]:
	"""Progress of the last / ongoing discharge reconciliation."""
	_require_admin()
	return _load_progress() or {
		"job_key": JOB_KEY,
		"state": "idle",
		"processed": 0,
		"total": 0,
	}


def run_discharge_reconcile(
	limit: int = 0,
	resume: int = 0,
	token: str | None = None,
	dry_run: int = 0,
	apply_checklist: int = 1,
	patient: str = "",
	admission: str = "",
	files: Any = None,
) -> dict[str, Any]:
	"""Background entry point (also callable from the bench console)."""
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
				"message": _("A discharge reconciliation is already running."),
			}

	outcome: dict[str, Any] = {}
	try:
		with excel_source(files, tables=[ORACLE_TABLE]):
			outcome = _run(
				token,
				cint(resume),
				cint(limit),
				cint(dry_run),
				cint(apply_checklist),
				patient or "",
				admission or "",
				files,
			)
	except Exception:
		progress = _load_progress() or _new_progress()
		progress["state"] = "failed"
		progress["message"] = frappe.get_traceback()
		_record_errors(progress, [frappe.get_traceback()])
		_set_progress(progress)
		frappe.log_error(title="Discharge reconciliation failed")
		raise
	finally:
		if not outcome.get("handed_over"):
			_release_lock(token)
	return outcome
