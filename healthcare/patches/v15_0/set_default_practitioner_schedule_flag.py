"""Mark Default Weekday Practitioner Schedule as the system default."""

import frappe


def execute():
	if not frappe.db.exists("Practitioner Schedule", "Default Weekday"):
		return

	frappe.db.set_value("Practitioner Schedule", "Default Weekday", "default", 1, update_modified=False)
