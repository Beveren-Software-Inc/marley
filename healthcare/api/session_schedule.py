import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate

from healthcare.healthcare.editing_lock import assert_editing_allowed

SESSION_SCHEDULE_STATUSES = frozenset(
	{"Draft", "In Progress", "Completed", "Submitted", "Cancelled"}
)


def _existing_session_schedule_sales_order(session_schedule_name):
	return frappe.db.get_value(
		"Sales Order",
		{
			"custom_base_reference": "Session Schedule",
			"custom_base_reference_name": session_schedule_name,
			"docstatus": ["!=", 2],
		},
		"name",
	)


def _attach_sales_orders(schedules):
	if not schedules:
		return schedules

	names = [row["name"] for row in schedules if row.get("name")]
	by_schedule = {}
	if names:
		for row in frappe.get_all(
			"Sales Order",
			filters={
				"custom_base_reference": "Session Schedule",
				"custom_base_reference_name": ["in", names],
				"docstatus": ["!=", 2],
			},
			fields=["name", "custom_base_reference_name"],
			order_by="creation desc",
		):
			by_schedule.setdefault(row.custom_base_reference_name, row.name)

	for row in schedules:
		row["sales_order"] = by_schedule.get(row["name"]) or row.get("invoice_no")
	return schedules


def _default_amount_from_template(session_type, amount=None):
	resolved = flt(amount, 2)
	if resolved > 0:
		return resolved
	if session_type and frappe.db.exists("Healthcare Service Template", session_type):
		return flt(frappe.db.get_value("Healthcare Service Template", session_type, "rate"), 2)
	return 0


def _resolve_session_schedule_billing(doc):
	template_name = doc.session_type
	if not template_name or not frappe.db.exists("Healthcare Service Template", template_name):
		frappe.throw(_("Healthcare Service Template is required"))

	template = frappe.get_doc("Healthcare Service Template", template_name)
	item_code = (template.item_code or "").strip()
	if not item_code or not frappe.db.exists("Item", item_code):
		frappe.throw(
			_("Healthcare Service Template {0} has no valid Item for billing.").format(template_name)
		)

	amount = _default_amount_from_template(template_name, doc.amount)
	if amount <= 0:
		frappe.throw(_("Amount is required to create a Sales Order."))

	description = doc.session_name or template.service_name or template_name
	return item_code, amount, description


def _create_session_schedule_sales_order(doc):
	existing = _existing_session_schedule_sales_order(doc.name)
	if existing:
		so = frappe.get_doc("Sales Order", existing)
		if cint(so.docstatus) == 0:
			so.flags.ignore_permissions = True
			so.submit()
		status = frappe.db.get_value("Session Schedule", doc.name, "transaction_status")
		return {"sales_order": so.name, "existing": True, "transaction_status": status}

	if not doc.admission_number:
		frappe.throw(_("Admission Number is required to create a Sales Order."))
	if not doc.patient_num:
		frappe.throw(_("Patient is required to create a Sales Order."))

	ref_type = "Inpatient Admission"
	ref_name = doc.admission_number

	from healthcare.api.patient_file_no_charge import _ensure_patient_customer
	from healthcare.api.sales_order_cost_center import (
		apply_cost_center_to_sales_order,
		cost_center_from_visit_or_admission,
	)

	patient = doc.patient_num
	customer = _ensure_patient_customer(patient)

	company = doc.company
	if not company:
		company = frappe.db.get_value("Inpatient Admission", doc.admission_number, "company")
	if not company:
		company = frappe.defaults.get_user_default("company") or frappe.db.get_single_value(
			"Global Defaults", "default_company"
		)
	if not company:
		frappe.throw(_("Company is required to create a Sales Order."))

	item_code, amount, description = _resolve_session_schedule_billing(doc)
	billing_date = getdate(doc.date or nowdate())

	so = frappe.new_doc("Sales Order")
	so.company = company
	so.customer = customer
	so.patient = patient
	if hasattr(so, "custom_patient"):
		so.custom_patient = patient

	patient_name = frappe.db.get_value("Patient", patient, "patient_name")
	if patient_name and hasattr(so, "custom_patient_name"):
		so.custom_patient_name = patient_name

	so.custom_reference_type = ref_type
	so.custom_reference_name = ref_name
	so.custom_base_reference = "Session Schedule"
	so.custom_base_reference_name = doc.name
	so.transaction_date = billing_date
	so.delivery_date = billing_date
	so.ignore_pricing_rule = 1

	so.append(
		"items",
		{
			"item_code": item_code,
			"qty": 1,
			"rate": amount,
			"price_list_rate": amount,
			"description": _("Session Schedule {0}: {1}").format(doc.name, description),
		},
	)

	cc = doc.cost_center or cost_center_from_visit_or_admission(ref_type, ref_name)
	apply_cost_center_to_sales_order(so, cc)
	so.insert(ignore_permissions=True)
	so.flags.ignore_permissions = True
	so.submit()

	doc.db_set("invoice_no", so.name, update_modified=False)
	if doc.transaction_status not in ("Cancelled", "Submitted"):
		doc.db_set("transaction_status", "Submitted", update_modified=False)

	return {"sales_order": so.name, "existing": False, "transaction_status": "Submitted"}


