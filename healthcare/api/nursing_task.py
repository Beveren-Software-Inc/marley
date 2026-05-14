 # -*- coding: utf-8 -*-
 # Copyright (c) 2025, Healthcare and contributors
 # For license information, please see license.txt

import frappe
from frappe import _


@frappe.whitelist()
def get_nursing_tasks(
limit: int = 50,
offset: int = 0,
patient: str | None = None,
assigned_to: str | None = None,
status: str | None = None,
my_tasks: int | None = None,
):
	"""
	List Nursing Tasks for dashboards.

	- Doctors can see tasks for a specific patient (allocation / oversight).
	- Nurses can see "My Tasks" (assigned_to = current user).

	By default we exclude Failed / Cancelled / Completed to focus on active work.
	"""
	if not frappe.has_permission("Nursing Task", "read"):
		frappe.throw(_("Not permitted to access Nursing Tasks"), frappe.PermissionError)

	filters: dict[str, object] = {}

	if patient:
		filters["patient"] = patient

	# My Tasks: tasks assigned to the current user
	# if my_tasks:
	# 	filters["assigned_to"] = frappe.session.user
	# elif assigned_to:
	# 	filters["assigned_to"] = assigned_to

	if status:
		filters["status"] = status
	else:
		# Default: show all except terminal states
		filters["status"] = ["not in", ["Failed", "Cancelled", "Completed"]]
	
	tasks = frappe.get_all(
		"Nursing Task",
		filters=filters,
		fields=[
			"name",
			"status",
			"date",
			"requested_start_time",
			"requested_end_time",
			"task_start_time",
			"task_end_time",
			"patient",
			"patient_name",
			"inpatient_record",
			"service_unit",
			"medical_department",
			"activity",
			"assigned_by",
			"assigned_to",
		],
		limit=limit,
		limit_start=offset,
		order_by="requested_start_time asc, date asc, name asc",
	)
	return tasks


@frappe.whitelist()
def create_nursing_task(
	patient: str,
	activity: str,
	requested_start_time: str | None = None,
	assigned_to: str | None = None,
	service_unit: str | None = None,
	company: str | None = None,
	inpatient_record: str | None = None,
):
	"""Create a single Nursing Task (manual assignment from Doctor/management)."""
	if not frappe.has_permission("Nursing Task", "write"):
		frappe.throw(_("Not permitted to create Nursing Tasks"), frappe.PermissionError)

	if not patient:
		frappe.throw(_("Patient is required"))
	if not activity:
		frappe.throw(_("Activity (Healthcare Activity) is required"))

	# Resolve company if not provided
	if not company:
		company = frappe.db.get_value("Patient", patient, "company")
	if not company and frappe.db.exists("DocType", "Global Defaults"):
		company = frappe.db.get_single_value("Global Defaults", "default_company")

	doc = frappe.get_doc(
		{
			"doctype": "Nursing Task",
			"status": "Requested",
			"patient": patient,
			"activity": activity,
			"company": company,
			"service_unit": service_unit,
			"inpatient_record": inpatient_record,
			"assigned_to": assigned_to,
			"user": frappe.session.user,
		}
	)

	# Requested time: if provided, use it; otherwise set_task_schedule() will pick now
	if requested_start_time:
		doc.requested_start_time = requested_start_time

	doc.insert(ignore_permissions=True)
	return {"name": doc.name}

