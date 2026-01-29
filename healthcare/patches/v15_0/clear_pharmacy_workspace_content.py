"""Clear Pharmacy Dashboard workspace content so user can add Custom HTML via UI."""
import frappe


def execute():
	if not frappe.db.exists("Workspace", "Pharmacy Dashboard"):
		return
	frappe.db.set_value("Workspace", "Pharmacy Dashboard", "content", "[]")
	frappe.db.commit()
