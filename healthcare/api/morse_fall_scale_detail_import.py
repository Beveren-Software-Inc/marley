"""Backfill Morse Fall Scale child table rows from MORSE_FALL_SCALE_01 staging.

Oracle exported text_message_1..7 and get_points_1..7 as flat columns; staging
DocType MORSE_FALL_SCALE_01 keeps that shape. This job finds the matching Morse
Fall Scale (by trans_num / admission + patient), replaces morse_fall_scale_detail,
and recalculates total_points only.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint, strip_html

MORSE_FALL_SCALE_DETAIL_IMPORT_BATCH_SIZE = 200

_DETAIL_FIELD_PAIRS = tuple(
	(f"text_message_{i}", f"get_points_{i}") for i in range(1, 8)
)


def _require_admin():
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def _resolve_inpatient_admission(admission_value: str | None) -> str | None:
	value = (admission_value or "").strip()
	if not value:
		return None
	if frappe.db.exists("Inpatient Admission", value):
		return value
	for field in ("admission_no_old", "case_no"):
		name = frappe.db.get_value("Inpatient Admission", {field: value}, "name")
		if name:
			return name
	return None


def _text_value(value) -> str:
	if not value:
		return ""
	if isinstance(value, str):
		return strip_html(value).strip()
	return str(value).strip()


def _detail_rows_from_staging(staging_row: dict) -> list[dict]:
	rows: list[dict] = []
	for text_field, points_field in _DETAIL_FIELD_PAIRS:
		text = _text_value(staging_row.get(text_field))
		points = cint(staging_row.get(points_field))
		if not text and not points:
			continue
		rows.append({"text_message": text, "points": points})
	return rows


def _find_morse_fall_scale(staging_row: dict) -> tuple[str | None, str | None]:
	"""Return (Morse Fall Scale name, unresolved reason)."""
	trans_num = (staging_row.get("trans_num") or staging_row.get("name") or "").strip()
	admission = _resolve_inpatient_admission(staging_row.get("admission_num"))
	patient = (staging_row.get("patient_num") or "").strip()
	if patient and not frappe.db.exists("Patient", patient):
		patient = ""

	if not admission or not patient:
		return None, "missing_patient_or_admission"

	if trans_num:
		if frappe.db.exists("Morse Fall Scale", trans_num):
			return trans_num, None
		by_trans = frappe.db.get_value("Morse Fall Scale", {"trans_no": trans_num}, "name")
		if by_trans:
			return by_trans, None

	names = frappe.get_all(
		"Morse Fall Scale",
		filters={"admission_no": admission, "patient_no": patient},
		pluck="name",
		order_by="creation desc",
		limit=1,
	)
	if names:
		return names[0], None

	return None, "morse_not_found"


def _fetch_staging_rows(offset: int = 0, limit: int = MORSE_FALL_SCALE_DETAIL_IMPORT_BATCH_SIZE) -> list[dict]:
	fields = ["name", "trans_num", "admission_num", "patient_num", "total_points"]
	fields.extend(field for pair in _DETAIL_FIELD_PAIRS for field in pair)
	return frappe.get_all(
		"MORSE_FALL_SCALE_01",
		fields=fields,
		limit_page_length=limit,
		limit_start=offset,
		order_by="creation asc",
	)


@frappe.whitelist()
def preview_morse_fall_scale_detail_import() -> dict:
	_require_admin()
	rows = frappe.get_all(
		"MORSE_FALL_SCALE_01",
		fields=["name", "trans_num", "admission_num", "patient_num"],
	)
	resolvable = 0
	missing_patient_or_admission = 0
	morse_not_found = 0
	for row in rows:
		name, reason = _find_morse_fall_scale(row)
		if name:
			resolvable += 1
		elif reason == "missing_patient_or_admission":
			missing_patient_or_admission += 1
		else:
			morse_not_found += 1
	return {
		"staging_rows": len(rows),
		"resolvable": resolvable,
		"unresolved": len(rows) - resolvable,
		"missing_patient_or_admission": missing_patient_or_admission,
		"morse_not_found": morse_not_found,
	}


def _apply_staging_row(staging_row: dict) -> str:
	"""Update one Morse Fall Scale. Returns status: updated | skipped | unresolved_*."""
	morse_name, reason = _find_morse_fall_scale(staging_row)
	if not morse_name:
		return f"unresolved_{reason or 'unknown'}"

	detail_rows = _detail_rows_from_staging(staging_row)
	if not detail_rows:
		return "skipped_empty_details"

	doc = frappe.get_doc("Morse Fall Scale", morse_name)
	doc.set("morse_fall_scale_detail", [])
	for row in detail_rows:
		doc.append("morse_fall_scale_detail", row)

	doc.calculate_total_points()
	staging_total = cint(staging_row.get("total_points"))
	if staging_total and doc.total_points != staging_total:
		doc.total_points = staging_total

	doc.save(ignore_permissions=True)
	return "updated"


def run_morse_fall_scale_detail_import_batch(*, offset: int = 0) -> dict:
	rows = _fetch_staging_rows(offset=offset)
	if not rows:
		return {
			"processed": offset,
			"batch_count": 0,
			"done": True,
			"updated": 0,
			"skipped_empty_details": 0,
			"unresolved_missing_patient_or_admission": 0,
			"unresolved_morse_not_found": 0,
		}

	stats = {
		"updated": 0,
		"skipped_empty_details": 0,
		"unresolved_missing_patient_or_admission": 0,
		"unresolved_morse_not_found": 0,
	}

	for row in rows:
		try:
			status = _apply_staging_row(row)
			if status in stats:
				stats[status] += 1
			elif status.startswith("unresolved_"):
				key = status
				stats[key] = stats.get(key, 0) + 1
		except Exception:
			frappe.log_error(
				title="Morse Fall Scale detail import row failed",
				message=frappe.as_json(
					{
						"staging": row.get("name"),
						"trans_num": row.get("trans_num"),
						"error": frappe.get_traceback(),
					}
				),
			)

	frappe.db.commit()
	processed = offset + len(rows)
	done = len(rows) < MORSE_FALL_SCALE_DETAIL_IMPORT_BATCH_SIZE
	return {
		"processed": processed,
		"batch_count": len(rows),
		"done": done,
		**stats,
	}
