"""Import Oracle PATIENT_INFO_01 Excel into Patient records."""

from __future__ import annotations

import json
import os
from datetime import date, datetime
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, flt, get_datetime, getdate

PATIENT_INFO_IMPORT_BATCH_SIZE = 200
CACHE_KEYS = {
	"file_url": "healthcare:data_migration:patient_info_import:file_url",
	"file_nos": "healthcare:data_migration:patient_info_import:file_nos",
	"rows": "healthcare:data_migration:patient_info_import:rows",
}
CACHE_TTL = 7200

EXCEL_HEADER_MAP = {
	"C": "file_no",
	"FILE_NO": "file_no",
	"PATIENT_TITLE": "patient_title",
	"FULL_NAME": "full_name",
	"ID_TYPE": "id_type",
	"ID_NUM": "id_number",
	"PAT_NATIONALTY": "pat_nationality",
	"PAT_NATIONALITY": "pat_nationality",
	"PAT_SEX": "sex",
	"PAT_MARTIAL_STATUS": "pat_marital_status",
	"PAT_MARITAL_STATUS": "pat_marital_status",
	"PAT_BLOOD_GROUP": "pat_blood_group",
	"DATE_OF_BIRTH": "date_of_birth",
	"DOB": "dob",
	"PAT_JOB_TITLE": "job_title",
	"PAT_JOB_LOCATION": "job_location",
	"IS_BLACK_LIST": "is_black_list",
	"ADD_FLAT_NUM": "flat_num",
	"ADD_BLDG_NUM": "bldg_num",
	"ADD_ROAD_NUM": "road_num",
	"ADD_BLOCK_NUM": "block_num",
	"ADD_CITY_NUM": "city",
	"ADD_ADDRESS": "address",
	"ADD_COUNTRY": "country",
	"MOB_1_CODE": "mobile_1_code",
	"MOB_1_NUM": "mobile_no_1",
	"MOB_1_WHATSUP": "mobile_1_whatsap",
	"MOB_1_OWNER": "mobile_owner",
	"MOB_2_CODE": "mobile_2_code",
	"MOB_2_NUM": "mobile_no_2",
	"MOB_2_WHATSUP": "mobile_2_whatsap",
	"MOB_2_OWNER": "mobile_owner_2",
	"MOB_3_CODE": "mobile_3_code",
	"MOB_3_NUM": "mobile_no_3",
	"MOB_3_WHATSUP": "mobile_3_whatsap",
	"MOB_3_OWNER": "mobile_owner_3",
	"EMAIL_ADD_1": "email",
	"EMAIL_ADD_2": "email_2",
	"ANY_OTHER_INFORMATION": "any_other_information",
	"IS_INSURANCE": "is_insurance",
	"INSUR_COMPANY_NUM": "insurance_company_no",
	"INSUR_POLICY_NUM": "insurance_policy_no",
	"INSUR_WORK_PLACE": "insurance_work_place",
	"INSUR_ISDN_NUM": "insurance_isdn_no",
	"INSUR_EMP_NUM": "employee_code",
	"INSUR_EXP_DATE": "insurance_expiry_date",
	"INSUR_DEDUCTION_AMT": "insurance_deduction_amount",
	"INSUR_SPECIAL_NOTE": "insurance_special_note",
	"CR_ID": "cr_id",
	"CR_DATE": "cr_date",
	"UP_ID": "up_id",
	"UP_DATE": "up_date",
	"TIME_NUMBER": "time_no",
	"FAMILY_HISTORY": "family_history",
	"ALLERGIES_HISTORY": "allergies",
	"PREVIOUS_DISEASE_HISTORY": "previous_disease_history",
	"IS_MARKETING": "is_marketing",
	"IS_FOLLOWUP": "is_follow_up",
	"SHOW_ALLERGY": "show_allergy",
	"MRD_NUM": "mrd_no",
	"PAT_MAJOR_TYPE": "pat_major_type",
	"CEO_REMARKS": "ceo_remarks",
	"REFF_NUM": "reference_no",
}

MARITAL_STATUS_NAMES = {
	"1": "Single",
	"2": "Married",
	"3": "Widow/Separated",
}

LEGACY_ALLERGY_WARNING_CLASS = "PATIENT_INFO_01"
LEGACY_ALLERGY_WARNING_TYPE = "Allergy"


