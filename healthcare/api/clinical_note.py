# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import nowdate


def _get_or_create_clinical_note_type(name: str | None) -> str | None:
	if not name:
		return None

	if not frappe.db.exists("Clinical Note Type", name):
		doc = frappe.get_doc({
			"doctype": "Clinical Note Type",
			"clinical_note_type": name,
		})
		# Use ignore_permissions so clinicians can create types on the fly
		doc.insert(ignore_permissions=True)

	return name


# @frappe.whitelist()
# def get_clinical_notes(limit=50, offset=0, patient=None, medical_role=None, clinical_note_type=None, note_type=None):
# 	"""Get list of Clinical Notes with optional filters"""
# 	filters = {}
	
# 	if patient:
# 		filters['patient'] = patient
	
# 	if medical_role:
# 		filters['medical_role'] = medical_role
# 	print("Clinical note",clinical_note_type )
# 	# if clinical_note_type:
# 	# 	filters['clinical_note_type'] = clinical_note_type
	
# 	if note_type:
# 		filters['note_type'] = note_type
	
# 	print("here nafikjal filters", filters)
# 	clinical_notes = frappe.get_all(
# 		'Clinical Note',
# 		filters=filters,
# 		fields=[
# 			'name',
# 			'patient',
# 			'posting_date',
# 			'practitioner',
# 			'user',
# 			'clinical_note_type',
# 			# 'note_type',
# 			'medical_role',
# 			'note',
# 			'reference_doc',
# 			'reference_name',
# 			'branch'
# 		],
# 		limit=limit,
# 		limit_start=offset,
# 		order_by='posting_date desc'
# 	)
@frappe.whitelist()
def get_clinical_notes(**kwargs):
	"""Get list of Clinical Notes with optional filters"""
	
	# Extract parameters from kwargs
	# Note: ref_doctype/ref_document used instead of reference_doctype/reference_document
	# because Frappe's request handler strips those reserved parameter names before
	# they reach the whitelisted function.
	limit = kwargs.get('limit', 50)
	offset = kwargs.get('offset', 0)
	patient = kwargs.get('patient')
	medical_role = kwargs.get('medical_role')
	clinical_note_type = kwargs.get('clinical_note_type')
	note_type = kwargs.get('note_type')
	reference_doctype = kwargs.get('ref_doctype')
	reference_document = kwargs.get('ref_document')
	
	filters = {}
	
	if patient:
		filters['patient'] = patient
	
	if medical_role:
		roles_to_filter = resolve_medical_role_filter(medical_role)
		if len(roles_to_filter) == 1:
			filters['medical_role'] = roles_to_filter[0]
		else:
			filters['medical_role'] = ['in', roles_to_filter]

	
	if clinical_note_type:
		filters['clinical_note_type'] = clinical_note_type
	
	# if note_type:
	#     filters['note_type'] = note_type
	
	if reference_doctype:
		filters['reference_doctype'] = reference_doctype
	
	if reference_document:
		filters['reference_document'] = reference_document
	
	print("Final filters:", filters)
	
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
			'medical_role',
			'note',
			'reference_doctype',
			'reference_document',
			'branch'
		],
		limit=int(limit),
		limit_start=int(offset),
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
		
		if note.medical_role:
			medical_role_name = frappe.db.get_value('Medical Role', note.medical_role, 'medical_role')
			if medical_role_name:
				note['medical_role_name'] = medical_role_name
		
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

	# Derive / ensure Clinical Note Type
	clinical_note_type = data.get('clinical_note_type') or data.get('note_type')
	clinical_note_type = _get_or_create_clinical_note_type(clinical_note_type)

	if not clinical_note_type:
		frappe.throw(_("Clinical Note Type is required"))

	# Determine reference doctype and document
	reference_doctype = None
	reference_document = None
	
	admission_no = data.get('admission_no')
	patient_visit = data.get('patient_visit')
	
	if admission_no:
		reference_doctype = 'Inpatient Admission'
		reference_document = admission_no
	elif patient_visit:
		reference_doctype = 'Patient Visit'
		reference_document = patient_visit
	# If neither is provided, we can still create the note without a reference
	
	doc = frappe.get_doc({
		'doctype': 'Clinical Note',
		'patient': patient,
		
		'clinical_note_type': clinical_note_type,
		'medical_role': data.get('medical_role'),
		'practitioner': data.get('practitioner'),
		'posting_date': data.get('posting_date') or nowdate(),
		'note': note,
		'reference_doctype': reference_doctype,
		'reference_document': reference_document,
	})

	doc.insert(ignore_permissions=True)

	return {
		'name': doc.name,
		'patient': doc.patient,
		'clinical_note_type': doc.clinical_note_type,
		'medical_role': doc.medical_role,
		'reference_doctype': doc.reference_doctype,
		'reference_document': doc.reference_document,
	}
 
 
def resolve_medical_role_filter(medical_role):
    """
    Resolve a medical role (parent or child) to the appropriate filter.
    Returns a list of role names to filter by.
    """
    if not medical_role:
        return []
    
    # Get child roles under this parent
    child_roles = frappe.get_all(
        'Medical Role',
        filters={'parent_medical_role': medical_role},
        pluck='name'
    )
    
    # If children exist, return them; otherwise return the original role
    return child_roles if child_roles else [medical_role]

