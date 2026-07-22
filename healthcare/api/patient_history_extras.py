# Copyright (c) 2026, healthcare contributors
"""WF-078 / WF-079 - extend patient history beyond the standard clinical feed.

Frappe Healthcare's own `create_medical_record` only fires for doctypes whose
module is Healthcare AND which are submittable, so two BRD requirements fall
outside it:

  WF-078  billing & payments  -> Sales Invoice / Payment Entry live in Accounts
  WF-079  follow-ups          -> Patient Follow Up is not submittable

Both are handled here by writing Patient Medical Record entries directly, using
the same shape the core feed produces so the desk Patient History page and the
SPA history screens pick them up unchanged.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import fmt_money


def _enabled() -> bool:
	return bool(
		frappe.db.get_single_value("Healthcare Settings", "record_billing_in_patient_history")
	)


def _follow_up_enabled() -> bool:
	return bool(
		frappe.db.get_single_value("Healthcare Settings", "record_follow_up_in_patient_history")
	)


def _write(patient: str, subject: str, doctype: str, name: str, date_value, owner: str) -> None:
	if not patient:
		return
	# Legacy rows sometimes carry a patient NAME rather than a valid Patient link.
	# Skip those instead of blowing up the whole transaction.
	if not frappe.db.exists("Patient", patient):
		return
	if frappe.db.exists(
		"Patient Medical Record", {"reference_doctype": doctype, "reference_name": name}
	):
		return

	record = frappe.new_doc("Patient Medical Record")
	record.patient = patient
	record.subject = subject
	record.status = "Open"
	record.communication_date = date_value
	record.reference_doctype = doctype
	record.reference_name = name
	record.reference_owner = owner
	record.insert(ignore_permissions=True)


def _clear(doctype: str, name: str) -> None:
	for record in frappe.get_all(
		"Patient Medical Record",
		filters={"reference_doctype": doctype, "reference_name": name},
		pluck="name",
	):
		frappe.delete_doc("Patient Medical Record", record, force=True, ignore_permissions=True)


# --------------------------------------------------------------------------- #
# WF-078 - billing & payments
# --------------------------------------------------------------------------- #
def record_sales_invoice(doc, method=None) -> None:
	if not _enabled() or not doc.get("patient"):
		return

	amount = fmt_money(doc.get("grand_total") or 0, currency=doc.get("currency"))
	outstanding = doc.get("outstanding_amount") or 0
	state = _("Paid") if not outstanding else _("Outstanding {0}").format(
		fmt_money(outstanding, currency=doc.get("currency"))
	)
	subject = _("Invoice {0} - {1} ({2})").format(doc.name, amount, state)

	_write(doc.patient, subject, doc.doctype, doc.name, doc.get("posting_date"), doc.owner)


def record_payment_entry(doc, method=None) -> None:
	if not _enabled():
		return

	patient = _patient_from_payment(doc)
	if not patient:
		return

	amount = fmt_money(doc.get("paid_amount") or 0, currency=doc.get("paid_from_account_currency"))
	subject = _("Payment {0} - {1} via {2}").format(
		doc.name, amount, doc.get("mode_of_payment") or _("unspecified")
	)

	_write(patient, subject, doc.doctype, doc.name, doc.get("posting_date"), doc.owner)


def _patient_from_payment(doc) -> str | None:
	"""Payment Entry has no patient field - resolve through the customer or a reference."""
	if doc.get("patient"):
		return doc.get("patient")

	for ref in doc.get("references") or []:
		if ref.reference_doctype == "Sales Invoice" and ref.reference_name:
			patient = frappe.db.get_value("Sales Invoice", ref.reference_name, "patient")
			if patient:
				return patient

	if doc.get("party_type") == "Customer" and doc.get("party"):
		return frappe.db.get_value("Patient", {"customer": doc.party}, "name")

	return None


def remove_billing_record(doc, method=None) -> None:
	"""WF-080 - record the cancellation instead of erasing the history entry.

	The core feed deletes the Patient Medical Record on cancel, which loses the
	narrative. Serene's BRD asks for cancellations to be *recorded*, so the entry
	is rewritten as a cancellation rather than removed.
	"""
	if not _record_cancellations():
		_clear(doc.doctype, doc.name)
		return

	existing = frappe.db.get_value(
		"Patient Medical Record",
		{"reference_doctype": doc.doctype, "reference_name": doc.name},
		["name", "subject"],
		as_dict=True,
	)
	if not existing:
		return

	subject = existing.subject or doc.name
	if not subject.startswith(_("CANCELLED")):
		subject = _("CANCELLED - {0}").format(subject)
	frappe.db.set_value(
		"Patient Medical Record", existing.name,
		{"subject": subject, "status": "Close"},
	)


def _record_cancellations() -> bool:
	return bool(
		frappe.db.get_single_value("Healthcare Settings", "record_cancellations_in_history")
	)


# --------------------------------------------------------------------------- #
# WF-079 - follow-ups
# --------------------------------------------------------------------------- #
def record_follow_up(doc, method=None) -> None:
	"""Patient Follow Up is not submittable, so this runs on update."""
	if not _follow_up_enabled() or not doc.get("patient"):
		return

	subject = _("Follow-up {0} ({1}) - {2}").format(
		doc.name, doc.get("follow_up_type") or _("Normal"), doc.get("status") or _("Open")
	)
	if doc.get("follow_up_date"):
		subject += _(" due {0}").format(doc.follow_up_date)

	existing = frappe.db.get_value(
		"Patient Medical Record",
		{"reference_doctype": doc.doctype, "reference_name": doc.name},
		"name",
	)
	if existing:
		# keep the status text current as the follow-up progresses
		frappe.db.set_value("Patient Medical Record", existing, "subject", subject)
		return

	_write(
		doc.patient,
		subject,
		doc.doctype,
		doc.name,
		doc.get("follow_up_date") or doc.get("creation"),
		doc.owner,
	)


def remove_follow_up_record(doc, method=None) -> None:
	_clear(doc.doctype, doc.name)


# --------------------------------------------------------------------------- #
# WF-072 / WF-074 / WF-077 - doctypes the core feed cannot reach
#
# Patient, Clinical Note and Inpatient Admission all live in the Healthcare
# module but are NOT submittable, so `create_medical_record` (an on_submit hook)
# can never fire for them. Patient Visit, Patient Medication Order and Discharge
# ARE submittable and are handled by Patient History Settings instead.
# --------------------------------------------------------------------------- #
def _history_enabled() -> bool:
	return bool(
		frappe.db.get_single_value("Healthcare Settings", "record_clinical_extras_in_history")
	)


def record_registration(doc, method=None) -> None:
	"""Patient `after_insert` - WF-072, registration into patient history."""
	if not _history_enabled():
		return
	subject = _("Patient registered - {0}").format(doc.get("patient_name") or doc.name)
	if doc.get("file_no"):
		subject += _(" (File No {0})").format(doc.file_no)
	_write(doc.name, subject, doc.doctype, doc.name, doc.get("creation"), doc.owner)


def record_clinical_note(doc, method=None) -> None:
	"""Clinical Note `on_update` - WF-074, consultations into patient history."""
	if not _history_enabled() or not doc.get("patient"):
		return
	note_type = doc.get("clinical_note_type") or _("Clinical Note")
	subject = _("{0} - {1}").format(note_type, doc.name)
	_write(
		doc.patient, subject, doc.doctype, doc.name,
		doc.get("posting_date") or doc.get("creation"), doc.owner,
	)


def record_admission(doc, method=None) -> None:
	"""Inpatient Admission `on_update` - WF-077, admissions into patient history."""
	if not _history_enabled() or not doc.get("patient"):
		return
	subject = _("Admission {0} - {1}").format(doc.name, doc.get("status") or _("Open"))
	if doc.get("case_no"):
		subject += _(" (Case {0})").format(doc.case_no)

	existing = frappe.db.get_value(
		"Patient Medical Record",
		{"reference_doctype": doc.doctype, "reference_name": doc.name},
		"name",
	)
	if existing:
		frappe.db.set_value("Patient Medical Record", existing, "subject", subject)
		return
	_write(doc.patient, subject, doc.doctype, doc.name, doc.get("creation"), doc.owner)


def remove_clinical_extra(doc, method=None) -> None:
	_clear(doc.doctype, doc.name)


# --------------------------------------------------------------------------- #
# backfill
# --------------------------------------------------------------------------- #
@frappe.whitelist()
def backfill_patient_history(limit: int = 2000) -> dict:
	"""Populate history for records created before these hooks existed."""
	plan = (
		("Sales Invoice", {"docstatus": 1, "patient": ["is", "set"]}, record_sales_invoice),
		("Payment Entry", {"docstatus": 1}, record_payment_entry),
		("Patient Follow Up", {"patient": ["is", "set"]}, record_follow_up),
	)

	counts: dict[str, int] = {}
	skipped: dict[str, int] = {}

	for doctype, filters, handler in plan:
		created = failed = 0
		for row in frappe.get_all(
			doctype, filters=filters, fields=["name"], limit_page_length=limit
		):
			try:
				doc = frappe.get_doc(doctype, row.name)
				before = frappe.db.count(
					"Patient Medical Record",
					{"reference_doctype": doctype, "reference_name": row.name},
				)
				handler(doc)
				after = frappe.db.count(
					"Patient Medical Record",
					{"reference_doctype": doctype, "reference_name": row.name},
				)
				if after > before:
					created += 1
			except Exception:
				# One bad legacy row must not abort the whole backfill.
				frappe.db.rollback()
				failed += 1
		counts[doctype] = created
		skipped[doctype] = failed
		frappe.db.commit()

	return {"created": counts, "skipped": skipped}
