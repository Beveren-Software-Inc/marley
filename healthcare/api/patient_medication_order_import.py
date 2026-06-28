"""Import legacy Oracle Patient Medication Order rows into Patient Medication Order."""

from __future__ import annotations

import csv
import json
import re
from datetime import date, datetime, time
from typing import Any

import frappe
from frappe import _
from frappe.utils import get_datetime, getdate, get_time, nowdate

from healthcare.api.utils.api_utility import get_next_transaction_number
from healthcare.api.visit_diagnosis_sync import _resolve_inpatient_admission

PMO_IMPORT_BATCH_SIZE = 25
CACHE_KEYS = {
	"file_url": "healthcare:data_migration:pmo_import:file_url",
	"admissions": "healthcare:data_migration:pmo_import:admissions",
	"grouped": "healthcare:data_migration:pmo_import:grouped",
}
CACHE_TTL = 7200

ORACLE_HEADER_MAP = {
	"ADMISSION_NUM": "admission_num",
	"ADMISSION NO": "admission_num",
	"ADMISSION": "admission_num",
	"CONTEXT_TYPE": "context_type",
	"CONTEXT TYPE": "context_type",
	"MEDICINE_NUM": "medicine_num",
	"MEDICINE NUM": "medicine_num",
	"MEDICINE": "medicine_num",
	"DOSE_NOTES": "dose_notes",
	"DOSE NOTES": "dose_notes",
	"DC": "dc",
	"REDUNDANCY_TYPE": "redundancy_type",
	"REDUNDANCY TYPE": "redundancy_type",
	"USERNAME": "username",
	"USER NAME": "username",
	"TRANS_DATE": "trans_date",
	"TRANS DATE": "trans_date",
	"TRANS_TIME": "trans_time",
	"TRANS TIME": "trans_time",
	"STOP_BY": "stop_by",
	"STOP BY": "stop_by",
	"STOP_DATE": "stop_date",
	"STOP DATE": "stop_date",
	"STOP_REASON": "stop_reason",
	"STOP REASONS": "stop_reason",
	"STOP_REASONS": "stop_reason",
	"CR_DATE": "cr_date",
	"CR TIME": "cr_time",
	"CR_TIME": "cr_time",
	"TRANS_TYPE": "trans_type",
	"TRANS TYPE": "trans_type",
	"FREQUENCY": "frequency",
	"DURATION": "duration",
	"STRENGTH": "strength",
	"DURATION_TYPE": "duration_type",
	"DURATION TYPE": "duration_type",
	"START_DATE": "start_date",
	"START DATE": "start_date",
	"END_DATE": "end_date",
	"END DATE": "end_date",
	"BRANCH": "branch",
	"BRANCH_NUM": "branch",
	"EFFECTIVE_STATUS": "effective_status",
	"EFFECTIVE": "effective_status",
	"EFFECTIVE STATUS": "effective_status",
	"OLD_ADMISSION": "old_admission_no",
	"OLD ADMISSION": "old_admission_no",
	"OLD_ADMISSION_NO": "old_admission_no",
	"ADMISSION_NUM_OLD": "old_admission_no",
	"TRANS_NO": "trans_no",
	"TRANS_NUM": "trans_no",
	"TRANS NO": "trans_no",
	"IP_ADMISSION_REC_ID": "ip_admission_rec_id",
	"CR_ID": "cr_id",
	"CR ID": "cr_id",
	"UP_ID": "up_id",
	"UP ID": "up_id",
	"UP_DATE": "up_date",
	"UP DATE": "up_date",
	"ROUTE": "route",
	"UNIT": "unit",
	"QTY": "qty",
	"QUANTITY": "qty",
	"USER_NAME": "username",
	"PATIENT_NUM": "patient_num",
	"PATIENT": "patient_num",
	"COST CENTER": "branch",
	"ADMISSION NO OLD": "old_admission_no",
}

