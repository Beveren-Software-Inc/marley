"""Import Oracle SALES_DATA_DETAILS Excel into Legacy Sales Transactions.items child table."""

from __future__ import annotations

import json
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

PARENT_DOCTYPE = "Legacy Sales Transactions"
CHILD_TABLE = "items"
LEGACY_SALES_DETAIL_IMPORT_BATCH_SIZE = 200
CACHE_TTL = 7200
CACHE_KEYS = {
	"file_url": "healthcare:data_migration:legacy_sales_detail_import:file_url",
	"trans_keys": "healthcare:data_migration:legacy_sales_detail_import:trans_keys",
	"grouped": "healthcare:data_migration:legacy_sales_detail_import:grouped",
}

EXCEL_HEADER_MAP = {
	"TRANS_NUM": "trans_num",
	"TRANS_TYPE_NUM": "trans_type_num",
	"SR_NUM": "sr_num",
	"ITEM_NUM": "item_num",
	"ITEM_EXPIRY_DATE": "item_expiry_date",
	"ITEM_PER_PACK": "item_per_pack",
	"ITEM_BIG_UOM_NUM": "item_big_uom_num",
	"ITEM_BIG_QTY": "item_big_qty",
	"ITEM_BIG_RATE": "item_big_rate",
	"ITEM_BIG_AMT": "item_big_amt",
	"ITEM_SMALL_UOM_NUM": "item_small_uom_num",
	"ITEM_SMALL_QTY": "item_small_qty",
	"ITEM_SMALL_RATE": "item_small_rate",
	"ITEM_SMALL_AMT": "item_small_amt",
	"STOCK_QTY_BIG": "stock_qty_big",
	"STOCK_QTY_SMALL": "stock_qty_small",
	"SHOW_FLAG": "show_flag",
	"SHOW_UOM": "show_uom",
	"SHOW_QTY": "show_qty",
	"SHOW_RATE": "show_rate",
	"SHOW_AMT": "show_amt",
	"SHOW_RATE_PUR": "show_rate_pur",
	"SHOW_AMT_PUR": "show_amt_pur",
	"SHOW_PROFIT_AMT": "show_profit_amt",
	"TRANS_REMARKS_DET": "trans_remarks_det",
	"REMARKS_DETAIL": "remarks_detail",
	"CR_ID": "cr_id",
	"CR_DATE": "cr_date",
	"UP_ID": "up_id",
	"UP_DATE": "up_date",
	"ITEM_VAT": "item_vat",
	"ITEM_VAT_AMT_BIG": "item_vat_amt_big",
	"ITEM_VAT_AMT_SMALL": "item_vat_amt_small",
	"SHOW_ITEM_VAT_AMT": "show_item_vat_amt",
	"ITEM_BIG_DISCOUNT_PER": "item_big_discount_per",
	"ITEM_BIG_DISCOUNT_AMT": "item_big_discount_amt",
	"ITEM_SMALL_DISCOUNT_PER": "item_small_discount_per",
	"ITEM_SMALL_DISCOUNT_AMT": "item_small_discount_amt",
	"SHOW_DISCOUNT_PER": "show_discount_per",
	"SHOW_DISCOUNT_AMT": "show_discount_amt",
	"AIS_BATCH_NUM": "ais_batch_num",
}


def _normalize_header(cell: Any) -> str:
	if cell is None:
		return ""
	text = str(cell).strip().upper().replace(" ", "_")
	return EXCEL_HEADER_MAP.get(text, text.lower())


def _format_legacy_datetime(value: Any, *, datemode: int = 0) -> str | None:
	dt = _parse_datetime_value(value, datemode=datemode)
	if dt:
		return dt.strftime("%Y-%m-%d %H:%M:%S")
	parsed_date = _parse_date_value(value, datemode=datemode)
	if parsed_date:
		return parsed_date.strftime("%Y-%m-%d")
	text = _cell_text(value)
	return text or None


