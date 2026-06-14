# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import get_datetime, now_datetime

from healthcare.api.utils.api_utility import get_next_transaction_number


def _normalize_datetime(value):
	"""Parse portal datetimes to naive MySQL Datetime string (no TZ / microseconds)."""
	if value is None or value == "":
		dt = now_datetime()
	else:
		try:
			dt = value if hasattr(value, "strftime") and not isinstance(value, str) else get_datetime(value)
		except Exception:
			dt = now_datetime()
	if getattr(dt, "tzinfo", None):
		dt = dt.replace(tzinfo=None)
	return dt.strftime("%Y-%m-%d %H:%M:%S")


def _resolve_practitioner_name(practitioner):
	if not practitioner:
		return None
	return frappe.db.get_value("Healthcare Practitioner", practitioner, "practitioner_name") or practitioner


def _fill_patient_from_admission(doc):
	if doc.get("inpatient_admission") and not doc.get("patient"):
		admission_patient = frappe.db.get_value(
			"Inpatient Admission", doc.inpatient_admission, "patient"
		)
		if admission_patient:
			doc.patient = admission_patient
	if doc.get("patient") and not doc.get("patient_name"):
		doc.patient_name = frappe.db.get_value("Patient", doc.patient, "patient_name")


@frappe.whitelist()
def get_next_doctor_order_trans_no():
	"""Preview next trans_no for Doctor Order."""
	return get_next_transaction_number("Doctor Order", fieldname="trans_no")


@frappe.whitelist()
def get_doctor_orders(
	search=None,
	patient=None,
	admission=None,
	doctor=None,
	nurse=None,
	status=None,
	page=1,
	page_size=50,
):
	"""Fetch Doctor Order records for the portal."""
	try:
		page = frappe.utils.cint(page) or 1
		page_size = frappe.utils.cint(page_size) or 50
		filters = {}
		if patient:
			filters["patient"] = patient
		if admission:
			filters["inpatient_admission"] = admission
		if doctor:
			filters["doctor"] = doctor
		if nurse:
			filters["nurse"] = nurse
		if search:
			filters["patient_name"] = ["like", f"%{search}%"]

		or_filters = None
		status = (status or "").strip()
		if status and status != "Pending":
			filters["status"] = status
		elif status == "Pending":
			or_filters = [["status", "=", "Pending"], ["status", "=", ""]]
		
		records = frappe.get_all(
			"Doctor Order",
			filters=filters,
			or_filters=or_filters,
			fields=[
				"name",
				"trans_no",
				"trans_date",
				"inpatient_admission",
				"patient",
				"patient_name",
				"cost_center",
				"doctor",
				"doctor_name",
				"doctor_entry_date",
				"doctor_order",
				"nurse",
				"nurse_name",
				"nurse_entry_date",
				"nurses_remarks",
				"status",
				"request",
				"department",
				"creation",
				"modified",
			],
			order_by="trans_date desc, creation desc",
			limit_page_length=page_size,
			limit_start=(page - 1) * page_size,
		)
		
		total = frappe.db.count("Doctor Order", filters=filters)
		return {"success": True, "data": records, "page": page, "page_size": page_size, "total": total}
	except Exception as e:
		frappe.logger().error(f"Error in get_doctor_orders: {str(e)}")
		return {"success": False, "message": str(e), "data": []}


@frappe.whitelist()
def create_doctor_order(data):
	"""Create a Doctor Order (doctor portal)."""
	try:
		if isinstance(data, str):
			data = frappe.parse_json(data)
		data = data or {}

		data.pop("trans_no", None)
		data.pop("name", None)

		trans_no = get_next_transaction_number("Doctor Order", fieldname="trans_no")
		trans_date = _normalize_datetime(data.get("trans_date"))
		doctor_entry_date = _normalize_datetime(data.get("doctor_entry_date"))

		doc = frappe.get_doc(
			{
				"doctype": "Doctor Order",
				"trans_no": trans_no,
				"trans_date": trans_date,
				"inpatient_admission": data.get("inpatient_admission"),
				"patient": data.get("patient"),
				"patient_name": data.get("patient_name"),
				"cost_center": data.get("cost_center"),
				"doctor": data.get("doctor"),
				"doctor_name": data.get("doctor_name"),
				"doctor_entry_date": doctor_entry_date,
				"doctor_order": data.get("doctor_order"),
				"department": data.get("department"),
				"status": data.get("status") or "Pending",
			}
		)

		if doc.get("doctor") and not doc.get("doctor_name"):
			doc.doctor_name = _resolve_practitioner_name(doc.doctor)

		_fill_patient_from_admission(doc)

		doc.insert(ignore_permissions=True)
		frappe.db.commit()
		return {"success": True, "name": doc.name, "trans_no": doc.trans_no}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "create_doctor_order")
		return {"success": False, "message": str(e)}


@frappe.whitelist()
def update_doctor_order_nurse_response(data):
	"""Nurse documents remarks and optionally marks the order finished."""
	try:
		if isinstance(data, str):
			data = frappe.parse_json(data)
		data = data or {}

		name = data.get("name")
		if not name:
			frappe.throw("Doctor Order name is required")

		doc = frappe.get_doc("Doctor Order", name)

		if "nurses_remarks" in data:
			doc.nurses_remarks = data.get("nurses_remarks")

		finished = frappe.utils.cint(data.get("finished"))
		if finished:
			doc.status = "Finished"
		elif data.get("status"):
			doc.status = data.get("status")

		nurse = data.get("nurse")
		if nurse:
			doc.nurse = nurse
			doc.nurse_name = data.get("nurse_name") or _resolve_practitioner_name(nurse)
		elif not doc.get("nurse"):
			from healthcare.utils import get_current_user_practitioner

			practitioner = get_current_user_practitioner()
			if practitioner:
				doc.nurse = practitioner
				doc.nurse_name = _resolve_practitioner_name(practitioner)

		# Always stamp nurse entry time when documenting on the order
		doc.nurse_entry_date = _normalize_datetime(data.get("nurse_entry_date"))

		doc.save(ignore_permissions=True)
		frappe.db.commit()
		return {"success": True, "name": doc.name, "status": doc.status}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "update_doctor_order_nurse_response")
		return {"success": False, "message": str(e)}


@frappe.whitelist()
def set_doctor_order_status(name, status):
	"""Mark a pending Doctor Order as Finished or Canceled (portal list actions)."""
	try:
		if not name:
			frappe.throw("Doctor Order name is required")

		status = (status or "").strip()
		if status not in ("Finished", "Canceled"):
			frappe.throw("Status must be Finished or Canceled")

		doc = frappe.get_doc("Doctor Order", name)
		current = (doc.status or "Pending").strip()
		if current != "Pending":
			frappe.throw(f"Only pending orders can be updated (current: {current})")

		doc.status = status

		if status == "Finished":
			from healthcare.utils import get_current_user_practitioner

			practitioner = get_current_user_practitioner()
			if practitioner:
				if not doc.get("nurse"):
					doc.nurse = practitioner
					doc.nurse_name = _resolve_practitioner_name(practitioner)
			doc.nurse_entry_date = now_datetime()

		doc.save(ignore_permissions=True)
		frappe.db.commit()
		return {"success": True, "name": doc.name, "status": doc.status}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "set_doctor_order_status")
		return {"success": False, "message": str(e)}
