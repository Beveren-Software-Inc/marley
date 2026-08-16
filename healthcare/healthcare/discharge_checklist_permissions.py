# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _

ADMIN_ROLES = frozenset(
	{
		"Administrator",
		"System Manager",
		"Healthcare Administrator",
		"Website Manager",
	}
)

CHECKLIST_UNCHECK_ROLES = frozenset({"Administrator", "System Manager"})

RECEPTION_ROLE_HINTS = ("reception",)


def _is_admin_user(user: str | None = None) -> bool:
	user = user or frappe.session.user
	if not user or user == "Guest":
		return False
	return bool(ADMIN_ROLES.intersection(frappe.get_roles(user)))


def _can_uncheck_checklist_item(user: str | None = None) -> bool:
	"""Only System Manager and Administrator may reverse a completed checklist tick."""
	user = user or frappe.session.user
	if not user or user == "Guest":
		return False
	if user == "Administrator":
		return True
	return bool(CHECKLIST_UNCHECK_ROLES.intersection(frappe.get_roles(user)))


def _is_reception_user(user: str | None = None) -> bool:
	user = user or frappe.session.user
	if not user or user == "Guest":
		return False
	roles = [r.strip().lower() for r in frappe.get_roles(user)]
	return any(r == "reception" or "reception" in r for r in roles)


def get_user_department_ids(user: str | None = None) -> list[str]:
	"""Department link names assigned to the logged-in user (via Employee)."""
	user = user or frappe.session.user
	if not user or user == "Guest":
		return []

	depts: list[str] = []

	employee = frappe.db.get_value(
		"Employee",
		{"user_id": user, "status": "Active"},
		["name", "department"],
		as_dict=True,
	)
	if not employee:
		employee = frappe.db.sql(
			"""
			SELECT name, department
			FROM `tabEmployee`
			WHERE status = 'Active' AND LOWER(user_id) = LOWER(%s)
			LIMIT 1
			""",
			user,
			as_dict=True,
		)
		employee = employee[0] if employee else None

	if employee and employee.get("department"):
		resolved = resolve_department_link(employee.department)
		if resolved:
			depts.append(resolved)

	if depts:
		return depts

	# Fallback: Healthcare Practitioner → linked Employee department
	practitioner = frappe.db.get_value(
		"Healthcare Practitioner",
		{"user_id": user, "status": "Active"},
		["employee", "department"],
		as_dict=True,
	)
	if not practitioner:
		rows = frappe.db.sql(
			"""
			SELECT employee, department
			FROM `tabHealthcare Practitioner`
			WHERE status = 'Active' AND LOWER(user_id) = LOWER(%s)
			LIMIT 1
			""",
			user,
			as_dict=True,
		)
		practitioner = rows[0] if rows else None

	if practitioner and practitioner.get("employee"):
		emp_dept = frappe.db.get_value("Employee", practitioner.employee, "department")
		if emp_dept:
			resolved = resolve_department_link(emp_dept)
			if resolved:
				return [resolved]

	return depts


def resolve_department_link(dept_id):
	"""Normalize a Department link name or label to the link name."""
	text = (dept_id or "").strip()
	if not text:
		return ""
	if frappe.db.exists("Department", text):
		return text
	resolved = frappe.db.get_value("Department", {"department_name": text}, "name")
	return resolved or text


def resolve_department_link_label(dept_id):
	if not dept_id:
		return ""
	dept_id = resolve_department_link(dept_id)
	if frappe.db.exists("Department", dept_id):
		for fieldname in ("department_name", "department"):
			if frappe.get_meta("Department").has_field(fieldname):
				label = frappe.db.get_value("Department", dept_id, fieldname)
				if label:
					return label
		return dept_id
	if frappe.db.exists("Medical Department", dept_id):
		return frappe.db.get_value("Medical Department", dept_id, "department") or dept_id
	return dept_id


def checklist_row_department_ids(row) -> list[str]:
	"""Primary, secondary, and tertiary departments configured on a checklist row."""
	depts: list[str] = []
	for fieldname in ("department", "department_2", "department_3"):
		value = row.get(fieldname) if isinstance(row, dict) else getattr(row, fieldname, None)
		if not value:
			continue
		resolved = resolve_department_link(value)
		if resolved and resolved not in depts:
			depts.append(resolved)

	dept_name = row.get("department_name") if isinstance(row, dict) else getattr(row, "department_name", None)
	if dept_name:
		resolved = resolve_department_link(dept_name)
		if resolved and resolved not in depts:
			depts.append(resolved)

	return depts


