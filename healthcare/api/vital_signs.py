# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _


@frappe.whitelist()
def get_vital_signs(limit=50, offset=0, patient=None):
	"""Get list of Vital Signs"""
	filters = {}
	
	if patient:
		filters['patient'] = patient
	
	vital_signs = frappe.get_all(
		'Vital Signs',
		filters=filters,
		fields=[
			'name',
			'patient',
			'patient_name',
			'signs_date',
			'signs_time',
			'temperature',
			'pulse',
			'respiratory_rate',
			'bp_systolic',
			'bp_diastolic',
			'bp',
			'spo2',
			'height',
			'weight',
			'bmi',
			'vital_signs_note',
			'nutrition_note',
			'remarks',
			'inpatient_record',
			'admission_no',
			'appointment',
			'encounter'
		],
		limit=limit,
		limit_start=offset,
		order_by='signs_date desc, signs_time desc'
	)
	
	# Get patient names
	for vs in vital_signs:
		if vs.patient and not vs.patient_name:
			patient_name = frappe.db.get_value('Patient', vs.patient, 'patient_name')
			if patient_name:
				vs['patient_name'] = patient_name
	
	return vital_signs

