"""Update Lab Test Template OP / IP rates from July 2026 Lab Prices Excel.

Excel columns:
  Lab Code | Lab/group name | OP price (BHD) | IP price (BHD)

Mapping:
  OP price → Lab Test Template.op_rate
  IP price → Lab Test Template.lab_test_rate (IP Rate)
  Lab/group name → lab_test_name when provided (cleaned sheet names)

Runs synchronously — intended for < ~500 rows.
"""

from __future__ import annotations

import re
from typing import Any

import frappe
from frappe import _
from frappe.utils import flt

from healthcare.api.health_insurance_price_list_import import (
	_apply_item_pricing,
	_build_lab_template_index,
	_is_lab_test_code,
	_load_workbook,
	_norm_header_cell,
	_resolve_lab_template,
)


def _require_admin() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def _parse_amount(value: Any) -> float | None:
	"""Parse currency; allow 0 (unlike insurance import which skips non-positive)."""
	if value is None or value == "":
		return None
	text = str(value).strip().upper()
	if text in ("ACTUAL CHARGES", "N/A", "NA", "-", "NONE"):
		return None
	try:
		return flt(value)
	except Exception:
		return None


def _clean_lab_name(value: Any) -> str:
	return re.sub(r"\s+", " ", str(value or "").strip())


def _find_july_lab_price_header(cells: list) -> dict[str, int] | None:
	normalized = [_norm_header_cell(c) for c in cells]
	code_idx = name_idx = op_idx = ip_idx = None

	for idx, label in enumerate(normalized):
		if not label:
			continue
		if code_idx is None and (
			label in ("lab code", "test code", "code") or label.endswith("lab code")
		):
			code_idx = idx
		if name_idx is None and (
			"lab/group name" in label
			or "lab group name" in label
			or label in ("lab name", "test name", "group name", "name")
		):
			name_idx = idx
		if op_idx is None and (
			label.startswith("op price") or label in ("op", "op rate", "op price")
		):
			op_idx = idx
		if ip_idx is None and (
			label.startswith("ip price") or label in ("ip", "ip rate", "ip price")
		):
			ip_idx = idx

	if code_idx is None or (op_idx is None and ip_idx is None):
		return None

	if name_idx is None:
		name_idx = code_idx + 1

	return {
		"test_code": code_idx,
		"test_name": name_idx,
		"op_price": op_idx if op_idx is not None else -1,
		"ip_price": ip_idx if ip_idx is not None else -1,
	}


def _resolve_sheet_header(ws) -> dict[str, int] | None:
	for raw in ws.iter_rows(max_row=30, values_only=True):
		if not raw:
			continue
		header = _find_july_lab_price_header(list(raw))
		if header:
			return header
	return None


def _iter_excel_rows(file_url: str) -> list[dict]:
	wb = _load_workbook(file_url)
	out: list[dict] = []
	try:
		for sheet_name in wb.sheetnames:
			ws = wb[sheet_name]
			header = _resolve_sheet_header(ws)
			if not header:
				continue
			for raw in ws.iter_rows(values_only=True):
				if not raw:
					continue
				cells = list(raw)
				if _find_july_lab_price_header(cells):
					continue
				code_cell = cells[header["test_code"]] if len(cells) > header["test_code"] else None
				if not _is_lab_test_code(code_cell):
					continue
				name_cell = (
					cells[header["test_name"]] if len(cells) > header["test_name"] else None
				)
				op_cell = (
					cells[header["op_price"]]
					if header.get("op_price", -1) >= 0 and len(cells) > header["op_price"]
					else None
				)
				ip_cell = (
					cells[header["ip_price"]]
					if header.get("ip_price", -1) >= 0 and len(cells) > header["ip_price"]
					else None
				)
				out.append(
					{
						"lab_code": str(code_cell).strip(),
						"lab_name": _clean_lab_name(name_cell),
						"op_price": _parse_amount(op_cell),
						"ip_price": _parse_amount(ip_cell),
						"sheet": sheet_name,
					}
				)
	finally:
		wb.close()
	return out


def _template_row(name: str) -> dict | None:
	return frappe.db.get_value(
		"Lab Test Template",
		name,
		["name", "lab_test_name", "op_rate", "lab_test_rate", "item", "disabled"],
		as_dict=True,
	)


def _collect_row_updates(row: dict, current: dict) -> tuple[dict[str, Any], list[str]]:
	updates: dict[str, Any] = {}
	change_bits: list[str] = []

	if row["op_price"] is not None and flt(current.op_rate) != flt(row["op_price"]):
		updates["op_rate"] = row["op_price"]
		change_bits.append(f"OP {flt(current.op_rate)}→{flt(row['op_price'])}")

	if row["ip_price"] is not None and flt(current.lab_test_rate) != flt(row["ip_price"]):
		updates["lab_test_rate"] = row["ip_price"]
		change_bits.append(f"IP {flt(current.lab_test_rate)}→{flt(row['ip_price'])}")

	new_name = row["lab_name"]
	old_name = _clean_lab_name(current.lab_test_name)
	if new_name and new_name.lower() != old_name.lower():
		updates["lab_test_name"] = new_name
		change_bits.append(f"name “{old_name}”→“{new_name}”")

	return updates, change_bits


