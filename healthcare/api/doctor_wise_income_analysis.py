# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt
"""
Doctor Wise Income Analysis — shared period analysis for the script reports.

Breaks the selected From–To range into Yearly / Quarterly / Monthly periods
and shows IP / OP / IOP / Net Total (+ Total / Discount) per doctor per period.

Care channels (from Sales Order / Invoice ``custom_base_reference``):
- **IP**  — Inpatient Admission (and related IP charge docs)
- **OP**  — Patient Visit (any visit type other than IOP)
- **IOP** — Patient Visit with Visit Type = IOP
"""

from __future__ import annotations

import json
from calendar import monthrange
from collections import defaultdict
from datetime import date

import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate, get_datetime, getdate, now_datetime

from healthcare.healthcare.report.doctor_service_revenue.doctor_service_revenue import (
	INPATIENT_BASE_DOCTYPES,
	get_practitioner_details,
	get_service_items,
	resolve_practitioners,
)

# IP = inpatient admission billing (and closely related IP charge docs).
IP_BASE_DOCTYPES = set(INPATIENT_BASE_DOCTYPES) | {"Admission Detail"}
# IOP visit_type values on Patient Visit (Serene uses "IOP"; accept common typos).
IOP_VISIT_TYPES = {"IOP", "IOOP"}
OTHER_INCOME_KEY = "__other_income__"
MAX_PERIODS = 36
PERIOD_COLORS = ["#f8d7da", "#ffe0b2", "#bbdefb", "#c8e6c9", "#e1bee7", "#fff9c4"]
# BHD (and Serene money displays): always three decimal places.
MONEY_DECIMALS = 3


def format_money_bhd(value) -> str:
	"""Format amount with exactly 3 decimal places (e.g. 9.09 → 9.090)."""
	return f"{flt(value):,.{MONEY_DECIMALS}f}"


def _clip(start: date, end: date, range_start: date, range_end: date):
	s = max(start, range_start)
	e = min(end, range_end)
	if s > e:
		return None
	return s, e


def period_windows(from_date, to_date, period: str) -> list[dict]:
	"""Return period buckets covering [from_date, to_date].

	Each item: {key, label, start, end}
	"""
	from_date = getdate(from_date)
	to_date = getdate(to_date)
	if from_date > to_date:
		from_date, to_date = to_date, from_date

	period = (period or "Yearly").strip().title()
	windows: list[dict] = []

	if period == "Monthly":
		y, m = from_date.year, from_date.month
		while True:
			start = date(y, m, 1)
			end = date(y, m, monthrange(y, m)[1])
			clipped = _clip(start, end, from_date, to_date)
			if clipped:
				s, e = clipped
				windows.append(
					{
						"key": f"{y:04d}-{m:02d}",
						"label": start.strftime("%b %Y"),
						"start": s,
						"end": e,
					}
				)
			if start.year > to_date.year or (start.year == to_date.year and start.month >= to_date.month):
				break
			if m == 12:
				y, m = y + 1, 1
			else:
				m += 1
			if len(windows) >= MAX_PERIODS:
				break

	elif period == "Quarterly":
		# Quarters: Q1 Jan-Mar … Q4 Oct-Dec
		y = from_date.year
		q = (from_date.month - 1) // 3 + 1
		while len(windows) < MAX_PERIODS:
			q_start_month = (q - 1) * 3 + 1
			q_end_month = q_start_month + 2
			start = date(y, q_start_month, 1)
			if start > to_date:
				break
			end = date(y, q_end_month, monthrange(y, q_end_month)[1])
			clipped = _clip(start, end, from_date, to_date)
			if clipped:
				s, e = clipped
				windows.append(
					{
						"key": f"{y:04d}-Q{q}",
						"label": f"Q{q} {y}",
						"start": s,
						"end": e,
					}
				)
			if end >= to_date:
				break
			if q == 4:
				y, q = y + 1, 1
			else:
				q += 1

	else:  # Yearly
		for y in range(from_date.year, to_date.year + 1):
			start = date(y, 1, 1)
			end = date(y, 12, 31)
			clipped = _clip(start, end, from_date, to_date)
			if not clipped:
				continue
			s, e = clipped
			windows.append({"key": str(y), "label": str(y), "start": s, "end": e})
			if len(windows) >= MAX_PERIODS:
				break

	if not windows:
		windows.append(
			{
				"key": "range",
				"label": _("Period"),
				"start": from_date,
				"end": to_date,
			}
		)
	return windows


def _line_discount(row) -> float:
	explicit = flt(row.get("discount_amount")) + flt(row.get("distributed_discount_amount"))
	if explicit:
		return explicit
	plr = flt(row.get("price_list_rate"))
	qty = flt(row.get("qty"))
	amount = flt(row.get("amount"))
	if plr and qty:
		gap = plr * qty - amount
		return gap if gap > 0.00001 else 0.0
	return 0.0


