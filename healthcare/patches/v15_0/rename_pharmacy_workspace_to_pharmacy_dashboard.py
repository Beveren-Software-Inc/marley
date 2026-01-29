"""Rename Workspace Pharmacy to Pharmacy Dashboard to avoid conflict with DocType Pharmacy."""
import frappe


def execute():
	if not frappe.db.exists("Workspace", "Pharmacy"):
		return
	if frappe.db.exists("Workspace", "Pharmacy Dashboard"):
		frappe.delete_doc("Workspace", "Pharmacy", force=True)
		frappe.db.commit()
		return
	frappe.rename_doc("Workspace", "Pharmacy", "Pharmacy Dashboard", force=True)
	frappe.db.commit()
