# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Temporary CEO-only unified staff activity audit (Activity Log + Route History + Version)."""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import add_days, cint, getdate, nowdate

AUDIT_VIEW_ROLES = frozenset({"CEO"})

SORT_COLUMNS = {
	"timestamp": "timestamp",
	"user": "user",
	"activity_type": "activity_type",
	"doctype": "doctype",
	"reference": "reference",
	"department": "department",
}


def _employee_department_by_user(user_ids=None):
	"""Map User → Employee.department for active employees with a linked user."""
	params = {}
	user_clause = ""
	if user_ids is not None:
		user_ids = [u for u in set(user_ids) if u]
		if not user_ids:
			return {}
		user_clause = "AND e.user_id IN %(users)s"
		params["users"] = user_ids

	rows = frappe.db.sql(
		f"""
		SELECT e.user_id, e.department
		FROM `tabEmployee` e
		INNER JOIN (
			SELECT user_id, MAX(name) AS name
			FROM `tabEmployee`
			WHERE status = 'Active'
			  AND IFNULL(user_id, '') != ''
			  AND IFNULL(department, '') != ''
			GROUP BY user_id
		) pick ON pick.name = e.name
		WHERE e.status = 'Active'
		  AND IFNULL(e.user_id, '') != ''
		  AND IFNULL(e.department, '') != ''
		  {user_clause}
		""",
		params or None,
		as_dict=True,
	)
	return {r.user_id: r.department for r in rows}


def _department_user_filter(department, params, alias="src.user"):
	"""SQL fragment restricting users to those whose Employee belongs to department."""
	if not department or department in ("", "all"):
		return ""
	params["department"] = department
	return f"""
		AND {alias} IN (
			SELECT e.user_id
			FROM `tabEmployee` e
			WHERE e.department = %(department)s
			  AND e.status = 'Active'
			  AND IFNULL(e.user_id, '') != ''
		)
	"""


def _can_view_audit():
	if frappe.session.user in ("Guest", ""):
		return False
	if frappe.session.user == "Administrator":
		return True
	return bool(set(frappe.get_roles(frappe.session.user)) & AUDIT_VIEW_ROLES)


def _require_ceo_access():
	if frappe.session.user in ("Guest", ""):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if frappe.session.user == "Administrator":
		return
	roles = set(frappe.get_roles(frappe.session.user))
	if not (roles & AUDIT_VIEW_ROLES):
		frappe.throw(_("Only users with the CEO role may view this report."), frappe.PermissionError)


def _date_bounds(from_date=None, to_date=None, period_days=7):
	today = getdate(nowdate())
	if not to_date:
		to_date = today
	else:
		to_date = getdate(to_date)
	if not from_date:
		from_date = add_days(to_date, -cint(period_days))
	else:
		from_date = getdate(from_date)
	return str(from_date), f"{to_date} 23:59:59"


def _summarize_version(data):
	if not data:
		return "created new document"
	try:
		d = json.loads(data)
	except Exception:
		return "edited document"
	changed = d.get("changed") or []
	added = d.get("added") or []
	removed = d.get("removed") or []
	row_changed = d.get("row_changed") or []

	if not (changed or added or removed or row_changed):
		return "created new document"

	parts = []
	if changed:
		names = [c[0] for c in changed if c and len(c) > 0]
		if len(names) == 1:
			parts.append(f"changed {names[0]}")
		elif len(names) <= 3:
			parts.append("changed " + ", ".join(names))
		else:
			parts.append(f"changed {len(names)} fields")
	if row_changed:
		parts.append(f"changed {len(row_changed)} child row(s)")
	if added:
		parts.append(f"added {len(added)} row(s)")
	if removed:
		parts.append(f"removed {len(removed)} row(s)")
	return "; ".join(parts) if parts else "edited document"


def _parse_route(route):
	if not route:
		return "Unknown page"
	route = str(route).strip()
	if route.startswith("List/"):
		return f"List: {route.split('/', 1)[-1]}"
	if route.startswith("Form/"):
		parts = route.split("/")
		if len(parts) >= 3:
			return f"{parts[1]} / {parts[2]}"
		return route
	return route


@frappe.whitelist()
def can_view_user_activity_audit():
	"""Return whether the current user may open the Staff Activity Audit report."""
	return _can_view_audit()


