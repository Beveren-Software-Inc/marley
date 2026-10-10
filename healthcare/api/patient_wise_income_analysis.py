# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt
"""
Patient Wise Income Analysis — sales by patient with IP / OP / IOP split.

Same period + care-channel rules as Doctor Wise Income Analysis, grouped by
Patient instead of Healthcare Practitioner.
"""

from __future__ import annotations

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt, getdate, now_datetime

from healthcare.api.doctor_wise_income_analysis import (
	MONEY_DECIMALS,
	PERIOD_COLORS,
	_accumulate,
	_empty_bucket,
	_enrich_items_with_discount,
	_enrich_items_with_tax,
	_fmt_short_date,
	_line_discount,
	_line_tax,
	_load_visit_care_map,
	_period_key_for_date,
	classify_care_channel,
	format_datetime_safe,
	format_money_bhd,
	period_windows,
)
from healthcare.healthcare.report.doctor_service_revenue.doctor_service_revenue import (
	get_service_items,
)

UNKNOWN_PATIENT_KEY = "__unknown_patient__"
OTHER_PATIENTS_KEY = "__other_patients__"
WALKIN_PREFIX = "__walkin__:"
DEFAULT_LIMIT = 50
# Visible rows in the HTML table before scrolling (keeps the report compact).
HTML_VISIBLE_ROWS = 50
HTML_ROW_HEIGHT_PX = 22


def _walkin_key(customer: str | None, display_name: str) -> str:
	"""Stable key for walk-in / cash customers (no Patient link)."""
	cust = (customer or "").strip()
	if cust:
		return f"{WALKIN_PREFIX}{cust}"
	name = (display_name or "").strip() or _("Unknown Patient")
	return f"{WALKIN_PREFIX}{name}"


def _periods_from_bucket_map(bucket_by_period: dict, windows: list[dict]) -> list[dict]:
	periods = []
	for w in windows:
		b = bucket_by_period.get(w["key"]) or _empty_bucket()
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
	return periods


