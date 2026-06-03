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
			'trans_no',
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


@frappe.whitelist()
def create_vital_sign(data):
	"""Create a new Vital Signs record"""
	if isinstance(data, str):
		import json
		data = json.loads(data)

	# trans_no is server-assigned only (autoname: field:trans_no)
	data.pop("trans_no", None)
	data.pop("name", None)

	inpatient_record = data.get('inpatient_record') or data.get('admission_no')
	encounter = data.get('encounter') or data.get('patient_visit')
	patient = data.get('patient')

	if not patient and not inpatient_record and not encounter:
		frappe.throw(_("Patient, Inpatient Admission, or Patient Visit is required"))

	# Default date and time if not provided
	signs_date = data.get('signs_date') or frappe.utils.today()
	signs_time = data.get('signs_time') or frappe.utils.nowtime()

	# Ensure time has seconds for Time field
	if isinstance(signs_time, str) and len(signs_time) == 5:
		signs_time = f"{signs_time}:00"

	doc = frappe.get_doc({
		'doctype': 'Vital Signs',
		'patient': patient,
		'signs_date': signs_date,
		'signs_time': signs_time,
		'temperature': data.get('temperature'),
		'pulse': data.get('pulse'),
		'respiratory_rate': data.get('respiratory_rate'),
		'bp_systolic': data.get('bp_systolic'),
		'bp_diastolic': data.get('bp_diastolic'),
		'spo2': data.get('spo2'),
		'height': data.get('height'),
		'weight': data.get('weight'),
		'vital_signs_note': data.get('vital_signs_note'),
		'nutrition_note': data.get('nutrition_note'),
		'remarks': data.get('remarks'),
		'inpatient_record': inpatient_record,
		'appointment': data.get('appointment'),
		'encounter': encounter,
		'company': data.get('company'),
		'branch': data.get('branch'),
	})

	doc.insert(ignore_permissions=True)

	return {
		'name': doc.name,
		'trans_no': doc.trans_no,
		'patient': doc.patient,
		'patient_name': frappe.db.get_value('Patient', doc.patient, 'patient_name') or doc.patient,
		'signs_date': doc.signs_date,
		'signs_time': doc.signs_time,
		'temperature': doc.temperature,
		'pulse': doc.pulse,
		'respiratory_rate': doc.respiratory_rate,
		'bp_systolic': doc.bp_systolic,
		'bp_diastolic': doc.bp_diastolic,
		'bp': doc.bp,
		'spo2': doc.spo2,
		'height': doc.height,
		'weight': doc.weight,
		'bmi': doc.bmi,
	}





