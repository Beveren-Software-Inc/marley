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


def _ensure_parent_transaction(trans_no: str, lines: list[dict] | None = None) -> tuple[Any, bool]:
	"""Return (doc, created). Create a stub Legacy Sales Transactions header if missing."""
	if frappe.db.exists(PARENT_DOCTYPE, trans_no):
		return frappe.get_doc(PARENT_DOCTYPE, trans_no), False

	# Seed header fields from the first detail line when available.
	first = (lines or [{}])[0] if lines else {}
	fields: dict[str, Any] = {"doctype": PARENT_DOCTYPE, "trans_no": trans_no}
	trans_type = _cell_text(first.get("trans_type_num")) or _clean_oracle_num(first.get("trans_type_num"))
	if trans_type:
		fields["trans_type_num"] = trans_type
	for date_field in ("cr_date", "up_date"):
		legacy_date = _format_legacy_datetime(
			first.get(date_field),
			datemode=cint(first.get("_datemode") or 0),
		)
		if legacy_date:
			fields[date_field] = legacy_date
	cr_id = _cell_text(first.get("cr_id"))
	if cr_id:
		fields["cr_id"] = cr_id
	up_id = _cell_text(first.get("up_id"))
	if up_id:
		fields["up_id"] = up_id

	doc = frappe.get_doc(fields)
	doc.flags.ignore_validate = True
	doc.flags.ignore_links = True
	doc.flags.ignore_mandatory = True
	doc.flags.ignore_permissions = True
	doc.flags.legacy_import = True
	doc.insert(ignore_permissions=True)
	return doc, True


def import_items_for_trans(trans_no: str, lines: list[dict]) -> dict:
	if not lines:
		return {"status": "skip_empty", "trans_no": trans_no}

	doc, parent_created = _ensure_parent_transaction(trans_no, lines)
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
			"parent_created": 1 if parent_created else 0,
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
		"parent_created": 1 if parent_created else 0,
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

	ok = skip_no_lines = 0
	parents_created = 0
	items_added = items_updated = items_skipped = items_resolved = 0
	errors: list[str] = []

	for key in batch_keys:
		lines = grouped.get(key) or []
		try:
			result = import_items_for_trans(key, lines)
			status = result.get("status")
			parents_created += cint(result.get("parent_created", 0))
			if status == "ok":
				ok += 1
				items_added += cint(result.get("added", 0))
				items_updated += cint(result.get("updated", 0))
				items_skipped += cint(result.get("skipped", 0))
				items_resolved += cint(result.get("items_resolved", 0))
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
		"parents_created": parents_created,
		"skip_no_parent": 0,
		"skip_no_lines": skip_no_lines,
		"items_added": items_added,
		"items_updated": items_updated,
		"items_skipped": items_skipped,
		"items_resolved": items_resolved,
		"errors": len(errors),
	}


DETAIL_ANALYSIS_REASONS = {
	"parent_missing": "No Legacy Sales Transactions header for this TRANS_NUM",
	"line_not_imported": "Header exists but this SR_NUM line is missing from items",
	"item_unresolved": "ITEM_NUM present but ITEM_00_01 link not resolved on the child row",
	"line_count_mismatch": "Excel line count for TRANS_NUM differs from items on the document",
}


def _existing_parent_names(trans_nos: list[str]) -> set[str]:
	existing: set[str] = set()
	chunk_size = 1000
	for i in range(0, len(trans_nos), chunk_size):
		chunk = trans_nos[i : i + chunk_size]
		if not chunk:
			continue
		existing.update(
			frappe.get_all(PARENT_DOCTYPE, filters={"name": ["in", chunk]}, pluck="name")
		)
	return existing


def _child_rows_by_parent(trans_nos: list[str]) -> tuple[dict[str, set[int]], dict[tuple[str, int], dict]]:
	"""Return ({parent: {sr_num}}, {(parent, sr_num): {item, item_num}})."""
	by_parent: dict[str, set[int]] = {}
	by_key: dict[tuple[str, int], dict] = {}
	chunk_size = 1000
	for i in range(0, len(trans_nos), chunk_size):
		chunk = trans_nos[i : i + chunk_size]
		if not chunk:
			continue
		rows = frappe.db.sql(
			"""
			SELECT parent, sr_num, item, item_num
			FROM `tabLegacy Sales Transaction Item`
			WHERE parent IN %(parents)s
			""",
			{"parents": chunk},
			as_dict=True,
		)
		for row in rows:
			sr = cint(row.sr_num)
			by_parent.setdefault(row.parent, set()).add(sr)
			by_key[(row.parent, sr)] = {
				"item": row.item or "",
				"item_num": row.item_num or "",
			}
	return by_parent, by_key


def _write_legacy_sales_detail_analysis_csv(detailed: list[dict], label: str) -> str | None:
	if not detailed:
		return None
	import csv
	import os

	stamp = frappe.utils.now().replace(" ", "_").replace(":", "-")
	file_name = f"legacy_sales_detail_analysis_{label}_{stamp}.csv"
	files_dir = frappe.get_site_path("private", "files")
	os.makedirs(files_dir, exist_ok=True)
	disk_path = os.path.join(files_dir, file_name)

	with open(disk_path, "w", newline="", encoding="utf-8") as fh:
		writer = csv.writer(fh)
		writer.writerow(
			[
				"TRANS_NUM",
				"SR_NUM",
				"ITEM_NUM",
				"SHOW_QTY",
				"SHOW_AMT",
				"STATUS",
				"DETAIL",
				"EXCEL_LINE_COUNT",
				"DB_LINE_COUNT",
			]
		)
		for item in detailed:
			writer.writerow(
				[
					item.get("trans_no") or "",
					item.get("sr_num", ""),
					item.get("item_num") or "",
					item.get("show_qty") or "",
					item.get("show_amt") or "",
					item.get("status") or "",
					item.get("detail") or "",
					item.get("excel_line_count", ""),
					item.get("db_line_count", ""),
				]
			)

	file_url = f"/private/files/{file_name}"
	frappe.get_doc(
		{
			"doctype": "File",
			"file_name": file_name,
			"file_url": file_url,
			"is_private": 1,
			"folder": "Home",
		}
	).insert(ignore_permissions=True)
	return file_url


