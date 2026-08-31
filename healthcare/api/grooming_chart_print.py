"""Patient Grooming Pattern PDF (nursing portal PDF button)."""

from __future__ import annotations

from datetime import date

import frappe

from healthcare.api.nursing_print import (
	MAROON,
	assert_nursing_print_permission,
	esc,
	fmt_date,
	form_footer_html,
	g,
	get_doc_letter_head,
	in_date_range,
	parse_date,
	patient_info_html,
	patient_meta,
	weekday,
	wrap_print_document,
)

_FORM_CODE = "SPHMD/N/GC_10MAY 2017"
_TITLE = "Patient Grooming Pattern"

_CHART_FIELDS = [
	"name",
	"date",
	"admission_no",
	"file_no",
	"patient_name",
	"cost_center",
	"brush_teeth_morning",
	"change_clothes_morning",
	"brush_teeth_noon",
	"change_clothes_noon",
	"shower",
	"bowel",
	"bed_wetting",
	"breakfast",
	"snack_1",
	"lunch",
	"snack_2",
	"dinner",
	"snack_3",
	"weight",
	"lmp",
	"modified",
]


def _yes(value) -> str:
	if value in (None, "", 0, "0", False, "None"):
		return ""
	text = str(value).strip().upper()
	if text in {"N", "NO", "FALSE"}:
		return ""
	return "Y"


def _weight_text(value) -> str:
	if value in (None, "", "None"):
		return ""
	try:
		num = float(value)
	except (TypeError, ValueError):
		return str(value)
	if num == int(num):
		return str(int(num))
	return f"{num:g}"


def _load_charts(doc, date_from=None, date_to=None) -> list:
	admission = g(doc, "admission_no")
	patient = g(doc, "file_no")
	filters = {}
	if admission:
		filters["admission_no"] = admission
	elif patient:
		filters["file_no"] = patient
	else:
		return [doc]

	rows = frappe.get_all(
		"IP Grooming Chart",
		filters=filters,
		fields=_CHART_FIELDS,
		limit=400,
	)
	if not rows:
		return [doc]

	by_key: dict[str, dict] = {}
	current_name = str(g(doc, "name") or "")
	for row in rows:
		key = str(row.get("date") or row.get("name") or "")
		existing = by_key.get(key)
		if not existing:
			by_key[key] = row
			continue
		if str(row.get("name") or "") == current_name:
			by_key[key] = row
			continue
		if str(existing.get("name") or "") == current_name:
			continue
		if str(row.get("modified") or "") > str(existing.get("modified") or ""):
			by_key[key] = row

	def sort_key(row):
		d = parse_date(row.get("date"))
		return (d or date.min, str(row.get("name") or ""))

	rows = sorted(by_key.values(), key=sort_key)
	if date_from or date_to:
		rows = [r for r in rows if in_date_range(r.get("date"), date_from, date_to)]
	return rows


def _th(text, extra="", rowspan=None, colspan=None) -> str:
	attrs = []
	if extra:
		attrs.append(f'class="{extra}"')
	if rowspan:
		attrs.append(f'rowspan="{rowspan}"')
	if colspan:
		attrs.append(f'colspan="{colspan}"')
	attr = (" " + " ".join(attrs)) if attrs else ""
	inner = f"<span>{esc(text)}</span>" if extra == "pgp-v" else esc(text)
	return f"<th{attr}>{inner}</th>"


def _td(text, extra="") -> str:
	cls = f' class="{extra}"' if extra else ""
	return f"<td{cls}>{esc(text)}</td>"


_FLAG_FIELDS = (
	"brush_teeth_morning",
	"change_clothes_morning",
	"brush_teeth_noon",
	"change_clothes_noon",
	"shower",
	"bowel",
	"bed_wetting",
	"breakfast",
	"snack_1",
	"lunch",
	"snack_2",
	"dinner",
	"snack_3",
)


