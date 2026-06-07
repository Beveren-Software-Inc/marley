# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class EnvironmentalChecklist(Document):
	def validate(self):
		if self.inpatient_admission and not self.patient:
			self.patient = frappe.db.get_value(
				"Inpatient Admission", self.inpatient_admission, "patient"
			)

		if self.patient and not self.patient_name:
			self.patient_name = frappe.db.get_value("Patient", self.patient, "patient_name")

		if self.practitioner and not self.practitioner_name:
			self.practitioner_name = frappe.db.get_value(
				"Healthcare Practitioner", self.practitioner, "practitioner_name"
			)
