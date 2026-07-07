# -*- coding: utf-8 -*-
# Copyright (c) 2020, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import re

import frappe
from frappe import _
from frappe.utils import flt, nowdate, getdate, add_days, cint, nowtime

from healthcare.api.utils.api_utility import get_next_transaction_number
from healthcare.api.sales_order_cost_center import (
	apply_cost_center_to_sales_order,
	cost_center_from_patient_medication_order,
)
from healthcare.healthcare.editing_lock import assert_editing_allowed

# Portal users read/write via whitelisted APIs; DocPerm on the doctype may not include Doctor.
PATIENT_MEDICATION_ORDER_PORTAL_ROLES = frozenset(
	{
		"Administrator",
		"System Manager",
		"Healthcare Administrator",
		"Doctor",
		"Nurse",
		"Physician",
		"Psychologist",
		"Anesthesiologist",
		"Therapist",
		"Nutritionist",
	}
)


def _user_can_access_patient_medication_order_portal() -> bool:
	if frappe.session.user in ("Guest", ""):
		return False
	return bool(PATIENT_MEDICATION_ORDER_PORTAL_ROLES & set(frappe.get_roles(frappe.session.user)))


def _ensure_pmo_read_permission(doc) -> None:
	if frappe.has_permission("Patient Medication Order", "read", doc=doc):
		return
	if _user_can_access_patient_medication_order_portal():
		return
	frappe.throw(_("Not permitted to read Patient Medication Order"), frappe.PermissionError)


def _ensure_pmo_write_permission(doc_or_name) -> None:
	if frappe.has_permission("Patient Medication Order", "write", doc=doc_or_name):
		return
	if _user_can_access_patient_medication_order_portal():
		return
	frappe.throw(_("Not permitted"), frappe.PermissionError)


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
	after_discharge=None,
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
		'inpatient_record', 'practitioner', 'user_name', 'posting_date', 'start_date', 'end_date',
		'status', 'total_orders', 'completed_orders', 'company',
		'reference_doctype', 'reference_document_name', 'cost_center',
		'new_system', 'doctors_signature',
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
		if after_discharge is not None:
			conditions.append('after_discharge = %(after_discharge)s')
			params['after_discharge'] = 1 if str(after_discharge).lower() in ['1', 'true', 'yes'] else 0

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

		if after_discharge is not None:
			filters.append(['after_discharge', '=', 1 if str(after_discharge).lower() in ['1', 'true', 'yes'] else 0])

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


def _normalize_long_acting_medication_row(row):
	"""Copy long acting frequency into patient_frequency and ensure Prescription Frequency exists."""
	if not isinstance(row, dict):
		return row
	row = dict(row)
	is_long = (
		row.get("is_long_acting_medicine")
		or row.get("is_long_acting")
		or (row.get("medication_type") or "").strip() == "Long Acting Medicine"
	)
	long_freq = (row.get("long_acting_frequency") or "").strip()
	if not is_long or not long_freq:
		return row
	from healthcare.api.common import ensure_prescription_frequency_for_long_acting

	ensure_prescription_frequency_for_long_acting(long_freq)
	row["patient_frequency"] = long_freq
	return row


def _set_medication_row(doc, row):
	"""Append one medication order row to doc. row is a dict with keys from Inpatient Medication Order Entry."""
	row = _normalize_long_acting_medication_row(row)
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
		entry.uom = (row.get('uom') or '').strip() or frappe.db.get_value('Item', entry.drug, 'stock_uom')
	if entry.patient_frequency:
		entry.frequency_in_a_day = frappe.db.get_value(
			'Prescription Frequency', entry.patient_frequency, 'frequency_in_a_day'
		) or 0
	else:
		entry.frequency_in_a_day = 0
	# Preserve user-entered quantity (quantity/qty); auto-calculate only when missing.
	quantity_input = row.get("quantity")
	if quantity_input in (None, ""):
		quantity_input = row.get("qty")
	if quantity_input not in (None, ""):
		entry.quantity = flt(quantity_input)
	else:
		# quantity = no_of_days * dosage * frequency_in_a_day (dosage as number if possible)
		dosage_val = flt(entry.dosage, 0) or 0
		entry.quantity = flt(entry.no_of_days, 0) * dosage_val * flt(entry.frequency_in_a_day, 0)
		if not entry.quantity:
			entry.quantity = flt(entry.no_of_days, 0)
	return entry


def _normalize_legacy_medicine_display_codes(doc):
	"""Ensure legacy child rows expose ITEM_00_01 code without Oracle zero-padding."""
	if not doc:
		return
	from healthcare.api.patient_medication_order_import import _resolve_item_00_01_name

	for row in doc.get("medication_orders") or []:
		if getattr(row, "drug", None):
			continue
		resolved = _resolve_item_00_01_name(
			getattr(row, "old_medicine_code", None) or getattr(row, "medicine_no", None)
		)
		if resolved:
			row.old_medicine_code = resolved
			row.medicine_no = resolved


def _apply_legacy_ip_admission_medicine_fallbacks(doc):
	"""Fill missing frequency/route on legacy PMO child rows from linked IP Admission Medicine."""
	if not doc:
		return
	cache: dict[str, dict] = {}
	for row in doc.get("medication_orders") or []:
		trans_num = (getattr(row, "trans_num", None) or "").strip()
		if not trans_num:
			continue
		if trans_num not in cache:
			cache[trans_num] = frappe.db.get_value(
				"IP Admission Medicine",
				trans_num,
				["frequency", "route"],
				as_dict=True,
			) or {}
		ip_med = cache.get(trans_num) or {}
		if not getattr(row, "patient_frequency", None) and ip_med.get("frequency"):
			row.patient_frequency = (ip_med.get("frequency") or "").strip()
		if not getattr(row, "written_frequency", None) and ip_med.get("frequency"):
			row.written_frequency = (ip_med.get("frequency") or "").strip()
		if not getattr(row, "route_of_administration", None) and ip_med.get("route"):
			row.route_of_administration = (ip_med.get("route") or "").strip()


def _cost_center_from_inpatient_admission(inpatient_record):
	"""Return cost center from Inpatient Admission (required for IP billing/list scoping)."""
	if not inpatient_record:
		return None
	cc = frappe.db.get_value("Inpatient Admission", inpatient_record, "cost_center")
	return (cc or "").strip() or None


