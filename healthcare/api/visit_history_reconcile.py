"""One-button Oracle -> ERPNext reconciliation for VISIT_00_01_HISTORY.

Oracle stores earlier versions of an OP visit diagnosis in
``CLINIC2.VISIT_00_01_HISTORY``. ERPNext stores the same rows in the
``VISIT_00_01_HISTORY`` doctype, named by ``record_key``
(visit number + CR_DATE, with ``-2``, ``-3``… when several versions share
that stamp). The Excel import only runs when somebody exports the table by
hand, so the staging table drifts from Oracle.

What one run does
-----------------
1. Reads ``VISIT_00_01_HISTORY`` (live or Excel), ordered by visit and CR_DATE.
2. Builds the same ``record_key`` the workbook import uses.
3. Creates only the keys ERPNext does not already have, through
   ``upsert_visit_00_01_history``. Existing rows are left alone.

Usage::

    bench --site <site> execute healthcare.api.visit_history_reconcile.preview_visit_history_reconcile
    bench --site <site> execute healthcare.api.visit_history_reconcile.start_visit_history_reconcile
"""

from __future__ import annotations

import time
from typing import Any, Iterable

import frappe
from frappe import _
from frappe.utils import cint, now_datetime, nowdate

from healthcare.api.oracle_excel_source import excel_source, normalize_files, oracle_schema
from healthcare.api.oracle_sync import _fetch_rows
from healthcare.api.patient_info_import import _cell_text, _clean_oracle_num, _require_admin
from healthcare.api.visit_00_01_history_import import (
	_build_record_key,
	_normalize_visit_num,
	_record_key_base,
	upsert_visit_00_01_history,
)

JOB_KEY = "visit_history_reconcile"
PROGRESS_KEY = "healthcare:visit_history_reconcile:progress"
WORK_KEY = "healthcare:visit_history_reconcile:work"
LOCK_KEY = "healthcare:visit_history_reconcile:lock"
PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6

ORACLE_TABLE = "VISIT_00_01_HISTORY"
DOCTYPE = "VISIT_00_01_HISTORY"

ERP_PAGE = 50000
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
		"oracle_rows": 0,
		"erpnext_rows": 0,
		"matched": 0,
		"missing_total": 0,
		"created": 0,
		"skipped_existing": 0,
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


def _keyed_oracle_rows(rows: list[dict]) -> list[tuple[str, dict]]:
	"""``(record_key, raw)`` using the same suffix rules as the Excel import."""
	seen: dict[str, int] = {}
	keyed: list[tuple[str, dict]] = []
	for raw in rows or []:
		visit_num = _normalize_visit_num(raw.get("VISIT_NUM"))
		if not visit_num:
			continue
		base = _record_key_base(visit_num, raw.get("CR_DATE"))
		index = seen.get(base, 0)
		seen[base] = index + 1
		key = _build_record_key(visit_num, raw.get("CR_DATE"), duplicate_index=index)
		keyed.append((key, raw))
	return keyed


def _import_row(record_key: str, raw: dict) -> dict:
	return {
		"record_key": record_key,
		"visit_num": _normalize_visit_num(raw.get("VISIT_NUM")),
		"visit_date": raw.get("VISIT_DATE"),
		"visit_patient_num": _clean_oracle_num(raw.get("VISIT_PATIENT_NUM")),
		"visit_diagnosis_detail": raw.get("VISIT_DIAGNOSIS_DETAIL"),
		"cr_id": raw.get("CR_ID"),
		"cr_date": raw.get("CR_DATE"),
		"up_id": raw.get("UP_ID"),
		"up_date": raw.get("UP_DATE"),
	}


def _erpnext_keys() -> set[str]:
	keys: set[str] = set()
	after = ""
	while True:
		rows = frappe.db.sql(
			"""
			select name from `tabVISIT_00_01_HISTORY`
			where name > %s
			order by name asc
			limit %s
			""",
			(after, ERP_PAGE),
		)
		if not rows:
			break
		for (name,) in rows:
			after = name
			if name:
				keys.add(name)
		if len(rows) < ERP_PAGE:
			break
	return keys


def _work_items(scan: dict, *, patient: str = "", limit: int = 0) -> list[list[str]]:
	patient = _clean_oracle_num(patient)
	items = list(scan.get("missing") or [])
	if patient:
		items = [item for item in items if item[1] == patient]
	if cint(limit):
		items = items[: cint(limit)]
	return items


def _process_chunk(items: list[list], progress: dict, *, dry_run: int = 0) -> None:
	for item in items:
		record_key = item[0]
		row = item[2] if len(item) > 2 else None
		if frappe.db.exists(DOCTYPE, record_key):
			progress["skipped_existing"] = cint(progress.get("skipped_existing")) + 1
			continue
		if cint(dry_run):
			progress["created"] = cint(progress.get("created")) + 1
			_record_samples(progress, [f"{record_key} · dry run"])
			continue
		if not row:
			_record_errors(progress, [f"{record_key}: Oracle row was not kept on the work list"])
			continue
		try:
			result = upsert_visit_00_01_history(row)
		except Exception:
			_record_errors(progress, [f"{record_key}: {frappe.get_traceback()}"])
			continue
		status = (result or {}).get("status")
		if status == "created":
			progress["created"] = cint(progress.get("created")) + 1
			_record_samples(progress, [record_key])
		elif status == "updated":
			progress["skipped_existing"] = cint(progress.get("skipped_existing")) + 1
		else:
			_record_errors(progress, [f"{record_key}: {status or 'unexpected'}"])


