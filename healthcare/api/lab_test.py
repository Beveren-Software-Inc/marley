# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _


@frappe.whitelist()
def get_lab_tests(limit=50, offset=0, patient=None, status=None, pending_review=False):
	"""Get list of Lab Tests"""
	filters = {'docstatus': ['!=', 2]}  # Exclude cancelled
	
	if patient:
		filters['patient'] = patient
	
	if status:
		filters['status'] = status
	
	if pending_review:
		# Get lab tests that are completed but not yet reviewed/approved
		filters['status'] = ['in', ['Completed', 'Submitted']]
	
	lab_tests = frappe.get_all(
		'Lab Test',
		filters=filters,
		fields=[
			'name',
			'patient',
			'patient_name',
			'practitioner',
			'practitioner_name',
			'lab_test_name',
			'template',
			'status',
			'result_date',
			'submitted_date',
			'approved_date',
			'invoiced',
			'department'
		],
		limit=limit,
		limit_start=offset,
		order_by='submitted_date desc, result_date desc'
	)
	
	# Get patient names for each lab test
	for lab_test in lab_tests:
		if lab_test.patient:
			patient_name = frappe.db.get_value('Patient', lab_test.patient, 'patient_name')
			if not lab_test.patient_name:
				lab_test['patient_name'] = patient_name or lab_test.patient
		
		# Get practitioner name if not already set
		if lab_test.practitioner and not lab_test.practitioner_name:
			practitioner_name = frappe.db.get_value('Healthcare Practitioner', lab_test.practitioner, 'practitioner_name')
			lab_test['practitioner_name'] = practitioner_name or lab_test.practitioner
	
	return lab_tests


@frappe.whitelist()
def get_lab_test(name):
	"""Get single Lab Test by name"""
	if not name:
		frappe.throw(_("Lab Test name is required"))

	lab_test = frappe.get_doc('Lab Test', name)
	
	return {
		'name': lab_test.name,
		'patient': lab_test.patient,
		'patient_name': lab_test.patient_name,
		'practitioner': lab_test.practitioner,
		'practitioner_name': lab_test.practitioner_name if hasattr(lab_test, 'practitioner_name') else None,
		'lab_test_name': lab_test.lab_test_name,
		'template': lab_test.template,
		'status': lab_test.status,
		'result_date': lab_test.result_date,
		'submitted_date': lab_test.submitted_date,
		'approved_date': lab_test.approved_date if hasattr(lab_test, 'approved_date') else None,
		'invoiced': lab_test.invoiced,
		'department': lab_test.department
	}