MEDICINE_SHEET_MARKER_FIELDS = frozenset({"medicine_num", "dose_notes", "trans_no"})


def _require_admin() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def _clean_oracle_num(value: Any) -> str:
	if value is None or value == "":
		return ""
	if isinstance(value, float) and value == int(value):
		return str(int(value))
	if isinstance(value, int):
		return str(value)
	text = str(value).strip()
	if text.endswith(".0"):
		text = text[:-2]
	return text


def _cell_text(value: Any) -> str:
	"""Coerce Excel/Oracle cell values (including floats) to a stripped string."""
	if value is None:
		return ""
	if isinstance(value, float) and value == int(value):
		return str(int(value))
	if isinstance(value, int):
		return str(value)
	return str(value).strip()


def _safe_savepoint_name(prefix: str, key: str) -> str:
	"""MariaDB savepoint names cannot contain bare minus signs (e.g. pmo_import_-1)."""
	safe = re.sub(r"[^a-zA-Z0-9_]", "_", f"{prefix}_{key}")
	if not safe or safe[0].isdigit():
		safe = f"sp_{safe}"
	return safe[:60]


def _prepare_import_row(row: dict[str, Any]) -> dict[str, Any] | None:
	admission_num = _clean_oracle_num(row.get("admission_num"))
	if not admission_num:
		return None
	row["admission_num"] = admission_num
	row["medicine_num"] = _clean_oracle_num(row.get("medicine_num"))
	row["trans_no"] = _clean_oracle_num(row.get("trans_no"))
	old_admission_no = _clean_oracle_num(row.get("old_admission_no"))
	row["old_admission_no"] = old_admission_no or None
	return row


def _normalize_header(value: Any) -> str:
	return ORACLE_HEADER_MAP.get(str(value or "").strip().upper(), str(value or "").strip().lower())


def _parse_date_value(value: Any):
	if value in (None, ""):
		return None
	if isinstance(value, datetime):
		return getdate(value)
	if isinstance(value, date):
		return value
	text = str(value).strip()
	if not text:
		return None
	try:
		return getdate(text)
	except Exception:
		return None


def _format_cr_datetime(cr_date: Any, cr_time: Any) -> str:
	date_part = ""
	if cr_date not in (None, ""):
		if isinstance(cr_date, datetime):
			date_part = cr_date.strftime("%Y-%m-%d %H:%M:%S")
		elif isinstance(cr_date, date):
			date_part = cr_date.strftime("%Y-%m-%d")
		else:
			try:
				date_part = get_datetime(str(cr_date).strip()).strftime("%Y-%m-%d %H:%M:%S")
			except Exception:
				date_part = str(cr_date).strip()
	time_part = ""
	if cr_time not in (None, ""):
		if isinstance(cr_time, time):
			time_part = cr_time.strftime("%H:%M:%S")
		else:
			time_part = str(cr_time).strip()
	if date_part and time_part:
		if " " in date_part:
			return date_part
		return f"{date_part} {time_part}"
	return date_part or time_part


def _normalize_time_value(raw_time: Any) -> str:
	if raw_time in (None, ""):
		return "00:00:00"
	try:
		return str(get_time(str(raw_time).strip()))
	except Exception:
		return str(raw_time).strip() or "00:00:00"


def _file_path(file_url: str) -> str:
	if not file_url:
		frappe.throw(_("File URL is required."))
	file_name = frappe.db.get_value("File", {"file_url": file_url}, "name")
	if not file_name:
		frappe.throw(_("Uploaded file was not found. Please upload the file again."))
	from frappe.utils.file_manager import get_file_path

	return get_file_path(file_name)


def _row_dict_from_values(headers: list[str], raw: tuple | list) -> dict[str, Any]:
	row: dict[str, Any] = {}
	for idx, key in enumerate(headers):
		if not key or idx >= len(raw):
			continue
		row[key] = raw[idx]
	return row


