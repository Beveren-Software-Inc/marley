# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class DoctorCommissionSource(Document):
	def validate(self):
		self.source_doctype = (self.source_doctype or "").strip()
		if not self.source_doctype:
			frappe.throw(_("Source DocType is required"))
		if not frappe.db.exists("DocType", self.source_doctype):
			frappe.throw(_("DocType {0} does not exist").format(frappe.bold(self.source_doctype)))

		field = (self.practitioner_field or "").strip()
		self.practitioner_field = field or None
		if field:
			meta = frappe.get_meta(self.source_doctype)
			df = meta.get_field(field)
			if not df:
				frappe.throw(
					_("Field {0} does not exist on {1}").format(
						frappe.bold(field), frappe.bold(self.source_doctype)
					)
				)
			if df.fieldtype != "Link" or df.options != "Healthcare Practitioner":
				frappe.throw(
					_("Field {0} on {1} must be a Link to Healthcare Practitioner").format(
						frappe.bold(field), frappe.bold(self.source_doctype)
					)
				)
