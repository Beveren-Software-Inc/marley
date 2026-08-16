"""Fix Patient.is_black_list from PATIENT_INFO_01 Excel (1 = blacklisted, 2 = not)."""

from __future__ import annotations

import json
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint

from healthcare.api.patient_info_import import (
	_blacklist_to_check,
	_parse_excel_rows,
	_require_admin,
)

BATCH_SIZE = 500
CACHE_TTL = 7200
CACHE_KEYS = {
	"file_url": "healthcare:data_migration:patient_blacklist_sync:file_url",
	"file_nos": "healthcare:data_migration:patient_blacklist_sync:file_nos",
	"rows": "healthcare:data_migration:patient_blacklist_sync:rows",
}


def _resolve_patient_name(file_no: str) -> str | None:
	file_no = (file_no or "").strip()
	if not file_no:
		return None
	if frappe.db.exists("Patient", file_no):
		return file_no
	return frappe.db.get_value("Patient", {"file_no": file_no}, "name")


def _sync_one(file_no: str, excel_value: Any) -> str:
	patient_name = _resolve_patient_name(file_no)
	if not patient_name:
		return "skip_no_patient"

	desired = _blacklist_to_check(excel_value)
	current = cint(frappe.db.get_value("Patient", patient_name, "is_black_list") or 0)
	if current == desired:
		return "skip_unchanged"

	values: dict[str, Any] = {"is_black_list": desired}
	if not desired:
		values["blacklist_reason"] = None
	frappe.db.set_value("Patient", patient_name, values, update_modified=False)
	return "set_blacklisted" if desired else "cleared"


def _preview_counts(rows: list[dict]) -> dict[str, Any]:
	excel_blacklisted = 0
	excel_not_blacklisted = 0
	patients_found = 0
	patients_missing = 0
	needs_update = 0
	sample: list[dict] = []

	file_nos = sorted(
		{(row.get("file_no") or "").strip() for row in rows if (row.get("file_no") or "").strip()}
	)
	existing_by_name = set()
	existing_by_file_no: dict[str, str] = {}
	current_flags: dict[str, int] = {}
	if file_nos:
		# Match Patient.name = file_no (common for this import) or Patient.file_no.
		placeholders = ", ".join(["%s"] * len(file_nos))
		name_rows = frappe.db.sql(
			f"""
			SELECT name, IFNULL(file_no, '') AS file_no, IFNULL(is_black_list, 0) AS is_black_list
			FROM `tabPatient`
			WHERE name IN ({placeholders})
			""",
			tuple(file_nos),
			as_dict=True,
		)
		for r in name_rows:
			existing_by_name.add(r.name)
			current_flags[r.name] = cint(r.is_black_list)

		missing_for_file_no = [fn for fn in file_nos if fn not in existing_by_name]
		if missing_for_file_no:
			placeholders2 = ", ".join(["%s"] * len(missing_for_file_no))
			file_rows = frappe.db.sql(
				f"""
				SELECT name, IFNULL(file_no, '') AS file_no, IFNULL(is_black_list, 0) AS is_black_list
				FROM `tabPatient`
				WHERE file_no IN ({placeholders2})
				""",
				tuple(missing_for_file_no),
				as_dict=True,
			)
			for r in file_rows:
				fn = (r.file_no or "").strip()
				if fn and fn not in existing_by_file_no:
					existing_by_file_no[fn] = r.name
					current_flags[r.name] = cint(r.is_black_list)

	for row in rows:
		file_no = (row.get("file_no") or "").strip()
		if not file_no:
			continue
		desired = _blacklist_to_check(row.get("is_black_list"))
		if desired:
			excel_blacklisted += 1
		else:
			excel_not_blacklisted += 1

		patient_name = file_no if file_no in existing_by_name else existing_by_file_no.get(file_no)
		if not patient_name:
			patients_missing += 1
			continue
		patients_found += 1
		current = current_flags.get(patient_name, 0)
		if current == desired:
			continue
		needs_update += 1
		if len(sample) < 8:
			sample.append(
				{
					"file_no": file_no,
					"from": current,
					"to": desired,
					"excel": row.get("is_black_list"),
				}
			)

	return {
		"excel_rows": len(rows),
		"patients": len(file_nos),
		"excel_blacklisted": excel_blacklisted,
		"excel_not_blacklisted": excel_not_blacklisted,
		"patients_found": patients_found,
		"patients_missing": patients_missing,
		"needs_update": needs_update,
		"sample": sample,
		"sample_file_nos": file_nos[:5],
	}


def parse_and_cache_excel(file_url: str) -> dict:
	rows = _parse_excel_rows(file_url)
	by_file_no = {row["file_no"]: row for row in rows if row.get("file_no")}
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
def preview_patient_blacklist_sync(file_url: str) -> dict:
	_require_admin()
	if not (file_url or "").strip():
		frappe.throw(_("Please upload the PATIENT_INFO_01 Excel file."))
	return parse_and_cache_excel(file_url)


def run_patient_blacklist_sync_batch(*, offset: int = 0) -> dict:
	file_nos = frappe.cache().get_value(CACHE_KEYS["file_nos"]) or []
	rows_by_file_no = _load_cached_rows()
	if not file_nos or not rows_by_file_no:
		return {"processed": offset, "done": True, "batch_count": 0}

	batch_keys = file_nos[offset : offset + BATCH_SIZE]
	if not batch_keys:
		return {"processed": offset, "done": True, "batch_count": 0}

	set_blacklisted = cleared = skip_no_patient = skip_unchanged = 0
	errors = 0

	for file_no in batch_keys:
		row = rows_by_file_no.get(file_no) or {}
		try:
			status = _sync_one(file_no, row.get("is_black_list"))
			if status == "set_blacklisted":
				set_blacklisted += 1
			elif status == "cleared":
				cleared += 1
			elif status == "skip_no_patient":
				skip_no_patient += 1
			elif status == "skip_unchanged":
				skip_unchanged += 1
		except Exception:
			errors += 1
			frappe.log_error(title=f"Patient blacklist sync failed: {file_no}")

	frappe.db.commit()
	processed = offset + len(batch_keys)
	return {
		"processed": processed,
		"done": len(batch_keys) < BATCH_SIZE,
		"batch_count": len(batch_keys),
		"set_blacklisted": set_blacklisted,
		"cleared": cleared,
		"skip_no_patient": skip_no_patient,
		"skip_unchanged": skip_unchanged,
		"errors": errors,
	}
