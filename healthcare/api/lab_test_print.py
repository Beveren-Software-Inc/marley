"""Renderer for the "Lab Test Print" print format — Laboratory Report layout.

Results in this install are stored as an HTML table in Lab Test.custom_result
(columns: Panel, Test Code, Result), keyed by sub-template code (e.g. LAB-001-001).
Test name / unit / reference range come from the sub-template (Lab Test Template),
and the Low/Normal/High flag is computed from the result vs the gendered range.

Handles both an individual Lab Test and a full Lab Request. When the Lab Test
belongs to a Service Request, every Lab Test on that request is included — all
groups — each rendered as one group header with its child tests underneath.
Registered as a Jinja method in hooks.py so the print format can call
``render_lab_test_result_report(doc)``.
"""

from __future__ import annotations

import re
from collections import OrderedDict

import frappe
from frappe.utils import formatdate, strip_html


def _esc(value) -> str:
	return frappe.utils.escape_html(str(value)) if value not in (None, "") else ""


def _resolve_group_lab_tests(doc):
	"""All Lab Tests on the Service Request (full request report), else just this doc.

	Multi-group Lab Requests print every panel on the request. Layout still groups
	children under each ``lab_test_group`` / template header.
	"""
	service_request = doc.get("service_request")
	if service_request:
		names = frappe.get_all(
			"Lab Test",
			filters={"service_request": service_request, "docstatus": ["<", 2]},
			order_by="creation asc",
			pluck="name",
		)
		if names:
			return [frappe.get_doc("Lab Test", n) for n in names]
	return [doc]


def _parse_custom_result(html: str):
	"""Parse the custom_result HTML table into [(test_code, result_value), ...]."""
	if not html:
		return []
	rows = []
	try:
		from bs4 import BeautifulSoup

		soup = BeautifulSoup(html, "html.parser")
		body = soup.find("tbody") or soup
		for tr in body.find_all("tr"):
			cells = [td.get_text(strip=True) for td in tr.find_all("td")]
			if len(cells) >= 3:
				rows.append((cells[1], cells[2]))  # (Test Code, Result)
			elif len(cells) == 2:
				rows.append((cells[0], cells[1]))
	except Exception:
		# Fallback: crude regex over <td> cells, three per row.
		cells = re.findall(r"<td[^>]*>(.*?)</td>", html, flags=re.I | re.S)
		cells = [re.sub(r"<[^>]+>", "", c).strip() for c in cells]
		for i in range(0, len(cells) - 2, 3):
			rows.append((cells[i + 1], cells[i + 2]))
	return rows


_TEMPLATE_FIELDS = (
	"lab_test_name",
	"lab_test_uom",
	"male_min_range",
	"male_max_range",
	"female_min_range",
	"female_max_range",
	"min_range",
	"max_range",
)


def _template_info(code: str, cache: dict):
	if code not in cache:
		cache[code] = frappe.db.get_value("Lab Test Template", code, _TEMPLATE_FIELDS, as_dict=True) or {}
	return cache[code]


def _range_bounds(tpl: dict, sex: str):
	"""Pick the applicable (min, max) for the patient's sex, falling back to generic ranges."""
	sex = (sex or "").strip().lower()
	if sex == "female" and (
		tpl.get("female_min_range") not in (None, "") or tpl.get("female_max_range") not in (None, "")
	):
		return tpl.get("female_min_range"), tpl.get("female_max_range")
	if sex == "male" and (
		tpl.get("male_min_range") not in (None, "") or tpl.get("male_max_range") not in (None, "")
	):
		return tpl.get("male_min_range"), tpl.get("male_max_range")
	lo = tpl.get("male_min_range") if tpl.get("male_min_range") not in (None, "") else tpl.get("min_range")
	hi = tpl.get("male_max_range") if tpl.get("male_max_range") not in (None, "") else tpl.get("max_range")
	return lo, hi


def _parse_num(value):
	"""Parse min/max/result numbers; tolerate commas (e.g. ``1,100``) and blanks."""
	if value in (None, ""):
		return None
	try:
		s = str(value).strip().replace(",", "")
		if not s:
			return None
		return float(s)
	except (TypeError, ValueError):
		return None


def _format_num(value) -> str:
	"""Display a numeric range bound without trailing ``.0`` when whole."""
	num = _parse_num(value)
	if num is None:
		return "" if value in (None, "") else str(value).strip()
	if num == int(num):
		return str(int(num))
	return str(num)


