# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import nowdate
from frappe import _

class HealthcareServiceTemplate(Document):
	"""Template for IP/hospital services (e.g. Transport with Nurse, Transport Only).
	Used as template_dn with template_dt='Healthcare Service Template' on Service Request.
	"""
	
	def validate(self):
		"""Validate before save"""
		if self.service_id:
			self.service_id = self.service_id.strip().upper()
	
	def before_save(self):
		"""Handle item creation/updating before saving"""
		if not self.disabled:
			self.create_or_update_item()
		else:
			self.disable_linked_item()
	
	def on_trash(self):
		"""Clean up when template is deleted"""
		if self.item_code:
			# Option 1: Delete the item (if no transactions)
			# frappe.delete_doc("Item", self.linked_item, force=True)
			
			# Option 2: Just disable the item (recommended)
			frappe.db.set_value("Item", self.item_code, "disabled", 1)
			frappe.db.set_value("Item", self.item_code, "item_group", "Disabled Services")
	
	def create_or_update_item(self):
		"""Create or update the linked Item and Item Price"""
		if not self.service_id:
			frappe.throw(_("Service ID is required to create an item"))
		
		# Prepare item data
		item_data = {
			"doctype": "Item",
			"item_code": self.service_id,
			"item_name": self.service_name,
			"item_group": self.get_item_group(),
			"description": self.description or self.service_name,
			"is_stock_item": 0,  # Services are non-stock items
			"is_sales_item": 1,
			"is_purchase_item": 0,
			"stock_uom": "Nos",  # Unit of measurement
			"disabled": 0 if not self.disabled else 1,
		}
		
		# Check if item exists
		if frappe.db.exists("Item", self.service_id):
			# Update existing item
			item = frappe.get_doc("Item", self.service_id)
			item.update(item_data)
			item.save()
			frappe.msgprint(_("Item {0} updated").format(self.service_id))
		else:
			# Create new item
			item = frappe.get_doc(item_data)
			item.insert()
			frappe.msgprint(_("Item {0} created").format(self.service_id))
		
		# Link back to this template
		self.item_code = item.name
		
		# Create or update Item Price
		self.create_or_update_item_price(item.name)
	
	def create_or_update_item_price(self, item_code):
		"""Create or update the Item Price for this service"""
		if not self.rate or self.rate <= 0:
			return
		
		# Find existing item price
		existing_price = frappe.db.exists(
			"Item Price",
			{
				"item_code": item_code,
				"selling": 1
			}
		)
		
		price_data = {
			"doctype": "Item Price",
			"item_code": item_code,
			"price_list": "Standard Selling",  # Or get from settings
			"selling": 1,
			"price_list_rate": self.rate,
			"valid_from": nowdate(),
		}
		
		if existing_price:
			# Update existing
			price = frappe.get_doc("Item Price", existing_price)
			price.price_list_rate = self.rate
			price.save()
			frappe.msgprint(_("Item Price updated for {0}").format(item_code))
		else:
			# Create new
			price = frappe.get_doc(price_data)
			price.insert()
			frappe.msgprint(_("Item Price created for {0}").format(item_code))
	
	def disable_linked_item(self):
		"""Disable the linked item when service template is disabled"""
		if self.item_code:
			frappe.db.set_value("Item", self.item_code, "disabled", 1)
			frappe.db.set_value("Item", self.item_code, "item_group", "Disabled Services")
	
	def get_item_group(self):
		"""Determine item group based on category"""
		# Map categories to item groups
		category_mapping = {
			"Medical Service": "Medical Services",
			"Other Service": "Other Services"
		}
		
		# Get the target group name
		target_group = category_mapping.get(self.category, "Healthcare Services")
		
		# Check if item group exists, if not create it
		if not frappe.db.exists("Item Group", target_group):
			group = frappe.get_doc({
				"doctype": "Item Group",
				"item_group_name": target_group,
				"parent_item_group": "All Item Groups"
			})
			group.insert(ignore_permissions=True)
			frappe.msgprint(_("Created Item Group: {0}").format(target_group))
		
		return target_group

	def on_update(self):
		"""After save, sync pricing table to item price"""
		if self.pricing and self.item_code:
			self.sync_pricing_table()
	
	def sync_pricing_table(self):
		"""Sync the pricing table with Item Price records"""
		for price_row in self.pricing:
			# Check if item price exists for this price list
			existing = frappe.db.exists(
				"Item Price",
				{
					"item_code": self.item_code,
					"price_list": price_row.price_list
				}
			)
			
			if existing:
				item_price = frappe.get_doc("Item Price", existing)
				item_price.price_list_rate = price_row.rate
				item_price.valid_from = price_row.valid_from or nowdate()
				item_price.save()
			else:
				item_price = frappe.get_doc({
					"doctype": "Item Price",
					"item_code": self.item_code,
					"price_list": price_row.price_list,
					"selling": 1,
					"price_list_rate": price_row.rate,
					"valid_from": price_row.valid_from or nowdate()
				})
				item_price.insert()
