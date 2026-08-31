"""IP Nursing Care Plan PDF (My Tasks PDF button).

One page per date with three shift rows (Morning / Evening / Night).
Each cell is filled from the matching nursing record for that patient/admission/day.
"""

from __future__ import annotations

from datetime import timedelta

import frappe
from frappe.utils import flt, get_datetime, getdate

from healthcare.api.mental_state_print import _MS_FIELDS, _shift_label, care_plan_mental_html
from healthcare.api.nursing_print import (
	MAROON,
	assert_nursing_print_permission,
	esc,
	fmt_date,
	fmt_time,
	form_footer_html,
	get_doc_letter_head,
	normalize_shift,
	parse_date,
	parse_datetime,
	patient_info_html,
	patient_meta,
	shift_from_hour,
	wrap_print_document,
)

_FORM_CODE = "SPHMD/N/NCP"
_TITLE = "Nursing Care Plan"
_SHIFTS = ("Morning", "Evening", "Night")
_BLUE = "#1E4E8C"

_GROOMING_FIELDS = [
	"name",
	"date",
	"admission_no",
	"file_no",
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
]


def _on(value) -> bool:
	if value in (None, "", 0, "0", False, "None"):
		return False
	text = str(value).strip().upper()
	return text not in {"N", "NO", "FALSE"}


def _hour_from_time(value) -> int | None:
	if value in (None, ""):
		return None
	if isinstance(value, timedelta):
		return int(value.total_seconds()) // 3600 % 24
	dt = parse_datetime(value)
	if dt and hasattr(dt, "hour"):
		return dt.hour
	text = str(value).strip()
	if " " in text:
		text = text.split(" ")[-1]
	if "." in text:
		text = text.split(".")[0]
	parts = text.split(":")
	try:
		return int(parts[0])
	except (TypeError, ValueError):
		return None


def _shift_of(value, trans_shift=None) -> str:
	label = normalize_shift(trans_shift) if trans_shift not in (None, "") else ""
	if label:
		return label
	return shift_from_hour(_hour_from_time(value))


def _same_day(value, report_date) -> bool:
	d = parse_date(value)
	rd = parse_date(report_date)
	if not d or not rd:
		return False
	return d == rd


def _stack(lines: list[str]) -> str:
	return "<br>".join(x for x in lines if x)


def _yes_no(flag, label) -> str:
	return f"{esc(label)}: {'Yes' if _on(flag) else 'No'}"


def _resolve_admission(patient=None, admission=None) -> str:
	admission = (admission or "").strip()
	if admission:
		return admission
	patient = (patient or "").strip()
	if not patient:
		return ""
	row = frappe.get_all(
		"Inpatient Admission",
		filters={"patient": patient, "status": ["in", ["Admitted", "Admission Scheduled", "Discharge Scheduled"]]},
		pluck="name",
		order_by="modified desc",
		limit=1,
	)
	return row[0] if row else ""


def _seed_doc(patient, admission):
	"""Minimal doc for letter head + patient meta."""
	adm = {}
	if admission and frappe.db.exists("Inpatient Admission", admission):
		adm = (
			frappe.db.get_value(
				"Inpatient Admission",
				admission,
				["name", "patient", "patient_name", "cost_center", "case_no", "admission_no_old"],
				as_dict=True,
			)
			or {}
		)
	return {
		"file_no": patient or adm.get("patient"),
		"patient": patient or adm.get("patient"),
		"patient_name": adm.get("patient_name"),
		"admission_no": admission or adm.get("name"),
		"admission": admission or adm.get("name"),
		"inpatient_admission": admission or adm.get("name"),
		"cost_center": adm.get("cost_center"),
		"admission_no_old": adm.get("admission_no_old"),
	}


def _medicines(admission, report_date) -> dict[str, list[str]]:
	out = {s: [] for s in _SHIFTS}
	if not admission:
		return out
	detail = frappe.db.get_value("Admission Detail", {"admission": admission}, "name")
	if not detail:
		return out
	from healthcare.api.medicine_given import _medicine_given_list_fields

	rows = frappe.get_all(
		"Medicine Given",
		filters={"parent": detail, "parenttype": "Admission Detail"},
		fields=_medicine_given_list_fields(),
		order_by="time asc, modified asc",
		limit=400,
		ignore_permissions=True,
	)
	n = {s: 0 for s in _SHIFTS}
	for row in rows:
		if not _same_day(row.get("date"), report_date):
			continue
		shift = _shift_of(row.get("time") or row.get("date"))
		if shift not in out:
			shift = "Morning"
		n[shift] += 1
		name = row.get("medicine_name") or row.get("medicine_code") or ""
		dose = row.get("dose") or row.get("qty") or ""
		unit = row.get("unit") or ""
		freq = row.get("frequency") or row.get("medicine_given_timing") or ""
		note = (row.get("dose_notes") or "").strip()
		dose_txt = f"{dose} {unit}".strip()
		lines = [esc(f"{n[shift]}- {name}")]
		if dose_txt:
			lines.append(esc(f"Dose: {dose_txt}"))
		if freq:
			lines.append(esc(f"Frequency: {freq}"))
		if note:
			lines.append(esc(f"Dose Note: {note}"))
		out[shift].append("<br>".join(lines))
	return out


