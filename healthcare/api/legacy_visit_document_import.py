# Copyright (c) 2026, Healthcare contributors
"""Bulk-import legacy visit / patient documentation PDFs and images into Legacy Visit Document.

Filename pattern (example): ``DOC_4762_ZF7BEVVCW44W9930.pdf`` or ``DOC_2617_75Y0F0YII37Z.jpg``
- ``4762`` — Legacy Visit id (stored on ``legacy_visit``)
- ``ZF7BEVVCW44W9930`` — Document Code (stored on ``document_name``)

Allowed extensions: ``.pdf``, ``.jpg``, ``.jpeg``, ``.png``, ``.gif``, ``.webp``, ``.bmp``, ``.tif``, ``.tiff``.

Best-effort read (PyMuPDF / pypdf / RapidOCR when available):
- ``date_created`` from PDF metadata / image EXIF / title / OCR
- ``legacy_patient_file_no`` and Patient link from readable ID / CPR / file-no text
- ``document_type`` from content keywords (National ID, CPR ID, Discharge, …)
  with a configurable default (created if missing)

``patient_visit`` is left empty for a later backfill when a matching visit exists.
"""

from __future__ import annotations

import json
import os
import re
from datetime import date

import frappe
from frappe import _
from frappe.utils import cint, getdate

BATCH_SIZE = 10
CACHE_TTL = 7200
CACHE_KEYS = {
	"items": "healthcare:data_migration:legacy_visit_document_import:items",
	"replace": "healthcare:data_migration:legacy_visit_document_import:replace_existing",
	"default_type": "healthcare:data_migration:legacy_visit_document_import:default_document_type",
}

DEFAULT_DOCUMENT_TYPE = "Patient Documentation"
SEED_DOCUMENT_TYPES = (
	"Patient Documentation",
	"National ID",
	"CPR ID",
	"Discharge Document",
	"Medical Report",
	"Passport",
	"Insurance Card",
	"Iqama",
	"Smart Card",
	"ID Card",
)

PDF_EXTENSIONS = frozenset({".pdf"})
IMAGE_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff"})
ALLOWED_EXTENSIONS = PDF_EXTENSIONS | IMAGE_EXTENSIONS
OCR_MAX_PAGES = 2
OCR_RENDER_SCALE = 2.0

# DOC_4762_ZF7BEVVCW44W9930.pdf  (also allows DOC-4762-… and .jpg/.png)
_FILENAME_RE = re.compile(
	r"^DOC[_\-](\d+)[_\-]([A-Za-z0-9]+)",
	re.IGNORECASE,
)

_PDF_DATE_RE = re.compile(r"D:(\d{4})(\d{2})(\d{2})")
_TITLE_DATE_RE = re.compile(
	r"(?:^|[_\s\-])(\d{1,2})[-_/](\d{1,2})[-_/](\d{2,4})(?:$|[_\s\-])"
)
_TEXT_DATE_RE = re.compile(
	r"(?:date|dated|scan(?:ned)?\s*date|created|التاريخ)\s*[:\-：]?\s*"
	r"(\d{1,2})[-_/](\d{1,2})[-_/](\d{2,4})",
	re.IGNORECASE,
)
# Serene Arabic forms use YYYY/MM/DD next to التاريخ
_ISO_SLASH_DATE_RE = re.compile(r"(20\d{2})\s*[/-]\s*(\d{1,2})\s*[/-]\s*(\d{1,2})")

_ARABIC_INDIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")