def _flag(result: str, lo, hi) -> str:
	val = _parse_num(result)
	if val is None:
		return ""
	lo_n = _parse_num(lo)
	hi_n = _parse_num(hi)
	if lo_n is not None and val < lo_n:
		return "Low"
	if hi_n is not None and val > hi_n:
		return "High"
	if lo_n is None and hi_n is None:
		return ""
	return "Normal"


def _range_text(lo, hi) -> str:
	lo_s = _format_num(lo)
	hi_s = _format_num(hi)
	if lo_s and hi_s:
		return f"{lo_s} - {hi_s}"
	return lo_s or hi_s or ""


def _patient_meta(doc):
	patient = doc.get("patient")
	file_no = id_number = ""
	if patient:
		row = frappe.db.get_value("Patient", patient, ["file_no", "id_number"], as_dict=True) or {}
		file_no = row.get("file_no") or ""
		id_number = row.get("id_number") or ""
	user_name = doc.get("lab_technician_name") or ""
	if not user_name:
		user_name = frappe.db.get_value("User", doc.get("owner"), "full_name") or doc.get("owner") or ""
	sex_age = " / ".join([p for p in [doc.get("patient_sex") or "", doc.get("patient_age") or ""] if p])
	referred_doctor = doc.get("practitioner_name") or doc.get("practitioner") or ""
	if not referred_doctor and doc.get("doc_no"):
		from healthcare.api.lab_test import _resolve_practitioner_from_doc_no

		_, pract_name = _resolve_practitioner_from_doc_no(doc.get("doc_no"))
		referred_doctor = pract_name or str(doc.get("doc_no") or "").strip()
	return {
		"patient_name": doc.get("patient_name") or patient or "",
		"file_no": file_no,
		"id_number": id_number,
		"sex_age": sex_age,
		"referred_doctor": referred_doctor,
		"request_no": doc.get("service_request") or doc.name,
		"date": formatdate(doc.get("result_date") or doc.get("submitted_date") or doc.get("creation")),
		"visit_no": doc.get("patient_visit") or "",
		"ip_case_no": doc.get("inpatient_admission") or "",
		"user": user_name,
	}


# Maroon / navy — inline so print/PDF does not strip class-only colors.
_LR_MAROON = "#800000"
_LR_NAVY = "#000080"
_LR_TH_BG = "#e8eaf0"


def _header_html(doc):
	m = _patient_meta(doc)

	def cell(label, value):
		return (
			f'<td class="lr-lbl" style="width:18%;font-weight:bold;color:{_LR_MAROON} !important;'
			f'border:1px solid #000;padding:4px 6px;vertical-align:top;">{_esc(label)}</td>'
			f'<td class="lr-val" style="width:32%;color:#000;border:1px solid #000;'
			f'padding:4px 6px;vertical-align:top;">{_esc(value)}</td>'
		)

	return f"""
	<table class="lr-info" style="width:100%;border-collapse:collapse;margin-bottom:10px;">
		<tr>{cell("Patient Name:", m["patient_name"])}{cell("Request No.", m["request_no"])}</tr>
		<tr>{cell("Patient File No.", m["file_no"])}{cell("Date:", m["date"])}</tr>
		<tr>{cell("CPR / ID No.", m["id_number"])}{cell("Visit No.", m["visit_no"])}</tr>
		<tr>{cell("Sex / Age", m["sex_age"])}{cell("IP Case No.", m["ip_case_no"])}</tr>
		<tr>{cell("Referred Doctor:", m["referred_doctor"])}{cell("User:", m["user"])}</tr>
	</table>
	"""


def _result_row_html(name, result, uom, flag, range_text) -> str:
	# High = red, Low = orange (portal + print agreement)
	flag_l = (flag or "").strip()
	flag_l_lower = flag_l.lower()
	if "high" in flag_l_lower:
		flag_color, flag_weight = "#dc2626", "bold"  # red
	elif "low" in flag_l_lower:
		flag_color, flag_weight = "#ea580c", "bold"  # orange
	else:
		flag_color, flag_weight = "#000", "normal"
	return (
		f"<tr>"
		f'<td class="lr-tname" style="width:40%;text-align:left;color:#000;'
		f'border:1px solid #000;padding:4px 6px;">{_esc(name)}</td>'
		f'<td class="lr-c" style="text-align:center;color:#000;border:1px solid #000;'
		f'padding:4px 6px;">{_esc(result)}</td>'
		f'<td class="lr-c" style="text-align:center;color:#000;border:1px solid #000;'
		f'padding:4px 6px;">{_esc(uom)}</td>'
		f'<td class="lr-c" style="text-align:center;color:{flag_color};font-weight:{flag_weight};'
		f'border:1px solid #000;padding:4px 6px;">{_esc(flag)}</td>'
		f'<td class="lr-c" style="text-align:center;color:#000;border:1px solid #000;'
		f'padding:4px 6px;">{_esc(range_text)}</td>'
		f"</tr>"
	)


