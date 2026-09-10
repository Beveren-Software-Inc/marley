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


def default_hospital_cost_center() -> str:
	"""First Cost Center with custom_is_hospital ticked (portal default when no branch chosen)."""
	try:
		if frappe.db.has_column("Cost Center", "custom_is_hospital"):
			rows = frappe.get_all(
				"Cost Center",
				filters={"custom_is_hospital": 1, "disabled": 0},
				pluck="name",
				order_by="name asc",
				limit=1,
			)
			if rows:
				return str(rows[0]).strip()
	except Exception:
		pass
	return ""


def letter_head_seed(cost_center=None):
	# Prefer explicit branch; else first hospital cost center (custom_is_hospital).
	cc = resolve_report_cost_center(cost_center) or ""
	if not cc:
		try:
			cc = (frappe.defaults.get_user_default("cost_center") or "").strip()
		except Exception:
			cc = ""
	if not cc:
		try:
			from healthcare.api.common import get_permitted_cost_centers

			permitted = get_permitted_cost_centers()
			if permitted:
				cc = str(permitted[0] or "").strip()
		except Exception:
			pass
	return {"cost_center": cc}


def resolve_report_cost_center(cost_center=None) -> str | None:
	"""Explicit branch, else first hospital cost center (custom_is_hospital)."""
	cc = (cost_center or "").strip()
	if cc:
		return cc
	hospital = default_hospital_cost_center()
	return hospital or None


def get_report_letter_head(cost_center=None) -> dict:
	"""Letter Head for lab/general reports (cost center → Healthcare Settings → Company)."""
	from healthcare.api.nursing_print import get_doc_letter_head

	seed = letter_head_seed(cost_center)
	lh = get_doc_letter_head(seed)
	if (lh.get("content") or "").strip() or (lh.get("footer") or "").strip():
		return lh

	# Healthcare Settings → Default Letter Head
	try:
		lh_name = frappe.db.get_single_value("Healthcare Settings", "default_letter_head")
		if lh_name and frappe.db.exists("Letter Head", lh_name):
			doc = frappe.get_cached_doc("Letter Head", lh_name)
			return {"content": doc.content or "", "footer": doc.footer or ""}
	except Exception:
		pass

	# Company default letter head
	try:
		company = (
			frappe.defaults.get_user_default("company")
			or frappe.db.get_single_value("Global Defaults", "default_company")
			or ""
		)
		if company:
			lh_name = frappe.db.get_value("Company", company, "default_letter_head")
			if lh_name and frappe.db.exists("Letter Head", lh_name):
				doc = frappe.get_cached_doc("Letter Head", lh_name)
				return {"content": doc.content or "", "footer": doc.footer or ""}
	except Exception:
		pass

	return {"content": "", "footer": ""}


def branch_label(cost_center=None) -> str:
	cc = resolve_report_cost_center(cost_center) or ""
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
