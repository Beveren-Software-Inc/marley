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
	check_out_inpatient,
)


def _get_stopped_medication_entries_for_admission(admission: str) -> list[dict]:
	"""Return PMO child rows for this admission that have reason_stopped set."""
	if not admission:
		return []

	order_names = frappe.get_all(
		"Patient Medication Order",
		filters={"inpatient_record": admission, "docstatus": ["!=", 2]},
		pluck="name",
	)
	if not order_names:
		return []

	return frappe.get_all(
		"Inpatient Medication Order Entry",
		filters={
			"parent": ["in", order_names],
			"reason_stopped": ["!=", ""],
		},
		fields=["name", "parent", "drug", "drug_name", "reason_stopped"],
		order_by="parent asc, idx asc",
	)


def get_stopped_medications_for_admission(admission: str) -> list[dict]:
	"""Structured stopped medications for portal discharge detail."""
	rows = []
	for entry in _get_stopped_medication_entries_for_admission(admission):
		reason = (entry.get("reason_stopped") or "").strip()
		if not reason:
			continue
		drug_name = (entry.get("drug_name") or entry.get("drug") or _("Medication")).strip()
		rows.append(
			{
				"name": entry.get("name"),
				"prescription": entry.get("parent") or "",
				"drug": entry.get("drug") or "",
				"drug_name": drug_name,
				"reason_stopped": reason,
			}
		)
	return rows


def get_discharge_stopped_medication_reasons_for_admission(admission: str) -> str:
	"""Build discharge stopped-medication text from PMO line items with reason_stopped."""
	lines = []
	for entry in _get_stopped_medication_entries_for_admission(admission):
		reason = (entry.get("reason_stopped") or "").strip()
		if not reason:
			continue
		drug = (entry.get("drug_name") or entry.get("drug") or _("Medication")).strip()
		order = entry.get("parent") or ""
		if order:
			lines.append(f"{order} — {drug}: {reason}")
		else:
			lines.append(f"{drug}: {reason}")

	return "\n".join(lines)


class Discharge(Document):
	def validate(self):
		if self.admission:
			self.discharge_medic_stopped_reason = get_discharge_stopped_medication_reasons_for_admission(
				self.admission
			)
	# def validate(self):
	# 	# Validate that admission exists and is in correct status
	# 	if self.admission:
	# 		admission = frappe.get_doc("Inpatient Admission", self.admission)
	# 		if admission.status not in ["Admitted", "Discharge Scheduled"]:
	# 			frappe.throw(_("Cannot create Discharge for Inpatient Admission with status: {0}").format(admission.status))
			
	# 		# Check if Discharge already exists for this admission
	# 		existing_discharge = frappe.db.exists("Discharge", {
	# 			"admission": self.admission,
	# 			"name": ["!=", self.name],
	# 			"docstatus": ["!=", 2]  # Not cancelled
	# 		})
	# 		if existing_discharge:
	# 			frappe.throw(_("Discharge already exists for this Inpatient Admission: {0}").format(
	# 				frappe.get_desk_link("Discharge", existing_discharge)
	# 			))

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

			# Create Patient Follow Up (IP) for CRM if Follow Up Date is set
			from healthcare.healthcare.doctype.patient_follow_up.patient_follow_up import (
				create_patient_follow_up_from_discharge,
			)
			create_patient_follow_up_from_discharge(self.admission, discharge_doc=self)

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


