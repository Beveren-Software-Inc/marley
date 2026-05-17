# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class LabTestResultRule(Document):
	def validate(self):
		if not self.enabled:
			return
		has_sum = bool(self.sum_events)
		has_lines = bool(self.rule_lines)
		if not has_sum and not has_lines:
			frappe.throw(
				_(
					"Add at least one row in Sum Events and/or Rules, "
					"or disable this rule."
				)
			)
		if (self.sum_target or self.sum_tolerance) and not has_sum:
			frappe.msgprint(
				_(
					"Tests That Must Sum to Target is empty — validation will not run "
					"until you add each child test (e.g. Neutrophils, Lymphocytes on CBC)."
				),
				indicator="orange",
				alert=True,
			)