def _sync_item_ip_rate(item_code: str | None, ip_amount: float) -> None:
	if not item_code:
		return
	if ip_amount > 0:
		_apply_item_pricing(item_code, ip_amount)
	else:
		frappe.db.set_value("Item", item_code, "standard_rate", ip_amount, update_modified=False)


@frappe.whitelist()
def preview_lab_test_template_price_update(file_url: str) -> dict:
	"""Preview OP/IP (and name) updates for Lab Test Templates from July Lab Prices Excel."""
	_require_admin()
	if not file_url:
		frappe.throw(_("Please upload an Excel file."))

	rows = _iter_excel_rows(file_url)
	if not rows:
		frappe.throw(
			_(
				"No Lab Code rows with OP/IP prices found. "
				"Expected columns: Lab Code, Lab/group name, OP price, IP price."
			)
		)

	index = _build_lab_template_index()
	matched = 0
	missing: list[str] = []
	would_update_op = 0
	would_update_ip = 0
	would_update_name = 0
	templates_needing_update = 0
	unchanged = 0
	samples_missing: list[str] = []
	samples_updates: list[str] = []

	for row in rows:
		template = _resolve_lab_template(row["lab_code"], row["lab_name"], index)
		if not template:
			missing.append(row["lab_code"])
			if len(samples_missing) < 12:
				samples_missing.append(
					f"{row['lab_code']} — {row['lab_name'] or ''}".strip(" —")
				)
			continue

		matched += 1
		current = _template_row(template["name"])
		if not current:
			missing.append(row["lab_code"])
			continue

		updates, change_bits = _collect_row_updates(row, current)
		if not updates:
			unchanged += 1
			continue

		templates_needing_update += 1
		if "op_rate" in updates:
			would_update_op += 1
		if "lab_test_rate" in updates:
			would_update_ip += 1
		if "lab_test_name" in updates:
			would_update_name += 1
		if len(samples_updates) < 12:
			samples_updates.append(f"{row['lab_code']}: {'; '.join(change_bits)}")

	return {
		"excel_rows": len(rows),
		"matched": matched,
		"missing": len(missing),
		"missing_codes": missing[:50],
		"samples_missing": samples_missing,
		"would_update_op": would_update_op,
		"would_update_ip": would_update_ip,
		"would_update_name": would_update_name,
		"templates_needing_update": templates_needing_update,
		"unchanged": unchanged,
		"samples_updates": samples_updates,
	}


@frappe.whitelist()
def update_lab_test_template_prices_from_excel(file_url: str) -> dict:
	"""Apply OP → op_rate and IP → lab_test_rate (and cleaned names) immediately."""
	_require_admin()
	if not file_url:
		frappe.throw(_("Please upload an Excel file."))

	rows = _iter_excel_rows(file_url)
	if not rows:
		frappe.throw(
			_(
				"No Lab Code rows with OP/IP prices found. "
				"Expected columns: Lab Code, Lab/group name, OP price, IP price."
			)
		)

	index = _build_lab_template_index()
	matched = 0
	missing: list[str] = []
	updated_op = 0
	updated_ip = 0
	updated_name = 0
	updated = 0
	unchanged = 0
	errors = 0
	samples_missing: list[str] = []
	samples_updates: list[str] = []

	for row in rows:
		template = _resolve_lab_template(row["lab_code"], row["lab_name"], index)
		if not template:
			missing.append(row["lab_code"])
			if len(samples_missing) < 12:
				samples_missing.append(
					f"{row['lab_code']} — {row['lab_name'] or ''}".strip(" —")
				)
			continue

		matched += 1
		current = _template_row(template["name"])
		if not current:
			missing.append(row["lab_code"])
			continue

		updates, change_bits = _collect_row_updates(row, current)
		if not updates:
			unchanged += 1
			continue

		if "op_rate" in updates:
			updated_op += 1
		if "lab_test_rate" in updates:
			updated_ip += 1
		if "lab_test_name" in updates:
			updated_name += 1
		if len(samples_updates) < 12:
			samples_updates.append(f"{row['lab_code']}: {'; '.join(change_bits)}")

		try:
			frappe.db.set_value(
				"Lab Test Template",
				current.name,
				updates,
				update_modified=True,
			)
			if "lab_test_rate" in updates:
				_sync_item_ip_rate(current.item, flt(updates["lab_test_rate"]))
			updated += 1
		except Exception:
			errors += 1
			frappe.log_error(
				title=f"Lab Test Template price update failed: {row['lab_code']}",
				message=frappe.get_traceback(),
			)

	frappe.db.commit()

	return {
		"ok": True,
		"excel_rows": len(rows),
		"matched": matched,
		"missing": len(missing),
		"missing_codes": missing[:50],
		"samples_missing": samples_missing,
		"updated": updated,
		"updated_op": updated_op,
		"updated_ip": updated_ip,
		"updated_name": updated_name,
		"unchanged": unchanged,
		"errors": errors,
		"samples_updates": samples_updates,
	}
