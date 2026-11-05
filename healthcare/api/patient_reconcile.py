"""One-button Oracle -> ERPNext reconciliation for Patients.

Oracle stores the patient master in ``CLINIC2.PATIENT_INFO_01`` (file number
column ``C``; workbook exports may label it ``FILE_NO`` / ``PATIENT_NUM``).
ERPNext names each Patient by ``file_no`` (``autoname`` = ``field:file_no``).
The Excel import (``healthcare.api.patient_info_import``) only runs when
somebody exports by hand, so the patient register drifts from Oracle.

What one run does
-----------------
1. Reads ``PATIENT_INFO_01`` (live or Excel) and compares each file number with
   ``tabPatient``.
2. Missing file numbers are created through ``upsert_patient_from_row``.
3. When the file number is already taken in ERPNext, the run checks the
   patient **name** and **id number** (CPR). Matching (or blank on either
   side) patients are updated; conflicting name/number pairs are left alone
   and reported.
4. When the file number is free but the same id number already exists on
   another Patient, that record is updated instead of creating a duplicate.

Usage::

    bench --site <site> execute healthcare.api.patient_reconcile.preview_patient_reconcile
    bench --site <site> execute healthcare.api.patient_reconcile.start_patient_reconcile
    bench --site <site> execute healthcare.api.patient_reconcile.get_patient_reconcile_status
"""

from __future__ import annotations

import time
from typing import Any, Iterable

import frappe
from frappe import _
from frappe.utils import cint, now_datetime, nowdate

from healthcare.api.oracle_excel_source import excel_source, normalize_files, oracle_schema
from healthcare.api.oracle_sync import _fetch_rows, _in_clause
from healthcare.api.patient_info_import import (
	EXCEL_HEADER_MAP,
	_cell_text,
	_clean_oracle_num,
	_require_admin,
	patient_info_file_no_column,
	patient_info_file_no_from_row,
	upsert_patient_from_row,
)

JOB_KEY = "patient_reconcile"
PROGRESS_KEY = "healthcare:patient_reconcile:progress"
WORK_KEY = "healthcare:patient_reconcile:work"
LOCK_KEY = "healthcare:patient_reconcile:lock"
PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6

ORACLE_TABLE = "PATIENT_INFO_01"
DOCTYPE = "Patient"

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
		"oracle_patients": 0,
		"erpnext_patients": 0,
		"matched_patients": 0,
		"missing_patients": 0,
		"conflicts": 0,
		"matched_by_id": 0,
		"created": 0,
		"updated": 0,
		"skipped_conflict": 0,
		"skipped_no_name": 0,
		"skipped_no_gender": 0,
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


def _norm_name(value: Any) -> str:
	return " ".join(_cell_text(value).lower().split())


def _norm_id(value: Any) -> str:
	return _clean_oracle_num(value) or _cell_text(value)


def _file_no_from_raw(raw: dict) -> str:
	return patient_info_file_no_from_row(raw)


def _oracle_to_import_row(raw: dict) -> dict:
	row: dict[str, Any] = {}
	for key, value in (raw or {}).items():
		mapped = EXCEL_HEADER_MAP.get(str(key or "").strip().upper())
		if mapped:
			row[mapped] = value
	file_no = _file_no_from_raw(raw) or _clean_oracle_num(row.get("file_no"))
	row["file_no"] = file_no
	return row


def _identity_conflict(erp_name: str, erp_id: str, oracle_name: str, oracle_id: str) -> bool:
	"""True when both sides hold a nonempty value and they disagree."""
	en, on = _norm_name(erp_name), _norm_name(oracle_name)
	ei, oi = _norm_id(erp_id), _norm_id(oracle_id)
	name_conflict = bool(en and on and en != on)
	id_conflict = bool(ei and oi and ei != oi)
	return name_conflict or id_conflict


def _oracle_patient_index() -> dict[str, dict]:
	file_col = patient_info_file_no_column(ORACLE_TABLE)
	rows = _fetch_rows(ORACLE_TABLE, order_by=file_col)
	index: dict[str, dict] = {}
	for raw in rows or []:
		file_no = _file_no_from_raw(raw)
		if not file_no:
			continue
		index[file_no] = raw
	return index


def _erpnext_patient_page(after: str = "", limit: int = ERP_PAGE) -> list[dict]:
	return frappe.db.sql(
		"""
		select name, ifnull(file_no, '') as file_no,
			ifnull(patient_name, '') as patient_name,
			ifnull(id_number, '') as id_number
		from `tabPatient`
		where name > %s
		order by name asc
		limit %s
		""",
		(after, limit),
		as_dict=True,
	)


