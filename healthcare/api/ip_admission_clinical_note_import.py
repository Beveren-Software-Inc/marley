"""Import Oracle IP_ADMISSION_DIAGNOSES Excel into Clinical Note rows."""

from __future__ import annotations

import json
from typing import Any

import frappe
from frappe import _

from healthcare.api.clinical_note import _get_or_create_clinical_note_type
from healthcare.api.data_migration_jobs import (
	_nurse_medical_roles,
	_target_clinical_note_type_from_row,
)
from healthcare.api.discharge_checklist_import import _resolve_cost_center
from healthcare.api.ip_admission_diagnoses_import import (
	_merge_date_time,
	_parse_sheet_rows as _parse_diagnoses_sheet_rows,
)
from healthcare.api.patient_info_import import (
	_cell_text,
	_clean_oracle_num,
	_excel_file_path,
	_require_admin,
)
from healthcare.api.visit_diagnoses_op_import import _legacy_data_datetime, _truncate_data
from healthcare.api.visit_diagnosis_sync import _resolve_inpatient_admission

IP_ADMISSION_CLINICAL_NOTE_IMPORT_BATCH_SIZE = 200
CACHE_TTL = 7200
CACHE_KEYS = {
	"file_url": "healthcare:data_migration:ip_admission_clinical_note_import:file_url",
	"row_keys": "healthcare:data_migration:ip_admission_clinical_note_import:row_keys",
	"rows": "healthcare:data_migration:ip_admission_clinical_note_import:rows",
}

NOTE_TYPE_TO_MEDICAL_ROLE = {
	"Doctor Progress Note": "Doctor",
	"Psychologist Note": "Psychologist",
	"Nutritionist Note": "Nutritionist",
	"General Note": "Doctor",
	"Nursing Note": "Nurse",
}


def _diagnosis_flag_text(value: Any) -> str | None:
	if value in (None, ""):
		return None
	cleaned = _clean_oracle_num(value)
	if cleaned:
		return cleaned
	text = _cell_text(value)
	return text or None


def _note_html(value: Any) -> str | None:
	text = _cell_text(value)
	if not text:
		return None
	if "<" in text and ">" in text:
		return text
	return text.replace("\n", "<br>")


def _time_text(value: Any) -> str | None:
	text = _cell_text(value)
	return text or None


def _resolve_admission(row: dict) -> str | None:
	admission_num = row.get("admission_num") or ""
	old_num = row.get("admission_num_old") or row.get("old_no") or ""
	for candidate in (admission_num, old_num):
		if not candidate:
			continue
		resolved = _resolve_inpatient_admission(candidate)
		if resolved:
			return resolved
	return None


def _resolve_clinical_note_type(row: dict, admission: str | None) -> str:
	flag_text = _diagnosis_flag_text(row.get("diagnoses_flag"))
	nurse_roles = _nurse_medical_roles()
	note_type = _target_clinical_note_type_from_row(
		flag_text or row.get("diagnoses_flag"),
		None,
		admission,
		nurse_roles=nurse_roles,
	)
	return note_type or "General Note"


def _resolve_medical_role(clinical_note_type: str | None) -> str:
	if clinical_note_type and clinical_note_type in NOTE_TYPE_TO_MEDICAL_ROLE:
		return NOTE_TYPE_TO_MEDICAL_ROLE[clinical_note_type]
	if frappe.db.exists("Medical Role", "Doctor"):
		return "Doctor"
	return "Doctor"


def _existing_clinical_note_name(trans_no: str) -> str | None:
	if frappe.db.exists("Clinical Note", trans_no):
		return trans_no
	return frappe.db.get_value("Clinical Note", {"trans_no": trans_no}, "name")


