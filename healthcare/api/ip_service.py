# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import getdate, flt, nowdate


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


def _existing_ip_service_sales_order(ip_service_name):
	return frappe.db.get_value(
		"Sales Order",
		{
			"custom_base_reference": "IP Service",
			"custom_base_reference_name": ip_service_name,
			"docstatus": ["!=", 2],
		},
		"name",
	)


def _create_ip_service_sales_order(doc):
	"""Create a submitted Sales Order for a direct IP Service / ECT Chart booking."""
	existing = _existing_ip_service_sales_order(doc.name)
	if existing:
		so = frappe.get_doc("Sales Order", existing)
		if so.docstatus == 0:
			so.flags.ignore_permissions = True
			so.submit()
		return {"sales_order": so.name, "existing": True}

	ref_type = None
	ref_name = None
	company = None
	billing_date = nowdate()

	if doc.admission_no:
		ref_type = "Inpatient Admission"
		ref_name = doc.admission_no
		admission = frappe.get_doc("Inpatient Admission", doc.admission_no)
		company = admission.get("company")
	elif doc.patient_visit:
		ref_type = "Patient Visit"
		ref_name = doc.patient_visit
		visit = frappe.get_doc("Patient Visit", doc.patient_visit)
		company = visit.company
		billing_date = getdate(visit.encounter_date or billing_date)

	if not ref_type or not ref_name:
		frappe.throw(
			_("IP Service {0} must be linked to an admission or patient visit before billing.").format(
				doc.name
			)
		)

	from healthcare.api.patient_file_no_charge import _ensure_patient_customer
	from healthcare.api.sales_order_cost_center import (
		apply_cost_center_to_sales_order,
		cost_center_from_visit_or_admission,
	)

	patient = doc.file_number
	if not patient:
		frappe.throw(_("Patient is required to create a Sales Order for IP Service {0}.").format(doc.name))

	customer = _ensure_patient_customer(patient)
	if not company:
		company = frappe.defaults.get_user_default("company") or frappe.db.get_single_value(
			"Global Defaults", "default_company"
		)
	if not company:
		frappe.throw(_("Default Company is not set"))

	so = frappe.new_doc("Sales Order")
	so.company = company
	so.customer = customer
	so.patient = patient
	if hasattr(so, "custom_patient"):
		so.custom_patient = patient
	patient_name = doc.patient_full_name or frappe.db.get_value("Patient", patient, "patient_name")
	if patient_name and hasattr(so, "custom_patient_name"):
		so.custom_patient_name = patient_name

	so.custom_reference_type = ref_type
	so.custom_reference_name = ref_name
	so.custom_base_reference = "IP Service"
	so.custom_base_reference_name = doc.name
	so.transaction_date = billing_date
	so.delivery_date = billing_date
	so.ignore_pricing_rule = 1

	lines_added = 0
	for row in doc.get("services") or []:
		item_code = (row.service_code or "").strip()
		amount = flt(row.amount, 2)
		if not item_code or not amount:
			continue
		if not frappe.db.exists("Item", item_code):
			frappe.throw(_("Item {0} does not exist for billing.").format(item_code))

		desc_parts = [_("ECT Chart {0}").format(doc.name)]
		if row.service_type:
			desc_parts.append(str(row.service_type))
		if row.note:
			desc_parts.append(str(row.note))

		so.append(
			"items",
			{
				"item_code": item_code,
				"qty": 1,
				"rate": amount,
				"price_list_rate": amount,
				"description": " — ".join(desc_parts),
			},
		)
		lines_added += 1

	if lines_added == 0:
		frappe.throw(_("No billable items found on IP Service {0}.").format(doc.name))

	cc = doc.cost_center or cost_center_from_visit_or_admission(ref_type, ref_name)
	apply_cost_center_to_sales_order(so, cc)
	so.insert(ignore_permissions=True)
	so.flags.ignore_permissions = True
	so.submit()
	return {"sales_order": so.name, "existing": False}


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
			"category",
			"cost_center",
			"total_amount",
			"creation",
		],
		limit=limit,
		limit_start=offset,
		order_by="creation desc",
	)
	return _attach_first_service_item(services)


def _ip_service_sales_order_names(ip_service_name):
	return frappe.get_all(
		"Sales Order",
		filters={
			"custom_base_reference": "IP Service",
			"custom_base_reference_name": ip_service_name,
			"docstatus": ["!=", 2],
		},
		pluck="name",
	)


