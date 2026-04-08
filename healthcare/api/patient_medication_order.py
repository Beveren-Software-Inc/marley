# -*- coding: utf-8 -*-
# Copyright (c) 2020, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt, nowdate, getdate, add_days


@frappe.whitelist()
def get_medication_orders(
	limit=50,
	offset=0,
	patient=None,
	status=None,
	search=None,
	practitioner=None,
	from_date=None,
	to_date=None,
	care_context=None,
	patient_encounter=None,
	inpatient_record=None,
):
	"""Get list of Patient Medication Orders for Prescription listing.
	Supports filters: patient, status, search (name/patient name), practitioner,
	from_date, to_date, care_context, patient_encounter, inpatient_record.
	"""
	from healthcare.api.common import get_permitted_cost_centers
	limit = int(limit) if limit else 50
	offset = int(offset) if offset else 0
	use_sql = bool(search or practitioner or from_date or to_date or patient_encounter or inpatient_record)

	# Resolve cost-centre restriction once for both paths
	permitted_cc = get_permitted_cost_centers()
	if permitted_cc is not None and not permitted_cc:
		return []

	fields = [
		'name', 'patient', 'patient_name', 'care_context', 'patient_encounter',
		'inpatient_record', 'practitioner', 'posting_date', 'start_date', 'end_date',
		'status', 'total_orders', 'completed_orders', 'company',
		'reference_doctype', 'reference_document_name', 'cost_center',
	]

	if use_sql:
		conditions = ['docstatus != 2']
		params = {}
		if patient:
			conditions.append('patient = %(patient)s')
			params['patient'] = patient
		if status:
			conditions.append('status = %(status)s')
			params['status'] = status
		else:
			conditions.append("status != 'Cancelled'")
		if search:
			conditions.append(
				"(name LIKE %(search)s OR patient_name LIKE %(search)s OR patient LIKE %(search)s)"
			)
			params['search'] = f'%{search}%'
		if practitioner:
			conditions.append('practitioner = %(practitioner)s')
			params['practitioner'] = practitioner
		if care_context in ('Patient Visit', 'Inpatient Admission'):
			conditions.append('care_context = %(care_context)s')
			params['care_context'] = care_context
		if patient_encounter:
			conditions.append('patient_encounter = %(patient_encounter)s')
			params['patient_encounter'] = patient_encounter
		if inpatient_record:
			conditions.append('inpatient_record = %(inpatient_record)s')
			params['inpatient_record'] = inpatient_record
		if from_date:
			conditions.append('posting_date >= %(from_date)s')
			params['from_date'] = from_date
		if to_date:
			conditions.append('posting_date <= %(to_date)s')
			params['to_date'] = to_date

		# ── Cost-centre User Permission enforcement ───────────────────────
		if permitted_cc is not None:
			placeholders = ', '.join(f'%(cc_{i})s' for i in range(len(permitted_cc)))
			conditions.append(f'cost_center IN ({placeholders})')
			for i, cc in enumerate(permitted_cc):
				params[f'cc_{i}'] = cc

		where_sql = ' AND '.join(conditions)
		orders = frappe.db.sql(
			f"""
			SELECT {', '.join(fields)}
			FROM `tabPatient Medication Order`
			WHERE {where_sql}
			ORDER BY posting_date DESC, creation DESC
			LIMIT %(limit)s OFFSET %(offset)s
			""",
			{**params, 'limit': limit, 'offset': offset},
			as_dict=True,
		)
	else:
		filters = [['docstatus', '!=', 2]]
		if patient:
			filters.append(['patient', '=', patient])
		if status:
			filters.append(['status', '=', status])
		else:
			filters.append(['status', '!=', 'Cancelled'])
		if care_context in ('Patient Visit', 'Inpatient Admission'):
			filters.append(['care_context', '=', care_context])
		if patient_encounter:
			filters.append(['patient_encounter', '=', patient_encounter])
		if inpatient_record:
			filters.append(['inpatient_record', '=', inpatient_record])

		# ── Cost-centre User Permission enforcement ───────────────────────
		if permitted_cc is not None:
			filters.append(['cost_center', 'in', permitted_cc])

		orders = frappe.get_all(
			'Patient Medication Order',
			filters=filters,
			fields=fields,
			limit=limit,
			limit_start=offset,
			order_by='posting_date desc, creation desc',
		)

	for o in orders:
		if o.get('practitioner'):
			o['healthcare_practitioner_name'] = frappe.db.get_value(
				'Healthcare Practitioner', o['practitioner'], 'practitioner_name'
			) or o['practitioner']
		else:
			o['healthcare_practitioner_name'] = None

	return orders