def _enrich_items_with_discount(items, source: str):
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
	queues = defaultdict(list)
	has_distributed = frappe.db.has_column(child, "distributed_discount_amount")
	dist_expr = "IFNULL(distributed_discount_amount, 0)" if has_distributed else "0"
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
	"""Patient Visit name -> IOP | OP.

	IOP = visit_type IOP (Patient Visit).
	OP  = any other Patient Visit.
	IP is never taken from visits — only from Inpatient Admission base docs.
	"""
	if not visit_names:
		return {}
	out = {}
	names = list(visit_names)
	fields = ["name", "visit_type"]
	if frappe.db.has_column("Patient Visit", "iop_enrollment"):
		fields.append("iop_enrollment")
	for i in range(0, len(names), 500):
		chunk = names[i : i + 500]
		for row in frappe.get_all(
			"Patient Visit", filters={"name": ["in", chunk]}, fields=fields, ignore_permissions=True
		):
			visit_type = (row.get("visit_type") or "").strip().upper()
			# Visit Type IOP (or linked IOP Enrollment) → IOP channel.
			if visit_type in IOP_VISIT_TYPES or row.get("iop_enrollment"):
				out[row.name] = "IOP"
			else:
				out[row.name] = "OP"
	return out


def classify_care_channel(base_doctype: str, base_name: str, visit_care_map: dict[str, str]) -> str:
	"""Map billed base document to IP / OP / IOP.

	- IP  → Inpatient Admission (and related IP charge doctypes)
	- IOP → Patient Visit with Visit Type IOP
	- OP  → Patient Visit (all other types) and other non-IP bases
	"""
	doctype = (base_doctype or "").strip()
	name = (base_name or "").strip()
	if doctype in IP_BASE_DOCTYPES:
		return "IP"
	if doctype == "Patient Visit":
		return visit_care_map.get(name) or "OP"
	# Non-visit / non-admission bases (lab, pharmacy, etc.) count as OP service income.
	return "OP"


def _empty_bucket():
	return {
		"ip": 0.0,
		"op": 0.0,
		"iop": 0.0,
		"total": 0.0,
		"discount": 0.0,
		"net": 0.0,
		"tax": 0.0,
	}


def _line_tax(row) -> float:
	return flt(row.get("tax_amount"))


def _enrich_items_with_tax(items, source: str):
	"""Prorate parent document tax onto each line (Sales Register Grand Total = net + tax).

	``tax_amount`` on each line = parent_tax * (line_amount / parent_net).
	Sales Order uses the same idea when tax columns exist.
	"""
	if not items:
		return items

	is_invoice = not (source or "").strip().lower().startswith("sales order")
	parenttype = "Sales Invoice" if is_invoice else "Sales Order"
	names = list({(r.get("sales_order") or "") for r in items if r.get("sales_order")})
	if not names:
		for row in items:
			row["tax_amount"] = 0.0
		return items

	tax_by_parent = {}
	net_by_parent = {}
	has_tax_col = frappe.db.has_column(parenttype, "total_taxes_and_charges")
	# Prefer net_total; fall back to total / grand_total - tax
	net_field = "net_total" if frappe.db.has_column(parenttype, "net_total") else "total"
	tax_select = "IFNULL(total_taxes_and_charges, 0)" if has_tax_col else "0"
	for i in range(0, len(names), 500):
		chunk = names[i : i + 500]
		rows = frappe.db.sql(
			f"""
			SELECT name,
				IFNULL({net_field}, 0) AS net_total,
				{tax_select} AS tax,
				IFNULL(grand_total, 0) AS grand_total
			FROM `tab{parenttype}`
			WHERE name IN %s
			""",
			(tuple(chunk),),
			as_dict=True,
		)
		for r in rows:
			net = flt(r.net_total)
			tax = flt(r.tax)
			if has_tax_col and not tax and flt(r.grand_total) and net:
				# Some sites store tax only as grand - net
				tax = max(flt(r.grand_total) - net, 0.0)
			tax_by_parent[r.name] = tax
			net_by_parent[r.name] = net

	# Sum line amounts per parent among *selected* items (respect exclude filters)
	line_net_by_parent = defaultdict(float)
	for row in items:
		parent = row.get("sales_order") or ""
		line_net_by_parent[parent] += flt(row.get("amount"))

	for row in items:
		parent = row.get("sales_order") or ""
		parent_tax = flt(tax_by_parent.get(parent))
		# Prorate on selected lines' net so allocated tax still sums to invoice tax
		# when all lines are included; if medicines excluded, tax is proportional
		# to remaining lines only (same share of tax as their share of bill).
		base_net = flt(net_by_parent.get(parent)) or flt(line_net_by_parent.get(parent))
		line_net = flt(row.get("amount"))
		if parent_tax and base_net:
			row["tax_amount"] = parent_tax * (line_net / base_net)
		else:
			row["tax_amount"] = 0.0
	return items


def _accumulate(bucket, channel: str, net: float, discount: float, tax: float = 0.0):
	"""Accumulate line into care-channel bucket.

	- IP / OP / IOP  → net + tax (so they sum to Grand Total)
	- discount       → line discount (informational)
	- net            → item amount (matches Sales Register Net Total)
	- total          → Grand Total = net + tax (matches Sales Register Grand Total)
	"""
	grand = net + tax
	if channel == "IP":
		bucket["ip"] += grand
	elif channel == "IOP":
		bucket["iop"] += grand
	else:
		bucket["op"] += grand
	bucket["discount"] += discount
	bucket["net"] += net
	bucket["tax"] += tax
	bucket["total"] = bucket["ip"] + bucket["op"] + bucket["iop"]