@frappe.whitelist()
def get_user_activity_filter_options(from_date=None, to_date=None, period_days=7):
	_require_ceo_access()
	from_dt, to_dt = _date_bounds(from_date, to_date, period_days)

	users = frappe.db.sql(
		"""
		SELECT DISTINCT u.name AS user, COALESCE(u.full_name, u.name) AS full_name
		FROM (
			SELECT user AS name FROM `tabActivity Log`
			WHERE creation BETWEEN %(f)s AND %(t)s AND user NOT IN ('Guest', 'Administrator')
			UNION
			SELECT user AS name FROM `tabRoute History`
			WHERE creation BETWEEN %(f)s AND %(t)s AND user NOT IN ('Guest', 'Administrator')
			UNION
			SELECT owner AS name FROM `tabVersion`
			WHERE creation BETWEEN %(f)s AND %(t)s AND owner NOT IN ('Guest', 'Administrator')
		) AS active_users
		JOIN `tabUser` u ON u.name = active_users.name
		WHERE u.enabled = 1
		ORDER BY full_name ASC, u.name ASC
		""",
		{"f": from_dt, "t": to_dt},
		as_dict=True,
	)

	doctypes = frappe.db.sql(
		"""
		SELECT DISTINCT ref_doctype AS doctype
		FROM `tabVersion`
		WHERE creation BETWEEN %(f)s AND %(t)s
		  AND ref_doctype IS NOT NULL AND ref_doctype != ''
		ORDER BY ref_doctype ASC
		""",
		{"f": from_dt, "t": to_dt},
		as_dict=True,
	)

	departments = frappe.db.sql(
		"""
		SELECT DISTINCT e.department AS department
		FROM `tabEmployee` e
		WHERE e.status = 'Active'
		  AND IFNULL(e.department, '') != ''
		  AND IFNULL(e.user_id, '') != ''
		  AND e.user_id IN (
			SELECT user AS name FROM `tabActivity Log`
			WHERE creation BETWEEN %(f)s AND %(t)s AND user NOT IN ('Guest', 'Administrator')
			UNION
			SELECT user AS name FROM `tabRoute History`
			WHERE creation BETWEEN %(f)s AND %(t)s AND user NOT IN ('Guest', 'Administrator')
			UNION
			SELECT owner AS name FROM `tabVersion`
			WHERE creation BETWEEN %(f)s AND %(t)s AND owner NOT IN ('Guest', 'Administrator')
		  )
		ORDER BY e.department ASC
		""",
		{"f": from_dt, "t": to_dt},
		as_dict=True,
	)

	return {
		"users": users,
		"doctypes": [r.doctype for r in doctypes],
		"departments": [r.department for r in departments],
	}


