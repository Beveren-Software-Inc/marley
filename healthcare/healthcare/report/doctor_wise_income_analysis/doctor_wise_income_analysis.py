# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt
"""
Doctor Wise Income Analysis — Script Report.

Same HTML layout as the Single DocType form: break From–To by Yearly /
Quarterly / Monthly into IP / OP / IOP / Total / Discount / Net Total columns.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, now_datetime

from healthcare.api.doctor_wise_income_analysis import (
	build_analysis,
	build_frappe_chart,
	render_analysis_html,
)


def execute(filters=None):
	filters = frappe._dict(filters or {})
	_validate(filters)

	analysis = build_analysis(filters)
	filters.generated_on = now_datetime()
	html = render_analysis_html(filters, analysis, include_chart=True)

	columns = _columns(analysis)
	data = _rows(analysis)
	chart = build_frappe_chart(analysis)
	return columns, data, html, chart


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


def _columns(analysis: dict) -> list[dict]:
	cols = [
		{"label": _("Rank"), "fieldname": "rank_no", "fieldtype": "Int", "width": 60},
		{"label": _("Doctor Name"), "fieldname": "doctor_name", "fieldtype": "Data", "width": 220},
	]
	for p in analysis.get("periods") or []:
		key = p.get("key") or ""
		label = p.get("label") or key
		for metric, short in (
			("ip", "IP"),
			("op", "OP"),
			("iop", "IOP"),
			("total", "Total"),
			("discount", "Discount"),
			("net", "Net"),
		):
			cols.append(
				{
					"label": f"{label} {short}",
					"fieldname": _field(key, metric),
					"fieldtype": "Currency",
					"width": 90,
				}
			)
	return cols


def _rows(analysis: dict) -> list[dict]:
	periods = analysis.get("periods") or []
	rows = []
	for doctor in analysis.get("doctors") or []:
		by_key = {p.get("key"): p for p in (doctor.get("periods") or [])}
		row = {
			"rank_no": cint(doctor.get("rank_no")) or None,
			"doctor_name": doctor.get("doctor_name"),
		}
		for p in periods:
			key = p.get("key") or ""
			bucket = by_key.get(key) or {}
			for metric in ("ip", "op", "iop", "total", "discount", "net"):
				row[_field(key, metric)] = flt(bucket.get(metric))
		rows.append(row)
	return rows
