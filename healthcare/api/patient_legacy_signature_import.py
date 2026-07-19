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
		# Attach-only import — skip admission business rules (e.g. duplicate active admission).
		doc.flags.ignore_permissions = True
		doc.flags.ignore_validate = True
		doc.flags.ignore_mandatory = True
		doc.flags.ignore_links = True
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
	doc.flags.ignore_validate = True
	doc.flags.ignore_mandatory = True
	doc.flags.ignore_links = True
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


def _document_rows_have_signature(parent_doctype: str, parent_name: str, signature_label: str, filename: str) -> dict | None:
	"""Return matching document child row dict if signature is linked on parent."""
	table = "e_signatures" if parent_doctype == "Inpatient Admission" else "patient_document"
	# Child table Patient Upload Document
	rows = frappe.get_all(
		"Patient Upload Document",
		filters={"parenttype": parent_doctype, "parent": parent_name, "parentfield": table},
		fields=[
			"name",
			"file_name",
			"document_type",
			"document_name",
			"document",
			"upload_remarks",
			"transaction_no",
		],
		limit=200,
	)
	label = (signature_label or "").upper()
	fname = (filename or "").upper()
	for row in rows:
		blob = " ".join(
			str(row.get(k) or "")
			for k in ("document_name", "upload_remarks", "transaction_no", "file_name", "document")
		).upper()
		if label and label in blob:
			return row
		if fname and fname in blob:
			return row
		# Legacy Signature document type with any signature-ish remarks
		if (row.get("document_type") or "") == DOCUMENT_TYPE_NAME and filename:
			if _basename(row.get("document") or "").upper() == fname:
				return row
	return None


def _patient_has_any_legacy_signature(patient: str) -> bool:
	"""True if Patient.patient_document or any admission e_signatures has Legacy Signature / SIGNATURE_*."""
	if frappe.db.exists(
		"Patient Upload Document",
		{
			"parenttype": "Patient",
			"parent": patient,
			"parentfield": "patient_document",
			"document_type": DOCUMENT_TYPE_NAME,
		},
	):
		return True
	# Any upload_remarks / document_name containing SIGNATURE
	found = frappe.db.sql(
		"""
		SELECT name FROM `tabPatient Upload Document`
		WHERE parenttype = 'Patient' AND parent = %s AND parentfield = 'patient_document'
		  AND (
			UPPER(IFNULL(document_name, '')) LIKE '%%SIGNATURE%%'
			OR UPPER(IFNULL(upload_remarks, '')) LIKE '%%SIGNATURE%%'
			OR UPPER(IFNULL(file_name, '')) LIKE '%%SIGNATURE%%'
		  )
		LIMIT 1
		""",
		patient,
	)
	if found:
		return True

	admissions = frappe.get_all("Inpatient Admission", filters={"patient": patient}, pluck="name")
	if not admissions:
		return False
	found = frappe.db.sql(
		"""
		SELECT name FROM `tabPatient Upload Document`
		WHERE parenttype = 'Inpatient Admission'
		  AND parent IN %(parents)s
		  AND parentfield = 'e_signatures'
		  AND (
			document_type = %(dtype)s
			OR UPPER(IFNULL(document_name, '')) LIKE '%%SIGNATURE%%'
			OR UPPER(IFNULL(upload_remarks, '')) LIKE '%%SIGNATURE%%'
			OR UPPER(IFNULL(file_name, '')) LIKE '%%SIGNATURE%%'
		  )
		LIMIT 1
		""",
		{"parents": admissions, "dtype": DOCUMENT_TYPE_NAME},
	)
	return bool(found)


def _write_signature_analysis_csv(rows: list[dict], suffix: str) -> str | None:
	if not rows:
		return None
	import csv
	import os

	stamp = frappe.utils.now().replace(" ", "_").replace(":", "-")
	file_name = f"legacy_signature_analysis_{suffix}_{stamp}.csv"
	files_dir = frappe.get_site_path("private", "files")
	os.makedirs(files_dir, exist_ok=True)
	disk_path = os.path.join(files_dir, file_name)

	with open(disk_path, "w", newline="", encoding="utf-8") as fh:
		writer = csv.writer(fh)
		writer.writerow(
			[
				"FILE_NO",
				"PATIENT",
				"PATIENT_NAME",
				"ADMISSION_KEY",
				"ADMISSION",
				"SIGNATURE_LABEL",
				"FILENAME",
				"STATUS",
				"DETAIL",
				"DOCUMENT_URL",
			]
		)
		for item in rows:
			writer.writerow(
				[
					item.get("file_no") or "",
					item.get("patient") or "",
					item.get("patient_name") or "",
					item.get("admission_key") or "",
					item.get("admission") or "",
					item.get("signature_label") or "",
					item.get("filename") or "",
					item.get("status") or "",
					item.get("detail") or "",
					item.get("document_url") or "",
				]
			)

	file_url = f"/private/files/{file_name}"
	if not frappe.db.exists("File", {"file_url": file_url}):
		frappe.get_doc(
			{
				"doctype": "File",
				"file_name": file_name,
				"file_url": file_url,
				"is_private": 1,
				"folder": "Home/Attachments",
			}
		).insert(ignore_permissions=True)
		frappe.db.commit()
	return file_url


