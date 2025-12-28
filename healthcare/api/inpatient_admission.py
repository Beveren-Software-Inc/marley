# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _

try:
	from erpnext import get_default_currency
except ImportError:
	# Fallback if erpnext is not available
	def get_default_currency():
		return frappe.db.get_single_value('Global Defaults', 'default_currency') or 'BHD'


@frappe.whitelist()
def get_inpatient_records(status=None):
	"""Get list of Inpatient Records with optional status filter"""
	filters = {}
	if status:
		filters['status'] = status

	records = frappe.get_all(
		'Inpatient Admission',
		filters=filters,
		fields=[
			'name',
			'patient',
			'patient_name',
			'status',
			'scheduled_date',
			'admitted_datetime',
			'expected_discharge',
			'admission_service_unit_type',
			'medical_department',
			'primary_practitioner',
			'secondary_practitioner',
			'admission_encounter'
		],
		order_by='scheduled_date desc'
	)

	return records


@frappe.whitelist()
def get_inpatient_record(name):
	"""Get single Inpatient Record by name"""
	if not name:
		frappe.throw(_("Inpatient Record name is required"))

	record = frappe.get_doc('Inpatient Admission', name)
	
	return {
		'name': record.name,
		'patient': record.patient,
		'patient_name': record.patient_name,
		'status': record.status,
		'scheduled_date': record.scheduled_date,
		'admitted_datetime': record.admitted_datetime,
		'expected_discharge': record.expected_discharge,
		'admission_service_unit_type': record.admission_service_unit_type,
		'medical_department': record.medical_department,
		'primary_practitioner': record.primary_practitioner,
		'secondary_practitioner': record.secondary_practitioner,
		'admission_encounter': record.admission_encounter
	}


@frappe.whitelist()
def get_package_details(admission_no):
	"""Get Package Details for an Inpatient Record"""
	if not admission_no:
		frappe.throw(_("Admission No is required"))

	# Get company from Inpatient Record
	inpatient_record = frappe.get_doc('Inpatient Admission', admission_no)
	company = inpatient_record.company if hasattr(inpatient_record, 'company') and inpatient_record.company else frappe.defaults.get_user_default("Company")
	
	# Get company default currency
	default_currency = frappe.db.get_value('Company', company, 'default_currency') if company else None
	if not default_currency:
		# Fallback to system default currency
		from erpnext import get_default_currency
		default_currency = get_default_currency() or 'BHD'

	packages = frappe.get_all(
		'Package Detail',
		filters={'admission_no': admission_no},
		fields=[
			'name',
			'admission_no',
			'from_date',
			'to_date',
			'total_days',
			'transaction_amount',
			'currency',
			'vch_status',
			'remarks'
		]
	)

	# Return packages with default currency info
	# If packages exist, they should have currency set, but we provide default for frontend use
	return {
		'packages': packages,
		'default_currency': default_currency
	}


@frappe.whitelist()
def get_service_units(service_unit_type=None, occupancy_status=None):
	"""Get Healthcare Service Units with optional filters"""
	filters = {}
	if service_unit_type:
		filters['service_unit_type'] = service_unit_type
	if occupancy_status:
		filters['occupancy_status'] = occupancy_status

	units = frappe.get_all(
		'Healthcare Service Unit',
		filters=filters,
		fields=[
			'name',
			'service_unit_name',
			'service_unit_type',
			'occupancy_status',
			'company'
		]
	)

	return units


@frappe.whitelist()
def admit_patient(name, service_unit, check_in, expected_discharge=None):
	"""Admit a patient - wrapper for the DocType method"""
	if not name:
		frappe.throw(_("Inpatient Record name is required"))
	if not service_unit:
		frappe.throw(_("Service Unit is required"))
	if not check_in:
		frappe.throw(_("Check In datetime is required"))

	record = frappe.get_doc('Inpatient Admission', name)
	record.admit(service_unit, check_in, expected_discharge)
	frappe.db.commit()

	return {
		'success': True,
		'message': _('Patient admitted successfully'),
		'name': record.name
	}

