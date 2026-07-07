"""Resolve Patient Visit practitioner display names with consultant-doctor fallback."""

from __future__ import annotations

import frappe


def practitioner_name_from_link(practitioner: str | None) -> str | None:
	if not practitioner:
		return None
	return (
		frappe.db.get_value("Healthcare Practitioner", practitioner, "practitioner_name")
		or practitioner
	)


def consultant_name_from_admission(admission_name: str | None) -> str | None:
	"""Consultant / admission doctor name from a linked Inpatient Admission."""
	if not admission_name or not frappe.db.exists("Inpatient Admission", admission_name):
		return None

	row = frappe.db.get_value(
		"Inpatient Admission",
		admission_name,
		["primary_practitioner", "admission_by_doctor", "admission_doctor_name"],
		as_dict=True,
	)
	if not row:
		return None

	if row.get("admission_doctor_name"):
		return row.admission_doctor_name

	for link in (row.get("primary_practitioner"), row.get("admission_by_doctor")):
		name = practitioner_name_from_link(link)
		if name:
			return name

	return None


def resolve_patient_visit_practitioner_name(visit: dict) -> str:
	"""Display practitioner name with consultant-doctor fallback from linked admission."""
	if visit.get("practitioner_name"):
		return visit["practitioner_name"]

	name = practitioner_name_from_link(visit.get("practitioner"))
	if name:
		return name

	admission = visit.get("inpatient_record")
	if not admission and visit.get("ip_admission_no"):
		from healthcare.api.visit_diagnosis_sync import _resolve_inpatient_admission

		admission = _resolve_inpatient_admission(visit["ip_admission_no"], visit.get("patient"))

	consultant = consultant_name_from_admission(admission)
	if consultant:
		return consultant

	appointment = visit.get("appointment")
	if appointment:
		appt = frappe.db.get_value(
			"Patient Appointment",
			appointment,
			["practitioner_name", "practitioner"],
			as_dict=True,
		)
		if appt:
			if appt.get("practitioner_name"):
				return appt.practitioner_name
			return practitioner_name_from_link(appt.get("practitioner")) or ""

	return ""


def enrich_patient_visit_practitioner_names(visits: list[dict]) -> None:
	"""Set practitioner_name on visit dicts in place."""
	if not visits:
		return

	practitioner_links: set[str] = set()
	admission_keys: set[str] = set()
	appointment_names: set[str] = set()
	needs_ip_lookup: list[dict] = []

	for visit in visits:
		if visit.get("practitioner_name"):
			continue
		if visit.get("practitioner"):
			practitioner_links.add(visit["practitioner"])
		if visit.get("inpatient_record"):
			admission_keys.add(visit["inpatient_record"])
		elif visit.get("ip_admission_no"):
			needs_ip_lookup.append(visit)
		if visit.get("appointment"):
			appointment_names.add(visit["appointment"])

	practitioner_name_map: dict[str, str] = {}
	if practitioner_links:
		for row in frappe.get_all(
			"Healthcare Practitioner",
			filters={"name": ["in", list(practitioner_links)]},
			fields=["name", "practitioner_name"],
		):
			practitioner_name_map[row.name] = row.practitioner_name or row.name

	admission_name_map: dict[str, str] = {}
	if admission_keys:
		admission_rows = frappe.get_all(
			"Inpatient Admission",
			filters={"name": ["in", list(admission_keys)]},
			fields=[
				"name",
				"primary_practitioner",
				"admission_by_doctor",
				"admission_doctor_name",
			],
		)
		extra_links: set[str] = set()
		for row in admission_rows:
			for link in (row.primary_practitioner, row.admission_by_doctor):
				if link and link not in practitioner_name_map:
					extra_links.add(link)
		if extra_links:
			for row in frappe.get_all(
				"Healthcare Practitioner",
				filters={"name": ["in", list(extra_links)]},
				fields=["name", "practitioner_name"],
			):
				practitioner_name_map[row.name] = row.practitioner_name or row.name

		for row in admission_rows:
			name = row.admission_doctor_name
			if not name:
				for link in (row.primary_practitioner, row.admission_by_doctor):
					if link:
						name = practitioner_name_map.get(link) or practitioner_name_from_link(link)
					if name:
						break
			if name:
				admission_name_map[row.name] = name

	appointment_map: dict[str, str] = {}
	if appointment_names:
		for row in frappe.get_all(
			"Patient Appointment",
			filters={"name": ["in", list(appointment_names)]},
			fields=["name", "practitioner_name", "practitioner"],
		):
			appointment_map[row.name] = (
				row.practitioner_name
				or practitioner_name_from_link(row.practitioner)
				or ""
			)

	if needs_ip_lookup:
		from healthcare.api.visit_diagnosis_sync import _resolve_inpatient_admission

		for visit in needs_ip_lookup:
			admission = _resolve_inpatient_admission(visit["ip_admission_no"], visit.get("patient"))
			if admission:
				visit["_resolved_admission"] = admission
				if admission not in admission_name_map:
					consultant = consultant_name_from_admission(admission)
					if consultant:
						admission_name_map[admission] = consultant

	for visit in visits:
		if visit.get("practitioner_name"):
			continue

		name = practitioner_name_map.get(visit.get("practitioner") or "")

		if not name:
			admission = visit.get("inpatient_record") or visit.pop("_resolved_admission", None)
			if admission:
				name = admission_name_map.get(admission)

		if not name and visit.get("appointment"):
			name = appointment_map.get(visit["appointment"])

		if name:
			visit["practitioner_name"] = name


def enrich_patient_visit_patient_names(visits: list[dict]) -> None:
	"""Backfill patient_name / file_number on visit dicts when missing."""
	if not visits:
		return

	patient_ids = {visit.get("patient") for visit in visits if visit.get("patient")}
	if not patient_ids:
		return

	rows = frappe.get_all(
		"Patient",
		filters={"name": ["in", list(patient_ids)]},
		fields=["name", "patient_name", "file_no"],
	)
	by_name = {row.name: row for row in rows}

	for visit in visits:
		patient = by_name.get(visit.get("patient"))
		if not patient:
			continue
		if not visit.get("patient_name"):
			visit["patient_name"] = patient.patient_name or patient.name
		if not visit.get("file_number") and patient.file_no:
			visit["file_number"] = patient.file_no