@frappe.whitelist()
def analyze_patient_legacy_signatures(filenames=None) -> dict:
	"""Analyze legacy signature import coverage.

	Pass folder filenames (same as Direct Upload) to find which signatures were not
	attached. Also finds File rows that look like legacy signatures but are not linked
	to Patient / Inpatient Admission document tables (patient had a signature file that
	was never uploaded into e_signatures / patient_document).
	"""
	_require_admin()
	if isinstance(filenames, str):
		filenames = json.loads(filenames) if filenames.strip() else []
	if filenames is None:
		filenames = []
	if not isinstance(filenames, list):
		frappe.throw(_("Expected a list of filenames."))

	uploaded_ok: list[dict] = []
	not_uploaded: list[dict] = []
	no_patient: list[dict] = []
	broken_file: list[dict] = []
	invalid = 0
	seen: set[str] = set()

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

		key = f"{parsed['file_no']}|{parsed['admission_key']}|{parsed['signature_label']}"
		if key in seen:
			continue
		seen.add(key)

		patient = resolve_patient_name(parsed["file_no"])
		base = {
			"file_no": parsed["file_no"],
			"admission_key": parsed["admission_key"],
			"signature_label": parsed["signature_label"],
			"filename": parsed["filename"],
		}
		if not patient:
			no_patient.append(
				{
					**base,
					"patient": "",
					"patient_name": "",
					"admission": "",
					"status": "no_patient",
					"detail": "Patient File No not found",
					"document_url": "",
				}
			)
			continue

		patient_name = frappe.db.get_value("Patient", patient, "patient_name") or ""
		admission = resolve_admission_name(parsed["admission_key"], patient)
		base.update({"patient": patient, "patient_name": patient_name, "admission": admission or ""})

		match = None
		if admission:
			match = _document_rows_have_signature(
				"Inpatient Admission", admission, parsed["signature_label"], parsed["filename"]
			)
		if not match:
			match = _document_rows_have_signature(
				"Patient", patient, parsed["signature_label"], parsed["filename"]
			)

		if not match:
			not_uploaded.append(
				{
					**base,
					"status": "not_uploaded",
					"detail": (
						"No matching e_signatures / patient_document row"
						+ (f" (admission {admission})" if admission else " (no admission — expected on Patient)")
					),
					"document_url": "",
				}
			)
			continue

		doc_url = (match.get("document") or "").strip()
		# Non-empty Attach URL = import linked the signature. Do not flag broken
		# solely because tabFile URL differs (Oracle_Signatures* prefix) or disk
		# path is missing on this site — those were false positives.
		if not doc_url:
			broken_file.append(
				{
					**base,
					"status": "broken_file",
					"detail": "Document row exists but attachment URL is empty",
					"document_url": "",
				}
			)
			continue

		uploaded_ok.append(
			{
				**base,
				"status": "uploaded_ok",
				"detail": f"Found on {'admission' if admission else 'patient'}",
				"document_url": doc_url,
			}
		)

	# Files that look like legacy signatures but were never linked into document tables
	orphan_files: list[dict] = []
	file_rows = frappe.db.sql(
		"""
		SELECT name, file_name, file_url, attached_to_doctype, attached_to_name, attached_to_field
		FROM `tabFile`
		WHERE UPPER(IFNULL(file_name, '')) LIKE '%%SIGNATURE%%'
		   OR UPPER(IFNULL(file_url, '')) LIKE '%%SIGNATURE%%'
		LIMIT 20000
		""",
		as_dict=True,
	)
	for frow in file_rows:
		parsed = parse_legacy_signature_filename(frow.file_name or "") or parse_legacy_signature_filename(
			frow.file_url or ""
		)
		if not parsed:
			continue
		patient = resolve_patient_name(parsed["file_no"])
		if not patient:
			continue
		admission = resolve_admission_name(parsed["admission_key"], patient)
		match = None
		if admission:
			match = _document_rows_have_signature(
				"Inpatient Admission", admission, parsed["signature_label"], parsed["filename"]
			)
		if not match:
			match = _document_rows_have_signature(
				"Patient", patient, parsed["signature_label"], parsed["filename"]
			)
		if match:
			continue
		# Patient exists and file exists, but signature was never put on document table
		orphan_files.append(
			{
				"file_no": parsed["file_no"],
				"patient": patient,
				"patient_name": frappe.db.get_value("Patient", patient, "patient_name") or "",
				"admission_key": parsed["admission_key"],
				"admission": admission or "",
				"signature_label": parsed["signature_label"],
				"filename": parsed["filename"],
				"status": "file_present_not_linked",
				"detail": (
					"Signature File exists for this patient but is not on e_signatures / patient_document"
					+ (f"; File attached_to={frow.attached_to_doctype or '—'} {frow.attached_to_name or ''}")
				),
				"document_url": frow.file_url or "",
			}
		)

	# Patients that have a signature File / orphan but no document row — sample unique patients
	patients_with_unlinked = sorted({o["patient"] for o in orphan_files if o.get("patient")})

	issue_rows = not_uploaded + no_patient + broken_file + orphan_files
	return {
		"folder_filenames": len(filenames),
		"folder_valid": len(seen),
		"folder_invalid": invalid,
		"uploaded_ok": len(uploaded_ok),
		"not_uploaded": len(not_uploaded),
		"no_patient": len(no_patient),
		"broken_file": len(broken_file),
		"file_present_not_linked": len(orphan_files),
		"patients_with_signature_file_not_linked": len(patients_with_unlinked),
		"samples": {
			"not_uploaded": [i["filename"] for i in not_uploaded[:15]],
			"no_patient": [i["file_no"] for i in no_patient[:15]],
			"broken_file": [i["filename"] for i in broken_file[:15]],
			"file_present_not_linked": [i["filename"] for i in orphan_files[:15]],
			"patients_with_signature_file_not_linked": patients_with_unlinked[:20],
		},
		"csv_file_url": _write_signature_analysis_csv(issue_rows, "issues"),
		"csv_ok_file_url": _write_signature_analysis_csv(uploaded_ok, "ok"),
	}
