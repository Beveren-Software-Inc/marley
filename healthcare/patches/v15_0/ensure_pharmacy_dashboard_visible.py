"""Ensure Pharmacy Dashboard workspace exists and is visible in boot (so /desk/pharmacy-dashboard resolves)."""
import frappe


def execute():
	if not frappe.db.exists("Workspace", "Pharmacy Dashboard"):
		path = frappe.get_app_path("healthcare", "healthcare", "workspace", "pharmacy", "pharmacy.json")
		try:
			from frappe.modules.import_file import import_file_by_path
			import_file_by_path(path, force=True, ignore_version=True)
			frappe.db.commit()
		except Exception:
			ws = frappe.new_doc("Workspace")
			ws.title = "Pharmacy Dashboard"
			ws.icon = "prescription"
			ws.label = "Pharmacy Dashboard"
			ws.module = "Healthcare"
			ws.public = 1
			ws.is_hidden = 0
			ws.content = "[]"
			ws.insert(ignore_permissions=True)
			frappe.db.commit()
	else:
		# Ensure it is visible in get_workspace_sidebar_items (public, not hidden)
		frappe.db.set_value(
			"Workspace",
			"Pharmacy Dashboard",
			{"public": 1, "is_hidden": 0},
			update_modified=False,
		)
		frappe.db.commit()
