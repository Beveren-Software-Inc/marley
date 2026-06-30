"""Install the Discharge Financial Check desk Page record."""

import os

import frappe


def execute():
	if "healthcare" not in frappe.get_installed_apps():
		return

	if frappe.db.exists("Page", "discharge-finance-checklist"):
		return

	path = frappe.get_app_path(
		"healthcare",
		"healthcare",
		"page",
		"discharge_finance_checklist",
		"discharge_finance_checklist.json",
	)
	if not os.path.exists(path):
		return

	try:
		from frappe.modules.import_file import import_file_by_path

		import_file_by_path(path, force=True, ignore_version=True)
		frappe.db.commit()
	except Exception:
		page = frappe.new_doc("Page")
		page.name = "discharge-finance-checklist"
		page.page_name = "discharge-finance-checklist"
		page.title = "Discharge Financial Check"
		page.module = "Healthcare"
		page.standard = "Yes"
		for role in ("Accounts Manager", "Accounts User", "Administrator", "System Manager"):
			page.append("roles", {"role": role})
		page.insert(ignore_permissions=True)
		frappe.db.commit()