def _set_medication_row(doc, row):
	"""Append one medication order row to doc. row is a dict with keys from Inpatient Medication Order Entry."""
	entry = doc.append('medication_orders', {})
	entry.drug = row.get('drug')
	entry.dosage = row.get('dosage') or ''
	entry.no_of_days = flt(row.get('no_of_days'), 0)
	entry.dosage_form = row.get('dosage_form')
	entry.instructions = row.get('instructions') or ''
	entry.date = row.get('date')
	entry.time = row.get('time') or '00:00:00'
	entry.end_date = row.get('end_date')
	entry.patient_frequency = row.get('patient_frequency')
	entry.is_pink = 1 if row.get('is_pink') else 0
	entry.is_prn = 1 if row.get('is_prn') else 0
	entry.reference_no = row.get('reference_no') or ''
	entry.route_of_administration = row.get('route_of_administration') or ''
	entry.is_long_acting_medicine = 1 if row.get('is_long_acting_medicine') or row.get('is_long_acting') else 0
	entry.long_acting_frequency = (row.get('long_acting_frequency') or '').strip() or None
	entry.medication_type = row.get('medication_type') or ''
	
	# Fetched / computed
	if entry.drug:
		entry.drug_name = frappe.db.get_value('Item', entry.drug, 'item_name') or entry.drug
		entry.uom = frappe.db.get_value('Item', entry.drug, 'stock_uom')
	if entry.patient_frequency:
		entry.frequency_in_a_day = frappe.db.get_value(
			'Prescription Frequency', entry.patient_frequency, 'frequency_in_a_day'
		) or 0
	else:
		entry.frequency_in_a_day = 0
	# quantity = no_of_days * dosage * frequency_in_a_day (dosage as number if possible)
	dosage_val = flt(entry.dosage, 0) or 0
	entry.quantity = flt(entry.no_of_days, 0) * dosage_val * flt(entry.frequency_in_a_day, 0)
	if not entry.quantity:
		entry.quantity = flt(entry.no_of_days, 0)
	return entry