def _period_key_for_date(txn_date, windows: list[dict]) -> str | None:
	d = getdate(txn_date)
	for w in windows:
		if w["start"] <= d <= w["end"]:
			return w["key"]
	return None


def build_analysis(doc_or_filters) -> dict:
	"""Build dynamic period analysis payload from a Doc or filters dict."""
	src = frappe._dict(doc_or_filters or {})
	windows = period_windows(src.from_date, src.to_date, src.get("period") or "Yearly")
	filters = frappe._dict(
		{
			"company": src.get("company"),
			"cost_center": src.get("cost_center"),
			"source": src.get("source") or "Sales Invoice",
			"paid_only": cint(src.get("paid_only")),
			"exclude_medicines": cint(src.get("exclude_medicines")),
			"exclude_inpatient": 0,
			"from_date": src.from_date,
			"to_date": src.to_date,
		}
	)

	items = get_service_items(filters)
	billing_source = filters.get("source") or "Sales Invoice"
	items = _enrich_items_with_discount(items, billing_source)
	items = _enrich_items_with_tax(items, billing_source)

	# doctor_key -> period_key -> bucket
	matrix = defaultdict(lambda: defaultdict(_empty_bucket))
	meta = {}

	if items:
		practitioner_by_base = resolve_practitioners(items)
		practitioner_ids = {p for p in practitioner_by_base.values() if p}
		practitioner_details = get_practitioner_details(practitioner_ids)
		visit_names = {
			(row.custom_base_reference_name or "").strip()
			for row in items
			if (row.custom_base_reference or "").strip() == "Patient Visit"
		}
		visit_care_map = _load_visit_care_map(visit_names)

		for row in items:
			pkey = _period_key_for_date(row.get("transaction_date"), windows)
			if not pkey:
				continue
			base_key = (row.custom_base_reference, row.custom_base_reference_name)
			practitioner = practitioner_by_base.get(base_key)
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
			_accumulate(
				matrix[doctor_key][pkey],
				channel,
				flt(row.amount),
				_line_discount(row),
				_line_tax(row),
			)

	# Rank by total net across all periods (desc). Other Income first.
	def total_net(doctor_key):
		return sum(flt(matrix[doctor_key][w["key"]]["net"]) for w in windows)

	doctor_keys = set(matrix.keys()) | set(meta.keys())
	others = [OTHER_INCOME_KEY] if OTHER_INCOME_KEY in doctor_keys else []
	ranked = sorted(
		[k for k in doctor_keys if k != OTHER_INCOME_KEY],
		key=total_net,
		reverse=True,
	)

	doctors = []
	rank = 1
	for doctor_key in others + ranked:
		m = meta.get(doctor_key) or {
			"practitioner": None if doctor_key == OTHER_INCOME_KEY else doctor_key,
			"doctor_name": _("Other Income") if doctor_key == OTHER_INCOME_KEY else doctor_key,
			"is_other_income": 1 if doctor_key == OTHER_INCOME_KEY else 0,
		}
		is_other = doctor_key == OTHER_INCOME_KEY or cint(m.get("is_other_income"))
		periods = []
		for w in windows:
			b = matrix[doctor_key].get(w["key"]) or _empty_bucket()
			periods.append(
				{
					"key": w["key"],
					"ip": flt(b["ip"]),
					"op": flt(b["op"]),
					"iop": flt(b["iop"]),
					"total": flt(b["total"]),
					"discount": flt(b["discount"]),
					"net": flt(b["net"]),
				}
			)
		doctors.append(
			{
				"rank_no": 0 if is_other else rank,
				"practitioner": m.get("practitioner"),
				"doctor_name": m.get("doctor_name"),
				"is_other_income": 1 if is_other else 0,
				"periods": periods,
			}
		)
		if not is_other:
			rank += 1

	# Column totals
	col_totals = []
	for i, w in enumerate(windows):
		t = _empty_bucket()
		for doc_row in doctors:
			p = doc_row["periods"][i]
			for k in ("ip", "op", "iop", "total", "discount", "net"):
				t[k] += flt(p[k])
		col_totals.append({"key": w["key"], **{k: flt(t[k]) for k in t}})

	return {
		"period": (src.get("period") or "Yearly"),
		"from_date": str(getdate(src.from_date)),
		"to_date": str(getdate(src.to_date)),
		"cost_center": src.get("cost_center"),
		"periods": [
			{
				"key": w["key"],
				"label": w["label"],
				"start": str(w["start"]),
				"end": str(w["end"]),
			}
			for w in windows
		],
		"doctors": doctors,
		"totals": col_totals,
	}


def _parse_analysis(doc) -> dict | None:
	raw = getattr(doc, "analysis_json", None)
	if not raw:
		return None
	if isinstance(raw, dict):
		return raw
	if isinstance(raw, str):
		try:
			return json.loads(raw)
		except Exception:
			return None
	return None


