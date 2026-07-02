"""Import Oracle IP_ADMISSION_01 Excel into Inpatient Admission and Discharge."""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, flt, get_datetime, getdate

from healthcare.api.patient_info_import import (
	_cell_text,
	_clean_oracle_num,
	_iter_excel_sheet_rows,
	_parse_date_value,
	_parse_datetime_value,
	_require_admin,
	_yn_to_check,
)
from healthcare.healthcare.doctype.inpatient_admission.inpatient_admission import (
	resolve_admission_datetime,
)

IP_ADMISSION_DISCHARGE_BATCH_SIZE = 500
CACHE_KEYS = {
	"file_url": "healthcare:data_migration:ip_admission_discharge:file_url",
	"case_nos": "healthcare:data_migration:ip_admission_discharge:case_nos",
	"rows": "healthcare:data_migration:ip_admission_discharge:rows",
	"nursing_file_url": "healthcare:data_migration:ip_admission_discharge:nursing_file_url",
	"nursing_grouped": "healthcare:data_migration:ip_admission_discharge:nursing_grouped",
	"discharge_checklist_file_url": "healthcare:data_migration:ip_admission_discharge:discharge_checklist_file_url",
	"discharge_checklist_grouped": "healthcare:data_migration:ip_admission_discharge:discharge_checklist_grouped",
}
CACHE_TTL = 7200

# Fixed column order for C-I IP_ADMISSION_01.xlsx (index 76 is duplicate Discharge Type → DAMA Type).
EXCEL_COLUMN_KEYS = [
	"case_no",
	"patient",
	"admission_date",
	"bed_no",
	"admission_by_cpr",
	"admission_by_nm",
	"admission_by_doctor",
	"admission_reason",
	"admission_instructions",
	"family_history",
	"discharge_date",
	"discharged_by_user",
	"user_name",
	"append_date",
	"spend_daysduration",
	"discharge_treatment_plan",
	"discharge_reason",
	"escort_no",
	"escort_name",
	"forward_from",
	"status",
	"admission_time",
	"belonging",
	"admission_cost",
	"illness_history",
	"management",
	"progress",
	"discharge_diagnosis",
	"discharge_instructions",
	"admission_type",
	"residents_doctor_no",
	"is_med_supr_required",
	"med_supr_service_code",
	"field3",
	"field4",
	"field5",
	"field6",
	"field7",
	"cost_center",
	"cr_id",
	"cr_date",
	"up_id",
	"up_date",
	"discharge_time",
	"today_charge",
	"ip_case_management",
	"ip_case_management_fee",
	"room_charges",
	"ip_re_admission_count",
	"final_discharge_user_id",
	"final_discharge_date",
	"management_in_hospital",
	"resident_doctor_2",
	"is_dama_yn",
	"final_exam_mental_status_summary",
	"discharge_conditions",
	"prognosis",
	"receiving_doctor",
	"next_appointment_date",
	"today_charge_obs",
	"special_care",
	"package_num",
	"room_service_no",
	"room_gl_code",
	"case_service_no",
	"case_gl_code",
	"mode_of_admission",
	"contact_relationship",
	"contact_mobile",
	"contact_email",
	"guardian_name",
	"emergency_mobile_no",
	"discharge_type",
	"discharge_responsibility",
	"next_appointment_time",
	"discharge_consultation_doc_no",
	"dama_type",
	"dama_reason",
	"dama_gp_doc_no",
	"dama_consultation_doc_no",
	"dama_reception_doc_no",
	"dama_nurse_no",
	"dama_nurse_no_2",
	"dama_relationship",
	"dama_name",
	"dama_cpr_id",
	"dama_phone_cell",
	"dama_email",
	"discharge_medic_stopped_why",
	"discharge_flag",
	"admission_num_master",
	"admission_no_old",
	"remark",
]

ADMISSION_DATE_FIELDS = (
	"admission_date",
	"discharge_date",
	"append_date",
	"cr_date",
	"final_discharge_date",
	"next_appointment_date",
)
ADMISSION_DATETIME_FIELDS = ("up_date",)


def _format_legacy_datetime(value: Any) -> str:
	if value in (None, ""):
		return ""
	if isinstance(value, datetime):
		return value.strftime("%Y-%m-%d %H:%M:%S")
	if isinstance(value, date):
		return value.strftime("%Y-%m-%d")
	return _cell_text(value)


