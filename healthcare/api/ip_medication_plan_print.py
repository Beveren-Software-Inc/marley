"""IP Patient Medication Plan — current medicines for an admission (all active signed PMOs)."""

from __future__ import annotations

import frappe
from frappe.utils import cint, cstr, getdate, now_datetime

from healthcare.api.lab_reports_common import branch_label, letter_head_seed
from healthcare.api.medication_chart import _get_current_inpatient_medication_orders
from healthcare.api.nursing_print import (
	MAROON,
	assert_nursing_print_permission,
	esc,
	fmt_date,
	get_doc_letter_head,
	wrap_print_document,
)

_TITLE = "IP Patient Medication Plan"
_BLUE = "#1E4E8C"


def _short_user(value) -> str:
	if value in (None, ""):
		return ""
	raw = cstr(value).strip()
	if not raw or raw.lower() in ("none", "null"):
		return ""
	if "@" in raw:
		return raw.split("@")[0].split(".")[0].upper()
	token = raw.split()[0] if " " in raw else raw
	try:
		if frappe.db.exists("User", raw):
			full = frappe.db.get_value("User", raw, "full_name") or raw
			token = cstr(full).strip().split()[0] if cstr(full).strip() else raw
	except Exception:
		pass
	return token.upper() if token else ""


def _medicine_label(entry: dict) -> str:
	parts = []
	name = cstr(entry.get("drug_name") or entry.get("medication") or entry.get("drug") or "").strip()
	if name:
		parts.append(name.upper())
	form = cstr(entry.get("dosage_form") or "").strip()
	if form:
		parts.append(f"({form.upper()})")
	strength = cstr(entry.get("strength") or entry.get("dosage") or "").strip()
	if strength:
		parts.append(f"({strength})")
	return " ".join(parts)


def _is_active_line(entry: dict) -> bool:
	status = cstr(entry.get("medication_status") or "").strip()
	if cint(entry.get("stopped")):
		return False
	if cstr(entry.get("reason_stopped") or "").strip():
		return False
	if status in ("Discontinued", "On Hold"):
		return False
	return True


def _plan_rows(admission: str) -> list[dict]:
	pmos = _get_current_inpatient_medication_orders(admission)
	if not pmos:
		return []

	pmo_by_name = {row.name: row for row in pmos}
	pmo_names = list(pmo_by_name.keys())
	entries = frappe.get_all(
		"Inpatient Medication Order Entry",
		filters={"parent": ["in", pmo_names]},
		fields=[
			"name",
			"parent",
			"idx",
			"drug",
			"drug_name",
			"medication",
			"dosage",
			"strength",
			"dosage_form",
			"route_of_administration",
			"patient_frequency",
			"date",
			"end_date",
			"instructions",
			"reason_stopped",
			"medication_status",
			"stopped",
			"up_id",
			"up_date",
			"cr_id",
			"cr_date",
			"owner",
			"modified",
		],
		order_by="parent asc, idx asc",
	)

	rows = []
	for entry in entries:
		if not cstr(entry.get("drug") or "").strip():
			continue
		if not _is_active_line(entry):
			continue
		pmo = pmo_by_name.get(entry.parent) or {}
		start = entry.get("date") or pmo.get("start_date")
		end = entry.get("end_date") or pmo.get("end_date")
		entered_by = _short_user(entry.get("up_id") or entry.get("cr_id") or entry.get("owner"))
		rows.append(
			{
				"medicine_name": _medicine_label(entry),
				"dose": cstr(entry.get("dosage") or entry.get("strength") or "").strip(),
				"route": cstr(entry.get("route_of_administration") or "").strip().upper(),
				"frequency": cstr(entry.get("patient_frequency") or "").strip().upper(),
				"start_date": fmt_date(start, "%d-%m-%y"),
				"end_date": fmt_date(end, "%d-%m-%y"),
				"entered_by": entered_by,
				"dc_remarks": cstr(entry.get("reason_stopped") or entry.get("instructions") or "").strip(),
			}
		)
	return rows


