"""TPR / Vital Chart PDF — branch letter head + shared patient header."""

from __future__ import annotations

import frappe
from frappe.utils import cstr

from healthcare.api.nursing_print import (
	MAROON,
	assert_nursing_print_permission,
	esc,
	fmt_date,
	get_doc_letter_head,
	op_patient_info_html,
	parse_datetime,
	patient_meta,
	wrap_print_document,
)

_TITLE = "TPR/Vital Chart"

# Column order matches the Serene TPR/VITAL CHART print.
_COLUMNS: tuple[tuple[str, str], ...] = (
	("date", "Date"),
	("time", "Time"),
	("bp", "BP"),
	("pulse", "Pulse"),
	("temperature", "Temperature"),
	("spo2", "SPO2"),
	("resp_rate", "Resp.Rate"),
	("weight", "Weight"),
	("staff_nurse", "Staff Nurse"),
)

_ROW_FIELDS = [
	"name",
	"trans_no",
	"patient",
	"patient_name",
	"signs_date",
	"signs_time",
	"temperature",
	"pulse",
	"respiratory_rate",
	"bp_systolic",
	"bp_diastolic",
	"bp",
	"spo2",
	"weight",
	"owner",
	"inpatient_record",
	"encounter",
	"cost_center",
	"branch",
]


def _bp_text(row: dict) -> str:
	bp = cstr(row.get("bp") or "").strip()
	if bp:
		return bp
	sys = cstr(row.get("bp_systolic") or "").strip()
	dia = cstr(row.get("bp_diastolic") or "").strip()
	if sys and dia:
		return f"{sys}/{dia}"
	return sys or dia or ""


def _time_text(value) -> str:
	"""HH:MM:SS to match the sample TPR chart."""
	dt = parse_datetime(value)
	if dt and hasattr(dt, "strftime"):
		return dt.strftime("%H:%M:%S")
	return cstr(value or "").strip()


def _staff_nurse(owner) -> str:
	raw = cstr(owner or "").strip()
	if not raw:
		return ""
	try:
		if frappe.db.exists("User", raw):
			full = frappe.db.get_value("User", raw, "full_name") or raw
			token = cstr(full).strip()
			first = token.split()[0] if token else raw
			return first.upper()
	except Exception:
		pass
	# email local-part fallback
	if "@" in raw:
		return raw.split("@", 1)[0].upper()
	return raw.split()[0].upper() if raw else ""


def _load_rows(
	patient=None,
	admission=None,
	encounter=None,
	date_from=None,
	date_to=None,
	practitioner=None,
) -> list[dict]:
	filters: dict = {}
	patient = (patient or "").strip()
	admission = (admission or "").strip()
	encounter = (encounter or "").strip()

	if patient:
		filters["patient"] = patient
	if admission:
		filters["inpatient_record"] = admission
	elif encounter:
		filters["encounter"] = encounter

	if date_from and date_to:
		filters["signs_date"] = ["between", [date_from, date_to]]
	elif date_from:
		filters["signs_date"] = [">=", date_from]
	elif date_to:
		filters["signs_date"] = ["<=", date_to]

	if practitioner:
		user_id = frappe.db.get_value("Healthcare Practitioner", practitioner, "user_id")
		if user_id:
			filters["owner"] = user_id

	meta = frappe.get_meta("Vital Signs")
	fields = [f for f in _ROW_FIELDS if meta.has_field(f) or f in ("name", "owner")]

	rows = frappe.get_all(
		"Vital Signs",
		filters=filters,
		fields=fields,
		order_by="signs_date asc, signs_time asc",
		limit=0,
	)
	for row in rows:
		if row.get("patient") and not row.get("patient_name"):
			row["patient_name"] = frappe.db.get_value("Patient", row.patient, "patient_name") or row.patient
	return rows


def _build_seed(
	patient=None,
	admission=None,
	encounter=None,
	rows: list[dict] | None = None,
) -> dict:
	rows = rows or []
	first = rows[0] if rows else {}
	seed = {
		"patient": patient or first.get("patient") or "",
		"file_no": patient or first.get("patient") or "",
		"patient_name": first.get("patient_name") or "",
		"inpatient_record": admission or first.get("inpatient_record") or "",
		"admission_no": admission or first.get("inpatient_record") or "",
		"encounter": encounter or first.get("encounter") or "",
		"patient_visit": encounter or first.get("encounter") or "",
	}
	if first.get("cost_center"):
		seed["cost_center"] = first.get("cost_center")
	elif first.get("branch"):
		seed["branch"] = first.get("branch")
	return seed


def _range_note(date_from=None, date_to=None) -> str:
	parts = []
	if date_from:
		parts.append(f"From {fmt_date(date_from, '%d-%m-%Y')}")
	if date_to:
		parts.append(f"To {fmt_date(date_to, '%d-%m-%Y')}")
	if not parts:
		return ""
	return f'<div class="vs-range">{esc(" · ".join(parts))}</div>'