def _resolve_cost_center(branch_label: Any) -> str | None:
	from healthcare.api.discharge_checklist_import import _resolve_cost_center as resolve_cc

	return resolve_cc(branch_label)


def _resolve_practitioner_by_doctors_id(value: Any) -> str | None:
	code = _clean_oracle_num(value)
	if not code:
		return None
	if frappe.db.exists("Healthcare Practitioner", code):
		return code
	name = frappe.db.get_value("Healthcare Practitioner", {"doctors_id": code}, "name")
	return name or None


def _default_company() -> str | None:
	company = frappe.defaults.get_global_default("company")
	if company and frappe.db.exists("Company", company):
		return company
	rows = frappe.get_all("Company", pluck="name", limit=1)
	return rows[0] if rows else None


def _is_discharged_status(status: Any) -> bool:
	"""Oracle ADMISION_STATUS: 1 = Admitted, 2 = Discharged. Clean exports may use text."""
	if status in (None, ""):
		return False
	if isinstance(status, (int, float)) and not isinstance(status, bool):
		return int(status) == 2
	text = _cell_text(status).lower()
	if text in ("discharged", "discharge"):
		return True
	# Numeric code exported as string from Excel
	if text in ("2", "2.0"):
		return True
	return False


def _is_admission_header_row(raw: tuple | list) -> bool:
	if not raw:
		return False
	first = raw[0]
	if first is None:
		return False
	if isinstance(first, str):
		upper = first.strip().upper().replace(" ", "_")
		return upper in ("ADMISSION_NUM", "CASE_NO", "ADMISSION_NO")
	return False


def _normalize_admission_row(row: dict[str, Any], *, datemode: int = 0) -> dict[str, Any]:
	for key in ADMISSION_DATE_FIELDS:
		if key in row:
			parsed = _parse_date_value(row.get(key), datemode=datemode)
			row[key] = parsed if parsed else row.get(key)
	for key in ADMISSION_DATETIME_FIELDS:
		if key in row:
			parsed = _parse_datetime_value(row.get(key), datemode=datemode)
			row[key] = parsed if parsed else row.get(key)
	return row


def _parse_excel_rows(file_url: str) -> list[dict]:
	all_rows = list(_iter_excel_sheet_rows(file_url))
	if not all_rows:
		return []

	first_raw, datemode = all_rows[0]
	start_idx = 1 if _is_admission_header_row(first_raw) else 0

	parsed: list[dict] = []
	for raw, row_datemode in all_rows[start_idx:]:
		if not raw or all(cell is None or str(cell).strip() == "" for cell in raw):
			continue
		row: dict[str, Any] = {}
		for idx, key in enumerate(EXCEL_COLUMN_KEYS):
			if idx >= len(raw):
				break
			row[key] = raw[idx]
		case_no = _clean_oracle_num(row.get("case_no"))
		if not case_no:
			continue
		row["case_no"] = case_no
		row["patient"] = _clean_oracle_num(row.get("patient"))
		row = _normalize_admission_row(row, datemode=row_datemode or datemode)
		parsed.append(row)
	return parsed


