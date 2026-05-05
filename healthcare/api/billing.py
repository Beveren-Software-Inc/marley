# # Add to healthcare/api/billing.py

# import frappe
# @frappe.whitelist()
# def get_inpatient_balances(patient=None):
#     """
#     Get inpatient balances for all patients or a specific patient
#     Returns list of admissions with outstanding balances
#     """
   
#     filters = {"docstatus": 1}
#     if patient:
#         filters["patient_name"] = patient
#     # Get all inpatient admissions
#     admissions = frappe.get_all("Inpatient Admission",
#         # filters=filters,
#         fields=["name", "patient", "patient_name", "admitted_datetime", "cost_center", "status"]
#     )
#     balances = []
#     today = frappe.utils.today()
    
#     for admission in admissions:
#         # Get all invoices for this admission
#         invoices = frappe.get_all("Sales Invoice",
#             filters={
#                 "custom_reference_name": admission.name,
#                 "docstatus": 1
#             },
#             fields=["name", "grand_total", "outstanding_amount", "posting_date", "status"]
#         )
#         total_amount = sum(inv.grand_total for inv in invoices)
#         total_paid = sum(inv.grand_total - inv.outstanding_amount for inv in invoices)
#         outstanding = sum(inv.outstanding_amount for inv in invoices)
        
#         # Calculate days overdue
#         days_overdue = 0
#         last_invoice_date = None
#         if invoices:
#             last_invoice = max(invoices, key=lambda x: x.posting_date)
#             last_invoice_date = last_invoice.posting_date
#             if last_invoice.outstanding_amount > 0:
#                 days_overdue = (frappe.utils.date_diff(today, last_invoice.posting_date))
        
#         if total_amount > 0:  # Only include admissions with charges
#             balances.append({
#                 "admission_id": admission.name,
#                 "patient_name": admission.patient_name,
#                 "patient_id": admission.patient,
#                 "admission_date": admission.admission_datetime.split()[0] if admission.admission_datetime else "",
#                 "discharge_date": admission.discharge_datetime.split()[0] if admission.discharge_datetime else None,
#                 "cost_center": admission.cost_center,
#                 "total_amount": total_amount,
#                 "total_paid": total_paid,
#                 "outstanding_amount": outstanding,
#                 "days_overdue": max(0, days_overdue),
#                 "last_invoice_date": last_invoice_date
#             })
    
#     # Sort by outstanding amount (highest first) and then by days overdue
#     balances.sort(key=lambda x: (-x["outstanding_amount"], -x["days_overdue"]))
    
#     return balances


# # Add to healthcare/api/billing.py

# @frappe.whitelist()
# def get_outpatient_balances(patient=None):
#     """
#     Get outpatient balances for all patients or a specific patient
#     Returns list of patient visits with outstanding balances
#     """
#     filters = {"docstatus": 1}
#     if patient:
#         filters["patient"] = patient
    
#     # Get all patient encounters (visits)
#     visits = frappe.get_all("Patient Visit",
#         # filters=filters,
#         fields=["name", "patient", "patient_name", "encounter_date", "practitioner", "status"]
#     )
    
#     balances = []
#     today = frappe.utils.today()
    
#     for visit in visits:
#         # Get all invoices for this visit
#         invoices = frappe.get_all("Sales Invoice",
#             filters={
#                 "custom_reference_name": visit.name,
#                 "docstatus": 1
#             },
#             fields=["name", "grand_total", "outstanding_amount", "posting_date", "status"]
#         )
#         print("huku ni wapi", str(invoices))
#         total_amount = sum(inv.grand_total for inv in invoices)
#         total_paid = sum(inv.grand_total - inv.outstanding_amount for inv in invoices)
#         outstanding = sum(inv.outstanding_amount for inv in invoices)
        
#         # Calculate days overdue
#         days_overdue = 0
#         last_invoice_date = None
#         if invoices:
#             last_invoice = max(invoices, key=lambda x: x.posting_date)
#             last_invoice_date = last_invoice.posting_date
#             if last_invoice.outstanding_amount > 0:
#                 days_overdue = frappe.utils.date_diff(today, last_invoice.posting_date)
        
#         if total_amount > 0:  # Only include visits with charges
#             balances.append({
#                 "visit_id": visit.name,
#                 "patient_name": visit.patient_name,
#                 "patient_id": visit.patient,
#                 "visit_date": visit.encounter_date if visit.encounter_date else "",
#                 "practitioner": visit.practitioner,
#                 "total_amount": total_amount,
#                 "total_paid": total_paid,
#                 "outstanding_amount": outstanding,
#                 "days_overdue": max(0, days_overdue),
#                 "last_invoice_date": last_invoice_date
#             })
    
#     # Sort by outstanding amount (highest first) and then by days overdue
#     balances.sort(key=lambda x: (-x["outstanding_amount"], -x["days_overdue"]))
    
#     return balances


# healthcare/api/billing.py

import json

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt, getdate, nowdate


def _billing_item_uom_options(item_code):
	"""Distinct UOMs from Item (stock, sales, conversion table)."""
	item = frappe.get_cached_doc("Item", item_code)
	seen = []
	for u in (item.stock_uom, item.sales_uom):
		if u and u not in seen:
			seen.append(u)
	for row in item.get("uoms") or []:
		u = row.uom
		if u and u not in seen:
			seen.append(u)
	return seen


