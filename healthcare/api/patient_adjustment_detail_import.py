"""Import Oracle PATIENT_ADJUSTMENT_02 Excel into Patient Adjustment Detail rows."""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate

from healthcare.api.patient_info_import import (
	_cell_text,
	_clean_oracle_num,
	_iter_excel_sheet_rows,
	_parse_date_value,
	_parse_datetime_value,
	_require_admin,
)

DOCTYPE = "Patient Adjustment Detail"
PARENT_DOCTYPE = "Patient Adjustment"

EXCEL_HEADER_MAP = {
	"TRANS_NUM": "adjustment_trans_no",
	"SR_NUM": "sr_num",
	"REFF_TRANS_NUM": "reff_trans_num",
	"INV_NUM": "inv_num",
	"INV_DATE": "inv_date",
	"INV_TOTAL_AMT": "inv_total_amt",
	"INV_BAL_AMT": "inv_bal_amt",
	"INV_NOW_AMT": "inv_now_amt",
	"CR_ID": "cr_id",
	"CR_DATE": "cr_date",
	"UP_ID": "up_id",
	"UP_DATE": "up_date",
}


def _normalize_header(cell: Any) -> str:
	if cell is None:
		return ""
	text = str(cell).strip().upper().replace(" ", "_")
	return EXCEL_HEADER_MAP.get(text, text.lower())


def _adjustment_trans_no(value: Any) -> str:
	return _cell_text(value).strip()


def _line_trans_no(adjustment_trans_no: str, sr_num: Any) -> str:
	sr = _clean_oracle_num(sr_num) or _cell_text(sr_num)
	return f"{adjustment_trans_no}-{sr}"


def _format_legacy_datetime(value: Any) -> str | None:
	dt = _parse_datetime_value(value)
	if dt:
		return dt.strftime("%Y-%m-%d %H:%M:%S")
	parsed_date = _parse_date_value(value)
	if parsed_date:
		return parsed_date.strftime("%Y-%m-%d")
	text = _cell_text(value)
	return text or None


def _parse_date_field(value: Any):
	dt = _parse_datetime_value(value)
	if dt:
		return getdate(dt)
	parsed_date = _parse_date_value(value)
	if parsed_date:
		return parsed_date
	return None


def _amount(value: Any) -> float | None:
	if value in (None, ""):
		return None
	return flt(value)


def _parse_excel_rows(file_url: str) -> tuple[list[dict], dict[str, int]]:
	by_key: dict[str, dict] = {}
	sheet_row_counts: dict[str, int] = {}

	rows_iter = _iter_excel_sheet_rows(file_url)
	try:
		header_row, _datemode = next(rows_iter)
	except StopIteration:
		return [], {}

	headers = [_normalize_header(h) for h in header_row]
	current_sheet = "Sheet 1"
	sheet_row_counts[current_sheet] = 0

	for raw, _datemode in rows_iter:
		if not raw or all(cell is None or str(cell).strip() == "" for cell in raw):
			continue
		row: dict[str, Any] = {}
		for idx, key in enumerate(headers):
			if not key or idx >= len(raw):
				continue
			row[key] = raw[idx]

		adjustment_trans_no = _adjustment_trans_no(row.get("adjustment_trans_no"))
		sr_num = row.get("sr_num")
		if not adjustment_trans_no or sr_num in (None, ""):
			continue

		row["adjustment_trans_no"] = adjustment_trans_no
		row["sr_num"] = cint(sr_num)
		row["trans_no"] = _line_trans_no(adjustment_trans_no, sr_num)
		row["reff_trans_num"] = _clean_oracle_num(row.get("reff_trans_num")) or None
		row["cr_id"] = _clean_oracle_num(row.get("cr_id")) or None
		row["up_id"] = _clean_oracle_num(row.get("up_id")) or None
		by_key[row["trans_no"]] = row
		sheet_row_counts[current_sheet] = sheet_row_counts.get(current_sheet, 0) + 1

	return list(by_key.values()), sheet_row_counts


def _resolve_patient_adjustment(adjustment_trans_no: str) -> str | None:
	if not adjustment_trans_no:
		return None
	if frappe.db.exists(PARENT_DOCTYPE, adjustment_trans_no):
		return adjustment_trans_no
	return None


