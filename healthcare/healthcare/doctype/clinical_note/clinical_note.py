# Copyright (c) 2023, healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

from healthcare.api.utils.api_utility import get_next_transaction_number

DOCTOR_PROGRESS_NOTE_TYPE = "Doctor Progress Note"
NOTE_LOCK_ROLES = frozenset({"Administrator", "System Manager", "Healthcare Administrator"})


def user_can_lock_clinical_note(user=None):
	user = user or frappe.session.user
	if user == "Administrator":
		return True
	return bool(set(frappe.get_roles(user)) & NOTE_LOCK_ROLES)


def is_doctor_progress_note(doc):
	return (doc.get("clinical_note_type") or "") == DOCTOR_PROGRESS_NOTE_TYPE


def fill_patient_from_inpatient_admission(doc):
	"""When patient is empty but inpatient_admission is set, copy patient and patient_name from admission."""
	admission = doc.get("inpatient_admission")
	if admission and not doc.get("patient"):
		row = frappe.db.get_value(
			"Inpatient Admission",
			admission,
			["patient", "patient_name"],
			as_dict=True,
		)
		if row and row.patient:
			doc.patient = row.patient
			if row.patient_name:
				doc.patient_name = row.patient_name
	if doc.get("patient") and not doc.get("patient_name"):
		doc.patient_name = frappe.db.get_value("Patient", doc.patient, "patient_name")


def assign_clinical_note_trans_no(doc) -> None:
	"""Assign trans_no for new Clinical Notes (autoname: field:trans_no). Server-only.

	Prefer a cheap MAX() for pure integer sequences so background migrations and UI
	saves do not scan the whole Clinical Note table on every insert.
	"""
	if (doc.get("trans_no") or "").strip():
		return

	max_int = frappe.db.sql(
		"""
		SELECT MAX(CAST(trans_no AS UNSIGNED))
		FROM `tabClinical Note`
		WHERE trans_no REGEXP '^[0-9]+$'
		"""
	)
	max_val = max_int[0][0] if max_int else None
	if max_val is not None:
		doc.trans_no = str(int(max_val) + 1)
		return

	doc.trans_no = get_next_transaction_number("Clinical Note", fieldname="trans_no")


class ClinicalNote(Document):
	def before_insert(self):
		assign_clinical_note_trans_no(self)
		fill_patient_from_inpatient_admission(self)

	def validate(self):
		fill_patient_from_inpatient_admission(self)

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