def _scan() -> dict:
	oracle = _oracle_patient_index()
	missing: list[list[str]] = []
	updates: list[list[str]] = []
	conflicts: list[list[str]] = []
	matched = 0
	matched_by_id = 0
	erp_total = 0
	erp_by_name: dict[str, dict] = {}
	erp_by_id: dict[str, dict] = {}
	after = ""
	while True:
		rows = _erpnext_patient_page(after)
		if not rows:
			break
		for row in rows:
			after = row["name"]
			erp_total += 1
			erp_by_name[row["name"]] = row
			file_key = _clean_oracle_num(row.get("file_no") or row.get("name"))
			if file_key:
				erp_by_name[file_key] = row
			id_key = _norm_id(row.get("id_number"))
			if id_key and id_key not in erp_by_id:
				erp_by_id[id_key] = row
		if len(rows) < ERP_PAGE:
			break

	for file_no, raw in oracle.items():
		import_row = _oracle_to_import_row(raw)
		oracle_name = _cell_text(import_row.get("full_name") or raw.get("FULL_NAME"))
		oracle_id = _cell_text(import_row.get("id_number") or raw.get("ID_NUM"))
		erp = erp_by_name.get(file_no)
		if erp:
			if _identity_conflict(
				erp.get("patient_name") or "",
				erp.get("id_number") or "",
				oracle_name,
				oracle_id,
			):
				conflicts.append([file_no, "file_no_taken", erp.get("name") or file_no])
				continue
			matched += 1
			updates.append([file_no, "update", erp.get("name") or file_no])
			continue

		by_id = erp_by_id.get(_norm_id(oracle_id)) if oracle_id else None
		if by_id:
			if _identity_conflict(
				by_id.get("patient_name") or "",
				by_id.get("id_number") or "",
				oracle_name,
				oracle_id,
			):
				conflicts.append([file_no, "id_taken", by_id.get("name") or ""])
				continue
			matched += 1
			matched_by_id += 1
			updates.append([file_no, "update_by_id", by_id.get("name") or ""])
			continue

		missing.append([file_no, "create", ""])

	return {
		"oracle_patients": len(oracle),
		"erpnext_patients": erp_total,
		"matched_patients": matched,
		"matched_by_id": matched_by_id,
		"missing_patients": missing,
		"updates": updates,
		"conflicts": conflicts,
	}


def _oracle_rows_by_file_nos(file_nos: list[str]) -> list[dict[str, str]]:
	if not file_nos:
		return []
	file_col = patient_info_file_no_column(ORACLE_TABLE)
	where = f"{file_col} in ({_in_clause(file_nos)})"
	return _fetch_rows(ORACLE_TABLE, where=where, order_by=file_col)


# ---------------------------------------------------------------------------
# Work list and repair
# ---------------------------------------------------------------------------


def _work_items(scan: dict, *, patient: str = "", limit: int = 0) -> list[list[str]]:
	patient = (patient or "").strip()
	items: list[list[str]] = []
	for entry in scan.get("missing_patients") or []:
		if patient and entry[0] != patient:
			continue
		items.append(entry)
	for entry in scan.get("updates") or []:
		if patient and entry[0] != patient and entry[2] != patient:
			continue
		items.append(entry)
	items.sort(key=lambda item: cint(item[0]) or item[0])
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

	for file_no, action, target_name in items:
		raw = raw_by_file.get(file_no)
		if not raw:
			_record_errors(progress, [f"{file_no}: not found in Oracle"])
			continue
		row = _oracle_to_import_row(raw)
		if action == "update_by_id" and target_name:
			# Update the Patient that already owns this id_number (do not rename).
			row["file_no"] = target_name
			if frappe.db.exists(DOCTYPE, target_name):
				existing_file = frappe.db.get_value(DOCTYPE, target_name, "file_no")
				if existing_file:
					row["file_no"] = existing_file

		if cint(dry_run):
			if action == "create":
				progress["created"] = cint(progress.get("created")) + 1
			else:
				progress["updated"] = cint(progress.get("updated")) + 1
			_record_samples(progress, [f"{file_no} · {action} · dry run"])
			continue

		try:
			result = upsert_patient_from_row(row)
		except Exception:
			_record_errors(progress, [f"{file_no}: {frappe.get_traceback()}"])
			continue

		status = (result or {}).get("status")
		if status == "created":
			progress["created"] = cint(progress.get("created")) + 1
			_record_samples(progress, [f"{file_no} · created"])
		elif status == "updated":
			progress["updated"] = cint(progress.get("updated")) + 1
			_record_samples(progress, [f"{file_no} · updated ({action})"])
		elif status == "skip_no_name":
			progress["skipped_no_name"] = cint(progress.get("skipped_no_name")) + 1
		elif status == "skip_no_gender":
			progress["skipped_no_gender"] = cint(progress.get("skipped_no_gender")) + 1
		else:
			_record_errors(progress, [f"{file_no}: {status or 'unexpected'}"])


