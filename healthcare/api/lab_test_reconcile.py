"""One-button Oracle -> ERPNext reconciliation for the Lab Test register.

Oracle keeps every legacy lab order as one ``CLINIC2.LAB_00_03`` header row plus
one ``CLINIC2.LAB_00_04`` result row per analyte, and the header's ``TRANS_NUM``
(``LAB/2019/00042``) is what ``Lab Test`` uses as its document name
(``autoname`` is ``field:trans_num``). The workbook import
(``healthcare.api.lab_test_legacy_import``) only runs when somebody exports the
two tables by hand, so the register stops at the export date and drifts from
Oracle in three ways that this button repairs in one run:

* **missing** - a lab order Oracle recorded that ERPNext never imported. On
  serene 449 recent orders (``LAB/2026/...``) are missing because the last
  export was taken before them.
* **incomplete** - the lab test is there but Oracle holds values it lacks (test
  name, result table, short result, remarks, cost centre, company).
* **duplicates** - the same lab order stored twice: the legacy numbered record
  plus a copy created through the app or the visit import under its own name
  (``LT-1234``, ``V03/<visit>/<sr>``), so the patient's lab history and the lab
  worklist show it twice.

What one run does
-----------------
1. Reads ``LAB_00_03`` and ``LAB_00_04`` (live from Oracle, or from their Excel
   exports) and compares the header numbers with ``tabLab Test``.
2. A header whose ``TRANS_NUM`` is still free is created through the *existing*
   legacy importer (``import_legacy_lab_test``): patient / visit / admission
   links, test template, result rows, amounts, status and submit behave exactly
   like the workbook import, so a reconciled register is indistinguishable from
   an imported one.
3. A lab test Oracle knows more about gets its blanks filled (``fill_missing``).
   A value that is already there is never overwritten - the differences are
   counted and shown by the preview, never written.
4. Duplicate copies are removed (``clean_duplicates``) and the legacy numbered
   record is kept. Only copies that are *not* backed by their own Oracle row are
   candidates, their result content must not contradict the kept record, and a
   copy that is invoiced, linked to a Service Request / Prescription, carries a
   doctor review or an attachment is never touched. A submitted copy is
   cancelled before it is deleted, which is what the desk asks for anyway.

Execution model
---------------
The comparison is one pass over both sides (keyset pages of ``tabLab Test``, one
Oracle header query, Oracle result rows only for the labs that need them). The
repair then runs in a self-chaining background job on the ``long`` queue: it
works through the work list in chunks, commits after each chunk, keeps its
progress in the cache (polled by the Healthcare Settings dialog) and re-enqueues
itself until the list is exhausted.

Usage::

    bench --site <site> execute healthcare.api.lab_test_reconcile.preview_lab_test_reconcile
    bench --site <site> execute healthcare.api.lab_test_reconcile.start_lab_test_reconcile
    bench --site <site> execute healthcare.api.lab_test_reconcile.get_lab_test_reconcile_status
    # inline (no queue), handy for a first smoke test on a real site:
    bench --site <site> execute healthcare.api.lab_test_reconcile.run_lab_test_reconcile --kwargs "{'dry_run': 1}"
"""

from __future__ import annotations

import hashlib
import re
import time
from html import unescape
from typing import Any, Iterable, Iterator

import frappe
from frappe import _
from frappe.utils import cint, getdate, now_datetime

from healthcare.api.lab_test_legacy_import import (
	DETAIL_EXCEL_MAP,
	HEADER_EXCEL_MAP,
	_build_custom_result,
	_clean_oracle_num,
	_default_company,
	_format_legacy_date_str,
	_legacy_results_field_value,
	_pick_primary_template,
	_primary_lab_group,
	_resolve_cost_center,
	_resolve_patient_context,
	_result_text,
	import_legacy_lab_test,
)
from healthcare.api.oracle_excel_source import excel_source, normalize_files
from healthcare.api.oracle_sync import _fetch_rows, _in_clause
from healthcare.api.patient_info_import import _cell_text, _require_admin

JOB_KEY = "lab_test_reconcile"
PROGRESS_KEY = "healthcare:lab_test_reconcile:progress"
WORK_KEY = "healthcare:lab_test_reconcile:work"
LOCK_KEY = "healthcare:lab_test_reconcile:lock"
PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6

ORACLE_HEADER_TABLE = "LAB_00_03"
ORACLE_DETAIL_TABLE = "LAB_00_04"
ORACLE_TABLES = (ORACLE_HEADER_TABLE, ORACLE_DETAIL_TABLE)
DOCTYPE = "Lab Test"

ERP_PAGE = 50000  # keyset page over `tabLab Test` (primary key scan)
IMPORT_CHUNK = 200  # work items handled per iteration
DETAIL_CHUNK = 200  # TRANS_NUM keys per Oracle LAB_00_04 query
TIME_BUDGET = 15 * 60
SAMPLE_LIMIT = 15
ERROR_LIMIT = 5

# Fields the two sides are compared on. Values that only exist in Oracle are
# filled in; values that differ although both sides have one are only reported.
COMPARED_FIELDS = (
	"patient",
	"lab_test_name",
	"custom_result",
	"results",
	"lab_test_comment",
	"lab_test_type",
	"transaction_date",
	"cost_center",
)
# Everything that may be filled from Oracle when ERPNext left it empty.
FILL_FIELDS = COMPARED_FIELDS + ("branch_num", "company")

