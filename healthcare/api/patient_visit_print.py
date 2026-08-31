"""Patient Visit Detail Report (OP) — Print Report on the visit actions menu."""

from __future__ import annotations

import frappe
from frappe.utils import strip_html

from healthcare.api.nursing_print import (
	MAROON,
	assert_nursing_print_permission,
	esc,
	fmt_date,
	g,
	get_doc_letter_head,
	op_patient_info_html,
	parse_date,
	patient_meta,
	wrap_print_document,
)

_TITLE = "Patient Visit Detail Report"
_BLUE = "#1E4E8C"


def _plain(value) -> str:
	if value in (None, ""):
		return ""
	return strip_html(str(value)).strip()


def _note_html(value) -> str:
	if value in (None, ""):
		return ""
	text = str(value).strip()
	if "<" in text and ">" in text:
		return text
	return esc(text).replace("\n", "<br>")


def _safe_all(doctype: str, **kwargs):
	if not frappe.db.exists("DocType", doctype):
		return []
	kwargs.setdefault("ignore_permissions", True)
	try:
		return frappe.get_all(doctype, **kwargs)
	except Exception:
		return []


def _is_doctor_note(row) -> bool:
	blob = f"{row.get('clinical_note_type') or ''} {row.get('medical_role') or ''}".lower()
	return any(token in blob for token in ("doctor", "physician", "consultant", "psychiatr"))


def _clinical_notes(visit_name: str) -> str:
	rows = _safe_all(
		"Clinical Note",
		filters={"docstatus": ["!=", 2]},
		or_filters=[
			["reference_document", "=", visit_name],
			["reference_name", "=", visit_name],
		],
		fields=["note", "clinical_note_type", "medical_role", "posting_date"],
		order_by="posting_date asc, creation asc",
		limit=40,
	)
	use = [r for r in rows if _is_doctor_note(r)] or rows
	parts = [_note_html(row.get("note")) for row in use]
	return "<br><br>".join(p for p in parts if p)


def _format_diag_rows(rows) -> str:
	items = []
	for i, row in enumerate(rows, 1):
		name = row.get("diagnosis_name") or row.get("diagnosis") or ""
		detail = _plain(row.get("details"))
		line = f"{i}. {esc(name)}"
		if detail:
			line += f" — {esc(detail)}"
		items.append(line)
	return "<br>".join(items)


def _diagnoses(visit_name: str, patient=None, visit_date=None) -> str:
	rows = _safe_all(
		"Medical Diagnosis Entry",
		filters={"visit_num": visit_name},
		fields=["diagnosis", "diagnosis_name", "details", "posting_date"],
		order_by="posting_date asc, creation asc",
		limit=40,
	)
	if not rows:
		rows = _safe_all(
			"Patient Diagnosis",
			filters={"parent": visit_name},
			fields=["diagnosis", "diagnosis_name", "details", "diagnosis_date", "posting_date"],
			order_by="idx asc",
			limit=40,
		)
	if not rows:
		rows = _safe_all(
			"Patient Diagnosis",
			filters={"patient_visit": visit_name},
			fields=["diagnosis", "diagnosis_name", "details", "diagnosis_date", "posting_date"],
			order_by="creation asc",
			limit=40,
		)
	if not rows and patient and visit_date:
		d = parse_date(visit_date)
		if d:
			mde = _safe_all(
				"Medical Diagnosis Entry",
				filters={"patient": patient},
				fields=["diagnosis", "diagnosis_name", "details", "posting_date"],
				order_by="posting_date asc, creation asc",
				limit=80,
			)
			rows = [r for r in mde if parse_date(r.get("posting_date")) == d]
			if not rows:
				rows = _safe_all(
					"Patient Diagnosis",
					filters={"patient": patient, "diagnosis_date": d},
					fields=["diagnosis", "diagnosis_name", "details", "diagnosis_date", "posting_date"],
					order_by="creation asc",
					limit=40,
				)
	return _format_diag_rows(rows) if rows else ""


def _qty_text(value) -> str:
	if value in (None, ""):
		return ""
	try:
		num = float(value)
		if num.is_integer():
			return str(int(num))
		return str(value).rstrip("0").rstrip(".") if "." in str(value) else str(value)
	except (TypeError, ValueError):
		return str(value)


