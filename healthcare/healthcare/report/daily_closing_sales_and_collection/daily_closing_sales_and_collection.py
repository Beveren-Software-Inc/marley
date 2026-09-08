# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt
"""
Daily Closing Sales and Collection.

Sales = submitted Sales Invoices posted in the period (returns as negative).
Collection = submitted Payment Entry receipts posted in the period
(same source as Daily Collection Summary / Patient Receipts).

Views:
- Consolidated: branch rows with sales, collection by mode, total, variance
- By Branch: sales vs collection per branch (Cost Center in the backend)
- By Mode of Payment: collection split by mode
"""

from __future__ import annotations

from collections import defaultdict

import frappe
from frappe import _, scrub
from frappe.utils import flt, fmt_money, getdate

from healthcare.api.common import resolve_cost_center_filter

UNSET = "Not Set"


def execute(filters=None):
	filters = frappe._dict(filters or {})
	validate_filters(filters)

	view = normalize_view(filters.get("view"))
	if resolve_scope(filters) is False:
		columns = get_columns(view, [])
		return columns, [], None, None

	sales = fetch_sales(filters)
	collections = fetch_collections(filters)
	modes = distinct_modes(collections)

	if view == "By Branch":
		columns = get_cost_center_columns()
		data = get_cost_center_data(sales, collections)
	elif view == "By Mode of Payment":
		columns = get_mode_columns()
		data = get_mode_data(collections)
	else:
		columns = get_consolidated_columns(modes)
		data = get_consolidated_data(sales, collections, modes)

	message = summary_message(sales, collections, filters.company)
	chart = get_chart(view, data, modes)
	return columns, data, message, chart


def validate_filters(filters):
	if not filters.get("company"):
		frappe.throw(_("Company is required"))
	if not filters.get("from_date") or not filters.get("to_date"):
		frappe.throw(_("From Date and To Date are required"))
	if getdate(filters.from_date) > getdate(filters.to_date):
		frappe.throw(_("From Date cannot be after To Date"))
	view = normalize_view(filters.get("view"))
	if view not in ("Consolidated", "By Branch", "By Mode of Payment"):
		frappe.throw(_("Invalid View"))
	filters.view = view
	filters.from_date = getdate(filters.from_date)
	filters.to_date = getdate(filters.to_date)


def resolve_scope(filters):
	resolved = resolve_cost_center_filter(filters.get("cost_center"))
	if resolved is False:
		return False
	filters.resolved_cc = resolved
	return True


def normalize_view(view):
	view = (view or "Consolidated").strip() or "Consolidated"
	if view == "By Cost Center":
		return "By Branch"
	return view


def get_columns(view, modes):
	if view == "By Branch":
		return get_cost_center_columns()
	if view == "By Mode of Payment":
		return get_mode_columns()
	return get_consolidated_columns(modes)


def currency_col(label, fieldname, width=130):
	return {
		"label": _(label),
		"fieldname": fieldname,
		"fieldtype": "Currency",
		"width": width,
	}


def get_consolidated_columns(modes):
	columns = [
		{
			"label": _("Branch"),
			"fieldname": "cost_center_name",
			"fieldtype": "Data",
			"width": 200,
		},
		currency_col("Sales", "sales"),
	]
	for mode in modes:
		columns.append(currency_col(mode, mode_field(mode), 120))
	columns.append(currency_col("Total Collection", "total_collection", 140))
	columns.append(currency_col("Variance", "variance"))
	return columns


def get_cost_center_columns():
	return [
		{
			"label": _("Branch"),
			"fieldname": "cost_center_name",
			"fieldtype": "Data",
			"width": 200,
		},
		{"label": _("Invoices"), "fieldname": "invoices", "fieldtype": "Int", "width": 90},
		currency_col("Sales", "sales"),
		{"label": _("Payments"), "fieldname": "payments", "fieldtype": "Int", "width": 90},
		currency_col("Collection", "collection"),
		currency_col("Variance", "variance"),
	]


def get_mode_columns():
	return [
		{
			"label": _("Mode of Payment"),
			"fieldname": "mode_of_payment",
			"fieldtype": "Data",
			"width": 200,
		},
		{"label": _("Payments"), "fieldname": "payments", "fieldtype": "Int", "width": 100},
		currency_col("Collection", "collection"),
		{
			"label": _("% of Collection"),
			"fieldname": "percent",
			"fieldtype": "Percent",
			"width": 130,
		},
	]