def _resolve_healthcare_service_template_for_item(item_code):
	"""
	For non-stock (service) Items, find a linked healthcare template (same link pattern as Service Request).
	Returns (template_doctype, template_name) or (None, None).
	"""
	if not item_code or not frappe.db.exists("Item", item_code):
		return None, None
	if cint(frappe.db.get_value("Item", item_code, "is_stock_item")):
		return None, None

	disabled_filter = {"disabled": 0}

	name = frappe.db.get_value("Lab Test Template", {"item": item_code, **disabled_filter}, "name")
	if name:
		return "Lab Test Template", name

	name = frappe.db.get_value(
		"Healthcare Service Template", {"item_code": item_code, **disabled_filter}, "name"
	)
	if name:
		return "Healthcare Service Template", name

	name = frappe.db.get_value(
		"Clinical Procedure Template", {"item": item_code, **disabled_filter}, "name"
	)
	if name:
		return "Clinical Procedure Template", name
	name = frappe.db.get_value(
		"Clinical Procedure Template", {"item_code": item_code, **disabled_filter}, "name"
	)
	if name:
		return "Clinical Procedure Template", name

	name = frappe.db.get_value("Therapy Type", {"item": item_code, **disabled_filter}, "name")
	if name:
		return "Therapy Type", name

	name = frappe.db.get_value("Observation Template", {"item": item_code}, "name")
	if name:
		return "Observation Template", name

	return None, None


@frappe.whitelist()
def get_sales_item_pricing_for_billing(
	item_code,
	company,
	customer=None,
	qty=1,
	posting_date=None,
	price_list=None,
	patient=None,
	uom=None,
):
	"""
	Resolve selling rate and UOMs for billing modals.

	- Stock items: ERPNext get_item_details (Item Price / pricing), then Item.standard_rate, then valuation.
	- Service items (maintain stock = 0): if linked to Lab / Clinical Procedure / Therapy / Observation /
	  Healthcare Service template, base rate from template (same fields as service request API);
	  otherwise same ERPNext chain as above.
	- When ``patient`` is set and the line is a service item, apply Healthcare Settings patient-category
	  multiplier (same table as Service Request).
	"""
	if not item_code or not company:
		frappe.throw(_("item_code and company are required"))

	item_code = cstr(item_code).strip()
	qty = flt(qty) or 1
	transaction_date = getdate(posting_date) if posting_date else getdate(nowdate())
	uom = cstr(uom).strip() if uom else None

	selling_price_list = cstr(price_list).strip() if price_list else None
	if not selling_price_list:
		selling_price_list = frappe.db.get_single_value("Selling Settings", "selling_price_list")
	if not selling_price_list and frappe.db.exists("Price List", "Standard Selling"):
		selling_price_list = "Standard Selling"

	company_currency = frappe.get_cached_value("Company", company, "default_currency")
	if not company_currency:
		frappe.throw(_("Company {0} has no default currency").format(company))

	is_stock_item = cint(frappe.db.get_value("Item", item_code, "is_stock_item"))
	is_service_item = not is_stock_item

	template_dt, template_dn = _resolve_healthcare_service_template_for_item(item_code)
	template_base = None
	if template_dt and template_dn:
		from healthcare.api.service_request import _get_template_base_rate

		template_base = flt(_get_template_base_rate(template_dt, template_dn))

	from erpnext.stock.get_item_details import get_item_details, get_valuation_rate

	out = frappe._dict()
	try:
		ctx = frappe._dict(
			{
				"item_code": item_code,
				"company": company,
				"customer": customer or "",
				"qty": qty,
				"doctype": "Sales Invoice",
				"name": None,
				"transaction_date": transaction_date,
				"posting_date": transaction_date,
				"currency": company_currency,
				"conversion_rate": 1.0,
				"price_list": selling_price_list,
				"selling_price_list": selling_price_list,
				"plc_conversion_rate": 1.0,
				"price_list_currency": None,
				"update_stock": 0,
				"is_pos": 0,
				"is_return": 0,
				"is_subcontracted": 0,
				"ignore_pricing_rule": 0,
			}
		)
		if uom:
			ctx["uom"] = uom
		out = get_item_details(ctx, doc=None, for_validate=False, overwrite_warehouse=True)
	except Exception:
		frappe.log_error(frappe.get_traceback(), "get_sales_item_pricing_for_billing")

	erp_rate = flt(out.get("rate")) or flt(out.get("net_rate")) or flt(out.get("price_list_rate"))
	uom_out = out.get("uom")
	stock_uom = out.get("stock_uom")
	item_name = out.get("item_name")
	warehouse = out.get("warehouse")

	item_meta = frappe.db.get_value(
		"Item",
		item_code,
		["item_name", "stock_uom", "sales_uom", "standard_rate"],
		as_dict=True,
	)
	if item_meta:
		if not item_name:
			item_name = item_meta.item_name
		if not stock_uom:
			stock_uom = item_meta.stock_uom
		if not uom_out:
			uom_out = item_meta.sales_uom or item_meta.stock_uom

	if not erp_rate and item_meta:
		erp_rate = flt(item_meta.standard_rate)

	if not erp_rate:
		val = get_valuation_rate(item_code, company, warehouse)
		erp_rate = flt(val.get("valuation_rate")) if val else 0

	if is_service_item and template_base > 0:
		base_before_multiplier = template_base
		pricing_source = "healthcare_template"
	elif is_service_item:
		base_before_multiplier = erp_rate
		pricing_source = "erpnext_service"
	else:
		base_before_multiplier = erp_rate
		pricing_source = "erpnext_stock"

	multiplier = 1.0
	patient_category = None
	if patient and is_service_item and frappe.db.exists("Patient", patient):
		from healthcare.healthcare.doctype.service_request.service_request import (
			_get_patient_category_multiplier,
		)

		multiplier, patient_category = _get_patient_category_multiplier(patient)

	final_rate = flt(base_before_multiplier) * flt(multiplier)

	uom_options = _billing_item_uom_options(item_code)

	return {
		"rate": final_rate,
		"base_rate": flt(base_before_multiplier),
		"uom": uom_out,
		"stock_uom": stock_uom,
		"item_name": item_name,
		"price_list": selling_price_list,
		"is_service_item": int(is_service_item),
		"is_stock_item": int(is_stock_item),
		"pricing_source": pricing_source,
		"service_template_dt": template_dt,
		"service_template_dn": template_dn,
		"patient_category": patient_category,
		"multiplier": multiplier,
		"uom_options": uom_options,
	}