def _require_admin() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def _clean_oracle_num(value: Any) -> str:
	if value is None or value == "":
		return ""
	if isinstance(value, float) and value == int(value):
		return str(int(value))
	if isinstance(value, int):
		return str(value)
	text = str(value).strip().replace(",", "")
	if text.endswith(".0"):
		text = text[:-2]
	return text


def _cell_text(value: Any) -> str:
	if value is None:
		return ""
	if isinstance(value, float) and value == int(value):
		return str(int(value))
	if isinstance(value, int):
		return str(value)
	return str(value).strip()


def _yn_to_check(value: Any) -> int:
	if value is None or value == "":
		return 0
	if isinstance(value, (int, float)):
		return 1 if int(value) != 0 else 0
	text = str(value).strip().upper()
	return 1 if text in ("Y", "YES", "1", "TRUE", "T") else 0


def _excel_serial_to_datetime(value: Any, datemode: int = 0) -> datetime | None:
	if not isinstance(value, (int, float)) or isinstance(value, bool):
		return None
	try:
		import xlrd

		return xlrd.xldate.xldate_as_datetime(float(value), datemode)
	except Exception:
		return None


def _parse_date_value(value: Any, *, datemode: int = 0):
	if value in (None, ""):
		return None
	if isinstance(value, datetime):
		return getdate(value)
	if isinstance(value, date):
		return value
	dt = _excel_serial_to_datetime(value, datemode)
	if dt:
		return getdate(dt)
	text = str(value).strip().replace(",", "")
	if not text:
		return None
	try:
		return getdate(text)
	except Exception:
		return None


def _parse_datetime_value(value: Any, *, datemode: int = 0) -> datetime | None:
	if value in (None, ""):
		return None
	if isinstance(value, datetime):
		return value
	if isinstance(value, date):
		return datetime.combine(value, datetime.min.time())
	dt = _excel_serial_to_datetime(value, datemode)
	if dt:
		return dt
	text = str(value).strip().replace(",", "")
	if not text:
		return None
	try:
		return get_datetime(text)
	except Exception:
		return None


def _format_legacy_datetime(value: Any) -> str:
	if value in (None, ""):
		return ""
	if isinstance(value, datetime):
		return value.strftime("%Y-%m-%d %H:%M:%S")
	if isinstance(value, date):
		return value.strftime("%Y-%m-%d")
	return _cell_text(value)


def _marital_status_name(code: Any) -> str:
	key = _clean_oracle_num(code)
	return MARITAL_STATUS_NAMES.get(key, "")


def _resolve_salutation(title: Any) -> str | None:
	text = _cell_text(title)
	if not text:
		return None
	candidates = [text, text.rstrip("."), f"{text.rstrip('.')}.", text.title()]
	for candidate in candidates:
		if frappe.db.exists("Salutation", candidate):
			return candidate
	return None


def _resolve_gender(value: Any) -> str | None:
	text = _cell_text(value)
	if not text:
		return None
	for candidate in (text, text.title(), text.upper(), text.lower().title()):
		if frappe.db.exists("Gender", candidate):
			return candidate
	return text


def _excel_file_path(file_url: str) -> str:
	if not file_url:
		frappe.throw(_("File URL is required."))
	file_name = frappe.db.get_value("File", {"file_url": file_url}, "name")
	if not file_name:
		frappe.throw(_("Uploaded file was not found. Please upload the Excel file again."))
	from frappe.utils.file_manager import get_file_path

	return get_file_path(file_name)


def _iter_excel_sheet_rows(file_url: str):
	"""Yield each sheet row as (values_tuple, xlrd_datemode). datemode is 0 for xlsx."""
	path = _excel_file_path(file_url)
	ext = os.path.splitext(path)[1].lower()
	if ext == ".xls":
		try:
			import xlrd
		except ImportError:
			frappe.throw(
				_("xlrd is required to read .xls files. Install it in the bench environment: pip install xlrd")
			)
		wb = xlrd.open_workbook(path, formatting_info=False)
		ws = wb.sheet_by_index(0)
		datemode = wb.datemode
		for row_idx in range(ws.nrows):
			yield tuple(ws.cell_value(row_idx, col_idx) for col_idx in range(ws.ncols)), datemode
		return

	try:
		import openpyxl
	except ImportError:
		frappe.throw(
			_("openpyxl is required to read Excel files. Install it in the bench environment: pip install openpyxl")
		)

	wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
	ws = wb.active
	for raw in ws.iter_rows(values_only=True):
		yield raw, 0


