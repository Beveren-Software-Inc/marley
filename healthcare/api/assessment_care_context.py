"""Copy Cost Center onto assessments from the linked Patient Visit or Inpatient Admission."""

from __future__ import annotations

import frappe

ASSESSMENT_COST_CENTER_DOCTYPES = (
	"YMRS Assessment",
	"YBOCS Assessment",
	"PHQ9 Assessment",
	"GAD7 Assessment",
	"Depression Assessment",
	"ADHD Assessment",
	"PANSS Assessment",
	"Mood Disorder Assessment",
	"Homicide Risk Assessment",
	"Clinical Suicide Risk Assessment",
	"Pre Anesthesia Assessment",
	"Suicidal Patient Assessment",
	"Patient Assessment",
	"IP Patient Assessment",
	"Fall Risk Assessment",
	"Morse Fall Scale",
	"Physical Examination",
)

VISIT_FIELDS = ("patient_visit", "patient_encounter")
ADMISSION_FIELDS = ("inpatient_admission", "admission_no", "admission_num", "admission")


def _field(doc, name: str) -> str:
	val = doc.get(name) if doc else None
	if val is None:
		return ""
	return val.strip() if isinstance(val, str) else str(val)


def _infer_encounter_doctype(encounter: str) -> str | None:
	if not encounter:
		return None
	if frappe.db.exists("Patient Visit", encounter):
		return "Patient Visit"
	if frappe.db.exists("Inpatient Admission", encounter):
		return "Inpatient Admission"
	return None


def assessment_care_reference(doc) -> tuple[str | None, str | None]:
	"""Return ('Patient Visit' | 'Inpatient Admission', name) for the chosen care context."""
	ref_type = _field(doc, "reference_type")
	encounter = _field(doc, "encounter")
	if encounter:
		if ref_type in ("Patient Visit", "Inpatient Admission"):
			return ref_type, encounter
		inferred = _infer_encounter_doctype(encounter)
		if inferred:
			return inferred, encounter

	for name in VISIT_FIELDS:
		visit = _field(doc, name)
		if visit:
			return "Patient Visit", visit

	for name in ADMISSION_FIELDS:
		admission = _field(doc, name)
		if admission:
			return "Inpatient Admission", admission

	return None, None


def _cc_from_visit(visit_name: str) -> str | None:
	from healthcare.api.sales_order_cost_center import cost_center_from_visit_or_admission

	cc = cost_center_from_visit_or_admission("Patient Visit", visit_name)
	if cc:
		return cc
	admission = frappe.db.get_value("Patient Visit", visit_name, "inpatient_record")
	if admission:
		return cost_center_from_visit_or_admission("Inpatient Admission", admission)
	return None


def _cc_from_admission(admission_name: str) -> str | None:
	from healthcare.api.sales_order_cost_center import cost_center_from_visit_or_admission

	return cost_center_from_visit_or_admission("Inpatient Admission", admission_name)


def resolve_assessment_cost_center(doc) -> str | None:
	"""Resolve branch/cost center from care links on the assessment.

	Tries the primary care reference first, then any other visit/admission
	fields on the document (so an IP admission still wins when the visit
	has no cost center).
	"""
	candidates: list[tuple[str, str]] = []
	ref_dt, ref_dn = assessment_care_reference(doc)
	if ref_dt and ref_dn:
		candidates.append((ref_dt, ref_dn))

	for name in VISIT_FIELDS:
		visit = _field(doc, name)
		if visit:
			candidates.append(("Patient Visit", visit))
	for name in ADMISSION_FIELDS:
		admission = _field(doc, name)
		if admission:
			candidates.append(("Inpatient Admission", admission))

	seen: set[tuple[str, str]] = set()
	for ref_dt, ref_dn in candidates:
		key = (ref_dt, ref_dn)
		if key in seen:
			continue
		seen.add(key)
		if ref_dt == "Patient Visit":
			cc = _cc_from_visit(ref_dn)
			if cc:
				return cc
		elif ref_dt == "Inpatient Admission":
			cc = _cc_from_admission(ref_dn)
			if cc:
				return cc
	return None


def fill_assessment_cost_center_from_care_context(doc) -> None:
	"""Set cost_center (and branch / branch_num) from visit or admission when blank.

	Does not override a branch already chosen on the UI / payload.
	"""
	meta = getattr(doc, "meta", None)
	has_field = meta.has_field if meta is not None else lambda name: True

	if has_field("cost_center") and _field(doc, "cost_center"):
		return
	if has_field("branch") and _field(doc, "branch") and not has_field("cost_center"):
		return

	cc = resolve_assessment_cost_center(doc)
	if not cc:
		return

	if has_field("cost_center") and not _field(doc, "cost_center"):
		doc.cost_center = cc
	if has_field("branch") and not _field(doc, "branch"):
		doc.branch = cc
	if has_field("branch_num") and not _field(doc, "branch_num"):
		doc.branch_num = cc


def fill_assessment_cost_center_on_save(doc, method=None) -> None:
	fill_assessment_cost_center_from_care_context(doc)
