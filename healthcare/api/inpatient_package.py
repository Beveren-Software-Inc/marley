# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import cint, flt


def _default_currency() -> str:
	try:
		company = frappe.defaults.get_user_default("Company")
		if company:
			currency = frappe.db.get_value("Company", company, "default_currency")
			if currency:
				return currency
	except Exception:
		pass
	try:
		from erpnext import get_default_currency

		return get_default_currency() or "BHD"
	except ImportError:
		return "BHD"


def get_room_multiplier(service_unit_type: str | None = None, service_unit: str | None = None) -> float:
	"""Resolve room multiplier from Service Unit Type (room type). Default 1.0."""
	su_type = (service_unit_type or "").strip()
	if not su_type and service_unit:
		su_type = frappe.db.get_value("Healthcare Service Unit", service_unit, "service_unit_type") or ""
	if not su_type:
		return 1.0
	if not frappe.db.has_column("Healthcare Service Unit Type", "room_multiplier"):
		return 1.0
	multiplier = frappe.db.get_value("Healthcare Service Unit Type", su_type, "room_multiplier")
	return flt(multiplier) if multiplier is not None else 1.0


def calculate_program_price(package, days: int) -> float:
	"""Program price for Triple Sharing reference room (before room multiplier)."""
	days = cint(days)
	base_rate = flt(package.package_rate)
	base_total = flt(getattr(package, "base_total", 0) or 0)
	program_days = cint(getattr(package, "no_of_days", 0) or 0)
	is_daily = cint(getattr(package, "is_daily_default", 0) or 0)

	if is_daily or not program_days or program_days <= 1:
		return base_rate * days

	# Fixed program: use stored base total when days match program length
	if base_total and days == program_days:
		return base_total

	# Early / different length: fall back to duration slabs if present, else daily × days
	duration_pricing = frappe.get_all(
		"Inpatient Package Duration",
		filters={"parent": package.name},
		fields=["from_day", "to_day", "amount"],
		order_by="from_day",
	)
	if duration_pricing:
		return _slab_price(duration_pricing, base_rate, days)

	if base_total and program_days:
		# Pro-rate fixed program when days differ from program length
		return flt(base_total) * (flt(days) / flt(program_days))

	return base_rate * days


def _slab_price(duration_pricing, base_rate: float, days: int) -> float:
	finite = [dp for dp in duration_pricing if dp.to_day]
	open_ended = [dp for dp in duration_pricing if not dp.to_day]
	finite.sort(key=lambda x: (x.to_day or 0))

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
		return slab_amount + (extra_days * base_rate)

	first_slab = finite[0] if finite else None
	if first_slab and int(first_slab.from_day or 1) == 1 and int(first_slab.to_day or 0) > 0:
		first_to = int(first_slab.to_day)
		first_amount = float(first_slab.amount or 0)
		if days < first_to:
			return base_rate * days
		if days == first_to:
			return first_amount
		return first_amount + ((days - first_to) * base_rate)

	if open_ended:
		open_ended.sort(key=lambda x: (x.from_day or 0))
		return float(open_ended[0].amount or 0)

	return base_rate * days


@frappe.whitelist()
def get_inpatient_packages(category=None, active_only=True):
	"""Get list of Inpatient Packages (programs) for selection during admission."""
	filters = {}

	if active_only in (True, 1, "1", "true", "True"):
		filters["active"] = 1

	if category:
		filters["package_category"] = category

	fields = [
		"name",
		"package_name",
		"package_category",
		"no_of_days",
		"package_rate",
		"active",
		"cost_center",
	]
	if frappe.db.has_column("Inpatient Package", "base_total"):
		fields.append("base_total")
	if frappe.db.has_column("Inpatient Package", "is_daily_default"):
		fields.append("is_daily_default")

	packages = frappe.get_all(
		"Inpatient Package",
		filters=filters,
		fields=fields,
		order_by="is_daily_default desc, no_of_days, package_name"
		if frappe.db.has_column("Inpatient Package", "is_daily_default")
		else "package_name",
	)

	for pkg in packages:
		if pkg.package_category:
			category_name = frappe.db.get_value(
				"Room Category", pkg.package_category, "room_category_name"
			)
			pkg["category_name"] = category_name or pkg.package_category

		duration_pricing = frappe.get_all(
			"Inpatient Package Duration",
			filters={"parent": pkg.name},
			fields=["duration_class", "from_day", "to_day", "amount"],
			order_by="from_day",
		)
		for dp in duration_pricing:
			if dp.duration_class:
				duration_name = frappe.db.get_value(
					"Package Duration Class", dp.duration_class, "duration_name"
				)
				dp["duration_name"] = duration_name or dp.duration_class
		pkg["duration_pricing"] = duration_pricing

	return {
		"packages": packages,
		"default_currency": _default_currency(),
	}


@frappe.whitelist()
def calculate_package_price(
	package_name,
	days,
	service_unit_type=None,
	service_unit=None,
	room_multiplier=None,
):
	"""
	Final Price = Program Price × Room Multiplier

	Room types are Healthcare Service Unit Types with room_multiplier.
	Program price is package base_total (Triple Sharing) or daily × days.
	"""
	try:
		days = int(days)
		if days <= 0:
			frappe.throw(_("Number of days must be greater than 0"))
	except (ValueError, TypeError):
		frappe.throw(_("Invalid number of days"))

	package = frappe.get_doc("Inpatient Package", package_name)
	program_price = calculate_program_price(package, days)

	if room_multiplier is not None and str(room_multiplier).strip() != "":
		multiplier = flt(room_multiplier)
	else:
		multiplier = get_room_multiplier(service_unit_type, service_unit)
	if multiplier <= 0:
		multiplier = 1.0

	total_price = flt(program_price) * multiplier

	return {
		"total_price": total_price,
		"program_price": flt(program_price),
		"base_rate": flt(package.package_rate),
		"base_total": flt(getattr(package, "base_total", 0) or 0),
		"room_multiplier": multiplier,
		"service_unit_type": service_unit_type
		or (
			frappe.db.get_value("Healthcare Service Unit", service_unit, "service_unit_type")
			if service_unit
			else None
		),
		"days": days,
	}
