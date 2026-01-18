# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, date_diff


class InpatientPackageEnrollment(Document):
	def validate(self):
		# Validate dates
		if self.start_date and self.expected_discharge_date:
			if getdate(self.expected_discharge_date) < getdate(self.start_date):
				frappe.throw(_("Expected Discharge Date cannot be before Start Date."))
		
		# Validate package is active
		if self.package:
			package = frappe.get_doc("Inpatient Package", self.package)
			if not package.active:
				frappe.throw(_("Selected package '{0}' is not active.").format(self.package))
		
		# Auto-set expected discharge date based on package days
		if self.package and self.start_date and not self.expected_discharge_date:
			package = frappe.get_doc("Inpatient Package", self.package)
			if package.no_of_days:
				from frappe.utils import add_days
				self.expected_discharge_date = add_days(self.start_date, package.no_of_days - 1)