_FILE_NO_PATTERNS = (
	re.compile(r"(?:رقم\s*الملف|رقم الملف)\s*[:：\-#]?\s*(\d{3,})", re.I),
	re.compile(r"(?:patient\s*)?(?:file\s*(?:no|number|#)|file\s*no\.?)\s*[:#]?\s*(\d{3,})", re.I),
	re.compile(r"ID CARD DATA\s+(\d{6,})", re.I),
	re.compile(r"GCC SMARTCARD DATA\s+(\d{6,})", re.I),
	re.compile(r"(?:CPR|cpr)\s*(?:no|number|#)?\s*[:#]?\s*(\d{6,})", re.I),
	re.compile(r"ID Number\s*/[^\n]*\n\s*(\d{6,})", re.I),
	re.compile(r"(?:national\s*id|id\s*number|رقم\s*الهوية)\s*[:：\-#]?\s*(\d{6,})", re.I),
)

_DOC_TYPE_HINTS = (
	(re.compile(r"national\s*id|الهوية\s*الوطنية|الهوية", re.I), "National ID"),
	(re.compile(r"تقرير\s*طبي|medical\s*report|consultant\s*psychiatrist", re.I), "Medical Report"),
	(re.compile(r"id\s*card\s*data", re.I), "CPR ID"),
	(re.compile(r"gcc\s*smartcard|smart\s*card", re.I), "Smart Card"),
	(re.compile(r"discharge", re.I), "Discharge Document"),
	(re.compile(r"passport", re.I), "Passport"),
	(re.compile(r"insurance", re.I), "Insurance Card"),
	(re.compile(r"iqama|إقامة", re.I), "Iqama"),
	(re.compile(r"\bcpr\b", re.I), "CPR ID"),
)

_OCR_ENGINE = None  # lazy RapidOCR instance; False = unavailable
_OCR_DEPS_DIR = os.path.join(
	os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
	".ocr_deps",
)


def _require_admin() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def _basename(path: str) -> str:
	return (path or "").replace("\\", "/").split("/")[-1].strip()


def _file_extension(filename: str) -> str:
	basename = _basename(filename).lower()
	if "." not in basename:
		return ""
	return "." + basename.rsplit(".", 1)[-1]


def _is_allowed_document_filename(filename: str) -> bool:
	return _file_extension(filename) in ALLOWED_EXTENSIONS


def _is_pdf_filename(filename: str) -> bool:
	return _file_extension(filename) in PDF_EXTENSIONS


def _is_image_filename(filename: str) -> bool:
	return _file_extension(filename) in IMAGE_EXTENSIONS


def parse_legacy_visit_document_filename(filename: str) -> dict | None:
	"""Parse ``DOC_{legacy_visit}_{document_code}`` from a filename (.pdf or image)."""
	basename = _basename(filename)
	if not basename:
		return None

	stem = basename.rsplit(".", 1)[0] if "." in basename else basename
	match = _FILENAME_RE.match(stem)
	if not match:
		return None

	return {
		"legacy_visit": match.group(1),
		"document_code": match.group(2).upper(),
		"filename": basename,
	}


def ensure_document_type(name: str | None) -> str:
	"""Create Document Type ``name`` if missing; return the name."""
	document_name = (name or "").strip() or DEFAULT_DOCUMENT_TYPE
	if frappe.db.exists("Document Type", document_name):
		return document_name
	doc = frappe.get_doc({"doctype": "Document Type", "document_name": document_name})
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return document_name


@frappe.whitelist()
def seed_document_types() -> list[str]:
	"""Ensure common Patient Documentation types exist."""
	_require_admin()
	created = []
	for name in SEED_DOCUMENT_TYPES:
		if not frappe.db.exists("Document Type", name):
			ensure_document_type(name)
			created.append(name)
		else:
			created.append(name)
	return created


def resolve_patient(identifier: str | None) -> str | None:
	"""Resolve Patient by file_no, name, uid, id_number, or national_id."""
	key = (identifier or "").strip()
	if not key:
		return None

	if frappe.db.exists("Patient", key):
		return key

	for field in ("file_no", "uid", "id_number", "national_id"):
		name = frappe.db.get_value("Patient", {field: key}, "name")
		if name:
			return name

	# Strip leading zeros and retry (e.g. smartcard CPR)
	stripped = key.lstrip("0")
	if stripped and stripped != key:
		for field in ("file_no", "uid", "id_number", "national_id"):
			name = frappe.db.get_value("Patient", {field: stripped}, "name")
			if name:
				return name
			name = frappe.db.get_value("Patient", {field: key.zfill(9)}, "name")
			if name:
				return name

	return None


