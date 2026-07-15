"""Renderer for the "Lab Test Print" print format — Laboratory Report layout.

Results in this install are stored as an HTML table in Lab Test.custom_result
(columns: Panel, Test Code, Result), keyed by sub-template code (e.g. LAB-001-001).
Test name / unit / reference range come from the sub-template (Lab Test Template),
and the Low/Normal/High flag is computed from the result vs the gendered range.

Handles both an individual Lab Test and a group (all Lab Tests sharing a Service
Request are rendered as sections in one report). Registered as a Jinja method in
hooks.py so the print format can call ``render_lab_test_result_report(doc)``.
"""

import re

import frappe
from frappe.utils import flt, formatdate


def _esc(value) -> str:
	return frappe.utils.escape_html(str(value)) if value not in (None, "") else ""


def _resolve_group_lab_tests(doc):
	"""Return the list of Lab Tests to print: the whole Service Request group, else just this doc."""
	service_request = doc.get("service_request")
	if service_request:
		names = frappe.get_all(
			"Lab Test",
			filters={"service_request": service_request, "docstatus": ["<", 2]},
			order_by="creation asc",
			pluck="name",
		)
		if len(names) > 1:
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
	if sex == "female" and (tpl.get("female_min_range") not in (None, "") or tpl.get("female_max_range") not in (None, "")):
		return tpl.get("female_min_range"), tpl.get("female_max_range")
	if sex == "male" and (tpl.get("male_min_range") not in (None, "") or tpl.get("male_max_range") not in (None, "")):
		return tpl.get("male_min_range"), tpl.get("male_max_range")
	lo = tpl.get("male_min_range") if tpl.get("male_min_range") not in (None, "") else tpl.get("min_range")
	hi = tpl.get("male_max_range") if tpl.get("male_max_range") not in (None, "") else tpl.get("max_range")
	return lo, hi


def _flag(result: str, lo, hi) -> str:
	try:
		val = float(str(result).strip())
	except (TypeError, ValueError):
		return ""
	try:
		if lo not in (None, "") and val < float(lo):
			return "Low"
		if hi not in (None, "") and val > float(hi):
			return "High"
	except (TypeError, ValueError):
		return ""
	if lo in (None, "") and hi in (None, ""):
		return ""
	return "Normal"


def _range_text(lo, hi) -> str:
	lo_s = "" if lo in (None, "") else (str(int(lo)) if float(lo) == int(float(lo)) else str(lo))
	hi_s = "" if hi in (None, "") else (str(int(hi)) if float(hi) == int(float(hi)) else str(hi))
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
	return {
		"patient_name": doc.get("patient_name") or patient or "",
		"file_no": file_no,
		"id_number": id_number,
		"sex_age": sex_age,
		"referred_doctor": doc.get("practitioner_name") or doc.get("practitioner") or "",
		"request_no": doc.name,
		"date": formatdate(doc.get("result_date") or doc.get("submitted_date") or doc.get("creation")),
		"visit_no": doc.get("patient_visit") or "",
		"ip_case_no": doc.get("inpatient_admission") or "",
		"user": user_name,
	}


def _header_html(doc):
	m = _patient_meta(doc)

	def cell(label, value):
		return (
			f'<td class="lr-lbl">{_esc(label)}</td>'
			f'<td class="lr-val">{_esc(value)}</td>'
		)

	return f"""
	<table class="lr-info">
		<tr>{cell("Patient Name:", m["patient_name"])}{cell("Request No.", m["request_no"])}</tr>
		<tr>{cell("Patient File No.", m["file_no"])}{cell("Date:", m["date"])}</tr>
		<tr>{cell("CPR / ID No.", m["id_number"])}{cell("Visit No.", m["visit_no"])}</tr>
		<tr>{cell("Sex / Age", m["sex_age"])}{cell("IP Case No.", m["ip_case_no"])}</tr>
		<tr>{cell("Referred Doctor:", m["referred_doctor"])}{cell("User:", m["user"])}</tr>
	</table>
	"""


