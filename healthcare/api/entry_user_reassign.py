# Copyright (c) 2026, healthcare contributors
"""REC-051 - reassign the user credited with an OP entry or receipt voucher.

Frappe's `owner` is immutable by design, so the transaction instead carries an
explicit `entry_user` field. That field defaults to the creating user and can be
reassigned afterwards by a privileged role, with every change written to the
document's timeline.
"""

from __future__ import annotations

import frappe
from frappe import _

# doctype -> label used in the audit comment
SUPPORTED = {
	"Patient Visit": "OP visit",
	"Sales Invoice": "receipt / invoice",
	"Payment Entry": "receipt voucher",
}

REASSIGN_ROLES = ("Healthcare Administrator", "System Manager", "Accounts Manager")


def set_entry_user_on_insert(doc, method=None) -> None:
	"""`before_insert` hook - stamp the creating user."""
	if not doc.meta.has_field("entry_user"):
		return
	if not doc.get("entry_user"):
		doc.entry_user = frappe.session.user


def _can_reassign() -> bool:
	roles = set(frappe.get_roles())
	return bool(roles.intersection(REASSIGN_ROLES))


@frappe.whitelist()
def reassign_entry_user(doctype: str, name: str, new_user: str, reason: str | None = None) -> dict:
	"""Change who is credited with a transaction. One user per transaction."""
	if doctype not in SUPPORTED:
		frappe.throw(_("Entry user cannot be reassigned on {0}.").format(doctype))

	if not _can_reassign():
		frappe.throw(
			_("You are not permitted to reassign the entry user."),
			frappe.PermissionError,
		)

	if not frappe.db.exists("User", new_user):
		frappe.throw(_("User {0} does not exist.").format(new_user))

	if not frappe.db.exists(doctype, name):
		frappe.throw(_("{0} {1} not found.").format(doctype, name))

	previous = frappe.db.get_value(doctype, name, "entry_user")
	if previous == new_user:
		return {"changed": False, "entry_user": new_user}

	frappe.db.set_value(doctype, name, "entry_user", new_user)

	doc = frappe.get_doc(doctype, name)
	doc.add_comment(
		"Info",
		_("Entry user for this {0} changed from {1} to {2}{3}").format(
			SUPPORTED[doctype],
			previous or _("(unset)"),
			new_user,
			_(" - reason: {0}").format(reason) if reason else "",
		),
	)

	return {"changed": True, "entry_user": new_user, "previous": previous}


@frappe.whitelist()
def backfill_entry_user(doctype: str, batch: int = 5000) -> int:
	"""Populate entry_user from owner on pre-existing rows."""
	if doctype not in SUPPORTED:
		frappe.throw(_("Unsupported doctype {0}").format(doctype))

	rows = frappe.get_all(
		doctype,
		filters={"entry_user": ["in", [None, ""]]},
		fields=["name", "owner"],
		limit_page_length=batch,
	)
	for row in rows:
		frappe.db.set_value(doctype, row.name, "entry_user", row.owner, update_modified=False)
	frappe.db.commit()
	return len(rows)