def _doctor_orders(patient, admission, report_date) -> dict[str, list[str]]:
	out = {s: [] for s in _SHIFTS}
	filters = {}
	if admission:
		filters["inpatient_admission"] = admission
	elif patient:
		filters["patient"] = patient
	else:
		return out
	rows = frappe.get_all(
		"Doctor Order",
		filters=filters,
		fields=["doctor_order", "trans_date", "doctor_entry_date", "doctor_name", "status"],
		order_by="trans_date asc, creation asc",
		limit=200,
		ignore_permissions=True,
	)
	for row in rows:
		when = row.get("trans_date") or row.get("doctor_entry_date")
		if not _same_day(when, report_date):
			continue
		text = (row.get("doctor_order") or "").strip()
		if not text:
			continue
		shift = _shift_of(when)
		if shift not in out:
			shift = "Morning"
		who = row.get("doctor_name") or ""
		block = esc(text).replace("\n", "<br>")
		if who:
			block = f"<b>{esc(who)}</b><br>{block}"
		out[shift].append(block)
	return out


def _mental_states(patient, admission, report_date) -> dict[str, str]:
	out = {s: "" for s in _SHIFTS}
	filters = {}
	if admission:
		filters["admission_no"] = admission
	elif patient:
		filters["file_no"] = patient
	else:
		return out
	rows = frappe.get_all(
		"Mental State",
		filters=filters,
		fields=_MS_FIELDS,
		order_by="creation asc",
		limit=200,
		ignore_permissions=True,
	)
	picked = {}
	for row in rows:
		if not _same_day(row.get("creation"), report_date):
			continue
		shift = _shift_label(row) or _shift_of(row.get("creation"), row.get("trans_shift"))
		if shift in _SHIFTS:
			picked[shift] = row
	for shift, row in picked.items():
		out[shift] = care_plan_mental_html(row)
	return out


def _grooming(patient, admission, report_date) -> dict | None:
	filters = []
	if admission:
		filters = {"admission_no": admission}
	elif patient:
		filters = {"file_no": patient}
	else:
		return None
	rows = frappe.get_all(
		"IP Grooming Chart",
		filters=filters,
		fields=_GROOMING_FIELDS,
		order_by="date desc, creation desc",
		limit=80,
		ignore_permissions=True,
	)
	for row in rows:
		if _same_day(row.get("date"), report_date):
			return row
	return None


def _appetite_for_shift(grooming, shift: str) -> str:
	if not grooming:
		return ""
	if shift == "Morning":
		return _stack([_yes_no(grooming.get("breakfast"), "Breakfast"), _yes_no(grooming.get("snack_1"), "Snack")])
	if shift == "Evening":
		return _stack([_yes_no(grooming.get("lunch"), "Lunch"), _yes_no(grooming.get("snack_2"), "Snack")])
	return _stack([_yes_no(grooming.get("dinner"), "Dinner"), _yes_no(grooming.get("snack_3"), "Snack")])


def _hygiene_for_shift(grooming, shift: str) -> str:
	if not grooming:
		return ""
	items = []
	if shift == "Morning":
		if _on(grooming.get("brush_teeth_morning")):
			items.append("Teeth Brush")
		if _on(grooming.get("change_clothes_morning")):
			items.append("Change Cloth")
	elif shift == "Evening":
		if _on(grooming.get("brush_teeth_noon")):
			items.append("Teeth Brush")
		if _on(grooming.get("change_clothes_noon")):
			items.append("Change Cloth")
		if _on(grooming.get("shower")):
			items.append("Shower")
	else:
		if _on(grooming.get("shower")):
			items.append("Shower")
	return _stack([esc(x) for x in items])