def _admission_meta(admission: str) -> dict:
	row = frappe.db.get_value(
		"Inpatient Admission",
		admission,
		["name", "case_no", "patient", "patient_name", "cost_center"],
		as_dict=True,
	) or {}
	case_no = cstr(row.get("case_no") or row.get("name") or admission).strip()
	patient_name = cstr(row.get("patient_name") or "").strip()
	if not patient_name and row.get("patient"):
		patient_name = cstr(frappe.db.get_value("Patient", row.patient, "patient_name") or "").strip()
	return {
		"ip_case_no": case_no,
		"patient_name": patient_name,
		"cost_center": cstr(row.get("cost_center") or "").strip(),
	}


def _table(rows: list[dict]) -> str:
	headers = (
		"Medicine Name",
		"Dose",
		"Route",
		"Freq.",
		"Start Date",
		"End Date",
		"Entered By Last Update",
		"DC Remarks",
	)
	head = "".join(f"<th>{esc(h)}</th>" for h in headers)
	body = []
	for row in rows:
		body.append(
			"<tr>"
			f'<td class="med-name">{esc(row.get("medicine_name"))}</td>'
			f"<td>{esc(row.get('dose'))}</td>"
			f"<td>{esc(row.get('route'))}</td>"
			f"<td>{esc(row.get('frequency'))}</td>"
			f"<td>{esc(row.get('start_date'))}</td>"
			f"<td>{esc(row.get('end_date'))}</td>"
			f"<td>{esc(row.get('entered_by'))}</td>"
			f'<td class="remarks">{esc(row.get("dc_remarks"))}</td>'
			"</tr>"
		)
	if not body:
		body.append(
			f'<tr><td colspan="{len(headers)}" class="imp-empty">No active medicines on current prescription.</td></tr>'
		)
	return (
		f'<table class="imp-table"><thead><tr>{head}</tr></thead>'
		f'<tbody>{"".join(body)}</tbody></table>'
	)


_CSS = f"""
		.imp-meta {{
			font-size: 11px;
			margin: 0 0 8px;
			line-height: 1.5;
		}}
		.imp-meta span {{ color: {_BLUE} !important; font-weight: bold; }}
		.imp-table {{ width: 100%; border-collapse: collapse; table-layout: auto; }}
		.imp-table th, .imp-table td {{
			border: 1px solid #444;
			padding: 3px 5px;
			font-size: 9px;
			vertical-align: top;
		}}
		.imp-table th {{
			background: #e8e8e8;
			color: {MAROON} !important;
			font-weight: bold;
			text-align: center;
		}}
		.imp-table td.med-name {{ white-space: normal; min-width: 160px; font-weight: bold; }}
		.imp-table td.remarks {{ white-space: normal; min-width: 100px; }}
		.imp-empty {{ text-align: center; padding: 12px; font-size: 11px; }}
		.imp-footer {{
			margin-top: 14px;
			text-align: center;
			font-size: 10px;
			color: #444;
		}}
"""


@frappe.whitelist()
def get_ip_medication_plan_html(inpatient_record=None, patient_encounter=None):
	assert_nursing_print_permission("Patient Medication Order")
	admission = (inpatient_record or "").strip()
	if not admission:
		frappe.throw("Inpatient Admission is required for IP Patient Medication Plan")
	if patient_encounter:
		# IP plan is admission-scoped; ignore OP visit when admission is set.
		pass

	meta = _admission_meta(admission)
	rows = _plan_rows(admission)
	branch = branch_label(meta.get("cost_center"))
	printed = now_datetime().strftime("%A %B %d %Y %I:%M %p")
	meta_html = (
		'<div class="imp-meta">'
		f'<div><span>IP Case No.</span> {esc(meta.get("ip_case_no"))}</div>'
		f'<div>{esc(printed)}</div>'
	)
	if branch:
		meta_html += f'<div><span>Branch:</span> {esc(branch)}</div>'
	meta_html += (
		f'<div><span>Patient Name:</span> {esc(meta.get("patient_name"))}</div>'
		"</div>"
	)
	body = f'<div class="imp-report">{meta_html}{_table(rows)}<div class="imp-footer">&lt;&lt;&lt;&lt; End of Report &gt;&gt;&gt;&gt;</div></div>'
	seed = letter_head_seed(meta.get("cost_center"))
	seed["inpatient_admission"] = admission
	seed["admission"] = admission
	seed["patient_name"] = meta.get("patient_name")
	return wrap_print_document(
		_TITLE,
		body,
		get_doc_letter_head(seed),
		extra_css=_CSS,
		landscape=True,
	)