def _sales_invoice_filters_for_reference(reference_type, reference_name, submitted_only=False):
	"""Match combined / healthcare invoices linked to a visit or admission."""
	if not reference_name:
		return None
	docstatus = 1 if submitted_only else ["in", [0, 1]]
	filters = {
		"custom_reference_name": reference_name,
		"docstatus": docstatus,
	}
	if reference_type:
		filters["custom_reference_type"] = reference_type
	return filters


def _format_stored_date_only(val):
	"""Return ``YYYY-MM-DD`` from a DB value that may be str, date, or datetime."""
	if val is None or val == "":
		return ""
	if isinstance(val, str):
		return val.strip().split()[0]
	try:
		return frappe.utils.getdate(val).strftime("%Y-%m-%d")
	except Exception:
		s = str(val).strip()
		return s.split()[0][:10] if s else ""


@frappe.whitelist()
def get_inpatient_balances(patient=None, from_date=None, to_date=None):
    """
    Get inpatient balances for all patients or a specific patient
    Returns list of admissions with outstanding balances
    """
    adm_filters = {}
    if patient:
        adm_filters["patient"] = patient

    if from_date and to_date:
        adm_filters["admitted_datetime"] = ["between", [f"{from_date} 00:00:00", f"{to_date} 23:59:59"]]
    elif from_date:
        adm_filters["admitted_datetime"] = [">=", f"{from_date} 00:00:00"]
    elif to_date:
        adm_filters["admitted_datetime"] = ["<=", f"{to_date} 23:59:59"]

    admissions = frappe.get_all(
        "Inpatient Admission",
        filters=adm_filters or None,
        fields=[
            "name",
            "patient",
            "patient_name",
            "admitted_datetime",
            "discharge_datetime",
            "cost_center",
            "status",
        ],
    )
    balances = []
    today = frappe.utils.today()
    
    for admission in admissions:
        inv_filters = _sales_invoice_filters_for_reference(
            "Inpatient Admission", admission.name, submitted_only=True
        )
        invoices = frappe.get_all(
            "Sales Invoice",
            filters=inv_filters,
            fields=["name", "grand_total", "outstanding_amount", "posting_date", "status"],
        )
        if not invoices:
            invoices = frappe.get_all(
                "Sales Invoice",
                filters={
                    "custom_reference_name": admission.name,
                    "docstatus": 1,
                },
                fields=["name", "grand_total", "outstanding_amount", "posting_date", "status"],
            )
        total_amount = sum(inv.grand_total for inv in invoices)
        total_paid = sum(inv.grand_total - inv.outstanding_amount for inv in invoices)
        outstanding = sum(inv.outstanding_amount for inv in invoices)
        
        # Calculate days overdue
        days_overdue = 0
        last_invoice_date = None
        if invoices:
            last_invoice = max(invoices, key=lambda x: x.posting_date)
            last_invoice_date = last_invoice.posting_date
            if last_invoice.outstanding_amount > 0:
                days_overdue = (frappe.utils.date_diff(today, last_invoice.posting_date))
        
        if total_amount > 0:  # Only include admissions with charges
            latest_invoice_name = None
            if invoices:
                latest_invoice_name = max(invoices, key=lambda x: x.posting_date or "").name
            admitted = admission.get("admitted_datetime")
            discharge_dt = admission.get("discharge_datetime")
            admission_date_str = _format_stored_date_only(admitted)
            discharge_date_str = _format_stored_date_only(discharge_dt) or None
            balances.append({
                "admission_id": admission.name,
                "patient_name": admission.patient_name,
                "patient_id": admission.patient,
                "admission_date": admission_date_str,
                "discharge_date": discharge_date_str,
                "cost_center": admission.cost_center,
                "latest_invoice_name": latest_invoice_name,
                "total_amount": total_amount,
                "total_paid": total_paid,
                "outstanding_amount": outstanding,
                "days_overdue": max(0, days_overdue),
                "last_invoice_date": last_invoice_date
            })
    
    # Sort by outstanding amount (highest first) and then by days overdue
    balances.sort(key=lambda x: (-x["outstanding_amount"], -x["days_overdue"]))
    
    return balances


