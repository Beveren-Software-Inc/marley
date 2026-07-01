"""Remove duplicate Morse Fall Scale Detail child rows (keep one per text message per parent)."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint

MORSE_FALL_SCALE_DETAIL_DEDUPE_BATCH_SIZE = 100


def _require_admin() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def _detail_dedupe_key(text_message: str | None, points) -> str:
	text = (text_message or "").strip().lower()
	if text:
		return text
	return f"__empty__::{cint(points)}"


def count_duplicate_detail_rows() -> int:
	"""Child rows beyond the first per parent + text message."""
	row = frappe.db.sql(
		"""
		SELECT COALESCE(SUM(cnt - 1), 0) AS extra
		FROM (
			SELECT COUNT(*) AS cnt
			FROM `tabMorse Fall Scale Detail`
			GROUP BY parent, LOWER(TRIM(IFNULL(text_message, ''))), points
			HAVING cnt > 1
		) d
		""",
		as_dict=True,
	)
	return cint((row[0] or {}).get("extra")) if row else 0


def count_parents_with_duplicate_details() -> int:
	row = frappe.db.sql(
		"""
		SELECT COUNT(DISTINCT parent) AS cnt
		FROM (
			SELECT parent
			FROM `tabMorse Fall Scale Detail`
			GROUP BY parent, LOWER(TRIM(IFNULL(text_message, ''))), points
			HAVING COUNT(*) > 1
		) d
		""",
		as_dict=True,
	)
	return cint((row[0] or {}).get("cnt")) if row else 0


def list_parents_with_duplicate_details(*, limit: int, offset: int = 0) -> list[str]:
	rows = frappe.db.sql(
		"""
		SELECT DISTINCT parent
		FROM (
			SELECT parent
			FROM `tabMorse Fall Scale Detail`
			GROUP BY parent, LOWER(TRIM(IFNULL(text_message, ''))), points
			HAVING COUNT(*) > 1
		) dup
		ORDER BY parent
		LIMIT %s OFFSET %s
		""",
		(limit, offset),
		as_dict=True,
	)
	return [row.parent for row in rows if row.parent]


def dedupe_morse_fall_scale_parent(parent: str) -> dict:
	"""Keep the oldest row per text message (+ points); delete the rest."""
	rows = frappe.get_all(
		"Morse Fall Scale Detail",
		filters={"parent": parent},
		fields=["name", "text_message", "points", "idx"],
		order_by="idx asc, creation asc, name asc",
	)
	if not rows:
		return {"deleted": 0, "updated_total": False}

	seen: set[str] = set()
	to_delete: list[str] = []
	for row in rows:
		key = _detail_dedupe_key(row.text_message, row.points)
		if key in seen:
			to_delete.append(row.name)
		else:
			seen.add(key)

	if not to_delete:
		return {"deleted": 0, "updated_total": False}

	frappe.db.delete("Morse Fall Scale Detail", {"name": ("in", to_delete)})

	updated_total = False
	if frappe.db.exists("Morse Fall Scale", parent):
		doc = frappe.get_doc("Morse Fall Scale", parent)
		doc.calculate_total_points()
		doc.db_set("total_points", doc.total_points, update_modified=True)
		updated_total = True

	return {"deleted": len(to_delete), "updated_total": updated_total}


@frappe.whitelist()
def preview_morse_fall_scale_detail_dedupe() -> dict:
	_require_admin()
	rows_to_delete = count_duplicate_detail_rows()
	parents_affected = count_parents_with_duplicate_details()
	return {
		"parents_affected": parents_affected,
		"rows_to_delete": rows_to_delete,
		"sample_parents": list_parents_with_duplicate_details(limit=10),
	}


def run_morse_fall_scale_detail_dedupe_batch(*, offset: int = 0) -> dict:
	# offset unused — always read from start; parents leave the duplicate set after each batch.
	_ = offset
	parents = list_parents_with_duplicate_details(
		limit=MORSE_FALL_SCALE_DETAIL_DEDUPE_BATCH_SIZE,
		offset=0,
	)
	if not parents:
		return {
			"processed": 0,
			"batch_count": 0,
			"done": True,
			"parents_processed": 0,
			"rows_deleted": 0,
			"parents_total_updated": 0,
			"errors": 0,
		}

	stats = {
		"parents_processed": 0,
		"rows_deleted": 0,
		"parents_total_updated": 0,
		"errors": 0,
	}

	for parent in parents:
		try:
			result = dedupe_morse_fall_scale_parent(parent)
			stats["parents_processed"] += 1
			stats["rows_deleted"] += cint(result.get("deleted"))
			if result.get("updated_total"):
				stats["parents_total_updated"] += 1
		except Exception:
			stats["errors"] += 1
			frappe.log_error(
				title="Morse Fall Scale detail dedupe failed",
				message=frappe.as_json({"parent": parent, "error": frappe.get_traceback()}),
			)

	frappe.db.commit()
	done = len(parents) < MORSE_FALL_SCALE_DETAIL_DEDUPE_BATCH_SIZE

	return {
		"processed": len(parents),
		"batch_count": len(parents),
		"done": done,
		**stats,
	}
