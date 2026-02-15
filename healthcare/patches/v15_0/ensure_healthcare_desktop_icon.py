"""Ensure Healthcare app icon exists on the desk (v15/v16)."""
import frappe


def execute():
	"""Create Healthcare Desktop Icon if missing and clear cache so it appears."""
	if "healthcare" not in frappe.get_installed_apps():
		return

	if not frappe.db.exists("Desktop Icon", {"icon_type": "App", "app": "healthcare"}):
		try:
			from frappe.desk.doctype.desktop_icon.desktop_icon import (
				create_desktop_icons_from_installed_apps,
				clear_desktop_icons_cache,
			)
			create_desktop_icons_from_installed_apps()
			clear_desktop_icons_cache()
			frappe.db.commit()
		except Exception:
			pass
