"""One-button Oracle -> ERPNext reconciliation for Daily Auto Visit setup.

Oracle stores the schedule and the generated visits in two tables:

* ``CLINIC2.DAILY_PATIENTS_01`` → ``Daily Patient Visit Setup`` (from/to dates,
  practitioner, up to three service lines).
* ``CLINIC2.DAILY_PATIENTS_02`` → ``Patient Visit`` with visit type
  ``Daily Auto Visit`` (INV_NUM / TRANS_NUM / YEAR_MONTH).

Matching is not TRANS_NUM-only:

* Setup: ``trans_num``, else same patient + ``from_date`` (Oracle START_DATE).
* Auto visit: ``inv_num`` / ``old_trans_num``, else same patient + encounter
  date + Daily Auto Visit.

Missing rows are created through the existing importers; existing rows are
updated (dates / services / blanks). Nothing is deleted.

Usage::

	bench --site <site> execute healthcare.api.daily_patient_visit_reconcile.preview_daily_patient_visit_reconcile
	bench --site <site> execute healthcare.api.daily_patient_visit_reconcile.start_daily_patient_visit_reconcile
	bench --site <site> execute healthcare.api.daily_patient_visit_reconcile.get_daily_patient_visit_reconcile_status
"""

from __future__ import annotations

import time
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, getdate, now_datetime, nowdate

from healthcare.api.daily_auto_visit_import import (
	DAILY_AUTO_VISIT_TYPE,
	_find_existing_daily_auto_visit,
	_row_key,
	_visit_date_from_row,
	upsert_daily_auto_visit_from_row,
)
from healthcare.api.daily_patient_visit_setup_import import (
	_find_existing_daily_patient_visit_setup,
	_service_lines_from_row,
	upsert_daily_patient_visit_setup_from_row,
)
from healthcare.api.oracle_excel_source import excel_source, normalize_files, oracle_schema
from healthcare.api.oracle_sync import _fetch_rows
from healthcare.api.patient_info_import import (
	_cell_text,
	_clean_oracle_num,
	_parse_date_value,
	_parse_datetime_value,
	_require_admin,
)

JOB_KEY = "daily_patient_visit_reconcile"
PROGRESS_KEY = "healthcare:daily_patient_visit_reconcile:progress"
WORK_KEY = "healthcare:daily_patient_visit_reconcile:work"
LOCK_KEY = "healthcare:daily_patient_visit_reconcile:lock"
PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6

SETUP_TABLE = "DAILY_PATIENTS_01"
VISIT_TABLE = "DAILY_PATIENTS_02"
ORACLE_TABLES = (SETUP_TABLE, VISIT_TABLE)

IMPORT_CHUNK = 200
TIME_BUDGET = 15 * 60
SAMPLE_LIMIT = 15
ERROR_LIMIT = 5


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
		"created": 0,
		"updated": 0,
		"skipped": 0,
		"errors": 0,
		"message": "",
		"updated_at": str(now_datetime()),
	}


def _record_errors(progress: dict, errors: list[str]) -> None:
	existing = list(progress.get("error_samples") or [])
	for err in errors:
		if len(existing) >= ERROR_LIMIT:
			break
		existing.append(err)
	progress["error_samples"] = existing
	progress["errors"] = cint(progress.get("errors")) + len(errors)


def _patient_filter_ok(row_patient: str, patient: str) -> bool:
	wanted = _clean_oracle_num(patient)
	if not wanted:
		return True
	return _clean_oracle_num(row_patient) == wanted


def _prepare_setup_row(raw: dict) -> dict | None:
	row = {str(k).lower(): v for k, v in (raw or {}).items()}
	# Keep Oracle-style keys readable for the importer helpers.
	mapped = {
		"trans_num": _clean_oracle_num(row.get("trans_num")),
		"patient_num": _clean_oracle_num(row.get("patient_num")),
		"doc_num": _clean_oracle_num(row.get("doc_num")),
		"service_num": _cell_text(row.get("service_num")),
		"service_amt": row.get("service_amt"),
		"service_num_2": _cell_text(row.get("service_num_2")),
		"service_amt_2": row.get("service_amt_2"),
		"service_num_3": _cell_text(row.get("service_num_3")),
		"service_amt_3": row.get("service_amt_3"),
		"active_yn": row.get("active_yn"),
		"branch_num": row.get("branch_num"),
		"cr_id": _clean_oracle_num(row.get("cr_id")),
		"up_id": _clean_oracle_num(row.get("up_id")),
		"cr_date": row.get("cr_date"),
		"up_date": row.get("up_date"),
		"trans_date": row.get("trans_date"),
	}
	if not mapped["trans_num"] and not mapped["patient_num"]:
		return None
	for date_key in ("start_date", "end_date", "trans_date"):
		parsed = _parse_date_value(row.get(date_key))
		if parsed:
			mapped[date_key] = parsed
	for dt_key in ("cr_date", "up_date"):
		dt = _parse_datetime_value(mapped.get(dt_key))
		if dt:
			mapped[dt_key] = dt.isoformat(sep=" ", timespec="seconds")
		elif mapped.get(dt_key) not in (None, ""):
			mapped[dt_key] = _cell_text(mapped.get(dt_key))
	mapped["services"] = _service_lines_from_row(mapped)
	return mapped