@frappe.whitelist()
def get_outpatient_balances(patient=None, from_date=None, to_date=None):
    """
    Get outpatient balances for all patients or a specific patient
    Returns list of patient visits with outstanding balances
    """
    visit_filters = {}
    if patient:
        visit_filters["patient"] = patient
    if from_date and to_date:
        visit_filters["encounter_date"] = ["between", [from_date, to_date]]
    elif from_date:
        visit_filters["encounter_date"] = [">=", from_date]
    elif to_date:
        visit_filters["encounter_date"] = ["<=", to_date]

    visits = frappe.get_all(
        "Patient Visit",
        filters=visit_filters or None,
        fields=[
            "name",
            "patient",
            "patient_name",
            "encounter_date",
            "practitioner",
            "status",
            "cost_center",
        ],
    )
    
    balances = []
    today = frappe.utils.today()
    
    for visit in visits:
        inv_filters = _sales_invoice_filters_for_reference(
            "Patient Visit", visit.name, submitted_only=True
        )
        invoices = frappe.get_all(
            "Sales Invoice",
            filters=inv_filters,
            fields=["name", "grand_total", "outstanding_amount", "posting_date", "status"],
        )
        if not invoices:
            invoices = frappe.get_all(
                "Sales Invoice",
                filters={
                    "custom_reference_name": visit.name,
                    "docstatus": 1,
                },
                fields=["name", "grand_total", "outstanding_amount", "posting_date", "status"],
            )
        
        total_amount = sum(inv.grand_total for inv in invoices)
        total_paid = sum(inv.grand_total - inv.outstanding_amount for inv in invoices)
        outstanding = sum(inv.outstanding_amount for inv in invoices)
        
        # Calculate days overdue
        days_overdue = 0
        last_invoice_date = None
        if invoices:
            last_invoice = max(invoices, key=lambda x: x.posting_date)
            last_invoice_date = last_invoice.posting_date
            if last_invoice.outstanding_amount > 0:
                days_overdue = frappe.utils.date_diff(today, last_invoice.posting_date)
        
        if total_amount > 0:  # Only include visits with charges
            latest_invoice_name = None
            if invoices:
                latest_invoice_name = max(invoices, key=lambda x: x.posting_date or "").name
            balances.append({
                "visit_id": visit.name,
                "patient_name": visit.patient_name,
                "patient_id": visit.patient,
                "visit_date": visit.encounter_date if visit.encounter_date else "",
                "practitioner": visit.practitioner,
                "cost_center": visit.get("cost_center"),
                "latest_invoice_name": latest_invoice_name,
                "total_amount": total_amount,
                "total_paid": total_paid,
                "outstanding_amount": outstanding,
                "days_overdue": max(0, days_overdue),
                "last_invoice_date": last_invoice_date
            })
    
    # Sort by outstanding amount (highest first) and then by days overdue
    balances.sort(key=lambda x: (-x["outstanding_amount"], -x["days_overdue"]))
    
    return balances


@frappe.whitelist()
def get_payment_entries(reference_type=None, reference_name=None, patient=None, from_date=None, to_date=None):
    conditions = ["pe.docstatus = 1"]
    params = {}
    print("Hapa ndio tuko")
    if from_date:
        conditions.append("pe.posting_date >= %(from_date)s")
        params["from_date"] = from_date
    if to_date:
        conditions.append("pe.posting_date <= %(to_date)s")
        params["to_date"] = to_date
    if patient:
        conditions.append("si.patient = %(patient)s")
        params["patient"] = patient
    if reference_type:
        conditions.append("si.custom_reference_type = %(reference_type)s")
        params["reference_type"] = reference_type
    if reference_name:
        conditions.append("si.custom_reference_name = %(reference_name)s")
        params["reference_name"] = reference_name

    from healthcare.api.common import get_permitted_cost_centers
    permitted_cc = get_permitted_cost_centers()
    if permitted_cc is not None:
        if not permitted_cc:
            return []
        conditions.append("IFNULL(pe.cost_center, '') IN %(permitted_cc)s")
        params["permitted_cc"] = tuple(permitted_cc)

    where_sql = " AND ".join(conditions)
    rows = frappe.db.sql(
        f"""
        SELECT
            pe.name,
            pe.posting_date,
            pe.mode_of_payment,
            pe.paid_amount,
            pe.party_name,
            pe.reference_no,
            pe.cost_center,
            per.reference_name AS invoice_name,
            si.custom_reference_type AS invoice_reference_type,
            si.custom_reference_name AS invoice_reference_name
        FROM `tabPayment Entry` pe
        LEFT JOIN `tabPayment Entry Reference` per
            ON per.parent = pe.name
           AND per.reference_doctype = 'Sales Invoice'
        LEFT JOIN `tabSales Invoice` si
            ON si.name = per.reference_name
        WHERE {where_sql}
        ORDER BY pe.posting_date DESC, pe.creation DESC
        """,
        params,
        as_dict=True,
    )
    return rows


@frappe.whitelist()
def get_payment_summary(reference_type=None, reference_name=None, patient=None, from_date=None, to_date=None):
    rows = get_payment_entries(
        reference_type=reference_type,
        reference_name=reference_name,
        patient=patient,
        from_date=from_date,
        to_date=to_date,
    )
    total_paid = sum(flt(r.get("paid_amount")) for r in rows)
    by_mode = {}
    for r in rows:
        mode = (r.get("mode_of_payment") or "Unknown").strip() or "Unknown"
        if mode not in by_mode:
            by_mode[mode] = {"mode_of_payment": mode, "count": 0, "amount": 0.0}
        by_mode[mode]["count"] += 1
        by_mode[mode]["amount"] += flt(r.get("paid_amount"))

    modes = sorted(by_mode.values(), key=lambda x: (-x["amount"], x["mode_of_payment"]))
    return {
        "payment_count": len(rows),
        "total_paid": total_paid,
        "modes": modes,
    }


@frappe.whitelist()
def get_invoice_items(invoice_name):
    """
    Get items from a specific sales invoice
    """
    if not invoice_name:
        return []
    
    invoice = frappe.get_doc("Sales Invoice", invoice_name)
    items = []
    
    for item in invoice.items:
        items.append({
            "item_code": item.item_code,
            "item_name": item.item_name,
            "description": item.description,
            "qty": item.qty,
            "rate": item.rate,
            "amount": item.amount,
            "discount_amount": item.discount_amount,
            "net_amount": item.net_amount
        })
    
    return items


