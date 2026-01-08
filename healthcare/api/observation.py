# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _


@frappe.whitelist()
def get_observations(limit=50, offset=0, patient=None):
	"""Get list of Observations"""
	filters = {}
	
	if patient:
		filters['patient'] = patient
	
	observations = frappe.get_all(
		'Observation',
		filters=filters,
		fields=[
			'name',
			'patient',
			'patient_name',
			'observation_template',
			'observation_category',
			'status',
			'posting_date',
			'start_date',
			'dc_date',
			'healthcare_practitioner',
			'practitioner_name',
			'obs_code',
			'obs_level',
			'result_data',
			'result_text',
			'result_float',
			'result_select',
			'result_boolean',
			'result_datetime',
			'result_time',
			'medical_department',
			'admission_no'
		],
		limit=limit,
		limit_start=offset,
		order_by='posting_date desc, start_date desc'
	)
	
	# Get patient names and template names
	for obs in observations:
		if obs.patient and not obs.patient_name:
			patient_name = frappe.db.get_value('Patient', obs.patient, 'patient_name')
			if patient_name:
				obs['patient_name'] = patient_name
		
		if obs.observation_template:
			template_name = frappe.db.get_value('Observation Template', obs.observation_template, 'observation')
			if template_name:
				obs['template_name'] = template_name
		
		if obs.healthcare_practitioner and not obs.practitioner_name:
			practitioner_name = frappe.db.get_value('Healthcare Practitioner', obs.healthcare_practitioner, 'practitioner_name')
			if practitioner_name:
				obs['practitioner_name'] = practitioner_name
	
	return observations


@frappe.whitelist()
def create_observation(data):
	"""Create a new Observation"""
	if isinstance(data, str):
		import json
		data = json.loads(data)
	
	# Validate required fields
	if not data.get('patient'):
		frappe.throw(_("Patient is required"))
	
	if not data.get('observation_template'):
		frappe.throw(_("Observation Template is required"))
	
	# Get naming series
	naming_series = frappe.db.get_value('Observation', {'naming_series': 'HLC-OBS-.YYYY.-'}, 'naming_series')
	if not naming_series:
		naming_series = 'HLC-OBS-.YYYY.-'
	
	# Create the observation
	observation = frappe.get_doc({
		'doctype': 'Observation',
		'patient': data.get('patient'),
		'observation_template': data.get('observation_template'),
		'posting_date': data.get('posting_date') or frappe.utils.now_datetime(),
		'start_date': data.get('start_date') or frappe.utils.today(),
		'status': data.get('status') or 'Registered',
		'healthcare_practitioner': data.get('practitioner'),
		'medical_department': data.get('department'),
		'admission_no': data.get('admission_no'),
		'naming_series': naming_series
	})
	
	observation.insert()
	
	# Return the created observation
	return {
		'name': observation.name,
		'patient': observation.patient,
		'patient_name': frappe.db.get_value('Patient', observation.patient, 'patient_name') or observation.patient,
		'observation_template': observation.observation_template,
		'status': observation.status
	}




