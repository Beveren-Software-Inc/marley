"""Backfill Patient Medication Order inpatient_record + patient from written_inpatient_admission."""

from __future__ import annotations

import frappe
from frappe import _

from healthcare.api.visit_diagnosis_sync import _resolve_inpatient_admission

PMO_ADMISSION_BACKFILL_BATCH_SIZE = 50
CACHE_NAMES = "healthcare:data_migration:pmo_admission_backfill:names"
CACHE_TTL = 7200


def _require_admin() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def _pmo_candidate_names() -> list[str]:
	rows = frappe.db.sql(
		"""
		SELECT name
		FROM `tabPatient Medication Order`
		WHERE docstatus != 2
		  AND IFNULL(written_inpatient_admission, '') != ''
		ORDER BY name
		""",
		as_dict=True,
	)
	return [row.name for row in rows]


def _resolve_written_admission(written: str, *, old_admission_no: str | None = None) -> str | None:
	text = (written or "").strip()
	if not text:
		return None
	admission = _resolve_inpatient_admission(text)
	if admission:
		return admission
	if old_admission_no and old_admission_no.strip() != text:
		return _resolve_inpatient_admission(old_admission_no.strip())
	return None


def _patient_display_fields(patient: str) -> dict:
	if not patient or not frappe.db.exists("Patient", patient):
		return {}
	patient_doc = frappe.get_doc("Patient", patient)
	fields = {
		"patient_name": patient_doc.patient_name,
		"nationality": getattr(patient_doc, "nationality", None),
	}
	# Patient.age is a relativedelta object; db_set needs the display string from get_age().
	if patient_doc.dob:
		age_str = patient_doc.get_age()
		if age_str:
			fields["patient_age"] = age_str
	return fields


def backfill_patient_medication_order_admission(name: str) -> dict:
	"""Copy written_inpatient_admission → inpatient_record and patient fields from admission."""
	row = frappe.db.get_value(
		"Patient Medication Order",
		name,
		[
			"written_inpatient_admission",
			"old_admission_no",
			"inpatient_record",
			"patient",
			"care_context",
			"company",
			"practitioner",
		],
		as_dict=True,
	)
	if not row:
		return {"status": "missing", "name": name}

	written = (row.written_inpatient_admission or "").strip()
	if not written:
		return {"status": "skip_no_written", "name": name}

	admission = _resolve_written_admission(written, old_admission_no=row.old_admission_no)
	if not admission:
		return {"status": "skip_no_admission", "name": name, "written": written}

	adm = frappe.db.get_value(
		"Inpatient Admission",
		admission,
		["patient", "patient_name", "company", "primary_practitioner", "secondary_practitioner"],
		as_dict=True,
	)
	if not adm or not adm.patient:
		return {"status": "skip_no_patient_on_admission", "name": name, "admission": admission}

	updates: dict = {}
	if (row.inpatient_record or "") != admission:
		updates["inpatient_record"] = admission
	if (row.patient or "") != adm.patient:
		updates["patient"] = adm.patient
	if (row.care_context or "") != "Inpatient Admission":
		updates["care_context"] = "Inpatient Admission"

	patient_fields = _patient_display_fields(adm.patient)
	if patient_fields.get("patient_name"):
		updates["patient_name"] = patient_fields["patient_name"]
	if patient_fields.get("nationality") is not None:
		updates["nationality"] = patient_fields["nationality"]
	if patient_fields.get("patient_age") is not None:
		updates["patient_age"] = patient_fields["patient_age"]

	if adm.company and (row.company or "") != adm.company:
		updates["company"] = adm.company

	practitioner = adm.primary_practitioner or adm.secondary_practitioner
	if practitioner and (row.practitioner or "") != practitioner:
		updates["practitioner"] = practitioner

	if not updates:
		return {"status": "skip_no_change", "name": name, "admission": admission}

	for field, value in updates.items():
		frappe.db.set_value(
			"Patient Medication Order",
			name,
			field,
			value,
			update_modified=False,
		)

	return {
		"status": "ok",
		"name": name,
		"admission": admission,
		"patient": adm.patient,
		"updated_fields": sorted(updates.keys()),
	}


@frappe.whitelist()
def preview_pmo_written_admission_backfill() -> dict:
	_require_admin()
	names = _pmo_candidate_names()
	needs_update = 0
	unresolved = 0
	sample: list[dict] = []

	for name in names[:200]:
		row = frappe.db.get_value(
			"Patient Medication Order",
			name,
			["written_inpatient_admission", "old_admission_no", "inpatient_record", "patient"],
			as_dict=True,
		)
		if not row:
			continue
		written = (row.written_inpatient_admission or "").strip()
		admission = _resolve_written_admission(written, old_admission_no=row.old_admission_no)
		if not admission:
			unresolved += 1
			if len(sample) < 8:
				sample.append({"name": name, "written": written, "issue": "admission_not_found"})
			continue
		adm_patient = frappe.db.get_value("Inpatient Admission", admission, "patient")
		if (
			(row.inpatient_record or "") != admission
			or (row.patient or "") != (adm_patient or "")
			or not row.patient
			or not row.inpatient_record
		):
			needs_update += 1
			if len(sample) < 8:
				sample.append(
					{
						"name": name,
						"written": written,
						"resolved_admission": admission,
						"current_inpatient_record": row.inpatient_record,
						"current_patient": row.patient,
					}
				)

	return {
		"candidates": len(names),
		"needs_update_sampled": needs_update,
		"unresolved_sampled": unresolved,
		"sample": sample,
	}


def run_pmo_admission_backfill_batch(names: list[str]) -> dict:
	ok = skip = errors = 0
	error_samples: list[str] = []

	for name in names:
		savepoint = f"pmo_adm_backfill_{name}".replace("/", "_")[:60]
		try:
			frappe.db.savepoint(savepoint)
			result = backfill_patient_medication_order_admission(name)
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


def cache_pmo_admission_backfill_names() -> int:
	names = _pmo_candidate_names()
	frappe.cache().set_value(CACHE_NAMES, names, expires_in_sec=CACHE_TTL)
	return len(names)


def load_cached_pmo_admission_backfill_names() -> list[str]:
	raw = frappe.cache().get_value(CACHE_NAMES)
	return list(raw) if raw else []
