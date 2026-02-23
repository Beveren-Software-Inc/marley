# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import nowdate


@frappe.whitelist()
def get_clinical_notes(limit=50, offset=0, patient=None, medical_role=None, clinical_note_type=None, note_type=None):
	"""Get list of Clinical Notes with optional filters"""
	filters = {}
	
	if patient:
		filters['patient'] = patient
	
	if medical_role:
		filters['medical_role'] = medical_role
	
	if clinical_note_type:
		filters['clinical_note_type'] = clinical_note_type
	
	if note_type:
		filters['note_type'] = note_type
	
	clinical_notes = frappe.get_all(
		'Clinical Note',
		filters=filters,
		fields=[
			'name',
			'patient',
			'posting_date',
			'practitioner',
			'user',
			'clinical_note_type',
			# 'note_type',
			'medical_role',
			'note',
			'reference_doc',
			'reference_name',
			'branch'
		],
		limit=limit,
		limit_start=offset,
		order_by='posting_date desc'
	)
	
	# Get patient names and practitioner names
	for note in clinical_notes:
		if note.patient:
			patient_name = frappe.db.get_value('Patient', note.patient, 'patient_name')
			if patient_name:
				note['patient_name'] = patient_name
		
		if note.practitioner:
			practitioner_name = frappe.db.get_value('Healthcare Practitioner', note.practitioner, 'practitioner_name')
			if practitioner_name:
				note['practitioner_name'] = practitioner_name
		
		# Get medical role name if exists
		if note.medical_role:
			medical_role_name = frappe.db.get_value('Medical Role', note.medical_role, 'medical_role')
			if medical_role_name:
				note['medical_role_name'] = medical_role_name
		
		# Get clinical note type name if exists
		if note.clinical_note_type:
			clinical_note_type_name = frappe.db.get_value('Clinical Note Type', note.clinical_note_type, 'clinical_note_type')
			if clinical_note_type_name:
				note['clinical_note_type_name'] = clinical_note_type_name
	
	return clinical_notes


@frappe.whitelist()
def create_clinical_note(data):
	"""Create a new Clinical Note (used for Diagnosis Detail etc.)"""
	if isinstance(data, str):
		import json
		data = json.loads(data)

	patient = data.get('patient')
	note = data.get('note')

	if not patient:
		frappe.throw(_("Patient is required"))
	if not note:
		frappe.throw(_("Note is required"))

	doc = frappe.get_doc({
		'doctype': 'Clinical Note',
		'patient': patient,
		'clinical_note_type': data.get('clinical_note_type'),
		'note_type': data.get('note_type'),
		'medical_role': data.get('medical_role'),
		'practitioner': data.get('practitioner'),
		'posting_date': data.get('posting_date') or nowdate(),
		'note': note,
	})

	doc.insert()

	return {
		'name': doc.name,
		'patient': doc.patient,
		'clinical_note_type': doc.clinical_note_type,
		'note_type': doc.note_type,
		'medical_role': doc.medical_role,
	}


