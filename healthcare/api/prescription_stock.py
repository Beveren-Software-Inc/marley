# Copyright (c) 2026, healthcare contributors
"""Prescription drug stock checks against branch warehouse or company-wide bins."""

import frappe
from frappe import _
from frappe.utils import flt


def _prescription_minimum_qty():
	return flt(frappe.db.get_single_value("Healthcare Settings", "minimum_no") or 0)


def _warehouse_for_cost_center(cost_center):
	if not cost_center:
		return None
	settings = frappe.get_single("Healthcare Settings")
	for row in settings.get("table_yjeh") or []:
		if row.cost_center == cost_center and row.warehouse:
			return row.warehouse
	return None


def _actual_qty_for_item(item_code, warehouse=None, company=None):
	if warehouse:
		return flt(
			frappe.db.get_value("Bin", {"item_code": item_code, "warehouse": warehouse}, "actual_qty")
		)

	if not company:
		company = frappe.defaults.get_user_default("Company")
	if not company:
		return 0.0

	result = frappe.db.sql(
		"""
		SELECT COALESCE(SUM(b.actual_qty), 0)
		FROM `tabBin` b
		INNER JOIN `tabWarehouse` w ON w.name = b.warehouse
		WHERE b.item_code = %s AND w.company = %s
		""",
		(item_code, company),
	)
	return flt(result[0][0] if result else 0)


@frappe.whitelist()
def check_prescription_drug_stock(item_code, cost_center=None, company=None):
	"""Warn when prescribed drug stock is zero or below Healthcare Settings minimum_no."""
	item_code = (item_code or "").strip()
	if not item_code:
		return {"warn": False}

	if not frappe.db.exists("Item", item_code):
		return {"warn": False}

	is_stock_item = frappe.db.get_value("Item", item_code, "is_stock_item")
	if not is_stock_item:
		return {"warn": False, "is_stock_item": False}

	minimum_qty = _prescription_minimum_qty()
	warehouse = _warehouse_for_cost_center((cost_center or "").strip() or None)
	actual_qty = _actual_qty_for_item(item_code, warehouse=warehouse, company=company)
	item_name = frappe.db.get_value("Item", item_code, "item_name") or item_code

	scope_label = warehouse or _("all company warehouses")

	if actual_qty <= 0:
		message = _(
			"{0} is out of stock ({1}: {2}). You can still prescribe, but pharmacy may not be able to dispense."
		).format(item_name, scope_label, actual_qty)
		return {
			"warn": True,
			"level": "out_of_stock",
			"message": message,
			"item_code": item_code,
			"item_name": item_name,
			"actual_qty": actual_qty,
			"minimum_qty": minimum_qty,
			"warehouse": warehouse,
			"scope": scope_label,
		}

	if minimum_qty > 0 and actual_qty <= minimum_qty:
		message = _(
			"{0} stock is low ({1}: {2}, minimum {3}). You can still prescribe."
		).format(item_name, scope_label, actual_qty, minimum_qty)
		return {
			"warn": True,
			"level": "low_stock",
			"message": message,
			"item_code": item_code,
			"item_name": item_name,
			"actual_qty": actual_qty,
			"minimum_qty": minimum_qty,
			"warehouse": warehouse,
			"scope": scope_label,
		}

	return {
		"warn": False,
		"actual_qty": actual_qty,
		"minimum_qty": minimum_qty,
		"warehouse": warehouse,
		"scope": scope_label,
	}
