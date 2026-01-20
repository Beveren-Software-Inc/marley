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
	
	base_rate = float(package.package_rate)
	
	# If no duration pricing, use base rate
	if not duration_pricing:
		return {
			'total_price': base_rate * days,
			'base_rate': base_rate,
			'days': days
		}
	
	# Duration pricing slab logic (as requested):
	# - If days are within the first slab (typically 1-7) but not complete (e.g. 6): use days * base_rate
	# - If days exactly hit a slab end (e.g. 7, 14, 21): use that slab amount ONLY
	# - If days exceed the last completed slab (e.g. 15 when last slab ends at 14): use slab_amount + extra_days * base_rate
	#
	# This treats each slab amount as the "all-in amount up to that slab end".

	# Separate finite slabs (with to_day) and open-ended slabs (to_day is None)
	finite = [dp for dp in duration_pricing if dp.to_day]
	open_ended = [dp for dp in duration_pricing if not dp.to_day]

	# Sort finite slabs by to_day ascending
	finite.sort(key=lambda x: (x.to_day or 0))

	# Find the last completed slab (max to_day <= days)
	last_completed = None
	for dp in finite:
		if days >= (dp.to_day or 0):
			last_completed = dp
		else:
			break

	if last_completed:
		slab_to = int(last_completed.to_day)
		slab_amount = float(last_completed.amount or 0)
		extra_days = max(0, days - slab_to)
		total_price = slab_amount + (extra_days * base_rate)
	else:
		# No completed slab yet. If there is a first finite slab starting at day 1,
		# allow per-day pricing until its end.
		first_slab = finite[0] if finite else None
		if first_slab and int(first_slab.from_day or 1) == 1 and int(first_slab.to_day or 0) > 0:
			first_to = int(first_slab.to_day)
			first_amount = float(first_slab.amount or 0)
			if days < first_to:
				total_price = base_rate * days
			elif days == first_to:
				total_price = first_amount
			else:
				# days > first_to but still no "completed slab" found means missing slabs.
				# Treat as first slab completed + extra days.
				total_price = first_amount + ((days - first_to) * base_rate)
		elif open_ended:
			# Open-ended slab exists; use its amount.
			# (No extra day calculation since it is open-ended.)
			open_ended.sort(key=lambda x: (x.from_day or 0))
			total_price = float(open_ended[0].amount or 0)
		else:
			total_price = base_rate * days
	
	return {
		'total_price': total_price,
		'base_rate': float(package.package_rate),
		'days': days
	}
