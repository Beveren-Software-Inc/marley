# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _


@frappe.whitelist()
def get_inpatient_packages(category=None, active_only=True):
	"""Get list of Inpatient Packages for selection during admission"""
	filters = {}
	
	if active_only:
		filters['active'] = 1
	
	if category:
		filters['package_category'] = category
	
	packages = frappe.get_all(
		'Inpatient Package',
		filters=filters,
		fields=[
			'name',
			'package_name',
			'package_category',
			'no_of_days',
			'package_rate',
			'active',
			'cost_center'
		],
		order_by='package_name'
	)
	
	# Get category names
	for pkg in packages:
		if pkg.package_category:
			category_name = frappe.db.get_value('Room Category', pkg.package_category, 'room_category_name')
			pkg['category_name'] = category_name or pkg.package_category
	
	# Get default currency from company
	try:
		company = frappe.defaults.get_user_default("Company")
		if company:
			default_currency = frappe.db.get_value('Company', company, 'default_currency')
			if default_currency:
				return {
					'packages': packages,
					'default_currency': default_currency
				}
	except Exception:
		pass
	
	# Fallback currency
	try:
		from erpnext import get_default_currency
		default_currency = get_default_currency() or 'BHD'
	except ImportError:
		default_currency = 'BHD'
	
	return {
		'packages': packages,
		'default_currency': default_currency
	}
