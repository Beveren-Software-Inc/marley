import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.utils import flt

from healthcare.api.room_package_pricing import infer_package_pricing_mode


def execute():
	"""Register the room pricing metadata used to recognise admission quotations.

	`admit_patient` only accepts a quotation that records the room pricing mode
	the user selected (and the daily rate drafted for it). The fields holding that
	information were referenced by the admission flow but never registered, so
	drafts lost the values on save and admitting kept asking for a quotation.
	Create the fields, then backfill existing drafts so an already-drafted
	quotation can be used to admit the patient.
	"""
	fields = []
	if frappe.db.exists("DocType", "Quotation Other Service"):
		fields.append(
			{
				"fieldname": "custom_additional_services",
				"label": "Additional Services",
				"fieldtype": "Table",
				"options": "Quotation Other Service",
				"insert_after": "items",
				"description": (
					"Additional Healthcare Service Templates selected for this "
					"inpatient admission. These do not create quotation items."
				),
			}
		)
	fields.extend(
		[
			{
				"fieldname": "custom_package_pricing_mode",
				"label": "Package Pricing Mode",
				"fieldtype": "Select",
				"options": "\nDaily\nWeekly\nMonthly",
				"insert_after": "custom_package",
				"read_only": 1,
				"description": (
					"Room duration pricing selected when this quotation was drafted. "
					"Set by the admission flow."
				),
			},
			{
				"fieldname": "custom_package_daily_rate",
				"label": "Package Daily Rate",
				"fieldtype": "Currency",
				"insert_after": "custom_package_pricing_mode",
				"read_only": 1,
				"description": (
					"Package room rate per day used to admit the patient. "
					"Set by the admission flow."
				),
			},
		]
	)
	create_custom_fields({"Quotation": fields}, update=True)
	frappe.clear_cache(doctype="Quotation")
	_backfill_package_pricing()


def _backfill_package_pricing():
	"""Stamp the pricing mode/rate on quotations drafted before the fields existed."""
	quotations = frappe.get_all(
		"Quotation",
		filters={
			"docstatus": ["<", 2],
			"custom_inpatient_admission": ["is", "set"],
			"custom_package": ["is", "set"],
		},
		fields=[
			"name",
			"company",
			"custom_package",
			"custom_package_pricing_mode",
			"custom_package_daily_rate",
		],
		limit_page_length=0,
	)
	for quotation in quotations:
		mode = quotation.get("custom_package_pricing_mode")
		rate = flt(quotation.get("custom_package_daily_rate"))
		if mode and rate > 0:
			continue
		rate = rate or _package_daily_rate(quotation.name)
		if rate <= 0:
			continue
		mode = mode or infer_package_pricing_mode(
			quotation.custom_package, rate, quotation.company
		)
		if not mode:
			continue
		frappe.db.set_value(
			"Quotation",
			quotation.name,
			{
				"custom_package_pricing_mode": mode,
				"custom_package_daily_rate": rate,
			},
			update_modified=False,
		)


def _package_daily_rate(quotation_name):
	"""Read the package line rate of a quotation (drafts hold it on the item row)."""
	return flt(
		frappe.db.get_value(
			"Quotation Item",
			{
				"parent": quotation_name,
				"parenttype": "Quotation",
				"description": ["like", "Inpatient Package:%"],
			},
			"rate",
			order_by="idx asc",
		)
	)
