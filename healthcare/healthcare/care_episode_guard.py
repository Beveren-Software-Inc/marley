# Copyright (c) 2026, healthcare contributors
"""Block new clinical records against closed OP visits or discharged IP admissions."""

from __future__ import annotations

import frappe
from frappe import _

CLOSED_PATIENT_VISIT_STATUSES = frozenset({"Completed", "Cancelled"})
CLOSED_INPATIENT_ADMISSION_STATUSES = frozenset({"Discharged", "Cancelled"})

VISIT_LINK_FIELDNAMES = (
	"patient_visit",
	"patient_encounter",
)

ADMISSION_LINK_FIELDNAMES = (
	"inpatient_admission",
	"inpatient_record",
	"admission_no",
	"written_inpatient_admission",
)

SKIP_DOCTYPES = frozenset(
	{
		"Patient Visit",
		"Inpatient Admission",
		"Discharge",
		"Patient Appointment",
	}
)


def block_clinical_records_on_discharged_ip() -> bool:
	"""Healthcare Settings: when True, closed IP admissions cannot receive new clinical records."""
	return bool(
		frappe.db.get_single_value(
			"Healthcare Settings",
			"block_clinical_records_on_discharged_ip",
		)
	)


def block_clinical_records_on_completed_visit() -> bool:
	"""Healthcare Settings: when True, completed/cancelled OP visits cannot receive new clinical records."""
	return bool(
		frappe.db.get_single_value(
			"Healthcare Settings",
			"block_clinical_records_on_completed_visit",
		)
	)


def _visit_status(visit_name: str) -> str | None:
	if not visit_name or not frappe.db.exists("Patient Visit", visit_name):
		return None
	return frappe.db.get_value("Patient Visit", visit_name, "status")


def _admission_status(admission_name: str) -> str | None:
	if not admission_name or not frappe.db.exists("Inpatient Admission", admission_name):
		return None
	return frappe.db.get_value("Inpatient Admission", admission_name, "status")


def _strip_admission_name(value) -> str:
	if value is None:
		return ""
	return str(value).strip()


def resolve_inpatient_admission_name(value, patient=None) -> str | None:
	"""Return a real Inpatient Admission name (case no).

	`inpatient_record` and `inpatient_admission` are the same link. Values may be
	the current case no or a legacy `admission_no_old`. Invalid ids are ignored.
	"""
	name = _strip_admission_name(value)
	if not name:
		return None
	if frappe.db.exists("Inpatient Admission", name):
		return name

	for field in ("case_no", "admission_no_old"):
		found = frappe.db.get_value("Inpatient Admission", {field: name}, "name")
		if found:
			return found

	if patient and frappe.db.exists("Patient", patient):
		for field in ("case_no", "admission_no_old"):
			found = frappe.db.get_value(
				"Inpatient Admission", {"patient": patient, field: name}, "name"
			)
			if found:
				return found

	return None


def sync_inpatient_admission_fields(doc) -> str | None:
	"""Keep `inpatient_record` and `inpatient_admission` on the same admission.

	Clears either field when the value is not a real Inpatient Admission, so
	link validation does not fail on stale Patient master ids.
	"""
	has_record = bool(doc.meta.has_field("inpatient_record"))
	has_admission = bool(doc.meta.has_field("inpatient_admission"))
	if not has_record and not has_admission:
		return None

	patient = doc.get("patient")
	candidates = []
	if has_admission:
		candidates.append(doc.get("inpatient_admission"))
	if has_record:
		candidates.append(doc.get("inpatient_record"))

	admission = None
	for value in candidates:
		admission = resolve_inpatient_admission_name(value, patient)
		if admission:
			break

	if has_record:
		doc.inpatient_record = admission
	if has_admission:
		doc.inpatient_admission = admission
	return admission


def assert_patient_visit_open_for_create(visit_name: str) -> None:
	if not block_clinical_records_on_completed_visit():
		return
	status = _visit_status(visit_name)
	if status in CLOSED_PATIENT_VISIT_STATUSES:
		frappe.throw(
			_(
				"This patient visit is {0}. Select or create an open OP visit before adding records."
			).format(status),
			title=_("Visit closed"),
		)


def assert_inpatient_admission_open_for_create(admission_name: str) -> None:
	if not block_clinical_records_on_discharged_ip():
		return
	status = _admission_status(admission_name)
	if status in CLOSED_INPATIENT_ADMISSION_STATUSES:
		frappe.throw(
			_(
				"This inpatient admission is {0}. Select or create an active IP admission before adding records."
			).format(status),
			title=_("Admission closed"),
		)


def _resolve_visit_ref(doc) -> str | None:
	for fieldname in VISIT_LINK_FIELDNAMES:
		value = doc.get(fieldname)
		if value and frappe.db.exists("Patient Visit", value):
			return value
	visit_num = doc.get("visit_num")
	if visit_num and frappe.db.exists("Patient Visit", visit_num):
		return visit_num
	return None


def _resolve_admission_ref(doc) -> str | None:
	patient = doc.get("patient")
	for fieldname in ADMISSION_LINK_FIELDNAMES:
		value = doc.get(fieldname)
		resolved = resolve_inpatient_admission_name(value, patient)
		if resolved:
			return resolved
	return None


def _skip_guard_for_doc(doc) -> bool:
	if getattr(doc.flags, "skip_care_episode_guard", False):
		return True
	return bool(getattr(frappe.flags, "healthcare_patient_history_import", False))


def validate_care_episode_open(doc, method=None):
	"""Doc validate hook: reject saves linked to a closed visit or admission."""
	if doc.doctype in SKIP_DOCTYPES:
		return
	if _skip_guard_for_doc(doc):
		return

	visit_name = _resolve_visit_ref(doc)
	admission_name = _resolve_admission_ref(doc)

	if visit_name:
		assert_patient_visit_open_for_create(visit_name)
	if admission_name:
		assert_inpatient_admission_open_for_create(admission_name)
