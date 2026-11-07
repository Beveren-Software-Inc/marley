"""Import patient documents from a nested folder indexed by ``manifest_final.csv``.

The manifest is the list. ``RELATIVE_PATH`` finds the PDF inside the uploaded
folder, however many wrapper folders sit above it. ``PATIENT_FILE_NO`` links
the patient. Every PDF in the folder is imported. A PDF that is not listed in
the manifest is still uploaded and marked ``Not Patient Document``.

Existing Legacy Visit Document rows, the previous OCR import, are removed
before the new files are attached.
"""

from __future__ import annotations

import csv
import io
import json
import time
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, getdate

from healthcare.api.legacy_visit_document_import import (
	_attach_file,
	ensure_document_type,
	resolve_patient,
)

BATCH_SIZE = 25
DELETE_BATCH = 100
PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6
TIME_BUDGET = 15 * 60
PROGRESS_KEY = "healthcare:patient_document_manifest:progress"
ITEMS_KEY = "healthcare:patient_document_manifest:items"
LOCK_KEY = "healthcare:patient_document_manifest:lock"
DEFAULT_DOCUMENT_TYPE = "Patient Documentation"
MANIFEST_NAME = "manifest_final.csv"

_HEADER_ALIASES = {
	"RELATIVE_PATH": "relative_path",
	"PATIENT_FILE_NO": "patient_file_no",
	"FILE_EXISTS": "file_exists",
	"TRANS_NUM": "legacy_visit",
	"UPLOADED_ON": "date_created",
	"FOLDER": "folder",
	"DOCUMENT_TYPE": "document_type",
	"DOC_TYPE": "document_type",
	"DOCUMENT_NAME": "document_name",
	"DOCUMENT_CODE": "document_name",
	"FILE_NAME": "file_name",
	"DATE_CREATED": "date_created",
	"DATE": "date_created",
	"LEGACY_VISIT": "legacy_visit",
	"VISIT": "legacy_visit",
	"REMARKS": "remarks",
	"UPLOAD_REMARKS": "remarks",
}
_PRESENT = {"Y", "YES", "1", "TRUE", "T"}


def _require_admin() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def normalize_relative_path(path: str) -> str:
	parts = [part.strip() for part in str(path or "").replace("\\", "/").split("/")]
	return "/".join(part for part in parts if part and part not in {".", ".."})


def file_is_present(value: Any) -> bool:
	"""True only when ``FILE_EXISTS`` says the PDF is in the folder."""
	return str(value or "").strip().upper() in _PRESENT


def _header_name(value: str) -> str:
	text = "".join(char if char.isalnum() else "_" for char in str(value or "").strip())
	text = "_".join(part for part in text.split("_") if part).upper()
	return _HEADER_ALIASES.get(text, text.lower())


def parse_manifest_csv(text: str) -> list[dict[str, str]]:
	"""Rows from ``manifest_final.csv``. ``FILE_EXISTS`` is kept as given."""
	content = (text or "").lstrip("\ufeff")
	if not content.strip():
		frappe.throw(_("manifest_final.csv is empty."))
	reader = csv.DictReader(io.StringIO(content))
	if not reader.fieldnames:
		frappe.throw(_("manifest_final.csv has no header row."))
	headers = {_header_name(name): name for name in reader.fieldnames if name}
	missing = [column for column in ("relative_path", "patient_file_no", "file_exists") if column not in headers]
	if missing:
		frappe.throw(
			_("manifest_final.csv is missing {0}. It needs RELATIVE_PATH, PATIENT_FILE_NO, and FILE_EXISTS.").format(
				", ".join(missing)
			)
		)
	rows = []
	for raw in reader:
		row = {}
		for key, source in headers.items():
			row[key] = str(raw.get(source) or "").strip()
		if not row.get("relative_path") and not row.get("patient_file_no"):
			continue
		rows.append(row)
	return rows


def _path_index(paths: list[str]) -> dict[str, str]:
	"""Every path and every shorter tail, so a wrapper folder still matches."""
	index: dict[str, str] = {}
	for raw in paths or []:
		norm = normalize_relative_path(raw).lower()
		if not norm or norm.endswith("/" + MANIFEST_NAME) or norm == MANIFEST_NAME:
			continue
		parts = norm.split("/")
		for start in range(len(parts)):
			index.setdefault("/".join(parts[start:]), raw)
	return index


def match_manifest_path(relative_path: str, index: dict[str, str]) -> str:
	"""Uploaded path for this manifest path, walking off outer folders."""
	norm = normalize_relative_path(relative_path).lower()
	if not norm:
		return ""
	if norm in index:
		return index[norm]
	parts = norm.split("/")
	for start in range(1, len(parts)):
		found = index.get("/".join(parts[start:]))
		if found:
			return found
	return ""


