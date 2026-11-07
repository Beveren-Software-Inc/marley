"""Oracle → ERPNext reconcile for pharmacy dispensed medicine (Legacy Sales).

Source tables (live Oracle or Excel upload via ``oracle_excel_source``):

* ``INV_00_01`` — document headers
* ``INV_00_02`` — medicine lines

Scope (from Serene pharmacy reference, Nov 2026):

* ``TRANS_TYPE_NUM = 'SAL'`` only (hospital pharmacy medicines sales)
* ``TRANS_SOURCE IN ('IP', 'OP')`` — never EMP staff purchases, never Rose SI*
* Amount charged is ``NET_BILL_AMOUNT`` (already on the header; do not treat
  ``TOTAL_BILL_AMOUNT`` as the sale value)
* Quantity is ``ITEM_SMALL_QTY`` (already on the line)
* Pink prescription columns are preserved

Expected Oracle header counts (reference snapshot): OP 43,709 · IP 73,321.

Creates missing ``Legacy Sales Transactions`` headers and appends missing item
lines. Existing rows are not rewritten.
"""

from __future__ import annotations

import time
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, now_datetime

from healthcare.api.legacy_sales_detail_import import EXCEL_HEADER_MAP as DETAIL_HEADER_MAP
from healthcare.api.legacy_sales_detail_import import import_items_for_trans
from healthcare.api.legacy_sales_master_import import EXCEL_HEADER_MAP as MASTER_HEADER_MAP
from healthcare.api.legacy_sales_master_import import upsert_legacy_sales_master
from healthcare.api.oracle_excel_source import excel_source, normalize_files
from healthcare.api.oracle_sync import _fetch_rows, _in_clause, _query
from healthcare.api.patient_info_import import _cell_text, _clean_oracle_num, _require_admin

JOB_KEY = "legacy_sales_reconcile"
PROGRESS_KEY = "healthcare:legacy_sales_reconcile:progress"
WORK_KEY = "healthcare:legacy_sales_reconcile:work"
LOCK_KEY = "healthcare:legacy_sales_reconcile:lock"
PREVIEW_KEY = "healthcare:legacy_sales_reconcile:preview"
PREVIEW_LOCK_KEY = "healthcare:legacy_sales_reconcile:preview_lock"
PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6
PREVIEW_TTL = 60 * 60 * 2

DOCTYPE = "Legacy Sales Transactions"
ORACLE_HEADER = "INV_00_01"
ORACLE_DETAIL = "INV_00_02"
ORACLE_TABLES = (ORACLE_HEADER, ORACLE_DETAIL)

# Hospital patient dispensing only — never EMP / Rose retail.
CLINICAL_SOURCES = ("IP", "OP")
TRANS_TYPE = "SAL"

ERP_PAGE = 50000
IMPORT_CHUNK = 100
DETAIL_CHUNK = 50
TIME_BUDGET = 15 * 60
SAMPLE_LIMIT = 15
ERROR_LIMIT = 8

# Reference snapshot (7 Nov 2026) — shown in preview for operators.
REFERENCE_COUNTS = {"IP": 73321, "OP": 43709, "EMP": 1201, "SAL_TOTAL": 117029}


def _set_progress(progress: dict) -> None:
	progress["updated_at"] = str(now_datetime())
	frappe.cache().set_value(PROGRESS_KEY, progress, expires_in_sec=PROGRESS_TTL)


def _load_progress() -> dict:
	return frappe.cache().get_value(PROGRESS_KEY) or {}


def _set_work(work: dict) -> None:
	frappe.cache().set_value(WORK_KEY, work, expires_in_sec=PROGRESS_TTL)


def _load_work() -> dict:
	return frappe.cache().get_value(WORK_KEY) or {}


def _acquire_lock() -> str | None:
	import uuid

	token = str(uuid.uuid4())
	cache = frappe.cache()
	if cache.get_value(LOCK_KEY):
		return None
	cache.set_value(LOCK_KEY, token, expires_in_sec=LOCK_TTL)
	if cache.get_value(LOCK_KEY) != token:
		return None
	return token