def _rows_from_custom_result(lt, cache) -> list[str]:
	rows = _parse_custom_result(lt.get("custom_result"))
	sex = lt.get("patient_sex")
	body_rows = []
	for code, result in rows:
		tpl = _template_info(code, cache)
		name = tpl.get("lab_test_name") or code
		uom = tpl.get("lab_test_uom") or ""
		lo, hi = _range_bounds(tpl, sex)
		flag = _flag(result, lo, hi) if (result or "").strip() else ""
		body_rows.append(_result_row_html(name, result, uom, flag, _range_text(lo, hi)))
	return body_rows


def _rows_from_normal_items(lt, cache) -> list[str]:
	"""Fallback rows from normal_test_items (even when result_value is blank)."""
	sex = lt.get("patient_sex")
	body_rows = []
	for item in lt.get("normal_test_items") or []:
		code = (getattr(item, "template", None) or "").strip()
		result = getattr(item, "result_value", None) or ""
		name = (
			getattr(item, "lab_test_name", None)
			or getattr(item, "lab_test_event", None)
			or code
		)
		uom = getattr(item, "lab_test_uom", None) or ""
		range_text = getattr(item, "normal_range", None) or ""
		lo = hi = None
		tpl = {}
		if code:
			tpl = _template_info(code, cache)
			if not name:
				name = tpl.get("lab_test_name") or code
			if not uom:
				uom = tpl.get("lab_test_uom") or ""
			lo, hi = _range_bounds(tpl, sex)
			if not range_text:
				range_text = _range_text(lo, hi)
		if lo is None and hi is None:
			parent_code = (lt.get("template") or "").strip()
			if parent_code:
				tpl = _template_info(parent_code, cache)
				lo, hi = _range_bounds(tpl, sex)
				if not range_text:
					range_text = _range_text(lo, hi)
		flag = ""
		# Prefer explicit status band (Vitamin D Deficiency / …) when present.
		status_mark = (getattr(item, "result_status", None) or "").strip()
		if status_mark:
			flag = status_mark
		elif str(result).strip() and (lo not in (None, "") or hi not in (None, "")):
			flag = _flag(result, lo, hi)
		body_rows.append(_result_row_html(name or "—", result, uom, flag, range_text))
	return body_rows


def _rows_from_single_result(lt, cache) -> list[str]:
	"""One row from custom_result / template for a simple (non-table) Lab Test line."""
	code = (lt.get("template") or "").strip()
	result = ""
	raw = (lt.get("custom_result") or "").strip()
	if raw:
		# Plain value (not an HTML table of sub-tests).
		plain = strip_html(raw).strip()
		if plain and not _parse_custom_result(raw):
			result = plain

	if code:
		tpl = _template_info(code, cache)
		name = tpl.get("lab_test_name") or lt.get("lab_test_name") or code
		uom = tpl.get("lab_test_uom") or ""
		lo, hi = _range_bounds(tpl, lt.get("patient_sex"))
		flag = _flag(result, lo, hi) if result else ""
		return [_result_row_html(name, result, uom, flag, _range_text(lo, hi))]

	name = lt.get("lab_test_name") or lt.name
	return [_result_row_html(name, result, "", "", "")]


def _body_rows_for_lab_test(lt, cache) -> list[str]:
	"""Collect result rows for one Lab Test document (sub-units or a single line)."""
	body_rows = _rows_from_custom_result(lt, cache)
	if not body_rows:
		body_rows = _rows_from_normal_items(lt, cache)
	if not body_rows:
		body_rows = _rows_from_single_result(lt, cache)
	return body_rows


def _group_display_name(group_key: str, tests: list) -> str:
	"""Human label for a panel / single: prefer group template name, else first child name."""
	if group_key:
		name = frappe.db.get_value("Lab Test Template", group_key, "lab_test_name")
		if name:
			return name
	first = tests[0] if tests else None
	if first:
		return first.get("lab_test_name") or first.get("template") or first.name
	return group_key or "Lab Test"


def _bucket_key(lt) -> str:
	group = (lt.get("lab_test_group") or "").strip()
	if group:
		return group
	return (lt.get("template") or "").strip() or lt.name


