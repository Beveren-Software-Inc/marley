# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime


class ReceptionistShift(Document):
	def validate(self):
		if self.is_new() and self.status != "Open":
			frappe.throw(_("New receptionist shifts must start as Open."))

		if self.status == "Open":
			self._validate_single_open_shift()

	def _validate_single_open_shift(self):
		filters = {"user": self.user, "status": "Open", "name": ("!=", self.name)}
		existing = frappe.db.exists("Receptionist Shift", filters)
		if existing:
			frappe.throw(
				_("Receptionist {0} already has an open shift ({1}). Close it before opening a new one.").format(
					self.user, existing
				)
			)

	def close_shift(self, closing_notes=None):
		if self.status == "Closed":
			frappe.throw(_("This shift is already closed."))

		self.status = "Closed"
		self.closed_at = now_datetime()
		if closing_notes is not None:
			self.closing_notes = closing_notes
		self.save(ignore_permissions=True)
