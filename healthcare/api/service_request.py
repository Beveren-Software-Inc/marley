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
	if template_dt:
		filters['template_dt'] = template_dt
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
			'intent',
			'patient_accepted_cost',
			'booked',
			'order_group'
		],
		limit=limit,
		limit_start=offset,
		order_by='order_date desc, order_time desc'
	)
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
def create_lab_test_from_service_request(service_request):
	"""Create a Lab Test from a Service Request"""
	if not service_request:
		frappe.throw(_("Service Request name is required"))
	
	# Check if lab test already exists for this service request
	existing_lab_test = frappe.db.get_value('Lab Test', {'service_request': service_request}, 'name')
	if existing_lab_test:
		frappe.throw(_("Lab Test {0} already exists for this Service Request").format(existing_lab_test))
	
	# Use the existing make_lab_test function
	try:
		from healthcare.healthcare.doctype.service_request.service_request import make_lab_test
	except ImportError:
		frappe.throw(_("Could not import make_lab_test function"))
	
	service_request_doc = frappe.get_doc('Service Request', service_request)
	service_request_dict = service_request_doc.as_dict()
	
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


@frappe.whitelist()
def create_service_request(data):
	"""Create a new Service Request"""
	if isinstance(data, str):
		import json
		data = json.loads(data)
	
	# Validate required fields
	if not data.get('patient'):
		frappe.throw(_("Patient is required"))
	
	if not data.get('template_dt'):
		frappe.throw(_("Template Type is required"))
	
	if not data.get('template_dn'):
		frappe.throw(_("Template is required"))
	
	# Get naming series
	naming_series = frappe.db.get_value('Service Request', {'naming_series': 'HSR-'}, 'naming_series')
	if not naming_series:
		naming_series = 'HSR-'
	
	# Create the service request
	service_request = frappe.get_doc({
		'doctype': 'Service Request',
		'patient': data.get('patient'),
		'template_dt': data.get('template_dt'),
		'template_dn': data.get('template_dn'),
		'practitioner': data.get('practitioner'),
		'order_date': data.get('order_date') or frappe.utils.today(),
		'order_time': data.get('order_time') or frappe.utils.now_time(),
		'medical_department': data.get('department'),
		'status': data.get('status') or 'draft-Request Status',
		'priority': data.get('priority'),
		'intent': data.get('intent'),
		'quantity': data.get('quantity') or 1,
		'occurrence_date': data.get('occurrence_date'),
		'occurrence_time': data.get('occurrence_time'),
		'naming_series': naming_series
	})
	
	service_request.insert()
	
	# Get template name for response based on template_dt
	template_name = None
	if service_request.template_dn:
		if service_request.template_dt == 'Lab Test Template':
			template_name = frappe.db.get_value('Lab Test Template', service_request.template_dn, 'lab_test_name')
		elif service_request.template_dt == 'Clinical Procedure Template':
			template_name = frappe.db.get_value('Clinical Procedure Template', service_request.template_dn, 'procedure_name')
		elif service_request.template_dt == 'Observation Template':
			template_name = frappe.db.get_value('Observation Template', service_request.template_dn, 'observation')
		elif service_request.template_dt == 'Therapy Type':
			template_name = frappe.db.get_value('Therapy Type', service_request.template_dn, 'therapy_type')
		elif service_request.template_dt == 'Healthcare Activity':
			template_name = frappe.db.get_value('Healthcare Activity', service_request.template_dn, 'activity_type')
		else:
			template_name = service_request.template_dn
	
	# Get practitioner name if practitioner exists
	practitioner_name = None
	if service_request.practitioner:
		practitioner_name = frappe.db.get_value('Healthcare Practitioner', service_request.practitioner, 'practitioner_name')
	
	# Return the created service request
	return {
		'name': service_request.name,
		'patient': service_request.patient,
		'patient_name': service_request.patient_name or frappe.db.get_value('Patient', service_request.patient, 'patient_name'),
		'template_dt': service_request.template_dt,
		'template_dn': service_request.template_dn,
		'template_name': template_name or service_request.template_dn,
		'practitioner': service_request.practitioner,
		'practitioner_name': practitioner_name or service_request.practitioner if service_request.practitioner else None,
		'status': service_request.status,
		'order_date': service_request.order_date
	}


@frappe.whitelist()
def confirm_payment(service_request_name):
	"""Mark Service Request as payment confirmed (patient accepted cost). Required before Book Lab for Lab Test Template."""
	if not service_request_name:
		frappe.throw(_("Service Request name is required"))
	sr = frappe.get_doc("Service Request", service_request_name)
	if not sr:
		frappe.throw(_("Service Request not found"))
	sr.db_set("patient_accepted_cost", 1)
	frappe.db.commit()
	return {"ok": True, "patient_accepted_cost": 1}

