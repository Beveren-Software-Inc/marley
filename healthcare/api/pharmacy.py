# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# Pharmacy dashboard APIs for React UI: batch expiry and low stock.

import frappe
from frappe import _
from frappe.utils import add_days, getdate, flt, cint


def _user_pos_profile_rows(user=None):
	"""POS profiles assigned to the user with warehouse."""
	user = user or frappe.session.user
	if not frappe.db.exists("DocType", "POS Profile"):
		return []
	return frappe.db.sql(
		"""
		SELECT
			pp.name AS pos_profile,
			pp.warehouse,
			pp.company,
			COALESCE(ppu.`default`, 0) AS is_default
		FROM `tabPOS Profile` pp
		INNER JOIN `tabPOS Profile User` ppu ON ppu.parent = pp.name
		WHERE ppu.user = %(user)s
		  AND IFNULL(pp.disabled, 0) = 0
		  AND IFNULL(pp.warehouse, '') != ''
		ORDER BY ppu.`default` DESC, pp.name ASC
		""",
		{"user": user},
		as_dict=True,
	)


def _open_pos_profile_for_user(user=None):
	user = user or frappe.session.user
	if not frappe.db.exists("DocType", "POS Opening Entry"):
		return None
	return frappe.db.get_value(
		"POS Opening Entry",
		{"user": user, "status": "Open", "docstatus": 1},
		["name", "pos_profile"],
		as_dict=True,
	)


def _saved_pharmacy_warehouse(user=None):
	user = user or frappe.session.user
	if not frappe.db.exists("DocType", "User Permission"):
		return ""
	row = frappe.db.get_value(
		"User Permission",
		{"user": user, "allow": "Warehouse"},
		"for_value",
	)
	return row or ""


def _allowed_pharmacy_warehouses(user=None):
	seen = set()
	warehouses = []
	for row in _user_pos_profile_rows(user):
		wh = row.get("warehouse")
		if wh and wh not in seen:
			seen.add(wh)
			warehouses.append(
				{
					"warehouse": wh,
					"pos_profile": row.get("pos_profile"),
					"company": row.get("company"),
				}
			)
	return warehouses


def _resolve_default_pharmacy_warehouse(user=None):
	"""Open POS profile warehouse, else default POS profile, else first profile."""
	user = user or frappe.session.user
	profiles = _user_pos_profile_rows(user)
	if not profiles:
		return ""

	open_pos = _open_pos_profile_for_user(user)
	if open_pos and open_pos.get("pos_profile"):
		for row in profiles:
			if row.get("pos_profile") == open_pos.get("pos_profile") and row.get("warehouse"):
				return row.get("warehouse")

	for row in profiles:
		if cint(row.get("is_default")) and row.get("warehouse"):
			return row.get("warehouse")

	return profiles[0].get("warehouse") if profiles else ""


def _effective_pharmacy_warehouse(user=None, warehouse=None, auto_save=False):
	user = user or frappe.session.user
	allowed = {w["warehouse"] for w in _allowed_pharmacy_warehouses(user)}
	if not allowed:
		return warehouse or ""

	saved = _saved_pharmacy_warehouse(user)
	if warehouse and warehouse in allowed:
		return warehouse
	if saved and saved in allowed:
		return saved

	default_wh = _resolve_default_pharmacy_warehouse(user)
	if auto_save and default_wh and default_wh != saved:
		_set_pharmacy_warehouse_permission(default_wh, user=user, allowed=allowed)
	return default_wh


def _set_pharmacy_warehouse_permission(warehouse, user=None, allowed=None):
	user = user or frappe.session.user
	allowed = allowed or {w["warehouse"] for w in _allowed_pharmacy_warehouses(user)}

	old_perms = frappe.get_all(
		"User Permission",
		filters={"user": user, "allow": "Warehouse"},
		fields=["name"],
	)
	for perm in old_perms:
		frappe.delete_doc("User Permission", perm["name"], ignore_permissions=True, force=True)

	if warehouse and warehouse.strip():
		warehouse = warehouse.strip()
		if allowed and warehouse not in allowed:
			frappe.throw(_("Warehouse {0} is not linked to your POS profile(s).").format(frappe.bold(warehouse)))
		if not frappe.db.exists("Warehouse", warehouse):
			frappe.throw(_("Warehouse {0} does not exist.").format(warehouse))
		frappe.get_doc(
			{
				"doctype": "User Permission",
				"user": user,
				"allow": "Warehouse",
				"for_value": warehouse,
				"apply_to_all_doctypes": 1,
			}
		).insert(ignore_permissions=True)