def _invoice_for_sales_order(sales_order):
	"""Return linked Sales Invoice name, or the Sales Order when not yet invoiced."""
	if not sales_order:
		return None
	if frappe.db.exists("DocType", "Sales Invoice Item"):
		invoice = frappe.db.get_value("Sales Invoice Item", {"sales_order": sales_order}, "parent")
		if invoice:
			return invoice
	return sales_order


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
	after_discharge=None,
	doctors_signature=None,
	discharge_id=None,
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
	doc.trans_no = get_next_transaction_number('Patient Medication Order', fieldname='trans_no')
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
			['patient', 'patient_name', 'primary_practitioner', 'secondary_practitioner', 'cost_center'],
			as_dict=True,
		)
		if adm:
			doc.patient = adm.get('patient') or doc.patient
			doc.patient_name = adm.get('patient_name')
			if adm.get('cost_center'):
				doc.cost_center = adm.get('cost_center')
			if not practitioner and adm.get('primary_practitioner'):
				doc.practitioner = adm.primary_practitioner
			elif not practitioner and adm.get('secondary_practitioner'):
				doc.practitioner = adm.secondary_practitioner

	if practitioner:
		doc.practitioner = practitioner
	if after_discharge is not None and str(after_discharge).lower() in ("1", "true", "yes"):
		doc.after_discharge = 1
	if discharge_id and doc.meta.has_field("discharge_id"):
		doc.discharge_id = discharge_id
	if doctors_signature:
		doc.doctors_signature = doctors_signature
	doc.new_system = 1
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
	doc.submit()
	doc.reload()
	doc.set_status()
	doc.reload()

	# Create Long Acting Medicine for each medication row marked as long-acting
	_create_long_acting_medicine_for_entries(doc)

	return {'name': doc.name, 'status': doc.status}


def _long_acting_frequency_interval_days(frequency):
	"""Return interval in days for next run (Weekly=7, Biweekly=14, Monthly=30, etc.)."""
	if not frequency:
		return 7
	frequency = frequency.strip()
	interval = frappe.db.get_value("Long Acting Frequency", frequency, "interval_days")
	if interval:
		return cint(interval)
	m = {
		"Weekly": 7,
		"Biweekly": 14,
		"Monthly": 30,
		"Every 2 Months": 60,
		"Every 3 Months": 90,
	}
	return m.get(frequency, 7)


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
	"""Fetch a single Patient Medication Order with its medication rows."""

	if not name:
		frappe.throw(_("Medication Order ID is required"))

	if not frappe.db.exists("Patient Medication Order", name):
		frappe.throw(_("Patient Medication Order {0} not found").format(name))

	doc = frappe.get_doc("Patient Medication Order", name)
	_ensure_pmo_read_permission(doc)

	# Optional: enrich practitioner name (same as your list function)
	if doc.practitioner:
		doc.healthcare_practitioner_name = frappe.db.get_value(
			"Healthcare Practitioner",
			doc.practitioner,
			"practitioner_name"
		) or doc.practitioner
	_apply_legacy_ip_admission_medicine_fallbacks(doc)
	_normalize_legacy_medicine_display_codes(doc)

	if getattr(doc, "reference_doctype", None) == "Sales Order" and getattr(doc, "reference_document_name", None):
		doc.invoice = _invoice_for_sales_order(doc.reference_document_name)

	return doc


# Roles allowed to hold / continue / discontinue a prescribed drug (prescriber decision).
MEDICATION_ACTION_ROLES = frozenset(
	{"Administrator", "System Manager", "Healthcare Administrator", "Doctor", "Physician"}
)


@frappe.whitelist()
def set_medication_entry_status(order, entry, action, reason=None):
	"""Doctor action to Hold / Continue / Discontinue an individual prescribed drug.

	Rules (per drug, not the whole prescription):
	- Hold: active -> On Hold. Blocks the nurse from giving this drug. Reversible. Reason required.
	- Continue: On Hold -> active (usual). Re-enables giving. No reason required.
	- Discontinue: active/On Hold -> Discontinued. Doctor stopping the drug early. Reason required.
	- Discontinued is terminal: no further transitions are allowed.
	Every action is written to Medication Status Log (who/when via owner/creation).
	"""
	action = (action or "").strip().capitalize()
	if action not in ("Hold", "Continue", "Discontinue"):
		frappe.throw(_("Invalid action"))

	if not (MEDICATION_ACTION_ROLES & set(frappe.get_roles(frappe.session.user))):
		frappe.throw(_("Only a doctor can hold, continue or discontinue a medicine."), frappe.PermissionError)

	doc = frappe.get_doc("Patient Medication Order", order)
	_ensure_pmo_write_permission(doc)

	row = None
	for r in doc.get("medication_orders") or []:
		if r.name == entry:
			row = r
			break
	if not row:
		frappe.throw(_("Medication row not found on this prescription"))

	current = (row.get("medication_status") or "").strip()
	if current == "Discontinued":
		frappe.throw(_("This medicine has been discontinued and cannot be changed."))

	reason = (reason or "").strip()
	if action in ("Hold", "Discontinue") and not reason:
		frappe.throw(_("A reason is required to {0} this medicine.").format(action.lower()))

	if action == "Hold":
		if current == "On Hold":
			frappe.throw(_("This medicine is already on hold."))
		new_status = "On Hold"
	elif action == "Continue":
		if current != "On Hold":
			frappe.throw(_("Only a medicine that is on hold can be continued."))
		new_status = ""
	else:  # Discontinue
		new_status = "Discontinued"

	frappe.db.set_value("Inpatient Medication Order Entry", entry, "medication_status", new_status)

	log = frappe.new_doc("Medication Status Log")
	log.patient_medication_order = order
	log.medication_entry = entry
	log.patient = doc.get("patient")
	log.drug = row.get("drug")
	log.drug_name = row.get("drug_name")
	log.action = action
	log.new_status = new_status or "Active"
	log.reason = reason or None
	log.insert(ignore_permissions=True)

	return {"entry": entry, "medication_status": new_status, "action": action}


@frappe.whitelist()
def get_medication_status_log(order, entry=None):
	"""Return the Hold/Continue/Discontinue history for a prescription (optionally one drug row)."""
	filters = {"patient_medication_order": order}
	if entry:
		filters["medication_entry"] = entry
	return frappe.get_all(
		"Medication Status Log",
		filters=filters,
		fields=["name", "medication_entry", "drug", "drug_name", "action", "new_status", "reason", "owner", "creation"],
		order_by="creation desc",
	)


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

    # Determine healthcare reference (Patient Visit or Inpatient Admission) — same as Sales Invoice.custom_reference_*
    ref_doctype = None
    ref_name = None
    if pmo.care_context == "Inpatient Admission" and pmo.inpatient_record:
        ref_doctype = "Inpatient Admission"
        ref_name = pmo.inpatient_record
    elif pmo.care_context == "Patient Visit" and pmo.patient_encounter:
        ref_doctype = "Patient Visit"
        ref_name = pmo.patient_encounter
    elif pmo.inpatient_record:
        ref_doctype = "Inpatient Admission"
        ref_name = pmo.inpatient_record
    elif pmo.patient_encounter:
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

    if not ref_doctype or not ref_name:
        frappe.throw(
            _("Patient Medication Order {0} must be linked to a Patient Visit or Inpatient Admission to create a Sales Order.").format(
                pmo.name
            )
        )

    so.custom_reference_type = ref_doctype
    so.custom_reference_name = ref_name
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

    apply_cost_center_to_sales_order(
        so, cost_center_from_patient_medication_order(pmo, ref_doctype, ref_name)
    )

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
    _ensure_pmo_read_permission(doc)

    # Enrich with practitioner name
    if doc.practitioner:
        doc.healthcare_practitioner_name = frappe.db.get_value(
            "Healthcare Practitioner",
            doc.practitioner,
            "practitioner_name"
        ) or doc.practitioner
    _apply_legacy_ip_admission_medicine_fallbacks(doc)
    _normalize_legacy_medicine_display_codes(doc)

    return doc


