# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt
"""
Monthly Sales Report - Pharmacy Wise

Default (Period blank): detailed pharmacy sale lines.

Period Monthly / Quarterly / Half-Yearly / Yearly: warehouse (pharmacy) rows
pivoted by period columns with amounts.
"""

from __future__ import annotations

from dateutil.relativedelta import relativedelta

import frappe
from frappe import _, scrub
from frappe.utils import cint, flt, get_first_day, get_last_day, getdate

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def execute(filters=None):
	filters = frappe._dict(filters or {})
	validate_filters(filters)

	period = (filters.get("period") or "").strip()
	lines = get_detail_lines(filters)

	if not period:
		columns = get_detail_columns()
		data = lines
		chart = get_detail_chart(data)
	else:
		periods = get_period_list(filters.from_date, filters.to_date, period)
		columns = get_period_columns(periods)
		data = get_period_data(lines, periods)
		chart = get_period_chart(data, periods)

	return columns, data, None, chart


def validate_filters(filters):
	if not filters.get("from_date") or not filters.get("to_date"):
		frappe.throw(_("From Date and To Date are required"))
	if getdate(filters.from_date) > getdate(filters.to_date):
		frappe.throw(_("From Date cannot be after To Date"))

	period = (filters.get("period") or "").strip()
	if period and period not in ("Monthly", "Quarterly", "Half-Yearly", "Yearly"):
		frappe.throw(_("Invalid Period"))


def get_detail_columns():
	return [
		{"label": _("Month"), "fieldname": "month", "fieldtype": "Data", "width": 90},
		{"label": _("Date"), "fieldname": "posting_date", "fieldtype": "Date", "width": 100},
		{"label": _("Source"), "fieldname": "source", "fieldtype": "Data", "width": 120},
		{
			"label": _("Document Type"),
			"fieldname": "voucher_type",
			"fieldtype": "Data",
			"width": 110,
		},
		{
			"label": _("Document"),
			"fieldname": "voucher_no",
			"fieldtype": "Dynamic Link",
			"options": "voucher_type",
			"width": 140,
		},
		{
			"label": _("Branch"),
			"fieldname": "cost_center",
			"fieldtype": "Link",
			"options": "Cost Center",
			"width": 140,
		},
		{
			"label": _("Warehouse"),
			"fieldname": "warehouse",
			"fieldtype": "Link",
			"options": "Warehouse",
			"width": 140,
		},
		{
			"label": _("Item"),
			"fieldname": "item_code",
			"fieldtype": "Link",
			"options": "Item",
			"width": 120,
		},
		{"label": _("Item Name"), "fieldname": "item_name", "fieldtype": "Data", "width": 180},
		{"label": _("Qty"), "fieldname": "qty", "fieldtype": "Float", "width": 80, "precision": 3},
		{"label": _("Rate"), "fieldname": "rate", "fieldtype": "Currency", "width": 100},
		{"label": _("Amount"), "fieldname": "amount", "fieldtype": "Currency", "width": 120},
		{
			"label": _("Customer"),
			"fieldname": "customer",
			"fieldtype": "Link",
			"options": "Customer",
			"width": 120,
		},
		{"label": _("Customer / Patient"), "fieldname": "party_name", "fieldtype": "Data", "width": 160},
		{
			"label": _("POS Profile"),
			"fieldname": "pos_profile",
			"fieldtype": "Link",
			"options": "POS Profile",
			"width": 130,
		},
		{
			"label": _("Company"),
			"fieldname": "company",
			"fieldtype": "Link",
			"options": "Company",
			"width": 140,
		},
	]


