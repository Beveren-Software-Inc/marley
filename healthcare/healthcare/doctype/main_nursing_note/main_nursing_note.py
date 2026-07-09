# Copyright (c) 2025, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

from datetime import timedelta

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_datetime, now_datetime

NURSING_NOTE_EDIT_WINDOW_HOURS = 24

NURSING_NOTE_EDIT_LOCKED_MESSAGE = _(
	"This nursing note can no longer be edited. Notes are locked 24 hours after the last update."
)


def nursing_note_edit_window_expired(modified) -> bool:
	"""Return True when the note is past the editable window."""
	if not modified:
		return False
	modified_dt = get_datetime(modified)
	if not modified_dt:
		return False
	return now_datetime() - modified_dt > timedelta(hours=NURSING_NOTE_EDIT_WINDOW_HOURS)


def assert_main_nursing_note_editable(doc) -> None:
	"""Reject updates to nursing notes outside the 24-hour edit window."""
	if doc.is_new():
		return
	if getattr(doc.flags, "legacy_import", False):
		return
	if getattr(doc.flags, "skip_nursing_note_edit_window", False):
		return

	modified = frappe.db.get_value(doc.doctype, doc.name, "modified")
	if nursing_note_edit_window_expired(modified):
		frappe.throw(
			NURSING_NOTE_EDIT_LOCKED_MESSAGE,
			title=_("Editing not allowed"),
			exc=frappe.ValidationError,
		)


class MainNursingNote(Document):
	def validate(self):
		assert_main_nursing_note_editable(self)