def _prepare_visit_row(raw: dict) -> dict | None:
	row = {str(k).lower(): v for k, v in (raw or {}).items()}
	mapped = {
		"inv_num": _clean_oracle_num(row.get("inv_num")),
		"patient_num": _clean_oracle_num(row.get("patient_num")),
		"trans_num": _clean_oracle_num(row.get("trans_num")),
		"year_month": _cell_text(row.get("year_month")),
		"cr_id": _clean_oracle_num(row.get("cr_id")),
		"up_id": _clean_oracle_num(row.get("up_id")),
		"cr_date": row.get("cr_date"),
		"up_date": row.get("up_date"),
	}
	key = _row_key(mapped)
	if not key:
		return None
	mapped["_key"] = key
	visit_date = _visit_date_from_row(mapped)
	if visit_date:
		mapped["encounter_date"] = visit_date
	for dt_key in ("cr_date", "up_date"):
		dt = _parse_datetime_value(mapped.get(dt_key))
		if dt:
			mapped[dt_key] = dt.isoformat(sep=" ", timespec="seconds")
		elif mapped.get(dt_key) not in (None, ""):
			mapped[dt_key] = _cell_text(mapped.get(dt_key))
	return mapped


def _load_oracle_setup_rows(patient: str = "") -> list[dict]:
	rows = _fetch_rows(SETUP_TABLE)
	prepared = []
	for raw in rows:
		row = _prepare_setup_row(raw)
		if not row:
			continue
		if not _patient_filter_ok(row.get("patient_num") or "", patient):
			continue
		prepared.append(row)
	return prepared


def _load_oracle_visit_rows(patient: str = "") -> list[dict]:
	rows = _fetch_rows(VISIT_TABLE)
	prepared = []
	for raw in rows:
		row = _prepare_visit_row(raw)
		if not row:
			continue
		if not _patient_filter_ok(row.get("patient_num") or "", patient):
			continue
		prepared.append(row)
	return prepared


def _scan(patient: str = "") -> dict[str, Any]:
	setup_rows = _load_oracle_setup_rows(patient)
	visit_rows = _load_oracle_visit_rows(patient)

	setup_missing: list[dict] = []
	setup_update: list[dict] = []
	for row in setup_rows:
		existing = _find_existing_daily_patient_visit_setup(row)
		item = {
			"kind": "setup",
			"action": "create" if not existing else "update",
			"trans_num": row.get("trans_num"),
			"patient": row.get("patient_num"),
			"date": str(row.get("start_date") or ""),
			"existing": existing or "",
			"row": row,
		}
		if existing:
			setup_update.append(item)
		else:
			setup_missing.append(item)

	visit_missing: list[dict] = []
	visit_update: list[dict] = []
	for row in visit_rows:
		existing = _find_existing_daily_auto_visit(row)
		item = {
			"kind": "visit",
			"action": "create" if not existing else "update",
			"trans_num": row.get("trans_num") or row.get("inv_num") or row.get("_key"),
			"patient": row.get("patient_num"),
			"date": str(row.get("encounter_date") or ""),
			"existing": existing or "",
			"row": row,
		}
		if existing:
			visit_update.append(item)
		else:
			visit_missing.append(item)

	erp_setups = frappe.db.count("Daily Patient Visit Setup")
	erp_visits = frappe.db.count("Patient Visit", {"visit_type": DAILY_AUTO_VISIT_TYPE})

	return {
		"oracle_table": f"{oracle_schema()}.{SETUP_TABLE} + {oracle_schema()}.{VISIT_TABLE}",
		"oracle_rows": len(setup_rows) + len(visit_rows),
		"oracle_setups": len(setup_rows),
		"oracle_visits": len(visit_rows),
		"erpnext_rows": erp_setups + erp_visits,
		"erpnext_setups": erp_setups,
		"erpnext_visits": erp_visits,
		"matched": len(setup_update) + len(visit_update),
		"setup_missing": setup_missing,
		"setup_update": setup_update,
		"visit_missing": visit_missing,
		"visit_update": visit_update,
	}


