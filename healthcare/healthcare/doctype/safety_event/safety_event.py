# Copyright (c) 2026, Beveren Software Inc. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class SafetyEvent(Document):
	def validate(self):
		# Calculate risk score if patient is involved
		if self.affected_person == "Patient" and self.risk_probability and self.risk_severity:
			# Extract numeric values from select options
			prob_value = int(self.risk_probability.split(" - ")[0]) if " - " in self.risk_probability else int(self.risk_probability)
			severity_value = int(self.risk_severity.split(" - ")[0]) if " - " in self.risk_severity else int(self.risk_severity)
			
			self.risk_score = prob_value * severity_value
			
			# Determine risk rate based on score
			if self.risk_score >= 1 and self.risk_score <= 8:
				self.risk_rate = "Low Risk (1-8)"
			elif self.risk_score >= 9 and self.risk_score <= 15:
				self.risk_rate = "Medium Risk (9-15)"
			elif self.risk_score >= 16 and self.risk_score <= 25:
				self.risk_rate = "High Risk (16-25)"
			else:
				self.risk_rate = None

