# Copyright (c) 2026, Healthcare contributors
# See license.txt

"""Resolve and backfill Patient Visit cost center (branch).

Daily Auto Visits copy the branch of their ``Daily Patient Visit Setup`` when
they are created (see ``healthcare.api.daily_patient_visit``). Visits created
before the setup had a branch, or created for a setup that never had one, stay
blank. This module resolves the branch for such visits and runs the background
backfill that fills them. Legacy (Oracle) visits are never touched.
"""

from __future__ import annotations

import re

import frappe
from frappe.utils import cint, getdate

from healthcare.api.sales_order_cost_center import cost_center_from_visit_or_admission

PATIENT_VISIT_BRANCH_BACKFILL_BATCH_SIZE = 500
CACHE_NAMES = "healthcare:data_migration:patient_visit_branch_backfill:names"
CACHE_TTL = 7200

VISIT_FIELDS = [
	"name",
	"patient",
	"encounter_date",
	"cost_center",
	"inpatient_record",
	"visit_type",
	"docstatus",
	"old_trans_num",
	"inv_num",
	"year_month",
]

# Oracle imports keep the original TRANS_NUM / INV_NUM / YEAR_MONTH keys.
LEGACY_MARKER_FIELDS = ("old_trans_num", "inv_num", "year_month")


def _require_admin() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def _clean(value) -> str:
	if isinstance(value, str):
		return value.strip()
	return value or ""


def is_legacy_visit(row) -> bool:
	"""True for Oracle imported visits, which must keep their original data."""
	if any(_clean(row.get(field)) for field in LEGACY_MARKER_FIELDS):
		return True
	# Legacy service / prescription imports create submitted visits without a visit type.
	return cint(row.get("docstatus")) == 1 and not _clean(row.get("visit_type"))


def setup_covers_date(setup, encounter_date) -> bool:
	if not encounter_date:
		return False
	visit_date = getdate(encounter_date)
	start = setup.get("from_date")
	if start and getdate(start) > visit_date:
		return False
	end = setup.get("to_date")
	if end and getdate(end) < visit_date:
		return False
	return True


def branch_from_setups(setups, encounter_date=None) -> str | None:
	"""Branch of the setup covering the date, else the patient's only branch."""
	branches = {_clean(row.get("branch")) for row in setups}
	branches.discard("")
	if not branches:
		return None

	if encounter_date:
		covering = {
			_clean(row.get("branch"))
			for row in setups
			if setup_covers_date(row, encounter_date)
		}
		covering.discard("")
		if len(covering) == 1:
			return covering.pop()
		if covering:
			# More than one branch is valid on that date: do not guess.
			return None

	if len(branches) == 1:
		return branches.pop()
	return None


def branch_for_patient(patient, encounter_date=None) -> str | None:
	"""Branch from the patient's Daily Patient Visit Setups that have one."""
	if not patient:
		return None
	setups = frappe.get_all(
		"Daily Patient Visit Setup",
		filters={"patient": patient, "branch": ("!=", "")},
		fields=["branch", "from_date", "to_date"],
		order_by="is_active desc, from_date desc",
	)
	return branch_from_setups(setups, encounter_date)


def resolve_visit_branch(row) -> tuple[str | None, str]:
	"""Return ``(branch, source)``; source is ``setup``, ``admission`` or empty.

	The Daily Patient Visit Setup wins, matching how new visits are created.
	"""
	branch = branch_for_patient(row.get("patient"), row.get("encounter_date"))
	if branch:
		return branch, "setup"

	admission = _clean(row.get("inpatient_record"))
	if admission:
		cc = cost_center_from_visit_or_admission("Inpatient Admission", admission)
		if cc:
			return _clean(cc), "admission"
	return None, ""


def backfill_patient_visit_branch(name: str) -> dict:
	"""Fill a blank cost center on one Patient Visit. Legacy visits are skipped."""
	row = frappe.db.get_value("Patient Visit", name, VISIT_FIELDS, as_dict=True)
	if not row:
		return {"status": "missing", "name": name}
	if _clean(row.cost_center):
		return {"status": "skip_has_branch", "name": name}
	if is_legacy_visit(row):
		return {"status": "skip_legacy", "name": name}

	branch, source = resolve_visit_branch(row)
	if not branch:
		return {"status": "skip_no_source", "name": name}

	frappe.db.set_value(
		"Patient Visit",
		name,
		"cost_center",
		branch,
		update_modified=False,
	)
	return {
		"status": "ok",
		"name": name,
		"branch": branch,
		"source": source,
	}


