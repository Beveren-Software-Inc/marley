"""ECT Chart PDF — monthly summary of ECT Details.

Matches the Oracle ECT CHART listing: Ser. No., Date, File No, Patient Name,
Session No (``sr_num``). Letter head comes from the cost center.
"""

from __future__ import annotations

from calendar import monthrange
from datetime import date

import frappe
from frappe.utils import getdate

from healthcare.api.common import resolve_cost_center_filter
from healthcare.api.nursing_print import (
	MAROON,
	esc,
	fmt_date,
	get_doc_letter_head,
	wrap_print_document,
)

_BLUE = "#1E4E8C"
_TITLE = "ECT CHART"

_ECT_CSS = f"""
	.ect-meta {{
		width: 100%;
		border-collapse: collapse;
		margin: 0 0 12px;
	}}
	.ect-meta td {{
		border: none;
		padding: 2px 4px 8px;
		font-size: 12px;
		vertical-align: top;
	}}
	.ect-lbl {{
		color: {MAROON} !important;
		font-weight: bold;
		white-space: nowrap;
	}}
	.ect-tbl {{
		width: 100%;
		border-collapse: collapse;
		table-layout: fixed;
	}}
	.ect-tbl th, .ect-tbl td {{
		border: 1px solid #000;
		padding: 5px 6px;
		font-size: 11px;
		vertical-align: middle;
	}}
	.ect-tbl th {{
		color: {_BLUE} !important;
		font-weight: bold;
		text-align: center;
		background: #fff;
	}}
	.ect-c {{ text-align: center; width: 10%; }}
	.ect-d {{ text-align: center; width: 16%; }}
	.ect-f {{ text-align: center; width: 16%; }}
	.ect-n {{ text-align: left; width: 48%; }}
	.ect-s {{ text-align: center; width: 10%; }}
"""


def _month_bounds(month):
	text = str(month or "").strip()
	if not text:
		return None, None
	try:
		parsed = getdate(f"{text}-01") if len(text) == 7 else getdate(text)
	except Exception:
		return None, None
	if not parsed:
		return None, None
	last = monthrange(parsed.year, parsed.month)[1]
	return date(parsed.year, parsed.month, 1), date(parsed.year, parsed.month, last)


def _month_label(month_from: date) -> str:
	return month_from.strftime("%B %Y")


def _practitioner_label(value) -> str:
	value = (value or "").strip()
	if not value:
		return ""
	row = frappe.db.get_value(
		"Healthcare Practitioner",
		value,
		["practitioner_name", "first_name", "last_name"],
		as_dict=True,
	)
	if not row:
		return value
	name = (row.get("practitioner_name") or "").strip()
	if name:
		return name
	joined = " ".join(x for x in [row.get("first_name"), row.get("last_name")] if x).strip()
	# Legacy Oracle IDs were imported as practitioners with no name — don't print the ID.
	return joined


def _session_text(row) -> str:
	"""Session No. Keep ``1`` visible; fall back to this patient's session count."""
	for key in ("sr_num", "custom_sr_no"):
		raw = row.get(key)
		if raw is None:
			continue
		text = str(raw).strip()
		if text.lower() in {"", "none", "null"}:
			continue
		return text
	computed = row.get("_computed_session")
	if computed is None:
		return ""
	return str(computed)


def _attach_computed_sessions(rows: list) -> None:
	"""1-based session index per patient (all-time, by date), used when sr_num is empty."""
	patient_ids = list({r.get("patient") for r in rows if r.get("patient")})
	if not patient_ids:
		return
	history = frappe.get_all(
		"ECT Details",
		filters={"patient": ["in", patient_ids]},
		fields=["name", "patient", "date", "time"],
		order_by="patient asc, date asc, time asc, name asc",
		limit=10000,
	)
	index: dict[tuple[str, str], int] = {}
	running: dict[str, int] = {}
	for item in history:
		patient = item.get("patient") or ""
		if not patient:
			continue
		running[patient] = running.get(patient, 0) + 1
		index[(patient, item.get("name") or "")] = running[patient]
	for row in rows:
		row["_computed_session"] = index.get((row.get("patient") or "", row.get("name") or ""))


def _anaesthetist_from_rows(rows) -> str:
	"""First ECT Details row that has a printable anaesthetist name."""
	for row in rows or []:
		for field in ("anaesthetic_doctor", "anathesiologist", "doctors_name"):
			label = _practitioner_label(row.get(field) or "")
			if label:
				return label
	return ""


def _assert_ect_print_permission():
	if not frappe.has_permission("ECT Details", "read"):
		frappe.throw(
			frappe._("Not permitted to print ECT Chart"),
			frappe.PermissionError,
		)


