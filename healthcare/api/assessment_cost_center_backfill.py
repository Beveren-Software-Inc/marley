"""Backfill assessment cost_center from Patient Visit or Inpatient Admission."""

from __future__ import annotations

import frappe
from frappe import _

from healthcare.api.assessment_care_context import (
	ASSESSMENT_COST_CENTER_DOCTYPES,
	ADMISSION_FIELDS,
	VISIT_FIELDS,
	resolve_assessment_cost_center,
)

ASSESSMENT_COST_CENTER_BACKFILL_BATCH_SIZE = 200
CACHE_NAMES = "healthcare:data_migration:assessment_cost_center_backfill:names"
PATIENT_ASSESSMENT_CACHE_NAMES = (
	"healthcare:data_migration:patient_assessment_cost_center_backfill:names"
)
PHYSICAL_EXAMINATION_CACHE_NAMES = (
	"healthcare:data_migration:physical_examination_cost_center_backfill:names"
)
CACHE_TTL = 7200


def _require_admin() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def _link_clauses(doctype: str) -> list[str]:
	meta = frappe.get_meta(doctype)
	clauses: list[str] = []
	if meta.has_field("reference_type") and meta.has_field("encounter"):
		clauses.append("NULLIF(encounter, '') IS NOT NULL")
	for field in VISIT_FIELDS + ADMISSION_FIELDS:
		if meta.has_field(field):
			clauses.append(f"NULLIF(`{field}`, '') IS NOT NULL")
	return clauses


def _empty_cost_center_clause(doctype: str) -> str:
	meta = frappe.get_meta(doctype)
	parts: list[str] = []
	if meta.has_field("cost_center"):
		parts.append("IFNULL(cost_center, '') = ''")
	if meta.has_field("branch_num"):
		parts.append("IFNULL(branch_num, '') = ''")
	if meta.has_field("branch"):
		parts.append("IFNULL(branch, '') = ''")
	if not parts:
		return "1=0"
	if len(parts) == 1:
		return parts[0]
	return "(" + " OR ".join(parts) + ")"


def _candidate_keys(doctypes: tuple[str, ...] | None = None) -> list[dict]:
	keys: list[dict] = []
	for doctype in doctypes or ASSESSMENT_COST_CENTER_DOCTYPES:
		if not frappe.db.exists("DocType", doctype):
			continue
		clauses = _link_clauses(doctype)
		if not clauses:
			continue
		empty_cc = _empty_cost_center_clause(doctype)
		rows = frappe.db.sql(
			f"""
			SELECT name
			FROM `tab{doctype}`
			WHERE {empty_cc}
			  AND ({' OR '.join(clauses)})
			ORDER BY name
			""",
			as_dict=True,
		)
		for row in rows:
			keys.append({"doctype": doctype, "name": row.name})
	return keys


def backfill_assessment_cost_center(doctype: str, name: str) -> dict:
	meta = frappe.get_meta(doctype)
	fields = [
		f
		for f in (
			"cost_center",
			"branch",
			"branch_num",
			"reference_type",
			"encounter",
			*VISIT_FIELDS,
			*ADMISSION_FIELDS,
		)
		if meta.has_field(f)
	]
	row = frappe.db.get_value(doctype, name, fields, as_dict=True)
	if not row:
		return {"status": "missing", "doctype": doctype, "name": name}

	has_cc = bool((row.get("cost_center") or "").strip()) if meta.has_field("cost_center") else True
	has_branch_num = (
		bool((row.get("branch_num") or "").strip()) if meta.has_field("branch_num") else True
	)
	if has_cc and has_branch_num:
		return {"status": "skip_has_cost_center", "doctype": doctype, "name": name}

	cc = resolve_assessment_cost_center(row)
	if not cc:
		return {"status": "skip_no_source", "doctype": doctype, "name": name}

	updates: dict = {}
	if meta.has_field("cost_center") and (row.get("cost_center") or "").strip() != cc:
		updates["cost_center"] = cc
	if meta.has_field("branch") and (row.get("branch") or "").strip() != cc:
		updates["branch"] = cc
	if meta.has_field("branch_num") and (row.get("branch_num") or "").strip() != cc:
		updates["branch_num"] = cc
	if not updates:
		return {"status": "skip_no_change", "doctype": doctype, "name": name}

	frappe.db.set_value(doctype, name, updates, update_modified=False)
	return {
		"status": "ok",
		"doctype": doctype,
		"name": name,
		"cost_center": cc,
		"updated_fields": sorted(updates.keys()),
	}


@frappe.whitelist()
def preview_assessment_cost_center_backfill() -> dict:
	_require_admin()
	keys = _candidate_keys()
	by_doctype: dict[str, int] = {}
	for item in keys:
		by_doctype[item["doctype"]] = by_doctype.get(item["doctype"], 0) + 1
	return {
		"candidates": len(keys),
		"by_doctype": by_doctype,
	}


