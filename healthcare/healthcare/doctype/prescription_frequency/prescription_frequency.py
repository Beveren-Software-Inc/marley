# -*- coding: utf-8 -*-
# Copyright (c) 2017, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt


import frappe
from frappe.model.document import Document


class PrescriptionFrequency(Document):
	pass


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def get_prescription_frequency_list(doctype, txt, searchfield, start, page_len, filters=None):
	"""Desk Link field query: only active prescription frequencies."""
	filters = dict(filters or {})
	if frappe.db.has_column("Prescription Frequency", "active"):
		filters["active"] = 1

	text_in = {
		"dosage": ("like", f"%{txt}%"),
		"name": ("like", f"%{txt}%"),
	}

	return frappe.get_all(
		"Prescription Frequency",
		fields=["name", "dosage"],
		filters=filters,
		or_filters=text_in,
		start=start,
		page_length=page_len,
		order_by="dosage asc",
		as_list=1,
	)
