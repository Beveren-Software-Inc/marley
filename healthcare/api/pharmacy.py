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


PHARMACY_WAREHOUSE_DEFAULT_KEY = "pharmacy_warehouse"


def _clear_legacy_pharmacy_warehouse_permissions(user=None):
	"""Remove old Warehouse User Permissions created by an earlier pharmacy build."""
	user = user or frappe.session.user
	if not frappe.db.exists("DocType", "User Permission"):
		return
	for perm in frappe.get_all(
		"User Permission",
		filters={"user": user, "allow": "Warehouse"},
		fields=["name"],
	):
		frappe.delete_doc("User Permission", perm["name"], ignore_permissions=True, force=True)


def _saved_pharmacy_warehouse(user=None):
	user = user or frappe.session.user
	return frappe.defaults.get_user_default(PHARMACY_WAREHOUSE_DEFAULT_KEY, user) or ""


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
		_set_pharmacy_warehouse_preference(default_wh, user=user, allowed=allowed)
	return default_wh


def _set_pharmacy_warehouse_preference(warehouse, user=None, allowed=None):
	user = user or frappe.session.user
	allowed = allowed or {w["warehouse"] for w in _allowed_pharmacy_warehouses(user)}
	_clear_legacy_pharmacy_warehouse_permissions(user)

	if warehouse and warehouse.strip():
		warehouse = warehouse.strip()
		if allowed and warehouse not in allowed:
			frappe.throw(_("Warehouse {0} is not linked to your POS profile(s).").format(frappe.bold(warehouse)))
		if not frappe.db.exists("Warehouse", warehouse):
			frappe.throw(_("Warehouse {0} does not exist.").format(warehouse))
		frappe.defaults.set_user_default(PHARMACY_WAREHOUSE_DEFAULT_KEY, warehouse, user)
	else:
		frappe.defaults.clear_user_default(PHARMACY_WAREHOUSE_DEFAULT_KEY, user)


@frappe.whitelist()
def get_pharmacy_warehouse_context(auto_save=1):
	"""POS-linked warehouses for the logged-in pharmacist and active selection."""
	user = frappe.session.user
	_clear_legacy_pharmacy_warehouse_permissions(user)
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
	"""Persist pharmacist warehouse filter (user default only — not a permission)."""
	user = frappe.session.user
	allowed = {w["warehouse"] for w in _allowed_pharmacy_warehouses(user)}
	if not allowed:
		frappe.throw(_("No POS profile warehouse is assigned to your user account."))

	if warehouse and str(warehouse).strip():
		_set_pharmacy_warehouse_preference(str(warehouse).strip(), user=user, allowed=allowed)
		frappe.db.commit()
		return {"status": "set", "warehouse": str(warehouse).strip()}

	_set_pharmacy_warehouse_preference("", user=user, allowed=allowed)
	frappe.db.commit()
	return {"status": "cleared", "warehouse": ""}


def _normalize_warehouse(warehouse=None):
	warehouse = (warehouse or "").strip()
	resolved = (
		_effective_pharmacy_warehouse(warehouse=warehouse)
		if warehouse
		else _effective_pharmacy_warehouse(auto_save=True)
	)
	if resolved:
		return resolved
	# No pharmacy warehouse resolved (the user has no POS-Profile warehouse). Admins may view all
	# warehouses; any other user must NOT see every warehouse's stock — return a sentinel warehouse
	# that matches no Bin/Batch so pharmacy stock queries come back empty instead of leaking all.
	roles = set(frappe.get_roles())
	if roles & {"Administrator", "System Manager", "Healthcare Administrator"}:
		return ""
	return "__NO_PHARMACY_WAREHOUSE__"


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
	# Do NOT exclude out-of-stock bins — a fully-depleted medicine (qty <= 0) is exactly
	# what the reorder alert must surface. Order by qty ascending so the lowest/out-of-stock
	# bins come first; the per-item threshold check below decides what's actually "low".
	bin_filters = {}
	if warehouse:
		bin_filters["warehouse"] = warehouse
	bin_list = frappe.get_all(
		"Bin",
		filters=bin_filters or None,
		fields=["item_code", "warehouse", "actual_qty"],
		order_by="actual_qty asc",
		limit=limit * 3,
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
	is_medical=None,
):
	"""Create a Material Request. items: list of {item_code, qty, warehouse}.

	``is_medical`` maps to Material Request.custom_is_medical (1 = Medical, 0 = Consumable).
	"""
	if not frappe.db.exists("DocType", "Material Request"):
		frappe.throw("Material Request doctype not found")
	company = (company or "").strip()
	material_request_type = (material_request_type or "Purchase").strip()
	# Restrict to the purposes a pharmacy legitimately raises (procurement / ward indent / issue),
	# so a client can't submit an arbitrary Material Request purpose via this portal endpoint.
	allowed_mr_types = {"Purchase", "Material Transfer", "Material Issue"}
	if material_request_type not in allowed_mr_types:
		frappe.throw(_("Material Request type {0} is not allowed here.").format(material_request_type))
	items = frappe.parse_json(items) if isinstance(items, str) else (items or [])
	set_warehouse = (set_warehouse or "").strip() or None
	cost_center = (cost_center or "").strip() or None
	if not company:
		frappe.throw("Company is required")
	if not items or not isinstance(items, list):
		frappe.throw("At least one item is required")
	if is_medical is None or str(is_medical).strip() == "":
		frappe.throw(_("Please choose whether this is a Medical or Consumable material request."))
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
	if doc.meta.has_field("custom_is_medical"):
		doc.custom_is_medical = 1 if cint(is_medical) else 0
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