@frappe.whitelist()
def get_user_activity_report(
	from_date=None,
	to_date=None,
	period_days=7,
	user=None,
	doctype=None,
	department=None,
	activity_type=None,
	sort_by="timestamp",
	sort_order="desc",
	limit=100,
	offset=0,
):
	"""Unified staff activity timeline for CEO review."""
	_require_ceo_access()

	from_dt, to_dt = _date_bounds(from_date, to_date, period_days)
	limit = min(max(cint(limit) or 100, 1), 500)
	offset = max(cint(offset) or 0, 0)

	sort_key = (sort_by or "timestamp").strip().lower()
	sort_by_department = sort_key == "department"
	sort_col = SORT_COLUMNS.get(sort_key, "timestamp")
	if sort_by_department:
		sort_col = "timestamp"
	sort_dir = "ASC" if str(sort_order or "desc").lower() == "asc" else "DESC"

	user_filter = ""
	params = {"f": from_dt, "t": to_dt}

	if user and user not in ("", "all"):
		user_filter = "AND src.user = %(user)s"
		params["user"] = user

	doctype_filter = ""
	if doctype and doctype not in ("", "all"):
		doctype_filter = "AND src.doctype = %(doctype)s"
		params["doctype"] = doctype

	department_filter = _department_user_filter(department, params)

	type_filter = ""
	activity_type = (activity_type or "all").strip().lower()
	if activity_type == "login":
		type_filter = "AND src.activity_type IN ('Login', 'Logout', 'Impersonate')"
	elif activity_type == "route":
		type_filter = "AND src.activity_type = 'Route View'"
	elif activity_type == "document":
		type_filter = "AND src.activity_type = 'Document Edit'"

	rows = frappe.db.sql(
		f"""
		SELECT * FROM (
			SELECT
				al.creation AS timestamp,
				al.user AS user,
				COALESCE(al.full_name, al.user) AS full_name,
				al.operation AS activity_type,
				NULL AS doctype,
				COALESCE(al.ip_address, '') AS reference,
				COALESCE(al.status, '') AS details,
				'activity_log' AS source
			FROM `tabActivity Log` al
			WHERE al.creation BETWEEN %(f)s AND %(t)s
			  AND al.user NOT IN ('Guest', 'Administrator')
			  AND al.operation IN ('Login', 'Logout', 'Impersonate')

			UNION ALL

			SELECT
				rh.creation AS timestamp,
				rh.user AS user,
				COALESCE(u.full_name, rh.user) AS full_name,
				'Route View' AS activity_type,
				NULL AS doctype,
				COALESCE(rh.route, '') AS reference,
				'' AS details,
				'route_history' AS source
			FROM `tabRoute History` rh
			LEFT JOIN `tabUser` u ON u.name = rh.user
			WHERE rh.creation BETWEEN %(f)s AND %(t)s
			  AND rh.user NOT IN ('Guest', 'Administrator')

			UNION ALL

			SELECT
				v.creation AS timestamp,
				v.owner AS user,
				COALESCE(u.full_name, v.owner) AS full_name,
				'Document Edit' AS activity_type,
				v.ref_doctype AS doctype,
				COALESCE(v.docname, '') AS reference,
				'' AS details,
				'version' AS source
			FROM `tabVersion` v
			LEFT JOIN `tabUser` u ON u.name = v.owner
			WHERE v.creation BETWEEN %(f)s AND %(t)s
			  AND v.owner NOT IN ('Guest', 'Administrator')
		) AS src
		WHERE 1=1
		{user_filter}
		{doctype_filter}
		{department_filter}
		{type_filter}
		ORDER BY src.{sort_col} {sort_dir}, src.timestamp DESC
		LIMIT %(limit)s OFFSET %(offset)s
		""",
		{**params, "limit": limit, "offset": offset},
		as_dict=True,
	)

	total_row = frappe.db.sql(
		f"""
		SELECT COUNT(*) FROM (
			SELECT
				al.creation AS timestamp,
				al.user AS user,
				al.operation AS activity_type,
				NULL AS doctype
			FROM `tabActivity Log` al
			WHERE al.creation BETWEEN %(f)s AND %(t)s
			  AND al.user NOT IN ('Guest', 'Administrator')
			  AND al.operation IN ('Login', 'Logout', 'Impersonate')

			UNION ALL

			SELECT
				rh.creation AS timestamp,
				rh.user AS user,
				'Route View' AS activity_type,
				NULL AS doctype
			FROM `tabRoute History` rh
			WHERE rh.creation BETWEEN %(f)s AND %(t)s
			  AND rh.user NOT IN ('Guest', 'Administrator')

			UNION ALL

			SELECT
				v.creation AS timestamp,
				v.owner AS user,
				'Document Edit' AS activity_type,
				v.ref_doctype AS doctype
			FROM `tabVersion` v
			WHERE v.creation BETWEEN %(f)s AND %(t)s
			  AND v.owner NOT IN ('Guest', 'Administrator')
		) AS src
		WHERE 1=1
		{user_filter}
		{doctype_filter}
		{department_filter}
		{type_filter}
		""",
		params,
	)[0][0]

	dept_map = _employee_department_by_user([r.user for r in rows])

	# Enrich version rows with change summaries (batch fetch)
	version_keys = [r for r in rows if r.source == "version" and r.reference]
	version_details = {}
	if version_keys:
		for r in version_keys:
			data = frappe.db.get_value(
				"Version",
				{"ref_doctype": r.doctype, "docname": r.reference, "owner": r.user, "creation": r.timestamp},
				"data",
			)
			if data is not None:
				version_details[(r.doctype, r.reference, str(r.timestamp), r.user)] = _summarize_version(data)

	for r in rows:
		r["timestamp"] = str(r.timestamp)
		r["department"] = dept_map.get(r.user) or ""
		if r.source == "route_history":
			r["details"] = _parse_route(r.reference)
		elif r.source == "version":
			key = (r.doctype, r.reference, r["timestamp"], r.user)
			r["details"] = version_details.get(key) or "edited document"
		elif r.activity_type == "Login":
			r["details"] = f"Logged in ({r.details or 'Success'})"
		elif r.activity_type == "Logout":
			r["details"] = "Logged out"
		elif r.activity_type == "Impersonate":
			r["details"] = "Impersonated another user"

	if sort_by_department:
		reverse = sort_dir == "DESC"
		rows.sort(key=lambda r: (r.get("department") or "").lower(), reverse=reverse)

	return {
		"from_date": from_dt,
		"to_date": to_dt.split(" ")[0],
		"total_count": int(total_row or 0),
		"limit": limit,
		"offset": offset,
		"rows": rows,
	}


