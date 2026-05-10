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
	"""
	if not _is_whatsapp_enabled():
		return

	send_appointment_whatsapp_reminders(days_before=1)
	send_discharge_followup_whatsapp_reminders(days_before=2)
	send_discharge_followup_whatsapp_reminders(days_before=1)


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
			"temporary_mobile_no",
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
	temporary = (appointment.get("temporary_mobile_no") or "").strip()
	if temporary:
		return temporary
	patient = appointment.get("patient")
	if not patient:
		return ""
	return _resolve_patient_mobile(patient)


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
	body: str,
	reference_doctype: str,
	reference_name: str,
	bulk_reference: str,
):
	try:
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

