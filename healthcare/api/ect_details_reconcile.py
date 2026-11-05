"""One-button Oracle -> ERPNext reconciliation for ECT Details.

Oracle stores ECT session headers in ``CLINIC2.ECT_00_01`` (``TRANS_NUM``) and
attribute notes in ``ECT_00_02``. ERPNext stores the same headers in
``ECT Details`` (``autoname`` = ``field:trans_num``). Workbook imports only run
when somebody exports by hand, so the register drifts from Oracle.

What one run does
-----------------
1. Reads ``ECT_00_01`` (live Oracle or uploaded Excel) and compares it with
   ``tabECT Details`` by ``TRANS_NUM``.
2. Rows whose number is already on the same admission or visit are treated as
   imported. Missing rows whose ``TRANS_NUM`` is still free are created via
   ``upsert_ect_detail`` (insert-only from this job).
3. When another admission or visit already owns the ``TRANS_NUM``, the row is
   created under ``<TRANS_NUM>-E`` (``-E-2`` if taken). Turn that off with
   *suffix_conflicts* to only report those rows.
4. Before creating, ``TRANS_DATE`` and key ECT measures are compared with
   records on the same patient and admission or visit; duplicates are skipped.
5. After a parent is created, matching ``ECT_00_02`` rows are applied when
   available (same workbook / Oracle link).
6. Existing ECT Details rows are never updated or deleted by this job.

Usage::

    bench --site <site> execute healthcare.api.ect_details_reconcile.preview_ect_details_reconcile
    bench --site <site> execute healthcare.api.ect_details_reconcile.start_ect_details_reconcile
    bench --site <site> execute healthcare.api.ect_details_reconcile.get_ect_details_reconcile_status
    bench --site <site> execute healthcare.api.ect_details_reconcile.run_ect_details_reconcile --kwargs "{'limit': 5}"
"""

from __future__ import annotations

import re
import time
from typing import Any, Iterable

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, now_datetime, nowdate

from healthcare.api.ect_details_attribute_import import (
	EXCEL_HEADER_MAP as ATTR_HEADER_MAP,
	import_ect_attributes_for_trans,
)
from healthcare.api.ect_details_import import EXCEL_HEADER_MAP, _parse_date_field, upsert_ect_detail
from healthcare.api.oracle_excel_source import excel_source, normalize_files, oracle_schema
from healthcare.api.oracle_sync import _fetch_rows, _query
from healthcare.api.patient_info_import import _cell_text, _clean_oracle_num, _require_admin
from healthcare.api.visit_diagnosis_sync import _resolve_inpatient_admission

JOB_KEY = "ect_details_reconcile"
PROGRESS_KEY = "healthcare:ect_details_reconcile:progress"
WORK_KEY = "healthcare:ect_details_reconcile:work"
LOCK_KEY = "healthcare:ect_details_reconcile:lock"
PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6

ORACLE_TABLE = "ECT_00_01"
ORACLE_ATTR_TABLE = "ECT_00_02"
ORACLE_TABLES = [ORACLE_TABLE, ORACLE_ATTR_TABLE]
DOCTYPE = "ECT Details"
ADMISSION_DOCTYPE = "Inpatient Admission"
CONFLICT_SUFFIX = "-E"

ERP_PAGE = 50000
IMPORT_CHUNK = 300
TIME_BUDGET = 15 * 60
SAMPLE_LIMIT = 15
ERROR_LIMIT = 5
_SUFFIXED_KEY = re.compile(r"^(?P<number>\d+)" + re.escape(CONFLICT_SUFFIX) + r"(?:-\d+)?$")

