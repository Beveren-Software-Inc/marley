"""Lab Result Assessment Report — general listing (not patient-scoped).

Column order matches the Serene IP_LAB_ASS_REPORT print (left → right):
Transaction No. | Transaction Date | File No. | Patient Name | Visit No. | Case No. |
Created By | Created Date | Sample Collected | Sample Collected Date |
Entered By | Entered Date | Viewed By | Viewed Date
"""

from __future__ import annotations

import frappe

from healthcare.api.lab_reports_common import (
	get_report_letter_head,
	lab_test_list_filters,
	range_header_html,
	resolve_report_cost_center,
	resolve_report_dates,
)

from healthcare.api.nursing_print import (
	MAROON,
	assert_nursing_print_permission,
	esc,
	fmt_date,
	parse_date,
	parse_datetime,
	wrap_print_document,
)

_TITLE = "Lab Result Assessment Report"
_BLUE = "#1E4E8C"

# Keep headers/keys in lockstep with the sample PDF — Sample sits after Created, not at the end.
_COLUMNS: tuple[tuple[str, str], ...] = (
	("trans_no", "Transaction No."),
	("trans_date", "Transaction Date"),
	("file_no", "File No."),
	("patient_name", "Patient Name"),
	("visit_no", "Visit No."),
	("case_no", "Case No."),
	("created_by", "Created By"),
	("created_date", "Created Date"),
	("sample_by", "Sample Collected"),
	("sample_date", "Sample Collected Date"),
	("entered_by", "Entered By"),
	("entered_date", "Entered Date"),
	("viewed_by", "Viewed By"),
	("viewed_date", "Viewed Date"),
)


def _fmt_dt(value) -> str:
	dt = parse_datetime(value)
	if dt:
		return dt.strftime("%d-%b-%y %I:%M %p").upper()
	d = parse_date(value)
	if d:
		return d.strftime("%d-%b-%y").upper()
	text = str(value or "").strip()
	return text if text and text.lower() not in ("none", "null") else ""


def _short_name(value) -> str:
	if value in (None, ""):
		return ""
	raw = str(value).strip()
	if not raw or raw.lower() in ("none", "null"):
		return ""
	try:
		if frappe.db.exists("User", raw):
			full = frappe.db.get_value("User", raw, "full_name") or raw
			token = str(full).strip()
			return token.split()[0] if token else raw
	except Exception:
		pass
	return raw.split()[0] if " " in raw and "@" not in raw else raw


def _case_no(admission, record) -> str:
	for name in (admission, record):
		if not name:
			continue
		try:
			case = frappe.db.get_value("Inpatient Admission", name, "case_no")
			if case:
				return str(case)
		except Exception:
			pass
	return ""


def _sample_info(sample_name) -> tuple[str, str]:
	if not sample_name:
		return "", ""
	try:
		row = frappe.db.get_value(
			"Sample Collection",
			sample_name,
			["collected_by", "collected_time"],
			as_dict=True,
		)
	except Exception:
		row = None
	if not row:
		return "", ""
	return _short_name(row.get("collected_by")), _fmt_dt(row.get("collected_time"))


def _lab_test_fields() -> list[str]:
	"""Only request columns that exist on this site's Lab Test."""
	wanted = [
		"name",
		"trans_num",
		"date",
		"transaction_date",
		"creation",
		"patient",
		"patient_name",
		"patient_visit",
		"inpatient_admission",
		"inpatient_record",
		"owner",
		"cr_id",
		"cr_date",
		"fill_id",
		"fill_date",
		"results_entered_datetime",
		"lab_technician_name",
		"employee_name",
		"reviewed_by",
		"doctor_reviewed_datetime",
		"ap_id",
		"ap_date",
		"sample",
		"sample_collected_id",
		"sample_collect_id",
		"sample_collected_date",
		"cost_center",
	]
	meta = frappe.get_meta("Lab Test")
	return [f for f in wanted if meta.has_field(f) or f in ("name", "creation", "owner")]


