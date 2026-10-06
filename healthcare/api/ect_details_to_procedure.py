"""Transfer existing ECT Details rows into ECT Procedure records.

Run in batches from Healthcare Settings → Data Maintenance. Each ECT Details
row becomes one ECT Procedure. The source ECT Details name is stored on
``ECT Procedure.source_ect_details`` so re-running the job never duplicates a
record.

Every ECT Details field that also exists on ECT Procedure is copied verbatim;
the misspelled ``succinycholine_detail`` is mapped to the corrected target
field ``succinylcholine_detail``. ``no_of_session`` and ``date_of_session`` are
derived when the target does not already carry them.
"""

from __future__ import annotations

import datetime

import frappe
from frappe import _

SOURCE_DOCTYPE = "ECT Details"
TARGET_DOCTYPE = "ECT Procedure"

TRANSFER_BATCH_SIZE = 500

# Layout-only fieldtypes are never copied.
_LAYOUT_FIELDTYPES = {"Section Break", "Column Break", "Tab Break", "Heading", "Fold"}

# ECT Details fieldname -> ECT Procedure fieldname where the names differ.
_FIELD_RENAME = {
	"succinycholine_detail": "succinylcholine_detail",
}

# Child table -> the child row fields copied across (both sides share names).
_CHILD_TABLE_FIELDS = {
	"ect_details_attributes": (
		"attribute",
		"attrib_num",
		"order_of_attrib",
		"att_notes",
		"cr_id",
		"cr_date",
		"up_id",
		"up_date",
	),
}


def _require_admin():
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def _coerce(value):
	"""Make legacy values safe to assign to their target field."""
	if isinstance(value, datetime.datetime):
		return str(value)
	if isinstance(value, datetime.date):
		return str(value)
	if isinstance(value, datetime.time):
		return value.strftime("%H:%M:%S")
	if isinstance(value, datetime.timedelta):
		return value.total_seconds()
	return value


def _build_procedure_fields(src) -> dict:
	"""Copy every compatible ECT Details field onto ECT Procedure fieldnames."""
	src_meta = frappe.get_meta(SOURCE_DOCTYPE)
	target_meta = frappe.get_meta(TARGET_DOCTYPE)
	fields: dict = {}

	for df in src_meta.fields:
		if df.fieldtype in _LAYOUT_FIELDTYPES or df.fieldtype == "Table":
			continue
		target = _FIELD_RENAME.get(df.fieldname, df.fieldname)
		if not target_meta.has_field(target):
			continue
		value = _coerce(src.get(df.fieldname))
		if value in (None, ""):
			continue
		fields[target] = value

	# Child tables (ECT Details Attributes) → matching target child table.
	for child_field, keys in _CHILD_TABLE_FIELDS.items():
		if not target_meta.has_field(child_field):
			continue
		rows = [
			{key: _coerce(row.get(key)) for key in keys}
			for row in (src.get(child_field) or [])
		]
		if rows:
			fields[child_field] = rows

	return fields


def _next_session_no(patient: str) -> int:
	return frappe.db.count(TARGET_DOCTYPE, {"patient": patient}) + 1


def transfer_one(ect_detail_name: str) -> dict:
	"""Create one ECT Procedure from a single ECT Details row (idempotent)."""
	target_meta = frappe.get_meta(TARGET_DOCTYPE)
	has_source_field = target_meta.has_field("source_ect_details")

	if has_source_field and frappe.db.exists(
		TARGET_DOCTYPE, {"source_ect_details": ect_detail_name}
	):
		return {"status": "skipped", "reason": "already_transferred", "source": ect_detail_name}

	src = frappe.get_doc(SOURCE_DOCTYPE, ect_detail_name)
	if not src.get("patient"):
		return {"status": "skipped", "reason": "no_patient", "source": ect_detail_name}

	fields = _build_procedure_fields(src)
	fields["patient"] = src.patient
	fields.setdefault(
		"patient_name", frappe.db.get_value("Patient", src.patient, "patient_name")
	)

	if target_meta.has_field("no_of_session") and not fields.get("no_of_session"):
		fields["no_of_session"] = _next_session_no(src.patient)
	if target_meta.has_field("date_of_session") and not fields.get("date_of_session"):
		fields["date_of_session"] = _coerce(src.get("date"))
	if has_source_field:
		fields["source_ect_details"] = src.name

	doc = frappe.get_doc({"doctype": TARGET_DOCTYPE, **fields})
	doc.flags.ignore_mandatory = True
	doc.flags.ignore_links = True
	doc.flags.ignore_validate = True
	doc.insert(ignore_permissions=True)

	return {"status": "created", "name": doc.name, "source": ect_detail_name}


@frappe.whitelist()
def preview_ect_details_to_procedure_transfer() -> dict:
	"""Return counts used by the Healthcare Settings confirmation dialog."""
	_require_admin()

	total = frappe.db.count(SOURCE_DOCTYPE)
	with_patient = frappe.db.count(SOURCE_DOCTYPE, {"patient": ["is", "set"]})
	already = 0
	if frappe.get_meta(TARGET_DOCTYPE).has_field("source_ect_details"):
		already = frappe.db.count(TARGET_DOCTYPE, {"source_ect_details": ["is", "set"]})

	return {
		"total_details": total,
		"with_patient": with_patient,
		"already_transferred": already,
		"pending": max(total - already, 0),
	}


def run_ect_details_to_procedure_transfer_batch(*, offset: int = 0) -> dict:
	name_rows = frappe.get_all(
		SOURCE_DOCTYPE,
		fields=["name"],
		order_by="creation asc, name asc",
		limit=TRANSFER_BATCH_SIZE,
		limit_start=offset,
	)
	names = [row["name"] for row in name_rows]
	if not names:
		return {
			"processed": offset,
			"done": True,
			"batch_count": 0,
			"created": 0,
			"skipped": 0,
			"errors": 0,
		}

	created = skipped = errors = 0
	for name in names:
		try:
			result = transfer_one(name)
			if result.get("status") == "created":
				created += 1
			else:
				skipped += 1
		except Exception:
			errors += 1
			frappe.log_error(
				title=f"ECT Details → ECT Procedure transfer failed: {name}",
				message=frappe.get_traceback(),
			)

	frappe.db.commit()
	processed = offset + len(names)
	return {
		"processed": processed,
		"done": len(names) < TRANSFER_BATCH_SIZE,
		"batch_count": len(names),
		"created": created,
		"skipped": skipped,
		"errors": errors,
	}