def _section_html_from_rows(group_name: str, body_rows: list[str]) -> str:
	th = (
		f"border:1px solid #000;padding:4px 6px;background:{_LR_TH_BG};"
		f"color:{_LR_NAVY} !important;font-weight:bold;text-align:center;"
	)
	return f"""
	<div class="lr-group" style="font-weight:bold;color:{_LR_MAROON} !important;padding:6px 2px 4px;margin-top:6px;">
		{_esc(group_name)}
	</div>
	<table class="lr-results" style="width:100%;border-collapse:collapse;margin-bottom:10px;">
		<thead>
			<tr>
				<th class="lr-tname" style="{th}width:40%;text-align:left;">Test Name</th>
				<th class="lr-c" style="{th}">Result</th>
				<th class="lr-c" style="{th}">Unit</th>
				<th class="lr-c" style="{th}">Flag</th>
				<th class="lr-c" style="{th}">Normal Range</th>
			</tr>
		</thead>
		<tbody>{''.join(body_rows)}</tbody>
	</table>
	"""


def _sections_html(lab_tests, cache) -> str:
	"""One section per group (or standalone template), with all child tests as rows."""
	buckets: OrderedDict[str, list] = OrderedDict()
	for lt in lab_tests:
		buckets.setdefault(_bucket_key(lt), []).append(lt)

	parts: list[str] = []
	for key, tests in buckets.items():
		body_rows: list[str] = []
		for lt in tests:
			body_rows.extend(_body_rows_for_lab_test(lt, cache))
		if not body_rows:
			body_rows = [_result_row_html("—", "", "", "", "")]
		parts.append(_section_html_from_rows(_group_display_name(key, tests), body_rows))
	return "".join(parts)


@frappe.whitelist()
def render_lab_test_result_report(doc):
	"""Jinja method + whitelisted: full body HTML for the Laboratory Report."""
	if isinstance(doc, str):
		doc = frappe.get_doc("Lab Test", doc)

	lab_tests = _resolve_group_lab_tests(doc)
	cache: dict = {}
	sections = _sections_html(lab_tests, cache)

	note = (doc.get("lab_test_comment") or "").strip()

	return f"""
	<style>
		/* Force colors in browser print + PDF (class CSS alone is often overridden). */
		.lr-report {{ font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 12px; }}
		.lr-report .lr-title,
		.lr-report .lr-details,
		.lr-report .lr-group,
		.lr-report .lr-info .lr-lbl,
		.lr-report .lr-note b {{
			color: {_LR_MAROON} !important;
			-webkit-print-color-adjust: exact !important;
			print-color-adjust: exact !important;
		}}
		.lr-report .lr-results th {{
			color: {_LR_NAVY} !important;
			background-color: {_LR_TH_BG} !important;
			-webkit-print-color-adjust: exact !important;
			print-color-adjust: exact !important;
		}}
		@media print {{
			.lr-report .lr-title,
			.lr-report .lr-details,
			.lr-report .lr-group,
			.lr-report .lr-info .lr-lbl,
			.lr-report .lr-note b {{ color: {_LR_MAROON} !important; }}
			.lr-report .lr-results th {{
				color: {_LR_NAVY} !important;
				background-color: {_LR_TH_BG} !important;
			}}
		}}
	</style>
	<div class="lr-report">
		<div class="lr-title" style="text-align:center;font-size:20px;font-weight:bold;color:{_LR_MAROON} !important;margin:4px 0 12px;">
			Laboratory Report
		</div>
		{_header_html(doc)}
		<div class="lr-details" style="text-align:center;font-weight:bold;color:{_LR_MAROON} !important;font-size:14px;margin:10px 0 8px;">
			Test Result Details
		</div>
		{sections}
		<div class="lr-note" style="border:1px solid #000;padding:4px 6px;margin-bottom:24px;min-height:20px;">
			<b style="color:{_LR_MAROON} !important;">Note:</b> {_esc(note)}
		</div>
		<table class="lr-sign" style="width:100%;margin-top:40px;">
			<tr>
				<td style="width:50%;text-align:center;font-size:11px;padding-top:24px;color:#000;">
					<b>{_esc(doc.get('lab_technician_name') or '')}</b><br>LAB TECHNOLOGIST
				</td>
				<td style="width:50%;text-align:center;font-size:11px;padding-top:24px;color:#000;">
					<b>{_esc(doc.get('approved_by_name') or '')}</b><br>LAB Technician
				</td>
			</tr>
		</table>
	</div>
	"""
