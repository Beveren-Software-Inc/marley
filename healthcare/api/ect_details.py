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
			'max_bp_1',
			'bp_2',
			'max_bp2',
			'propofol_detail',
			'succinycholine_detail',
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


@frappe.whitelist()
def get_ect_admissions(limit=50, offset=0, patient=None):
	"""Get list of ECT Admission"""
	filters = {}

	if patient:
		filters['patient'] = patient

	admissions = frappe.get_all(
		'ECT Admission',
		filters=filters,
		fields=[
			'name',
			'patient',
			'patient_name',
			'date',
			'bp',
			'hr',
			'resp_rate',
			'spo2',
			'doctor',
			'doctors_name',
		],
		limit=limit,
		limit_start=offset,
		order_by='date desc, creation desc'
	)

	# Ensure patient_name populated
	for adm in admissions:
		if adm.get('patient') and not adm.get('patient_name'):
			patient_name = frappe.db.get_value('Patient', adm['patient'], 'patient_name')
			if patient_name:
				adm['patient_name'] = patient_name

	return admissions


@frappe.whitelist()
def get_ect_procedures(limit=50, offset=0, patient=None):
	"""Get list of ECT Procedure"""
	filters = {}

	if patient:
		filters['patient'] = patient

	procedures = frappe.get_all(
		'ECT Procedure',
		filters=filters,
		fields=[
			'name',
			'patient',
			'patient_name',
			'date',
			'date_of_session',
			'no_of_session',
			'bp',
			'hr',
			'resp_rate',
			'spo2',
			'energy',
			'consultant_doctor',
			'assistant_doctor',
			'anaesthetist',
		],
		limit=limit,
		limit_start=offset,
		order_by='date_of_session desc, creation desc'
	)

	# Ensure patient_name populated
	for proc in procedures:
		if proc.get('patient') and not proc.get('patient_name'):
			patient_name = frappe.db.get_value('Patient', proc['patient'], 'patient_name')
			if patient_name:
				proc['patient_name'] = patient_name

	return procedures


@frappe.whitelist()
def create_ect_detail(data):
	"""Create a new ECT Details record."""
	if isinstance(data, str):
		import json
		data = json.loads(data)

	if not data.get("patient"):
		frappe.throw(_("Patient is required"))

	doc = frappe.get_doc({
		"doctype": "ECT Details",
		"patient": data.get("patient"),
		"date": data.get("date") or frappe.utils.getdate(),
		"time": data.get("time") or frappe.utils.get_time(),
		"source": data.get("source") or None,
		"duration": data.get("duration"),
		"energy": data.get("energy") or None,
		"_age": data.get("_age"),
		"success": data.get("success") or None,
		"reference_doctype": data.get("reference_doctype") or None,
		"reference_name": data.get("reference_name") or None,
		"repeated": data.get("repeated") or None,
		"vitals": data.get("vitals") or None,
		"ecg": data.get("ecg") or None,
		"anathesiologist": data.get("anathesiologist") or None,
		"assist_doctor": data.get("assist_doctor") or None,
		"psychiatrist": data.get("psychiatrist") or None,
		"nurse": data.get("nurse") or None,
		"doctors_name": data.get("doctors_name") or None,
		"ect_doctors_notes": data.get("ect_doctors_notes") or None,
		"date_and_time": data.get("date_and_time") or None,
		"nurse_name": data.get("nurse_name") or None,
		"ect_nurse_notes": data.get("ect_nurse_notes") or None,
		"n_date_and_time": data.get("n_date_and_time") or None,
		"bp_1": data.get("bp_1") or None,
		"max_bp_1": data.get("max_bp_1") or None,
		"bp_2": data.get("bp_2") or None,
		"max_bp2": data.get("max_bp2") or None,
		"propofol_detail": data.get("propofol_detail") or None,
		"succinycholine_detail": data.get("succinycholine_detail") or None,
		"psychology_doctor": data.get("psychology_doctor") or None,
		"anaesthetic_doctor": data.get("anaesthetic_doctor") or None,
	})
	doc.insert(ignore_permissions=True)

	return {
		"name": doc.name,
		"patient": doc.patient,
		"patient_name": frappe.db.get_value("Patient", doc.patient, "patient_name"),
		"date": doc.date,
		"time": doc.time,
		"energy": doc.energy,
		"duration": doc.duration,
		"success": doc.success,
	}


@frappe.whitelist()
def create_ect_admission(data):
	"""Create a new ECT Admission record."""
	if isinstance(data, str):
		import json
		data = json.loads(data)

	if not data.get("patient"):
		frappe.throw(_("Patient is required"))

	doc = frappe.get_doc({
		"doctype": "ECT Admission",
		"patient": data.get("patient"),
		"patient_name": data.get("patient_name"),
		"date": data.get("date"),
		"bp": data.get("bp"),
		"hr": data.get("hr"),
		"resp_rate": data.get("resp_rate"),
		"spo2": data.get("spo2"),
		"psychiatric_diagnosis": data.get("psychiatric_diagnosis"),
		"medical_history": data.get("medical_history"),
		"patient_allergy_history": data.get("patient_allergy_history"),
		"other_complications": data.get("other_complications"),
		"instructions": data.get("instructions"),
		"doctor": data.get("doctor"),
		"doctors_name": data.get("doctors_name"),
	})
	doc.insert(ignore_permissions=True)

	return {
		"name": doc.name,
		"patient": doc.patient,
		"patient_name": doc.patient_name,
		"date": doc.date,
	}


@frappe.whitelist()
def create_ect_procedure(data):
	"""Create a new ECT Procedure record."""
	if isinstance(data, str):
		import json
		data = json.loads(data)

	if not data.get("patient"):
		frappe.throw(_("Patient is required"))

	doc = frappe.get_doc({
		"doctype": "ECT Procedure",
		"patient": data.get("patient"),
		"patient_name": data.get("patient_name"),
		"date": data.get("date"),
		"npo_since": data.get("npo_since"),
		"consultant_doctor": data.get("consultant_doctor"),
		"assistant_doctor": data.get("assistant_doctor"),
		"anaesthetist": data.get("anaesthetist"),
		"type_of_anaesthesia": data.get("type_of_anaesthesia"),
		"date_of_session": data.get("date_of_session"),
		"no_of_session": data.get("no_of_session"),
		"bp": data.get("bp"),
		"hr": data.get("hr"),
		"temp": data.get("temp"),
		"resp_rate": data.get("resp_rate"),
		"spo2": data.get("spo2"),
		"energy": data.get("energy"),
		"gtcs_for": data.get("gtcs_for"),
		"bp_after": data.get("bp_after"),
		"hr_after": data.get("hr_after"),
		"resp_rate_after": data.get("resp_rate_after"),
		"spo2_after": data.get("spo2_after"),
		"progress_plan": data.get("progress_plan"),
		"other_complications": data.get("other_complications"),
		"sign_date": data.get("sign_date"),
		"consultant_sign_date": data.get("consultant_sign_date"),
	})
	doc.insert(ignore_permissions=True)

	return {
		"name": doc.name,
		"patient": doc.patient,
		"patient_name": doc.patient_name,
		"date": doc.date,
	}





