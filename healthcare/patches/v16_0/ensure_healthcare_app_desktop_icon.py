"""Ensure the Healthcare App desktop icon is visible on Desktop Icons mode.

Does not change Desktop Settings.desktop_page. Apps mode continues to use
``add_to_apps_screen`` (route ``/health``) independently of this row.
"""
import frappe


def execute():
	if "healthcare" not in frappe.get_installed_apps():
		return

	try:
		from frappe.desk.doctype.desktop_icon.desktop_icon import (
			clear_desktop_icons_cache,
			clear_every_users_desktop_icons,
			create_desktop_icons_from_installed_apps,
		)
		from healthcare.setup import (
			_create_healthcare_role_desktop_icons,
			_ensure_healthcare_desktop_icon_visible,
		)

		create_desktop_icons_from_installed_apps()
		_ensure_healthcare_desktop_icon_visible()
		_create_healthcare_role_desktop_icons()
		clear_every_users_desktop_icons()
		clear_desktop_icons_cache()
		frappe.db.commit()
	except Exception:
		frappe.log_error(frappe.get_traceback(), "Healthcare app desktop icon patch")
		raise