def _bowel_bed(grooming) -> str:
	if not grooming:
		return ""
	items = []
	if _on(grooming.get("bowel")):
		items.append("Bowel Movement")
	if _on(grooming.get("bed_wetting")):
		items.append("Bed Wetting")
	return _stack([esc(x) for x in items])


def _hours_between(start, end):
	if not start or not end:
		return None
	try:
		start_dt = get_datetime(start)
		end_dt = get_datetime(end)
		seconds = (end_dt - start_dt).total_seconds()
		if seconds < 0:
			seconds += 24 * 60 * 60
		if seconds <= 0:
			return None
		return flt(seconds / 3600.0, 2)
	except Exception:
		return None


def _sleep_hours(patient, admission, report_date) -> dict[str, str]:
	out = {s: "" for s in _SHIFTS}
	filters = {}
	if admission:
		filters["admission_no"] = admission
	elif patient:
		filters["file_no"] = patient
	else:
		return out
	rows = frappe.get_all(
		"Sleeping Pattern",
		filters=filters,
		fields=[
			"date",
			"morning_from",
			"morning_to",
			"evening_from",
			"evening_to",
			"night_from",
			"night_to",
		],
		order_by="date desc",
		limit=40,
		ignore_permissions=True,
	)
	row = next((r for r in rows if _same_day(r.get("date"), report_date)), None)
	if not row:
		return out
	mapping = {
		"Morning": _hours_between(row.get("morning_from"), row.get("morning_to")),
		"Evening": _hours_between(row.get("evening_from"), row.get("evening_to")),
		"Night": _hours_between(row.get("night_from"), row.get("night_to")),
	}
	for shift, hours in mapping.items():
		if hours not in (None, 0, 0.0):
			out[shift] = f"{hours:.2f}"
	return out


def _nursing_notes(patient, admission, report_date) -> tuple[dict[str, str], dict[str, str]]:
	notes = {s: "" for s in _SHIFTS}
	signatures = {s: "" for s in _SHIFTS}
	filters = {}
	if admission:
		filters["admission"] = admission
	elif patient:
		filters["file_no"] = patient
	else:
		return notes, signatures
	rows = frappe.get_all(
		"Main Nursing Note",
		filters=filters,
		fields=[
			"name",
			"date",
			"shift",
			"nursing_notes",
			"user",
			"user_name",
			"last_appended_by_name",
		],
		order_by="creation asc",
		limit=80,
		ignore_permissions=True,
	)
	names = [r.name for r in rows if _same_day(r.get("date"), report_date)]
	entry_map = {}
	if names:
		for entry in frappe.get_all(
			"Main Nursing Note Entry",
			filters={"parent": ["in", names], "parenttype": "Main Nursing Note"},
			fields=["parent", "note", "note_time", "idx"],
			order_by="parent asc, idx asc",
			ignore_permissions=True,
		):
			entry_map.setdefault(entry.parent, []).append(entry)

	for row in rows:
		if not _same_day(row.get("date"), report_date):
			continue
		shift = normalize_shift(row.get("shift")) or "Morning"
		if shift not in notes:
			continue
		lines = []
		for entry in entry_map.get(row.name, []):
			t = fmt_time(entry.get("note_time")) or ""
			text = (entry.get("note") or "").strip()
			if not text:
				continue
			lines.append(esc(f"{t} - {text}" if t else text))
		if not lines and row.get("nursing_notes"):
			lines.append(esc(row.get("nursing_notes")).replace("\n", "<br>"))
		if lines:
			existing = notes[shift]
			notes[shift] = (existing + "<br>" if existing else "") + "<br>".join(lines)
		sig = row.get("last_appended_by_name") or row.get("user_name") or ""
		if sig:
			signatures[shift] = str(sig).upper()
	return notes, signatures


def _session_nurse() -> str:
	name = frappe.db.get_value("User", frappe.session.user, "full_name")
	return str(name or frappe.session.user or "").upper()


def _td(html, extra="") -> str:
	cls = f' class="{extra}"' if extra else ""
	return f"<td{cls}>{html or '&nbsp;'}</td>"


