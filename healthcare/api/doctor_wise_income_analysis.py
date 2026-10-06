# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt
"""
Doctor Wise Income Analysis — generate 3-year IP/OP/IOP comparison rows.

Uses the same Sales Order / Sales Invoice attribution as Doctor Service Revenue
(practitioner resolved from the healthcare base document). Amounts are split by
care channel (IP / OP / IOP) and compared for the selected From–To window across
the To Date year and the two prior calendar years.
"""

from __future__ import annotations

from calendar import monthrange
from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate, get_datetime, getdate, now_datetime

from healthcare.healthcare.report.doctor_service_revenue.doctor_service_revenue import (
	INPATIENT_BASE_DOCTYPES,
	get_practitioner_details,
	get_service_items,
	resolve_practitioners,
)

IP_BASE_DOCTYPES = set(INPATIENT_BASE_DOCTYPES) | {"Admission Detail"}
IOP_BASE_DOCTYPES = {"Session Schedule", "IOP Day", "IOP Enrollment", "IOP Day Session"}
OTHER_INCOME_KEY = "__other_income__"


def _safe_date(year: int, month: int, day: int):
	last = monthrange(year, month)[1]
	return getdate(f"{year:04d}-{month:02d}-{min(day, last):02d}")


def comparison_windows(from_date, to_date):
	"""Return [(year, start, end), ...] for to_date.year and the two prior years."""
	from_date = getdate(from_date)
	to_date = getdate(to_date)
	primary = to_date.year
	windows = []
	for year in (primary, primary - 1, primary - 2):
		start = _safe_date(year, from_date.month, from_date.day)
		end = _safe_date(year, to_date.month, to_date.day)
		if start > end:
			start, end = end, start
		windows.append((year, start, end))
	return windows


def _line_discount(row) -> float:
	explicit = flt(row.get("discount_amount")) + flt(row.get("distributed_discount_amount"))
	if explicit:
		return explicit
	# Fallback: list price gap when present.
	plr = flt(row.get("price_list_rate"))
	qty = flt(row.get("qty"))
	amount = flt(row.get("amount"))
	if plr and qty:
		gap = plr * qty - amount
		return gap if gap > 0.00001 else 0.0
	return 0.0


def _enrich_items_with_discount(items, source: str):
	"""Attach discount fields when the upstream query did not select them."""
	if not items:
		return items
	if items[0].get("discount_amount") is not None and "discount_amount" in items[0]:
		return items

	names = list({(r.get("sales_order") or "") for r in items if r.get("sales_order")})
	if not names:
		return items

	is_invoice = not (source or "").strip().lower().startswith("sales order")
	parenttype = "Sales Invoice" if is_invoice else "Sales Order"
	child = "Sales Invoice Item" if is_invoice else "Sales Order Item"
	# Queue of discount rows per (parent, item_code) in idx order.
	queues = defaultdict(list)
	has_distributed = frappe.db.has_column(child, "distributed_discount_amount")
	dist_expr = (
		"IFNULL(distributed_discount_amount, 0)" if has_distributed else "0"
	)
	for i in range(0, len(names), 500):
		chunk = names[i : i + 500]
		rows = frappe.db.sql(
			f"""
			SELECT parent, item_code,
				IFNULL(discount_amount, 0) AS discount_amount,
				{dist_expr} AS distributed_discount_amount,
				IFNULL(price_list_rate, 0) AS price_list_rate
			FROM `tab{child}`
			WHERE parenttype = %s AND parent IN %s
			ORDER BY parent, idx
			""",
			(parenttype, tuple(chunk)),
			as_dict=True,
		)
		for r in rows:
			queues[(r.parent, r.item_code)].append(r)

	for row in items:
		queue = queues.get((row.sales_order, row.item_code)) or []
		matched = queue.pop(0) if queue else None
		if matched:
			row["discount_amount"] = matched.discount_amount
			row["distributed_discount_amount"] = matched.distributed_discount_amount
			row["price_list_rate"] = matched.price_list_rate
		else:
			row["discount_amount"] = 0
			row["distributed_discount_amount"] = 0
			row["price_list_rate"] = 0
	return items