def _build_clinical_note_fields(row: dict, admission: str | None) -> dict[str, Any]:
	trans_no = row["trans_num"]
	flag_text = _diagnosis_flag_text(row.get("diagnoses_flag"))
	clinical_note_type = _resolve_clinical_note_type(row, admission)
	if clinical_note_type:
		_get_or_create_clinical_note_type(clinical_note_type)

	patient = frappe.db.get_value("Inpatient Admission", admission, "patient") if admission else None
	patient_name = frappe.db.get_value("Patient", patient, "patient_name") if patient else None

	fields: dict[str, Any] = {
		"trans_no": trans_no,
		"diagnosis_flag": flag_text,
		"note": _note_html(row.get("diagnoses_desc")),
		"username": _truncate_data(row.get("user_name")),
		"diagnosis_time": _time_text(row.get("diagnoses_time_from")),
		"diagnosis_to": _time_text(row.get("diagnoses_time_to")),
	}

	if admission:
		fields["inpatient_admission"] = admission
		fields["reference_doctype"] = "Inpatient Admission"
		fields["reference_document"] = admission
	if patient:
		fields["patient"] = patient
	if patient_name:
		fields["patient_name"] = patient_name

	old_admission = row.get("admission_num_old") or row.get("old_no")
	if old_admission:
		fields["old_admission_no"] = old_admission

	posting_dt = _merge_date_time(row.get("diagnoses_date"), row.get("diagnoses_time_from"))
	if posting_dt:
		fields["posting_date"] = posting_dt

	cost_center = _resolve_cost_center(row.get("cost_center_raw"))
	if cost_center:
		fields["cost_center"] = cost_center
	elif admission:
		cc = frappe.db.get_value("Inpatient Admission", admission, "cost_center")
		if cc:
			fields["cost_center"] = cc

	if row.get("cr_id"):
		fields["cr_id"] = row["cr_id"]
	if row.get("up_id"):
		fields["up_id"] = row["up_id"]
	cr_date = _legacy_data_datetime(row.get("cr_date"))
	if cr_date:
		fields["cr_date"] = cr_date
	up_date = _legacy_data_datetime(row.get("up_date"))
	if up_date:
		fields["up_date"] = up_date

	if clinical_note_type:
		fields["clinical_note_type"] = clinical_note_type
		fields["medical_role"] = _resolve_medical_role(clinical_note_type)
	else:
		fields["medical_role"] = _resolve_medical_role(None)

	return {key: value for key, value in fields.items() if value not in (None, "")}


def _apply_legacy_import_flags(doc) -> None:
	doc.flags.ignore_validate = True
	doc.flags.ignore_mandatory = True
	doc.flags.ignore_links = True
	doc.flags.ignore_permissions = True
	doc.flags.legacy_import = True


def upsert_clinical_note_from_row(row: dict) -> dict:
	trans_no = row.get("trans_num") or ""
	if not trans_no:
		return {"status": "skip_no_trans_num"}

	if not _cell_text(row.get("diagnoses_desc")):
		return {"status": "skip_no_note", "trans_no": trans_no}

	admission = _resolve_admission(row)
	fields = _build_clinical_note_fields(row, admission)
	if not fields.get("note"):
		return {"status": "skip_no_note", "trans_no": trans_no}

	existing_name = _existing_clinical_note_name(trans_no)
	if existing_name:
		doc = frappe.get_doc("Clinical Note", existing_name)
		action = "updated"
	else:
		doc = frappe.get_doc({"doctype": "Clinical Note", "name": trans_no, **fields})
		action = "created"

	if existing_name:
		for key, value in fields.items():
			if key == "trans_no":
				continue
			doc.set(key, value)

	_apply_legacy_import_flags(doc)
	if existing_name:
		doc.save(ignore_permissions=True)
	else:
		doc.insert(ignore_permissions=True)

	return {
		"status": action,
		"trans_no": trans_no,
		"name": doc.name,
		"admission_resolved": bool(admission),
		"clinical_note_type": fields.get("clinical_note_type"),
	}


def _parse_sheet_rows(ws) -> list[dict]:
	rows = _parse_diagnoses_sheet_rows(ws)
	for row in rows:
		row.pop("legacy_trans_num", None)
	return rows


def _parse_excel_rows(file_url: str) -> tuple[list[dict], dict[str, int]]:
	try:
		import openpyxl
	except ImportError:
		frappe.throw(
			_(
				"openpyxl is required to read Excel files. Install it in the bench environment: pip install openpyxl"
			)
		)

	path = _excel_file_path(file_url)
	wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
	by_key: dict[str, dict] = {}
	sheet_row_counts: dict[str, int] = {}
	try:
		for sheet_name in wb.sheetnames:
			sheet_rows = _parse_sheet_rows(wb[sheet_name])
			sheet_row_counts[sheet_name] = len(sheet_rows)
			for row in sheet_rows:
				by_key[row["trans_num"]] = row
	finally:
		wb.close()
	return list(by_key.values()), sheet_row_counts