@frappe.whitelist()
def save_medication_order_entry_stop_reason(
	patient_medication_order: str,
	order_entry_name: str,
	reason_stopped: str | None = None,
	clear: int | str | None = None,
):
	"""Set or clear ``reason_stopped`` on one Inpatient Medication Order Entry (child of Patient Medication Order).

	Used from the single-prescription UI. When not clearing, ``reason_stopped`` is required.
	Optionally sets ``stopped_date`` / ``stop_by`` when those columns exist.
	"""
	if not patient_medication_order or not order_entry_name:
		frappe.throw(_("Patient Medication Order and medication line are required"))

	_ensure_pmo_write_permission(patient_medication_order)

	parent = frappe.db.get_value("Inpatient Medication Order Entry", order_entry_name, "parent")
	if not parent or parent != patient_medication_order:
		frappe.throw(_("This medication line does not belong to the selected prescription."))

	clear_flag = clear is not None and str(clear).lower() in ("1", "true", "yes")

	if clear_flag:
		frappe.db.set_value("Inpatient Medication Order Entry", order_entry_name, "reason_stopped", "")
		if frappe.db.has_column("Inpatient Medication Order Entry", "stopped_date"):
			frappe.db.set_value("Inpatient Medication Order Entry", order_entry_name, "stopped_date", None)
		if frappe.db.has_column("Inpatient Medication Order Entry", "stop_by"):
			frappe.db.set_value("Inpatient Medication Order Entry", order_entry_name, "stop_by", None)
	else:
		reason = (reason_stopped or "").strip()
		if not reason:
			frappe.throw(_("Stop reason is required."))
		frappe.db.set_value("Inpatient Medication Order Entry", order_entry_name, "reason_stopped", reason)
		if frappe.db.has_column("Inpatient Medication Order Entry", "stopped_date"):
			frappe.db.set_value("Inpatient Medication Order Entry", order_entry_name, "stopped_date", nowdate())
		if frappe.db.has_column("Inpatient Medication Order Entry", "stop_by"):
			frappe.db.set_value("Inpatient Medication Order Entry", order_entry_name, "stop_by", frappe.session.user)

	frappe.db.commit()
	return {"ok": True}


# In your patient_medication_order.py
@frappe.whitelist()
def update_medication_order():
    """Update an existing Patient Medication Order"""
    assert_editing_allowed()
    data = frappe.local.form_dict
    
    if not data.get('name'):
        frappe.throw("Medication Order ID is required")
    
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

    if 'doctors_signature' in data:
        doc.doctors_signature = data.get('doctors_signature') or None
    
    # Clear and update medication orders
    doc.set('medication_orders', [])
    for med in data.get('medication_orders', []):
        if not med.get('drug'):
            continue
        _set_medication_row(doc, med)
    
    doc.save(ignore_permissions=True)
    doc.reload()
    doc.set_status()
    doc.reload()
    frappe.db.commit()
    
    return doc


@frappe.whitelist()
def sign_patient_medication_order(name, doctors_signature):
	"""Attach a doctor signature and move a new-system prescription to Signed status."""
	assert_editing_allowed()
	if not name:
		frappe.throw(_("Patient Medication Order name is required"))
	if not (doctors_signature or "").strip():
		frappe.throw(_("Doctor signature is required"))

	doc = frappe.get_doc("Patient Medication Order", name)
	_ensure_pmo_write_permission(doc)

	if doc.docstatus != 1:
		frappe.throw(_("Only submitted prescriptions can be signed"))

	doc.doctors_signature = doctors_signature
	if not cint(doc.new_system):
		doc.new_system = 1
	doc.save(ignore_permissions=True)
	doc.reload()
	doc.set_status()
	doc.reload()

	return {"name": doc.name, "status": doc.status, "doctors_signature": doc.doctors_signature}


# @frappe.whitelist()
# def get_after_discharge_prescriptions(patient, admission=None):
#     """
#     Get prescriptions created after discharge (during medicine transfer)
#     """
#     filters = {
#         'patient': patient,
#         'after_discharge': 1,
#         'docstatus': 1  # Submitted/Completed prescriptions only
#     }
    
#     # if admission:
#     #     filters['discharge_transfer'] = ['like', f'%{admission}%']
    
#     prescriptions = frappe.get_all(
#         'Patient Medication Order',
#         filters=filters,
#         fields=[
#             'name',
#             'patient',
#             'patient_name',
#             'posting_date',
#             # 'total_amount',
#             'after_discharge',
#             # 'discharge_transfer'
#         ],
#         order_by='creation desc'
#     )
    
#     # For each prescription, get the drug details
#     for pres in prescriptions:
#         drugs = frappe.get_all(
#             'Inpatient Medication Order Entry',
#             filters={'parent': pres.name},
#             fields=['drug', 'drug_name', 'dosage', 'quantity', 'rate', 'amount']
#         )
#         pres['drugs'] = drugs
    
#     return prescriptions

def get_item_rate(item_code):
    """
    Get the selling rate for an item.
    Tries standard_rate first, then selling_price (if field exists), then valuation_rate.
    Returns 0 if no rate found.
    """
    if not item_code:
        return 0

    rate = frappe.db.get_value("Item", item_code, "standard_rate")
    if rate:
        return flt(rate)

    item_meta = frappe.get_meta("Item")
    if item_meta.has_field("selling_price"):
        rate = frappe.db.get_value("Item", item_code, "selling_price")
        if rate:
            return flt(rate)

    rate = frappe.db.get_value("Item", item_code, "valuation_rate")
    if rate:
        return flt(rate)

    return 0


def get_item_rates_bulk(item_codes):
    """
    Get rates for multiple items at once.
    Returns a dictionary mapping item_code to rate.
    """
    if not item_codes:
        return {}
    
    # Remove duplicates and None values
    item_codes = list(set([code for code in item_codes if code]))
    
    rates = {}
    for code in item_codes:
        rates[code] = get_item_rate(code)
    
    return rates


