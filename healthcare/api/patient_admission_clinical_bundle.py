# Copyright (c) 2026, healthcare contributors
"""Aggregate inpatient admission clinical data for Patient History OP continuity."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint, get_datetime

from healthcare.api.clinical_note import _enrich_clinical_note_row
from healthcare.api.diagnosis import get_inpatient_diagnoses
from healthcare.api.medical_diagnosis_entry import _user_can_read_medical_diagnosis_portal
from healthcare.api.patient_medication_order import get_prescriptions_by_inpatient_record
from healthcare.api.warning_message import get_warning_messages
from healthcare.healthcare.doctype.discharge.discharge import get_stopped_medications_for_admission
from healthcare.healthcare.doctype.inpatient_admission.inpatient_admission import resolve_admission_datetime

PORTAL_ROLES = frozenset(
	{
		"Administrator",
		"System Manager",
		"Healthcare Administrator",
		"Doctor",
		"Nurse",
		"Physician",
		"Psychologist",
		"Anesthesiologist",
		"Therapist",
		"Nutritionist",
	}
)


def _user_can_read_bundle() -> bool:
	if frappe.session.user in ("Guest", ""):
		return False
	return bool(PORTAL_ROLES & set(frappe.get_roles(frappe.session.user)))


def _serialize_admission_option(row: dict) -> dict:
	admitted = resolve_admission_datetime(
		row.get("admitted_datetime"),
		row.get("admission_date"),
		row.get("admission_time"),
	)
	discharge = row.get("discharge_datetime") or row.get("discharge_ordered_date")
	label_parts = [row.get("name") or ""]
	if row.get("status"):
		label_parts.append(str(row["status"]))
	if admitted:
		label_parts.append(str(admitted)[:10])
	return {
		"name": row.get("name"),
		"status": row.get("status"),
		"admitted_datetime": str(admitted) if admitted else None,
		"discharge_datetime": str(discharge) if discharge else None,
		"label": " · ".join(p for p in label_parts if p),
	}


def _pick_default_admission(patient: str) -> str | None:
	if not patient:
		return None
	discharge_row = frappe.db.sql(
		"""
		SELECT name
		FROM `tabInpatient Admission`
		WHERE patient = %(patient)s AND status = 'Discharged'
		ORDER BY COALESCE(discharge_datetime, modified) DESC
		LIMIT 1
		""",
		{"patient": patient},
		as_dict=True,
	)
	if discharge_row:
		return discharge_row[0].name
	fallback = frappe.get_all(
		"Inpatient Admission",
		filters={"patient": patient},
		fields=["name"],
		order_by="modified desc",
		limit=1,
	)
	return fallback[0].name if fallback else None


def _sortable_ts(value) -> float:
	"""Normalize date/datetime/str to a comparable timestamp for sorting."""
	if not value:
		return 0.0
	try:
		return float(get_datetime(value).timestamp())
	except Exception:
		return 0.0


def _admission_sort_ts(row: dict) -> float:
	for key in (
		"discharge_datetime",
		"discharge_ordered_date",
		"admitted_datetime",
		"admission_date",
		"modified",
	):
		val = row.get(key)
		if val:
			ts = _sortable_ts(val)
			if ts:
				return ts
	admitted = resolve_admission_datetime(
		row.get("admitted_datetime"),
		row.get("admission_date"),
		row.get("admission_time"),
	)
	if admitted:
		return _sortable_ts(admitted)
	return 0.0


def _admission_options_for_patient(patient: str) -> list[dict]:
	rows = frappe.get_all(
		"Inpatient Admission",
		filters={"patient": patient},
		fields=[
			"name",
			"status",
			"admitted_datetime",
			"admission_date",
			"admission_time",
			"discharge_datetime",
			"discharge_ordered_date",
			"modified",
		],
		limit=50,
	)
	rows.sort(key=_admission_sort_ts, reverse=True)
	return [_serialize_admission_option(row) for row in rows[:25]]


def _serialize_admission(admission_name: str) -> dict | None:
	if not admission_name or not frappe.db.exists("Inpatient Admission", admission_name):
		return None
	row = frappe.db.get_value(
		"Inpatient Admission",
		admission_name,
		[
			"name",
			"patient",
			"patient_name",
			"status",
			"admitted_datetime",
			"admission_date",
			"admission_time",
			"discharge_datetime",
			"discharge_ordered_date",
			"expected_discharge",
			"primary_practitioner",
			"admission_practitioner",
			"medical_department",
			"cost_center",
			"bed_no",
			"allergies",
			"medication_history",
			"medical_history",
			"surgical_history",
			"discharge_instructions",
			"discharge_note",
			"followup_date",
		],
		as_dict=True,
	)
	if not row:
		return None
	admitted = resolve_admission_datetime(
		row.admitted_datetime,
		row.admission_date,
		row.admission_time,
	)
	practitioner = row.primary_practitioner or row.admission_practitioner
	practitioner_name = ""
	if practitioner:
		practitioner_name = (
			frappe.db.get_value("Healthcare Practitioner", practitioner, "practitioner_name") or ""
		)
	return {
		"name": row.name,
		"patient": row.patient,
		"patient_name": row.patient_name,
		"status": row.status,
		"admitted_datetime": str(admitted) if admitted else None,
		"discharge_datetime": str(row.discharge_datetime) if row.discharge_datetime else None,
		"discharge_ordered_date": str(row.discharge_ordered_date) if row.discharge_ordered_date else None,
		"expected_discharge": str(row.expected_discharge) if row.expected_discharge else None,
		"primary_practitioner": practitioner,
		"primary_practitioner_name": practitioner_name,
		"medical_department": row.medical_department,
		"cost_center": row.cost_center,
		"bed_no": row.bed_no,
		"allergies": row.allergies or "",
		"medication_history": row.medication_history or "",
		"medical_history": row.medical_history or "",
		"surgical_history": row.surgical_history or "",
		"discharge_instructions": row.discharge_instructions or "",
		"discharge_note": row.discharge_note or "",
		"followup_date": str(row.followup_date) if row.followup_date else None,
	}


def _serialize_admission_signatures(admission_name: str) -> dict:
	"""Return admission signature + e_signatures child rows for clinical summary."""
	if not admission_name or not frappe.db.exists("Inpatient Admission", admission_name):
		return {"signature": None, "e_signatures": []}

	signature = frappe.db.get_value("Inpatient Admission", admission_name, "signature") or None
	e_signatures = []
	try:
		doc = frappe.get_doc("Inpatient Admission", admission_name)
		for row in getattr(doc, "e_signatures", []) or []:
			e_signatures.append(
				{
					"file_name": getattr(row, "file_name", None),
					"document_type": getattr(row, "document_type", None),
					"transaction_no": getattr(row, "transaction_no", None),
					"upload_remarks": getattr(row, "upload_remarks", None),
					"document": getattr(row, "document", None),
				}
			)
	except Exception:
		e_signatures = []

	return {"signature": signature, "e_signatures": e_signatures}


def _serialize_discharge(admission_name: str) -> dict | None:
	rows = frappe.get_all(
		"Discharge",
		filters={"admission": admission_name, "docstatus": ["!=", 2]},
		fields=[
			"name",
			"docstatus",
			"discharge_type",
			"discharge_date",
			"discharge_time",
			"final_discharge_date",
			"final_discharge_time",
			"discharge_diagnosis",
			"discharge_treatment_plan",
			"discharge_reason",
			"discharge_conditions",
			"discharge_instructions",
			"discharge_medic_stopped_why",
			"duration",
			"next_appointment_date",
			"modified",
			"creation",
		],
		limit=10,
	)
	if not rows:
		return None
	rows.sort(
		key=lambda r: _sortable_ts(
			r.discharge_date or r.final_discharge_date or r.creation or r.modified
		),
		reverse=True,
	)
	doc = rows[0]
	stopped = get_stopped_medications_for_admission(admission_name)
	return {
		**doc,
		"docstatus": cint(doc.docstatus),
		"display_discharge_date": doc.discharge_date or doc.final_discharge_date,
		"stopped_medications": stopped or [],
	}


def _clinical_notes_for_admission(admission_name: str, patient: str) -> list[dict]:
	base_filters = {"patient": patient, "docstatus": ["!=", 2]}
	fields = [
		"name",
		"patient",
		"posting_date",
		"practitioner",
		"clinical_note_type",
		"medical_role",
		"note",
		"inpatient_admission",
		"reference_doctype",
		"reference_document",
	]
	notes_a = frappe.get_all(
		"Clinical Note",
		filters={**base_filters, "inpatient_admission": admission_name},
		fields=fields,
		order_by="posting_date asc, creation asc",
		limit=100,
		ignore_permissions=True,
	)
	notes_b = frappe.get_all(
		"Clinical Note",
		filters={
			**base_filters,
			"reference_doctype": "Inpatient Admission",
			"reference_document": admission_name,
		},
		fields=fields,
		order_by="posting_date asc, creation asc",
		limit=100,
		ignore_permissions=True,
	)
	seen = set()
	out = []
	for note in list(notes_a) + list(notes_b):
		if note.name in seen:
			continue
		seen.add(note.name)
		out.append(_enrich_clinical_note_row(dict(note)))
	out.sort(key=lambda n: (n.get("posting_date") or "", n.get("name") or ""))
	return out


def _history_form_for_admission(admission_name: str) -> dict | None:
	name = frappe.db.get_value(
		"Patient History",
		{"inpatient_admission": admission_name},
		"name",
		order_by="creation desc",
	)
	if not name:
		return None
	doc = frappe.get_doc("Patient History", name)
	rows = []
	for child in doc.history_detail or []:
		description = (child.description or "").strip()
		field_1 = (child.field_1 or "").strip()
		attrib_note_2 = (child.attrib_note_2 or "").strip()
		if not (description or field_1 or attrib_note_2):
			continue
		rows.append(
			{
				"attribute": child.attribute or "",
				"description": description,
				"field_1": field_1,
				"attrib_note_2": attrib_note_2,
				"order_no": cint(child.order_no),
			}
		)
	rows.sort(key=lambda r: (r["order_no"], r["attribute"]))
	return {
		"name": doc.name,
		"template": doc.template,
		"date": str(doc.date) if doc.date else None,
		"history_detail": rows,
	}


def _medical_history_for_admission(patient: str, admission_name: str) -> dict | None:
	filters = {"patient": patient, "inpatient_admission": admission_name}
	name = frappe.db.get_value("Patient Medical History", filters, "name", order_by="modified desc")
	if not name:
		name = frappe.db.get_value("Patient Medical History", {"patient": patient}, "name", order_by="modified desc")
	if not name:
		return None
	doc = frappe.get_doc("Patient Medical History", name)
	return {
		"name": doc.name,
		"inpatient_admission": doc.get("inpatient_admission"),
		"no_known_allergies": cint(doc.get("no_known_allergies")),
		"allergies": doc.get("allergies") or "",
		"current_and_past_medications": doc.get("current_and_past_medications") or "",
		"other_ongoing_illness": doc.get("other_ongoing_illness") or "",
		"previous_surgical_history": doc.get("previous_surgical_history") or "",
	}


@frappe.whitelist()
def get_admission_clinical_bundle(patient=None, admission=None):
	"""Return clinical bundle for one inpatient admission (default: latest discharged)."""
	if not _user_can_read_bundle():
		frappe.throw(_("Not permitted to view admission clinical history"), frappe.PermissionError)

	patient = (patient or "").strip()
	if not patient:
		frappe.throw(_("Patient is required"))
	if not frappe.db.exists("Patient", patient):
		frappe.throw(_("Patient {0} not found").format(patient))

	admission = (admission or "").strip() or None
	if not admission:
		admission = _pick_default_admission(patient)
	if not admission:
		return {
			"patient": patient,
			"admission": None,
			"admission_options": [],
			"has_data": False,
		}

	if frappe.db.get_value("Inpatient Admission", admission, "patient") != patient:
		frappe.throw(_("Admission {0} does not belong to this patient").format(admission))

	admission_options = _admission_options_for_patient(patient)

	admission_doc = _serialize_admission(admission)
	discharge_doc = _serialize_discharge(admission)

	diagnoses = []
	if _user_can_read_medical_diagnosis_portal() or frappe.has_permission("Medical Diagnosis Entry", "read"):
		try:
			diagnoses = get_inpatient_diagnoses(admission) or []
		except Exception:
			diagnoses = []

	prescriptions = []
	try:
		prescriptions = get_prescriptions_by_inpatient_record(admission) or []
	except Exception:
		prescriptions = []

	warnings = []
	try:
		warnings = get_warning_messages(patient=patient, type_of_warning="Medical") or []
	except Exception:
		warnings = []

	clinical_notes = _clinical_notes_for_admission(admission, patient)
	history_form = _history_form_for_admission(admission)
	medical_history = _medical_history_for_admission(patient, admission)
	signatures = _serialize_admission_signatures(admission)

	has_data = bool(
		admission_doc
		or discharge_doc
		or diagnoses
		or prescriptions
		or clinical_notes
		or history_form
		or warnings
		or medical_history
		or signatures.get("signature")
		or signatures.get("e_signatures")
	)

	return {
		"patient": patient,
		"admission": admission,
		"admission_options": admission_options,
		"admission_doc": admission_doc,
		"discharge": discharge_doc,
		"diagnoses": diagnoses,
		"prescriptions": prescriptions,
		"clinical_notes": clinical_notes,
		"history_form": history_form,
		"medical_history": medical_history,
		"warnings": warnings,
		"signature": signatures.get("signature"),
		"e_signatures": signatures.get("e_signatures") or [],
		"has_data": has_data,
	}
