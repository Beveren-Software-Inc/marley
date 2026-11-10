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


def _item_filters(src) -> frappe._dict:
	"""Filters handed to ``get_service_items`` — the billed lines of the range."""
	return frappe._dict(
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


def prepare_service_items(doc_or_filters):
	"""Fetch + enrich the billed service lines once.

	Returns ``(items, billing_source)``. Callers that need both the doctor
	summary and the visit ledger of the Detailed view pass ``items`` into
	``build_analysis`` / ``build_doctor_visit_ledger`` so the (expensive)
	billing queries run only once.
	"""
	src = frappe._dict(doc_or_filters or {})
	filters = _item_filters(src)
	billing_source = filters.get("source") or "Sales Invoice"
	items = get_service_items(filters)
	items = _enrich_items_with_discount(items, billing_source)
	items = _enrich_items_with_tax(items, billing_source)
	return items, billing_source


def build_analysis(doc_or_filters, items=None) -> dict:
	"""Build dynamic period analysis payload from a Doc or filters dict.

	``filters.practitioner`` (optional) restricts the analysis to one doctor —
	used by the Detailed drill-down of Income by Doctor Patient and Source.
	"""
	src = frappe._dict(doc_or_filters or {})
	windows = period_windows(src.from_date, src.to_date, src.get("period") or "Yearly")
	only_practitioner = (src.get("practitioner") or "").strip()

	if items is None:
		items = prepare_service_items(src)[0]

	# doctor_key -> period_key -> bucket
	matrix = defaultdict(lambda: defaultdict(_empty_bucket))
	meta = {}
	practitioner_details = {}

	if items:
		practitioner_by_base = resolve_practitioners(items)
		practitioner_ids = {p for p in practitioner_by_base.values() if p}
		if only_practitioner:
			practitioner_ids.add(only_practitioner)
		practitioner_details = get_practitioner_details(practitioner_ids)
		visit_names = {
			(row.custom_base_reference_name or "").strip()
			for row in items
			if (row.custom_base_reference or "").strip() == "Patient Visit"
		}
		visit_care_map = _load_visit_care_map(visit_names)

		# Keep the selected doctor in the table even when nothing was billed in
		# the range, so the drill-down header/periods stay aligned.
		if only_practitioner and only_practitioner not in meta:
			details = practitioner_details.get(only_practitioner) or {}
			meta[only_practitioner] = {
				"practitioner": only_practitioner,
				"doctor_name": details.get("practitioner_name") or only_practitioner,
				"is_other_income": 0,
			}

		for row in items:
			pkey = _period_key_for_date(row.get("transaction_date"), windows)
			if not pkey:
				continue
			base_key = (row.custom_base_reference, row.custom_base_reference_name)
			practitioner = practitioner_by_base.get(base_key)
			# Detailed drill-down asks for one doctor only.
			if only_practitioner and practitioner != only_practitioner:
				continue
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
		"practitioner": only_practitioner or None,
		"practitioner_name": (meta.get(only_practitioner) or {}).get("doctor_name")
		if only_practitioner
		else None,
		"practitioner_id": (practitioner_details.get(only_practitioner) or {}).get("doctors_id")
		if only_practitioner
		else None,
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


# ── Detailed drill-down: transaction (invoice / order) → billed services ─────

# Transactions rendered in the HTML block above the datatable. The datatable
# itself is never truncated.
MAX_DETAIL_HTML_SERVICES = 500


def build_doctor_service_detail(doc_or_filters, items=None) -> dict:
	"""One-table service breakdown of a doctor's income (no invoice nesting).

	Lines attributed to the doctor are aggregated by service (+ care channel).
	Lab / inventory lines use the same labels as Source Detailed. Pick
	``filters.practitioner`` to limit to one doctor; when empty, every doctor's
	services are listed (with a doctor column).
	"""
	src = frappe._dict(doc_or_filters or {})
	only_practitioner = (src.get("practitioner") or "").strip()
	if items is None:
		items, billing_source = prepare_service_items(src)
	else:
		billing_source = (src.get("source") or "Sales Invoice").strip() or "Sales Invoice"
	is_order = billing_source.lower().startswith("sales order")
	transaction_type = "Sales Order" if is_order else "Sales Invoice"

	doctor_details = get_practitioner_details({only_practitioner}) if only_practitioner else {}
	doctor = doctor_details.get(only_practitioner) or {}
	practitioner_details = {}

	# (doctor_key, service_label, care_channel, item_code) → totals
	service_buckets = {}
	doctor_totals = defaultdict(lambda: {"net": 0.0, "discount": 0.0, "tax": 0.0, "total": 0.0})
	line_count = 0
	txn_names = set()

	if items:
		practitioner_by_base = resolve_practitioners(items)
		practitioner_ids = {p for p in practitioner_by_base.values() if p}
		if only_practitioner:
			practitioner_ids.add(only_practitioner)
		practitioner_details = get_practitioner_details(practitioner_ids)
		visit_names = {
			(row.custom_base_reference_name or "").strip()
			for row in items
			if (row.custom_base_reference or "").strip() == "Patient Visit"
		}
		visit_care_map = _load_visit_care_map(visit_names)
		lab_items = _lab_item_codes()

		for row in items:
			practitioner = practitioner_by_base.get(
				(row.custom_base_reference, row.custom_base_reference_name)
			)
			if only_practitioner and practitioner != only_practitioner:
				continue

			net = flt(row.get("amount"))
			discount = _line_discount(row)
			tax = _line_tax(row)
			channel = classify_care_channel(
				row.custom_base_reference, row.custom_base_reference_name, visit_care_map
			)
			doctor_key = practitioner or OTHER_INCOME_KEY
			doctor_name = (
				_("Other Income")
				if doctor_key == OTHER_INCOME_KEY
				else (practitioner_details.get(practitioner) or {}).get("practitioner_name")
				or practitioner
				or _("Other Income")
			)
			raw_name = (
				(row.get("item_name") or row.get("item_code") or _("Other")).strip() or _("Other")
			)
			service_label = _detailed_service_label(row, channel, lab_items)
			item_code = (row.get("item_code") or "").strip()
			# Lab / inventory collapse to one label per channel — drop item_code key.
			agg_code = "" if service_label != raw_name else item_code
			bucket_key = (doctor_key, service_label, channel, agg_code)
			bucket = service_buckets.get(bucket_key)
			if bucket is None:
				bucket = service_buckets[bucket_key] = {
					"doctor": "" if doctor_key == OTHER_INCOME_KEY else (practitioner or ""),
					"doctor_name": doctor_name,
					"service_name": service_label,
					"item_code": agg_code,
					"item_name": service_label,
					"care_channel": channel,
					"qty": 0.0,
					"net": 0.0,
					"discount": 0.0,
					"tax": 0.0,
					"total": 0.0,
				}
			bucket["qty"] += flt(row.get("qty"))
			bucket["net"] += net
			bucket["discount"] += discount
			bucket["tax"] += tax
			bucket["total"] += net + tax
			line_count += 1
			txn_name = row.get("sales_order") or ""
			if txn_name:
				txn_names.add(txn_name)
			for metric, val in (
				("net", net),
				("discount", discount),
				("tax", tax),
				("total", net + tax),
			):
				doctor_totals[doctor_key][metric] += val

	services = []
	for bucket in service_buckets.values():
		services.append({k: (flt(v) if k in ("qty", "net", "discount", "tax", "total") else v) for k, v in bucket.items()})
	services.sort(key=lambda r: (r.get("doctor_name") or "", -flt(r.get("net")), r.get("service_name") or ""))

	grand = {"net": 0.0, "discount": 0.0, "tax": 0.0, "total": 0.0}
	for svc in services:
		for key in grand:
			grand[key] += flt(svc.get(key))

	doctor_rows = []
	for key, totals in doctor_totals.items():
		is_other = key == OTHER_INCOME_KEY
		doctor_rows.append(
			{
				"practitioner": None if is_other else key,
				"doctor_name": _("Other Income")
				if is_other
				else (practitioner_details.get(key) or {}).get("practitioner_name") or key,
				"is_other_income": 1 if is_other else 0,
				**{metric: flt(val) for metric, val in totals.items()},
			}
		)
	doctor_rows.sort(key=lambda r: r["net"], reverse=True)

	return {
		"practitioner": only_practitioner or None,
		"doctor_name": doctor.get("practitioner_name")
		or (only_practitioner if only_practitioner else _("All Doctors")),
		"doctor_id": doctor.get("doctors_id") or only_practitioner or "",
		"period": src.get("period") or "Yearly",
		"from_date": str(getdate(src.from_date)) if src.get("from_date") else "",
		"to_date": str(getdate(src.to_date)) if src.get("to_date") else "",
		"cost_center": src.get("cost_center"),
		"billing_source": billing_source,
		"transaction_type": transaction_type,
		"services": services,
		"transactions": [],  # kept for callers expecting the key; unused in UI
		"totals": {
			**{key: flt(val) for key, val in grand.items()},
			"transactions": len(txn_names),
			"services": len(services),
			"lines": line_count,
		},
		"doctors": doctor_rows,
	}


def render_doctor_detail_hint() -> str:
	"""Hint shown when Detailed is ticked without picking a doctor."""
	return (
		'<div class="dwia-detail-hint" style="margin:12px 0 0;padding:12px;border:1px solid #e2e8f0;'
		'border-radius:8px;background:#f8fafc;color:#475569;font-family:Arial,Helvetica,sans-serif;'
		'font-size:12px;">'
		+ _(
			"Detailed: pick a Healthcare Practitioner to see one table of the services billed "
			"for that doctor. Without a doctor selected, the table below lists every service."
		)
		+ "</div>"
	)


def render_doctor_service_detail_html(doc_or_filters=None, detail=None) -> str:
	"""Printable one-table service breakdown for the Detailed doctor view."""
	ctx = frappe._dict(doc_or_filters or {})
	if detail is None:
		detail = build_doctor_service_detail(ctx)

	money = format_money_bhd
	esc = frappe.utils.escape_html
	services = detail.get("services") or []
	totals = detail.get("totals") or {}
	generated = format_datetime_safe(ctx.get("generated_on") or now_datetime())
	branch = detail.get("cost_center") or ctx.get("cost_center") or _("All Branches (Consolidate)")
	doctor_label = detail.get("doctor_name") or _("All Doctors")
	doctor_id = detail.get("doctor_id") or ""
	show_doctor = not detail.get("practitioner")

	th = (
		"border:1px solid #333;padding:3px 5px;background:#eee;text-align:center;"
		"font-size:10px;white-space:nowrap;font-weight:bold;"
	)
	td = "border:1px solid #333;padding:2px 5px;font-size:10px;"
	td_num = f"{td}text-align:right;white-space:nowrap;"

	head = f'<th style="{th}text-align:center;width:28px;">#</th>'
	if show_doctor:
		head += f'<th style="{th}">{_("Doctor")}</th>'
	head += (
		f'<th style="{th}text-align:left;">{_("Service")}</th>'
		f'<th style="{th}width:56px;">{_("Care")}</th>'
		f'<th style="{th}width:64px;">{_("Qty")}</th>'
		f'<th style="{th}width:96px;">{_("Amount")}</th>'
		f'<th style="{th}width:96px;">{_("Discount")}</th>'
		f'<th style="{th}width:88px;">{_("Tax")}</th>'
		f'<th style="{th}width:100px;">{_("Total")}</th>'
	)

	rows = ""
	shown = services[:MAX_DETAIL_HTML_SERVICES]
	for idx, svc in enumerate(shown, start=1):
		rows += "<tr>"
		rows += f'<td style="{td}text-align:center;">{idx}</td>'
		if show_doctor:
			rows += f'<td style="{td}">{esc(str(svc.get("doctor_name") or ""))}</td>'
		rows += f'<td style="{td}">{esc(str(svc.get("service_name") or svc.get("item_name") or ""))}</td>'
		rows += f'<td style="{td}text-align:center;">{esc(str(svc.get("care_channel") or ""))}</td>'
		rows += f'<td style="{td_num}">{flt(svc.get("qty")):g}</td>'
		rows += f'<td style="{td_num}">{money(svc.get("net"))}</td>'
		rows += f'<td style="{td_num}color:#c62828;">{money(svc.get("discount"))}</td>'
		rows += f'<td style="{td_num}">{money(svc.get("tax"))}</td>'
		rows += f'<td style="{td_num}font-weight:600;">{money(svc.get("total"))}</td>'
		rows += "</tr>"

	if not rows:
		rows = (
			f'<tr><td colspan="{9 if show_doctor else 8}" style="{td}color:#64748b;text-align:center;">'
			f"{_('No billed service found for the selected doctor in this period.')}</td></tr>"
		)

	label_span = 5 if show_doctor else 4  # #, [Doctor], Service, Care, Qty
	rows += (
		f'<tr style="background:#eeeeee;font-weight:bold;">'
		f'<td colspan="{label_span}" style="{td}text-align:right;">{_("Grand Total")}</td>'
		f'<td style="{td_num}">{money(totals.get("net"))}</td>'
		f'<td style="{td_num}color:#c62828;">{money(totals.get("discount"))}</td>'
		f'<td style="{td_num}">{money(totals.get("tax"))}</td>'
		f'<td style="{td_num}">{money(totals.get("total"))}</td>'
		f"</tr>"
	)

	truncate = ""
	if len(services) > MAX_DETAIL_HTML_SERVICES:
		truncate = (
			'<div style="margin:0 0 8px;color:#b45309;font-size:11px;">'
			+ _(
				"Showing first {0} of {1} services here — the table below lists all of them."
			).format(MAX_DETAIL_HTML_SERVICES, len(services))
			+ "</div>"
		)

	doctor_line = esc(str(doctor_label))
	if doctor_id:
		doctor_line += f" &middot; {esc(str(doctor_id))}"

	return f"""
	<div class="dwia-detail" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;">
		<div style="font-size:10px;margin-bottom:2px;">{esc(generated)}</div>
		<div style="text-align:center;font-size:18px;font-weight:bold;color:#8B0000;margin:2px 0 8px;">
			{_("Doctor Detailed Income")}
		</div>
		<table style="margin:0 auto 12px;border-collapse:collapse;font-size:11px;">
			<tr>
				<td style="{td}"><b>{_("Doctor")}</b></td>
				<td style="{td}">{doctor_line}</td>
				<td style="{td}"><b>{_("From")}</b></td>
				<td style="{td}">{_fmt_short_date(detail.get("from_date") or ctx.get("from_date"))}</td>
				<td style="{td}"><b>{_("Billing Source")}</b></td>
				<td style="{td}">{esc(str(detail.get("billing_source") or ""))}</td>
			</tr>
			<tr>
				<td style="{td}"><b>{_("Branch")}</b></td>
				<td style="{td}">{esc(str(branch))}</td>
				<td style="{td}"><b>{_("to")}</b></td>
				<td style="{td}">{_fmt_short_date(detail.get("to_date") or ctx.get("to_date"))}</td>
				<td style="{td}"><b>{_("Services")}</b></td>
				<td style="{td}">{cint(totals.get("services"))}</td>
			</tr>
		</table>
		{truncate}
		<table style="width:100%;border-collapse:collapse;table-layout:fixed;">
			<thead><tr>{head}</tr></thead>
			<tbody>{rows}</tbody>
		</table>
	</div>
	"""



# ── Doctor — Detailed visit ledger (Patients Visits by Doctors) ─────────────

# Amount columns of the Accounts team's “Patients Visits by Doctors” sheet:
# the doctor's income per visit split into consultation / pharmacy / lab, the
# receipts of that visit split by payment mode, plus discount and balance.
VISIT_LEDGER_AMOUNT_KEYS = (
	"consultation",
	"pharmacy",
	"lab",
	"paid_previous",
	"disc_previous",
	"total_due",
	"cash",
	"cheque",
	"card",
	"bwallet",
	"disc",
	"balance",
)
# Care channels of the sheet, in the order it prints them.
PATIENT_TYPE_ORDER = ("OP", "IP", "IOP")
# Visits rendered in the HTML block above the datatable (never truncated there).
MAX_DETAIL_HTML_VISITS = 500

# Scoped styles for the printable block: the print window has no desk styles,
# and keeping them here (instead of on every cell) keeps the payload small.
VISIT_LEDGER_STYLE = """
.dwia-vl { font-family:Arial,Helvetica,sans-serif; font-size:11px; color:#000; }
.dwia-vl .generated { font-size:10px; margin-bottom:2px; }
.dwia-vl .doctor-head { text-align:center; font-size:15px; font-weight:bold; color:#8B0000; margin:10px 0 4px; }
.dwia-vl .doctor-head .doctor-id { font-size:10px; font-weight:normal; color:#333; }
.dwia-vl table { border-collapse:collapse; }
.dwia-vl table.meta { margin:0 auto 8px; font-size:11px; }
.dwia-vl table.meta td { border:1px solid #333; padding:3px 8px; }
.dwia-vl .sheet-wrap { overflow:auto; max-width:100%; }
.dwia-vl table.sheet { width:100%; }
.dwia-vl th {
	border:1px solid #333; padding:3px 4px; background:#d6d6d6; color:#000080;
	text-align:center; font-size:9px; font-weight:bold; white-space:nowrap;
}
.dwia-vl th.l { text-align:left; }
.dwia-vl td { border:1px solid #333; padding:1px 4px; font-size:9px; }
.dwia-vl td.c { text-align:center; white-space:nowrap; }
.dwia-vl td.n { text-align:right; white-space:nowrap; }
.dwia-vl td.disc { color:#c62828; }
.dwia-vl tr.section td { background:#d6d6d6; color:#000080; font-weight:bold; }
.dwia-vl tr.type-total td { background:#f2f2f2; color:#000080; font-weight:bold; }
.dwia-vl tr.doctor-total td { background:#e8e8e8; color:#000080; font-weight:bold; }
.dwia-vl tr.report-total td { background:#fdecea; color:#ff0000; font-weight:bold; }
.dwia-vl tr.report-total td.label { color:#000080; }
.dwia-vl .report-block { margin-top:10px; }
.dwia-vl td.label { text-align:right; }
.dwia-vl .empty { padding:8px; text-align:center; color:#64748b; }
.dwia-vl .truncate { margin:0 0 8px; color:#b45309; font-size:11px; }
"""


def _ledger_zero_amounts() -> dict:
	return {key: 0.0 for key in VISIT_LEDGER_AMOUNT_KEYS}


def _ledger_add_amounts(target, source) -> None:
	for key in VISIT_LEDGER_AMOUNT_KEYS:
		target[key] = flt(target.get(key)) + flt(source.get(key))


def _ledger_round_amounts(row) -> None:
	for key in VISIT_LEDGER_AMOUNT_KEYS:
		row[key] = flt(row.get(key), 3)
	# Total Due of the sheet = consultation + pharmacy + lab (no tax column).
	row["total_due"] = flt(
		flt(row.get("consultation")) + flt(row.get("pharmacy")) + flt(row.get("lab")), 3
	)


def _payment_mode_column(mode_of_payment) -> str:
	"""Cash / Cheque-Online / Credit Card / B-Wallet column of a payment mode.

	Uses the Daily Collection Summary buckets so both sheets split payments the
	same way.
	"""
	from healthcare.api.billing import _collection_mode_bucket

	return _collection_mode_bucket(mode_of_payment)


def _visit_service_split(lines, base_reference) -> dict:
	"""Billed lines of one visit → consultation / pharmacy / lab amounts."""
	from healthcare.api.reception_reports import _soa_is_lab_item, _soa_is_medicine_item

	split = {"consultation": 0.0, "pharmacy": 0.0, "lab": 0.0}
	base_reference = (base_reference or "").strip()
	if base_reference in ("Lab Test", "Lab Test Template"):
		split["lab"] = flt(sum(flt(line.get("amount")) for line in lines))
		return split

	bucket_by_item = {}
	for line in lines:
		item_code = (line.get("item_code") or "").strip()
		bucket = bucket_by_item.get(item_code)
		if bucket is None:
			item_group = (line.get("item_group") or "").strip()
			if _soa_is_lab_item(item_code, item_group=item_group, base_reference=base_reference):
				bucket = "lab"
			elif _soa_is_medicine_item(
				item_code,
				item_group=item_group,
				base_reference=base_reference,
				item_name=(line.get("item_name") or "").strip(),
			):
				bucket = "pharmacy"
			else:
				bucket = "consultation"
			bucket_by_item[item_code] = bucket
		split[bucket] += flt(line.get("amount"))
	return split


def _in_chunks(names, size: int = 500):
	names = list(names)
	for start in range(0, len(names), size):
		yield names[start : start + size]


def _sales_invoice_headers(invoice_names) -> dict:
	"""Invoice header fields the ledger needs (name → row)."""
	names = sorted({name for name in (invoice_names or []) if name})
	if not names:
		return {}
	meta = frappe.get_meta("Sales Invoice")
	fields = ["name", "posting_date", "grand_total", "outstanding_amount"]
	for fieldname in (
		"discount_amount",
		"patient",
		"custom_patient_name",
		"custom_base_reference",
		"custom_base_reference_name",
	):
		if meta.has_field(fieldname):
			fields.append(fieldname)
	headers = {}
	for chunk in _in_chunks(names):
		for row in frappe.get_all(
			"Sales Invoice",
			filters={"name": ["in", chunk], "docstatus": 1},
			fields=fields,
			limit_page_length=0,
		):
			headers[row.get("name")] = row
	return headers


def _sales_order_headers(order_names) -> dict:
	names = sorted({name for name in (order_names or []) if name})
	if not names:
		return {}
	meta = frappe.get_meta("Sales Order")
	fields = ["name", "transaction_date", "grand_total"]
	if meta.has_field("advance_paid"):
		fields.append("advance_paid")
	headers = {}
	for chunk in _in_chunks(names):
		for row in frappe.get_all(
			"Sales Order",
			filters={"name": ["in", chunk], "docstatus": 1},
			fields=fields,
			limit_page_length=0,
		):
			headers[row.get("name")] = row
	return headers


def _invoice_names_by_sales_order(order_names) -> dict:
	"""Sales Order → submitted Sales Invoices raised from it."""
	names = sorted({name for name in (order_names or []) if name})
	if not names:
		return {}
	out = defaultdict(list)
	for chunk in _in_chunks(names):
		rows = frappe.db.sql(
			"""
			SELECT DISTINCT sii.sales_order AS sales_order, si.name AS invoice
			FROM `tabSales Invoice Item` sii
			INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
			WHERE si.docstatus = 1 AND sii.sales_order IN %(orders)s
			""",
			{"orders": tuple(chunk)},
			as_dict=True,
		)
		for row in rows:
			if row.invoice not in out[row.sales_order]:
				out[row.sales_order].append(row.invoice)
	return out


def _bucket_payments(rows) -> dict:
	"""Group payment allocations per invoice into the sheet's mode columns."""
	payments = {}
	for row in rows:
		entry = payments.get(row.invoice)
		if entry is None:
			entry = payments[row.invoice] = {
				"total": 0.0,
				"cash": 0.0,
				"cheque": 0.0,
				"card": 0.0,
				"bwallet": 0.0,
			}
		column = _payment_mode_column(row.mode_of_payment)
		amount = flt(row.allocated)
		entry[column] = flt(entry.get(column)) + amount
		entry["total"] = flt(entry["total"]) + amount
	return payments


def _visit_ledger_payments(invoice_names, from_date, to_date) -> dict:
	"""Receipts of the period per invoice, split into the sheet's mode columns."""
	names = sorted({name for name in (invoice_names or []) if name})
	if not names or not from_date or not to_date:
		return {}
	rows = []
	for chunk in _in_chunks(names):
		rows.extend(
			frappe.db.sql(
				"""
				SELECT per.reference_name AS invoice,
					pe.mode_of_payment AS mode_of_payment,
					IFNULL(per.allocated_amount, 0) AS allocated
				FROM `tabPayment Entry Reference` per
				INNER JOIN `tabPayment Entry` pe ON pe.name = per.parent
				WHERE per.reference_doctype = 'Sales Invoice'
					AND per.reference_name IN %(invoices)s
					AND pe.docstatus = 1
					AND IFNULL(pe.payment_type, 'Receive') != 'Pay'
					AND pe.posting_date BETWEEN %(from_date)s AND %(to_date)s
				""",
				{"invoices": tuple(chunk), "from_date": from_date, "to_date": to_date},
				as_dict=True,
			)
		)
	return _bucket_payments(rows)


def _previous_visit_payments(from_date, to_date, exclude_names) -> dict:
	"""Receipts of the period on visits billed before it (previous dues)."""
	if not from_date or not to_date:
		return {}
	conditions = [
		"per.reference_doctype = 'Sales Invoice'",
		"pe.docstatus = 1",
		"IFNULL(pe.payment_type, 'Receive') != 'Pay'",
		"pe.posting_date BETWEEN %(from_date)s AND %(to_date)s",
		"si.posting_date < %(from_date)s",
	]
	values = {"from_date": from_date, "to_date": to_date}
	exclude_names = sorted({name for name in (exclude_names or []) if name})
	if exclude_names:
		conditions.append("per.reference_name NOT IN %(in_period)s")
		values["in_period"] = tuple(exclude_names)
	rows = frappe.db.sql(
		f"""
		SELECT per.reference_name AS invoice,
			pe.mode_of_payment AS mode_of_payment,
			IFNULL(per.allocated_amount, 0) AS allocated
		FROM `tabPayment Entry Reference` per
		INNER JOIN `tabPayment Entry` pe ON pe.name = per.parent
		INNER JOIN `tabSales Invoice` si ON si.name = per.reference_name
		WHERE {" AND ".join(conditions)}
		""",
		values,
		as_dict=True,
	)
	return _bucket_payments(rows)


def _patient_ledger_display(patients) -> dict:
	"""Patient → {file_no, patient_name} for the sheet's File No / Patient Name."""
	names = sorted({patient for patient in (patients or []) if patient})
	out = {}
	for chunk in _in_chunks(names):
		for row in frappe.get_all(
			"Patient",
			filters={"name": ["in", chunk]},
			fields=["name", "file_no", "patient_name"],
			limit_page_length=0,
		):
			out[row.get("name")] = {
				"file_no": row.get("file_no") or "",
				"patient_name": row.get("patient_name") or "",
			}
	return out


def build_doctor_visit_ledger(doc_or_filters, items=None) -> dict:
	"""Visit-by-visit ledger of the Detailed doctor view.

	The Accounts team's “Patients Visits by Doctors” sheet: for the selected
	doctor, one row per billed visit (Visit/Adm No, Date, File No, Patient Name)
	with the visit's income split into Consultation / Pharmacy / Lab, the visit's
	receipts split into Cash / Cheque-Online / Credit Card / B-Wallet, plus
	Discount and Balance. Rows are grouped by care channel (OP / IP / IOP) under
	the doctor, followed by a Patient Type Total per channel, a Doctor Total and
	a Report Total.

	Payments come from Payment Entries of the selected From–To range; visits
	billed before the range that were paid inside it show only their previous
	columns (Paid of Previous / Disc. of Previous / Balance), like the Daily
	Collection Summary does.
	"""
	src = frappe._dict(doc_or_filters or {})
	only_practitioner = (src.get("practitioner") or "").strip()
	if items is None:
		items, billing_source = prepare_service_items(src)
	else:
		billing_source = (src.get("source") or "Sales Invoice").strip() or "Sales Invoice"
	is_order = billing_source.lower().startswith("sales order")
	transaction_type = "Sales Order" if is_order else "Sales Invoice"
	from_date = getdate(src.get("from_date")) if src.get("from_date") else None
	to_date = getdate(src.get("to_date")) if src.get("to_date") else None
	items = items or []

	practitioner_by_base = resolve_practitioners(items) if items else {}

	# Doctor-attributed lines grouped per billed transaction (visit).
	lines_by_txn = defaultdict(list)
	visit_names = set()
	for row in items:
		base_type = (row.get("custom_base_reference") or "").strip()
		base_name = (row.get("custom_base_reference_name") or "").strip()
		if only_practitioner and practitioner_by_base.get((base_type, base_name)) != only_practitioner:
			continue
		transaction = (row.get("sales_order") or "").strip()
		if not transaction:
			continue
		lines_by_txn[transaction].append(row)
		if base_type == "Patient Visit":
			visit_names.add(base_name)

	invoices_by_txn = (
		_invoice_names_by_sales_order(list(lines_by_txn))
		if is_order
		else {transaction: [transaction] for transaction in lines_by_txn}
	)
	period_invoices = sorted({inv for invs in invoices_by_txn.values() for inv in invs})
	order_headers = _sales_order_headers(list(lines_by_txn)) if is_order else {}
	invoice_headers = _sales_invoice_headers(period_invoices)
	payments = _visit_ledger_payments(period_invoices, from_date, to_date)

	# Visits billed before the range but paid inside it (previous dues).
	previous_invoices = []
	previous_payments = _previous_visit_payments(from_date, to_date, period_invoices)
	if previous_payments:
		dated = _sales_invoice_headers(list(previous_payments))
		for invoice in sorted(dated):
			posted = dated[invoice].get("posting_date")
			if posted and getdate(posted) < from_date:
				previous_invoices.append(invoice)
		invoice_headers.update(dated)
		for invoice in previous_invoices:
			header = invoice_headers.get(invoice) or {}
			if (header.get("custom_base_reference") or "").strip() == "Patient Visit":
				visit_names.add((header.get("custom_base_reference_name") or "").strip())

	visit_care_map = _load_visit_care_map(visit_names)
	patients = {(row.get("patient") or "").strip() for row in items}
	patients.update(
		((invoice_headers.get(invoice) or {}).get("patient") or "").strip()
		for invoice in previous_invoices
	)
	patient_display = _patient_ledger_display(patients)

	rows = []

	def _base_row(transaction, base_type, base_name, patient, patient_name, header):
		display = patient_display.get(patient) or {}
		visit_date = header.get("transaction_date") or header.get("posting_date")
		return {
			"practitioner": practitioner_by_base.get((base_type, base_name)) or "",
			"patient_type": classify_care_channel(base_type, base_name, visit_care_map),
			"visit_no": base_name or transaction,
			"transaction": transaction,
			"patient": patient,
			"file_no": display.get("file_no") or "",
			"patient_name": display.get("patient_name") or patient_name or "",
			"sort_date": str(visit_date or ""),
			"date": _fmt_short_date(visit_date) if visit_date else "",
			"is_previous": 0,
			**_ledger_zero_amounts(),
		}

	for transaction, lines in lines_by_txn.items():
		first = lines[0]
		base_type = (first.get("custom_base_reference") or "").strip()
		base_name = (first.get("custom_base_reference_name") or "").strip()
		if is_order:
			header = order_headers.get(transaction) or {}
		else:
			header = invoice_headers.get(transaction) or {}
		row = _base_row(
			transaction,
			base_type,
			base_name,
			(first.get("patient") or "").strip(),
			(first.get("custom_patient_name") or "").strip()
			or (first.get("customer_name") or "").strip(),
			header,
		)
		split = _visit_service_split(lines, base_type)
		row["consultation"] = split["consultation"]
		row["pharmacy"] = split["pharmacy"]
		row["lab"] = split["lab"]
		row["disc"] = sum(_line_discount(line) for line in lines)

		invoices = invoices_by_txn.get(transaction) or []
		collected = 0.0
		for invoice in invoices:
			paid = payments.get(invoice) or {}
			for column in ("cash", "cheque", "card", "bwallet"):
				row[column] = flt(row.get(column)) + flt(paid.get(column))
			collected += flt(paid.get("total"))
		if is_order and not invoices:
			# Nothing invoiced yet — the order itself is the outstanding balance.
			row["balance"] = (
				flt(header.get("grand_total")) - flt(header.get("advance_paid")) - collected
			)
		else:
			row["balance"] = sum(
				flt((invoice_headers.get(invoice) or {}).get("outstanding_amount"))
				for invoice in invoices
			)
		_ledger_round_amounts(row)
		rows.append(row)

	for invoice in previous_invoices:
		header = invoice_headers.get(invoice) or {}
		row = _base_row(
			invoice,
			(header.get("custom_base_reference") or "").strip(),
			(header.get("custom_base_reference_name") or "").strip(),
			(header.get("patient") or "").strip(),
			(header.get("custom_patient_name") or "").strip(),
			header,
		)
		if only_practitioner and row["practitioner"] != only_practitioner:
			continue
		paid = previous_payments.get(invoice) or {}
		for column in ("cash", "cheque", "card", "bwallet"):
			row[column] = flt(paid.get(column))
		row["is_previous"] = 1
		row["paid_previous"] = flt(paid.get("total"))
		row["disc_previous"] = flt(header.get("discount_amount"))
		row["balance"] = flt(header.get("outstanding_amount"))
		_ledger_round_amounts(row)
		rows.append(row)

	return _group_visit_ledger(
		rows,
		{
			"practitioner": only_practitioner or None,
			"from_date": str(from_date or ""),
			"to_date": str(to_date or ""),
			"cost_center": src.get("cost_center"),
			"billing_source": billing_source,
			"transaction_type": transaction_type,
		},
	)


def _group_visit_ledger(rows, meta) -> dict:
	"""Doctor → patient type → visit rows, with type / doctor / report totals."""
	practitioner_ids = {row.get("practitioner") for row in rows if row.get("practitioner")}
	practitioner_details = get_practitioner_details(practitioner_ids) if practitioner_ids else {}

	def doctor_label(key):
		if not key:
			return _("Other Income"), ""
		details = practitioner_details.get(key) or {}
		return details.get("practitioner_name") or key, details.get("doctors_id") or ""

	buckets = {}
	order = []
	for row in rows:
		key = row.get("practitioner") or ""
		if key not in buckets:
			doctor_name, doctors_id = doctor_label(key)
			buckets[key] = {
				"practitioner": key or None,
				"doctor_name": doctor_name,
				"doctor_id": doctors_id,
				"is_other_income": 0 if key else 1,
				"patient_types": {},
			}
			order.append(key)
		buckets[key]["patient_types"].setdefault(row["patient_type"], []).append(row)

	doctors = []
	for key in order:
		bucket = buckets[key]
		doctor_total = _ledger_zero_amounts()
		patient_types = []
		extra_types = sorted(set(bucket["patient_types"]) - set(PATIENT_TYPE_ORDER))
		for patient_type in PATIENT_TYPE_ORDER + tuple(extra_types):
			type_rows = bucket["patient_types"].get(patient_type)
			if not type_rows:
				continue
			type_rows.sort(key=lambda r: (r.get("sort_date") or "", r.get("visit_no") or ""))
			type_total = _ledger_zero_amounts()
			for row in type_rows:
				_ledger_add_amounts(type_total, row)
			_ledger_round_amounts(type_total)
			patient_types.append(
				{
					"patient_type": patient_type,
					"label": _("{0} Patients").format(patient_type),
					"rows": type_rows,
					"total": type_total,
					"visits": len(type_rows),
				}
			)
			_ledger_add_amounts(doctor_total, type_total)
		_ledger_round_amounts(doctor_total)
		doctors.append(
			{
				"practitioner": bucket["practitioner"],
				"doctor_name": bucket["doctor_name"],
				"doctor_id": bucket["doctor_id"],
				"is_other_income": bucket["is_other_income"],
				"patient_types": patient_types,
				"total": doctor_total,
				"visits": sum(item["visits"] for item in patient_types),
			}
		)

	doctors.sort(
		key=lambda d: (cint(d.get("is_other_income")), -flt((d.get("total") or {}).get("total_due")))
	)
	report_total = _ledger_zero_amounts()
	for doctor in doctors:
		_ledger_add_amounts(report_total, doctor["total"])
	_ledger_round_amounts(report_total)

	flat_rows = [
		{**row, "doctor_name": doctor["doctor_name"]}
		for doctor in doctors
		for item in doctor["patient_types"]
		for row in item["rows"]
	]
	practitioner = meta.get("practitioner")
	selected = next(
		(d for d in doctors if d.get("practitioner") == practitioner), {}
	) if practitioner else {}

	return {
		**meta,
		"doctor_name": selected.get("doctor_name")
		or (_("All Doctors") if not practitioner else practitioner),
		"doctor_id": selected.get("doctor_id") or "",
		"doctors": doctors,
		"rows": flat_rows,
		"report_total": report_total,
		"visits": len(flat_rows),
	}


# Columns of the sheet, in print order: four text columns then the amounts.
VISIT_LEDGER_COLUMNS = (
	("visit_no", "Visit/Adm No"),
	("date", "Date"),
	("file_no", "File No."),
	("patient_name", "Patient Name"),
	("consultation", "Consultation"),
	("pharmacy", "Pharmacy"),
	("lab", "Lab"),
	("paid_previous", "Paid of Previous"),
	("disc_previous", "Disc. of Previous"),
	("total_due", "Total Due"),
	("cash", "Cash"),
	("cheque", "Cheque / Online"),
	("card", "Credit Card"),
	("bwallet", "B-Wallet / Benefit"),
	("disc", "Disc."),
	("balance", "Balance"),
)
VISIT_LEDGER_TEXT_COLUMNS = 4
VISIT_LEDGER_AMOUNT_COLUMNS = tuple(
	key for key, _label in VISIT_LEDGER_COLUMNS if key in VISIT_LEDGER_AMOUNT_KEYS
)


def render_doctor_visit_ledger_html(doc_or_filters=None, ledger=None) -> str:
	"""Printable visit ledger for the Detailed doctor view.

	Each doctor is a heading (its name) followed by the sheet table with the
	patient-type sections, type totals, doctor total and — for a single doctor —
	the grand total.
	"""
	ctx = frappe._dict(doc_or_filters or {})
	if ledger is None:
		ledger = build_doctor_visit_ledger(ctx)

	money = format_money_bhd
	esc = frappe.utils.escape_html
	generated = format_datetime_safe(ctx.get("generated_on") or now_datetime())
	branch = (
		ledger.get("cost_center") or ctx.get("cost_center") or _("All Branches (Consolidate)")
	)
	from_s = _fmt_short_date(ledger.get("from_date") or ctx.get("from_date"))
	to_s = _fmt_short_date(ledger.get("to_date") or ctx.get("to_date"))
	doctors = ledger.get("doctors") or []
	report_total = ledger.get("report_total") or _ledger_zero_amounts()
	total_visits = cint(ledger.get("visits"))
	span = len(VISIT_LEDGER_COLUMNS)

	head = ""
	for key, label in VISIT_LEDGER_COLUMNS:
		align = ' class="l"' if key == "patient_name" else ""
		head += f"<th{align}>{_(label)}</th>"

	def amount_cells(amounts) -> str:
		cells = ""
		for key in VISIT_LEDGER_AMOUNT_COLUMNS:
			value = flt((amounts or {}).get(key))
			style = ' class="n disc"' if key in ("disc", "disc_previous") and value else ' class="n"'
			cells += f"<td{style}>{money(value)}</td>"
		return cells

	def total_row(label, amounts, row_class) -> str:
		return (
			f'<tr class="{row_class}">'
			f'<td class="label" colspan="{VISIT_LEDGER_TEXT_COLUMNS}">{esc(label)}</td>'
			f"{amount_cells(amounts)}</tr>"
		)

	def sheet_table(rows_html) -> str:
		"""One table per doctor: the column header sits right under the name."""
		return (
			'<div class="sheet-wrap"><table class="sheet">'
			f"<thead><tr>{head}</tr></thead><tbody>{rows_html}</tbody>"
			"</table></div>"
		)

	single_doctor = len(doctors) == 1
	blocks = ""
	shown = 0
	for doctor in doctors:
		doctor_label = esc(str(doctor.get("doctor_name") or ""))
		if doctor.get("doctor_id"):
			doctor_label += (
				f' <span class="doctor-id">&middot; {esc(str(doctor.get("doctor_id")))}</span>'
			)
		body = ""
		for block in doctor.get("patient_types") or []:
			body += (
				f'<tr class="section"><td colspan="{span}">'
				f'{esc(str(block.get("label") or ""))} &nbsp;({cint(block.get("visits"))})</td></tr>'
			)
			for row in block.get("rows") or []:
				if shown >= MAX_DETAIL_HTML_VISITS:
					continue
				body += (
					"<tr>"
					f'<td class="c">{esc(str(row.get("visit_no") or ""))}</td>'
					f'<td class="c">{esc(str(row.get("date") or ""))}</td>'
					f'<td class="c">{esc(str(row.get("file_no") or ""))}</td>'
					f'<td>{esc(str(row.get("patient_name") or ""))}</td>'
					f"{amount_cells(row)}</tr>"
				)
				shown += 1
			body += total_row(_("Patient Type Total"), block.get("total"), "type-total")
		body += total_row(_("Doctor Total"), doctor.get("total"), "doctor-total")
		# A single-doctor sheet closes with the grand total, like the Accounts sheet.
		if single_doctor:
			body += total_row(_("Report Total"), report_total, "report-total")
		blocks += f'<div class="doctor-head">{doctor_label}</div>{sheet_table(body)}'

	if not doctors:
		blocks = (
			'<div class="empty">'
			+ _("No billed visit found for the selected doctor in this period.")
			+ "</div>"
		)
	elif not single_doctor:
		# Several doctors printed together: grand total in its own table.
		blocks += (
			'<div class="report-block">'
			+ sheet_table(total_row(_("Report Total"), report_total, "report-total"))
			+ "</div>"
		)

	truncate = ""
	if total_visits > MAX_DETAIL_HTML_VISITS:
		truncate = (
			'<div class="truncate">'
			+ _(
				"Showing first {0} of {1} visits here — the table below lists all of them."
			).format(MAX_DETAIL_HTML_VISITS, total_visits)
			+ "</div>"
		)

	billing_source_label = esc(str(ledger.get("billing_source") or ""))

	return f"""
	<div class="dwia-detail dwia-vl">
		<style>{VISIT_LEDGER_STYLE}</style>
		<div class="generated">{generated}</div>
		<table class="meta">
			<tr>
				<td><b>{_("From Date")}</b></td>
				<td>{from_s}</td>
				<td><b>{_("to")}</b></td>
				<td>{to_s}</td>
				<td><b>{_("Visits")}</b></td>
				<td>{total_visits}</td>
			</tr>
			<tr>
				<td><b>{_("Branch")}</b></td>
				<td colspan="3">{esc(str(branch))}</td>
				<td><b>{_("Billing Source")}</b></td>
				<td>{billing_source_label}</td>
			</tr>
		</table>
		{truncate}
		{blocks}
	</div>
	"""


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


# Named healthcare services keep their item name (IP-SINGLE ROOM, Regular Visit, …).
# Lab tests roll into Lab Income. Stock / pharmacy lines roll into Inventory Sales Income.
_SERVICE_ITEM_GROUPS = {
	"Healthcare Services",
	"OP Services",
	"Services",
	"Other Services",
	"HR Service",
}
_LAB_ITEM_GROUPS = {"Lab Test", "Laboratory"}


def _lab_item_codes() -> set[str]:
	if not frappe.db.exists("DocType", "Lab Test Template"):
		return set()
	if not frappe.db.has_column("Lab Test Template", "item"):
		return set()
	return {
		code
		for code in frappe.get_all("Lab Test Template", pluck="item")
		if code
	}


def _detailed_service_label(row, channel: str, lab_items: set[str]) -> str:
	"""Row label for Detailed source income (only services that were billed)."""
	name = (row.get("item_name") or row.get("item_code") or _("Other")).strip() or _("Other")
	group = (row.get("item_group") or "").strip()
	code = (row.get("item_code") or "").strip()
	if code in lab_items or group in _LAB_ITEM_GROUPS:
		return _("Lab Income ({0})").format(channel)
	if cint(row.get("is_stock_item")) or (group and group not in _SERVICE_ITEM_GROUPS):
		return _("Inventory Sales Income ({0})").format(channel)
	return name


def build_source_income_summary(doc_or_filters) -> dict:
	"""Aggregate income by care source (IP / OP / IOP) across period windows.

	Same classification rules as Doctor Wise Income Analysis:
	- IP  → Inpatient Admission (and related IP charge docs)
	- OP  → Patient Visit (non-IOP) and other non-IP bases
	- IOP → Patient Visit with Visit Type IOP

	When ``detailed`` is set, each billed service is its own row (rooms, visits,
	therapy, …). Lab tests collapse to Lab Income and stock items to Inventory
	Sales Income, split by care channel. Rows with no income are omitted.
	"""
	src = frappe._dict(doc_or_filters or {})
	detailed = cint(src.get("detailed"))
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

	# source label -> period_key -> {total=grand, discount, net, tax}
	matrix = defaultdict(
		lambda: defaultdict(lambda: {"total": 0.0, "discount": 0.0, "net": 0.0, "tax": 0.0})
	)

	billing_source = filters.get("source") or "Sales Invoice"
	items = get_service_items(filters)
	items = _enrich_items_with_discount(items, billing_source)
	items = _enrich_items_with_tax(items, billing_source)
	lab_items = _lab_item_codes() if detailed else set()
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
			label = _detailed_service_label(row, channel, lab_items) if detailed else channel
			net = flt(row.amount)
			discount = _line_discount(row)
			tax = _line_tax(row)
			bucket = matrix[label][pkey]
			bucket["total"] += net + tax  # Grand Total (Sales Register)
			bucket["discount"] += discount
			bucket["net"] += net
			bucket["tax"] += tax

	sources = ("IP", "OP", "IOP")
	if detailed:
		sources = sorted(matrix.keys(), key=lambda name: sum(flt(matrix[name][w["key"]]["net"]) for w in windows), reverse=True)
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
		if detailed and not (row["total"] or row["discount"] or row["net"]):
			continue
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
		"detailed": detailed,
		"periods": periods,
		"rows": rows,
		"totals": grand,
		"pie": {"labels": [r["source"] for r in rows], "values": pie_values},
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

	colors = ["#1e88e5", "#43a047", "#fb8c00", "#8e24aa", "#00897b", "#e53935", "#6d4c41", "#3949ab", "#c0ca33", "#00acc1"]
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
	detailed = cint(summary.get("detailed"))
	source_w = "280px" if detailed else "80px"

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
	pie_html = "" if detailed else render_source_pie_svg(summary)
	source_heading = _("Service") if detailed else _("Source")

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
					<th rowspan="2" style="border:1px solid #333;padding:4px;background:#eee;width:{source_w};vertical-align:middle;">{source_heading}</th>
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


INCOME_BY_DOCTOR_REPORT = "Income by Doctor Patient and Source"


def _can_view_income_by_doctor_report() -> bool:
	"""True when the session user may open Income by Doctor.

	Matches the ways a user reaches this report: the roles listed on the Report
	doc, ``report`` permission on Sales Invoice, or System Manager.
	"""
	roles = set(frappe.get_roles())
	if "System Manager" in roles or frappe.has_permission("Sales Invoice", "report"):
		return True
	report_roles = {
		row.role
		for row in frappe.get_all(
			"Has Role",
			filters={
				"parenttype": "Report",
				"parent": INCOME_BY_DOCTOR_REPORT,
				"parentfield": "roles",
			},
			fields=["role"],
			limit_page_length=0,
		)
	}
	return bool(roles & report_roles)


def _practitioner_filter_option(row) -> dict:
	"""One Autocomplete entry, labelled the way the report prints the doctor."""
	doctor_name = (row.get("practitioner_name") or "").strip() or row.get("name")
	description = " · ".join(
		str(part) for part in (row.get("doctors_id"), row.get("status")) if part
	)
	return {
		"value": row.get("name"),
		"label": f"{doctor_name} ({row.get('name')})",
		"description": description,
	}


@frappe.whitelist()
def get_practitioner_filter_options(include: str | None = None) -> list[dict]:
	"""Doctor picker for the Income by Doctor reports.

	Report roles (Accounts / Sales / Reception …) often cannot read Healthcare
	Practitioner itself, and Frappe also refuses *document* level reads for
	users that carry an Employee user permission. The picker therefore only asks
	for permission to view the report, and returns the same doctor labels the
	report itself prints.

	Disabled practitioners are left out of the picker: they should not be
	selectable in a report filter. Records without a status stay listed, so
	legacy practitioners are not hidden.

	``include`` is the doctor already held by the filter. If he has been
	disabled since he was picked, he is added back so the field still shows his
	name instead of the raw ID.
	"""
	if not _can_view_income_by_doctor_report():
		frappe.throw(_("You are not permitted to view this report."), frappe.PermissionError)

	rows = frappe.get_all(
		"Healthcare Practitioner",
		filters={"status": ["!=", "Disabled"]},
		fields=["name", "doctors_id", "practitioner_name", "status"],
		order_by="practitioner_name asc",
		limit_page_length=0,
		ignore_permissions=True,
	)
	options = [_practitioner_filter_option(row) for row in rows]

	if include and all(option["value"] != include for option in options):
		selected = frappe.db.get_value(
			"Healthcare Practitioner",
			include,
			["name", "doctors_id", "practitioner_name", "status"],
			as_dict=True,
		)
		if selected:
			options.append(_practitioner_filter_option(selected))
	return options


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
	items, billing_source = prepare_service_items(filters)
	# APIs receive billing_source as ``source``; keep both in step for the detail.
	filters.source = filters.get("source") or billing_source
	analysis = build_analysis(filters, items=items)
	include_chart = True
	if filters.get("include_chart") is not None:
		include_chart = bool(cint(filters.get("include_chart")))
	html = render_analysis_html(filters, analysis, include_chart=include_chart)
	if cint(filters.get("detailed")):
		ledger = build_doctor_visit_ledger(filters, items=items)
		html += render_doctor_visit_ledger_html(filters, ledger)
	return html


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