def _owns_lock(token: str | None) -> bool:
	return bool(token) and frappe.cache().get_value(LOCK_KEY) == token


def _release_lock() -> None:
	frappe.cache().delete_value(LOCK_KEY)


def _lock_held() -> bool:
	return bool(frappe.cache().get_value(LOCK_KEY))


def _set_preview(progress: dict) -> None:
	progress["updated_at"] = str(now_datetime())
	frappe.cache().set_value(PREVIEW_KEY, progress, expires_in_sec=PREVIEW_TTL)


def _load_preview() -> dict:
	return frappe.cache().get_value(PREVIEW_KEY) or {}


def _preview_lock_held() -> bool:
	return bool(frappe.cache().get_value(PREVIEW_LOCK_KEY))


def _acquire_preview_lock() -> str | None:
	import uuid

	token = str(uuid.uuid4())
	cache = frappe.cache()
	if cache.get_value(PREVIEW_LOCK_KEY):
		return None
	cache.set_value(PREVIEW_LOCK_KEY, token, expires_in_sec=PREVIEW_TTL)
	if cache.get_value(PREVIEW_LOCK_KEY) != token:
		return None
	return token


def _release_preview_lock() -> None:
	frappe.cache().delete_value(PREVIEW_LOCK_KEY)


def _preview_payload(data: dict) -> dict:
	"""Light compare result for the dialog (no full Oracle payload)."""
	return {
		"oracle_table": data["oracle_table"],
		"oracle_rows": data["oracle_rows"],
		"oracle_by_source": data["oracle_by_source"],
		"reference_counts": data["reference_counts"],
		"erpnext_rows": data["erpnext_rows"],
		"erp_by_source": data["erp_by_source"],
		"matched": data["matched"],
		"missing_total": data["missing_total"],
		"headers_missing_lines": data["headers_missing_lines"],
		"work_total": data["work_total"],
		"samples": data["samples"],
		"note": _(
			"Uses NET_BILL_AMOUNT as the charged amount and ITEM_SMALL_QTY as quantity. "
			"EMP staff purchases and Rose retail invoices are excluded. "
			"Reference snapshot: IP {0} · OP {1}."
		).format(REFERENCE_COUNTS["IP"], REFERENCE_COUNTS["OP"]),
	}


def _record_sample(progress: dict, text: str) -> None:
	samples = list(progress.get("samples") or [])
	if len(samples) >= SAMPLE_LIMIT:
		return
	samples.append(text)
	progress["samples"] = samples


def _record_error(progress: dict, text: str) -> None:
	errors = list(progress.get("errors") or [])
	if len(errors) >= ERROR_LIMIT:
		return
	errors.append(text[:500])
	progress["errors"] = errors


def _norm_trans(value: Any) -> str:
	"""TRANS_NUM / Legacy Sales name — keep SAL/yyyy/nnnnn form."""
	text = _cell_text(value).strip()
	if not text:
		return ""
	# Avoid float-looking keys from CSV ("12345.0").
	if text.replace(".", "", 1).isdigit() and "." in text:
		text = text.split(".", 1)[0]
	return text


def _norm_source(value: Any) -> str:
	return _cell_text(value).strip().upper()


def _row_to_master(raw: dict) -> dict:
	"""Map Oracle INV_00_01 (UPPER keys) → legacy_sales_master_import row."""
	out: dict[str, Any] = {}
	for oracle_key, field in MASTER_HEADER_MAP.items():
		if oracle_key in raw:
			out[field] = raw.get(oracle_key)
		elif field.upper() in raw:
			out[field] = raw.get(field.upper())
	# Also accept already-normalised keys.
	for field in MASTER_HEADER_MAP.values():
		if field not in out and field in raw:
			out[field] = raw.get(field)
	trans_no = _norm_trans(out.get("trans_num") or raw.get("TRANS_NUM") or raw.get("trans_num"))
	out["trans_no"] = trans_no
	out["trans_num"] = trans_no
	out["visit_num"] = _clean_oracle_num(out.get("visit_num") or raw.get("VISIT_NUM")) or None
	out["admission_num"] = _clean_oracle_num(out.get("admission_num") or raw.get("ADMISSION_NUM")) or None
	out["branch_num"] = _clean_oracle_num(out.get("branch_num") or raw.get("BRANCH_NUM")) or None
	out["cr_id"] = _clean_oracle_num(out.get("cr_id") or raw.get("CR_ID")) or None
	return out