_ECT_FINGERPRINT_FIELDS = (
	"gtcs_seconds",
	"energy_value",
	"gtcs_seconds2",
	"gtcs_seconds3",
	"energy_value2",
	"energy_value3",
)


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
		"suffix_conflicts": 1,
		"patient": "",
		"admission": "",
		"files": [],
		"index": 0,
		"processed": 0,
		"total": 0,
		"oracle_rows": 0,
		"oracle_admissions": 0,
		"erpnext_ect": 0,
		"matched_ect": 0,
		"missing_free": 0,
		"missing_blocked": 0,
		"missing_total": 0,
		"foreign_ect": 0,
		"extra_ect": 0,
		"created": 0,
		"suffixed_trans_nums": 0,
		"attributes_updated": 0,
		"skipped_existing": 0,
		"skipped_same_content": 0,
		"skipped_conflict": 0,
		"skipped_no_admission": 0,
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
# Value helpers
# ---------------------------------------------------------------------------


def _numeric_key(value: Any) -> str:
	text = _clean_oracle_num(value)
	match = _SUFFIXED_KEY.match(text)
	return match.group("number") if match else text


def _sql_text(value: str) -> str:
	return "'" + str(value).replace("'", "''") + "'"


def _norm_measure(value: Any) -> str:
	if value in (None, ""):
		return ""
	if isinstance(value, (int, float)):
		number = flt(value)
		return str(int(number)) if number == int(number) else str(number)
	text = str(value).strip().replace(",", "")
	try:
		number = flt(text)
		return str(int(number)) if number == int(number) else str(number)
	except (TypeError, ValueError):
		return text.lower()


def _norm_flag(value: Any) -> str:
	return _cell_text(value).strip().upper()


def _ect_date_key(row: dict) -> str:
	parsed = _parse_date_field(row.get("trans_date"))
	if parsed:
		return str(parsed)
	if row.get("cr_date"):
		try:
			return str(getdate(row.get("cr_date")))
		except Exception:
			pass
	return _cell_text(row.get("trans_date"))[:10]


def _ect_date_key_from_doc(row: dict) -> str:
	if row.get("date"):
		try:
			return str(getdate(row.get("date")))
		except Exception:
			return str(row.get("date"))[:10]
	return ""


def _ect_fingerprint(row: dict) -> tuple[str, ...]:
	return (_ect_date_key(row),) + tuple(_norm_measure(row.get(field)) for field in _ECT_FINGERPRINT_FIELDS) + (
		_norm_flag(row.get("is_success")),
		_norm_flag(row.get("is_repeated")),
	)


def _ect_fingerprint_from_doc(row: dict) -> tuple[str, ...]:
	return (_ect_date_key_from_doc(row),) + tuple(
		_norm_measure(row.get(field)) for field in ("duration", "energy", "gtcs_seconds2", "gtcs_seconds3", "energy_value2", "energy_value3")
	) + (
		_norm_flag(row.get("success")),
		_norm_flag(row.get("repeated")),
	)


def _oracle_owner(raw: dict) -> str:
	admission = _clean_oracle_num(raw.get("ADMISSION_NUM"))
	if admission:
		return admission
	visit = _clean_oracle_num(raw.get("VISIT_NUM"))
	if visit:
		return f"@{visit}"
	return ""


def _erp_owner(
	admission_num: str,
	visit_num: str,
	reference_doctype: str,
	reference_name: str,
) -> str:
	admission = _clean_oracle_num(admission_num)
	if admission:
		return admission
	if reference_doctype == "Inpatient Admission":
		return _clean_oracle_num(reference_name)
	visit = _clean_oracle_num(visit_num)
	if visit:
		return f"@{visit}"
	if reference_doctype == "Patient Visit":
		return f"@{_clean_oracle_num(reference_name)}"
	return ""


# ---------------------------------------------------------------------------
# Comparison: Oracle ECT_00_01 vs tabECT Details
# ---------------------------------------------------------------------------


