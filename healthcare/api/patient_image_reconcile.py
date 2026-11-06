"""Fill missing patient CPR photos and signatures from one image folder.

The file name starts with the patient file number. The label decides the slot:

* ``SIGN`` / ``SIGNATURE`` — the patient's signature
* ``CPR`` and ``FRONT`` — CPR front photo
* ``CPR`` and ``BACK`` — CPR back photo

``.jpg``, ``.jpeg``, ``.png``, ``.tif`` and ``.tiff`` are the same image.
A slot that already has an image is left as it is, and a second file for that
same slot is not uploaded.
"""

from __future__ import annotations

import json
import re
import time
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint

from healthcare.api.patient_cpr_photo_import import _attach_file_to_patient, resolve_patient_name
from healthcare.api.patient_legacy_signature_import import (
	DOCUMENT_TYPE_NAME,
	FILE_NAME_LABEL,
	_attach_file,
	ensure_legacy_signature_document_type,
	resolve_admission_name,
)

BATCH_SIZE = 25
PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6
TIME_BUDGET = 15 * 60
PROGRESS_KEY = "healthcare:patient_image_reconcile:progress"
ITEMS_KEY = "healthcare:patient_image_reconcile:items"
LOCK_KEY = "healthcare:patient_image_reconcile:lock"

IMAGE_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".tff"})
CPR_FIELD = {"cpr_front": "cprigama_front_photo", "cpr_back": "cprigama_back_photo"}
_SIGN = re.compile(r"(^|[^A-Z])SIGN(ATURE)?([^A-Z]|$)")
_FRONT = re.compile(r"CPR.*FRONT|FRONT.*CPR")
_BACK = re.compile(r"CPR.*BACK|BACK.*CPR")
_ADMISSION = re.compile(r"^(\d+)[-_]([A-Za-z0-9]+)[-_]SIGN")
_SIGNATURE_SEQ = re.compile(r"SIGNATURE[_\-]?(\d+)", re.IGNORECASE)


def _require_admin() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def _basename(path: str) -> str:
	return (path or "").replace("\\", "/").split("/")[-1].strip()


def classify_patient_image(filename: str) -> dict | None:
	"""File number plus ``cpr_front``, ``cpr_back`` or ``signature``, or nothing."""
	basename = _basename(filename)
	if not basename:
		return None
	lower = basename.lower()
	if "." in lower:
		extension = "." + lower.rsplit(".", 1)[-1]
		if extension not in IMAGE_EXTENSIONS:
			return None
		stem = basename.rsplit(".", 1)[0]
	else:
		stem = basename

	number = re.match(r"^(\d+)", stem)
	if not number:
		return None
	upper = stem.upper()
	admission_key = None
	if _SIGN.search(upper):
		kind = "signature"
		admission = _ADMISSION.match(upper)
		if admission and not admission.group(2).startswith("SIGN"):
			admission_key = admission.group(2)
	elif "CPR" in upper and _BACK.search(upper) and not _FRONT.search(upper):
		kind = "cpr_back"
	elif "CPR" in upper and _FRONT.search(upper) and not _BACK.search(upper):
		kind = "cpr_front"
	else:
		return None

	return {
		"file_no": number.group(1),
		"kind": kind,
		"filename": basename,
		"admission_key": admission_key,
	}


def choose_patient_images(classified: list[dict], stored: dict[str, dict]) -> dict[str, Any]:
	"""One file per empty slot. An image the patient already has is not chosen."""
	folder = {"cpr_front": 0, "cpr_back": 0, "signature": 0}
	already = {"cpr_front": 0, "cpr_back": 0, "signature": 0}
	chosen: list[dict] = []
	seen: set[tuple[str, str]] = set()
	duplicate_files = 0
	patients_missing: set[str] = set()

	ordered = sorted(classified, key=lambda row: (row.get("file_no") or "", row.get("kind") or "", row.get("filename") or ""))
	for row in ordered:
		kind = row.get("kind") or ""
		file_no = row.get("file_no") or ""
		if kind not in folder or not file_no:
			continue
		folder[kind] += 1
		slot = (file_no, kind)
		if slot in seen:
			duplicate_files += 1
			continue
		seen.add(slot)
		state = stored.get(file_no) or {}
		if not state.get("found"):
			patients_missing.add(file_no)
			continue
		held = {"cpr_front": "front", "cpr_back": "back", "signature": "signature"}[kind]
		if state.get(held):
			already[kind] += 1
			continue
		chosen.append(row)

	return {
		"chosen": chosen,
		"folder": folder,
		"already": already,
		"duplicate_files": duplicate_files,
		"patients_missing": sorted(patients_missing),
	}


