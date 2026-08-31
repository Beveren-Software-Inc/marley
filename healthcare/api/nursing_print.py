"""Shared nursing report print chrome: title, cost-center letter head, patient table.

All IP nursing PDFs (Grooming Pattern, Mental State, …) should use this so header
changes happen in one place.
"""

from __future__ import annotations

from datetime import datetime, timedelta, time as time_type

import frappe
from frappe.utils import date_diff, escape_html, get_datetime, getdate, now_datetime, today

MAROON = "#8B0000"

_ADMISSION_FIELDS = ("admission_no", "admission", "inpatient_admission", "inpatient_record")
_VISIT_FIELDS = ("patient_visit", "visit")
_COST_CENTER_FIELDS = ("cost_center", "branch")


def g(doc, field, default=None):
	if isinstance(doc, dict):
		value = doc.get(field)
	elif hasattr(doc, "get"):
		try:
			value = doc.get(field)
		except Exception:
			value = None
	else:
		value = getattr(doc, field, None)
	return default if value in (None, "") else value


def esc(value) -> str:
	return escape_html(str(value)) if value not in (None, "") else ""


def parse_date(value):
	if value in (None, "", "None"):
		return None
	try:
		return getdate(value)
	except Exception:
		return None


def parse_datetime(value):
	if value in (None, "", "None"):
		return None
	# Frappe Time fields come back as timedelta (seconds since midnight).
	if isinstance(value, timedelta):
		total = int(value.total_seconds()) % (24 * 3600)
		hours, rem = divmod(total, 3600)
		minutes, seconds = divmod(rem, 60)
		try:
			return datetime.combine(getdate(), time_type(hours, minutes, seconds))
		except Exception:
			return None
	if isinstance(value, time_type):
		try:
			return datetime.combine(getdate(), value)
		except Exception:
			return None
	try:
		dt = get_datetime(value)
	except Exception:
		return None
	if isinstance(dt, timedelta):
		return parse_datetime(dt)
	return dt


def fmt_date(value, pattern="%d/%m/%Y") -> str:
	d = parse_date(value)
	if not d:
		return ""
	return d.strftime(pattern)


def fmt_time(value) -> str:
	dt = parse_datetime(value)
	if not dt or not hasattr(dt, "strftime"):
		return ""
	return dt.strftime("%H:%M")


def weekday(value) -> str:
	d = parse_date(value)
	if not d:
		return ""
	return d.strftime("%A").upper()


def shift_from_hour(hour) -> str:
	"""Nursing shifts: 06:00–13:59 Morning, 14:00–21:59 Evening, else Night."""
	try:
		h = int(hour)
	except (TypeError, ValueError):
		return ""
	if 6 <= h < 14:
		return "Morning"
	if 14 <= h < 22:
		return "Evening"
	return "Night"


def shift_from_datetime(value) -> str:
	dt = parse_datetime(value)
	if not dt or not hasattr(dt, "hour"):
		return ""
	return shift_from_hour(dt.hour)


def normalize_shift(value) -> str:
	text = str(value or "").strip().upper()
	if text in {"1", "MORNING", "MOR"}:
		return "Morning"
	if text in {"2", "EVENING", "EVE"}:
		return "Evening"
	if text in {"3", "NIGHT", "NGT"}:
		return "Night"
	return ""


def age_text(dob) -> str:
	d = parse_date(dob)
	if not d:
		return ""
	days = date_diff(today(), d)
	if days is None or days < 0:
		return ""
	years = days // 365
	months = (days % 365) // 30
	return f"{years} Y - {months} M"


def in_date_range(value, date_from=None, date_to=None) -> bool:
	d = parse_date(value)
	if not d:
		return True
	if date_from:
		df = parse_date(date_from)
		if df and d < df:
			return False
	if date_to:
		dt = parse_date(date_to)
		if dt and d > dt:
			return False
	return True