@frappe.whitelist()
def get_after_discharge_prescriptions(patient, admission=None):
    """
    Get prescriptions created after discharge (during medicine transfer)
    """
    filters = {
        'patient': patient,
        'after_discharge': 1,
        'docstatus': 1
    }
    
    prescriptions = frappe.get_all(
        'Patient Medication Order',
        filters=filters,
        fields=[
            'name',
            'patient',
            'patient_name',
            'posting_date',
            'after_discharge',
        ],
        order_by='creation desc'
    )
    
    # For each prescription, get the drug details
    for pres in prescriptions:
        drugs = frappe.get_all(
            'Inpatient Medication Order Entry',
            filters={'parent': pres.name},
            fields=['drug', 'drug_name', 'dosage', 'quantity']
        )
        
        # Add rate and amount to each drug using the helper function
        for drug in drugs:
            drug['rate'] = get_item_rate(drug.get('drug'))
            drug['amount'] = (drug.get('quantity') or 0) * drug['rate']
        
        pres['drugs'] = drugs
    
    return prescriptions


@frappe.whitelist()
def get_item_rate_api(item_code):
    """
    API endpoint to get rate for a single item
    """
    return {'item_code': item_code, 'rate': get_item_rate(item_code)}


@frappe.whitelist()
def get_item_rates_api(item_codes):
    """
    API endpoint to get rates for multiple items
    """
    if isinstance(item_codes, str):
        import json
        item_codes = json.loads(item_codes)
    
    return get_item_rates_bulk(item_codes)



@frappe.whitelist()
def get_prescriptions_by_inpatient_record(inpatient_record: str):
    """
    Get all prescriptions for a specific inpatient admission
    """
    if not inpatient_record:
        frappe.throw(_("Inpatient record is required"))
    
    prescriptions = frappe.get_all(
        "Patient Medication Order",
        filters={
            "care_context": "Inpatient Admission",
            "inpatient_record": inpatient_record,
            "docstatus": 1
        },
        fields=["name", "patient", "patient_name", "status", "practitioner", "healthcare_practitioner_name"]
    )
    
    result = []
    for pres in prescriptions:
        # Get medication items
        doc = frappe.get_doc("Patient Medication Order", pres.name)
        medications = []
        for item in doc.medication_orders:
            from healthcare.api.medication_order_display import medication_entry_display_fields

            display = medication_entry_display_fields(
                item,
                parent_start_date=doc.start_date,
                parent_end_date=doc.end_date,
            )
            medications.append({
                "name": item.name,
                "drug": item.drug,
                "drug_name": frappe.get_cached_value("Item", item.drug, "item_name") if item.drug else "",
                "medication": getattr(item, "medication", None),
                "old_medicine_code": getattr(item, "old_medicine_code", None),
                "old_medicine_name": getattr(item, "old_medicine_name", None),
                "medicine_no": getattr(item, "medicine_no", None),
                "written_frequency": getattr(item, "written_frequency", None),
                "dosage": item.dosage,
                "dosage_form": item.dosage_form,
                "frequency": display["display_frequency"],
                "patient_frequency": item.patient_frequency,
                "period": item.no_of_days,
                "instructions": item.instructions,
                "date": item.date,
                "start_date": display["display_start_date"],
                "status": item.status if hasattr(item, 'status') else "Active",
                "display_drug_name": display["display_drug_name"],
                "display_dosage": display["display_dosage"],
                "is_legacy": display["is_legacy"],
            })
        
        result.append({
            "name": pres.name,
            "patient": pres.patient,
            "patient_name": pres.patient_name,
            "status": pres.status,
            "from_date": pres.from_date,
            "to_date": pres.to_date,
            "practitioner": pres.practitioner,
            "practitioner_name": pres.practitioner_name,
            "medications": medications
        })
    
    return result


@frappe.whitelist()
def update_medication_order_status(name: str, status: str):
    """
    Update medication order status
    """
    assert_editing_allowed()
    if not name:
        frappe.throw(_("Medication order name is required"))
    
    if status not in ['Active', 'Completed', 'Discontinued']:
        frappe.throw(_("Invalid status. Must be Active, Completed, or Discontinued"))
    
    doc = frappe.get_doc("Patient Medication Order", name)
    doc.status = status
    
    if status == 'Completed':
        doc.to_date = frappe.utils.today()
    
    doc.save(ignore_permissions=False)
    frappe.db.commit()
    
    return {
        "success": True,
        "message": f"Prescription {name} status updated to {status}"
    }


@frappe.whitelist()
def update_medication_order_entry(patient_medication_order, order_entry_name, updates):
    """Update a single medication order entry (child table row) in a Patient Medication Order.

    Args:
        patient_medication_order: Parent document name
        order_entry_name: Child table row name
        updates: JSON string or dict of field values to update
    """
    assert_editing_allowed()
    import json
    if isinstance(updates, str):
        updates = json.loads(updates)

    doc = frappe.get_doc("Patient Medication Order", patient_medication_order)
    entry = None
    for row in doc.get("medication_orders", []):
        if row.name == order_entry_name:
            entry = row
            break

    if not entry:
        frappe.throw(f"Medication order entry {order_entry_name} not found")

    allowed_fields = [
        "drug", "drug_name", "dosage", "uom", "dosage_form", "no_of_days",
        "instructions", "date", "end_date", "time", "patient_frequency",
        "route_of_administration", "reference_no", "is_pink", "is_prn",
        "is_long_acting_medicine", "long_acting_frequency", "medication_type",
        "frequency_in_a_day"
    ]

    for field, value in updates.items():
        if field in allowed_fields:
            entry.set(field, value)

    normalized = _normalize_long_acting_medication_row(entry.as_dict())
    if normalized.get("patient_frequency"):
        entry.patient_frequency = normalized["patient_frequency"]
        entry.frequency_in_a_day = frappe.db.get_value(
            "Prescription Frequency", entry.patient_frequency, "frequency_in_a_day"
        ) or 0

    doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {"ok": True, "entry": entry.as_dict()}


@frappe.whitelist()
def add_medication_order_entry(patient_medication_order, entry_data):
    """Add a new medication order entry to an existing Patient Medication Order.

    Args:
        patient_medication_order: Parent document name
        entry_data: JSON string or dict of new entry fields
    """
    import json
    if isinstance(entry_data, str):
        entry_data = json.loads(entry_data)

    entry_data = _normalize_long_acting_medication_row(entry_data)

    doc = frappe.get_doc("Patient Medication Order", patient_medication_order)

    new_entry = doc.append("medication_orders", {
        "drug": entry_data.get("drug"),
        "drug_name": entry_data.get("drug_name"),
        "dosage": entry_data.get("dosage"),
        "uom": entry_data.get("uom"),
        "dosage_form": entry_data.get("dosage_form"),
        "no_of_days": entry_data.get("no_of_days"),
        "instructions": entry_data.get("instructions"),
        "date": entry_data.get("date"),
        "end_date": entry_data.get("end_date"),
        "time": entry_data.get("time"),
        "patient_frequency": entry_data.get("patient_frequency"),
        "route_of_administration": entry_data.get("route_of_administration"),
        "reference_no": entry_data.get("reference_no"),
        "is_pink": entry_data.get("is_pink", 0),
        "is_prn": entry_data.get("is_prn", 0),
        "is_long_acting_medicine": entry_data.get("is_long_acting_medicine", 0),
        "long_acting_frequency": entry_data.get("long_acting_frequency"),
        "medication_type": entry_data.get("medication_type"),
    })

    doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {"ok": True, "entry": new_entry.as_dict(), "prescription": doc.name}