def _build_fields(row: dict) -> dict[str, Any]:
	adjustment_trans_no = row["adjustment_trans_no"]
	patient_adjustment = _resolve_patient_adjustment(adjustment_trans_no)

	fields: dict[str, Any] = {
		"trans_no": row["trans_no"],
		"adjustment_trans_no": adjustment_trans_no,
		"sr_num": row.get("sr_num"),
		"inv_num": _cell_text(row.get("inv_num")) or None,
		"reff_trans_num": row.get("reff_trans_num"),
		"cr_id": row.get("cr_id") or None,
		"up_id": row.get("up_id") or None,
	}

	if patient_adjustment:
		fields["patient_adjustment"] = patient_adjustment

	inv_date = _parse_date_field(row.get("inv_date"))
	if inv_date:
		fields["inv_date"] = inv_date

	for amount_field in ("inv_total_amt", "inv_bal_amt", "inv_now_amt"):
		amount = _amount(row.get(amount_field))
		if amount is not None:
			fields[amount_field] = amount

	for date_field in ("cr_date", "up_date"):
		legacy_date = _format_legacy_datetime(row.get(date_field))
		if legacy_date:
			fields[date_field] = legacy_date

	return {key: value for key, value in fields.items() if value not in (None, "")}


def _preview_stats(rows: list[dict]) -> dict:
	existing = 0
	linked_headers = 0
	adjustments: set[str] = set()
	for row in rows:
		adjustments.add(row.get("adjustment_trans_no") or "")
		if frappe.db.exists(DOCTYPE, row["trans_no"]):
			existing += 1
		if _resolve_patient_adjustment(row.get("adjustment_trans_no") or ""):
			linked_headers += 1

	return {
		"existing_records": existing,
		"adjustment_headers": len(adjustments),
		"linked_headers": linked_headers,
		"sample_trans_nos": [row.get("trans_no") for row in rows[:5]],
	}


def upsert_patient_adjustment_detail(row: dict) -> dict:
	fields = _build_fields(row)
	if not fields.get("trans_no"):
		return {"status": "skip", "trans_no": row.get("trans_no")}

	trans_no = fields["trans_no"]
	if frappe.db.exists(DOCTYPE, trans_no):
		doc = frappe.get_doc(DOCTYPE, trans_no)
		for key, value in fields.items():
			doc.set(key, value)
		doc.flags.ignore_mandatory = True
		doc.flags.ignore_links = True
		doc.flags.ignore_validate = True
		doc.save(ignore_permissions=True)
		action = "updated"
	else:
		doc = frappe.get_doc({"doctype": DOCTYPE, **fields})
		doc.flags.ignore_mandatory = True
		doc.flags.ignore_links = True
		doc.flags.ignore_validate = True
		doc.insert(ignore_permissions=True)
		action = "created"

	return {
		"status": action,
		"trans_no": trans_no,
		"name": doc.name,
		"patient_adjustment": fields.get("patient_adjustment"),
	}


@frappe.whitelist()
def preview_patient_adjustment_detail_import(file_url: str) -> dict:
	_require_admin()
	if not (file_url or "").strip():
		frappe.throw(_("Please upload the PATIENT_ADJUSTMENT_02 Excel file."))

	rows, sheet_row_counts = _parse_excel_rows(file_url)
	stats = _preview_stats(rows)
	raw_row_total = sum(sheet_row_counts.values())
	return {
		"excel_rows": len(rows),
		"raw_excel_rows": raw_row_total,
		"sheets": list(sheet_row_counts.keys()),
		"sheet_row_counts": sheet_row_counts,
		**stats,
	}


@frappe.whitelist()
def run_patient_adjustment_detail_import(file_url: str) -> dict:
	"""Import all rows synchronously."""
	_require_admin()
	if not (file_url or "").strip():
		frappe.throw(_("Please upload the PATIENT_ADJUSTMENT_02 Excel file."))

	rows, _ = _parse_excel_rows(file_url)
	created = updated = skipped = linked_headers = 0
	errors: list[str] = []

	for row in rows:
		try:
			result = upsert_patient_adjustment_detail(row)
			status = result.get("status")
			if status == "created":
				created += 1
			elif status == "updated":
				updated += 1
			else:
				skipped += 1
			if result.get("patient_adjustment"):
				linked_headers += 1
		except Exception:
			errors.append(f"{row.get('trans_no')}: {frappe.get_traceback()}")
			frappe.log_error(title=f"PATIENT_ADJUSTMENT_02 import failed: {row.get('trans_no')}")

	frappe.db.commit()
	return {
		"ok": True,
		"total": len(rows),
		"created": created,
		"updated": updated,
		"skipped": skipped,
		"linked_headers": linked_headers,
		"errors": len(errors),
	}