def _work_items(scan: dict, *, limit: int = 0, fill_missing: int = 1) -> list[dict]:
	items = list(scan.get("setup_missing") or []) + list(scan.get("visit_missing") or [])
	if cint(fill_missing):
		items.extend(list(scan.get("setup_update") or []))
		items.extend(list(scan.get("visit_update") or []))
	if cint(limit) > 0:
		items = items[: cint(limit)]
	# Drop heavy nested row copies from samples later; keep row for workers.
	return items


def _sample_items(items: list[dict]) -> list[dict]:
	out = []
	for item in items[:SAMPLE_LIMIT]:
		out.append(
			{
				"number": item.get("trans_num") or "",
				"patient": item.get("patient") or "",
				"date": item.get("date") or "",
				"text": f"{item.get('kind')} · {item.get('action')}",
				"admission": item.get("existing") or "",
			}
		)
	return out


@frappe.whitelist()
def preview_daily_patient_visit_reconcile(
	patient: str = "", limit: int = 0, files=None, fill_missing: int = 1
) -> dict[str, Any]:
	"""Read-only compare of DAILY_PATIENTS_01/02 vs ERPNext."""
	_require_admin()
	files = normalize_files(files)
	with excel_source(files, tables=list(ORACLE_TABLES)) as source:
		scan = _scan(patient=patient or "")
		items = _work_items(scan, limit=cint(limit), fill_missing=cint(fill_missing))
		missing = [i for i in items if i.get("action") == "create"]
		updates = [i for i in items if i.get("action") == "update"]
		result: dict[str, Any] = {
			"ok": True,
			"as_of": str(nowdate()),
			"mode": "patient" if patient else "site",
			"oracle_table": scan["oracle_table"],
			"oracle_rows": scan["oracle_rows"],
			"oracle_setups": scan["oracle_setups"],
			"oracle_visits": scan["oracle_visits"],
			"erpnext_rows": scan["erpnext_rows"],
			"erpnext_setups": scan["erpnext_setups"],
			"erpnext_visits": scan["erpnext_visits"],
			"matched": scan["matched"],
			"missing_total": len(missing),
			"update_total": len(updates),
			"samples": _sample_items(items),
			"in_sync": not missing and (not cint(fill_missing) or not updates),
		}
		if source is not None:
			bits = []
			for table in ORACLE_TABLES:
				if source.has_table(table):
					bits.append(source.describe(table))
			if bits:
				result["oracle_table"] = " + ".join(bits)
	return result


@frappe.whitelist()
def start_daily_patient_visit_reconcile(
	patient: str = "",
	limit: int = 0,
	dry_run: int = 0,
	files=None,
	fill_missing: int = 1,
) -> dict[str, Any]:
	"""Queue one Daily Patient Visit / Auto Visit reconciliation."""
	_require_admin()
	files = normalize_files(files)
	if _lock_held():
		return {
			"queued": False,
			"running": True,
			"message": _("A Daily Patient Visit reconciliation is already running."),
			"status": _load_progress(),
		}

	progress = _new_progress(limit)
	progress.update(
		{
			"state": "queued",
			"dry_run": cint(dry_run),
			"patient": patient or "",
			"files": files,
			"fill_missing": cint(fill_missing),
			"message": (
				_("Queued. The uploaded Excel exports are read in the background.")
				if files
				else _("Queued. DAILY_PATIENTS_01/02 are read from Oracle in the background.")
			),
		}
	)
	_set_progress(progress)

	frappe.enqueue(
		"healthcare.api.daily_patient_visit_reconcile.run_daily_patient_visit_reconcile",
		queue="long",
		timeout=7200,
		limit=cint(limit),
		dry_run=cint(dry_run),
		patient=patient or "",
		files=files,
		fill_missing=cint(fill_missing),
	)
	return {"queued": True, "job_key": JOB_KEY, "status": progress}


@frappe.whitelist()
def get_daily_patient_visit_reconcile_status() -> dict[str, Any]:
	"""Progress of the last / ongoing reconciliation."""
	_require_admin()
	return _load_progress() or {
		"job_key": JOB_KEY,
		"state": "idle",
		"processed": 0,
		"total": 0,
	}


def _apply_item(item: dict, *, dry_run: int = 0) -> str:
	row = item.get("row") or {}
	kind = item.get("kind")
	if cint(dry_run):
		# Worker counts "created" / "updated"; map planned actions to those keys.
		return {"create": "created", "update": "updated"}.get(item.get("action"), "skip")
	if kind == "setup":
		result = upsert_daily_patient_visit_setup_from_row(row)
	elif kind == "visit":
		result = upsert_daily_auto_visit_from_row(row)
	else:
		return "skip"
	status = result.get("status") or "skip"
	if status in ("created", "updated"):
		return status
	return "skip"


