# Copyright (c) 2026, healthcare contributors
"""DOC-103 - QMPS quality indicators.

A Quality Indicator declares how to count a numerator and (optionally) a
denominator over a period. Results are materialised into Quality Indicator
Result so trends survive even if the underlying records change.
"""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import add_months, get_first_day, get_last_day, getdate

UNIT_MULTIPLIER = {
	"Percentage": 100.0,
	"Rate per 1000": 1000.0,
}


def _filters(raw: str | None) -> dict:
	if not raw:
		return {}
	try:
		parsed = json.loads(raw)
	except (TypeError, ValueError):
		frappe.throw(_("Invalid JSON in indicator filters: {0}").format(raw))
	return parsed if isinstance(parsed, dict) else {}


def _count(doctype: str, filters: dict, date_field: str, start, end) -> int:
	if not doctype:
		return 0
	query = dict(filters or {})
	if date_field and frappe.get_meta(doctype).has_field(date_field) or date_field in (
		"creation",
		"modified",
	):
		query[date_field] = ["between", [start, end]]
	return frappe.db.count(doctype, query)


def compute_indicator(indicator: str, period_start, period_end, cost_center: str | None = None) -> dict:
	ind = frappe.get_doc("Quality Indicator", indicator)

	num_filters = _filters(ind.numerator_filters)
	den_filters = _filters(ind.denominator_filters)
	if cost_center:
		if frappe.get_meta(ind.numerator_doctype).has_field("cost_center"):
			num_filters["cost_center"] = cost_center
		if ind.denominator_doctype and frappe.get_meta(ind.denominator_doctype).has_field(
			"cost_center"
		):
			den_filters["cost_center"] = cost_center

	numerator = _count(
		ind.numerator_doctype, num_filters, ind.numerator_date_field, period_start, period_end
	)

	denominator = 0
	if ind.denominator_doctype:
		denominator = _count(
			ind.denominator_doctype,
			den_filters,
			ind.denominator_date_field,
			period_start,
			period_end,
		)

	if ind.denominator_doctype:
		multiplier = UNIT_MULTIPLIER.get(ind.unit, 1.0)
		value = (numerator / denominator * multiplier) if denominator else 0.0
	else:
		value = float(numerator)

	met = None
	if ind.target_value:
		met = (
			value <= ind.target_value
			if ind.target_direction == "Lower is better"
			else value >= ind.target_value
		)

	return {
		"indicator": ind.name,
		"numerator": numerator,
		"denominator": denominator,
		"value": round(value, 2),
		"unit": ind.unit,
		"target_value": ind.target_value,
		"target_direction": ind.target_direction,
		"met": int(bool(met)) if met is not None else 0,
	}


@frappe.whitelist()
def get_indicator_dashboard(
	period_start: str | None = None,
	period_end: str | None = None,
	cost_center: str | None = None,
	category: str | None = None,
) -> list[dict]:
	"""Live QMPS indicator board - computed on the fly, nothing persisted."""
	if not period_start or not period_end:
		today = getdate()
		period_start = get_first_day(today)
		period_end = get_last_day(today)

	filters = {"is_active": 1}
	if category:
		filters["category"] = category

	rows = []
	for ind in frappe.get_all(
		"Quality Indicator",
		filters=filters,
		fields=["name", "indicator_name", "indicator_code", "category", "unit", "description"],
		order_by="category asc, indicator_name asc",
	):
		try:
			result = compute_indicator(ind.name, period_start, period_end, cost_center)
		except Exception:
			frappe.log_error(
				title="Quality indicator failed", message=frappe.get_traceback()
			)
			continue
		result.update(
			{
				"indicator_name": ind.indicator_name,
				"indicator_code": ind.indicator_code,
				"category": ind.category,
				"description": ind.description,
				"period_start": str(period_start),
				"period_end": str(period_end),
			}
		)
		rows.append(result)
	return rows


@frappe.whitelist()
def snapshot_indicators(
	period_start: str | None = None, period_end: str | None = None, cost_center: str | None = None
) -> int:
	"""Persist a Quality Indicator Result row per active indicator."""
	if not period_start or not period_end:
		last_month = add_months(getdate(), -1)
		period_start = get_first_day(last_month)
		period_end = get_last_day(last_month)

	saved = 0
	for ind in frappe.get_all("Quality Indicator", filters={"is_active": 1}, pluck="name"):
		result = compute_indicator(ind, period_start, period_end, cost_center)
		existing = frappe.db.exists(
			"Quality Indicator Result",
			{
				"indicator": ind,
				"period_start": period_start,
				"period_end": period_end,
				"cost_center": cost_center or "",
			},
		)
		if existing:
			continue
		doc = frappe.new_doc("Quality Indicator Result")
		doc.update(result)
		doc.period_start = period_start
		doc.period_end = period_end
		doc.cost_center = cost_center
		doc.insert(ignore_permissions=True)
		saved += 1

	frappe.db.commit()
	return saved


def snapshot_monthly_indicators() -> int:
	"""Monthly scheduler entry point - snapshots the month just ended."""
	return snapshot_indicators()
