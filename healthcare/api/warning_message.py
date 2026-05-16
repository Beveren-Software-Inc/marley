# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from healthcare.api.utils.api_utility import get_next_transaction_number



@frappe.whitelist()
def get_warning_messages(
	limit=50,
	offset=0,
	patient=None,
	active_only=True,
	no_patient_scope=None,
):
	"""Get list of Warning Messages.

	:param no_patient_scope: When ``patient`` is not set: ``organisation`` = only
		organisation-level warnings (``type_of_warning`` = Organisation); ``all`` or
		omitted = legacy behaviour (every warning).
	"""
	filters = {}

	if patient:
		filters['patient'] = patient
	elif no_patient_scope and str(no_patient_scope).lower() in ('organisation', 'organization'):
		filters['type_of_warning'] = 'Organisation'

	if active_only:
		# Only get active warnings if there's an active field
		# For now, we'll get all warnings
		pass

	warnings = frappe.get_all(
		'Warning Message',
		filters=filters,
		fields=[
			'name',
			'patient',
			'posting_date',
			'practitioner',
			'warning',
			'reference_doc',
			'reference_name',
			'medical_role',
			'type_of_warning',
		],
		limit=limit,
		limit_start=offset,
		order_by='posting_date desc'
	)
	
	# Get patient names and practitioner names for each warning
	for warning in warnings:
		if warning.patient:
			patient_name = frappe.db.get_value('Patient', warning.patient, 'patient_name')
			warning['patient_name'] = patient_name or warning.patient
		
		if warning.practitioner:
			practitioner_name = frappe.db.get_value('Healthcare Practitioner', warning.practitioner, 'practitioner_name')
			warning['practitioner_name'] = practitioner_name or warning.practitioner
	
	return warnings


@frappe.whitelist()
def get_warning_message(name):
	"""Get single Warning Message by name"""
	if not name:
		frappe.throw(_("Warning Message name is required"))

	warning = frappe.get_doc('Warning Message', name)
	
	return {
		'name': warning.name,
		'patient': warning.patient,
		'patient_name': warning.patient_name if hasattr(warning, 'patient_name') else frappe.db.get_value('Patient', warning.patient, 'patient_name'),
		'posting_date': warning.posting_date,
		'practitioner': warning.practitioner,
		'practitioner_name': warning.practitioner_name if hasattr(warning, 'practitioner_name') else None,
		'warning': warning.warning,
		'reference_doc': warning.reference_doc,
		'reference_name': warning.reference_name,
		'medical_role': warning.medical_role,
		'type_of_warning': getattr(warning, 'type_of_warning', None) or 'Medical',
		'gender': warning.gender if hasattr(warning, 'gender') else None,
		'blood_group': warning.blood_group if hasattr(warning, 'blood_group') else None
	}


@frappe.whitelist()
def create_warning_message(data):
	"""Create a new Warning Message"""
	if isinstance(data, str):
		import json
		data = json.loads(data)
	
	wtype = (data.get('type_of_warning') or 'Medical').strip()
	if wtype not in ('Medical', 'Organisation'):
		wtype = 'Medical'

	if wtype == 'Medical' and not data.get('patient'):
		frappe.throw(_("Patient is required for medical warnings"))

	trans_no = get_next_transaction_number('Patient Medication Order', fieldname='trans_no')
	# Create the warning message
	warning = frappe.get_doc({
		'doctype': 'Warning Message',
			'trans_id': trans_no,
		'type_of_warning': wtype,
		'patient': data.get('patient') or None,
		'warning': data.get('warning', ''),
		'practitioner': data.get('practitioner'),
		'posting_date': data.get('posting_date') or frappe.utils.now(),
		'clinical_note_type': data.get('clinical_note_type'),
		'medical_role': data.get('medical_role')
	})
	
	warning.insert(ignore_permissions=True)
	
	# Return the created warning message
	patient_name = None
	if warning.patient:
		patient_name = frappe.db.get_value('Patient', warning.patient, 'patient_name') or warning.patient
	return {
		'name': warning.name,
		'patient': warning.patient,
		'patient_name': patient_name,
		'type_of_warning': warning.type_of_warning,
		'posting_date': warning.posting_date,
		'practitioner': warning.practitioner,
		'practitioner_name': warning.practitioner_name if warning.practitioner else None,
		'warning': warning.warning
	}