def _filenames(filenames: Any) -> list[str]:
	if isinstance(filenames, str):
		filenames = json.loads(filenames) if filenames.strip() else []
	if not isinstance(filenames, list):
		frappe.throw(_("Expected a list of filenames."))
	return [str(name or "") for name in filenames]


def _chunks(values: list[str], size: int = 500) -> list[list[str]]:
	return [values[index : index + size] for index in range(0, len(values), size)]


def _stored_slots(file_nos: list[str]) -> dict[str, dict]:
	"""What each file number already has on its Patient."""
	stored = {file_no: {"found": False, "front": False, "back": False, "signature": False, "patient": ""} for file_no in file_nos}
	if not file_nos:
		return stored

	patients: dict[str, str] = {}
	for chunk in _chunks(file_nos):
		rows = frappe.db.sql(
			"""
			select name, ifnull(file_no, ''), ifnull(cprigama_front_photo, ''), ifnull(cprigama_back_photo, '')
			from `tabPatient`
			where name in ({nums}) or ifnull(file_no, '') in ({nums})
			""".format(nums=", ".join(["%s"] * len(chunk))),
			tuple(chunk) + tuple(chunk),
		)
		for name, file_no, front, back in rows:
			for key in {str(name or "").strip(), str(file_no or "").strip()}:
				if key:
					patients[key] = name
			for key in (str(name or "").strip(), str(file_no or "").strip()):
				if key not in stored:
					continue
				stored[key]["found"] = True
				stored[key]["patient"] = name
				stored[key]["front"] = bool(str(front or "").strip())
				stored[key]["back"] = bool(str(back or "").strip())

	signed = _patients_with_signature([row["patient"] for row in stored.values() if row.get("patient")])
	for row in stored.values():
		if row.get("patient") and row["patient"] in signed:
			row["signature"] = True
	return stored


def _patients_with_signature(patients: list[str]) -> set[str]:
	found: set[str] = set()
	patients = [patient for patient in dict.fromkeys(patients) if patient]
	if not patients:
		return found
	sign = """
		(
			document_type = 'Legacy Signature'
			or upper(ifnull(file_name, '')) like '%%SIGN%%'
			or upper(ifnull(document_name, '')) like '%%SIGN%%'
			or upper(ifnull(upload_remarks, '')) like '%%SIGN%%'
		)
	"""
	for chunk in _chunks(patients):
		marks = ", ".join(["%s"] * len(chunk))
		for (patient,) in frappe.db.sql(
			f"""
			select distinct parent
			from `tabPatient Upload Document`
			where parenttype = 'Patient' and parentfield = 'patient_document'
			  and ifnull(document, '') != ''
			  and parent in ({marks}) and {sign}
			""",
			tuple(chunk),
		):
			found.add(patient)
		# Any e-signature already stored on an admission counts. The image is not replaced.
		for (patient,) in frappe.db.sql(
			f"""
			select distinct admission.patient
			from `tabPatient Upload Document` upload
			inner join `tabInpatient Admission` admission on admission.name = upload.parent
			where upload.parenttype = 'Inpatient Admission' and upload.parentfield = 'e_signatures'
			  and ifnull(upload.document, '') != ''
			  and admission.patient in ({marks})
			""",
			tuple(chunk),
		):
			if patient:
				found.add(patient)
	return found


def _signature_label(filename: str) -> str:
	match = _SIGNATURE_SEQ.search(filename or "")
	if not match:
		return "SIGNATURE"
	return f"SIGNATURE_{match.group(1).zfill(2)}"


def _patient_has_signature(patient: str) -> bool:
	return patient in _patients_with_signature([patient])


def _row_has_signature(row: Any) -> bool:
	if str(getattr(row, "document_type", None) or "") == DOCUMENT_TYPE_NAME:
		return True
	for attr in ("file_name", "document_name", "upload_remarks", "document"):
		if "SIGN" in str(getattr(row, attr, None) or "").upper():
			return True
	return False


