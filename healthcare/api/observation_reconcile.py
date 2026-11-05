"""One-button Oracle -> ERPNext reconciliation for observation levels.

Oracle keeps every psychiatric observation order as one
``CLINIC2.IP_OBSERVATION_LEVEL`` row and its ``TRANS_NUM`` (``1144``) is what
``Observation`` uses as its document name (``autoname`` is ``field:trans_no``).
The workbook import (``healthcare.api.ip_observation_level_import``) only runs
when somebody exports that table by hand, so the register stops at the export
date and drifts from Oracle in three ways that this button repairs in one run:

* **missing** - an observation order Oracle recorded that ERPNext never
  imported. On serene 20 orders (``1145`` .. ``1164``) are missing because the
  last export was taken before them.
* **incomplete** - the observation is there but Oracle holds values it lacks
  (observation level / OBS code, discharge date, note, cost centre, service
  amount, duration).
* **duplicates** - the same observation stored twice: the legacy numbered
  record plus a copy the app created under its own name, so the patient's
  observation history shows it twice.

What one run does
-----------------
1. Reads ``IP_OBSERVATION_LEVEL`` (live from Oracle, or from its Excel export)
   and compares the ``TRANS_NUM`` keys with ``tabObservation``.
2. An order whose ``TRANS_NUM`` is still free is created through the *existing*
   legacy importer (``upsert_observation_from_row``): admission / patient links,
   observation level, dates, note, amounts and submit behave exactly like the
   workbook import, so a reconciled register is indistinguishable from an
   imported one.
3. An observation Oracle knows more about gets its blanks filled
   (``fill_missing``). A value that is already there is never overwritten - the
   differences are counted and shown by the preview, never written.
4. Duplicate copies are removed (``clean_duplicates``) and the legacy numbered
   record is kept. Only copies that are *not* backed by their own Oracle row are
   candidates, a copy that carries a note of its own is never merged, and a copy
   that is invoiced, ordered, linked to a Service Request / Sales Invoice or
   carries an attachment is never touched. A submitted copy is cancelled before
   it is deleted, which is what the desk asks for anyway.

Execution model
---------------
The comparison is one pass over both sides (keyset pages of ``tabObservation``,
one Oracle query). The repair then runs in a self-chaining background job on the
``long`` queue: it works through the work list in chunks, commits after each
chunk, keeps its progress in the cache (polled by the Healthcare Settings
dialog) and re-enqueues itself until the list is exhausted.

Usage::

    bench --site <site> execute healthcare.api.observation_reconcile.preview_observation_reconcile
    bench --site <site> execute healthcare.api.observation_reconcile.start_observation_reconcile
    bench --site <site> execute healthcare.api.observation_reconcile.get_observation_reconcile_status
    # inline (no queue), handy for a first smoke test on a real site:
    bench --site <site> execute healthcare.api.observation_reconcile.run_observation_reconcile --kwargs "{'dry_run': 1}"
"""

from __future__ import annotations

import re
import time
from html import unescape
from typing import Any, Iterable, Iterator

import frappe
from frappe import _
from frappe.utils import cint, flt, now_datetime

from healthcare.api.ip_observation_level_import import (
	EXCEL_HEADER_MAP,
	_level_defaults,
	_normalize_obs_code,
	_oracle_currency,
	_parse_dc_datetime,
	_parse_start_date,
	_resolve_observation_level,
	upsert_observation_from_row,
)
from healthcare.api.lab_test_legacy_import import _resolve_cost_center
from healthcare.api.oracle_excel_source import excel_source, normalize_files
from healthcare.api.oracle_sync import _fetch_rows, _in_clause
from healthcare.api.patient_info_import import _cell_text, _clean_oracle_num, _require_admin
from healthcare.api.visit_diagnosis_sync import _resolve_inpatient_admission
from healthcare.healthcare.doctype.observation.observation import vacate_observation_room

