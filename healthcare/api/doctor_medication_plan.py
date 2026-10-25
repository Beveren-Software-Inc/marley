# -*- coding: utf-8 -*-
# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import cint

from healthcare.api.common import fill_missing_practitioner_names

# Doctor Medication Plan has no stored practitioner_name field, so list rows
# would otherwise show the raw Healthcare Practitioner id. The API resolves the
# display name from the master (same pattern as Inpatient Admission).
DOCTOR_MEDICATION_PLAN_FIELDS = [
	"name",
	"patient",
	"posting_date",
	"practitioner",
	"medical_role",
	"reference_doctype",
	"reference_document",
	"plan",
	"recommendation",
	"reception_note",
]

DOCTOR_MEDICATION_PLAN_PRACTITIONER_NAME_FIELDS = {
	"practitioner": "practitioner_name",
}


@frappe.whitelist()
def get_doctor_medication_plans(
	limit=50,
	offset=0,
	patient=None,
	reference_doctype=None,
	reference_document=None,
	practitioner=None,
	from_date=None,
	to_date=None,
):
	"""List Doctor Medication Plans with the doctor's display name resolved."""
	filters = {}
	if patient:
		filters["patient"] = patient
	if reference_doctype:
		filters["reference_doctype"] = reference_doctype
	if reference_document:
		filters["reference_document"] = reference_document
	if practitioner:
		filters["practitioner"] = practitioner
	if from_date and to_date:
		filters["posting_date"] = ["between", [from_date, to_date]]
	elif from_date:
		filters["posting_date"] = [">=", from_date]
	elif to_date:
		filters["posting_date"] = ["<=", to_date]

	rows = frappe.get_list(
		"Doctor Medication Plan",
		filters=filters or None,
		fields=DOCTOR_MEDICATION_PLAN_FIELDS,
		order_by="modified desc",
		limit_page_length=cint(limit) or 50,
		limit_start=cint(offset),
	)
	fill_missing_practitioner_names(
		rows, DOCTOR_MEDICATION_PLAN_PRACTITIONER_NAME_FIELDS
	)
	return rows
