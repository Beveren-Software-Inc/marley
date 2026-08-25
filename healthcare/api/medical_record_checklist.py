# Copyright (c) 2026, healthcare contributors
"""Nursing Medical Record checklist — auto-tick documents for active inpatients."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import get_fullname, getdate, today

from healthcare.api.common import resolve_cost_center_filter
from healthcare.healthcare.doctype.inpatient_admission.inpatient_admission import (
	resolve_admission_datetime,
)

ACTIVE_STATUSES = ("Admitted", "Discharge Scheduled")

CHECK_COLUMNS = [
	("admission_signed", "Admission Signed"),
	("consent", "Consent"),
	("history", "History"),
	("physical_exam", "P.E"),
	("allergies", "Allergies"),
	("dr_risk_assessment", "Dr Risk Assessment"),
	("medication_sheet", "Medication Sheet"),
	("dr_notes", "Dr Notes"),
	("psy_notes", "Psy Notes"),
	("nutritional_notes", "Nutritional Notes"),
	("occupational_notes", "Occupational Notes"),
	("nursing_assessment", "N.A"),
	("suicidal_ra", "Suicidal RA"),
	("sleeping", "Sleeping"),
	("grooming", "Grooming"),
	("mental_state", "Mental State"),
	("vital_signs", "Vital Signs"),
	("weight", "Weight"),
	("height", "Height"),
	("nursing_notes", "Nursing Notes"),
]

NOTE_TYPE_ALIASES = {
	"dr_notes": ("Doctors Note", "Doctor Progress Note", "Doctor Note", "Doctor Notes"),
	"psy_notes": ("Psychologist Note", "Psychology Note", "Psychology Notes", "Psychologist Notes"),
	"nutritional_notes": ("Nutritionist Note", "Nutrition Note", "Nutritionist Notes", "Nutrition Notes"),
	"occupational_notes": (
		"Therapist Note",
		"Occupational Therapy Note",
		"OT Note",
		"Therapy Note",
		"Therapist Notes",
		"Occupational Therapy Notes",
		"OT Notes",
		"Therapy Notes",
		"Occupational",
	),
}


def _doctype_exists(name: str) -> bool:
	return bool(frappe.db.exists("DocType", name))


def _not_cancelled_sql(doctype: str) -> str:
	if frappe.db.has_column(doctype, "docstatus"):
		return " AND IFNULL(docstatus, 0) < 2"
	return ""


def _admission_hits(doctype: str, field: str, admissions: list[str], extra: str = "") -> set[str]:
	if not admissions or not _doctype_exists(doctype) or not frappe.db.has_column(doctype, field):
		return set()
	placeholders = ", ".join(["%s"] * len(admissions))
	sql = f"""
		SELECT DISTINCT `{field}`
		FROM `tab{doctype}`
		WHERE `{field}` IN ({placeholders})
		{_not_cancelled_sql(doctype)}
		{extra}
	"""
	rows = frappe.db.sql(sql, tuple(admissions), as_list=True)
	return {r[0] for r in rows if r and r[0]}


def _numeric_hits(doctype: str, field: str, admissions: list[str], value_field: str) -> set[str]:
	if not admissions or not _doctype_exists(doctype):
		return set()
	if not frappe.db.has_column(doctype, field) or not frappe.db.has_column(doctype, value_field):
		return set()
	placeholders = ", ".join(["%s"] * len(admissions))
	sql = f"""
		SELECT DISTINCT `{field}`
		FROM `tab{doctype}`
		WHERE `{field}` IN ({placeholders})
		{_not_cancelled_sql(doctype)}
		AND IFNULL(NULLIF(TRIM(CAST(`{value_field}` AS CHAR)), ''), '0') NOT IN ('0', '0.0', '0.00')
	"""
	rows = frappe.db.sql(sql, tuple(admissions), as_list=True)
	return {r[0] for r in rows if r and r[0]}


def _clinical_note_type_names(aliases: tuple[str, ...]) -> list[str]:
	if not _doctype_exists("Clinical Note Type"):
		return list(aliases)
	wanted = {a.strip().lower() for a in aliases}
	names = []
	for row in frappe.get_all("Clinical Note Type", fields=["name", "clinical_note_type"]):
		label = (row.clinical_note_type or row.name or "").strip().lower()
		key = (row.name or "").strip().lower()
		if label in wanted or key in wanted:
			names.append(row.name)
	return names or list(aliases)


def _clinical_note_hits(admissions: list[str], aliases: tuple[str, ...]) -> set[str]:
	if not admissions or not _doctype_exists("Clinical Note"):
		return set()
	types = _clinical_note_type_names(aliases)
	if not types:
		return set()
	hits: set[str] = set()
	adm_ph = ", ".join(["%s"] * len(admissions))
	type_ph = ", ".join(["%s"] * len(types))

	# Exact Clinical Note Type docname matches (resolved via Clinical Note Type master).
	sql = f"""
		SELECT DISTINCT inpatient_admission
		FROM `tabClinical Note`
		WHERE inpatient_admission IN ({adm_ph})
		AND clinical_note_type IN ({type_ph})
		{_not_cancelled_sql("Clinical Note")}
	"""
	rows = frappe.db.sql(sql, tuple(admissions) + tuple(types), as_list=True)
	hits.update(r[0] for r in rows if r and r[0])

	# Fallback: match raw clinical_note_type string values directly — records may
	# store a link docname that does not exist on this site (OT/Therapist note types
	# created by the therapy flow may not be seeded in the Clinical Note Type master).
	if not hits:
		alias_ph = ", ".join(["%s"] * len(aliases))
		sql2 = f"""
			SELECT DISTINCT inpatient_admission
			FROM `tabClinical Note`
			WHERE inpatient_admission IN ({adm_ph})
			AND clinical_note_type IN ({alias_ph})
			{_not_cancelled_sql("Clinical Note")}
		"""
		rows2 = frappe.db.sql(sql2, tuple(admissions) + tuple(aliases), as_list=True)
		hits.update(r[0] for r in rows2 if r and r[0])

	return hits


def _signed_admissions(admissions: list[str]) -> set[str]:
	if not admissions:
		return set()
	placeholders = ", ".join(["%s"] * len(admissions))
	signed = set()
	rows = frappe.db.sql(
		f"""
		SELECT name
		FROM `tabInpatient Admission`
		WHERE name IN ({placeholders})
		AND IFNULL(signature, '') != ''
		""",
		tuple(admissions),
		as_list=True,
	)
	signed.update(r[0] for r in rows if r and r[0])

	if _doctype_exists("Patient Upload Document"):
		rows = frappe.db.sql(
			f"""
			SELECT DISTINCT parent
			FROM `tabPatient Upload Document`
			WHERE parenttype = 'Inpatient Admission'
			AND parent IN ({placeholders})
			AND (
				IFNULL(document, '') != ''
				OR IFNULL(file_name, '') != ''
				OR IFNULL(document_type, '') != ''
			)
			""",
			tuple(admissions),
			as_list=True,
		)
		signed.update(r[0] for r in rows if r and r[0])
	return signed


def _consent_hits(admissions: list[str]) -> set[str]:
	hits = set()
	if _doctype_exists("Patient Medical Consent"):
		placeholders = ", ".join(["%s"] * len(admissions))
		status_clause = ""
		if frappe.db.has_column("Patient Medical Consent", "status"):
			status_clause = " AND IFNULL(status, '') NOT IN ('Cancelled', 'Declined')"
		rows = frappe.db.sql(
			f"""
			SELECT DISTINCT inpatient_admission
			FROM `tabPatient Medical Consent`
			WHERE inpatient_admission IN ({placeholders})
			{_not_cancelled_sql("Patient Medical Consent")}
			{status_clause}
			""",
			tuple(admissions),
			as_list=True,
		)
		hits.update(r[0] for r in rows if r and r[0])
	if _doctype_exists("Informed Financial Consent"):
		hits |= _admission_hits("Informed Financial Consent", "inpatient_admission", admissions)
	return hits


def _allergy_patients(patients: list[str], admission_by_patient: dict[str, str]) -> set[str]:
	"""Return admission names whose patient has allergy documentation (including NKDA)."""
	if not patients:
		return set()
	checked_patients: set[str] = set()
	placeholders = ", ".join(["%s"] * len(patients))

	if frappe.db.has_column("Patient", "allergies"):
		rows = frappe.db.sql(
			f"""
			SELECT name FROM `tabPatient`
			WHERE name IN ({placeholders})
			AND IFNULL(TRIM(allergies), '') != ''
			""",
			tuple(patients),
			as_list=True,
		)
		checked_patients.update(r[0] for r in rows if r and r[0])

	if _doctype_exists("Patient Allergy"):
		rows = frappe.db.sql(
			f"""
			SELECT DISTINCT parent FROM `tabPatient Allergy`
			WHERE parenttype = 'Patient' AND parent IN ({placeholders})
			""",
			tuple(patients),
			as_list=True,
		)
		checked_patients.update(r[0] for r in rows if r and r[0])

	if _doctype_exists("Patient Medical History"):
		conditions = []
		if frappe.db.has_column("Patient Medical History", "allergies"):
			conditions.append("IFNULL(TRIM(allergies), '') != ''")
		if frappe.db.has_column("Patient Medical History", "no_known_allergies"):
			conditions.append("IFNULL(no_known_allergies, 0) = 1")
		if conditions:
			rows = frappe.db.sql(
				f"""
				SELECT DISTINCT patient FROM `tabPatient Medical History`
				WHERE patient IN ({placeholders})
				AND ({" OR ".join(conditions)})
				""",
				tuple(patients),
				as_list=True,
			)
			checked_patients.update(r[0] for r in rows if r and r[0])

	if _doctype_exists("Warning Message") and frappe.db.has_column("Warning Message", "is_allergy"):
		allergy_conds = ["IFNULL(is_allergy, 0) = 1"]
		if frappe.db.has_column("Warning Message", "no_allergy"):
			allergy_conds.append("IFNULL(no_allergy, 0) = 1")
		rows = frappe.db.sql(
			f"""
			SELECT DISTINCT patient FROM `tabWarning Message`
			WHERE patient IN ({placeholders}) AND ({" OR ".join(allergy_conds)})
			""",
			tuple(patients),
			as_list=True,
		)
		checked_patients.update(r[0] for r in rows if r and r[0])
	elif _doctype_exists("Warning Message") and frappe.db.has_column("Warning Message", "no_allergy"):
		rows = frappe.db.sql(
			f"""
			SELECT DISTINCT patient FROM `tabWarning Message`
			WHERE patient IN ({placeholders}) AND IFNULL(no_allergy, 0) = 1
			""",
			tuple(patients),
			as_list=True,
		)
		checked_patients.update(r[0] for r in rows if r and r[0])

	admission_names = list(admission_by_patient.values())
	hits: set[str] = set()
	if admission_names:
		adm_ph = ", ".join(["%s"] * len(admission_names))
		rows = frappe.db.sql(
			f"""
			SELECT name FROM `tabInpatient Admission`
			WHERE name IN ({adm_ph})
			AND IFNULL(TRIM(allergies), '') != ''
			""",
			tuple(admission_names),
			as_list=True,
		)
		hits = {r[0] for r in rows if r and r[0]}
	for patient, admission in admission_by_patient.items():
		if patient in checked_patients:
			hits.add(admission)
	return hits


def _remarks_for(checks: dict[str, bool]) -> str:
	missing = [label for key, label in CHECK_COLUMNS if not checks.get(key)]
	if not missing:
		return "Completed"
	if len(missing) == 1:
		return f"No {missing[0].lower()}"
	if len(missing) == 2:
		return f"{missing[0]} & pending {missing[1].lower()}"
	return "Pending: " + ", ".join(missing)


def _cost_center_label(cost_center: str | None) -> str:
	if not cost_center or not isinstance(cost_center, str):
		return ""
	if frappe.db.has_column("Cost Center", "cost_center_name"):
		label = frappe.db.get_value("Cost Center", cost_center, "cost_center_name")
		if label:
			return str(label)
	return cost_center.split(" - ")[0].strip() if cost_center else ""


def _format_doa(row: dict) -> str:
	admitted = resolve_admission_datetime(
		row.get("admitted_datetime"),
		row.get("admission_date"),
		row.get("admission_time"),
	)
	if admitted:
		return getdate(admitted).strftime("%d/%m/%Y")
	if row.get("admission_date"):
		return getdate(row.get("admission_date")).strftime("%d/%m/%Y")
	return ""


@frappe.whitelist()
def get_medical_record_checklist(
	from_date=None, to_date=None, cost_center=None, include_discharge_started=0
):
	"""Checklist of clinical documents for currently admitted patients.

	Only includes Inpatient Admissions in Admitted or Discharge Scheduled status.
	Ticks are derived from existing records — this is a report, not a doctype.

	``include_discharge_started`` (checkbox, default OFF): when falsy, patients who
	have a draft Discharge (docstatus = 0) are excluded from the report — they have
	physically left the hospital even though the admission still reads "Admitted"
	until financial completion. Tick the box to include those patients.
	"""
	resolved = resolve_cost_center_filter(cost_center)
	if resolved is False:
		return _empty_payload(from_date, to_date, cost_center)

	include_discharge_started = frappe.utils.cint(include_discharge_started)

	filters: dict = {"status": ["in", list(ACTIVE_STATUSES)]}
	if isinstance(resolved, list):
		filters["cost_center"] = ["in", resolved]
	elif resolved:
		filters["cost_center"] = resolved

	admissions = frappe.get_all(
		"Inpatient Admission",
		filters=filters,
		fields=[
			"name",
			"patient",
			"patient_name",
			"status",
			"cost_center",
			"admitted_datetime",
			"admission_date",
			"admission_time",
			"signature",
			"allergies",
		],
		order_by="admitted_datetime asc, admission_date asc, patient_name asc",
	)

	# Remove patients who have a draft discharge (docstatus = 0) unless the
	# "Include discharge started" checkbox is ticked. A draft discharge means the
	# patient has physically left the hospital but the admission stays "Admitted"
	# until the financial/administrative discharge completes.
	if not include_discharge_started and admissions:
		draft_discharge_admissions = set(
			frappe.get_all(
				"Discharge",
				filters={"docstatus": 0, "admission": ["in", [r.name for r in admissions]]},
				pluck="admission",
			)
		)
		if draft_discharge_admissions:
			admissions = [r for r in admissions if r.name not in draft_discharge_admissions]

	from_d = getdate(from_date) if from_date else None
	to_d = getdate(to_date) if to_date else getdate(today())

	names = [r.name for r in admissions]
	patients = [r.patient for r in admissions if r.patient]
	admission_by_patient = {r.patient: r.name for r in admissions if r.patient}

	if not names:
		return {
			"from_date": str(from_d) if from_d else None,
			"to_date": str(to_d) if to_d else None,
			"cost_center": (resolved if isinstance(resolved, str) else (cost_center or None)),
			"branch": _cost_center_label(resolved if isinstance(resolved, str) else cost_center),
			"prepared_by": get_fullname(frappe.session.user) or frappe.session.user,
			"columns": [{"key": key, "label": label} for key, label in CHECK_COLUMNS],
			"rows": [],
			"include_discharge_started": bool(include_discharge_started),
		}

	file_no_by_patient: dict[str, str] = {}
	if patients:
		for p in frappe.get_all(
			"Patient",
			filters={"name": ["in", patients]},
			fields=["name", "file_no"],
		):
			file_no_by_patient[p.name] = p.file_no or p.name

	signed = _signed_admissions(names)
	consent = _consent_hits(names)
	history = _admission_hits("Patient History", "inpatient_admission", names) | _admission_hits(
		"Patient Medical History", "inpatient_admission", names
	)
	physical = _admission_hits("Physical Examination", "inpatient_admission", names)
	allergies = _allergy_patients(patients, admission_by_patient)
	risk = (
		_admission_hits("IP Risk Analysis", "admission_no", names)
		| _admission_hits("Fall Risk Assessment", "admission_num", names)
		| _admission_hits("Morse Fall Scale", "admission_no", names)
	)
	med_sheet = _admission_hits("Patient Medication Order", "inpatient_record", names)
	dr_notes = _clinical_note_hits(names, NOTE_TYPE_ALIASES["dr_notes"])
	psy_notes = _clinical_note_hits(names, NOTE_TYPE_ALIASES["psy_notes"])
	nut_notes = _clinical_note_hits(names, NOTE_TYPE_ALIASES["nutritional_notes"])
	ot_notes = _clinical_note_hits(names, NOTE_TYPE_ALIASES["occupational_notes"])
	nursing_assessment = _admission_hits("Patient Assessment", "admission", names) | _admission_hits(
		"IP Patient Assessment", "admission_num", names
	)
	suicidal = _admission_hits("Clinical Suicide Risk Assessment", "inpatient_admission", names)
	sleeping = _admission_hits("Sleeping Pattern", "admission_no", names)
	grooming = _admission_hits("IP Grooming Chart", "admission_no", names)
	mental = _admission_hits("Mental State", "admission_no", names)
	vitals = _admission_hits("Vital Signs", "inpatient_record", names)
	weight = _numeric_hits("Vital Signs", "inpatient_record", names, "weight") | _numeric_hits(
		"Physical Examination", "inpatient_admission", names, "weight"
	)
	height = _numeric_hits("Vital Signs", "inpatient_record", names, "height") | _numeric_hits(
		"Physical Examination", "inpatient_admission", names, "height"
	)
	nursing_notes = _admission_hits("Main Nursing Note", "admission", names)

	lookup = {
		"admission_signed": signed,
		"consent": consent,
		"history": history,
		"physical_exam": physical,
		"allergies": allergies,
		"dr_risk_assessment": risk,
		"medication_sheet": med_sheet,
		"dr_notes": dr_notes,
		"psy_notes": psy_notes,
		"nutritional_notes": nut_notes,
		"occupational_notes": ot_notes,
		"nursing_assessment": nursing_assessment,
		"suicidal_ra": suicidal,
		"sleeping": sleeping,
		"grooming": grooming,
		"mental_state": mental,
		"vital_signs": vitals,
		"weight": weight,
		"height": height,
		"nursing_notes": nursing_notes,
	}

	rows = []
	for idx, row in enumerate(admissions, start=1):
		checks = {key: row.name in lookup[key] for key, _label in CHECK_COLUMNS}
		rows.append(
			{
				"sno": idx,
				"admission": row.name,
				"patient": row.patient,
				"patient_name": row.patient_name or row.patient,
				"file_no": file_no_by_patient.get(row.patient) or row.patient,
				"doa": _format_doa(row),
				"status": row.status,
				"checks": checks,
				"remarks": _remarks_for(checks),
			}
		)

	cc_for_label = resolved if isinstance(resolved, str) else (cost_center or "")
	if isinstance(resolved, list) and len(resolved) == 1:
		cc_for_label = resolved[0]

	return {
		"from_date": str(from_d) if from_d else None,
		"to_date": str(to_d) if to_d else str(getdate(today())),
		"cost_center": cc_for_label or None,
		"branch": _cost_center_label(cc_for_label) if cc_for_label else "",
		"prepared_by": get_fullname(frappe.session.user) or frappe.session.user,
		"columns": [{"key": key, "label": label} for key, label in CHECK_COLUMNS],
		"rows": rows,
		"include_discharge_started": bool(include_discharge_started),
	}


def _empty_payload(from_date, to_date, cost_center):
	return {
		"from_date": from_date or None,
		"to_date": to_date or str(getdate(today())),
		"cost_center": cost_center or None,
		"branch": _cost_center_label(cost_center) if cost_center else "",
		"prepared_by": get_fullname(frappe.session.user) or frappe.session.user,
		"columns": [{"key": key, "label": label} for key, label in CHECK_COLUMNS],
		"rows": [],
		"include_discharge_started": False,
	}