@frappe.whitelist()
def create_patient_medication_order(
	patient,
	care_context,
	company,
	start_date,
	patient_encounter=None,
	inpatient_record=None,
	practitioner=None,
	medication_orders=None,
):
	"""Create a new Patient Medication Order (prescription) with optional medication rows.
	medication_orders: list of dicts with keys: drug, dosage, no_of_days, dosage_form, instructions, date, time, patient_frequency, is_pink, reference_no.
	"""
	if not patient:
		frappe.throw(_("Patient is required"))
	if care_context not in ('Patient Visit', 'Inpatient Admission'):
		frappe.throw(_("Care Context must be Patient Visit or Inpatient Admission"))
	if not company:
		frappe.throw(_("Company is required"))
	if not start_date:
		frappe.throw(_("Start Date is required"))
	
	
	doc = frappe.new_doc('Patient Medication Order')
	doc.patient = patient
	doc.care_context = care_context
	doc.company = company
	doc.start_date = start_date

	if care_context == 'Patient Visit':
		if not patient_encounter:
			frappe.throw(_("Patient Visit is required when Care Context is Patient Visit"))
		doc.patient_encounter = patient_encounter
		visit = frappe.db.get_value(
			'Patient Visit',
			patient_encounter,
			['patient_name', 'patient_age', 'practitioner', 'encounter_date'],
			as_dict=True,
		)
		if visit:
			doc.patient_name = visit.get('patient_name')
			doc.patient_age = visit.get('patient_age')
			if not practitioner and visit.get('practitioner'):
				doc.practitioner = visit.practitioner
			if not doc.start_date and visit.get('encounter_date'):
				doc.start_date = visit.encounter_date
	elif care_context == 'Inpatient Admission':
		if not inpatient_record:
			frappe.throw(_("Inpatient Admission is required when Care Context is Inpatient Admission"))
		doc.inpatient_record = inpatient_record
		adm = frappe.db.get_value(
			'Inpatient Admission',
			inpatient_record,
			['patient', 'patient_name', 'primary_practitioner', 'secondary_practitioner'],
			as_dict=True,
		)
		if adm:
			doc.patient = adm.get('patient') or doc.patient
			doc.patient_name = adm.get('patient_name')
			if not practitioner and adm.get('primary_practitioner'):
				doc.practitioner = adm.primary_practitioner
			elif not practitioner and adm.get('secondary_practitioner'):
				doc.practitioner = adm.secondary_practitioner

	if practitioner:
		doc.practitioner = practitioner
	# Append medication rows
	if medication_orders:
		if isinstance(medication_orders, str):
			import json
			medication_orders = json.loads(medication_orders)
		for row in medication_orders:
			if not row.get('drug'):
				continue
			# Default date/time from start_date if missing
			if not row.get('date'):
				row['date'] = start_date
			if not row.get('time'):
				row['time'] = '00:00:00'
			_set_medication_row(doc, row)
		# Set end_date from last row date if we have rows
		if doc.medication_orders:
			last_dates = [r.date for r in doc.medication_orders if r.date]
			if last_dates:
				doc.end_date = max(last_dates)

	doc.insert(ignore_permissions=True)
	# doc.submit()

	# Create Long Acting Medicine for each medication row marked as long-acting
	_create_long_acting_medicine_for_entries(doc)

	return {'name': doc.name}


def _long_acting_frequency_interval_days(frequency):
	"""Return interval in days for next run (Weekly=7, Biweekly=14, Monthly=30, etc.)."""
	if not frequency:
		return 7
	m = {
		"Weekly": 7,
		"Biweekly": 14,
		"Monthly": 30,
		"Every 2 Months": 60,
		"Every 3 Months": 90,
	}
	return m.get(frequency.strip(), 7)


def _create_long_acting_medicine_for_entries(pmo_doc):
	"""For each medication order entry with is_long_acting_medicine=1, create a Long Acting Medicine doc."""
	for entry in (pmo_doc.medication_orders or []):
		is_long_acting = getattr(entry, 'is_long_acting_medicine', 0) == 1
		medication_type = getattr(entry, 'medication_type', '').strip()
		if not (is_long_acting or medication_type == 'Long Acting Medicine'):
			continue
		frequency = getattr(entry, 'long_acting_frequency', None) or 'Weekly'
		start_dt = getdate(entry.date) if entry.date else getdate(pmo_doc.start_date)
		end_dt = getdate(entry.end_date) if entry.end_date else (getdate(pmo_doc.end_date) if pmo_doc.end_date else None)
		# Next run date = start date + interval (Weekly +7d, Biweekly +14d, Monthly +30d, etc.)
		interval_days = _long_acting_frequency_interval_days(frequency)
		next_run = add_days(start_dt, interval_days)

		lam = frappe.new_doc('Long Acting Medicine')
		lam.naming_series = 'SMP-.YYYY.-'
		lam.patient = pmo_doc.patient
		lam.patient_name = pmo_doc.get('patient_name')
		lam.practitioner = pmo_doc.get('practitioner')
		lam.company = pmo_doc.company
		lam.frequency = frequency
		lam.start_date = start_dt
		lam.end_date = end_dt
		lam.next_run_date = next_run
		lam.status = 'Active'

		# Single medication row from this order entry
		lam.append('medications', {
			'medication_order_entry': entry.name,
			'drug': entry.drug,
			'drug_name': entry.drug_name or frappe.db.get_value('Item', entry.drug, 'item_name'),
			'dosage': flt(entry.dosage, 0) or 0,
			'dosage_form': entry.dosage_form,
			'instructions': entry.instructions or '',
			'patient_frequency': entry.patient_frequency,
			'date': entry.date,
			'time': entry.time or '08:00:00',
			'qty_per_cycle': 1,
			'is_active': 1,
		})
		lam.insert(ignore_permissions=True)
		lam.submit()