# A copy carries a human workflow if it is on a bill or on the request chain.
_PROTECTED_FIELDS = (
	"invoiced",
	"service_request",
	"prescription",
	"reviewed_by",
	"doctor_reviewed_datetime",
)

_TAG = re.compile(r"<[^>]+>")
_SPACES = re.compile(r"\s+")


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
	"""Redis key scoped to the site (``frappe.cache().set`` does not add the db prefix)."""
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
	current = frappe.cache().get(_lock_key())
	if isinstance(current, bytes):
		current = current.decode()
	return current == token


def _refresh_lock(token: str) -> None:
	if not _owns_lock(token):
		return
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
		"fill_missing": 1,
		"clean_duplicates": 1,
		"patient": "",
		"files": [],
		"index": 0,
		"processed": 0,
		"total": 0,
		# Oracle side
		"oracle_rows": 0,
		"oracle_patients": 0,
		"without_results": 0,
		# ERPNext side
		"erpnext_rows": 0,
		"matched": 0,
		"missing_total": 0,
		"fill_total": 0,
		"differs_total": 0,
		"duplicate_total": 0,
		"skipped_duplicates": 0,
		"extra_rows": 0,
		# Repair
		"created": 0,
		"patients_created": 0,
		"filled": 0,
		"removed": 0,
		"skipped_existing": 0,
		"skipped_unchanged": 0,
		# Problems
		"failed": 0,
		"errors": [],
		"samples": [],
		"started_at": stamp,
		"updated_at": stamp,
	}


def _record_samples(progress: dict, samples: Iterable[str]) -> None:
	room = SAMPLE_LIMIT - len(progress.get("samples") or [])
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
# Value helpers
# ---------------------------------------------------------------------------


def _norm_text(value: Any) -> str:
	"""Text without HTML noise, case or spacing differences."""
	text = unescape(_cell_text(value).replace("\r\n", "\n"))
	text = _TAG.sub(" ", text)
	return _SPACES.sub(" ", text).strip().lower()


def _is_blank(value: Any) -> bool:
	if value is None:
		return True
	if isinstance(value, str):
		return not value.strip()
	return False


def _date_key(value: Any) -> str:
	if _is_blank(value):
		return ""
	try:
		return str(getdate(value))
	except Exception:
		return str(value or "").strip()


def _md5(value: Any) -> str:
	return hashlib.md5(_cell_text(value).encode("utf-8")).hexdigest()


def _same_value(field: str, row: dict, want: Any) -> bool:
	"""Does the stored record already hold what Oracle says?"""
	if field == "custom_result":
		return (row.get("custom_md5") or "") == _md5(want)
	if field in ("lab_test_name", "results", "lab_test_comment", "cost_center"):
		return _norm_text(row.get(field)) == _norm_text(want)
	if field == "transaction_date":
		return _date_key(row.get(field)) == _date_key(want)
	return str(row.get(field) or "").strip() == str(want or "").strip()


def _blank_on_erp(row: dict, field: str) -> bool:
	"""``custom_result`` is read as a flag, not as text (it is a result table)."""
	if field == "custom_result":
		return not cint(row.get("has_custom_result"))
	return _is_blank(row.get(field))


def _chunks(values: Iterable[Any], size: int) -> Iterator[list[Any]]:
	batch: list[Any] = []
	for value in values:
		batch.append(value)
		if len(batch) >= size:
			yield batch
			batch = []
	if batch:
		yield batch


# ---------------------------------------------------------------------------
# Oracle LAB_00_03 (headers) and LAB_00_04 (result rows)
# ---------------------------------------------------------------------------


def _header_payload(raw: dict) -> dict:
	"""One Oracle header in the shape ``lab_test_legacy_import`` expects.

	``HEADER_EXCEL_MAP`` already maps the Oracle column names to the importer's
	keys (``TRANS_NUM`` -> ``trans_num``), so a live read and an Excel export
	produce exactly the same dictionaries.
	"""
	header: dict[str, Any] = {
		key: raw.get(column) for column, key in HEADER_EXCEL_MAP.items()
	}
	for key in (
		"trans_num",
		"visit_num",
		"admission_num",
		"sub_dr_gl_code",
		"dr_gl_code",
		"doc_num",
		"old_num",
		"fill_id",
		"sample_collect_id",
		"cr_id",
		"up_id",
		"ap_id",
	):
		header[key] = _clean_oracle_num(header.get(key))
	return header


def _detail_payload(raw: dict) -> dict:
	"""One Oracle ``LAB_00_04`` line in the shape the importer expects."""
	line: dict[str, Any] = {
		key: raw.get(column) for column, key in DETAIL_EXCEL_MAP.items()
	}
	for key in ("trans_num", "sr_num", "lab_group_num", "lab_sub_num", "cr_id", "up_id"):
		line[key] = _clean_oracle_num(line.get(key))
	return line



