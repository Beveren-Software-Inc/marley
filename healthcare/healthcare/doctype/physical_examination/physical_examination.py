# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

from healthcare.api.utils.api_utility import get_next_transaction_number


def assign_physical_examination_trans_no(doc) -> None:
	"""Assign trans_no for new Physical Examination records (autoname: field:trans_no). Server-only."""
	if (doc.get("trans_no") or "").strip():
		return
	doc.trans_no = get_next_transaction_number("Physical Examination", fieldname="trans_no")


class PhysicalExamination(Document):
	def before_insert(self):
		assign_physical_examination_trans_no(self)