def _section_html(lt, cache):
	rows = _parse_custom_result(lt.get("custom_result"))
	sex = lt.get("patient_sex")
	body_rows = []
	for code, result in rows:
		tpl = _template_info(code, cache)
		name = tpl.get("lab_test_name") or code
		uom = tpl.get("lab_test_uom") or ""
		lo, hi = _range_bounds(tpl, sex)
		flag = _flag(result, lo, hi)
		flag_cls = {"Low": "lr-low", "High": "lr-high", "Normal": "lr-normal"}.get(flag, "")
		body_rows.append(
			f"<tr>"
			f'<td class="lr-tname">{_esc(name)}</td>'
			f'<td class="lr-c">{_esc(result)}</td>'
			f'<td class="lr-c">{_esc(uom)}</td>'
			f'<td class="lr-c {flag_cls}">{_esc(flag)}</td>'
			f'<td class="lr-c">{_esc(_range_text(lo, hi))}</td>'
			f"</tr>"
		)
	if not body_rows:
		return ""
	group_name = lt.get("lab_test_name") or lt.get("template") or lt.name
	return f"""
	<div class="lr-group">{_esc(group_name)}</div>
	<table class="lr-results">
		<thead>
			<tr>
				<th class="lr-tname">Test Name</th>
				<th class="lr-c">Result</th>
				<th class="lr-c">Unit</th>
				<th class="lr-c">Flag</th>
				<th class="lr-c">Normal Range</th>
			</tr>
		</thead>
		<tbody>{''.join(body_rows)}</tbody>
	</table>
	"""


@frappe.whitelist()
def render_lab_test_result_report(doc):
	"""Jinja method + whitelisted: full body HTML for the Laboratory Report."""
	if isinstance(doc, str):
		doc = frappe.get_doc("Lab Test", doc)

	lab_tests = _resolve_group_lab_tests(doc)
	cache: dict = {}
	sections = "".join(_section_html(lt, cache) for lt in lab_tests)
	if not sections:
		sections = '<div class="lr-empty">No results recorded yet.</div>'

	note = (doc.get("lab_test_comment") or "").strip()

	return f"""
	<style>
		.lr-report {{ font-family: Arial, sans-serif; color: #000; font-size: 12px; }}
		.lr-title {{ text-align: center; font-size: 18px; font-weight: bold; text-decoration: underline; margin: 4px 0 10px; }}
		.lr-info {{ width: 100%; border-collapse: collapse; margin-bottom: 8px; }}
		.lr-info td {{ border: 1px solid #000; padding: 3px 6px; vertical-align: top; }}
		.lr-info .lr-lbl {{ width: 18%; font-weight: bold; }}
		.lr-info .lr-val {{ width: 32%; }}
		.lr-details {{ text-align: center; font-weight: bold; margin: 8px 0 4px; }}
		.lr-group {{ font-weight: bold; padding: 4px 6px; border: 1px solid #000; border-bottom: none; background: #f2f2f2; }}
		.lr-results {{ width: 100%; border-collapse: collapse; margin-bottom: 10px; }}
		.lr-results th, .lr-results td {{ border: 1px solid #000; padding: 4px 6px; }}
		.lr-results th {{ background: #f2f2f2; text-align: left; }}
		.lr-results .lr-c {{ text-align: center; }}
		.lr-results .lr-tname {{ width: 40%; }}
		.lr-low {{ color: #b00020; font-weight: bold; }}
		.lr-high {{ color: #b00020; font-weight: bold; }}
		.lr-normal {{ color: #000; }}
		.lr-note {{ border: 1px solid #000; padding: 4px 6px; margin-bottom: 24px; min-height: 20px; }}
		.lr-sign {{ width: 100%; margin-top: 40px; }}
		.lr-sign td {{ width: 50%; text-align: center; font-size: 11px; padding-top: 24px; }}
		.lr-empty {{ padding: 12px; text-align: center; color: #666; }}
	</style>
	<div class="lr-report">
		<div class="lr-title">Laboratory Report</div>
		{_header_html(doc)}
		<div class="lr-details">Test Result Details</div>
		{sections}
		<div class="lr-note"><b>Note:</b> {_esc(note)}</div>
		<table class="lr-sign">
			<tr>
				<td><b>{_esc(doc.get('lab_technician_name') or '')}</b><br>LAB TECHNOLOGIST</td>
				<td><b>{_esc(doc.get('approved_by_name') or '')}</b><br>LAB Technician</td>
			</tr>
		</table>
	</div>
	"""