def _preview_counts(rows: list[dict]) -> dict:
	existing = 0
	resolved_admissions = 0
	unresolved_admissions = 0
	skip_no_note = 0
	mapped_types: dict[str, int] = {}

	for row in rows:
		if not _cell_text(row.get("diagnoses_desc")):
			skip_no_note += 1
		admission = _resolve_admission(row)
		if admission:
			resolved_admissions += 1
		elif row.get("admission_num"):
			unresolved_admissions += 1
		if _existing_clinical_note_name(row.get("trans_num") or ""):
			existing += 1
		note_type = _resolve_clinical_note_type(row, admission)
		if note_type:
			mapped_types[note_type] = mapped_types.get(note_type, 0) + 1

	return {
		"existing_notes": existing,
		"new_notes": len(rows) - existing,
		"skip_no_note": skip_no_note,
		"resolved_admissions": resolved_admissions,
		"unresolved_admissions": unresolved_admissions,
		"mapped_note_types": mapped_types,
		"sample_trans_nums": [row.get("trans_num") for row in rows[:5]],
	}


def parse_and_cache_excel(file_url: str) -> dict:
	rows, sheet_row_counts = _parse_excel_rows(file_url)
	row_keys = [row["trans_num"] for row in rows]
	by_key = {row["trans_num"]: row for row in rows}

	frappe.cache().set_value(CACHE_KEYS["file_url"], file_url, expires_in_sec=CACHE_TTL)
	frappe.cache().set_value(CACHE_KEYS["row_keys"], row_keys, expires_in_sec=CACHE_TTL)
	frappe.cache().set_value(
		CACHE_KEYS["rows"],
		json.dumps(by_key, default=str),
		expires_in_sec=CACHE_TTL,
	)

	preview = _preview_counts(rows)
	raw_row_total = sum(sheet_row_counts.values())
	return {
		"excel_rows": len(rows),
		"raw_excel_rows": raw_row_total,
		"sheets": list(sheet_row_counts.keys()),
		"sheet_row_counts": sheet_row_counts,
		**preview,
	}


def _load_cached_rows() -> dict[str, dict]:
	raw = frappe.cache().get_value(CACHE_KEYS["rows"])
	if not raw:
		return {}
	if isinstance(raw, dict):
		return raw
	return json.loads(raw)


@frappe.whitelist()
def preview_ip_admission_clinical_note_import(file_url: str) -> dict:
	_require_admin()
	if not (file_url or "").strip():
		frappe.throw(_("Please upload the IP_ADMISSION_DIAGNOSES Excel file."))
	return parse_and_cache_excel(file_url)


def run_ip_admission_clinical_note_import_batch(*, offset: int = 0) -> dict:
	row_keys = frappe.cache().get_value(CACHE_KEYS["row_keys"]) or []
	rows_by_key = _load_cached_rows()
	if not row_keys or not rows_by_key:
		return {"processed": offset, "done": True, "batch_count": 0}

	batch_keys = row_keys[offset : offset + IP_ADMISSION_CLINICAL_NOTE_IMPORT_BATCH_SIZE]
	if not batch_keys:
		return {"processed": offset, "done": True, "batch_count": 0}

	created = updated = skip_no_note = 0
	admissions_resolved = 0
	errors: list[str] = []

	for key in batch_keys:
		row = rows_by_key.get(key) or {}
		try:
			result = upsert_clinical_note_from_row(row)
			status = result.get("status")
			if status == "created":
				created += 1
			elif status == "updated":
				updated += 1
			elif status == "skip_no_note":
				skip_no_note += 1
			if result.get("admission_resolved"):
				admissions_resolved += 1
		except Exception:
			errors.append(f"{key}: {frappe.get_traceback()}")
			frappe.log_error(title=f"IP_ADMISSION_DIAGNOSES Clinical Note import failed: {key}")

	frappe.db.commit()
	processed = offset + len(batch_keys)
	return {
		"processed": processed,
		"done": len(batch_keys) < IP_ADMISSION_CLINICAL_NOTE_IMPORT_BATCH_SIZE,
		"batch_count": len(batch_keys),
		"created": created,
		"updated": updated,
		"skip_no_note": skip_no_note,
		"admissions_resolved": admissions_resolved,
		"errors": len(errors),
	}
