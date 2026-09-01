# Copyright (c) 2025, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint


def _template_attribute_rows(template_name: str) -> list[dict]:
	if not template_name:
		return []
	if not frappe.db.exists("Patient History Template", template_name):
		frappe.throw(_("Patient History Template “{0}” was not found.").format(template_name))
	template = frappe.get_doc("Patient History Template", template_name)
	return [
		{
			"attribute": row.attribute or "",
			"attrib_num": cint(row.attrib_num),
			"order_of_attrib": cint(row.order_no),
			"att_notes": "",
			"cr_id": "",
			"cr_date": "",
			"up_id": "",
			"up_date": "",
		}
		for row in (template.history_detail or [])
		if cint(row.attrib_num)
	]


def _attribute_index(children) -> dict[int, int]:
	idx: dict[int, int] = {}
	for i, child in enumerate(children or []):
		num = cint(getattr(child, "attrib_num", 0))
		if num:
			idx[num] = i
	return idx


class ECTDetails(Document):
	def validate(self):
		self._sync_cost_centers()
		self._seed_attributes_from_template()

	def _sync_cost_centers(self):
		"""Keep native ``cost_center`` and site Custom Field ``custom_cost_center`` in sync.

		``custom_cost_center`` is a mandatory Customize Form field on some sites.
		The portal writes ``cost_center``; copy it over so insert does not fail.
		"""
		native = (self.get("cost_center") or "").strip() or None
		custom = (self.get("custom_cost_center") or "").strip() or None if self.meta.has_field("custom_cost_center") else None
		if not custom and native and self.meta.has_field("custom_cost_center"):
			self.custom_cost_center = native
		elif not native and custom:
			self.cost_center = custom

	def _seed_attributes_from_template(self):
		template_name = (self.template or "").strip()
		if not template_name:
			return

		template_rows = _template_attribute_rows(template_name)
		if not template_rows:
			return

		if not self.get("ect_details_attributes"):
			for row in template_rows:
				self.append("ect_details_attributes", dict(row))
			return

		idx = _attribute_index(self.ect_details_attributes)
		for row in template_rows:
			attrib_num = cint(row.get("attrib_num"))
			if not attrib_num:
				continue
			if attrib_num in idx:
				child = self.ect_details_attributes[idx[attrib_num]]
				if not child.attribute:
					child.attribute = row["attribute"]
				if not cint(child.order_of_attrib):
					child.order_of_attrib = row["order_of_attrib"]
				continue
			self.append("ect_details_attributes", dict(row))
