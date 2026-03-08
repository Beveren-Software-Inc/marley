"""Create Doctor, Reception, Nurse, Pharmacist, Laboratory desktop icons (like HRMS/ERPNext module icons)."""
import frappe


def execute():
	if "healthcare" not in frappe.get_installed_apps():
		return

	try:
		from frappe.desk.doctype.desktop_icon.desktop_icon import clear_desktop_icons_cache

		healthcare_icon = frappe.db.get_value(
			"Desktop Icon",
			{"icon_type": "App", "app": "healthcare"},
			"name",
		)
		if not healthcare_icon:
			from frappe.desk.doctype.desktop_icon.desktop_icon import (
				create_desktop_icons_from_installed_apps,
			)
			create_desktop_icons_from_installed_apps()
			frappe.db.commit()
			healthcare_icon = frappe.db.get_value(
				"Desktop Icon",
				{"icon_type": "App", "app": "healthcare"},
				"name",
			)
		if not healthcare_icon:
			return

		# Role-based icons: label -> (link, icon) — like HRMS Expenses, Leaves, ERPNext Selling, etc.
		role_icons = [
			("Doctor", "/health/doctor", "user-md"),
			("Reception", "/health/reception", "layout-list"),
			("Nurse", "/health/nurse", "heart-pulse"),
			("Pharmacist", "/health/pharmacy", "pill"),
			("Laboratory", "/health/lab", "flask"),
		]

		idx = 0
		for label, link, icon in role_icons:
			existing = frappe.db.get_value(
				"Desktop Icon",
				{"label": label, "link_type": "External", "parent_icon": healthcare_icon},
				"name",
			)
			if existing:
				frappe.db.set_value("Desktop Icon", existing, "standard", 1)
				frappe.db.set_value("Desktop Icon", existing, "hidden", 0)
				frappe.db.set_value("Desktop Icon", existing, "link", link)
				idx += 1
				continue
			if frappe.db.exists("Desktop Icon", {"label": label, "link_type": "External", "link": link}):
				# Update parent and standard if it exists without parent
				frappe.db.set_value("Desktop Icon", label, "parent_icon", healthcare_icon)
				frappe.db.set_value("Desktop Icon", label, "standard", 1)
				idx += 1
				continue
			icon_doc = frappe.new_doc("Desktop Icon")
			icon_doc.label = label
			icon_doc.icon_type = "Link"
			icon_doc.link_type = "External"
			icon_doc.link = link
			icon_doc.icon = icon
			icon_doc.standard = 1
			icon_doc.hidden = 0
			icon_doc.parent_icon = healthcare_icon
			icon_doc.idx = idx
			icon_doc.insert(ignore_permissions=True)
			idx += 1

		frappe.db.commit()
		clear_desktop_icons_cache()
	except Exception:
		frappe.log_error(frappe.get_traceback(), "Healthcare role desktop icons patch")
		raise