def _is_import_log_file(headers: list[str]) -> bool:
	normalized = {str(h or "").strip().lower() for h in headers}
	return {"row numbers", "status", "message"}.issubset(normalized)


def _is_medicine_import_sheet(headers: list[str]) -> bool:
	normalized = {_normalize_header(h) for h in headers if h is not None and str(h).strip()}
	return bool(MEDICINE_SHEET_MARKER_FIELDS.intersection(normalized))


def _parse_csv_rows(file_url: str) -> tuple[list[dict], int]:
	path = _file_path(file_url)
	rows: list[dict] = []
	invalid_admission_rows = 0
	with open(path, newline="", encoding="utf-8-sig") as handle:
		reader = csv.reader(handle)
		try:
			header_row = next(reader)
		except StopIteration:
			return [], 0
		headers = [_normalize_header(h) for h in header_row]
		if _is_import_log_file(header_row):
			frappe.throw(
				_(
					"This file looks like an import result log (Row Numbers / Status / Message), not Oracle source data. Upload the original export with columns such as ADMISSION_NUM, MEDICINE_NUM, TRANS_DATE."
				)
			)
		for raw in reader:
			if not raw or all(cell is None or str(cell).strip() == "" for cell in raw):
				continue
			row = _prepare_import_row(_row_dict_from_values(headers, raw))
			if row is None:
				invalid_admission_rows += 1
				continue
			rows.append(row)
	return rows, invalid_admission_rows


def _parse_excel_rows(file_url: str) -> tuple[list[dict], int]:
	try:
		import openpyxl
	except ImportError:
		frappe.throw(
			_("openpyxl is required to read Excel files. Install it in the bench environment: pip install openpyxl")
		)

	path = _file_path(file_url)
	wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
	parsed: list[dict] = []
	invalid_admission_rows = 0

	sheets_with_medicine_data = 0
	for sheet_index, ws in enumerate(wb.worksheets):
		rows_iter = ws.iter_rows(values_only=True)
		try:
			header_row = next(rows_iter)
		except StopIteration:
			continue
		if not header_row or not any(cell is not None and str(cell).strip() for cell in header_row):
			continue
		if _is_import_log_file(header_row):
			if sheet_index == 0 and len(wb.worksheets) == 1:
				wb.close()
				frappe.throw(
					_(
						"This file looks like an import result log (Row Numbers / Status / Message), not Oracle source data. Upload the original export with columns such as ADMISSION_NUM, MEDICINE_NUM, TRANS_DATE."
					)
				)
			continue
		if not _is_medicine_import_sheet(header_row):
			continue
		sheets_with_medicine_data += 1
		headers = [_normalize_header(h) for h in header_row]
		for raw in rows_iter:
			if not raw or all(cell is None or str(cell).strip() == "" for cell in raw):
				continue
			row = _prepare_import_row(_row_dict_from_values(headers, raw))
			if row is None:
				invalid_admission_rows += 1
				continue
			parsed.append(row)

	wb.close()
	if not parsed and sheets_with_medicine_data == 0:
		frappe.throw(
			_(
				"No medicine prescription sheets found. Expected columns such as ADMISSION_NUM, MEDICINE_NUM, TRANS_NUM, DOSE_NOTES on at least one worksheet (both sheets are read when present). Admission attribute exports (e.g. ATT_NOTES) are not medicine prescriptions."
			)
		)
	return parsed, invalid_admission_rows


def _parse_file_rows(file_url: str) -> tuple[list[dict], int]:
	lower = (file_url or "").lower()
	if lower.endswith(".csv"):
		return _parse_csv_rows(file_url)
	return _parse_excel_rows(file_url)


def _group_rows_by_admission(rows: list[dict]) -> tuple[dict[str, list[dict]], list[dict]]:
	grouped: dict[str, list[dict]] = {}
	unresolved: list[dict] = []
	for row in rows:
		key = row.get("admission_num") or ""
		if not key:
			unresolved.append(row)
			continue
		grouped.setdefault(key, []).append(row)
	return grouped, unresolved