def _oracle_headers(keys: list[str] | None = None) -> dict[str, dict]:
	"""``TRANS_NUM`` -> header payload, for every Oracle row or just ``keys``."""
	if keys is None:
		rows = _fetch_rows(ORACLE_HEADER_TABLE, order_by="TRANS_NUM") or []
	else:
		rows = []
		for chunk in _chunks(sorted({key for key in keys if key}), DETAIL_CHUNK):
			rows.extend(
				_fetch_rows(
					ORACLE_HEADER_TABLE,
					where=f"TRANS_NUM in ({_in_clause(chunk)})",
					order_by="TRANS_NUM",
				)
			)

	headers: dict[str, dict] = {}
	for raw in rows:
		payload = _header_payload(raw)
		if payload.get("trans_num"):
			headers.setdefault(payload["trans_num"], payload)
	return headers


def _oracle_details(keys: Iterable[str]) -> dict[str, list[dict]]:
	"""``TRANS_NUM`` -> its ``LAB_00_04`` result lines."""
	details: dict[str, list[dict]] = {}
	for chunk in _chunks(sorted({key for key in keys if key}), DETAIL_CHUNK):
		rows = _fetch_rows(
			ORACLE_DETAIL_TABLE,
			where=f"TRANS_NUM in ({_in_clause(chunk)})",
			order_by="TRANS_NUM, SR_NUM, LAB_SUB_NUM",
		)
		for raw in rows:
			payload = _detail_payload(raw)
			trans_num = payload.get("trans_num")
			if trans_num:
				details.setdefault(trans_num, []).append(payload)
	return details


def _oracle_patient(header: dict) -> str | None:
	"""(Resolved) Patient of one Oracle header - visit, admission, then sub ledger."""
	ctx = _resolve_patient_context(header, ensure_patient=False)
	return ctx.get("patient") or None


def _lab_test_name(detail_lines: list[dict]) -> str:
	"""Test name for one lab: the panel's template, else its group, else its first test.

	Some legacy headers were stored without ``LAB_GROUP_NUM``; their test name is
	still known through the sub-template of the result line (``LAB-007-001`` is
	``S.Lithium``), which beats leaving the field empty.
	"""
	template_name = _pick_primary_template(detail_lines)
	if template_name and frappe.db.exists("Lab Test Template", template_name):
		name = frappe.db.get_value("Lab Test Template", template_name, "lab_test_name") or ""
		if name:
			return name

	group = _primary_lab_group(detail_lines)
	first_name = _result_text(detail_lines[0].get("group_name")) if detail_lines else ""
	if first_name or group:
		return first_name or group

	for line in detail_lines or []:
		sub = _result_text(line.get("lab_sub_num"))
		if not sub or not frappe.db.exists("Lab Test Template", sub):
			continue
		name = frappe.db.get_value("Lab Test Template", sub, "lab_test_name") or ""
		if name:
			return name
	return ""


def _target_fields(
	header: dict,
	detail_lines: list[dict],
	*,
	want_patient: bool = False,
	memo: dict | None = None,
) -> dict[str, Any]:
	"""What Oracle holds for one lab test, in ``Lab Test`` field names.

	Only the fields Oracle answers from the header are read unless
	``detail_lines`` is given: ``LAB_00_04`` holds 137k rows, so it is fetched for
	the labs that actually need it.
	"""
	memo = memo if memo is not None else {}
	values: dict[str, Any] = {
		"lab_test_comment": (header.get("trans_remarks") or "").strip(),
		"lab_test_type": (header.get("lab_test_type") or "").strip(),
		"branch_num": _clean_oracle_num(header.get("branch_num")),
		"transaction_date": _format_legacy_date_str(header.get("trans_date")),
	}

	if want_patient:
		values["patient"] = _oracle_patient(header) or ""

	branch = header.get("branch_num")
	if ("cost_center", branch) not in memo:
		memo[("cost_center", branch)] = _resolve_cost_center(branch)
	if memo[("cost_center", branch)]:
		values["cost_center"] = memo[("cost_center", branch)]

	if "company" not in memo:
		memo["company"] = _default_company()
	if memo["company"]:
		values["company"] = memo["company"]

	if detail_lines:
		values["lab_test_name"] = _lab_test_name(detail_lines)
		values["custom_result"] = _build_custom_result(detail_lines)
		values["results"] = _legacy_results_field_value(detail_lines)
	return values


def _has_result_text(detail_lines: list[dict]) -> bool:
	return any(_result_text(line.get("lab_result_value")) for line in detail_lines or [])



# ---------------------------------------------------------------------------
# Comparison: Oracle LAB_00_03 / LAB_00_04 vs tabLab Test
# ---------------------------------------------------------------------------

# Text columns (small ones) plus the flags a duplicate decision needs.
_ERP_FIELDS = (
	"patient",
	"lab_test_name",
	"results",
	"lab_test_comment",
	"lab_test_type",
	"branch_num",
	"transaction_date",
	"cost_center",
	"company",
	"invoiced",
	"service_request",
	"prescription",
	"reviewed_by",
	"doctor_reviewed_datetime",
	"is_legacy_import",
	"docstatus",
)