def _chart_table(charts: list) -> str:
	v = "pgp-v"
	grp = "pgp-grp"
	body_rows = []
	for c in charts:
		cells = [
			_td(fmt_date(c.get("date")), "pgp-date"),
			_td(weekday(c.get("date")), "pgp-day"),
		]
		for field in _FLAG_FIELDS:
			cells.append(_td(_yes(c.get(field)), "pgp-c"))
		cells.append(_td(_weight_text(c.get("weight")), "pgp-c"))
		cells.append(_td(fmt_date(c.get("lmp")), "pgp-c"))
		body_rows.append(f"<tr>{''.join(cells)}</tr>")

	if not body_rows:
		body_rows.append('<tr><td colspan="17" class="pgp-c" style="height:24px;"></td></tr>')

	return f"""
	<table class="pgp-chart">
		<thead>
			<tr>
				{_th("Date", "pgp-h", rowspan=2)}
				{_th("Day", "pgp-h", rowspan=2)}
				{_th("Morning", grp, colspan=2)}
				{_th("Night", grp, colspan=2)}
				{_th("Daily", grp, colspan=3)}
				{_th("Meals", grp, colspan=5)}
				{_th("Snacks", v, rowspan=2)}
				{_th("Weekly Weight", v, rowspan=2)}
				{_th("LMP", v, rowspan=2)}
			</tr>
			<tr>
				{_th("Brush Teeth", v)}
				{_th("Change Clothes", v)}
				{_th("Brush Teeth", v)}
				{_th("Change Clothes", v)}
				{_th("Shower", v)}
				{_th("Bowel", v)}
				{_th("Bed wetting", v)}
				{_th("Breakfast", v)}
				{_th("Snacks", v)}
				{_th("Lunch", v)}
				{_th("Snacks", v)}
				{_th("Dinner", v)}
			</tr>
		</thead>
		<tbody>
			{''.join(body_rows)}
		</tbody>
	</table>
	"""


_CHART_CSS = f"""
		.pgp-report {{
			font-family: Arial, Helvetica, sans-serif;
			color: #000;
			font-size: 11px;
			width: 100%;
			-webkit-print-color-adjust: exact !important;
			print-color-adjust: exact !important;
		}}
		.pgp-chart {{
			width: 100%;
			border-collapse: collapse;
			table-layout: fixed;
			margin-top: 2px;
		}}
		.pgp-chart th, .pgp-chart td {{
			border: 1px solid #000;
			padding: 3px 2px;
			font-size: 10px;
			vertical-align: middle;
		}}
		.pgp-chart th {{
			color: {MAROON} !important;
			font-weight: bold;
			text-align: center;
			background: #fff;
		}}
		.pgp-grp {{ font-size: 12px; letter-spacing: 0.2px; }}
		.pgp-h {{ width: 7%; white-space: nowrap; }}
		.pgp-v {{
			height: 92px;
			min-height: 92px;
			padding: 6px 3px;
			vertical-align: bottom;
		}}
		.pgp-v span {{
			display: inline-block;
			writing-mode: vertical-rl;
			-webkit-writing-mode: vertical-rl;
			transform: rotate(180deg);
			white-space: nowrap;
			font-size: 10px;
			font-weight: bold;
		}}
		.pgp-c {{ text-align: center; }}
		.pgp-date {{ white-space: nowrap; font-weight: bold; text-align: center; }}
		.pgp-day {{ white-space: nowrap; text-align: center; font-size: 9px; }}
"""


def render_patient_grooming_pattern(doc, date_from=None, date_to=None):
	if isinstance(doc, str):
		doc = frappe.get_doc("IP Grooming Chart", doc)

	charts = _load_charts(doc, date_from=date_from, date_to=date_to)
	meta = patient_meta(doc)
	return (
		f'<div class="pgp-report">'
		f"{patient_info_html(meta)}"
		f"{_chart_table(charts)}"
		f"{form_footer_html(_FORM_CODE)}"
		f"</div>"
	)


def _seed_docs(name=None, patient=None):
	name = (name or "").strip()
	patient = (patient or "").strip()
	if patient:
		rows = frappe.get_all(
			"IP Grooming Chart",
			filters={"file_no": patient},
			fields=["name", "admission_no"],
			order_by="date desc",
			limit=400,
		)
		seen = set()
		seeds = []
		for row in rows:
			key = row.get("admission_no") or row.get("name")
			if not key or key in seen:
				continue
			seen.add(key)
			seeds.append(frappe.get_doc("IP Grooming Chart", row.name))
		if seeds:
			return seeds
	if name and frappe.db.exists("IP Grooming Chart", name):
		return [frappe.get_doc("IP Grooming Chart", name)]
	return []


@frappe.whitelist()
def get_grooming_pattern_html(name=None, patient=None, date_from=None, date_to=None):
	assert_nursing_print_permission("IP Grooming Chart")

	seeds = _seed_docs(name, patient)
	if not seeds:
		frappe.throw(frappe._("No grooming charts found to print"))

	bodies = [render_patient_grooming_pattern(seed, date_from=date_from, date_to=date_to) for seed in seeds]
	if not bodies:
		frappe.throw(frappe._("No grooming charts found to print"))

	return wrap_print_document(
		_TITLE,
		'<div class="np-page-break"></div>'.join(bodies),
		get_doc_letter_head(seeds[0]),
		extra_css=_CHART_CSS,
		landscape=True,
	)
