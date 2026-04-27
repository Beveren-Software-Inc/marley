# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import getdate, flt


def _compute_total_amount(doc):
	total = 0.0
	for row in doc.get("services") or []:
		total += flt(getattr(row, "amount", 0), 2)
	doc.total_amount = flt(total, 2)


def _build_services_from_service_request(service_request_name):
	if not service_request_name or not frappe.db.exists("Service Request", service_request_name):
		return []

	sr = frappe.get_doc("Service Request", service_request_name)
	template_dt = getattr(sr, "template_dt", None)
	template_dn = getattr(sr, "template_dn", None)
	if template_dt != "Healthcare Service Template" or not template_dn or not frappe.db.exists("Healthcare Service Template", template_dn):
		return []

	template_doc = frappe.get_doc("Healthcare Service Template", template_dn)
	default_amount = flt(getattr(sr, "grand_total", None) or getattr(sr, "cost", None) or getattr(sr, "amount", None) or 0, 2)

	rows = []
	pricing_rows = template_doc.get("pricing") or []
	for row in pricing_rows:
		service_code = getattr(row, "item", None)
		price = flt(getattr(row, "price", None) or 0, 2)
		rows.append(
			{
				"date": getdate(),
				"service_type": template_dn,
				"service_code": service_code,
				"amount": price,
				"note": getattr(row, "note", None),
			}
		)

	if rows:
		return rows

	service_code = getattr(template_doc, "item_code", None)
	if service_code or default_amount:
		return [
			{
				"date": getdate(),
				"service_type": template_dn,
				"service_code": service_code,
				"amount": default_amount,
				"note": _("Created from Service Request {0}").format(sr.name),
			}
		]

	return []


@frappe.whitelist()
def get_ip_services(limit=50, offset=0, patient=None, admission_no=None):
	"""Get list of IP Service documents. Optionally filter by patient (file_number) or admission."""
	from healthcare.api.common import get_permitted_cost_centers
	if not frappe.db.exists("DocType", "IP Service"):
		return []

	filters = {}
	if patient:
		filters["file_number"] = patient
	if admission_no:
		filters["admission_no"] = admission_no

	# ── Cost-centre User Permission enforcement ──────────────────────────────
	permitted_cc = get_permitted_cost_centers()
	if permitted_cc is not None:
		if not permitted_cc:
			return []
		filters["cost_center"] = ["in", permitted_cc]

	services = frappe.get_all(
		"IP Service",
		filters=filters,
		fields=[
			"name",
			"admission_no",
			"file_number",
			"patient_full_name",
			"type",
			"category",
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
	if kwargs.get("category"):
		doc.category = kwargs.get("category")
	if service_request:
		doc.service_request = service_request

	# Compliance: child table rows are user-stamped (who performed the action)
	current_user = frappe.session.user
	if (not services or not isinstance(services, list) or len(services) == 0) and service_request:
		services = _build_services_from_service_request(service_request)

	if services and isinstance(services, list) and len(services) > 0:
		for row in services:
			service_code = row.get("service_code") or row.get("item_code")
			service_type = row.get("service_type")
			if not service_code:
				# allow type-only rows when created from service request
				if not service_type:
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
					"service_type": service_type,
					"service_code": service_code,
					"amount": amount,
					"note": row.get("note") or None,
					"user": current_user,
				},
			)
	else:
		# Fallback minimal row
		doc.append("services", {"date": getdate(), "amount": 0, "user": current_user})

	_compute_total_amount(doc)
	doc.insert()
	if doc.docstatus == 0:
		doc.db_set("total_amount", doc.total_amount)
	return {"name": doc.name}

# -*- coding: utf-8 -*-
# healthcare/api/ip_service_type.py

import frappe
from frappe import _

@frappe.whitelist()
def get_ip_service_types(limit=50, search=None):
    """Get list of Healthcare Service Template"""
    filters = {"disabled": 0}
    
    if search:
        filters["service_name"] = ["like", f"%{search}%"]
    
    types = frappe.get_all(
        "Healthcare Service Template",
        filters=filters,
        fields=["name", "service_name", "category", "rate"],
        limit=limit,
        order_by="service_name"
    )
    
    return types

@frappe.whitelist()
def get_ip_service_type(template_name):
    """Get full Healthcare Service Template details including pricing"""
    if not frappe.db.exists("Healthcare Service Template", template_name):
        frappe.throw(_("Healthcare Service Template {0} not found").format(template_name))
    
    doc = frappe.get_doc("Healthcare Service Template", template_name)
    
    # Format the response
    result = {
        "name": doc.name,
        "service_name": doc.service_name,
        "description": doc.description,
        "category": doc.category,
        "item_code": doc.item_code,
        "rate": doc.rate,
        "disabled": doc.disabled,
        "pricing": []
    }
    
    # Include pricing table if exists
    if hasattr(doc, 'pricing') and doc.pricing:
        for row in doc.pricing:
            result["pricing"].append({
                "item": row.item,
                "rate": row.rate,
                "note": row.note
            })
    
    return result