def _erpnext_rows() -> list[dict]:
	"""The whole ``tabLab Test`` register, keyset pages off the primary key.

	``custom_result`` is a result table, so only its hash and whether it is set
	are read - 14k tables would otherwise be pulled into memory.
	"""
	text_columns = ", ".join(f"ifnull(`{field}`, '') as `{field}`" for field in _ERP_FIELDS)
	select = (
		f"name, {text_columns}, ifnull(date, '') as date, "
		"ifnull(custom_result, '') <> '' as has_custom_result, "
		"md5(ifnull(custom_result, '')) as custom_md5, creation"
	)
	rows: list[dict] = []
	after = ""
	while True:
		page = frappe.db.sql(
			f"""
			select {select}
			from `tab{DOCTYPE}`
			where name > %s
			order by name asc
			limit %s
			""",
			(after, ERP_PAGE),
			as_dict=True,
		)
		if not page:
			break
		rows.extend(page)
		after = page[-1]["name"]
		if len(page) < ERP_PAGE:
			break
	return rows


def _has_attachment(name: str) -> bool:
	return bool(
		frappe.db.exists(
			"File", {"attached_to_doctype": DOCTYPE, "attached_to_name": name}
		)
	)


def _protected(row: dict) -> bool:
	"""Copies that carry a human workflow and must never be removed."""
	if cint(row.get("invoiced")):
		return True
	for field in _PROTECTED_FIELDS:
		if field == "invoiced":
			continue
		if _cell_text(row.get(field)).strip():
			return True
	return _has_attachment(row.get("name") or "")


def _richer_than(copy_row: dict, keeper: dict) -> bool:
	"""True when the copy holds a value the kept record does not - keep both."""
	for field in FILL_FIELDS:
		if field in ("custom_result", "results"):
			continue  # ``_redundant`` already compares the results
		if _is_blank(copy_row.get(field)) or not _is_blank(keeper.get(field)):
			continue
		if not _same_value(field, keeper, copy_row.get(field)):
			return True
	return False


def _redundant(copy_row: dict, keeper: dict) -> bool:
	"""The copy says nothing the kept record does not already say."""
	copy_custom = copy_row.get("custom_md5") or ""
	if copy_custom and copy_custom != (keeper.get("custom_md5") or ""):
		return False
	copy_results = _norm_text(copy_row.get("results"))
	if copy_results and copy_results != _norm_text(keeper.get("results")):
		return False
	return not _richer_than(copy_row, keeper)


def _pick_keeper(rows: list[dict], oracle_numbers: set[str]) -> dict:
	"""The record a duplicate group keeps: the Oracle-backed one, then the oldest."""

	def rank(row: dict) -> tuple:
		name = row.get("name") or ""
		return (
			0 if name in oracle_numbers else 1,
			str(row.get("creation") or ""),
			str(name),
		)

	return sorted(rows, key=rank)[0]


def _duplicate_groups(erp_rows: list[dict], oracle_numbers: set[str]) -> tuple[list[list[str]], int]:
	"""``[[copy to remove, record to keep], ...]`` plus the copies left alone.

	Two legacy rows for the same patient / test / day are two orders Oracle
	really recorded, so only a copy that has no Oracle row of its own can be a
	duplicate - never one that the register is expected to keep.
	"""
	groups: dict[tuple, list[dict]] = {}
	for row in erp_rows:
		patient = row.get("patient")
		test = _norm_text(row.get("lab_test_name"))
		date = _date_key(row.get("date"))
		if not patient or not test or not date:
			continue
		groups.setdefault((patient, test, date), []).append(row)

	duplicates: list[list[str]] = []
	skipped = 0
	for rows in groups.values():
		if len(rows) < 2:
			continue
		if not any((row.get("name") or "") in oracle_numbers for row in rows):
			continue
		keeper = _pick_keeper(rows, oracle_numbers)
		for row in rows:
			if row is keeper or (row.get("name") or "") in oracle_numbers:
				continue
			if _protected(row) or not _redundant(row, keeper):
				skipped += 1
				continue
			duplicates.append([row.get("name"), keeper.get("name")])
	return duplicates, skipped



def _need_detail(headers: dict[str, dict], erp_rows: list[dict]) -> set[str]:
	"""Labs whose result rows Oracle has to be asked for.

	A record that already shows its results only needs the header; one that was
	stored without a test name or without its result table needs ``LAB_00_04``.
	Missing labs are left to the create step, which fetches them with the rest of
	its chunk.
	"""
	by_name = {row["name"]: row for row in erp_rows}
	needed: set[str] = set()
	for trans_num in headers:
		row = by_name.get(trans_num)
		if row is None:
			continue
		if (
			_is_blank(row.get("lab_test_name"))
			or _blank_on_erp(row, "custom_result")
		):
			needed.add(trans_num)
	return needed


