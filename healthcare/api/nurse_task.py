import json
import frappe
from frappe import _
from frappe.utils import cint, now_datetime


ADMIN_ROLES = {'Administrator', 'System Manager', 'Healthcare Administrator', 'Website Manager'}


def _is_admin() -> bool:
	return bool(ADMIN_ROLES & set(frappe.get_roles(frappe.session.user)))


def _get_practitioner_for_user(user: str) -> str | None:
	"""Return the Healthcare Practitioner name linked to the given user account."""
	return frappe.db.get_value("Healthcare Practitioner", {"user": user}, "name")


@frappe.whitelist()
def create_nurse_task(
	patient: str,
	task_type: str,
	scheduled_time: str,
	description: str = "",
	priority: str = "Routine",
	assigned_nurse: str | None = None,
	shift: str | None = None,
	cost_center: str | None = None,
	due_time: str | None = None,
	medication: str | None = None,
	dosage: str | None = None,
	route: str | None = None,
	frequency: str | None = None,
	is_prn: int = 0,
	prn_indication: str | None = None,
	min_interval_hours: float | None = None,
	notes: str | None = None,
	reference_doctype: str | None = None,
	encounter: str | None = None,
) -> dict:
	"""Create a single Nurse Task document."""
	if not patient:
		frappe.throw(_("Patient is required"))
	if not task_type:
		frappe.throw(_("Task Type is required"))
	if not scheduled_time:
		frappe.throw(_("Scheduled Time is required"))

	doc = frappe.new_doc("Nurse Task")
	doc.patient = patient
	doc.task_type = task_type
	doc.scheduled_time = scheduled_time
	doc.description = description or ""
	doc.priority = priority or "Routine"
	doc.status = "Pending"

	if assigned_nurse:
		doc.assigned_nurse = assigned_nurse
	if shift:
		doc.shift = shift
	if cost_center:
		doc.cost_center = cost_center
	if due_time:
		doc.due_time = due_time
	if medication:
		doc.medication = medication
	if dosage:
		doc.dosage = dosage
	if route:
		doc.route = route
	if frequency:
		doc.frequency = frequency

	doc.is_prn = cint(is_prn)
	if prn_indication:
		doc.prn_indication = prn_indication
	if min_interval_hours is not None:
		doc.min_interval_hours = min_interval_hours
	if notes:
		doc.notes = notes
	if reference_doctype:
		doc.reference_doctype = reference_doctype
	if encounter:
		doc.encounter = encounter

	doc.insert(ignore_permissions=True)
	return {"name": doc.name}


@frappe.whitelist()
def bulk_create_nurse_tasks(tasks: str | list) -> dict:
	"""Create multiple Nurse Tasks at once.

	``tasks`` is either a JSON string or a list of dicts, each matching the
	parameters accepted by :func:`create_nurse_task`.
	"""
	if isinstance(tasks, str):
		tasks = json.loads(tasks)

	created = []
	for task_data in tasks:
		result = create_nurse_task(**task_data)
		created.append(result["name"])

	return {"created": created, "count": len(created)}


@frappe.whitelist()
def get_nurse_tasks(
	limit: int = 50,
	offset: int = 0,
	patient: str | None = None,
	status: str | None = None,
	my_tasks: int = 0,
	assigned_nurse: str | None = None,
) -> list:
	"""Return Nurse Task rows.

	Access rules
	------------
	* Admins (System Manager / Healthcare Administrator / Administrator):
	  see every task — no automatic nurse filter is applied.
	* Everyone else (nurses): only see tasks where ``assigned_nurse``
	  matches the Employee record linked to their user account.
	  If their user has no linked Employee record the list is empty.
	"""
	filters: dict = {}

	if patient:
		filters["patient"] = patient
	if status:
		filters["status"] = status

	if not _is_admin():
		# Non-admins always see only their own tasks
		practitioner = _get_practitioner_for_user(frappe.session.user)
		if not practitioner:
			return []
		filters["assigned_nurse"] = practitioner
	else:
		# Admins can optionally be scoped to a specific nurse or their own tasks
		if cint(my_tasks):
			practitioner = _get_practitioner_for_user(frappe.session.user)
			if practitioner:
				filters["assigned_nurse"] = practitioner
		elif assigned_nurse:
			filters["assigned_nurse"] = assigned_nurse

	rows = frappe.get_all(
		"Nurse Task",
		filters=filters,
		fields=[
			"name",
			"patient",
			"task_type",
			"description",
			"priority",
			"status",
			"scheduled_time",
			"due_time",
			"completed_time",
			"assigned_nurse",
			"medication",
			"dosage",
			"route",
			"is_prn",
			"notes",
			"reference_doctype",
			"encounter",
			"completed_by",
			"creation",
		],
		order_by="scheduled_time asc, creation desc",
		limit=cint(limit or 50),
		start=cint(offset or 0),
	)

	# Enrich with patient_name and nurse full name
	for row in rows:
		if row.get("patient"):
			row["patient_name"] = (
				frappe.db.get_value("Patient", row["patient"], "patient_name") or row["patient"]
			)
		if row.get("assigned_nurse"):
			row["assigned_nurse_name"] = (
				frappe.db.get_value("Healthcare Practitioner", row["assigned_nurse"], "practitioner_name")
				or row["assigned_nurse"]
			)
		if row.get("medication"):
			row["medication_name"] = (
				frappe.db.get_value("Item", row["medication"], "item_name") or row["medication"]
			)

	return rows


@frappe.whitelist()
def update_nurse_task_status(name: str, status: str, notes: str | None = None) -> dict:
	"""Update the status of a Nurse Task, and stamp completed fields if done."""
	if not name or not status:
		frappe.throw(_("Task name and status are required"))

	allowed = {"Pending", "In Progress", "Completed", "Missed", "Cancelled"}
	if status not in allowed:
		frappe.throw(_("Invalid status. Allowed: {0}").format(", ".join(allowed)))

	doc = frappe.get_doc("Nurse Task", name)
	doc.status = status

	if status == "Completed":
		doc.completed_time = now_datetime()
		doc.completed_by = frappe.session.user

	if notes is not None:
		doc.notes = notes

	doc.save()
	return {"name": doc.name, "status": doc.status}