def _parse_excel_rows(file_url: str) -> list[dict]:
	try:
		import openpyxl  # noqa: F401 — checked by _iter_excel_sheet_rows for xlsx
	except ImportError:
		frappe.throw(
			_("openpyxl is required to read Excel files. Install it in the bench environment: pip install openpyxl")
		)

	rows_iter = _iter_excel_sheet_rows(file_url)
	try:
		header_row, _datemode = next(rows_iter)
	except StopIteration:
		return []

	headers = [
		EXCEL_HEADER_MAP.get(str(h).strip().upper(), str(h).strip().lower())
		if h is not None
		else ""
		for h in header_row
	]

	parsed: list[dict] = []
	for raw, datemode in rows_iter:
		if not raw or all(cell is None or str(cell).strip() == "" for cell in raw):
			continue
		row: dict[str, Any] = {}
		for idx, key in enumerate(headers):
			if not key or idx >= len(raw):
				continue
			row[key] = raw[idx]
		file_no = _clean_oracle_num(row.get("file_no"))
		if not file_no:
			continue
		row["file_no"] = file_no
		parsed.append(row)
	return parsed


def _build_patient_fields(row: dict) -> dict:
	file_no = row.get("file_no")
	full_name = _cell_text(row.get("full_name"))
	dob = _parse_date_value(row.get("date_of_birth")) or _parse_date_value(row.get("dob"))
	marital_code = _clean_oracle_num(row.get("pat_marital_status"))
	primary_mobile = _cell_text(row.get("mobile_no_1"))

	fields: dict[str, Any] = {
		"file_no": file_no,
		"patient_name": full_name,
		"id_type": _cell_text(row.get("id_type")),
		"id_number": _cell_text(row.get("id_number")),
		"pat_nationality": _clean_oracle_num(row.get("pat_nationality")),
		"pat_blood_group": _cell_text(row.get("pat_blood_group")),
		"job_title": _cell_text(row.get("job_title")),
		"job_location": _cell_text(row.get("job_location")),
		"is_black_list": _yn_to_check(row.get("is_black_list")),
		"flat_num": _cell_text(row.get("flat_num")),
		"bldg_num": _cell_text(row.get("bldg_num")),
		"road_num": _cell_text(row.get("road_num")),
		"block_num": _cell_text(row.get("block_num")),
		"city": _cell_text(row.get("city")),
		"country": _cell_text(row.get("country")),
		"address": _cell_text(row.get("address")),
		"mobile_1_code": _cell_text(row.get("mobile_1_code")),
		"mobile_no_1": primary_mobile,
		"mobile_1_whatsap": _yn_to_check(row.get("mobile_1_whatsap")),
		"mobile_owner": _cell_text(row.get("mobile_owner")),
		"mobile_2_code": _cell_text(row.get("mobile_2_code")),
		"mobile_no_2": _cell_text(row.get("mobile_no_2")),
		"mobile_2_whatsap": _yn_to_check(row.get("mobile_2_whatsap")),
		"mobile_owner_2": _cell_text(row.get("mobile_owner_2")),
		"mobile_3_code": _cell_text(row.get("mobile_3_code")),
		"mobile_no_3": _cell_text(row.get("mobile_no_3")),
		"mobile_3_whatsap": _yn_to_check(row.get("mobile_3_whatsap")),
		"mobile_owner_3": _cell_text(row.get("mobile_owner_3")),
		"email": _cell_text(row.get("email")),
		"email_2": _cell_text(row.get("email_2")),
		"any_other_information": _cell_text(row.get("any_other_information")),
		"is_insurance": _yn_to_check(row.get("is_insurance")),
		"insurance_company_no": _cell_text(row.get("insurance_company_no")),
		"insurance_policy_no": _cell_text(row.get("insurance_policy_no")),
		"insurance_work_place": _cell_text(row.get("insurance_work_place")),
		"insurance_isdn_no": _cell_text(row.get("insurance_isdn_no")),
		"employee_code": _cell_text(row.get("employee_code")),
		"insurance_deduction_amount": flt(row.get("insurance_deduction_amount") or 0),
		"insurance_special_note": _cell_text(row.get("insurance_special_note")),
		"cr_id": _clean_oracle_num(row.get("cr_id")),
		"family_history": _cell_text(row.get("family_history")),
		"allergies": _cell_text(row.get("allergies")),
		"previous_disease_history": _cell_text(row.get("previous_disease_history")),
		"is_marketing": _yn_to_check(row.get("is_marketing")),
		"is_follow_up": _yn_to_check(row.get("is_follow_up")),
		"show_allergy": _yn_to_check(row.get("show_allergy")),
		"mrd_no": _cell_text(row.get("mrd_no")),
		"pat_major_type": _cell_text(row.get("pat_major_type")),
		"ceo_remarks": _cell_text(row.get("ceo_remarks")),
		"reference_no": _clean_oracle_num(row.get("reference_no")),
		"time_no": _cell_text(row.get("time_no")),
		"pat_marital_status": marital_code,
		"pat_marital_status_name": _marital_status_name(marital_code),
	}

	if primary_mobile:
		fields["mobile"] = primary_mobile
	if dob:
		fields["dob"] = dob
	cr_date = _parse_date_value(row.get("cr_date"))
	if cr_date:
		fields["cr_date"] = cr_date
	insurance_expiry = _parse_date_value(row.get("insurance_expiry_date"))
	if insurance_expiry:
		fields["insurance_expiry_date"] = insurance_expiry
		fields["insurance_valid_till"] = insurance_expiry
	up_date = row.get("up_date")
	if up_date not in (None, ""):
		fields["up_date"] = _format_legacy_datetime(up_date)

	title = _resolve_salutation(row.get("patient_title"))
	if title:
		fields["title"] = title
	sex = _resolve_gender(row.get("sex"))
	if sex:
		fields["sex"] = sex

	return {key: value for key, value in fields.items() if value not in (None, "")}


