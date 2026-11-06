"""Oracle -> ERPNext reconcile for four care records.

* ``MORSE_FALL_SCALE_01.TRANS_NUM`` -> ``Morse Fall Scale`` (document name)
* ``IP_PATIENT_ASSESSMENT`` -> one ``Patient Assessment`` per admission
* ``IP_ADMISSION_MEDICINE_SHEET`` and ``IP_ADMISSION_MEDICINE_SHEET_23``,
  where ``GIVEN_YN`` is Y -> ``Medicine Given``
* ``APPOINTMENTS_INFO_01.APP_NUM`` -> ``Patient Appointment`` (document name)

Existing documents are not rewritten. A repeated Patient Assessment for the
same admission, or a repeated Medicine Given for the same sheet number, is
removed and the earliest row is kept.
"""

from __future__ import annotations

import time
from typing import Any, Callable

import frappe
from frappe import _
from frappe.utils import cint, getdate, now_datetime, nowdate

from healthcare.api.ip_admission_medicine_sheet_given_import import (
	EXCEL_HEADER_MAP as MEDICINE_HEADER_MAP,
)
from healthcare.api.ip_admission_medicine_sheet_given_import import _parse_datetime
from healthcare.api.ip_patient_assessment_import import EXCEL_HEADER_MAP as ASSESSMENT_HEADER_MAP
from healthcare.api.ip_patient_assessment_import import upsert_patient_assessment_from_row
from healthcare.api.morse_fall_scale_import import EXCEL_HEADER_MAP as MORSE_HEADER_MAP
from healthcare.api.morse_fall_scale_import import upsert_morse_fall_scale_from_row
from healthcare.api.oracle_excel_source import (
	current_source,
	excel_source,
	normalize_files,
	oracle_schema,
)
from healthcare.api.oracle_sync import _fetch_rows, _in_clause, _query, _sort_key
from healthcare.api.patient_appointment_info_import import EXCEL_HEADER_MAP as APPOINTMENT_HEADER_MAP
from healthcare.api.patient_appointment_info_import import upsert_patient_appointment_from_row
from healthcare.api.patient_info_import import _cell_text, _clean_oracle_num, _require_admin
from healthcare.api.visit_diagnosis_sync import _resolve_inpatient_admission

PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6
ERP_PAGE = 50000
IMPORT_CHUNK = 200
TIME_BUDGET = 15 * 60
SAMPLE_LIMIT = 15
ERROR_LIMIT = 5


def is_given(value: Any) -> bool:
	return str(value or "").strip().upper() in {"Y", "YES", "1"}


def trans_rank(value: Any) -> tuple[int, int, str]:
	text = _clean_oracle_num(value)
	if text.isdigit():
		return (0, int(text), text)
	return (1, 0, text)


def keep_earliest(docs: list[tuple[str, str]]) -> list[str]:
	"""Names to delete. ``docs`` items are ``(name, creation)``."""
	if len(docs) < 2:
		return []
	ordered = sorted(docs, key=lambda row: (row[1], row[0]))
	return [name for name, _creation in ordered[1:]]


def latest_assessment(rows: list[tuple[str, str]]) -> dict[str, str]:
	"""``(admission, trans_num)`` -> the highest trans number for that admission."""
	chosen: dict[str, str] = {}
	for admission, trans_num in rows:
		if not admission or not trans_num:
			continue
		current = chosen.get(admission)
		if current is None or trans_rank(trans_num) >= trans_rank(current):
			chosen[admission] = trans_num
	return chosen


def _map_row(raw: dict, header_map: dict[str, str]) -> dict:
	mapped: dict[str, Any] = {}
	for name, value in (raw or {}).items():
		column = str(name or "").strip().upper()
		mapped[header_map.get(column, column.lower())] = value
	return mapped


class _Spec:
	def __init__(self, slug: str, title: str, table: str, key_column: str, scan: Callable, create: Callable):
		self.slug = slug
		self.title = title
		self.table = table
		self.key_column = key_column
		self.scan = scan
		self.create = create
		self.tables = [table]
		self.progress_key = f"healthcare:care_record_reconcile:{slug}:progress"
		self.work_key = f"healthcare:care_record_reconcile:{slug}:work"
		self.lock_key = f"healthcare:care_record_reconcile:{slug}:lock"