def resolve_cost_center(doc) -> str:
	for field in _COST_CENTER_FIELDS:
		cc = g(doc, field) or ""
		if cc:
			return str(cc).strip()

	for field in _ADMISSION_FIELDS:
		admission = g(doc, field)
		if admission:
			try:
				cc = frappe.db.get_value("Inpatient Admission", admission, "cost_center")
			except Exception:
				cc = None
			if cc:
				return str(cc).strip()

	for field in _VISIT_FIELDS:
		visit = g(doc, field)
		if visit:
			try:
				cc = frappe.db.get_value("Patient Visit", visit, "cost_center")
			except Exception:
				cc = None
			if cc:
				return str(cc).strip()

	return ""


def get_doc_letter_head(doc):
	"""Letter Head HTML from Cost Center.custom_letter_head.

	Resolution order:
	1. ``doc.cost_center`` / ``doc.branch``
	2. Inpatient Admission cost center (IP)
	3. Patient Visit cost center
	"""
	if isinstance(doc, str):
		return {"content": "", "footer": ""}

	try:
		cc = resolve_cost_center(doc)
		if not cc:
			return {"content": "", "footer": ""}
		lh_name = frappe.db.get_value("Cost Center", cc, "custom_letter_head")
		if not lh_name:
			return {"content": "", "footer": ""}
		lh = frappe.get_cached_doc("Letter Head", lh_name)
		return {"content": lh.content or "", "footer": lh.footer or ""}
	except Exception:
		return {"content": "", "footer": ""}


def patient_meta(doc) -> dict:
	patient_id = g(doc, "file_no") or g(doc, "patient")
	admission = (
		g(doc, "admission_no")
		or g(doc, "admission")
		or g(doc, "inpatient_admission")
	)
	pat = {}
	if patient_id:
		pat = (
			frappe.db.get_value(
				"Patient",
				patient_id,
				["name", "patient_name", "file_no", "id_number", "uid", "sex", "dob", "nationality", "pat_nationality"],
				as_dict=True,
			)
			or {}
		)

	adm = {}
	if admission:
		adm = (
			frappe.db.get_value(
				"Inpatient Admission",
				admission,
				["name", "case_no", "admission_no_old", "patient"],
				as_dict=True,
			)
			or {}
		)
		if not patient_id and adm.get("patient"):
			patient_id = adm.get("patient")
			pat = (
				frappe.db.get_value(
					"Patient",
					patient_id,
					["name", "patient_name", "file_no", "id_number", "uid", "sex", "dob", "nationality", "pat_nationality"],
					as_dict=True,
				)
				or {}
			)

	file_no = pat.get("file_no") or patient_id or ""
	ip_case = (
		adm.get("case_no")
		or adm.get("admission_no_old")
		or g(doc, "admission_no_old")
		or admission
		or ""
	)
	return {
		"file_no": file_no,
		"id_number": pat.get("id_number") or pat.get("uid") or "",
		"patient_name": g(doc, "patient_name") or pat.get("patient_name") or "",
		"gender": pat.get("sex") or "",
		"nationality": pat.get("nationality") or pat.get("pat_nationality") or "",
		"ip_case_no": ip_case,
		"admission_no": admission or adm.get("name") or "",
		"age": age_text(pat.get("dob")),
	}


def patient_info_html(meta: dict) -> str:
	"""Full-width patient block: File/Name/IP Case on the left, CPR/Gender/Age on the right."""
	pairs = [
		("Patient File No.", meta.get("file_no"), "CPR / ID No.", meta.get("id_number")),
		("Patient Name:", meta.get("patient_name"), "Gender:", meta.get("gender")),
		("IP Case No.", meta.get("ip_case_no"), "Age:", meta.get("age")),
	]
	if meta.get("admission_no"):
		pairs.append(("Admission No.", meta.get("admission_no"), "", ""))
	body = "".join(
		"<tr>"
		+ (
			f'<td class="np-lbl">{esc(left_lbl)}</td><td class="np-val" colspan="3">{esc(left_val)}</td>'
			if not right_lbl
			else (
				f'<td class="np-lbl">{esc(left_lbl)}</td><td class="np-val">{esc(left_val)}</td>'
				f'<td class="np-lbl">{esc(right_lbl)}</td><td class="np-val">{esc(right_val)}</td>'
			)
		)
		+ "</tr>"
		for left_lbl, left_val, right_lbl, right_val in pairs
	)
	return f'<div class="np-info-wrap"><table class="np-info">{body}</table></div>'