def _normalize_allergy_text(value: Any) -> str:
	text = _cell_text(value).replace("\r\n", "\n").replace("\r", "\n").strip()
	if not text:
		return ""
	if text in ("-", "—", "N/A", "NA", "NIL", "NONE"):
		return ""
	return text


def _warning_plain_text(value: Any) -> str:
	from frappe.utils import strip_html

	return strip_html(_cell_text(value)).replace("\r\n", "\n").replace("\r", "\n").strip()


def _legacy_allergy_warning_html(text: str) -> str:
	return text.replace("\n", "<br>")


def sync_legacy_patient_allergy_warning(patient: str, allergies_text: str) -> str:
	"""Create or update a Medical Warning Message from legacy Patient.allergies text."""
	text = _normalize_allergy_text(allergies_text)
	if not text or not patient:
		return "skip_empty"

	existing_name = frappe.db.get_value(
		"Warning Message",
		{
			"patient": patient,
			"warning_message_class": LEGACY_ALLERGY_WARNING_CLASS,
			"warning_message_type": LEGACY_ALLERGY_WARNING_TYPE,
		},
		"name",
	)
	warning_html = _legacy_allergy_warning_html(text)
	allergy_flags = {
		"is_allergy": 1,
		"from_patient": 1,
		"reference_doc": "Patient",
		"reference_name": patient,
	}

	if existing_name:
		row = frappe.db.get_value(
			"Warning Message",
			existing_name,
			["warning", "is_allergy", "from_patient"],
			as_dict=True,
		) or {}
		text_unchanged = _warning_plain_text(row.get("warning")) == text
		flags_set = cint(row.get("is_allergy")) and cint(row.get("from_patient"))
		if text_unchanged and flags_set:
			return "skip_unchanged"
		frappe.db.set_value(
			"Warning Message",
			existing_name,
			{"warning": warning_html, **allergy_flags},
			update_modified=True,
		)
		return "updated"

	from healthcare.api.warning_message import allocate_warning_trans_id

	doc = frappe.get_doc(
		{
			"doctype": "Warning Message",
			"trans_id": allocate_warning_trans_id(),
			"type_of_warning": "Medical",
			"patient": patient,
			"warning": warning_html,
			"warning_message_type": LEGACY_ALLERGY_WARNING_TYPE,
			"warning_message_class": LEGACY_ALLERGY_WARNING_CLASS,
			**allergy_flags,
		}
	)
	doc.insert(ignore_permissions=True)
	return "created"


