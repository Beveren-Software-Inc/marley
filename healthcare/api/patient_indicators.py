# Copyright (c) 2026, healthcare contributors
"""WF-068 / DOC-095 / DOC-096 - patient status and admission summary widgets.

WF-068  'Medication Ongoing' must apply to outpatients on an active prescription,
        not only to admitted patients.
DOC-095 Last Doctor Order summary for the current admission.
DOC-096 Last Warning Message summary for the current admission.
"""

from __future__ import annotations

import frappe
from frappe.utils import add_days, getdate, nowdate

# A prescription is considered active for this many days after it was raised.
ACTIVE_MEDICATION_WINDOW_DAYS = 30


@frappe.whitelist()
def has_active_medication(patient: str) -> bool:
	"""True when the patient has a recent, non-cancelled medication order."""
	if not patient:
		return False

	cutoff = add_days(getdate(nowdate()), -ACTIVE_MEDICATION_WINDOW_DAYS)
	return bool(
		frappe.db.exists(
			"Patient Medication Order",
			{
				"patient": patient,
				"docstatus": ["<", 2],
				"posting_date": [">=", cutoff],
			},
		)
	)


@frappe.whitelist()
def get_patient_indicators(patients: str | list) -> dict:
	"""Bulk helper for the patient list - {patient: {has_active_medication: bool}}."""
	if isinstance(patients, str):
		patients = frappe.parse_json(patients)
	patients = [p for p in (patients or []) if p]
	if not patients:
		return {}

	cutoff = add_days(getdate(nowdate()), -ACTIVE_MEDICATION_WINDOW_DAYS)
	rows = frappe.get_all(
		"Patient Medication Order",
		filters={
			"patient": ["in", patients],
			"docstatus": ["<", 2],
			"posting_date": [">=", cutoff],
		},
		fields=["patient"],
		distinct=True,
	)
	active = {r.patient for r in rows}
	return {p: {"has_active_medication": p in active} for p in patients}


@frappe.whitelist()
def get_admission_summary(admission: str) -> dict:
	"""DOC-095 / DOC-096 - last doctor order and last warning for an admission."""
	if not admission or not frappe.db.exists("Inpatient Admission", admission):
		return {}

	patient = frappe.db.get_value("Inpatient Admission", admission, "patient")

	last_order = frappe.get_all(
		"Doctor Order",
		filters={"patient": patient},
		fields=["name", "creation", "owner"],
		order_by="creation desc",
		limit=1,
	)
	order = last_order[0] if last_order else None
	if order:
		meta = frappe.get_meta("Doctor Order")
		for candidate in ("order_description", "description", "doctor_order", "remarks"):
			if meta.has_field(candidate):
				order["text"] = frappe.db.get_value("Doctor Order", order["name"], candidate)
				break

	last_warning = frappe.get_all(
		"Warning Message",
		filters={"patient": patient},
		fields=["name", "warning", "type_of_warning", "creation"],
		order_by="creation desc",
		limit=1,
	)

	return {
		"admission": admission,
		"patient": patient,
		"last_doctor_order": order,
		"last_warning_message": last_warning[0] if last_warning else None,
	}


@frappe.whitelist()
def get_overdue_clinical_actions(cost_center: str | None = None, limit: int = 25) -> list[dict]:
	"""DOC-008 - overdue clinical actions for the doctor landing dashboard."""
	items: list[dict] = []

	# lab results waiting on doctor review
	lab_filters = {"status": "Pending Review", "docstatus": ["<", 2]}
	if cost_center:
		lab_filters["cost_center"] = cost_center
	for row in frappe.get_all(
		"Lab Test",
		filters=lab_filters,
		fields=["name", "patient", "patient_name", "template", "creation"],
		order_by="creation asc",
		limit_page_length=limit,
	):
		items.append({
			"type": "Lab result awaiting review",
			"reference_doctype": "Lab Test",
			"reference": row.name,
			"patient": row.patient,
			"patient_name": row.patient_name,
			"detail": row.template,
			"since": row.creation,
		})

	# follow-ups past their due date and still open
	for row in frappe.get_all(
		"Patient Follow Up",
		filters={"status": "Open", "follow_up_date": ["<", nowdate()]},
		fields=["name", "patient", "patient_name", "follow_up_type", "follow_up_date"],
		order_by="follow_up_date asc",
		limit_page_length=limit,
	):
		items.append({
			"type": "Follow-up overdue",
			"reference_doctype": "Patient Follow Up",
			"reference": row.name,
			"patient": row.patient,
			"patient_name": row.patient_name,
			"detail": row.follow_up_type,
			"since": row.follow_up_date,
		})

	# visits left open past their encounter date
	for row in frappe.get_all(
		"Patient Visit",
		filters={"status": "Open", "encounter_date": ["<", nowdate()], "docstatus": ["<", 2]},
		fields=["name", "patient", "patient_name", "visit_type", "encounter_date"],
		order_by="encounter_date asc",
		limit_page_length=limit,
	):
		items.append({
			"type": "Visit documentation incomplete",
			"reference_doctype": "Patient Visit",
			"reference": row.name,
			"patient": row.patient,
			"patient_name": row.patient_name,
			"detail": row.visit_type,
			"since": row.encounter_date,
		})

	items.sort(key=lambda x: str(x.get("since") or ""))
	return items[:limit]