def _fmt_short_date(value) -> str:
	try:
		return getdate(value).strftime("%d-%m-%y")
	except Exception:
		return formatdate(value) if value else ""


def format_datetime_safe(value):
	try:
		return get_datetime(value).strftime("%A %B %d %Y %I:%M %p")
	except Exception:
		return str(value or "")


def _doctor_channel_totals(doctor: dict) -> dict:
	"""Sum IP / OP / IOP / net across all periods for one doctor."""
	out = {"ip": 0.0, "op": 0.0, "iop": 0.0, "net": 0.0}
	for p in doctor.get("periods") or []:
		for k in out:
			out[k] += flt(p.get(k))
	return out


def _chart_doctors(analysis: dict, limit: int = 12) -> list[dict]:
	"""Top doctors by net for charts — Other Income always included first when present."""
	other = None
	ranked = []
	for d in analysis.get("doctors") or []:
		totals = _doctor_channel_totals(d)
		if not (totals["ip"] or totals["op"] or totals["iop"] or totals["net"]):
			continue
		row = {
			"doctor_name": d.get("doctor_name") or "",
			"is_other_income": cint(d.get("is_other_income")),
			"ip": totals["ip"],
			"op": totals["op"],
			"iop": totals["iop"],
			"net": totals["net"],
		}
		if row["is_other_income"]:
			other = row
		else:
			ranked.append(row)
	ranked.sort(key=lambda r: r["net"], reverse=True)
	# Reserve one slot for Other Income when it exists.
	top_n = max(limit - 1, 1) if other else limit
	out = ([other] if other else []) + ranked[:top_n]
	return out


def build_source_income_summary(doc_or_filters) -> dict:
	"""Aggregate income by care source (IP / OP / IOP) across period windows.

	Same classification rules as Doctor Wise Income Analysis:
	- IP  → Inpatient Admission (and related IP charge docs)
	- OP  → Patient Visit (non-IOP) and other non-IP bases
	- IOP → Patient Visit with Visit Type IOP
	"""
	src = frappe._dict(doc_or_filters or {})
	windows = period_windows(src.from_date, src.to_date, src.get("period") or "Yearly")
	filters = frappe._dict(
		{
			"company": src.get("company"),
			"cost_center": src.get("cost_center"),
			"source": src.get("source") or "Sales Invoice",
			"paid_only": cint(src.get("paid_only")),
			"exclude_medicines": cint(src.get("exclude_medicines")),
			"exclude_inpatient": 0,
			"from_date": src.from_date,
			"to_date": src.to_date,
		}
	)

	# channel -> period_key -> {total=grand, discount, net, tax}
	matrix = defaultdict(
		lambda: defaultdict(lambda: {"total": 0.0, "discount": 0.0, "net": 0.0, "tax": 0.0})
	)

	billing_source = filters.get("source") or "Sales Invoice"
	items = get_service_items(filters)
	items = _enrich_items_with_discount(items, billing_source)
	items = _enrich_items_with_tax(items, billing_source)
	if items:
		visit_names = {
			(row.custom_base_reference_name or "").strip()
			for row in items
			if (row.custom_base_reference or "").strip() == "Patient Visit"
		}
		visit_care_map = _load_visit_care_map(visit_names)
		for row in items:
			pkey = _period_key_for_date(row.get("transaction_date"), windows)
			if not pkey:
				continue
			channel = classify_care_channel(
				row.custom_base_reference, row.custom_base_reference_name, visit_care_map
			)
			net = flt(row.amount)
			discount = _line_discount(row)
			tax = _line_tax(row)
			bucket = matrix[channel][pkey]
			bucket["total"] += net + tax  # Grand Total (Sales Register)
			bucket["discount"] += discount
			bucket["net"] += net
			bucket["tax"] += tax

	sources = ("IP", "OP", "IOP")
	periods = [
		{"key": w["key"], "label": w["label"], "start": str(w["start"]), "end": str(w["end"])}
		for w in windows
	]
	rows = []
	grand = {"total": 0.0, "discount": 0.0, "net": 0.0, "tax": 0.0}
	pie_values = []
	for channel in sources:
		row = {"source": channel, "total": 0.0, "discount": 0.0, "net": 0.0, "tax": 0.0, "periods": []}
		for w in windows:
			b = matrix[channel].get(w["key"]) or {
				"total": 0.0,
				"discount": 0.0,
				"net": 0.0,
				"tax": 0.0,
			}
			cell = {
				"key": w["key"],
				"total": flt(b["total"]),
				"discount": flt(b["discount"]),
				"net": flt(b["net"]),
				"tax": flt(b.get("tax")),
			}
			row["periods"].append(cell)
			row["total"] += cell["total"]
			row["discount"] += cell["discount"]
			row["net"] += cell["net"]
			row["tax"] += cell["tax"]
		grand["total"] += row["total"]
		grand["discount"] += row["discount"]
		grand["net"] += row["net"]
		grand["tax"] += row["tax"]
		pie_values.append(flt(row["net"]))
		rows.append(row)

	return {
		"period": src.get("period") or "Yearly",
		"from_date": str(getdate(src.from_date)),
		"to_date": str(getdate(src.to_date)),
		"cost_center": src.get("cost_center"),
		"periods": periods,
		"rows": rows,
		"totals": grand,
		"pie": {"labels": list(sources), "values": pie_values},
	}


