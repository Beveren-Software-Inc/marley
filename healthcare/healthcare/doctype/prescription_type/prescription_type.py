# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document

from healthcare.api.prescription_type_mapping import clear_redundancy_type_cache


class PrescriptionType(Document):
	def on_update(self):
		# Legacy prescription lines resolve their type through this mapping.
		clear_redundancy_type_cache()

	def on_trash(self):
		clear_redundancy_type_cache()

