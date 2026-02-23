# -*- coding: utf-8 -*-
# Copyright (c) 2020, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt


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
	entry.patient_frequency = row.get('patient_frequency')
	entry.is_pink = 1 if row.get('is_pink') else 0
	entry.reference_no = row.get('reference_no') or ''
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
	
	return {'name': doc.name}