def _pie_slice_path(cx, cy, r, start_angle, end_angle) -> str:
	"""SVG path for a pie slice (angles in radians, 0 = right, clockwise)."""
	import math

	x1 = cx + r * math.cos(start_angle)
	y1 = cy + r * math.sin(start_angle)
	x2 = cx + r * math.cos(end_angle)
	y2 = cy + r * math.sin(end_angle)
	large = 1 if (end_angle - start_angle) > math.pi else 0
	return f"M {cx} {cy} L {x1:.2f} {y1:.2f} A {r} {r} 0 {large} 1 {x2:.2f} {y2:.2f} Z"


def render_source_pie_svg(summary: dict) -> str:
	"""Pie chart SVG for Source Income Analysis print HTML."""
	import math

	pie = summary.get("pie") or {}
	labels = pie.get("labels") or []
	values = [flt(v) for v in (pie.get("values") or [])]
	total = sum(values) or 0.0
	if not labels or total <= 0:
		return (
			f'<div style="margin:0 0 16px;padding:12px;border:1px solid #e2e8f0;border-radius:8px;'
			f'background:#f8fafc;color:#64748b;font-size:12px;">{_("No income to chart.")}</div>'
		)

	colors = ["#1e88e5", "#43a047", "#fb8c00"]
	cx, cy, r = 120, 120, 95
	# Start from top (-pi/2)
	angle = -math.pi / 2
	slices = ""
	legend = ""
	for i, (label, val) in enumerate(zip(labels, values)):
		sweep = (val / total) * 2 * math.pi
		end = angle + sweep
		color = colors[i % len(colors)]
		if val > 0:
			# Full circle edge case
			if abs(sweep - 2 * math.pi) < 1e-9:
				slices += f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{color}"/>'
			else:
				slices += f'<path d="{_pie_slice_path(cx, cy, r, angle, end)}" fill="{color}"/>'
		pct = (val / total) * 100
		ly = 40 + i * 28
		legend += (
			f'<rect x="260" y="{ly}" width="14" height="14" fill="{color}" rx="2"/>'
			f'<text x="282" y="{ly + 12}" font-size="12" fill="#334155">'
			f"{frappe.utils.escape_html(str(label))}: {format_money_bhd(val)} ({pct:.1f}%)</text>"
		)
		angle = end

	return f"""
	<div style="margin:0 0 16px;padding:12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;">
		<div style="font-size:13px;font-weight:600;color:#0f172a;margin-bottom:8px;">{_("Net Income by Source")}</div>
		<svg viewBox="0 0 520 240" width="100%" style="max-width:560px;height:auto;display:block;">
			{slices}
			{legend}
		</svg>
	</div>
	"""