@frappe.whitelist()
def check_medicine_given_for_entry(patient_medication_order, order_entry_name):
    """Check if any medicine has been given for a specific medication order entry.

    Returns True if there's at least one Medicine Given record that references
    this medication order entry.
    """
    doc = frappe.get_doc("Patient Medication Order", patient_medication_order)
    entry = None
    for row in doc.get("medication_orders", []):
        if row.name == order_entry_name:
            entry = row
            break

    if not entry:
        return {"has_given": False}

    # Medicine Given is a child table of Admission Detail, linked via medication_order (PMO name)
    # and medicine_code (Item code). There is no direct link to the order entry row.
    admission = getattr(doc, "inpatient_record", None)
    if not admission:
        return {"has_given": False, "count": 0}

    admission_detail_name = frappe.db.get_value("Admission Detail", {"admission": admission}, "name")
    if not admission_detail_name:
        return {"has_given": False, "count": 0}

    # Primary check: match by PMO link and drug code on Medicine Given child rows
    count = frappe.db.count("Medicine Given", filters={
        "parent": admission_detail_name,
        "parenttype": "Admission Detail",
        "medication_order": patient_medication_order,
        "medicine_code": entry.drug,
    })

    if count == 0:
        # Fallback: match by drug code only (in case medication_order was not set on older rows)
        count = frappe.db.count("Medicine Given", filters={
            "parent": admission_detail_name,
            "parenttype": "Admission Detail",
            "medicine_code": entry.drug,
        })

    return {"has_given": count > 0, "count": count}


@frappe.whitelist()
def get_given_status_for_prescription(patient_medication_order):
    """Return given/not-given status for every medication order entry in a prescription.

    Returns a dict keyed by entry name with {has_given: bool, count: int}.
    Efficient batch version — does a single DB query for all Medicine Given rows.
    """
    doc = frappe.get_doc("Patient Medication Order", patient_medication_order)
    entries = doc.get("medication_orders", [])

    result = {}
    if not entries:
        return result

    admission = getattr(doc, "inpatient_record", None)
    if not admission:
        for row in entries:
            result[row.name] = {"has_given": False, "count": 0}
        return result

    admission_detail_name = frappe.db.get_value(
        "Admission Detail", {"admission": admission}, "name"
    )
    if not admission_detail_name:
        for row in entries:
            result[row.name] = {"has_given": False, "count": 0}
        return result

    given_rows = frappe.get_all(
        "Medicine Given",
        filters={
            "parent": admission_detail_name,
            "parenttype": "Admission Detail",
        },
        fields=["medicine_code", "medication_order"],
        ignore_permissions=True,
    )

    given_by_pmo_drug: dict[tuple, int] = {}
    given_by_drug: dict[str, int] = {}
    for g in given_rows:
        key = (g.get("medication_order") or "", g.get("medicine_code") or "")
        given_by_pmo_drug[key] = given_by_pmo_drug.get(key, 0) + 1
        drug = g.get("medicine_code") or ""
        if drug:
            given_by_drug[drug] = given_by_drug.get(drug, 0) + 1

    pmo_name = doc.name
    for row in entries:
        primary = given_by_pmo_drug.get((pmo_name, row.drug), 0)
        if primary > 0:
            result[row.name] = {"has_given": True, "count": primary}
        else:
            fallback = given_by_drug.get(row.drug, 0)
            result[row.name] = {"has_given": fallback > 0, "count": fallback}

    return result


def _resolve_sales_order_reference(pmo):
	"""Return (ref_doctype, ref_name) for healthcare context on Sales Order."""
	ref_doctype = None
	ref_name = None
	if pmo.care_context == "Inpatient Admission" and pmo.inpatient_record:
		ref_doctype = "Inpatient Admission"
		ref_name = pmo.inpatient_record
	elif pmo.care_context == "Patient Visit" and pmo.patient_encounter:
		ref_doctype = "Patient Visit"
		ref_name = pmo.patient_encounter
	elif pmo.inpatient_record:
		ref_doctype = "Inpatient Admission"
		ref_name = pmo.inpatient_record
	elif pmo.patient_encounter:
		ref_doctype = "Patient Visit"
		ref_name = pmo.patient_encounter
	return ref_doctype, ref_name


def _pharmacy_giveout_billing_groups_from_pmo(pmo):
	"""Build SO/DN billing groups with batch and dispensing lot from pharmacy give-out stock lines."""
	stock_lines = getattr(getattr(pmo, "flags", None), "pharmacy_giveout_item_stock", None) or []
	groups = []
	for idx, row in enumerate(pmo.get("medication_orders") or []):
		if not getattr(row, "drug", None):
			continue
		stock = stock_lines[idx] if idx < len(stock_lines) else {}
		groups.append(
			{
				"medicine_code": row.drug,
				"medicine_name": getattr(row, "drug_name", None) or row.drug,
				"qty": flt(getattr(row, "quantity", 0)) or 1,
				"batch_no": stock.get("batch_no"),
				"dispensing_lot": stock.get("dispensing_lot"),
			}
		)
	return groups


def _delivery_notes_for_sales_order(sales_order):
	"""Submitted Delivery Notes linked to a Sales Order."""
	if not sales_order:
		return []
	return frappe.db.sql_list(
		"""
		SELECT DISTINCT dn.name
		FROM `tabDelivery Note` dn
		INNER JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
		WHERE dni.against_sales_order = %s AND dn.docstatus = 1
		ORDER BY dn.creation DESC
		""",
		sales_order,
	)


def _cancel_delivery_notes_for_sales_order(sales_order):
	cancelled = []
	for dn_name in _delivery_notes_for_sales_order(sales_order):
		dn = frappe.get_doc("Delivery Note", dn_name)
		if dn.docstatus == 1:
			dn.cancel()
			cancelled.append(dn_name)
	return cancelled


def _apply_stock_to_sales_order_item_row(item_row, batch_no=None, dispensing_lot=None):
	"""Set batch and dispensing lot on a Sales Order item dict when fields exist."""
	batch_no = (batch_no or "").strip() or None
	dispensing_lot = (dispensing_lot or "").strip() or None
	if batch_no and frappe.get_meta("Sales Order Item").has_field("batch_no"):
		item_row["batch_no"] = batch_no
	if dispensing_lot:
		if frappe.db.has_column("Sales Order Item", "custom_dispensing_lot"):
			item_row["custom_dispensing_lot"] = dispensing_lot
		elif frappe.get_meta("Sales Order Item").has_field("serial_no"):
			serial_no = frappe.db.get_value("Dispensing Lot", dispensing_lot, "serial_no")
			if serial_no:
				item_row["serial_no"] = serial_no


