"""Sleeping Pattern Monitoring Sheet PDF (nursing portal PDF button)."""

from __future__ import annotations

from datetime import date

import frappe

from healthcare.api.nursing_print import (
	MAROON,
	assert_nursing_print_permission,
	esc,
	fmt_date,
	fmt_time,
	form_footer_html,
	g,
	get_doc_letter_head,
	in_date_range,
	parse_date,
	parse_datetime,
	patient_info_html,
	patient_meta,
	weekday,
	wrap_print_document,
)

_FORM_CODE = "SPHMD/N/SP_29 MARCH 2020"
_TITLE = "Sleeping Pattern Monitoring Sheet"

_ROW_FIELDS = [
	"name",
	"date",
	"admission_no",
	"file_no",
	"patient_name",
	"cost_center",
	"branch",
	"morning_from",
	"morning_to",
	"evening_from",
	"evening_to",
	"night_from",
	"night_to",
	"sleep_comment",
]


def _period_seconds(start, end) -> int:
	start_dt = parse_datetime(start)
	end_dt = parse_datetime(end)
	if not start_dt or not end_dt:
		return 0
	seconds = (end_dt - start_dt).total_seconds()
	if seconds < 0:
		seconds += 24 * 60 * 60
	if seconds <= 0:
		return 0
	return int(seconds)


def _fmt_hm(seconds: int) -> str:
	if not seconds:
		return ""
	hours = seconds // 3600
	minutes = (seconds % 3600) // 60
	return f"{hours}.{minutes:02d}"


def _load_rows(doc, date_from=None, date_to=None) -> list:
	admission = g(doc, "admission_no")
	patient = g(doc, "file_no")
	filters = {}
	if admission:
		filters["admission_no"] = admission
	elif patient:
		filters["file_no"] = patient
	else:
		return [doc.as_dict() if hasattr(doc, "as_dict") else doc]

	rows = frappe.get_all(
		"Sleeping Pattern",
		filters=filters,
		fields=_ROW_FIELDS,
		order_by="date asc, creation asc",
		limit=400,
	)
	if not rows:
		return [doc.as_dict() if hasattr(doc, "as_dict") else doc]

	if date_from or date_to:
		rows = [r for r in rows if in_date_range(r.get("date"), date_from, date_to)]

	rows.sort(key=lambda r: (parse_date(r.get("date")) or date.min, str(r.get("name") or "")))
	return rows


def _th(text, extra="", *, colspan=None, rowspan=None) -> str:
	attr = f' class="{extra}"' if extra else ""
	if colspan:
		attr += f' colspan="{colspan}"'
	if rowspan:
		attr += f' rowspan="{rowspan}"'
	return f"<th{attr}>{esc(text)}</th>"


def _td(text, extra="") -> str:
	cls = f' class="{extra}"' if extra else ""
	return f"<td{cls}>{esc(text)}</td>"


