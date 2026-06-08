# healthcare/api/homicide_risk_assessment_api.py

import frappe
from frappe import _

from healthcare.api.assessment_portal_utils import (
	apply_care_context_fields,
	ensure_assessment_read_permission,
	list_assessments,
)


def _serialize_homicide_risk_assessment(doc) -> dict:
	row = doc.as_dict()
	if row.get("patient") and not row.get("patient_name"):
		row["patient_name"] = frappe.db.get_value("Patient", row["patient"], "patient_name")
	if row.get("practitioner") and not row.get("practitioner_name"):
		row["practitioner_name"] = frappe.db.get_value(
			"Healthcare Practitioner", row["practitioner"], "practitioner_name"
		)
	elif row.get("clinician") and not row.get("practitioner_name"):
		row["practitioner_name"] = frappe.db.get_value(
			"Healthcare Practitioner", row["clinician"], "practitioner_name"
		) or row["clinician"]
	row["contacts"] = [
		{
			"relative_name": c.relative_name,
			"relationship_with_patient": c.relationship_with_patient,
			"cpr__id_no": c.cpr__id_no,
			"relative_phone_no": c.relative_phone_no,
			"relative_alternative_phone_no": c.relative_alternative_phone_no,
			"relative_alternative_phone_no_2": c.relative_alternative_phone_no_2,
			"any_remarks": c.any_remarks,
			"entered_by": c.entered_by,
			"entered_date": c.entered_date,
		}
		for c in (doc.contacts or [])
	]
	return row


@frappe.whitelist()
def get_homicide_risk_assessment(name: str | None = None):
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Homicide Risk Assessment is required"))
	doc = ensure_assessment_read_permission("Homicide Risk Assessment", name)
	return _serialize_homicide_risk_assessment(doc)


@frappe.whitelist()
def create_homicide_risk_assessment(data):
	"""Create a new Homicide Risk Assessment record."""
	try:
		if isinstance(data, str):
			data = frappe.parse_json(data)

		doc = frappe.new_doc("Homicide Risk Assessment")

		doc.patient = data.get("patient")
		doc.assessment_date = data.get("assessment_date")
		apply_care_context_fields(doc, data)

		doc.reason_clinician = data.get("reason_clinician", 0)
		doc.reason_referral = data.get("reason_referral", 0)
		doc.reason_social = data.get("reason_social", 0)
		doc.reason_intake = data.get("reason_intake", 0)
		doc.reason_crisis = data.get("reason_crisis", 0)
		doc.reason_current = data.get("reason_current", 0)
		doc.reason_recent_event = data.get("reason_recent_event", 0)
		doc.reason_other_check = data.get("reason_other_check", 0)
		doc.other_reason = data.get("other_reason")
		doc.reason_for = data.get("reason_for")

		doc.intent_subjective = data.get("intent_subjective")
		doc.intent_objective = data.get("intent_objective")
		doc.plan_when = data.get("plan_when")
		doc.plan_where = data.get("plan_where")
		doc.plan_how = data.get("plan_how")
		doc.intended_victim = data.get("intended_victim")
		doc.access_to_means = data.get("access_to_means")
		doc.preparation = data.get("preparation")
		doc.rehearsal = data.get("rehearsal")

		doc.frequency = data.get("frequency")
		doc.intensity = data.get("intensity")
		doc.duration = data.get("duration")

		doc.history_self_harm = data.get("history_self_harm")
		doc.history_violence = data.get("history_violence")
		doc.recent_discharge = data.get("recent_discharge")

		doc.depression = data.get("depression")
		doc.anxiety = data.get("anxiety")
		doc.anger = data.get("anger")
		doc.agitation = data.get("agitation")
		doc.insomnia = data.get("insomnia")
		doc.hopelessness = data.get("hopelessness")
		doc.burdensomeness = data.get("burdensomeness")
		doc.impulsivity = data.get("impulsivity")

		doc.subjective_report = data.get("subjective_report")
		doc.objective_signs = data.get("objective_signs")
		doc.chronic_risk = data.get("chronic_risk")
		doc.chronic_summary = data.get("chronic_summary")

		doc.therapeutic_alliance = data.get("therapeutic_alliance")
		doc.risk_level = data.get("risk_level")

		doc.past_safety_strategies = data.get("past_safety_strategies")
		doc.coping_strategies = data.get("coping_strategies")
		doc.treatment_preferences = data.get("treatment_preferences")
		doc.staff_responsibilities = data.get("staff_responsibilities")

		if data.get("contacts"):
			for contact in data.get("contacts"):
				doc.append("contacts", {
					"relative_name": contact.get("relative_name"),
					"relationship_with_patient": contact.get("relationship_with_patient"),
					"cpr__id_no": contact.get("cpr__id_no"),
					"relative_phone_no": contact.get("relative_phone_no"),
					"relative_alternative_phone_no": contact.get("relative_alternative_phone_no"),
					"relative_alternative_phone_no_2": contact.get("relative_alternative_phone_no_2"),
					"any_remarks": contact.get("any_remarks"),
					"entered_by": contact.get("entered_by"),
					"entered_date": contact.get("entered_date"),
				})

		doc.client_signature = data.get("client_signature")
		doc.staff_signature = data.get("staff_signature")
		doc.guardian_signature = data.get("guardian_signature")
		doc.witness_signature = data.get("witness_signature")

		doc.followup_date = data.get("followup_date")
		doc.followup_time = data.get("followup_time")

		doc.insert(ignore_permissions=True)
		frappe.db.commit()
		return {"success": True, "name": doc.name}
	except Exception as e:
		frappe.logger().error(f"Error creating homicide risk assessment: {str(e)}")
		return {"success": False, "message": str(e)}


@frappe.whitelist()
def get_homicide_risk_assessments(
	patient=None, practitioner=None, date_from=None, date_to=None, search=None
):
	"""Fetch Homicide Risk assessments with optional filters."""
	rows = list_assessments(
		"Homicide Risk Assessment",
		patient=patient,
		practitioner=practitioner,
		date_from=date_from,
		date_to=date_to,
		fields=[
			"name", "patient", "patient_name", "assessment_date",
			"practitioner", "practitioner_name", "clinician",
			"risk_level", "docstatus",
			"inpatient_admission", "patient_visit",
		],
	)
	for row in rows:
		if not row.get("practitioner_name") and row.get("clinician"):
			row["practitioner_name"] = frappe.db.get_value(
				"Healthcare Practitioner", row["clinician"], "practitioner_name"
			) or row["clinician"]
	return rows
