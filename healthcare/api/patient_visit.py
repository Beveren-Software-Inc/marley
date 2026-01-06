# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _


@frappe.whitelist()
def get_patient_visits(status=None, search=None):
	"""Get list of Patient Visits with optional status filter and search"""
	filters = {}
	if status:
		filters['status'] = status

	if search:
		# Search by visit name, patient name, file number, or practitioner
		visits = frappe.db.sql("""
			SELECT 
				pv.name,
				pv.patient,
				pv.patient_name,
				pv.status,
				pv.encounter_date,
				pv.encounter_time,
				pv.practitioner,
				pv.practitioner_name,
				pv.medical_department,
				pv.visit_type,
				pv.file_number,
				pv.inpatient_record
			FROM `tabPatient Visit` pv
			LEFT JOIN `tabPatient` p ON pv.patient = p.name
			WHERE 
				pv.name LIKE %(search)s
				OR pv.patient_name LIKE %(search)s
				OR pv.patient LIKE %(search)s
				OR p.file_no LIKE %(search)s
				OR pv.practitioner_name LIKE %(search)s
				OR pv.practitioner LIKE %(search)s
		""", {
			'search': f'%{search}%'
		}, as_dict=True)
		
		# Apply status filter if provided
		if status:
			visits = [v for v in visits if v.status == status]
		
		# Sort by encounter_date desc
		visits.sort(key=lambda x: x.encounter_date or '', reverse=True)
	else:
		visits = frappe.get_all(
			'Patient Visit',
			filters=filters,
			fields=[
				'name',
				'patient',
				'patient_name',
				'status',
				'encounter_date',
				'encounter_time',
				'practitioner',
				'practitioner_name',
				'medical_department',
				'visit_type',
				'file_number',
				'inpatient_record'
			],
			order_by='encounter_date desc, encounter_time desc'
		)

	return visits


@frappe.whitelist()
def get_patient_visit(name):
	"""Get single Patient Visit by name"""
	if not name:
		frappe.throw(_("Patient Visit name is required"))

	visit = frappe.get_doc('Patient Visit', name)
	
	return {
		'name': visit.name,
		'patient': visit.patient,
		'patient_name': visit.patient_name,
		'status': visit.status,
		'encounter_date': visit.encounter_date,
		'encounter_time': visit.encounter_time,
		'practitioner': visit.practitioner,
		'practitioner_name': visit.practitioner_name,
		'medical_department': visit.medical_department,
		'visit_type': visit.visit_type,
		'file_number': visit.file_number,
		'inpatient_record': visit.inpatient_record,
		'inpatient_status': visit.inpatient_status,
		'appointment': visit.appointment,
		'company': visit.company
	}