@frappe.whitelist()
def get_invoice_details(invoice_name):
    """
    Get detailed information about an invoice including items (for Reception slide-over).
    """
    if not invoice_name:
        return None

    invoice = frappe.get_doc("Sales Invoice", invoice_name)
    frappe.has_permission("Sales Invoice", "read", doc=invoice, throw=True)

    cc = getattr(invoice, "custom_created_at", None)
    cc_label = (
        frappe.db.get_value("Cost Center", cc, "cost_center_name") if cc else None
    ) or cc

    dept = getattr(invoice, "department", None) or getattr(invoice, "custom_department", None)

    return {
        "name": invoice.name,
        "docstatus": invoice.docstatus,
        "company": invoice.company,
        "customer": invoice.customer,
        "customer_name": invoice.customer_name,
        "posting_date": invoice.posting_date,
        "due_date": invoice.due_date,
        "grand_total": invoice.grand_total,
        "outstanding_amount": invoice.outstanding_amount,
        "status": invoice.status,
        "cost_center": invoice.cost_center,
        "department": dept,
        "custom_created_at": getattr(invoice, "custom_created_at", None),
        "collection_cost_center_name": cc_label,
        "custom_internal_employee": int(getattr(invoice, "custom_internal_employee", 0) or 0),
        "custom_reference_type": getattr(invoice, "custom_reference_type", None),
        "custom_reference_name": getattr(invoice, "custom_reference_name", None),
        "patient": getattr(invoice, "patient", None),
        "items": [
            {
                "item_code": item.item_code,
                "item_name": item.item_name,
                "description": item.description,
                "qty": item.qty,
                "rate": item.rate,
                "amount": item.amount,
                "net_amount": item.net_amount,
            }
            for item in invoice.items
        ],
    }


@frappe.whitelist()
def submit_sales_invoice_doc(invoice_name):
    """Submit a draft Sales Invoice."""
    if not invoice_name:
        frappe.throw(_("Invoice name is required"))

    doc = frappe.get_doc("Sales Invoice", invoice_name)
    frappe.has_permission("Sales Invoice", "submit", doc=doc, throw=True)
    if doc.docstatus != 0:
        frappe.throw(_("Only draft invoices can be submitted"))

    doc.submit()
    frappe.db.commit()
    return {"name": doc.name, "docstatus": doc.docstatus, "status": doc.status}


@frappe.whitelist()
def cancel_or_delete_sales_invoice(invoice_name):
    """
    Draft (docstatus 0): delete document.
    Submitted (docstatus 1): cancel document.
    """
    if not invoice_name:
        frappe.throw(_("Invoice name is required"))

    doc = frappe.get_doc("Sales Invoice", invoice_name)

    if doc.docstatus == 1:
        frappe.has_permission("Sales Invoice", "cancel", doc=doc, throw=True)
        doc.cancel()
        frappe.db.commit()
        return {"name": doc.name, "docstatus": doc.docstatus, "status": doc.status}

    if doc.docstatus == 0:
        frappe.has_permission("Sales Invoice", "delete", doc=doc, throw=True)
        frappe.delete_doc("Sales Invoice", invoice_name)
        frappe.db.commit()
        return {"deleted": True, "name": invoice_name}

    frappe.throw(_("This invoice cannot be cancelled"))


@frappe.whitelist()
def create_payment_entry(invoice_name, payment_amount, payment_mode, cost_center=None,department=None, reference_number=None):
    """
    Create a payment entry against a sales invoice
    """
    try:
        # Get the sales invoice
        invoice = frappe.get_doc("Sales Invoice", invoice_name)

        if invoice.docstatus != 1:
            return {
                "success": False,
                "message": _("Only submitted invoices can receive payments."),
            }

        outstanding = flt(invoice.outstanding_amount)
        pay_amt = flt(payment_amount)
        if outstanding <= 0:
            return {"success": False, "message": _("This invoice has no outstanding balance.")}
        if pay_amt <= 0:
            return {"success": False, "message": _("Payment amount must be greater than zero.")}
        if pay_amt > outstanding:
            return {
                "success": False,
                "message": _("Payment amount cannot exceed the outstanding amount ({0}).").format(outstanding),
            }

        if not payment_mode or not cstr(payment_mode).strip():
            return {"success": False, "message": _("Mode of payment is required.")}
        payment_mode = cstr(payment_mode).strip()

        # Get the company document
        company = frappe.get_doc("Company", invoice.company)
        
        # Get default accounts from Company
        default_receivable_account = company.default_receivable_account
        default_cash_account = company.default_cash_account
        default_bank_account = company.default_bank_account
        
        # Determine which account to use for 'paid_to' based on payment mode
        # Cash payment -> use default_cash_account
        # Bank payment -> use default_bank_account
        paid_to_account = None
        if payment_mode.lower() == 'cash':
            paid_to_account = default_cash_account
        else:
            paid_to_account = default_bank_account
        
        # Fallback if no account found for the payment mode
        if not paid_to_account:
            paid_to_account = default_cash_account or default_bank_account
        
        # Validate we have required accounts
        if not default_receivable_account:
            frappe.throw("Default Receivable Account not set in Company {0}".format(invoice.company))
        
        if not paid_to_account:
            frappe.throw("No Cash or Bank account found. Please set default_cash_account or default_bank_account in Company {0}".format(invoice.company))
        
        # Create payment entry
        payment_entry = frappe.new_doc("Payment Entry")
        payment_entry.payment_type = "Receive"
        payment_entry.company = invoice.company
        payment_entry.party_type = "Customer"
        payment_entry.party = invoice.customer
        payment_entry.party_name = invoice.customer_name
        payment_entry.paid_amount = pay_amt
        payment_entry.received_amount = pay_amt
        payment_entry.reference_date = frappe.utils.today()
        payment_entry.reference_no = reference_number or f"PAY-{invoice_name}"
        payment_entry.mode_of_payment = payment_mode
        payment_entry.department = department
        
        # Set the accounts correctly for a Receive payment
        # paid_from = where money is coming FROM (Party's Receivable account)
        # paid_to = where money is going TO (Your Cash/Bank account)
        payment_entry.paid_from = default_receivable_account
        payment_entry.paid_to = paid_to_account
        
        # Set cost center if provided
        if cost_center:
            payment_entry.cost_center = cost_center
        
        # Set currency (single currency - no exchange rate needed)
        payment_entry.currency = company.default_currency
        
        # Add reference to the invoice
        payment_entry.append("references", {
            "reference_doctype": "Sales Invoice",
            "reference_name": invoice_name,
            "total_amount": invoice.outstanding_amount,
            "outstanding_amount": invoice.outstanding_amount,
            "allocated_amount": pay_amt
        })
        
        # Insert and submit
        payment_entry.insert()
        payment_entry.submit()
        
        frappe.db.commit()
        
        return {
            "success": True,
            "message": f"Payment of {pay_amt} successfully recorded against invoice {invoice_name}",
            "payment_entry": payment_entry.name
        }
        
    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(f"Payment Entry Error: {str(e)}", "Billing Payment")
        return {
            "success": False,
            "message": str(e)
        }


