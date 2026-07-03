"""Shared helpers for legacy Patient Visit prescription PMO imports."""

from __future__ import annotations

from typing import Any

import frappe

from healthcare.api.data_migration_jobs import LEGACY_PMO_SIGNATURE

PMO_DOCTYPE = "Patient Medication Order"


def existing_pmo_for_legacy_visit(
	visit_cd: str,
	*,
	patient: str | None,
	patient_visit: str | None,
	source_flag: str,
) -> str | None:
	filters: dict[str, Any] = {
		"care_context": "Patient Visit",
		source_flag: 1,
		"docstatus": ["!=", 2],
	}
	if patient_visit:
		filters["patient_encounter"] = patient_visit
	else:
		filters["visit_cd"] = visit_cd
		if patient:
			filters["patient"] = patient
	return frappe.db.get_value(PMO_DOCTYPE, filters, "name", order_by="modified desc")


def submit_and_complete_legacy_visit_pmo(doc) -> None:
	"""Submit legacy OP visit PMO and set status Completed on upload."""
	total = len(doc.get("medication_orders") or [])
	for child in doc.get("medication_orders") or []:
		child.is_completed = 1
	doc.total_orders = total
	doc.completed_orders = total
	doc.new_system = 0
	doc.doctors_signature = LEGACY_PMO_SIGNATURE
	doc.flags.ignore_mandatory = True
	doc.flags.ignore_links = True
	doc.flags.ignore_validate = True
	frappe.flags.in_import = True
	doc.save(ignore_permissions=True)
	if doc.docstatus == 0:
		doc.flags.ignore_mandatory = True
		doc.flags.ignore_validate = True
		doc.submit()
	doc.reload()
	frappe.db.set_value(
		doc.doctype,
		doc.name,
		{
			"status": "Completed",
			"completed_orders": total,
			"total_orders": total,
			"new_system": 0,
			"doctors_signature": LEGACY_PMO_SIGNATURE,
		},
		update_modified=False,
	)
	doc.status = "Completed"
	doc.completed_orders = total
	doc.total_orders = total


def _chunked(values: list[str], size: int = 1000):
	for offset in range(0, len(values), size):
		yield values[offset : offset + size]


def _bulk_existing_patient_ids(patient_ids: set[str]) -> set[str]:
	found: set[str] = set()
	if not patient_ids:
		return found
	for chunk in _chunked(sorted(patient_ids)):
		found.update(frappe.get_all("Patient", filters={"name": ["in", chunk]}, pluck="name"))
	return found


def _bulk_visit_links(visit_cds: list[str]) -> dict[str, str | None]:
	by_visit_cd: dict[str, str] = {}
	if not visit_cds:
		return {}
	for chunk in _chunked(visit_cds):
		for row in frappe.get_all(
			"Patient Visit",
			filters={"case_no": ["in", chunk]},
			fields=["name", "case_no"],
		):
			by_visit_cd[row.case_no] = row.name
		for row in frappe.get_all(
			"Patient Visit",
			filters={"name": ["in", chunk]},
			fields=["name", "case_no"],
		):
			by_visit_cd.setdefault(row.name, row.name)
	return {visit_cd: by_visit_cd.get(visit_cd) for visit_cd in visit_cds}


def _bulk_existing_legacy_visit_cds(
	grouped: dict[str, dict],
	visit_links: dict[str, str | None],
	*,
	source_flag: str,
) -> set[str]:
	existing: set[str] = set()
	visit_cds = list(grouped.keys())
	base_filters = {
		"care_context": "Patient Visit",
		source_flag: 1,
		"docstatus": ["!=", 2],
	}

	for chunk in _chunked(visit_cds):
		rows = frappe.get_all(
			PMO_DOCTYPE,
			filters={**base_filters, "visit_cd": ["in", chunk]},
			pluck="visit_cd",
		)
		existing.update(row for row in rows if row)

	encounter_to_visit_cd = {
		visit_name: visit_cd for visit_cd, visit_name in visit_links.items() if visit_name
	}
	for chunk in _chunked(sorted(encounter_to_visit_cd.keys())):
		rows = frappe.get_all(
			PMO_DOCTYPE,
			filters={**base_filters, "patient_encounter": ["in", chunk]},
			pluck="patient_encounter",
		)
		for encounter in rows:
			visit_cd = encounter_to_visit_cd.get(encounter)
			if visit_cd:
				existing.add(visit_cd)

	return existing


def preview_counts_for_legacy_visit_pmo(
	grouped: dict[str, dict],
	raw_line_count: int,
	*,
	source_flag: str,
) -> dict:
	visit_cds = list(grouped.keys())
	patient_ids = {
		payload.get("patient_file_no")
		for payload in grouped.values()
		if payload.get("patient_file_no")
	}
	existing_patients = _bulk_existing_patient_ids(patient_ids)
	visit_links = _bulk_visit_links(visit_cds)
	existing_visit_cds = _bulk_existing_legacy_visit_cds(
		grouped,
		visit_links,
		source_flag=source_flag,
	)

	resolvable_patients = sum(
		1
		for payload in grouped.values()
		if payload.get("patient_file_no") in existing_patients
	)
	resolvable_visits = sum(1 for visit_cd in visit_cds if visit_links.get(visit_cd))

	return {
		"visits": len(grouped),
		"medicine_lines": raw_line_count,
		"existing_records": len(existing_visit_cds),
		"resolvable_patients": resolvable_patients,
		"resolvable_visits": resolvable_visits,
		"sample_visit_cds": visit_cds[:5],
	}
