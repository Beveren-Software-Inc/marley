import datetime

import frappe
from frappe import _

from .employee_portal import _get_employee_for_user


@frappe.whitelist()
def create_employee_request(subject: str, details: str, type: str | None = None, related_doctype: str | None = None, related_document: str | None = None):
	"""Create an Employee Request for the logged-in employee."""

	employee = _get_employee_for_user()
	if not employee:
		frappe.throw(_("No active Employee linked to this user"))

	doc = frappe.get_doc(
		{
			"doctype": "Employee Request",
			"employee": employee,
			"subject": subject,
			"type": type or "Other",
			"date": datetime.date.today(),
			"details": details,
			"related_doctype": related_doctype,
			"related_document": related_document,
		}
	)
	doc.insert(ignore_permissions=False)

	# Employee can create, HR can submit later; keep as draft/Open
	return {
		"name": doc.name,
		"status": doc.status,
	}