def _row_to_detail(raw: dict) -> dict:
	"""Map Oracle INV_00_02 → legacy_sales_detail_import row."""
	out: dict[str, Any] = {}
	for oracle_key, field in DETAIL_HEADER_MAP.items():
		if oracle_key in raw:
			out[field] = raw.get(oracle_key)
		elif field.upper() in raw:
			out[field] = raw.get(field.upper())
	for field in DETAIL_HEADER_MAP.values():
		if field not in out and field in raw:
			out[field] = raw.get(field)
	trans_no = _norm_trans(out.get("trans_num") or raw.get("TRANS_NUM") or raw.get("trans_num"))
	out["trans_no"] = trans_no
	out["trans_num"] = trans_no
	out["sr_num"] = cint(out.get("sr_num") if out.get("sr_num") not in (None, "") else raw.get("SR_NUM"))
	out["item_num"] = _clean_oracle_num(out.get("item_num") or raw.get("ITEM_NUM")) or None
	out["cr_id"] = _clean_oracle_num(out.get("cr_id") or raw.get("CR_ID")) or None
	return out


def _oracle_clinical_headers() -> list[dict]:
	"""SAL IP/OP headers from INV_00_01."""
	rows = _fetch_rows(
		ORACLE_HEADER,
		where=(
			f"TRANS_TYPE_NUM = '{TRANS_TYPE}' "
			f"AND TRANS_SOURCE IN ('IP', 'OP')"
		),
		order_by="TRANS_NUM",
	)
	return rows or []


def _erp_clinical_keys() -> set[str]:
	"""Legacy Sales names for SAL IP/OP already in ERPNext."""
	keys: set[str] = set()
	last = ""
	while True:
		rows = frappe.get_all(
			DOCTYPE,
			filters={
				"trans_type_num": TRANS_TYPE,
				"trans_source": ["in", list(CLINICAL_SOURCES)],
				"name": [">", last] if last else ["!=", ""],
			},
			fields=["name"],
			order_by="name asc",
			limit_page_length=ERP_PAGE,
		)
		if not rows:
			break
		for row in rows:
			name = _norm_trans(row.name)
			if name:
				keys.add(name)
			last = row.name
		if len(rows) < ERP_PAGE:
			break
	return keys


def _erp_source_counts() -> dict[str, int]:
	counts: dict[str, int] = {}
	for source in CLINICAL_SOURCES:
		counts[source] = cint(
			frappe.db.count(
				DOCTYPE,
				{"trans_type_num": TRANS_TYPE, "trans_source": source},
			)
		)
	counts["EMP"] = cint(
		frappe.db.count(DOCTYPE, {"trans_type_num": TRANS_TYPE, "trans_source": "EMP"})
	)
	return counts


def _headers_missing_lines(trans_nos: list[str]) -> list[str]:
	"""Existing headers that have zero item rows (detail never imported)."""
	if not trans_nos:
		return []
	missing: list[str] = []
	chunk = 500
	for i in range(0, len(trans_nos), chunk):
		part = trans_nos[i : i + chunk]
		placeholders = ", ".join(["%s"] * len(part))
		rows = frappe.db.sql(
			f"""
			SELECT p.name
			FROM `tab{DOCTYPE}` p
			LEFT JOIN `tabLegacy Sales Transaction Item` c ON c.parent = p.name
			WHERE p.name IN ({placeholders})
			GROUP BY p.name
			HAVING COUNT(c.name) = 0
			""",
			tuple(part),
		)
		missing.extend(_norm_trans(r[0]) for r in rows if r and r[0])
	return missing


