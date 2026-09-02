"""TPR / Vital Signs listing PDF — branch letter head + shared patient header."""

from __future__ import annotations

import frappe
from frappe.utils import cstr

from healthcare.api.nursing_print import (
	MAROON,
	assert_nursing_print_permission,
	esc,
	fmt_date,
	fmt_time,
	get_doc_letter_head,
	op_patient_info_html,
	patient_info_html,
	patient_meta,
	wrap_print_document,
)

_TITLE = "TPR / Vital Signs"

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
	"bmi",
	"vital_signs_note",
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


def _datetime_text(row: dict) -> str:
	date_part = fmt_date(row.get("signs_date"), "%d-%m-%Y")
	time_part = fmt_time(row.get("signs_time"))
	return " ".join(part for part in (date_part, time_part) if part)


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

	rows = frappe.get_all(
		"Vital Signs",
		filters=filters,
		fields=_ROW_FIELDS,
		order_by="signs_date desc, signs_time desc",
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


def _table(rows: list[dict], *, show_patient: bool) -> str:
	headers = ["Date & Time"]
	if show_patient:
		headers.append("Patient")
	headers.extend(["Temp", "Pulse", "BP", "RR", "SPO2", "Weight", "BMI", "Record"])
	head = "".join(f"<th>{esc(h)}</th>" for h in headers)
	body = []
	for row in rows:
		cells = [f"<td>{esc(_datetime_text(row))}</td>"]
		if show_patient:
			cells.append(f"<td>{esc(row.get('patient_name') or row.get('patient') or '')}</td>")
		cells.extend(
			[
				f"<td>{esc(row.get('temperature'))}</td>",
				f"<td>{esc(row.get('pulse'))}</td>",
				f"<td>{esc(_bp_text(row))}</td>",
				f"<td>{esc(row.get('respiratory_rate'))}</td>",
				f"<td>{esc(row.get('spo2'))}</td>",
				f"<td>{esc(row.get('weight'))}</td>",
				f"<td>{esc(row.get('bmi'))}</td>",
				f"<td>{esc(row.get('trans_no') or row.get('name') or '')}</td>",
			]
		)
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
			table-layout: auto;
		}}
		.vs-table th, .vs-table td {{
			border: 1px solid #444;
			padding: 4px 6px;
			font-size: 10px;
			vertical-align: top;
		}}
		.vs-table th {{
			background: #e8e8e8;
			color: {MAROON} !important;
			font-weight: bold;
			text-align: center;
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
	is_ip = bool(
		seed.get("inpatient_record")
		or seed.get("admission_no")
		or seed.get("admission")
		or seed.get("inpatient_admission")
	)
	patient_block = patient_info_html(meta) if is_ip else op_patient_info_html(meta)
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