def _med_label(name, form=None, strength=None, unit=None) -> str:
	label = name or ""
	if form:
		label = f"{label} ({form})" if label else str(form)
	if strength:
		unit_bit = f" {unit}" if unit else ""
		label = f"{label} ({strength}{unit_bit})" if label else f"{strength}{unit_bit}"
	return label


def _pmo_names(visit_name: str) -> list[str]:
	orders = _safe_all(
		"Patient Medication Order",
		filters={"patient_encounter": visit_name, "docstatus": ["!=", 2]},
		fields=["name", "is_cancelled"],
		order_by="creation asc",
		limit=50,
	)
	if not orders:
		orders = _safe_all(
			"Patient Medication Order",
			filters={"reference_document_name": visit_name, "docstatus": ["!=", 2]},
			fields=["name", "is_cancelled"],
			order_by="creation asc",
			limit=50,
		)
	if not orders:
		orders = _safe_all(
			"Patient Medication Order",
			filters={"visit_cd": visit_name, "docstatus": ["!=", 2]},
			fields=["name", "is_cancelled"],
			order_by="creation asc",
			limit=50,
		)
	return [r.name for r in orders if not r.get("is_cancelled")]


def _med_rows_from_pmo(visit_name: str) -> list[dict]:
	names = _pmo_names(visit_name)
	if not names:
		return []
	entries = _safe_all(
		"Inpatient Medication Order Entry",
		filters={"parent": ["in", names], "parenttype": "Patient Medication Order"},
		fields=[
			"old_medicine_name",
			"drug_name",
			"medication",
			"drug",
			"dosage",
			"dosage_form",
			"strength",
			"uom",
			"patient_frequency",
			"written_frequency",
			"no_of_days",
			"duration",
			"quantity",
			"instructions",
			"idx",
		],
		order_by="parent asc, idx asc",
	)
	rows = []
	for e in entries:
		name = e.get("old_medicine_name") or e.get("drug_name") or e.get("medication") or e.get("drug") or ""
		rows.append(
			{
				"name": _med_label(name, e.get("dosage_form"), e.get("strength"), e.get("uom")),
				"dose": e.get("dosage") or "",
				"frequency": e.get("written_frequency") or e.get("patient_frequency") or "",
				"days": _qty_text(e.get("no_of_days") or e.get("duration")),
				"qty": _qty_text(e.get("quantity")),
				"note": e.get("instructions") or "",
			}
		)
	return rows


def _med_rows_from_pvp(visit_name: str) -> list[dict]:
	headers = _safe_all(
		"Patient Visit Prescription",
		filters={"patient_visit": visit_name},
		fields=["name"],
		limit=20,
	)
	if not headers:
		headers = _safe_all(
			"Patient Visit Prescription",
			filters={"visit_cd": visit_name},
			fields=["name"],
			limit=20,
		)
	names = [r.name for r in headers]
	if not names:
		return []
	entries = _safe_all(
		"Patient Visit Prescription Item",
		filters={"parent": ["in", names]},
		fields=[
			"old_medicine_name",
			"medicine_code",
			"strength",
			"unit",
			"written_frequency",
			"patient_frequency",
			"duration",
			"qty",
			"quantity",
			"note",
			"idx",
		],
		order_by="parent asc, idx asc",
	)
	rows = []
	for e in entries:
		name = e.get("old_medicine_name") or e.get("medicine_code") or ""
		rows.append(
			{
				"name": _med_label(name, None, e.get("strength"), e.get("unit")),
				"dose": "",
				"frequency": e.get("written_frequency") or e.get("patient_frequency") or "",
				"days": _qty_text(e.get("duration")),
				"qty": _qty_text(e.get("qty") if e.get("qty") not in (None, "") else e.get("quantity")),
				"note": e.get("note") or "",
			}
		)
	return rows


def _medicines(visit_name: str) -> list[dict]:
	return _med_rows_from_pmo(visit_name) or _med_rows_from_pvp(visit_name)


def _lab_result_text(lab_name: str) -> str:
	results = _safe_all(
		"Normal Test Result",
		filters={"parent": lab_name, "parenttype": "Lab Test"},
		fields=["lab_test_name", "result_value", "lab_test_uom"],
		order_by="idx asc",
		limit=30,
	)
	bits = []
	for r in results:
		if r.get("result_value") in (None, ""):
			continue
		uom = f" {r.get('lab_test_uom')}" if r.get("lab_test_uom") else ""
		label = r.get("lab_test_name") or ""
		bits.append(f"{label}: {r.get('result_value')}{uom}".strip(": "))
	return "; ".join(bits)