def _load_visit_care_map(visit_names: set[str]) -> dict[str, str]:
	"""Patient Visit name -> IP / OP / IOP."""
	if not visit_names:
		return {}
	out = {}
	names = list(visit_names)
	fields = ["name", "visit_type", "iop_enrollment", "inpatient_record", "ip_admission_no"]
	fields = [f for f in fields if f == "name" or frappe.db.has_column("Patient Visit", f)]
	for i in range(0, len(names), 500):
		chunk = names[i : i + 500]
		for row in frappe.get_all(
			"Patient Visit", filters={"name": ["in", chunk]}, fields=fields, ignore_permissions=True
		):
			visit_type = (row.get("visit_type") or "").strip()
			if row.get("iop_enrollment") or visit_type.upper() == "IOP":
				out[row.name] = "IOP"
			elif (
				row.get("inpatient_record")
				or row.get("ip_admission_no")
				or visit_type in ("Daily Auto Visit", "Day Case")
			):
				out[row.name] = "IP"
			else:
				out[row.name] = "OP"
	return out


def classify_care_channel(base_doctype: str, base_name: str, visit_care_map: dict[str, str]) -> str:
	"""Return IP, OP, or IOP for a billed base document."""
	doctype = (base_doctype or "").strip()
	name = (base_name or "").strip()
	if doctype in IP_BASE_DOCTYPES:
		return "IP"
	if doctype in IOP_BASE_DOCTYPES:
		return "IOP"
	if doctype == "Patient Visit":
		return visit_care_map.get(name) or "OP"
	return "OP"


def _empty_bucket():
	return {
		"ip": 0.0,
		"op": 0.0,
		"iop": 0.0,
		"total": 0.0,
		"discount": 0.0,
		"net": 0.0,
	}


def _accumulate(bucket, channel: str, net: float, discount: float):
	gross = net + discount
	if channel == "IP":
		bucket["ip"] += gross
	elif channel == "IOP":
		bucket["iop"] += gross
	else:
		bucket["op"] += gross
	bucket["discount"] += discount
	bucket["net"] += net
	bucket["total"] = bucket["ip"] + bucket["op"] + bucket["iop"]


def gather_year_buckets(filters, year_start, year_end):
	"""Return {practitioner_or_other: bucket} for one date window."""
	year_filters = frappe._dict(filters)
	year_filters.from_date = year_start
	year_filters.to_date = year_end
	# Analysis needs IP rows — never exclude inpatient here.
	year_filters.exclude_inpatient = 0

	items = get_service_items(year_filters)
	items = _enrich_items_with_discount(items, year_filters.get("source") or "Sales Invoice")
	if not items:
		return {}

	practitioner_by_base = resolve_practitioners(items)
	practitioner_ids = {p for p in practitioner_by_base.values() if p}
	practitioner_details = get_practitioner_details(practitioner_ids)

	visit_names = {
		(row.custom_base_reference_name or "").strip()
		for row in items
		if (row.custom_base_reference or "").strip() == "Patient Visit"
	}
	visit_care_map = _load_visit_care_map(visit_names)

	buckets = defaultdict(_empty_bucket)
	meta = {}

	for row in items:
		key = (row.custom_base_reference, row.custom_base_reference_name)
		practitioner = practitioner_by_base.get(key)
		if not practitioner:
			doctor_key = OTHER_INCOME_KEY
			if doctor_key not in meta:
				meta[doctor_key] = {
					"practitioner": None,
					"doctor_name": _("Other Income"),
					"is_other_income": 1,
				}
		else:
			doctor_key = practitioner
			if doctor_key not in meta:
				details = practitioner_details.get(practitioner) or {}
				meta[doctor_key] = {
					"practitioner": practitioner,
					"doctor_name": details.get("practitioner_name") or practitioner,
					"is_other_income": 0,
				}

		channel = classify_care_channel(
			row.custom_base_reference, row.custom_base_reference_name, visit_care_map
		)
		net = flt(row.amount)
		discount = _line_discount(row)
		_accumulate(buckets[doctor_key], channel, net, discount)

	return {"buckets": buckets, "meta": meta}