def _set_progress(spec: _Spec, progress: dict) -> None:
	progress["updated_at"] = str(now_datetime())
	frappe.cache().set_value(spec.progress_key, progress, expires_in_sec=PROGRESS_TTL)


def _load_progress(spec: _Spec) -> dict:
	return frappe.cache().get_value(spec.progress_key) or {}


def _set_work(spec: _Spec, work: dict) -> None:
	frappe.cache().set_value(spec.work_key, work, expires_in_sec=PROGRESS_TTL)


def _load_work(spec: _Spec) -> dict:
	return frappe.cache().get_value(spec.work_key) or {}


def _lock_name(spec: _Spec) -> str:
	db_name = (frappe.local.conf or {}).get("db_name") or frappe.local.site
	return f"{db_name}|{spec.lock_key}"


def _acquire_lock(spec: _Spec) -> str | None:
	token = frappe.generate_hash(length=12)
	if not frappe.cache().set(_lock_name(spec), token.encode(), nx=True, ex=LOCK_TTL):
		return None
	return token


def _owns_lock(spec: _Spec, token: str | None) -> bool:
	if not token:
		return False
	return (frappe.cache().get(_lock_name(spec)) or b"").decode() == token


def _release_lock(spec: _Spec) -> None:
	frappe.cache().delete(_lock_name(spec))


def _lock_held(spec: _Spec) -> bool:
	return bool(frappe.cache().get(_lock_name(spec)))


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


def _in_scope(links: list[str], scope: set[str] | None) -> bool:
	if scope is None:
		return True
	return bool(scope.intersection(links or []))


def _document_names(doctype: str) -> tuple[set[str], int]:
	keys: set[str] = set()
	total = 0
	after = ""
	while True:
		rows = frappe.db.sql(
			f"select name from `tab{doctype}` where name > %s order by name asc limit %s",
			(after, ERP_PAGE),
		)
		if not rows:
			break
		for (name,) in rows:
			after = name
			total += 1
			cleaned = _clean_oracle_num(name)
			if cleaned:
				keys.add(cleaned)
		if len(rows) < ERP_PAGE:
			break
	return keys, total


def _keyed_scan(table: str, key_column: str, link_columns: list[str], doctype: str, where: str) -> dict:
	rows = _query(
		f"select {', '.join([key_column, *link_columns])} from {oracle_schema()}.{table} where {where}"
	)
	oracle: dict[str, list[str]] = {}
	for row in rows or []:
		key = _clean_oracle_num(row.get(key_column))
		if not key or key in oracle:
			continue
		if key_column == "APP_NUM" and not _cell_text(row.get("APP_DATE")):
			continue
		links = []
		for column in link_columns:
			value = _clean_oracle_num(row.get(column))
			if value and value not in links:
				links.append(value)
		oracle[key] = links
	erp, erp_count = _document_names(doctype)
	return {
		"entries": [[key, oracle[key], key in erp] for key in sorted(oracle, key=_sort_key)],
		"erpnext_rows": erp_count,
		"duplicate_rows": [],
	}


def _scan_morse() -> dict:
	return _keyed_scan(
		"MORSE_FALL_SCALE_01",
		"TRANS_NUM",
		["PATIENT_NUM", "ADMISSION_NUM"],
		"Morse Fall Scale",
		"TRANS_NUM is not null",
	)


def _scan_appointments() -> dict:
	return _keyed_scan(
		"APPOINTMENTS_INFO_01",
		"APP_NUM",
		["PATIENT_NUM"],
		"Patient Appointment",
		"APP_NUM is not null",
	)


def _admission_lookup() -> dict[str, str]:
	lookup: dict[str, str] = {}
	rows = frappe.db.sql(
		"select name, ifnull(case_no, ''), ifnull(admission_no_old, '') from `tabInpatient Admission`"
	)
	for name, case_no, old in rows:
		for value in (name, case_no, old):
			cleaned = _clean_oracle_num(value)
			if cleaned and cleaned not in lookup:
				lookup[cleaned] = name
	return lookup