def _build_admission_fields(row: dict, *, target_status: str) -> dict[str, Any]:
	patient = row.get("patient")
	admission_date = _parse_date_value(row.get("admission_date"))
	admission_time = _cell_text(row.get("admission_time"))
	admitted_dt = resolve_admission_datetime(None, admission_date, admission_time)

	fields: dict[str, Any] = {
		"case_no": row.get("case_no"),
		"patient": patient,
		"status": target_status,
		"admission_reason": _cell_text(row.get("admission_reason")),
		"admission_instruction": _cell_text(row.get("admission_instructions")),
		"family_history": _cell_text(row.get("family_history")),
		"admission_by_cpr": _cell_text(row.get("admission_by_cpr")),
		"admission_by_nm": _cell_text(row.get("admission_by_nm")),
		"old_bed_no": _cell_text(row.get("bed_no")),
		"bed_no": _cell_text(row.get("bed_no")),
		"escort_no": _clean_oracle_num(row.get("escort_no")),
		"escort_name": _cell_text(row.get("escort_name")),
		"forward_from": _cell_text(row.get("forward_from")),
		"admission_time": admission_time,
		"belonging": _cell_text(row.get("belonging")),
		"admission_cost": flt(row.get("admission_cost") or 0),
		"illness_history": _cell_text(row.get("illness_history")),
		"management": _cell_text(row.get("management")),
		"progress": _cell_text(row.get("progress")),
		"admission_type": _cell_text(row.get("admission_type")),
		"is_med_supr_required": _yn_to_check(row.get("is_med_supr_required")),
		"med_supr_service_code": _cell_text(row.get("med_supr_service_code")),
		"case_management_fee": flt(row.get("ip_case_management_fee") or 0),
		"room_charges": flt(row.get("room_charges") or 0),
		"ip_re_admission_count": _clean_oracle_num(row.get("ip_re_admission_count")),
		"management_in_hospital": _cell_text(row.get("management_in_hospital")),
		"resident_doctor_2": _cell_text(row.get("resident_doctor_2")),
		"special_care": _cell_text(row.get("special_care")),
		"package_num": _cell_text(row.get("package_num")),
		"room_service_no": _cell_text(row.get("room_service_no")),
		"room_gl_code": _cell_text(row.get("room_gl_code")),
		"case_service_no": _cell_text(row.get("case_service_no")),
		"case_gl_code": _cell_text(row.get("case_gl_code")),
		"mode_of_admission": _cell_text(row.get("mode_of_admission")),
		"contact_relationship": _cell_text(row.get("contact_relationship")),
		"contact_mobile": _cell_text(row.get("contact_mobile")),
		"contact_email": _cell_text(row.get("contact_email")),
		"guardian_name": _cell_text(row.get("guardian_name")),
		"emergency_mobile_no": _cell_text(row.get("emergency_mobile_no")),
		"admission_no_old": _clean_oracle_num(row.get("admission_no_old")),
		"spend_daysduration": _cell_text(row.get("spend_daysduration")),
		"cr_id": _clean_oracle_num(row.get("cr_id")),
		"up_id": _clean_oracle_num(row.get("up_id")),
	}

	if admission_date:
		fields["admission_date"] = admission_date
	if admitted_dt:
		fields["admitted_datetime"] = admitted_dt
	cr_date = _parse_date_value(row.get("cr_date"))
	if cr_date:
		fields["cr_date"] = cr_date
	up_date = _parse_datetime_value(row.get("up_date"))
	if up_date:
		fields["up_date"] = _format_legacy_datetime(up_date)

	practitioner = _resolve_practitioner_by_doctors_id(row.get("admission_by_doctor"))
	if practitioner:
		fields["admission_by_doctor"] = practitioner
	resident = _resolve_practitioner_by_doctors_id(row.get("residents_doctor_no"))
	if resident:
		fields["residents_doctor_no"] = resident

	cc = _resolve_cost_center(row.get("cost_center"))
	if cc:
		fields["cost_center"] = cc

	company = _default_company()
	if company:
		fields["company"] = company

	if _is_discharged_status(row.get("status")):
		discharge_dt = _parse_date_value(row.get("discharge_date"))
		if discharge_dt:
			fields["discharge_datetime"] = get_datetime(discharge_dt)

	return {key: value for key, value in fields.items() if value not in (None, "")}


