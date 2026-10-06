# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate


class DoctorWiseIncomeAnalysis(Document):
	def validate(self):
		if self.from_date and self.to_date and getdate(self.from_date) > getdate(self.to_date):
			frappe.throw(_("From Date cannot be after To Date"))

	@frappe.whitelist()
	def generate_analysis(self):
		"""Populate doctor rows from Doctor Service Revenue attribution (3-year compare)."""
		from healthcare.api.doctor_wise_income_analysis import generate_doctor_wise_income_analysis

		if self.is_new():
			frappe.throw(_("Save the document before generating"))

		return generate_doctor_wise_income_analysis(self)
