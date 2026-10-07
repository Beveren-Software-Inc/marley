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
from frappe.utils import cint, flt, getdate, now_datetime

from healthcare.api.doctor_wise_income_analysis import (
	PERIOD_COLORS,
	_accumulate,
	_empty_bucket,
	_enrich_items_with_discount,
	_fmt_short_date,
	_line_discount,
	_load_visit_care_map,
	_period_key_for_date,
	classify_care_channel,
	format_datetime_safe,
	period_windows,
)
from healthcare.healthcare.report.doctor_service_revenue.doctor_service_revenue import (
	get_service_items,
)

UNKNOWN_PATIENT_KEY = "__unknown_patient__"
DEFAULT_LIMIT = 100


def build_patient_analysis(doc_or_filters) -> dict:
	"""Build period × patient analysis (IP / OP / IOP / Total / Discount / Net)."""
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

	items = get_service_items(filters)
	items = _enrich_items_with_discount(items, filters.get("source") or "Sales Invoice")

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
			if patient:
				patient_key = patient
				if patient_key not in meta:
					meta[patient_key] = {
						"patient": patient,
						"patient_name": patient_name or patient,
						"is_unknown": 0,
					}
				elif patient_name and not meta[patient_key].get("patient_name"):
					meta[patient_key]["patient_name"] = patient_name
			else:
				patient_key = UNKNOWN_PATIENT_KEY
				if patient_key not in meta:
					meta[patient_key] = {
						"patient": None,
						"patient_name": patient_name or _("Unknown Patient"),
						"is_unknown": 1,
					}
				elif patient_name and meta[patient_key]["patient_name"] == _("Unknown Patient"):
					meta[patient_key]["patient_name"] = patient_name

			channel = classify_care_channel(
				row.custom_base_reference, row.custom_base_reference_name, visit_care_map
			)
			_accumulate(matrix[patient_key][pkey], channel, flt(row.amount), _line_discount(row))

	# Fill missing patient names from Patient master
	need_names = [
		k
		for k, m in meta.items()
		if k != UNKNOWN_PATIENT_KEY and (not m.get("patient_name") or m.get("patient_name") == k)
	]
	if need_names:
		for i in range(0, len(need_names), 500):
			chunk = need_names[i : i + 500]
			for row in frappe.get_all(
				"Patient",
				filters={"name": ["in", chunk]},
				fields=["name", "patient_name"],
				ignore_permissions=True,
			):
				if row.patient_name and row.name in meta:
					meta[row.name]["patient_name"] = row.patient_name

	def total_net(patient_key):
		return sum(flt(matrix[patient_key][w["key"]]["net"]) for w in windows)

	all_keys = set(matrix.keys()) | set(meta.keys())
	unknowns = [UNKNOWN_PATIENT_KEY] if UNKNOWN_PATIENT_KEY in all_keys else []
	ranked = sorted(
		[k for k in all_keys if k != UNKNOWN_PATIENT_KEY],
		key=total_net,
		reverse=True,
	)
	total_patients = len(unknowns) + len(ranked)
	# Unknown first (like Other Income), then top N named patients by net
	named_slots = max(limit - len(unknowns), 0) if unknowns else limit
	selected = unknowns + ranked[:named_slots]

	patients = []
	rank = 1
	for patient_key in selected:
		m = meta.get(patient_key) or {
			"patient": None if patient_key == UNKNOWN_PATIENT_KEY else patient_key,
			"patient_name": _("Unknown Patient") if patient_key == UNKNOWN_PATIENT_KEY else patient_key,
			"is_unknown": 1 if patient_key == UNKNOWN_PATIENT_KEY else 0,
		}
		is_unknown = patient_key == UNKNOWN_PATIENT_KEY or cint(m.get("is_unknown"))
		periods = []
		for w in windows:
			b = matrix[patient_key].get(w["key"]) or _empty_bucket()
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
		patients.append(
			{
				"rank_no": 0 if is_unknown else rank,
				"patient": m.get("patient"),
				"patient_name": m.get("patient_name"),
				"is_unknown": 1 if is_unknown else 0,
				"periods": periods,
			}
		)
		if not is_unknown:
			rank += 1

	# Column totals for the *shown* rows (matches add_total_row on limited set)
	col_totals = []
	for i, w in enumerate(windows):
		t = _empty_bucket()
		for prow in patients:
			p = prow["periods"][i]
			for k in ("ip", "op", "iop", "total", "discount", "net"):
				t[k] += flt(p[k])
		col_totals.append({"key": w["key"], **{k: flt(t[k]) for k in t}})

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
			return f"{nval / 1_000_000:.1f}M"
		if abs(nval) >= 1_000:
			return f"{nval / 1_000:.1f}K"
		return f"{nval:,.0f}"

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

	def money(v):
		n = flt(v)
		if abs(n - round(n)) < 0.001:
			return f"{n:,.0f}"
		return f"{n:,.3f}".rstrip("0").rstrip(".")

	amt_w = "72px"
	amt_style = (
		f"border:1px solid #333;padding:2px 4px;text-align:right;white-space:nowrap;"
		f"width:{amt_w};min-width:{amt_w};max-width:{amt_w};"
	)
	period_cols = ("ip", "op", "iop", "total", "discount", "net")
	period_labels = ("IP", "OP", "IOP", "Total", "Discount", "Net Total")

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
			period_sub += (
				f'<th style="background:{bg};border:1px solid #333;padding:3px 4px;text-align:center;'
				f'font-size:10px;white-space:nowrap;width:{amt_w};min-width:{amt_w};max-width:{amt_w};">{lbl}</th>'
			)

	def _amt_cells(bucket):
		bucket = bucket or {}
		out = ""
		for k in period_cols:
			color = "#c62828" if k == "discount" else "#000"
			out += f'<td style="{amt_style}color:{color};">{money(bucket.get(k))}</td>'
		return out

	body = ""
	for r in patients:
		by_key = {p.get("key"): p for p in (r.get("periods") or [])}
		rank = cint(r.get("rank_no"))
		rank_html = "" if cint(r.get("is_unknown")) else str(rank)
		body += "<tr>"
		body += f'<td style="border:1px solid #333;padding:2px 4px;text-align:center;">{rank_html}</td>'
		body += (
			f'<td style="border:1px solid #333;padding:2px 6px;text-align:left;max-width:220px;'
			f'width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"'
			f' title="{frappe.utils.escape_html(r.get("patient_name") or "")}">'
			f'{frappe.utils.escape_html(r.get("patient_name") or "")}</td>'
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
	chart_html = render_patient_chart_html(analysis)
	note = ""
	if total_pts > shown:
		note = (
			f'<div style="font-size:11px;color:#64748b;margin:0 0 8px;text-align:center;">'
			f'{_("Showing top {0} of {1} patients").format(shown, total_pts)}</div>'
		)

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
		<div style="overflow:auto;max-width:100%;">
		<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px;min-width:720px;">
			<thead>
				<tr>
					<th rowspan="2" style="border:1px solid #333;padding:4px;background:#eee;width:48px;vertical-align:middle;">Rank<br>No.</th>
					<th rowspan="2" style="border:1px solid #333;padding:4px;background:#eee;width:220px;max-width:220px;vertical-align:middle;">{_("Patient Name")}</th>
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