def _attach_signature(patient: str, file_url: str, parsed: dict) -> str:
	"""Add a signature only when the patient does not have one. Never overwrite."""
	if _patient_has_signature(patient):
		return "skip_existing"
	label = _signature_label(parsed["filename"])
	admission = resolve_admission_name(parsed.get("admission_key") or "", patient)
	if admission:
		doc = frappe.get_doc("Inpatient Admission", admission)
		parent_doctype = "Inpatient Admission"
		parent_name = admission
		table = "e_signatures"
	else:
		doc = frappe.get_doc("Patient", patient)
		parent_doctype = "Patient"
		parent_name = patient
		table = "patient_document"
	rows = doc.get(table) or []
	if table == "e_signatures" and any(str(row.document or "").strip() for row in rows):
		return "skip_existing"
	if any(_row_has_signature(row) and str(row.document or "").strip() for row in rows):
		return "skip_existing"
	ensure_legacy_signature_document_type()
	doc.flags.ignore_permissions = True
	doc.flags.ignore_validate = True
	doc.flags.ignore_mandatory = True
	doc.flags.ignore_links = True
	doc.flags.skip_editing_lock = True
	doc.append(
		table,
		{
			"file_name": FILE_NAME_LABEL,
			"document_type": DOCUMENT_TYPE_NAME,
			"document_name": label,
			"document": file_url,
			"upload_remarks": parsed["filename"],
			"transaction_no": (parsed.get("admission_key") or "").strip() or None,
		},
	)
	doc.save(ignore_permissions=True)
	_attach_file(file_url, parent_doctype, parent_name, table)
	return "uploaded_signature"


def _attach_cpr(patient: str, file_url: str, kind: str) -> str:
	"""Set a CPR photo only when that side is empty. An existing photo is left as it is."""
	fieldname = CPR_FIELD[kind]
	doc = frappe.get_doc("Patient", patient)
	if str(doc.get(fieldname) or "").strip():
		return "skip_existing"
	doc.flags.ignore_permissions = True
	doc.flags.skip_editing_lock = True
	doc.set(fieldname, file_url)
	doc.save(ignore_permissions=True)
	_attach_file_to_patient(file_url, patient, fieldname)
	return "uploaded_front" if kind == "cpr_front" else "uploaded_back"


def _attach_one(item: dict) -> str:
	file_url = (item.get("file_url") or "").strip()
	filename = item.get("filename") or file_url
	parsed = classify_patient_image(filename) or classify_patient_image(file_url)
	if not parsed or not file_url:
		return "skip_invalid"
	patient = resolve_patient_name(parsed["file_no"])
	if not patient:
		return "skip_no_patient"
	if parsed["kind"] == "signature":
		return _attach_signature(patient, file_url, parsed)
	return _attach_cpr(patient, file_url, parsed["kind"])


def _preview_from(filenames: list[str]) -> dict[str, Any]:
	classified = []
	ignored = 0
	for name in filenames:
		if not _basename(name):
			continue
		parsed = classify_patient_image(name)
		if not parsed:
			ignored += 1
			continue
		classified.append(parsed)
	stored = _stored_slots(sorted({row["file_no"] for row in classified}))
	choice = choose_patient_images(classified, stored)
	missing = {
		"cpr_front": sum(1 for row in choice["chosen"] if row["kind"] == "cpr_front"),
		"cpr_back": sum(1 for row in choice["chosen"] if row["kind"] == "cpr_back"),
		"signature": sum(1 for row in choice["chosen"] if row["kind"] == "signature"),
	}
	return {
		"ok": True,
		"folder": choice["folder"],
		"already": choice["already"],
		"missing": missing,
		"duplicate_files": choice["duplicate_files"],
		"ignored": ignored,
		"patients_missing": len(choice["patients_missing"]),
		"sample_missing_file_nos": choice["patients_missing"][:10],
		"upload_filenames": [row["filename"] for row in choice["chosen"]],
	}


@frappe.whitelist()
def preview_patient_image_filenames(filenames=None) -> dict[str, Any]:
	"""Compare the folder with the images already stored on each patient."""
	_require_admin()
	return _preview_from(_filenames(filenames))


def _load_progress() -> dict:
	return frappe.cache().get_value(PROGRESS_KEY) or {}


def _set_progress(progress: dict) -> None:
	progress["updated_at"] = str(frappe.utils.now_datetime())
	frappe.cache().set_value(PROGRESS_KEY, progress, expires_in_sec=PROGRESS_TTL)


def _lock_name() -> str:
	db_name = (frappe.local.conf or {}).get("db_name") or frappe.local.site
	return f"{db_name}|{LOCK_KEY}"