def _append_sales_order_items_from_pmo(so, pmo, warehouse=None):
	"""Append Sales Order items (with rates/taxes) from PMO medication rows."""
	tax_templates_added = set()
	stock_lines = getattr(getattr(pmo, "flags", None), "pharmacy_giveout_item_stock", None) or []

	for idx, row in enumerate(pmo.get("medication_orders") or []):
		if not getattr(row, "drug", None):
			continue
		qty = flt(getattr(row, "quantity", 0)) or 1
		item_row = {
			"item_code": row.drug,
			"qty": qty,
			"description": getattr(row, "drug_name", None) or row.drug,
		}
		rate = flt(get_item_rate(row.drug))
		if rate:
			item_row["rate"] = rate
			item_row["price_list_rate"] = rate
		if warehouse:
			item_row["warehouse"] = warehouse
		stock = stock_lines[idx] if idx < len(stock_lines) else {}
		_apply_stock_to_sales_order_item_row(
			item_row,
			batch_no=stock.get("batch_no"),
			dispensing_lot=stock.get("dispensing_lot"),
		)
		so.append("items", item_row)

		tax_info = get_item_tax(row.drug, pmo.company)
		tax_template = tax_info.get("tax_template")
		if tax_template and tax_template not in tax_templates_added:
			tax_account = get_tax_account(tax_template)
			if tax_account:
				so.append(
					"taxes",
					{
						"charge_type": "On Net Total",
						"account_head": tax_account,
						"description": f"Tax: {tax_template}",
						"rate": tax_info.get("tax_rate", 0),
						"included_in_print_rate": 0,
						"included_in_paid_amount": 0,
					},
				)
				tax_templates_added.add(tax_template)

	if not so.items:
		frappe.throw(_("No medication items found to create a Sales Order"))


def _create_submitted_sales_order_for_pmo(pmo, cost_center=None, warehouse=None):
	"""Create and submit Sales Order for a submitted PMO; link back on PMO."""
	if pmo.docstatus != 1:
		frappe.throw(_("Only submitted Patient Medication Orders can create Sales Orders"))

	if getattr(pmo, "reference_doctype", None) == "Sales Order" and getattr(pmo, "reference_document_name", None):
		if frappe.db.exists("Sales Order", pmo.reference_document_name):
			so = frappe.get_doc("Sales Order", pmo.reference_document_name)
			return so

	if not pmo.company:
		frappe.throw(_("Company is required on Patient Medication Order"))
	if not pmo.patient:
		frappe.throw(_("Patient is required on Patient Medication Order"))

	ref_doctype, ref_name = _resolve_sales_order_reference(pmo)
	if not ref_doctype or not ref_name:
		frappe.throw(
			_("Patient Medication Order {0} must be linked to a Patient Visit or Inpatient Admission to create a Sales Order.").format(
				pmo.name
			)
		)

	customer = frappe.db.get_value("Patient", pmo.patient, "customer")
	if not customer:
		frappe.throw(
			_("Patient {0} has no Customer linked. Link a customer on the patient record first.").format(pmo.patient)
		)

	so = frappe.new_doc("Sales Order")
	so.company = pmo.company
	so.patient = pmo.patient
	so.customer = customer
	so.transaction_date = nowdate()
	so.delivery_date = nowdate()
	if getattr(pmo, "patient_name", None):
		so.custom_patient_name = pmo.patient_name
	so.custom_patient = pmo.patient
	so.custom_reference_type = ref_doctype
	so.custom_reference_name = ref_name
	so.custom_base_reference = "Patient Medication Order"
	so.custom_base_reference_name = pmo.name

	if warehouse and hasattr(so, "set_warehouse"):
		so.set_warehouse = warehouse

	if getattr(pmo, "nursing_pharmacy_giveout", 0) and hasattr(so, "reserve_stock"):
		so.reserve_stock = 0

	_append_sales_order_items_from_pmo(so, pmo, warehouse=warehouse)

	cc = cost_center or cost_center_from_patient_medication_order(pmo, ref_doctype, ref_name)
	apply_cost_center_to_sales_order(so, cc)

	so.insert(ignore_permissions=True)
	so.submit()

	pmo.reference_doctype = "Sales Order"
	pmo.reference_document_name = so.name
	pmo.save(ignore_permissions=True)

	return so


def _resolve_nursing_pharmacy_giveout_warehouse(inpatient_record, warehouse=None):
	"""Validate and resolve warehouse for pharmacy give-out from Healthcare Settings."""
	from healthcare.api.common import (
		get_pharmacy_giveout_warehouses,
		resolve_pharmacy_giveout_default_warehouse,
	)

	cost_center = frappe.db.get_value("Inpatient Admission", inpatient_record, "cost_center")
	allowed = get_pharmacy_giveout_warehouses()
	if not allowed:
		frappe.throw(
			_(
				"No Pharmacy Give Out warehouses configured in Healthcare Settings. "
				"Add warehouses under Stock → Pharmacy Give Out."
			)
		)

	allowed_names = {row["name"] for row in allowed}
	warehouse = (warehouse or "").strip() or None
	if warehouse:
		if warehouse not in allowed_names:
			frappe.throw(
				_("Warehouse {0} is not configured for Pharmacy Give Out in Healthcare Settings.").format(warehouse)
			)
		return warehouse

	default_wh, _allowed = resolve_pharmacy_giveout_default_warehouse(cost_center)
	if not default_wh:
		frappe.throw(
			_(
				"No Pharmacy Give Out warehouse could be resolved for cost center {0}. "
				"Configure Pharmacy Give Out warehouses in Healthcare Settings."
			).format(cost_center or _("(not set)"))
		)
	return default_wh


@frappe.whitelist()
def get_nursing_pharmacy_giveout_warehouses(inpatient_record):
	"""Warehouses allowed for nursing pharmacy give-out plus default (nurse mini warehouse when listed)."""
	if not _user_can_access_patient_medication_order_portal():
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if not inpatient_record:
		frappe.throw(_("Inpatient Admission is required"))
	if not frappe.db.exists("Inpatient Admission", inpatient_record):
		frappe.throw(_("Inpatient Admission {0} does not exist").format(inpatient_record))

	from healthcare.api.common import (
		get_pharmacy_giveout_warehouses,
		get_warehouse_for_cost_center,
		resolve_pharmacy_giveout_default_warehouse,
	)

	cost_center = frappe.db.get_value("Inpatient Admission", inpatient_record, "cost_center")
	warehouses = get_pharmacy_giveout_warehouses()
	default_warehouse, _allowed = resolve_pharmacy_giveout_default_warehouse(cost_center)
	mini_warehouse = get_warehouse_for_cost_center(cost_center) if cost_center else None

	return {
		"warehouses": warehouses,
		"default_warehouse": default_warehouse,
		"mini_warehouse": mini_warehouse,
	}


