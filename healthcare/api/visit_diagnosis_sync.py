"""Sync Visit Diagnosis staging rows into Patient Visit / Inpatient Admission child tables."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint, getdate

from healthcare.api.legacy_id_normalize import normalize_legacy_id

VISIT_DIAGNOSIS_SYNC_BATCH_SIZE = 100
CACHE_NAMES = "healthcare:visit_diagnosis_sync:names"
CACHE_TTL = 7200


def _require_admin() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def _strip(value) -> str:
	return (value or "").strip()


def _resolve_patient_visit(visit_num: str, patient: str | None = None) -> str | None:
	"""Resolve import visit number to Patient Visit name (case_no)."""
	key = _strip(visit_num)
	if not key:
		return None
	if frappe.db.exists("Patient Visit", key):
		return key

	for field in ("case_no", "name"):
		name = frappe.db.get_value("Patient Visit", {field: key}, "name")
		if name:
			return name

	plain = normalize_legacy_id(key)
	if plain:
		if frappe.db.exists("Patient Visit", plain):
			return plain
		name = frappe.db.get_value("Patient Visit", {"case_no": plain}, "name")
		if name:
			return name

	if patient and frappe.db.exists("Patient", patient):
		for field in ("case_no", "name"):
			name = frappe.db.get_value(
				"Patient Visit", {"patient": patient, field: key}, "name"
			)
			if name:
				return name
		if plain:
			name = frappe.db.get_value(
				"Patient Visit", {"patient": patient, "case_no": plain}, "name"
			)
			if name:
				return name

	return None


def _resolve_inpatient_admission(admission_num: str, patient: str | None = None) -> str | None:
	"""Resolve import admission number to Inpatient Admission name (case_no)."""
	key = _strip(admission_num)
	if not key:
		return None
	if frappe.db.exists("Inpatient Admission", key):
		return key

	for field in ("case_no", "admission_no_old", "name"):
		name = frappe.db.get_value("Inpatient Admission", {field: key}, "name")
		if name:
			return name

	plain = normalize_legacy_id(key)
	if plain:
		if frappe.db.exists("Inpatient Admission", plain):
			return plain
		name = frappe.db.get_value("Inpatient Admission", {"case_no": plain}, "name")
		if name:
			return name

	if patient and frappe.db.exists("Patient", patient):
		for field in ("case_no", "admission_no_old"):
			name = frappe.db.get_value(
				"Inpatient Admission", {"patient": patient, field: key}, "name"
			)
			if name:
				return name
		if plain:
			name = frappe.db.get_value(
				"Inpatient Admission", {"patient": patient, "case_no": plain}, "name"
			)
			if name:
				return name

	return None


def _visit_diagnosis_names() -> list[str]:
	return frappe.db.sql(
		"""
		SELECT name
		FROM `tabVisit Diagnosis`
		WHERE IFNULL(diagnosis, '') != ''
		  AND (
		      IFNULL(visit_num, '') != ''
		      OR IFNULL(inpatient_admission, '') != ''
		  )
		ORDER BY name
		""",
		pluck=True,
	)


def _child_has_diagnosis(doc, diagnosis_code: str) -> bool:
	code = _strip(diagnosis_code)
	if not code:
		return False
	for row in doc.get("patient_diagnosis") or []:
		if _strip(row.diagnosis) == code:
			return True
	return False


def _map_to_child_row(vd, *, patient_visit: str | None = None, admission: str | None = None) -> dict:
	row = {
		"diagnosis": vd.diagnosis,
		"diagnosis_name": vd.diagnosis_name,
		"details": vd.details or "",
		"diagnoses_flag": cint(vd.diagnoses_flag),
		"posting_date": vd.posting_date,
		"trans_num": vd.trans_num,
		"diagnoses_time": vd.diagnoses_time,
		"written_diagnosis_time": vd.writing_diagnosis_time,
		"practitioner": vd.practitioner,
		"practitioner_name": vd.practitioner_name,
		"cost_center": vd.cost_center,
		"cr_id": vd.cr_id,
		"cr_date": vd.cd_date,
		"up_id": vd.up_id,
		"up_date": vd.up_date,
	}
	if vd.posting_date:
		row["diagnosis_date"] = getdate(vd.posting_date)
	if patient_visit:
		row["patient_visit"] = patient_visit
	if admission:
		row["admission"] = admission
	return row


def _append_to_parent(
	parent_doctype: str,
	parent_name: str,
	vd,
	*,
	context_visit: str | None = None,
	context_admission: str | None = None,
) -> str:
	"""Append one Patient Diagnosis child row; return status token."""
	doc = frappe.get_doc(parent_doctype, parent_name)
	if _child_has_diagnosis(doc, vd.diagnosis):
		return "duplicate"

	child_row = _map_to_child_row(
		vd,
		patient_visit=context_visit if parent_doctype == "Patient Visit" else None,
		admission=context_admission if parent_doctype == "Inpatient Admission" else None,
	)
	doc.append("patient_diagnosis", child_row)
	doc.flags.ignore_validate = True
	doc.save(ignore_permissions=True)
	return "appended"


def sync_one_visit_diagnosis(visit_diagnosis_name: str) -> dict:
	vd = frappe.get_doc("Visit Diagnosis", visit_diagnosis_name)
	if not vd.diagnosis:
		return {"status": "skip_no_diagnosis", "name": visit_diagnosis_name}

	result = {
		"status": "ok",
		"name": visit_diagnosis_name,
		"visit": None,
		"admission": None,
	}

	visit_parent = None
	admission_parent = None

	if _strip(vd.visit_num):
		visit_parent = _resolve_patient_visit(vd.visit_num, vd.patient)
		if not visit_parent:
			result["visit"] = "unresolved"
		else:
			try:
				result["visit"] = _append_to_parent(
					"Patient Visit",
					visit_parent,
					vd,
					context_visit=_strip(vd.visit_num) or visit_parent,
				)
			except Exception:
				frappe.log_error(
					title=f"Visit Diagnosis sync failed (visit): {visit_diagnosis_name}",
					message=frappe.get_traceback(),
				)
				result["visit"] = "error"

	if _strip(vd.inpatient_admission):
		admission_parent = _resolve_inpatient_admission(vd.inpatient_admission, vd.patient)
		if not admission_parent:
			result["admission"] = "unresolved"
		else:
			try:
				result["admission"] = _append_to_parent(
					"Inpatient Admission",
					admission_parent,
					vd,
					context_admission=_strip(vd.inpatient_admission) or admission_parent,
				)
			except Exception:
				frappe.log_error(
					title=f"Visit Diagnosis sync failed (admission): {visit_diagnosis_name}",
					message=frappe.get_traceback(),
				)
				result["admission"] = "error"

	if not _strip(vd.visit_num) and not _strip(vd.inpatient_admission):
		return {"status": "skip_no_context", "name": visit_diagnosis_name}

	visit_r = result.get("visit")
	admission_r = result.get("admission")
	if visit_r == "error" or admission_r == "error":
		result["status"] = "error"
	elif visit_r == "unresolved" and admission_r == "unresolved":
		result["status"] = "skip_no_parent"
	elif visit_r in (None, "unresolved") and admission_r in (None, "unresolved"):
		result["status"] = "skip_no_parent"
	elif visit_r == "duplicate" and admission_r in (None, "duplicate", "unresolved"):
		if admission_r in (None, "duplicate"):
			result["status"] = "duplicate"
	elif admission_r == "duplicate" and visit_r in (None, "duplicate", "unresolved"):
		if visit_r in (None, "duplicate"):
			result["status"] = "duplicate"

	return result


def run_visit_diagnosis_sync_batch(names: list[str], offset: int = 0) -> dict:
	batch = names[offset : offset + VISIT_DIAGNOSIS_SYNC_BATCH_SIZE]
	if not batch:
		return {
			"done": True,
			"batch_count": 0,
			"remaining": 0,
			"appended_visit": 0,
			"appended_admission": 0,
			"duplicate": 0,
			"skip": 0,
			"errors": 0,
		}

	appended_visit = appended_admission = duplicate = skip = errors = 0
	for name in batch:
		try:
			outcome = sync_one_visit_diagnosis(name)
			status = outcome.get("status")
			if status == "error":
				errors += 1
				continue
			if status in ("skip_no_diagnosis", "skip_no_context", "skip_no_parent"):
				skip += 1
				continue
			if status == "duplicate":
				duplicate += 1
				continue

			visit_r = outcome.get("visit")
			admission_r = outcome.get("admission")
			if visit_r == "appended":
				appended_visit += 1
			elif visit_r == "duplicate":
				duplicate += 1
			elif visit_r == "unresolved":
				skip += 1

			if admission_r == "appended":
				appended_admission += 1
			elif admission_r == "duplicate":
				duplicate += 1
			elif admission_r == "unresolved":
				skip += 1
		except Exception:
			errors += 1
			frappe.log_error(
				title=f"Visit Diagnosis sync failed: {name}",
				message=frappe.get_traceback(),
			)

	frappe.db.commit()
	remaining = max(0, len(names) - offset - len(batch))
	return {
		"done": remaining == 0,
		"batch_count": len(batch),
		"remaining": remaining,
		"appended_visit": appended_visit,
		"appended_admission": appended_admission,
		"duplicate": duplicate,
		"skip": skip,
		"errors": errors,
	}


@frappe.whitelist()
def preview_visit_diagnosis_sync() -> dict:
	_require_admin()
	names = _visit_diagnosis_names()
	with_visit = frappe.db.count(
		"Visit Diagnosis",
		{"diagnosis": ["!=", ""], "visit_num": ["!=", ""]},
	)
	with_admission = frappe.db.count(
		"Visit Diagnosis",
		{"diagnosis": ["!=", ""], "inpatient_admission": ["!=", ""]},
	)
	sample = []
	for name in names[:8]:
		vd = frappe.db.get_value(
			"Visit Diagnosis",
			name,
			["visit_num", "inpatient_admission", "diagnosis", "patient"],
			as_dict=True,
		)
		if not vd:
			continue
		sample.append(
			{
				"name": name,
				"visit_num": vd.visit_num,
				"inpatient_admission": vd.inpatient_admission,
				"diagnosis": vd.diagnosis,
				"resolved_visit": _resolve_patient_visit(vd.visit_num, vd.patient),
				"resolved_admission": _resolve_inpatient_admission(
					vd.inpatient_admission, vd.patient
				),
			}
		)
	return {
		"count": len(names),
		"with_visit_num": with_visit,
		"with_inpatient_admission": with_admission,
		"sample": sample,
	}
