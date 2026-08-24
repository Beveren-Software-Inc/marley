# Copyright (c) 2025, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

from datetime import timedelta

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_datetime, now_datetime, nowtime

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


def nursing_user_display(user=None):
	user = user or frappe.session.user
	return user, frappe.db.get_value("User", user, "full_name") or user


def format_nursing_note_time(time_value=None):
	if time_value:
		value = str(time_value).strip()
		if " " in value:
			value = value.split(" ")[-1]
		if "." in value:
			value = value.split(".")[0]
		parts = value.split(":")
		if len(parts) >= 2:
			return f"{parts[0].zfill(2)}:{parts[1].zfill(2)}"
	return now_datetime().strftime("%H:%M")


def ensure_legacy_nursing_note_entries(doc):
	"""Turn an old single-blob note into a created-by entry before anyone appends."""
	if doc.get("entries"):
		return
	text = (doc.nursing_notes or "").strip()
	if not text:
		return
	user, user_name = nursing_user_display(doc.user)
	doc.append(
		"entries",
		{
			"note": text,
			"note_time": doc.data or nowtime(),
			"authored_by": user,
			"authored_by_name": doc.user_name or user_name,
		},
	)


def update_nursing_note_entry(doc, entry_name=None, note_text=None, note_time=None):
	"""Change an existing attributed line (or the original parent note if there are no rows)."""
	ensure_legacy_nursing_note_entries(doc)
	note_text = (note_text or "").strip()
	if not note_text:
		frappe.throw(_("Enter nursing notes to save"))

	rows = doc.get("entries") or []
	target = None
	if entry_name:
		for row in rows:
			if row.name == entry_name:
				target = row
				break
		if not target:
			frappe.throw(_("This nursing note line was not found"))
	elif rows:
		target = rows[0]

	if target:
		target.note = note_text
		if note_time:
			target.note_time = note_time
	else:
		doc.nursing_notes = note_text
	return doc


def append_nursing_note_entry(doc, note_text, note_time=None, user=None):
	"""Add one attributed line to a shift note. Two nurses can append the same shift."""
	had_entries = bool(doc.get("entries"))
	ensure_legacy_nursing_note_entries(doc)
	note_text = (note_text or "").strip()
	if not note_text:
		frappe.throw(_("Enter nursing notes to save"))

	user, user_name = nursing_user_display(user)
	if not doc.get("user"):
		doc.user = user
		doc.user_name = user_name

	# Creating a note sets nursing_notes and then appends; legacy copy already
	# put that same text in the first child row — do not insert it twice.
	if not had_entries and doc.get("entries"):
		first = doc.entries[0]
		if (first.note or "").strip() == note_text:
			if not first.note_time and note_time:
				first.note_time = note_time
			if not first.authored_by:
				first.authored_by = user
				first.authored_by_name = user_name
			return doc

	doc.append(
		"entries",
		{
			"note": note_text,
			"note_time": note_time or nowtime(),
			"authored_by": user,
			"authored_by_name": user_name,
		},
	)
	return doc


def find_open_shift_nursing_note(file_no=None, admission=None, date=None, shift=None):
	"""Return the editable Main Nursing Note for this patient/date/shift, if any."""
	if not date or not shift:
		return None

	filters = {"date": date, "shift": shift}
	if admission:
		filters["admission"] = admission
	elif file_no:
		filters["file_no"] = file_no
	else:
		return None

	names = frappe.get_all(
		"Main Nursing Note",
		filters=filters,
		pluck="name",
		order_by="modified desc",
		limit=1,
	)
	if not names:
		return None

	frappe.db.sql("select name from `tabMain Nursing Note` where name=%s for update", names[0])
	doc = frappe.get_doc("Main Nursing Note", names[0])
	if nursing_note_edit_window_expired(doc.modified):
		return None
	return doc


class MainNursingNote(Document):
	def validate(self):
		assert_main_nursing_note_editable(self)

	def before_save(self):
		self.sync_entries_and_authors()

	def sync_entries_and_authors(self):
		ensure_legacy_nursing_note_entries(self)

		if not self.user:
			user, user_name = nursing_user_display()
			self.user = user
			self.user_name = user_name
		elif not self.user_name:
			self.user_name = frappe.db.get_value("User", self.user, "full_name") or self.user

		lines = []
		last = None
		for row in self.get("entries") or []:
			note = (row.note or "").strip()
			if not note:
				continue
			if not row.authored_by_name and row.authored_by:
				row.authored_by_name = (
					frappe.db.get_value("User", row.authored_by, "full_name") or row.authored_by
				)
			label = format_nursing_note_time(row.note_time)
			author = row.authored_by_name or row.authored_by or ""
			lines.append(f"[{label}] {author}: {note}" if author else f"[{label}] {note}")
			last = row

		if lines:
			self.nursing_notes = "\n".join(lines)
		if last:
			self.last_appended_by = last.authored_by
			self.last_appended_by_name = last.authored_by_name
		elif not self.last_appended_by:
			self.last_appended_by = self.user
			self.last_appended_by_name = self.user_name


# Names used by healthcare.api.common
append_nursing_note_entry = append_nursing_note_entry
update_nursing_note_entry = update_nursing_note_entry
find_open_shift_nursing_note = find_open_shift_nursing_note
