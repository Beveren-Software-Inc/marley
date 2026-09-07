# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class HomicideRiskAssessment(Document):
	def before_save(self):
		from healthcare.api.assessment_care_context import fill_assessment_cost_center_from_care_context

		fill_assessment_cost_center_from_care_context(self)