def _oracle_ect_index() -> dict[str, str]:
	rows = _query(
		f"select TRANS_NUM, ADMISSION_NUM, VISIT_NUM from {oracle_schema()}.{ORACLE_TABLE} "
		"where TRANS_NUM is not null"
	)
	index: dict[str, str] = {}
	for row in rows or []:
		num = _clean_oracle_num(row.get("TRANS_NUM"))
		if not num:
			continue
		index[num] = _oracle_owner(row)
	return index


def _oracle_totals() -> dict:
	rows = _query(
		f"select count(*) as TOTAL, count(distinct ADMISSION_NUM) as ADMISSIONS "
		f"from {oracle_schema()}.{ORACLE_TABLE}"
	)
	row = (rows or [{}])[0]
	return {
		"oracle_rows": cint(row.get("TOTAL")),
		"oracle_admissions": cint(row.get("ADMISSIONS")),
	}


def _erpnext_page(after: str = "", limit: int = ERP_PAGE) -> list[tuple]:
	return frappe.db.sql(
		"""
		select name, trans_num,
			ifnull(admission_num, ''), ifnull(visit_num, ''),
			ifnull(reference_doctype, ''), ifnull(reference_name, '')
		from `tabECT Details`
		where name > %s
		order by name asc
		limit %s
		""",
		(after, limit),
	)


def _scan() -> dict:
	totals = _oracle_totals()
	oracle = _oracle_ect_index()

	missing = set(oracle)
	blocked: dict[str, str] = {}
	matched = 0
	foreign_ect = 0
	extra_ect = 0
	erp_total = 0
	after = ""
	while True:
		rows = _erpnext_page(after)
		if not rows:
			break
		for name, trans_num, admission_num, visit_num, ref_doctype, ref_name in rows:
			after = name
			erp_total += 1
			key = _numeric_key(trans_num or name)
			owner = _erp_owner(admission_num, visit_num, ref_doctype, ref_name)
			oracle_owner = oracle.get(key)
			if oracle_owner is None:
				extra_ect += 1
				continue
			if oracle_owner == owner:
				blocked.pop(key, None)
				if key in missing:
					missing.discard(key)
					matched += 1
				continue
			foreign_ect += 1
			if key in missing:
				blocked.setdefault(key, owner)
		if len(rows) < ERP_PAGE:
			break

	# missing_free is [trans_num, owner]; _work_items adds the "free"/"blocked" tag.
	missing_free = [[num, oracle[num]] for num in missing if num not in blocked]
	missing_blocked = [[num, oracle[num], blocked[num]] for num in blocked if num in missing]

	return {
		"oracle_rows": totals["oracle_rows"],
		"oracle_admissions": totals["oracle_admissions"],
		"erpnext_ect": erp_total,
		"matched_ect": matched,
		"extra_ect": extra_ect,
		"foreign_ect": foreign_ect,
		"missing_free": missing_free,
		"missing_blocked": missing_blocked,
	}


# ---------------------------------------------------------------------------
# Repair: create missing ECT Details
# ---------------------------------------------------------------------------


def _prepare_row(raw: dict) -> dict | None:
	row: dict[str, Any] = {}
	for name, value in (raw or {}).items():
		key = EXCEL_HEADER_MAP.get(str(name or "").strip().upper(), str(name or "").strip().lower())
		row[key] = value

	trans_num = _clean_oracle_num(row.get("trans_num"))
	if not trans_num:
		return None
	row["trans_num"] = trans_num
	row["patient_num"] = _clean_oracle_num(row.get("patient_num"))
	row["visit_num"] = _clean_oracle_num(row.get("visit_num"))
	row["admission_num"] = _clean_oracle_num(row.get("admission_num"))
	row["branch_num"] = _clean_oracle_num(row.get("branch_num"))
	row["cr_id"] = _clean_oracle_num(row.get("cr_id"))
	row["up_id"] = _clean_oracle_num(row.get("up_id"))
	row["notes_cr_id"] = _clean_oracle_num(row.get("notes_cr_id"))
	row["remarks_cr_id"] = _clean_oracle_num(row.get("remarks_cr_id"))
	return row


