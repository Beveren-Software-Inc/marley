# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _


@frappe.whitelist()
def get_packages_by_admission(admission_no):
	"""Get all Package Details for an Inpatient Record"""
	if not admission_no:
		frappe.throw(_("Admission No is required"))

	packages = frappe.get_all(
		'Package Detail',
		filters={'admission_no': admission_no},
		fields=[
			'name',
			'admission_no',
			'from_date',
			'to_date',
			'total_days',
			'transaction_amount',
			'currency',
			'vch_status',
			'remarks'
		],
		order_by='from_date desc'
	)

	return packages








