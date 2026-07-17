# Copyright (c) 2026, Healthcare contributors
"""Bulk-import legacy patient/admission signature images from uploaded filenames.

Filename pattern (example): ``190791-2249-SIGNATURE_01.jpg``
- ``190791`` — Patient File No
- ``2249`` — Inpatient Admission case no / name
- ``SIGNATURE_01`` — signature sequence (01, 02, …)

When an admission is found for that patient, rows go on ``Inpatient Admission.e_signatures``.
Otherwise they are stored on ``Patient.patient_document``.
Document Type: Legacy Signature (created if missing). File Name: signature.
"""

from __future__ import annotations

import json
import re

import frappe
from frappe import _
from frappe.utils import cint

BATCH_SIZE = 25
CACHE_TTL = 7200
CACHE_KEYS = {
	"items": "healthcare:data_migration:patient_legacy_signature_import:items",
	"replace": "healthcare:data_migration:patient_legacy_signature_import:replace_existing",
}

DOCUMENT_TYPE_NAME = "Legacy Signature"
FILE_NAME_LABEL = "signature"
IMAGE_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff"})

# 190791-2249-SIGNATURE_01.jpg  (also allows SIGNATURE-01 / signature_1)
_FILENAME_RE = re.compile(
	r"^(\d+)\-([A-Za-z0-9]+)\-SIGNATURE[_\-]?(\d+)",
	re.IGNORECASE,
)


def _require_admin() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def _basename(path: str) -> str:
	return (path or "").replace("\\", "/").split("/")[-1].strip()


def _is_image_filename(filename: str) -> bool:
	basename = _basename(filename).lower()
	if "." not in basename:
		return True
	return any(basename.endswith(ext) for ext in IMAGE_EXTENSIONS)


def parse_legacy_signature_filename(filename: str) -> dict | None:
	"""Parse ``{file_no}-{admission}-SIGNATURE_{nn}`` from a filename."""
	basename = _basename(filename)
	if not basename:
		return None

	stem = basename.rsplit(".", 1)[0] if "." in basename else basename
	match = _FILENAME_RE.match(stem)
	if not match:
		return None

	seq = match.group(3).zfill(2)
	return {
		"file_no": match.group(1),
		"admission_key": match.group(2),
		"signature_seq": seq,
		"signature_label": f"SIGNATURE_{seq}",
		"filename": basename,
	}


def resolve_patient_name(file_no: str) -> str | None:
	file_no = (file_no or "").strip()
	if not file_no:
		return None
	if frappe.db.exists("Patient", file_no):
		return file_no
	return frappe.db.get_value("Patient", {"file_no": file_no}, "name")


def resolve_admission_name(admission_key: str, patient: str | None = None) -> str | None:
	"""Resolve Inpatient Admission by name or case_no; optionally constrain to patient."""
	key = (admission_key or "").strip()
	if not key:
		return None

	name = None
	if frappe.db.exists("Inpatient Admission", key):
		name = key
	else:
		filters = {"case_no": key}
		if patient:
			filters["patient"] = patient
		name = frappe.db.get_value("Inpatient Admission", filters, "name")
		if not name and patient:
			# Retry without patient in case case_no is unique enough, then verify patient
			name = frappe.db.get_value("Inpatient Admission", {"case_no": key}, "name")

	if not name:
		return None

	if patient:
		adm_patient = frappe.db.get_value("Inpatient Admission", name, "patient")
		if adm_patient and adm_patient != patient:
			return None

	return name