@frappe.whitelist()
def preview_patient_assessment_cost_center_backfill() -> dict:
	_require_admin()
	keys = _candidate_keys(("Patient Assessment",))
	needs_update = 0
	unresolved = 0
	sample: list[dict] = []
	for item in keys[:200]:
		row = frappe.db.get_value(
			"Patient Assessment",
			item["name"],
			["cost_center", "reference_type", "encounter", "admission"],
			as_dict=True,
		)
		if not row:
			continue
		cc = resolve_assessment_cost_center(row)
		if not cc:
			unresolved += 1
			if len(sample) < 8:
				sample.append(
					{
						"name": item["name"],
						"reference_type": row.reference_type,
						"encounter": row.encounter,
						"admission": row.admission,
						"issue": "no_cost_center_on_visit_or_admission",
					}
				)
			continue
		needs_update += 1
		if len(sample) < 8:
			sample.append(
				{
					"name": item["name"],
					"resolved_cost_center": cc,
					"reference_type": row.reference_type,
					"encounter": row.encounter,
					"admission": row.admission,
				}
			)
	return {
		"candidates": len(keys),
		"needs_update_sampled": needs_update,
		"unresolved_sampled": unresolved,
		"sample": sample,
	}


@frappe.whitelist()
def preview_physical_examination_cost_center_backfill() -> dict:
	_require_admin()
	keys = _candidate_keys(("Physical Examination",))
	needs_update = 0
	unresolved = 0
	sample: list[dict] = []
	for item in keys[:200]:
		row = frappe.db.get_value(
			"Physical Examination",
			item["name"],
			["cost_center", "patient_visit", "inpatient_admission"],
			as_dict=True,
		)
		if not row:
			continue
		cc = resolve_assessment_cost_center(row)
		if not cc:
			unresolved += 1
			if len(sample) < 8:
				sample.append(
					{
						"name": item["name"],
						"patient_visit": row.patient_visit,
						"inpatient_admission": row.inpatient_admission,
						"issue": "no_cost_center_on_visit_or_admission",
					}
				)
			continue
		needs_update += 1
		if len(sample) < 8:
			sample.append(
				{
					"name": item["name"],
					"resolved_cost_center": cc,
					"patient_visit": row.patient_visit,
					"inpatient_admission": row.inpatient_admission,
				}
			)
	return {
		"candidates": len(keys),
		"needs_update_sampled": needs_update,
		"unresolved_sampled": unresolved,
		"sample": sample,
	}


def run_assessment_cost_center_backfill_batch(keys: list[dict]) -> dict:
	ok = skip = errors = 0
	error_samples: list[str] = []

	for item in keys:
		doctype = item["doctype"]
		name = item["name"]
		savepoint = f"assess_cc_{name}".replace("/", "_")[:60]
		try:
			frappe.db.savepoint(savepoint)
			result = backfill_assessment_cost_center(doctype, name)
			status = result.get("status")
			if status == "ok":
				ok += 1
			elif status and str(status).startswith("skip_"):
				skip += 1
			else:
				errors += 1
				error_samples.append(f"{doctype} {name}: {status}")
		except Exception:
			frappe.db.rollback(save_point=savepoint)
			errors += 1
			error_samples.append(f"{doctype} {name}: {frappe.get_traceback()}")

	frappe.db.commit()
	return {
		"batch_count": len(keys),
		"ok": ok,
		"skip": skip,
		"errors": errors,
		"error_samples": error_samples[:5],
	}


def cache_assessment_cost_center_backfill_names() -> int:
	keys = _candidate_keys()
	frappe.cache().set_value(CACHE_NAMES, keys, expires_in_sec=CACHE_TTL)
	return len(keys)


def load_cached_assessment_cost_center_backfill_names() -> list[dict]:
	raw = frappe.cache().get_value(CACHE_NAMES)
	return list(raw) if raw else []


def cache_patient_assessment_cost_center_backfill_names() -> int:
	keys = _candidate_keys(("Patient Assessment",))
	frappe.cache().set_value(PATIENT_ASSESSMENT_CACHE_NAMES, keys, expires_in_sec=CACHE_TTL)
	return len(keys)


def load_cached_patient_assessment_cost_center_backfill_names() -> list[dict]:
	raw = frappe.cache().get_value(PATIENT_ASSESSMENT_CACHE_NAMES)
	return list(raw) if raw else []


def cache_physical_examination_cost_center_backfill_names() -> int:
	keys = _candidate_keys(("Physical Examination",))
	frappe.cache().set_value(PHYSICAL_EXAMINATION_CACHE_NAMES, keys, expires_in_sec=CACHE_TTL)
	return len(keys)


def load_cached_physical_examination_cost_center_backfill_names() -> list[dict]:
	raw = frappe.cache().get_value(PHYSICAL_EXAMINATION_CACHE_NAMES)
	return list(raw) if raw else []
