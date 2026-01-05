# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _


@frappe.whitelist()
def get_service_requests(limit=50, offset=0, patient=None, template_dt=None, status=None):
	"""Get list of Service Requests"""
	filters = {'docstatus': ['!=', 2]} 
	
	if patient:
		filters['patient'] = patient

	
	if status:
		filters['status'] = status
	
	service_requests = frappe.get_all(
		'Service Request',
		filters=filters,
		fields=[
			'name',
			'patient',
			'patient_name',
			'practitioner',
			'template_dt',
			'template_dn',
			'status',
			'order_date',
			'order_time',
			'occurrence_date',
			'occurrence_time',
			'medical_department',
			'billing_status',
			'priority',
			'intent'
		],
		limit=limit,
		limit_start=offset,
		order_by='order_date desc, order_time desc'
	)
	print("here is me", service_requests)
	# frappe.throw(str(service_requests))
	# Get practitioner names and template names
	for sr in service_requests:
		if sr.practitioner:
			practitioner_name = frappe.db.get_value('Healthcare Practitioner', sr.practitioner, 'practitioner_name')
			sr['practitioner_name'] = practitioner_name or sr.practitioner
		
		if sr.template_dn:
			if sr.template_dt == 'Lab Test Template':
				template_name = frappe.db.get_value('Lab Test Template', sr.template_dn, 'lab_test_name')
				sr['template_name'] = template_name or sr.template_dn
			else:
				sr['template_name'] = sr.template_dn
	
	return service_requests


@frappe.whitelist()
def create_lab_test_from_service_request(service_request_name):
	"""Create a Lab Test from a Service Request"""
	if not service_request_name:
		frappe.throw(_("Service Request name is required"))
	
	existing_lab_test = frappe.db.get_value('Lab Test', {'service_request': service_request_name}, 'name')
	if existing_lab_test:
		frappe.throw(_("Lab Test {0} already exists for this Service Request").format(existing_lab_test))
	
	# Use the existing make_lab_test function
	from healthcare.healthcare.doctype.service_request.service_request import make_lab_test
	
	service_request = frappe.get_doc('Service Request', service_request_name)
	service_request_dict = service_request.as_dict()
	
	lab_test = make_lab_test(service_request_dict)
	lab_test.insert()
	frappe.db.commit()
	
	return {
		'name': lab_test.name,
		'patient': lab_test.patient,
		'patient_name': lab_test.patient_name,
		'template': lab_test.template,
		'lab_test_name': lab_test.lab_test_name,
		'status': lab_test.status
	}