def _pdf_name(path: str) -> str:
	return normalize_relative_path(path).split("/")[-1]


def _visit_from_filename(filename: str) -> str:
	"""``DOC_857_CODE.pdf`` → ``857``."""
	stem = _pdf_name(filename).rsplit(".", 1)[0]
	parts = stem.split("_")
	if len(parts) >= 3 and parts[0].upper() == "DOC" and parts[1].isdigit():
		return parts[1]
	return ""


def plan_manifest_import(rows: list[dict[str, str]], uploaded_paths: list[str]) -> dict[str, Any]:
	"""Every PDF in the folder is imported. The manifest fills in the patient when it has one.

	A PDF that is not listed, or whose patient is not in ERPNext, is still imported.
	A manifest row whose PDF is not in the folder cannot be uploaded.
	"""
	index = _path_index(uploaded_paths)
	chosen = []
	seen: set[str] = set()
	taken: set[str] = set()
	file_exists_yes = 0
	file_exists_no = 0
	not_in_folder = 0
	duplicates = 0
	for row in rows:
		relative_path = row.get("relative_path") or ""
		if file_is_present(row.get("file_exists")):
			file_exists_yes += 1
		else:
			file_exists_no += 1
		key = normalize_relative_path(relative_path).lower()
		if not key:
			not_in_folder += 1
			continue
		if key in seen:
			duplicates += 1
			continue
		seen.add(key)
		uploaded = match_manifest_path(relative_path, index)
		if not uploaded:
			not_in_folder += 1
			continue
		taken.add(normalize_relative_path(uploaded).lower())
		chosen.append({**row, "path": uploaded, "not_patient_document": 0})

	outside_manifest_files: list[dict[str, str]] = []
	for raw in uploaded_paths or []:
		norm = normalize_relative_path(raw)
		if not norm.lower().endswith(".pdf"):
			continue
		key = norm.lower()
		if key in taken:
			continue
		taken.add(key)
		name = _pdf_name(norm)
		outside_manifest_files.append({"path": raw, "file_name": name, "relative_path": norm})
		chosen.append(
			{
				"path": raw,
				"relative_path": norm,
				"patient_file_no": "",
				"file_name": name,
				"document_name": name,
				"legacy_visit": _visit_from_filename(name),
				"date_created": "",
				"document_type": "",
				"remarks": norm,
				"not_patient_document": 1,
			}
		)
	return {
		"chosen": chosen,
		"file_exists_yes": file_exists_yes,
		"file_exists_no": file_exists_no,
		"not_in_folder": not_in_folder,
		"duplicates": duplicates,
		"outside_manifest": len(outside_manifest_files),
		"outside_manifest_files": outside_manifest_files,
	}


def _clean_file_no(value: str) -> str:
	text = str(value or "").strip().replace(",", "")
	if text.endswith(".0"):
		text = text[:-2]
	return text


def _patient_names(file_nos: list[str]) -> dict[str, str]:
	found: dict[str, str] = {}
	pending = [file_no for file_no in dict.fromkeys(file_nos) if file_no]
	for start in range(0, len(pending), 500):
		chunk = pending[start : start + 500]
		marks = ", ".join(["%s"] * len(chunk))
		for name, file_no in frappe.db.sql(
			f"""
			select name, ifnull(file_no, '')
			from `tabPatient`
			where name in ({marks}) or ifnull(file_no, '') in ({marks})
			""",
			tuple(chunk) + tuple(chunk),
		):
			for key in (str(name or "").strip(), str(file_no or "").strip()):
				if key:
					found[key] = name
	return found


def _parse_date(value: str):
	text = str(value or "").strip()
	if not text:
		return None
	try:
		return getdate(text)
	except Exception:
		return None


