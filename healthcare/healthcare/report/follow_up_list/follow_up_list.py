# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def execute(filters=None):
	"""List Patient Follow Up records excluding those marked 'No Follow Up Required'."""
	columns = [
		{"fieldname": "name", "label": _("ID"), "fieldtype": "Link", "options": "Patient Follow Up", "width": 120},
		{"fieldname": "patient", "label": _("Patient"), "fieldtype": "Link", "options": "Patient", "width": 120},
		{"fieldname": "patient_name", "label": _("Patient Name"), "fieldtype": "Data", "width": 150},
		{"fieldname": "follow_up_type", "label": _("Type"), "fieldtype": "Data", "width": 80},
		{"fieldname": "follow_up_date", "label": _("Follow Up Date"), "fieldtype": "Date", "width": 100},
		{"fieldname": "status", "label": _("Status"), "fieldtype": "Data", "width": 120},
		{"fieldname": "remarks", "label": _("Remarks"), "fieldtype": "Text", "width": 200},
	]
	data = frappe.get_all(
		"Patient Follow Up",
		filters=[
			["no_follow_up_required", "=", 0],
			["status", "!=", "No Follow Up Required"],
		],
		fields=["name", "patient", "patient_name", "follow_up_type", "follow_up_date", "status", "remarks"],
		order_by="follow_up_date asc, creation asc",
	)
	return columns, data
