# Copyright (c) 2026, healthcare contributors
"""Block edits to existing Healthcare records when Healthcare Settings.lock_editing_data is set."""

from __future__ import annotations

import frappe
from frappe import _

SETTINGS_DOCTYPE = "Healthcare Settings"

LOCK_EXEMPT_DOCTYPES = frozenset(
	{
		"Healthcare Settings",
		"Version",
		"Comment",
		"Activity Log",
		"Error Log",
		"Data Import",
		"Data Import Log",
		"Access Log",
	}
)

LOCKED_MODULES = frozenset({"Healthcare"})

EDITING_LOCK_MESSAGE = _(
	"Editing is locked in Healthcare Settings. You can create new records but cannot modify existing data."
)


def is_editing_locked() -> bool:
	return bool(frappe.db.get_single_value(SETTINGS_DOCTYPE, "lock_editing_data"))


def assert_editing_allowed() -> None:
	"""Raise when portal/API updates must be blocked."""
	if is_editing_locked():
		frappe.throw(EDITING_LOCK_MESSAGE, title=_("Editing locked"), exc=frappe.ValidationError)


def validate_editing_not_locked(doc, method=None) -> None:
	"""Doc validate hook: reject updates to existing Healthcare module documents."""
	if doc.is_new():
		return
	if getattr(doc.flags, "skip_editing_lock", False):
		return
	if not is_editing_locked():
		return
	if doc.doctype in LOCK_EXEMPT_DOCTYPES:
		return

	meta = frappe.get_meta(doc.doctype)
	if meta.istable:
		return
	if meta.module not in LOCKED_MODULES:
		return

	frappe.throw(EDITING_LOCK_MESSAGE, title=_("Editing locked"), exc=frappe.ValidationError)