# ─── Pharmacy discharge checklist (standalone verify) ─────────────────────────


def _pharmacy_discharge_checklist_rows(discharge_doc) -> list[dict]:
	from healthcare.api.inpatient_admission import _serialize_discharge_draft_for_portal
	from healthcare.healthcare.discharge_checklist_permissions import user_can_edit_checklist_row

	draft = _serialize_discharge_draft_for_portal(discharge_doc)
	return [row for row in (draft.get("discharge_checklist") or []) if user_can_edit_checklist_row(row)]


@frappe.whitelist()
def list_pharmacy_discharge_pending(limit=25):
	"""Draft discharges with pending checklist lines for the logged-in user's department."""
	from healthcare.api.inpatient_admission import _ensure_discharge_admission_access

	limit = min(cint(limit) or 25, 50)
	rows = frappe.get_all(
		"Discharge",
		filters={"docstatus": 0},
		fields=["name", "admission", "file_no", "patient_name", "modified"],
		order_by="modified desc",
		limit=limit * 4,
	)
	out = []
	for row in rows:
		if not row.admission:
			continue
		try:
			_ensure_discharge_admission_access(row.admission)
		except Exception:
			continue
		adm_status = frappe.db.get_value("Inpatient Admission", row.admission, "status")
		if adm_status not in ("Admitted", "Discharge Scheduled"):
			continue
		discharge_doc = frappe.get_doc("Discharge", row.name, ignore_permissions=True)
		my_rows = _pharmacy_discharge_checklist_rows(discharge_doc)
		if not my_rows:
			continue
		pending = sum(1 for r in my_rows if not r.get("click"))
		out.append(
			{
				"admission": row.admission,
				"discharge_name": row.name,
				"patient": row.file_no,
				"patient_name": row.patient_name,
				"pending_count": pending,
				"total_count": len(my_rows),
			}
		)
		if len(out) >= limit:
			break
	return out


@frappe.whitelist()
def get_pharmacy_discharge_checklist(admission_name):
	"""Checklist lines assigned to the pharmacist's department only."""
	from healthcare.api.inpatient_admission import (
		_ensure_discharge_admission_access,
		_get_or_create_draft_discharge,
	)

	admission_name = (admission_name or "").strip()
	if not admission_name:
		frappe.throw(_("Admission is required"))

	_ensure_discharge_admission_access(admission_name)
	discharge_doc = _get_or_create_draft_discharge(admission_name)
	my_rows = _pharmacy_discharge_checklist_rows(discharge_doc)

	admission = frappe.db.get_value(
		"Inpatient Admission",
		admission_name,
		["patient", "patient_name", "status"],
		as_dict=True,
	) or {}

	pending = sum(1 for r in my_rows if not r.get("click"))
	completed = sum(1 for r in my_rows if r.get("click"))

	return {
		"admission": admission_name,
		"patient": admission.get("patient"),
		"patient_name": admission.get("patient_name"),
		"admission_status": admission.get("status"),
		"discharge_name": discharge_doc.name,
		"checklist_items": my_rows,
		"pending_count": pending,
		"completed_count": completed,
	}


@frappe.whitelist()
def save_pharmacy_discharge_checklist(admission_name, checklist):
	"""Save checklist ticks for rows the pharmacist may edit."""
	from healthcare.api.inpatient_admission import (
		_apply_discharge_payload,
		_ensure_discharge_admission_access,
		_get_or_create_draft_discharge,
		_serialize_discharge_draft_for_portal,
	)
	from healthcare.healthcare.discharge_checklist_permissions import user_can_edit_checklist_row

	admission_name = (admission_name or "").strip()
	if not admission_name:
		frappe.throw(_("Admission is required"))

	_ensure_discharge_admission_access(admission_name)
	discharge_doc = _get_or_create_draft_discharge(admission_name)
	current = _serialize_discharge_draft_for_portal(discharge_doc)
	all_rows = list(current.get("discharge_checklist") or [])

	updates = frappe.parse_json(checklist) if isinstance(checklist, str) else (checklist or [])
	update_by_name = {str(r.get("name")): r for r in updates if isinstance(r, dict) and r.get("name")}

	merged = []
	for row in all_rows:
		row_name = str(row.get("name") or "")
		if row_name in update_by_name and user_can_edit_checklist_row(row):
			updated = dict(row)
			patch = update_by_name[row_name]
			for field in ("click", "user", "name1", "date_time", "description"):
				if field in patch:
					updated[field] = patch[field]
			merged.append(updated)
		else:
			merged.append(row)

	_apply_discharge_payload(discharge_doc, {"discharge_checklist": merged})
	discharge_doc.flags.ignore_links = True
	discharge_doc.save(ignore_permissions=True)
	frappe.db.commit()

	return get_pharmacy_discharge_checklist(admission_name)
