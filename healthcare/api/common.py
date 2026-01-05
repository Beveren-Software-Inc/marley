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
		fields=['name', 'practitioner_name', 'department', 'medical_role'],
		limit=50,
		order_by='practitioner_name'
	)
	return [{'name': p.name, 'label': p.practitioner_name or p.name, 'department': p.department, 'medical_role': p.medical_role} for p in practitioners]


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


@frappe.whitelist()
def get_lead_sources(search=None):
	"""Get Lead Source options for dropdown"""
	filters = {}
	
	if search:
		filters['source_name'] = ['like', f'%{search}%']
	
	sources = frappe.get_all(
		'Lead Source',
		filters=filters,
		fields=['name', 'source_name'],
		limit=50,
		order_by='source_name'
	)
	
	return [{'name': s.name, 'label': s.source_name or s.name} for s in sources]


@frappe.whitelist()
def get_users(search=None):
	"""Get list of Users"""
	filters = {}
	if search:
		filters['full_name'] = ['like', f'%{search}%']
		# Also search by email
		users = frappe.db.sql("""
			SELECT name, full_name, email
			FROM `tabUser`
			WHERE 
				enabled = 1
				AND (full_name LIKE %(search)s OR email LIKE %(search)s OR name LIKE %(search)s)
			ORDER BY full_name
			LIMIT 50
		""", {
			'search': f'%{search}%'
		}, as_dict=True)
	else:
		users = frappe.get_all(
			'User',
			filters={**filters, 'enabled': 1},
			fields=['name', 'full_name', 'email'],
			limit=50,
			order_by='full_name'
		)
	
	return [{'name': u.name, 'label': u.full_name or u.email or u.name} for u in users]


@frappe.whitelist()
def get_discharge_templates(search=None):
	"""Get list of Discharge Templates"""
	filters = {}
	if search:
		filters['template_name'] = ['like', f'%{search}%']
	
	templates = frappe.get_all(
		'Discharge Template',
		filters=filters,
		fields=['name', 'template_name'],
		limit=50,
		order_by='template_name'
	)
	return [{'name': t.name, 'label': t.template_name or t.name} for t in templates]


@frappe.whitelist()
def get_lab_test_templates(search=None, department=None):
	"""Get list of Lab Test Templates"""
	filters = {'disabled': 0}  # Only get enabled templates
	if search:
		filters['lab_test_name'] = ['like', f'%{search}%']
	if department:
		filters['department'] = department
	
	templates = frappe.get_all(
		'Lab Test Template',
		filters=filters,
		fields=['name', 'lab_test_name', 'department'],
		limit=50,
		order_by='lab_test_name'
	)
	return [{'name': t.name, 'label': t.lab_test_name or t.name, 'department': t.department} for t in templates]


@frappe.whitelist()
def get_clinical_note_types(search=None):
	"""Get list of Clinical Note Types"""
	filters = {}
	if search:
		filters['clinical_note_type'] = ['like', f'%{search}%']
	
	note_types = frappe.get_all(
		'Clinical Note Type',
		filters=filters,
		fields=['name', 'clinical_note_type'],
		limit=50,
		order_by='clinical_note_type'
	)
	return [{'name': n.name, 'label': n.clinical_note_type or n.name} for n in note_types]


@frappe.whitelist()
def get_medical_roles(search=None):
	"""Get list of Medical Roles"""
	filters = {}
	if search:
		filters['medical_role'] = ['like', f'%{search}%']
	
	roles = frappe.get_all(
		'Medical Role',
		filters=filters,
		fields=['name', 'medical_role'],
		limit=50,
		order_by='medical_role'
	)
	return [{'name': r.name, 'label': r.medical_role or r.name} for r in roles]


@frappe.whitelist()
def get_practitioner_medical_role(practitioner):
	"""Get medical role from Healthcare Practitioner"""
	if not practitioner:
		return None
	
	medical_role = frappe.db.get_value('Healthcare Practitioner', practitioner, 'medical_role')
	return medical_role


@frappe.whitelist()
def get_observation_templates(search=None, department=None):
	"""Get list of Observation Templates"""
	filters = {}
	if search:
		filters['observation'] = ['like', f'%{search}%']
	if department:
		filters['medical_department'] = department
	
	templates = frappe.get_all(
		'Observation Template',
		filters=filters,
		fields=['name', 'observation', 'observation_category', 'medical_department'],
		limit=50,
		order_by='observation'
	)
	return [{'name': t.name, 'label': t.observation or t.name, 'category': t.observation_category, 'department': t.medical_department} for t in templates]