def _scan_assessments() -> dict:
	rows = _query(
		f"select TRANS_NUM, ADMISSION_NUM, ADMISSION_NUM_OLD from {oracle_schema()}.IP_PATIENT_ASSESSMENT "
		"where TRANS_NUM is not null"
	)
	lookup = _admission_lookup()
	grouped: dict[str, dict] = {}
	for row in rows or []:
		trans_num = _clean_oracle_num(row.get("TRANS_NUM"))
		raw_admission = _clean_oracle_num(row.get("ADMISSION_NUM"))
		raw_old = _clean_oracle_num(row.get("ADMISSION_NUM_OLD"))
		if not trans_num or not (raw_admission or raw_old):
			continue
		resolved = lookup.get(raw_admission) or lookup.get(raw_old) or ""
		identity = resolved or f"raw:{raw_admission or raw_old}"
		links = []
		for value in (resolved, raw_admission, raw_old):
			if value and value not in links:
				links.append(value)
		current = grouped.get(identity)
		if current is None or trans_rank(trans_num) >= trans_rank(current["trans"]):
			grouped[identity] = {"trans": trans_num, "links": links, "resolved": resolved}

	by_admission: dict[str, list[tuple[str, str]]] = {}
	total = 0
	after = ""
	while True:
		stored = frappe.db.sql(
			"""
			select name, ifnull(admission, ''), creation
			from `tabPatient Assessment`
			where docstatus != 2 and name > %s
			order by name asc
			limit %s
			""",
			(after, ERP_PAGE),
		)
		if not stored:
			break
		for name, admission, creation in stored:
			after = name
			total += 1
			admission = _clean_oracle_num(admission)
			if admission:
				by_admission.setdefault(admission, []).append((name, str(creation or "")))
		if len(stored) < ERP_PAGE:
			break

	entries = []
	duplicate_rows = []
	for item in grouped.values():
		docs = by_admission.get(item["resolved"], []) if item["resolved"] else []
		if docs:
			entries.append([item["trans"], item["links"], True])
			for name in keep_earliest(docs):
				duplicate_rows.append([name, item["links"]])
		else:
			entries.append([item["trans"], item["links"], False])
	return {"entries": entries, "erpnext_rows": total, "duplicate_rows": duplicate_rows}


MEDICINE_SHEET = "IP_ADMISSION_MEDICINE_SHEET"
MEDICINE_SHEET_23 = "IP_ADMISSION_MEDICINE_SHEET_23"
MEDICINE_TABLES = (MEDICINE_SHEET, MEDICINE_SHEET_23)


def medicine_given_index(rows: list[dict]) -> dict[str, list[str]]:
	"""Given doses keyed by sheet number. The first table wins a repeated number."""
	index: dict[str, list[str]] = {}
	for row in rows or []:
		if not is_given(row.get("GIVEN_YN")):
			continue
		key = _clean_oracle_num(row.get("TRANS_NUM"))
		if not key or key in index:
			continue
		links = []
		for column in ("PATIENT_NUM", "ADMISSION_NUM"):
			value = _clean_oracle_num(row.get(column))
			if value and value not in links:
				links.append(value)
		index[key] = links
	return index


def _ready_tables(tables: list[str]) -> list[str]:
	source = current_source()
	if source is None:
		return list(tables)
	return [table for table in tables if source.has_table(table)]


def _medicine_tables(include_sheet_23: int = 1) -> list[str]:
	"""Both given-dose tables. The checkbox is on the Medicine Given row, not this choice."""
	return list(MEDICINE_TABLES)


