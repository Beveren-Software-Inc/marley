"""Import allergies from PATIENT_INFO_01 Excel into Warning Message records only."""

from __future__ import annotations

import json
from typing import Any

import frappe
from frappe import _

from healthcare.api.patient_info_import import (
	_cell_text,
	_normalize_allergy_text,
	_parse_excel_rows,
	_require_admin,
	sync_legacy_patient_allergy_warning,
)

PATIENT_ALLERGY_WARNING_IMPORT_BATCH_SIZE = 500
CACHE_TTL = 7200
CACHE_KEYS = {
	"file_url": "healthcare:data_migration:patient_allergy_warning_import:file_url",
	"file_nos": "healthcare:data_migration:patient_allergy_warning_import:file_nos",
	"rows": "healthcare:data_migration:patient_allergy_warning_import:rows",
}


def sync_patient_allergy_from_row(row: dict) -> dict:
	file_no = (row.get("file_no") or "").strip()
	if not file_no:
		return {"status": "skip_no_file_no"}

	allergies_text = row.get("allergies")
	if not _normalize_allergy_text(allergies_text):
		return {"status": "skip_empty_allergy", "file_no": file_no}

	if not frappe.db.exists("Patient", file_no):
		return {"status": "skip_no_patient", "file_no": file_no}

	allergy_status = sync_legacy_patient_allergy_warning(file_no, allergies_text)

	if allergy_status in ("created", "updated"):
		frappe.db.set_value(
			"Patient",
			file_no,
			"allergies",
			_cell_text(allergies_text),
			update_modified=False,
		)

	return {
		"status": allergy_status,
		"file_no": file_no,
		"allergy_warning": allergy_status,
	}


def _preview_counts(rows: list[dict]) -> dict[str, Any]:
	with_allergies = 0
	patients_found = 0
	patients_missing = 0

	for row in rows:
		if not _normalize_allergy_text(row.get("allergies")):
			continue
		with_allergies += 1
		file_no = (row.get("file_no") or "").strip()
		if frappe.db.exists("Patient", file_no):
			patients_found += 1
		else:
			patients_missing += 1

	file_nos = sorted({row["file_no"] for row in rows if row.get("file_no")})
	return {
		"excel_rows": len(rows),
		"patients": len(file_nos),
		"with_allergies": with_allergies,
		"patients_found": patients_found,
		"patients_missing": patients_missing,
		"sample_file_nos": file_nos[:5],
	}


def parse_and_cache_excel(file_url: str) -> dict:
	rows = _parse_excel_rows(file_url)
	by_file_no = {row["file_no"]: row for row in rows}
	file_nos = sorted(by_file_no.keys())

	frappe.cache().set_value(CACHE_KEYS["file_url"], file_url, expires_in_sec=CACHE_TTL)
	frappe.cache().set_value(CACHE_KEYS["file_nos"], file_nos, expires_in_sec=CACHE_TTL)
	frappe.cache().set_value(
		CACHE_KEYS["rows"],
		json.dumps(by_file_no, default=str),
		expires_in_sec=CACHE_TTL,
	)

	return _preview_counts(rows)


def _load_cached_rows() -> dict[str, dict]:
	raw = frappe.cache().get_value(CACHE_KEYS["rows"])
	if not raw:
		return {}
	if isinstance(raw, dict):
		return raw
	return json.loads(raw)


@frappe.whitelist()
def preview_patient_allergy_warning_import(file_url: str) -> dict:
	_require_admin()
	if not (file_url or "").strip():
		frappe.throw(_("Please upload the PATIENT_INFO_01 Excel file."))
	return parse_and_cache_excel(file_url)


def run_patient_allergy_warning_import_batch(*, offset: int = 0) -> dict:
	file_nos = frappe.cache().get_value(CACHE_KEYS["file_nos"]) or []
	rows_by_file_no = _load_cached_rows()
	if not file_nos or not rows_by_file_no:
		return {"processed": offset, "done": True, "batch_count": 0}

	batch_keys = file_nos[offset : offset + PATIENT_ALLERGY_WARNING_IMPORT_BATCH_SIZE]
	if not batch_keys:
		return {"processed": offset, "done": True, "batch_count": 0}

	created = updated = skip_empty_allergy = skip_no_patient = skip_unchanged = 0
	errors: list[str] = []

	for file_no in batch_keys:
		row = rows_by_file_no.get(file_no) or {}
		try:
			result = sync_patient_allergy_from_row(row)
			status = result.get("status")
			if status == "created":
				created += 1
			elif status == "updated":
				updated += 1
			elif status == "skip_empty_allergy":
				skip_empty_allergy += 1
			elif status == "skip_no_patient":
				skip_no_patient += 1
			elif status == "skip_unchanged":
				skip_unchanged += 1
		except Exception:
			errors.append(f"{file_no}: {frappe.get_traceback()}")
			frappe.log_error(title=f"PATIENT_INFO_01 allergy import failed: {file_no}")

	frappe.db.commit()
	processed = offset + len(batch_keys)
	return {
		"processed": processed,
		"done": len(batch_keys) < PATIENT_ALLERGY_WARNING_IMPORT_BATCH_SIZE,
		"batch_count": len(batch_keys),
		"created": created,
		"updated": updated,
		"skip_empty_allergy": skip_empty_allergy,
		"skip_no_patient": skip_no_patient,
		"skip_unchanged": skip_unchanged,
		"errors": len(errors),
	}
