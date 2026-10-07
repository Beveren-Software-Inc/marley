# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt
"""
Income by Doctor, Patient and Source.

Group By switches the layout (same IP / OP / IOP care channels as Doctor Wise
Income Analysis):
- Doctor  — per practitioner, IP/OP/IOP/Total/Discount/Net by period
- Patient — top N patients, same metrics (scrollable; raise Limit)
- Source  — IP / OP / IOP summary + pie chart
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, now_datetime

from healthcare.api.doctor_wise_income_analysis import (
	build_analysis,
	build_source_income_summary,
	render_analysis_html,
	render_source_income_html,
)
from healthcare.api.patient_wise_income_analysis import (
	DEFAULT_LIMIT,
	build_patient_analysis,
	build_patient_frappe_chart,
	render_patient_income_html,
)

GROUP_BY = ("Doctor", "Patient", "Source")


def execute(filters=None):
	filters = frappe._dict(filters or {})
	_validate(filters)
	mode = filters.group_by

	if mode == "Source":
		return _execute_source(filters)
	if mode == "Patient":
		return _execute_patient(filters)
	return _execute_doctor(filters)


def _validate(filters):
	if not filters.get("from_date") or not filters.get("to_date"):
		frappe.throw(_("From Date and To Date are required"))
	if getdate(filters.from_date) > getdate(filters.to_date):
		frappe.throw(_("From Date cannot be after To Date"))

	period = (filters.get("period") or "Yearly").strip().title()
	if period not in ("Yearly", "Quarterly", "Monthly"):
		frappe.throw(_("Period must be Yearly, Quarterly, or Monthly"))
	filters.period = period

	mode = (filters.get("group_by") or "Doctor").strip().title()
	if mode not in GROUP_BY:
		frappe.throw(_("Group By must be Doctor, Patient, or Source"))
	filters.group_by = mode

	filters.paid_only = cint(filters.get("paid_only") if filters.get("paid_only") is not None else filters.get("paid"))
	filters.exclude_medicines = cint(filters.get("exclude_medicines"))
	filters.limit = cint(filters.get("limit") or DEFAULT_LIMIT) or DEFAULT_LIMIT
	if not filters.get("billing_source"):
		# Prefer billing_source; fall back to legacy "source" if it is Invoice/Order
		legacy = (filters.get("source") or "").strip()
		if legacy in ("Sales Invoice", "Sales Order"):
			filters.billing_source = legacy
		else:
			filters.billing_source = "Sales Invoice"
	# APIs expect filters.source = billing document type
	filters.source = filters.billing_source


def _field(period_key: str, metric: str) -> str:
	return f"{period_key}_{metric}".replace("-", "_").replace(" ", "_")


# ── Doctor ──────────────────────────────────────────────────────────────────


def _execute_doctor(filters):
	analysis = build_analysis(filters)
	filters.generated_on = now_datetime()
	# Doctors SVG chart lives inside the HTML only — do not also return a
	# Frappe chart (that second IP/OP/IOP widget looks like a Source graph).
	html = render_analysis_html(filters, analysis, include_chart=True)
	columns = _doctor_columns(analysis)
	data = _doctor_rows(analysis)
	return columns, data, html, None


def _doctor_columns(analysis: dict) -> list[dict]:
	cols = [
		{"label": _("Rank"), "fieldname": "rank_no", "fieldtype": "Int", "width": 60},
		{
			"label": _("Practitioner"),
			"fieldname": "practitioner",
			"fieldtype": "Link",
			"options": "Healthcare Practitioner",
			"width": 140,
		},
		{"label": _("Doctor Name"), "fieldname": "doctor_name", "fieldtype": "Data", "width": 200},
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


def _doctor_rows(analysis: dict) -> list[dict]:
	periods = analysis.get("periods") or []
	rows = []
	for doctor in analysis.get("doctors") or []:
		by_key = {p.get("key"): p for p in (doctor.get("periods") or [])}
		row = {
			"rank_no": cint(doctor.get("rank_no")) or None,
			"practitioner": doctor.get("practitioner"),
			"doctor_name": doctor.get("doctor_name"),
		}
		for p in periods:
			key = p.get("key") or ""
			bucket = by_key.get(key) or {}
			for metric in ("ip", "op", "iop", "total", "discount", "net"):
				row[_field(key, metric)] = flt(bucket.get(metric))
		rows.append(row)
	return rows


# ── Patient ─────────────────────────────────────────────────────────────────


def _execute_patient(filters):
	analysis = build_patient_analysis(filters)
	filters.generated_on = now_datetime()
	html = render_patient_income_html(filters, analysis)
	columns = _patient_columns(analysis)
	data = _patient_rows(analysis)
	chart = build_patient_frappe_chart(analysis)
	return columns, data, html, chart


def _patient_columns(analysis: dict) -> list[dict]:
	cols = [
		{"label": _("Rank"), "fieldname": "rank_no", "fieldtype": "Int", "width": 60},
		{
			"label": _("Patient"),
			"fieldname": "patient",
			"fieldtype": "Link",
			"options": "Patient",
			"width": 120,
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
					"width": 90,
				}
			)
	return cols


def _patient_rows(analysis: dict) -> list[dict]:
	periods = analysis.get("periods") or []
	rows = []
	for item in analysis.get("patients") or []:
		by_key = {p.get("key"): p for p in (item.get("periods") or [])}
		row = {
			"rank_no": cint(item.get("rank_no")) or None,
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


# ── Source (IP / OP / IOP) ──────────────────────────────────────────────────


def _execute_source(filters):
	summary = build_source_income_summary(filters)
	filters.generated_on = now_datetime()
	html = render_source_income_html(filters, summary)
	columns = _source_columns(summary)
	data = _source_rows(summary)
	chart = _source_chart(summary)
	return columns, data, html, chart


def _source_columns(summary: dict) -> list[dict]:
	cols = [
		{"label": _("Source"), "fieldname": "care_source", "fieldtype": "Data", "width": 100},
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


def _source_rows(summary: dict) -> list[dict]:
	periods = summary.get("periods") or []
	rows = []
	for item in summary.get("rows") or []:
		by_key = {p.get("key"): p for p in (item.get("periods") or [])}
		row = {
			"care_source": item.get("source"),
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


def _source_chart(summary: dict) -> dict | None:
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