SUMMARY_SORT_COLUMNS = {
	"user": "full_name",
	"full_name": "full_name",
	"document_edits": "document_edits",
	"logins": "login_count",
	"routes": "route_views",
	"total_events": "total_events",
	"last_activity": "last_activity",
}


@frappe.whitelist()
def search_audit_users(search=None, limit=30):
	"""Search enabled system users for the audit filter combobox."""
	_require_ceo_access()
	limit = min(max(cint(limit) or 30, 1), 100)
	search = (search or "").strip()

	if search:
		like = f"%{search}%"
		rows = frappe.db.sql(
			"""
			SELECT name AS user, COALESCE(full_name, name) AS full_name, email
			FROM `tabUser`
			WHERE enabled = 1
			  AND user_type = 'System User'
			  AND name NOT IN ('Guest', 'Administrator')
			  AND (full_name LIKE %(q)s OR name LIKE %(q)s OR email LIKE %(q)s)
			ORDER BY full_name ASC, name ASC
			LIMIT %(limit)s
			""",
			{"q": like, "limit": limit},
			as_dict=True,
		)
	else:
		rows = frappe.db.sql(
			"""
			SELECT name AS user, COALESCE(full_name, name) AS full_name, email
			FROM `tabUser`
			WHERE enabled = 1
			  AND user_type = 'System User'
			  AND name NOT IN ('Guest', 'Administrator')
			ORDER BY full_name ASC, name ASC
			LIMIT %(limit)s
			""",
			{"limit": limit},
			as_dict=True,
		)

	return rows