def _classify(headers: dict[str, dict], erp_rows: list[dict], details: dict[str, list[dict]]) -> dict:
	"""Compare the two registers lab by lab and sort every row into a bucket."""
	by_name = {row["name"]: row for row in erp_rows}
	oracle_numbers = set(headers)
	memo: dict = {}

	missing: list[list[str]] = []
	matched = 0
	without_results = 0
	fills: list[list] = []
	differs: list[list[str]] = []

	for trans_num in sorted(headers):
		header = headers[trans_num]
		row = by_name.get(trans_num)
		if row is None:
			patient = _oracle_patient(header) or ""
			missing.append([trans_num, patient, _date_key(header.get("trans_date"))])
			continue

		matched += 1
		detail_lines = details.get(trans_num) or []
		if detail_lines and not _has_result_text(detail_lines):
			without_results += 1

		target = _target_fields(
			header,
			detail_lines,
			want_patient=_is_blank(row.get("patient")),
			memo=memo,
		)
		fill = {
			field: target[field]
			for field in FILL_FIELDS
			if field in target
			and _blank_on_erp(row, field)
			and not _is_blank(target[field])
		}
		if fill:
			fills.append([row.get("name"), row.get("patient") or "", fill])

		changed = [
			field
			for field in COMPARED_FIELDS
			if field not in fill
			and field in target
			and not _blank_on_erp(row, field)
			and not _is_blank(target[field])
			and not _same_value(field, row, target[field])
		]
		if changed:
			differs.append([row.get("name"), changed])

	duplicates, skipped_duplicates = _duplicate_groups(erp_rows, oracle_numbers)
	extra_rows = sum(
		1
		for row in erp_rows
		if cint(row.get("is_legacy_import")) and (row.get("name") or "") not in oracle_numbers
	)
	oracle_patients = {
		_cell_text(header.get("sub_dr_gl_code")).strip()
		for header in headers.values()
		if _cell_text(header.get("sub_dr_gl_code")).strip()
	}

	return {
		"oracle_rows": len(headers),
		"oracle_patients": len(oracle_patients),
		"without_results": without_results,
		"erpnext_rows": len(erp_rows),
		"matched": matched,
		"missing": missing,
		"missing_total": len(missing),
		"fills": fills,
		"differs": differs,
		"duplicates": duplicates,
		"skipped_duplicates": skipped_duplicates,
		"extra_rows": extra_rows,
	}


def _scan() -> dict:
	headers = _oracle_headers()
	erp_rows = _erpnext_rows()
	needed = _need_detail(headers, erp_rows)
	details = _oracle_details(needed) if needed else {}
	return _classify(headers, erp_rows, details)


# ---------------------------------------------------------------------------
# Work list and repair
# ---------------------------------------------------------------------------


def _work_items(
	scan: dict,
	*,
	patient: str = "",
	limit: int = 0,
	fill_missing: int = 1,
	clean_duplicates: int = 1,
) -> list[list]:
	"""What one run has to do, in the order it has to be done."""
	patient = (patient or "").strip()
	items: list[list] = []

	if cint(fill_missing):
		for name, row_patient, changes in scan["fills"]:
			if patient and row_patient != patient:
				continue
			items.append(["fill", name, row_patient or "", changes])

	for trans_num, row_patient, date in scan["missing"]:
		if patient and row_patient != patient:
			continue
		items.append(["create", trans_num, row_patient or "", date])

	if cint(clean_duplicates):
		for remove, keeper in scan["duplicates"]:
			items.append(["dedupe", remove, keeper, ""])

	if cint(limit):
		items = items[: cint(limit)]
	return items



def _create_lab_test(
	trans_num: str,
	header: dict | None,
	detail_lines: list[dict],
	dry_run: int,
) -> dict:
	"""Create one missing lab test with the legacy importer (same shape as an import)."""
	if frappe.db.exists(DOCTYPE, trans_num):
		return {"action": "skipped_existing", "name": trans_num}
	if not header and not detail_lines:
		return {"action": "skipped_no_data", "name": trans_num}
	if cint(dry_run):
		return {"action": "created", "name": trans_num, "dry_run": True}

	outcome = import_legacy_lab_test(trans_num, header, detail_lines)
	status = str(outcome.get("status") or "")
	if status != "ok":
		return {"action": f"skipped_{status or 'unknown'}", "name": trans_num}
	return {
		"action": "created",
		"name": outcome.get("lab_test") or trans_num,
		"patient_created": cint(outcome.get("patient_created")),
	}


def _fill_lab_test(name: str, changes: dict, dry_run: int) -> dict:
	"""Fill the fields ERPNext left empty; a value that is there is never replaced."""
	if not frappe.db.exists(DOCTYPE, name):
		return {"action": "skipped_missing"}
	current = frappe.db.get_value(DOCTYPE, name, list(changes.keys()), as_dict=True) or {}
	update = {
		field: value
		for field, value in changes.items()
		if _is_blank(current.get(field)) and not _is_blank(value)
	}
	if not update:
		return {"action": "skipped_unchanged"}
	if not cint(dry_run):
		frappe.db.set_value(DOCTYPE, name, update, update_modified=False)
	return {"action": "filled", "fields": sorted(update.keys())}


def _recheck_row(name: str) -> dict:
	"""One lab test with the flags a duplicate decision needs, read fresh."""
	rows = frappe.db.sql(
		f"""
		select name, ifnull(patient, '') as patient,
			ifnull(lab_test_name, '') as lab_test_name,
			ifnull(date, '') as date,
			ifnull(results, '') as results,
			ifnull(lab_test_comment, '') as lab_test_comment,
			ifnull(lab_test_type, '') as lab_test_type,
			ifnull(branch_num, '') as branch_num,
			ifnull(transaction_date, '') as transaction_date,
			ifnull(cost_center, '') as cost_center,
			ifnull(company, '') as company,
			ifnull(custom_result, '') <> '' as has_custom_result,
			md5(ifnull(custom_result, '')) as custom_md5,
			ifnull(invoiced, 0) as invoiced,
			ifnull(service_request, '') as service_request,
			ifnull(prescription, '') as prescription,
			ifnull(reviewed_by, '') as reviewed_by,
			ifnull(doctor_reviewed_datetime, '') as doctor_reviewed_datetime,
			ifnull(docstatus, 0) as docstatus
		from `tab{DOCTYPE}`
		where name = %s
		""",
		(name,),
		as_dict=True,
	)
	return rows[0] if rows else {}


