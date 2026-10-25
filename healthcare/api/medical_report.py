# -*- coding: utf-8 -*-
# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import cint

from healthcare.api.common import fill_missing_practitioner_names

# IP Medical Report has no stored practitioner_name field, so list rows would
# otherwise show the raw Healthcare Practitioner id. The API resolves the
# display name from the master (same pattern as Inpatient Admission).
IP_MEDICAL_REPORT_FIELDS = [
	"name",
	"patient",
	"patient_name",
	"case_no",
	"admission_date",
	"discharge_date",
	"practitioner",
	"report_status",
	"creation",
]

IP_MEDICAL_REPORT_PRACTITIONER_NAME_FIELDS = {
	"practitioner": "practitioner_name",
}


@frappe.whitelist()
def get_ip_medical_reports(patient=None, limit=100, offset=0):
	"""List IP Medical Reports with the consultant's display name resolved."""
	filters = {"patient": patient} if patient else None
	rows = frappe.get_list(
		"IP Medical Report",
		filters=filters,
		fields=IP_MEDICAL_REPORT_FIELDS,
		order_by="modified desc",
		limit_page_length=cint(limit) or 100,
		limit_start=cint(offset),
	)
	fill_missing_practitioner_names(
		rows, IP_MEDICAL_REPORT_PRACTITIONER_NAME_FIELDS
	)
	return rows