def upsert_patient_from_row(row: dict) -> dict:
	file_no = (row.get("file_no") or "").strip()
	if not file_no:
		return {"status": "skip_no_file_no"}

	fields = _build_patient_fields(row)
	if not fields.get("patient_name"):
		return {"status": "skip_no_name", "file_no": file_no}
	if not fields.get("sex"):
		return {"status": "skip_no_gender", "file_no": file_no}

	if frappe.db.exists("Patient", file_no):
		doc = frappe.get_doc("Patient", file_no)
		for key, value in fields.items():
			if key == "file_no":
				continue
			doc.set(key, value)
		doc.flags.ignore_mandatory = True
		doc.flags.ignore_links = True
		doc.flags.from_legacy_import = True
		doc.save(ignore_permissions=True)
		allergy_warning = sync_legacy_patient_allergy_warning(file_no, row.get("allergies"))
		return {"status": "updated", "file_no": file_no, "allergy_warning": allergy_warning}

	doc = frappe.new_doc("Patient")
	doc.update(fields)
	doc.flags.ignore_mandatory = True
	doc.flags.ignore_links = True
	doc.flags.from_legacy_import = True
	doc.insert(ignore_permissions=True)
	allergy_warning = sync_legacy_patient_allergy_warning(file_no, row.get("allergies"))
	return {"status": "created", "file_no": file_no, "allergy_warning": allergy_warning}


def parse_and_cache_excel(file_url: str) -> dict:
	rows = _parse_excel_rows(file_url)
	by_file_no = {row["file_no"]: row for row in rows}
	file_nos = sorted(by_file_no.keys())

	frappe.cache().set_value(CACHE_KEYS["file_url"], file_url, expires_in_sec=CACHE_TTL)
	frappe.cache().set_value(CACHE_KEYS["file_nos"], file_nos, expires_in_sec=CACHE_TTL)
	frappe.cache().set_value(
		CACHE_KEYS["rows"],
		json.dumps(by_file_no, default=str),
		expires_in_sec=CACHE_TTL,
	)

	existing = sum(1 for file_no in file_nos if frappe.db.exists("Patient", file_no))
	with_allergies = sum(
		1 for row in rows if _normalize_allergy_text(row.get("allergies"))
	)
	sample = file_nos[:5]
	return {
		"excel_rows": len(rows),
		"patients": len(file_nos),
		"existing_patients": existing,
		"new_patients": len(file_nos) - existing,
		"with_allergies": with_allergies,
		"sample_file_nos": sample,
	}


def _load_cached_rows() -> dict[str, dict]:
	raw = frappe.cache().get_value(CACHE_KEYS["rows"])
	if not raw:
		return {}
	if isinstance(raw, dict):
		return raw
	return json.loads(raw)


@frappe.whitelist()
def preview_patient_info_import(file_url: str) -> dict:
	_require_admin()
	return parse_and_cache_excel(file_url)


def run_patient_info_import_batch(offset: int = 0) -> dict:
	file_nos = frappe.cache().get_value(CACHE_KEYS["file_nos"]) or []
	rows_by_file_no = _load_cached_rows()
	if not file_nos or not rows_by_file_no:
		return {"processed": offset, "done": True, "batch_count": 0}

	batch_keys = file_nos[offset : offset + PATIENT_INFO_IMPORT_BATCH_SIZE]
	if not batch_keys:
		return {"processed": offset, "done": True, "batch_count": 0}

	created = updated = skip_no_name = skip_no_gender = 0
	allergy_warnings_created = allergy_warnings_updated = 0
	errors: list[str] = []

	for file_no in batch_keys:
		row = rows_by_file_no.get(file_no) or {}
		try:
			result = upsert_patient_from_row(row)
			status = result.get("status")
			if status == "created":
				created += 1
			elif status == "updated":
				updated += 1
			elif status == "skip_no_name":
				skip_no_name += 1
			elif status == "skip_no_gender":
				skip_no_gender += 1
			allergy_status = result.get("allergy_warning")
			if allergy_status == "created":
				allergy_warnings_created += 1
			elif allergy_status == "updated":
				allergy_warnings_updated += 1
		except Exception:
			errors.append(f"{file_no}: {frappe.get_traceback()}")
			frappe.log_error(title=f"Patient import failed: {file_no}")

	frappe.db.commit()
	processed = offset + len(batch_keys)
	return {
		"processed": processed,
		"done": len(batch_keys) < PATIENT_INFO_IMPORT_BATCH_SIZE,
		"batch_count": len(batch_keys),
		"created": created,
		"updated": updated,
		"skip_no_name": skip_no_name,
		"skip_no_gender": skip_no_gender,
		"allergy_warnings_created": allergy_warnings_created,
		"allergy_warnings_updated": allergy_warnings_updated,
		"errors": len(errors),
	}