def _normalize_digits(text: str) -> str:
	"""Convert Arabic-Indic digits to Western digits and tidy OCR junk."""
	if not text:
		return ""
	return text.translate(_ARABIC_INDIC_DIGITS)


def _parse_ymd(year: str, month: str, day: str) -> date | None:
	try:
		y = int(year)
		if y < 100:
			y += 2000
		return date(y, int(month), int(day))
	except Exception:
		return None


def _parse_dmy(day: str, month: str, year: str) -> date | None:
	return _parse_ymd(year, month, day)


def _parse_pdf_meta_date(value: str | None) -> date | None:
	if not value:
		return None
	match = _PDF_DATE_RE.search(value)
	if not match:
		return None
	return _parse_ymd(match.group(1), match.group(2), match.group(3))


def _extract_date_from_text(blob: str) -> date | None:
	if not blob:
		return None
	blob = _normalize_digits(blob)

	# Prefer explicit document-date labels (التاريخ) with YYYY/MM/DD or DD/MM/YYYY
	labeled = re.search(
		r"(?:التاريخ|date)\s*[:：\-#]?\s*(20\d{2})\s*[/-]\s*(\d{1,2})\s*[/-]\s*(\d{1,2})",
		blob,
		re.IGNORECASE,
	)
	if labeled:
		parsed = _parse_ymd(labeled.group(1), labeled.group(2), labeled.group(3))
		if parsed:
			return parsed
	labeled_dmy = re.search(
		r"(?:التاريخ|date)\s*[:：\-#]?\s*(\d{1,2})\s*[/-]\s*(\d{1,2})\s*[/-]\s*(20\d{2}|\d{2})",
		blob,
		re.IGNORECASE,
	)
	if labeled_dmy:
		parsed = _parse_dmy(labeled_dmy.group(1), labeled_dmy.group(2), labeled_dmy.group(3))
		if parsed:
			return parsed

	# First ISO-ish date in header area (often document date on Serene forms)
	iso = _ISO_SLASH_DATE_RE.search(blob)
	if iso:
		parsed = _parse_ymd(iso.group(1), iso.group(2), iso.group(3))
		if parsed:
			return parsed

	for pattern in (_TITLE_DATE_RE, _TEXT_DATE_RE):
		match = pattern.search(blob)
		if match:
			parsed = _parse_dmy(match.group(1), match.group(2), match.group(3))
			if parsed:
				return parsed
	return None


def _extract_identifier_from_text(blob: str) -> str | None:
	if not blob:
		return None
	blob = _normalize_digits(blob)
	for pattern in _FILE_NO_PATTERNS:
		match = pattern.search(blob)
		if match:
			return match.group(1).strip()
	return _pick_file_no_from_number_soup(blob)


