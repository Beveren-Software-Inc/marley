# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class IOPEnrollment(Document):
	"""Enrollment of a patient in an IOP day (schedule)."""

	def validate(self):
		if self.iop_day:
			self.posting_date = frappe.db.get_value("IOP Day", self.iop_day, "posting_date")
		if self.patient and not self.patient_name:
			self.patient_name = frappe.db.get_value("Patient", self.patient, "patient_name")