def get_consolidated_data(sales, collections, modes):
	sales_by_cc = aggregate_sales(sales)
	coll_by_cc = aggregate_collection_by_cc_mode(collections)
	centers = sorted(set(sales_by_cc) | set(coll_by_cc), key=lambda cc: cost_center_name(cc))

	rows = []
	totals = empty_consolidated_row(None, _("Total"), modes)
	totals["is_total"] = 1

	for cc in centers:
		sales_row = sales_by_cc.get(cc) or {"invoices": 0, "sales": 0.0}
		mode_map = coll_by_cc.get(cc) or {}
		row = empty_consolidated_row(cc, cost_center_name(cc), modes)
		row["sales"] = flt(sales_row["sales"])
		row["total_collection"] = flt(sum(mode_map.values()))
		for mode in modes:
			row[mode_field(mode)] = flt(mode_map.get(mode, 0))
		row["variance"] = flt(row["sales"] - row["total_collection"])
		add_consolidated_into(totals, row, modes)
		rows.append(row)

	if rows:
		rows.append(totals)
	return rows


def get_cost_center_data(sales, collections):
	sales_by_cc = aggregate_sales(sales)
	coll_by_cc = aggregate_collection_by_cc(collections)
	centers = sorted(set(sales_by_cc) | set(coll_by_cc), key=lambda cc: cost_center_name(cc))

	rows = []
	totals = {
		"cost_center": None,
		"cost_center_name": _("Total"),
		"invoices": 0,
		"sales": 0.0,
		"payments": 0,
		"collection": 0.0,
		"variance": 0.0,
		"is_total": 1,
	}
	for cc in centers:
		s = sales_by_cc.get(cc) or {"invoices": 0, "sales": 0.0}
		c = coll_by_cc.get(cc) or {"payments": 0, "collection": 0.0}
		row = {
			"cost_center": cc or None,
			"cost_center_name": cost_center_name(cc),
			"invoices": cint_safe(s["invoices"]),
			"sales": flt(s["sales"]),
			"payments": cint_safe(c["payments"]),
			"collection": flt(c["collection"]),
			"variance": flt(s["sales"] - c["collection"]),
		}
		totals["invoices"] += row["invoices"]
		totals["sales"] += row["sales"]
		totals["payments"] += row["payments"]
		totals["collection"] += row["collection"]
		totals["variance"] += row["variance"]
		rows.append(row)

	if rows:
		rows.append(totals)
	return rows


def get_mode_data(collections):
	by_mode = aggregate_collection_by_mode(collections)
	total = sum(v["collection"] for v in by_mode.values())
	rows = []
	for mode in sorted(by_mode, key=lambda m: (-by_mode[m]["collection"], m)):
		amount = flt(by_mode[mode]["collection"])
		rows.append(
			{
				"mode_of_payment": mode,
				"payments": cint_safe(by_mode[mode]["payments"]),
				"collection": amount,
				"percent": flt((amount / total) * 100) if total else 0.0,
			}
		)
	if rows:
		rows.append(
			{
				"mode_of_payment": _("Total"),
				"payments": sum(r["payments"] for r in rows),
				"collection": flt(total),
				"percent": 100.0 if total else 0.0,
				"is_total": 1,
			}
		)
	return rows


def empty_consolidated_row(cc, name, modes):
	row = {
		"cost_center": cc or None,
		"cost_center_name": name,
		"sales": 0.0,
		"total_collection": 0.0,
		"variance": 0.0,
	}
	for mode in modes:
		row[mode_field(mode)] = 0.0
	return row


def add_consolidated_into(totals, row, modes):
	totals["sales"] += row["sales"]
	totals["total_collection"] += row["total_collection"]
	totals["variance"] += row["variance"]
	for mode in modes:
		key = mode_field(mode)
		totals[key] += row.get(key, 0)


def fetch_sales(filters):
	params = {
		"company": filters.company,
		"from_date": filters.from_date,
		"to_date": filters.to_date,
	}
	conditions = [
		"si.docstatus = 1",
		"si.company = %(company)s",
		"si.posting_date >= %(from_date)s",
		"si.posting_date <= %(to_date)s",
	]
	cc_clause = cost_center_clause("si.cost_center", filters, params)
	if cc_clause is None:
		return []
	if cc_clause:
		conditions.append(cc_clause)

	return frappe.db.sql(
		f"""
		SELECT
			IFNULL(si.cost_center, '') AS cost_center,
			COUNT(*) AS invoices,
			SUM(si.grand_total) AS sales
		FROM `tabSales Invoice` si
		WHERE {" AND ".join(conditions)}
		GROUP BY IFNULL(si.cost_center, '')
		""",
		params,
		as_dict=True,
	)


