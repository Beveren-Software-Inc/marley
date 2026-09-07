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


def resolve_assessment_cost_center(doc) -> str | None:
	from healthcare.api.sales_order_cost_center import cost_center_from_visit_or_admission

	ref_dt, ref_dn = assessment_care_reference(doc)
	if ref_dt == "Patient Visit" and ref_dn:
		cc = cost_center_from_visit_or_admission("Patient Visit", ref_dn)
		if cc:
			return cc
		admission = frappe.db.get_value("Patient Visit", ref_dn, "inpatient_record")
		if admission:
			return cost_center_from_visit_or_admission("Inpatient Admission", admission)
		return None

	if ref_dt == "Inpatient Admission" and ref_dn:
		return cost_center_from_visit_or_admission("Inpatient Admission", ref_dn)
	return None


def fill_assessment_cost_center_from_care_context(doc) -> None:
	"""Set cost_center (and branch / branch_num when those fields exist) from visit or admission."""
	cc = resolve_assessment_cost_center(doc)
	if not cc:
		return

	meta = getattr(doc, "meta", None)
	has_field = meta.has_field if meta is not None else lambda name: True

	if has_field("cost_center"):
		doc.cost_center = cc
	if has_field("branch"):
		doc.branch = cc
	if has_field("branch_num"):
		doc.branch_num = cc


def fill_assessment_cost_center_on_save(doc, method=None) -> None:
	fill_assessment_cost_center_from_care_context(doc)
