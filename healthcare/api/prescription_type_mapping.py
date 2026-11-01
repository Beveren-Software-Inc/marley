"""Legacy Oracle ``redundancy_type`` → Prescription Type (display-only fallback).

New prescription lines store the doctor's chosen Prescription Type in
``medication_type``. Oracle-imported (legacy) lines carry no Prescription Type — Oracle
only has ``redundancy_type`` — so the ``Prescription Type`` doctype is used as the
mapping (``redundancy_type`` → ``prescription_type``) and every API that returns
prescription lines resolves the legacy code through it. The UI then groups / colours
the line by that type instead of guessing from the free-text instructions.

A line is treated as legacy from the **line itself** — an Oracle marker (``redundancy_type``,
``medicine_no``, ``old_medicine_code``, ``trans_num`` …) and no coded ``medication_type``.
The ``Patient Medication Order.legacy`` flag is *not* used: Oracle rows synced by the
current import carry ``legacy = 0`` while every line still only has ``redundancy_type``.

Two legacy-only rules sit on top of that mapping:

* **DC** — Oracle writes the discontinuation into the free-text ``dc`` column (``"DC"``,
  ``"DC by: ABRAR"``, ``"D/c"``, ``"stopped"``, but also ``"CHANGED"``, ``"increased"``,
  ``"decreased"``, ``"by.Dr.AK"``, a date …). Any note there means the line is no longer
  running, so it keeps its Regular type but as the **Inactive** variant
  (``Regular - Med (Inactive)`` / ``Regular - Psy (Inactive)``).
* **No code, no type** — a legacy line without a ``redundancy_type`` resolves to nothing
  (``""``). Its type is never assumed (a missing code is *not* a Regular prescription).

Nothing here writes back to a prescription line: the type is returned as
``resolved_prescription_type`` next to the stored ``medication_type``, plus
``is_legacy_line`` so the UI never guesses a type for an imported line.
"""

from __future__ import annotations

import frappe
from frappe.utils import cint, cstr

CACHE_KEY = "healthcare:prescription_type:redundancy_map"
CACHE_TTL = 24 * 60 * 60

# Oracle fills ``dc`` with a free-text end note: "DC", "DC by: ABRAR", "D/c", "stopped",
# but also "CHANGED", "increased", "dose increased", "by.Dr.AK", a date … — any note means
# the line was discontinued. Only these placeholders are not a DC note.
DC_PLACEHOLDER_VALUES = frozenset({"", "-", "--", ".", "0", "no", "n/a", "na", "nil", "none"})

# Regular types come as an Active/Inactive pair; a DC'd line belongs to the Inactive one.
INACTIVE_TYPE = {
	"Regular - Med (Active)": "Regular - Med (Inactive)",
	"Regular - Psy (Active)": "Regular - Psy (Inactive)",
}

# Fields only Oracle-imported lines carry — spot a legacy line that has no redundancy code.
LEGACY_LINE_FIELDS = (
	"redundancy_type",
	"medicine_no",
	"old_medicine_code",
	"old_medicine_name",
	"trans_num",
)


def is_legacy_prescription_line(row) -> bool:
	"""True for an Oracle-imported line (it carries an Oracle marker, not a coded type).

	Detected from the line itself — the PMO ``legacy`` flag is unreliable (Oracle rows
	synced by the current import carry ``legacy = 0`` while every line still has a
	``redundancy_type`` and an empty ``medication_type``).
	"""
	if not row:
		return False
	if cstr(row.get("medication_type")).strip():
		return False
	return any(cstr(row.get(field) or "").strip() for field in LEGACY_LINE_FIELDS)


def is_legacy_line_discontinued(row) -> bool:
	"""True when the line was stopped: Oracle's free-text ``dc`` note or Discontinued status.

	Anything written in ``dc`` except a blank / placeholder is Oracle's record of the line
	ending (``"DC"``, ``"DC by: ABRAR"``, ``"D/c"``, ``"stopped"``, ``"CHANGED"``,
	``"dose increased"``, ``"by.Dr.AK"``, ``"29/1/2017"`` …), so the line is discontinued.
	"""
	if not row:
		return False
	if cstr(row.get("medication_status")).strip().lower() == "discontinued":
		return True
	return cstr(row.get("dc")).strip().lower() not in DC_PLACEHOLDER_VALUES


def inactive_type(medication_type) -> str:
	"""Inactive variant of a Regular Prescription Type (any other type is returned as-is)."""
	value = cstr(medication_type).strip()
	return INACTIVE_TYPE.get(value, value)


def clear_redundancy_type_cache() -> None:
	"""Drop the cached map — called when Prescription Type rows change."""
	frappe.cache.delete_value(CACHE_KEY)


def get_redundancy_type_map() -> dict[int, str]:
	"""``{1: 'STAT', 2: 'Regular - Med (Active)', 3: 'PRN', …}`` from Prescription Type."""
	cached = frappe.cache.get_value(CACHE_KEY)
	if cached:
		return {cint(code): cstr(prescription_type) for code, prescription_type in cached.items()}

	if not frappe.db.exists("DocType", "Prescription Type"):
		return {}

	mapping: dict[int, str] = {}
	for row in frappe.get_all(
		"Prescription Type",
		fields=["prescription_type", "redundancy_type"],
		limit_page_length=0,
	):
		code = cint(row.get("redundancy_type"))
		prescription_type = cstr(row.get("prescription_type")).strip()
		if code and prescription_type:
			mapping[code] = prescription_type

	if mapping:
		frappe.cache.set_value(
			CACHE_KEY,
			{str(code): prescription_type for code, prescription_type in mapping.items()},
			expires_in_sec=CACHE_TTL,
		)

	return mapping


def map_redundancy_type(redundancy_type) -> str:
	"""Prescription Type mapped to a legacy Oracle ``redundancy_type`` code ('' if none)."""
	try:
		code = cint(redundancy_type)
	except (TypeError, ValueError):
		return ""

	if not code:
		return ""

	return get_redundancy_type_map().get(code, "")


def resolve_prescription_type(
	medication_type=None, redundancy_type=None, allowed=None, discontinued=False
) -> str:
	"""Type to display: coded ``medication_type`` first, legacy ``redundancy_type`` as fallback.

	A DC'd legacy line resolves to the Inactive variant of its mapped Regular type.
	``allowed`` optionally filters to the values a Select field accepts, so a legacy code
	mapped to a type that the target doctype does not offer is never written there.
	"""
	explicit = cstr(medication_type).strip()
	if explicit:
		return explicit

	legacy = map_redundancy_type(redundancy_type)
	if legacy and discontinued:
		legacy = inactive_type(legacy)
	if legacy and allowed is not None and legacy not in allowed:
		return ""

	return legacy


def apply_resolved_prescription_type(rows) -> list:
	"""Set ``resolved_prescription_type`` / ``is_legacy_line`` on dict rows or child docs."""
	for row in rows or []:
		resolved = resolve_prescription_type(
			row.get("medication_type"),
			row.get("redundancy_type"),
			discontinued=is_legacy_line_discontinued(row),
		)
		legacy_line = 1 if is_legacy_prescription_line(row) else 0
		if isinstance(row, dict):
			row["resolved_prescription_type"] = resolved
			row["is_legacy_line"] = legacy_line
		else:
			row.resolved_prescription_type = resolved
			row.is_legacy_line = legacy_line

	return rows