@frappe.whitelist()
def get_pharmacy_warehouse_context(auto_save=1):
	"""POS-linked warehouses for the logged-in pharmacist and active selection."""
	user = frappe.session.user
	profiles = _user_pos_profile_rows(user)
	warehouses = _allowed_pharmacy_warehouses(user)
	open_pos = _open_pos_profile_for_user(user)
	saved = _saved_pharmacy_warehouse(user)
	auto_save = cint(auto_save)
	selected = _effective_pharmacy_warehouse(user=user, auto_save=auto_save)
	if auto_save and selected and selected != saved:
		frappe.db.commit()
		saved = selected

	return {
		"has_pos_profiles": bool(profiles),
		"warehouses": warehouses,
		"selected_warehouse": selected,
		"saved_warehouse": saved,
		"open_pos_profile": open_pos.get("pos_profile") if open_pos else None,
		"open_pos_entry": open_pos.get("name") if open_pos else None,
		"default_warehouse": _resolve_default_pharmacy_warehouse(user),
	}


@frappe.whitelist()
def set_pharmacy_warehouse_preference(warehouse=None):
	"""Persist pharmacist warehouse preference (User Permission)."""
	user = frappe.session.user
	allowed = {w["warehouse"] for w in _allowed_pharmacy_warehouses(user)}
	if not allowed:
		frappe.throw(_("No POS profile warehouse is assigned to your user account."))

	if warehouse and str(warehouse).strip():
		_set_pharmacy_warehouse_permission(str(warehouse).strip(), user=user, allowed=allowed)
		frappe.db.commit()
		return {"status": "set", "warehouse": str(warehouse).strip()}

	_set_pharmacy_warehouse_permission("", user=user, allowed=allowed)
	frappe.db.commit()
	return {"status": "cleared", "warehouse": ""}


def _normalize_warehouse(warehouse=None):
	warehouse = (warehouse or "").strip()
	if warehouse:
		return _effective_pharmacy_warehouse(warehouse=warehouse)
	return _effective_pharmacy_warehouse(auto_save=True)


@frappe.whitelist()
def get_batches_expiring_tomorrow(limit=100, warehouse=None):
	"""Batches expiring tomorrow (next calendar day)."""
	limit = cint(limit) or 100
	tomorrow = add_days(getdate(), 1)
	return _get_batches_for_date(tomorrow, limit, warehouse=_normalize_warehouse(warehouse))


@frappe.whitelist()
def get_batches_expiring_in_week(limit=200, warehouse=None):
	"""Batches expiring within the next 7 days (excluding tomorrow if needed for separate card)."""
	limit = cint(limit) or 200
	today = getdate()
	# From day after tomorrow through 7 days from today
	from_date = add_days(today, 2)
	to_date = add_days(today, 7)
	return _get_batches_in_date_range(from_date, to_date, limit, warehouse=_normalize_warehouse(warehouse))


@frappe.whitelist()
def get_batches_expiring_in_days(days=7, limit=200, warehouse=None):
	"""Batches expiring within the next N days (from today through today + days)."""
	limit = cint(limit) or 200
	days = cint(days) or 7
	today = getdate()
	to_date = add_days(today, days)
	return _get_batches_in_date_range(today, to_date, limit, warehouse=_normalize_warehouse(warehouse))


