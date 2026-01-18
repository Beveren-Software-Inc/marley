# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate


class PackageUsage(Document):
	def validate(self):
		# Validate package enrollment is active
		if self.package_enrollment:
			enrollment = frappe.get_doc("Inpatient Package Enrollment", self.package_enrollment)
			if enrollment.status != "Active":
				frappe.throw(_("Package Enrollment must be Active to record usage."))
			
			# Validate date is within enrollment period
			if enrollment.start_date and self.date:
				if getdate(self.date) < getdate(enrollment.start_date):
					frappe.throw(_("Usage date cannot be before enrollment start date."))
				
				if enrollment.expected_discharge_date and getdate(self.date) > getdate(enrollment.expected_discharge_date):
					frappe.msgprint(_("Usage date is after expected discharge date."), indicator="orange")