def build_patient_analysis(doc_or_filters) -> dict:
	"""Build period × patient analysis (IP / OP / IOP / Total / Discount / Net).

	Walk-in / invoices with no Patient are forced to OP and shown with customer
	details. Column totals include every patient (plus an Other Patients row for
	anyone beyond Limit) so totals match Doctor / Source / Sales Register.
	"""
	src = frappe._dict(doc_or_filters or {})
	windows = period_windows(src.from_date, src.to_date, src.get("period") or "Yearly")
	limit = cint(src.get("limit") or DEFAULT_LIMIT)
	if limit <= 0:
		limit = DEFAULT_LIMIT

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

	billing_source = filters.get("source") or "Sales Invoice"
	items = get_service_items(filters)
	items = _enrich_items_with_discount(items, billing_source)
	items = _enrich_items_with_tax(items, billing_source)

	# patient_key -> period_key -> bucket
	matrix = defaultdict(lambda: defaultdict(_empty_bucket))
	meta: dict[str, dict] = {}

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

			patient = (row.get("patient") or "").strip()
			patient_name = (row.get("custom_patient_name") or "").strip()
			customer = (row.get("customer") or "").strip()
			customer_name = (row.get("customer_name") or "").strip()

			if patient:
				patient_key = patient
				if patient_key not in meta:
					meta[patient_key] = {
						"patient": patient,
						"patient_name": patient_name or patient,
						"file_no": "",
						"patient_id": "",
						"is_unknown": 0,
						"is_other": 0,
					}
				elif patient_name and (
					not meta[patient_key].get("patient_name")
					or meta[patient_key].get("patient_name") == patient_key
				):
					meta[patient_key]["patient_name"] = patient_name
				channel = classify_care_channel(
					row.custom_base_reference, row.custom_base_reference_name, visit_care_map
				)
			else:
				# Walk-in / cash customer — no Patient link. Always OP; show name details.
				display = patient_name or customer_name or _("Unknown Patient")
				if customer or patient_name or customer_name:
					patient_key = _walkin_key(customer, display)
				else:
					patient_key = UNKNOWN_PATIENT_KEY
				if patient_key not in meta:
					meta[patient_key] = {
						"patient": None,
						"patient_name": display,
						"file_no": "",
						"patient_id": "",
						"is_unknown": 1,
						"is_other": 0,
					}
				elif display and meta[patient_key]["patient_name"] in (
					_("Unknown Patient"),
					patient_key,
				):
					meta[patient_key]["patient_name"] = display
				# Walking customers are outpatient sales
				channel = "OP"

			_accumulate(
				matrix[patient_key][pkey],
				channel,
				flt(row.amount),
				_line_discount(row),
				_line_tax(row),
			)

	# File No / Patient ID / name from Patient master
	named_keys = [
		k
		for k, m in meta.items()
		if not cint(m.get("is_unknown"))
		and not str(k).startswith(WALKIN_PREFIX)
		and k not in (UNKNOWN_PATIENT_KEY, OTHER_PATIENTS_KEY)
	]
	if named_keys:
		has_file_no = frappe.db.has_column("Patient", "file_no")
		has_id_number = frappe.db.has_column("Patient", "id_number")
		fields = ["name", "patient_name"]
		if has_file_no:
			fields.append("file_no")
		if has_id_number:
			fields.append("id_number")
		for i in range(0, len(named_keys), 500):
			chunk = named_keys[i : i + 500]
			for row in frappe.get_all(
				"Patient",
				filters={"name": ["in", chunk]},
				fields=fields,
				ignore_permissions=True,
			):
				if row.name not in meta:
					continue
				m = meta[row.name]
				if row.patient_name and (not m.get("patient_name") or m.get("patient_name") == row.name):
					m["patient_name"] = row.patient_name
				file_no = (row.get("file_no") if has_file_no else None) or row.name
				m["file_no"] = cstr(file_no).strip()
				m["patient_id"] = cstr(row.get("id_number") if has_id_number else "").strip()

	def total_net(patient_key):
		return sum(flt(matrix[patient_key][w["key"]]["net"]) for w in windows)

	all_keys = sorted(set(matrix.keys()) | set(meta.keys()), key=total_net, reverse=True)
	total_patients = len(all_keys)

	# Full-period totals first (matches Doctor / Source / Sales Register Grand)
	col_totals = []
	for w in windows:
		t = _empty_bucket()
		for patient_key in all_keys:
			b = matrix[patient_key].get(w["key"]) or _empty_bucket()
			for k in ("ip", "op", "iop", "total", "discount", "net", "tax"):
				t[k] += flt(b.get(k))
		col_totals.append({"key": w["key"], **{k: flt(t[k]) for k in t}})

	selected = all_keys[:limit]
	remainder = all_keys[limit:]

	patients = []
	rank = 1
	for patient_key in selected:
		m = meta.get(patient_key) or {
			"patient": None if patient_key == UNKNOWN_PATIENT_KEY else patient_key,
			"patient_name": _("Unknown Patient") if patient_key == UNKNOWN_PATIENT_KEY else patient_key,
			"is_unknown": 1 if patient_key == UNKNOWN_PATIENT_KEY or str(patient_key).startswith(WALKIN_PREFIX) else 0,
			"is_other": 0,
		}
		is_unknown = cint(m.get("is_unknown")) or patient_key == UNKNOWN_PATIENT_KEY or str(
			patient_key
		).startswith(WALKIN_PREFIX)
		display_name = m.get("patient_name") or patient_key
		if is_unknown and not str(display_name).startswith("("):
			# Clarify walk-in rows in the table
			if patient_key == UNKNOWN_PATIENT_KEY:
				display_name = _("Unknown Patient (Walk-in / OP)")
			elif _("Walk-in") not in str(display_name):
				display_name = _("{0} (Walk-in / OP)").format(display_name)

		patients.append(
			{
				"rank_no": 0 if is_unknown else rank,
				"patient": m.get("patient"),
				"file_no": m.get("file_no") or "",
				"patient_id": m.get("patient_id") or "",
				"patient_name": display_name,
				"is_unknown": 1 if is_unknown else 0,
				"is_other": 0,
				"periods": _periods_from_bucket_map(matrix[patient_key], windows),
			}
		)
		if not is_unknown:
			rank += 1

	# Fold everyone beyond Limit into one row so listed rows still sum to Total
	if remainder:
		other_map = defaultdict(_empty_bucket)
		for patient_key in remainder:
			for w in windows:
				b = matrix[patient_key].get(w["key"]) or _empty_bucket()
				ob = other_map[w["key"]]
				for k in ("ip", "op", "iop", "total", "discount", "net", "tax"):
					ob[k] += flt(b.get(k))
		patients.append(
			{
				"rank_no": 0,
				"patient": None,
				"file_no": "",
				"patient_id": "",
				"patient_name": _("Other Patients ({0})").format(len(remainder)),
				"is_unknown": 0,
				"is_other": 1,
				"periods": _periods_from_bucket_map(other_map, windows),
			}
		)

	return {
		"period": (src.get("period") or "Yearly"),
		"from_date": str(getdate(src.from_date)),
		"to_date": str(getdate(src.to_date)),
		"cost_center": src.get("cost_center"),
		"limit": limit,
		"total_patients": total_patients,
		"shown_patients": len(patients),
		"periods": [
			{
				"key": w["key"],
				"label": w["label"],
				"start": str(w["start"]),
				"end": str(w["end"]),
			}
			for w in windows
		],
		"patients": patients,
		"totals": col_totals,
	}