@frappe.whitelist()
def get_session_schedules(
	limit: int = 50,
	offset: int = 0,
	patient: str = None,
	admission_number: str = None,
	role_group: str = None,
):
	"""Fetch session schedules with optional filtering by patient or admission number.

	role_group ('Doctor' / 'Nurse' / 'Consultant' / ...) limits rows to sessions whose
	assigned practitioner's Medical Role falls under that group — plus unassigned
	sessions, so nothing scheduled but not yet assigned disappears.
	"""
	filters = {}
	or_filters = None
	if patient:
		filters["patient_num"] = patient
	if admission_number:
		filters["admission_number"] = admission_number

	if role_group:
		from healthcare.api.common import get_medical_roles_under

		roles = list(get_medical_roles_under(role_group))
		practitioners = frappe.get_all(
			"Healthcare Practitioner",
			filters={"medical_role": ["in", roles]},
			pluck="name",
		) or ["__none__"]
		or_filters = [
			["doctor", "in", practitioners],
			["doctor", "is", "not set"],
		]

	schedules = frappe.get_list(
		"Session Schedule",
		filters=filters,
		or_filters=or_filters,
		fields=[
			"name",
			"date",
			"admission_number",
			"patient_num",
			"patient_visit",
			"session_type",
			"session_name",
			"transaction_status",
			"company",
			"doctor",
			"doctor_name",
			"cost_center",
			"invoice_no",
			"doc_code",
			"doc_remarks",
			"visit_00_05",
			"sr_num",
			"from_time",
			"to_time",
			"amount",
		],
		limit_page_length=limit,
		limit_start=offset,
		order_by="date desc",
	)

	return _attach_sales_orders(schedules)


@frappe.whitelist()
def create_session_schedule(data: dict):
	"""Create a new Session Schedule record."""
	if not data:
		frappe.throw(_("No data provided"))

	try:
		session_schedule = frappe.new_doc("Session Schedule")

		session_schedule.date = data.get("date")
		session_schedule.session_type = data.get("session_type")
		session_schedule.session_name = data.get("session_name")
		session_schedule.company = data.get("company")
		session_schedule.doctor = data.get("doctor")
		session_schedule.cost_center = data.get("cost_center")
		session_schedule.from_time = data.get("from_time")
		session_schedule.to_time = data.get("to_time")
		session_schedule.admission_number = data.get("admission_number")
		session_schedule.amount = _default_amount_from_template(
			data.get("session_type"),
			data.get("amount"),
		) or None
		session_schedule.transaction_status = "Draft"

		session_schedule.insert(ignore_permissions=True)
		frappe.db.commit()

		row = session_schedule.as_dict()
		return _attach_sales_orders([row])[0]
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "create_session_schedule")
		frappe.throw(str(e))


@frappe.whitelist()
def create_sales_order_from_session_schedule(session_schedule_name: str):
	"""Bill a Session Schedule (create or return linked Sales Order)."""
	if not session_schedule_name:
		frappe.throw(_("Session Schedule name is required"))

	if not frappe.db.exists("Session Schedule", session_schedule_name):
		frappe.throw(_("Session Schedule {0} not found").format(session_schedule_name))

	doc = frappe.get_doc("Session Schedule", session_schedule_name)
	result = _create_session_schedule_sales_order(doc)
	frappe.db.commit()
	row = doc.as_dict()
	result.update(_attach_sales_orders([row])[0])
	return result


@frappe.whitelist()
def update_session_schedule_status(session_schedule_name: str, status: str):
	"""Update the status of a Session Schedule."""
	assert_editing_allowed()
	if not session_schedule_name or not status:
		frappe.throw(_("Session Schedule name and status are required"))

	status = (status or "").strip()
	if status not in SESSION_SCHEDULE_STATUSES:
		frappe.throw(_("Invalid status: {0}").format(status))

	session_schedule = frappe.get_doc("Session Schedule", session_schedule_name)
	if session_schedule.transaction_status == "Cancelled" and status != "Cancelled":
		frappe.throw(_("Cancelled session schedules cannot be reactivated."))

	session_schedule.transaction_status = status
	session_schedule.save(ignore_permissions=True)
	frappe.db.commit()

	row = session_schedule.as_dict()
	return _attach_sales_orders([row])[0]