def build_analysis_rows(doc) -> list[dict]:
	windows = comparison_windows(doc.from_date, doc.to_date)
	filters = frappe._dict(
		{
			"company": doc.company,
			"cost_center": doc.cost_center,
			"source": doc.source or "Sales Invoice",
			"paid_only": cint(doc.paid_only),
			"exclude_medicines": cint(doc.exclude_medicines),
			"exclude_inpatient": 0,
		}
	)

	per_year = []
	all_meta = {}
	for year, start, end in windows:
		payload = gather_year_buckets(filters, start, end)
		per_year.append((year, payload.get("buckets") or {}))
		all_meta.update(payload.get("meta") or {})

	# Union of doctors across years.
	doctor_keys = set()
	for _, buckets in per_year:
		doctor_keys.update(buckets.keys())

	# Rank by primary year (year_1) net total desc; Other Income always first as rank 0.
	primary_buckets = per_year[0][1] if per_year else {}

	others = [OTHER_INCOME_KEY] if OTHER_INCOME_KEY in doctor_keys else []
	ranked = sorted(
		[k for k in doctor_keys if k != OTHER_INCOME_KEY],
		key=lambda k: flt((primary_buckets.get(k) or {}).get("net")),
		reverse=True,
	)

	ordered_keys = others + ranked
	rows = []
	rank = 1
	for doctor_key in ordered_keys:
		meta = all_meta.get(doctor_key) or {
			"practitioner": None if doctor_key == OTHER_INCOME_KEY else doctor_key,
			"doctor_name": _("Other Income") if doctor_key == OTHER_INCOME_KEY else doctor_key,
			"is_other_income": 1 if doctor_key == OTHER_INCOME_KEY else 0,
		}
		is_other = doctor_key == OTHER_INCOME_KEY or cint(meta.get("is_other_income"))
		row = {
			"rank_no": 0 if is_other else rank,
			"practitioner": meta.get("practitioner"),
			"doctor_name": meta.get("doctor_name"),
			"is_other_income": 1 if is_other else 0,
		}
		if not is_other:
			rank += 1

		for year_idx, (_year, buckets) in enumerate(per_year, start=1):
			b = buckets.get(doctor_key) or _empty_bucket()
			prefix = f"y{year_idx}_"
			row[prefix + "ip"] = flt(b["ip"])
			row[prefix + "op"] = flt(b["op"])
			row[prefix + "iop"] = flt(b["iop"])
			row[prefix + "total"] = flt(b["total"])
			row[prefix + "discount"] = flt(b["discount"])
			row[prefix + "net"] = flt(b["net"])
		rows.append(row)

	return rows, [w[0] for w in windows]


