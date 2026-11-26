"""Sync Visit Diagnosis staging rows into Patient Visit / Inpatient Admission child tables."""

from __future__ import annotations

from typing import Any

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


def _norm_visit_key(value: Any) -> str:
	"""Same numeric-key cleanup used for Oracle visit / type codes."""
	if value is None:
		return ""
	text = str(value).strip()
	if not text:
		return ""
	try:
		number = float(text)
		if number.is_integer():
			return str(int(number))
	except (TypeError, ValueError):
		pass
	return text


def _date_key(value: Any) -> str:
	if value is None or value == "":
		return ""
	try:
		return str(getdate(value))
	except Exception:
		text = str(value).strip()
		return text[:10] if text else ""


def _resolve_patient_visit_by_identity(
	patient: str | None,
	encounter_date: Any = None,
	visit_type_code: Any = None,
) -> str | None:
	"""Find the ERPNext visit that OP import treated as the same Oracle visit.

	When a desk/ERPNext visit already exists for the same patient + date + type,
	Oracle → ERPNext skips importing that Oracle ``VISIT_NUM`` (duplicate by
	identity). Clinical notes / history must still attach to that matched visit.
	"""
	patient_key = _strip(patient)
	date_key = _date_key(encounter_date)
	type_key = _norm_visit_key(visit_type_code)
	if not patient_key or not date_key or not type_key:
		return None
	if not frappe.db.exists("Patient", patient_key):
		return None

	has_old_type = frappe.get_meta("Patient Visit").has_field("old_visit_type_")
	has_visit_type = frappe.get_meta("Patient Visit").has_field("visit_type")
	has_legacy = frappe.db.exists("DocType", "Patient Visit Type") and frappe.get_meta(
		"Patient Visit Type"
	).has_field("legacy_code")

	# Prefer imported rows that already carry the Oracle type code.
	if has_old_type:
		name = frappe.db.get_value(
			"Patient Visit",
			{
				"patient": patient_key,
				"encounter_date": date_key,
				"old_visit_type_": type_key,
				"docstatus": ["<", 2],
			},
			"name",
			order_by="creation asc",
		)
		if name:
			return name

	# Desk-created visits store the Patient Visit Type link; match via legacy_code.
	if has_visit_type and has_legacy:
		rows = frappe.db.sql(
			"""
			select pv.name
			from `tabPatient Visit` pv
			inner join `tabPatient Visit Type` pvt on pvt.name = pv.visit_type
			where pv.patient = %s
				and pv.encounter_date = %s
				and pv.docstatus < 2
				and ifnull(pvt.legacy_code, '') = %s
			order by pv.creation asc
			limit 1
			""",
			(patient_key, date_key, type_key),
		)
		if rows:
			return rows[0][0]

	return None


def _remember_oracle_visit_number(visit_name: str | None, oracle_visit_num: str | None) -> None:
	"""Persist Oracle VISIT_NUM on the matched duplicate so later exact lookups work."""
	visit_name = _strip(visit_name)
	oracle_visit_num = _norm_visit_key(oracle_visit_num)
	if not visit_name or not oracle_visit_num:
		return
	if not frappe.get_meta("Patient Visit").has_field("old_trans_num"):
		return
	current = (frappe.db.get_value("Patient Visit", visit_name, "old_trans_num") or "").strip()
	if current:
		return
	# Do not overwrite if another visit already claims this Oracle number.
	taken = frappe.db.get_value("Patient Visit", {"old_trans_num": oracle_visit_num}, "name")
	if taken and taken != visit_name:
		return
	frappe.db.set_value(
		"Patient Visit",
		visit_name,
		"old_trans_num",
		oracle_visit_num,
		update_modified=False,
	)


def _resolve_patient_visit(
	visit_num: str,
	patient: str | None = None,
	*,
	encounter_date: Any = None,
	visit_type_code: Any = None,
	oracle_row: dict | None = None,
	link_duplicate: bool = True,
) -> str | None:
	"""Resolve import visit number to Patient Visit name (case_no / old_trans_num).

	When the Oracle visit was skipped as a duplicate of an ERPNext visit (same
	patient + date + visit type, different case number), fall back to that
	identity match and optionally store ``old_trans_num`` = Oracle VISIT_NUM.
	"""
	key = _strip(visit_num)
	if not key and oracle_row:
		key = _norm_visit_key(oracle_row.get("VISIT_NUM"))
	if not key:
		return None
	if frappe.db.exists("Patient Visit", key):
		return key

	for field in ("case_no", "name", "old_trans_num"):
		if not frappe.get_meta("Patient Visit").has_field(field):
			continue
		name = frappe.db.get_value("Patient Visit", {field: key}, "name")
		if name:
			return name

	plain = normalize_legacy_id(key)
	if plain:
		if frappe.db.exists("Patient Visit", plain):
			return plain
		for field in ("case_no", "old_trans_num"):
			if not frappe.get_meta("Patient Visit").has_field(field):
				continue
			name = frappe.db.get_value("Patient Visit", {field: plain}, "name")
			if name:
				return name

	if patient and frappe.db.exists("Patient", patient):
		for field in ("case_no", "name", "old_trans_num"):
			if not frappe.get_meta("Patient Visit").has_field(field):
				continue
			name = frappe.db.get_value(
				"Patient Visit", {"patient": patient, field: key}, "name"
			)
			if name:
				return name
		if plain:
			for field in ("case_no", "old_trans_num"):
				if not frappe.get_meta("Patient Visit").has_field(field):
					continue
				name = frappe.db.get_value(
					"Patient Visit", {"patient": patient, field: plain}, "name"
				)
				if name:
					return name

	# Identity fallback: the visit OP sync already treated as present/duplicate.
	row = oracle_row or {}
	date_value = encounter_date if encounter_date is not None else (
		row.get("VISIT_DATE") or row.get("VISIT_DAY")
	)
	type_value = visit_type_code if visit_type_code is not None else row.get("VISIT_TYPE_NUM")
	matched = _resolve_patient_visit_by_identity(patient, date_value, type_value)
	if matched and link_duplicate:
		_remember_oracle_visit_number(matched, key)
	return matched


def patient_visit_lookup_keys(visit_name: str | None) -> list[str]:
	"""ERP visit name plus any Oracle/legacy ids stored on it (old_trans_num, case_no)."""
	visit_name = _strip(visit_name)
	if not visit_name:
		return []
	keys = [visit_name]
	meta = frappe.get_meta("Patient Visit")
	if frappe.db.exists("Patient Visit", visit_name):
		fields = [f for f in ("case_no", "old_trans_num") if meta.has_field(f)]
		if fields:
			row = frappe.db.get_value("Patient Visit", visit_name, fields, as_dict=True) or {}
			for field in fields:
				val = _strip(row.get(field))
				if val and val not in keys:
					keys.append(val)
	return keys


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