def _preview_from(manifest: str, paths: list[str]) -> dict[str, Any]:
	rows = parse_manifest_csv(manifest)
	plan = plan_manifest_import(rows, paths)
	file_nos = [_clean_file_no(row.get("patient_file_no")) for row in plan["chosen"]]
	patients = _patient_names([file_no for file_no in file_nos if file_no])
	found_ids: set[str] = set()
	missing_patients: list[str] = []
	seen_missing: set[str] = set()
	for file_no in file_nos:
		if not file_no:
			continue
		if patients.get(file_no):
			found_ids.add(file_no)
			continue
		if file_no not in seen_missing:
			seen_missing.add(file_no)
			missing_patients.append(file_no)
	return {
		"ok": True,
		"manifest_rows": len(rows),
		"file_exists": plan["file_exists_yes"],
		"file_missing": plan["file_exists_no"],
		"matched_files": len(plan["chosen"]),
		"not_in_folder": plan["not_in_folder"],
		"outside_manifest": plan["outside_manifest"],
		"outside_manifest_files": plan["outside_manifest_files"],
		"duplicates": plan["duplicates"],
		"patients_found": len(found_ids),
		"patients_missing": len(missing_patients),
		"sample_missing_file_nos": missing_patients[:10],
		"existing_documents": cint(frappe.db.count("Legacy Visit Document")),
		"upload_paths": [row["path"] for row in plan["chosen"]],
		"imports": [
			{
				"path": row["path"],
				"relative_path": row.get("relative_path") or "",
				"patient_file_no": _clean_file_no(row.get("patient_file_no")),
				"document_type": row.get("document_type") or "",
				"document_name": row.get("document_name") or "",
				"file_name": row.get("file_name") or "",
				"date_created": row.get("date_created") or "",
				"legacy_visit": row.get("legacy_visit") or "",
				"remarks": row.get("remarks") or "",
				"not_patient_document": cint(row.get("not_patient_document")),
			}
			for row in plan["chosen"]
		],
	}


def _paths(paths: Any) -> list[str]:
	if isinstance(paths, str):
		paths = json.loads(paths) if paths.strip() else []
	if not isinstance(paths, list):
		frappe.throw(_("Expected the list of files in the folder."))
	return [str(path or "") for path in paths]


@frappe.whitelist()
def preview_patient_document_manifest(manifest: str = "", paths=None) -> dict[str, Any]:
	"""Compare manifest_final.csv with the uploaded folder and the old documents."""
	_require_admin()
	return _preview_from(manifest or "", _paths(paths))


def _load_progress() -> dict:
	return frappe.cache().get_value(PROGRESS_KEY) or {}


def _set_progress(progress: dict) -> None:
	progress["updated_at"] = str(frappe.utils.now_datetime())
	frappe.cache().set_value(PROGRESS_KEY, progress, expires_in_sec=PROGRESS_TTL)


def _lock_name() -> str:
	db_name = (frappe.local.conf or {}).get("db_name") or frappe.local.site
	return f"{db_name}|{LOCK_KEY}"


def _delete_one_legacy_document(name: str) -> None:
	file_url = frappe.db.get_value("Legacy Visit Document", name, "document")
	file_name = ""
	if file_url:
		file_name = frappe.db.get_value(
			"File",
			{"file_url": file_url, "attached_to_doctype": "Legacy Visit Document", "attached_to_name": name},
			"name",
		) or ""
	frappe.delete_doc("Legacy Visit Document", name, ignore_permissions=True, force=1, delete_permanently=1)
	if file_name and frappe.db.exists("File", file_name):
		frappe.delete_doc("File", file_name, ignore_permissions=True, force=1, delete_permanently=1)


def _create_one(item: dict) -> str:
	file_url = (item.get("file_url") or "").strip()
	file_no = _clean_file_no(item.get("patient_file_no"))
	relative_path = item.get("relative_path") or item.get("path") or ""
	if not file_url:
		return "skip_invalid"
	patient = resolve_patient(file_no) if file_no else None
	patient_name = frappe.db.get_value("Patient", patient, "patient_name") if patient else None
	basename = normalize_relative_path(relative_path).split("/")[-1] or file_url.split("/")[-1]
	not_patient_document = cint(item.get("not_patient_document"))
	document_type = ensure_document_type(item.get("document_type") or DEFAULT_DOCUMENT_TYPE)
	doc = frappe.get_doc(
		{
			"doctype": "Legacy Visit Document",
			"transaction_no": (item.get("legacy_visit") or "").strip() or None,
			"document_name": (item.get("document_name") or "").strip() or basename,
			"file_name": (item.get("file_name") or "").strip() or basename,
			"document_type": document_type,
			"not_patient_document": not_patient_document,
			"document": file_url,
			"upload_remarks": (item.get("remarks") or "").strip() or relative_path or basename,
			"date_created": _parse_date(item.get("date_created")),
			"patient": patient,
			"patient_name": patient_name,
			"legacy_patient_file_no": file_no,
			"legacy_visit": (item.get("legacy_visit") or "").strip() or None,
		}
	)
	doc.flags.ignore_permissions = True
	doc.flags.ignore_mandatory = True
	doc.flags.ignore_links = True
	doc.insert(ignore_permissions=True)
	_attach_file(file_url, "Legacy Visit Document", doc.name, "document")
	return "created" if patient else "created_no_patient"