def _display_row(row: dict) -> dict:
	return {
		"date": fmt_date(row.get("signs_date"), "%d-%m-%Y"),
		"time": _time_text(row.get("signs_time")),
		"bp": _bp_text(row),
		"pulse": cstr(row.get("pulse") or "").strip(),
		"temperature": cstr(row.get("temperature") or "").strip(),
		"spo2": cstr(row.get("spo2") or "").strip(),
		"resp_rate": cstr(row.get("respiratory_rate") or "").strip(),
		"weight": cstr(row.get("weight") or "").strip(),
		"staff_nurse": _staff_nurse(row.get("owner")),
	}


def _admission_date(admission: str) -> str:
	if not admission:
		return ""
	try:
		row = frappe.db.get_value(
			"Inpatient Admission",
			admission,
			["admission_date", "admitted_datetime", "scheduled_date"],
			as_dict=True,
		)
	except Exception:
		row = None
	if not row:
		return ""
	return fmt_date(
		row.get("admission_date") or row.get("admitted_datetime") or row.get("scheduled_date"),
		"%d-%m-%Y",
	)


def _tpr_patient_info_html(meta: dict, admission: str = "") -> str:
	"""Patient block matching the sample TPR/VITAL CHART print."""
	pairs = [
		("Patient Name", meta.get("patient_name"), "Date Of Admission", _admission_date(admission)),
		("Patient File No.", meta.get("file_no"), "CASE NO", meta.get("ip_case_no")),
		("CPR / ID No.", meta.get("id_number"), "Sex", meta.get("gender")),
	]
	body = "".join(
		"<tr>"
		f'<td class="np-lbl">{esc(left_lbl)}</td><td class="np-val">{esc(left_val)}</td>'
		f'<td class="np-lbl">{esc(right_lbl)}</td><td class="np-val">{esc(right_val)}</td>'
		"</tr>"
		for left_lbl, left_val, right_lbl, right_val in pairs
	)
	return f'<div class="np-info-wrap"><table class="np-info">{body}</table></div>'


def _table(rows: list[dict], *, show_patient: bool) -> str:
	headers = [label for _, label in _COLUMNS]
	keys = [key for key, _ in _COLUMNS]
	if show_patient:
		headers = ["Patient", *headers]
	head = "".join(f"<th>{esc(h)}</th>" for h in headers)
	body = []
	for row in rows:
		disp = _display_row(row)
		cells = []
		if show_patient:
			cells.append(f"<td>{esc(row.get('patient_name') or row.get('patient') or '')}</td>")
		for k in keys:
			cls = ' class="vs-nurse"' if k == "staff_nurse" else ""
			cells.append(f"<td{cls}>{esc(disp.get(k) or '')}</td>")
		body.append(f"<tr>{''.join(cells)}</tr>")
	if not body:
		colspan = len(headers)
		body.append(f'<tr><td colspan="{colspan}" class="vs-empty">No vital signs found.</td></tr>')
	return f'<table class="vs-table"><thead><tr>{head}</tr></thead><tbody>{"".join(body)}</tbody></table>'


_CSS = f"""
		.vs-range {{
			font-size: 10px;
			color: #444;
			margin: 0 0 8px;
		}}
		.vs-table {{
			width: 100%;
			border-collapse: collapse;
			table-layout: fixed;
		}}
		.vs-table th, .vs-table td {{
			border: 1px solid #444;
			padding: 3px 5px;
			font-size: 10px;
			vertical-align: middle;
			text-align: center;
		}}
		.vs-table th {{
			background: #e8e8e8;
			color: {MAROON} !important;
			font-weight: bold;
		}}
		.vs-table td.vs-nurse {{
			text-align: left;
			white-space: nowrap;
		}}
		.vs-empty {{
			text-align: center;
			padding: 12px;
			font-size: 11px;
		}}
"""


def render_vital_signs_report(
	seed: dict,
	rows: list[dict],
	*,
	date_from=None,
	date_to=None,
) -> str:
	meta = patient_meta(seed)
	admission = (
		seed.get("inpatient_record")
		or seed.get("admission_no")
		or seed.get("admission")
		or seed.get("inpatient_admission")
		or ""
	)
	is_ip = bool(admission)
	patient_block = (
		_tpr_patient_info_html(meta, str(admission))
		if is_ip
		else op_patient_info_html(meta)
	)
	show_patient = not bool(seed.get("patient") or seed.get("file_no"))
	return (
		f'<div class="vs-report">'
		f"{patient_block}"
		f"{_range_note(date_from, date_to)}"
		f"{_table(rows, show_patient=show_patient)}"
		f"</div>"
	)


@frappe.whitelist()
def get_vital_signs_html(
	patient=None,
	admission=None,
	encounter=None,
	date_from=None,
	date_to=None,
	practitioner=None,
):
	assert_nursing_print_permission("Vital Signs")

	rows = _load_rows(
		patient=patient,
		admission=admission,
		encounter=encounter,
		date_from=date_from,
		date_to=date_to,
		practitioner=practitioner,
	)
	if not rows and not (patient or admission or encounter):
		frappe.throw(frappe._("Select a patient or care episode to print vital signs"))

	seed = _build_seed(patient=patient, admission=admission, encounter=encounter, rows=rows)
	body = render_vital_signs_report(seed, rows, date_from=date_from, date_to=date_to)
	return wrap_print_document(
		_TITLE,
		body,
		get_doc_letter_head(seed),
		extra_css=_CSS,
		landscape=True,
	)
