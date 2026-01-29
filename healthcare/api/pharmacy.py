# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# Pharmacy dashboard APIs for React UI: batch expiry and low stock.

import frappe
from frappe.utils import add_days, getdate, flt, cint


@frappe.whitelist()
def get_batches_expiring_tomorrow(limit=100):
	"""Batches expiring tomorrow (next calendar day)."""
	limit = cint(limit) or 100
	tomorrow = add_days(getdate(), 1)
	return _get_batches_for_date(tomorrow, limit)


@frappe.whitelist()
def get_batches_expiring_in_week(limit=200):
	"""Batches expiring within the next 7 days (excluding tomorrow if needed for separate card)."""
	limit = cint(limit) or 200
	today = getdate()
	# From day after tomorrow through 7 days from today
	from_date = add_days(today, 2)
	to_date = add_days(today, 7)
	return _get_batches_in_date_range(from_date, to_date, limit)


@frappe.whitelist()
def get_batches_expiring_in_days(days=7, limit=200):
	"""Batches expiring within the next N days (from today through today + days)."""
	limit = cint(limit) or 200
	days = cint(days) or 7
	today = getdate()
	to_date = add_days(today, days)
	return _get_batches_in_date_range(today, to_date, limit)


@frappe.whitelist()
def get_low_stock_items(limit=100, threshold=None):
	"""
	Items with low stock. Uses Bin.actual_qty.
	If threshold is provided (number), items with actual_qty <= threshold are returned.
	Otherwise uses Item's reorder_levels (Reorder level in Item Reorder table) when available.
	"""
	limit = cint(limit) or 100
	if not frappe.db.exists("DocType", "Bin"):
		return []
	threshold = frappe.parse_json(threshold) if threshold is not None else None
	if threshold is not None:
		threshold = flt(threshold)
	# Default low-stock threshold if no reorder level: 10
	default_threshold = 10
	bin_list = frappe.get_all(
		"Bin",
		filters={"actual_qty": [">", 0]},
		fields=["item_code", "warehouse", "actual_qty"],
		order_by="actual_qty asc",
		limit=limit * 2,
	)
	# Get reorder levels per item/warehouse if available
	reorder_map = {}
	if frappe.db.exists("DocType", "Item Reorder"):
		reorders = frappe.get_all(
			"Item Reorder",
			filters={"parenttype": "Item"},
			fields=["parent as item_code", "warehouse", "warehouse_reorder_level"],
			as_list=False,
		)
		for r in reorders:
			key = (r.get("item_code"), r.get("warehouse"))
			level = flt(r.get("warehouse_reorder_level")) or 0
			if key not in reorder_map or (level and (not reorder_map[key] or level < reorder_map[key])):
				reorder_map[key] = level
	low_stock = []
	seen = set()
	for b in bin_list:
		item_code = b.get("item_code")
		warehouse = b.get("warehouse")
		actual_qty = float(b.get("actual_qty") or 0)
		reorder_level = reorder_map.get((item_code, warehouse)) or reorder_map.get((item_code, None))
		use_threshold = threshold if threshold is not None else (reorder_level if reorder_level else default_threshold)
		if actual_qty <= use_threshold and (item_code, warehouse) not in seen:
			seen.add((item_code, warehouse))
			item_name = frappe.db.get_value("Item", item_code, "item_name") or item_code
			low_stock.append({
				"item_code": item_code,
				"item_name": item_name,
				"warehouse": warehouse,
				"actual_qty": actual_qty,
				"reorder_level": reorder_level or use_threshold,
			})
			if len(low_stock) >= limit:
				break
	return low_stock


def _get_batches_for_date(target_date, limit):
	"""Batches expiring on exactly target_date."""
	if not frappe.db.exists("DocType", "Batch"):
		return []
	target_str = target_date.strftime("%Y-%m-%d")
	batches = frappe.get_all(
		"Batch",
		filters={"expiry_date": target_str, "disabled": 0},
		fields=["name", "item", "item_name", "expiry_date", "batch_qty", "stock_uom"],
		order_by="expiry_date asc",
		limit=limit,
	)
	return list(batches)


def _get_batches_in_date_range(from_date, to_date, limit):
	"""Batches expiring between from_date and to_date (inclusive)."""
	if not frappe.db.exists("DocType", "Batch"):
		return []
	from_str = from_date.strftime("%Y-%m-%d")
	to_str = to_date.strftime("%Y-%m-%d")
	batches = frappe.get_all(
		"Batch",
		filters={
			"expiry_date": ["between", [from_str, to_str]],
			"disabled": 0,
		},
		fields=["name", "item", "item_name", "expiry_date", "batch_qty", "stock_uom"],
		order_by="expiry_date asc",
		limit=limit,
	)
	return list(batches)


