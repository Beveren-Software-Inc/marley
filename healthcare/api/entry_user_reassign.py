# Copyright (c) 2026, healthcare contributors
"""Credit / reassign the receptionist who owns a visit or payment.

Frappe's `owner` is immutable, so documents carry an explicit owner field that
defaults to the creating user and can be changed from the reception UI when
someone completes work on another's behalf.

Fields:
  - Patient Visit → visit_owner
  - Payment Entry → custom_payment_owner
  - Sales Invoice → entry_user (legacy / optional)
"""

from __future__ import annotations

import frappe
from frappe import _

# doctype → (fieldname, human label used in timeline comments)
OWNER_FIELDS = {
	"Patient Visit": ("visit_owner", "OP visit"),
	"Payment Entry": ("custom_payment_owner", "receipt voucher"),
	"Sales Invoice": ("entry_user", "receipt / invoice"),
}

REASSIGN_ROLES = (
	"Healthcare Administrator",
	"System Manager",
	"Accounts Manager",
	"Receptionist",
	"Reception",
)


def set_entry_user_on_insert(doc, method=None) -> None:
	"""`before_insert` hook — stamp the creating user on the credit field."""
	meta = OWNER_FIELDS.get(doc.doctype)
	if not meta:
		return
	field, _label = meta
	if not doc.meta.has_field(field):
		return
	if not doc.get(field):
		doc.set(field, frappe.session.user)


def _can_reassign() -> bool:
	roles = set(frappe.get_roles())
	return bool(roles.intersection(REASSIGN_ROLES))


def resolve_credited_user(credited: str | None, owner: str | None) -> str:
	"""Prefer explicit payment/visit owner; fall back to document owner."""
	return (credited or "").strip() or (owner or "").strip()


@frappe.whitelist()
def reassign_entry_user(doctype: str, name: str, new_user: str, reason: str | None = None) -> dict:
	"""Change who is credited with a transaction (visit owner / payment owner)."""
	if doctype not in OWNER_FIELDS:
		frappe.throw(_("Owner cannot be reassigned on {0}.").format(doctype))

	if not _can_reassign():
		frappe.throw(
			_("You are not permitted to reassign the receptionist."),
			frappe.PermissionError,
		)

	field, label = OWNER_FIELDS[doctype]
	if not frappe.get_meta(doctype).has_field(field):
		frappe.throw(_("{0} has no {1} field.").format(doctype, field))

	if not frappe.db.exists("User", new_user):
		frappe.throw(_("User {0} does not exist.").format(new_user))

	if not frappe.db.exists(doctype, name):
		frappe.throw(_("{0} {1} not found.").format(doctype, name))

	row = frappe.db.get_value(doctype, name, [field, "owner"], as_dict=True) or {}
	previous = resolve_credited_user(row.get(field), row.get("owner"))
	if previous == new_user and row.get(field) == new_user:
		return {
			"changed": False,
			"entry_user": new_user,
			"owner_field": field,
			"full_name": frappe.db.get_value("User", new_user, "full_name") or new_user,
		}

	frappe.db.set_value(doctype, name, field, new_user)

	doc = frappe.get_doc(doctype, name)
	doc.add_comment(
		"Info",
		_("Receptionist for this {0} changed from {1} to {2}{3}").format(
			label,
			previous or _("(unset)"),
			new_user,
			_(" — reason: {0}").format(reason) if reason else "",
		),
	)
	frappe.db.commit()

	return {
		"changed": True,
		"entry_user": new_user,
		"previous": previous,
		"owner_field": field,
		"full_name": frappe.db.get_value("User", new_user, "full_name") or new_user,
	}


@frappe.whitelist()
def backfill_entry_user(doctype: str, batch: int = 5000) -> int:
	"""Populate owner field from document owner on pre-existing rows."""
	if doctype not in OWNER_FIELDS:
		frappe.throw(_("Unsupported doctype {0}").format(doctype))

	field, _label = OWNER_FIELDS[doctype]
	if not frappe.get_meta(doctype).has_field(field):
		frappe.throw(_("{0} has no {1} field.").format(doctype, field))

	rows = frappe.get_all(
		doctype,
		filters={field: ["in", [None, ""]]},
		fields=["name", "owner"],
		limit_page_length=batch,
	)
	for row in rows:
		frappe.db.set_value(doctype, row.name, field, row.owner, update_modified=False)
	frappe.db.commit()
	return len(rows)
