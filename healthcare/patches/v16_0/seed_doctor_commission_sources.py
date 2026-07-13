# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe


DEFAULT_SOURCES = [
	{"source_doctype": "Session Schedule", "practitioner_field": "doctor"},
	{"source_doctype": "Service Request", "practitioner_field": "practitioner"},
	{"source_doctype": "Patient Visit", "practitioner_field": "practitioner"},
	{"source_doctype": "Patient Appointment", "practitioner_field": "practitioner"},
	{"source_doctype": "IP Service", "practitioner_field": "practioner"},
	{"source_doctype": "Therapy Session", "practitioner_field": "practitioner"},
]


def execute():
	"""Seed Doctor Commission Source rows for common commissionable DocTypes."""
	if not frappe.db.exists("DocType", "Doctor Commission Source"):
		return

	for row in DEFAULT_SOURCES:
		dt = row["source_doctype"]
		if not frappe.db.exists("DocType", dt):
			continue
		if frappe.db.exists("Doctor Commission Source", dt):
			continue

		field = row.get("practitioner_field")
		# Only set practitioner_field when it exists and is a Healthcare Practitioner link.
		practitioner_field = None
		if field:
			try:
				meta = frappe.get_meta(dt)
				df = meta.get_field(field)
				if df and df.fieldtype == "Link" and df.options == "Healthcare Practitioner":
					practitioner_field = field
			except Exception:
				practitioner_field = None

		doc = frappe.get_doc(
			{
				"doctype": "Doctor Commission Source",
				"source_doctype": dt,
				"enabled": 1,
				"practitioner_field": practitioner_field,
				"remarks": "Seeded default commissionable source",
			}
		)
		doc.insert(ignore_permissions=True)

	frappe.db.commit()