@frappe.whitelist()
def search_item_or_batch(query="", limit=100):
	"""
	Search by item name/code or batch id. Returns rows with item_name, batch (if exist), stock_quantity, expiry_date (if exist).
	"""
	limit = cint(limit) or 100
	query = (query or "").strip()
	if not query:
		return []
	out = []
	seen = set()  # (item_code, batch_or_none) to avoid dupes

	# Search Batch: name, item, item_name
	if frappe.db.exists("DocType", "Batch"):
		q = f"%{query}%"
		batches = frappe.get_all(
			"Batch",
			filters={"disabled": 0},
			fields=["name", "item", "item_name", "expiry_date", "batch_qty", "stock_uom"],
			or_filters=[
				["name", "like", q],
				["item", "like", q],
				["item_name", "like", q],
			],
			limit=limit,
		)
		for b in batches:
			key = (b.get("item") or "", b.get("name"))
			if key in seen:
				continue
			seen.add(key)
			out.append({
				"item_code": b.get("item"),
				"item_name": b.get("item_name") or b.get("item") or "",
				"batch": b.get("name"),
				"stock_quantity": flt(b.get("batch_qty")),
				"stock_uom": b.get("stock_uom"),
				"expiry_date": b.get("expiry_date"),
			})
			if len(out) >= limit:
				return out

	# Search Item: item_code, item_name; then get Bin stock and optionally Batch
	if frappe.db.exists("DocType", "Item"):
		q = f"%{query}%"
		items = frappe.get_all(
			"Item",
			filters={"disabled": 0},
			or_filters=[
				["name", "like", q],
				["item_name", "like", q],
			],
			fields=["name", "item_name"],
			limit=limit,
		)
		for it in items:
			item_code = it.get("name")
			item_name = it.get("item_name") or item_code
			# Prefer batch rows if we already have them
			if frappe.db.exists("DocType", "Batch"):
				batch_list = frappe.get_all(
					"Batch",
					filters={"item": item_code, "disabled": 0},
					fields=["name", "expiry_date", "batch_qty", "stock_uom"],
					limit=10,
				)
				for b in batch_list:
					key = (item_code, b.get("name"))
					if key in seen:
						continue
					seen.add(key)
					out.append({
						"item_code": item_code,
						"item_name": item_name,
						"batch": b.get("name"),
						"stock_quantity": flt(b.get("batch_qty")),
						"stock_uom": b.get("stock_uom"),
						"expiry_date": b.get("expiry_date"),
					})
					if len(out) >= limit:
						return out
			# No batch or add one row from Bin total (only if we didn't already add this item via Batch)
			if any(k[0] == item_code for k in seen):
				continue
			key = (item_code, None)
			seen.add(key)
			qty = 0
			if frappe.db.exists("DocType", "Bin"):
				bin_sum = frappe.db.sql(
					"select sum(actual_qty) from tabBin where item_code = %s", (item_code,), as_list=1
				)
				if bin_sum and bin_sum[0][0]:
					qty = flt(bin_sum[0][0])
			out.append({
				"item_code": item_code,
				"item_name": item_name,
				"batch": None,
				"stock_quantity": qty,
				"stock_uom": None,
				"expiry_date": None,
			})
			if len(out) >= limit:
				return out

	return out


@frappe.whitelist()
def get_material_request_options():
	"""Return companies, warehouses and cost centers for Material Request modal."""
	companies = []
	if frappe.db.exists("DocType", "Company"):
		filters = {}
		try:
			if frappe.get_meta("Company").has_field("enabled"):
				filters["enabled"] = 1
		except Exception:
			pass
		companies = frappe.get_all("Company", filters=filters or None, fields=["name"], order_by="name")
	warehouses = []
	if frappe.db.exists("DocType", "Warehouse"):
		warehouses = frappe.get_all("Warehouse", filters={"is_group": 0}, fields=["name"], order_by="name")
	cost_centers = []
	if frappe.db.exists("DocType", "Cost Center"):
		try:
			if frappe.get_meta("Cost Center").has_field("is_group"):
				cost_centers = frappe.get_all(
					"Cost Center",
					filters={"is_group": 0},
					fields=["name"],
					order_by="name"
				)
			else:
				cost_centers = frappe.get_all("Cost Center", fields=["name"], order_by="name")
		except Exception:
			pass
	return {
		"companies": [c.get("name") for c in companies],
		"warehouses": [w.get("name") for w in warehouses],
		"cost_centers": [cc.get("name") for cc in cost_centers],
	}


@frappe.whitelist()
def create_material_request(
	company,
	material_request_type,
	schedule_date=None,
	items=None,
	set_warehouse=None,
	cost_center=None,
):
	"""Create a Material Request. items: list of {item_code, qty, warehouse}."""
	if not frappe.db.exists("DocType", "Material Request"):
		frappe.throw("Material Request doctype not found")
	company = (company or "").strip()
	material_request_type = (material_request_type or "Purchase").strip()
	items = frappe.parse_json(items) if isinstance(items, str) else (items or [])
	set_warehouse = (set_warehouse or "").strip() or None
	cost_center = (cost_center or "").strip() or None
	if not company:
		frappe.throw("Company is required")
	if not items or not isinstance(items, list):
		frappe.throw("At least one item is required")
	from frappe.utils import getdate
	doc = frappe.new_doc("Material Request")
	doc.company = company
	doc.material_request_type = material_request_type
	doc.transaction_date = getdate()
	doc.schedule_date = getdate(schedule_date) if schedule_date else doc.transaction_date
	if set_warehouse and hasattr(doc, "set_warehouse"):
		doc.set_warehouse = set_warehouse
	if cost_center and hasattr(doc, "cost_center"):
		doc.cost_center = cost_center
	for row in items:
		item_code = (row.get("item_code") or "").strip()
		qty = flt(row.get("qty")) or 0
		if not item_code or qty <= 0:
			continue
		warehouse = (row.get("warehouse") or "").strip() or set_warehouse
		doc.append("items", {
			"item_code": item_code,
			"qty": qty,
			"warehouse": warehouse or None,
			"schedule_date": doc.schedule_date,
		})
	if not doc.items:
		frappe.throw("Add at least one item with quantity")
	doc.insert(ignore_permissions=True)
	try:
		doc.submit()
	except Exception:
		frappe.db.rollback()
		raise
	frappe.db.commit()
	return {"name": doc.name}