def _load_rows(patient=None, month=None, anaesthetist=None, cost_center=None) -> list:
	date_from, date_to = _month_bounds(month)
	if not date_from or not date_to:
		frappe.throw(frappe._("Select a month to print the ECT Chart"))

	filters: dict = {"date": ["between", [date_from, date_to]]}
	patient = (patient or "").strip()
	if patient:
		filters["patient"] = patient

	cc = resolve_cost_center_filter(cost_center)
	if cc is False:
		return []
	if isinstance(cc, list):
		if len(cc) == 1:
			filters["cost_center"] = cc[0]
		elif cc:
			filters["cost_center"] = ["in", cc]
	elif cc:
		filters["cost_center"] = cc

	anaesthetist = (anaesthetist or "").strip()
	or_filters = None
	if anaesthetist:
		or_filters = [
			["anaesthetic_doctor", "=", anaesthetist],
			["anathesiologist", "=", anaesthetist],
		]

	fields = [
		"name",
		"patient",
		"date",
		"time",
		"sr_num",
		"cost_center",
		"anaesthetic_doctor",
		"anathesiologist",
		"doctors_name",
	]
	if frappe.get_meta("ECT Details").has_field("custom_sr_no"):
		fields.append("custom_sr_no")
	kwargs = {
		"filters": filters,
		"fields": fields,
		"order_by": "date asc, time asc, name asc",
		"limit": 2000,
	}
	if or_filters:
		kwargs["or_filters"] = or_filters
	rows = frappe.get_all("ECT Details", **kwargs)
	patient_ids = list({r.patient for r in rows if r.get("patient")})
	pat_map = {}
	if patient_ids:
		for pat in frappe.get_all(
			"Patient",
			filters={"name": ["in", patient_ids]},
			fields=["name", "patient_name", "file_no"],
			limit=len(patient_ids),
		):
			pat_map[pat.name] = pat

	for row in rows:
		pat = pat_map.get(row.get("patient") or "") or {}
		row["patient_name"] = pat.get("patient_name") or row.get("patient") or ""
		row["file_no"] = pat.get("file_no") or row.get("patient") or ""
	_attach_computed_sessions(rows)
	return rows


def render_ect_chart(patient=None, month=None, anaesthetist=None, cost_center=None):
	date_from, date_to = _month_bounds(month)
	rows = _load_rows(
		patient=patient,
		month=month,
		anaesthetist=anaesthetist,
		cost_center=cost_center,
	)
	anaesthetist_label = _anaesthetist_from_rows(rows)

	month_text = _month_label(date_from) if date_from else ""
	meta = f"""
	<table class="ect-meta">
		<tr>
			<td><span class="ect-lbl">Month:</span> {esc(month_text)}</td>
			<td style="text-align:right;">
				<span class="ect-lbl">Anaesthetist Doc:</span> {esc(anaesthetist_label)}
			</td>
		</tr>
	</table>
	"""
	if not rows:
		frappe.throw(frappe._("No ECT details found for this month"))

	cells = []
	for i, row in enumerate(rows, start=1):
		cells.append(
			"<tr>"
			f'<td class="ect-c">{i}</td>'
			f'<td class="ect-d">{esc(fmt_date(row.get("date"), "%d-%m-%Y"))}</td>'
			f'<td class="ect-f">{esc(row.get("file_no"))}</td>'
			f'<td class="ect-n">{esc(row.get("patient_name"))}</td>'
			f'<td class="ect-s">{esc(_session_text(row))}</td>'
			"</tr>"
		)
	table = f"""
	<table class="ect-tbl">
		<thead>
			<tr>
				<th class="ect-c">Ser. No.</th>
				<th class="ect-d">Date</th>
				<th class="ect-f">File No</th>
				<th class="ect-n">Patient Name</th>
				<th class="ect-s">Session No</th>
			</tr>
		</thead>
		<tbody>
			{"".join(cells)}
		</tbody>
	</table>
	"""
	seed = {"cost_center": rows[0].get("cost_center") or (cost_center or "").strip()}
	return meta + table, seed


@frappe.whitelist()
def get_ect_chart_html(patient=None, month=None, anaesthetist=None, cost_center=None):
	_assert_ect_print_permission()
	body, seed = render_ect_chart(
		patient=patient,
		month=month,
		anaesthetist=anaesthetist,
		cost_center=cost_center,
	)
	if not (cost_center or "").strip() and seed.get("cost_center"):
		seed = {"cost_center": seed.get("cost_center")}
	return wrap_print_document(
		_TITLE,
		body,
		get_doc_letter_head(seed),
		extra_css=_ECT_CSS,
		landscape=False,
	)