def _build_discharge_fields(row: dict, case_no: str, patient: str) -> dict[str, Any]:
	discharge_date = _parse_date_value(row.get("discharge_date"))
	final_discharge_date = _parse_date_value(row.get("final_discharge_date"))

	fields: dict[str, Any] = {
		"admission": case_no,
		"file_no": patient,
		"discharged_by_user": _cell_text(row.get("discharged_by_user")),
		"user_name": _cell_text(row.get("user_name")),
		"discharge_treatment_plan": _cell_text(row.get("discharge_treatment_plan")),
		"discharge_reason": _cell_text(row.get("discharge_reason")),
		"discharge_diagnosis": _cell_text(row.get("discharge_diagnosis")),
		"discharge_instructions": _cell_text(row.get("discharge_instructions")),
		"discharge_time": _cell_text(row.get("discharge_time")),
		"duration": _cell_text(row.get("spend_daysduration")),
		"ip_case_management": _cell_text(row.get("ip_case_management")),
		"ip_case_management_fee": flt(row.get("ip_case_management_fee") or 0),
		"room_charges": flt(row.get("room_charges") or 0),
		"final_discharge_user_id": _cell_text(row.get("final_discharge_user_id")),
		"final_exam_mental_status_summary": _cell_text(row.get("final_exam_mental_status_summary")),
		"discharge_conditions": _cell_text(row.get("discharge_conditions")),
		"prognosis": _cell_text(row.get("prognosis")),
		"receiving_doctor": _cell_text(row.get("receiving_doctor")),
		"discharge_type": _cell_text(row.get("discharge_type")),
		"discharge_responsibility": _cell_text(row.get("discharge_responsibility")),
		"next_appointment_time": _cell_text(row.get("next_appointment_time")),
		"discharge_consultation_doc_no": _cell_text(row.get("discharge_consultation_doc_no")),
		"dama_reason": _cell_text(row.get("dama_reason")),
		"dama_gp_doc_no": _cell_text(row.get("dama_gp_doc_no")),
		"dama_consultation_doc_no": _cell_text(row.get("dama_consultation_doc_no")),
		"dama_reception_doc_no": _cell_text(row.get("dama_reception_doc_no")),
		"dama_nurse_no": _cell_text(row.get("dama_nurse_no")),
		"dama_nurse_no_2": _cell_text(row.get("dama_nurse_no_2")),
		"dama_relationship": _cell_text(row.get("dama_relationship")),
		"dama_name": _cell_text(row.get("dama_name")),
		"dama_cpr_id": _cell_text(row.get("dama_cpr_id")),
		"dama_phone_cell": _cell_text(row.get("dama_phone_cell")),
		"dama_email": _cell_text(row.get("dama_email")),
		"discharge_medic_stopped_why": _cell_text(row.get("discharge_medic_stopped_why")),
		"discharge_flag": _cell_text(row.get("discharge_flag")),
		"remark": _cell_text(row.get("remark")),
		"escort": _clean_oracle_num(row.get("escort_no")),
		"escort_name": _cell_text(row.get("escort_name")),
		"forward_from": _cell_text(row.get("forward_from")),
		"management_in_hospital": _cell_text(row.get("management_in_hospital")),
		"resident_doctor_2": _cell_text(row.get("resident_doctor_2")),
		"special_care": _cell_text(row.get("special_care")),
		"is_dama_yn": _yn_to_check(row.get("is_dama_yn")),
		"today_charge": _yn_to_check(row.get("today_charge")),
		"today_charge_obs": flt(row.get("today_charge_obs") or 0),
	}

	dama_type = _cell_text(row.get("dama_type"))
	if dama_type and frappe.db.exists("DAMA Type", dama_type):
		fields["ama_type"] = dama_type

	today_charge_amt = row.get("today_charge")
	if isinstance(today_charge_amt, (int, float)) and not isinstance(today_charge_amt, bool):
		fields["today_charge"] = 1
		fields["medical_supervision_amount"] = flt(today_charge_amt)
	elif _yn_to_check(today_charge_amt):
		fields["today_charge"] = 1

	if discharge_date:
		fields["discharge_date"] = discharge_date
	if final_discharge_date:
		fields["final_discharge_date"] = final_discharge_date
	append_date = _parse_date_value(row.get("append_date"))
	if append_date:
		fields["append_date"] = append_date
	next_appt = _parse_date_value(row.get("next_appointment_date"))
	if next_appt:
		fields["next_appointment_date"] = next_appt

	cc = _resolve_cost_center(row.get("cost_center"))
	if cc:
		fields["cost_center"] = cc

	return {key: value for key, value in fields.items() if value not in (None, "")}


def _upsert_admission(row: dict) -> dict:
	case_no = row.get("case_no")
	patient = row.get("patient")
	if not patient:
		return {"status": "skip_no_patient", "case_no": case_no}
	if not frappe.db.exists("Patient", patient):
		return {"status": "skip_no_patient", "case_no": case_no}

	is_discharged = _is_discharged_status(row.get("status"))
	target_status = "Discharged" if is_discharged else "Admitted"
	fields = _build_admission_fields(row, target_status=target_status)

	if frappe.db.exists("Inpatient Admission", case_no):
		doc = frappe.get_doc("Inpatient Admission", case_no)
		for key, value in fields.items():
			if key == "case_no":
				continue
			doc.set(key, value)
		doc.flags.ignore_mandatory = True
		doc.flags.ignore_links = True
		doc.save(ignore_permissions=True)
		admission_action = "updated"
	else:
		doc = frappe.new_doc("Inpatient Admission")
		doc.update(fields)
		doc.flags.ignore_mandatory = True
		doc.flags.ignore_links = True
		doc.insert(ignore_permissions=True)
		admission_action = "created"

	discharge_action = "none"
	if is_discharged:
		discharge_action = _upsert_discharge(row, case_no, patient)

	return {
		"status": admission_action,
		"case_no": case_no,
		"discharge_action": discharge_action,
		"is_discharged": is_discharged,
	}