def _format_pharmacy_giveout_error(exc, warehouse=None):
	"""Turn stock/billing failures into readable portal messages."""
	raw = ""
	if isinstance(exc, frappe.ValidationError):
		raw = str(exc.args[0]) if exc.args else str(exc)
	else:
		raw = str(exc)

	raw = re.sub(r"<[^>]+>", " ", raw or "")
	raw = re.sub(r"\s+", " ", raw).strip()
	if not raw:
		return _("Pharmacy give-out could not be completed. Please try again.")

	wh_label = (warehouse or "").strip() or _("the selected warehouse")
	lower = raw.lower()

	if any(
		phrase in lower
		for phrase in (
			"negative stock",
			"not enough stock",
			"insufficient stock",
			"stock balance for batch",
			"qty must be less than or equal to",
		)
	):
		return _(
			"Not enough stock in {0} for one or more medicines. Check batch quantities or choose another warehouse."
		).format(wh_label)

	if "needed" in lower and "warehouse" in lower:
		return raw

	if "please select a batch" in lower:
		return _("Please select a batch for each medicine that requires batch tracking.")

	if "please select a dispensing lot" in lower:
		return _("Please select a dispensing lot for each medicine that requires lot tracking.")

	if "please select a lot number" in lower:
		return _("Please select a lot number for each serialized medicine.")

	if "traceback" in lower:
		for part in reversed(re.split(r"[.\n]", raw)):
			part = part.strip()
			if part and "traceback" not in part.lower() and len(part) > 8:
				return part

	return raw


@frappe.whitelist()
def create_nursing_pharmacy_giveout(
	patient,
	inpatient_record,
	medication_orders,
	source_prescription=None,
	practitioner=None,
	warehouse=None,
):
	"""Nursing pharmacy give-out: create PMO from edited prescription lines, bill via submitted Sales Order."""
	if not _user_can_access_patient_medication_order_portal():
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	if not patient:
		frappe.throw(_("Patient is required"))
	if not inpatient_record:
		frappe.throw(_("Inpatient Admission is required"))
	if not frappe.db.exists("Inpatient Admission", inpatient_record):
		frappe.throw(_("Inpatient Admission {0} does not exist").format(inpatient_record))

	if isinstance(medication_orders, str):
		import json

		medication_orders = json.loads(medication_orders)

	if not medication_orders or not isinstance(medication_orders, list):
		frappe.throw(_("At least one medication is required"))

	valid_rows = [row for row in medication_orders if row.get("drug")]
	if not valid_rows:
		frappe.throw(_("At least one medication with a drug is required"))

	admission_doc = frappe.get_doc("Inpatient Admission", inpatient_record)
	if admission_doc.patient and admission_doc.patient != patient:
		frappe.throw(_("Patient does not match the selected Inpatient Admission"))

	company = admission_doc.company or frappe.defaults.get_user_default("Company")
	if not company:
		frappe.throw(_("Company is required on Inpatient Admission {0}").format(inpatient_record))

	cost_center = _cost_center_from_inpatient_admission(inpatient_record)
	if not cost_center:
		frappe.throw(
			_("Cost Center is not set on Inpatient Admission {0}. Please set it on the admission record.").format(
				inpatient_record
			)
		)

	warehouse = _resolve_nursing_pharmacy_giveout_warehouse(inpatient_record, warehouse)

	try:
		return _create_nursing_pharmacy_giveout_documents(
			patient=patient,
			inpatient_record=inpatient_record,
			valid_rows=valid_rows,
			admission_doc=admission_doc,
			company=company,
			cost_center=cost_center,
			practitioner=practitioner,
			source_prescription=source_prescription,
			warehouse=warehouse,
		)
	except frappe.ValidationError as exc:
		frappe.throw(_format_pharmacy_giveout_error(exc, warehouse=warehouse), exc=exc)
	except Exception as exc:
		frappe.log_error(message=frappe.get_traceback(), title="Nursing pharmacy give-out failed")
		frappe.throw(_format_pharmacy_giveout_error(exc, warehouse=warehouse))


def _create_nursing_pharmacy_giveout_documents(
	patient,
	inpatient_record,
	valid_rows,
	admission_doc,
	company,
	cost_center,
	practitioner=None,
	source_prescription=None,
	warehouse=None,
):
	from healthcare.api.medicine_given import _validate_medicine_given_batch_lot

	start_date = nowdate()

	doc = frappe.new_doc("Patient Medication Order")
	doc.trans_no = get_next_transaction_number("Patient Medication Order", fieldname="trans_no")
	doc.patient = patient
	doc.care_context = "Inpatient Admission"
	doc.company = company
	doc.start_date = start_date
	doc.inpatient_record = inpatient_record
	doc.patient_name = admission_doc.patient_name
	doc.cost_center = cost_center
	if practitioner:
		doc.practitioner = practitioner
	elif admission_doc.get("primary_practitioner"):
		doc.practitioner = admission_doc.primary_practitioner
	elif admission_doc.get("secondary_practitioner"):
		doc.practitioner = admission_doc.secondary_practitioner

	doc.nursing_pharmacy_giveout = 1
	if source_prescription and frappe.db.exists("Patient Medication Order", source_prescription):
		doc.source_prescription = source_prescription
	doc.flags.pharmacy_giveout_item_stock = []
	for row in valid_rows:
		row = dict(row)
		if not row.get("date"):
			row["date"] = start_date
		row_time = (row.get("time") or "").strip()
		if not row_time or row_time in ("00:00:00", "00:00"):
			row["time"] = nowtime()
		if not row.get("quantity") and not row.get("qty"):
			row["quantity"] = 1
		drug = (row.get("drug") or "").strip()
		if drug:
			_validate_medicine_given_batch_lot(
				drug,
				inpatient_record,
				row.get("batch_no"),
				row.get("lot_no"),
				row.get("dispensing_lot"),
				warehouse=warehouse,
			)
		_set_medication_row(doc, row)
		doc.flags.pharmacy_giveout_item_stock.append(
			{
				"batch_no": (row.get("batch_no") or "").strip() or None,
				"dispensing_lot": (row.get("dispensing_lot") or "").strip() or None,
			}
		)

	if doc.medication_orders:
		last_dates = [r.date for r in doc.medication_orders if r.date]
		if last_dates:
			doc.end_date = max(last_dates)
		doc.completed_orders = len(doc.medication_orders)

	doc.insert(ignore_permissions=True)
	doc.submit()

	so = _create_submitted_sales_order_for_pmo(doc, cost_center=cost_center, warehouse=warehouse)

	from healthcare.api.nursing_inventory import _create_delivery_note_for_sales_order

	billing_groups = _pharmacy_giveout_billing_groups_from_pmo(doc)
	dn = _create_delivery_note_for_sales_order(
		so.name,
		patient,
		start_date,
		billing_groups,
		warehouse=warehouse,
	)

	frappe.db.commit()

	return {
		"patient_medication_order": doc.name,
		"sales_order": so.name,
		"sales_order_status": so.status,
		"delivery_note": dn.name,
		"delivery_note_status": dn.status,
		"pmo_status": frappe.db.get_value("Patient Medication Order", doc.name, "status"),
		"source_prescription": source_prescription,
	}