def _parse_date_field(value: Any, *, datemode: int = 0):
	dt = _parse_datetime_value(value, datemode=datemode)
	if dt:
		return getdate(dt)
	return _parse_date_value(value, datemode=datemode)


def _amount(value: Any) -> float | None:
	if value in (None, ""):
		return None
	if isinstance(value, str):
		value = value.strip().replace(",", "")
		if not value:
			return None
	return flt(value)


def _resolve_item_00_01(item_num: Any) -> str | None:
	code = _clean_oracle_num(item_num)
	if not code:
		return None
	if frappe.db.exists("ITEM_00_01", code):
		return code
	stripped = code.lstrip("0")
	if stripped and stripped != code and frappe.db.exists("ITEM_00_01", stripped):
		return stripped
	# ITEM_00_01 may be named by item_num Int field
	try:
		as_int = str(cint(code))
		if as_int and frappe.db.exists("ITEM_00_01", as_int):
			return as_int
	except Exception:
		pass
	return None


def _parse_excel_rows(file_url: str) -> tuple[list[dict], dict[str, int]]:
	rows_iter = _iter_excel_sheet_rows(file_url)
	try:
		header_row, _datemode = next(rows_iter)
	except StopIteration:
		return [], {}

	headers = [_normalize_header(h) for h in header_row]
	parsed: list[dict] = []
	sheet_row_counts: dict[str, int] = {"Sheet 1": 0}

	for raw, datemode in rows_iter:
		if not raw or all(cell is None or str(cell).strip() == "" for cell in raw):
			continue
		row: dict[str, Any] = {}
		for idx, key in enumerate(headers):
			if not key or idx >= len(raw):
				continue
			row[key] = raw[idx]

		trans_no = _cell_text(row.get("trans_num")).strip()
		sr_raw = row.get("sr_num")
		if not trans_no or sr_raw in (None, ""):
			continue

		row["trans_no"] = trans_no
		row["sr_num"] = cint(sr_raw)
		row["item_num"] = _clean_oracle_num(row.get("item_num")) or None
		row["cr_id"] = _clean_oracle_num(row.get("cr_id")) or None
		row["up_id"] = _clean_oracle_num(row.get("up_id")) or None
		row["_datemode"] = datemode
		parsed.append(row)
		sheet_row_counts["Sheet 1"] += 1

	return parsed, sheet_row_counts


def _group_rows_by_trans(rows: list[dict]) -> dict[str, list[dict]]:
	grouped: dict[str, list[dict]] = {}
	for row in rows:
		key = row.get("trans_no") or ""
		if not key:
			continue
		grouped.setdefault(key, []).append(row)
	return grouped


