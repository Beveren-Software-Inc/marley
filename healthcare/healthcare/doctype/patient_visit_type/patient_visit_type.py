# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class PatientVisitType(Document):
	def validate(self):
		self._ensure_single_default()

	def _ensure_single_default(self):
		"""Only one Patient Visit Type may be the default at a time."""
		if not self.is_default:
			return
		others = frappe.get_all(
			"Patient Visit Type",
			filters={"is_default": 1, "name": ["!=", self.name]},
			pluck="name",
		)
		for name in others:
			frappe.db.set_value("Patient Visit Type", name, "is_default", 0)