def _pick_file_no_from_number_soup(blob: str) -> str | None:
	"""When OCR only returns digits (Arabic labels missed), pick likely file no.

	Serene medical reports typically expose CPR/ID (9 digits) then file no (5–7 digits).
	Prefer candidates that already resolve to a Patient.
	"""
	if not blob:
		return None

	# Remove date tokens so their digits are not mistaken for IDs
	cleaned = _ISO_SLASH_DATE_RE.sub(" ", _normalize_digits(blob))
	cleaned = re.sub(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b", " ", cleaned)
	# Drop obvious license / CR fragments when glued to text
	cleaned = re.sub(r"(?:License\s*No\.?|C\.?R\.?\s*No\.?)\s*[:#]?\s*\d+", " ", cleaned, flags=re.I)

	candidates = re.findall(r"\b(\d{5,10})\b", cleaned)
	if not candidates:
		# OCR sometimes appends junk: 861008:
		candidates = [re.sub(r"\D", "", m) for m in re.findall(r"\d{5,10}\D*", cleaned)]
		candidates = [c for c in candidates if 5 <= len(c) <= 10]

	# De-dupe preserving order
	seen: set[str] = set()
	ordered: list[str] = []
	for c in candidates:
		if c not in seen:
			seen.add(c)
			ordered.append(c)

	file_like = [c for c in ordered if 5 <= len(c) <= 7]
	id_like = [c for c in ordered if len(c) >= 8]

	# Prefer a file-no-length value that matches a Patient
	for c in file_like:
		try:
			if resolve_patient(c):
				return c
		except Exception:
			break
	else:
		for c in id_like:
			try:
				if resolve_patient(c):
					return c
			except Exception:
				break

	# Otherwise prefer short file-no style (861008) over CPR (900909471)
	if file_like:
		return file_like[0]
	if id_like:
		return id_like[0]
	return None


def _detect_document_type(blob: str, default_type: str) -> str:
	if not blob:
		return default_type
	for pattern, label in _DOC_TYPE_HINTS:
		if pattern.search(blob):
			return label
	return default_type


def _get_ocr_engine():
	"""Lazy-load RapidOCR (optional dependency for scanned PDFs)."""
	global _OCR_ENGINE
	if _OCR_ENGINE is False:
		return None
	if _OCR_ENGINE is not None:
		return _OCR_ENGINE

	try:
		from rapidocr_onnxruntime import RapidOCR

		_OCR_ENGINE = RapidOCR()
		return _OCR_ENGINE
	except Exception:
		# Local fallback used when package is installed under apps/healthcare/.ocr_deps
		if os.path.isdir(_OCR_DEPS_DIR):
			import sys

			if _OCR_DEPS_DIR not in sys.path:
				sys.path.insert(0, _OCR_DEPS_DIR)
			try:
				from rapidocr_onnxruntime import RapidOCR

				_OCR_ENGINE = RapidOCR()
				return _OCR_ENGINE
			except Exception:
				pass
		_OCR_ENGINE = False
		return None


def _ocr_image_path(engine, image_path: str) -> str:
	"""Run RapidOCR on a single image file; return newline-joined text."""
	try:
		ocr_result, _elapse = engine(image_path)
	except Exception:
		return ""
	if not ocr_result:
		return ""
	parts = []
	for row in ocr_result:
		if len(row) >= 2 and row[1]:
			parts.append(str(row[1]))
	return "\n".join(parts)


def _ocr_document_text(path: str, max_pages: int = OCR_MAX_PAGES) -> str:
	"""OCR a scanned PDF (rendered pages) or a standalone image. Returns text."""
	engine = _get_ocr_engine()
	if not engine:
		return ""

	ext = _file_extension(path)
	if ext in IMAGE_EXTENSIONS:
		try:
			return _ocr_image_path(engine, path)
		except Exception:
			frappe.log_error(title=f"OCR failed for image: {_basename(path)}")
			return ""

	# PDF path
	try:
		import fitz
		import tempfile

		parts: list[str] = []
		doc = fitz.open(path)
		try:
			for page in list(doc)[:max_pages]:
				pix = page.get_pixmap(matrix=fitz.Matrix(OCR_RENDER_SCALE, OCR_RENDER_SCALE))
				with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
					tmp_path = tmp.name
				try:
					pix.save(tmp_path)
					page_text = _ocr_image_path(engine, tmp_path)
					if page_text:
						parts.append(page_text)
				finally:
					try:
						os.unlink(tmp_path)
					except OSError:
						pass
		finally:
			doc.close()
		return "\n".join(parts)
	except Exception:
		frappe.log_error(title=f"OCR failed for PDF: {_basename(path)}")
		return ""


def _exif_date_from_image(path: str) -> date | None:
	"""Best-effort DateTimeOriginal / DateTime from image EXIF."""
	try:
		from PIL import Image, ExifTags

		with Image.open(path) as img:
			exif = img.getexif()
			if not exif:
				return None
			tag_map = {ExifTags.TAGS.get(k, k): v for k, v in exif.items()}
			for key in ("DateTimeOriginal", "DateTimeDigitized", "DateTime"):
				raw = tag_map.get(key)
				if not raw:
					continue
				# EXIF format: 2026:07:16 18:39:31
				m = re.match(r"(\d{4}):(\d{2}):(\d{2})", str(raw))
				if m:
					return _parse_ymd(m.group(1), m.group(2), m.group(3))
	except Exception:
		return None
	return None


def _resolve_file_disk_path(file_url: str) -> str | None:
	"""Return absolute path for an uploaded File URL, if present on disk."""
	file_url = (file_url or "").strip()
	if not file_url:
		return None

	file_name = frappe.db.get_value("File", {"file_url": file_url}, "name")
	if file_name:
		try:
			from frappe.utils.file_manager import get_file_path

			path = get_file_path(file_name)
			if path and os.path.exists(path):
				return path
		except Exception:
			pass

	# Fallback: map /files/… or /private/files/… to site path
	rel = file_url.lstrip("/")
	candidates = [
		frappe.get_site_path(rel),
		frappe.get_site_path("public", rel) if not rel.startswith("private/") else None,
	]
	for path in candidates:
		if path and os.path.exists(path):
			return path
	return None


def extract_pdf_fields(file_url: str | None = None, disk_path: str | None = None) -> dict:
	"""Best-effort extract date, patient identifier, and document type from PDF or image.

	Embedded PDF text is preferred. Image files and image-only PDF scans use RapidOCR.
	"""
	result = {
		"date_created": None,
		"legacy_patient_file_no": None,
		"detected_document_type": None,
		"patient_name_hint": None,
		"text_available": False,
		"ocr_used": False,
		"extraction_notes": "",
	}

	path = disk_path or (_resolve_file_disk_path(file_url) if file_url else None)
	if not path or not os.path.exists(path):
		result["extraction_notes"] = "file_not_found"
		return result

	title = ""
	creation_date = None
	mod_date = None
	text_parts: list[str] = []
	is_image = _is_image_filename(path)

	if is_image:
		creation_date = _exif_date_from_image(path)
	else:
		try:
			import fitz  # PyMuPDF

			doc = fitz.open(path)
			try:
				meta = doc.metadata or {}
				title = meta.get("title") or ""
				creation_date = _parse_pdf_meta_date(meta.get("creationDate"))
				mod_date = _parse_pdf_meta_date(meta.get("modDate"))
				# Cap pages read for large scanned packs
				for page in list(doc)[:8]:
					page_text = page.get_text("text") or ""
					if page_text.strip():
						text_parts.append(page_text)
			finally:
				doc.close()
		except Exception:
			try:
				from pypdf import PdfReader

				reader = PdfReader(path)
				meta = getattr(reader, "metadata", None) or {}

				def _meta_get(key: str) -> str:
					if hasattr(meta, "get"):
						return str(meta.get(key) or meta.get(f"/{key}") or "")
					return str(getattr(meta, key, "") or "")

				title = _meta_get("title") or _meta_get("Title")
				creation_date = _parse_pdf_meta_date(
					_meta_get("creation_date") or _meta_get("CreationDate")
				)
				mod_date = _parse_pdf_meta_date(
					_meta_get("modification_date") or _meta_get("ModDate")
				)
				for page in list(reader.pages)[:8]:
					try:
						page_text = page.extract_text() or ""
					except Exception:
						page_text = ""
					if page_text.strip():
						text_parts.append(page_text)
			except Exception as exc:
				# Still attempt OCR below for unknown/corrupt PDFs
				result["extraction_notes"] = f"extract_partial:{exc}"

	text = "\n".join(text_parts)
	if not text.strip():
		ocr_text = _ocr_document_text(path)
		if ocr_text.strip():
			text = ocr_text
			result["ocr_used"] = True

	result["text_available"] = bool(text.strip())
	blob = _normalize_digits(f"{title}\n{text}".strip())
	result["ocr_text"] = blob if result["ocr_used"] else ""

	result["date_created"] = creation_date or mod_date or _extract_date_from_text(blob)
	result["legacy_patient_file_no"] = _extract_identifier_from_text(blob)
	result["detected_document_type"] = _detect_document_type(blob, DEFAULT_DOCUMENT_TYPE)

	# Light name hint from ID CARD / smartcard lines
	name_match = re.search(
		r"(?:ID CARD DATA|GCC SMARTCARD DATA)\s+\d+\s+([A-Za-z][A-Za-z\s\.\-']{2,80}?)"
		r"(?:\s+[FM]\s+|\s+\d{1,2}/\d{1,2}/|\s+[\u0600-\u06FF])",
		text,
		re.IGNORECASE,
	)
	if name_match:
		result["patient_name_hint"] = " ".join(name_match.group(1).split())
	else:
		nat_name = re.search(
			r"Name\s*/[^\n]*\n\s*([A-Z][A-Z,\s\.\-']{3,80})",
			text,
		)
		if nat_name:
			result["patient_name_hint"] = " ".join(nat_name.group(1).split())

	if not result["extraction_notes"] or result["extraction_notes"].startswith("extract_partial"):
		if result["ocr_used"]:
			result["extraction_notes"] = (
				"ocr_ok" if result["legacy_patient_file_no"] else "ocr_partial"
			)
		elif result["text_available"]:
			result["extraction_notes"] = "text_ok"
		elif result["date_created"]:
			result["extraction_notes"] = "metadata_only"
		elif is_image:
			result["extraction_notes"] = "image_no_ocr"
		else:
			result["extraction_notes"] = "scanned_no_text"

	return result


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


def _find_existing(document_code: str, legacy_visit: str | None = None) -> str | None:
	filters = {"document_name": document_code}
	if legacy_visit:
		filters["legacy_visit"] = legacy_visit
	name = frappe.db.get_value("Legacy Visit Document", filters, "name")
	if name:
		return name
	# Fallback: code alone (codes appear unique in source labels)
	return frappe.db.get_value("Legacy Visit Document", {"document_name": document_code}, "name")


@frappe.whitelist()
def preview_legacy_visit_document_filenames(filenames=None, default_document_type=None) -> dict:
	"""Preview counts from local filenames before upload."""
	_require_admin()
	if isinstance(filenames, str):
		filenames = json.loads(filenames) if filenames.strip() else []
	if not isinstance(filenames, list):
		frappe.throw(_("Expected a list of filenames."))

	default_type = ensure_document_type(default_document_type or DEFAULT_DOCUMENT_TYPE)
	seed_document_types()

	valid = 0
	invalid = 0
	sample_invalid: list[str] = []
	sample_visits: list[str] = []
	seen_visits: set[str] = set()

	for raw in filenames:
		name = _basename(str(raw or ""))
		if not name:
			continue
		if not _is_allowed_document_filename(name):
			invalid += 1
			if len(sample_invalid) < 10:
				sample_invalid.append(name)
			continue

		parsed = parse_legacy_visit_document_filename(name)
		if not parsed:
			invalid += 1
			if len(sample_invalid) < 10:
				sample_invalid.append(name)
			continue

		valid += 1
		visit = parsed["legacy_visit"]
		if visit not in seen_visits:
			seen_visits.add(visit)
			if len(sample_visits) < 15:
				sample_visits.append(visit)

	return {
		"total_filenames": len(filenames),
		"valid_documents": valid,
		"invalid_filenames": invalid,
		"unique_legacy_visits": len(seen_visits),
		"default_document_type": default_type,
		"sample_legacy_visits": sample_visits,
		"sample_invalid_filenames": sample_invalid,
	}


def _import_one_item(
	item: dict,
	*,
	replace_existing: bool = True,
	default_document_type: str | None = None,
) -> str:
	filename = item.get("filename") or item.get("file_url") or ""
	file_url = (item.get("file_url") or "").strip()
	if not file_url:
		return "skip_invalid"

	parsed = parse_legacy_visit_document_filename(filename) or parse_legacy_visit_document_filename(
		file_url
	)
	if not parsed:
		return "skip_invalid"

	default_type = ensure_document_type(default_document_type or DEFAULT_DOCUMENT_TYPE)
	extracted = extract_pdf_fields(file_url=file_url)

	detected_type = extracted.get("detected_document_type") or default_type
	# Prefer auto-detected type when text/title gave a real hint; else default
	if detected_type == DEFAULT_DOCUMENT_TYPE and default_type != DEFAULT_DOCUMENT_TYPE:
		document_type = default_type
	else:
		document_type = ensure_document_type(detected_type)

	identifier = (extracted.get("legacy_patient_file_no") or "").strip() or None
	patient = resolve_patient(identifier) if identifier else None
	# If file-no didn't match, also try other OCR digit candidates (e.g. CPR / رقم الهوية)
	if not patient and extracted.get("ocr_used"):
		for cand in re.findall(r"\b(\d{6,10})\b", extracted.get("ocr_text") or ""):
			if cand == identifier:
				continue
			patient = resolve_patient(cand)
			if patient:
				break
	patient_name = None
	if patient:
		patient_name = frappe.db.get_value("Patient", patient, "patient_name")
		if not identifier:
			identifier = frappe.db.get_value("Patient", patient, "file_no") or identifier
	elif extracted.get("patient_name_hint"):
		patient_name = extracted["patient_name_hint"]

	date_created = extracted.get("date_created")
	if date_created:
		try:
			date_created = getdate(date_created)
		except Exception:
			date_created = None

	existing = _find_existing(parsed["document_code"], parsed["legacy_visit"])
	if existing and not replace_existing:
		return "skip_existing"

	payload = {
		"doctype": "Legacy Visit Document",
		"transaction_no": parsed["legacy_visit"],
		"document_name": parsed["document_code"],
		"file_name": parsed["filename"],
		"document_type": document_type,
		"document": file_url,
		"upload_remarks": parsed["filename"],
		"date_created": date_created,
		"patient": patient,
		"patient_name": patient_name,
		"legacy_patient_file_no": identifier,
		"legacy_visit": parsed["legacy_visit"],
		# patient_visit intentionally left blank for later backfill
	}

	if existing:
		doc = frappe.get_doc("Legacy Visit Document", existing)
		for key, value in payload.items():
			if key == "doctype":
				continue
			doc.set(key, value)
		doc.flags.ignore_permissions = True
		doc.save(ignore_permissions=True)
		_attach_file(file_url, "Legacy Visit Document", doc.name, "document")
		return "updated"

	doc = frappe.get_doc(payload)
	doc.insert(ignore_permissions=True)
	_attach_file(file_url, "Legacy Visit Document", doc.name, "document")
	return "created"


def cache_import_items(
	items: list[dict],
	*,
	replace_existing: bool = True,
	default_document_type: str | None = None,
) -> dict:
	seed_document_types()
	default_type = ensure_document_type(default_document_type or DEFAULT_DOCUMENT_TYPE)

	valid_items = []
	for item in items:
		if not isinstance(item, dict):
			continue
		file_url = (item.get("file_url") or "").strip()
		if not file_url:
			continue
		filename = item.get("filename") or _basename(file_url)
		if not parse_legacy_visit_document_filename(filename):
			continue
		valid_items.append({"file_url": file_url, "filename": filename})

	frappe.cache().set_value(CACHE_KEYS["items"], valid_items, expires_in_sec=CACHE_TTL)
	frappe.cache().set_value(
		CACHE_KEYS["replace"],
		1 if replace_existing else 0,
		expires_in_sec=CACHE_TTL,
	)
	frappe.cache().set_value(
		CACHE_KEYS["default_type"],
		default_type,
		expires_in_sec=CACHE_TTL,
	)
	return preview_legacy_visit_document_filenames(
		[i["filename"] for i in valid_items],
		default_document_type=default_type,
	)


def run_legacy_visit_document_import_batch(offset: int = 0) -> dict:
	items = frappe.cache().get_value(CACHE_KEYS["items"]) or []
	replace_existing = bool(cint(frappe.cache().get_value(CACHE_KEYS["replace"]) or 1))
	default_document_type = (
		frappe.cache().get_value(CACHE_KEYS["default_type"]) or DEFAULT_DOCUMENT_TYPE
	)

	stats = {
		"processed": offset,
		"created": 0,
		"updated": 0,
		"skip_invalid": 0,
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
			result = _import_one_item(
				item,
				replace_existing=replace_existing,
				default_document_type=default_document_type,
			)
			if result == "created":
				stats["created"] += 1
			elif result == "updated":
				stats["updated"] += 1
			elif result == "skip_invalid":
				stats["skip_invalid"] += 1
			elif result == "skip_existing":
				stats["skip_existing"] += 1
		except Exception:
			stats["errors"] += 1
			frappe.log_error(
				title=f"Legacy visit document import failed: {item.get('filename') or item.get('file_url')}"
			)

	frappe.db.commit()
	stats["processed"] = offset + len(batch)
	if stats["processed"] >= len(items):
		stats["done"] = True
	return stats


@frappe.whitelist()
def analyze_legacy_visit_documents(filenames=None) -> dict:
	"""Analyze coverage: which DOC_ filenames already have Legacy Visit Document rows."""
	_require_admin()
	if isinstance(filenames, str):
		filenames = json.loads(filenames) if filenames.strip() else []
	if filenames is None:
		filenames = []
	if not isinstance(filenames, list):
		frappe.throw(_("Expected a list of filenames."))

	uploaded_ok: list[dict] = []
	not_uploaded: list[dict] = []
	invalid = 0
	seen: set[str] = set()

	for raw in filenames:
		name = _basename(str(raw or ""))
		if not name:
			continue
		if not _is_allowed_document_filename(name):
			invalid += 1
			continue
		parsed = parse_legacy_visit_document_filename(name)
		if not parsed:
			invalid += 1
			continue

		key = parsed["document_code"]
		if key in seen:
			continue
		seen.add(key)

		existing = _find_existing(parsed["document_code"], parsed["legacy_visit"])
		base = {
			"legacy_visit": parsed["legacy_visit"],
			"document_code": parsed["document_code"],
			"filename": parsed["filename"],
		}
		if existing:
			row = frappe.db.get_value(
				"Legacy Visit Document",
				existing,
				["name", "document", "patient", "date_created", "document_type"],
				as_dict=True,
			)
			uploaded_ok.append(
				{
					**base,
					"status": "uploaded_ok",
					"legacy_visit_document": existing,
					"patient": (row or {}).get("patient") or "",
					"document_url": (row or {}).get("document") or "",
					"date_created": str((row or {}).get("date_created") or ""),
					"document_type": (row or {}).get("document_type") or "",
				}
			)
		else:
			not_uploaded.append({**base, "status": "not_uploaded"})

	return {
		"folder_filenames": len(filenames),
		"folder_valid": len(seen),
		"folder_invalid": invalid,
		"uploaded_ok": len(uploaded_ok),
		"not_uploaded": len(not_uploaded),
		"samples": {
			"not_uploaded": [i["filename"] for i in not_uploaded[:20]],
			"uploaded_ok": [i["filename"] for i in uploaded_ok[:20]],
		},
	}
