# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _


@frappe.whitelist()
def get_discharges(limit=50, offset=0, patient=None, admission=None, search=None):
	"""Get list of Discharge documents"""
	from healthcare.api.common import get_permitted_cost_centers
	filters = {}

	if patient:
		filters['file_no'] = patient

	if admission:
		filters['admission'] = admission

	if search and search.strip():
		filters['name'] = ['like', f'%{search.strip()}%']

	# ── Cost-centre User Permission enforcement ──────────────────────────────
	permitted_cc = get_permitted_cost_centers()
	if permitted_cc is not None:
		if not permitted_cc:
			return []
		filters['cost_center'] = ['in', permitted_cc]

	discharges = frappe.get_all(
		'Discharge',
		filters=filters,
		fields=[
			'name',
			'admission',
			'file_no',
			'patient_name',
			'discharge_date',
			'discharge_type',
			'discharged_by_user',
			'final_discharge_user_id',
			'receiving_doctors',
			'discharge_template',
			'docstatus',
			'cost_center',
		],
		limit=limit,
		limit_start=offset,
		order_by='discharge_date desc'
	)
	
	# Get patient names if not already set
	for discharge in discharges:
		if discharge.file_no and not discharge.patient_name:
			patient_name = frappe.db.get_value('Patient', discharge.file_no, 'patient_name')
			if patient_name:
				discharge['patient_name'] = patient_name
		
		# Get user names
		if discharge.discharged_by_user:
			user_name = frappe.db.get_value('User', discharge.discharged_by_user, 'full_name')
			if user_name:
				discharge['discharged_by_user_name'] = user_name
		
		if discharge.final_discharge_user_id:
			final_user_name = frappe.db.get_value('User', discharge.final_discharge_user_id, 'full_name')
			if final_user_name:
				discharge['final_discharge_user_name'] = final_user_name
		
		# Get practitioner name
		if discharge.receiving_doctors:
			practitioner_name = frappe.db.get_value('Healthcare Practitioner', discharge.receiving_doctors, 'practitioner_name')
			if practitioner_name:
				discharge['receiving_doctor_name'] = practitioner_name
		
		# Get template name
		if discharge.discharge_template:
			template_name = frappe.db.get_value('Discharge Template', discharge.discharge_template, 'template_name')
			if template_name:
				discharge['template_name'] = template_name
	
	return discharges