def _rows(date_from, date_to, cost_center=None):
	filters = lab_test_list_filters(date_from, date_to, cost_center)
	if filters is None:
		return []

	rows = frappe.get_all(
		"Lab Test",
		filters=filters,
		fields=_lab_test_fields(),
		order_by="creation asc",
		limit=2000,
		ignore_permissions=True,
	)
	out = []
	for row in rows:
		sample_by, sample_dt = _sample_info(row.get("sample"))
		# Always emit every sample column (empty string if missing) so cells never shift.
		out.append(
			{
				"trans_no": row.get("trans_num") or row.get("name") or "",
				"trans_date": fmt_date(
					row.get("date") or row.get("transaction_date") or row.get("creation"),
					"%d-%m-%y",
				),
				"file_no": row.get("patient") or "",
				"patient_name": row.get("patient_name") or "",
				"visit_no": row.get("patient_visit") or "",
				"case_no": _case_no(row.get("inpatient_admission"), row.get("inpatient_record")),
				"created_by": _short_name(row.get("cr_id") or row.get("owner")),
				"created_date": _fmt_dt(row.get("cr_date") or row.get("creation")),
				"entered_by": _short_name(
					row.get("fill_id") or row.get("lab_technician_name") or row.get("employee_name")
				),
				"entered_date": _fmt_dt(row.get("fill_date") or row.get("results_entered_datetime")),
				"viewed_by": _short_name(row.get("ap_id") or row.get("reviewed_by")),
				"viewed_date": _fmt_dt(row.get("ap_date") or row.get("doctor_reviewed_datetime")),
				"sample_by": _short_name(row.get("sample_collected_id") or row.get("sample_collect_id"))
				or sample_by
				or "",
				"sample_date": _fmt_dt(row.get("sample_collected_date")) or sample_dt or "",
			}
		)
	return out


def _table(rows: list[dict]) -> str:
	headers = [label for _, label in _COLUMNS]
	keys = [key for key, _ in _COLUMNS]
	head = "".join(f"<th>{esc(h)}</th>" for h in headers)
	body = []
	for row in rows:
		cells = "".join(f"<td>{esc(row.get(k) or '')}</td>" for k in keys)
		body.append(f"<tr>{cells}</tr>")
	if not body:
		body.append(
			f'<tr><td colspan="{len(headers)}" class="lar-empty">No lab tests in this period.</td></tr>'
		)
	return (
		f'<table class="lar-table"><thead><tr>{head}</tr></thead>'
		f'<tbody>{"".join(body)}</tbody></table>'
	)


_CSS = f"""
		.lar-range {{
			text-align: left;
			font-size: 11px;
			margin: 0 0 8px;
		}}
		.lar-range span {{ color: {_BLUE} !important; font-weight: bold; }}
		.lar-table {{
			width: 100%;
			border-collapse: collapse;
			table-layout: fixed;
		}}
		.lar-table th, .lar-table td {{
			border: 1px solid #444;
			padding: 2px 3px;
			font-size: 7.5px;
			vertical-align: middle;
			overflow: hidden;
			text-overflow: ellipsis;
			word-break: break-word;
		}}
		.lar-table th {{
			background: #e8e8e8;
			color: {MAROON} !important;
			font-weight: bold;
			text-align: center;
			white-space: normal;
			line-height: 1.15;
		}}
		.lar-table td {{
			white-space: nowrap;
		}}
		/* Patient Name — allow wrap; keep other columns tight so they do not shift */
		.lar-table th:nth-child(4),
		.lar-table td:nth-child(4) {{
			white-space: normal;
			width: 14%;
		}}
		.lar-table th:nth-child(1), .lar-table td:nth-child(1) {{ width: 9%; }}
		.lar-table th:nth-child(2), .lar-table td:nth-child(2) {{ width: 6%; }}
		.lar-table th:nth-child(3), .lar-table td:nth-child(3) {{ width: 5%; }}
		.lar-table th:nth-child(5), .lar-table td:nth-child(5) {{ width: 5%; }}
		.lar-table th:nth-child(6), .lar-table td:nth-child(6) {{ width: 4%; }}
		/* Created By / Sample / Entered By / Viewed By */
		.lar-table th:nth-child(7), .lar-table td:nth-child(7),
		.lar-table th:nth-child(9), .lar-table td:nth-child(9),
		.lar-table th:nth-child(11), .lar-table td:nth-child(11),
		.lar-table th:nth-child(13), .lar-table td:nth-child(13) {{ width: 5%; }}
		/* Created Date / Sample Date / Entered Date / Viewed Date */
		.lar-table th:nth-child(8), .lar-table td:nth-child(8),
		.lar-table th:nth-child(10), .lar-table td:nth-child(10),
		.lar-table th:nth-child(12), .lar-table td:nth-child(12),
		.lar-table th:nth-child(14), .lar-table td:nth-child(14) {{ width: 8%; }}
		.lar-empty {{ text-align: center; padding: 12px; font-size: 11px; white-space: normal; }}
"""


@frappe.whitelist()
def get_lab_result_assessment_html(date_from=None, date_to=None, cost_center=None):
	assert_nursing_print_permission("Lab Test")
	# No portal branch → first Cost Center with Is Hospital ticked (letterhead + filter).
	cost_center = resolve_report_cost_center(cost_center)
	date_from, date_to = resolve_report_dates(date_from, date_to)
	rows = _rows(date_from, date_to, cost_center)
	range_html = range_header_html(date_from, date_to, cost_center)
	body = f'<div class="lar-report">{range_html}{_table(rows)}</div>'
	return wrap_print_document(
		_TITLE,
		body,
		get_report_letter_head(cost_center),
		extra_css=_CSS,
		landscape=True,
	)
