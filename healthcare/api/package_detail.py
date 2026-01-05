# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _


@frappe.whitelist()
def get_package_details(limit=50, offset=0, patient=None, admission_no=None):
	"""Get list of Package Details"""
	filters = {}
	
	if patient:
		filters['file_number'] = patient
	
	if admission_no:
		filters['admission_no'] = admission_no
	
	packages = frappe.get_all(
		'Package Detail',
		filters=filters,
		fields=[
			'name',
			'admission_no',
			'file_number',
			'patient_full_name',
			'patient_category',
			'from_date',
			'to_date',
			'total_days',
			'transaction_amount',
			'currency',
			'vch_status',
			'remarks',
			'company'
		],
		limit=limit,
		limit_start=offset,
		order_by='from_date desc'
	)
	
	# Get patient names if not already set
	for pkg in packages:
		if pkg.file_number and not pkg.patient_full_name:
			patient_name = frappe.db.get_value('Patient', pkg.file_number, 'patient_name')
			if patient_name:
				pkg['patient_full_name'] = patient_name
	
	return packages