@frappe.whitelist()
def start_patient_document_manifest(items=None) -> dict[str, Any]:
	"""Delete the old Legacy Visit Documents, then attach the manifest files."""
	_require_admin()
	if isinstance(items, str):
		items = json.loads(items) if items.strip() else []
	if not isinstance(items, list) or not items:
		frappe.throw(_("No documents to attach."))
	if frappe.cache().get(_lock_name()):
		return {
			"queued": False,
			"running": True,
			"message": _("Patient documents are already being replaced."),
			"status": _load_progress(),
		}
	valid = []
	for item in items:
		if isinstance(item, dict) and (item.get("file_url") or "").strip():
			valid.append(item)
	if not valid:
		frappe.throw(_("No documents to attach."))
	token = frappe.generate_hash(length=12)
	if not frappe.cache().set(_lock_name(), token.encode(), nx=True, ex=LOCK_TTL):
		return {
			"queued": False,
			"running": True,
			"message": _("Patient documents are already being replaced."),
			"status": _load_progress(),
		}
	frappe.cache().set_value(ITEMS_KEY, valid, expires_in_sec=PROGRESS_TTL)
	progress = {
		"state": "queued",
		"cleared": 0,
		"deleted": 0,
		"delete_total": cint(frappe.db.count("Legacy Visit Document")),
		"processed": 0,
		"total": len(valid),
		"created": 0,
		"created_no_patient": 0,
		"skip_invalid": 0,
		"errors": 0,
		"message": _("Queued. Old Legacy Visit Documents are removed first."),
	}
	_set_progress(progress)
	frappe.enqueue(
		"healthcare.api.patient_document_manifest.run_patient_document_manifest",
		queue="long",
		timeout=7200,
		token=token,
	)
	return {"queued": True, "status": progress}


@frappe.whitelist()
def get_patient_document_manifest_status() -> dict[str, Any]:
	_require_admin()
	return _load_progress() or {"state": "idle", "processed": 0, "total": 0}


def run_patient_document_manifest(token: str | None = None) -> dict[str, Any]:
	"""Background replace. Old OCR documents are deleted, then the manifest files are created."""
	if (frappe.cache().get(_lock_name()) or b"").decode() != (token or ""):
		return {"state": "skipped"}
	items = frappe.cache().get_value(ITEMS_KEY) or []
	progress = _load_progress() or {"processed": 0, "total": len(items), "cleared": 0}
	progress["state"] = "running"
	progress["total"] = len(items)
	_set_progress(progress)
	started = time.monotonic()
	try:
		if not cint(progress.get("cleared")):
			while True:
				names = frappe.get_all("Legacy Visit Document", pluck="name", limit=DELETE_BATCH)
				if not names:
					progress["cleared"] = 1
					progress["message"] = _("Old documents removed. Attaching the manifest files.")
					_set_progress(progress)
					frappe.db.commit()
					break
				for name in names:
					try:
						frappe.db.savepoint("document_one")
						_delete_one_legacy_document(name)
						progress["deleted"] = cint(progress.get("deleted")) + 1
					except Exception:
						frappe.db.rollback(save_point="document_one")
						progress["errors"] = cint(progress.get("errors")) + 1
						frappe.log_error(title=f"Legacy Visit Document delete failed: {name}")
				progress["message"] = _("Removing old documents: {0} of {1}.").format(
					cint(progress.get("deleted")), cint(progress.get("delete_total"))
				)
				_set_progress(progress)
				frappe.db.commit()
				if time.monotonic() - started > TIME_BUDGET:
					frappe.enqueue(
						"healthcare.api.patient_document_manifest.run_patient_document_manifest",
						queue="long",
						timeout=7200,
						token=token,
					)
					return {"state": "queued", "handed_over": True}

		offset = cint(progress.get("processed"))
		while offset < len(items):
			for item in items[offset : offset + BATCH_SIZE]:
				try:
					frappe.db.savepoint("document_one")
					result = _create_one(item)
					progress[result] = cint(progress.get(result)) + 1
				except Exception:
					frappe.db.rollback(save_point="document_one")
					progress["errors"] = cint(progress.get("errors")) + 1
					frappe.log_error(title=f"Patient document import failed: {item.get('relative_path')}")
				offset += 1
			progress["processed"] = offset
			progress["message"] = _("Attached {0} of {1} documents.").format(offset, len(items))
			_set_progress(progress)
			frappe.db.commit()
			if time.monotonic() - started > TIME_BUDGET and offset < len(items):
				frappe.enqueue(
					"healthcare.api.patient_document_manifest.run_patient_document_manifest",
					queue="long",
					timeout=7200,
					token=token,
				)
				return {"state": "queued", "handed_over": True}
		progress["state"] = "finished"
		progress["message"] = _(
			"Finished. Removed {0} old documents. Created {1}. Created without a patient match {2}. Errors {3}."
		).format(
			cint(progress.get("deleted")),
			cint(progress.get("created")),
			cint(progress.get("created_no_patient")),
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