def ensure_legacy_signature_document_type() -> str:
	"""Create Document Type ``Legacy Signature`` if it does not exist."""
	if frappe.db.exists("Document Type", DOCUMENT_TYPE_NAME):
		return DOCUMENT_TYPE_NAME
	doc = frappe.get_doc(
		{
			"doctype": "Document Type",
			"document_name": DOCUMENT_TYPE_NAME,
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return DOCUMENT_TYPE_NAME


def _attach_file(file_url: str, doctype: str, name: str, fieldname: str) -> None:
	if not file_url:
		return
	file_name = frappe.db.get_value("File", {"file_url": file_url}, "name")
	if not file_name:
		return
	frappe.db.set_value(
		"File",
		file_name,
		{
			"attached_to_doctype": doctype,
			"attached_to_name": name,
			"attached_to_field": fieldname,
		},
	)


def _row_matches_signature(row, signature_label: str) -> bool:
	label = (signature_label or "").upper()
	for attr in ("document_name", "upload_remarks", "transaction_no", "file_name"):
		val = (getattr(row, attr, None) or "").strip().upper()
		if val and label in val:
			return True
	return False


def _upsert_document_row(
	doc,
	table_field: str,
	*,
	file_url: str,
	signature_label: str,
	admission_key: str | None,
	original_filename: str,
	replace_existing: bool,
) -> str:
	"""Append or replace a Patient Upload Document row on the given parent doc."""
	ensure_legacy_signature_document_type()
	rows = doc.get(table_field) or []
	existing = None
	for row in rows:
		if _row_matches_signature(row, signature_label):
			existing = row
			break

	if existing and not replace_existing:
		return "skip_existing"

	payload = {
		"file_name": FILE_NAME_LABEL,
		"document_type": DOCUMENT_TYPE_NAME,
		"document_name": signature_label,
		"document": file_url,
		"upload_remarks": original_filename or signature_label,
		"transaction_no": (admission_key or "").strip() or None,
	}

	if existing:
		for key, value in payload.items():
			existing.set(key, value)
		return "updated"
	doc.append(table_field, payload)
	return "created"


@frappe.whitelist()
def preview_patient_legacy_signature_filenames(filenames=None) -> dict:
	"""Preview counts from local filenames before upload."""
	_require_admin()
	if isinstance(filenames, str):
		filenames = json.loads(filenames) if filenames.strip() else []
	if not isinstance(filenames, list):
		frappe.throw(_("Expected a list of filenames."))

	valid = 0
	invalid = 0
	patients_found = 0
	patients_missing = 0
	admissions_found = 0
	admissions_missing = 0
	sample_missing_patients: list[str] = []
	sample_missing_admissions: list[str] = []
	seen_patients: set[str] = set()
	seen_admissions: set[str] = set()

	for raw in filenames:
		name = _basename(str(raw or ""))
		if not name:
			continue
		if not _is_image_filename(name):
			invalid += 1
			continue

		parsed = parse_legacy_signature_filename(name)
		if not parsed:
			invalid += 1
			continue

		valid += 1
		file_no = parsed["file_no"]
		adm_key = parsed["admission_key"]

		patient = resolve_patient_name(file_no)
		if file_no not in seen_patients:
			seen_patients.add(file_no)
			if patient:
				patients_found += 1
			else:
				patients_missing += 1
				if len(sample_missing_patients) < 10:
					sample_missing_patients.append(file_no)

		adm_seen_key = f"{file_no}|{adm_key}"
		if adm_seen_key not in seen_admissions:
			seen_admissions.add(adm_seen_key)
			admission = resolve_admission_name(adm_key, patient) if patient else None
			if admission:
				admissions_found += 1
			else:
				admissions_missing += 1
				if len(sample_missing_admissions) < 10:
					sample_missing_admissions.append(f"{file_no}-{adm_key}")

	return {
		"total_filenames": len(filenames),
		"valid_signatures": valid,
		"invalid_filenames": invalid,
		"patients_found": patients_found,
		"patients_missing": patients_missing,
		"admissions_found": admissions_found,
		"admissions_missing": admissions_missing,
		"sample_missing_file_nos": sample_missing_patients,
		"sample_missing_admissions": sample_missing_admissions,
	}


def _import_one_item(item: dict, *, replace_existing: bool = True) -> str:
	filename = item.get("filename") or item.get("file_url") or ""
	file_url = (item.get("file_url") or "").strip()
	if not file_url:
		return "skip_invalid"

	parsed = parse_legacy_signature_filename(filename) or parse_legacy_signature_filename(file_url)
	if not parsed:
		return "skip_invalid"

	patient = resolve_patient_name(parsed["file_no"])
	if not patient:
		return "skip_no_patient"

	admission = resolve_admission_name(parsed["admission_key"], patient)
	signature_label = parsed["signature_label"]

	if admission:
		doc = frappe.get_doc("Inpatient Admission", admission)
		doc.flags.ignore_permissions = True
		doc.flags.skip_editing_lock = True
		result = _upsert_document_row(
			doc,
			"e_signatures",
			file_url=file_url,
			signature_label=signature_label,
			admission_key=parsed["admission_key"],
			original_filename=parsed["filename"],
			replace_existing=replace_existing,
		)
		if result == "skip_existing":
			return "skip_existing"
		doc.save(ignore_permissions=True)
		_attach_file(file_url, "Inpatient Admission", admission, "e_signatures")
		return "uploaded_admission"

	# No matching admission — store on Patient documents table
	doc = frappe.get_doc("Patient", patient)
	doc.flags.ignore_permissions = True
	doc.flags.skip_editing_lock = True
	result = _upsert_document_row(
		doc,
		"patient_document",
		file_url=file_url,
		signature_label=signature_label,
		admission_key=parsed["admission_key"],
		original_filename=parsed["filename"],
		replace_existing=replace_existing,
	)
	if result == "skip_existing":
		return "skip_existing"
	doc.save(ignore_permissions=True)
	_attach_file(file_url, "Patient", patient, "patient_document")
	return "uploaded_patient"


def cache_import_items(items: list[dict], *, replace_existing: bool = True) -> dict:
	ensure_legacy_signature_document_type()
	valid_items = []
	for item in items:
		if not isinstance(item, dict):
			continue
		file_url = (item.get("file_url") or "").strip()
		if not file_url:
			continue
		filename = item.get("filename") or _basename(file_url)
		if not parse_legacy_signature_filename(filename):
			continue
		valid_items.append({"file_url": file_url, "filename": filename})

	frappe.cache().set_value(CACHE_KEYS["items"], valid_items, expires_in_sec=CACHE_TTL)
	frappe.cache().set_value(
		CACHE_KEYS["replace"],
		1 if replace_existing else 0,
		expires_in_sec=CACHE_TTL,
	)
	return preview_patient_legacy_signature_filenames([i["filename"] for i in valid_items])


def run_patient_legacy_signature_import_batch(offset: int = 0) -> dict:
	items = frappe.cache().get_value(CACHE_KEYS["items"]) or []
	replace_existing = bool(cint(frappe.cache().get_value(CACHE_KEYS["replace"]) or 1))

	stats = {
		"processed": offset,
		"uploaded_admission": 0,
		"uploaded_patient": 0,
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
			if result == "uploaded_admission":
				stats["uploaded_admission"] += 1
			elif result == "uploaded_patient":
				stats["uploaded_patient"] += 1
			elif result == "skip_invalid":
				stats["skip_invalid"] += 1
			elif result == "skip_no_patient":
				stats["skip_no_patient"] += 1
			elif result == "skip_existing":
				stats["skip_existing"] += 1
		except Exception:
			stats["errors"] += 1
			frappe.log_error(
				title=f"Legacy signature import failed: {item.get('filename') or item.get('file_url')}"
			)

	frappe.db.commit()
	stats["processed"] = offset + len(batch)
	if stats["processed"] >= len(items):
		stats["done"] = True
	return stats
