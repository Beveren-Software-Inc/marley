# Copyright (c) 2023, healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

DOCTOR_PROGRESS_NOTE_TYPE = "Doctor Progress Note"
NOTE_LOCK_ROLES = frozenset({"Administrator", "System Manager", "Healthcare Administrator"})


def user_can_lock_clinical_note(user=None):
	user = user or frappe.session.user
	if user == "Administrator":
		return True
	return bool(set(frappe.get_roles(user)) & NOTE_LOCK_ROLES)


def is_doctor_progress_note(doc):
	return (doc.get("clinical_note_type") or "") == DOCTOR_PROGRESS_NOTE_TYPE


class ClinicalNote(Document):
	def validate(self):
		if self.is_new():
			return

		if frappe.db.get_value(self.doctype, self.name, "note_locked"):
			frappe.throw(
				_("This clinical note is locked and cannot be edited."),
				title=_("Note Locked"),
			)

	def on_trash(self):
		if self.note_locked:
			frappe.throw(
				_("This clinical note is locked and cannot be deleted."),
				title=_("Note Locked"),
			)


@frappe.whitelist()
def lock_clinical_note(name):
	"""Permanently lock a Doctor Progress Note so it can no longer be edited."""
	if not user_can_lock_clinical_note():
		frappe.throw(_("You are not permitted to lock clinical notes."), frappe.PermissionError)

	doc = frappe.get_doc("Clinical Note", name)

	if not is_doctor_progress_note(doc):
		frappe.throw(_("Only Doctor Progress Notes can be locked."))

	if doc.note_locked:
		frappe.throw(_("This note is already locked."))

	frappe.db.set_value(
		"Clinical Note",
		name,
		{
			"note_locked": 1,
			"locked_by": frappe.session.user,
			"locked_on": now_datetime(),
		},
		update_modified=False,
	)

	return {"note_locked": 1, "locked_by": frappe.session.user, "locked_on": now_datetime()}