@frappe.whitelist()
def get_invoices_by_reference(reference_name, reference_type=None, patient=None):
	"""
	Get Sales Invoices for a Patient Visit or Inpatient Admission.

	Includes draft and submitted (excludes cancelled). Optionally filters by patient.
	Legacy rows with empty ``custom_reference_type`` but matching ``custom_reference_name``
	are included only when a typed query returns nothing.
	"""
	if not reference_name:
		return []

	fields = [
		"name",
		"docstatus",
		"grand_total",
		"outstanding_amount",
		"posting_date",
		"status",
		"custom_reference_type",
		"custom_reference_name",
		"patient",
	]

	def _fetch(flt):
		inv = frappe.get_all(
			"Sales Invoice",
			filters=flt,
			fields=fields,
			order_by="posting_date desc, modified desc",
		)
		if patient:
			inv = [r for r in inv if (r.get("patient") or "") == patient]
		return inv

	filters = _sales_invoice_filters_for_reference(reference_type, reference_name, submitted_only=False)
	if not filters:
		return []

	invoices = _fetch(filters)
	if not invoices and reference_type:
		legacy_filters = {
			"custom_reference_name": reference_name,
			"docstatus": ["in", [0, 1]],
		}
		invoices = _fetch(legacy_filters)

	return invoices


def _load_payload_list(payload):
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except Exception:
            payload = []
    return payload or []


def _get_or_create_employee_customer(employee_name):
    customer = frappe.db.get_value("Customer", {"customer_name": employee_name}, "name")
    if customer:
        return customer

    customer_doc = frappe.get_doc(
        {
            "doctype": "Customer",
            "customer_name": employee_name,
            "customer_type": "Individual",
            "customer_group": frappe.db.get_single_value("Selling Settings", "customer_group")
            or "Individual",
            "territory": frappe.db.get_single_value("Selling Settings", "territory")
            or "All Territories",
        }
    )
    customer_doc.insert(ignore_permissions=True)
    return customer_doc.name


def _kind_label_for_service_request(sr):
    """Reception-friendly category from Service Request template."""
    if not sr:
        return _("Clinical service")

    td = (sr.get("template_dt") or "").strip()
    dn = (sr.get("template_dn") or "").strip()
    suffix = f" — {dn}" if dn else ""

    if td == "Lab Test Template":
        return _("Lab tests") + suffix
    if td == "Clinical Procedure Template":
        return _("Clinical procedure") + suffix
    if td == "Observation Template":
        return _("Observation") + suffix
    if td == "Therapy Type":
        return _("Therapy") + suffix
    if td == "Healthcare Service Template":
        return _("IP / ward service") + suffix
    if td == "Healthcare Activity":
        return _("Healthcare activity") + suffix
    if td == "Consultation Service Template":
        return _("Consultation") + suffix
    if td == "Appointment Type":
        return _("Appointment") + suffix

    if td:
        return td + suffix
    od = (sr.get("order_description") or "").strip()
    if od:
        return od[:120]
    return _("Service request")


def _order_kind_label(so_row, sr_by_name):
    """Human-readable order type for reception (labs, drugs, IP services, etc.)."""
    ref_t = (so_row.get("custom_reference_type") or "").strip()
    base_ref = (so_row.get("custom_base_reference") or "").strip()
    base_name = (so_row.get("custom_base_reference_name") or "").strip()

    if base_ref == "Patient Medication Order":
        return _("Medication / pharmacy")

    if base_ref == "Service Request" and base_name:
        sr = sr_by_name.get(base_name)
        return _kind_label_for_service_request(sr)

    if ref_t == "Service Request":
        sr_name = so_row.get("custom_reference_name")
        sr = sr_by_name.get(sr_name) if sr_name else None
        return _kind_label_for_service_request(sr)

    if ref_t == "Patient Visit":
        return _("OP visit charges")
    if ref_t == "Inpatient Admission":
        return _("Admission charges")

    return ref_t or _("Billing order")


