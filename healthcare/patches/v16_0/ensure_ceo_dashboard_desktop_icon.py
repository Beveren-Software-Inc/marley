"""Ensure the CEO desk icon opens the CEO Dashboard workspace (not Healthcare Settings).

Root cause: the CEO Sidebar was under module ``Private``. Private shells drop shipped
sidebar rows at boot, so the icon had no landing route. Healthcare's own shell then
surfaced first (Healthcare Settings) when navigation fell through.

Also clears ``Workspace.for_user`` on the public CEO Dashboard so it is not treated as
Administrator-only.
"""
import frappe


CEO_WORKSPACE = "CEO"
CEO_TITLE = "CEO Dashboard"
CEO_ICON = "circle-user-round"
CEO_DESK_ROUTE = "/desk/ceo"


def execute():
	if "healthcare" not in frappe.get_installed_apps():
		return

	try:
		_ensure_ceo_role()
		_fix_ceo_workspace()
		_fix_ceo_sidebar()
		_fix_ceo_desktop_icon()
		frappe.db.commit()
		_clear_caches()
	except Exception:
		frappe.log_error(frappe.get_traceback(), "Healthcare CEO dashboard desktop icon patch")
		raise


def _ensure_ceo_role():
	if not frappe.db.exists("Role", "CEO"):
		frappe.get_doc({"doctype": "Role", "role_name": "CEO", "desk_access": 1}).insert(
			ignore_permissions=True
		)


def _fix_ceo_workspace():
	if not frappe.db.exists("Workspace", CEO_WORKSPACE):
		return

	frappe.db.set_value("Workspace", CEO_WORKSPACE, "for_user", "")
	frappe.db.set_value("Workspace", CEO_WORKSPACE, "public", 1)
	frappe.db.set_value("Workspace", CEO_WORKSPACE, "is_hidden", 0)
	frappe.db.set_value("Workspace", CEO_WORKSPACE, "module", "Healthcare")
	frappe.db.set_value("Workspace", CEO_WORKSPACE, "title", CEO_TITLE)

	# Keep CEO-only visibility via workspace roles when the role table is empty
	if not frappe.db.exists("Has Role", {"parent": CEO_WORKSPACE, "parenttype": "Workspace", "role": "CEO"}):
		frappe.get_doc(
			{
				"doctype": "Has Role",
				"parent": CEO_WORKSPACE,
				"parenttype": "Workspace",
				"parentfield": "roles",
				"role": "CEO",
			}
		).insert(ignore_permissions=True)


def _fix_ceo_sidebar():
	"""CEO Sidebar must live under Healthcare — Private shells discard shipped rows."""
	if frappe.db.exists("Sidebar", CEO_WORKSPACE):
		frappe.db.set_value("Sidebar", CEO_WORKSPACE, "module", "Healthcare")
		frappe.db.set_value("Sidebar", CEO_WORKSPACE, "app", "healthcare")
		frappe.db.set_value("Sidebar", CEO_WORKSPACE, "title", "CEO")
		if not frappe.db.get_value("Sidebar", CEO_WORKSPACE, "header_icon"):
			frappe.db.set_value("Sidebar", CEO_WORKSPACE, "header_icon", CEO_ICON)

		# Ensure the workspace link exists as first item
		has_link = frappe.db.exists(
			"Sidebar Item",
			{
				"parent": CEO_WORKSPACE,
				"parenttype": "Sidebar",
				"link_type": "Workspace",
				"link_to": CEO_WORKSPACE,
			},
		)
		if not has_link:
			frappe.get_doc(
				{
					"doctype": "Sidebar Item",
					"parent": CEO_WORKSPACE,
					"parenttype": "Sidebar",
					"parentfield": "items",
					"type": "Link",
					"label": CEO_TITLE,
					"link_type": "Workspace",
					"link_to": CEO_WORKSPACE,
					"idx": 1,
				}
			).insert(ignore_permissions=True)

	# Legacy Workspace Sidebar (v15 leftovers)
	if frappe.db.exists("Workspace Sidebar", CEO_WORKSPACE):
		frappe.db.set_value("Workspace Sidebar", CEO_WORKSPACE, "module", "Healthcare")
		frappe.db.set_value("Workspace Sidebar", CEO_WORKSPACE, "app", "healthcare")


def _fix_ceo_desktop_icon():
	"""Recreate a visible top-level CEO icon.

	Frappe v16 hides workspace-derived icons for portal apps (Healthcare links to
	``/health``, not ``/desk``). Nesting under the Healthcare App folder also makes
	the icon disappear from the main grid. Keep CEO as a top-level External link.
	"""
	from frappe.desk.doctype.desktop_icon.desktop_icon import (
		clear_desktop_icons_cache,
		clear_every_users_desktop_icons,
	)

	existing = frappe.db.get_value("Desktop Icon", {"label": "CEO"}, "name")
	values = {
		"label": "CEO",
		"icon_type": "Link",
		"link_type": "External",
		"link": CEO_DESK_ROUTE,
		"link_to": "",
		"icon": CEO_ICON,
		"standard": 1,
		"hidden": 0,
		"app": "healthcare",
		# Top-level on the desk grid (not inside the Healthcare folder)
		"parent_icon": "",
	}

	if existing:
		for field, value in values.items():
			frappe.db.set_value("Desktop Icon", existing, field, value)
	else:
		icon = frappe.new_doc("Desktop Icon")
		icon.update(values)
		icon.insert(ignore_permissions=True)

	clear_every_users_desktop_icons()
	clear_desktop_icons_cache()
	_inject_ceo_into_desktop_layouts(values)


def _inject_ceo_into_desktop_layouts(icon_values: dict):
	"""Saved Desktop Layouts pin a fixed icon list — new icons do not appear until added."""
	import json

	if not frappe.db.exists("DocType", "Desktop Layout"):
		return

	payload = {
		"label": "CEO",
		"name": "CEO",
		"bg_color": "gray",
		"link": icon_values.get("link") or CEO_DESK_ROUTE,
		"link_type": icon_values.get("link_type") or "External",
		"app": icon_values.get("app") or "healthcare",
		"icon_type": icon_values.get("icon_type") or "Link",
		"parent_icon": "",
		"icon": icon_values.get("icon") or CEO_ICON,
		"link_to": None,
		"idx": 0,
		"standard": 1,
		"logo_url": None,
		"hidden": 0,
		"restrict_removal": 0,
		"icon_image": None,
	}

	for row in frappe.get_all("Desktop Layout", fields=["name", "layout"]):
		try:
			layout = json.loads(row.layout or "[]")
		except Exception:
			continue
		if not isinstance(layout, list):
			continue

		items = [i for i in layout if isinstance(i, dict)]
		existing = next(
			(i for i in items if i.get("label") == "CEO" or i.get("name") == "CEO"),
			None,
		)
		if existing:
			existing.update(
				{
					"link": payload["link"],
					"link_type": payload["link_type"],
					"hidden": 0,
					"parent_icon": "",
					"icon": payload["icon"],
					"standard": 1,
					"app": payload["app"],
				}
			)
		else:
			items.insert(0, dict(payload))

		for idx, item in enumerate(items):
			item["idx"] = idx

		frappe.db.set_value("Desktop Layout", row.name, "layout", json.dumps(items))


def _clear_caches():
	frappe.clear_cache()
	try:
		from frappe.desk.doctype.desktop_icon.desktop_icon import (
			clear_desktop_icons_cache,
			clear_every_users_desktop_icons,
		)

		clear_every_users_desktop_icons()
		clear_desktop_icons_cache()
	except Exception:
		pass
