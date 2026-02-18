"""Ensure Healthcare app icon exists on the desk and is visible to all users (v15/v16)."""
import frappe


def execute():
	"""Create or update Healthcare Desktop Icon so it appears on the desk for everyone."""
	if "healthcare" not in frappe.get_installed_apps():
		return

	try:
		from frappe.desk.doctype.desktop_icon.desktop_icon import (
			create_desktop_icons_from_installed_apps,
			clear_desktop_icons_cache,
		)

		# Create app icons if Healthcare icon is missing
		if not frappe.db.exists("Desktop Icon", {"icon_type": "App", "app": "healthcare"}):
			create_desktop_icons_from_installed_apps()
			clear_desktop_icons_cache()
			frappe.db.commit()

		# Ensure Healthcare icon is standard (visible to all users) and has logo + fallback icon
		app_title = frappe.get_hooks("app_title", app_name="healthcare")[0]
		app_details = frappe.get_hooks("add_to_apps_screen", app_name="healthcare")
		app_icon = frappe.get_hooks("app_icon", app_name="healthcare")
		app_icon_url = frappe.get_hooks("app_icon_url", app_name="healthcare")

		icon_name = frappe.db.get_value(
			"Desktop Icon",
			{"icon_type": "App", "app": "healthcare"},
			"name",
		)
		if icon_name and app_details:
			logo_url = app_details[0].get("logo") or (app_icon_url[0] if app_icon_url else None)
			icon_class = app_icon[0] if app_icon else "octicon octicon-file-directory"
			frappe.db.set_value("Desktop Icon", icon_name, "standard", 1)
			if logo_url:
				frappe.db.set_value("Desktop Icon", icon_name, "logo_url", logo_url)
			frappe.db.set_value("Desktop Icon", icon_name, "icon", icon_class)
			frappe.db.set_value("Desktop Icon", icon_name, "label", app_title)
			frappe.db.set_value("Desktop Icon", icon_name, "link", app_details[0].get("route", "/desk/healthcare"))
			frappe.db.commit()
			clear_desktop_icons_cache()
	except Exception:
		pass
