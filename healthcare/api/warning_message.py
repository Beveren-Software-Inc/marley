# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _


@frappe.whitelist()
def get_warning_messages(limit=50, offset=0, patient=None, active_only=True):
	"""Get list of Warning Messages"""
	filters = {}
	
	if patient:
		filters['patient'] = patient
	
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
			'medical_role'
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
		'gender': warning.gender if hasattr(warning, 'gender') else None,
		'blood_group': warning.blood_group if hasattr(warning, 'blood_group') else None
	}

