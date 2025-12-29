# Copyright (c) 2025, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

from healthcare.healthcare.doctype.nursing_task.nursing_task import NursingTask
from healthcare.healthcare.utils import validate_nursing_tasks
from healthcare.healthcare.doctype.inpatient_admission.inpatient_admission import (
	validate_inpatient_invoicing,
	validate_incompleted_service_requests,
	check_out_inpatient
)


class Discharge(Document):
	def validate(self):
		# Validate that admission exists and is in correct status
		if self.admission:
			admission = frappe.get_doc("Inpatient Admission", self.admission)
			if admission.status not in ["Admitted", "Discharge Scheduled"]:
				frappe.throw(_("Cannot create Discharge for Inpatient Admission with status: {0}").format(admission.status))
			
			# Check if Discharge already exists for this admission
			existing_discharge = frappe.db.exists("Discharge", {
				"admission": self.admission,
				"name": ["!=", self.name],
				"docstatus": ["!=", 2]  # Not cancelled
			})
			if existing_discharge:
				frappe.throw(_("Discharge already exists for this Inpatient Admission: {0}").format(
					frappe.get_desk_link("Discharge", existing_discharge)
				))

	def on_submit(self):
		"""Update Inpatient Admission status to Discharged when Discharge is submitted"""
		if self.admission:
			admission = frappe.get_doc("Inpatient Admission", self.admission)
			
			# Validate before discharge
			validate_nursing_tasks(admission)
			validate_inpatient_invoicing(admission)
			validate_incompleted_service_requests(admission)
			
			# Update Inpatient Admission
			admission.discharge_datetime = self.discharge_date or now_datetime()
			admission.status = "Discharged"
			admission.save(ignore_permissions=True)
			
			# Update Patient status
			frappe.db.set_value("Patient", admission.patient, "inpatient_status", "Discharged")
			
			# Update Patient Visit if exists
			if admission.discharge_encounter:
				frappe.db.set_value(
					"Patient Visit",
					admission.discharge_encounter,
					"inpatient_status",
					"Discharged"
				)
			
			# Check out from service unit
			check_out_inpatient(admission)

	def on_cancel(self):
		"""Revert Inpatient Admission status when Discharge is cancelled"""
		if self.admission:
			admission = frappe.get_doc("Inpatient Admission", self.admission)
			# Revert to previous status (usually "Discharge Scheduled" or "Admitted")
			if admission.status == "Discharged":
				# Check if there was a discharge scheduled status before
				admission.status = "Admitted"  # or get from history
				admission.discharge_datetime = None
				admission.save(ignore_permissions=True)
				
				frappe.db.set_value("Patient", admission.patient, "inpatient_status", "Admitted")