def _plan_table(shifts_data: dict, report_date) -> str:
	headers = [
		"Shift",
		"Medicines",
		"Doctor Orders",
		"Mental State",
		"Appetite",
		"Sleep(Hours)",
		"Hygiene",
		"Bowel Mov./Bed Wetting",
		"Nursing Notes",
		"Signature",
	]
	head = "".join(f"<th>{esc(h)}</th>" for h in headers)
	body = []
	for shift in _SHIFTS:
		row = shifts_data[shift]
		body.append(
			"<tr>"
			+ _td(esc(shift.upper()), "ncp-shift")
			+ _td(row["medicines"], "ncp-cell")
			+ _td(row["orders"], "ncp-cell")
			+ _td(row["mental"], "ncp-cell")
			+ _td(row["appetite"], "ncp-c")
			+ _td(row["sleep"], "ncp-c")
			+ _td(row["hygiene"], "ncp-cell")
			+ _td(row["bowel"], "ncp-c")
			+ _td(row["notes"], "ncp-cell")
			+ _td(esc(row["signature"]), "ncp-sig")
			+ "</tr>"
		)
	date_label = fmt_date(report_date, "%d-%m-%y")
	return f"""
	<div class="ncp-date">{esc(date_label)}</div>
	<table class="ncp-table">
		<thead><tr>{head}</tr></thead>
		<tbody>{''.join(body)}</tbody>
	</table>
	"""


_NCP_CSS = f"""
		.ncp-report {{
			font-family: Arial, Helvetica, sans-serif;
			color: #000;
			font-size: 10px;
			width: 100%;
			-webkit-print-color-adjust: exact !important;
			print-color-adjust: exact !important;
		}}
		.ncp-date {{
			display: inline-block;
			border: 1px solid #000;
			color: {MAROON} !important;
			font-weight: bold;
			font-size: 12px;
			padding: 2px 10px;
			margin: 0 0 6px;
		}}
		.ncp-table {{
			width: 100%;
			border-collapse: collapse;
			table-layout: fixed;
		}}
		.ncp-table th, .ncp-table td {{
			border: 1px solid #666;
			padding: 4px 4px;
			font-size: 9px;
			vertical-align: top;
		}}
		.ncp-table th {{
			color: {_BLUE} !important;
			font-weight: bold;
			text-align: center;
			background: #fff;
		}}
		.ncp-shift {{
			color: {_BLUE} !important;
			font-weight: bold;
			text-align: center;
			vertical-align: middle !important;
			width: 7%;
		}}
		.ncp-cell {{ text-align: left; }}
		.ncp-c {{ text-align: center; }}
		.ncp-sig {{
			color: {_BLUE} !important;
			font-weight: bold;
			text-align: center;
			vertical-align: middle !important;
			width: 8%;
		}}
"""


def render_nursing_care_plan(patient=None, admission=None, report_date=None):
	report_date = parse_date(report_date) or getdate()
	admission = _resolve_admission(patient, admission)
	patient = (patient or "").strip()
	if not patient and admission:
		patient = frappe.db.get_value("Inpatient Admission", admission, "patient") or ""

	seed = _seed_doc(patient, admission)
	grooming = _grooming(patient, admission, report_date)
	meds = _medicines(admission, report_date)
	orders = _doctor_orders(patient, admission, report_date)
	mental = _mental_states(patient, admission, report_date)
	sleep = _sleep_hours(patient, admission, report_date)
	notes, signatures = _nursing_notes(patient, admission, report_date)
	self_sig = _session_nurse()
	bowel = _bowel_bed(grooming)

	shifts_data = {}
	for shift in _SHIFTS:
		shifts_data[shift] = {
			"medicines": _stack(meds.get(shift) or []),
			"orders": _stack(orders.get(shift) or []),
			"mental": mental.get(shift) or "",
			"appetite": _appetite_for_shift(grooming, shift),
			"sleep": sleep.get(shift) or "",
			"hygiene": _hygiene_for_shift(grooming, shift),
			"bowel": bowel,
			"notes": notes.get(shift) or "",
			"signature": signatures.get(shift) or self_sig,
		}

	meta = patient_meta(seed)
	return (
		f'<div class="ncp-report">'
		f"{patient_info_html(meta)}"
		f"{_plan_table(shifts_data, report_date)}"
		f"{form_footer_html(_FORM_CODE)}"
		f"</div>"
	), seed


@frappe.whitelist()
def get_nursing_care_plan_html(patient=None, admission=None, date=None):
	assert_nursing_print_permission("Main Nursing Note")
	patient = (patient or "").strip()
	admission = (admission or "").strip()
	if not patient and not admission:
		frappe.throw(frappe._("Select a patient to print the nursing care plan"))
	if not date:
		frappe.throw(frappe._("Select a date to print the nursing care plan"))

	body, seed = render_nursing_care_plan(patient=patient, admission=admission, report_date=date)
	return wrap_print_document(
		_TITLE,
		body,
		get_doc_letter_head(seed),
		extra_css=_NCP_CSS,
		landscape=True,
	)