def build_patient_frappe_chart(analysis: dict, chart_limit: int = 12) -> dict | None:
	"""Stacked bar of top patients by net (IP / OP / IOP)."""
	rows = []
	for p in analysis.get("patients") or []:
		if cint(p.get("is_other")):
			continue
		ip = op = iop = net = 0.0
		for cell in p.get("periods") or []:
			ip += flt(cell.get("ip"))
			op += flt(cell.get("op"))
			iop += flt(cell.get("iop"))
			net += flt(cell.get("net"))
		if not (ip or op or iop or net):
			continue
		rows.append(
			{
				"label": (p.get("patient_name") or p.get("patient") or "")[:22],
				"is_unknown": cint(p.get("is_unknown")),
				"ip": ip,
				"op": op,
				"iop": iop,
				"net": net,
			}
		)
	if not rows:
		return None

	unknown = [r for r in rows if r["is_unknown"]]
	named = sorted([r for r in rows if not r["is_unknown"]], key=lambda r: r["net"], reverse=True)
	top_n = max(chart_limit - 1, 1) if unknown else chart_limit
	chart_rows = (unknown[:1] + named[:top_n]) if unknown else named[:top_n]

	return {
		"data": {
			"labels": [r["label"] for r in chart_rows],
			"datasets": [
				{"name": _("IP"), "values": [flt(r["ip"]) for r in chart_rows]},
				{"name": _("OP"), "values": [flt(r["op"]) for r in chart_rows]},
				{"name": _("IOP"), "values": [flt(r["iop"]) for r in chart_rows]},
			],
		},
		"type": "bar",
		"barOptions": {"stacked": 1},
		"height": 320,
		"colors": ["#1e88e5", "#43a047", "#fb8c00"],
	}


