"""Create Clinical Notes (Doctor Progress Note) from Patient Visit.encounter_comment."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, get_datetime, getdate, now_datetime

from healthcare.api.clinical_note import _get_or_create_clinical_note_type
from healthcare.healthcare.doctype.clinical_note.clinical_note import assign_clinical_note_trans_no

DOCTOR_PROGRESS_NOTE_TYPE = "Doctor Progress Note"
BATCH_SIZE = 1000
# Commit after each create so UI Clinical Note / Patient Note saves are not blocked
# waiting on a long migration transaction (lock wait timeouts).
COMMIT_EVERY_CREATED = 1

_VISIT_USERNAME_FIELDS = ("username", "user_name", "create_user_id")


def _require_admin() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def _migration_enabled() -> bool:
	return bool(cint(frappe.db.get_single_value("Healthcare Settings", "active")))


# Keep old name for callers/tests
migration_enabled = _migration_enabled


def _encounter_comment_visits_sql_count() -> int:
	return int(
		frappe.db.sql(
			"""
			SELECT COUNT(*)
			FROM `tabPatient Visit`
			WHERE encounter_comment IS NOT NULL
			  AND TRIM(encounter_comment) != ''
			"""
		)[0][0]
		or 0
	)


def _visit_reference_clause(visit_placeholder: str = "%s") -> str:
	"""Match either legacy or current Patient Visit reference fields on Clinical Note."""
	return f"""(
		(reference_doc = 'Patient Visit' AND reference_name = {visit_placeholder})
		OR (reference_doctype = 'Patient Visit' AND reference_document = {visit_placeholder})
	)"""


def _existing_clinical_note_for_patient_visit(
	patient: str | None,
	visit_name: str | None,
	*,
	prefetched_keys: set[tuple[str, str]] | None = None,
) -> str | None:
	"""Return existing Clinical Note name (or 'exists') for this patient + visit.

	Duplicate key is patient + Patient Visit — not note text — so re-runs never recreate
	notes already made for the same visit (including prior Doctor Progress Notes).
	"""
	patient = (patient or "").strip()
	visit_name = (visit_name or "").strip()
	if not patient or not visit_name:
		return None

	if prefetched_keys is not None:
		return "exists" if (patient, visit_name) in prefetched_keys else None

	rows = frappe.db.sql(
		f"""
		SELECT name
		FROM `tabClinical Note`
		WHERE docstatus != 2
		  AND patient = %s
		  AND {_visit_reference_clause("%s")}
		LIMIT 1
		""",
		(patient, visit_name, visit_name),
	)
	return rows[0][0] if rows else None


def _prefetch_patient_visit_note_keys(visit_names: list[str]) -> set[tuple[str, str]]:
	"""Set of (patient, visit_name) that already have any Clinical Note linked to that visit."""
	if not visit_names:
		return set()

	placeholders = ", ".join(["%s"] * len(visit_names))
	rows = frappe.db.sql(
		f"""
		SELECT
			patient,
			COALESCE(NULLIF(reference_name, ''), reference_document) AS visit_name
		FROM `tabClinical Note`
		WHERE docstatus != 2
		  AND IFNULL(patient, '') != ''
		  AND (
			(reference_doc = 'Patient Visit' AND reference_name IN ({placeholders}))
			OR (reference_doctype = 'Patient Visit' AND reference_document IN ({placeholders}))
		  )
		""",
		(*visit_names, *visit_names),
		as_dict=True,
	)
	keys: set[tuple[str, str]] = set()
	for row in rows:
		patient = (row.get("patient") or "").strip()
		visit_name = (row.get("visit_name") or "").strip()
		if patient and visit_name:
			keys.add((patient, visit_name))
	return keys


def _count_visits_already_with_clinical_note() -> int:
	"""How many visits-with-comment already have a Clinical Note for that patient+visit."""
	return int(
		frappe.db.sql(
			"""
			SELECT COUNT(*)
			FROM `tabPatient Visit` pv
			WHERE pv.encounter_comment IS NOT NULL
			  AND TRIM(pv.encounter_comment) != ''
			  AND IFNULL(pv.patient, '') != ''
			  AND EXISTS (
				SELECT 1
				FROM `tabClinical Note` cn
				WHERE cn.docstatus != 2
				  AND cn.patient = pv.patient
				  AND (
					(cn.reference_doc = 'Patient Visit' AND cn.reference_name = pv.name)
					OR (cn.reference_doctype = 'Patient Visit' AND cn.reference_document = pv.name)
				  )
			  )
			"""
		)[0][0]
		or 0
	)


def _username_from_visit(visit: dict) -> str | None:
	meta = frappe.get_meta("Patient Visit")
	for fieldname in _VISIT_USERNAME_FIELDS:
		if meta.has_field(fieldname):
			value = (visit.get(fieldname) or "").strip()
			if value:
				return value
	return None


def _posting_datetime_from_visit(visit: dict) -> datetime:
	"""Posting date/time on Clinical Note = Patient Visit encounter date (+ time if present)."""
	enc_date = visit.get("encounter_date")
	if not enc_date:
		return now_datetime()
	enc_time = visit.get("encounter_time") or "00:00:00"
	try:
		return get_datetime(f"{getdate(enc_date)} {enc_time}")
	except Exception:
		try:
			return get_datetime(getdate(enc_date))
		except Exception:
			return now_datetime()


def _note_html(text: str | None) -> str:
	content = (text or "").strip()
	if not content:
		return ""
	if "<" in content and ">" in content:
		return content
	return f"<p>{frappe.utils.escape_html(content).replace(chr(10), '<br>')}</p>"


def _resolve_medical_role(practitioner: str | None) -> str:
	if practitioner:
		role = frappe.db.get_value("Healthcare Practitioner", practitioner, "medical_role")
		if role:
			return role
	if frappe.db.exists("Medical Role", "Doctor"):
		return "Doctor"
	return "Doctor"


def _build_clinical_note_doc(visit: dict) -> frappe.model.document.Document:
	_get_or_create_clinical_note_type(DOCTOR_PROGRESS_NOTE_TYPE)

	note_body = _note_html(visit.get("encounter_comment"))
	practitioner = (visit.get("practitioner") or "").strip() or None
	visit_name = visit["name"]
	posting_dt = _posting_datetime_from_visit(visit)

	fields: dict[str, Any] = {
		"doctype": "Clinical Note",
		"patient": visit.get("patient"),
		"patient_name": visit.get("patient_name"),
		"clinical_note_type": DOCTOR_PROGRESS_NOTE_TYPE,
		"medical_role": _resolve_medical_role(practitioner),
		"practitioner": practitioner,
		"posting_date": posting_dt,
		"note": note_body,
		"reference_doc": "Patient Visit",
		"reference_name": visit_name,
		"reference_doctype": "Patient Visit",
		"reference_document": visit_name,
		"cost_center": (visit.get("cost_center") or "").strip() or None,
	}

	username = _username_from_visit(visit)
	if username:
		fields["username"] = username

	inpatient = (visit.get("inpatient_record") or "").strip()
	if inpatient and frappe.db.exists("Inpatient Admission", inpatient):
		fields["inpatient_admission"] = inpatient

	doc = frappe.get_doc({k: v for k, v in fields.items() if v not in (None, "")})
	# Always keep posting_date even if somehow empty-string filtered (datetime never is)
	doc.posting_date = posting_dt
	assign_clinical_note_trans_no(doc)
	doc.flags.ignore_permissions = True
	doc.flags.ignore_mandatory = True
	return doc


def upsert_clinical_note_from_patient_visit(
	visit: dict,
	*,
	prefetched_keys: set[tuple[str, str]] | None = None,
	# Back-compat: older callers passed prefetched_notes (text map) — ignore content, still use visit keys if provided as set
	prefetched_notes: Any = None,
) -> str:
	if not migration_enabled():
		return "skip_disabled"

	visit_name = visit.get("name")
	if not visit_name:
		return "skip_no_name"

	if not (visit.get("encounter_comment") or "").strip():
		return "skip_no_comment"

	patient = (visit.get("patient") or "").strip()
	if not patient:
		return "skip_no_patient"

	# Prefer explicit prefetched_keys; if legacy prefetched_notes is a set of tuples, accept it
	keys = prefetched_keys
	if keys is None and isinstance(prefetched_notes, set):
		keys = prefetched_notes

	if _existing_clinical_note_for_patient_visit(
		patient,
		visit_name,
		prefetched_keys=keys,
	):
		return "skip_existing"

	posting_dt = _posting_datetime_from_visit(visit)
	doc = _build_clinical_note_doc(visit)
	doc.insert()

	# Force encounter-date posting even if Datetime default "now" raced on insert
	frappe.db.set_value(
		"Clinical Note",
		doc.name,
		"posting_date",
		posting_dt,
		update_modified=False,
	)

	if keys is not None:
		keys.add((patient, visit_name))

	return "created"


@frappe.whitelist()
def preview_patient_visit_encounter_comment_clinical_note() -> dict:
	_require_admin()
	is_active = migration_enabled()
	total = _encounter_comment_visits_sql_count()
	already_linked = _count_visits_already_with_clinical_note() if total else 0
	return {
		"migration_enabled": is_active,
		"total_with_comment": total,
		"already_linked": already_linked,
		"already_duplicate": already_linked,
		"to_create": max(total - already_linked, 0) if is_active else 0,
	}


def run_patient_visit_encounter_comment_clinical_note_batch(
	*,
	offset: int = 0,
	stop_check=None,
) -> dict:
	if not migration_enabled():
		return {
			"batch_size": 0,
			"created": 0,
			"skipped_existing": 0,
			"skipped_no_patient": 0,
			"skipped_no_comment": 0,
			"errors": 0,
			"next_offset": offset,
			"has_more": False,
			"skipped_disabled": True,
			"stopped": False,
		}

	visits = frappe.get_all(
		"Patient Visit",
		filters=[
			["encounter_comment", "is", "set"],
			["encounter_comment", "!=", ""],
		],
		fields=[
			"name",
			"patient",
			"patient_name",
			"encounter_date",
			"encounter_time",
			"encounter_comment",
			"practitioner",
			"cost_center",
			"inpatient_record",
			*[
				f
				for f in _VISIT_USERNAME_FIELDS
				if frappe.get_meta("Patient Visit").has_field(f)
			],
		],
		order_by="name asc",
		limit_start=offset,
		limit_page_length=BATCH_SIZE,
	)

	prefetched_keys = _prefetch_patient_visit_note_keys([v["name"] for v in visits])

	created = 0
	skipped_existing = 0
	skipped_no_patient = 0
	skipped_no_comment = 0
	errors = 0
	processed_in_batch = 0
	stopped = False
	created_since_commit = 0

	for visit in visits:
		if callable(stop_check) and stop_check():
			stopped = True
			break
		processed_in_batch += 1
		if not (visit.get("encounter_comment") or "").strip():
			skipped_no_comment += 1
			continue
		try:
			status = upsert_clinical_note_from_patient_visit(
				visit,
				prefetched_keys=prefetched_keys,
			)
			if status == "created":
				created += 1
				created_since_commit += 1
				# Release row / index locks so interactive UI saves can proceed
				if created_since_commit >= COMMIT_EVERY_CREATED:
					frappe.db.commit()
					created_since_commit = 0
			elif status == "skip_existing":
				skipped_existing += 1
			elif status == "skip_no_patient":
				skipped_no_patient += 1
			elif status == "skip_disabled":
				break
			else:
				skipped_no_comment += 1
		except Exception:
			frappe.db.rollback()
			created_since_commit = 0
			errors += 1
			frappe.log_error(
				title=f"Patient Visit encounter_comment → Clinical Note failed: {visit.get('name')}",
				message=frappe.get_traceback(),
			)

	frappe.db.commit()

	next_offset = offset + processed_in_batch
	return {
		"batch_size": len(visits),
		"created": created,
		"skipped_existing": skipped_existing,
		"skipped_no_patient": skipped_no_patient,
		"skipped_no_comment": skipped_no_comment,
		"errors": errors,
		"next_offset": next_offset,
		"has_more": (not stopped) and len(visits) >= BATCH_SIZE and migration_enabled(),
		"stopped": stopped,
	}


def migration_disabled_message() -> str:
	return _(
		"Enable Active in Healthcare Settings before creating Clinical Notes from visit encounter comments."
	)
