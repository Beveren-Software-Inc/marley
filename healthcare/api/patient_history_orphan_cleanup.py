"""Delete Patient History rows whose Inpatient Admission no longer exists."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint

PATIENT_HISTORY_ORPHAN_CLEANUP_BATCH_SIZE = 100


def _require_admin() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def count_orphaned_patient_history() -> int:
	row = frappe.db.sql(
		"""
		SELECT COUNT(*) AS cnt
		FROM `tabPatient History` ph
		LEFT JOIN `tabInpatient Admission` ia
			ON ia.name = ph.inpatient_admission
		WHERE ph.inpatient_admission IS NOT NULL
		  AND ph.inpatient_admission != ''
		  AND ia.name IS NULL
		""",
		as_dict=True,
	)
	return cint((row[0] or {}).get("cnt")) if row else 0


def list_orphaned_patient_history_names(*, limit: int, offset: int = 0) -> list[str]:
	rows = frappe.db.sql(
		"""
		SELECT ph.name
		FROM `tabPatient History` ph
		LEFT JOIN `tabInpatient Admission` ia
			ON ia.name = ph.inpatient_admission
		WHERE ph.inpatient_admission IS NOT NULL
		  AND ph.inpatient_admission != ''
		  AND ia.name IS NULL
		ORDER BY ph.name
		LIMIT %s OFFSET %s
		""",
		(limit, offset),
		as_dict=True,
	)
	return [row.name for row in rows]


@frappe.whitelist()
def run_patient_history_orphan_cleanup_preview() -> dict:
	"""Preview orphaned Patient History rows (missing Inpatient Admission)."""
	_require_admin()
	count = count_orphaned_patient_history()
	sample = list_orphaned_patient_history_names(limit=10)
	return {
		"orphaned_count": count,
		"sample": sample,
	}


def run_patient_history_orphan_cleanup_batch(*, offset: int = 0) -> dict:
	"""Delete one batch of orphaned Patient History records."""
	names = list_orphaned_patient_history_names(
		limit=PATIENT_HISTORY_ORPHAN_CLEANUP_BATCH_SIZE,
		offset=0,
	)
	deleted = 0
	errors = 0
	error_names: list[str] = []

	for name in names:
		try:
			frappe.delete_doc("Patient History", name, force=True, ignore_permissions=True)
			deleted += 1
		except Exception:
			errors += 1
			error_names.append(name)
			frappe.log_error(title=f"Patient History orphan cleanup failed: {name}")

	frappe.db.commit()

	remaining = count_orphaned_patient_history()
	done = remaining == 0 or not names

	return {
		"processed": offset + deleted,
		"deleted": deleted,
		"errors": errors,
		"error_names": error_names,
		"remaining": remaining,
		"done": done,
		"stats": {
			"deleted": offset + deleted,
			"errors": errors,
			"remaining": remaining,
		},
	}
