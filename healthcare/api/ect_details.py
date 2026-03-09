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
		"bp_2": data.get("bp_2") or None,
		"psychology_doctor": data.get("psychology_doctor") or None,
		"anaesthetic_doctor": data.get("anaesthetic_doctor") or None,
	})
	doc.insert()

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