# @frappe.whitelist()
# def create_sales_order_from_medication_order(name: str):
# 	"""Create (or return existing) Sales Order for a Patient Medication Order.

# 	The Sales Order will be left in Draft state and linked back to the PMO.
# 	Also sets custom_base_reference/custom_base_reference_name on Sales Order
# 	and saves reference_doctype/reference_document_name on the PMO.
# 	"""
# 	if not name:
# 		frappe.throw(_("Patient Medication Order name is required"))

# 	pmo = frappe.get_doc("Patient Medication Order", name)

# 	if pmo.docstatus != 1:
# 		frappe.throw(_("Only submitted Patient Medication Orders can create Sales Orders"))

# 	# If a Sales Order is already linked, just return it
# 	if getattr(pmo, "reference_doctype", None) == "Sales Order" and getattr(pmo, "reference_document_name", None):
# 		if frappe.db.exists("Sales Order", pmo.reference_document_name):
# 			so = frappe.get_doc("Sales Order", pmo.reference_document_name)
# 			return {"sales_order": so.name, "status": so.status}

# 	if not pmo.company:
# 		frappe.throw(_("Company is required on Patient Medication Order"))

# 	if not pmo.patient:
# 		frappe.throw(_("Patient is required on Patient Medication Order"))

# 	# Determine healthcare reference (Patient Visit or Inpatient Admission)
# 	ref_doctype = None
# 	ref_name = None
# 	if pmo.care_context == "Inpatient Admission" and pmo.inpatient_record:
# 		ref_doctype = "Inpatient Admission"
# 		ref_name = pmo.inpatient_record
# 	elif pmo.care_context == "Patient Visit" and pmo.patient_encounter:
# 		ref_doctype = "Patient Visit"
# 		ref_name = pmo.patient_encounter

# 	# Create Sales Order (draft)
# 	so = frappe.new_doc("Sales Order")
# 	so.company = pmo.company
# 	so.patient = pmo.patient
# 	so.customer = pmo.patient
# 	# Ensure transaction and delivery dates are set to pass validation
# 	so.transaction_date = nowdate()
# 	so.delivery_date = nowdate()#pmo.end_date or pmo.start_date or nowdate()
# 	if getattr(pmo, "patient_name", None):
# 		so.custom_patient_name = pmo.patient_name
# 	so.custom_patient = pmo.patient

# 	# Healthcare reference to context (visit/admission)
# 	if ref_doctype and ref_name:
# 		so.custom_reference_type = ref_doctype
# 		so.custom_reference_name = ref_name
# 		so.custom_base_reference = "Patient Medication Order"
# 		so.custom_base_reference_name = pmo.name

# 	# Base reference back to the PMO itself
# 	so.custom_base_reference = "Patient Medication Order"
# 	so.custom_base_reference_name = pmo.name

# 	# Add one Sales Order Item per medication order row
# 	for row in pmo.get("medication_orders") or []:
# 		if not getattr(row, "drug", None):
# 			continue
# 		qty = flt(getattr(row, "quantity", 0)) or 1
# 		so.append(
# 			"items",
# 			{
# 				"item_code": row.drug,
# 				"qty": qty,
# 				"description": getattr(row, "drug_name", None) or row.drug,
# 			},
# 		)