def _remove_duplicate(remove: str, keeper: str, dry_run: int) -> dict:
	"""Delete one duplicate copy - only after re-checking that it still is one."""
	if not frappe.db.exists(DOCTYPE, keeper) or not frappe.db.exists(DOCTYPE, remove):
		return {"action": "skipped_missing"}

	loss = _recheck_row(remove)
	keep = _recheck_row(keeper)
	if not loss or not keep:
		return {"action": "skipped_missing"}
	if (loss.get("patient") or "") != (keep.get("patient") or ""):
		return {"action": "skipped_other_patient"}
	if _norm_text(loss.get("lab_test_name")) != _norm_text(keep.get("lab_test_name")):
		return {"action": "skipped_changed"}
	if _date_key(loss.get("date")) != _date_key(keep.get("date")):
		return {"action": "skipped_changed"}
	if _protected(loss):
		return {"action": "skipped_protected"}
	if not _redundant(loss, keep):
		return {"action": "skipped_richer"}

	if not cint(dry_run):
		if cint(loss.get("docstatus")) == 1:
			# A submitted lab test cannot be deleted; cancelling it first is what
			# the desk would do by hand, and ``on_cancel`` only sets the status.
			doc = frappe.get_doc(DOCTYPE, remove)
			doc.flags.ignore_permissions = True
			doc.cancel()
		frappe.delete_doc(DOCTYPE, remove, ignore_permissions=True, force=True)
	return {"action": "removed"}



def _process_chunk(chunk: list[list], progress: dict, dry_run: int = 0) -> None:
	created = filled = removed = patched_patients = 0
	skipped_existing = skipped_unchanged = 0
	errors: list[str] = []
	samples: list[str] = []

	create_keys = [item[1] for item in chunk if item[0] == "create"]
	headers: dict[str, dict] = {}
	details: dict[str, list[dict]] = {}
	if create_keys:
		# One header and one result query per chunk instead of two per lab.
		headers = _oracle_headers(create_keys)
		details = _oracle_details(create_keys)

	for item in chunk:
		op, key = item[0], item[1]
		try:
			if op == "create":
				result = _create_lab_test(key, headers.get(key), details.get(key) or [], dry_run)
				if result["action"] == "created":
					created += 1
					patched_patients += cint(result.get("patient_created"))
					samples.append(
						_("created {0}").format(result.get("name") or key)
						if not cint(dry_run)
						else _("would create {0}").format(result.get("name") or key)
					)
				else:
					skipped_existing += 1
			elif op == "fill":
				result = _fill_lab_test(key, item[3] or {}, dry_run)
				if result["action"] == "filled":
					filled += 1
					samples.append(
						_("{0}: filled {1}").format(key, ", ".join(result.get("fields") or []))
					)
				else:
					skipped_unchanged += 1
			elif op == "dedupe":
				result = _remove_duplicate(key, item[2] or "", dry_run)
				if result["action"] == "removed":
					removed += 1
					samples.append(_("{0}: duplicate of {1}").format(key, item[2] or ""))
				else:
					skipped_unchanged += 1
		except Exception:
			errors.append(_("{0} {1}: {2}").format(op, key, frappe.get_traceback()))
			frappe.log_error(title=f"Lab test reconciliation failed: {op} {key}")

	progress["created"] = cint(progress.get("created")) + created
	progress["patients_created"] = cint(progress.get("patients_created")) + patched_patients
	progress["filled"] = cint(progress.get("filled")) + filled
	progress["removed"] = cint(progress.get("removed")) + removed
	progress["skipped_existing"] = cint(progress.get("skipped_existing")) + skipped_existing
	progress["skipped_unchanged"] = cint(progress.get("skipped_unchanged")) + skipped_unchanged
	_record_samples(progress, samples[:SAMPLE_LIMIT])
	_record_errors(progress, errors)


