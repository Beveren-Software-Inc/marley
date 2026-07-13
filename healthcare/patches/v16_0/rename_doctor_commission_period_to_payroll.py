# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.rename_doc import rename_doc


RENAMES = [
	("Doctor Commission Period Item", "Doctor Commission Payroll Item"),
	("Doctor Commission Period Doctor", "Doctor Commission Payroll Doctor"),
	("Doctor Commission Period", "Doctor Commission Payroll"),
]


def execute():
	"""Rename Doctor Commission Period DocTypes to Payroll before sync."""
	for old, new in RENAMES:
		if frappe.db.exists("DocType", old) and not frappe.db.exists("DocType", new):
			rename_doc("DocType", old, new, force=True, show_alert=False)