JOB_KEY = "observation_reconcile"
PROGRESS_KEY = "healthcare:observation_reconcile:progress"
WORK_KEY = "healthcare:observation_reconcile:work"
LOCK_KEY = "healthcare:observation_reconcile:lock"
PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6

ORACLE_TABLE = "IP_OBSERVATION_LEVEL"
ORACLE_TABLES = (ORACLE_TABLE,)
DOCTYPE = "Observation"

ERP_PAGE = 50000  # keyset page over `tabObservation` (primary key scan)
IMPORT_CHUNK = 200  # work items handled per iteration
ORACLE_CHUNK = 200  # TRANS_NUM keys per Oracle query
ADMISSION_CHUNK = 500  # ADMISSION_NUM keys per Inpatient Admission query
TIME_BUDGET = 15 * 60
SAMPLE_LIMIT = 15
ERROR_LIMIT = 5

# Fields the two sides are compared on. Values that only exist in Oracle are
# filled in; values that differ although both sides have one are only reported.
COMPARED_FIELDS = (
	"obs_code",
	"observation_level",
	"obs_level",
	"start_date",
	"dc_date",
	"note",
	"cost_center",
	"serv_amount",
	"amount",
)
# Everything that may be filled from Oracle when ERPNext left it empty.
FILL_FIELDS = COMPARED_FIELDS + ("duration",)

# Currency fields default to 0, so "empty" means "not set" rather than "NULL".
_NUMERIC_FIELDS = ("serv_amount", "amount")

