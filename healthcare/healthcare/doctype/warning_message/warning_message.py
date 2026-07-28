# Copyright (c) 2025, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class WarningMessage(Document):
	def validate(self):
		if self.is_special_phone_warning and not self.patient:
			frappe.throw(_("Patient is required for a special phone warning."))

		if self.is_special_phone_warning:
			if not self.verification_status:
				self.verification_status = "Unverified"
			if not self.clinical_urgency:
				self.clinical_urgency = "Low"
			if not self.follow_up_status:
				self.follow_up_status = "Open"
			if not self.received_by_user:
				self.received_by_user = frappe.session.user
			if not self.received_at:
				self.received_at = self.posting_date or frappe.utils.now()

		if not self.is_special_phone_warning:
			self.show_in_standard_warning_popup = 0