def render_source_income_html(doc_or_filters=None, summary=None) -> str:
	"""Printable Serene-style HTML for Source Income Analysis."""
	ctx = frappe._dict(doc_or_filters or {})
	summary = summary or build_source_income_summary(ctx)
	periods = summary.get("periods") or []
	rows = summary.get("rows") or []
	grand = summary.get("totals") or {}
	branch = summary.get("cost_center") or ctx.get("cost_center") or _("All Branches (Consolidate)")
	period_label = summary.get("period") or ctx.get("period") or "Yearly"
	generated = format_datetime_safe(ctx.get("generated_on") or now_datetime())

	money = format_money_bhd

	amt_w = "90px"
	th = (
		f"border:1px solid #333;padding:4px;text-align:center;font-size:10px;"
		f"white-space:nowrap;width:{amt_w};"
	)
	td = f"border:1px solid #333;padding:3px 6px;text-align:right;white-space:nowrap;width:{amt_w};"

	period_headers = ""
	period_sub = ""
	for i, p in enumerate(periods):
		bg = PERIOD_COLORS[i % len(PERIOD_COLORS)]
		label = frappe.utils.escape_html(p.get("label") or p.get("key") or "")
		period_headers += (
			f'<th colspan="3" style="background:{bg};text-align:center;border:1px solid #333;'
			f'padding:4px;font-weight:bold;">{label}</th>'
		)
		for lbl in (_("Total"), _("Discount"), _("Net")):
			period_sub += f'<th style="background:{bg};{th}">{lbl}</th>'

	body = ""
	source_colors = {"IP": "#e3f2fd", "OP": "#e8f5e9", "IOP": "#fff3e0"}
	for r in rows:
		by_key = {p.get("key"): p for p in (r.get("periods") or [])}
		src = r.get("source") or ""
		bg = source_colors.get(src, "#fff")
		body += "<tr>"
		body += (
			f'<td style="border:1px solid #333;padding:4px 8px;font-weight:600;background:{bg};">'
			f"{frappe.utils.escape_html(src)}</td>"
		)
		for p in periods:
			cell = by_key.get(p["key"]) or {}
			body += f'<td style="{td}">{money(cell.get("total"))}</td>'
			body += (
				f'<td style="{td}color:#c62828;">{money(cell.get("discount"))}</td>'
			)
			body += f'<td style="{td}">{money(cell.get("net"))}</td>'
		body += f'<td style="{td}font-weight:600;">{money(r.get("total"))}</td>'
		body += f'<td style="{td}color:#c62828;font-weight:600;">{money(r.get("discount"))}</td>'
		body += f'<td style="{td}font-weight:600;">{money(r.get("net"))}</td>'
		body += "</tr>"

	footer = '<tr style="font-weight:bold;background:#f5f5f5;">'
	footer += f'<td style="border:1px solid #333;padding:4px 8px;">{_("Total")}</td>'
	for p in periods:
		key = p["key"]
		pt = pd = pn = 0.0
		for r in rows:
			for cell in r.get("periods") or []:
				if cell.get("key") == key:
					pt += flt(cell.get("total"))
					pd += flt(cell.get("discount"))
					pn += flt(cell.get("net"))
		footer += f'<td style="{td}">{money(pt)}</td>'
		footer += f'<td style="{td}color:#c62828;">{money(pd)}</td>'
		footer += f'<td style="{td}">{money(pn)}</td>'
	footer += f'<td style="{td}">{money(grand.get("total"))}</td>'
	footer += f'<td style="{td}color:#c62828;">{money(grand.get("discount"))}</td>'
	footer += f'<td style="{td}">{money(grand.get("net"))}</td>'
	footer += "</tr>"

	from_s = _fmt_short_date(summary.get("from_date") or ctx.get("from_date"))
	to_s = _fmt_short_date(summary.get("to_date") or ctx.get("to_date"))
	pie_html = render_source_pie_svg(summary)

	return f"""
	<div class="sia-report" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;">
		<div style="font-size:10px;margin-bottom:2px;">{frappe.utils.escape_html(generated)}</div>
		<div style="text-align:center;font-size:22px;font-weight:bold;color:#8B0000;margin:2px 0 10px;">
			{_("Source Income Analysis")}
		</div>
		<table style="margin:0 auto 12px;border-collapse:collapse;font-size:11px;">
			<tr>
				<td style="border:1px solid #333;padding:4px 8px;"><b>{_("From")}</b></td>
				<td style="border:1px solid #333;padding:4px 8px;">{from_s}</td>
				<td style="border:1px solid #333;padding:4px 8px;"><b>{_("to")}</b></td>
				<td style="border:1px solid #333;padding:4px 8px;">{to_s}</td>
			</tr>
			<tr>
				<td style="border:1px solid #333;padding:4px 8px;"><b>{_("Period")}</b></td>
				<td style="border:1px solid #333;padding:4px 8px;">{frappe.utils.escape_html(str(period_label))}</td>
				<td style="border:1px solid #333;padding:4px 8px;"><b>{_("Branch")}</b></td>
				<td style="border:1px solid #333;padding:4px 8px;">{frappe.utils.escape_html(str(branch))}</td>
			</tr>
		</table>
		{pie_html}
		<div style="overflow:auto;max-width:100%;">
		<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px;min-width:640px;">
			<thead>
				<tr>
					<th rowspan="2" style="border:1px solid #333;padding:4px;background:#eee;width:80px;vertical-align:middle;">Source</th>
					{period_headers}
					<th colspan="3" style="border:1px solid #333;padding:4px;background:#eee;text-align:center;font-weight:bold;">{_("Total")}</th>
				</tr>
				<tr>
					{period_sub}
					<th style="background:#eee;{th}">{_("Total")}</th>
					<th style="background:#eee;{th}">{_("Discount")}</th>
					<th style="background:#eee;{th}">{_("Net")}</th>
				</tr>
			</thead>
			<tbody>
				{body}
				{footer}
			</tbody>
		</table>
		</div>
	</div>
	"""


@frappe.whitelist()
def get_source_income_analysis_html(filters=None):
	"""Build printable HTML for Source Income Analysis (Print HTML button)."""
	if isinstance(filters, str):
		filters = json.loads(filters)
	filters = frappe._dict(filters or {})
	if not filters.get("from_date") or not filters.get("to_date"):
		frappe.throw(_("From Date and To Date are required"))
	filters.generated_on = now_datetime()
	summary = build_source_income_summary(filters)
	return render_source_income_html(filters, summary)


@frappe.whitelist()
def get_doctor_wise_income_analysis_html(filters=None):
	"""Build printable HTML for Doctor view from report filters."""
	if isinstance(filters, str):
		filters = json.loads(filters)
	filters = frappe._dict(filters or {})
	if not filters.get("from_date") or not filters.get("to_date"):
		frappe.throw(_("From Date and To Date are required"))
	filters.generated_on = now_datetime()
	analysis = build_analysis(filters)
	include_chart = True
	if filters.get("include_chart") is not None:
		include_chart = bool(cint(filters.get("include_chart")))
	return render_analysis_html(filters, analysis, include_chart=include_chart)


