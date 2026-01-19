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
	
	# Get category names and duration pricing
	for pkg in packages:
		if pkg.package_category:
			category_name = frappe.db.get_value('Room Category', pkg.package_category, 'room_category_name')
			pkg['category_name'] = category_name or pkg.package_category
		
		# Get duration pricing
		duration_pricing = frappe.get_all(
			'Inpatient Package Duration',
			filters={'parent': pkg.name},
			fields=[
				'duration_class',
				'from_day',
				'to_day',
				'amount'
			],
			order_by='from_day'
		)
		
		# Get duration class names
		for dp in duration_pricing:
			if dp.duration_class:
				duration_name = frappe.db.get_value('Package Duration Class', dp.duration_class, 'duration_name')
				dp['duration_name'] = duration_name or dp.duration_class
		
		pkg['duration_pricing'] = duration_pricing
	
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


@frappe.whitelist()
def calculate_package_price(package_name, days):
	"""Calculate total price for a package based on number of days and duration pricing"""
	try:
		days = int(days)
		if days <= 0:
			frappe.throw(_("Number of days must be greater than 0"))
	except (ValueError, TypeError):
		frappe.throw(_("Invalid number of days"))
	
	# Get package
	package = frappe.get_doc('Inpatient Package', package_name)
	
	# Get duration pricing sorted by from_day
	duration_pricing = frappe.get_all(
		'Inpatient Package Duration',
		filters={'parent': package_name},
		fields=['from_day', 'to_day', 'amount'],
		order_by='from_day'
	)
	
	total_price = 0
	base_rate = float(package.package_rate)
	
	# If no duration pricing, use base rate
	if not duration_pricing:
		return {
			'total_price': base_rate * days,
			'base_rate': base_rate,
			'days': days
		}
	
	# Calculate price based on duration pricing
	# Logic:
	# - If days < full period (e.g., 6 days < 7 days for first week): use days × base_rate
	# - If days = full period (e.g., exactly 7 days): use the duration class amount
	# - If days > full period (e.g., 10 days): use amount + (remaining days × base_rate)
	# Example: 10 days with first week (1-7) = 400 + (3 × base_rate)
	
	# Find the applicable duration period (check in order)
	applicable_period = None
	
	for dp in duration_pricing:
		from_day = dp.from_day or 1
		to_day = dp.to_day  # None means open-ended
		
		# Check if user's days fall within or beyond this period
		if days >= from_day:
			if to_day is None:
				# Open-ended period: covers from from_day onwards
				# If days >= from_day, use this period
				applicable_period = dp
				break
			elif days <= to_day:
				# User's days are within this period range
				applicable_period = dp
				break
			else:
				# User's days extend beyond this period
				# Use this period (it's the first one that applies)
				applicable_period = dp
				break
	
	# Apply calculation based on applicable period
	if applicable_period:
		from_day = applicable_period.from_day or 1
		to_day = applicable_period.to_day
		amount = float(applicable_period.amount or 0)
		
		if to_day is None:
			# Open-ended period
			# If days >= from_day, use the amount + remaining days × base_rate
			if days >= from_day:
				period_days = days - from_day + 1
				# For open-ended, we use the amount for the period
				# and remaining days beyond the period use base_rate
				# Actually, let's treat it as: if days >= from_day, use amount
				# and any days beyond use base_rate
				# But wait, for open-ended, the amount covers from from_day onwards
				# So if days >= from_day, we use the amount
				total_price += amount
				# Remaining days calculation would be handled if needed
		else:
			# Fixed period (e.g., 1-7 days)
			period_length = to_day - from_day + 1
			
			if days < period_length:
				# Days are less than full period (e.g., 6 days < 7 days)
				# Use: days × base_rate
				total_price = base_rate * days
			elif days == period_length:
				# Days exactly equal the period (e.g., exactly 7 days)
				# Use: the duration class amount
				total_price = amount
			else:
				# Days exceed the period (e.g., 10 days > 7 days)
				# Use: amount + (remaining days × base_rate)
				remaining_days = days - to_day
				total_price = amount + (base_rate * remaining_days)
	else:
		# No applicable period found, use base rate
		total_price = base_rate * days
	
	return {
		'total_price': total_price,
		'base_rate': float(package.package_rate),
		'days': days
	}