def _load_detail_lines(trans_nos: list[str]) -> dict[str, list[dict]]:
	"""INV_00_02 lines keyed by TRANS_NUM for the given headers."""
	grouped: dict[str, list[dict]] = {t: [] for t in trans_nos}
	if not trans_nos:
		return grouped
	chunk = 200
	for i in range(0, len(trans_nos), chunk):
		part = trans_nos[i : i + chunk]
		clause = _in_clause(part)
		rows = _query(
			f"""
			SELECT * FROM {_oracle_schema()}.{ORACLE_DETAIL}
			WHERE TRANS_TYPE_NUM = '{TRANS_TYPE}'
			AND TRANS_NUM IN ({clause})
			"""
		)
		for raw in rows or []:
			line = _row_to_detail(raw)
			key = line.get("trans_no") or ""
			if key in grouped:
				grouped[key].append(line)
	return grouped


def _oracle_schema() -> str:
	from healthcare.api.oracle_excel_source import oracle_schema

	return oracle_schema()


def _compare(patient: str = "") -> dict[str, Any]:
	headers = _oracle_clinical_headers()
	oracle_by_key: dict[str, dict] = {}
	oracle_by_source: dict[str, int] = {"IP": 0, "OP": 0}
	for raw in headers:
		key = _norm_trans(raw.get("TRANS_NUM") or raw.get("trans_num"))
		source = _norm_source(raw.get("TRANS_SOURCE") or raw.get("trans_source"))
		if not key or source not in CLINICAL_SOURCES:
			continue
		if patient:
			# Optional filter: header must resolve to this patient via visit/admission.
			master = _row_to_master(raw)
			from healthcare.api.visit_diagnosis_sync import (
				_resolve_inpatient_admission,
				_resolve_patient_visit,
			)

			ok = False
			if master.get("visit_num"):
				visit = _resolve_patient_visit(master["visit_num"])
				if visit and frappe.db.get_value("Patient Visit", visit, "patient") == patient:
					ok = True
			if not ok and master.get("admission_num"):
				adm = _resolve_inpatient_admission(master["admission_num"])
				if adm and frappe.db.get_value("Inpatient Admission", adm, "patient") == patient:
					ok = True
			if not ok:
				continue
		oracle_by_key[key] = raw
		oracle_by_source[source] = oracle_by_source.get(source, 0) + 1

	erp_keys = _erp_clinical_keys()
	missing_headers = sorted(k for k in oracle_by_key if k not in erp_keys)
	matched = sorted(k for k in oracle_by_key if k in erp_keys)
	# Existing headers with no lines still need detail import.
	empty_line_headers = _headers_missing_lines(matched)
	work_headers = sorted(set(missing_headers) | set(empty_line_headers))

	erp_counts = _erp_source_counts()
	samples = []
	for key in missing_headers[:SAMPLE_LIMIT]:
		raw = oracle_by_key[key]
		samples.append(
			{
				"trans_no": key,
				"admission": _clean_oracle_num(raw.get("ADMISSION_NUM") or raw.get("admission_num")) or None,
				"visit": _clean_oracle_num(raw.get("VISIT_NUM") or raw.get("visit_num")) or None,
				"date": _cell_text(raw.get("TRANS_DATE") or raw.get("trans_date")) or None,
				"text": _norm_source(raw.get("TRANS_SOURCE") or raw.get("trans_source")),
			}
		)

	return {
		"oracle_table": f"{ORACLE_HEADER} + {ORACLE_DETAIL} (SAL IP/OP)",
		"oracle_rows": len(oracle_by_key),
		"oracle_by_source": oracle_by_source,
		"reference_counts": REFERENCE_COUNTS,
		"erpnext_rows": len(erp_keys),
		"erp_by_source": erp_counts,
		"matched": len(matched),
		"missing_total": len(missing_headers),
		"headers_missing_lines": len(empty_line_headers),
		"work_total": len(work_headers),
		"samples": samples,
		"missing_headers": missing_headers,
		"empty_line_headers": empty_line_headers,
		"oracle_by_key": oracle_by_key,
		"work_headers": work_headers,
	}


