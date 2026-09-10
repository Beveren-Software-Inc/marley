"""Lab Test Summary Report — counts and amounts by group collection (OP / IP).

Rows are group collections (lab_test_group), not individual child templates.
Test Code = group id (e.g. LAB-001), Test Name = group template name.
"""

from __future__ import annotations

import frappe
from frappe.utils import flt

from healthcare.api.lab_reports_common import (
	get_report_letter_head,
	lab_test_list_filters,
	range_header_html,
	resolve_report_cost_center,
	resolve_report_dates,
	test_amount,
	is_ip_lab_test,
)
from healthcare.api.nursing_print import (
	MAROON,
	assert_nursing_print_permission,
	esc,
	wrap_print_document,
)

_TITLE = "Lab Tests Summary"
_BLUE = "#1E4E8C"


def _template_parent_map(template_names: set[str]) -> dict[str, str]:
	"""Map child template → parent group template (lab_group), when set."""
	names = [n for n in template_names if n]
	if not names:
		return {}
	try:
		rows = frappe.get_all(
			"Lab Test Template",
			filters={"name": ["in", names]},
			fields=["name", "lab_group"],
		)
	except Exception:
		return {}
	out = {}
	for row in rows:
		parent = (row.get("lab_group") or "").strip()
		if parent:
			out[row["name"]] = parent
	return out


def _group_meta(group_id: str) -> tuple[str, str]:
	"""Return (test_code, test_name). Code is always the group id."""
	gid = (group_id or "").strip()
	if not gid or gid == "__unknown__":
		return "", ""
	try:
		row = frappe.db.get_value(
			"Lab Test Template",
			gid,
			["name", "lab_test_name"],
			as_dict=True,
		)
	except Exception:
		row = None
	if row:
		code = (row.get("name") or gid).strip()
		name = (row.get("lab_test_name") or code).strip()
		return code, name
	return gid, gid


def _resolve_group_id(row, parent_by_template: dict[str, str]) -> str:
	group = (row.get("lab_test_group") or "").strip()
	if group:
		return group
	template = (row.get("template") or "").strip()
	if template and template in parent_by_template:
		return parent_by_template[template]
	if template:
		return template
	return (row.get("lab_test_name") or "__unknown__").strip()


def _summary_rows(date_from, date_to, cost_center=None):
	filters = lab_test_list_filters(date_from, date_to, cost_center)
	if filters is None:
		return []

	rows = frappe.get_all(
		"Lab Test",
		filters=filters,
		fields=[
			"name",
			"template",
			"lab_test_name",
			"lab_test_group",
			"service_request",
			"inpatient_admission",
			"inpatient_record",
			"amount",
			"grand_total",
		],
		order_by="creation asc",
		limit=0,
		ignore_permissions=True,
	)

	parent_by_template = _template_parent_map(
		{(r.get("template") or "").strip() for r in rows if r.get("template")}
	)

	# One collection instance = one (group id, service request) — or the Lab Test itself
	# when there is no service request (standalone / legacy).
	instances: dict[tuple[str, str], dict] = {}
	for row in rows:
		group_id = _resolve_group_id(row, parent_by_template)
		sr = (row.get("service_request") or "").strip()
		instance_id = sr or (row.get("name") or "").strip() or group_id
		key = (group_id, instance_id)
		if key not in instances:
			instances[key] = {
				"group_id": group_id,
				"is_ip": is_ip_lab_test(row),
				"amount": 0.0,
			}
		instances[key]["amount"] += test_amount(row)
		# Prefer IP if any child on the instance is IP
		if is_ip_lab_test(row):
			instances[key]["is_ip"] = True

	buckets: dict[str, dict] = {}
	for inst in instances.values():
		gid = inst["group_id"]
		if gid not in buckets:
			code, name = _group_meta(gid)
			buckets[gid] = {
				"test_code": code or gid,
				"test_name": name or gid,
				"op_count": 0,
				"op_amount": 0.0,
				"ip_count": 0,
				"ip_amount": 0.0,
			}
		amt = flt(inst["amount"])
		if inst["is_ip"]:
			buckets[gid]["ip_count"] += 1
			buckets[gid]["ip_amount"] += amt
		else:
			buckets[gid]["op_count"] += 1
			buckets[gid]["op_amount"] += amt

	out = []
	for item in buckets.values():
		item["total_count"] = item["op_count"] + item["ip_count"]
		item["total_amount"] = flt(item["op_amount"] + item["ip_amount"], 3)
		item["op_amount"] = flt(item["op_amount"], 3)
		item["ip_amount"] = flt(item["ip_amount"], 3)
		out.append(item)

	out.sort(key=lambda r: (r.get("test_code") or "", r.get("test_name") or ""))
	return out