def _summary_message(progress: dict) -> str:
	lines = [
		_("Reconcile Patients finished."),
		"",
		_("Oracle {0}").format(ORACLE_TABLE),
		_("Patients in Oracle: {0}").format(cint(progress.get("oracle_patients"))),
		_("Patients in ERPNext: {0}").format(cint(progress.get("erpnext_patients"))),
		_("Matched: {0}").format(cint(progress.get("matched_patients"))),
		_("Matched by id number: {0}").format(cint(progress.get("matched_by_id"))),
		_("Missing (to create): {0}").format(cint(progress.get("missing_patients"))),
		_("Conflicts (file no taken, name/number differ): {0}").format(
			cint(progress.get("conflicts"))
		),
		"",
		_("Created: {0}").format(cint(progress.get("created"))),
		_("Updated: {0}").format(cint(progress.get("updated"))),
	]
	if cint(progress.get("dry_run")):
		lines.insert(1, _("DRY RUN — nothing was changed."))
	if progress.get("skipped_conflict"):
		lines.append(
			_("Skipped — identity conflict: {0}").format(cint(progress.get("skipped_conflict")))
		)
	if progress.get("skipped_no_name"):
		lines.append(_("Skipped — no full name: {0}").format(cint(progress.get("skipped_no_name"))))
	if progress.get("skipped_no_gender"):
		lines.append(_("Skipped — no gender: {0}").format(cint(progress.get("skipped_no_gender"))))
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
		"healthcare.api.patient_reconcile.run_patient_reconcile",
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
				"message": _("Comparing patients with Oracle…"),
			}
		)
		_set_progress(progress)

		scan = _scan()
		items = _work_items(scan, patient=patient, limit=limit)
		_set_work(
			{
				"items": items,
				"conflicts": scan.get("conflicts") or [],
				"built_at": str(now_datetime()),
			}
		)
		progress.update(
			{
				"oracle_patients": scan["oracle_patients"],
				"erpnext_patients": scan["erpnext_patients"],
				"matched_patients": scan["matched_patients"],
				"matched_by_id": scan["matched_by_id"],
				"missing_patients": len(scan["missing_patients"]),
				"conflicts": len(scan["conflicts"]),
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
				"message": _("ERPNext already has every Oracle patient (or only conflicts remain)."),
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
def preview_patient_reconcile(patient: str = "", limit: int = 0, files=None) -> dict[str, Any]:
	"""Read-only: which Oracle patients are missing or conflicting in ERPNext?"""
	_require_admin()
	files = normalize_files(files)
	with excel_source(files, tables=[ORACLE_TABLE]) as source:
		scan = _scan()
		items = _work_items(scan, patient=patient, limit=limit)
		creates = [item for item in items if item[1] == "create"]
		result: dict[str, Any] = {
			"ok": True,
			"as_of": str(nowdate()),
			"mode": "patient" if patient else "site",
			"oracle_table": f"{oracle_schema()}.{ORACLE_TABLE}",
			"oracle_patients": scan["oracle_patients"],
			"oracle_rows": scan["oracle_patients"],
			"erpnext_patients": scan["erpnext_patients"],
			"matched_patients": scan["matched_patients"],
			"matched_by_id": scan["matched_by_id"],
			"missing_patients": len(creates),
			"missing_total": len(creates),
			"updates": len(items) - len(creates),
			"conflicts": len(scan["conflicts"]),
			"samples": [
				{"key": item[0], "patient": item[0], "text": item[1]} for item in items[:10]
			],
			"conflict_samples": [
				{"key": item[0], "patient": item[0], "text": f"{item[1]} → {item[2]}"}
				for item in (scan["conflicts"] or [])[:10]
			],
		}
		if source is not None:
			result["oracle_table"] = source.describe(ORACLE_TABLE)
	result["in_sync"] = not cint(result["missing_patients"]) and not cint(result["conflicts"])
	return result


@frappe.whitelist()
def start_patient_reconcile(
	patient: str = "", limit: int = 0, dry_run: int = 0, files=None
) -> dict[str, Any]:
	"""Queue one patient reconciliation (Healthcare Settings entry point)."""
	_require_admin()
	files = normalize_files(files)
	if _lock_held():
		return {
			"queued": False,
			"running": True,
			"message": _("A patient reconciliation is already running."),
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
		"healthcare.api.patient_reconcile.run_patient_reconcile",
		queue="long",
		timeout=7200,
		limit=cint(limit),
		dry_run=cint(dry_run),
		patient=patient or "",
		files=files,
	)
	return {"queued": True, "job_key": JOB_KEY, "status": progress}


@frappe.whitelist()
def get_patient_reconcile_status() -> dict[str, Any]:
	"""Progress of the last / ongoing patient reconciliation."""
	_require_admin()
	return _load_progress() or {
		"job_key": JOB_KEY,
		"state": "idle",
		"processed": 0,
		"total": 0,
	}


def run_patient_reconcile(
	limit: int = 0,
	resume: int = 0,
	token: str | None = None,
	dry_run: int = 0,
	patient: str = "",
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
				"message": _("A patient reconciliation is already running."),
			}

	outcome: dict[str, Any] = {}
	try:
		with excel_source(files, tables=[ORACLE_TABLE]):
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
		frappe.log_error(title="Patient reconciliation failed")
		raise
	finally:
		if not outcome.get("handed_over"):
			_release_lock(token)
	return outcome
