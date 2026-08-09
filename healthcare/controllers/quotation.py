"""Quotation hooks for healthcare package billing."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import add_days, get_link_to_form, getdate


DEFAULT_PACKAGE_SO_DELIVERY_DAYS = 30


def create_sales_order_from_package_quotation(doc, method=None):
	"""On Quotation submit: when custom_package is set, optionally create Sales Order.

	Controlled by Healthcare Settings → Create Sales Order on Quotation Submission.
	When that checkbox is off, the quotation submits without creating a Sales Order.
	"""
	if doc.doctype != "Quotation" or doc.docstatus != 1:
		return

	if not frappe.db.get_single_value(
		"Healthcare Settings", "create_sales_order_on_quotation_submission"
	):
		return

	package = (getattr(doc, "custom_package", None) or "").strip()
	if not package:
		return

	if _quotation_has_linked_sales_order(doc.name):
		return

	from erpnext.selling.doctype.quotation.quotation import _make_sales_order

	try:
		sales_order = _make_sales_order(doc.name, ignore_permissions=True)
	except Exception:
		frappe.log_error(title=f"Package quotation SO mapping failed: {doc.name}")
		raise

	_copy_quotation_fields_to_sales_order(doc, sales_order)
	_set_default_delivery_date(sales_order)

	sales_order.flags.ignore_permissions = True
	sales_order.insert(ignore_permissions=True)
	sales_order.submit()

	try:
		from healthcare.api.package_charge_to_today import record_package_charge_from_quotation

		record_package_charge_from_quotation(doc, sales_order.name)
	except Exception:
		frappe.log_error(title=f"Package charge ledger failed: {doc.name}")

	frappe.msgprint(
		_("Sales Order {0} created and submitted from package quotation {1}.").format(
			get_link_to_form("Sales Order", sales_order.name),
			get_link_to_form("Quotation", doc.name),
		),
		indicator="green",
		alert=True,
	)


def _quotation_has_linked_sales_order(quotation_name: str) -> bool:
	return bool(
		frappe.db.exists(
			"Sales Order Item",
			{"prevdoc_docname": quotation_name, "docstatus": ["<", 2]},
		)
	)


def _copy_quotation_fields_to_sales_order(quotation, sales_order) -> None:
	"""Copy healthcare fields from Quotation onto the mapped Sales Order."""
	direct_fields = (
		"patient",
		"custom_reference_type",
		"custom_reference_name",
		"custom_health_insurance",
		"custom_amount_to_be_covered",
	)
	for fieldname in direct_fields:
		if not sales_order.meta.has_field(fieldname):
			continue
		value = quotation.get(fieldname)
		if value not in (None, ""):
			sales_order.set(fieldname, value)

	if quotation.get("patient_name") and sales_order.meta.has_field("custom_patient_name"):
		sales_order.custom_patient_name = quotation.patient_name

	admission = (quotation.get("custom_inpatient_admission") or "").strip()
	if admission:
		if sales_order.meta.has_field("custom_base_reference"):
			sales_order.custom_base_reference = "Inpatient Admission"
		if sales_order.meta.has_field("custom_base_reference_name"):
			sales_order.custom_base_reference_name = admission
		if not sales_order.get("custom_reference_type"):
			sales_order.custom_reference_type = "Inpatient Admission"
		if not sales_order.get("custom_reference_name"):
			sales_order.custom_reference_name = admission


def _set_default_delivery_date(sales_order, days: int = DEFAULT_PACKAGE_SO_DELIVERY_DAYS) -> None:
	"""Sales Order requires delivery date — default to N days from transaction date."""
	base = getdate(sales_order.transaction_date or getdate())
	delivery_date = add_days(base, days)
	sales_order.delivery_date = delivery_date
	for row in sales_order.get("items") or []:
		if not row.delivery_date:
			row.delivery_date = delivery_date
