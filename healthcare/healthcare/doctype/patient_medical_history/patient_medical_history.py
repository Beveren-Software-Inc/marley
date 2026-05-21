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
