from __future__ import unicode_literals

import dateutil

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate


class ServiceRequestController(Document):
	def validate(self):
		self.set_patient_age()
		self.set_order_details()
		self.set_title()

	def before_submit(self):
		if self.doctype == "Service Request":
			if self.status not in [
				"active-Request Status",
				"on-hold-Request Status",
				"unknown-Request Status",
			]:
				self.status = "active-Request Status"
		elif self.doctype == "Medication Request":
			if self.status not in [
				"active-Medication Request Status",
				"on-hold-Medication Request Status",
				"unknown-Medication Request Status",
			]:
				self.status = "active-Medication Request Status"

	def before_cancel(self):
		not_allowed = ["completed-Medication Request Status", "on-hold-Medication Request Status"]
		if self.status in not_allowed:
			frappe.throw(
				_("You cannot Cancel Service Request in {} status").format(", ".join(not_allowed)),
				title=_("Not Allowed"),
			)

	def on_cancel(self):
		if self.doctype == "Service Request":
			if self.status == "active-Request Status":
				self.db_set("status", "revoked-Request Status")
		elif self.doctype == "Medication Request":
			if self.status == "active-Medication Request Status":
				self.db_set("status", "cancelled-Medication Request Status")

	def set_patient_age(self):
		if not self.patient or not frappe.db.exists("Patient", self.patient):
			return
		patient = frappe.get_doc("Patient", self.patient)
		self.patient_age_data = patient.get_age()
		# Store age in years (int) for DB/versioning; relativedelta is not serializable
		delta = dateutil.relativedelta.relativedelta(getdate(), getdate(patient.dob))
		self.patient_age = delta.years if delta else 0


@frappe.whitelist()
def set_request_status(doctype, request, status):
	# Guard this generic status setter: only the request doctypes, an existing
	# record, and a valid Request-Status Code Value may be written.
	allowed_doctypes = {"Service Request", "Medication Request"}
	if doctype not in allowed_doctypes:
		frappe.throw(frappe._("Cannot set request status on {0}").format(doctype))
	if not frappe.db.exists(doctype, request):
		frappe.throw(frappe._("{0} {1} not found").format(doctype, request))
	if not frappe.db.exists("Code Value", status):
		frappe.throw(frappe._("Invalid request status: {0}").format(status))
	frappe.db.set_value(doctype, request, "status", status)