def _attach_sales_order_items(rows):
    """Attach SO lines and reception labels.

    Lines are loaded via get_doc(\"Sales Order\").items — same as Desk — because
    frappe.get_all(\"Sales Order Item\", ...) often returns nothing for roles that
    can read Sales Order but lack explicit Sales Order Item list permission; get_all
    also applies a row limit by default.
    """
    sr_refs = []
    for r in rows:
        base_t = (r.get("custom_base_reference") or "").strip()
        base_n = (r.get("custom_base_reference_name") or "").strip()
        if base_t == "Service Request" and base_n:
            sr_refs.append(base_n)
            continue
        ref_t = (r.get("custom_reference_type") or "").strip()
        ref_n = (r.get("custom_reference_name") or "").strip()
        if ref_t == "Service Request" and ref_n:
            sr_refs.append(ref_n)
    sr_refs = list(dict.fromkeys(sr_refs))
    sr_by_name = {}
    if sr_refs:
        uniq_sr = list(dict.fromkeys(sr_refs))
        srs = frappe.get_all(
            "Service Request",
            filters={"name": ["in", uniq_sr]},
            fields=["name", "template_dt", "template_dn", "order_description"],
        )
        sr_by_name = {s.name: s for s in srs}

    for row in rows:
        so_name = row.get("name")
        items = []
        if so_name:
            try:
                doc = frappe.get_doc("Sales Order", so_name)
                for it in doc.get("items") or []:
                    items.append(
                        {
                            "item_code": it.item_code,
                            "item_name": (it.item_name or it.item_code or "").strip(),
                            "description": (getattr(it, "description", None) or "").strip(),
                            "qty": it.qty,
                            "rate": it.rate,
                            "amount": it.amount,
                        }
                    )
            except frappe.PermissionError:
                items = []
            except frappe.DoesNotExistError:
                items = []
        row["items"] = items
        row["order_kind_label"] = _order_kind_label(row, sr_by_name)


@frappe.whitelist()
def get_related_sales_orders(reference_type, reference_name):
    if not reference_type or not reference_name:
        frappe.throw(_("Reference type and reference name are required"))

    if reference_type not in ("Patient Visit", "Inpatient Admission"):
        frappe.throw(_("Unsupported reference type"))

    so_fields = [
        "name",
        "transaction_date",
        "grand_total",
        "status",
        "customer",
        "company",
        "custom_reference_type",
        "custom_reference_name",
        "custom_base_reference",
        "custom_base_reference_name",
    ]

    direct = frappe.get_all(
        "Sales Order",
        filters={
            "custom_reference_type": reference_type,
            "custom_reference_name": reference_name,
            "docstatus": ["!=", 2],
        },
        fields=so_fields,
        order_by="creation desc",
    )
    
    service_request_field = "patient_visit" if reference_type == "Patient Visit" else "inpatient_record"
    service_requests = frappe.get_all(
        "Service Request",
        filters={service_request_field: reference_name, "docstatus": ["!=", 2]},
        fields=["name"],
    )
    sr_names = [row.name for row in service_requests]
    sr_orders = []
    if sr_names:
        sr_orders_new = frappe.get_all(
            "Sales Order",
            filters={
                "custom_reference_type": reference_type,
                "custom_reference_name": reference_name,
                "custom_base_reference": "Service Request",
                "custom_base_reference_name": ["in", sr_names],
                "docstatus": ["!=", 2],
            },
            fields=so_fields,
            order_by="creation desc",
        )
        sr_orders_legacy = frappe.get_all(
            "Sales Order",
            filters={
                "custom_reference_type": "Service Request",
                "custom_reference_name": ["in", sr_names],
                "docstatus": ["!=", 2],
            },
            fields=so_fields,
            order_by="creation desc",
        )
        sr_orders = list(sr_orders_new) + list(sr_orders_legacy)

    out = []
    seen = set()
    for row in direct + sr_orders:
        if row.name in seen:
            continue
        seen.add(row.name)
        out.append(row)

    # Per-order lines: loaded inside _attach_sales_order_items via frappe.get_doc(...).items
    _attach_sales_order_items(out)
    return out

@frappe.whitelist()
def create_additional_collection_invoice(
    company,
    created_at_cost_center,
    customer=None,
    reference_type=None,
    reference_name=None,
    patient=None,
    posting_date=None,
    due_date=None,
    sales_orders=None,
    additional_items=None,
):
    sales_orders = _load_payload_list(sales_orders)
    additional_items = _load_payload_list(additional_items)

    if not company:
        frappe.throw(_("Company is required"))
    if not customer and patient:
        customer = frappe.db.get_value("Patient", patient, "customer")
    if not customer:
        frappe.throw(_("Customer is required (or provide patient linked to a customer)"))
    if not created_at_cost_center:
        frappe.throw(_("Collection cost center is required"))

    invoice = frappe.new_doc("Sales Invoice")
    invoice.company = company
    invoice.customer = customer
    invoice.posting_date = posting_date or nowdate()
    invoice.due_date = due_date or invoice.posting_date
    invoice.custom_created_at = created_at_cost_center
    if patient:
        invoice.patient = patient
    if reference_type and reference_name:
        invoice.custom_reference_type = reference_type
        invoice.custom_reference_name = reference_name

    for so_name in sales_orders:
        if not so_name:
            continue
        so_doc = frappe.get_doc("Sales Order", so_name)
        for item in so_doc.items:
            invoice.append(
                "items",
                {
                    "item_code": item.item_code,
                    "item_name": item.item_name,
                    "description": item.description,
                    "qty": item.qty,
                    "uom": item.uom,
                    "rate": item.rate,
                    # "income_account": item.income_account,
                    "cost_center": item.cost_center or created_at_cost_center,
                    "warehouse": item.warehouse,
                },
            )

    for row in additional_items:
        if not isinstance(row, dict):
            continue
        if not row.get("item_code"):
            continue
        qty = float(row.get("qty") or 0)
        if qty <= 0:
            continue
        line = {
            "item_code": row.get("item_code"),
            "item_name": row.get("item_name"),
            "description": row.get("description"),
            "qty": qty,
            "rate": float(row.get("rate") or 0),
            "cost_center": row.get("cost_center") or created_at_cost_center,
        }
        if row.get("uom"):
            line["uom"] = row.get("uom")
        invoice.append("items", line)

    if not invoice.items:
        frappe.throw(_("Please add at least one item or sales order"))

    invoice.insert(ignore_permissions=True)
    return {"name": invoice.name, "grand_total": invoice.grand_total, "customer": invoice.customer}