@frappe.whitelist()
def preview_legacy_sales_reconcile(patient: str = "", files=None, limit: int = 0):
	"""Queue a background compare of INV_00_01 SAL IP/OP vs Legacy Sales.

	The live request only enqueues — reading ~100k+ headers (and large Excel
	uploads) times out in the browser if done synchronously.
	"""
	_require_admin()
	files = normalize_files(files)
	if _preview_lock_held():
		preview = _load_preview()
		return {
			"queued": False,
			"running": True,
			"async": True,
			"message": preview.get("message")
			or _("Legacy Sales comparison is already running in the background."),
			"status": preview,
		}

	token = _acquire_preview_lock()
	if not token:
		preview = _load_preview()
		return {
			"queued": False,
			"running": True,
			"async": True,
			"message": _("Legacy Sales comparison is already running in the background."),
			"status": preview,
		}

	progress = {
		"job_key": f"{JOB_KEY}_preview",
		"state": "queued",
		"patient": patient or "",
		"processed": 0,
		"total": 0,
		"message": (
			_("Queued. Comparing uploaded INV_00_01 / INV_00_02 with Legacy Sales…")
			if files
			else _("Queued. Comparing Oracle INV_00_01 / INV_00_02 with Legacy Sales…")
		),
		"result": None,
	}
	_set_preview(progress)
	frappe.enqueue(
		"healthcare.api.legacy_sales_reconcile.run_legacy_sales_preview",
		queue="long",
		timeout=7200,
		patient=patient or "",
		files=files,
		token=token,
	)
	return {
		"queued": True,
		"async": True,
		"job_key": f"{JOB_KEY}_preview",
		"message": progress["message"],
		"status": progress,
	}


@frappe.whitelist()
def get_legacy_sales_reconcile_preview_status():
	"""Poll background preview/compare for Legacy Sales."""
	_require_admin()
	preview = _load_preview() or {
		"job_key": f"{JOB_KEY}_preview",
		"state": "idle",
		"processed": 0,
		"total": 0,
	}
	# When finished, flatten result onto the status so the dialog can use it.
	if preview.get("state") == "finished" and isinstance(preview.get("result"), dict):
		out = dict(preview["result"])
		out["state"] = "finished"
		out["message"] = preview.get("message") or _("Comparison ready.")
		out["async"] = True
		return out
	return preview


def run_legacy_sales_preview(patient: str = "", files=None, token: str | None = None):
	"""Background worker: compare Oracle/Excel SAL IP/OP to Legacy Sales."""
	files = normalize_files(files)
	progress = _load_preview() or {
		"job_key": f"{JOB_KEY}_preview",
		"state": "running",
		"patient": patient or "",
	}
	try:
		progress.update(
			{
				"state": "scanning",
				"message": _("Reading pharmacy sales headers and comparing with ERPNext…"),
			}
		)
		_set_preview(progress)
		with excel_source(files, tables=ORACLE_TABLES):
			data = _compare(patient=patient or "")
		result = _preview_payload(data)
		progress.update(
			{
				"state": "finished",
				"processed": 1,
				"total": 1,
				"result": result,
				"oracle_rows": result["oracle_rows"],
				"missing_total": result["missing_total"],
				"matched": result["matched"],
				"work_total": result["work_total"],
				"finished_at": str(now_datetime()),
				"message": _(
					"Comparison ready. Oracle SAL IP/OP: {0}. Missing headers: {1}. Headers missing lines: {2}."
				).format(
					result["oracle_rows"],
					result["missing_total"],
					result["headers_missing_lines"],
				),
			}
		)
		_set_preview(progress)
		return {"state": "finished", "result": result}
	except Exception:
		progress.update(
			{
				"state": "failed",
				"message": frappe.get_traceback(),
				"finished_at": str(now_datetime()),
			}
		)
		_set_preview(progress)
		frappe.log_error(title="Legacy Sales / pharmacy dispensed preview failed")
		raise
	finally:
		_release_preview_lock()


