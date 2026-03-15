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
):
	"""Get list of Patient Medication Orders for Prescription listing.
	Supports filters: patient, status, search (name/patient name), practitioner, from_date, to_date.
	"""
	limit = int(limit) if limit else 50
	offset = int(offset) if offset else 0
	use_sql = bool(search or practitioner or from_date or to_date)

	fields = [
		'name', 'patient', 'patient_name', 'care_context', 'patient_encounter',
		'inpatient_record', 'practitioner', 'posting_date', 'start_date', 'end_date',
		'status', 'total_orders', 'completed_orders', 'company',
		'reference_doctype', 'reference_document_name',
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
		if from_date:
			conditions.append('posting_date >= %(from_date)s')
			params['from_date'] = from_date
		if to_date:
			conditions.append('posting_date <= %(to_date)s')
			params['to_date'] = to_date

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
	entry.reference_no = row.get('reference_no') or ''
	entry.route_of_administration = row.get('route_of_administration') or ''
	entry.is_long_acting_medicine = 1 if row.get('is_long_acting_medicine') or row.get('is_long_acting') else 0
	entry.long_acting_frequency = (row.get('long_acting_frequency') or '').strip() or None
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
	doc.submit()

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
		if not getattr(entry, 'is_long_acting_medicine', 0):
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
	so.delivery_date = nowdate()#pmo.end_date or pmo.start_date or nowdate()
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

	if not so.items:
		frappe.throw(_("No medication items found to create a Sales Order"))

	so.insert(ignore_permissions=True)
	# Keep as Draft – do NOT submit

	# Link back to PMO for future lookups
	pmo.reference_doctype = "Sales Order"
	pmo.reference_document_name = so.name
	pmo.save(ignore_permissions=True)

	return {"sales_order": so.name, "status": so.status}
