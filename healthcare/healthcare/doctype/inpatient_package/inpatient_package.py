# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class InpatientPackage(Document):
	def validate(self):
		# Validate that at least one service is added
		if not self.services or len(self.services) == 0:
			frappe.throw(_("Please add at least one service to the package."))
