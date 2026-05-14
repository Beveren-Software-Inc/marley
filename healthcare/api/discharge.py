# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _




@frappe.whitelist()
def get_discharges(limit=20, offset=0, patient=None, admission=None, search=None, from_date=None, to_date=None, status=None, discharge_type=None):
	"""Get list of Discharge documents with pagination.
	Returns { data: [...], total_count: N }
	"""
	from frappe.utils import cint
	from healthcare.api.common import get_permitted_cost_centers

	limit = cint(limit) or 20
	offset = cint(offset) or 0
	filters = {}

	if patient:
		filters['file_no'] = patient

	if admission:
		filters['admission'] = admission

	if search and search.strip():
		filters['name'] = ['like', f'%{search.strip()}%']

	if from_date and to_date:
		filters['discharge_date'] = ['between', [from_date, to_date]]
	elif from_date:
		filters['discharge_date'] = ['>=', from_date]
	elif to_date:
		filters['discharge_date'] = ['<=', to_date]

	if status:
		docstatus_map = {'Draft': 0, 'Submitted': 1, 'Cancelled': 2}
		if status in docstatus_map:
			filters['docstatus'] = docstatus_map[status]

	if discharge_type:
		filters['discharge_type'] = discharge_type

	# ── Cost-centre User Permission enforcement ──────────────────────────────
	permitted_cc = get_permitted_cost_centers()
	if permitted_cc is not None:
		if not permitted_cc:
			return {"data": [], "total_count": 0}
		filters['cost_center'] = ['in', permitted_cc]

	total_count = len(frappe.get_all(
		'Discharge',
		filters=filters,
		fields=['name'],
		limit=0,
	))

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
		
		# Get admission date from the linked Inpatient Record
		if discharge.admission:
			admission_date = frappe.db.get_value('Inpatient Admission', discharge.admission, 'admitted_datetime')
			if admission_date:
				discharge['admission_date'] = admission_date
	
	return {"data": discharges, "total_count": total_count}