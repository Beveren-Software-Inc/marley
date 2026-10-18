# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt


PACKAGE_MANAGEMENT_ROLES = {
	"Head of Operation",
	"System Manager",
	"Healthcare Administrator",
	"Administrator",
}

PACKAGE_SERVICE_REFERENCE = {
	"Room": {
		"doctype": "Healthcare Service Unit",
		"label_fields": ("healthcare_service_unit_name", "room_no"),
		"description_field": "service_unit_type",
	},
	"Service": {
		"doctype": "Healthcare Service Template",
		"label_fields": ("service_name", "display_name"),
		"description_field": "service_id",
	},
	"Procedure": {
		"doctype": "Clinical Procedure Template",
		"label_fields": ("template",),
		"description_field": "description",
	},
	"Item": {
		"doctype": "Item",
		"label_fields": ("item_name",),
		"description_field": "item_group",
	},
}


def _require_package_manager() -> None:
	if set(frappe.get_roles()) & PACKAGE_MANAGEMENT_ROLES:
		return
	frappe.throw(
		_("You need the Head of Operation role to manage inpatient packages."),
		frappe.PermissionError,
	)


def _service_spec(service_type) -> dict | None:
	return PACKAGE_SERVICE_REFERENCE.get(cstr(service_type).strip())


def _existing_fields(doctype: str, fields) -> list[str]:
	meta = frappe.get_meta(doctype)
	return [field for field in fields if meta.has_field(field)]


def _reference_label(reference_doctype, reference) -> str:
	reference = cstr(reference)
	if not reference:
		return ""
	spec = _service_spec(
		next(
			(
				key
				for key, value in PACKAGE_SERVICE_REFERENCE.items()
				if value["doctype"] == cstr(reference_doctype)
			),
			"",
		)
	)
	if not spec:
		return reference
	for field in _existing_fields(spec["doctype"], spec["label_fields"]):
		label = frappe.db.get_value(spec["doctype"], reference, field)
		if label:
			return cstr(label)
	return reference


def _serialize_package(package) -> dict:
	data = package.as_dict()
	category = data.get("package_category")
	data["category_name"] = (
		frappe.db.get_value("Room Category", category, "room_category_name") or category
		if category
		else None
	)

	for row in data.get("services") or []:
		row["reference_label"] = _reference_label(
			row.get("reference_doctype"), row.get("reference")
		)

	for row in data.get("duration_pricing") or []:
		if row.get("duration_class"):
			row["duration_name"] = (
				frappe.db.get_value(
					"Package Duration Class", row.duration_class, "duration_name"
				)
				or row.duration_class
			)

	return data


def _default_company(companies) -> str | None:
	default_company = frappe.defaults.get_user_default("Company")
	if default_company:
		return default_company
	return companies[0].name if companies else None


def _meta_options() -> dict:
	companies = frappe.get_all(
		"Company",
		fields=["name", "default_currency"],
		order_by="name asc",
		ignore_permissions=True,
	)
	default_company = _default_company(companies)
	default_currency = _default_currency()
	for company in companies:
		if company.name == default_company and company.default_currency:
			default_currency = company.default_currency
			break

	categories = frappe.get_all(
		"Room Category",
		fields=["name", "room_category_name"],
		order_by="room_category_name asc",
		ignore_permissions=True,
	)

	duration_classes = frappe.get_all(
		"Package Duration Class",
		fields=["name", "duration_name", "from_day", "to_day"],
		order_by="from_day asc, duration_name asc",
		ignore_permissions=True,
	)

	cost_center_filters = {}
	if frappe.get_meta("Cost Center").has_field("is_group"):
		cost_center_filters["is_group"] = 0
	if frappe.get_meta("Cost Center").has_field("disabled"):
		cost_center_filters["disabled"] = 0
	cost_centers = frappe.get_all(
		"Cost Center",
		filters=cost_center_filters,
		fields=["name", "company"],
		order_by="name asc",
		ignore_permissions=True,
	)

	return {
		"default_currency": default_currency,
		"default_company": default_company,
		"companies": [
			{
				"value": company.name,
				"label": company.name,
				"currency": company.default_currency or default_currency,
			}
			for company in companies
		],
		"categories": [
			{
				"value": category.name,
				"label": category.room_category_name or category.name,
			}
			for category in categories
		],
		"duration_classes": [
			{
				"value": duration.name,
				"label": duration.duration_name or duration.name,
				"from_day": duration.from_day,
				"to_day": duration.to_day,
			}
			for duration in duration_classes
		],
		"cost_centers": [
			{"value": cost_center.name, "label": cost_center.name, "company": cost_center.company}
			for cost_center in cost_centers
		],
		"service_types": [
			{
				"value": service_type,
				"label": service_type,
				"reference_doctype": spec["doctype"],
				"hint": spec["doctype"],
			}
			for service_type, spec in PACKAGE_SERVICE_REFERENCE.items()
		],
	}


