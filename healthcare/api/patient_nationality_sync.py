"""Backfill Patient Nationality from pat_nationality code to the Nationality link field."""

import frappe
from frappe import _
from frappe.utils import cint

from healthcare.api.data_migration_jobs import (
	PATIENT_BATCH_SIZE,
	_acquire_lock,
	_job_progress_key,
	_release_lock,
	_require_admin,
	_set_progress,
)

JOB = "patient_nationality_sync"


def _nationality_code_map() -> dict[str, str]:
	"""Map Nationality.code (upper) to Nationality name (document name)."""
	if not frappe.db.exists("DocType", "Nationality"):
		return {}
	rows = frappe.db.sql(
		"SELECT name, IFNULL(code, '') AS code FROM `tabNationality`",
		as_dict=True,
	)
	return {
		((r.get("code") or "").strip().upper()): r.name
		for r in rows
		if (r.get("code") or "").strip()
	}


def _update_one_patient(patient_name: str, code_map: dict[str, str]) -> str:
	"""Set Patient.nationality from Patient.pat_nationality (code). Returns result key."""
	pat_nationality = (
		frappe.db.get_value("Patient", patient_name, "pat_nationality") or ""
	).strip()
	if not pat_nationality:
		return "skipped_no_code"

	nationality_name = code_map.get(pat_nationality.strip().upper())
	if not nationality_name:
		return "skipped_unmatched"

	current = (frappe.db.get_value("Patient", patient_name, "nationality") or "").strip()
	if current == nationality_name:
		return "skipped_already_ok"

	frappe.db.set_value("Patient", patient_name, "nationality", nationality_name, update_modified=False)
	return "updated"


@frappe.whitelist()
def preview_patient_nationality_sync() -> dict:
	_require_admin()
	rows = frappe.db.sql(
		"""
		SELECT name, IFNULL(pat_nationality, '') AS pat_nationality, IFNULL(nationality, '') AS nationality
		FROM `tabPatient`
		WHERE IFNULL(pat_nationality, '') != ''
		""",
		as_dict=True,
	)
	code_map = _nationality_code_map()
	needs_update = 0
	skipped_unmatched = 0
	skipped_already_ok = 0
	sample: list[dict] = []
	for row in rows:
		code = (row.get("pat_nationality") or "").strip().upper()
		if not code:
			continue
		nationality_name = code_map.get(code)
		if not nationality_name:
			skipped_unmatched += 1
			continue
		if (row.get("nationality") or "").strip() == nationality_name:
			skipped_already_ok += 1
			continue
		needs_update += 1
		if len(sample) < 8:
			sample.append(
				{
					"patient": row.name,
					"code": row.get("pat_nationality"),
					"from": row.get("nationality") or "",
					"to": nationality_name,
				}
			)
	return {
		"patients_with_code": len(rows),
		"needs_update": needs_update,
		"skipped_already_ok": skipped_already_ok,
		"skipped_unmatched": skipped_unmatched,
		"nationality_count": len(code_map),
		"sample": sample,
	}


@frappe.whitelist()
def start_patient_nationality_sync() -> dict:
	_require_admin()
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
		"healthcare.api.patient_nationality_sync.process_patient_nationality_sync_batch",
		offset=0,
		queue="long",
		timeout=3600,
		job_name="healthcare_sync_patient_nationality",
	)
	return {
		"ok": True,
		"message": _(
			"Patient Nationality sync started in the background. "
			"Each Patient's pat_nationality code is matched against the Nationality code and "
			"the Nationality link field is updated when a match is found."
		),
	}


def process_patient_nationality_sync_batch(offset: int = 0) -> None:
	try:
		rows = frappe.db.sql(
			"""
			SELECT name, IFNULL(pat_nationality, '') AS pat_nationality, IFNULL(nationality, '') AS nationality
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

		code_map = _nationality_code_map()

		for row in rows:
			try:
				result = _update_one_patient(row.name, code_map)
			except Exception:
				frappe.db.rollback()
				frappe.log_error(
					title="Patient nationality update failed",
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
				"healthcare.api.patient_nationality_sync.process_patient_nationality_sync_batch",
				offset=processed,
				queue="long",
				timeout=3600,
				job_name=f"healthcare_sync_patient_nationality_{processed}",
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
				title="Healthcare patient nationality sync complete",
				message=(
					f"Scanned {processed} patient row(s); "
					f"updated {updated}; "
					f"skipped already correct {skipped_already_ok}; "
					f"skipped unmatched code {skipped_unmatched}; "
					f"skipped without code {skipped_no_code}; "
					f"errors {errors}."
				),
			)
	except Exception:
		frappe.db.rollback()
		_set_progress(JOB, cint(offset), done=True, error=frappe.get_traceback())
		_release_lock(JOB)
		raise