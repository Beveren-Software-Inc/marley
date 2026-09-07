"""Backfill Clinical Note branch (cost center) from Patient Visit or Inpatient Admission."""

from __future__ import annotations

import frappe
from frappe import _

from healthcare.healthcare.doctype.clinical_note.clinical_note import resolve_clinical_note_branch

CLINICAL_NOTE_BRANCH_BACKFILL_BATCH_SIZE = 500
CACHE_NAMES = "healthcare:data_migration:clinical_note_branch_backfill:names"
CACHE_TTL = 7200


def _require_admin() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def _clinical_note_branch_candidate_names() -> list[str]:
	rows = frappe.db.sql(
		"""
		SELECT name
		FROM `tabClinical Note`
		WHERE IFNULL(branch, '') = ''
		  AND (
			(NULLIF(reference_doctype, '') = 'Patient Visit' AND NULLIF(reference_document, '') IS NOT NULL)
			OR (NULLIF(reference_doc, '') = 'Patient Visit' AND NULLIF(reference_name, '') IS NOT NULL)
			OR (NULLIF(reference_doctype, '') = 'Inpatient Admission' AND NULLIF(reference_document, '') IS NOT NULL)
			OR (NULLIF(reference_doc, '') = 'Inpatient Admission' AND NULLIF(reference_name, '') IS NOT NULL)
			OR NULLIF(inpatient_admission, '') IS NOT NULL
		  )
		ORDER BY name
		""",
		as_dict=True,
	)
	return [row.name for row in rows]


def backfill_clinical_note_branch(name: str) -> dict:
	"""Set branch (and empty cost_center) from linked visit or admission."""
	row = frappe.db.get_value(
		"Clinical Note",
		name,
		[
			"branch",
			"cost_center",
			"reference_doctype",
			"reference_document",
			"reference_doc",
			"reference_name",
			"inpatient_admission",
		],
		as_dict=True,
	)
	if not row:
		return {"status": "missing", "name": name}

	if (row.branch or "").strip():
		return {"status": "skip_has_branch", "name": name}

	cc = resolve_clinical_note_branch(row)
	if not cc:
		return {"status": "skip_no_source", "name": name}

	updates = {"branch": cc}
	if (row.cost_center or "").strip() != cc:
		updates["cost_center"] = cc

	frappe.db.set_value("Clinical Note", name, updates, update_modified=False)
	return {
		"status": "ok",
		"name": name,
		"branch": cc,
		"updated_fields": sorted(updates.keys()),
	}


@frappe.whitelist()
def preview_clinical_note_branch_backfill() -> dict:
	_require_admin()
	names = _clinical_note_branch_candidate_names()
	needs_update = 0
	unresolved = 0
	sample: list[dict] = []

	for name in names[:200]:
		row = frappe.db.get_value(
			"Clinical Note",
			name,
			[
				"branch",
				"reference_doctype",
				"reference_document",
				"reference_doc",
				"reference_name",
				"inpatient_admission",
			],
			as_dict=True,
		)
		if not row:
			continue
		cc = resolve_clinical_note_branch(row)
		if not cc:
			unresolved += 1
			if len(sample) < 8:
				sample.append(
					{
						"name": name,
						"reference_doctype": row.reference_doctype or row.reference_doc,
						"reference_document": row.reference_document or row.reference_name,
						"inpatient_admission": row.inpatient_admission,
						"issue": "no_cost_center_on_visit_or_admission",
					}
				)
			continue
		needs_update += 1
		if len(sample) < 8:
			sample.append(
				{
					"name": name,
					"resolved_branch": cc,
					"reference_doctype": row.reference_doctype or row.reference_doc,
					"reference_document": row.reference_document or row.reference_name,
					"inpatient_admission": row.inpatient_admission,
				}
			)

	return {
		"candidates": len(names),
		"needs_update_sampled": needs_update,
		"unresolved_sampled": unresolved,
		"sample": sample,
	}


def run_clinical_note_branch_backfill_batch(names: list[str]) -> dict:
	ok = skip = errors = 0
	error_samples: list[str] = []

	for name in names:
		savepoint = f"cn_branch_{name}".replace("/", "_")[:60]
		try:
			frappe.db.savepoint(savepoint)
			result = backfill_clinical_note_branch(name)
			status = result.get("status")
			if status == "ok":
				ok += 1
			elif status and status.startswith("skip_"):
				skip += 1
			else:
				errors += 1
				error_samples.append(f"{name}: {status}")
		except Exception:
			frappe.db.rollback(save_point=savepoint)
			errors += 1
			error_samples.append(f"{name}: {frappe.get_traceback()}")

	frappe.db.commit()
	return {
		"batch_count": len(names),
		"ok": ok,
		"skip": skip,
		"errors": errors,
		"error_samples": error_samples[:5],
	}


def cache_clinical_note_branch_backfill_names() -> int:
	names = _clinical_note_branch_candidate_names()
	frappe.cache().set_value(CACHE_NAMES, names, expires_in_sec=CACHE_TTL)
	return len(names)


def load_cached_clinical_note_branch_backfill_names() -> list[str]:
	raw = frappe.cache().get_value(CACHE_NAMES)
	return list(raw) if raw else []