def _resolve_cost_center(branch_label: str | None) -> str | None:
	text = (branch_label or "").strip()
	if not text:
		return None
	for doctype in ("Cost Center", "Branch"):
		if frappe.db.exists(doctype, text):
			return text
		name = frappe.db.get_value(doctype, {"cost_center_name": text}, "name")
		if name:
			return name
	return None


def _resolve_item_00_01_name(code_value: Any) -> str | None:
	code_str = _clean_oracle_num(code_value)
	if not code_str:
		return None
	if frappe.db.exists("ITEM_00_01", code_str):
		return code_str
	stripped = code_str.lstrip("0")
	if stripped and stripped != code_str and frappe.db.exists("ITEM_00_01", stripped):
		return stripped
	return None


def _normalize_oracle_medicine_num(value: Any) -> str | None:
	"""Strip Oracle zero-padding from medicine numbers when ITEM_00_01 link is missing."""
	code_str = _clean_oracle_num(value)
	if not code_str:
		return None
	if code_str.isdigit():
		if set(code_str) == {"0"}:
			return None
		return code_str.lstrip("0") or None
	return code_str


def _lookup_medication_name(medicine_num: str) -> str | None:
	code = _resolve_item_00_01_name(medicine_num)
	if not code:
		return None
	return frappe.db.get_value("ITEM_00_01", code, "item_nam")


def _ensure_prescription_frequency_label(frequency_label: str | None) -> str | None:
	label = _cell_text(frequency_label)
	if not label:
		return None
	from healthcare.api.common import _ensure_prescription_frequency_exists

	_ensure_prescription_frequency_exists(label)
	return label


def _resolve_ip_admission_medicine_link(trans_no: str | None) -> str | None:
	trans_no = _clean_oracle_num(trans_no)
	if not trans_no:
		return None
	if frappe.db.exists("IP Admission Medicine", trans_no):
		return trans_no
	return frappe.db.get_value("IP Admission Medicine", {"trans_no": trans_no}, "name")


def _format_legacy_datetime(value: Any) -> str | None:
	if value in (None, ""):
		return None
	if isinstance(value, datetime):
		return value.strftime("%Y-%m-%d %H:%M:%S")
	if isinstance(value, date):
		return value.strftime("%Y-%m-%d")
	text = str(value).strip()
	if not text:
		return None
	try:
		return get_datetime(text).strftime("%Y-%m-%d %H:%M:%S")
	except Exception:
		return text


def _map_care_context(context_type: str | None) -> str:
	text = (context_type or "").strip().lower()
	if "visit" in text:
		return "Patient Visit"
	return "Inpatient Admission"


def _patient_display_fields(patient: str) -> dict:
	if not patient or not frappe.db.exists("Patient", patient):
		return {}
	patient_doc = frappe.get_doc("Patient", patient)
	fields = {
		"patient_name": patient_doc.patient_name,
		"nationality": getattr(patient_doc, "nationality", None),
	}
	if patient_doc.dob:
		age_str = patient_doc.get_age()
		if age_str:
			fields["patient_age"] = age_str
	return fields


def _existing_pmo_for_admission(admission_name: str) -> str | None:
	return frappe.db.get_value(
		"Patient Medication Order",
		{
			"inpatient_record": admission_name,
			"care_context": "Inpatient Admission",
			"docstatus": ["!=", 2],
		},
		"name",
		order_by="modified desc",
	)


def _line_signature(row: dict) -> str:
	return "|".join(
		[
			_cell_text(row.get("trans_no")),
			_cell_text(row.get("medicine_num")),
			_cell_text(row.get("start_date")),
			_cell_text(row.get("trans_date")),
			_cell_text(row.get("cr_id")),
		]
	)