def _labs(visit_name: str) -> list[dict]:
	out = []
	seen = set()

	labs = _safe_all(
		"Lab Test",
		filters={"patient_visit": visit_name, "docstatus": ["!=", 2]},
		fields=["name", "lab_test_name", "template", "result_date", "date"],
		order_by="creation asc",
		limit=80,
	)
	if not labs:
		labs = _safe_all(
			"Lab Test",
			filters={"reference_document": visit_name, "docstatus": ["!=", 2]},
			fields=["name", "lab_test_name", "template", "result_date", "date"],
			order_by="creation asc",
			limit=80,
		)
	for lab in labs:
		title = lab.get("lab_test_name") or lab.get("template") or lab.get("name")
		key = (str(title).strip().lower(), str(lab.get("template") or "").strip().lower())
		seen.add(key)
		out.append(
			{
				"name": title,
				"date": fmt_date(lab.get("result_date") or lab.get("date")),
				"result": _lab_result_text(lab.name),
			}
		)

	for row in _safe_all(
		"Lab Prescription",
		filters={"parent": visit_name, "parenttype": "Patient Visit"},
		fields=["lab_test_name", "lab_test_code", "lab_test_comment"],
		order_by="idx asc",
		limit=80,
	):
		title = row.get("lab_test_name") or row.get("lab_test_code") or ""
		key = (str(title).strip().lower(), str(row.get("lab_test_code") or "").strip().lower())
		if not title or key in seen:
			continue
		seen.add(key)
		out.append(
			{
				"name": title,
				"date": "",
				"result": row.get("lab_test_comment") or "",
			}
		)

	for sr in _safe_all(
		"Service Request",
		filters={"patient_visit": visit_name, "docstatus": ["!=", 2]},
		fields=["template_dt", "template_dn", "order_date"],
		order_by="creation asc",
		limit=80,
	):
		template_dt = str(sr.get("template_dt") or "")
		if "lab" not in template_dt.lower() and "observation" not in template_dt.lower():
			continue
		title = sr.get("template_dn") or ""
		key = (str(title).strip().lower(), "")
		if not title or key in seen or (str(title).strip().lower(), str(title).strip().lower()) in seen:
			continue
		seen.add(key)
		out.append(
			{
				"name": title,
				"date": fmt_date(sr.get("order_date")),
				"result": "",
			}
		)
	return out


def _section(title: str, inner: str) -> str:
	if not (inner or "").strip():
		return ""
	return f'<div class="pvr-bar">{esc(title)}</div><div class="pvr-block">{inner}</div>'


def _med_table(rows: list[dict]) -> str:
	if not rows:
		return ""
	head = "".join(
		f"<th>{esc(h)}</th>"
		for h in ("Sr. No.", "Medicine Name", "Dose", "Frequency", "Days", "Qty", "Medicine Note")
	)
	body = []
	for i, row in enumerate(rows, 1):
		body.append(
			"<tr>"
			f'<td class="pvr-c">{i}</td>'
			f'<td>{esc(row.get("name"))}</td>'
			f'<td class="pvr-c">{esc(row.get("dose"))}</td>'
			f'<td class="pvr-c">{esc(row.get("frequency"))}</td>'
			f'<td class="pvr-c">{esc(row.get("days"))}</td>'
			f'<td class="pvr-c">{esc(row.get("qty"))}</td>'
			f'<td>{esc(row.get("note"))}</td>'
			"</tr>"
		)
	return (
		'<div class="pvr-bar">Medication</div>'
		f'<table class="pvr-table"><thead><tr>{head}</tr></thead>'
		f'<tbody>{"".join(body)}</tbody></table>'
	)


def _lab_table(rows: list[dict]) -> str:
	if not rows:
		return ""
	head = "".join(f"<th>{esc(h)}</th>" for h in ("Sr. No.", "Lab Test", "Date", "Result"))
	body = []
	for i, row in enumerate(rows, 1):
		body.append(
			"<tr>"
			f'<td class="pvr-c">{i}</td>'
			f'<td>{esc(row.get("name"))}</td>'
			f'<td class="pvr-c">{esc(row.get("date"))}</td>'
			f'<td>{esc(row.get("result"))}</td>'
			"</tr>"
		)
	return (
		'<div class="pvr-bar">Lab Tests</div>'
		f'<table class="pvr-table"><thead><tr>{head}</tr></thead>'
		f'<tbody>{"".join(body)}</tbody></table>'
	)