def build_frappe_chart(analysis: dict) -> dict | None:
	"""Frappe Query Report chart (vertical stacked IP / OP / IOP by doctor)."""
	rows = _chart_doctors(analysis, limit=12)
	if not rows:
		return None
	return {
		"data": {
			"labels": [((r["doctor_name"] or "")[:22]) for r in rows],
			"datasets": [
				{"name": _("IP"), "values": [flt(r["ip"]) for r in rows]},
				{"name": _("OP"), "values": [flt(r["op"]) for r in rows]},
				{"name": _("IOP"), "values": [flt(r["iop"]) for r in rows]},
			],
		},
		"type": "bar",
		"barOptions": {"stacked": 1},
		"height": 320,
		"colors": ["#1e88e5", "#43a047", "#fb8c00"],
	}


def render_chart_html(analysis: dict) -> str:
	"""SVG vertical stacked bars — shown above the HTML table."""
	rows = _chart_doctors(analysis, limit=12)
	if not rows:
		return ""

	max_total = max((r["ip"] + r["op"] + r["iop"]) for r in rows) or 1.0
	n = len(rows)
	left, right, top, bottom = 48, 24, 36, 90
	plot_h = 220.0
	gap = 10.0
	# Fit bars across available width
	plot_w = max(480.0, n * 56.0)
	bar_w = max(18.0, min(42.0, (plot_w - gap * (n + 1)) / n))
	width = left + plot_w + right
	height = top + plot_h + bottom

	colors = {"ip": "#1e88e5", "op": "#43a047", "iop": "#fb8c00"}

	def money_short(v):
		nval = flt(v)
		if abs(nval) >= 1_000_000:
			return f"{nval/1_000_000:.{MONEY_DECIMALS}f}M"
		if abs(nval) >= 1_000:
			return f"{nval/1_000:.{MONEY_DECIMALS}f}K"
		return format_money_bhd(nval)

	# Axis line
	axis_y = top + plot_h
	bars = (
		f'<line x1="{left}" y1="{axis_y}" x2="{left + plot_w}" y2="{axis_y}" '
		f'stroke="#94a3b8" stroke-width="1"/>'
	)

	for i, r in enumerate(rows):
		x = left + gap + i * (bar_w + gap)
		stack_h = 0.0
		for key in ("ip", "op", "iop"):
			val = flt(r[key])
			if val <= 0:
				continue
			h = max(1.0, (val / max_total) * plot_h)
			y = axis_y - stack_h - h
			bars += (
				f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_w:.1f}" height="{h:.1f}" '
				f'fill="{colors[key]}" rx="2"/>'
			)
			stack_h += h
		total = r["ip"] + r["op"] + r["iop"]
		bars += (
			f'<text x="{x + bar_w / 2:.1f}" y="{axis_y - stack_h - 4:.1f}" '
			f'text-anchor="middle" font-size="9" fill="#475569">{money_short(total)}</text>'
		)
		# Rotated doctor label under axis
		label = frappe.utils.escape_html((r["doctor_name"] or "")[:18])
		lx = x + bar_w / 2
		ly = axis_y + 8
		bars += (
			f'<text x="{lx:.1f}" y="{ly:.1f}" font-size="9" fill="#334155" '
			f'text-anchor="end" transform="rotate(-40 {lx:.1f} {ly:.1f})">{label}</text>'
		)

	legend = (
		f'<g transform="translate({left}, 10)">'
		f'<rect x="0" y="0" width="10" height="10" fill="{colors["ip"]}" rx="1"/>'
		f'<text x="14" y="9" font-size="10" fill="#334155">{_("IP")}</text>'
		f'<rect x="50" y="0" width="10" height="10" fill="{colors["op"]}" rx="1"/>'
		f'<text x="64" y="9" font-size="10" fill="#334155">{_("OP")}</text>'
		f'<rect x="100" y="0" width="10" height="10" fill="{colors["iop"]}" rx="1"/>'
		f'<text x="114" y="9" font-size="10" fill="#334155">{_("IOP")}</text>'
		f"</g>"
	)

	return f"""
	<div class="dwia-chart" style="margin:0 0 16px;padding:12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;">
		<div style="font-size:13px;font-weight:600;color:#0f172a;margin-bottom:6px;">
			{_("Top Doctors by Income")} <span style="font-weight:400;color:#64748b;">({_("IP")} / {_("OP")} / {_("IOP")} · {_("includes Other Income")})</span>
		</div>
		<svg viewBox="0 0 {width:.0f} {height:.0f}" width="100%" style="max-width:100%;height:auto;display:block;">
			{legend}
			{bars}
		</svg>
	</div>
	"""