def _fmt_amt(value) -> str:
	return f"{flt(value, 3):,.3f}"


def _table(rows: list[dict]) -> str:
	headers = (
		"Test Code",
		"Test Name",
		"OP Count",
		"OP Amount",
		"IP Count",
		"IP Amount",
		"Total Count",
		"Total Amount",
	)
	head = "".join(f"<th>{esc(h)}</th>" for h in headers)
	body = []
	totals = {
		"op_count": 0,
		"op_amount": 0.0,
		"ip_count": 0,
		"ip_amount": 0.0,
		"total_count": 0,
		"total_amount": 0.0,
	}

	for row in rows:
		totals["op_count"] += int(row.get("op_count") or 0)
		totals["op_amount"] += flt(row.get("op_amount"))
		totals["ip_count"] += int(row.get("ip_count") or 0)
		totals["ip_amount"] += flt(row.get("ip_amount"))
		totals["total_count"] += int(row.get("total_count") or 0)
		totals["total_amount"] += flt(row.get("total_amount"))
		body.append(
			"<tr>"
			f'<td>{esc(row.get("test_code"))}</td>'
			f'<td>{esc(row.get("test_name"))}</td>'
			f'<td class="num">{esc(row.get("op_count"))}</td>'
			f'<td class="num">{esc(_fmt_amt(row.get("op_amount")))}</td>'
			f'<td class="num">{esc(row.get("ip_count"))}</td>'
			f'<td class="num">{esc(_fmt_amt(row.get("ip_amount")))}</td>'
			f'<td class="num">{esc(row.get("total_count"))}</td>'
			f'<td class="num">{esc(_fmt_amt(row.get("total_amount")))}</td>'
			"</tr>"
		)

	if not body:
		body.append(
			f'<tr><td colspan="{len(headers)}" class="lts-empty">No lab tests in this period.</td></tr>'
		)
	else:
		body.append(
			"<tr class=\"lts-total\">"
			"<td></td>"
			'<td class="lts-total-label">Total</td>'
			f'<td class="num">{totals["op_count"]}</td>'
			f'<td class="num">{esc(_fmt_amt(totals["op_amount"]))}</td>'
			f'<td class="num">{totals["ip_count"]}</td>'
			f'<td class="num">{esc(_fmt_amt(totals["ip_amount"]))}</td>'
			f'<td class="num">{totals["total_count"]}</td>'
			f'<td class="num">{esc(_fmt_amt(totals["total_amount"]))}</td>'
			"</tr>"
		)

	return (
		f'<table class="lts-table"><thead><tr>{head}</tr></thead>'
		f'<tbody>{"".join(body)}</tbody></table>'
	)


_CSS = f"""
		.lar-range {{
			text-align: left;
			font-size: 11px;
			margin: 0 0 8px;
		}}
		.lar-range span {{ color: {_BLUE} !important; font-weight: bold; }}
		.lts-table {{ width: 100%; border-collapse: collapse; table-layout: auto; }}
		.lts-table th, .lts-table td {{
			border: 1px solid #444;
			padding: 3px 5px;
			font-size: 9px;
			vertical-align: top;
		}}
		.lts-table th {{
			background: #e8e8e8;
			color: {MAROON} !important;
			font-weight: bold;
			text-align: center;
		}}
		.lts-table td.num {{ text-align: right; white-space: nowrap; }}
		.lts-table td:nth-child(2) {{ white-space: normal; min-width: 140px; }}
		.lts-total td {{ font-weight: bold; background: #f5f5f5; }}
		.lts-total-label {{ text-align: left; }}
		.lts-empty {{ text-align: center; padding: 12px; font-size: 11px; }}
"""


@frappe.whitelist()
def get_lab_test_summary_html(date_from=None, date_to=None, cost_center=None):
	assert_nursing_print_permission("Lab Test")
	cost_center = resolve_report_cost_center(cost_center)
	date_from, date_to = resolve_report_dates(date_from, date_to)
	rows = _summary_rows(date_from, date_to, cost_center)
	range_html = range_header_html(date_from, date_to, cost_center)
	body = f'<div class="lts-report">{range_html}{_table(rows)}</div>'
	return wrap_print_document(
		_TITLE,
		body,
		get_report_letter_head(cost_center),
		extra_css=_CSS,
		landscape=True,
	)
