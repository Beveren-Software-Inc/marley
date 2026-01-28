import datetime

import frappe
from frappe import _


def _get_employee_for_user(user: str | None = None) -> str | None:
	user = user or frappe.session.user
	# if not user or user in ("Guest", "Administrator"):
	# 	return None

	employee = frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, "name")
	print("hpo ni employee:", employee)
	return employee


@frappe.whitelist()
def get_employee_dashboard():
	"""Return basic self-service dashboard data for the current employee.

	- Employee master (linked to current user)
	- Recent Employee Checkins
	- Recent Room Access Logs (if cosec_biometric is installed)
	- Recent Attendance
	"""
	
	employee = _get_employee_for_user()
	print("Uko na jokes", employee)
	result: dict[str, object] = {
		"employee": None,
		"checkins": [],
		"room_access_logs": [],
		"attendance": [],
	}

	if not employee:
		return result

	emp_doc = frappe.get_value(
		"Employee",
		employee,
		["name", "employee_name", "designation", "company"],
		as_dict=True,
	)
	result["employee"] = emp_doc

	# Last 20 check-ins
	try:
		checkins = frappe.get_all(
			"Employee Checkin",
			filters={"employee": employee},
			fields=["name", "time", "log_type", "shift"],
			order_by="time desc",
			limit=20,
		)
		result["checkins"] = checkins
	except Exception:
		result["checkins"] = []

	# Last 20 room access logs, only if doctype exists (from cosec_biometric)
	if frappe.db.table_exists("Room Access Log"):
		try:
			room_logs = frappe.get_all(
				"Room Access Log",
				filters={"employee": employee},
			
				fields=["name", "access_time", "location", "access_type", "device_name"],
				order_by="access_time desc",
				limit=20,
			)
			result["room_access_logs"] = room_logs
		except Exception:
			result["room_access_logs"] = []

	# Last 30 days of attendance
	today = datetime.date.today()
	start_date = today - datetime.timedelta(days=30)
	try:
		attendance = frappe.get_all(
			"Attendance",
			filters={
				"employee": employee,
				"attendance_date": (">=", start_date),
			},
			fields=["name", "attendance_date", "status", "shift"],
			order_by="attendance_date desc",
			limit=60,
		)
		result["attendance"] = attendance
	except Exception:
		result["attendance"] = []

	return result

