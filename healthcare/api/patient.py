# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _


@frappe.whitelist()
def get_patients(limit=50, offset=0, search=None):
	"""Get list of Patients with optional search"""
	filters = {}
	
	if search:
		# Search by patient name, file number, or ID number
		patients = frappe.db.sql("""
			SELECT name, patient_name, mobile, id_number, sex, dob, category
			FROM `tabPatient`
			WHERE 
				patient_name LIKE %(search)s
				OR name LIKE %(search)s
				OR id_number LIKE %(search)s
			ORDER BY patient_name
			LIMIT %(limit)s OFFSET %(offset)s
		""", {
			'search': f'%{search}%',
			'limit': limit,
			'offset': offset
		}, as_dict=True)
	else:
		patients = frappe.get_all(
			'Patient',
			filters=filters,
			fields=[
				'name',
				'patient_name',
				'mobile',
				'id_number',
				'sex',
				'dob',
				'category'
			],
			limit=limit,
			limit_start=offset,
			order_by='patient_name'
		)

	return patients


@frappe.whitelist()
def get_patient(name):
	"""Get single Patient by name"""
	if not name:
		frappe.throw(_("Patient name is required"))

	patient = frappe.get_doc('Patient', name)
	
	return {
		'name': patient.name,
		'patient_name': patient.patient_name,
		'first_name': patient.first_name,
		'middle_name': patient.middle_name,
		'last_name': patient.last_name,
		'sex': patient.sex,
		'dob': patient.dob,
		'blood_group': patient.blood_group,
		'mobile': patient.mobile,
		'phone': patient.phone,
		'email': patient.email,
		'id_number': patient.id_number,
		'nationality': patient.nationality,
		'category': patient.category
	}


@frappe.whitelist()
def create_patient(**kwargs):
	"""Create a new Patient"""
	# Handle both direct kwargs and data dict
	data = kwargs
	if 'data' in kwargs and isinstance(kwargs['data'], dict):
		data = kwargs['data']
	elif 'data' in kwargs and isinstance(kwargs['data'], str):
		import json
		data = json.loads(kwargs['data'])

	# Create new patient document
	patient = frappe.new_doc('Patient')
	
	# Set required fields
	if not data.get('first_name'):
		frappe.throw(_("First Name is required"))
	if not data.get('sex'):
		frappe.throw(_("Gender is required"))

	patient.first_name = data.get('first_name')
	patient.middle_name = data.get('middle_name', '')
	patient.last_name = data.get('last_name', '')
	patient.sex = data.get('sex')
	patient.dob = data.get('dob')
	patient.blood_group = data.get('blood_group')
	patient.mobile = data.get('mobile')
	patient.phone = data.get('phone')
	patient.email = data.get('email')
	patient.id_number = data.get('id_number')
	patient.nationality = data.get('nationality')
	patient.category = data.get('category', '')
	
	# Set required fields: Source and Marital Status
	if not data.get('source'):
		frappe.throw(_("Source is required"))
	if not data.get('marital_status'):
		frappe.throw(_("Marital Status is required"))
	
	patient.source = data.get('source')
	patient.marital_status = data.get('marital_status')

	# Save the patient
	patient.insert()
	frappe.db.commit()

	return {
		'success': True,
		'message': _('Patient created successfully'),
		'name': patient.name,
		'patient_name': patient.patient_name
	}


@frappe.whitelist()
def search_patients(query=None, limit=20):
	"""Search patients by name, file number, or ID number"""
	if not query:
		return []

	# Search by patient name, file number, or ID number
	patients = frappe.db.sql("""
		SELECT name, patient_name, mobile, id_number
		FROM `tabPatient`
		WHERE 
			patient_name LIKE %(query)s
			OR name LIKE %(query)s
			OR id_number LIKE %(query)s
		LIMIT %(limit)s
	""", {
		'query': f'%{query}%',
		'limit': limit
	}, as_dict=True)

	return patients
