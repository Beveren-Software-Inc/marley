# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt
"""
Source Income Analysis — Script Report.

Summary of income by care source (IP / OP / IOP) with the same classification
as Doctor Wise Income Analysis. Normal datatable + pie chart.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate

from healthcare.api.doctor_wise_income_analysis import build_source_income_summary


def execute(filters=None):
	filters = frappe._dict(filters or {})
	_validate(filters)

	summary = build_source_income_summary(filters)
	columns = _columns(summary)
	data = _rows(summary)
	chart = _chart(summary)
	return columns, data, None, chart


def _validate(filters):
	if not filters.get("from_date") or not filters.get("to_date"):
		frappe.throw(_("From Date and To Date are required"))
	if getdate(filters.from_date) > getdate(filters.to_date):
		frappe.throw(_("From Date cannot be after To Date"))
	period = (filters.get("period") or "Yearly").strip().title()
	if period not in ("Yearly", "Quarterly", "Monthly"):
		frappe.throw(_("Period must be Yearly, Quarterly, or Monthly"))
	filters.period = period
	filters.paid_only = cint(filters.get("paid_only"))
	filters.exclude_medicines = cint(filters.get("exclude_medicines"))
	if not filters.get("source"):
		filters.source = "Sales Invoice"


def _field(period_key: str, metric: str) -> str:
	return f"{period_key}_{metric}".replace("-", "_").replace(" ", "_")


def _columns(summary: dict) -> list[dict]:
	cols = [
		{"label": _("Source"), "fieldname": "source", "fieldtype": "Data", "width": 100},
	]
	for p in summary.get("periods") or []:
		key = p.get("key") or ""
		label = p.get("label") or key
		for metric, short in (("total", "Total"), ("discount", "Discount"), ("net", "Net")):
			cols.append(
				{
					"label": f"{label} {short}",
					"fieldname": _field(key, metric),
					"fieldtype": "Currency",
					"width": 110,
				}
			)
	cols.extend(
		[
			{"label": _("Grand Total"), "fieldname": "grand_total", "fieldtype": "Currency", "width": 120},
			{"label": _("Grand Discount"), "fieldname": "grand_discount", "fieldtype": "Currency", "width": 120},
			{"label": _("Grand Net"), "fieldname": "grand_net", "fieldtype": "Currency", "width": 120},
		]
	)
	return cols


def _rows(summary: dict) -> list[dict]:
	periods = summary.get("periods") or []
	rows = []
	for item in summary.get("rows") or []:
		by_key = {p.get("key"): p for p in (item.get("periods") or [])}
		row = {
			"source": item.get("source"),
			"grand_total": flt(item.get("total")),
			"grand_discount": flt(item.get("discount")),
			"grand_net": flt(item.get("net")),
		}
		for p in periods:
			key = p.get("key") or ""
			cell = by_key.get(key) or {}
			row[_field(key, "total")] = flt(cell.get("total"))
			row[_field(key, "discount")] = flt(cell.get("discount"))
			row[_field(key, "net")] = flt(cell.get("net"))
		rows.append(row)
	return rows


def _chart(summary: dict) -> dict | None:
	pie = summary.get("pie") or {}
	labels = pie.get("labels") or []
	values = [flt(v) for v in (pie.get("values") or [])]
	if not labels or not any(values):
		return None
	return {
		"data": {
			"labels": labels,
			"datasets": [{"name": _("Net Income"), "values": values}],
		},
		"type": "pie",
		"height": 300,
		"colors": ["#1e88e5", "#43a047", "#fb8c00"],
	}