def _prepare_attr_row(raw: dict) -> dict | None:
	row: dict[str, Any] = {}
	for name, value in (raw or {}).items():
		key = ATTR_HEADER_MAP.get(str(name or "").strip().upper(), str(name or "").strip().lower())
		row[key] = value
	trans_num = _clean_oracle_num(row.get("trans_num"))
	attrib_num = cint(row.get("attrib_num")) if row.get("attrib_num") not in (None, "") else 0
	if not trans_num or not attrib_num:
		return None
	row["trans_num"] = trans_num
	row["attrib_num"] = attrib_num
	row["order_of_attrib"] = cint(row.get("order_of_attrib")) if row.get("order_of_attrib") not in (None, "") else 0
	row["cr_id"] = _clean_oracle_num(row.get("cr_id")) or None
	row["up_id"] = _clean_oracle_num(row.get("up_id")) or None
	return row


def _oracle_rows_by_numbers(numbers: list[str]) -> list[dict]:
	if not numbers:
		return []
	where = "TRANS_NUM in (" + ", ".join(_sql_text(num) for num in numbers) + ")"
	return _fetch_rows(ORACLE_TABLE, where=where, order_by="ADMISSION_NUM, TRANS_DATE, TRANS_NUM")


def _oracle_attributes_by_trans(numbers: list[str]) -> dict[str, list[dict]]:
	if not numbers:
		return {}
	try:
		where = "TRANS_NUM in (" + ", ".join(_sql_text(num) for num in numbers) + ")"
		raw_rows = _fetch_rows(ORACLE_ATTR_TABLE, where=where, order_by="TRANS_NUM, ORDER_OF_ATTRIB, ATTRIB_NUM")
	except Exception:
		return {}
	grouped: dict[str, list[dict]] = {}
	for raw in raw_rows or []:
		row = _prepare_attr_row(raw)
		if not row:
			continue
		grouped.setdefault(row["trans_num"], []).append(row)
	return grouped


def _resolve_admission(row: dict) -> str | None:
	admission_num = row.get("admission_num") or ""
	if admission_num:
		return _resolve_inpatient_admission(admission_num, row.get("patient_num"))
	return None


def _resolve_patient(row: dict) -> str | None:
	patient = _clean_oracle_num(row.get("patient_num"))
	if patient and frappe.db.exists("Patient", patient):
		return patient
	return None


def _existing_ect(*, admission: str | None, patient: str | None) -> tuple[set[str], set[tuple[str, ...]]]:
	filters: list[list] | dict
	if admission:
		filters = [
			["reference_doctype", "=", "Inpatient Admission"],
			["reference_name", "=", admission],
		]
		rows = frappe.get_all(
			DOCTYPE,
			filters=filters,
			fields=["trans_num", "date", "duration", "energy", "success", "repeated", "gtcs_seconds2", "gtcs_seconds3", "energy_value2", "energy_value3"],
			limit_page_length=0,
		)
		if not rows:
			legacy = _clean_oracle_num(admission)
			rows = frappe.get_all(
				DOCTYPE,
				filters={"admission_num": legacy},
				fields=["trans_num", "date", "duration", "energy", "success", "repeated", "gtcs_seconds2", "gtcs_seconds3", "energy_value2", "energy_value3"],
				limit_page_length=0,
			)
	elif patient:
		rows = frappe.get_all(
			DOCTYPE,
			filters={"patient": patient},
			fields=["trans_num", "date", "duration", "energy", "success", "repeated", "gtcs_seconds2", "gtcs_seconds3", "energy_value2", "energy_value3"],
			limit_page_length=0,
		)
	else:
		return set(), set()

	numbers = {_numeric_key(row.get("trans_num")) for row in rows if row.get("trans_num")}
	fingerprints = {_ect_fingerprint_from_doc(row) for row in rows}
	return numbers, fingerprints


