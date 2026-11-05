"""One-button Oracle -> ERPNext reconciliation for insurance claims.

Oracle stores claim headers in ``CLINIC2.INSURANCE_00_01`` (``TRANS_NUM`` per
claim) and service lines in ``INSURANCE_00_02``. ERPNext stores the same claims
in ``Insurance Claim`` (``autoname`` = ``field:trans_no``). The Excel import
(``healthcare.healthcare.api.insurance_claim.import_insurance_claims``) only
runs on demand, so the claim register drifts from Oracle.

What one run does
-----------------
1. Reads ``INSURANCE_00_01`` (live from Oracle, or from Excel) and compares
   ``TRANS_NUM`` with ``Insurance Claim.trans_no``.
2. Missing claims are created and submitted; each patient is marked insured
   (TRICARE) and gets an ``Insurance Patient Register`` when missing.
3. Service lines from ``INSURANCE_00_02`` are attached when that table is
   available (second upload or live Oracle).
4. Existing ``TRANS_NUM`` values are never updated or resubmitted.

Usage::

    bench --site <site> execute healthcare.api.insurance_claim_reconcile.preview_insurance_claim_reconcile
    bench --site <site> execute healthcare.api.insurance_claim_reconcile.start_insurance_claim_reconcile
    bench --site <site> execute healthcare.api.insurance_claim_reconcile.get_insurance_claim_reconcile_status
    bench --site <site> execute healthcare.api.insurance_claim_reconcile.run_insurance_claim_reconcile --kwargs "{'limit': 5}"
"""

from __future__ import annotations

import time
from typing import Any, Iterable

import frappe
from frappe import _
from frappe.utils import cint, now_datetime, nowdate

from healthcare.api.oracle_excel_source import current_source, excel_source, normalize_files, oracle_schema
from healthcare.api.oracle_sync import _fetch_rows, _in_clause, _query
from healthcare.api.patient_info_import import _clean_oracle_num, _require_admin
from healthcare.healthcare.api.insurance_claim import (
	_apply_master_to_claim,
	_ensure_patient_register,
	_ensure_tricare,
	_legacy_text,
	_mark_patient_insured,
	_resolve_patient_for_import,
)

JOB_KEY = "insurance_claim_reconcile"
PROGRESS_KEY = "healthcare:insurance_claim_reconcile:progress"
WORK_KEY = "healthcare:insurance_claim_reconcile:work"
LOCK_KEY = "healthcare:insurance_claim_reconcile:lock"
PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6

ORACLE_MASTER = "INSURANCE_00_01"
ORACLE_CHILD = "INSURANCE_00_02"
DOCTYPE = "Insurance Claim"

ERP_PAGE = 50000
IMPORT_CHUNK = 100
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
		"patient": "",
		"files": [],
		"index": 0,
		"processed": 0,
		"total": 0,
		"oracle_claims": 0,
		"erpnext_claims": 0,
		"matched_claims": 0,
		"missing_claims": 0,
		"extra_claims": 0,
		"created": 0,
		"registers_created": 0,
		"patients_insured": 0,
		"skipped_existing": 0,
		"skipped_no_trans": 0,
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


def _trans_key(value: Any) -> str:
	return _legacy_text(value).strip()


# ---------------------------------------------------------------------------
# Comparison
# ---------------------------------------------------------------------------


def _oracle_claim_index() -> dict[str, str]:
	rows = _query(
		f"select TRANS_NUM, PATIENT_NUM from {oracle_schema()}.{ORACLE_MASTER} "
		"where TRANS_NUM is not null"
	)
	index: dict[str, str] = {}
	for row in rows or []:
		trans = _trans_key(row.get("TRANS_NUM"))
		if not trans:
			continue
		index[trans] = _clean_oracle_num(row.get("PATIENT_NUM"))
	return index


def _oracle_totals() -> dict:
	rows = _query(
		f"select count(*) as TOTAL from {oracle_schema()}.{ORACLE_MASTER} "
		"where TRANS_NUM is not null"
	)
	row = (rows or [{}])[0]
	return {"oracle_claims": cint(row.get("TOTAL"))}


def _erpnext_claim_page(after: str = "", limit: int = ERP_PAGE) -> list[tuple]:
	return frappe.db.sql(
		"""
		select name, ifnull(trans_no, '')
		from `tabInsurance Claim`
		where name > %s
		order by name asc
		limit %s
		""",
		(after, limit),
	)


