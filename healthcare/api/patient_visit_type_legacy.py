# Copyright (c) 2026, Healthcare contributors
"""Legacy visit-type code handling.

The Oracle system stores the visit type number (``VISIT_TYPE_NUM``) on every
visit row. Imported ``Patient Visit`` records keep that number in
``old_visit_type_`` and usually have no ``visit_type`` link, so the UI shows
``-`` for them.

This module provides:

* ``import_legacy_codes_from_document`` — read the visit types reference
  ``.docx`` and write ``legacy_code`` on ``Patient Visit Type``.
* ``apply_legacy_visit_type_fallback`` — fill ``visit_type`` on API rows from
  ``old_visit_type_`` so legacy visits display the matching visit type.
"""

from __future__ import annotations

import re
import zipfile
from xml.etree import ElementTree

import frappe
from frappe import _
from frappe.utils.file_manager import get_file_path

from healthcare.api.patient_info_import import _require_admin

_W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

# The reference document's "All 23 visit types" table has these headers.
_CODE_HEADERS = {"#", "VISIT_TYPE_NUM", "VISIT TYPE NUM"}
_NAME_HEADERS = {"VISIT_TYPE_NAM", "VISIT TYPE NAM"}

# Scores are spaced by 10 so an active row never outranks a more exact match.
_SCORE_EXACT = 30
_SCORE_CASEFOLD = 20
_SCORE_NORMALIZED = 10
_SCORE_ACTIVE = 5


def _w_tag(tag: str) -> str:
	return f"{{{_W_NS}}}{tag}"


def _clean_text(value) -> str:
	return re.sub(r"\s+", " ", str(value or "").replace("\u00a0", " ")).strip()


def _normalize_header(value) -> str:
	return _clean_text(value).upper()


def _normalize_name(value) -> str:
	"""Compare visit type names ignoring case, dashes and punctuation.

	``ONLINE-PSYCHOLOGY`` and ``Online Psychology`` both become
	``ONLINE PSYCHOLOGY``; trailing commas on duplicate master rows are ignored.
	"""
	text = _clean_text(value).upper()
	text = re.sub(r"[^A-Z0-9]+", " ", text)
	return re.sub(r"\s+", " ", text).strip()


def _clean_legacy_code(value) -> str:
	text = _clean_text(value)
	if not text:
		return ""
	match = re.fullmatch(r"(\d+)(?:\.0+)?", text)
	if match:
		return match.group(1)
	return text

def _is_code_header(header: str) -> bool:
	return header in _CODE_HEADERS


def _is_name_header(header: str) -> bool:
	return header in _NAME_HEADERS


def _cell_text(cell) -> str:
	# Word runs may split a label across several <w:t> nodes; joining without a
	# separator keeps words that were split mid-token intact.
	return _clean_text("".join(node.text or "" for node in cell.iter(_w_tag("t"))))


def _docx_tables(path: str) -> list[list[list[str]]]:
	"""Return every table in a .docx as ``[[row[cells]]]``."""
	try:
		with zipfile.ZipFile(path) as archive:
			with archive.open("word/document.xml") as handle:
				root = ElementTree.parse(handle).getroot()
	except (zipfile.BadZipFile, KeyError, OSError, ElementTree.ParseError):
		frappe.throw(_("Could not read the Word document. Please upload a valid .docx file."))

	tables: list[list[list[str]]] = []
	for table in root.iter(_w_tag("tbl")):
		rows: list[list[str]] = []
		for row in table.findall(_w_tag("tr")):
			cells = [_cell_text(cell) for cell in row.findall(_w_tag("tc"))]
			if any(cells):
				rows.append(cells)
		if rows:
			tables.append(rows)
	return tables