def _run(
	token: str,
	resume: int,
	limit: int,
	dry_run: int,
	patient: str,
	files: Any,
	fill_missing: int,
) -> dict[str, Any]:
	progress = _load_progress() or _new_progress(limit)
	progress.update(
		{
			"state": "running",
			"dry_run": cint(dry_run),
			"patient": patient or "",
			"files": files or [],
			"fill_missing": cint(fill_missing),
			"message": _("Comparing Daily Patient Visit Setup / Auto Visits…"),
		}
	)
	_set_progress(progress)

	if not cint(resume):
		scan = _scan(patient=patient or "")
		items = _work_items(scan, limit=cint(limit), fill_missing=cint(fill_missing))
		# Cache without nested row blobs blowing memory — keep rows.
		_set_work({"items": items, "index": 0})
		progress["total"] = len(items)
		progress["index"] = 0
		progress["processed"] = 0
		progress["created"] = 0
		progress["updated"] = 0
		progress["skipped"] = 0
		progress["errors"] = 0
		progress["message"] = _("Reconciling {0} row(s)…").format(len(items))
		_set_progress(progress)

	work = _load_work()
	items = list(work.get("items") or [])
	index = cint(work.get("index") or 0)
	started = time.time()

	while index < len(items):
		if time.time() - started > TIME_BUDGET:
			work["index"] = index
			_set_work(work)
			progress = _load_progress() or progress
			progress["index"] = index
			progress["processed"] = index
			progress["message"] = _("Paused after time budget; continuing…")
			_set_progress(progress)
			_refresh_lock(token)
			frappe.enqueue(
				"healthcare.api.daily_patient_visit_reconcile.run_daily_patient_visit_reconcile",
				queue="long",
				timeout=7200,
				resume=1,
				token=token,
				limit=cint(limit),
				dry_run=cint(dry_run),
				patient=patient or "",
				files=files,
				fill_missing=cint(fill_missing),
			)
			return {"state": "continued", "processed": index, "total": len(items)}

		chunk = items[index : index + IMPORT_CHUNK]
		created = updated = skipped = 0
		errors: list[str] = []
		for item in chunk:
			try:
				status = _apply_item(item, dry_run=cint(dry_run))
				if status == "created":
					created += 1
				elif status == "updated":
					updated += 1
				else:
					skipped += 1
			except Exception:
				skipped += 1
				errors.append(frappe.get_traceback())
		frappe.db.commit()

		index += len(chunk)
		progress = _load_progress() or progress
		progress["index"] = index
		progress["processed"] = index
		progress["total"] = len(items)
		progress["created"] = cint(progress.get("created")) + created
		progress["updated"] = cint(progress.get("updated")) + updated
		progress["skipped"] = cint(progress.get("skipped")) + skipped
		if errors:
			_record_errors(progress, errors)
		progress["message"] = _(
			"Processed {0} of {1} (created {2}, updated {3}, skipped {4})"
		).format(
			index,
			len(items),
			progress["created"],
			progress["updated"],
			progress["skipped"],
		)
		_set_progress(progress)
		_refresh_lock(token)

	progress = _load_progress() or progress
	progress["state"] = "finished"
	progress["processed"] = len(items)
	progress["total"] = len(items)
	progress["message"] = _(
		"Finished: {0} created, {1} updated, {2} skipped, {3} error(s)."
	).format(
		cint(progress.get("created")),
		cint(progress.get("updated")),
		cint(progress.get("skipped")),
		cint(progress.get("errors")),
	)
	_set_progress(progress)
	_release_lock(token)
	return progress


def run_daily_patient_visit_reconcile(
	limit: int = 0,
	resume: int = 0,
	token: str | None = None,
	dry_run: int = 0,
	patient: str = "",
	files: Any = None,
	fill_missing: int = 1,
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
				"message": _("A Daily Patient Visit reconciliation is already running."),
			}

	outcome: dict[str, Any] = {}
	try:
		with excel_source(files, tables=list(ORACLE_TABLES)):
			outcome = _run(
				token,
				cint(resume),
				cint(limit),
				cint(dry_run),
				patient or "",
				files,
				cint(fill_missing),
			)
	except Exception:
		progress = _load_progress() or _new_progress()
		progress["state"] = "failed"
		progress["message"] = frappe.get_traceback()
		_record_errors(progress, [frappe.get_traceback()])
		_set_progress(progress)
		frappe.log_error(title="Daily Patient Visit reconciliation failed")
		_release_lock(token)
		raise
	return outcome