def _free_suffixed_trans_num(trans_num: str) -> str:
	candidate = f"{trans_num}{CONFLICT_SUFFIX}"
	index = 2
	while frappe.db.exists(DOCTYPE, candidate):
		candidate = f"{trans_num}{CONFLICT_SUFFIX}-{index}"
		index += 1
	return candidate


def _row_label(row: dict) -> str:
	date = _ect_date_key(row) or "?"
	energy = _norm_measure(row.get("energy_value"))
	duration = _norm_measure(row.get("gtcs_seconds"))
	return f"{row.get('trans_num')} · {date} · {duration}s · {energy}"


def _import_attributes(trans_num: str, attr_rows: list[dict], progress: dict) -> None:
	if not attr_rows:
		return
	try:
		result = import_ect_attributes_for_trans(trans_num, attr_rows)
	except Exception:
		_record_errors(progress, [f"{trans_num} attributes: {frappe.get_traceback()}"])
		return
	if (result or {}).get("status") == "updated":
		progress["attributes_updated"] = cint(progress.get("attributes_updated")) + 1


def _process_chunk(
	items: list[list[str]],
	progress: dict,
	*,
	dry_run: int = 0,
	suffix_conflicts: int = 1,
	attr_by_trans: dict[str, list[dict]] | None = None,
) -> None:
	numbers = [item[0] for item in items]
	prepared = [row for row in (_prepare_row(raw) for raw in _oracle_rows_by_numbers(numbers)) if row]
	if attr_by_trans is None:
		attr_by_trans = _oracle_attributes_by_trans(numbers)

	by_scope: dict[tuple[str | None, str | None], list[dict]] = {}
	for row in prepared:
		admission = _resolve_admission(row)
		patient = _resolve_patient(row)
		if not admission and not patient:
			progress["skipped_no_patient"] = cint(progress.get("skipped_no_patient")) + 1
			_record_samples(
				progress,
				[f"{row['trans_num']}: no Patient in ERPNext for {row.get('patient_num') or '?'}"],
			)
			continue
		if row.get("admission_num") and not admission:
			progress["skipped_no_admission"] = cint(progress.get("skipped_no_admission")) + 1
			_record_samples(
				progress,
				[f"{row['trans_num']}: no Inpatient Admission for {row.get('admission_num') or '?'}"],
			)
			continue
		by_scope.setdefault((admission, patient), []).append(row)

	for (admission, patient), rows in by_scope.items():
		existing_numbers, fingerprints = _existing_ect(admission=admission, patient=patient)
		for row in rows:
			trans_num = row["trans_num"]
			if trans_num in existing_numbers:
				progress["skipped_existing"] = cint(progress.get("skipped_existing")) + 1
				continue
			fingerprint = _ect_fingerprint(row)
			if fingerprint[0] and fingerprint in fingerprints:
				progress["skipped_same_content"] = cint(progress.get("skipped_same_content")) + 1
				continue

			create_num = trans_num
			if frappe.db.exists(DOCTYPE, trans_num):
				if not cint(suffix_conflicts):
					progress["skipped_conflict"] = cint(progress.get("skipped_conflict")) + 1
					_record_samples(progress, [f"{_row_label(row)} (trans num taken)"])
					continue
				create_num = _free_suffixed_trans_num(trans_num)

			if frappe.db.exists(DOCTYPE, create_num):
				progress["skipped_existing"] = cint(progress.get("skipped_existing")) + 1
				continue

			progress["created"] = cint(progress.get("created")) + 1
			if create_num != trans_num:
				progress["suffixed_trans_nums"] = cint(progress.get("suffixed_trans_nums")) + 1
			scope = admission or patient or "?"
			_record_samples(progress, [f"{create_num} · {scope} · {_row_label(row)}"])
			if cint(dry_run):
				fingerprints.add(fingerprint)
				existing_numbers.add(trans_num)
				continue

			try:
				result = upsert_ect_detail({**row, "trans_num": create_num})
			except Exception:
				_record_errors(progress, [f"{create_num}: {frappe.get_traceback()}"])
				progress["created"] = cint(progress.get("created")) - 1
				continue
			status = (result or {}).get("status")
			if status == "updated":
				progress["skipped_existing"] = cint(progress.get("skipped_existing")) + 1
				progress["created"] = cint(progress.get("created")) - 1
				continue
			if status != "created":
				_record_errors(progress, [f"{create_num}: {status or 'unexpected result'}"])
				progress["created"] = cint(progress.get("created")) - 1
				continue

			fingerprints.add(fingerprint)
			existing_numbers.add(_numeric_key(create_num))
			attr_rows = attr_by_trans.get(trans_num) or attr_by_trans.get(create_num) or []
			if attr_rows:
				_import_attributes(create_num, attr_rows, progress)