def get_period_columns(periods):
	columns = [
		{
			"label": _("Warehouse"),
			"fieldname": "warehouse",
			"fieldtype": "Link",
			"options": "Warehouse",
			"width": 180,
		},
		{
			"label": _("Branch"),
			"fieldname": "cost_center",
			"fieldtype": "Link",
			"options": "Cost Center",
			"width": 160,
		},
		{"label": _("Qty"), "fieldname": "qty", "fieldtype": "Float", "width": 90, "precision": 3},
	]
	for period in periods:
		columns.append(
			{
				"label": _(period["label"]),
				"fieldname": period["key"],
				"fieldtype": "Currency",
				"width": 120,
			}
		)
	columns.append(
		{"label": _("Total"), "fieldname": "total", "fieldtype": "Currency", "width": 130}
	)
	return columns


def get_detail_lines(filters):
	rows = get_pharmacy_invoice_rows(filters)
	if cint(filters.get("include_dispensed")):
		rows.extend(get_dispensed_sales_order_rows(filters))

	rows.sort(
		key=lambda r: (
			str(r.get("posting_date") or ""),
			str(r.get("voucher_type") or ""),
			str(r.get("voucher_no") or ""),
			str(r.get("item_code") or ""),
		)
	)
	return rows


def get_period_list(from_date, to_date, periodicity):
	"""Build ordered period buckets covering from_date..to_date."""
	from_date = getdate(from_date)
	to_date = getdate(to_date)
	periods = []

	if periodicity == "Monthly":
		cursor = get_first_day(from_date)
		end = get_last_day(to_date)
		cross_year = cursor.year != end.year
		while cursor <= end:
			month_end = get_last_day(cursor)
			if month_end > end:
				month_end = end
			label = MONTHS[cursor.month - 1]
			if cross_year:
				label = f"{label} {cursor.year}"
			periods.append(
				{
					"key": scrub(f"{MONTHS[cursor.month - 1]}_{cursor.year}"),
					"label": label,
					"start": cursor,
					"end": month_end,
				}
			)
			cursor = get_first_day(cursor + relativedelta(months=1))

	elif periodicity == "Quarterly":
		# Align to calendar quarter containing from_date.
		q_start_month = ((from_date.month - 1) // 3) * 3 + 1
		cursor = getdate(f"{from_date.year}-{q_start_month:02d}-01")
		while cursor <= to_date:
			q = (cursor.month - 1) // 3 + 1
			period_end = get_last_day(cursor + relativedelta(months=2))
			if period_end > to_date:
				period_end = to_date
			start = cursor if cursor >= from_date else from_date
			label = f"Q{q} {cursor.year}"
			periods.append(
				{
					"key": scrub(label),
					"label": label,
					"start": start,
					"end": period_end,
				}
			)
			cursor = get_first_day(cursor + relativedelta(months=3))

	elif periodicity == "Half-Yearly":
		h_start_month = 1 if from_date.month <= 6 else 7
		cursor = getdate(f"{from_date.year}-{h_start_month:02d}-01")
		while cursor <= to_date:
			half = 1 if cursor.month <= 6 else 2
			period_end = get_last_day(cursor + relativedelta(months=5))
			if period_end > to_date:
				period_end = to_date
			start = cursor if cursor >= from_date else from_date
			label = f"H{half} {cursor.year}"
			periods.append(
				{
					"key": scrub(label),
					"label": label,
					"start": start,
					"end": period_end,
				}
			)
			cursor = get_first_day(cursor + relativedelta(months=6))

	elif periodicity == "Yearly":
		cursor = getdate(f"{from_date.year}-01-01")
		while cursor.year <= to_date.year:
			period_end = getdate(f"{cursor.year}-12-31")
			if period_end > to_date:
				period_end = to_date
			start = cursor if cursor >= from_date else from_date
			label = str(cursor.year)
			periods.append(
				{
					"key": scrub(label),
					"label": label,
					"start": start,
					"end": period_end,
				}
			)
			cursor = getdate(f"{cursor.year + 1}-01-01")

	return periods


def _period_key_for_date(txn_date, periods):
	txn_date = getdate(txn_date)
	for period in periods:
		if period["start"] <= txn_date <= period["end"]:
			return period["key"]
	return None


def get_period_data(lines, periods):
	"""Aggregate detail lines into warehouse × period amount matrix."""
	if not lines or not periods:
		return []

	by_wh = {}
	for line in lines:
		warehouse = line.get("warehouse") or _("No Warehouse")
		if warehouse not in by_wh:
			by_wh[warehouse] = {
				"warehouse": None if warehouse == _("No Warehouse") else warehouse,
				"cost_center": line.get("cost_center"),
				"qty": 0.0,
				"total": 0.0,
				**{p["key"]: 0.0 for p in periods},
			}

		row = by_wh[warehouse]
		amount = flt(line.get("amount"))
		qty = flt(line.get("qty"))
		period_key = _period_key_for_date(line.get("posting_date"), periods)

		row["qty"] += qty
		row["total"] += amount
		if period_key:
			row[period_key] += amount
		# Prefer a non-empty branch when aggregating.
		if not row.get("cost_center") and line.get("cost_center"):
			row["cost_center"] = line.get("cost_center")

	return sorted(by_wh.values(), key=lambda r: r["total"], reverse=True)


def get_detail_chart(data):
	if not data:
		return None

	by_warehouse = {}
	for row in data:
		key = row.get("warehouse") or _("No Warehouse")
		by_warehouse[key] = by_warehouse.get(key, 0) + flt(row.get("amount"))

	labels = list(by_warehouse.keys())
	values = [by_warehouse[k] for k in labels]
	return {
		"data": {
			"labels": labels,
			"datasets": [{"name": _("Amount"), "values": values}],
		},
		"type": "bar",
		"fieldtype": "Currency",
	}


def get_period_chart(data, periods):
	if not data or not periods:
		return None

	labels = [p["label"] for p in periods]
	values = [flt(sum(flt(row.get(p["key"])) for row in data)) for p in periods]
	return {
		"data": {
			"labels": labels,
			"datasets": [{"name": _("Amount"), "values": values}],
		},
		"type": "bar",
		"fieldtype": "Currency",
	}


def _stock_item_condition(alias="item"):
	if frappe.db.has_column("Item", "custom_is_pharmacy_service"):
		return (
			f"(IFNULL({alias}.is_stock_item, 0) = 1 "
			f"OR IFNULL({alias}.custom_is_pharmacy_service, 0) = 1)"
		)
	return f"IFNULL({alias}.is_stock_item, 0) = 1"


def get_pharmacy_invoice_rows(filters):
	"""Retail pharmacy POS sales (Sales Invoice)."""
	conditions = [
		"si.docstatus = 1",
		"si.posting_date BETWEEN %(from_date)s AND %(to_date)s",
		"IFNULL(si.is_pos, 0) = 1",
		_stock_item_condition("item"),
	]
	values = {
		"from_date": filters.from_date,
		"to_date": filters.to_date,
	}

	if frappe.db.has_column("POS Profile", "custom_is_pharmacy"):
		conditions.append("IFNULL(pp.custom_is_pharmacy, 0) = 1")
	if frappe.db.has_column("POS Profile", "custom_is_hospital_pharmacy"):
		conditions.append("IFNULL(pp.custom_is_hospital_pharmacy, 0) = 0")

	if filters.get("company"):
		conditions.append("si.company = %(company)s")
		values["company"] = filters.company

	has_created_at = frappe.db.has_column("Sales Invoice", "custom_created_at")
	if filters.get("cost_center"):
		if has_created_at:
			conditions.append(
				"""(
					si.cost_center = %(cost_center)s
					OR sii.cost_center = %(cost_center)s
					OR IFNULL(si.custom_created_at, '') = %(cost_center)s
				)"""
			)
		else:
			conditions.append(
				"(si.cost_center = %(cost_center)s OR sii.cost_center = %(cost_center)s)"
			)
		values["cost_center"] = filters.cost_center

	if filters.get("warehouse"):
		conditions.append(
			"(IFNULL(sii.warehouse, si.set_warehouse) = %(warehouse)s OR si.set_warehouse = %(warehouse)s)"
		)
		values["warehouse"] = filters.warehouse

	if has_created_at:
		branch_expr = (
			"COALESCE(NULLIF(sii.cost_center, ''), NULLIF(si.cost_center, ''), si.custom_created_at)"
		)
	else:
		branch_expr = "COALESCE(NULLIF(sii.cost_center, ''), si.cost_center)"

	party_expr = "COALESCE(si.patient_name, si.customer_name, si.customer)"
	where_sql = " AND ".join(conditions)

	query = f"""
		SELECT
			DATE_FORMAT(si.posting_date, '%%b %%Y') AS month,
			si.posting_date,
			'Pharmacy Sale' AS source,
			'Sales Invoice' AS voucher_type,
			si.name AS voucher_no,
			{branch_expr} AS cost_center,
			COALESCE(NULLIF(sii.warehouse, ''), si.set_warehouse) AS warehouse,
			sii.item_code,
			sii.item_name,
			sii.qty,
			sii.rate,
			sii.amount,
			si.customer,
			{party_expr} AS party_name,
			si.pos_profile,
			si.company
		FROM `tabSales Invoice` si
		INNER JOIN `tabSales Invoice Item` sii ON sii.parent = si.name
		LEFT JOIN `tabPOS Profile` pp ON pp.name = si.pos_profile
		LEFT JOIN `tabItem` item ON item.name = sii.item_code
		WHERE {where_sql}
		ORDER BY si.posting_date, si.name, sii.idx
	"""
	return frappe.db.sql(query, values, as_dict=True)


def get_dispensed_sales_order_rows(filters):
	"""Hospital dispense via Sales Order (custom_is_pos), not mixed billing invoices."""
	if not frappe.db.has_column("Sales Order", "custom_is_pos"):
		return []

	conditions = [
		"so.docstatus = 1",
		"so.transaction_date BETWEEN %(from_date)s AND %(to_date)s",
		"IFNULL(so.custom_is_pos, 0) = 1",
		_stock_item_condition("item"),
	]
	values = {
		"from_date": filters.from_date,
		"to_date": filters.to_date,
	}

	if filters.get("company"):
		conditions.append("so.company = %(company)s")
		values["company"] = filters.company

	if filters.get("cost_center"):
		conditions.append(
			"(so.cost_center = %(cost_center)s OR soi.cost_center = %(cost_center)s)"
		)
		values["cost_center"] = filters.cost_center

	if filters.get("warehouse"):
		conditions.append(
			"(IFNULL(soi.warehouse, so.set_warehouse) = %(warehouse)s OR so.set_warehouse = %(warehouse)s)"
		)
		values["warehouse"] = filters.warehouse

	party_expr = "COALESCE(so.customer_name, so.customer)"
	if frappe.db.has_column("Sales Order", "custom_patient_name"):
		party_expr = (
			"COALESCE(NULLIF(so.custom_patient_name, ''), so.customer_name, so.customer)"
		)

	where_sql = " AND ".join(conditions)
	query = f"""
		SELECT
			DATE_FORMAT(so.transaction_date, '%%b %%Y') AS month,
			so.transaction_date AS posting_date,
			'Dispensed' AS source,
			'Sales Order' AS voucher_type,
			so.name AS voucher_no,
			COALESCE(NULLIF(soi.cost_center, ''), so.cost_center) AS cost_center,
			COALESCE(NULLIF(soi.warehouse, ''), so.set_warehouse) AS warehouse,
			soi.item_code,
			soi.item_name,
			soi.qty,
			soi.rate,
			soi.amount,
			so.customer,
			{party_expr} AS party_name,
			NULL AS pos_profile,
			so.company
		FROM `tabSales Order` so
		INNER JOIN `tabSales Order Item` soi ON soi.parent = so.name
		LEFT JOIN `tabItem` item ON item.name = soi.item_code
		WHERE {where_sql}
		ORDER BY so.transaction_date, so.name, soi.idx
	"""
	return frappe.db.sql(query, values, as_dict=True)