def _scan_medicine(include_sheet_23: int = 0) -> dict:
	oracle: dict[str, list[str]] = {}
	for table in _ready_tables(_medicine_tables(include_sheet_23)):
		rows = _query(
			f"select TRANS_NUM, ADMISSION_NUM, PATIENT_NUM, GIVEN_YN "
			f"from {oracle_schema()}.{table} where TRANS_NUM is not null"
		)
		for key, links in medicine_given_index(rows).items():
			oracle.setdefault(key, links)

	by_sheet: dict[str, list[tuple[str, str]]] = {}
	total = 0
	after = ""
	while True:
		stored = frappe.db.sql(
			"""
			select name, ifnull(ip_admission_medicine_sheet, ''), creation
			from `tabMedicine Given`
			where name > %s
			order by name asc
			limit %s
			""",
			(after, ERP_PAGE),
		)
		if not stored:
			break
		for name, sheet, creation in stored:
			after = name
			total += 1
			sheet = _clean_oracle_num(sheet)
			if sheet:
				by_sheet.setdefault(sheet, []).append((name, str(creation or "")))
		if len(stored) < ERP_PAGE:
			break

	entries = []
	duplicate_rows = []
	for key in sorted(oracle, key=_sort_key):
		docs = by_sheet.get(key) or []
		if docs:
			entries.append([key, oracle[key], True])
			for name in keep_earliest(docs):
				duplicate_rows.append([name, oracle[key]])
		else:
			entries.append([key, oracle[key], False])
	return {"entries": entries, "erpnext_rows": total, "duplicate_rows": duplicate_rows}


def _create_morse(raw: dict) -> str:
	row = _map_row(raw, MORSE_HEADER_MAP)
	trans_num = _clean_oracle_num(row.get("trans_num"))
	if not trans_num:
		return "skipped"
	row["trans_num"] = trans_num
	if frappe.db.exists("Morse Fall Scale", trans_num):
		return "exists"
	result = upsert_morse_fall_scale_from_row(row) or {}
	return "created" if result.get("status") == "created" else "skipped"


def _create_appointment(raw: dict) -> str:
	row = _map_row(raw, APPOINTMENT_HEADER_MAP)
	app_num = _clean_oracle_num(row.get("app_num"))
	if not app_num:
		return "skipped"
	row["app_num"] = app_num
	if frappe.db.exists("Patient Appointment", app_num):
		return "exists"
	result = upsert_patient_appointment_from_row(row) or {}
	return "created" if result.get("status") == "created" else "skipped"


def _create_assessment(raw: dict) -> str:
	row = _map_row(raw, ASSESSMENT_HEADER_MAP)
	trans_num = _clean_oracle_num(row.get("trans_num"))
	admission_num = _clean_oracle_num(row.get("admission_num") or row.get("admission_num_old"))
	if not trans_num or not admission_num:
		return "skipped"
	row["trans_num"] = trans_num
	row["admission_num"] = _clean_oracle_num(row.get("admission_num"))
	row["admission_num_old"] = _clean_oracle_num(row.get("admission_num_old"))
	admission = _resolve_inpatient_admission(admission_num)
	if not admission:
		return "skipped"
	existing = frappe.db.sql(
		"""
		select name from `tabPatient Assessment`
		where admission = %s and docstatus != 2
		limit 1
		""",
		admission,
	)
	if existing:
		return "exists"
	result = upsert_patient_assessment_from_row(row) or {}
	return "created" if result.get("status") == "created" else "skipped"


