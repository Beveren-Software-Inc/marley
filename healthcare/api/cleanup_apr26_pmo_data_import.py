"""Delete Patient Medication Orders created by the 2026-04-26 Data Import.

Keeps rows when the patient has no other migration-flagged prescription
(OP / HIS / IP / legacy) so Oracle coverage is not removed blindly.

Post–2026-11-05 live prescriptions are never in this set (Apr-26 import only).
"""

from __future__ import annotations

import frappe
from frappe.utils import cint

APR26_IMPORT_LABEL = "Patient Medication Order Import on 2026-04-26"
BATCH_SIZE = 50


def _apr26_import_names() -> list[str]:
	rows = frappe.db.sql(
		"""
		SELECT DISTINCT docname
		FROM `tabVersion`
		WHERE ref_doctype = 'Patient Medication Order'
		  AND data LIKE %(label)s
		  AND data LIKE '%%created_by%%'
		""",
		{"label": f"%{APR26_IMPORT_LABEL}%"},
		pluck=True,
	)
	return [n for n in (rows or []) if n]


def _patients_with_migration_rx() -> set[str]:
	"""Patients who have at least one migration-flagged PMO (any source)."""
	rows = frappe.db.sql(
		"""
		SELECT DISTINCT patient
		FROM `tabPatient Medication Order`
		WHERE patient IS NOT NULL AND patient != ''
		  AND (
		    patient_visit_prescription = 1
		    OR patient_visit_prescription_his = 1
		    OR IFNULL(old_admission_no, '') != ''
		    OR legacy = 1
		  )
		""",
		pluck=True,
	)
	return {p for p in (rows or []) if p}


def _classify() -> tuple[list[str], list[str], list[str]]:
	"""Return (safe_delete, hold_back, already_gone)."""
	apr26 = _apr26_import_names()
	mig_patients = _patients_with_migration_rx()
	# Patient has non-Apr26 migration Rx if they have any migration-flagged PMO
	# whose name is not in the Apr26 set.
	apr26_set = set(apr26)
	safe: list[str] = []
	hold: list[str] = []
	missing: list[str] = []

	# Patients who have a migration-flagged PMO outside the Apr26 set
	covered: set[str] = set()
	if apr26_set:
		# All migration PMOs not in apr26
		rows = frappe.db.sql(
			"""
			SELECT DISTINCT patient, name
			FROM `tabPatient Medication Order`
			WHERE patient IS NOT NULL AND patient != ''
			  AND (
			    patient_visit_prescription = 1
			    OR patient_visit_prescription_his = 1
			    OR IFNULL(old_admission_no, '') != ''
			    OR legacy = 1
			  )
			"""
		)
		for patient, name in rows or []:
			if name not in apr26_set and patient:
				covered.add(patient)

	for name in sorted(apr26_set, key=lambda n: (len(n), n)):
		row = frappe.db.get_value(
			"Patient Medication Order",
			name,
			["name", "patient", "docstatus"],
			as_dict=True,
		)
		if not row:
			missing.append(name)
			continue
		if cint(row.docstatus) == 2:
			continue
		patient = (row.patient or "").strip()
		if patient and patient in covered:
			safe.append(name)
		else:
			hold.append(name)

	return safe, hold, missing


def preview_apr26_pmo_cleanup() -> dict:
	safe, hold, missing = _classify()
	return {
		"apr26_import_total": len(safe) + len(hold) + len(missing),
		"already_gone": len(missing),
		"safe_delete": len(safe),
		"hold_back": len(hold),
		"safe_sample": safe[:20],
		"hold_sample": hold[:20],
		"hold_names": hold,
		"migration_patients_total": len(_patients_with_migration_rx()),
	}


def _cancel_and_delete_pmo(name: str) -> str:
	if not frappe.db.exists("Patient Medication Order", name):
		return "missing"
	doc = frappe.get_doc("Patient Medication Order", name)
	doc.flags.ignore_permissions = True
	if cint(doc.docstatus) == 1:
		doc.cancel()
	if frappe.db.exists("Patient Medication Order", name):
		frappe.delete_doc(
			"Patient Medication Order",
			name,
			force=1,
			ignore_permissions=True,
		)
	return "deleted"


@frappe.whitelist()
def preview_cleanup_apr26_pmo_data_import() -> dict:
	frappe.only_for(("System Manager", "Healthcare Administrator"))
	return preview_apr26_pmo_cleanup()


@frappe.whitelist()
def run_cleanup_apr26_pmo_data_import(limit: int | None = None, offset: int = 0) -> dict:
	"""Delete Apr-26 Data Import PMOs when the patient still has migration Rx."""
	frappe.only_for(("System Manager", "Healthcare Administrator"))
	safe, hold, missing = _classify()

	offset = cint(offset)
	limit_n = cint(limit) if limit not in (None, "") else 0
	batch = safe[offset:]
	if limit_n:
		batch = batch[:limit_n]

	deleted: list[str] = []
	errors: list[dict] = []
	for i, name in enumerate(batch):
		try:
			_cancel_and_delete_pmo(name)
			deleted.append(name)
			if (i + 1) % BATCH_SIZE == 0:
				frappe.db.commit()
		except Exception as e:
			frappe.db.rollback()
			errors.append({"name": name, "error": str(e)[:300]})
			frappe.log_error(title=f"Apr26 PMO cleanup failed: {name}")
	frappe.db.commit()

	return {
		"ok": True,
		"safe_total": len(safe),
		"processed": len(batch),
		"deleted": len(deleted),
		"deleted_names_sample": deleted[:30],
		"errors": errors[:50],
		"error_count": len(errors),
		"hold_back": len(hold),
		"already_gone": len(missing),
		"next_offset": offset + len(batch),
		"done": (offset + len(batch)) >= len(safe),
	}
