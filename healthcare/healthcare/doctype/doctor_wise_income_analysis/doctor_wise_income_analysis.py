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
		if self.period and self.period not in ("Yearly", "Quarterly", "Monthly"):
			frappe.throw(_("Period must be Yearly, Quarterly, or Monthly"))

	@frappe.whitelist()
	def generate_analysis(self):
		"""Build period breakdown and refresh the HTML report."""
		from healthcare.api.doctor_wise_income_analysis import generate_doctor_wise_income_analysis

		return generate_doctor_wise_income_analysis(self)