def _to_number(value, label: str) -> float:
	try:
		return float(value if value not in (None, "") else 0)
	except (TypeError, ValueError):
		frappe.throw(_("{0} must be a valid number.").format(_(label)))


def _to_check(value) -> int:
	return 1 if value in (True, 1, "1", "true", "True", "on", "yes") else 0


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


@frappe.whitelist()
def get_package_management_data():
	"""Return the inpatient package catalogue with services and pricing metadata."""
	_require_package_manager()

	names = frappe.get_all(
		"Inpatient Package",
		pluck="name",
		order_by="is_daily_default desc, no_of_days asc, package_name asc"
		if frappe.db.has_column("Inpatient Package", "is_daily_default")
		else "package_name asc",
		ignore_permissions=True,
	)
	packages = [
		_serialize_package(frappe.get_doc("Inpatient Package", name)) for name in names
	]

	return {
		"packages": packages,
		"meta": _meta_options(),
		"can_manage": True,
	}


@frappe.whitelist()
def search_package_service_references(service_type, query=None, limit=20):
	"""Search link-field values for an inpatient package service row."""
	_require_package_manager()

	spec = _service_spec(service_type)
	if not spec:
		frappe.throw(_("Invalid package service type."))

	doctype = spec["doctype"]
	label_fields = _existing_fields(doctype, spec["label_fields"])
	search_fields = ["name", *label_fields]
	fields = list(dict.fromkeys([*search_fields, spec["description_field"]]))
	fields = ["name", *_existing_fields(doctype, [field for field in fields if field != "name"])]

	filters = {}
	if frappe.get_meta(doctype).has_field("disabled"):
		filters["disabled"] = 0

	term = cstr(query).strip()
	or_filters = (
		[[doctype, field, "like", f"%{term}%"] for field in search_fields] if term else None
	)

	rows = frappe.get_all(
		doctype,
		filters=filters or None,
		or_filters=or_filters,
		fields=fields,
		order_by="name asc",
		limit_page_length=max(1, min(cint(limit) or 20, 50)),
		ignore_permissions=True,
	)

	options = []
	for row in rows:
		label = next((cstr(row.get(field)) for field in label_fields if row.get(field)), "") or cstr(
			row.name
		)
		description = cstr(row.get(spec["description_field"])) if spec["description_field"] else ""
		options.append(
			{
				"value": cstr(row.name),
				"label": label,
				"description": description[:120],
			}
		)
	return options