@frappe.whitelist()
def start_legacy_sales_reconcile(patient: str = "", dry_run: int = 0, files=None, limit: int = 0):
	_require_admin()
	files = normalize_files(files)
	if _lock_held():
		return {
			"queued": False,
			"running": True,
			"message": _("Legacy Sales / pharmacy dispensed reconciliation is already running."),
			"status": _load_progress(),
		}
	progress = {
		"job_key": JOB_KEY,
		"state": "queued",
		"dry_run": cint(dry_run),
		"patient": patient or "",
		"processed": 0,
		"total": 0,
		"created": 0,
		"lines_added": 0,
		"skipped": 0,
		"message": (
			_("Queued. The uploaded INV_00_01 / INV_00_02 Excel is read in the background.")
			if files
			else _("Queued. Oracle INV_00_01 / INV_00_02 will be read in the background.")
		),
	}
	_set_progress(progress)
	frappe.enqueue(
		"healthcare.api.legacy_sales_reconcile.run_legacy_sales_reconcile",
		queue="long",
		timeout=7200,
		dry_run=cint(dry_run),
		patient=patient or "",
		files=files,
	)
	return {"queued": True, "job_key": JOB_KEY, "status": progress}


@frappe.whitelist()
def get_legacy_sales_reconcile_status():
	_require_admin()
	return _load_progress() or {"job_key": JOB_KEY, "state": "idle", "processed": 0, "total": 0}


def run_legacy_sales_reconcile(
	resume: int = 0,
	token: str | None = None,
	dry_run: int = 0,
	patient: str = "",
	files=None,
	limit: int = 0,
):
	files = normalize_files(files)
	if cint(resume):
		if not _owns_lock(token):
			return {"state": "skipped", "message": _("This reconciliation run was replaced.")}
	else:
		token = _acquire_lock()
		if not token:
			return {"state": "running", "message": _("Already running.")}

	outcome: dict[str, Any] = {}
	try:
		with excel_source(files, tables=ORACLE_TABLES):
			outcome = _run(token, cint(resume), cint(dry_run), patient or "")
	except Exception:
		progress = _load_progress() or {"job_key": JOB_KEY}
		progress["state"] = "failed"
		progress["message"] = frappe.get_traceback()
		_record_error(progress, frappe.get_traceback())
		_set_progress(progress)
		frappe.log_error(title="Legacy Sales / pharmacy dispensed reconcile failed")
		raise
	finally:
		if not outcome.get("handed_over"):
			_release_lock()
	return outcome