def _upsert_discharge(row: dict, case_no: str, patient: str) -> str:
	fields = _build_discharge_fields(row, case_no, patient)
	if not fields.get("admission") or not fields.get("file_no"):
		return "skip"

	if frappe.db.exists("Discharge", case_no):
		doc = frappe.get_doc("Discharge", case_no)
		if doc.docstatus == 2:
			return "skip_cancelled"
		for key, value in fields.items():
			if key in ("admission",):
				continue
			doc.set(key, value)
		doc.flags.ignore_mandatory = True
		doc.flags.ignore_links = True
		doc.save(ignore_permissions=True)
		action = "updated"
	else:
		doc = frappe.new_doc("Discharge")
		doc.update(fields)
		doc.flags.ignore_mandatory = True
		doc.flags.ignore_links = True
		doc.insert(ignore_permissions=True)
		action = "created"

	if doc.docstatus == 0:
		doc.flags.ignore_mandatory = True
		doc.flags.from_legacy_import = True
		try:
			doc.submit()
			return f"{action}_submitted"
		except Exception:
			frappe.log_error(title=f"Legacy discharge submit failed: {case_no}", message=frappe.get_traceback())
			frappe.db.set_value(
				"Inpatient Admission",
				case_no,
				{"status": "Discharged", "discharge_datetime": fields.get("discharge_date")},
				update_modified=True,
			)
			frappe.db.set_value("Patient", patient, "inpatient_status", "Discharged")
			return f"{action}_draft"

	return action


def upsert_admission_discharge_from_row(row: dict) -> dict:
	return _upsert_admission(row)


def _collect_missing_patient_details(rows: list[dict], *, sample_limit: int = 20) -> dict:
	"""Rows whose PATIENT_NUM is not yet a Patient record (name = file_no)."""
	missing_rows: list[dict] = []
	sample: list[dict] = []
	seen_cases: set[str] = set()
	unique_file_nos: set[str] = set()

	for row in rows:
		patient = (row.get("patient") or "").strip()
		case_no = (row.get("case_no") or "").strip()
		if not patient:
			continue
		if frappe.db.exists("Patient", patient):
			continue
		unique_file_nos.add(patient)
		missing_rows.append(row)
		if case_no not in seen_cases and len(seen_cases) < sample_limit:
			seen_cases.add(case_no)
			sample.append({"case_no": case_no, "patient": patient})

	return {
		"missing_rows": len(missing_rows),
		"unique_missing_file_nos": len(unique_file_nos),
		"sample_missing_patients": sample,
	}


def parse_and_cache_excel(file_url: str) -> dict:
	rows = _parse_excel_rows(file_url)
	by_case_no = {row["case_no"]: row for row in rows}
	case_nos = sorted(by_case_no.keys())

	frappe.cache().set_value(CACHE_KEYS["file_url"], file_url, expires_in_sec=CACHE_TTL)
	frappe.cache().set_value(CACHE_KEYS["case_nos"], case_nos, expires_in_sec=CACHE_TTL)
	frappe.cache().set_value(
		CACHE_KEYS["rows"],
		json.dumps(by_case_no, default=str),
		expires_in_sec=CACHE_TTL,
	)

	existing_adm = sum(1 for case_no in case_nos if frappe.db.exists("Inpatient Admission", case_no))
	existing_dis = sum(1 for case_no in case_nos if frappe.db.exists("Discharge", case_no))
	missing_detail = _collect_missing_patient_details(rows)
	discharged = sum(1 for row in rows if _is_discharged_status(row.get("status")))
	admitted = len(rows) - discharged

	return {
		"excel_rows": len(rows),
		"admissions": len(case_nos),
		"existing_admissions": existing_adm,
		"existing_discharges": existing_dis,
		"missing_patients": missing_detail["missing_rows"],
		"unique_missing_file_nos": missing_detail["unique_missing_file_nos"],
		"sample_missing_patients": missing_detail["sample_missing_patients"],
		"discharged_rows": discharged,
		"admitted_rows": admitted,
		"sample_case_nos": case_nos[:5],
	}


