# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


@frappe.whitelist()
def get_follow_ups(status=None, cost_center=None, limit=100, offset=0):
	"""List Patient Follow Up for UI with filters. Excludes no_follow_up_required by default."""
	filters = []
	if status:
		filters.append(["status", "=", status])
	if cost_center:
		filters.append(["cost_center", "=", cost_center])
	fields = [
		"name", "patient", "patient_name", "follow_up_type", "follow_up_date",
		"status", "cost_center", "remarks", "company",
	]
	out = frappe.get_all(
		"Patient Follow Up",
		filters=filters,
		fields=fields,
		order_by="follow_up_date asc",
		limit=int(limit) if limit else 100,
		start=int(offset) if offset else 0,
	)
	print("Follow up here ", len(out))
	return out


@frappe.whitelist()
def send_follow_up_reminder(patient_follow_up_name, channel="sms"):
	"""Send one reminder for the given Patient Follow Up.

	channel: 'email' | 'whatsapp' | 'sms'
	"""
	if not patient_follow_up_name:
		return {"sent": False, "message": "No follow-up specified"}

	channel = (channel or "sms").lower()

	doc = frappe.db.get_value(
		"Patient Follow Up",
		patient_follow_up_name,
		["patient", "patient_name", "follow_up_date", "whatsapp_template"],
		as_dict=True,
	)
	if not doc:
		return {"sent": False, "message": "Follow-up not found"}

	message_text = _("Follow-up reminder: Dear {0}, your follow-up date is {1}. Please contact the hospital.").format(
		doc.patient_name or doc.patient,
		doc.follow_up_date,
	)

	if channel == "whatsapp":
		mobile = _resolve_follow_up_mobile(doc.patient)
		if not mobile:
			return {"sent": False, "message": "Patient has no mobile number"}
		return _send_follow_up_via_whatsapp(doc, mobile, patient_follow_up_name, message_text)
	elif channel == "email":
		patient_email = frappe.db.get_value("Patient", doc.patient, "email") if doc.patient else None
		if not patient_email:
			return {"sent": False, "message": "Patient has no email address"}
		try:
			frappe.sendmail(
				recipients=[patient_email],
				subject=_("Follow-Up Reminder"),
				message=message_text,
			)
			return {"sent": True, "channel": "email"}
		except Exception as e:
			frappe.log_error(title="Follow-up email reminder failed", message=frappe.get_traceback())
			return {"sent": False, "message": str(e)}
	else:
		mobile = _resolve_follow_up_mobile(doc.patient)
		if not mobile:
			return {"sent": False, "message": "Patient has no mobile number"}
		try:
			from frappe.core.doctype.sms_settings.sms_settings import send_sms
			send_sms([mobile], message_text)
			return {"sent": True, "channel": "sms"}
		except Exception as e:
			frappe.log_error(title="Follow-up SMS reminder failed", message=frappe.get_traceback())
			return {"sent": False, "message": str(e)}


def _resolve_follow_up_mobile(patient):
	"""Resolve the best mobile number for a patient."""
	values = frappe.db.get_value(
		"Patient", patient,
		["mobile", "mobile_no", "mobile_no_1", "phone"],
		as_dict=True,
	) or {}
	for field in ("mobile", "mobile_no", "mobile_no_1", "phone"):
		number = (values.get(field) or "").strip()
		if number:
			return number
	return ""


def _send_follow_up_via_whatsapp(doc, mobile, follow_up_name, fallback_body=""):
	"""Send a WhatsApp message for a follow-up reminder (template or plain text)."""
	try:
		from healthcare.healthcare.doctype.digital_connect_whatsap_settings.digital_connect_whatsap_settings import (
			send_test_message,
		)

		template_name = doc.get("whatsapp_template")
		if template_name:
			result = send_test_message(phone_number=mobile, template_name=template_name)
		else:
			result = send_test_message(phone_number=mobile, body=fallback_body, preview_url=1)
		chat_name = result.get("chat_name") if isinstance(result, dict) else None
		if chat_name:
			frappe.db.set_value(
				"Digital Whatsapp Chat",
				chat_name,
				{
					"reference_doctype": "Patient Follow Up",
					"reference_name": follow_up_name,
				},
				update_modified=True,
			)
		return {"sent": True, "channel": "whatsapp"}
	except Exception as e:
		frappe.log_error(title="Follow-up WhatsApp reminder failed", message=frappe.get_traceback())
		return {"sent": False, "message": str(e)}


@frappe.whitelist()
def send_follow_up_reminders_bulk(status=None, cost_center=None, channel="sms"):
	"""Send reminders for all follow-ups matching filters (default status Open)."""
	filters = [["no_follow_up_required", "=", 0]]
	if status:
		filters.append(["status", "=", status])
	else:
		filters.append(["status", "=", "Open"])
	if cost_center:
		filters.append(["cost_center", "=", cost_center])
	names = frappe.get_all(
		"Patient Follow Up",
		filters=filters,
		pluck="name",
		limit=200,
	)
	sent = 0
	for name in names:
		res = send_follow_up_reminder(name, channel=channel)
		if res.get("sent"):
			sent += 1
	return {"sent": sent, "total": len(names)}


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

@frappe.whitelist()
def update_follow_up_status(patient_follow_up_name, status):
	"""Update status of a Patient Follow Up. Call from UI or API."""
	if not patient_follow_up_name:
		return {"updated": False, "message": "No follow-up specified"}
	if status not in ["Open", "Completed", "No Follow Up Required"]:
		return {"updated": False, "message": "Invalid status"}
	try:
		doc = frappe.get_doc("Patient Follow Up", patient_follow_up_name)
		doc.status = status
		if status == "No Follow Up Required":
			doc.no_follow_up_required = 1
		doc.save()
		return {"updated": True}
	except Exception as e:
		frappe.log_error(title="Follow-up status update failed", message=frappe.get_traceback())
		return {"updated": False, "message": str(e)}