# ---------------------------------------------------------------------------
# Work list and filters
# ---------------------------------------------------------------------------

_ADMISSION_NAMES: dict[str, str | None] = {}


def _resolve_admission_number(admission_num: str) -> str | None:
	key = _cell_text(admission_num).strip()
	if not key:
		return None
	if key.startswith("@"):
		return None
	if key not in _ADMISSION_NAMES:
		_ADMISSION_NAMES[key] = _resolve_inpatient_admission(key)
	return _ADMISSION_NAMES[key]


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
	suffix_conflicts: int = 1,
) -> list[list[str]]:
	items = [[num, owner, "free"] for num, owner in scan.get("missing_free") or []]
	if cint(suffix_conflicts):
		items.extend(
			[num, owner, "blocked"]
			for num, owner, _claimant in scan.get("missing_blocked") or []
		)

	allowed = _allowed_admissions(patient, admission)
	if allowed is not None:
		items = [item for item in items if _resolve_admission_number(item[1]) in allowed]

	items.sort(key=lambda item: cint(item[0]))
	if cint(limit):
		return items[: cint(limit)]
	return items


def _summary_message(progress: dict) -> str:
	dry = cint(progress.get("dry_run"))
	lines = [
		_("Reconcile ECT Details finished."),
		"",
		_("Oracle {0}").format(ORACLE_TABLE),
		_("ECT rows in Oracle: {0}").format(cint(progress.get("oracle_rows"))),
		_("Admissions in Oracle: {0}").format(cint(progress.get("oracle_admissions"))),
		_("ECT Details in ERPNext: {0}").format(cint(progress.get("erpnext_ect"))),
		_("Rows already matched by trans number: {0}").format(cint(progress.get("matched_ect"))),
		_("Missing - trans number still free: {0}").format(cint(progress.get("missing_free"))),
		_("Missing - trans number used by another admission or visit: {0}").format(
			cint(progress.get("missing_blocked"))
		),
		"",
		_("ECT Details created: {0}").format(cint(progress.get("created"))),
		_("Created under a suffixed trans number ({0}): {1}").format(
			CONFLICT_SUFFIX, cint(progress.get("suffixed_trans_nums"))
		),
		_("Attribute parents updated from {0}: {1}").format(
			ORACLE_ATTR_TABLE, cint(progress.get("attributes_updated"))
		),
		_("Rows skipped - same date and ECT measures already recorded: {0}").format(
			cint(progress.get("skipped_same_content"))
		),
	]
	if progress.get("skipped_conflict"):
		lines.append(
			_("Rows left alone - trans number used elsewhere: {0}").format(
				cint(progress.get("skipped_conflict"))
			)
		)
	if progress.get("skipped_no_admission"):
		lines.append(
			_("Rows skipped - no Inpatient Admission in ERPNext: {0}").format(
				cint(progress.get("skipped_no_admission"))
			)
		)
	if progress.get("skipped_no_patient"):
		lines.append(
			_("Rows skipped - no Patient in ERPNext: {0}").format(cint(progress.get("skipped_no_patient")))
		)
	if progress.get("foreign_ect"):
		lines.append("")
		lines.append(
			_(
				"ECT Details whose trans number Oracle gave to another admission or visit "
				"(left untouched, please review): {0}"
			).format(cint(progress.get("foreign_ect")))
		)
	if dry:
		lines.insert(1, _("DRY RUN - nothing was changed."))
	if progress.get("failed"):
		lines.extend(["", _("Failed records: {0}").format(cint(progress.get("failed")))])
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
		"healthcare.api.ect_details_reconcile.run_ect_details_reconcile",
		queue="long",
		timeout=7200,
		resume=1,
		token=token,
		dry_run=cint(progress.get("dry_run")),
		suffix_conflicts=cint(progress.get("suffix_conflicts")),
		files=files,
	)