def _existing_child_signatures(doc) -> set[str]:
	signatures: set[str] = set()
	for child in doc.get("medication_orders") or []:
		signatures.add(
			"|".join(
				[
					(child.reference_no or "").strip(),
					(child.medicine_no or "").strip(),
					str(child.date or ""),
					str(child.trans_date or ""),
					(child.cr_id or "").strip(),
				]
			)
		)
	return signatures


def _append_child_line(doc, row: dict) -> None:
	medicine_num = row.get("medicine_num") or ""
	item_code = _resolve_item_00_01_name(medicine_num)
	medication_name = _lookup_medication_name(medicine_num)

	entry = doc.append("medication_orders", {})
	trans_no = row.get("trans_no") or ""
	entry.reference_no = trans_no or None
	ip_med_link = _resolve_ip_admission_medicine_link(trans_no)
	if ip_med_link:
		entry.trans_num = ip_med_link

	entry.medicine_no = item_code or _normalize_oracle_medicine_num(medicine_num)
	entry.old_medicine_code = item_code
	entry.old_medicine_name = medication_name
	entry.medication = medication_name

	dose_notes = _cell_text(row.get("dose_notes"))
	entry.dosage = dose_notes or None

	entry.dc = _cell_text(row.get("dc")) or None
	entry.redundancy_type = _cell_text(row.get("redundancy_type")) or None
	entry.username = _cell_text(row.get("username")) or None

	frequency_label = _ensure_prescription_frequency_label(row.get("frequency"))
	if frequency_label:
		entry.patient_frequency = frequency_label
	entry.written_frequency = _cell_text(row.get("frequency")) or None

	entry.duration = _cell_text(row.get("duration")) or None
	entry.trans_type = _cell_text(row.get("trans_type")) or None
	entry.date = _parse_date_value(row.get("start_date") or row.get("trans_date"))
	entry.end_date = _parse_date_value(row.get("end_date"))
	entry.trans_date = _parse_date_value(row.get("trans_date"))
	entry.time = _normalize_time_value(row.get("trans_time"))
	entry.stop_by = _cell_text(row.get("stop_by")) or None
	entry.stopped_date = _parse_date_value(row.get("stop_date"))
	entry.reason_stopped = _cell_text(row.get("stop_reason")) or None
	entry.cr_id = _clean_oracle_num(row.get("cr_id")) or None
	entry.cr_date = _format_cr_datetime(row.get("cr_date"), row.get("cr_time")) or _format_legacy_datetime(
		row.get("cr_date")
	)
	entry.up_id = _clean_oracle_num(row.get("up_id")) or None
	entry.up_date = _format_legacy_datetime(row.get("up_date"))
	entry.old_route = _cell_text(row.get("route")) or None
	entry.strength = _cell_text(row.get("strength")) or None
	entry.old_unit = _cell_text(row.get("unit")) or None
	qty = row.get("qty")
	if qty not in (None, ""):
		from frappe.utils import flt

		entry.quantity = flt(qty)
	entry.ip_admission_rec_id = _clean_oracle_num(row.get("ip_admission_rec_id")) or None
	entry.effective_status = _cell_text(row.get("effective_status")) or None
	entry.is_completed = 1

	stopped_reason = _cell_text(row.get("stop_reason"))
	status = _cell_text(row.get("status")).lower()
	effective_status = _cell_text(row.get("effective_status")).lower()
	entry.stopped = 1 if stopped_reason or status == "stopped" or effective_status == "stopped" else 0


def _submit_and_complete_pmo(doc) -> None:
	total = len(doc.get("medication_orders") or [])
	for child in doc.get("medication_orders") or []:
		child.is_completed = 1
	doc.total_orders = total
	doc.completed_orders = total
	doc.flags.ignore_mandatory = True
	doc.save(ignore_permissions=True)
	if doc.docstatus == 0:
		doc.flags.ignore_mandatory = True
		doc.submit()
		doc.reload()
	else:
		doc.db_set(
			{"completed_orders": total, "total_orders": total},
			update_modified=False,
		)
	doc.set_status()