def _chart_table(rows: list) -> str:
	body = []
	for row in rows:
		morning_s = _period_seconds(row.get("morning_from"), row.get("morning_to"))
		evening_s = _period_seconds(row.get("evening_from"), row.get("evening_to"))
		night_s = _period_seconds(row.get("night_from"), row.get("night_to"))
		total = morning_s + evening_s + night_s
		cells = [
			_td(fmt_date(row.get("date")), "sp-date"),
			_td(weekday(row.get("date")), "sp-day"),
			_td(fmt_time(row.get("morning_from")), "sp-c"),
			_td(fmt_time(row.get("morning_to")), "sp-c"),
			_td(_fmt_hm(morning_s), "sp-c"),
			_td(fmt_time(row.get("evening_from")), "sp-c"),
			_td(fmt_time(row.get("evening_to")), "sp-c"),
			_td(_fmt_hm(evening_s), "sp-c"),
			_td(fmt_time(row.get("night_from")), "sp-c"),
			_td(fmt_time(row.get("night_to")), "sp-c"),
			_td(_fmt_hm(night_s), "sp-c"),
			_td(_fmt_hm(total), "sp-total"),
		]
		body.append(f"<tr>{''.join(cells)}</tr>")

	if not body:
		body.append('<tr><td colspan="12" class="sp-c" style="height:24px;"></td></tr>')

	grp = "sp-grp"
	return f"""
	<table class="sp-chart">
		<thead>
			<tr>
				{_th("Date Time", "sp-h", rowspan=2)}
				{_th("Day", "sp-h", rowspan=2)}
				{_th("Morning", grp, colspan=3)}
				{_th("Evening", grp, colspan=3)}
				{_th("Night", grp, colspan=3)}
				{_th("Total Sleep", "sp-h", rowspan=2)}
			</tr>
			<tr>
				{_th("From")}
				{_th("To")}
				{_th("Total")}
				{_th("From")}
				{_th("To")}
				{_th("Total")}
				{_th("From")}
				{_th("To")}
				{_th("Total")}
			</tr>
		</thead>
		<tbody>{''.join(body)}</tbody>
	</table>
	"""


_CHART_CSS = f"""
		.sp-report {{
			font-family: Arial, Helvetica, sans-serif;
			color: #000;
			font-size: 11px;
			width: 100%;
			-webkit-print-color-adjust: exact !important;
			print-color-adjust: exact !important;
		}}
		.sp-chart {{
			width: 100%;
			border-collapse: collapse;
			table-layout: fixed;
			margin-top: 2px;
		}}
		.sp-chart th, .sp-chart td {{
			border: 1px solid #000;
			padding: 4px 4px;
			font-size: 10px;
			vertical-align: middle;
		}}
		.sp-chart th {{
			color: {MAROON} !important;
			font-weight: bold;
			text-align: center;
			background: #fff;
		}}
		.sp-grp {{
			color: {MAROON} !important;
			font-size: 12px;
		}}
		.sp-c {{ text-align: center; }}
		.sp-date {{ white-space: nowrap; font-weight: bold; text-align: center; }}
		.sp-day {{ white-space: nowrap; text-align: center; font-size: 9px; }}
		.sp-total {{ text-align: center; font-weight: bold; }}
"""


def render_sleeping_pattern_sheet(doc, date_from=None, date_to=None):
	if isinstance(doc, str):
		doc = frappe.get_doc("Sleeping Pattern", doc)
	rows = _load_rows(doc, date_from=date_from, date_to=date_to)
	meta = patient_meta(doc)
	return (
		f'<div class="sp-report">'
		f"{patient_info_html(meta)}"
		f"{_chart_table(rows)}"
		f"{form_footer_html(_FORM_CODE)}"
		f"</div>"
	)


def _seed_docs(name=None, patient=None):
	name = (name or "").strip()
	patient = (patient or "").strip()
	if patient:
		rows = frappe.get_all(
			"Sleeping Pattern",
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
			seeds.append(frappe.get_doc("Sleeping Pattern", row.name))
		if seeds:
			return seeds
	if name and frappe.db.exists("Sleeping Pattern", name):
		return [frappe.get_doc("Sleeping Pattern", name)]
	return []


@frappe.whitelist()
def get_sleeping_pattern_html(name=None, patient=None, date_from=None, date_to=None):
	assert_nursing_print_permission("Sleeping Pattern")

	seeds = _seed_docs(name, patient)
	if not seeds:
		frappe.throw(frappe._("No sleeping pattern records found to print"))

	bodies = [render_sleeping_pattern_sheet(seed, date_from=date_from, date_to=date_to) for seed in seeds]
	if not bodies:
		frappe.throw(frappe._("No sleeping pattern records found to print"))

	return wrap_print_document(
		_TITLE,
		'<div class="np-page-break"></div>'.join(bodies),
		get_doc_letter_head(seeds[0]),
		extra_css=_CHART_CSS,
		landscape=True,
	)