def _create_medicine(raw: dict) -> str:
	from healthcare.api.data_migration_jobs import (
		_get_admission_detail_for_sheet_row,
		_normalize_time_value,
		_resolve_item_00_01_name,
		_resolve_item_code_for_given_tables,
	)

	row = _map_row(raw, MEDICINE_HEADER_MAP)
	trans_num = _clean_oracle_num(row.get("trans_num"))
	if not trans_num.isdigit() or not is_given(row.get("given_yn")):
		return "skipped"
	from_sheet_23 = raw.get("_source_table") == MEDICINE_SHEET_23
	if frappe.db.exists("Medicine Given", {"ip_admission_medicine_sheet": trans_num}):
		if from_sheet_23:
			_tick_sheet_23_given(trans_num)
		return "exists"

	sheet_name = frappe.db.exists("IP Admission Medicine Sheet", trans_num)
	if not sheet_name:
		given_dt = _parse_datetime(row.get("given_date"))
		doc = frappe.get_doc(
			{
				"doctype": "IP Admission Medicine Sheet",
				"trans_num": cint(trans_num),
				"medi_trans_num": cint(row.get("medi_trans_num") or 0) or None,
				"admission_num": _clean_oracle_num(row.get("admission_num")) or None,
				"patient_num": _clean_oracle_num(row.get("patient_num")) or None,
				"given_yn": "Y",
				"given_date": given_dt,
				"remarks": _cell_text(row.get("remarks")) or None,
				"admission_num_old": cint(row.get("admission_num_old") or 0) or None,
			}
		)
		doc.flags.ignore_validate = True
		doc.flags.ignore_mandatory = True
		doc.flags.ignore_links = True
		doc.insert(ignore_permissions=True)
		sheet_name = doc.name

	admission_num = _clean_oracle_num(row.get("admission_num"))
	patient_num = _clean_oracle_num(row.get("patient_num"))
	admission = _resolve_inpatient_admission(admission_num, patient_num) if admission_num else None
	ad_detail = _get_admission_detail_for_sheet_row(admission or admission_num, patient_num)
	if not ad_detail:
		return "skipped"
	if any((child.ip_admission_medicine_sheet or "") == sheet_name for child in (ad_detail.get("table_yrwe") or [])):
		if from_sheet_23:
			_tick_sheet_23_given(sheet_name)
		return "exists"

	old_code = _resolve_item_00_01_name(row.get("medi_trans_num"))
	old_name = frappe.db.get_value("ITEM_00_01", old_code, "item_nam") if old_code else None
	item_code = _resolve_item_code_for_given_tables(row.get("medi_trans_num"))
	item_name = (
		frappe.db.get_value("Item", item_code, "item_name")
		if item_code
		else (old_name or _clean_oracle_num(row.get("medi_trans_num")))
	)
	given_dt = _parse_datetime(row.get("given_date"))
	ad_detail.append(
		"table_yrwe",
		{
			"date": getdate(given_dt) if given_dt else nowdate(),
			"time": _normalize_time_value(given_dt if given_dt else "00:00:00"),
			"medicine_code": item_code,
			"medicine_name": item_name,
			"qty": 0,
			"dose_notes": _cell_text(row.get("remarks")) or None,
			"user": frappe.session.user,
			"old_medicine_code": old_code,
			"old_medicine_name": old_name or item_name,
			"ip_admission_medicine_sheet": sheet_name,
			"ip_admission_medicine_sheet_23": 1 if from_sheet_23 else 0,
		},
	)
	ad_detail.flags.ignore_mandatory = True
	ad_detail.flags.ignore_links = True
	ad_detail.save(ignore_permissions=True)
	return "created"


def _load_rows(spec: _Spec, keys: list[str], tables: list[str] | None = None) -> dict[str, dict]:
	if not keys:
		return {}
	found: dict[str, dict] = {}
	where = f"{spec.key_column} in ({_in_clause(keys)})"
	for table in _ready_tables(tables or spec.tables):
		for raw in _fetch_rows(table, where=where) or []:
			key = _clean_oracle_num(raw.get(spec.key_column))
			if key and key not in found:
				tagged = dict(raw)
				tagged["_source_table"] = table
				found[key] = tagged
	return found


def _tick_sheet_23_given(sheet_name: str) -> None:
	"""Tick IP_ADMISSION_MEDICINE_SHEET_23 on doses that came from that table."""
	if not sheet_name or not frappe.db.has_column("Medicine Given", "ip_admission_medicine_sheet_23"):
		return
	frappe.db.sql(
		"""
		update `tabMedicine Given`
		set ip_admission_medicine_sheet_23 = 1
		where ip_admission_medicine_sheet = %s
		  and ifnull(ip_admission_medicine_sheet_23, 0) = 0
		""",
		sheet_name,
	)


def _source_tables(spec: _Spec, files, include_sheet_23: int = 0) -> list[str]:
	"""Live reads the selected tables. An Excel run reads the workbooks that were uploaded."""
	tables = list(spec.tables)
	if spec.slug == "medicine_given":
		tables = _medicine_tables(include_sheet_23)
	if not files:
		return tables
	uploaded = {str(entry.get("table") or "").strip().upper() for entry in normalize_files(files)}
	chosen = [table for table in tables if table in uploaded]
	if not chosen:
		frappe.throw(
			_("Upload {0}.").format(" or ".join(tables)),
			title=_("Oracle Excel Upload"),
		)
	return chosen


def _scan_for(spec: _Spec, include_sheet_23: int = 0) -> dict:
	if spec.slug == "medicine_given":
		return spec.scan(include_sheet_23)
	return spec.scan()