def _load_cached_rows() -> dict[str, dict]:
	raw = frappe.cache().get_value(CACHE_KEYS["rows"])
	if not raw:
		return {}
	if isinstance(raw, dict):
		return raw
	return json.loads(raw)


def _parse_checklist_grouped(file_url: str, *, nursing: bool) -> dict[str, list[dict]]:
	from healthcare.api.discharge_checklist_import import _group_rows_by_admission

	if nursing:
		from healthcare.api.nursing_checklist_import import _parse_excel_rows as parse_rows
	else:
		from healthcare.api.discharge_checklist_import import _parse_excel_rows as parse_rows

	rows = parse_rows(file_url)
	grouped, _unresolved = _group_rows_by_admission(rows)
	return grouped


def _load_cached_grouped(cache_key: str) -> dict[str, list[dict]]:
	raw = frappe.cache().get_value(cache_key)
	if not raw:
		return {}
	if isinstance(raw, dict):
		return raw
	return json.loads(raw)


def _cache_checklist_files(
	nursing_file_url: str | None = None,
	discharge_checklist_file_url: str | None = None,
) -> dict:
	summary: dict[str, Any] = {}
	if nursing_file_url:
		nursing_grouped = _parse_checklist_grouped(nursing_file_url, nursing=True)
		frappe.cache().set_value(CACHE_KEYS["nursing_file_url"], nursing_file_url, expires_in_sec=CACHE_TTL)
		frappe.cache().set_value(
			CACHE_KEYS["nursing_grouped"],
			json.dumps(nursing_grouped, default=str),
			expires_in_sec=CACHE_TTL,
		)
		summary["nursing_rows"] = sum(len(lines) for lines in nursing_grouped.values())
		summary["nursing_admissions"] = len(nursing_grouped)
	else:
		frappe.cache().delete_value(CACHE_KEYS["nursing_file_url"])
		frappe.cache().delete_value(CACHE_KEYS["nursing_grouped"])

	if discharge_checklist_file_url:
		dc_grouped = _parse_checklist_grouped(discharge_checklist_file_url, nursing=False)
		frappe.cache().set_value(
			CACHE_KEYS["discharge_checklist_file_url"],
			discharge_checklist_file_url,
			expires_in_sec=CACHE_TTL,
		)
		frappe.cache().set_value(
			CACHE_KEYS["discharge_checklist_grouped"],
			json.dumps(dc_grouped, default=str),
			expires_in_sec=CACHE_TTL,
		)
		summary["discharge_checklist_rows"] = sum(len(lines) for lines in dc_grouped.values())
		summary["discharge_checklist_admissions"] = len(dc_grouped)
	else:
		frappe.cache().delete_value(CACHE_KEYS["discharge_checklist_file_url"])
		frappe.cache().delete_value(CACHE_KEYS["discharge_checklist_grouped"])

	return summary


def _apply_checklists_for_admission(case_no: str, row: dict) -> dict:
	"""Apply nursing + discharge checklist rows when a discharge exists."""
	from healthcare.api.discharge_checklist_import import import_discharge_checklist_for_admission
	from healthcare.api.nursing_checklist_import import import_nursing_checklist_for_admission

	if not _is_discharged_status(row.get("status")):
		return {"nursing": "skip_not_discharged", "discharge_checklist": "skip_not_discharged"}

	out: dict[str, str] = {}
	nursing_grouped = _load_cached_grouped(CACHE_KEYS["nursing_grouped"])
	if nursing_grouped:
		lines = nursing_grouped.get(case_no) or []
		if lines:
			try:
				result = import_nursing_checklist_for_admission(case_no, lines)
				out["nursing"] = result.get("status") or "unknown"
			except Exception:
				frappe.log_error(title=f"Nursing checklist import failed: {case_no}")
				out["nursing"] = "error"
		else:
			out["nursing"] = "skip_no_rows"

	dc_grouped = _load_cached_grouped(CACHE_KEYS["discharge_checklist_grouped"])
	if dc_grouped:
		lines = dc_grouped.get(case_no) or []
		if lines:
			try:
				result = import_discharge_checklist_for_admission(case_no, lines)
				out["discharge_checklist"] = result.get("status") or "unknown"
			except Exception:
				frappe.log_error(title=f"Discharge checklist import failed: {case_no}")
				out["discharge_checklist"] = "error"
		else:
			out["discharge_checklist"] = "skip_no_rows"

	return out


