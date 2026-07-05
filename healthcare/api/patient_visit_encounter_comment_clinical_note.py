"""Create Clinical Notes (Doctor Progress Note) from Patient Visit.encounter_comment."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import frappe
from frappe import _
from frappe.utils import get_datetime, getdate, now_datetime

from healthcare.api.clinical_note import _get_or_create_clinical_note_type
from healthcare.healthcare.doctype.clinical_note.clinical_note import assign_clinical_note_trans_no

DOCTOR_PROGRESS_NOTE_TYPE = "Doctor Progress Note"
BATCH_SIZE = 25

_VISIT_USERNAME_FIELDS = ("username", "user_name", "create_user_id")


def _require_admin() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def _encounter_comment_visits_sql_count() -> int:
	return int(
		frappe.db.sql(
			"""
			SELECT COUNT(*)
			FROM `tabPatient Visit`
			WHERE encounter_comment IS NOT NULL
			  AND TRIM(encounter_comment) != ''
			"""
		)[0][0]
		or 0
	)


def _username_from_visit(visit: dict) -> str | None:
	meta = frappe.get_meta("Patient Visit")
	for fieldname in _VISIT_USERNAME_FIELDS:
		if meta.has_field(fieldname):
			value = (visit.get(fieldname) or "").strip()
			if value:
				return value
	return None


def _posting_datetime_from_visit(visit: dict) -> datetime:
	enc_date = visit.get("encounter_date")
	if not enc_date:
		return now_datetime()
	enc_time = visit.get("encounter_time") or "00:00:00"
	try:
		return get_datetime(f"{getdate(enc_date)} {enc_time}")
	except Exception:
		return get_datetime(getdate(enc_date))


def _note_html(text: str | None) -> str:
	content = (text or "").strip()
	if not content:
		return ""
	if "<" in content and ">" in content:
		return content
	return f"<p>{frappe.utils.escape_html(content).replace(chr(10), '<br>')}</p>"


def _existing_clinical_note_for_visit(visit_name: str) -> str | None:
	for filters in (
		{
			"reference_doc": "Patient Visit",
			"reference_name": visit_name,
			"clinical_note_type": DOCTOR_PROGRESS_NOTE_TYPE,
		},
		{
			"reference_doctype": "Patient Visit",
			"reference_document": visit_name,
			"clinical_note_type": DOCTOR_PROGRESS_NOTE_TYPE,
		},
	):
		name = frappe.db.get_value("Clinical Note", filters, "name")
		if name:
			return name
	return None


def _resolve_medical_role(practitioner: str | None) -> str:
	if practitioner:
		role = frappe.db.get_value("Healthcare Practitioner", practitioner, "medical_role")
		if role:
			return role
	if frappe.db.exists("Medical Role", "Doctor"):
		return "Doctor"
	return "Doctor"


def _build_clinical_note_doc(visit: dict) -> frappe.model.document.Document:
	_get_or_create_clinical_note_type(DOCTOR_PROGRESS_NOTE_TYPE)

	note_body = _note_html(visit.get("encounter_comment"))
	practitioner = (visit.get("practitioner") or "").strip() or None
	visit_name = visit["name"]

	fields: dict[str, Any] = {
		"doctype": "Clinical Note",
		"patient": visit.get("patient"),
		"patient_name": visit.get("patient_name"),
		"clinical_note_type": DOCTOR_PROGRESS_NOTE_TYPE,
		"medical_role": _resolve_medical_role(practitioner),
		"practitioner": practitioner,
		"posting_date": _posting_datetime_from_visit(visit),
		"note": note_body,
		"reference_doc": "Patient Visit",
		"reference_name": visit_name,
		"reference_doctype": "Patient Visit",
		"reference_document": visit_name,
		"cost_center": (visit.get("cost_center") or "").strip() or None,
	}

	username = _username_from_visit(visit)
	if username:
		fields["username"] = username

	inpatient = (visit.get("inpatient_record") or "").strip()
	if inpatient and frappe.db.exists("Inpatient Admission", inpatient):
		fields["inpatient_admission"] = inpatient

	doc = frappe.get_doc({k: v for k, v in fields.items() if v not in (None, "")})
	assign_clinical_note_trans_no(doc)
	doc.flags.ignore_permissions = True
	doc.flags.ignore_mandatory = True
	return doc


def upsert_clinical_note_from_patient_visit(visit: dict) -> str:
	visit_name = visit.get("name")
	if not visit_name:
		return "skip_no_name"

	if not (visit.get("encounter_comment") or "").strip():
		return "skip_no_comment"

	if not visit.get("patient"):
		return "skip_no_patient"

	if _existing_clinical_note_for_visit(visit_name):
		return "skip_existing"

	doc = _build_clinical_note_doc(visit)
	doc.insert()
	return "created"


@frappe.whitelist()
def preview_patient_visit_encounter_comment_clinical_note() -> dict:
	_require_admin()
	total = _encounter_comment_visits_sql_count()
	already_linked = int(
		frappe.db.sql(
			"""
			SELECT COUNT(DISTINCT pv.name)
			FROM `tabPatient Visit` pv
			INNER JOIN `tabClinical Note` cn ON (
				(cn.reference_doc = 'Patient Visit' AND cn.reference_name = pv.name)
				OR (cn.reference_doctype = 'Patient Visit' AND cn.reference_document = pv.name)
			)
			WHERE pv.encounter_comment IS NOT NULL
			  AND TRIM(pv.encounter_comment) != ''
			  AND cn.clinical_note_type = %s
			""",
			DOCTOR_PROGRESS_NOTE_TYPE,
		)[0][0]
		or 0
	)
	return {
		"total_with_comment": total,
		"already_linked": already_linked,
		"to_create": max(total - already_linked, 0),
	}


def run_patient_visit_encounter_comment_clinical_note_batch(*, offset: int = 0) -> dict:
	visits = frappe.get_all(
		"Patient Visit",
		filters=[
			["encounter_comment", "is", "set"],
			["encounter_comment", "!=", ""],
		],
		fields=[
			"name",
			"patient",
			"patient_name",
			"encounter_date",
			"encounter_time",
			"encounter_comment",
			"practitioner",
			"cost_center",
			"inpatient_record",
			*[
				f
				for f in _VISIT_USERNAME_FIELDS
				if frappe.get_meta("Patient Visit").has_field(f)
			],
		],
		order_by="name asc",
		limit_start=offset,
		limit_page_length=BATCH_SIZE,
	)

	created = 0
	skipped_existing = 0
	skipped_no_patient = 0
	skipped_no_comment = 0
	errors = 0

	for visit in visits:
		if not (visit.get("encounter_comment") or "").strip():
			skipped_no_comment += 1
			continue
		try:
			status = upsert_clinical_note_from_patient_visit(visit)
			if status == "created":
				created += 1
			elif status == "skip_existing":
				skipped_existing += 1
			elif status == "skip_no_patient":
				skipped_no_patient += 1
			else:
				skipped_no_comment += 1
		except Exception:
			errors += 1
			frappe.log_error(
				title=f"Patient Visit encounter_comment → Clinical Note failed: {visit.get('name')}",
				message=frappe.get_traceback(),
			)

	frappe.db.commit()

	return {
		"batch_size": len(visits),
		"created": created,
		"skipped_existing": skipped_existing,
		"skipped_no_patient": skipped_no_patient,
		"skipped_no_comment": skipped_no_comment,
		"errors": errors,
		"next_offset": offset + len(visits),
		"has_more": len(visits) >= BATCH_SIZE,
	}
