"""Shared helpers for lab report prints (assessment, summary, …)."""

from __future__ import annotations

from calendar import monthrange
from datetime import datetime

import frappe
from frappe.utils import flt, get_first_day, getdate, nowdate

from healthcare.api.nursing_print import fmt_date, parse_date


def month_bounds(value=None):
	d = parse_date(value) or getdate(nowdate())
	start = get_first_day(d)
	end = getdate(datetime(d.year, d.month, monthrange(d.year, d.month)[1]).date())
	return start, end


def resolve_report_dates(date_from=None, date_to=None):
	date_from = (date_from or "").strip() or None
	date_to = (date_to or "").strip() or None
	if not date_from and not date_to:
		start, end = month_bounds()
		date_from = str(start)
		date_to = str(end)
	return date_from, date_to


def lab_test_list_filters(date_from, date_to, cost_center=None):
	from healthcare.api.common import get_permitted_cost_centers

	filters = {"docstatus": ["!=", 2]}
	start = parse_date(date_from)
	end = parse_date(date_to)
	if start or end:
		from_d = str(start or "1900-01-01")
		to_d = str(end or nowdate())
		filters["date"] = ["between", [from_d, to_d]]

	permitted = get_permitted_cost_centers()
	if permitted is not None:
		if not permitted:
			return None
		if cost_center and cost_center in permitted:
			filters["cost_center"] = cost_center
		else:
			filters["cost_center"] = ["in", permitted]
	elif cost_center:
		filters["cost_center"] = cost_center
	return filters


def letter_head_seed(cost_center=None):
	seed = {"cost_center": (cost_center or "").strip()}
	if not seed["cost_center"]:
		try:
			seed["cost_center"] = frappe.defaults.get_user_default("cost_center") or ""
		except Exception:
			pass
	return seed


def branch_label(cost_center=None) -> str:
	cc = (cost_center or "").strip()
	if not cc:
		try:
			cc = frappe.defaults.get_user_default("cost_center") or ""
		except Exception:
			cc = ""
	if not cc:
		return ""
	try:
		return (
			frappe.db.get_value("Cost Center", cc, "cost_center_name")
			or frappe.db.get_value("Cost Center", cc, "name")
			or cc
		)
	except Exception:
		return cc


def range_header_html(date_from, date_to, cost_center=None, *, title_prefix="From Date:") -> str:
	from healthcare.api.nursing_print import esc

	parts = [
		f'<span>{esc(title_prefix)}</span> {esc(fmt_date(date_from, "%d-%m-%y"))}'
		f" to {esc(fmt_date(date_to, '%d-%m-%y'))}"
	]
	branch = branch_label(cost_center)
	if branch:
		parts.append(f'<span>Branch:</span> {esc(branch)}')
	return f'<div class="lar-range">{" &nbsp; ".join(parts)}</div>'


def test_amount(row) -> float:
	return flt(row.get("grand_total")) or flt(row.get("amount")) or 0.0


def is_ip_lab_test(row) -> bool:
	return bool(row.get("inpatient_admission") or row.get("inpatient_record"))
