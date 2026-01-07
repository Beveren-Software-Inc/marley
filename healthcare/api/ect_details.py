# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _


@frappe.whitelist()
def get_ect_details(limit=50, offset=0, patient=None):
	"""Get list of ECT Details"""
	filters = {}
	
	if patient:
		filters['patient'] = patient
	
	ect_details = frappe.get_all(
		'ECT Details',
		filters=filters,
		fields=[
			'name',
			'patient',
			'date',
			'time',
			'source',
			'duration',
			'energy',
			'_age',
			'success',
			'repeated',
			'vitals',
			'ecg',
			'anathesiologist',
			'assist_doctor',
			'psychiatrist',
			'nurse',
			'doctors_name',
			'ect_doctors_notes',
			'date_and_time',
			'nurse_name',
			'ect_nurse_notes',
			'n_date_and_time',
			'bp_1',
			'bp_2',
			'psychology_doctor',
			'anaesthetic_doctor',
			'reference_doctype',
			'reference_name'
		],
		limit=limit,
		limit_start=offset,
		order_by='date desc, time desc'
	)
	
	# Get patient names
	for ect in ect_details:
		if ect.patient:
			patient_name = frappe.db.get_value('Patient', ect.patient, 'patient_name')
			if patient_name:
				ect['patient_name'] = patient_name
	
	return ect_details