def _extract_visit_types(path: str) -> list[dict[str, str]]:
	"""Extract ``{"code", "name"}`` rows from the visit types reference table."""
	parsed: list[dict[str, str]] = []
	seen: set[tuple[str, str]] = set()

	for rows in _docx_tables(path):
		for header_index, header_row in enumerate(rows[:5]):
			headers = [_normalize_header(cell) for cell in header_row]
			code_idx = next((i for i, header in enumerate(headers) if _is_code_header(header)), None)
			name_idx = next((i for i, header in enumerate(headers) if _is_name_header(header)), None)
			if code_idx is None or name_idx is None:
				continue

			for data_row in rows[header_index + 1 :]:
				if max(code_idx, name_idx) >= len(data_row):
					continue
				code = _clean_legacy_code(data_row[code_idx])
				name = _clean_text(data_row[name_idx])
				if not code or not name:
					continue
				key = (code, name.casefold())
				if key in seen:
					continue
				seen.add(key)
				parsed.append({"code": code, "name": name})
			# Only the first matching table (summary of all visit types) is used.
			break
		if parsed:
			break

	return parsed


def _load_visit_types() -> list[dict]:
	return frappe.get_all(
		"Patient Visit Type",
		fields=["name", "visit_type", "legacy_code", "disabled"],
		limit_page_length=0,
		order_by="disabled asc, name asc",
	)


def _match_score(doc_name: str, row: dict) -> int:
	target = _clean_text(doc_name)
	normalized_target = _normalize_name(target)
	best = 0
	for candidate in (row.get("visit_type") or "", row.get("name") or ""):
		candidate = _clean_text(candidate)
		if not candidate:
			continue
		if candidate == target:
			best = max(best, _SCORE_EXACT)
		elif candidate.casefold() == target.casefold():
			best = max(best, _SCORE_CASEFOLD)
		elif _normalize_name(candidate) == normalized_target:
			best = max(best, _SCORE_NORMALIZED)
	if best and not row.get("disabled"):
		best += _SCORE_ACTIVE
	return best


def _match_visit_type(doc_name: str, rows: list[dict]) -> tuple[dict | None, list[dict]]:
	"""Return ``(best_row, ambiguous_rows)`` for a document visit type name."""
	scored = [(score, row) for row in rows if (score := _match_score(doc_name, row))]
	if not scored:
		return None, []

	top_score = max(score for score, _row in scored)
	winners = [row for score, row in scored if score == top_score]
	if len(winners) > 1:
		return None, winners
	return winners[0], []


def _apply_legacy_codes(parsed: list[dict[str, str]]) -> dict:
	if not parsed:
		frappe.throw(
			_(
				"No visit type rows were found in the document. "
				"Upload the reference document that contains the VISIT_TYPE_NAM table."
			)
		)

	rows = _load_visit_types()
	available = list(rows)
	matched_names: set[str] = set()
	updated: list[dict] = []
	unchanged: list[dict] = []
	unmatched: list[dict] = []
	conflicts: list[dict] = []

	for item in parsed:
		row, ambiguous = _match_visit_type(item["name"], available)
		if not row:
			if ambiguous:
				conflicts.append(
					{
						"code": item["code"],
						"name": item["name"],
						"matches": [candidate.get("name") for candidate in ambiguous],
					}
				)
			else:
				unmatched.append({"code": item["code"], "name": item["name"]})
			continue

		available = [candidate for candidate in available if candidate.get("name") != row.get("name")]
		matched_names.add(row.get("name"))
		old_code = _clean_legacy_code(row.get("legacy_code"))
		entry = {
			"name": row.get("name"),
			"visit_type": row.get("visit_type") or row.get("name"),
			"legacy_code": item["code"],
			"old_legacy_code": old_code,
			"document_name": item["name"],
		}
		if old_code == item["code"]:
			unchanged.append(entry)
			continue

		frappe.db.set_value("Patient Visit Type", row.get("name"), "legacy_code", item["code"])
		updated.append(entry)

	not_in_document = [
		{
			"name": row.get("name"),
			"visit_type": row.get("visit_type") or row.get("name"),
			"legacy_code": _clean_legacy_code(row.get("legacy_code")),
		}
		for row in rows
		if row.get("name") not in matched_names
	]

	frappe.db.commit()

	return {
		"rows_in_document": len(parsed),
		"updated_count": len(updated),
		"unchanged_count": len(unchanged),
		"unmatched_count": len(unmatched),
		"conflict_count": len(conflicts),
		"updated": updated,
		"unchanged": unchanged,
		"unmatched": unmatched,
		"conflicts": conflicts,
		"not_in_document": not_in_document,
	}


