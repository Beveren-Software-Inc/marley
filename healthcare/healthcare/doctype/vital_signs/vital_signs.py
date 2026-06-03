# -*- coding: utf-8 -*-
# Copyright (c) 2015, ESS LLP and contributors
# For license information, please see license.txt


import frappe
from frappe import _
from frappe.model.document import Document

from healthcare.api.utils.api_utility import get_next_transaction_number


def assign_vital_signs_trans_no(doc) -> None:
	"""Assign trans_no for new Vital Signs (autoname: field:trans_no). Server-only."""
	if (doc.get("trans_no") or "").strip():
		return
	doc.trans_no = get_next_transaction_number("Vital Signs", fieldname="trans_no")


class VitalSigns(Document):
	def before_insert(self):
		assign_vital_signs_trans_no(self)

	def validate(self):
		self.set_title()

	def set_title(self):
		self.title = _("{0} on {1}").format(
			self.patient_name or self.patient, frappe.utils.format_date(self.signs_date)
		)[:100]