@frappe.whitelist()
def get_user_activity_summary(
	from_date=None,
	to_date=None,
	period_days=7,
	user=None,
	department=None,
	sort_by="document_edits",
	sort_order="desc",
	limit=100,
):
	"""Per-user workload summary: logins, routes, document edits, top doctypes."""
	_require_ceo_access()

	from_dt, to_dt = _date_bounds(from_date, to_date, period_days)
	limit = min(max(cint(limit) or 100, 1), 500)
	sort_dir = "ASC" if str(sort_order or "desc").lower() == "asc" else "DESC"

	params = {"f": from_dt, "t": to_dt}
	user_filter_al = ""
	user_filter_rh = ""
	user_filter_v = ""
	if user and user not in ("", "all"):
		params["user"] = user
		user_filter_al = "AND al.user = %(user)s"
		user_filter_rh = "AND rh.user = %(user)s"
		user_filter_v = "AND v.owner = %(user)s"

	user_filter_al += _department_user_filter(department, params, alias="al.user")
	user_filter_rh += _department_user_filter(department, params, alias="rh.user")
	user_filter_v += _department_user_filter(department, params, alias="v.owner")

	login_rows = frappe.db.sql(
		f"""
		SELECT al.user,
		       SUM(CASE WHEN al.operation = 'Login' THEN 1 ELSE 0 END) AS login_count,
		       SUM(CASE WHEN al.operation = 'Logout' THEN 1 ELSE 0 END) AS logout_count,
		       MAX(al.creation) AS last_login
		FROM `tabActivity Log` al
		WHERE al.creation BETWEEN %(f)s AND %(t)s
		  AND al.user NOT IN ('Guest', 'Administrator')
		  AND al.operation IN ('Login', 'Logout', 'Impersonate')
		  {user_filter_al}
		GROUP BY al.user
		""",
		params,
		as_dict=True,
	)

	route_rows = frappe.db.sql(
		f"""
		SELECT rh.user, COUNT(*) AS route_views, MAX(rh.creation) AS last_route
		FROM `tabRoute History` rh
		WHERE rh.creation BETWEEN %(f)s AND %(t)s
		  AND rh.user NOT IN ('Guest', 'Administrator')
		  {user_filter_rh}
		GROUP BY rh.user
		""",
		params,
		as_dict=True,
	)

	doc_rows = frappe.db.sql(
		f"""
		SELECT v.owner AS user, COUNT(*) AS document_edits, MAX(v.creation) AS last_edit
		FROM `tabVersion` v
		WHERE v.creation BETWEEN %(f)s AND %(t)s
		  AND v.owner NOT IN ('Guest', 'Administrator')
		  {user_filter_v}
		GROUP BY v.owner
		""",
		params,
		as_dict=True,
	)

	doctype_rows = frappe.db.sql(
		f"""
		SELECT v.owner AS user, v.ref_doctype AS doctype, COUNT(*) AS cnt
		FROM `tabVersion` v
		WHERE v.creation BETWEEN %(f)s AND %(t)s
		  AND v.owner NOT IN ('Guest', 'Administrator')
		  AND v.ref_doctype IS NOT NULL AND v.ref_doctype != ''
		  {user_filter_v}
		GROUP BY v.owner, v.ref_doctype
		ORDER BY v.owner, cnt DESC
		""",
		params,
		as_dict=True,
	)

	users_meta = {
		r.name: r.full_name
		for r in frappe.db.sql(
			"""
			SELECT name, COALESCE(full_name, name) AS full_name
			FROM `tabUser`
			WHERE enabled = 1
			""",
			as_dict=True,
		)
	}

	summary = {}

	def _ensure(u):
		if u not in summary:
			summary[u] = {
				"user": u,
				"full_name": users_meta.get(u) or u,
				"department": "",
				"login_count": 0,
				"logout_count": 0,
				"route_views": 0,
				"document_edits": 0,
				"total_events": 0,
				"last_activity": None,
				"top_doctypes": [],
			}
		return summary[u]

	for r in login_rows:
		row = _ensure(r.user)
		row["login_count"] = int(r.login_count or 0)
		row["logout_count"] = int(r.logout_count or 0)
		row["last_activity"] = r.last_login

	for r in route_rows:
		row = _ensure(r.user)
		row["route_views"] = int(r.route_views or 0)
		if not row["last_activity"] or (r.last_route and r.last_route > row["last_activity"]):
			row["last_activity"] = r.last_route

	for r in doc_rows:
		row = _ensure(r.user)
		row["document_edits"] = int(r.document_edits or 0)
		if not row["last_activity"] or (r.last_edit and r.last_edit > row["last_activity"]):
			row["last_activity"] = r.last_edit

	doctypes_by_user = {}
	for r in doctype_rows:
		doctypes_by_user.setdefault(r.user, []).append(
			{"doctype": r.doctype, "count": int(r.cnt or 0)}
		)

	for u, row in summary.items():
		row["top_doctypes"] = doctypes_by_user.get(u, [])[:8]
		row["total_events"] = (
			row["login_count"] + row["logout_count"] + row["route_views"] + row["document_edits"]
		)
		row["last_activity"] = str(row["last_activity"]) if row["last_activity"] else None

	dept_map = _employee_department_by_user(list(summary.keys()))
	for u, row in summary.items():
		row["department"] = dept_map.get(u) or ""

	rows = list(summary.values())
	sort_field = SUMMARY_SORT_COLUMNS.get((sort_by or "document_edits").strip().lower(), "document_edits")
	reverse = sort_dir == "DESC"

	def _summary_sort_key(row):
		if sort_field == "full_name":
			return (row.get("full_name") or row["user"]).lower()
		if sort_field == "last_activity":
			return row.get("last_activity") or ""
		return row.get(sort_field) or 0

	rows.sort(key=_summary_sort_key, reverse=reverse)
	rows = rows[:limit]

	return {
		"from_date": from_dt,
		"to_date": to_dt.split(" ")[0],
		"total_users": len(summary),
		"rows": rows,
	}