def _cancel_ip_service_sales_orders(ip_service_name):
	handled = []
	for so_name in _ip_service_sales_order_names(ip_service_name):
		invoiced = frappe.db.exists(
			"Sales Invoice Item",
			{"sales_order": so_name, "docstatus": 1},
		)
		if invoiced:
			frappe.throw(
				_(
					"Cannot delete ECT Chart {0} because Sales Order {1} is already invoiced."
				).format(ip_service_name, so_name)
			)

		so = frappe.get_doc("Sales Order", so_name)
		if so.docstatus == 1:
			so.flags.ignore_permissions = True
			so.cancel()
		elif so.docstatus == 0:
			frappe.delete_doc("Sales Order", so_name, ignore_permissions=True)
		handled.append(so_name)
	return handled


@frappe.whitelist()
def delete_ip_service(name=None):
	"""Delete an ECT Chart (IP Service) and cancel or remove its linked sales orders."""
	name = (name or "").strip()
	if not name:
		frappe.throw(_("ECT Chart name is required."))
	if not frappe.db.exists("IP Service", name):
		frappe.throw(_("ECT Chart {0} not found.").format(name))

	from healthcare.api.common import get_permitted_cost_centers

	doc = frappe.get_doc("IP Service", name)
	permitted_cc = get_permitted_cost_centers()
	if permitted_cc is not None:
		if not permitted_cc:
			frappe.throw(_("Not permitted to delete this ECT Chart."))
		if doc.cost_center and doc.cost_center not in permitted_cc:
			frappe.throw(_("Not permitted to delete this ECT Chart."))

	sales_orders = _cancel_ip_service_sales_orders(name)

	if doc.docstatus == 1:
		doc.flags.ignore_permissions = True
		doc.cancel()

	frappe.delete_doc("IP Service", name, ignore_permissions=True)
	frappe.db.commit()
	return {"deleted": name, "sales_orders": sales_orders}


def _attach_first_service_item(services):
	if not services:
		return services

	parent_names = [row.name for row in services]
	child_rows = frappe.db.sql(
		"""
		SELECT parent, service_type, service_name, service_code, idx
		FROM `tabIP Service Detail`
		WHERE parent IN %(parents)s
		ORDER BY parent, idx ASC
		""",
		{"parents": tuple(parent_names)},
		as_dict=True,
	)

	first_by_parent = {}
	for row in child_rows:
		if row.parent not in first_by_parent:
			first_by_parent[row.parent] = row

	template_names = {
		row.service_type for row in first_by_parent.values() if row.get("service_type")
	}
	template_labels = {}
	if template_names:
		for tpl in frappe.get_all(
			"Healthcare Service Template",
			filters={"name": ["in", list(template_names)]},
			fields=["name", "service_name"],
		):
			template_labels[tpl.name] = tpl.service_name or tpl.name

	for row in services:
		first = first_by_parent.get(row.name)
		if not first:
			row["first_service"] = None
			continue
		template_name = first.get("service_type")
		row["first_service"] = (
			template_labels.get(template_name)
			or first.get("service_name")
			or template_name
			or first.get("service_code")
		)

	return services


