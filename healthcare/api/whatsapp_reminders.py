from __future__ import annotations

import datetime

import frappe

from healthcare.healthcare.doctype.digital_connect_whatsap_settings.digital_connect_whatsap_settings import (
	send_test_message,
)


def send_daily_whatsapp_reminders():
	"""Daily WhatsApp reminder runner.

	Sends:
	- Patient Appointment reminders 1 day before appointment_date
	- Discharge follow-up reminders 2 days and 1 day before next_appointment_date
	- Subscription Medication Plan (monthly meds) reminders 1 day before next_run_date
	"""
	if not _is_whatsapp_enabled():
		return

	send_appointment_whatsapp_reminders(days_before=1)
	send_discharge_followup_whatsapp_reminders(days_before=2)
	send_discharge_followup_whatsapp_reminders(days_before=1)
	send_subscription_medication_whatsapp_reminders(days_before=1)


def send_subscription_medication_whatsapp_reminders(days_before: int = 1):
	"""Remind patients whose monthly medication plan is due soon (next_run_date)."""
	if not frappe.db.exists("DocType", "Subscription Medication Plan"):
		return

	target_date = datetime.date.today() + datetime.timedelta(days=days_before)
	plans = frappe.get_all(
		"Subscription Medication Plan",
		filters={
			"docstatus": 1,
			"status": "Active",
			"next_run_date": target_date,
		},
		fields=[
			"name",
			"patient",
			"patient_name",
			"frequency",
			"next_run_date",
			"company",
		],
		ignore_permissions=True,
	)

	has_template_field = frappe.get_meta("Subscription Medication Plan").has_field("whatsapp_template")
	if has_template_field:
		for plan in plans:
			plan["whatsapp_template"] = frappe.db.get_value(
				"Subscription Medication Plan", plan.name, "whatsapp_template"
			)

	for plan in plans:
		phone = _resolve_patient_mobile(plan.get("patient") or "")
		if not phone:
			continue

		from healthcare.healthcare.doctype.patient_appointment.patient_appointment import (
			_normalize_whatsapp_phone,
		)

		phone = _normalize_whatsapp_phone(phone, company=plan.get("company"))
		if not phone:
			continue

		tag = f"subscription-med-reminder-{days_before}d-{target_date}"
		if _already_sent("Subscription Medication Plan", plan.name, tag):
			continue

		if plan.get("whatsapp_template"):
			_send_and_link_chat(
				phone_number=phone,
				reference_doctype="Subscription Medication Plan",
				reference_name=plan.name,
				bulk_reference=tag,
				template_name=plan.whatsapp_template,
			)
		else:
			message = _build_subscription_medication_message(plan, days_before)
			_send_and_link_chat(
				phone_number=phone,
				body=message,
				reference_doctype="Subscription Medication Plan",
				reference_name=plan.name,
				bulk_reference=tag,
			)


def _build_subscription_medication_message(plan: dict, days_before: int) -> str:
	when_text = "tomorrow" if days_before == 1 else f"in {days_before} days"
	date_text = frappe.format_value(plan.get("next_run_date"), {"fieldtype": "Date"})
	patient_name = plan.get("patient_name") or plan.get("patient") or "Patient"
	frequency = (plan.get("frequency") or "Monthly").lower()
	return (
		f"Dear {patient_name}, this is a reminder that your {frequency} medication refill "
		f"is due {when_text} ({date_text}). Please visit the pharmacy to collect your medicines."
	)


def send_appointment_whatsapp_reminders(days_before: int = 1):
	target_date = datetime.date.today() + datetime.timedelta(days=days_before)
	appointments = frappe.get_all(
		"Patient Appointment",
		filters={
			"appointment_date": target_date,
			"status": ["!=", "Cancelled"],
		},
		fields=[
			"name",
			"patient",
			"patient_name",
			"appointment_date",
			"appointment_time",
			"practitioner_name",
			"company",
			"cost_center",
			"temporary_mobile_no",
			"whatsapp_template",
		],
		ignore_permissions=True,
	)

	for appt in appointments:
		phone = _resolve_appointment_mobile(appt)
		if not phone:
			continue

		tag = f"appointment-reminder-{days_before}d-{target_date}"
		if _already_sent("Patient Appointment", appt.name, tag):
			continue
		print("Phone number is", phone)
		if appt.get("whatsapp_template"):
			_send_and_link_chat(
				phone_number=phone,
				reference_doctype="Patient Appointment",
				reference_name=appt.name,
				bulk_reference=tag,
				template_name=appt.whatsapp_template,
			)
		else:
			message = _build_appointment_message(appt, days_before)
			_send_and_link_chat(
				phone_number=phone,
				body=message,
				reference_doctype="Patient Appointment",
				reference_name=appt.name,
				bulk_reference=tag,
			)