_CSS = f"""
		.pvr-report {{ font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 11px; width: 100%; }}
		.pvr-bar {{
			background: #e8e8e8;
			color: {MAROON} !important;
			font-weight: bold;
			text-align: center;
			padding: 4px 6px;
			margin: 10px 0 6px;
			border: 1px solid #ccc;
			font-size: 13px;
		}}
		.pvr-meta {{
			width: 100%;
			border-collapse: collapse;
			margin: 4px 0 8px;
		}}
		.pvr-meta td {{ padding: 2px 6px 6px 0; font-size: 11px; vertical-align: top; }}
		.pvr-mlbl {{ color: {_BLUE} !important; font-weight: bold; white-space: nowrap; }}
		.pvr-obs-title {{
			color: {_BLUE} !important;
			font-weight: bold;
			text-decoration: underline;
			margin: 4px 0 6px;
		}}
		.pvr-block {{ padding: 2px 2px 8px; font-size: 11px; line-height: 1.45; }}
		.pvr-table {{ width: 100%; border-collapse: collapse; margin-bottom: 8px; }}
		.pvr-table th, .pvr-table td {{
			border: 1px solid #666;
			padding: 4px 5px;
			font-size: 10px;
			vertical-align: top;
		}}
		.pvr-table th {{
			background: #e8e8e8;
			text-align: center;
			font-weight: bold;
		}}
		.pvr-c {{ text-align: center; }}
"""


def render_patient_visit_report(visit):
	if isinstance(visit, str):
		visit = frappe.get_doc("Patient Visit", visit)
	visit_name = visit.name
	patient = g(visit, "patient")
	seed = {
		"file_no": patient,
		"patient": patient,
		"patient_name": g(visit, "patient_name"),
		"cost_center": g(visit, "cost_center"),
	}
	meta = patient_meta(seed)
	doctor = g(visit, "practitioner_name") or g(visit, "practitioner") or ""
	if g(visit, "practitioner") and not g(visit, "practitioner_name"):
		doctor = (
			frappe.db.get_value("Healthcare Practitioner", visit.practitioner, "practitioner_name")
			or doctor
		)
	branch = g(visit, "cost_center") or ""
	observation = _clinical_notes(visit_name) or _note_html(g(visit, "encounter_comment"))
	diagnosis = _diagnoses(visit_name, patient, g(visit, "encounter_date"))
	meds = _medicines(visit_name)
	labs = _labs(visit_name)

	meta_row = (
		'<table class="pvr-meta"><tr>'
		f'<td><span class="pvr-mlbl">Visit Date:</span> {esc(fmt_date(g(visit, "encounter_date"), "%d-%m-%y"))}</td>'
		f'<td><span class="pvr-mlbl">Doctor Name:</span> {esc(doctor)}</td>'
		f'<td><span class="pvr-mlbl">Branch:</span> {esc(branch)}</td>'
		"</tr></table>"
	)
	obs = (
		f'<div class="pvr-obs-title">Observation:</div>'
		f'<div class="pvr-block">{observation or "&nbsp;"}</div>'
	)

	body = (
		f'<div class="pvr-report">'
		f"{op_patient_info_html(meta)}"
		f'<div class="pvr-bar">Visit Details</div>'
		f"{meta_row}"
		f"{obs}"
		f"{_section('Diagnosis', diagnosis)}"
		f"{_med_table(meds)}"
		f"{_lab_table(labs)}"
		f"</div>"
	)
	return body, visit


@frappe.whitelist()
def get_patient_visit_report_html(name=None):
	assert_nursing_print_permission("Patient Visit")
	name = (name or "").strip()
	if not name or not frappe.db.exists("Patient Visit", name):
		frappe.throw(frappe._("Patient Visit is required"))
	visit = frappe.get_doc("Patient Visit", name)
	body, doc = render_patient_visit_report(visit)
	return wrap_print_document(
		_TITLE,
		body,
		get_doc_letter_head(doc),
		extra_css=_CSS,
		landscape=False,
	)