def _user_can_edit_unassigned_checklist_row(user: str | None = None) -> bool:
	if _is_admin_user(user):
		return True
	return _is_reception_user(user)


def user_can_edit_checklist_row(row, user: str | None = None, reference_row=None) -> bool:
	"""Whether the user may complete or edit a discharge checklist line."""
	if _is_admin_user(user):
		return True

	allowed = checklist_row_department_ids(row)
	if reference_row is not None:
		for dept in checklist_row_department_ids(reference_row):
			if dept not in allowed:
				allowed.append(dept)
	if not allowed:
		return _user_can_edit_unassigned_checklist_row(user)

	user_depts = get_user_department_ids(user)
	if not user_depts:
		return False

	normalized_user_depts = {resolve_department_link(dept) for dept in user_depts}
	return any(dept in normalized_user_depts for dept in allowed)


ACCOUNTS_DEPARTMENT_HINTS = ("account",)


def is_accounts_department(dept_id: str | None) -> bool:
	"""True when a Department link/name is the Accounts team (template department column)."""
	if not dept_id:
		return False
	resolved = resolve_department_link(dept_id)
	label = (resolve_department_link_label(resolved) or resolved or "").strip().lower()
	text = f"{resolved} {label}".lower()
	return any(hint in text for hint in ACCOUNTS_DEPARTMENT_HINTS)


def is_accounts_checklist_row(row) -> bool:
	"""Checklist lines assigned to Accounts on the discharge template."""
	return any(is_accounts_department(dept) for dept in checklist_row_department_ids(row))


def _checklist_row_sort_key(row, position: int) -> tuple:
	sr = ""
	if isinstance(row, dict):
		sr = (row.get("sr_num") or "").strip()
	else:
		sr = (getattr(row, "sr_num", None) or "").strip()
	try:
		return (0, int(sr), position)
	except (TypeError, ValueError):
		idx = row.get("idx") if isinstance(row, dict) else getattr(row, "idx", None)
		try:
			return (1, int(idx), position)
		except (TypeError, ValueError):
			return (2, position, position)


def sort_checklist_rows(rows) -> list:
	"""Return checklist rows in template/child-table order (sr_num, then idx, then position)."""
	enumerated = list(enumerate(rows or []))
	return [row for _, row in sorted(enumerated, key=lambda pair: _checklist_row_sort_key(pair[1], pair[0]))]


def _checklist_row_is_complete(row) -> bool:
	if isinstance(row, dict):
		return bool(row.get("click"))
	return bool(getattr(row, "click", 0))


def is_first_checklist_item_complete(rows) -> bool:
	"""True when the first discharge checklist item (by sr_num/idx) is checked."""
	sorted_rows = sort_checklist_rows(rows)
	if not sorted_rows:
		return False
	return _checklist_row_is_complete(sorted_rows[0])


def _checklist_row_action_label(row) -> str:
	if isinstance(row, dict):
		return (row.get("action_required") or "").strip()
	return (getattr(row, "action_required", None) or "").strip()


def assert_checklist_first_item_gate(rows) -> None:
	"""Later items may be completed in any order, but only after the first item is complete."""
	sorted_rows = sort_checklist_rows(rows)
	if len(sorted_rows) < 2:
		return
	first = sorted_rows[0]
	if _checklist_row_is_complete(first):
		return
	for row in sorted_rows[1:]:
		if _checklist_row_is_complete(row):
			frappe.throw(
				_("Complete the first checklist item before other items. Finish “{0}” first.").format(
					_checklist_row_action_label(first) or _("the first item")
				)
			)


def assert_checklist_sequential_order(rows) -> None:
	"""Deprecated alias: first item must be complete before any later item."""
	assert_checklist_first_item_gate(rows)


def can_complete_checklist_row(rows, row, user: str | None = None, reference_row=None) -> bool:
	"""Department permission plus first-item gate for marking a row complete."""
	if not user_can_edit_checklist_row(row, user, reference_row=reference_row):
		return False

	sorted_rows = sort_checklist_rows(rows)
	if not sorted_rows:
		return True
	if _checklist_row_key(row) == _checklist_row_key(sorted_rows[0]):
		return True
	return _checklist_row_is_complete(sorted_rows[0])