# 	if not so.items:
# 		frappe.throw(_("No medication items found to create a Sales Order"))

# 	so.insert(ignore_permissions=True)
# 	# Keep as Draft – do NOT submit

# 	# Link back to PMO for future lookups
# 	pmo.reference_doctype = "Sales Order"
# 	pmo.reference_document_name = so.name
# 	pmo.save(ignore_permissions=True)

# 	return {"sales_order": so.name, "status": so.status}


@frappe.whitelist()
def get_medication_order_by_id(name):
	"""Fetch a single Patient Medication Order with its medication rows"""

	if not name:
		frappe.throw("Medication Order ID is required")

	# Check permissions
	if not frappe.has_permission("Patient Medication Order", "read", name):
		frappe.throw("Not permitted", frappe.PermissionError)

	doc = frappe.get_doc("Patient Medication Order", name)

	# Optional: enrich practitioner name (same as your list function)
	if doc.practitioner:
		doc.healthcare_practitioner_name = frappe.db.get_value(
			"Healthcare Practitioner",
			doc.practitioner,
			"practitioner_name"
		) or doc.practitioner

	return doc
@frappe.whitelist()
def create_sales_order_from_medication_order(name: str):
    """Create (or return existing) Sales Order for a Patient Medication Order.

    The Sales Order will be left in Draft state and linked back to the PMO.
    Also sets custom_base_reference/custom_base_reference_name on Sales Order
    and saves reference_doctype/reference_document_name on the PMO.
    """
    if not name:
        frappe.throw(_("Patient Medication Order name is required"))

    pmo = frappe.get_doc("Patient Medication Order", name)

    if pmo.docstatus != 1:
        frappe.throw(_("Only submitted Patient Medication Orders can create Sales Orders"))

    # If a Sales Order is already linked, just return it
    if getattr(pmo, "reference_doctype", None) == "Sales Order" and getattr(pmo, "reference_document_name", None):
        if frappe.db.exists("Sales Order", pmo.reference_document_name):
            so = frappe.get_doc("Sales Order", pmo.reference_document_name)
            return {"sales_order": so.name, "status": so.status}

    if not pmo.company:
        frappe.throw(_("Company is required on Patient Medication Order"))

    if not pmo.patient:
        frappe.throw(_("Patient is required on Patient Medication Order"))

    # Determine healthcare reference (Patient Visit or Inpatient Admission)
    ref_doctype = None
    ref_name = None
    if pmo.care_context == "Inpatient Admission" and pmo.inpatient_record:
        ref_doctype = "Inpatient Admission"
        ref_name = pmo.inpatient_record
    elif pmo.care_context == "Patient Visit" and pmo.patient_encounter:
        ref_doctype = "Patient Visit"
        ref_name = pmo.patient_encounter

    # Create Sales Order (draft)
    so = frappe.new_doc("Sales Order")
    so.company = pmo.company
    so.patient = pmo.patient
    so.customer = pmo.patient
    # Ensure transaction and delivery dates are set to pass validation
    so.transaction_date = nowdate()
    so.delivery_date = nowdate()
    if getattr(pmo, "patient_name", None):
        so.custom_patient_name = pmo.patient_name
    so.custom_patient = pmo.patient

    # Healthcare reference to context (visit/admission)
    if ref_doctype and ref_name:
        so.custom_reference_type = ref_doctype
        so.custom_reference_name = ref_name
        so.custom_base_reference = "Patient Medication Order"
        so.custom_base_reference_name = pmo.name

    # Base reference back to the PMO itself
    so.custom_base_reference = "Patient Medication Order"
    so.custom_base_reference_name = pmo.name

    # Track unique tax templates to avoid duplicates
    tax_templates_added = set()
    
    # Add one Sales Order Item per medication order row
    for row in pmo.get("medication_orders") or []:
        if not getattr(row, "drug", None):
            continue
        qty = flt(getattr(row, "quantity", 0)) or 1
        
        so.append(
            "items",
            {
                "item_code": row.drug,
                "qty": qty,
                "description": getattr(row, "drug_name", None) or row.drug,
            },
        )
        
        # Get tax information for this item
        tax_info = get_item_tax(row.drug, pmo.company)
        # frappe.throw(_("Tax info for item {0}: {1}").format(row.drug, tax_info))
        # If tax template found and not already added, add to taxes table
        if tax_info.get("tax_template") and tax_info["tax_template"] not in tax_templates_added:
            # Get tax account and rate
            tax_rate = tax_info.get("tax_rate", 0)
            tax_account = get_tax_account(tax_info["tax_template"])
            
            if tax_account:
                so.append("taxes", {
                    "charge_type": "On Net Total",
                    "account_head": tax_account,
                    "description": f"Tax: {tax_info['tax_template']}",
                    "rate": tax_rate,
                    "included_in_print_rate": 0,
                    "included_in_paid_amount": 0
                })
                tax_templates_added.add(tax_info["tax_template"])

    if not so.items:
        frappe.throw(_("No medication items found to create a Sales Order"))

    so.insert(ignore_permissions=True)
    # Keep as Draft – do NOT submit

    # Link back to PMO for future lookups
    pmo.reference_doctype = "Sales Order"
    pmo.reference_document_name = so.name
    pmo.save(ignore_permissions=True)

    return {"sales_order": so.name, "status": so.status}