@frappe.whitelist()
def save_inpatient_package(package):
	"""Update an inpatient package, including its service and duration child tables."""
	_require_package_manager()

	if isinstance(package, str):
		try:
			payload = json.loads(package)
		except (TypeError, ValueError):
			frappe.throw(_("Invalid package payload."))
	else:
		payload = package

	if not isinstance(payload, dict):
		frappe.throw(_("Invalid package payload."))

	package_name = cstr(payload.get("name")).strip()
	if not package_name or not frappe.db.exists("Inpatient Package", package_name):
		frappe.throw(_("Inpatient package not found."))

	doc = frappe.get_doc("Inpatient Package", package_name)

	company = cstr(payload.get("company")).strip()
	if not company or not frappe.db.exists("Company", company):
		frappe.throw(_("Select a valid company."))

	category = cstr(payload.get("package_category")).strip()
	if category and not frappe.db.exists("Room Category", category):
		frappe.throw(_("Select a valid room category."))

	cost_center = cstr(payload.get("cost_center")).strip()
	if cost_center and not frappe.db.exists("Cost Center", cost_center):
		frappe.throw(_("Select a valid cost center."))

	no_of_days = cint(_to_number(payload.get("no_of_days"), "Number of days"))
	package_rate = _to_number(payload.get("package_rate"), "Package rate")
	base_total = _to_number(payload.get("base_total"), "Base total")
	if no_of_days < 0:
		frappe.throw(_("Number of days cannot be negative."))
	if package_rate < 0 or base_total < 0:
		frappe.throw(_("Package amounts cannot be negative."))

	doc.company = company
	doc.package_category = category or None
	doc.cost_center = cost_center or None
	doc.no_of_days = no_of_days
	doc.package_rate = package_rate
	doc.base_total = base_total
	doc.is_daily_default = _to_check(payload.get("is_daily_default"))
	doc.active = _to_check(payload.get("active"))

	services = payload.get("services") or []
	if not isinstance(services, list):
		frappe.throw(_("Invalid services payload."))
	doc.set("services", [])
	for index, row in enumerate(services, start=1):
		if not isinstance(row, dict):
			frappe.throw(_("Row {0}: invalid service row.").format(index))
		service_type = cstr(row.get("service_type")).strip()
		spec = _service_spec(service_type)
		reference = cstr(row.get("reference")).strip()
		if not spec or not reference:
			frappe.throw(_("Row {0}: select a service type and reference.").format(index))
		if not frappe.db.exists(spec["doctype"], reference):
			frappe.throw(
				_("Row {0}: {1} {2} does not exist.").format(
					index, _(spec["doctype"]), reference
				)
			)
		quantity_days = _to_number(row.get("quantity_days"), "Quantity")
		if quantity_days < 0:
			frappe.throw(_("Row {0}: quantity cannot be negative.").format(index))
		doc.append(
			"services",
			{
				"service_type": service_type,
				"reference_doctype": spec["doctype"],
				"reference": reference,
				"quantity_days": quantity_days,
				"is_unlimited": _to_check(row.get("is_unlimited")),
			},
		)

	duration_rows = payload.get("duration_pricing") or []
	if not isinstance(duration_rows, list):
		frappe.throw(_("Invalid duration pricing payload."))
	doc.set("duration_pricing", [])
	seen_duration_classes = set()
	for index, row in enumerate(duration_rows, start=1):
		if not isinstance(row, dict):
			frappe.throw(_("Row {0}: invalid duration pricing row.").format(index))
		duration_class = cstr(row.get("duration_class")).strip()
		if not duration_class:
			frappe.throw(_("Row {0}: select a duration class.").format(index))
		if duration_class in seen_duration_classes:
			frappe.throw(
				_("Row {0}: duration class {1} is already used.").format(
					index, duration_class
				)
			)
		duration = frappe.db.get_value(
			"Package Duration Class",
			duration_class,
			["from_day", "to_day"],
			as_dict=True,
		)
		if not duration:
			frappe.throw(
				_("Row {0}: duration class {1} does not exist.").format(
					index, duration_class
				)
			)
		amount = _to_number(row.get("amount"), "Duration amount")
		if amount < 0:
			frappe.throw(_("Row {0}: amount cannot be negative.").format(index))
		seen_duration_classes.add(duration_class)
		doc.append(
			"duration_pricing",
			{
				"duration_class": duration_class,
				"from_day": cint(duration.from_day),
				"to_day": cint(duration.to_day) if duration.to_day not in (None, "") else None,
				"amount": amount,
			},
		)

	doc.save(ignore_permissions=True)
	return {"package": _serialize_package(doc)}