def _apply_scope(scan: dict, patient: str) -> dict:
	scope = _scope_keys(patient)
	entries = list(scan.get("entries") or [])
	duplicate_rows = list(scan.get("duplicate_rows") or [])
	if scope is not None:
		entries = [row for row in entries if _in_scope(row[1], scope)]
		duplicate_rows = [row for row in duplicate_rows if _in_scope(row[1], scope)]
	return {
		"oracle_rows": len(entries),
		"erpnext_rows": scan["erpnext_rows"],
		"matched": sum(1 for _key, _links, present in entries if present),
		"missing": [[key, links] for key, links, present in entries if not present],
		"duplicates": [name for name, _links in duplicate_rows],
	}


MORSE = _Spec("morse_fall_scale", "Morse Fall Scale", "MORSE_FALL_SCALE_01", "TRANS_NUM", _scan_morse, _create_morse)
ASSESSMENT = _Spec(
	"patient_assessment",
	"Patient Assessment",
	"IP_PATIENT_ASSESSMENT",
	"TRANS_NUM",
	_scan_assessments,
	_create_assessment,
)
MEDICINE = _Spec(
	"medicine_given",
	"Medicine Given",
	"IP_ADMISSION_MEDICINE_SHEET",
	"TRANS_NUM",
	_scan_medicine,
	_create_medicine,
)
MEDICINE.tables = list(MEDICINE_TABLES)
APPOINTMENT = _Spec(
	"appointment",
	"Appointments",
	"APPOINTMENTS_INFO_01",
	"APP_NUM",
	_scan_appointments,
	_create_appointment,
)


def _samples(items: list[list]) -> list[dict]:
	samples = []
	for key, links in items[:10]:
		sample = {"key": key, "text": "create"}
		if links:
			sample["patient"] = links[0]
		samples.append(sample)
	return samples


def _preview(spec: _Spec, patient: str = "", files=None, include_sheet_23: int = 0) -> dict[str, Any]:
	_require_admin()
	files = normalize_files(files)
	tables = _source_tables(spec, files, include_sheet_23)
	with excel_source(files, tables=tables) as source:
		scan = _apply_scope(_scan_for(spec, include_sheet_23), patient)
		result = {
			"ok": True,
			"as_of": str(nowdate()),
			"mode": "patient" if (patient or "").strip() else "site",
			"include_sheet_23": cint(include_sheet_23),
			"oracle_table": " and ".join(f"{oracle_schema()}.{table}" for table in tables),
			"oracle_rows": scan["oracle_rows"],
			"erpnext_rows": scan["erpnext_rows"],
			"matched": scan["matched"],
			"missing_total": len(scan["missing"]),
			"duplicates": len(scan["duplicates"]),
			"samples": _samples(scan["missing"]),
		}
		if source is not None:
			loaded = [source.describe(table) for table in _ready_tables(tables)]
			if loaded:
				result["oracle_table"] = " and ".join(loaded)
	result["in_sync"] = not cint(result["missing_total"]) and not cint(result["duplicates"])
	return result