@frappe.whitelist()
def analyze_legacy_sales_detail_import(file_url: str) -> dict:
	"""Compare SALES_DATA_DETAILS Excel against Legacy Sales Transaction Item lines.

	Reports missing parents, missing SR_NUM lines, unresolved ITEM_00_01 links,
	and per-transaction line-count mismatches.
	"""
	_require_admin()
	if not (file_url or "").strip():
		frappe.throw(_("Please upload the SALES_DATA_DETAILS Excel file."))

	rows, sheet_row_counts = _parse_excel_rows(file_url)
	grouped = _group_rows_by_trans(rows)
	trans_keys = sorted(grouped.keys())
	raw_excel_rows = sum(sheet_row_counts.values())

	existing_parents = _existing_parent_names(trans_keys)
	if existing_parents:
		db_sr_by_parent, child_links = _child_rows_by_parent(list(existing_parents))
	else:
		db_sr_by_parent, child_links = {}, {}

	line_ok: list[dict] = []
	parent_missing: list[dict] = []
	line_not_imported: list[dict] = []
	item_unresolved: list[dict] = []
	line_count_mismatch: list[dict] = []
	seen_mismatch: set[str] = set()

	for trans_no, lines in grouped.items():
		excel_count = len(lines)
		db_srs = db_sr_by_parent.get(trans_no) or set()
		db_count = len(db_srs)

		if trans_no not in existing_parents:
			for row in lines:
				parent_missing.append(
					{
						"trans_no": trans_no,
						"sr_num": row.get("sr_num"),
						"item_num": row.get("item_num") or "",
						"show_qty": _cell_text(row.get("show_qty")),
						"show_amt": _cell_text(row.get("show_amt")),
						"status": "parent_missing",
						"detail": DETAIL_ANALYSIS_REASONS["parent_missing"],
						"excel_line_count": excel_count,
						"db_line_count": 0,
					}
				)
			continue

		if excel_count != db_count and trans_no not in seen_mismatch:
			seen_mismatch.add(trans_no)
			line_count_mismatch.append(
				{
					"trans_no": trans_no,
					"sr_num": "",
					"item_num": "",
					"show_qty": "",
					"show_amt": "",
					"status": "line_count_mismatch",
					"detail": (
						f"{DETAIL_ANALYSIS_REASONS['line_count_mismatch']} "
						f"(excel={excel_count}, db={db_count})"
					),
					"excel_line_count": excel_count,
					"db_line_count": db_count,
				}
			)

		for row in lines:
			sr_num = cint(row.get("sr_num"))
			base = {
				"trans_no": trans_no,
				"sr_num": sr_num,
				"item_num": row.get("item_num") or "",
				"show_qty": _cell_text(row.get("show_qty")),
				"show_amt": _cell_text(row.get("show_amt")),
				"excel_line_count": excel_count,
				"db_line_count": db_count,
			}

			if sr_num not in db_srs:
				line_not_imported.append(
					{
						**base,
						"status": "line_not_imported",
						"detail": DETAIL_ANALYSIS_REASONS["line_not_imported"],
					}
				)
				continue

			child = child_links.get((trans_no, sr_num)) or {}
			excel_item = (row.get("item_num") or "").strip()
			if excel_item and not (child.get("item") or "").strip():
				item_unresolved.append(
					{
						**base,
						"status": "item_unresolved",
						"detail": DETAIL_ANALYSIS_REASONS["item_unresolved"],
					}
				)

			line_ok.append(
				{
					**base,
					"status": "line_imported_ok",
					"detail": "Item line present on Legacy Sales Transactions",
				}
			)

	issues = parent_missing + line_not_imported + item_unresolved + line_count_mismatch

	return {
		"excel_detail_rows": len(rows),
		"raw_excel_rows": raw_excel_rows,
		"sheet_row_counts": sheet_row_counts,
		"excel_transactions": len(trans_keys),
		"parents_found": len(existing_parents),
		"parents_missing": len(trans_keys) - len(existing_parents),
		"lines_imported": len(line_ok),
		"lines_not_imported": len(line_not_imported),
		"parent_missing_lines": len(parent_missing),
		"item_unresolved": len(item_unresolved),
		"line_count_mismatch": len(line_count_mismatch),
		"reason_labels": DETAIL_ANALYSIS_REASONS,
		"samples": {
			"parent_missing": list({i["trans_no"] for i in parent_missing})[:15],
			"line_not_imported": [f"{i['trans_no']}/{i['sr_num']}" for i in line_not_imported[:15]],
			"item_unresolved": [f"{i['trans_no']}/{i['sr_num']}" for i in item_unresolved[:15]],
			"line_count_mismatch": [i["trans_no"] for i in line_count_mismatch[:15]],
		},
		"csv_file_url": _write_legacy_sales_detail_analysis_csv(issues, "issues"),
		"csv_ok_file_url": _write_legacy_sales_detail_analysis_csv(line_ok, "ok"),
	}