@frappe.whitelist()
def start_patient_image_reconcile(items=None) -> dict[str, Any]:
	"""Attach the uploaded images that the preview said were missing."""
	_require_admin()
	if isinstance(items, str):
		items = json.loads(items) if items.strip() else []
	if not isinstance(items, list) or not items:
		frappe.throw(_("No images to attach."))
	if frappe.cache().get(_lock_name()):
		return {"queued": False, "running": True, "message": _("CPR and signature images are already being attached."), "status": _load_progress()}

	valid = []
	for item in items:
		if not isinstance(item, dict):
			continue
		file_url = (item.get("file_url") or "").strip()
		filename = item.get("filename") or _basename(file_url)
		if file_url and classify_patient_image(filename):
			valid.append({"file_url": file_url, "filename": filename})
	if not valid:
		frappe.throw(_("None of the uploaded files are a CPR front, CPR back, or signature image."))

	token = frappe.generate_hash(length=12)
	if not frappe.cache().set(_lock_name(), token.encode(), nx=True, ex=LOCK_TTL):
		return {"queued": False, "running": True, "message": _("CPR and signature images are already being attached."), "status": _load_progress()}

	frappe.cache().set_value(ITEMS_KEY, valid, expires_in_sec=PROGRESS_TTL)
	progress = {
		"state": "queued",
		"processed": 0,
		"total": len(valid),
		"uploaded_front": 0,
		"uploaded_back": 0,
		"uploaded_signature": 0,
		"skip_existing": 0,
		"skip_no_patient": 0,
		"skip_invalid": 0,
		"errors": 0,
		"message": _("Queued. Missing images are attached in the background."),
	}
	_set_progress(progress)
	frappe.enqueue(
		"healthcare.api.patient_image_reconcile.run_patient_image_reconcile",
		queue="long",
		timeout=7200,
		token=token,
	)
	return {"queued": True, "status": progress}


@frappe.whitelist()
def get_patient_image_reconcile_status() -> dict[str, Any]:
	_require_admin()
	return _load_progress() or {"state": "idle", "processed": 0, "total": 0}


def run_patient_image_reconcile(token: str | None = None) -> dict[str, Any]:
	"""Background attach. Existing images are not replaced."""
	if (frappe.cache().get(_lock_name()) or b"").decode() != (token or ""):
		return {"state": "skipped"}
	items = frappe.cache().get_value(ITEMS_KEY) or []
	progress = _load_progress() or {"processed": 0, "total": len(items)}
	progress["state"] = "running"
	progress["total"] = len(items)
	_set_progress(progress)
	started = time.monotonic()
	offset = cint(progress.get("processed"))
	try:
		while offset < len(items):
			for item in items[offset : offset + BATCH_SIZE]:
				try:
					frappe.db.savepoint("image_one")
					result = _attach_one(item)
					if result in {
						"uploaded_front",
						"uploaded_back",
						"uploaded_signature",
						"skip_existing",
						"skip_no_patient",
						"skip_invalid",
					}:
						progress[result] = cint(progress.get(result)) + 1
					else:
						progress["skip_invalid"] = cint(progress.get("skip_invalid")) + 1
				except Exception:
					frappe.db.rollback(save_point="image_one")
					progress["errors"] = cint(progress.get("errors")) + 1
					frappe.log_error(title=f"Patient image reconcile failed: {item.get('filename')}")
				offset += 1
			progress["processed"] = offset
			progress["message"] = _("{0} of {1} images checked.").format(offset, len(items))
			_set_progress(progress)
			frappe.db.commit()
			if time.monotonic() - started > TIME_BUDGET and offset < len(items):
				frappe.enqueue(
					"healthcare.api.patient_image_reconcile.run_patient_image_reconcile",
					queue="long",
					timeout=7200,
					token=token,
				)
				return {"state": "queued", "handed_over": True}
		progress["state"] = "finished"
		progress["message"] = _(
			"Finished. CPR front {0}, CPR back {1}, signatures {2}. Already present {3}. No patient {4}. Errors {5}."
		).format(
			cint(progress.get("uploaded_front")),
			cint(progress.get("uploaded_back")),
			cint(progress.get("uploaded_signature")),
			cint(progress.get("skip_existing")),
			cint(progress.get("skip_no_patient")),
			cint(progress.get("errors")),
		)
		_set_progress(progress)
		frappe.db.commit()
	except Exception:
		progress["state"] = "failed"
		progress["message"] = frappe.get_traceback()
		_set_progress(progress)
		raise
	finally:
		if progress.get("state") != "running":
			frappe.cache().delete(_lock_name())
	return progress