def import_patient_medication_order_for_admission(admission_key: str, lines: list[dict]) -> dict:
	if not lines:
		return {"status": "skip_empty", "admission_key": admission_key}

	first = lines[0]
	old_admission_no = _clean_oracle_num(first.get("old_admission_no"))
	patient_hint = _clean_oracle_num(first.get("patient_num")) or None
	admission_name = _resolve_inpatient_admission(admission_key, patient_hint)
	if not admission_name:
		admission_name = _resolve_inpatient_admission(old_admission_no, patient_hint)
	if not admission_name:
		return {
			"status": "skip_no_admission",
			"admission_key": admission_key,
			"old_admission_no": old_admission_no,
		}

	adm = frappe.db.get_value(
		"Inpatient Admission",
		admission_name,
		[
			"patient",
			"patient_name",
			"company",
			"primary_practitioner",
			"secondary_practitioner",
			"admission_date",
			"scheduled_date",
		],
		as_dict=True,
	)
	if not adm or not adm.patient:
		return {"status": "skip_no_patient_on_admission", "admission_key": admission_key, "admission": admission_name}

	existing_name = _existing_pmo_for_admission(admission_name)
	created = False
	if existing_name:
		doc = frappe.get_doc("Patient Medication Order", existing_name)
	else:
		doc = frappe.new_doc("Patient Medication Order")
		doc.trans_no = get_next_transaction_number("Patient Medication Order", fieldname="trans_no")
		created = True

	care_context = _map_care_context(first.get("context_type"))
	doc.care_context = care_context
	doc.inpatient_record = admission_name
	doc.written_inpatient_admission = admission_key
	doc.old_admission_no = old_admission_no or None
	doc.ip_admission_rec_id = _clean_oracle_num(first.get("ip_admission_rec_id")) or None
	doc.patient = adm.patient
	doc.patient_name = adm.patient_name
	doc.company = adm.company
	doc.practitioner = adm.primary_practitioner or adm.secondary_practitioner

	patient_fields = _patient_display_fields(adm.patient)
	if patient_fields.get("nationality") is not None:
		doc.nationality = patient_fields["nationality"]
	if patient_fields.get("patient_age") is not None:
		doc.patient_age = patient_fields["patient_age"]

	doc.posting_date = _parse_date_value(first.get("trans_date")) or nowdate()
	doc.time = _normalize_time_value(first.get("trans_time"))
	doc.start_date = (
		_parse_date_value(first.get("start_date"))
		or _parse_date_value(first.get("trans_date"))
		or adm.get("admission_date")
		or adm.get("scheduled_date")
		or nowdate()
	)
	doc.end_date = _parse_date_value(first.get("end_date"))
	doc.cost_center = _resolve_cost_center(_clean_oracle_num(first.get("branch")))
	doc.effective_status = _cell_text(first.get("effective_status")) or None
	doc.trans_type = _cell_text(first.get("trans_type")) or None
	doc.strength = _cell_text(first.get("strength")) or None
	doc.duration_type = _cell_text(first.get("duration_type")) or None
	doc.route = _cell_text(first.get("route")) or None
	doc.user_name = _cell_text(first.get("username")) or None

	existing_signatures = _existing_child_signatures(doc)
	added = 0
	skipped = 0
	for row in lines:
		signature = _line_signature(row)
		if signature in existing_signatures:
			skipped += 1
			continue
		_append_child_line(doc, row)
		existing_signatures.add(signature)
		added += 1

	if added == 0 and not created:
		return {
			"status": "skip_no_new_lines",
			"admission_key": admission_key,
			"admission": admission_name,
			"pmo": doc.name,
			"skipped": skipped,
		}

	if not doc.get("medication_orders"):
		return {"status": "skip_no_lines", "admission_key": admission_key, "admission": admission_name}

	_submit_and_complete_pmo(doc)

	return {
		"status": "ok",
		"admission_key": admission_key,
		"admission": admission_name,
		"pmo": doc.name,
		"created": created,
		"added_lines": added,
		"skipped_lines": skipped,
	}