def _scan() -> dict:
	totals = _oracle_totals()
	oracle = _oracle_claim_index()
	missing = set(oracle)
	matched = 0
	extra = 0
	erp_total = 0
	after = ""
	while True:
		rows = _erpnext_claim_page(after)
		if not rows:
			break
		for name, trans_no in rows:
			after = name
			erp_total += 1
			key = _trans_key(trans_no or name)
			if not key:
				extra += 1
				continue
			if key in oracle:
				if key in missing:
					missing.discard(key)
					matched += 1
			else:
				extra += 1
		if len(rows) < ERP_PAGE:
			break

	missing_items = [[trans, oracle[trans]] for trans in sorted(missing, key=lambda x: cint(x) or x)]

	return {
		"oracle_claims": totals["oracle_claims"],
		"erpnext_claims": erp_total,
		"matched_claims": matched,
		"missing_claims": missing_items,
		"extra_claims": extra,
	}


def _child_lines_by_trans(trans_nums: list[str]) -> dict[str, list[dict[str, str]]]:
	if not trans_nums:
		return {}
	source = current_source()
	if source is not None and not source.has_table(ORACLE_CHILD):
		return {}
	try:
		where = f"TRANS_NUM in ({_in_clause(trans_nums)})"
		rows = _fetch_rows(ORACLE_CHILD, where=where, order_by="TRANS_NUM, SR_NUM")
	except Exception:
		return {}
	grouped: dict[str, list[dict[str, str]]] = {}
	for row in rows or []:
		key = _trans_key(row.get("TRANS_NUM"))
		if key:
			grouped.setdefault(key, []).append(row)
	return grouped


def _oracle_master_rows(trans_nums: list[str]) -> list[dict[str, str]]:
	if not trans_nums:
		return []
	where = f"TRANS_NUM in ({_in_clause(trans_nums)})"
	return _fetch_rows(ORACLE_MASTER, where=where, order_by="TRANS_NUM")


def _claim_exists(trans_no: str) -> bool:
	if not trans_no:
		return False
	if frappe.db.exists(DOCTYPE, trans_no):
		return True
	return bool(frappe.db.get_value(DOCTYPE, {"trans_no": trans_no}, "name"))


def _create_claim_from_oracle_row_tracked(
	row: dict[str, str], child_map: dict[str, list[dict]], progress: dict
) -> str:
	trans_no = _trans_key(row.get("TRANS_NUM"))
	if not trans_no:
		return "skip_no_trans"
	if _claim_exists(trans_no):
		return "skip_existing"

	_ensure_tricare()
	patient_num = _clean_oracle_num(row.get("PATIENT_NUM"))
	patient = _resolve_patient_for_import(patient_num) if patient_num else None
	if patient_num and not patient:
		return "skip_no_patient"

	if patient:
		_mark_patient_insured(patient)
		progress["patients_insured"] = cint(progress.get("patients_insured")) + 1
		_register_name, reg_created = _ensure_patient_register(patient)
		if reg_created:
			progress["registers_created"] = cint(progress.get("registers_created")) + 1

	doc = frappe.new_doc(DOCTYPE)
	_apply_master_to_claim(doc, row, patient, child_map)
	doc.flags.ignore_mandatory = True
	doc.insert(ignore_permissions=True)
	doc.submit()
	return "created"


# ---------------------------------------------------------------------------
# Work list and repair
# ---------------------------------------------------------------------------


def _work_items(scan: dict, *, patient: str = "", limit: int = 0) -> list[list[str]]:
	items = [[trans, patient_num] for trans, patient_num in scan.get("missing_claims") or []]
	if patient:
		items = [item for item in items if _clean_oracle_num(item[1]) == _clean_oracle_num(patient)]
	items.sort(key=lambda item: cint(item[0]) or item[0])
	if cint(limit):
		return items[: cint(limit)]
	return items


def _process_chunk(items: list[list[str]], progress: dict, *, dry_run: int = 0) -> None:
	trans_nums = [item[0] for item in items]
	master_rows = _oracle_master_rows(trans_nums)
	child_map = _child_lines_by_trans(trans_nums)
	by_trans = {_trans_key(row.get("TRANS_NUM")): row for row in master_rows}

	for trans_no, _patient_num in items:
		row = by_trans.get(trans_no)
		if not row:
			_record_errors(progress, [f"{trans_no}: not found in Oracle master"])
			continue
		if _claim_exists(trans_no):
			progress["skipped_existing"] = cint(progress.get("skipped_existing")) + 1
			continue

		if cint(dry_run):
			progress["created"] = cint(progress.get("created")) + 1
			_record_samples(progress, [f"{trans_no} · dry run"])
			continue

		frappe.db.savepoint("ins_claim_reconcile_row")
		try:
			status = _create_claim_from_oracle_row_tracked(row, child_map, progress)
		except Exception:
			frappe.db.rollback(save_point="ins_claim_reconcile_row")
			_record_errors(progress, [f"{trans_no}: {frappe.get_traceback()}"])
			continue

		if status == "created":
			progress["created"] = cint(progress.get("created")) + 1
			_record_samples(progress, [trans_no])
		elif status == "skip_existing":
			progress["skipped_existing"] = cint(progress.get("skipped_existing")) + 1
		elif status == "skip_no_patient":
			progress["skipped_no_patient"] = cint(progress.get("skipped_no_patient")) + 1
		elif status == "skip_no_trans":
			progress["skipped_no_trans"] = cint(progress.get("skipped_no_trans")) + 1
		else:
			_record_errors(progress, [f"{trans_no}: {status}"])


