import frappe


def execute():
	"""Patient Appointment.department must link to Medical Department, not ERPNext Department."""
	frappe.db.set_value(
		"DocField",
		{"parent": "Patient Appointment", "fieldname": "department"},
		"options",
		"Medical Department",
	)
	frappe.clear_cache(doctype="Patient Appointment")