@frappe.whitelist()
def get_low_stock_items(limit=100, threshold=None, warehouse=None):
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
	warehouse = _normalize_warehouse(warehouse)
	# Default low-stock threshold if no reorder level: 10
	default_threshold = 10
	bin_filters = {"actual_qty": [">", 0]}
	if warehouse:
		bin_filters["warehouse"] = warehouse
	bin_list = frappe.get_all(
		"Bin",
		filters=bin_filters,
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


def _get_batches_for_date(target_date, limit, warehouse=None):
	"""Batches expiring on exactly target_date."""
	if not frappe.db.exists("DocType", "Batch"):
		return []
	target_str = target_date.strftime("%Y-%m-%d")
	batches = frappe.get_all(
		"Batch",
		filters={"expiry_date": target_str, "disabled": 0},
		fields=["name", "item", "item_name", "expiry_date", "batch_qty", "stock_uom"],
		order_by="expiry_date asc",
		limit=limit * 5 if warehouse else limit,
	)
	return _filter_batches_for_warehouse(batches, warehouse, limit)


def _batch_qty_in_warehouse(batch_no, item_code, warehouse):
	if not warehouse:
		return flt(frappe.db.get_value("Batch", batch_no, "batch_qty"))
	try:
		from erpnext.stock.doctype.batch.batch import get_batch_qty

		return flt(get_batch_qty(batch_no=batch_no, warehouse=warehouse, item_code=item_code))
	except Exception:
		return 0.0


def _filter_batches_for_warehouse(batches, warehouse, limit):
	if not warehouse:
		return list(batches)[:limit]
	out = []
	for batch in batches:
		qty = _batch_qty_in_warehouse(batch.get("name"), batch.get("item"), warehouse)
		if qty <= 0:
			continue
		row = dict(batch)
		row["batch_qty"] = qty
		row["warehouse"] = warehouse
		out.append(row)
		if len(out) >= limit:
			break
	return out


def _get_batches_in_date_range(from_date, to_date, limit, warehouse=None):
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
		limit=limit * 5 if warehouse else limit,
	)
	return _filter_batches_for_warehouse(batches, warehouse, limit)


@frappe.whitelist()
def search_item_or_batch(query="", limit=100, warehouse=None):
	"""
	Search by item name/code or batch id. Returns rows with item_name, batch (if exist), stock_quantity, expiry_date (if exist).
	"""
	limit = cint(limit) or 100
	query = (query or "").strip()
	if not query:
		return []
	warehouse = _normalize_warehouse(warehouse)
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
			stock_qty = flt(b.get("batch_qty"))
			if warehouse and b.get("name"):
				stock_qty = _batch_qty_in_warehouse(b.get("name"), b.get("item"), warehouse)
			if warehouse and stock_qty <= 0:
				continue
			out.append({
				"item_code": b.get("item"),
				"item_name": b.get("item_name") or b.get("item") or "",
				"batch": b.get("name"),
				"stock_quantity": stock_qty,
				"stock_uom": b.get("stock_uom"),
				"expiry_date": b.get("expiry_date"),
				"warehouse": warehouse,
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
					batch_qty = flt(b.get("batch_qty"))
					if warehouse:
						batch_qty = _batch_qty_in_warehouse(b.get("name"), item_code, warehouse)
					if warehouse and batch_qty <= 0:
						continue
					out.append({
						"item_code": item_code,
						"item_name": item_name,
						"batch": b.get("name"),
						"stock_quantity": batch_qty,
						"stock_uom": b.get("stock_uom"),
						"expiry_date": b.get("expiry_date"),
						"warehouse": warehouse,
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
				bin_filters = {"item_code": item_code}
				if warehouse:
					bin_filters["warehouse"] = warehouse
				bin_sum = frappe.db.sql(
					"select sum(actual_qty) from tabBin where item_code = %s"
					+ (" and warehouse = %s" if warehouse else ""),
					(item_code, warehouse) if warehouse else (item_code,),
					as_list=1,
				)
				if bin_sum and bin_sum[0][0]:
					qty = flt(bin_sum[0][0])
			if warehouse and qty <= 0:
				continue
			out.append({
				"item_code": item_code,
				"item_name": item_name,
				"batch": None,
				"stock_quantity": qty,
				"stock_uom": None,
				"expiry_date": None,
				"warehouse": warehouse,
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
	pos_warehouses = _allowed_pharmacy_warehouses()
	selected_warehouse = _effective_pharmacy_warehouse(auto_save=True)
	warehouses = []
	if pos_warehouses:
		warehouses = [{"name": w["warehouse"]} for w in pos_warehouses]
	elif frappe.db.exists("DocType", "Warehouse"):
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
		"default_warehouse": selected_warehouse,
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
