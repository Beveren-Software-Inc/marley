# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import getdate, flt


@frappe.whitelist()
def get_ip_services(limit=50, offset=0, patient=None, admission_no=None):
	"""Get list of IP Service documents. Optionally filter by patient (file_number) or admission."""
	if not frappe.db.exists("DocType", "IP Service"):
		return []

	filters = {}
	if patient:
		filters["file_number"] = patient
	if admission_no:
		filters["admission_no"] = admission_no

	services = frappe.get_all(
		"IP Service",
		filters=filters,
		fields=[
			"name",
			"admission_no",
			"file_number",
			"patient_full_name",
			"type",
			"cost_center",
			"service_request",
			"total_amount",
			"creation",
		],
		limit=limit,
		limit_start=offset,
		order_by="creation desc",
	)
	return services


@frappe.whitelist()
def create_ip_service(admission_no, cost_center, service_request=None, services=None, **kwargs):
	"""Create a new IP Service. Cost center is required. If no service_request, services list (item + amount) is required; otherwise one empty row is added."""
	if not frappe.db.exists("DocType", "IP Service"):
		frappe.throw(_("IP Service doctype is not available."))
	if not admission_no:
		frappe.throw(_("Admission is required."))
	if not cost_center:
		frappe.throw(_("Cost Center is required."))

	admission = frappe.get_doc("Inpatient Admission", admission_no)
	patient = admission.get("patient") or admission.get("file_number")
	if not patient:
		frappe.throw(_("Admission {0} has no patient.").format(admission_no))

	# Parse services from JSON if passed as string (e.g. from form)
	if isinstance(services, str):
		import json
		try:
			services = json.loads(services) if services else None
		except Exception:
			services = None

	if not service_request and (not services or not isinstance(services, list) or len(services) == 0):
		frappe.throw(_("Without a Service Request you must add at least one item (service code and amount)."))

	doc = frappe.new_doc("IP Service")
	doc.admission_no = admission_no
	doc.file_number = patient
	doc.cost_center = cost_center
	if kwargs.get("type"):
		doc.type = kwargs.get("type")
	if service_request:
		doc.service_request = service_request

	# Compliance: child table rows are user-stamped (who performed the action)
	current_user = frappe.session.user
	if services and isinstance(services, list) and len(services) > 0:
		for row in services:
			service_code = row.get("service_code") or row.get("item_code")
			if not service_code:
				continue
			amount = flt(row.get("amount"), 2)
			row_date = row.get("date")
			try:
				date_val = getdate(row_date) if row_date else getdate()
			except Exception:
				date_val = getdate()
			doc.append(
				"services",
				{
					"date": date_val,
					"service_code": service_code,
					"amount": amount,
					"note": row.get("note") or None,
					"user": current_user,
				},
			)
	else:
		# With service request, one minimal row so the table is valid
		doc.append("services", {"date": getdate(), "amount": 0, "user": current_user})

	doc.insert()
	return {"name": doc.name}