def _summary(spec: _Spec, progress: dict) -> str:
	lines = [
		_("{0} reconcile finished.").format(spec.title),
		"",
		_("Oracle {0}").format(" and ".join(progress.get("tables") or spec.tables)),
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


def _queue_next(spec: _Spec, token: str, progress: dict, files) -> None:
	frappe.enqueue(
		f"healthcare.api.care_record_reconcile.run_{spec.slug}_reconcile",
		queue="long",
		timeout=7200,
		resume=1,
		token=token,
		dry_run=cint(progress.get("dry_run")),
		patient=progress.get("patient") or "",
		include_sheet_23=cint(progress.get("include_sheet_23")),
		files=files,
	)


def _delete_duplicate(spec: _Spec, name: str) -> None:
	doctype = "Patient Assessment" if spec.slug == "patient_assessment" else "Medicine Given"
	if frappe.db.exists(doctype, name):
		frappe.delete_doc(doctype, name, ignore_permissions=True, force=1)


def _run(
	spec: _Spec, token: str, resume: int, dry_run: int, patient: str, files, include_sheet_23: int = 0
) -> dict[str, Any]:
	started = time.monotonic()
	if cint(resume):
		progress = _load_progress(spec) or {}
		work = _load_work(spec) or {}
		include_sheet_23 = cint(progress.get("include_sheet_23"))
	else:
		include_sheet_23 = cint(include_sheet_23)
		scan = _apply_scope(_scan_for(spec, include_sheet_23), patient)
		progress = {
			"job_key": spec.slug,
			"state": "running",
			"dry_run": cint(dry_run),
			"patient": patient or "",
			"include_sheet_23": include_sheet_23,
			"tables": _source_tables(spec, files, include_sheet_23),
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
		work = {"duplicates": scan["duplicates"], "missing": scan["missing"], "duplicate_offset": 0, "missing_offset": 0}
		_set_work(spec, work)
		_set_progress(spec, progress)

	def overtime(done: int) -> bool:
		if time.monotonic() - started <= TIME_BUDGET:
			return False
		progress["processed"] = done
		progress["state"] = "running"
		progress["message"] = _("Removed {0} duplicates, created {1}. Continuing.").format(
			cint(progress.get("duplicates_removed")), cint(progress.get("created"))
		)
		_set_work(spec, work)
		_set_progress(spec, progress)
		_queue_next(spec, token, progress, files)
		return True

	duplicates = work.get("duplicates") or []
	offset = cint(work.get("duplicate_offset"))
	while offset < len(duplicates):
		if overtime(offset + cint(work.get("missing_offset"))):
			return {"state": "queued", "handed_over": True, "progress": progress}
		chunk = duplicates[offset : offset + IMPORT_CHUNK]
		for name in chunk:
			if cint(dry_run):
				progress["duplicates_removed"] = cint(progress.get("duplicates_removed")) + 1
				continue
			try:
				frappe.db.savepoint("care_one")
				_delete_duplicate(spec, name)
				progress["duplicates_removed"] = cint(progress.get("duplicates_removed")) + 1
			except Exception:
				frappe.db.rollback(save_point="care_one")
				_record_error(progress, f"{name}: {frappe.get_traceback()}")
		offset += len(chunk)
		work["duplicate_offset"] = offset
		progress["processed"] = offset
		_set_work(spec, work)
		_set_progress(spec, progress)
		frappe.db.commit()

	missing = work.get("missing") or []
	missing_offset = cint(work.get("missing_offset"))
	while missing_offset < len(missing):
		if overtime(len(duplicates) + missing_offset):
			return {"state": "queued", "handed_over": True, "progress": progress}
		chunk = missing[missing_offset : missing_offset + IMPORT_CHUNK]
		keys = [key for key, _links in chunk]
		rows = {} if cint(dry_run) else _load_rows(spec, keys, progress.get("tables"))
		for key, _links in chunk:
			if cint(dry_run):
				progress["created"] = cint(progress.get("created")) + 1
				_record_sample(progress, f"{key} · dry run")
				continue
			raw = rows.get(key)
			if not raw:
				progress["skipped"] = cint(progress.get("skipped")) + 1
				continue
			try:
				frappe.db.savepoint("care_one")
				status = spec.create(raw)
				if status == "created":
					progress["created"] = cint(progress.get("created")) + 1
					_record_sample(progress, f"{key} · created")
				else:
					progress["skipped"] = cint(progress.get("skipped")) + 1
			except Exception:
				frappe.db.rollback(save_point="care_one")
				_record_error(progress, f"{key}: {frappe.get_traceback()}")
		missing_offset += len(chunk)
		work["missing_offset"] = missing_offset
		progress["processed"] = len(duplicates) + missing_offset
		progress["message"] = _("{0} of {1}").format(progress["processed"], progress.get("total"))
		_set_work(spec, work)
		_set_progress(spec, progress)
		frappe.db.commit()

	progress["processed"] = cint(progress.get("total"))
	progress["state"] = "finished"
	progress["finished_at"] = str(now_datetime())
	progress["message"] = _summary(spec, progress)
	_set_progress(spec, progress)
	return {"state": "finished", "progress": progress}


def _start(spec: _Spec, patient: str = "", dry_run: int = 0, files=None, include_sheet_23: int = 0):
	_require_admin()
	files = normalize_files(files)
	if _lock_held(spec):
		return {
			"queued": False,
			"running": True,
			"message": _("This reconciliation is already running."),
			"status": _load_progress(spec),
		}
	progress = {
		"job_key": spec.slug,
		"state": "queued",
		"dry_run": cint(dry_run),
		"patient": patient or "",
		"include_sheet_23": cint(include_sheet_23),
		"processed": 0,
		"total": 0,
		"message": (
			_("Queued. The uploaded Excel export is read in the background.")
			if files
			else _("Queued. Oracle is read in the background.")
		),
	}
	_set_progress(spec, progress)
	frappe.enqueue(
		f"healthcare.api.care_record_reconcile.run_{spec.slug}_reconcile",
		queue="long",
		timeout=7200,
		dry_run=cint(dry_run),
		patient=patient or "",
		include_sheet_23=cint(include_sheet_23),
		files=files,
	)
	return {"queued": True, "job_key": spec.slug, "status": progress}


def _status(spec: _Spec) -> dict[str, Any]:
	_require_admin()
	return _load_progress(spec) or {"job_key": spec.slug, "state": "idle", "processed": 0, "total": 0}


def _execute(spec: _Spec, resume=0, token=None, dry_run=0, patient="", files=None, include_sheet_23=0):
	files = normalize_files(files)
	if cint(resume):
		include_sheet_23 = cint((_load_progress(spec) or {}).get("include_sheet_23"))
	if cint(resume):
		if not _owns_lock(spec, token):
			return {"state": "skipped", "message": _("This reconciliation run was replaced by a newer one.")}
	else:
		token = _acquire_lock(spec)
		if not token:
			return {"state": "running", "message": _("This reconciliation is already running.")}

	outcome: dict[str, Any] = {}
	try:
		with excel_source(files, tables=_source_tables(spec, files, include_sheet_23)):
			outcome = _run(
				spec, token, cint(resume), cint(dry_run), patient or "", files, cint(include_sheet_23)
			)
	except Exception:
		progress = _load_progress(spec) or {"job_key": spec.slug}
		progress["state"] = "failed"
		progress["message"] = frappe.get_traceback()
		_record_error(progress, frappe.get_traceback())
		_set_progress(spec, progress)
		frappe.log_error(title=f"{spec.title} reconciliation failed")
		raise
	finally:
		if not outcome.get("handed_over"):
			_release_lock(spec)
	return outcome


def _bind(spec: _Spec):
	@frappe.whitelist()
	def preview(patient: str = "", limit: int = 0, files=None, include_sheet_23: int = 0):
		return _preview(spec, patient=patient, files=files, include_sheet_23=include_sheet_23)

	@frappe.whitelist()
	def start(patient: str = "", limit: int = 0, dry_run: int = 0, files=None, include_sheet_23: int = 0):
		return _start(spec, patient=patient, dry_run=dry_run, files=files, include_sheet_23=include_sheet_23)

	@frappe.whitelist()
	def status():
		return _status(spec)

	def run(
		resume: int = 0,
		token: str | None = None,
		dry_run: int = 0,
		patient: str = "",
		files=None,
		limit: int = 0,
		include_sheet_23: int = 0,
	):
		return _execute(spec, resume, token, dry_run, patient, files, include_sheet_23)

	return preview, start, status, run


(
	preview_morse_fall_scale_reconcile,
	start_morse_fall_scale_reconcile,
	get_morse_fall_scale_reconcile_status,
	run_morse_fall_scale_reconcile,
) = _bind(MORSE)
(
	preview_patient_assessment_reconcile,
	start_patient_assessment_reconcile,
	get_patient_assessment_reconcile_status,
	run_patient_assessment_reconcile,
) = _bind(ASSESSMENT)
(
	preview_medicine_given_reconcile,
	start_medicine_given_reconcile,
	get_medicine_given_reconcile_status,
	run_medicine_given_reconcile,
) = _bind(MEDICINE)
(
	preview_appointment_reconcile,
	start_appointment_reconcile,
	get_appointment_reconcile_status,
	run_appointment_reconcile,
) = _bind(APPOINTMENT)