def render_analysis_html(doc_or_filters=None, analysis=None, include_chart=True) -> str:
	"""Serene-style HTML with dynamic period columns.

	``include_chart`` — when False, skip the IP/OP/IOP stacked bar (used by
	Income by Doctor Patient and Source → Doctor view).
	"""
	ctx = frappe._dict(doc_or_filters or {})
	analysis = analysis or _parse_analysis(ctx)
	if not analysis or not analysis.get("periods"):
		return f'<div class="text-muted">{_("Generate analysis to preview the report.")}</div>'

	periods = analysis["periods"]
	doctors = analysis.get("doctors") or []
	col_totals = analysis.get("totals") or []
	branch = (
		analysis.get("cost_center")
		or ctx.get("cost_center")
		or _("All Branches (Consolidate)")
	)
	generated = format_datetime_safe(ctx.get("generated_on") or now_datetime())
	period_label = analysis.get("period") or ctx.get("period") or "Yearly"

	money = format_money_bhd

	# One band per period: IP | OP | IOP | Total | Discount | Net Total
	period_cols = ("ip", "op", "iop", "total", "discount", "net")
	period_labels = ("IP", "OP", "IOP", "Total", "Discount", "Net Total")
	# Equal money-column width (match compact IP look).
	amt_w = "72px"
	amt_style = (
		f"border:1px solid #333;padding:2px 4px;text-align:right;white-space:nowrap;"
		f"width:{amt_w};min-width:{amt_w};max-width:{amt_w};"
	)
	amt_th_style = (
		f"border:1px solid #333;padding:3px 4px;text-align:center;font-size:10px;"
		f"white-space:nowrap;width:{amt_w};min-width:{amt_w};max-width:{amt_w};"
	)

	period_headers = ""
	period_sub = ""
	for i, p in enumerate(periods):
		bg = PERIOD_COLORS[i % len(PERIOD_COLORS)]
		label = frappe.utils.escape_html(p.get("label") or p.get("key") or "")
		period_headers += (
			f'<th colspan="6" style="background:{bg};text-align:center;border:1px solid #333;'
			f'padding:4px;font-weight:bold;">{label}</th>'
		)
		for lbl in period_labels:
			period_sub += f'<th style="background:{bg};{amt_th_style}">{lbl}</th>'

	def _amt_cells(period_row, keys=period_cols):
		html = ""
		for k in keys:
			val = flt((period_row or {}).get(k))
			color = "#c62828" if k == "discount" and val else "#000"
			html += f'<td style="{amt_style}color:{color};">{money(val)}</td>'
		return html

	body = ""
	for r in doctors:
		by_key = {p.get("key"): p for p in (r.get("periods") or [])}
		body += "<tr>"
		body += f'<td style="border:1px solid #333;padding:2px 4px;text-align:center;">{cint(r.get("rank_no"))}</td>'
		body += (
			f'<td style="border:1px solid #333;padding:2px 6px;text-align:left;max-width:220px;'
			f'width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"'
			f' title="{frappe.utils.escape_html(r.get("doctor_name") or "")}">'
			f'{frappe.utils.escape_html(r.get("doctor_name") or "")}</td>'
		)
		for p in periods:
			body += _amt_cells(by_key.get(p["key"]))
		body += "</tr>"

	tot_by_key = {t.get("key"): t for t in col_totals}
	footer = '<tr style="font-weight:bold;background:#f5f5f5;">'
	footer += f'<td colspan="2" style="border:1px solid #333;padding:3px 6px;">{_("Total")}</td>'
	for p in periods:
		footer += _amt_cells(tot_by_key.get(p["key"]))
	footer += "</tr>"

	from_s = _fmt_short_date(analysis.get("from_date") or ctx.get("from_date"))
	to_s = _fmt_short_date(analysis.get("to_date") or ctx.get("to_date"))
	# Only the explicit ``include_chart`` arg controls this (default True for DWIA).
	chart_html = render_chart_html(analysis) if include_chart else ""

	return f"""
	<div class="dwia-report" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;">
		<div style="font-size:10px;margin-bottom:2px;">{frappe.utils.escape_html(generated)}</div>
		<div style="text-align:center;font-size:22px;font-weight:bold;color:#8B0000;margin:2px 0 10px;">
			{_("Doctor Wise Income Analysis")}
		</div>
		<table style="margin:0 auto 12px;border-collapse:collapse;font-size:11px;">
			<tr>
				<td style="border:1px solid #333;padding:4px 8px;"><b>{_("From")}</b></td>
				<td style="border:1px solid #333;padding:4px 8px;">{from_s}</td>
				<td style="border:1px solid #333;padding:4px 8px;"><b>{_("to")}</b></td>
				<td style="border:1px solid #333;padding:4px 8px;">{to_s}</td>
			</tr>
			<tr>
				<td style="border:1px solid #333;padding:4px 8px;"><b>{_("Period")}</b></td>
				<td style="border:1px solid #333;padding:4px 8px;">{frappe.utils.escape_html(str(period_label))}</td>
				<td style="border:1px solid #333;padding:4px 8px;"><b>{_("Branch")}</b></td>
				<td style="border:1px solid #333;padding:4px 8px;">{frappe.utils.escape_html(str(branch))}</td>
			</tr>
		</table>
		{chart_html}
		<div style="overflow:auto;max-width:100%;">
		<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px;min-width:720px;">
			<thead>
				<tr>
					<th rowspan="2" style="border:1px solid #333;padding:4px;background:#eee;width:48px;vertical-align:middle;">Rank<br>No.</th>
					<th rowspan="2" style="border:1px solid #333;padding:4px;background:#eee;width:220px;max-width:220px;vertical-align:middle;">Doctor Name</th>
					{period_headers}
				</tr>
				<tr>{period_sub}</tr>
			</thead>
			<tbody>
				{body}
				{footer}
			</tbody>
		</table>
		</div>
	</div>
	"""
