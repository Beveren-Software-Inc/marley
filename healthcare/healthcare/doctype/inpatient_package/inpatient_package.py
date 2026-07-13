# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, cint


class InpatientPackage(Document):
	def validate(self):
		rate = flt(self.package_rate)
		days = cint(self.no_of_days)
		if not flt(self.base_total) and rate and days:
			self.base_total = rate * days
