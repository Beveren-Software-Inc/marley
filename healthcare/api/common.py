# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _


@frappe.whitelist()
def get_medical_departments(search=None):
	"""Get list of Medical Departments"""
	filters = {}
	if search:
		filters['department'] = ['like', f'%{search}%']
  
	
	departments = frappe.get_all(
		'Medical Department',
		filters=filters,
		fields=['name', 'department'],
		limit=50,
		order_by='department'
	)
	
	return [{'name': d.name, 'label': d.department or d.name} for d in departments]


@frappe.whitelist()
def get_healthcare_practitioners(search=None, department=None):
	"""Get list of Healthcare Practitioners"""
	filters = {}
	if search:
		filters['practitioner_name'] = ['like', f'%{search}%']
	# if department:
	# 	filters['department'] = department
	
	practitioners = frappe.get_all(
		'Healthcare Practitioner',
		filters=filters,
		fields=['name', 'practitioner_name', 'department'],
		limit=50,
		order_by='practitioner_name'
	)
	return [{'name': p.name, 'label': p.practitioner_name or p.name, 'department': p.department} for p in practitioners]


@frappe.whitelist()
def get_service_unit_types(search=None):
	"""Get list of Healthcare Service Unit Types with inpatient occupancy"""
	filters = {'inpatient_occupancy': 1, 'allow_appointments': 0}
	
	service_unit_types = frappe.get_all(
		'Healthcare Service Unit Type',
		filters=filters,
		fields=['name', 'service_unit_type'],
		limit=50,
		order_by='service_unit_type'
	)
	
	if search:
		service_unit_types = [s for s in service_unit_types if search.lower() in (s.service_unit_type or '').lower()]
	
	return [{'name': s.name, 'label': s.service_unit_type or s.name} for s in service_unit_types]


@frappe.whitelist()
def get_nursing_checklist_templates(search=None):
	"""Get list of Nursing Checklist Templates"""
	filters = {}
	if search:
		filters['template_name'] = ['like', f'%{search}%']
	
	templates = frappe.get_all(
		'Nursing Checklist Template',
		filters=filters,
		fields=['name', 'title'],
		limit=50,
		order_by='title'
	)
	return [{'name': t.name, 'label': t.title or t.name} for t in templates]