def fetch_collections(filters):
	params = {
		"company": filters.company,
		"from_date": filters.from_date,
		"to_date": filters.to_date,
	}
	conditions = [
		"pe.docstatus = 1",
		"pe.payment_type = 'Receive'",
		"pe.company = %(company)s",
		"pe.posting_date >= %(from_date)s",
		"pe.posting_date <= %(to_date)s",
	]
	cc_expr = "IFNULL(NULLIF(pe.cost_center, ''), IFNULL(si.cost_center, ''))"
	cc_clause = cost_center_clause(cc_expr, filters, params)
	if cc_clause is None:
		return []
	if cc_clause:
		conditions.append(cc_clause)

	return frappe.db.sql(
		f"""
		SELECT
			pe.name,
			MAX(IFNULL(NULLIF(pe.mode_of_payment, ''), '{UNSET}')) AS mode_of_payment,
			MAX(pe.paid_amount) AS collection,
			MAX({cc_expr}) AS cost_center
		FROM `tabPayment Entry` pe
		LEFT JOIN `tabPayment Entry Reference` per
			ON per.parent = pe.name
			AND per.reference_doctype = 'Sales Invoice'
		LEFT JOIN `tabSales Invoice` si
			ON si.name = per.reference_name
		WHERE {" AND ".join(conditions)}
		GROUP BY pe.name
		""",
		params,
		as_dict=True,
	)


def cost_center_clause(field_expr, filters, params):
	resolved = filters.get("resolved_cc")
	if resolved is False:
		return None
	if not resolved:
		return ""
	if isinstance(resolved, (list, tuple)):
		if not resolved:
			return None
		params["cost_centers"] = tuple(resolved)
		return f"IFNULL({field_expr}, '') IN %(cost_centers)s"
	params["cost_center"] = resolved
	return f"IFNULL({field_expr}, '') = %(cost_center)s"


def aggregate_sales(rows):
	out = {}
	for row in rows:
		cc = (row.cost_center or "").strip()
		out[cc] = {
			"invoices": cint_safe(row.invoices),
			"sales": flt(row.sales),
		}
	return out


def aggregate_collection_by_cc(rows):
	out = defaultdict(lambda: {"payments": 0, "collection": 0.0})
	for row in rows:
		cc = (row.cost_center or "").strip()
		out[cc]["payments"] += 1
		out[cc]["collection"] += flt(row.collection)
	return out


def aggregate_collection_by_cc_mode(rows):
	out = defaultdict(lambda: defaultdict(float))
	for row in rows:
		cc = (row.cost_center or "").strip()
		mode = (row.mode_of_payment or UNSET).strip() or UNSET
		out[cc][mode] += flt(row.collection)
	return out


def aggregate_collection_by_mode(rows):
	out = defaultdict(lambda: {"payments": 0, "collection": 0.0})
	for row in rows:
		mode = (row.mode_of_payment or UNSET).strip() or UNSET
		out[mode]["payments"] += 1
		out[mode]["collection"] += flt(row.collection)
	return out


def distinct_modes(collections):
	totals = defaultdict(float)
	for row in collections:
		mode = (row.mode_of_payment or UNSET).strip() or UNSET
		totals[mode] += flt(row.collection)
	return sorted(totals, key=lambda m: (-totals[m], m))


def mode_field(mode):
	return "mop_" + (scrub(mode) or "not_set")


def cost_center_name(cc):
	if not cc:
		return _(UNSET)
	name = frappe.get_cached_value("Cost Center", cc, "cost_center_name")
	return name or cc


def summary_message(sales, collections, company):
	total_sales = sum(flt(r.sales) for r in sales)
	total_collection = sum(flt(r.collection) for r in collections)
	variance = flt(total_sales - total_collection)
	currency = frappe.get_cached_value("Company", company, "default_currency")
	return _("Sales: {0}    Collection: {1}    Variance: {2}").format(
		fmt_money(total_sales, currency=currency),
		fmt_money(total_collection, currency=currency),
		fmt_money(variance, currency=currency),
	)


def get_chart(view, data, modes):
	body = [r for r in data if not r.get("is_total")]
	if not body:
		return None

	if view == "By Mode of Payment":
		return {
			"data": {
				"labels": [r["mode_of_payment"] for r in body],
				"datasets": [{"name": _("Collection"), "values": [flt(r["collection"]) for r in body]}],
			},
			"type": "bar",
		}

	labels = [r.get("cost_center_name") or r.get("cost_center") or UNSET for r in body]
	if view == "By Branch":
		return {
			"data": {
				"labels": labels,
				"datasets": [
					{"name": _("Sales"), "values": [flt(r["sales"]) for r in body]},
					{"name": _("Collection"), "values": [flt(r["collection"]) for r in body]},
				],
			},
			"type": "bar",
		}

	return {
		"data": {
			"labels": labels,
			"datasets": [
				{"name": _("Sales"), "values": [flt(r["sales"]) for r in body]},
				{"name": _("Collection"), "values": [flt(r["total_collection"]) for r in body]},
			],
		},
		"type": "bar",
	}


def cint_safe(value):
	return int(flt(value))
