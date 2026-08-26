"""Backfill Patient.category from Patient.pat_major_type (A/N/R)."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint

from healthcare.api.data_migration_jobs import (
	PATIENT_BATCH_SIZE,
	_acquire_lock,
	_ensure_patient_category,
	_job_progress_key,
	_release_lock,
	_require_admin,
	_set_progress,
)

JOB = "patient_category_from_major_type"

# Pat Major Type → Patient Category name
MAJOR_TYPE_TO_CATEGORY = {
	"A": "Military",
	"N": "Regular",
	"R": "VIP",
}


def _target_category(pat_major_type: str | None) -> str | None:
	code = (pat_major_type or "").strip().upper()
	return MAJOR_TYPE_TO_CATEGORY.get(code)


def _ensure_categories() -> None:
	for name in MAJOR_TYPE_TO_CATEGORY.values():
		_ensure_patient_category(name)


def _update_one_patient(patient_name: str, pat_major_type: str | None, current_category: str | None) -> str:
	target = _target_category(pat_major_type)
	if not target:
		return "skipped_no_code" if not (pat_major_type or "").strip() else "skipped_unmatched"

	current = (current_category or "").strip()
	if current == target:
		return "skipped_already_ok"

	frappe.db.set_value("Patient", patient_name, "category", target, update_modified=False)
	return "updated"


@frappe.whitelist()
def preview_patient_category_from_major_type() -> dict:
	_require_admin()
	_ensure_categories()
	rows = frappe.db.sql(
		"""
		SELECT name,
			IFNULL(pat_major_type, '') AS pat_major_type,
			IFNULL(category, '') AS category
		FROM `tabPatient`
		WHERE IFNULL(pat_major_type, '') != ''
		""",
		as_dict=True,
	)
	needs_update = 0
	skipped_unmatched = 0
	skipped_already_ok = 0
	by_type = {"A": 0, "N": 0, "R": 0, "other": 0}
	sample: list[dict] = []
	for row in rows:
		code = (row.get("pat_major_type") or "").strip().upper()
		if code in by_type:
			by_type[code] += 1
		else:
			by_type["other"] += 1
		target = _target_category(code)
		if not target:
			skipped_unmatched += 1
			continue
		if (row.get("category") or "").strip() == target:
			skipped_already_ok += 1
			continue
		needs_update += 1
		if len(sample) < 8:
			sample.append(
				{
					"patient": row.name,
					"pat_major_type": row.get("pat_major_type"),
					"from": row.get("category") or "",
					"to": target,
				}
			)
	return {
		"patients_with_code": len(rows),
		"needs_update": needs_update,
		"skipped_already_ok": skipped_already_ok,
		"skipped_unmatched": skipped_unmatched,
		"count_A_military": by_type["A"],
		"count_N_regular": by_type["N"],
		"count_R_vip": by_type["R"],
		"count_other": by_type["other"],
		"sample": sample,
	}


@frappe.whitelist()
def start_patient_category_from_major_type() -> dict:
	_require_admin()
	_ensure_categories()
	_acquire_lock(JOB)
	_set_progress(
		JOB,
		0,
		updated=0,
		skipped_already_ok=0,
		skipped_unmatched=0,
		skipped_no_code=0,
		errors=0,
	)
	frappe.enqueue(
		"healthcare.api.patient_category_from_major_type.process_patient_category_from_major_type_batch",
		offset=0,
		queue="long",
		timeout=3600,
		job_name="healthcare_sync_patient_category_from_major_type",
	)
	return {
		"ok": True,
		"message": _(
			"Patient Category update started in the background. "
			"Pat Major Type A → Military, N → Regular, R → VIP."
		),
	}


def process_patient_category_from_major_type_batch(offset: int = 0) -> None:
	try:
		_ensure_categories()
		rows = frappe.db.sql(
			"""
			SELECT name,
				IFNULL(pat_major_type, '') AS pat_major_type,
				IFNULL(category, '') AS category
			FROM `tabPatient`
			ORDER BY name
			LIMIT %s OFFSET %s
			""",
			(PATIENT_BATCH_SIZE, offset),
			as_dict=True,
		)

		prev = frappe.cache().get_value(_job_progress_key(JOB)) or {}
		updated = cint(prev.get("updated"))
		skipped_already_ok = cint(prev.get("skipped_already_ok"))
		skipped_unmatched = cint(prev.get("skipped_unmatched"))
		skipped_no_code = cint(prev.get("skipped_no_code"))
		errors = cint(prev.get("errors"))

		for row in rows:
			try:
				result = _update_one_patient(row.name, row.get("pat_major_type"), row.get("category"))
			except Exception:
				frappe.db.rollback()
				frappe.log_error(
					title="Patient category from major type update failed",
					message=frappe.get_traceback(),
					reference_doctype="Patient",
					reference_name=row.name,
				)
				errors += 1
				continue

			if result == "updated":
				updated += 1
			elif result == "skipped_already_ok":
				skipped_already_ok += 1
			elif result == "skipped_unmatched":
				skipped_unmatched += 1
			elif result == "skipped_no_code":
				skipped_no_code += 1

		frappe.db.commit()
		processed = offset + len(rows)
		_set_progress(
			JOB,
			processed,
			updated=updated,
			skipped_already_ok=skipped_already_ok,
			skipped_unmatched=skipped_unmatched,
			skipped_no_code=skipped_no_code,
			errors=errors,
		)

		if len(rows) >= PATIENT_BATCH_SIZE:
			frappe.enqueue(
				"healthcare.api.patient_category_from_major_type.process_patient_category_from_major_type_batch",
				offset=processed,
				queue="long",
				timeout=3600,
				job_name=f"healthcare_sync_patient_category_from_major_type_{processed}",
			)
		else:
			_set_progress(
				JOB,
				processed,
				done=True,
				updated=updated,
				skipped_already_ok=skipped_already_ok,
				skipped_unmatched=skipped_unmatched,
				skipped_no_code=skipped_no_code,
				errors=errors,
			)
			_release_lock(JOB)
			frappe.log_error(
				title="Healthcare patient category from major type complete",
				message=(
					f"Scanned {processed} patient row(s); "
					f"updated {updated}; "
					f"skipped already correct {skipped_already_ok}; "
					f"skipped unmatched type {skipped_unmatched}; "
					f"skipped without type {skipped_no_code}; "
					f"errors {errors}."
				),
			)
	except Exception:
		frappe.db.rollback()
		_set_progress(JOB, cint(offset), done=True, error=frappe.get_traceback())
		_release_lock(JOB)
		raise