@frappe.whitelist()
def import_legacy_codes_from_document(file_url: str) -> dict:
	"""Read an uploaded visit types reference .docx and update legacy codes."""
	_require_admin()
	file_url = (file_url or "").strip()
	if not file_url:
		frappe.throw(_("Please upload the visit types reference document (.docx)."))

	file_name = frappe.db.get_value("File", {"file_url": file_url}, "name")
	if not file_name:
		frappe.throw(_("Uploaded file was not found. Please upload it again."))

	path = get_file_path(file_name)
	if not path.lower().endswith(".docx"):
		frappe.throw(_("Please upload a Word .docx file."))

	return _apply_legacy_codes(_extract_visit_types(path))


def import_legacy_codes_from_path(path: str) -> dict:
	"""Update legacy codes from a local .docx path (CLI / tests)."""
	return _apply_legacy_codes(_extract_visit_types(path))


def get_legacy_visit_type_map(codes) -> dict[str, dict]:
	"""Map legacy visit type numbers to Patient Visit Type rows.

	When two master rows share a legacy code the active row wins.
	"""
	clean_codes = {_clean_legacy_code(code) for code in codes if _clean_legacy_code(code)}
	if not clean_codes:
		return {}

	rows = frappe.get_all(
		"Patient Visit Type",
		filters={"legacy_code": ["in", sorted(clean_codes)]},
		fields=["name", "visit_type", "legacy_code", "disabled"],
		limit_page_length=0,
		order_by="disabled asc, name asc",
	)
	out: dict[str, dict] = {}
	for row in rows:
		code = _clean_legacy_code(row.get("legacy_code"))
		if code and code not in out:
			out[code] = row
	return out


def resolve_legacy_visit_type(old_code) -> str | None:
	"""Return the Patient Visit Type name for a legacy ``old_visit_type_`` value."""
	code = _clean_legacy_code(old_code)
	if not code:
		return None
	match = get_legacy_visit_type_map([code]).get(code)
	return (match or {}).get("name") or None


def resolve_visit_type_label(visit_type: str | None) -> str | None:
	"""Return the display label stored on the Patient Visit Type master."""
	visit_type = (visit_type or "").strip()
	if not visit_type:
		return None
	if not frappe.db.exists("Patient Visit Type", visit_type):
		return visit_type
	return (frappe.db.get_value("Patient Visit Type", visit_type, "visit_type") or visit_type).strip()


def legacy_codes_for_visit_type(visit_type: str | None) -> list[str]:
	"""Return the legacy code(s) that belong to a Patient Visit Type row."""
	visit_type = (visit_type or "").strip()
	if not visit_type:
		return []
	code = _clean_legacy_code(frappe.db.get_value("Patient Visit Type", visit_type, "legacy_code"))
	return [code] if code else []


def apply_legacy_visit_type_fallback(rows: list[dict]) -> list[dict]:
	"""Fill ``visit_type`` on legacy rows that only carry ``old_visit_type_``."""
	if not rows:
		return rows

	codes = [
		row.get("old_visit_type_")
		for row in rows
		if not _clean_text(row.get("visit_type")) and row.get("old_visit_type_")
	]
	legacy_map = get_legacy_visit_type_map(codes)

	for row in rows:
		if _clean_text(row.get("visit_type")):
			continue
		code = _clean_legacy_code(row.get("old_visit_type_"))
		match = legacy_map.get(code)
		if not match:
			continue
		row["visit_type"] = match.get("name")
		row["visit_type_label"] = match.get("visit_type") or match.get("name")
		row["legacy_visit_type"] = True

	return rows