def get_item_tax(item_code: str, company: str = None) -> dict:
    """
    Get tax information for an item based on its item tax template or item group.
    
    Args:
        item_code: The item code to get tax information for
        company: Optional company to check company-specific tax templates
    
    Returns:
        dict: Dictionary containing tax_template, tax_rate, and tax_category information
    """
    if not item_code:
        return {}
    
    item = frappe.get_cached_doc("Item", item_code)
    tax_info = {
        "tax_template": None,
        "tax_rate": None,
        "tax_category": None,
        "source": None  # 'item' or 'item_group'
    }
    
    # First check if item has a tax template directly
    if item.get("taxes"):
        # Get the first tax template from the item's taxes table
        # frappe.throw(_("Item {0} has taxes: {1}").format(item_code, item.taxes))
        for tax_row in item.taxes:
            if tax_row.item_tax_template:
                tax_info["tax_template"] = tax_row.item_tax_template
                tax_info["source"] = "item"
                break
    
    # If no tax template on item, check item group hierarchy
    if not tax_info["tax_template"] and item.item_group:
        tax_info = get_tax_from_item_group(item.item_group, tax_info)
    
    # If tax template found, get its rate and category
    if tax_info["tax_template"]:
        tax_template = frappe.get_cached_doc("Item Tax Template", tax_info["tax_template"])
        
        # Get the tax rate (assuming first tax in template)
        if tax_template.taxes:
            tax_info["tax_rate"] = tax_template.taxes[0].tax_rate
            
        # Get tax category if available
        if tax_template.get("tax_category"):
            tax_info["tax_category"] = tax_template.tax_category
    
    return tax_info


def get_tax_from_item_group(item_group: str, tax_info: dict = None) -> dict:
    """
    Recursively search item group hierarchy for tax template.
    
    Args:
        item_group: The item group name to check
        tax_info: Existing tax_info dict to update
    
    Returns:
        dict: Updated tax_info dictionary
    """
    if tax_info is None:
        tax_info = {
            "tax_template": None,
            "tax_rate": None,
            "tax_category": None,
            "source": None
        }
    
    # If we already found a tax template, return it
    if tax_info.get("tax_template"):
        return tax_info
    
    group = frappe.get_cached_doc("Item Group", item_group)
    
    # Check if current item group has tax template
    if group.get("taxes"):
        for tax_row in group.taxes:
            if tax_row.item_tax_template:
                tax_info["tax_template"] = tax_row.item_tax_template
                tax_info["source"] = f"item_group:{item_group}"
                break
    
    # If still no tax template and parent group exists, check parent
    if not tax_info.get("tax_template") and group.parent_item_group:
        return get_tax_from_item_group(group.parent_item_group, tax_info)
    
    return tax_info


