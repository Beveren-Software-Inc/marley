# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class ConsultationServiceTemplate(Document):
	def before_save(self):
		# Only proceed if item_code is provided
		if not self.item_code:
			return

		# Check if item already exists
		if frappe.db.exists("Item", self.item_code):
			return

		# Determine item group
		item_group = self.item_group or "Service"

		# Create new Item
		item = frappe.get_doc({
			"doctype": "Item",
			"item_code": self.item_code,
			"item_name": self.item_name or self.template_name,
			"item_group": item_group,
			"stock_uom": "Nos",
			"is_stock_item": 0,
		})

		item.insert(ignore_permissions=True)

		frappe.msgprint(f"Item <b>{self.item_code}</b> created automatically.")
