# Copyright (c) 2026, healthcare contributors
"""LAB-030 - remind doctors about visits that carry no laboratory request.

Runs daily. For every non-exempt visit from the previous day that still has no
Service Request or Lab Test against it, a Notification Log is raised for the
attending practitioner.
"""

from __future__ import annotations

import datetime

import frappe
from frappe import _

from healthcare.healthcare.lab_request_guard import _visit_has_lab_request, _visit_type_is_exempt

OPEN_VISIT_STATUSES = ("Open", "Medication In Progress", "Ordered", "Completed")


def lab_request_reminders_enabled() -> bool:
	return bool(
		frappe.db.get_single_value("Healthcare Settings", "send_missing_lab_request_reminder")
	)


def send_missing_lab_request_reminders(days_before: int = 1) -> int:
	"""Daily scheduler entry point. Returns the number of reminders raised."""
	if not lab_request_reminders_enabled():
		return 0

	target_date = datetime.date.today() - datetime.timedelta(days=days_before)

	visits = frappe.get_all(
		"Patient Visit",
		filters={
			"encounter_date": target_date,
			"status": ["in", OPEN_VISIT_STATUSES],
			"docstatus": ["<", 2],
		},
		fields=["name", "patient", "patient_name", "visit_type", "practitioner", "cost_center"],
		limit_page_length=0,
	)

	sent = 0
	for visit in visits:
		if _visit_type_is_exempt(visit.visit_type):
			continue
		if _visit_has_lab_request(visit.name):
			continue

		recipient = _practitioner_user(visit.practitioner)
		if not recipient:
			continue

		_notify(recipient, visit)
		sent += 1

	if sent:
		frappe.db.commit()

	return sent


def _practitioner_user(practitioner: str | None) -> str | None:
	if not practitioner:
		return None
	user = frappe.db.get_value("Healthcare Practitioner", practitioner, "user_id")
	return user if user and frappe.db.exists("User", user) else None


def _notify(recipient: str, visit) -> None:
	subject = _("No lab request on visit {0}").format(visit.name)
	message = _(
		"Patient {0} was seen on visit {1} ({2}) and no laboratory investigation was requested. "
		"Please raise the required lab request or confirm none is needed."
	).format(
		frappe.bold(visit.patient_name or visit.patient),
		visit.name,
		visit.visit_type or "-",
	)

	frappe.get_doc(
		{
			"doctype": "Notification Log",
			"for_user": recipient,
			"type": "Alert",
			"document_type": "Patient Visit",
			"document_name": visit.name,
			"subject": subject,
			"email_content": message,
		}
	).insert(ignore_permissions=True)
