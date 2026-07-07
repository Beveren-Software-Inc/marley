# -*- coding: utf-8 -*-
"""Net billable qty for hospital POS dispense Sales Orders after Delivery Note returns."""

import frappe
from frappe.utils import cint, flt


def is_pos_dispense_sales_order(so) -> bool:
	if not so:
		return False
	if not frappe.db.has_column("Sales Order", "custom_is_pos"):
		return False
	return cint(getattr(so, "custom_is_pos", 0) or 0) == 1


def _get_pos_dispense_delivery_note(sales_order_name):
	rows = frappe.db.sql(
		"""
		SELECT DISTINCT dn.name
		FROM `tabDelivery Note` dn
		INNER JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
		WHERE dni.against_sales_order = %s
		  AND dn.docstatus = 1
		  AND IFNULL(dn.is_return, 0) = 0
		ORDER BY dn.creation DESC
		LIMIT 1
		""",
		sales_order_name,
		as_dict=True,
	)
	return rows[0].name if rows else None


def _get_dn_line_map_for_sales_order(sales_order_name):
	rows = frappe.db.sql(
		"""
		SELECT
			dni.name AS dn_detail,
			dni.so_detail,
			dni.item_code
		FROM `tabDelivery Note Item` dni
		INNER JOIN `tabDelivery Note` dn ON dn.name = dni.parent
		WHERE dni.against_sales_order = %s
		  AND dn.docstatus = 1
		  AND IFNULL(dn.is_return, 0) = 0
		""",
		sales_order_name,
		as_dict=True,
	)

	by_so_detail = {}
	by_item_code = {}
	for row in rows:
		if row.so_detail:
			by_so_detail[row.so_detail] = row
		by_item_code.setdefault(row.item_code, []).append(row)
	return {
		"delivery_note": _get_pos_dispense_delivery_note(sales_order_name),
		"by_so_detail": by_so_detail,
		"by_item_code": by_item_code,
	}


def _get_returned_qty_for_dn_item(delivery_note_name, customer, dn_detail):
	if not delivery_note_name or not dn_detail:
		return 0
	try:
		from erpnext.controllers.sales_and_purchase_return import get_returned_qty_map_for_row
	except ImportError:
		return 0

	returned = get_returned_qty_map_for_row(delivery_note_name, customer, dn_detail, "Delivery Note")
	if not returned:
		return 0
	return abs(flt(returned.get("qty") or 0))


def _load_dn_context(sales_order_name):
	if not hasattr(frappe.local, "pos_dispense_dn_context"):
		frappe.local.pos_dispense_dn_context = {}
	cache = frappe.local.pos_dispense_dn_context
	if sales_order_name not in cache:
		cache[sales_order_name] = _get_dn_line_map_for_sales_order(sales_order_name)
	return cache[sales_order_name]


def get_returned_qty_for_so_item(so, item):
	"""Returned qty for a POS dispense SO line (0 when not a POS order or no DN link)."""
	if not is_pos_dispense_sales_order(so):
		return 0

	ctx = _load_dn_context(so.name)
	dn_row = ctx["by_so_detail"].get(item.name)
	if not dn_row:
		candidates = ctx["by_item_code"].get(item.item_code) or []
		if len(candidates) == 1:
			dn_row = candidates[0]
		else:
			for candidate in candidates:
				if candidate.so_detail == item.name:
					dn_row = candidate
					break

	if not dn_row:
		return 0

	return _get_returned_qty_for_dn_item(
		ctx["delivery_note"],
		getattr(so, "customer", None),
		dn_row.dn_detail,
	)


def get_net_billable_qty_for_so_item(so, item) -> float:
	"""Qty to invoice after POS dispense returns."""
	sold_qty = flt(item.qty)
	if sold_qty <= 0:
		return 0
	if not is_pos_dispense_sales_order(so):
		return sold_qty
	return max(0, sold_qty - get_returned_qty_for_so_item(so, item))


def sales_order_has_billable_qty(so) -> bool:
	for item in so.get("items") or []:
		if get_net_billable_qty_for_so_item(so, item) > 0:
			return True
	return False


def get_billable_grand_total_for_sales_order(so) -> float:
	total = 0
	for item in so.get("items") or []:
		net_qty = get_net_billable_qty_for_so_item(so, item)
		if net_qty <= 0:
			continue
		rate = flt(item.rate)
		total += net_qty * rate
	return flt(total, so.precision("grand_total") if hasattr(so, "precision") else 2)


def enrich_sales_order_billable_fields(row_or_doc):
	"""Attach billable_grand_total / returned_amount on list rows or SO docs."""
	if isinstance(row_or_doc, dict):
		name = row_or_doc.get("name")
		if not name:
			return row_or_doc
		so = frappe.get_doc("Sales Order", name)
	else:
		so = row_or_doc

	if not is_pos_dispense_sales_order(so):
		return row_or_doc

	original_total = flt(getattr(so, "grand_total", 0) or 0)
	billable_total = get_billable_grand_total_for_sales_order(so)
	returned_amount = max(0, original_total - billable_total)

	if isinstance(row_or_doc, dict):
		row_or_doc["billable_grand_total"] = billable_total
		row_or_doc["returned_amount"] = returned_amount
		row_or_doc["has_dispense_returns"] = returned_amount > 0
		return row_or_doc

	so.billable_grand_total = billable_total
	so.returned_amount = returned_amount
	so.has_dispense_returns = returned_amount > 0
	return so