def _summary_message(progress: dict) -> str:
	dry = cint(progress.get("dry_run"))
	lines = [
		_("Reconcile Insurance Claims finished."),
		"",
		_("Oracle {0}").format(ORACLE_MASTER),
		_("Claims in Oracle: {0}").format(cint(progress.get("oracle_claims"))),
		_("Insurance Claims in ERPNext: {0}").format(cint(progress.get("erpnext_claims"))),
		_("Already matched by trans number: {0}").format(cint(progress.get("matched_claims"))),
		_("Missing claims: {0}").format(cint(progress.get("missing_claims"))),
		"",
		_("Claims created: {0}").format(cint(progress.get("created"))),
		_("Insurance registers created: {0}").format(cint(progress.get("registers_created"))),
	]
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
		"healthcare.api.insurance_claim_reconcile.run_insurance_claim_reconcile",
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
				"message": _("Comparing insurance claims with Oracle…"),
			}
		)
		_set_progress(progress)

		scan = _scan()
		items = _work_items(scan, patient=patient, limit=limit)
		_set_work({"items": items, "built_at": str(now_datetime())})
		progress.update(
			{
				"oracle_claims": scan["oracle_claims"],
				"erpnext_claims": scan["erpnext_claims"],
				"matched_claims": scan["matched_claims"],
				"missing_claims": len(scan["missing_claims"]),
				"extra_claims": scan["extra_claims"],
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
				"message": _("ERPNext already has every insurance claim Oracle recorded."),
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
def preview_insurance_claim_reconcile(patient: str = "", limit: int = 0, files=None) -> dict[str, Any]:
	"""Read-only: does the insurance claim register match Oracle?"""
	_require_admin()
	files = normalize_files(files)
	with excel_source(files, tables=[ORACLE_MASTER]) as source:
		scan = _scan()
		items = _work_items(scan, patient=patient, limit=limit)
		result: dict[str, Any] = {
			"ok": True,
			"as_of": str(nowdate()),
			"mode": "patient" if patient else "site",
			"oracle_table": f"{oracle_schema()}.{ORACLE_MASTER}",
			"child_table": ORACLE_CHILD,
			"oracle_claims": scan["oracle_claims"],
			"erpnext_claims": scan["erpnext_claims"],
			"matched_claims": scan["matched_claims"],
			"extra_claims": scan["extra_claims"],
			"missing_claims": len(items),
			"samples": [{"trans_no": item[0], "patient": item[1]} for item in items[:10]],
		}
		if source is not None:
			result["oracle_table"] = source.describe(ORACLE_MASTER)
	result["in_sync"] = not cint(result["missing_claims"])
	return result


@frappe.whitelist()
def start_insurance_claim_reconcile(
	patient: str = "", limit: int = 0, dry_run: int = 0, files=None
) -> dict[str, Any]:
	"""Queue one insurance claim reconciliation."""
	_require_admin()
	files = normalize_files(files)
	if _lock_held():
		return {
			"queued": False,
			"running": True,
			"message": _("An insurance claim reconciliation is already running."),
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
		"healthcare.api.insurance_claim_reconcile.run_insurance_claim_reconcile",
		queue="long",
		timeout=7200,
		limit=cint(limit),
		dry_run=cint(dry_run),
		patient=patient or "",
		files=files,
	)
	return {"queued": True, "job_key": JOB_KEY, "status": progress}


@frappe.whitelist()
def get_insurance_claim_reconcile_status() -> dict[str, Any]:
	"""Progress of the last / ongoing insurance claim reconciliation."""
	_require_admin()
	return _load_progress() or {
		"job_key": JOB_KEY,
		"state": "idle",
		"processed": 0,
		"total": 0,
	}


def run_insurance_claim_reconcile(
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
				"message": _("An insurance claim reconciliation is already running."),
			}

	outcome: dict[str, Any] = {}
	try:
		with excel_source(files, tables=[ORACLE_MASTER]):
			outcome = _run(token, cint(resume), cint(limit), cint(dry_run), patient or "", files)
	except Exception:
		progress = _load_progress() or _new_progress()
		progress["state"] = "failed"
		progress["message"] = frappe.get_traceback()
		_record_errors(progress, [frappe.get_traceback()])
		_set_progress(progress)
		frappe.log_error(title="Insurance claim reconciliation failed")
		raise
	finally:
		if not outcome.get("handed_over"):
			_release_lock(token)
	return outcome
