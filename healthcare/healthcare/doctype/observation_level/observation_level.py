# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

import re

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint


SERVICES_ITEM_GROUP = "Services"


def ensure_services_item_group():
	"""Return 'Services' item group — create under a root group when missing."""
	if frappe.db.exists("Item Group", SERVICES_ITEM_GROUP):
		return SERVICES_ITEM_GROUP

	parent = None
	if frappe.db.exists("Item Group", "All Item Groups"):
		parent = "All Item Groups"
	if not parent:
		row = frappe.db.sql(
			"""
			select name from `tabItem Group`
			where ifnull(parent_item_group, '') = '' and is_group = 1
			order by lft asc limit 1
			"""
		)
		if row:
			parent = row[0][0]
	if not parent:
		parent = frappe.db.get_value("Item Group", {"is_group": 1}, "name", order_by="lft asc")
	if not parent:
		frappe.throw(_("Cannot create '{0}' Item Group — no Item Group tree found").format(SERVICES_ITEM_GROUP))

	grp = frappe.new_doc("Item Group")
	grp.item_group_name = SERVICES_ITEM_GROUP
	grp.parent_item_group = parent
	grp.is_group = 0
	grp.insert(ignore_permissions=True)
	return grp.name


def default_stock_uom():
	for cand in ("Unit", "Nos"):
		if frappe.db.exists("UOM", cand):
			return cand
	st = frappe.db.get_single_value("Stock Settings", "stock_uom")
	if st and frappe.db.exists("UOM", st):
		return st
	return "Nos"


# Strip chars that reliably break ERPNext Item Code / uniqueness checks; preserve casing & spaces (no dashed slugs).
_ITEM_CODE_STRIP_PATTERN = re.compile(r"[\x00-\x1f<>\"#%\\/|{\}^~]+")


def item_code_base_from_observation_title(title: str, max_length: int = 140) -> str:
	raw = _ITEM_CODE_STRIP_PATTERN.sub("", (title or "").strip())
	raw = re.sub(r"\s+", " ", raw).strip()
	if not raw:
		raw = "Observation Level"
	return raw[:max_length]


def unique_item_code_from_observation_title(title: str, max_total: int = 140) -> str:
	base = item_code_base_from_observation_title(title, max_total)
	if not frappe.db.exists("Item", base):
		return base
	idx = 2
	while idx < 100000:
		suff = str(idx)
		spaced_len = len(suff) + 1
		prefix_room = max_total - spaced_len
		if prefix_room < 1:
			frappe.throw(_("Observation Level title is too long to allocate a unique Item code"))
		prefix = base[:prefix_room].rstrip()
		candidate = f"{prefix} {suff}"[:max_total]
		if not frappe.db.exists("Item", candidate):
			return candidate
		idx += 1
	frappe.throw(_("Unable to derive a unique Item code for Observation Level"))


def create_sales_service_item(item_code: str, item_name: str, item_group: str):
	"""Minimal service Item for billing (Observation Level auto-create)."""
	if frappe.db.exists("Item", item_code):
		return

	item_doc = frappe.new_doc("Item")
	item_doc.item_code = item_code
	item_doc.item_name = item_name or item_code
	item_doc.item_group = item_group or ensure_services_item_group()
	item_doc.stock_uom = default_stock_uom()
	item_doc.is_sales_item = 1
	item_doc.is_stock_item = 0
	item_doc.disabled = 0
	if frappe.get_meta("Item").has_field("is_service_item"):
		item_doc.is_service_item = 1
	item_doc.description = _("{0} (auto-created from Observation Level)").format(item_name)

	item_doc.insert(ignore_permissions=True, ignore_mandatory=True)


class ObservationLevel(Document):
	def validate(self):
		self.ensure_billable_item()

	def ensure_billable_item(self):
		if not cint(self.is_billable):
			return

		services_fallback = ensure_services_item_group()

		if cint(self.link_existing_item):
			if not self.item:
				frappe.throw(_("Select an Item when Link Existing Item and Is Billable are set"))
			it = frappe.db.get_value("Item", self.item, ["item_code"], as_dict=True)
			if not it:
				frappe.throw(_("Item {0} not found").format(self.item))
			self.item_code = it.item_code or self.item
			if not self.item_group:
				ig = frappe.db.get_value("Item", self.item, "item_group")
				self.item_group = ig or services_fallback
			return

		label = (self.observation_level or "").strip()
		if not label:
			frappe.throw(_("Observation Level name is required when Is Billable is set"))

		item_group_target = (
			self.item_group if self.item_group and frappe.db.exists("Item Group", self.item_group)
			else services_fallback
		)

		item_code_existing = None
		if self.item:
			code = frappe.db.get_value("Item", self.item, "item_code") or self.item
			if code and frappe.db.exists("Item", code):
				item_code_existing = code
		if not item_code_existing and self.item_code and frappe.db.exists("Item", self.item_code):
			item_code_existing = self.item_code

		if item_code_existing:
			self.item = item_code_existing
			self.item_code = item_code_existing
			if not self.item_group:
				self.item_group = frappe.db.get_value("Item", item_code_existing, "item_group") or item_group_target
			return

		new_code = unique_item_code_from_observation_title(label)
		create_sales_service_item(new_code, label, item_group_target)
		self.item = new_code
		self.item_code = new_code
		if not self.item_group:
			self.item_group = item_group_target