@frappe.whitelist()
def create_ip_service(
	admission_no=None,
	cost_center=None,
	patient_visit=None,
	service_request=None,
	services=None,
	**kwargs,
):
	"""Create IP Service from admission (IP) or patient visit (OP). Cost center resolves from context when omitted."""
	if not frappe.db.exists("DocType", "IP Service"):
		frappe.throw(_("IP Service doctype is not available."))

	admission_no = (admission_no or "").strip() or None
	patient_visit = (patient_visit or "").strip() or None
	if not admission_no and not patient_visit:
		frappe.throw(_("Inpatient Admission or Patient Visit is required."))

	patient = None
	resolved_cost_center = (cost_center or "").strip() or None

	if admission_no:
		if not frappe.db.exists("Inpatient Admission", admission_no):
			frappe.throw(_("Inpatient Admission {0} not found.").format(admission_no))
		admission = frappe.get_doc("Inpatient Admission", admission_no)
		patient = admission.get("patient") or admission.get("file_number")
		if not resolved_cost_center:
			resolved_cost_center = admission.get("cost_center")
	elif patient_visit:
		if not frappe.db.exists("Patient Visit", patient_visit):
			frappe.throw(_("Patient Visit {0} not found.").format(patient_visit))
		visit = frappe.get_doc("Patient Visit", patient_visit)
		patient = visit.patient
		if not resolved_cost_center:
			resolved_cost_center = visit.get("cost_center")

	if not patient:
		frappe.throw(_("Patient could not be resolved from the selected admission or visit."))
	if not resolved_cost_center:
		frappe.throw(_("Cost Center could not be resolved from the admission or patient visit."))

	if isinstance(services, str):
		import json

		try:
			services = json.loads(services) if services else None
		except Exception:
			services = None

	if not service_request and (not services or not isinstance(services, list) or len(services) == 0):
		frappe.throw(_("Add at least one Healthcare Service Template line with an amount."))

	doc = frappe.new_doc("IP Service")
	if admission_no:
		doc.admission_no = admission_no
	if patient_visit:
		doc.patient_visit = patient_visit
	doc.file_number = patient
	doc.cost_center = resolved_cost_center
	doc.category = kwargs.get("category") or "Medical Service"
	if kwargs.get("type"):
		doc.type = kwargs.get("type")
	if service_request:
		doc.service_request = service_request

	current_user = frappe.session.user
	if (not services or not isinstance(services, list) or len(services) == 0) and service_request:
		services = _build_services_from_service_request(service_request)

	appended = 0
	if services and isinstance(services, list):
		for row in services:
			service_type = (row.get("service_type") or "").strip() or None
			service_code = row.get("service_code") or row.get("item_code")
			amount = flt(row.get("amount"), 2)

			if service_type and frappe.db.exists("Healthcare Service Template", service_type):
				template_doc = frappe.get_doc("Healthcare Service Template", service_type)
				if not service_request and not template_doc.is_ect:
					frappe.throw(
						_("Healthcare Service Template {0} is not marked as ECT.").format(service_type)
					)
				if not service_code:
					service_code = template_doc.item_code
				if not amount:
					from healthcare.healthcare.doctype.healthcare_service_template.healthcare_service_template import (
						get_healthcare_service_template_rate,
					)

					care_type = "IP" if admission_no else ("OP" if patient_visit else None)
					amount = get_healthcare_service_template_rate(
						template_doc=template_doc,
						patient_care_type=care_type,
					)

			if not service_type and not service_code:
				continue
			if not amount:
				frappe.throw(_("Amount is required for each service line."))

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
			appended += 1

	if appended == 0:
		frappe.throw(_("Add at least one Healthcare Service Template line with an amount."))

	_compute_total_amount(doc)
	doc.insert(ignore_permissions=True)
	if doc.docstatus == 0:
		doc.db_set("total_amount", doc.total_amount)

	result = {"name": doc.name}
	if not service_request:
		so_result = _create_ip_service_sales_order(doc)
		if so_result and so_result.get("sales_order"):
			result["sales_order"] = so_result["sales_order"]
	return result

# -*- coding: utf-8 -*-
# healthcare/api/ip_service_type.py

import frappe
from frappe import _

@frappe.whitelist()
def get_ip_service_types(limit=50, search=None, is_ect=None, patient_care_type=None):
    """Get list of Healthcare Service Template"""
    from healthcare.healthcare.doctype.healthcare_service_template.healthcare_service_template import (
        get_healthcare_service_template_rate,
    )

    filters = {"disabled": 0}

    if frappe.utils.cint(is_ect):
        filters["is_ect"] = 1

    query_kwargs = {
        "filters": filters,
        "fields": ["name", "service_name", "category", "rate", "op_rate"],
        "limit": limit,
        "order_by": "service_name",
    }

    if search:
        term = f"%{search}%"
        query_kwargs["or_filters"] = [
            ["service_name", "like", term],
            ["name", "like", term],
        ]

    types = frappe.get_all("Healthcare Service Template", **query_kwargs)

    for row in types:
        row["rate"] = get_healthcare_service_template_rate(
            template_name=row.name,
            patient_care_type=patient_care_type,
        )

    return types

@frappe.whitelist()
def get_ip_service_type(template_name, patient_care_type=None):
    """Get full Healthcare Service Template details including pricing"""
    from healthcare.healthcare.doctype.healthcare_service_template.healthcare_service_template import (
        get_healthcare_service_template_rate,
    )

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
        "rate": get_healthcare_service_template_rate(template_doc=doc, patient_care_type=patient_care_type),
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