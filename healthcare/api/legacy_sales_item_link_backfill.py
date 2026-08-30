"""Backfill Legacy Sales Transaction Item.item from item_num via ITEM_00_01.

Only child rows that already have values, have item_num, and have a blank Item
link are updated. The link is set only when that code exists on ITEM_00_01.
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import cint

from healthcare.api.data_migration_jobs import (
	_acquire_lock,
	_job_progress_key,
	_release_lock,
	_require_admin,
	_set_progress,
)
from healthcare.api.patient_info_import import _clean_oracle_num

JOB = "legacy_sales_item_link_backfill"
BATCH_SIZE = 500
QUEUE_KEY = f"healthcare:data_migration:{JOB}:queue"
ITEM_INDEX_KEY = f"healthcare:data_migration:{JOB}:item_index"
CHILD_DOCTYPE = "Legacy Sales Transaction Item"
ITEM_DOCTYPE = "ITEM_00_01"


def _candidate_sql_where() -> str:
	"""Real child lines with a legacy code but no ITEM_00_01 link."""
	return """
		IFNULL(item, '') = ''
		AND IFNULL(item_num, '') != ''
		AND IFNULL(parent, '') != ''
		AND (
			IFNULL(show_qty, 0) != 0
			OR IFNULL(show_amt, 0) != 0
			OR IFNULL(show_rate, 0) != 0
			OR IFNULL(item_small_qty, 0) != 0
			OR IFNULL(item_big_qty, 0) != 0
			OR IFNULL(ais_batch_num, '') != ''
			OR item_expiry_date IS NOT NULL
			OR IFNULL(item_name, '') != ''
		)
	"""


def _load_item_00_01_index() -> dict[str, dict[str, str]]:
	"""Map code variants → {name, item_nam} for ITEM_00_01."""
	if not frappe.db.exists("DocType", ITEM_DOCTYPE):
		return {}
	rows = frappe.db.sql(
		"""
		SELECT name, item_num, IFNULL(item_nam, '') AS item_nam
		FROM `tabITEM_00_01`
		""",
		as_dict=True,
	)
	index: dict[str, dict[str, str]] = {}
	for row in rows:
		payload = {"name": str(row.name), "item_nam": row.item_nam or ""}
		keys = [
			str(row.name or "").strip(),
			_clean_oracle_num(row.name),
			_clean_oracle_num(row.item_num),
		]
		for key in keys:
			if not key:
				continue
			_index_code(index, key, payload)
	return index


def _index_code(index: dict[str, dict[str, str]], key: str, payload: dict[str, str]) -> None:
	index[key] = payload
	stripped = key.lstrip("0")
	if stripped and stripped != key:
		index.setdefault(stripped, payload)
	try:
		as_int = str(cint(key)) if key else ""
		if as_int and as_int != "0":
			index.setdefault(as_int, payload)
	except Exception:
		pass


def _resolve_from_index(item_num: Any, index: dict[str, dict[str, str]]) -> dict[str, str] | None:
	code = _clean_oracle_num(item_num)
	if not code:
		return None
	if code in index:
		return index[code]
	stripped = code.lstrip("0")
	if stripped and stripped in index:
		return index[stripped]
	try:
		as_int = str(cint(code))
		if as_int and as_int in index:
			return index[as_int]
	except Exception:
		pass
	return None


def _list_candidates(*, limit: int, offset: int = 0) -> list[dict]:
	return frappe.db.sql(
		f"""
		SELECT name, parent, sr_num, item_num, IFNULL(item_name, '') AS item_name
		FROM `tabLegacy Sales Transaction Item`
		WHERE {_candidate_sql_where()}
		ORDER BY parent, sr_num, name
		LIMIT %s OFFSET %s
		""",
		(limit, offset),
		as_dict=True,
	)


def _count_candidates() -> int:
	return cint(
		frappe.db.sql(
			f"""
			SELECT COUNT(*)
			FROM `tabLegacy Sales Transaction Item`
			WHERE {_candidate_sql_where()}
			"""
		)[0][0]
	)


@frappe.whitelist()
def preview_legacy_sales_item_link_backfill() -> dict:
	_require_admin()
	total = _count_candidates()
	sample_rows = _list_candidates(limit=20)
	index = _load_item_00_01_index()

	needs_update = 0
	skipped_unmatched = 0
	sample: list[dict] = []
	unmatched_sample: list[dict] = []

	# Classify a larger slice so preview counts are more useful than the 20-row sample.
	scan_rows = sample_rows if total <= 20 else _list_candidates(limit=min(total, 2000))
	unique_item_nums: set[str] = set()
	unique_resolved: set[str] = set()

	for row in scan_rows:
		code = _clean_oracle_num(row.get("item_num"))
		if code:
			unique_item_nums.add(code)
		resolved = _resolve_from_index(row.get("item_num"), index)
		if not resolved:
			skipped_unmatched += 1
			if len(unmatched_sample) < 8:
				unmatched_sample.append(
					{
						"parent": row.parent,
						"sr_num": row.sr_num,
						"item_num": row.get("item_num") or "",
						"row": row.name,
					}
				)
			continue
		needs_update += 1
		unique_resolved.add(resolved["name"])
		if len(sample) < 8:
			sample.append(
				{
					"parent": row.parent,
					"sr_num": row.sr_num,
					"item_num": row.get("item_num") or "",
					"item": resolved["name"],
					"item_name": resolved.get("item_nam") or "",
					"row": row.name,
				}
			)

	scan_count = len(scan_rows)
	# Scale scan-slice counts to the full candidate total when we only sampled.
	if scan_count and scan_count < total:
		scale = total / scan_count
		est_needs_update = int(round(needs_update * scale))
		est_unmatched = max(total - est_needs_update, 0)
	else:
		est_needs_update = needs_update
		est_unmatched = skipped_unmatched

	return {
		"candidates": total,
		"needs_update": est_needs_update,
		"skipped_unmatched": est_unmatched,
		"item_00_01_count": len({payload["name"] for payload in index.values()}),
		"unique_item_nums_scanned": len(unique_item_nums),
		"unique_item_nums_resolved": len(unique_resolved),
		"scanned": scan_count,
		"counts_are_estimate": bool(scan_count and scan_count < total),
		"sample": sample,
		"unmatched_sample": unmatched_sample,
	}


@frappe.whitelist()
def start_legacy_sales_item_link_backfill() -> dict:
	_require_admin()
	if not _count_candidates():
		return {
			"ok": True,
			"message": _("No Legacy Sales item lines with item_num and a blank Item link."),
		}

	names = [
		row[0]
		for row in frappe.db.sql(
			f"""
			SELECT name
			FROM `tabLegacy Sales Transaction Item`
			WHERE {_candidate_sql_where()}
			ORDER BY parent, sr_num, name
			"""
		)
	]

	_acquire_lock(JOB)
	frappe.cache().set_value(QUEUE_KEY, names, expires_in_sec=60 * 60 * 12)
	frappe.cache().set_value(ITEM_INDEX_KEY, _load_item_00_01_index(), expires_in_sec=60 * 60 * 12)
	_set_progress(
		JOB,
		0,
		updated=0,
		skipped_unmatched=0,
		errors=0,
		total=len(names),
	)
	frappe.enqueue(
		"healthcare.api.legacy_sales_item_link_backfill.process_legacy_sales_item_link_backfill_batch",
		offset=0,
		queue="long",
		timeout=3600,
		job_name="healthcare_legacy_sales_item_link_backfill",
	)
	return {
		"ok": True,
		"message": _(
			"Legacy Sales item link backfill started ({0} lines with item_num and a blank Item)."
		).format(len(names)),
	}


def process_legacy_sales_item_link_backfill_batch(offset: int = 0) -> None:
	try:
		queue = frappe.cache().get_value(QUEUE_KEY) or []
		index = frappe.cache().get_value(ITEM_INDEX_KEY)
		if index is None:
			index = _load_item_00_01_index()
			frappe.cache().set_value(ITEM_INDEX_KEY, index, expires_in_sec=60 * 60 * 12)

		batch = queue[offset : offset + BATCH_SIZE]
		prev = frappe.cache().get_value(_job_progress_key(JOB)) or {}
		updated = cint(prev.get("updated"))
		skipped_unmatched = cint(prev.get("skipped_unmatched"))
		errors = cint(prev.get("errors"))

		if batch:
			rows = frappe.db.sql(
				"""
				SELECT name, item, item_num
				FROM `tabLegacy Sales Transaction Item`
				WHERE name IN %(names)s
				""",
				{"names": batch},
				as_dict=True,
			)
			by_name = {row.name: row for row in rows}
		else:
			by_name = {}

		for name in batch:
			row = by_name.get(name)
			if not row:
				continue
			if (row.get("item") or "").strip():
				continue
			resolved = _resolve_from_index(row.get("item_num"), index)
			if not resolved:
				skipped_unmatched += 1
				continue
			try:
				values = {"item": resolved["name"]}
				if resolved.get("item_nam"):
					values["item_name"] = resolved["item_nam"]
				frappe.db.set_value(
					CHILD_DOCTYPE,
					name,
					values,
					update_modified=False,
				)
				updated += 1
			except Exception:
				errors += 1
				frappe.log_error(
					title="Legacy Sales item link backfill failed",
					message=frappe.get_traceback(),
					reference_doctype=CHILD_DOCTYPE,
					reference_name=name,
				)

		frappe.db.commit()
		processed = offset + len(batch)
		_set_progress(
			JOB,
			processed,
			updated=updated,
			skipped_unmatched=skipped_unmatched,
			errors=errors,
			total=len(queue),
		)

		if processed < len(queue):
			frappe.enqueue(
				"healthcare.api.legacy_sales_item_link_backfill.process_legacy_sales_item_link_backfill_batch",
				offset=processed,
				queue="long",
				timeout=3600,
				job_name=f"healthcare_legacy_sales_item_link_backfill_{processed}",
			)
		else:
			_set_progress(
				JOB,
				processed,
				done=True,
				updated=updated,
				skipped_unmatched=skipped_unmatched,
				errors=errors,
				total=len(queue),
			)
			frappe.cache().delete_value(QUEUE_KEY)
			frappe.cache().delete_value(ITEM_INDEX_KEY)
			_release_lock(JOB)
			frappe.log_error(
				title="Legacy Sales item link backfill complete",
				message=frappe.as_json(
					{
						"updated": updated,
						"skipped_unmatched": skipped_unmatched,
						"errors": errors,
						"processed": processed,
					}
				),
			)
	except Exception:
		frappe.db.rollback()
		_set_progress(JOB, cint(offset), done=True, error=frappe.get_traceback())
		frappe.cache().delete_value(QUEUE_KEY)
		frappe.cache().delete_value(ITEM_INDEX_KEY)
		_release_lock(JOB)
		raise
