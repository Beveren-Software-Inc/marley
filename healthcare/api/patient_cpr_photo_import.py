# Copyright (c) 2026, Healthcare contributors
"""Bulk-import Patient CPR front/back photos from uploaded image filenames."""

from __future__ import annotations

import json
import re

import frappe
from frappe import _
from frappe.utils import cint

BATCH_SIZE = 25
CACHE_TTL = 7200
CACHE_KEYS = {
	"items": "healthcare:data_migration:patient_cpr_photo_import:items",
	"replace": "healthcare:data_migration:patient_cpr_photo_import:replace_existing",
}

IMAGE_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff"})


def _require_admin() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def _basename(path: str) -> str:
	return (path or "").replace("\\", "/").split("/")[-1].strip()


def parse_cpr_photo_filename(filename: str) -> dict | None:
	"""Parse {file_no}-PHOTO_CPR_FRONT|BACK from a filename."""
	basename = _basename(filename)
	if not basename:
		return None

	upper = basename.upper()
	if "CPR" not in upper:
		return None

	side = None
	if re.search(r"CPR.*BACK|BACK.*CPR|PHOTO_CPR_BACK", upper):
		side = "back"
	elif re.search(r"CPR.*FRONT|FRONT.*CPR|PHOTO_CPR_FRONT", upper):
		side = "front"
	if not side:
		return None

	match = re.match(r"^(\d+)-", basename)
	if not match:
		return None

	return {
		"file_no": match.group(1),
		"side": side,
		"filename": basename,
	}


def resolve_patient_name(file_no: str) -> str | None:
	file_no = (file_no or "").strip()
	if not file_no:
		return None
	if frappe.db.exists("Patient", file_no):
		return file_no
	return frappe.db.get_value("Patient", {"file_no": file_no}, "name")


def _is_image_filename(filename: str) -> bool:
	basename = _basename(filename).lower()
	if "." not in basename:
		return True
	return any(basename.endswith(ext) for ext in IMAGE_EXTENSIONS)


@frappe.whitelist()
def preview_patient_cpr_photo_filenames(filenames=None) -> dict:
	"""Preview counts from local filenames before upload."""
	_require_admin()
	if isinstance(filenames, str):
		filenames = json.loads(filenames) if filenames.strip() else []
	if not isinstance(filenames, list):
		frappe.throw(_("Expected a list of filenames."))

	front = 0
	back = 0
	invalid = 0
	patients_found = 0
	patients_missing = 0
	sample_missing: list[str] = []
	seen_file_nos: set[str] = set()

	for raw in filenames:
		name = _basename(str(raw or ""))
		if not name:
			continue
		if not _is_image_filename(name):
			invalid += 1
			continue

		parsed = parse_cpr_photo_filename(name)
		if not parsed:
			invalid += 1
			continue

		if parsed["side"] == "front":
			front += 1
		else:
			back += 1

		file_no = parsed["file_no"]
		if file_no in seen_file_nos:
			continue
		seen_file_nos.add(file_no)
		if resolve_patient_name(file_no):
			patients_found += 1
		else:
			patients_missing += 1
			if len(sample_missing) < 10:
				sample_missing.append(file_no)

	return {
		"total_filenames": len(filenames),
		"front_images": front,
		"back_images": back,
		"invalid_filenames": invalid,
		"patients_found": patients_found,
		"patients_missing": patients_missing,
		"sample_missing_file_nos": sample_missing,
	}


def _attach_file_to_patient(file_url: str, patient: str, fieldname: str) -> None:
	if not file_url:
		return
	file_name = frappe.db.get_value("File", {"file_url": file_url}, "name")
	if not file_name:
		return
	frappe.db.set_value(
		"File",
		file_name,
		{
			"attached_to_doctype": "Patient",
			"attached_to_name": patient,
			"attached_to_field": fieldname,
		},
	)


def _import_one_item(item: dict, *, replace_existing: bool = True) -> str:
	filename = item.get("filename") or item.get("file_url") or ""
	file_url = (item.get("file_url") or "").strip()
	if not file_url:
		return "skip_invalid"

	parsed = parse_cpr_photo_filename(filename) or parse_cpr_photo_filename(file_url)
	if not parsed:
		return "skip_invalid"

	patient = resolve_patient_name(parsed["file_no"])
	if not patient:
		return "skip_no_patient"

	fieldname = "cprigama_front_photo" if parsed["side"] == "front" else "cprigama_back_photo"
	existing = frappe.db.get_value("Patient", patient, fieldname)
	if existing and not replace_existing:
		return "skip_existing"

	doc = frappe.get_doc("Patient", patient)
	doc.flags.ignore_permissions = True
	doc.flags.skip_editing_lock = True
	doc.set(fieldname, file_url)
	doc.save(ignore_permissions=True)
	_attach_file_to_patient(file_url, patient, fieldname)
	return f"uploaded_{parsed['side']}"


def cache_import_items(items: list[dict], *, replace_existing: bool = True) -> dict:
	valid_items = []
	for item in items:
		if not isinstance(item, dict):
			continue
		file_url = (item.get("file_url") or "").strip()
		if not file_url:
			continue
		filename = item.get("filename") or _basename(file_url)
		if not parse_cpr_photo_filename(filename):
			continue
		valid_items.append({"file_url": file_url, "filename": filename})

	frappe.cache().set_value(CACHE_KEYS["items"], valid_items, expires_in_sec=CACHE_TTL)
	frappe.cache().set_value(
		CACHE_KEYS["replace"],
		1 if replace_existing else 0,
		expires_in_sec=CACHE_TTL,
	)
	return preview_patient_cpr_photo_filenames([i["filename"] for i in valid_items])


def run_patient_cpr_photo_import_batch(offset: int = 0) -> dict:
	items = frappe.cache().get_value(CACHE_KEYS["items"]) or []
	replace_existing = bool(cint(frappe.cache().get_value(CACHE_KEYS["replace"]) or 1))

	stats = {
		"processed": offset,
		"uploaded_front": 0,
		"uploaded_back": 0,
		"skip_invalid": 0,
		"skip_no_patient": 0,
		"skip_existing": 0,
		"errors": 0,
		"done": False,
	}

	batch = items[offset : offset + BATCH_SIZE]
	if not batch:
		stats["done"] = True
		stats["processed"] = len(items)
		return stats

	for item in batch:
		try:
			result = _import_one_item(item, replace_existing=replace_existing)
			if result == "uploaded_front":
				stats["uploaded_front"] += 1
			elif result == "uploaded_back":
				stats["uploaded_back"] += 1
			elif result == "skip_invalid":
				stats["skip_invalid"] += 1
			elif result == "skip_no_patient":
				stats["skip_no_patient"] += 1
			elif result == "skip_existing":
				stats["skip_existing"] += 1
		except Exception:
			stats["errors"] += 1
			frappe.log_error(
				title=f"CPR photo import failed: {item.get('filename') or item.get('file_url')}"
			)

	frappe.db.commit()
	stats["processed"] = offset + len(batch)
	if stats["processed"] >= len(items):
		stats["done"] = True
	return stats