def _build_item_fields(row: dict) -> dict[str, Any]:
	datemode = cint(row.get("_datemode") or 0)
	item_num = row.get("item_num")
	item = _resolve_item_00_01(item_num)

	fields: dict[str, Any] = {
		"sr_num": row.get("sr_num"),
		"item_num": item_num,
		"show_flag": _cell_text(row.get("show_flag")) or None,
		"show_uom": _clean_oracle_num(row.get("show_uom")) or _cell_text(row.get("show_uom")) or None,
		"item_big_uom_num": _clean_oracle_num(row.get("item_big_uom_num"))
		or _cell_text(row.get("item_big_uom_num"))
		or None,
		"item_small_uom_num": _clean_oracle_num(row.get("item_small_uom_num"))
		or _cell_text(row.get("item_small_uom_num"))
		or None,
		"ais_batch_num": _cell_text(row.get("ais_batch_num")) or None,
		"item_vat": _cell_text(row.get("item_vat")) or None,
		"trans_remarks_det": _cell_text(row.get("trans_remarks_det")) or None,
		"remarks_detail": _cell_text(row.get("remarks_detail")) or None,
		"cr_id": row.get("cr_id"),
		"up_id": row.get("up_id"),
	}

	if item:
		fields["item"] = item
		item_name = frappe.db.get_value("ITEM_00_01", item, "item_nam")
		if item_name:
			fields["item_name"] = item_name

	expiry = _parse_date_field(row.get("item_expiry_date"), datemode=datemode)
	if expiry:
		fields["item_expiry_date"] = expiry

	for amount_field in (
		"item_per_pack",
		"item_big_qty",
		"item_big_rate",
		"item_big_amt",
		"item_small_qty",
		"item_small_rate",
		"item_small_amt",
		"stock_qty_big",
		"stock_qty_small",
		"show_qty",
		"show_rate",
		"show_amt",
		"show_rate_pur",
		"show_amt_pur",
		"show_profit_amt",
		"item_vat_amt_big",
		"item_vat_amt_small",
		"show_item_vat_amt",
		"item_big_discount_per",
		"item_big_discount_amt",
		"item_small_discount_per",
		"item_small_discount_amt",
		"show_discount_per",
		"show_discount_amt",
	):
		amount = _amount(row.get(amount_field))
		if amount is not None:
			fields[amount_field] = amount

	for date_field in ("cr_date", "up_date"):
		legacy_date = _format_legacy_datetime(row.get(date_field), datemode=datemode)
		if legacy_date:
			fields[date_field] = legacy_date

	return {key: value for key, value in fields.items() if value not in (None, "")}


def import_items_for_trans(trans_no: str, lines: list[dict]) -> dict:
	if not lines:
		return {"status": "skip_empty", "trans_no": trans_no}

	if not frappe.db.exists(PARENT_DOCTYPE, trans_no):
		return {"status": "skip_no_parent", "trans_no": trans_no}

	doc = frappe.get_doc(PARENT_DOCTYPE, trans_no)
	existing_by_sr = {}
	for child in doc.get(CHILD_TABLE) or []:
		if child.sr_num is None:
			continue
		existing_by_sr[cint(child.sr_num)] = child

	added = updated = skipped = 0
	items_resolved = 0
	for row in lines:
		fields = _build_item_fields(row)
		if fields.get("sr_num") is None:
			skipped += 1
			continue
		if fields.get("item"):
			items_resolved += 1

		sr_num = cint(fields["sr_num"])
		existing_row = existing_by_sr.get(sr_num)
		if existing_row:
			for key, value in fields.items():
				existing_row.set(key, value)
			updated += 1
		else:
			child = doc.append(CHILD_TABLE, {})
			for key, value in fields.items():
				child.set(key, value)
			existing_by_sr[sr_num] = child
			added += 1

	if added == 0 and updated == 0:
		return {
			"status": "skip_no_lines",
			"trans_no": trans_no,
			"skipped": skipped,
		}

	doc.flags.ignore_validate = True
	doc.flags.ignore_links = True
	doc.flags.ignore_mandatory = True
	doc.flags.ignore_permissions = True
	doc.flags.legacy_import = True
	doc.save(ignore_permissions=True)

	return {
		"status": "ok",
		"trans_no": trans_no,
		"added": added,
		"updated": updated,
		"skipped": skipped,
		"items_resolved": items_resolved,
	}