@frappe.whitelist()
def create_internal_employee_invoice(
    employee_name,
    company,
    created_at_cost_center,
    items,
    posting_date=None,
    due_date=None,
    patient=None,
):
    if not employee_name:
        frappe.throw(_("Employee name is required"))
    if not company:
        frappe.throw(_("Company is required"))
    if not created_at_cost_center:
        frappe.throw(_("Collection cost center is required"))

    items = _load_payload_list(items)
    if not items:
        frappe.throw(_("Please add at least one item"))

    customer = _get_or_create_employee_customer(employee_name)

    invoice = frappe.new_doc("Sales Invoice")
    invoice.company = company
    invoice.customer = customer
    invoice.posting_date = posting_date or nowdate()
    invoice.due_date = due_date or invoice.posting_date
    invoice.custom_created_at = created_at_cost_center
    invoice.custom_internal_employee = 1
    if patient and frappe.db.exists("Patient", patient):
        invoice.patient = patient

    for row in items:
        if not isinstance(row, dict):
            continue
        if not row.get("item_code"):
            continue
        qty = float(row.get("qty") or 0)
        if qty <= 0:
            continue
        line = {
            "item_code": row.get("item_code"),
            "item_name": row.get("item_name"),
            "description": row.get("description"),
            "qty": qty,
            "rate": float(row.get("rate") or 0),
            "cost_center": row.get("cost_center") or created_at_cost_center,
        }
        if row.get("uom"):
            line["uom"] = row.get("uom")
        invoice.append("items", line)

    if not invoice.items:
        frappe.throw(_("Please add at least one valid item"))

    invoice.insert(ignore_permissions=True)
    return {"name": invoice.name, "customer": invoice.customer, "grand_total": invoice.grand_total}


@frappe.whitelist()
def list_additional_collection_invoices(limit_start=0, limit_page_length=100):
    """Cross‑Branch Payment (cross–cost center): Created At cost center set; excludes internal employee."""
    limit_start = int(limit_start or 0)
    limit_page_length = min(int(limit_page_length or 100), 500)

    rows = frappe.db.sql(
        """
        SELECT
            name, docstatus, posting_date, customer, customer_name, grand_total,
            outstanding_amount, status, company, custom_created_at,
            custom_reference_type, custom_reference_name, patient
        FROM `tabSales Invoice`
        WHERE docstatus != 2
          AND IFNULL(custom_created_at, '') != ''
          AND IFNULL(custom_internal_employee, 0) = 0
        ORDER BY creation DESC
        LIMIT %(limit)s OFFSET %(start)s
        """,
        {"start": limit_start, "limit": limit_page_length},
        as_dict=True,
    )

    for r in rows:
        cc = r.get("custom_created_at")
        r["collection_cost_center_name"] = (
            frappe.db.get_value("Cost Center", cc, "cost_center_name") if cc else None
        ) or cc

    return rows


@frappe.whitelist()
def list_internal_employee_invoices(limit_start=0, limit_page_length=100):
    limit_start = int(limit_start or 0)
    limit_page_length = min(int(limit_page_length or 100), 500)

    rows = frappe.get_all(
        "Sales Invoice",
        filters={
            "docstatus": ["!=", 2],
            "custom_internal_employee": 1,
        },
        fields=[
            "name",
            "docstatus",
            "posting_date",
            "customer",
            "customer_name",
            "grand_total",
            "outstanding_amount",
            "status",
            "company",
            "custom_created_at",
            "patient",
        ],
        order_by="creation desc",
        limit_start=limit_start,
        limit_page_length=limit_page_length,
    )

    for r in rows:
        cc = r.get("custom_created_at")
        r["collection_cost_center_name"] = (
            frappe.db.get_value("Cost Center", cc, "cost_center_name") if cc else None
        ) or cc

    return rows


@frappe.whitelist()
def get_internal_employee_billing_summary():
    row = frappe.db.sql(
        """
        SELECT
            COUNT(*) AS invoice_count,
            COALESCE(SUM(grand_total), 0) AS total_billed,
            COALESCE(SUM(outstanding_amount), 0) AS total_outstanding
        FROM `tabSales Invoice`
        WHERE docstatus != 2
          AND IFNULL(custom_internal_employee, 0) = 1
        """,
        as_dict=True,
    )
    r = row[0] if row else {}
    return {
        "invoice_count": int(r.get("invoice_count") or 0),
        "total_billed": float(r.get("total_billed") or 0),
        "total_outstanding": float(r.get("total_outstanding") or 0),
    }