def _run(
	token: str,
	resume: int,
	limit: int,
	dry_run: int = 0,
	suffix_conflicts: int = 1,
	patient: str = "",
	admission: str = "",
	files: Any = None,
) -> dict[str, Any]:
	started = time.monotonic()
	progress = (_load_progress() if cint(resume) else {}) or _new_progress(limit)
	if cint(resume):
		limit = cint(progress.get("limit")) or cint(limit)
		dry_run = cint(progress.get("dry_run"))
		suffix_conflicts = cint(progress.get("suffix_conflicts"))
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
				"suffix_conflicts": cint(suffix_conflicts),
				"patient": patient or "",
				"admission": admission or "",
				"files": files or [],
				"index": 0,
				"processed": 0,
				"message": _("Comparing ECT Details with Oracle…"),
			}
		)
		_set_progress(progress)

		scan = _scan()
		items = _work_items(
			scan,
			patient=patient,
			admission=admission,
			limit=limit,
			suffix_conflicts=suffix_conflicts,
		)
		_set_work({"items": items, "built_at": str(now_datetime())})
		progress.update(
			{
				"oracle_rows": scan["oracle_rows"],
				"oracle_admissions": scan["oracle_admissions"],
				"erpnext_ect": scan["erpnext_ect"],
				"matched_ect": scan["matched_ect"],
				"extra_ect": scan["extra_ect"],
				"foreign_ect": scan["foreign_ect"],
				"missing_free": len(scan["missing_free"]),
				"missing_blocked": len(scan["missing_blocked"]),
				"missing_total": len(scan["missing_free"]) + len(scan["missing_blocked"]),
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
				"message": _("ERPNext already has every ECT row Oracle recorded. Nothing to do."),
			}
		)
		_set_progress(progress)
		return {"state": "finished", "progress": progress}

	while True:
		offset = cint(progress.get("index"))
		chunk = items[offset : offset + IMPORT_CHUNK]
		if not chunk:
			break
		_process_chunk(
			chunk,
			progress,
			dry_run=cint(progress.get("dry_run")),
			suffix_conflicts=cint(progress.get("suffix_conflicts")),
		)
		progress["index"] = offset + len(chunk)
		progress["processed"] = cint(progress.get("index"))
		frappe.db.commit()
		_set_progress(progress)
		_refresh_lock(token)

		if time.monotonic() - started > TIME_BUDGET:
			progress["state"] = "queued"
			progress["message"] = _(
				"Still running in the background ({0} of {1} ECT rows processed)."
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


@frappe.whitelist()
def preview_ect_details_reconcile(
	patient: str = "", admission: str = "", limit: int = 0, files=None
) -> dict[str, Any]:
	"""Read-only answer to "does the ECT register match Oracle?"."""
	_require_admin()
	files = normalize_files(files)
	with excel_source(files, tables=ORACLE_TABLES) as source:
		scan = _scan()
		items = _work_items(scan, patient=patient, admission=admission, limit=limit)
		sample_rows = [
			row
			for row in (_prepare_row(raw) for raw in _oracle_rows_by_numbers([item[0] for item in items[:10]]))
			if row
		]
		allowed = _allowed_admissions(patient, admission)
		blocked_rows = [
			row
			for row in scan["missing_blocked"]
			if allowed is None or _resolve_admission_number(row[1]) in allowed
		]
		result: dict[str, Any] = {
			"ok": True,
			"as_of": str(nowdate()),
			"mode": "admission" if admission else ("patient" if patient else "site"),
			"oracle_table": f"{oracle_schema()}.{ORACLE_TABLE}",
			"oracle_rows": scan["oracle_rows"],
			"oracle_admissions": scan["oracle_admissions"],
			"erpnext_ect": scan["erpnext_ect"],
			"matched_ect": scan["matched_ect"],
			"extra_ect": scan["extra_ect"],
			"foreign_ect": scan["foreign_ect"],
			"missing_free": sum(1 for item in items if item[2] == "free"),
			"missing_blocked": sum(1 for item in items if item[2] == "blocked"),
			"missing_total": len(items),
			"contexts_with_missing": len({item[1] for item in items}),
			"blocked_sample": [[num, owner, claimant] for num, owner, claimant in blocked_rows[:10]],
			"samples": [
				{
					"number": row["trans_num"],
					"admission": row.get("admission_num"),
					"visit": row.get("visit_num"),
					"date": _ect_date_key(row),
					"duration": _norm_measure(row.get("gtcs_seconds")),
					"energy": _norm_measure(row.get("energy_value")),
				}
				for row in sample_rows
			],
		}
		if source is not None:
			result["oracle_table"] = source.describe(ORACLE_TABLE)
	result["in_sync"] = not cint(result["missing_total"])
	return result


@frappe.whitelist()
def start_ect_details_reconcile(
	patient: str = "",
	admission: str = "",
	limit: int = 0,
	dry_run: int = 0,
	suffix_conflicts: int = 1,
	files=None,
) -> dict[str, Any]:
	"""Queue one reconciliation of the ECT Details register."""
	_require_admin()
	files = normalize_files(files)
	if _lock_held():
		return {
			"queued": False,
			"running": True,
			"message": _("An ECT Details reconciliation is already running."),
			"status": _load_progress(),
		}

	progress = _new_progress(limit)
	progress.update(
		{
			"state": "queued",
			"dry_run": cint(dry_run),
			"suffix_conflicts": cint(suffix_conflicts),
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
		"healthcare.api.ect_details_reconcile.run_ect_details_reconcile",
		queue="long",
		timeout=7200,
		limit=cint(limit),
		dry_run=cint(dry_run),
		suffix_conflicts=cint(suffix_conflicts),
		patient=patient or "",
		admission=admission or "",
		files=files,
	)
	return {"queued": True, "job_key": JOB_KEY, "status": progress}


@frappe.whitelist()
def get_ect_details_reconcile_status() -> dict[str, Any]:
	"""Progress of the last / ongoing reconciliation."""
	_require_admin()
	return _load_progress() or {
		"job_key": JOB_KEY,
		"state": "idle",
		"processed": 0,
		"total": 0,
	}


def run_ect_details_reconcile(
	limit: int = 0,
	resume: int = 0,
	token: str | None = None,
	dry_run: int = 0,
	suffix_conflicts: int = 1,
	patient: str = "",
	admission: str = "",
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
				"message": _("An ECT Details reconciliation is already running."),
			}

	outcome: dict[str, Any] = {}
	try:
		with excel_source(files, tables=ORACLE_TABLES):
			outcome = _run(
				token,
				cint(resume),
				cint(limit),
				cint(dry_run),
				cint(suffix_conflicts),
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
		frappe.log_error(title="ECT Details reconciliation failed")
		raise
	finally:
		if not outcome.get("handed_over"):
			_release_lock(token)
	return outcome
