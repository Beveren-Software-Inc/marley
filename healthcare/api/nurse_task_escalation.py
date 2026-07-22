# Copyright (c) 2026, healthcare contributors
"""NUR-057 - escalate overdue nurse tasks for accountability.

Runs hourly. A task still Pending / In Progress more than the configured grace
period past its scheduled time is marked Missed; the assigned nurse and the
escalation role holders are notified.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import get_datetime, now_datetime

OVERDUE_STATUSES = ("Pending", "In Progress")
DEFAULT_GRACE_MINUTES = 30
DEFAULT_ESCALATION_ROLE = "Healthcare Administrator"


def nurse_task_escalation_enabled() -> bool:
	return bool(
		frappe.db.get_single_value("Healthcare Settings", "escalate_overdue_nurse_tasks")
	)


def _grace_minutes() -> int:
	value = frappe.db.get_single_value("Healthcare Settings", "nurse_task_overdue_grace_minutes")
	try:
		value = int(value or 0)
	except (TypeError, ValueError):
		value = 0
	return value or DEFAULT_GRACE_MINUTES


def _escalation_role() -> str:
	role = frappe.db.get_single_value("Healthcare Settings", "nurse_task_escalation_role")
	if role and frappe.db.exists("Role", role):
		return role
	return DEFAULT_ESCALATION_ROLE


def escalate_overdue_nurse_tasks() -> int:
	"""Hourly scheduler entry point. Returns the number of tasks escalated."""
	if not nurse_task_escalation_enabled():
		return 0

	cutoff = frappe.utils.add_to_date(now_datetime(), minutes=-_grace_minutes())

	tasks = frappe.get_all(
		"Nurse Task",
		filters={
			"status": ["in", OVERDUE_STATUSES],
			"scheduled_time": ["<", cutoff],
			"docstatus": ["<", 2],
		},
		fields=[
			"name",
			"patient",
			"task_type",
			"description",
			"scheduled_time",
			"assigned_nurse",
			"nurse_name",
			"cost_center",
		],
		limit_page_length=0,
	)
	if not tasks:
		return 0

	managers = _escalation_recipients()
	escalated = 0

	for task in tasks:
		# Mark Missed without running the full save cycle - the task is historical
		# by this point and we only want the status and the audit trail.
		frappe.db.set_value("Nurse Task", task.name, "status", "Missed", update_modified=False)

		recipients = set(managers)
		nurse_user = _practitioner_user(task.assigned_nurse)
		if nurse_user:
			recipients.add(nurse_user)

		for recipient in recipients:
			_notify(recipient, task)

		escalated += 1

	frappe.db.commit()
	return escalated


def remind_upcoming_nurse_tasks() -> int:
	"""NUR-056 - remind the assigned nurse shortly before a task falls due.

	Escalation (above) handles tasks that are already late; this handles the
	window just before, so a task can still be done on time.
	"""
	if not frappe.db.get_single_value("Healthcare Settings", "remind_upcoming_nurse_tasks"):
		return 0

	lead = frappe.db.get_single_value("Healthcare Settings", "nurse_task_reminder_lead_minutes")
	try:
		lead = int(lead or 0)
	except (TypeError, ValueError):
		lead = 0
	lead = lead or 15

	now = now_datetime()
	horizon = frappe.utils.add_to_date(now, minutes=lead)

	tasks = frappe.get_all(
		"Nurse Task",
		filters={
			"status": "Pending",
			"scheduled_time": ["between", [now, horizon]],
			"docstatus": ["<", 2],
		},
		fields=["name", "patient", "task_type", "scheduled_time", "assigned_nurse", "nurse_name"],
		limit_page_length=0,
	)

	sent = 0
	for task in tasks:
		recipient = _practitioner_user(task.assigned_nurse)
		if not recipient:
			continue
		if frappe.db.exists(
			"Notification Log",
			{"document_type": "Nurse Task", "document_name": task.name, "type": "Alert",
			 "subject": ["like", "Upcoming%"]},
		):
			continue
		frappe.get_doc(
			{
				"doctype": "Notification Log",
				"for_user": recipient,
				"type": "Alert",
				"document_type": "Nurse Task",
				"document_name": task.name,
				"subject": _("Upcoming task: {0}").format(task.task_type or task.name),
				"email_content": _(
					"Nurse task {0} ({1}) for patient {2} is due at {3}."
				).format(task.name, task.task_type or "-", task.patient or "-",
				         task.scheduled_time),
			}
		).insert(ignore_permissions=True)
		sent += 1

	if sent:
		frappe.db.commit()
	return sent


def _escalation_recipients() -> list[str]:
	role = _escalation_role()
	users = frappe.get_all(
		"Has Role",
		filters={"role": role, "parenttype": "User"},
		pluck="parent",
	)
	enabled = frappe.get_all(
		"User",
		filters={"name": ["in", users], "enabled": 1},
		pluck="name",
	) if users else []
	return [u for u in enabled if u not in ("Administrator", "Guest")]


def _practitioner_user(practitioner: str | None) -> str | None:
	if not practitioner:
		return None
	user = frappe.db.get_value("Healthcare Practitioner", practitioner, "user_id")
	return user if user and frappe.db.exists("User", user) else None


def _notify(recipient: str, task) -> None:
	overdue_by = now_datetime() - get_datetime(task.scheduled_time)
	minutes = int(overdue_by.total_seconds() // 60)

	subject = _("Overdue nurse task: {0}").format(task.task_type or task.name)
	message = _(
		"Nurse task {0} ({1}) for patient {2} was scheduled at {3} and is overdue by "
		"{4} minutes. It has been marked Missed. Assigned nurse: {5}."
	).format(
		task.name,
		task.task_type or "-",
		task.patient or "-",
		task.scheduled_time,
		minutes,
		task.nurse_name or task.assigned_nurse or _("unassigned"),
	)

	frappe.get_doc(
		{
			"doctype": "Notification Log",
			"for_user": recipient,
			"type": "Alert",
			"document_type": "Nurse Task",
			"document_name": task.name,
			"subject": subject,
			"email_content": message,
		}
	).insert(ignore_permissions=True)
