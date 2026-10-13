# healthcare/api/general_risk_assessment.py

import frappe
from frappe import _

from healthcare.api.assessment_portal_utils import (
	apply_care_context_fields,
	ensure_assessment_portal_write_access,
	ensure_assessment_read_permission,
	is_yes_answer,
	list_assessments,
	user_can_read_assessment_portal,
	yes_no_answer,
)

DOCTYPE = "General Risk Assessment"

# Follow-up assessments that a flagged General Risk Assessment item demands.
SUICIDAL_RISK_DOCTYPE = "Clinical Suicide Risk Assessment"
HOMICIDE_RISK_DOCTYPE = "Homicide Risk Assessment"

# Yes/No items (Select answers on the doctype, blank = not answered) — each has a
# matching "<field>_reason".
CHECK_FIELDS = (
	"self_harm",
	"suicidal_risk",
	"others_bullying",
	"others_violence",
	"others_homicide",
	"from_bullying",
	"from_neglect",
	"from_violence",
)

REASON_FIELDS = tuple(f"{field}_reason" for field in CHECK_FIELDS)

LIST_FIELDS = [
	"name",
	"patient",
	"patient_name",
	"assessment_date",
	"practitioner",
	"practitioner_name",
	"docstatus",
	"inpatient_admission",
	"patient_visit",
	"cost_center",
	*CHECK_FIELDS,
]


def _serialize_general_risk_assessment(doc) -> dict:
	row = doc.as_dict()
	if row.get("patient") and not row.get("patient_name"):
		row["patient_name"] = frappe.db.get_value("Patient", row["patient"], "patient_name")
	if row.get("practitioner") and not row.get("practitioner_name"):
		row["practitioner_name"] = frappe.db.get_value(
			"Healthcare Practitioner", row["practitioner"], "practitioner_name"
		)
	for field in CHECK_FIELDS:
		row[field] = yes_no_answer(row.get(field))
	return row


@frappe.whitelist()
def get_general_risk_assessment(name: str | None = None):
	name = (name or "").strip()
	if not name:
		frappe.throw(_("General Risk Assessment is required"))
	doc = ensure_assessment_read_permission(DOCTYPE, name)
	return _serialize_general_risk_assessment(doc)


@frappe.whitelist()
def create_general_risk_assessment(data):
	"""Create a new General Risk Assessment record."""
	try:
		if isinstance(data, str):
			data = frappe.parse_json(data)

		if not (data.get("patient") or "").strip():
			frappe.throw(_("Patient is required"))

		ensure_assessment_portal_write_access(DOCTYPE)

		doc = frappe.new_doc(DOCTYPE)
		doc.patient = data.get("patient")
		doc.assessment_date = data.get("assessment_date") or frappe.utils.today()
		apply_care_context_fields(doc, data)

		for field in CHECK_FIELDS:
			answer = yes_no_answer(data.get(field))
			setattr(doc, field, answer)
			# A reason only makes sense when the item was answered "Yes".
			setattr(doc, f"{field}_reason", data.get(f"{field}_reason") if answer == "Yes" else None)
		doc.notes = data.get("notes")

		doc.insert(ignore_permissions=True)
		frappe.db.commit()
		return {"success": True, "name": doc.name}
	except Exception as e:
		frappe.logger().error(f"Error creating general risk assessment: {str(e)}")
		return {"success": False, "message": str(e)}


@frappe.whitelist()
def get_general_risk_assessments(
	patient=None, practitioner=None, date_from=None, date_to=None, search=None
):
	"""Fetch General Risk assessments with optional filters."""
	rows = list_assessments(
		DOCTYPE,
		patient=patient,
		practitioner=practitioner,
		date_from=date_from,
		date_to=date_to,
		fields=LIST_FIELDS,
	)
	for row in rows:
		for field in CHECK_FIELDS:
			row[field] = yes_no_answer(row.get(field))
	return rows


# ── Follow-up risk assessment gaps ────────────────────────────────────────────


def _episode_filters(patient=None, inpatient_admission=None, patient_visit=None) -> dict:
	"""Scope a risk assessment query to the care episode currently in focus.

	The most specific context wins: IP admission → OP visit → patient.
	"""
	filters: dict = {}
	if inpatient_admission:
		filters["inpatient_admission"] = inpatient_admission
	elif patient_visit:
		filters["patient_visit"] = patient_visit
	elif patient:
		filters["patient"] = patient
	return filters


def _linked_assessment_exists(doctype: str, episode_filters: dict) -> str | None:
	"""Latest non-cancelled record of `doctype` inside the care episode, if any."""
	if not episode_filters:
		return None
	query = dict(episode_filters)
	query["docstatus"] = ["!=", 2]
	return frappe.db.get_value(doctype, query, "name", order_by="creation desc")


def _empty_gaps_payload() -> dict:
	return {
		"general_risk_assessment": None,
		"suicidal_risk_flagged": 0,
		"homicide_risk_flagged": 0,
		"clinical_suicide_risk_assessment": None,
		"homicide_risk_assessment": None,
		"needs_suicidal_risk_assessment": 0,
		"needs_homicide_risk_assessment": 0,
	}


@frappe.whitelist()
def get_risk_assessment_gaps(patient=None, inpatient_admission=None, patient_visit=None):
	"""Report the follow-up risk assessments still missing for a care episode.

	Looks at the latest General Risk Assessment of the episode: when it flags
	`suicidal_risk` / `others_homicide` while the matching assessment has not been
	recorded for the same episode, the UI marks the follow-up screen (Suicide /
	Homicide Risk Assessment) in the sidebar as outstanding.
	"""
	patient = (patient or "").strip() or None
	inpatient_admission = (inpatient_admission or "").strip() or None
	patient_visit = (patient_visit or "").strip() or None

	episode = _episode_filters(patient, inpatient_admission, patient_visit)
	if not episode:
		return _empty_gaps_payload()

	if not user_can_read_assessment_portal() and not frappe.has_permission(DOCTYPE, "read"):
		frappe.throw(_("Not permitted to read {0}").format(DOCTYPE), frappe.PermissionError)

	latest = frappe.get_all(
		DOCTYPE,
		filters={**episode, "docstatus": ["!=", 2]},
		fields=["name", "suicidal_risk", "others_homicide"],
		order_by="assessment_date desc, creation desc",
		limit_page_length=1,
		ignore_permissions=True,
	)
	general_risk = latest[0] if latest else None

	suicidal_flagged = 1 if general_risk and is_yes_answer(general_risk.suicidal_risk) else 0
	homicide_flagged = 1 if general_risk and is_yes_answer(general_risk.others_homicide) else 0

	suicidal_assessment = _linked_assessment_exists(SUICIDAL_RISK_DOCTYPE, episode)
	homicide_assessment = _linked_assessment_exists(HOMICIDE_RISK_DOCTYPE, episode)

	return {
		"general_risk_assessment": general_risk.name if general_risk else None,
		"suicidal_risk_flagged": suicidal_flagged,
		"homicide_risk_flagged": homicide_flagged,
		"clinical_suicide_risk_assessment": suicidal_assessment,
		"homicide_risk_assessment": homicide_assessment,
		"needs_suicidal_risk_assessment": int(bool(suicidal_flagged and not suicidal_assessment)),
		"needs_homicide_risk_assessment": int(bool(homicide_flagged and not homicide_assessment)),
	}