def _row_as_dict(row) -> dict:
	if isinstance(row, dict):
		return dict(row)
	return {
		"name": getattr(row, "name", None),
		"action_required": getattr(row, "action_required", None),
		"department": getattr(row, "department", None),
		"department_2": getattr(row, "department_2", None),
		"department_3": getattr(row, "department_3", None),
		"department_name": getattr(row, "department_name", None),
		"user": getattr(row, "user", None),
		"name1": getattr(row, "name1", None),
		"date_time": getattr(row, "date_time", None),
		"click": getattr(row, "click", 0),
		"description": getattr(row, "description", None),
		"sr_num": getattr(row, "sr_num", None),
	}


def _normalize_checklist_action(text: str | None) -> str:
	return "".join(ch for ch in (text or "").lower() if ch.isalnum())


def _template_checklist_lookup(template_name: str) -> tuple[dict[str, object], dict[str, object]]:
	"""Index template checklist rows by normalized action and sr_num."""
	if not template_name or not frappe.db.exists("Discharge Template", template_name):
		return {}, {}

	template = frappe.get_doc("Discharge Template", template_name, ignore_permissions=True)
	by_action: dict[str, object] = {}
	by_sr: dict[str, object] = {}
	for row in template.get("discharge_checklist") or []:
		action = _normalize_checklist_action(getattr(row, "action_required", None))
		if action and action not in by_action:
			by_action[action] = row
		sr = (getattr(row, "sr_num", None) or "").strip()
		if sr and sr not in by_sr:
			by_sr[sr] = row
	return by_action, by_sr


def _template_row_for_checklist_item(item: dict, by_action: dict, by_sr: dict):
	sr = (item.get("sr_num") or "").strip()
	if sr and sr in by_sr:
		return by_sr[sr]
	action = _normalize_checklist_action(item.get("action_required"))
	return by_action.get(action)


def enrich_checklist_rows_with_template_departments(rows, template_name: str | None) -> list[dict]:
	"""Fill missing department fields from the discharge checklist master."""
	if not template_name:
		return [_row_as_dict(row) if not isinstance(row, dict) else dict(row) for row in (rows or [])]

	by_action, by_sr = _template_checklist_lookup(template_name)
	enriched: list[dict] = []

	for row in rows or []:
		item = _row_as_dict(row) if not isinstance(row, dict) else dict(row)
		template_row = _template_row_for_checklist_item(item, by_action, by_sr)
		if template_row:
			for fieldname in ("department", "department_2", "department_3"):
				if not item.get(fieldname) and getattr(template_row, fieldname, None):
					item[fieldname] = getattr(template_row, fieldname)

		enriched.append(item)

	return enriched


def merge_checklist_rows_with_department_permissions(incoming_rows, existing_rows, user: str | None = None):
	"""Keep unauthorized edits from overwriting rows owned by other departments."""
	incoming = incoming_rows if isinstance(incoming_rows, list) else []
	existing = existing_rows or []

	existing_map = {_checklist_row_key(row): _row_as_dict(row) for row in existing}
	merged: list[dict] = []

	for row in incoming:
		if not isinstance(row, dict):
			continue
		key = _checklist_row_key(row)
		reference_row = existing_map.get(key)
		if user_can_edit_checklist_row(row, user, reference_row=reference_row):
			if (
				reference_row
				and _checklist_row_is_complete(reference_row)
				and not _checklist_row_is_complete(row)
				and not _can_uncheck_checklist_item(user)
			):
				frappe.throw(_("Completed checklist items cannot be unchecked."))
			merged.append(row)
			continue

		if reference_row:
			merged.append(reference_row)
		else:
			merged.append(row)

	assert_checklist_first_item_gate(merged)
	return merged


def _checklist_row_key(row) -> tuple:
	if isinstance(row, dict):
		return (
			(row.get("action_required") or "").strip(),
			(row.get("sr_num") or "").strip(),
			(row.get("name") or "").strip(),
		)
	return (
		(getattr(row, "action_required", None) or "").strip(),
		(getattr(row, "sr_num", None) or "").strip(),
		(getattr(row, "name", None) or "").strip(),
	)
