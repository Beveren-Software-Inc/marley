"""Shared billing search helpers (case no, SO/SI id, healthcare reference)."""

from __future__ import annotations

import frappe

from healthcare.api.legacy_id_normalize import normalize_legacy_id


def _strip(value) -> str:
	return (value or "").strip()


def resolve_billing_healthcare_references(search: str | None, patient: str | None = None) -> list[str]:
	"""Resolve admission / visit case numbers to document names on SO/SI custom_reference_name."""
	key = _strip(search)
	if not key:
		return []

	refs: set[str] = set()
	plain = normalize_legacy_id(key) or key

	for doctype in ("Inpatient Admission", "Patient Visit"):
		if frappe.db.exists(doctype, key):
			refs.add(key)
		if plain and plain != key and frappe.db.exists(doctype, plain):
			refs.add(plain)

	admission_fields = ("case_no", "admission_no_old", "name")
	visit_fields = ("case_no", "name")

	for doctype, fields in (
		("Inpatient Admission", admission_fields),
		("Patient Visit", visit_fields),
	):
		for field in fields:
			for term in dict.fromkeys([key, plain]):
				if not term:
					continue
				name = frappe.db.get_value(doctype, {field: term}, "name")
				if name:
					refs.add(name)
				for row in frappe.get_all(
					doctype,
					filters={field: ["like", f"%{term}%"]},
					pluck="name",
					limit=25,
				):
					refs.add(row)

		if patient and frappe.db.exists("Patient", patient):
			for field in fields:
				for term in dict.fromkeys([key, plain]):
					if not term:
						continue
					name = frappe.db.get_value(
						doctype, {"patient": patient, field: term}, "name"
					)
					if name:
						refs.add(name)

	return list(refs)


def billing_search_or_filters(search: str | None, patient: str | None = None) -> list:
	"""Build frappe ``or_filters`` for Sales Order / Sales Invoice billing search."""
	key = _strip(search)
	if not key:
		return []

	like = f"%{key}%"
	or_filters = [
		["name", "like", like],
		["custom_reference_name", "like", like],
		["custom_base_reference_name", "like", like],
		["patient_name", "like", like],
		["patient", "like", like],
	]

	refs = resolve_billing_healthcare_references(key, patient)
	if refs:
		or_filters.append(["custom_reference_name", "in", refs])

	return or_filters
