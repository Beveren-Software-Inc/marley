"""Sales Order helpers for healthcare service billing."""

from __future__ import annotations

import frappe
from frappe.utils import cint


def sales_order_requires_delivery(doc) -> bool:
	"""True if any line is a stock item (or stock product-bundle) that needs a DN."""
	for item in doc.get("items") or []:
		item_code = item.get("item_code") if hasattr(item, "get") else getattr(item, "item_code", None)
		if not item_code:
			continue
		if cint(frappe.get_cached_value("Item", item_code, "is_stock_item")):
			return True
		if _product_bundle_has_stock(item_code):
			return True
	return False


def _product_bundle_has_stock(item_code: str) -> bool:
	bundles = frappe.get_all(
		"Product Bundle",
		filters={"new_item_code": item_code, "disabled": 0},
		pluck="name",
	)
	if not bundles:
		return False
	for parent in bundles:
		for row in frappe.get_all(
			"Product Bundle Item",
			filters={"parent": parent},
			fields=["item_code"],
		):
			if row.item_code and cint(frappe.get_cached_value("Item", row.item_code, "is_stock_item")):
				return True
	return False


def set_skip_delivery_note_for_services(doc, method=None):
	"""Service-only SOs never need a Delivery Note — skip so status follows billing."""
	if not doc.get("items"):
		return
	if sales_order_requires_delivery(doc):
		return
	doc.skip_delivery_note = 1


def ensure_service_sales_order_status(so_name: str | None = None, doc=None) -> str | None:
	"""Fix submitted service-only SOs stuck on To Deliver after full billing.

	Returns the (possibly updated) status, or None if the doc was not loaded.
	"""
	so = doc
	if so is None:
		if not so_name or not frappe.db.exists("Sales Order", so_name):
			return None
		so = frappe.get_doc("Sales Order", so_name)

	if cint(so.docstatus) != 1:
		return so.status

	if sales_order_requires_delivery(so):
		return so.status

	if not cint(so.skip_delivery_note):
		so.db_set("skip_delivery_note", 1, update_modified=False)
		so.skip_delivery_note = 1

	if so.status in ("To Deliver", "To Deliver and Bill"):
		so.set_status(update=True, update_modified=False)

	return so.status
