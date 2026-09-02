"""Lab Test Price List (master checklist) — groups, children, OP/IP rates."""

from __future__ import annotations

import re

import frappe
from frappe.utils import cint, cstr, flt, now_datetime

from healthcare.api.lab_reports_common import letter_head_seed
from healthcare.api.nursing_print import (
	MAROON,
	esc,
	get_doc_letter_head,
	wrap_print_document,
)

_TITLE = "Lab Test Price List"


def _natural_key(value: str) -> list:
	parts = re.split(r"(\d+)", cstr(value or "").upper())
	out: list = []
	for part in parts:
		if part.isdigit():
			out.append(int(part))
		else:
			out.append(part)
	return out


def _money(value) -> str:
	if value in (None, ""):
		return ""
	return f"{flt(value):,.3f}"


def _outside_label(value) -> str:
	return "Yes" if cint(value) else "No"


def _load_templates() -> tuple[list[dict], dict[str, list[dict]], list[dict]]:
	fields = [
		"name",
		"lab_test_code",
		"lab_test_name",
		"is_group",
		"lab_group",
		"disabled",
		"lab_test_rate",
		"op_rate",
		"outsource",
	]
	rows = frappe.get_all(
		"Lab Test Template",
		filters={"disabled": 0},
		fields=fields,
		limit=0,
		order_by="name asc",
	)
	groups = [r for r in rows if cint(r.get("is_group"))]
	children_by_group: dict[str, list[dict]] = {}
	standalones: list[dict] = []
	for row in rows:
		if cint(row.get("is_group")):
			continue
		parent = cstr(row.get("lab_group") or "").strip()
		if parent:
			children_by_group.setdefault(parent, []).append(row)
		else:
			standalones.append(row)

	groups.sort(key=lambda r: _natural_key(r.get("name")))
	for child_rows in children_by_group.values():
		child_rows.sort(key=lambda r: _natural_key(r.get("name")))
	standalones.sort(key=lambda r: _natural_key(r.get("name")))
	return groups, children_by_group, standalones


def _code(row: dict) -> str:
	return cstr(row.get("lab_test_code") or row.get("name") or "").strip()


def _name(row: dict) -> str:
	return cstr(row.get("lab_test_name") or row.get("name") or "").strip()


def _table(groups: list[dict], children_by_group: dict[str, list[dict]], standalones: list[dict]) -> str:
	headers = (
		"Group No.",
		"Group Name",
		"Test Code",
		"Test Name",
		"OP Price",
		"IP Price",
		"OP Total",
		"IP Total",
		"Is Outside",
	)
	head = "".join(f"<th>{esc(h)}</th>" for h in headers)
	body: list[str] = []

	def append_row(cells: list[str], *, group_row: bool = False) -> None:
		cls = ' class="lml-group"' if group_row else ""
		body.append(f"<tr{cls}>{''.join(cells)}</tr>")

	def cell(value: str, align: str = "left") -> str:
		return f'<td class="lml-{align}">{esc(value)}</td>'

	for group in groups:
		gname = group.get("name")
		append_row(
			[
				cell(_code(group)),
				cell(_name(group)),
				cell(""),
				cell(""),
				cell(""),
				cell(""),
				cell(_money(group.get("op_rate")), "num"),
				cell(_money(group.get("lab_test_rate")), "num"),
				cell(_outside_label(group.get("outsource")), "center"),
			],
			group_row=True,
		)
		for child in children_by_group.get(gname, []):
			append_row(
				[
					cell(""),
					cell(""),
					cell(_code(child)),
					cell(_name(child)),
					cell(_money(child.get("op_rate")), "num"),
					cell(_money(child.get("lab_test_rate")), "num"),
					cell(""),
					cell(""),
					cell(_outside_label(child.get("outsource")), "center"),
				]
			)

	for solo in standalones:
		append_row(
			[
				cell(_code(solo)),
				cell(_name(solo)),
				cell(_code(solo)),
				cell(_name(solo)),
				cell(_money(solo.get("op_rate")), "num"),
				cell(_money(solo.get("lab_test_rate")), "num"),
				cell(_money(solo.get("op_rate")), "num"),
				cell(_money(solo.get("lab_test_rate")), "num"),
				cell(_outside_label(solo.get("outsource")), "center"),
			],
			group_row=True,
		)

	if not body:
		colspan = len(headers)
		body.append(f'<tr><td colspan="{colspan}" class="lml-empty">No active lab templates found.</td></tr>')

	return f'<table class="lml-table"><thead><tr>{head}</tr></thead><tbody>{"".join(body)}</tbody></table>'


_CSS = f"""
		.lml-meta {{
			font-size: 10px;
			color: #444;
			margin: 0 0 10px;
		}}
		.lml-table {{
			width: 100%;
			border-collapse: collapse;
			table-layout: auto;
		}}
		.lml-table th, .lml-table td {{
			border: 1px solid #444;
			padding: 3px 5px;
			font-size: 9px;
			vertical-align: top;
		}}
		.lml-table th {{
			background: #e8e8e8;
			color: {MAROON} !important;
			font-weight: bold;
			text-align: center;
			white-space: nowrap;
		}}
		.lml-table tr.lml-group td {{
			background: #f5f5f5;
			font-weight: bold;
		}}
		.lml-num {{ text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }}
		.lml-center {{ text-align: center; }}
		.lml-empty {{ text-align: center; padding: 14px; font-size: 11px; }}
"""


@frappe.whitelist()
def get_lab_master_list_html(cost_center=None):
	if not frappe.has_permission("Lab Test Template", "read"):
		frappe.throw(frappe._("Not permitted to print Lab Test Price List"), frappe.PermissionError)

	groups, children_by_group, standalones = _load_templates()
	printed = now_datetime().strftime("%A %B %d %Y %I:%M %p")
	meta = f'<div class="lml-meta">Printed On: {esc(printed)}</div>'
	body = f'<div class="lml-report">{meta}{_table(groups, children_by_group, standalones)}</div>'
	seed = letter_head_seed(cost_center)
	return wrap_print_document(
		_TITLE,
		body,
		get_doc_letter_head(seed),
		extra_css=_CSS,
		landscape=True,
	)
