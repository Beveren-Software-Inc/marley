# Copyright (c) 2026, healthcare contributors
"""Block edits to existing Healthcare records when Healthcare Settings.lock_editing_data is set."""

from __future__ import annotations

from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import get_datetime, now_datetime

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

EDIT_WINDOW_HOURS = 24
EDIT_WINDOW_EXPIRED_MESSAGE = _(
	"This record can no longer be edited. Edits are locked 24 hours after creation."
)


def is_editing_locked() -> bool:
	return bool(frappe.db.get_single_value(SETTINGS_DOCTYPE, "lock_editing_data"))


def assert_editing_allowed() -> None:
	"""Raise when portal/API updates must be blocked."""
	if is_editing_locked():
		frappe.throw(EDITING_LOCK_MESSAGE, title=_("Editing locked"), exc=frappe.ValidationError)


def creation_edit_window_expired(creation) -> bool:
	"""True when creation is older than the portal 24h edit window."""
	if not creation:
		return False
	created_dt = get_datetime(creation)
	if not created_dt:
		return False
	return now_datetime() - created_dt > timedelta(hours=EDIT_WINDOW_HOURS)


def assert_editable_within_24h_if_enabled(
	doctype: str,
	name: str,
	setting_field: str,
	*,
	locked_message: str | None = None,
) -> None:
	"""When the Healthcare Settings checkbox is on, block edits past 24h from creation.

	If the checkbox is off, edits are allowed anytime (subject to global lock_editing_data).
	"""
	assert_editing_allowed()
	if not frappe.db.get_single_value(SETTINGS_DOCTYPE, setting_field):
		return
	creation = frappe.db.get_value(doctype, name, "creation")
	if creation_edit_window_expired(creation):
		frappe.throw(
			locked_message or EDIT_WINDOW_EXPIRED_MESSAGE,
			title=_("Editing not allowed"),
			exc=frappe.ValidationError,
		)


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
