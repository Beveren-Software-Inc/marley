# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt
"""
Patient Wise Income Analysis — Script Report.

Same IP / OP / IOP / Total / Discount / Net period layout as Doctor Wise
Income Analysis, grouped by Patient. Limited to top N patients (scrollable
datatable); raise Limit filter to see more.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate

from healthcare.api.patient_wise_income_analysis import (
	DEFAULT_LIMIT,
	build_patient_analysis,
	build_patient_frappe_chart,
)


def execute(filters=None):
	filters = frappe._dict(filters or {})
	_validate(filters)

	analysis = build_patient_analysis(filters)
	columns = _columns(analysis)
	data = _rows(analysis)
	chart = build_patient_frappe_chart(analysis)
	message = _message(analysis)
	return columns, data, message, chart


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
	filters.limit = cint(filters.get("limit") or DEFAULT_LIMIT) or DEFAULT_LIMIT
	if not filters.get("source"):
		filters.source = "Sales Invoice"


def _field(period_key: str, metric: str) -> str:
	return f"{period_key}_{metric}".replace("-", "_").replace(" ", "_")


def _columns(analysis: dict) -> list[dict]:
	cols = [
		{"label": _("Rank"), "fieldname": "rank_no", "fieldtype": "Int", "width": 60},
		{"label": _("File No"), "fieldname": "file_no", "fieldtype": "Data", "width": 100},
		{"label": _("Patient ID"), "fieldname": "patient_id", "fieldtype": "Data", "width": 120},
		{
			"label": _("Patient"),
			"fieldname": "patient",
			"fieldtype": "Link",
			"options": "Patient",
			"width": 120,
			"hidden": 1,
		},
		{"label": _("Patient Name"), "fieldname": "patient_name", "fieldtype": "Data", "width": 200},
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
					"width": 100,
					"precision": 3,
				}
			)
	return cols


def _rows(analysis: dict) -> list[dict]:
	periods = analysis.get("periods") or []
	rows = []
	for item in analysis.get("patients") or []:
		by_key = {p.get("key"): p for p in (item.get("periods") or [])}
		row = {
			"rank_no": cint(item.get("rank_no")) or None,
			"file_no": item.get("file_no") or "",
			"patient_id": item.get("patient_id") or "",
			"patient": item.get("patient"),
			"patient_name": item.get("patient_name"),
		}
		for p in periods:
			key = p.get("key") or ""
			cell = by_key.get(key) or {}
			for metric in ("ip", "op", "iop", "total", "discount", "net"):
				row[_field(key, metric)] = flt(cell.get(metric))
		rows.append(row)
	return rows


def _message(analysis: dict) -> str:
	shown = cint(analysis.get("shown_patients"))
	total = cint(analysis.get("total_patients"))
	limit = cint(analysis.get("limit")) or DEFAULT_LIMIT
	if total <= shown:
		return _("Showing {0} patient(s). Scroll the table for more rows.").format(shown)
	return _(
		"Showing top {0} of {1} patients by net income (Limit={2}). "
		"Increase Limit to load more; scroll the table for rows already loaded."
	).format(shown, total, limit)