# A copy carries a human workflow if it is on a bill or on the order chain.
_PROTECTED_FIELDS = (
	"invoiced",
	"sales_invoice",
	"service_request",
	"order_created",
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
	"""Redis key scoped to the site (``frappe.cache().set`` adds no db prefix)."""
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
		"submitted": 0,
		"filled": 0,
		"removed": 0,
		"skipped_existing": 0,
		"skipped_no_admission": 0,
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
	text = unescape(_cell_text(value).replace("\\r\\n", "\\n"))
	text = _TAG.sub(" ", text)
	return _SPACES.sub(" ", text).strip().lower()


def _is_blank(value: Any) -> bool:
	if value is None:
		return True
	if isinstance(value, str):
		return not value.strip()
	return False


def _blank_on_erp(row: dict, field: str) -> bool:
	"""Currency columns hold 0 until something is written into them."""
	if field in _NUMERIC_FIELDS:
		return not flt(row.get(field))
	return _is_blank(row.get(field))


def _date_key(value: Any) -> str:
	if _is_blank(value):
		return ""
	text = str(value).strip()
	return text.split(" ")[0].split("T")[0]


def _same_value(field: str, row: dict, want: Any) -> bool:
	"""Does the stored record already hold what Oracle says?"""
	if field in _NUMERIC_FIELDS:
		return abs(flt(row.get(field)) - flt(want)) < 0.005
	if field in ("start_date", "dc_date"):
		return _date_key(row.get(field)) == _date_key(want)
	if field == "note":
		return _norm_text(row.get(field)) == _norm_text(want)
	return _cell_text(row.get(field)).strip() == _cell_text(want).strip()


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
# Oracle IP_OBSERVATION_LEVEL
# ---------------------------------------------------------------------------


def _oracle_payload(raw: dict) -> dict:
	"""One Oracle observation row in the shape the legacy importer expects.

	``EXCEL_HEADER_MAP`` already maps the Oracle column names to the importer's
	keys (``TRANS_NUM`` -> ``trans_num``), so a live read and an Excel export
	produce exactly the same dictionaries.
	"""
	row: dict[str, Any] = {key: raw.get(column) for column, key in EXCEL_HEADER_MAP.items()}
	row["trans_num"] = _clean_oracle_num(row.get("trans_num"))
	row["admission_num"] = _clean_oracle_num(row.get("admission_num"))
	row["obs_code"] = _normalize_obs_code(row.get("obs_code"))
	row["obs_level"] = _cell_text(row.get("obs_level"))
	row["notes"] = _cell_text(row.get("notes"))
	row["cr_id"] = _clean_oracle_num(row.get("cr_id"))
	row["up_id"] = _clean_oracle_num(row.get("up_id"))
	return row


def _oracle_rows(keys: Iterable[str] | None = None) -> dict[str, dict]:
	"""``TRANS_NUM`` -> payload, for every Oracle row or just ``keys``."""
	if keys is None:
		rows = _fetch_rows(ORACLE_TABLE, order_by="TRANS_NUM") or []
	else:
		rows = []
		for chunk in _chunks(sorted({key for key in keys if key}), ORACLE_CHUNK):
			rows.extend(
				_fetch_rows(
					ORACLE_TABLE,
					where=f"TRANS_NUM in ({_in_clause(chunk)})",
					order_by="TRANS_NUM",
				)
			)

	payloads: dict[str, dict] = {}
	for raw in rows:
		payload = _oracle_payload(raw)
		if payload.get("trans_num"):
			payloads.setdefault(payload["trans_num"], payload)
	return payloads


def _admission_index(admission_nums: Iterable[Any]) -> dict[str, str]:
	"""Legacy ``ADMISSION_NUM`` -> Patient, resolved in a couple of queries.

	``_resolve_inpatient_admission`` walks four lookups per admission, which is
	fine for one row but not for a register; the batch keeps the comparison at
	two queries per chunk and falls back to the exact resolver for the few
	numbers neither column answers.
	"""
	keys = {_clean_oracle_num(num) for num in admission_nums or [] if _clean_oracle_num(num)}
	index: dict[str, str] = {}
	for chunk in _chunks(sorted(keys), ADMISSION_CHUNK):
		for row in frappe.get_all(
			"Inpatient Admission",
			filters={"name": ["in", chunk]},
			fields=["name", "patient"],
			limit_page_length=0,
		):
			index.setdefault(_clean_oracle_num(row.get("name")), row.get("patient") or "")
		for row in frappe.get_all(
			"Inpatient Admission",
			filters={"case_no": ["in", chunk]},
			fields=["case_no", "patient"],
			limit_page_length=0,
		):
			index.setdefault(_clean_oracle_num(row.get("case_no")), row.get("patient") or "")
	return {key: value for key, value in index.items() if key}


def _header_patient(payload: dict, index: dict[str, str], memo: dict | None = None) -> str:
	"""(Resolved) Patient of one Oracle row - the admission decides it."""
	memo = memo if memo is not None else {}
	admission_num = _clean_oracle_num(payload.get("admission_num"))
	if not admission_num:
		return ""
	patient = index.get(admission_num)
	if patient:
		return patient
	if ("admission", admission_num) not in memo:
		memo[("admission", admission_num)] = _resolve_inpatient_admission(admission_num) or ""
	admission = memo[("admission", admission_num)]
	if not admission:
		return ""
	if ("patient", admission) not in memo:
		memo[("patient", admission)] = (
			frappe.db.get_value("Inpatient Admission", admission, "patient") or ""
		)
	return memo[("patient", admission)]



def _level_exists(level: str | None) -> bool:
	"""Is the legacy level code mapped to an Observation Level master record?"""
	return bool(level and frappe.db.exists("Observation Level", level))


def _target_fields(
	payload: dict, *, current_level: str = "", memo: dict | None = None
) -> dict[str, Any]:
	"""What Oracle holds for one observation, in ``Observation`` field names.

	``current_level`` is the Observation Level the record already links to; it
	wins over the code Oracle stores, so filling ``obs_level`` never contradicts
	the level link. Duration and amount fall back to the Observation Level
	master exactly like the workbook import does.
	"""
	memo = memo if memo is not None else {}
	values: dict[str, Any] = {}

	obs_code, resolved_level = _resolve_observation_level(payload.get("obs_code"))
	if obs_code:
		values["obs_code"] = obs_code
	level = ""
	if ("level_exists", resolved_level) not in memo:
		memo[("level_exists", resolved_level)] = _level_exists(resolved_level)
	if memo[("level_exists", resolved_level)]:
		level = str(resolved_level).strip()
		values["observation_level"] = level

	# The level wording follows the link: the record's own level wins over the
	# code Oracle stores, so filling ``obs_level`` never contradicts it.
	wording = _cell_text(payload.get("obs_level")).strip() or current_level or level
	if wording:
		values["obs_level"] = wording

	start_date = _parse_start_date(payload.get("start_date"))
	if start_date:
		values["start_date"] = start_date
	dc_date = _parse_dc_datetime(payload.get("dc_date"))
	if dc_date:
		values["dc_date"] = dc_date

	note = _cell_text(payload.get("notes")).strip()
	if note:
		values["note"] = note

	branch = _clean_oracle_num(payload.get("branch_num"))
	if ("cost_center", branch) not in memo:
		memo[("cost_center", branch)] = _resolve_cost_center(branch)
	if memo[("cost_center", branch)]:
		values["cost_center"] = memo[("cost_center", branch)]

	serv_amount = _oracle_currency(payload.get("serv_amt"))
	if serv_amount:
		# 0 is what ERPNext stores for "not set", so writing it is a no-op.
		values["serv_amount"] = serv_amount
		values["amount"] = serv_amount

	level_for_defaults = current_level or level

	if ("level_defaults", level_for_defaults) not in memo:
		memo[("level_defaults", level_for_defaults)] = _level_defaults(level_for_defaults) or {}
	for field, value in (memo[("level_defaults", level_for_defaults)] or {}).items():
		values.setdefault(field, value)

	return values


# ---------------------------------------------------------------------------
# Comparison: Oracle IP_OBSERVATION_LEVEL vs tabObservation
# ---------------------------------------------------------------------------

# The whole register, minus the free-text note (compared by fingerprint).
_ERP_FIELDS = (
	"trans_no",
	"patient",
	"admission_no",
	"obs_code",
	"observation_level",
	"obs_level",
	"cost_center",
	"duration",
	"invoiced",
	"sales_invoice",
	"service_request",
	"order_created",
)


def _erpnext_rows() -> list[dict]:
	"""The whole ``tabObservation`` register, keyset pages off the primary key."""
	text_columns = ", ".join(f"ifnull(`{field}`, '') as `{field}`" for field in _ERP_FIELDS)
	select = (
		f"name, {text_columns}, ifnull(start_date, '') as start_date, "
		"ifnull(dc_date, '') as dc_date, "
		"ifnull(note, '') as note, "
		"ifnull(serv_amount, 0) as serv_amount, ifnull(amount, 0) as amount, "
		"ifnull(docstatus, 0) as docstatus, creation"
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
		if field == "note":
			continue  # ``_redundant`` already compares the note
		if _blank_on_erp(copy_row, field) or not _blank_on_erp(keeper, field):
			continue
		if not _same_value(field, keeper, copy_row.get(field)):
			return True
	return False


def _redundant(copy_row: dict, keeper: dict) -> bool:
	"""The copy says nothing the kept record does not already say."""
	copy_note = _norm_text(copy_row.get("note"))
	if copy_note and copy_note != _norm_text(keeper.get("note")):
		return False
	return not _richer_than(copy_row, keeper)


def _pick_keeper(rows: list[dict], oracle_numbers: set[str]) -> dict:
	"""The record a duplicate group keeps: the Oracle-backed one, then the oldest."""

	def rank(row: dict) -> tuple:
		key = row.get("trans_no") or row.get("name") or ""
		return (
			0 if key in oracle_numbers else 1,
			str(row.get("creation") or ""),
			str(row.get("name") or ""),
		)

	return sorted(rows, key=rank)[0]


def _duplicate_groups(
	erp_rows: list[dict], oracle_numbers: set[str]
) -> tuple[list[list[str]], int]:
	"""``[[copy to remove, record to keep], ...]`` plus the copies left alone.

	Two legacy rows for the same patient / level / day are two orders Oracle
	really recorded, so only a copy that has no Oracle row of its own can be a
	duplicate - never one that the register is expected to keep.
	"""
	groups: dict[tuple, list[dict]] = {}
	for row in erp_rows:
		patient = row.get("patient")
		level = _norm_text(row.get("observation_level"))
		date = _date_key(row.get("start_date"))
		if not patient or not level or not date:
			continue
		groups.setdefault((patient, level, date), []).append(row)

	duplicates: list[list[str]] = []
	skipped = 0
	for rows in groups.values():
		if len(rows) < 2:
			continue
		if not any((row.get("trans_no") or row.get("name") or "") in oracle_numbers for row in rows):
			continue
		keeper = _pick_keeper(rows, oracle_numbers)
		for row in rows:
			key = row.get("trans_no") or row.get("name") or ""
			if row is keeper or key in oracle_numbers:
				continue
			if _protected(row) or not _redundant(row, keeper):
				skipped += 1
				continue
			duplicates.append([row.get("name"), keeper.get("name")])
	return duplicates, skipped


def _classify(headers: dict[str, dict], erp_rows: list[dict]) -> dict:
	"""Compare the two registers observation by observation and sort every row."""
	by_name = {row["name"]: row for row in erp_rows}
	oracle_numbers = set(headers)
	index = _admission_index(header.get("admission_num") for header in headers.values())
	memo: dict = {}

	missing: list[list[str]] = []
	matched = 0
	fills: list[list] = []
	differs: list[list[str]] = []

	for trans_num in sorted(headers):
		header = headers[trans_num]
		row = by_name.get(trans_num)
		if row is None:
			missing.append(
				[
					trans_num,
					_header_patient(header, index, memo),
					_date_key(_parse_start_date(header.get("start_date"))),
				]
			)
			continue

		matched += 1
		target = _target_fields(
			header,
			current_level=_cell_text(row.get("observation_level")).strip(),
			memo=memo,
		)
		fill = {
			field: target[field]
			for field in FILL_FIELDS
			if field in target and _blank_on_erp(row, field) and not _is_blank(target[field])
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
		if (row.get("trans_no") or row.get("name") or "") not in oracle_numbers
	)
	oracle_patients = {patient for patient in index.values() if patient}

	return {
		"oracle_rows": len(headers),
		"oracle_patients": len(oracle_patients),
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
	return _classify(_oracle_rows(), _erpnext_rows())



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


def _create_observation(trans_num: str, payload: dict | None, dry_run: int) -> dict:
	"""Create one missing observation with the legacy importer (same shape as an import)."""
	if frappe.db.exists(DOCTYPE, trans_num):
		return {"action": "skipped_existing", "name": trans_num}
	if not payload:
		return {"action": "skipped_no_data", "name": trans_num}
	if cint(dry_run):
		return {"action": "created", "name": trans_num, "dry_run": True}

	outcome = upsert_observation_from_row(payload) or {}
	status = str(outcome.get("status") or "")
	if status == "skip_no_admission":
		return {"action": "skipped_no_admission", "name": trans_num}
	if status == "skip_no_trans_num":
		return {"action": "skipped_no_data", "name": trans_num}
	if status != "created":
		return {"action": f"skipped_{status or 'unknown'}", "name": trans_num}
	return {
		"action": "created",
		"name": outcome.get("name") or trans_num,
		"submitted": cint(outcome.get("submitted")),
	}


def _fill_observation(name: str, changes: dict, dry_run: int) -> dict:
	"""Fill the fields ERPNext left empty; a value that is there is never replaced."""
	if not frappe.db.exists(DOCTYPE, name):
		return {"action": "skipped_missing"}
	fields = [field for field in changes if field != "room"] + ["room"]
	current = frappe.db.get_value(DOCTYPE, name, fields, as_dict=True) or {}
	update = {
		field: value
		for field, value in changes.items()
		if _blank_on_erp(current, field) and not _is_blank(value)
	}
	if not update:
		return {"action": "skipped_unchanged"}
	if not cint(dry_run):
		frappe.db.set_value(DOCTYPE, name, update, update_modified=False)
		# ``set_value`` skips the controller, so a discharge date that frees a
		# room has to be mirrored here - that is what ``before_save`` would do.
		room = _cell_text(current.get("room")).strip()
		if room and "dc_date" in update:
			vacate_observation_room(room)
	return {"action": "filled", "fields": sorted(update.keys())}


def _recheck_row(name: str) -> dict:
	"""One observation with the flags a duplicate decision needs, read fresh."""
	rows = frappe.db.sql(
		f"""
		select name, ifnull(trans_no, '') as trans_no,
			ifnull(patient, '') as patient,
			ifnull(admission_no, '') as admission_no,
			ifnull(obs_code, '') as obs_code,
			ifnull(observation_level, '') as observation_level,
			ifnull(obs_level, '') as obs_level,
			ifnull(note, '') as note,
			ifnull(cost_center, '') as cost_center,
			ifnull(duration, '') as duration,
			ifnull(start_date, '') as start_date,
			ifnull(dc_date, '') as dc_date,
			ifnull(serv_amount, 0) as serv_amount,
			ifnull(amount, 0) as amount,
			ifnull(invoiced, 0) as invoiced,
			ifnull(sales_invoice, '') as sales_invoice,
			ifnull(service_request, '') as service_request,
			ifnull(order_created, '') as order_created,
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
	if _norm_text(loss.get("observation_level")) != _norm_text(keep.get("observation_level")):
		return {"action": "skipped_changed"}
	if _date_key(loss.get("start_date")) != _date_key(keep.get("start_date")):
		return {"action": "skipped_changed"}
	loss_admission = _cell_text(loss.get("admission_no")).strip()
	keep_admission = _cell_text(keep.get("admission_no")).strip()
	if loss_admission and keep_admission and loss_admission != keep_admission:
		return {"action": "skipped_other_admission"}
	if _protected(loss):
		return {"action": "skipped_protected"}
	if not _redundant(loss, keep):
		return {"action": "skipped_richer"}

	if not cint(dry_run):
		if cint(loss.get("docstatus")) == 1:
			# A submitted observation cannot be deleted; cancelling it first is
			# what the desk would do by hand.
			doc = frappe.get_doc(DOCTYPE, remove)
			doc.flags.ignore_permissions = True
			doc.cancel()
		frappe.delete_doc(DOCTYPE, remove, ignore_permissions=True, force=True)
	return {"action": "removed"}



def _process_chunk(chunk: list[list], progress: dict, dry_run: int = 0) -> None:
	created = submitted = filled = removed = 0
	skipped_existing = skipped_no_admission = skipped_unchanged = 0
	errors: list[str] = []
	samples: list[str] = []

	create_keys = [item[1] for item in chunk if item[0] == "create"]
	payloads: dict[str, dict] = {}
	if create_keys:
		# One Oracle query per chunk instead of one per observation.
		payloads = _oracle_rows(create_keys)

	for item in chunk:
		op, key = item[0], item[1]
		try:
			if op == "create":
				result = _create_observation(key, payloads.get(key), dry_run)
				if result["action"] == "created":
					created += 1
					submitted += cint(result.get("submitted"))
					samples.append(
						_("created {0}").format(result.get("name") or key)
						if not cint(dry_run)
						else _("would create {0}").format(result.get("name") or key)
					)
				elif result["action"] == "skipped_no_admission":
					skipped_no_admission += 1
					samples.append(_("{0}: admission not in ERPNext").format(key))
				else:
					skipped_existing += 1
			elif op == "fill":
				result = _fill_observation(key, item[3] or {}, dry_run)
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
			frappe.log_error(title=f"Observation reconciliation failed: {op} {key}")

	progress["created"] = cint(progress.get("created")) + created
	progress["submitted"] = cint(progress.get("submitted")) + submitted
	progress["filled"] = cint(progress.get("filled")) + filled
	progress["removed"] = cint(progress.get("removed")) + removed
	progress["skipped_existing"] = cint(progress.get("skipped_existing")) + skipped_existing
	progress["skipped_no_admission"] = (
		cint(progress.get("skipped_no_admission")) + skipped_no_admission
	)
	progress["skipped_unchanged"] = cint(progress.get("skipped_unchanged")) + skipped_unchanged
	_record_samples(progress, samples[:SAMPLE_LIMIT])
	_record_errors(progress, errors)



def _summary_message(progress: dict) -> str:
	lines = [
		_("Observation reconciliation finished."),
		"",
		_("Oracle observation orders: {0} ({1} patients)").format(
			cint(progress.get("oracle_rows")),
			cint(progress.get("oracle_patients")),
		),
		_("Observations in ERPNext: {0} ({1} match Oracle)").format(
			cint(progress.get("erpnext_rows")), cint(progress.get("matched"))
		),
		"",
		_("Created: {0} of {1} missing observations").format(
			cint(progress.get("created")), cint(progress.get("missing_total"))
		),
		_("Filled from Oracle: {0} of {1} incomplete observations").format(
			cint(progress.get("filled")), cint(progress.get("fill_total"))
		),
		_("Duplicates removed: {0} of {1}").format(
			cint(progress.get("removed")), cint(progress.get("duplicate_total"))
		),
	]
	if cint(progress.get("differs_total")):
		lines.append(
			_("{0} observations hold values that differ from Oracle and were left untouched.").format(
				cint(progress.get("differs_total"))
			)
		)
	if cint(progress.get("skipped_duplicates")):
		lines.append(
			_("{0} duplicate copies were kept (invoiced, linked, attachment or extra data).").format(
				cint(progress.get("skipped_duplicates"))
			)
		)
	if cint(progress.get("skipped_no_admission")):
		lines.append(
			_("Skipped (the admission is not in ERPNext): {0}").format(
				cint(progress.get("skipped_no_admission"))
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
		"healthcare.api.observation_reconcile.run_observation_reconcile",
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
				"message": _("Comparing the observations with Oracle…"),
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
					"ERPNext already has every observation Oracle recorded and no duplicates were found. Nothing to do."
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
def preview_observation_reconcile(patient: str = "", limit: int = 0, files=None) -> dict[str, Any]:
	"""Read-only answer to "does the observation register match Oracle?"."""
	_require_admin()
	files = normalize_files(files)
	with excel_source(files, tables=list(ORACLE_TABLES)) as source:
		scan = _scan()
		items = _work_items(scan, patient=patient, limit=limit)
		result = _preview_payload(scan, items)
		if source is not None:
			result["oracle_table"] = " + ".join(source.describe(table) for table in ORACLE_TABLES)
		else:
			result["oracle_table"] = "CLINIC2.IP_OBSERVATION_LEVEL"
	return result


@frappe.whitelist()
def start_observation_reconcile(
	patient: str = "",
	limit: int = 0,
	dry_run: int = 0,
	fill_missing: int = 1,
	clean_duplicates: int = 1,
	files=None,
) -> dict[str, Any]:
	"""Queue one reconciliation of the observation register (button entry point)."""
	_require_admin()
	files = normalize_files(files)
	if _lock_held():
		return {
			"queued": False,
			"running": True,
			"message": _("An observation reconciliation is already running."),
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
				_("Queued. The uploaded Excel export is read in the background.")
				if files
				else _("Queued. Oracle is read in the background.")
			),
		}
	)
	_set_progress(progress)

	frappe.enqueue(
		"healthcare.api.observation_reconcile.run_observation_reconcile",
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
def get_observation_reconcile_status() -> dict[str, Any]:
	"""Progress of the last / ongoing reconciliation (polled by the settings dialog)."""
	_require_admin()
	return _load_progress() or {
		"job_key": JOB_KEY,
		"state": "idle",
		"processed": 0,
		"total": 0,
	}


def run_observation_reconcile(
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
				"message": _("An observation reconciliation is already running."),
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
		frappe.log_error(title="Observation reconciliation failed")
		raise
	finally:
		if not outcome.get("handed_over"):
			_release_lock(token)
	return outcome