@frappe.whitelist()
def get_nursing_pharmacy_giveouts(
	limit=50,
	offset=0,
	patient=None,
	inpatient_record=None,
	from_date=None,
	to_date=None,
	search=None,
):
	"""List submitted Patient Medication Orders marked as nursing pharmacy give-out."""
	from healthcare.api.common import get_permitted_cost_centers

	if not _user_can_access_patient_medication_order_portal():
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	pmo_meta = frappe.get_meta("Patient Medication Order")
	if not pmo_meta.has_field("nursing_pharmacy_giveout"):
		return []

	limit = int(limit) if limit else 50
	offset = int(offset) if offset else 0

	fields = [
		"name",
		"patient",
		"patient_name",
		"posting_date",
		"start_date",
		"status",
		"inpatient_record",
		"reference_doctype",
		"reference_document_name",
		"total_orders",
	]
	if pmo_meta.has_field("source_prescription"):
		fields.append("source_prescription")

	conditions = ["docstatus = 1", "nursing_pharmacy_giveout = 1"]
	params = {}

	if patient:
		conditions.append("patient = %(patient)s")
		params["patient"] = patient
	if inpatient_record:
		conditions.append("inpatient_record = %(inpatient_record)s")
		params["inpatient_record"] = inpatient_record
	if from_date:
		conditions.append("posting_date >= %(from_date)s")
		params["from_date"] = from_date
	if to_date:
		conditions.append("posting_date <= %(to_date)s")
		params["to_date"] = to_date
	if search:
		conditions.append(
			"(name LIKE %(search)s OR patient_name LIKE %(search)s OR patient LIKE %(search)s)"
		)
		params["search"] = f"%{search}%"

	permitted_cc = get_permitted_cost_centers()
	if permitted_cc is not None:
		if not permitted_cc:
			return []
		placeholders = ", ".join(f"%(cc_{i})s" for i in range(len(permitted_cc)))
		for i, cc in enumerate(permitted_cc):
			params[f"cc_{i}"] = cc
		admission_placeholders = ", ".join(f"%(adm_cc_{i})s" for i in range(len(permitted_cc)))
		for i, cc in enumerate(permitted_cc):
			params[f"adm_cc_{i}"] = cc
		conditions.append(
			f"""(
				cost_center IN ({placeholders})
				OR (
					IFNULL(cost_center, '') = ''
					AND inpatient_record IN (
						SELECT name FROM `tabInpatient Admission`
						WHERE cost_center IN ({admission_placeholders})
					)
				)
			)"""
		)

	where_sql = " AND ".join(conditions)
	orders = frappe.db.sql(
		f"""
		SELECT {", ".join(fields)}
		FROM `tabPatient Medication Order`
		WHERE {where_sql}
		ORDER BY posting_date DESC, creation DESC
		LIMIT %(limit)s OFFSET %(offset)s
		""",
		{**params, "limit": limit, "offset": offset},
		as_dict=True,
	)

	child_dt = "Inpatient Medication Order Entry"
	for row in orders:
		row["sales_order"] = (
			row.get("reference_document_name")
			if row.get("reference_doctype") == "Sales Order"
			else None
		)
		row["invoice"] = _invoice_for_sales_order(row.get("sales_order"))
		entries = frappe.get_all(
			child_dt,
			filters={"parent": row.name},
			fields=["drug_name", "drug", "quantity"],
			limit=5,
			ignore_permissions=True,
		)
		row["medication_count"] = len(entries)
		labels = []
		for e in entries:
			label = (e.get("drug_name") or e.get("drug") or "").strip()
			qty = flt(e.get("quantity")) or 1
			if label:
				labels.append(f"{label} x{qty:g}")
		if row.get("total_orders") and row["total_orders"] > len(entries):
			labels.append("…")
		row["medications_summary"] = ", ".join(labels) if labels else ""

	return orders


def _sales_order_has_invoice(sales_order):
	"""True when a Sales Invoice is linked to the Sales Order."""
	if not sales_order:
		return False
	return bool(frappe.db.exists("Sales Invoice Item", {"sales_order": sales_order}))


@frappe.whitelist()
def cancel_nursing_pharmacy_giveout(name):
	"""Cancel a nursing pharmacy give-out PMO and its linked Sales Order when not invoiced."""
	if not name:
		frappe.throw(_("Give-out record name is required"))
	if not _user_can_access_patient_medication_order_portal():
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	if not frappe.db.exists("Patient Medication Order", name):
		frappe.throw(_("Patient Medication Order {0} does not exist").format(frappe.bold(name)))

	doc = frappe.get_doc("Patient Medication Order", name)
	_ensure_pmo_write_permission(doc)

	pmo_meta = frappe.get_meta("Patient Medication Order")
	if not pmo_meta.has_field("nursing_pharmacy_giveout") or not doc.get("nursing_pharmacy_giveout"):
		frappe.throw(_("This is not a nursing pharmacy give-out record"))

	if doc.docstatus != 1:
		frappe.throw(_("Only submitted give-out records can be cancelled"))

	from healthcare.api.common import get_permitted_cost_centers

	permitted_cc = get_permitted_cost_centers()
	if permitted_cc is not None:
		if not permitted_cc:
			frappe.throw(_("Not permitted"), frappe.PermissionError)
		cc = doc.get("cost_center")
		if not cc and doc.get("inpatient_record"):
			cc = _cost_center_from_inpatient_admission(doc.inpatient_record)
		if cc and cc not in permitted_cc:
			frappe.throw(_("Not permitted for this cost center"), frappe.PermissionError)

	sales_order = None
	if doc.get("reference_doctype") == "Sales Order" and doc.get("reference_document_name"):
		sales_order = doc.reference_document_name

	if sales_order and frappe.db.exists("Sales Order", sales_order):
		if _sales_order_has_invoice(sales_order):
			invoice = frappe.db.get_value(
				"Sales Invoice Item", {"sales_order": sales_order}, "parent"
			)
			frappe.throw(
				_(
					"This give-out is linked to Sales Invoice {0} and cannot be cancelled."
				).format(frappe.bold(invoice))
			)

		# Unlink PMO from SO before cancelling — Frappe blocks SO cancel while referenced.
		frappe.db.set_value(
			"Patient Medication Order",
			doc.name,
			{"reference_doctype": None, "reference_document_name": None},
			update_modified=False,
		)
		doc.reference_doctype = None
		doc.reference_document_name = None

		_cancel_delivery_notes_for_sales_order(sales_order)

		so = frappe.get_doc("Sales Order", sales_order)
		if so.docstatus == 1:
			so.cancel()

	if doc.docstatus == 1:
		doc.reload()
		doc.cancel()

	frappe.db.commit()
	return {"cancelled": name, "sales_order": sales_order}


@frappe.whitelist()
def delete_nursing_pharmacy_giveout(name):
	"""Deprecated alias — cancels the give-out record."""
	return cancel_nursing_pharmacy_giveout(name)