def render_analysis_html(doc, rows=None) -> str:
	"""Serene-style HTML table for form preview and print format."""
	rows = rows if rows is not None else [r.as_dict() for r in (doc.rows or [])]
	years = [cint(doc.year_1), cint(doc.year_2), cint(doc.year_3)]
	year_colors = ["#f8d7da", "#ffe0b2", "#bbdefb"]
	branch = doc.cost_center or _("All Branches (Consolidate)")
	generated = format_datetime_safe(doc.generated_on or now_datetime())

	def money(v):
		n = flt(v)
		if abs(n - round(n)) < 0.001:
			return f"{n:,.0f}"
		return f"{n:,.3f}".rstrip("0").rstrip(".")

	# Totals footer
	totals = {f"y{i}_{k}": 0.0 for i in (1, 2, 3) for k in ("ip", "op", "iop", "total", "discount", "net")}
	for r in rows:
		for i in (1, 2, 3):
			for k in ("ip", "op", "iop", "total", "discount", "net"):
				totals[f"y{i}_{k}"] += flt(r.get(f"y{i}_{k}"))

	header_years = ""
	sub_headers = ""
	for i, year in enumerate(years):
		bg = year_colors[i % len(year_colors)]
		header_years += (
			f'<th colspan="6" style="background:{bg};text-align:center;border:1px solid #333;'
			f'padding:4px;font-weight:bold;">{year or ""}</th>'
		)
		for label in ("IP", "OP", "IOP", "Total", "Discount", "Net Total"):
			sub_headers += (
				f'<th style="background:{bg};border:1px solid #333;padding:3px 4px;'
				f'text-align:center;font-size:10px;">{label}</th>'
			)

	body = ""
	for r in rows:
		body += "<tr>"
		body += f'<td style="border:1px solid #333;padding:2px 4px;text-align:center;">{cint(r.get("rank_no"))}</td>'
		body += (
			f'<td style="border:1px solid #333;padding:2px 6px;text-align:left;white-space:nowrap;">'
			f'{frappe.utils.escape_html(r.get("doctor_name") or "")}</td>'
		)
		for i in (1, 2, 3):
			for k in ("ip", "op", "iop", "total", "discount", "net"):
				val = flt(r.get(f"y{i}_{k}"))
				color = "#c62828" if k == "discount" and val else "#000"
				body += (
					f'<td style="border:1px solid #333;padding:2px 4px;text-align:right;'
					f'color:{color};">{money(val)}</td>'
				)
		body += "</tr>"

	footer = "<tr style=\"font-weight:bold;background:#f5f5f5;\">"
	footer += f'<td colspan="2" style="border:1px solid #333;padding:3px 6px;">{_("Total")}</td>'
	for i in (1, 2, 3):
		for k in ("ip", "op", "iop", "total", "discount", "net"):
			val = totals[f"y{i}_{k}"]
			color = "#c62828" if k == "discount" and val else "#000"
			footer += (
				f'<td style="border:1px solid #333;padding:2px 4px;text-align:right;color:{color};">'
				f"{money(val)}</td>"
			)
	footer += "</tr>"

	return f"""
	<div class="dwia-report" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;">
		<div style="font-size:10px;margin-bottom:4px;">{frappe.utils.escape_html(generated)} &nbsp; Page 1</div>
		<div style="text-align:center;font-size:22px;font-weight:bold;color:#8B0000;margin:4px 0 10px;">
			{_("Doctor Wise Income Analysis")}
		</div>
		<table style="margin:0 auto 12px;border-collapse:collapse;font-size:11px;">
			<tr>
				<td style="border:1px solid #333;padding:4px 8px;"><b>{_("From")}</b></td>
				<td style="border:1px solid #333;padding:4px 8px;">{formatdate(doc.from_date)}</td>
				<td style="border:1px solid #333;padding:4px 8px;"><b>{_("to")}</b></td>
				<td style="border:1px solid #333;padding:4px 8px;">{formatdate(doc.to_date)}</td>
			</tr>
			<tr>
				<td style="border:1px solid #333;padding:4px 8px;"><b>{_("Branch")}</b></td>
				<td colspan="3" style="border:1px solid #333;padding:4px 8px;">{frappe.utils.escape_html(str(branch))}</td>
			</tr>
		</table>
		<table style="width:100%;border-collapse:collapse;font-size:10px;">
			<thead>
				<tr>
					<th rowspan="2" style="border:1px solid #333;padding:4px;background:#eee;">Rank<br>No.</th>
					<th rowspan="2" style="border:1px solid #333;padding:4px;background:#eee;min-width:140px;">Doctor Name</th>
					{header_years}
				</tr>
				<tr>{sub_headers}</tr>
			</thead>
			<tbody>
				{body}
				{footer}
			</tbody>
		</table>
	</div>
	"""


def format_datetime_safe(value):
	try:
		return get_datetime(value).strftime("%A %B %d %Y %I:%M %p")
	except Exception:
		return str(value or "")


def generate_doctor_wise_income_analysis(doc):
	rows, years = build_analysis_rows(doc)
	doc.year_1 = years[0] if len(years) > 0 else None
	doc.year_2 = years[1] if len(years) > 1 else None
	doc.year_3 = years[2] if len(years) > 2 else None
	doc.generated_on = now_datetime()
	doc.status = "Generated"
	doc.set("rows", [])
	for row in rows:
		doc.append("rows", row)

	html = render_analysis_html(doc, rows)
	# HTML field is display-only; stash for print method via cache flag on doc
	doc.flags.analysis_html = html
	doc.save(ignore_permissions=True)
	frappe.db.commit()

	return {
		"rows": len(rows),
		"years": years,
		"message": _("Generated {0} doctor rows for {1} / {2} / {3}").format(
			len(rows), years[0], years[1], years[2]
		),
	}


@frappe.whitelist()
def render_doctor_wise_income_analysis(doc):
	"""Jinja print method."""
	if isinstance(doc, str):
		doc = frappe.get_doc("Doctor Wise Income Analysis", doc)
	return render_analysis_html(doc)