def render_patient_chart_html(analysis: dict, chart_limit: int = 12) -> str:
	"""SVG stacked bars for top patients (print / report HTML)."""
	chart = build_patient_frappe_chart(analysis, chart_limit=chart_limit)
	if not chart:
		return ""

	labels = chart["data"]["labels"]
	datasets = {d["name"]: d["values"] for d in chart["data"]["datasets"]}
	ip_vals = datasets.get(_("IP")) or datasets.get("IP") or []
	op_vals = datasets.get(_("OP")) or datasets.get("OP") or []
	iop_vals = datasets.get(_("IOP")) or datasets.get("IOP") or []
	rows = []
	for i, label in enumerate(labels):
		rows.append(
			{
				"patient_name": label,
				"ip": flt(ip_vals[i] if i < len(ip_vals) else 0),
				"op": flt(op_vals[i] if i < len(op_vals) else 0),
				"iop": flt(iop_vals[i] if i < len(iop_vals) else 0),
			}
		)
	if not rows:
		return ""

	max_total = max((r["ip"] + r["op"] + r["iop"]) for r in rows) or 1.0
	n = len(rows)
	left, right, top, bottom = 48, 24, 36, 90
	plot_h = 220.0
	gap = 10.0
	plot_w = max(480.0, n * 56.0)
	bar_w = max(18.0, min(42.0, (plot_w - gap * (n + 1)) / n))
	width = left + plot_w + right
	height = top + plot_h + bottom
	colors = {"ip": "#1e88e5", "op": "#43a047", "iop": "#fb8c00"}

	def money_short(v):
		nval = flt(v)
		if abs(nval) >= 1_000_000:
			return f"{nval / 1_000_000:.{MONEY_DECIMALS}f}M"
		if abs(nval) >= 1_000:
			return f"{nval / 1_000:.{MONEY_DECIMALS}f}K"
		return format_money_bhd(nval)

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
		label = frappe.utils.escape_html((r["patient_name"] or "")[:18])
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
	<div style="margin:0 0 16px;padding:12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;">
		<div style="font-size:13px;font-weight:600;color:#0f172a;margin-bottom:6px;">
			{_("Top Patients by Income")} <span style="font-weight:400;color:#64748b;">({_("IP")} / {_("OP")} / {_("IOP")})</span>
		</div>
		<svg viewBox="0 0 {width:.0f} {height:.0f}" width="100%" style="max-width:100%;height:auto;display:block;">
			{legend}
			{bars}
		</svg>
	</div>
	"""


def patient_period_metrics(period: str) -> list[tuple[str, str]]:
	"""Columns per period. Monthly drops IP / OP / IOP so the grid stays readable."""
	if (period or "").strip().lower() == "monthly":
		return [("total", _("Total"))]
	return [
		("ip", _("IP")),
		("op", _("OP")),
		("iop", _("IOP")),
		("total", _("Total")),
		("discount", _("Discount")),
		("net", _("Net")),
	]


def render_patient_income_html(doc_or_filters=None, analysis=None) -> str:
	"""Serene-style HTML for Patient view (same band layout as Doctor Wise)."""
	ctx = frappe._dict(doc_or_filters or {})
	analysis = analysis or build_patient_analysis(ctx)
	periods = analysis.get("periods") or []
	patients = analysis.get("patients") or []
	col_totals = analysis.get("totals") or []
	branch = analysis.get("cost_center") or ctx.get("cost_center") or _("All Branches (Consolidate)")
	period_label = analysis.get("period") or ctx.get("period") or "Yearly"
	generated = format_datetime_safe(ctx.get("generated_on") or now_datetime())
	shown = cint(analysis.get("shown_patients"))
	total_pts = cint(analysis.get("total_patients"))

	money = format_money_bhd

	amt_w = "72px"
	amt_style = (
		f"border:1px solid #333;padding:2px 4px;text-align:right;white-space:nowrap;"
		f"width:{amt_w};min-width:{amt_w};max-width:{amt_w};"
	)
	metrics = patient_period_metrics(period_label)
	period_cols = tuple(key for key, _lbl in metrics)
	period_labels = tuple(lbl for _key, lbl in metrics)
	monthly = (period_label or "").strip().lower() == "monthly"

	th_sticky_top = "position:sticky;top:0;z-index:2;"
	th_sticky_sub = "position:sticky;top:24px;z-index:2;"
	period_headers = ""
	period_sub = ""
	for i, p in enumerate(periods):
		bg = PERIOD_COLORS[i % len(PERIOD_COLORS)]
		label = frappe.utils.escape_html(p.get("label") or p.get("key") or "")
		period_headers += (
			f'<th colspan="{len(period_cols)}" style="{th_sticky_top}background:{bg};text-align:center;border:1px solid #333;'
			f'padding:4px;font-weight:bold;">{label}</th>'
		)
		for lbl in period_labels:
			period_sub += (
				f'<th style="{th_sticky_sub}background:{bg};border:1px solid #333;padding:3px 4px;text-align:center;'
				f'font-size:10px;white-space:nowrap;width:{amt_w};min-width:{amt_w};max-width:{amt_w};">{lbl}</th>'
			)

	def _amt_cells(bucket):
		bucket = bucket or {}
		out = ""
		for k in period_cols:
			color = "#c62828" if k == "discount" else "#000"
			out += f'<td style="{amt_style}color:{color};">{money(bucket.get(k))}</td>'
		return out

	id_cell = (
		"border:1px solid #333;padding:2px 4px;text-align:left;white-space:nowrap;"
		"overflow:hidden;text-overflow:ellipsis;"
	)
	name_cell = (
		"border:1px solid #333;padding:2px 6px;text-align:left;max-width:200px;"
		"width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
	)

	body = ""
	for r in patients:
		by_key = {p.get("key"): p for p in (r.get("periods") or [])}
		rank = cint(r.get("rank_no"))
		rank_html = "" if cint(r.get("is_unknown")) or cint(r.get("is_other")) else str(rank)
		file_no = frappe.utils.escape_html(r.get("file_no") or "")
		patient_id = frappe.utils.escape_html(r.get("patient_id") or "")
		pname = frappe.utils.escape_html(r.get("patient_name") or "")
		body += "<tr>"
		body += f'<td style="border:1px solid #333;padding:2px 4px;text-align:center;">{rank_html}</td>'
		body += f'<td style="{id_cell}width:80px;">{file_no}</td>'
		body += f'<td style="{id_cell}width:100px;">{patient_id}</td>'
		body += f'<td style="{name_cell}" title="{pname}">{pname}</td>'
		for p in periods:
			body += _amt_cells(by_key.get(p["key"]))
		body += "</tr>"

	tot_by_key = {t.get("key"): t for t in col_totals}
	tf_label = (
		"position:sticky;bottom:0;z-index:3;background:#f5f5f5;"
		"border:1px solid #333;padding:3px 6px;"
	)
	tf_amt = f"position:sticky;bottom:0;z-index:3;background:#f5f5f5;{amt_style}"
	footer = '<tr style="font-weight:bold;">'
	footer += f'<td colspan="4" style="{tf_label}">{_("Total")}</td>'
	for p in periods:
		bucket = tot_by_key.get(p["key"]) or {}
		for k in period_cols:
			color = "#c62828" if k == "discount" else "#000"
			footer += f'<td style="{tf_amt}color:{color};">{money(bucket.get(k))}</td>'
	footer += "</tr>"

	from_s = _fmt_short_date(analysis.get("from_date") or ctx.get("from_date"))
	to_s = _fmt_short_date(analysis.get("to_date") or ctx.get("to_date"))
	chart_html = "" if monthly else render_patient_chart_html(analysis)
	n_rows = len(patients)
	# Header (~48px) + ~50 body rows + sticky total — remaining patients scroll inside.
	scroll_max_h = 48 + (HTML_VISIBLE_ROWS * HTML_ROW_HEIGHT_PX) + 28
	note_parts = []
	if total_pts > shown:
		note_parts.append(_("Showing top {0} of {1} patients").format(shown, total_pts))
	if n_rows > HTML_VISIBLE_ROWS:
		note_parts.append(_("First {0} rows visible — scroll for more").format(HTML_VISIBLE_ROWS))
	note = ""
	if note_parts:
		note = (
			f'<div style="font-size:11px;color:#64748b;margin:0 0 8px;text-align:center;">'
			f'{" · ".join(note_parts)}</div>'
		)

	th_sticky = "position:sticky;top:0;z-index:2;"

	return f"""
	<div class="pwia-report" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;">
		<div style="font-size:10px;margin-bottom:2px;">{frappe.utils.escape_html(generated)}</div>
		<div style="text-align:center;font-size:22px;font-weight:bold;color:#8B0000;margin:2px 0 10px;">
			{_("Patient Wise Income Analysis")}
		</div>
		{note}
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
		<div style="overflow:auto;max-height:{scroll_max_h}px;max-width:100%;border:1px solid #ccc;">
		<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px;min-width:720px;">
			<thead>
				<tr>
					<th rowspan="2" style="{th_sticky}border:1px solid #333;padding:4px;background:#eee;width:48px;vertical-align:middle;">Rank<br>No.</th>
					<th rowspan="2" style="{th_sticky}border:1px solid #333;padding:4px;background:#eee;width:80px;vertical-align:middle;">{_("File No")}</th>
					<th rowspan="2" style="{th_sticky}border:1px solid #333;padding:4px;background:#eee;width:100px;vertical-align:middle;">{_("Patient ID")}</th>
					<th rowspan="2" style="{th_sticky}border:1px solid #333;padding:4px;background:#eee;width:200px;max-width:200px;vertical-align:middle;">{_("Patient Name")}</th>
					{period_headers}
				</tr>
				<tr>{period_sub}</tr>
			</thead>
			<tbody>
				{body}
			</tbody>
			<tfoot>
				{footer}
			</tfoot>
		</table>
		</div>
	</div>
	"""


@frappe.whitelist()
def get_patient_wise_income_analysis_html(filters=None):
	"""Printable HTML for Patient view."""
	import json

	if isinstance(filters, str):
		filters = json.loads(filters)
	filters = frappe._dict(filters or {})
	if not filters.get("from_date") or not filters.get("to_date"):
		frappe.throw(_("From Date and To Date are required"))
	filters.generated_on = now_datetime()
	analysis = build_patient_analysis(filters)
	return render_patient_income_html(filters, analysis)