def op_patient_info_html(meta: dict) -> str:
	"""OP visit patient block — no admission / IP case number."""
	pairs = [
		("File No.", meta.get("file_no"), "Patient Name:", meta.get("patient_name")),
		("CPR / ID No.", meta.get("id_number"), "Nationality:", meta.get("nationality")),
		("Sex:", meta.get("gender"), "Age:", meta.get("age")),
	]
	body = "".join(
		"<tr>"
		f'<td class="np-lbl">{esc(left_lbl)}</td><td class="np-val">{esc(left_val)}</td>'
		f'<td class="np-lbl">{esc(right_lbl)}</td><td class="np-val">{esc(right_val)}</td>'
		"</tr>"
		for left_lbl, left_val, right_lbl, right_val in pairs
	)
	return f'<div class="np-info-wrap"><table class="np-info">{body}</table></div>'


def form_footer_html(form_code: str, page: int = 1, total: int = 1) -> str:
	printed = now_datetime().strftime("%A %B %d %Y %I:%M %p")
	return f"""
	<table class="np-footer">
		<tr>
			<td class="np-code">{esc(form_code)}</td>
			<td class="np-page">Page {page} of {total}<br>{esc(printed)}</td>
		</tr>
	</table>
	"""


def shared_css() -> str:
	return f"""
		.np-info-wrap {{ width: 100%; margin: 0 0 8px; }}
		.np-info {{ width: 100%; border-collapse: collapse; table-layout: fixed; }}
		.np-info td {{
			border: 1px solid #000;
			padding: 4px 7px;
			font-size: 11px;
			vertical-align: middle;
		}}
		.np-lbl {{
			width: 16%;
			font-weight: bold;
			color: {MAROON} !important;
			white-space: nowrap;
		}}
		.np-val {{ width: 34%; }}
		.np-footer {{ width: 100%; border-collapse: collapse; margin-top: 10px; }}
		.np-footer td {{ border: none; padding: 0 2px; vertical-align: top; }}
		.np-code {{
			color: {MAROON} !important;
			font-weight: bold;
			font-size: 11px;
		}}
		.np-page {{ text-align: right; font-size: 10px; white-space: nowrap; }}
		.np-page-break {{ page-break-before: always; }}
	"""


def wrap_print_document(
	title: str,
	body_html: str,
	letter_head: dict | None = None,
	*,
	extra_css: str = "",
	landscape: bool = True,
) -> str:
	"""Full HTML document: report title, letter head, body, letter-head footer."""
	lh = letter_head or {}
	content = lh.get("content") or ""
	footer = lh.get("footer") or ""
	top = f'<div class="letter-head-top">{content}</div>' if content else ""
	bottom = (
		f'<div class="letter-head-footer" style="margin-top: 20px;">{footer}</div>' if footer else ""
	)
	page_size = "A4 landscape" if landscape else "A4"
	return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>{esc(title)}</title>
<style>
@page {{ size: {page_size}; margin: 10mm; }}
body {{ margin: 0; padding: 8px; color: #000; font-family: Arial, Helvetica, sans-serif; }}
.np-doc-title {{
  text-align: center;
  font-size: 22px;
  font-weight: bold;
  color: {MAROON};
  text-decoration: underline;
  margin: 0 0 10px;
}}
.letter-head-top {{ margin-bottom: 10px; }}
.letter-head-footer {{ margin-top: 20px; page-break-inside: avoid; }}
{shared_css()}
{extra_css}
</style>
</head>
<body>
<div class="np-doc-title">{esc(title)}</div>
{top}
{body_html}
{bottom}
<script>window.onload = function () {{ window.print(); }}</script>
</body>
</html>"""


def assert_nursing_print_permission(doctype: str):
	from healthcare.api.common import _user_can_read_nursing_portal

	if not frappe.has_permission(doctype, "read") and not _user_can_read_nursing_portal():
		frappe.throw(
			frappe._("Not permitted to print {0}").format(doctype),
			frappe.PermissionError,
		)