def parse_and_cache_file(file_url: str) -> dict:
	rows, skipped_empty_admission_rows = _parse_file_rows(file_url)
	grouped, unresolved = _group_rows_by_admission(rows)
	admission_keys = sorted(grouped.keys())

	frappe.cache().set_value(CACHE_KEYS["file_url"], file_url, expires_in_sec=CACHE_TTL)
	frappe.cache().set_value(CACHE_KEYS["admissions"], admission_keys, expires_in_sec=CACHE_TTL)
	frappe.cache().set_value(
		CACHE_KEYS["grouped"],
		json.dumps(grouped, default=str),
		expires_in_sec=CACHE_TTL,
	)

	resolvable = 0
	for key in admission_keys:
		lines = grouped[key]
		old_no = _clean_oracle_num((lines[0] if lines else {}).get("old_admission_no"))
		if _resolve_inpatient_admission(key, old_no or None) or (
			old_no and _resolve_inpatient_admission(old_no, None)
		):
			resolvable += 1

	return {
		"file_rows": len(rows) + skipped_empty_admission_rows,
		"admissions": len(admission_keys),
		"medicine_lines": len(rows),
		"unresolved_rows": len(unresolved) + skipped_empty_admission_rows,
		"resolvable_admissions": resolvable,
	}


def _load_cached_grouped() -> dict[str, list[dict]]:
	raw = frappe.cache().get_value(CACHE_KEYS["grouped"])
	if not raw:
		return {}
	if isinstance(raw, dict):
		return raw
	return json.loads(raw)


@frappe.whitelist()
def preview_patient_medication_order_import(file_url: str) -> dict:
	_require_admin()
	return parse_and_cache_file(file_url)


def run_patient_medication_order_import_batch(offset: int = 0) -> dict:
	admission_keys = frappe.cache().get_value(CACHE_KEYS["admissions"]) or []
	grouped = _load_cached_grouped()
	if not admission_keys or not grouped:
		return {"processed": offset, "done": True, "batch_count": 0}

	batch_keys = admission_keys[offset : offset + PMO_IMPORT_BATCH_SIZE]
	if not batch_keys:
		return {"processed": offset, "done": True, "batch_count": 0}

	ok = skip_no_admission = skip_no_lines = skip_no_new = 0
	errors: list[str] = []

	for key in batch_keys:
		lines = grouped.get(key) or []
		savepoint = _safe_savepoint_name("pmo_import", key)
		try:
			frappe.db.savepoint(savepoint)
			result = import_patient_medication_order_for_admission(key, lines)
			status = result.get("status")
			if status == "ok":
				ok += 1
			elif status == "skip_no_admission":
				skip_no_admission += 1
			elif status == "skip_no_lines":
				skip_no_lines += 1
			elif status == "skip_no_new_lines":
				skip_no_new += 1
		except Exception:
			frappe.db.rollback(save_point=savepoint)
			errors.append(f"{key}: {frappe.get_traceback()}")
			frappe.log_error(title=f"Patient Medication Order import failed: {key}")

	frappe.db.commit()
	processed = offset + len(batch_keys)
	return {
		"processed": processed,
		"done": len(batch_keys) < PMO_IMPORT_BATCH_SIZE,
		"batch_count": len(batch_keys),
		"ok": ok,
		"skip_no_admission": skip_no_admission,
		"skip_no_lines": skip_no_lines,
		"skip_no_new_lines": skip_no_new,
		"errors": len(errors),
		"error_samples": errors[:5],
	}
