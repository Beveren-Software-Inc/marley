"""Patient History / Inpatient Admission data cleanup (orphans and duplicates)."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint

from healthcare.api.legacy_id_normalize import _delete_inpatient_admission

PATIENT_HISTORY_ORPHAN_CLEANUP_BATCH_SIZE = 100
DUPLICATE_ADMISSION_GROUP_BATCH_SIZE = 10


def _require_admin() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator"))


# ── Orphan Patient History (missing Inpatient Admission) ─────────────────────


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


# ── Duplicate Patient History (same admission) ───────────────────────────────


def count_duplicate_patient_history_extra() -> int:
	"""Patient History rows beyond the oldest record per inpatient_admission."""
	row = frappe.db.sql(
		"""
		SELECT COALESCE(SUM(cnt - 1), 0) AS extra
		FROM (
			SELECT COUNT(*) AS cnt
			FROM `tabPatient History`
			WHERE IFNULL(inpatient_admission, '') != ''
			GROUP BY inpatient_admission
			HAVING cnt > 1
		) d
		""",
		as_dict=True,
	)
	return cint((row[0] or {}).get("extra")) if row else 0


def list_duplicate_patient_history_names_to_delete(*, limit: int) -> list[str]:
	"""Oldest Patient History per admission is kept; newer duplicates are returned."""
	rows = frappe.db.sql(
		"""
		SELECT inpatient_admission
		FROM `tabPatient History`
		WHERE IFNULL(inpatient_admission, '') != ''
		GROUP BY inpatient_admission
		HAVING COUNT(*) > 1
		ORDER BY inpatient_admission
		LIMIT %s
		""",
		(limit,),
		as_dict=True,
	)

	to_delete: list[str] = []
	for row in rows:
		admission = row.inpatient_admission
		names = frappe.get_all(
			"Patient History",
			filters={"inpatient_admission": admission},
			pluck="name",
			order_by="creation asc, name asc",
		)
		if len(names) > 1:
			to_delete.extend(names[1:])
		if len(to_delete) >= limit:
			break
	return to_delete[:limit]


# ── Duplicate Inpatient Admission ──────────────────────────────────────────────


def count_duplicate_admission_groups() -> int:
	case_no_groups = cint(
		frappe.db.sql(
			"""
			SELECT COUNT(*) FROM (
				SELECT case_no
				FROM `tabInpatient Admission`
				WHERE IFNULL(case_no, '') != ''
				GROUP BY case_no
				HAVING COUNT(*) > 1
			) d
			"""
		)[0][0]
	)
	empty_case_groups = cint(
		frappe.db.sql(
			"""
			SELECT COUNT(*) FROM (
				SELECT patient, admission_date
				FROM `tabInpatient Admission`
				WHERE IFNULL(case_no, '') = ''
				  AND IFNULL(patient, '') != ''
				GROUP BY patient, admission_date
				HAVING COUNT(*) > 1
			) d
			"""
		)[0][0]
	)
	return case_no_groups + empty_case_groups


def count_duplicate_admissions_to_remove() -> int:
	case_no_extra = cint(
		frappe.db.sql(
			"""
			SELECT COALESCE(SUM(cnt - 1), 0)
			FROM (
				SELECT COUNT(*) AS cnt
				FROM `tabInpatient Admission`
				WHERE IFNULL(case_no, '') != ''
				GROUP BY case_no
				HAVING cnt > 1
			) d
			"""
		)[0][0]
	)
	empty_case_extra = cint(
		frappe.db.sql(
			"""
			SELECT COALESCE(SUM(cnt - 1), 0)
			FROM (
				SELECT COUNT(*) AS cnt
				FROM `tabInpatient Admission`
				WHERE IFNULL(case_no, '') = ''
				  AND IFNULL(patient, '') != ''
				GROUP BY patient, admission_date
				HAVING cnt > 1
			) d
			"""
		)[0][0]
	)
	return case_no_extra + empty_case_extra


def list_duplicate_admission_case_nos(*, limit: int) -> list[str]:
	rows = frappe.db.sql(
		"""
		SELECT case_no
		FROM `tabInpatient Admission`
		WHERE IFNULL(case_no, '') != ''
		GROUP BY case_no
		HAVING COUNT(*) > 1
		ORDER BY case_no
		LIMIT %s
		""",
		(limit,),
		as_dict=True,
	)
	return [row.case_no for row in rows]


def list_duplicate_admission_groups_without_case_no(*, limit: int) -> list[dict]:
	return frappe.db.sql(
		"""
		SELECT patient, admission_date
		FROM `tabInpatient Admission`
		WHERE IFNULL(case_no, '') = ''
		  AND IFNULL(patient, '') != ''
		GROUP BY patient, admission_date
		HAVING COUNT(*) > 1
		ORDER BY patient, admission_date
		LIMIT %s
		""",
		(limit,),
		as_dict=True,
	)


def _admission_keep_score(name: str) -> int:
	meta = frappe.db.get_value(
		"Inpatient Admission",
		name,
		["name", "case_no", "status", "docstatus"],
		as_dict=True,
	)
	if not meta:
		return -1

	score = 0
	case_no = (meta.case_no or "").strip()
	if case_no and meta.name == case_no:
		score += 100
	if (meta.status or "").strip() == "Admitted":
		score += 50
	elif (meta.status or "").strip() == "Discharged":
		score += 20
	if cint(meta.docstatus) == 1:
		score += 10

	score += cint(
		frappe.db.count("Patient History", {"inpatient_admission": name})
	) * 5
	score += cint(
		frappe.db.count("Discharge", {"admission": name})
	) * 3
	return score


def _pick_admission_to_keep(names: list[str]) -> str:
	best_name = names[0]
	best_score = _admission_keep_score(best_name)
	for name in names[1:]:
		score = _admission_keep_score(name)
		if score > best_score:
			best_score = score
			best_name = name
		elif score == best_score:
			# Tie-break: older record wins
			older = frappe.db.get_value("Inpatient Admission", name, "creation")
			best_creation = frappe.db.get_value("Inpatient Admission", best_name, "creation")
			if older and best_creation and older < best_creation:
				best_name = name
	return best_name


def _reassign_or_drop_patient_history_before_admission_delete(keeper: str, loser: str) -> None:
	keeper_has_ph = bool(
		frappe.db.exists("Patient History", {"inpatient_admission": keeper})
	)
	for ph_name in frappe.get_all(
		"Patient History",
		filters={"inpatient_admission": loser},
		pluck="name",
	):
		if not keeper_has_ph:
			frappe.db.set_value(
				"Patient History",
				ph_name,
				"inpatient_admission",
				keeper,
				update_modified=False,
			)
			keeper_has_ph = True
		else:
			frappe.delete_doc("Patient History", ph_name, force=True, ignore_permissions=True)


def dedupe_admissions_for_case_no(case_no: str) -> dict:
	names = frappe.get_all(
		"Inpatient Admission",
		filters={"case_no": case_no},
		pluck="name",
	)
	return _dedupe_admission_names(names, group_key=f"case_no:{case_no}")


def dedupe_admissions_without_case_no(patient: str, admission_date) -> dict:
	names = frappe.db.sql(
		"""
		SELECT name
		FROM `tabInpatient Admission`
		WHERE patient = %s
		  AND admission_date = %s
		  AND (case_no IS NULL OR case_no = '')
		ORDER BY creation asc, name asc
		""",
		(patient, admission_date),
		pluck=True,
	)
	return _dedupe_admission_names(
		names,
		group_key=f"patient:{patient}:{admission_date}",
	)


def _dedupe_admission_names(names: list[str], group_key: str) -> dict:
	if len(names) <= 1:
		return {"deleted": [], "kept": names[0] if names else None, "group": group_key}

	keep = _pick_admission_to_keep(names)
	deleted: list[str] = []
	for name in names:
		if name == keep:
			continue
		_reassign_or_drop_patient_history_before_admission_delete(keep, name)
		_delete_inpatient_admission(name)
		deleted.append(name)

	return {"deleted": deleted, "kept": keep, "group": group_key}


def _remaining_cleanup_counts() -> dict:
	return {
		"orphaned_patient_history": count_orphaned_patient_history(),
		"duplicate_patient_history": count_duplicate_patient_history_extra(),
		"duplicate_admission_groups": count_duplicate_admission_groups(),
		"duplicate_admissions_to_remove": count_duplicate_admissions_to_remove(),
	}


# ── Public API ───────────────────────────────────────────────────────────────


@frappe.whitelist()
def run_patient_history_orphan_cleanup_preview() -> dict:
	"""Preview Patient History orphans, duplicate histories, and duplicate admissions."""
	_require_admin()
	remaining = _remaining_cleanup_counts()
	sample_orphans = list_orphaned_patient_history_names(limit=5)
	sample_dup_ph = list_duplicate_patient_history_names_to_delete(limit=5)
	sample_dup_case_nos = list_duplicate_admission_case_nos(limit=5)
	return {
		"orphaned_count": remaining["orphaned_patient_history"],
		"duplicate_patient_history_count": remaining["duplicate_patient_history"],
		"duplicate_admission_groups": remaining["duplicate_admission_groups"],
		"duplicate_admissions_to_remove": remaining["duplicate_admissions_to_remove"],
		"sample": sample_orphans,
		"sample_duplicate_patient_history": sample_dup_ph,
		"sample_duplicate_admission_case_nos": sample_dup_case_nos,
		**remaining,
	}


def _delete_patient_history_names(names: list[str]) -> tuple[int, int, list[str]]:
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
			frappe.log_error(title=f"Patient History cleanup failed: {name}")
	return deleted, errors, error_names


def run_patient_history_orphan_cleanup_batch(*, offset: int = 0) -> dict:
	"""Delete one batch: orphan PH → duplicate PH → duplicate admissions."""
	phase = "done"
	batch_deleted = 0
	batch_errors = 0
	error_names: list[str] = []
	admission_dedupe_results: list[dict] = []

	orphan_names = list_orphaned_patient_history_names(
		limit=PATIENT_HISTORY_ORPHAN_CLEANUP_BATCH_SIZE,
		offset=0,
	)
	if orphan_names:
		phase = "orphan_patient_history"
		batch_deleted, batch_errors, error_names = _delete_patient_history_names(orphan_names)
	else:
		dup_ph_names = list_duplicate_patient_history_names_to_delete(
			limit=PATIENT_HISTORY_ORPHAN_CLEANUP_BATCH_SIZE,
		)
		if dup_ph_names:
			phase = "duplicate_patient_history"
			batch_deleted, batch_errors, error_names = _delete_patient_history_names(dup_ph_names)
		else:
			case_nos = list_duplicate_admission_case_nos(limit=DUPLICATE_ADMISSION_GROUP_BATCH_SIZE)
			groups = list_duplicate_admission_groups_without_case_no(
				limit=DUPLICATE_ADMISSION_GROUP_BATCH_SIZE,
			)
			if case_nos or groups:
				phase = "duplicate_admissions"
				for case_no in case_nos:
					try:
						result = dedupe_admissions_for_case_no(case_no)
						admission_dedupe_results.append(result)
						batch_deleted += len(result.get("deleted") or [])
					except Exception:
						batch_errors += 1
						error_names.append(f"case_no:{case_no}")
						frappe.log_error(
							title=f"Duplicate admission cleanup failed: case_no {case_no}",
							message=frappe.get_traceback(),
						)
				for group in groups:
					key = f"{group.patient}|{group.admission_date}"
					try:
						result = dedupe_admissions_without_case_no(
							group.patient,
							group.admission_date,
						)
						admission_dedupe_results.append(result)
						batch_deleted += len(result.get("deleted") or [])
					except Exception:
						batch_errors += 1
						error_names.append(f"patient_date:{key}")
						frappe.log_error(
							title=f"Duplicate admission cleanup failed: {key}",
							message=frappe.get_traceback(),
						)

	frappe.db.commit()

	remaining = _remaining_cleanup_counts()
	done = (
		phase == "done"
		or (
			remaining["orphaned_patient_history"] == 0
			and remaining["duplicate_patient_history"] == 0
			and remaining["duplicate_admission_groups"] == 0
		)
	)

	return {
		"processed": offset + batch_deleted,
		"deleted": batch_deleted,
		"errors": batch_errors,
		"error_names": error_names,
		"remaining": remaining,
		"phase": phase,
		"admission_dedupe_results": admission_dedupe_results,
		"done": done,
		"stats": {
			"deleted": offset + batch_deleted,
			"errors": batch_errors,
			"remaining": remaining,
			"phase": phase,
		},
	}