def _summary_message(progress: dict) -> str:
	lines = [
		_("Lab Test reconciliation finished."),
		"",
		_("Oracle lab orders: {0} ({1} patients)").format(
			cint(progress.get("oracle_rows")),
			cint(progress.get("oracle_patients")),
		),
		_("Lab Tests in ERPNext: {0} ({1} match Oracle)").format(
			cint(progress.get("erpnext_rows")), cint(progress.get("matched"))
		),
		"",
		_("Created: {0} of {1} missing lab tests").format(
			cint(progress.get("created")), cint(progress.get("missing_total"))
		),
		_("Filled from Oracle: {0} of {1} incomplete lab tests").format(
			cint(progress.get("filled")), cint(progress.get("fill_total"))
		),
		_("Duplicates removed: {0} of {1}").format(
			cint(progress.get("removed")), cint(progress.get("duplicate_total"))
		),
	]
	if cint(progress.get("patients_created")):
		lines.append(
			_("Patients created for the missing lab tests: {0}").format(
				cint(progress.get("patients_created"))
			)
		)
	if cint(progress.get("differs_total")):
		lines.append(
			_("{0} lab tests hold values that differ from Oracle and were left untouched.").format(
				cint(progress.get("differs_total"))
			)
		)
	if cint(progress.get("skipped_duplicates")):
		lines.append(
			_("{0} duplicate copies were kept (invoiced, linked, reviewed, attachment or extra data).").format(
				cint(progress.get("skipped_duplicates"))
			)
		)
	if cint(progress.get("skipped_existing")):
		lines.append(
			_("Skipped (already in ERPNext): {0}").format(cint(progress.get("skipped_existing")))
		)
	if cint(progress.get("skipped_unchanged")):
		lines.append(
			_("Skipped (nothing left to write): {0}").format(cint(progress.get("skipped_unchanged")))
		)
	if cint(progress.get("failed")):
		lines.append(_("Failed: {0}").format(cint(progress.get("failed"))))
	if cint(progress.get("dry_run")):
		lines.insert(1, _("Dry run - nothing was written."))

	samples = progress.get("samples") or []
	if samples:
		lines.extend(["", _("Samples")])
		lines.extend(f"• {sample}" for sample in samples)
	errors = progress.get("errors") or []
	if errors:
		lines.extend(["", _("Errors")])
		lines.extend(f"• {error}" for error in errors)
	return "\n".join(lines)



# ---------------------------------------------------------------------------
# Background job
# ---------------------------------------------------------------------------


def _queue_next(token: str, progress: dict, files: Any = None) -> None:
	frappe.enqueue(
		"healthcare.api.lab_test_reconcile.run_lab_test_reconcile",
		queue="long",
		timeout=7200,
		resume=1,
		token=token,
		dry_run=cint(progress.get("dry_run")),
		files=files,
	)


def _apply_scan(progress: dict, scan: dict, items: list[list]) -> None:
	progress.update(
		{
			"oracle_rows": scan["oracle_rows"],
			"oracle_patients": scan["oracle_patients"],
			"without_results": scan["without_results"],
			"erpnext_rows": scan["erpnext_rows"],
			"matched": scan["matched"],
			"missing_total": scan["missing_total"],
			"fill_total": len(scan["fills"]),
			"differs_total": len(scan["differs"]),
			"duplicate_total": len(scan["duplicates"]),
			"skipped_duplicates": scan["skipped_duplicates"],
			"extra_rows": scan["extra_rows"],
			"total": len(items),
			"state": "running",
		}
	)