def get_tax_account(tax_template: str) -> str:
    """
    Get the tax account head from the item tax template.
    
    Args:
        tax_template: The item tax template name
    
    Returns:
        str: The account head for the tax
    """
    try:
        tax_template_doc = frappe.get_cached_doc("Item Tax Template", tax_template)
        if tax_template_doc.taxes:
            # Return the account head from the first tax row
            return tax_template_doc.taxes[0].account_head
    except Exception as e:
        frappe.log_error(f"Error getting tax account for {tax_template}: {str(e)}")
    
    return None


@frappe.whitelist()
def get_medication_order_by_inpatient_or_encounter(inpatient_record=None, patient_encounter=None):
    """
    Fetch medication order for a specific inpatient record or patient encounter
    """
    if not inpatient_record and not patient_encounter:
        frappe.throw("Either Inpatient Record ID or Patient Encounter ID is required")

    filters = {}
    if inpatient_record:
        filters["inpatient_record"] = inpatient_record
    if patient_encounter:
        filters["patient_encounter"] = patient_encounter

    # Get the medication order linked to this inpatient record or encounter
    medication_orders = frappe.get_all(
        "Patient Medication Order",
        filters=filters,
        fields=["name"],
        order_by="creation desc",
        limit=1
    )

    if not medication_orders:
        frappe.msgprint("No medication order found")
        return None

    doc = frappe.get_doc("Patient Medication Order", medication_orders[0].name)

    # Enrich with practitioner name
    if doc.practitioner:
        doc.healthcare_practitioner_name = frappe.db.get_value(
            "Healthcare Practitioner",
            doc.practitioner,
            "practitioner_name"
        ) or doc.practitioner

    return doc


# In your patient_medication_order.py
@frappe.whitelist()
def update_medication_order():
    """Update an existing Patient Medication Order"""
    data = frappe.local.form_dict
    
    if not data.get('name'):
        frappe.throw("Medication Order ID is required")
    
    # Check permissions
    if not frappe.has_permission("Patient Medication Order", "write", data.get('name')):
        frappe.throw("Not permitted", frappe.PermissionError)
    
    # Get existing document
    doc = frappe.get_doc("Patient Medication Order", data.get('name'))
    
    # Update fields
    doc.company = data.get('company', doc.company)
    doc.start_date = data.get('start_date', doc.start_date)
    doc.practitioner = data.get('practitioner', doc.practitioner)
    doc.care_context = data.get('care_context', doc.care_context)
    
    if data.get('care_context') == 'Patient Visit':
        doc.patient_encounter = data.get('patient_encounter')
    else:
        doc.inpatient_record = data.get('inpatient_record')
    
    # Clear and update medication orders
    doc.set('medication_orders', [])
    for med in data.get('medication_orders', []):
        doc.append('medication_orders', {
            'drug': med.get('drug'),
            'dosage': med.get('dosage'),
            'dosage_form': med.get('dosage_form'),
            'date': med.get('date'),
            'end_date': med.get('end_date'),
            'no_of_days': med.get('no_of_days'),
            'instructions': med.get('instructions'),
            'patient_frequency': med.get('patient_frequency'),
            'route_of_administration': med.get('route_of_administration'),
            'reference_no': med.get('reference_no'),
            'is_pink': med.get('is_pink', 0),
            'is_prn': med.get('is_prn', 0),
            'is_long_acting': med.get('is_long_acting', 0),
            'long_acting_frequency': med.get('long_acting_frequency'),
            'medication_type': med.get('medication_type'),
        })
    
    doc.save(ignore_permissions=False)
    frappe.db.commit()
    
    return doc