def _run(token: str, resume: int, dry_run: int, patient: str) -> dict:
	started = time.monotonic()

	def overtime(processed: int) -> bool:
		return (time.monotonic() - started) > TIME_BUDGET and processed > 0

	if cint(resume):
		progress = _load_progress() or {}
		work = _load_work() or {}
	else:
		progress = {
			"job_key": JOB_KEY,
			"state": "scanning",
			"dry_run": dry_run,
			"patient": patient,
			"processed": 0,
			"total": 0,
			"created": 0,
			"lines_added": 0,
			"skipped": 0,
			"message": _("Comparing pharmacy sales with Legacy Sales Transactions…"),
			"samples": [],
			"errors": [],
		}
		_set_progress(progress)
		data = _compare(patient=patient)
		progress = {
			"job_key": JOB_KEY,
			"state": "running",
			"dry_run": dry_run,
			"patient": patient,
			"processed": 0,
			"total": len(data["work_headers"]),
			"created": 0,
			"lines_added": 0,
			"skipped": 0,
			"oracle_rows": data["oracle_rows"],
			"missing_total": data["missing_total"],
			"headers_missing_lines": data["headers_missing_lines"],
			"message": _("Importing missing pharmacy dispensed documents…"),
			"samples": [],
			"errors": [],
		}
		# Persist only the keys we still need — not the full Oracle payload.
		missing_set = set(data["missing_headers"])
		work = {
			"work_headers": data["work_headers"],
			"missing_headers": data["missing_headers"],
			"offset": 0,
			# Store slim header fields for creates only.
			"headers": {
				k: {
					"TRANS_NUM": k,
					"TRANS_TYPE_NUM": data["oracle_by_key"][k].get("TRANS_TYPE_NUM")
					or data["oracle_by_key"][k].get("trans_type_num"),
					"TRANS_SOURCE": data["oracle_by_key"][k].get("TRANS_SOURCE")
					or data["oracle_by_key"][k].get("trans_source"),
					"TRANS_DATE": data["oracle_by_key"][k].get("TRANS_DATE")
					or data["oracle_by_key"][k].get("trans_date"),
					"BRANCH_NUM": data["oracle_by_key"][k].get("BRANCH_NUM")
					or data["oracle_by_key"][k].get("branch_num"),
					"VISIT_NUM": data["oracle_by_key"][k].get("VISIT_NUM")
					or data["oracle_by_key"][k].get("visit_num"),
					"ADMISSION_NUM": data["oracle_by_key"][k].get("ADMISSION_NUM")
					or data["oracle_by_key"][k].get("admission_num"),
					"NET_BILL_AMOUNT": data["oracle_by_key"][k].get("NET_BILL_AMOUNT")
					or data["oracle_by_key"][k].get("net_bill_amount"),
					"TOTAL_BILL_AMOUNT": data["oracle_by_key"][k].get("TOTAL_BILL_AMOUNT")
					or data["oracle_by_key"][k].get("total_bill_amount"),
					"TOTAL_PROFIT_AMT": data["oracle_by_key"][k].get("TOTAL_PROFIT_AMT")
					or data["oracle_by_key"][k].get("total_profit_amt"),
					"PINK_PRESC_NUM": data["oracle_by_key"][k].get("PINK_PRESC_NUM")
					or data["oracle_by_key"][k].get("pink_presc_num"),
					"IS_PINK_PRESC_CHARGE": data["oracle_by_key"][k].get("IS_PINK_PRESC_CHARGE")
					or data["oracle_by_key"][k].get("is_pink_presc_charge"),
					"PINK_PRESC_AMT": data["oracle_by_key"][k].get("PINK_PRESC_AMT")
					or data["oracle_by_key"][k].get("pink_presc_amt"),
					"CR_ID": data["oracle_by_key"][k].get("CR_ID")
					or data["oracle_by_key"][k].get("cr_id"),
					"CR_DATE": data["oracle_by_key"][k].get("CR_DATE")
					or data["oracle_by_key"][k].get("cr_date"),
					"VCH_STATUS": data["oracle_by_key"][k].get("VCH_STATUS")
					or data["oracle_by_key"][k].get("vch_status"),
					"RETURN_TRANS_NUM": data["oracle_by_key"][k].get("RETURN_TRANS_NUM")
					or data["oracle_by_key"][k].get("return_trans_num"),
					"TOTAL_SERVICES_CHARGES": data["oracle_by_key"][k].get("TOTAL_SERVICES_CHARGES")
					or data["oracle_by_key"][k].get("total_services_charges"),
					"ONLY_SERVICES_CHARGES": data["oracle_by_key"][k].get("ONLY_SERVICES_CHARGES")
					or data["oracle_by_key"][k].get("only_services_charges"),
					"SERVICES_CHARGES_PERCENTAGE": data["oracle_by_key"][k].get(
						"SERVICES_CHARGES_PERCENTAGE"
					)
					or data["oracle_by_key"][k].get("services_charges_percentage"),
					"CHARGE_YN": data["oracle_by_key"][k].get("CHARGE_YN")
					or data["oracle_by_key"][k].get("charge_yn"),
					"TRANS_REMARKS": data["oracle_by_key"][k].get("TRANS_REMARKS")
					or data["oracle_by_key"][k].get("trans_remarks"),
					"TRANS_YEAR": data["oracle_by_key"][k].get("TRANS_YEAR")
					or data["oracle_by_key"][k].get("trans_year"),
					"TRANS_MONTH": data["oracle_by_key"][k].get("TRANS_MONTH")
					or data["oracle_by_key"][k].get("trans_month"),
					"TRANS_PERIOD": data["oracle_by_key"][k].get("TRANS_PERIOD")
					or data["oracle_by_key"][k].get("trans_period"),
					"DISCOUNT_PERCENTAGE": data["oracle_by_key"][k].get("DISCOUNT_PERCENTAGE")
					or data["oracle_by_key"][k].get("discount_percentage"),
					"TOTAL_DISCOUNT_AMOUNT": data["oracle_by_key"][k].get("TOTAL_DISCOUNT_AMOUNT")
					or data["oracle_by_key"][k].get("total_discount_amount"),
					"TOTAL_TAX_AMOUNT": data["oracle_by_key"][k].get("TOTAL_TAX_AMOUNT")
					or data["oracle_by_key"][k].get("total_tax_amount"),
				}
				for k in missing_set
				if k in data["oracle_by_key"]
			},
		}
		_set_work(work)
		_set_progress(progress)

	work_headers: list[str] = list(work.get("work_headers") or [])
	missing_set = set(work.get("missing_headers") or [])
	offset = cint(work.get("offset") or 0)
	header_cache: dict[str, dict] = work.get("headers") or {}

	while offset < len(work_headers):
		if overtime(offset):
			work["offset"] = offset
			_set_work(work)
			_set_progress(progress)
			frappe.enqueue(
				"healthcare.api.legacy_sales_reconcile.run_legacy_sales_reconcile",
				queue="long",
				timeout=7200,
				resume=1,
				token=token,
				dry_run=dry_run,
				patient=patient,
				files=None,
			)
			return {"state": "queued", "handed_over": True, "progress": progress}

		chunk_keys = work_headers[offset : offset + IMPORT_CHUNK]
		# Reload full header rows for creates (slim cache may miss columns).
		need_full = [k for k in chunk_keys if k in missing_set]
		full_headers: dict[str, dict] = {}
		if need_full and not dry_run:
			clause = _in_clause(need_full)
			for raw in _query(
				f"""
				SELECT * FROM {_oracle_schema()}.{ORACLE_HEADER}
				WHERE TRANS_TYPE_NUM = '{TRANS_TYPE}'
				AND TRANS_NUM IN ({clause})
				"""
			) or []:
				key = _norm_trans(raw.get("TRANS_NUM") or raw.get("trans_num"))
				if key:
					full_headers[key] = raw

		detail_grouped = {} if dry_run else _load_detail_lines(chunk_keys)

		for key in chunk_keys:
			try:
				frappe.db.savepoint("legacy_sales_one")
				if dry_run:
					progress["created"] = cint(progress.get("created")) + (1 if key in missing_set else 0)
					_record_sample(progress, f"{key} · dry run")
					continue

				if key in missing_set:
					raw = full_headers.get(key) or header_cache.get(key) or {}
					if not raw:
						progress["skipped"] = cint(progress.get("skipped")) + 1
						continue
					result = upsert_legacy_sales_master(_row_to_master(raw))
					if result.get("status") == "created":
						progress["created"] = cint(progress.get("created")) + 1
						_record_sample(progress, f"{key} · created")
					elif result.get("status") == "updated":
						progress["skipped"] = cint(progress.get("skipped")) + 1
					else:
						progress["skipped"] = cint(progress.get("skipped")) + 1

				lines = detail_grouped.get(key) or []
				if lines:
					line_result = import_items_for_trans(key, lines)
					added = cint(line_result.get("added") or 0)
					progress["lines_added"] = cint(progress.get("lines_added")) + added
					if added and key not in missing_set:
						_record_sample(progress, f"{key} · +{added} lines")
			except Exception:
				frappe.db.rollback(save_point="legacy_sales_one")
				_record_error(progress, f"{key}: {frappe.get_traceback()}")

		offset += len(chunk_keys)
		work["offset"] = offset
		progress["processed"] = offset
		progress["message"] = _("{0} of {1}").format(offset, progress.get("total"))
		_set_work(work)
		_set_progress(progress)
		frappe.db.commit()

	progress["processed"] = cint(progress.get("total"))
	progress["state"] = "finished"
	progress["finished_at"] = str(now_datetime())
	progress["message"] = _(
		"Done. Headers created: {0}. Item lines added: {1}. Skipped: {2}."
	).format(
		cint(progress.get("created")),
		cint(progress.get("lines_added")),
		cint(progress.get("skipped")),
	)
	_set_progress(progress)
	return {"state": "finished", "progress": progress}