def parse_and_cache_excel(file_url: str) -> dict:
	rows, sheet_row_counts = _parse_excel_rows(file_url)
	grouped = _group_rows_by_trans(rows)
	trans_keys = sorted(grouped.keys())

	# Slim rows for cache
	slim_grouped: dict[str, list[dict]] = {}
	keep = set(EXCEL_HEADER_MAP.values()) | {
		"trans_no",
		"item_num",
		"cr_id",
		"up_id",
		"_datemode",
	}
	for key, lines in grouped.items():
		slim_grouped[key] = [{k: v for k, v in line.items() if k in keep} for line in lines]

	frappe.cache().set_value(CACHE_KEYS["file_url"], file_url, expires_in_sec=CACHE_TTL)
	frappe.cache().set_value(CACHE_KEYS["trans_keys"], trans_keys, expires_in_sec=CACHE_TTL)
	frappe.cache().set_value(
		CACHE_KEYS["grouped"],
		json.dumps(slim_grouped, default=str),
		expires_in_sec=CACHE_TTL,
	)

	linked_parents = 0
	chunk_size = 1000
	for i in range(0, len(trans_keys), chunk_size):
		chunk = trans_keys[i : i + chunk_size]
		linked_parents += len(
			frappe.get_all(PARENT_DOCTYPE, filters={"name": ["in", chunk]}, pluck="name")
		)

	sample_rows = rows[:500]
	resolved_items = sum(1 for row in sample_rows if _resolve_item_00_01(row.get("item_num")))

	return {
		"excel_rows": len(rows),
		"raw_excel_rows": sum(sheet_row_counts.values()),
		"sheets": list(sheet_row_counts.keys()),
		"sheet_row_counts": sheet_row_counts,
		"transactions": len(trans_keys),
		"linked_parents": linked_parents,
		"missing_parents": len(trans_keys) - linked_parents,
		"resolved_items": resolved_items,
		"sample_size": len(sample_rows),
		"sample_trans_nos": trans_keys[:5],
	}


def _load_cached_grouped() -> dict[str, list[dict]]:
	raw = frappe.cache().get_value(CACHE_KEYS["grouped"])
	if not raw:
		return {}
	if isinstance(raw, dict):
		return raw
	return json.loads(raw)


@frappe.whitelist()
def preview_legacy_sales_detail_import(file_url: str) -> dict:
	_require_admin()
	if not (file_url or "").strip():
		frappe.throw(_("Please upload the SALES_DATA_DETAILS Excel file."))
	return parse_and_cache_excel(file_url)


def run_legacy_sales_detail_import_batch(*, offset: int = 0) -> dict:
	trans_keys = frappe.cache().get_value(CACHE_KEYS["trans_keys"]) or []
	grouped = _load_cached_grouped()
	if not trans_keys or not grouped:
		return {"processed": offset, "done": True, "batch_count": 0}

	batch_keys = trans_keys[offset : offset + LEGACY_SALES_DETAIL_IMPORT_BATCH_SIZE]
	if not batch_keys:
		return {"processed": offset, "done": True, "batch_count": 0}

	ok = skip_no_parent = skip_no_lines = 0
	items_added = items_updated = items_skipped = items_resolved = 0
	errors: list[str] = []

	for key in batch_keys:
		lines = grouped.get(key) or []
		try:
			result = import_items_for_trans(key, lines)
			status = result.get("status")
			if status == "ok":
				ok += 1
				items_added += cint(result.get("added", 0))
				items_updated += cint(result.get("updated", 0))
				items_skipped += cint(result.get("skipped", 0))
				items_resolved += cint(result.get("items_resolved", 0))
			elif status == "skip_no_parent":
				skip_no_parent += 1
			elif status == "skip_no_lines":
				skip_no_lines += 1
				items_skipped += cint(result.get("skipped", 0))
		except Exception:
			errors.append(f"{key}: {frappe.get_traceback()}")
			frappe.log_error(title=f"SALES_DATA_DETAILS import failed: {key}")

	frappe.db.commit()
	processed = offset + len(batch_keys)
	return {
		"processed": processed,
		"done": len(batch_keys) < LEGACY_SALES_DETAIL_IMPORT_BATCH_SIZE,
		"batch_count": len(batch_keys),
		"ok": ok,
		"skip_no_parent": skip_no_parent,
		"skip_no_lines": skip_no_lines,
		"items_added": items_added,
		"items_updated": items_updated,
		"items_skipped": items_skipped,
		"items_resolved": items_resolved,
		"errors": len(errors),
	}