def parse_and_cache_bundle(
	admission_file_url: str,
	nursing_file_url: str | None = None,
	discharge_checklist_file_url: str | None = None,
) -> dict:
	summary = parse_and_cache_excel(admission_file_url)
	summary.update(_cache_checklist_files(nursing_file_url, discharge_checklist_file_url))
	return summary


@frappe.whitelist()
def preview_ip_admission_discharge_import(
	file_url: str,
	nursing_file_url: str | None = None,
	discharge_checklist_file_url: str | None = None,
) -> dict:
	_require_admin()
	if nursing_file_url or discharge_checklist_file_url:
		return parse_and_cache_bundle(file_url, nursing_file_url, discharge_checklist_file_url)
	return parse_and_cache_excel(file_url)


@frappe.whitelist()
def preview_ip_admission_discharge_bundle_import(
	admission_file_url: str,
	nursing_file_url: str | None = None,
	discharge_checklist_file_url: str | None = None,
) -> dict:
	_require_admin()
	if not (admission_file_url or "").strip():
		frappe.throw(_("Please upload the IP_ADMISSION_01 Excel file first."))
	return parse_and_cache_bundle(
		admission_file_url,
		nursing_file_url or None,
		discharge_checklist_file_url or None,
	)


def run_ip_admission_discharge_import_batch(offset: int = 0) -> dict:
	case_nos = frappe.cache().get_value(CACHE_KEYS["case_nos"]) or []
	rows_by_case = _load_cached_rows()
	if not case_nos or not rows_by_case:
		return {"processed": offset, "done": True, "batch_count": 0}

	batch_keys = case_nos[offset : offset + IP_ADMISSION_DISCHARGE_BATCH_SIZE]
	if not batch_keys:
		return {"processed": offset, "done": True, "batch_count": 0}

	created = updated = skip_no_patient = 0
	discharges_created = discharges_updated = discharges_submitted = 0
	nursing_ok = nursing_skip = discharge_cl_ok = discharge_cl_skip = 0
	errors: list[str] = []

	for case_no in batch_keys:
		row = rows_by_case.get(case_no) or {}
		try:
			result = upsert_admission_discharge_from_row(row)
			status = result.get("status")
			if status == "created":
				created += 1
			elif status == "updated":
				updated += 1
			elif status == "skip_no_patient":
				skip_no_patient += 1

			discharge_action = result.get("discharge_action") or "none"
			if discharge_action.startswith("created"):
				discharges_created += 1
			elif discharge_action.startswith("updated"):
				discharges_updated += 1
			if discharge_action.endswith("_submitted"):
				discharges_submitted += 1

			try:
				checklist_result = _apply_checklists_for_admission(case_no, row)
				for key, checklist_status in checklist_result.items():
					if checklist_status == "ok":
						if key == "nursing":
							nursing_ok += 1
						else:
							discharge_cl_ok += 1
					elif checklist_status in (
						"skip_no_admission",
						"skip_no_discharge",
						"skip_no_rows",
						"skip_not_discharged",
						"error",
					):
						if key == "nursing":
							nursing_skip += 1
						else:
							discharge_cl_skip += 1
			except Exception:
				frappe.log_error(title=f"Checklist import failed: {case_no}")
		except Exception:
			errors.append(f"{case_no}: {frappe.get_traceback()}")
			frappe.log_error(title=f"IP admission/discharge import failed: {case_no}")

	frappe.db.commit()
	processed = offset + len(batch_keys)
	return {
		"processed": processed,
		"done": len(batch_keys) < IP_ADMISSION_DISCHARGE_BATCH_SIZE,
		"batch_count": len(batch_keys),
		"created": created,
		"updated": updated,
		"skip_no_patient": skip_no_patient,
		"discharges_created": discharges_created,
		"discharges_updated": discharges_updated,
		"discharges_submitted": discharges_submitted,
		"nursing_ok": nursing_ok,
		"nursing_skip": nursing_skip,
		"discharge_cl_ok": discharge_cl_ok,
		"discharge_cl_skip": discharge_cl_skip,
		"errors": len(errors),
	}