def _run(
	token: str,
	resume: int,
	limit: int,
	dry_run: int = 0,
	fill_missing: int = 1,
	clean_duplicates: int = 1,
	patient: str = "",
	files: Any = None,
) -> dict[str, Any]:
	started = time.monotonic()
	progress = (_load_progress() if cint(resume) else {}) or _new_progress(limit)
	if cint(resume):
		# A handover re-enqueues the job without the original arguments, so the
		# run it continues is described by the progress record itself.
		limit = cint(progress.get("limit")) or cint(limit)
		dry_run = cint(progress.get("dry_run"))
		fill_missing = cint(progress.get("fill_missing"))
		clean_duplicates = cint(progress.get("clean_duplicates"))
		patient = progress.get("patient") or patient
		files = progress.get("files") or files

	items = (_load_work().get("items") or []) if cint(resume) else []
	if not items:
		# First pass - or a resumed run whose work list expired from the cache.
		progress.update(
			{
				"state": "scanning",
				"limit": cint(limit),
				"dry_run": cint(dry_run),
				"fill_missing": cint(fill_missing),
				"clean_duplicates": cint(clean_duplicates),
				"patient": patient or "",
				"files": files or [],
				"index": 0,
				"processed": 0,
				"message": _("Comparing the lab tests with Oracle…"),
			}
		)
		_set_progress(progress)

		scan = _scan()
		items = _work_items(
			scan,
			patient=patient,
			limit=limit,
			fill_missing=fill_missing,
			clean_duplicates=clean_duplicates,
		)
		_set_work({"items": items, "built_at": str(now_datetime())})
		_apply_scan(progress, scan, items)
		frappe.db.commit()
		_set_progress(progress)

	if not items:
		frappe.db.commit()
		progress.update(
			{
				"state": "finished",
				"finished_at": str(now_datetime()),
				"message": _(
					"ERPNext already has every lab test Oracle recorded and no duplicates were found. Nothing to do."
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
		_process_chunk(chunk, progress, dry_run=cint(progress.get("dry_run")))
		progress["index"] = offset + len(chunk)
		progress["processed"] = cint(progress.get("index"))
		frappe.db.commit()
		_set_progress(progress)
		_refresh_lock(token)

		if time.monotonic() - started > TIME_BUDGET:
			progress["state"] = "queued"
			progress["message"] = _(
				"Still running in the background ({0} of {1} steps processed)."
			).format(cint(progress.get("processed")), cint(progress.get("total")))
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


def _preview_payload(scan: dict, items: list[list]) -> dict[str, Any]:
	"""The dialog's numbers. The work counts describe the run a filter leaves."""
	creates = [item for item in items if item[0] == "create"]
	fills = [item for item in items if item[0] == "fill"]
	dedupes = [item for item in items if item[0] == "dedupe"]
	# Samples come from the rows the run will actually touch.
	create_keys = {item[1] for item in creates}
	fill_names = {item[1] for item in fills}
	remove_names = {item[1] for item in dedupes}
	samples = [
		{"trans_num": trans_num, "patient": patient, "date": date}
		for trans_num, patient, date in scan["missing"]
		if trans_num in create_keys
	][:10]
	fill_samples = [
		{"name": name, "patient": patient, "fields": sorted(changes.keys())}
		for name, patient, changes in scan["fills"]
		if name in fill_names
	][:10]
	duplicate_samples = [
		{"remove": remove, "keeper": keeper}
		for remove, keeper in scan["duplicates"]
		if remove in remove_names
	][:10]
	result: dict[str, Any] = {
		"oracle_rows": scan["oracle_rows"],
		"oracle_patients": scan["oracle_patients"],
		"without_results": scan["without_results"],
		"erpnext_rows": scan["erpnext_rows"],
		"matched": scan["matched"],
		"missing_total": len(creates),
		"register_missing_total": scan["missing_total"],
		"fill_total": len(fills),
		"differs_total": len(scan["differs"]),
		"duplicate_total": len(dedupes),
		"skipped_duplicates": scan["skipped_duplicates"],
		"extra_rows": scan["extra_rows"],
		"work_total": len(items),
		"samples": samples,
		"fill_sample": fill_samples,
		"duplicate_sample": duplicate_samples,
	}
	result["in_sync"] = not (
		result["missing_total"] or result["fill_total"] or result["duplicate_total"]
	)
	result["has_work"] = bool(items)
	return result


@frappe.whitelist()
def preview_lab_test_reconcile(patient: str = "", limit: int = 0, files=None) -> dict[str, Any]:
	"""Read-only answer to "does the lab register match Oracle?"."""
	_require_admin()
	files = normalize_files(files)
	with excel_source(files, tables=list(ORACLE_TABLES)) as source:
		scan = _scan()
		items = _work_items(scan, patient=patient, limit=limit)
		result = _preview_payload(scan, items)
		if source is not None:
			result["oracle_table"] = " + ".join(source.describe(table) for table in ORACLE_TABLES)
		else:
			result["oracle_table"] = "CLINIC2.LAB_00_03 + CLINIC2.LAB_00_04"
	return result


@frappe.whitelist()
def start_lab_test_reconcile(
	patient: str = "",
	limit: int = 0,
	dry_run: int = 0,
	fill_missing: int = 1,
	clean_duplicates: int = 1,
	files=None,
) -> dict[str, Any]:
	"""Queue one reconciliation of the lab register (button entry point)."""
	_require_admin()
	files = normalize_files(files)
	if _lock_held():
		return {
			"queued": False,
			"running": True,
			"message": _("A lab test reconciliation is already running."),
			"status": _load_progress(),
		}

	progress = _new_progress(limit)
	progress.update(
		{
			"state": "queued",
			"dry_run": cint(dry_run),
			"fill_missing": cint(fill_missing),
			"clean_duplicates": cint(clean_duplicates),
			"patient": patient or "",
			"files": files,
			"message": (
				_("Queued. The uploaded Excel exports are read in the background.")
				if files
				else _("Queued. Oracle is read in the background.")
			),
		}
	)
	_set_progress(progress)

	frappe.enqueue(
		"healthcare.api.lab_test_reconcile.run_lab_test_reconcile",
		queue="long",
		timeout=7200,
		limit=cint(limit),
		dry_run=cint(dry_run),
		fill_missing=cint(fill_missing),
		clean_duplicates=cint(clean_duplicates),
		patient=patient or "",
		files=files,
	)
	return {"queued": True, "job_key": JOB_KEY, "status": progress}


@frappe.whitelist()
def get_lab_test_reconcile_status() -> dict[str, Any]:
	"""Progress of the last / ongoing reconciliation (polled by the settings dialog)."""
	_require_admin()
	return _load_progress() or {
		"job_key": JOB_KEY,
		"state": "idle",
		"processed": 0,
		"total": 0,
	}


def run_lab_test_reconcile(
	limit: int = 0,
	resume: int = 0,
	token: str | None = None,
	dry_run: int = 0,
	fill_missing: int = 1,
	clean_duplicates: int = 1,
	patient: str = "",
	files: Any = None,
) -> dict[str, Any]:
	"""Background entry point (also callable inline from the bench console)."""
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
				"message": _("A lab test reconciliation is already running."),
			}

	outcome: dict[str, Any] = {}
	try:
		with excel_source(files, tables=list(ORACLE_TABLES)):
			outcome = _run(
				token,
				cint(resume),
				cint(limit),
				cint(dry_run),
				cint(fill_missing),
				cint(clean_duplicates),
				patient or "",
				files,
			)
	except Exception:
		progress = _load_progress() or _new_progress()
		progress["state"] = "failed"
		progress["message"] = frappe.get_traceback()
		_record_errors(progress, [frappe.get_traceback()])
		_set_progress(progress)
		frappe.log_error(title="Lab test reconciliation failed")
		raise
	finally:
		if not outcome.get("handed_over"):
			_release_lock(token)
	return outcome