def _summary_message(progress: dict) -> str:
	lines = [
		_("Reconcile Visit History finished."),
		"",
		_("Oracle {0}").format(ORACLE_TABLE),
		_("Oracle history rows: {0}").format(cint(progress.get("oracle_rows"))),
		_("VISIT_00_01_HISTORY in ERPNext: {0}").format(cint(progress.get("erpnext_rows"))),
		_("Already matched: {0}").format(cint(progress.get("matched"))),
		_("Missing: {0}").format(cint(progress.get("missing_total"))),
		"",
		_("Created: {0}").format(cint(progress.get("created"))),
	]
	if cint(progress.get("dry_run")):
		lines.insert(1, _("DRY RUN — nothing was changed."))
	if progress.get("skipped_existing"):
		lines.append(
			_("Skipped — already in ERPNext: {0}").format(cint(progress.get("skipped_existing")))
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


def _queue_next(token: str, progress: dict, files: Any = None) -> None:
	frappe.enqueue(
		"healthcare.api.visit_history_reconcile.run_visit_history_reconcile",
		queue="long",
		timeout=7200,
		resume=1,
		token=token,
		dry_run=cint(progress.get("dry_run")),
		files=files,
	)


def _attach_payloads(items: list[list[str]], keyed: list[tuple[str, dict]]) -> list[list]:
	by_key = {key: raw for key, raw in keyed}
	out: list[list] = []
	for record_key, patient in items:
		raw = by_key.get(record_key) or {}
		out.append([record_key, patient, _import_row(record_key, raw)])
	return out


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
				"message": _("Comparing visit history with Oracle…"),
			}
		)
		_set_progress(progress)

		rows = _fetch_rows(ORACLE_TABLE, order_by="VISIT_NUM, CR_DATE")
		keyed = _keyed_oracle_rows(rows)
		existing = _erpnext_keys()
		missing = [
			[key, _clean_oracle_num(raw.get("VISIT_PATIENT_NUM"))]
			for key, raw in keyed
			if key not in existing
		]
		scan = {
			"oracle_rows": len(keyed),
			"erpnext_rows": len(existing),
			"matched": len(keyed) - len(missing),
			"missing": missing,
		}
		items = _attach_payloads(_work_items(scan, patient=patient, limit=limit), keyed)
		_set_work({"items": items, "built_at": str(now_datetime())})
		progress.update(
			{
				"oracle_rows": scan["oracle_rows"],
				"erpnext_rows": scan["erpnext_rows"],
				"matched": scan["matched"],
				"missing_total": len(missing),
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
				"message": _("ERPNext already has every VISIT_00_01_HISTORY row Oracle recorded."),
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


@frappe.whitelist()
def preview_visit_history_reconcile(
	patient: str = "", limit: int = 0, files=None
) -> dict[str, Any]:
	_require_admin()
	files = normalize_files(files)
	with excel_source(files, tables=[ORACLE_TABLE]) as source:
		rows = _fetch_rows(ORACLE_TABLE, order_by="VISIT_NUM, CR_DATE")
		keyed = _keyed_oracle_rows(rows)
		existing = _erpnext_keys()
		missing = [
			[key, _clean_oracle_num(raw.get("VISIT_PATIENT_NUM"))]
			for key, raw in keyed
			if key not in existing
		]
		scan = {"missing": missing}
		items = _work_items(scan, patient=patient, limit=limit)
		result: dict[str, Any] = {
			"ok": True,
			"as_of": str(nowdate()),
			"oracle_table": f"{oracle_schema()}.{ORACLE_TABLE}",
			"oracle_rows": len(keyed),
			"erpnext_rows": len(existing),
			"matched": len(keyed) - len(missing),
			"missing_total": len(items),
			"samples": [
				{
					"key": item[0],
					"patient": item[1],
					"text": _cell_text(next((raw.get("VISIT_DIAGNOSIS_DETAIL") for key, raw in keyed if key == item[0]), ""))[:80],
				}
				for item in items[:10]
			],
		}
		if source is not None:
			result["oracle_table"] = source.describe(ORACLE_TABLE)
	result["in_sync"] = not cint(result["missing_total"])
	return result


@frappe.whitelist()
def start_visit_history_reconcile(
	patient: str = "", limit: int = 0, dry_run: int = 0, files=None
) -> dict[str, Any]:
	_require_admin()
	files = normalize_files(files)
	if _lock_held():
		return {
			"queued": False,
			"running": True,
			"message": _("A visit history reconciliation is already running."),
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
		"healthcare.api.visit_history_reconcile.run_visit_history_reconcile",
		queue="long",
		timeout=7200,
		limit=cint(limit),
		dry_run=cint(dry_run),
		patient=patient or "",
		files=files,
	)
	return {"queued": True, "job_key": JOB_KEY, "status": progress}


@frappe.whitelist()
def get_visit_history_reconcile_status() -> dict[str, Any]:
	_require_admin()
	return _load_progress() or {"job_key": JOB_KEY, "state": "idle", "processed": 0, "total": 0}


def run_visit_history_reconcile(
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
				"message": _("A visit history reconciliation is already running."),
			}

	outcome: dict[str, Any] = {}
	try:
		with excel_source(files, tables=[ORACLE_TABLE]):
			outcome = _run(token, cint(resume), cint(limit), cint(dry_run), patient or "", files)
	except Exception:
		progress = _load_progress() or _new_progress()
		progress["state"] = "failed"
		progress["message"] = frappe.get_traceback()
		_record_errors(progress, [frappe.get_traceback()])
		_set_progress(progress)
		frappe.log_error(title="Visit history reconciliation failed")
		raise
	finally:
		if not outcome.get("handed_over"):
			_release_lock(token)
	return outcome
