"""Create Pharmacy Dashboard Workspace if it does not exist (sidebar link; name avoids DocType conflict)."""
import frappe


def execute():
	if frappe.db.exists("Workspace", "Pharmacy Dashboard"):
		return
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
