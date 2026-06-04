# healthcare/api/diagnosis.py

import frappe
from frappe import _

from healthcare.api.medical_diagnosis_entry import (
	delete_entry,
	list_for_context,
	save_for_context,
)


@frappe.whitelist()
def update_inpatient_diagnoses(admission: str, diagnoses: list):
	"""Replace all diagnoses for an inpatient admission (Medical Diagnosis Entry)."""
	if not admission:
		frappe.throw(_("Admission is required"))
	return save_for_context("Inpatient Admission", admission, diagnoses)


@frappe.whitelist()
def add_inpatient_diagnoses(admission: str, diagnoses: list):
	"""Append diagnoses to an inpatient admission."""
	if not admission:
		frappe.throw(_("Admission is required"))

	if not diagnoses or not isinstance(diagnoses, list):
		frappe.throw(_("Diagnoses list is required"))

	existing = list_for_context("Inpatient Admission", admission)
	merged = existing + diagnoses
	return save_for_context("Inpatient Admission", admission, merged)


@frappe.whitelist()
def get_inpatient_diagnoses(admission: str):
	"""Get all Medical Diagnosis Entry rows for an inpatient admission."""
	if not admission:
		frappe.throw(_("Admission is required"))
	return list_for_context("Inpatient Admission", admission)


@frappe.whitelist()
def delete_inpatient_diagnosis(admission: str, diagnosis_row_name: str):
	"""Delete one Medical Diagnosis Entry (admission arg kept for API compatibility)."""
	if not diagnosis_row_name:
		frappe.throw(_("Diagnosis entry name is required"))
	return delete_entry(diagnosis_row_name)
