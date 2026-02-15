# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class PatientFollowUp(Document):
	def validate(self):
		if self.patient and not self.patient_name:
			self.patient_name = frappe.db.get_value("Patient", self.patient, "patient_name")
		# When user checks "No Follow Up Required", set status so list views can filter
		if self.no_follow_up_required and self.status != "No Follow Up Required":
			self.status = "No Follow Up Required"
		if not self.no_follow_up_required and self.status == "No Follow Up Required":
			self.no_follow_up_required = 1  # keep in sync

	def on_update(self):
		# Optional: when marked "No Follow Up Required", exclude patient from future follow-up lists
		if self.no_follow_up_required or self.status == "No Follow Up Required":
			frappe.db.set_value("Patient", self.patient, "is_follow_up", 0)


def create_patient_follow_up_from_discharge(admission_name, discharge_doc=None):
	"""Create a Patient Follow Up (IP) when discharge is submitted. Call from Discharge on_submit.
	Uses Follow Up Date from Discharge form (or Inpatient Admission) and only if Patient has Allow Follow up? = 1.
	"""
	admission = frappe.db.get_value(
		"Inpatient Admission",
		admission_name,
		["patient", "patient_name", "company", "followup_date", "name"],
		as_dict=True,
	)
	if not admission:
		return None
	# Follow Up Date: from Discharge form (follow_up_date or next_appointment_date) or Inpatient Admission
	follow_up_date = None
	if discharge_doc:
		follow_up_date = getattr(discharge_doc, "follow_up_date", None) or getattr(
			discharge_doc, "next_appointment_date", None
		)
	if not follow_up_date and admission.get("followup_date"):
		follow_up_date = admission.followup_date
	if not follow_up_date:
		return None
	# Only if patient allows follow up
	if not frappe.db.get_value("Patient", admission.patient, "is_follow_up"):
		return None
	existing = frappe.db.exists(
		"Patient Follow Up",
		{
			"reference_doctype": "Inpatient Admission",
			"reference_name": admission_name,
			"follow_up_type": "IP",
		},
	)
	if existing:
		return existing
	doc = frappe.get_doc(
		{
			"doctype": "Patient Follow Up",
			"patient": admission.patient,
			"patient_name": admission.patient_name,
			"follow_up_type": "IP",
			"reference_doctype": "Inpatient Admission",
			"reference_name": admission_name,
			"follow_up_date": follow_up_date,
			"company": admission.company,
			"status": "Open",
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name
