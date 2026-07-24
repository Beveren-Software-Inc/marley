# Copyright (c) 2026, Healthcare contributors
"""Portal APIs for Legacy Visit Document."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint


def _patient_identifiers(patient: str) -> set[str]:
	"""Collect Patient name + file_no / uid / id_number / national_id variants."""
	row = frappe.db.get_value(
		"Patient",
		patient,
		["name", "file_no", "uid", "id_number", "national_id"],
		as_dict=True,
	)
	if not row:
		return set()

	ids: set[str] = {patient}
	for field in ("file_no", "uid", "id_number", "national_id"):
		val = (row.get(field) or "").strip()
		if not val:
			continue
		ids.add(val)
		stripped = val.lstrip("0")
		if stripped and stripped != val:
			ids.add(stripped)
	return ids


@frappe.whitelist()
def get_patient_legacy_visit_documents(patient=None, limit=100, offset=0):
	"""Return Legacy Visit Documents for a patient (by Patient link or extracted file no)."""
	patient = (patient or "").strip()
	if not patient:
		return []
	if not frappe.db.exists("Patient", patient):
		frappe.throw(_("Patient not found"))

	limit = cint(limit) or 100
	offset = cint(offset) or 0
	identifiers = _patient_identifiers(patient)
	if not identifiers:
		return []

	# Match linked patient OR OCR / import file-no fields
	or_filters = [["patient", "=", patient]]
	for ident in identifiers:
		or_filters.append(["legacy_patient_file_no", "=", ident])

	rows = frappe.get_all(
		"Legacy Visit Document",
		or_filters=or_filters,
		fields=[
			"name",
			"transaction_no",
			"document_name",
			"file_name",
			"document_type",
			"document",
			"upload_remarks",
			"date_created",
			"patient",
			"patient_name",
			"legacy_patient_file_no",
			"legacy_visit",
			"patient_visit",
			"creation",
			"modified",
		],
		order_by="date_created desc, creation desc",
		limit_page_length=limit,
		limit_start=offset,
		ignore_permissions=True,
	)

	# De-dupe if both patient and file_no match the same row
	seen: set[str] = set()
	unique = []
	for row in rows:
		if row.name in seen:
			continue
		seen.add(row.name)
		unique.append(row)
	return unique
