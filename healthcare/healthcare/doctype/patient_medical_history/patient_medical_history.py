# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import cint, now_datetime

from healthcare.api.warning_message import insert_medical_warning_message


class PatientMedicalHistory(Document):
	def validate(self):
		if cint(self.no_known_allergies):
			self.allergies = ""
		self._validate_visit_writable()

	def _validate_visit_writable(self):
		"""Past medical history can only be written for an Open or Ordered visit.
		Completed / cancelled visits are view-only. A pure Active/Inactive status
		change is still allowed (curation, not writing history)."""
		if not self.get("patient_visit"):
			return
		# On update, allow if only the Active/Inactive status (not clinical content) changed.
		if not self.is_new():
			before = self.get_doc_before_save()
			if before:
				content_fields = (
					"heart_disease", "diabetes", "asthma", "strokes", "other_ongoing_illness",
					"previous_surgical_history", "current_and_past_medications", "no_known_allergies",
					"allergies", "social_history", "addiction", "smoking", "patient_visit",
					"inpatient_admission", "template",
				)
				content_changed = any(
					(self.get(f) or "") != (before.get(f) or "") for f in content_fields
				)
				if not content_changed:
					return
		status = frappe.db.get_value("Patient Visit", self.patient_visit, "status")
		if status and status not in ("Open", "Ordered"):
			frappe.throw(
				frappe._(
					"Past medical history can only be added for an Open or Ordered visit. "
					"Visit {0} is {1} — it is view-only."
				).format(self.patient_visit, status)
			)

	def after_insert(self):
		self._sync_allergy_warning()

	def on_update(self):
		self._sync_allergy_warning()

	def on_trash(self):
		_delete_allergy_warnings_for_pmh(self.name)

	def _sync_allergy_warning(self):
		if not self.patient or not self.name:
			return

		allergies = (self.allergies or "").strip()
		if cint(self.no_known_allergies) or not allergies:
			_delete_allergy_warnings_for_pmh(self.name)
			return

		warning_text = allergies
		existing = frappe.db.get_value(
			"Warning Message",
			{
				"patient": self.patient,
				"reference_doc": "Patient Medical History",
				"reference_name": self.name,
			},
			"name",
		)

		if existing:
			doc = frappe.get_doc("Warning Message", existing)
			if (doc.warning or "").strip() != warning_text:
				doc.warning = warning_text
				doc.save(ignore_permissions=True)
			return

		insert_medical_warning_message(
			self.patient,
			warning_text,
			reference_doc="Patient Medical History",
			reference_name=self.name,
			posting_date=now_datetime(),
		)


def _delete_allergy_warnings_for_pmh(pmh_name: str) -> None:
	if not pmh_name:
		return
	for name in frappe.get_all(
		"Warning Message",
		filters={
			"reference_doc": "Patient Medical History",
			"reference_name": pmh_name,
		},
		pluck="name",
	):
		frappe.delete_doc("Warning Message", name, ignore_permissions=True, force=True)