def send_discharge_followup_whatsapp_reminders(days_before: int):
	target_date = datetime.date.today() + datetime.timedelta(days=days_before)
	discharges = frappe.get_all(
		"Discharge",
		filters={
			"next_appointment_date": target_date,
			"docstatus": ["!=", 2],
		},
		fields=[
			"name",
			"file_no",
			"patient_name",
			"next_appointment_date",
			"next_appointment_time",
			"whatsapp_template",
		],
		ignore_permissions=True,
	)

	for discharge in discharges:
		if not discharge.get("file_no"):
			continue

		phone = _resolve_patient_mobile(discharge.file_no)
		if not phone:
			continue

		tag = f"discharge-followup-reminder-{days_before}d-{target_date}"
		if _already_sent("Discharge", discharge.name, tag):
			continue

		if discharge.get("whatsapp_template"):
			_send_and_link_chat(
				phone_number=phone,
				reference_doctype="Discharge",
				reference_name=discharge.name,
				bulk_reference=tag,
				template_name=discharge.whatsapp_template,
			)
		else:
			message = _build_discharge_followup_message(discharge, days_before)
			_send_and_link_chat(
				phone_number=phone,
				body=message,
				reference_doctype="Discharge",
				reference_name=discharge.name,
				bulk_reference=tag,
			)


def _is_whatsapp_enabled() -> bool:
	try:
		return bool(frappe.db.get_single_value("Digital Connect Whatsap Settings", "enable"))
	except Exception:
		return False


def _resolve_appointment_mobile(appointment: dict) -> str:
	"""Patient mobile first, then temporary_mobile_no; normalize with company country ISD."""
	from healthcare.healthcare.doctype.patient_appointment.patient_appointment import (
		_normalize_whatsapp_phone,
	)

	raw = ""
	patient = appointment.get("patient")
	if patient:
		raw = _resolve_patient_mobile(patient)
	if not raw:
		raw = (appointment.get("temporary_mobile_no") or "").strip()
	if not raw:
		return ""
	return _normalize_whatsapp_phone(raw, company=appointment.get("company"))


def _resolve_patient_mobile(patient: str) -> str:
	values = frappe.db.get_value(
		"Patient",
		patient,
		["mobile", "mobile_no", "mobile_no_1", "phone"],
		as_dict=True,
	) or {}
	for field in ("mobile", "mobile_no", "mobile_no_1", "phone"):
		number = (values.get(field) or "").strip()
		if number:
			return number
	return ""


def _build_appointment_message(appointment: dict, days_before: int) -> str:
	when_text = "tomorrow" if days_before == 1 else f"in {days_before} days"
	date_text = frappe.format_value(appointment.get("appointment_date"), {"fieldtype": "Date"})
	time_text = (appointment.get("appointment_time") or "").strip() or "-"
	patient_name = appointment.get("patient_name") or appointment.get("patient") or "Patient"
	practitioner = appointment.get("practitioner_name") or "your doctor"
	branch = (appointment.get("cost_center") or "").replace(" - SPH", "") or "our clinic"

	# System Manager-editable template (Healthcare Settings); falls back to the default text.
	template = (
		frappe.db.get_single_value("Healthcare Settings", "whatsapp_appointment_reminder_template") or ""
	).strip()
	if template:
		message = template
		for key, value in {
			"{patient_name}": str(patient_name),
			"{doctor}": str(practitioner),
			"{date}": str(date_text),
			"{time}": str(time_text),
			"{when}": str(when_text),
			"{branch}": str(branch),
		}.items():
			message = message.replace(key, value)
		return message

	return (
		f"Dear {patient_name}, this is a reminder that you have an appointment {when_text} "
		f"({date_text} at {time_text}) with {practitioner}. Please arrive on time."
	)


def _build_discharge_followup_message(discharge: dict, days_before: int) -> str:
	when_text = "tomorrow" if days_before == 1 else f"in {days_before} days"
	date_text = frappe.format_value(discharge.get("next_appointment_date"), {"fieldtype": "Date"})
	time_text = (discharge.get("next_appointment_time") or "").strip() or "-"
	patient_name = discharge.get("patient_name") or "Patient"
	return (
		f"Dear {patient_name}, this is a follow-up reminder after discharge. "
		f"Your next appointment is {when_text} ({date_text} at {time_text})."
	)


def _already_sent(reference_doctype: str, reference_name: str, bulk_reference: str) -> bool:
	return bool(
		frappe.db.exists(
			"Digital Whatsapp Chat",
			{
				"type": "Outgoing",
				"reference_doctype": reference_doctype,
				"reference_name": reference_name,
				"bulk_message_reference": bulk_reference,
			},
		)
	)


def _send_and_link_chat(
	*,
	phone_number: str,
	reference_doctype: str,
	reference_name: str,
	bulk_reference: str,
	body: str | None = None,
	template_name: str | None = None,
	template_parameters: str | None = None,
):
	try:
		if template_name:
			result = send_test_message(
				phone_number=phone_number,
				template_name=template_name,
				template_parameters=template_parameters,
			)
		else:
			result = send_test_message(phone_number=phone_number, body=body, preview_url=1)
		chat_name = result.get("chat_name") if isinstance(result, dict) else None
		if chat_name:
			frappe.db.set_value(
				"Digital Whatsapp Chat",
				chat_name,
				{
					"reference_doctype": reference_doctype,
					"reference_name": reference_name,
					"bulk_message_reference": bulk_reference,
				},
				update_modified=True,
			)
	except Exception:
		frappe.log_error(
			frappe.get_traceback(),
			f"WhatsApp reminder failed for {reference_doctype} {reference_name}",
		)