def _candidate_where(patient=None, from_date=None, to_date=None) -> tuple[str, dict]:
	conditions = [
		"IFNULL(`cost_center`, '') = ''",
		"IFNULL(`old_trans_num`, '') = ''",
		"IFNULL(`inv_num`, '') = ''",
		"IFNULL(`year_month`, '') = ''",
		"NOT (`docstatus` = 1 AND IFNULL(`visit_type`, '') = '')",
		"""(
			IFNULL(`inpatient_record`, '') != ''
			OR EXISTS (
				SELECT 1 FROM `tabDaily Patient Visit Setup` s
				WHERE s.patient = `tabPatient Visit`.`patient`
				  AND IFNULL(s.branch, '') != ''
			)
		)""",
	]
	values: dict = {}
	if patient:
		conditions.append("`patient` = %(patient)s")
		values["patient"] = patient
	if from_date:
		conditions.append("`encounter_date` >= %(from_date)s")
		values["from_date"] = getdate(from_date)
	if to_date:
		conditions.append("`encounter_date` <= %(to_date)s")
		values["to_date"] = getdate(to_date)
	return " AND ".join(conditions), values


def _legacy_where(patient=None, from_date=None, to_date=None) -> tuple[str, dict]:
	conditions = [
		"IFNULL(`cost_center`, '') = ''",
		"""(
			IFNULL(`old_trans_num`, '') != ''
			OR IFNULL(`inv_num`, '') != ''
			OR IFNULL(`year_month`, '') != ''
			OR (`docstatus` = 1 AND IFNULL(`visit_type`, '') = '')
		)""",
	]
	values: dict = {}
	if patient:
		conditions.append("`patient` = %(patient)s")
		values["patient"] = patient
	if from_date:
		conditions.append("`encounter_date` >= %(from_date)s")
		values["from_date"] = getdate(from_date)
	if to_date:
		conditions.append("`encounter_date` <= %(to_date)s")
		values["to_date"] = getdate(to_date)
	return " AND ".join(conditions), values


def candidate_names(patient=None, from_date=None, to_date=None) -> list[str]:
	"""Patient Visits with a blank cost center that have a branch source."""
	where, values = _candidate_where(patient, from_date, to_date)
	rows = frappe.db.sql(
		f"""
		SELECT name
		FROM `tabPatient Visit`
		WHERE {where}
		ORDER BY name
		""",
		values,
		as_dict=True,
	)
	return [row.name for row in rows]


def legacy_candidate_count(patient=None, from_date=None, to_date=None) -> int:
	where, values = _legacy_where(patient, from_date, to_date)
	row = frappe.db.sql(
		f"SELECT COUNT(*) FROM `tabPatient Visit` WHERE {where}",
		values,
	)
	return cint(row[0][0]) if row else 0


@frappe.whitelist()
def preview_patient_visit_branch_backfill(patient=None, from_date=None, to_date=None) -> dict:
	"""Count what the backfill would change, without writing anything."""
	_require_admin()
	names = candidate_names(patient, from_date, to_date)

	resolvable = unresolved = 0
	sample: list[dict] = []
	for name in names[:200]:
		row = frappe.db.get_value("Patient Visit", name, VISIT_FIELDS, as_dict=True)
		if not row:
			continue
		branch, source = resolve_visit_branch(row)
		if not branch:
			unresolved += 1
			if len(sample) < 8:
				sample.append(
					{
						"name": name,
						"patient": row.patient,
						"encounter_date": str(row.encounter_date or ""),
						"issue": "no_branch_source",
					}
				)
			continue
		resolvable += 1
		if len(sample) < 8:
			sample.append(
				{
					"name": name,
					"patient": row.patient,
					"encounter_date": str(row.encounter_date or ""),
					"resolved_branch": branch,
					"source": source,
				}
			)

	return {
		"candidates": len(names),
		"sampled": min(len(names), 200),
		"resolvable_sampled": resolvable,
		"unresolved_sampled": unresolved,
		"legacy_skipped": legacy_candidate_count(patient, from_date, to_date),
		"sample": sample,
	}


def run_patient_visit_branch_backfill_batch(names: list[str]) -> dict:
	ok = skip = errors = 0
	skip_has_branch = skip_legacy = skip_no_source = 0
	error_samples: list[str] = []

	for name in names:
		savepoint = re.sub(r"[^0-9A-Za-z_]", "_", f"pv_branch_{name}")[:60]
		try:
			frappe.db.savepoint(savepoint)
			result = backfill_patient_visit_branch(name)
			status = result.get("status")
			if status == "ok":
				ok += 1
			elif status == "skip_has_branch":
				skip += 1
				skip_has_branch += 1
			elif status == "skip_legacy":
				skip += 1
				skip_legacy += 1
			elif status == "skip_no_source":
				skip += 1
				skip_no_source += 1
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
		"skip_has_branch": skip_has_branch,
		"skip_legacy": skip_legacy,
		"skip_no_source": skip_no_source,
		"errors": errors,
		"error_samples": error_samples[:5],
	}


def cache_patient_visit_branch_backfill_names(patient=None, from_date=None, to_date=None) -> int:
	names = candidate_names(patient, from_date, to_date)
	frappe.cache().set_value(CACHE_NAMES, names, expires_in_sec=CACHE_TTL)
	return len(names)


def load_cached_patient_visit_branch_backfill_names() -> list[str]:
	raw = frappe.cache().get_value(CACHE_NAMES)
	return list(raw) if raw else []
