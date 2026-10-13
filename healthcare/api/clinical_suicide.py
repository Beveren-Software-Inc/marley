# healthcare/api/suicide_risk_assessment_api.py

import frappe
from frappe import _

from healthcare.api.assessment_portal_utils import (
    ensure_assessment_read_permission,
    is_yes_answer,
    yes_no_answer,
)

ASSESSMENT_DOCTYPE = "Clinical Suicide Risk Assessment"


def _serialize_suicide_risk_assessment(doc) -> dict:
	row = doc.as_dict()
	if row.get("patient") and not row.get("patient_name"):
		row["patient_name"] = frappe.db.get_value("Patient", row["patient"], "patient_name")
	if row.get("clinician") and not row.get("clinician_name"):
		row["clinician_name"] = (
			frappe.db.get_value("Healthcare Practitioner", row["clinician"], "practitioner_name")
			or row["clinician"]
		)
	return row


@frappe.whitelist()
def get_suicide_risk_assessment(name: str | None = None):
	"""Fetch a single Clinical Suicide Risk Assessment with all entered fields."""
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Clinical Suicide Risk Assessment is required"))
	doc = ensure_assessment_read_permission(ASSESSMENT_DOCTYPE, name)
	return _serialize_suicide_risk_assessment(doc)

@frappe.whitelist()
def create_suicide_risk_assessment(data):
    """Create a new Clinical Suicide Risk Assessment record."""
    try:
        if isinstance(data, str):
            data = frappe.parse_json(data)
        
        doc = frappe.new_doc("Clinical Suicide Risk Assessment")
        
        # Basic Information
        doc.patient = data.get("patient")
        doc.assessment_date = data.get("assessment_date")
        doc.clinician = data.get("clinician")
        doc.inpatient_admission = data.get("inpatient_admission")
        doc.patient_visit = data.get("patient_visit")
        if data.get("cost_center") is not None:
            doc.cost_center = data.get("cost_center") or None

        from healthcare.api.assessment_care_context import fill_assessment_cost_center_from_care_context

        fill_assessment_cost_center_from_care_context(doc)
        # Section 1: Suicidal Ideation
        # Answers are stored as "Yes" / "No"; a question the clinician leaves
        # unanswered stays blank (never assumed to be a "No").
        doc.has_ideation = yes_no_answer(data.get("has_ideation"))
        if doc.has_ideation == "Yes":
            doc.ideation_frequency = data.get("ideation_frequency")
            doc.ideation_duration = data.get("ideation_duration")
            doc.ideation_increasing = data.get("ideation_increasing")
            doc.ideation_24h = yes_no_answer(data.get("ideation_24h"))
        
        # Section 2: Current Plan
        doc.has_plan = yes_no_answer(data.get("has_plan"))
        if doc.has_plan == "Yes":
            doc.plan_method = data.get("plan_method")
            doc.plan_location = data.get("plan_location")
            doc.plan_immediacy = data.get("plan_immediacy")
            doc.access_lethal_means = yes_no_answer(data.get("access_lethal_means"))
        
        doc.risk_behavior = yes_no_answer(data.get("risk_behavior"))
        if doc.risk_behavior == "Yes":
            doc.risk_behavior_details = data.get("risk_behavior_details")
        
        # Section 3: History / Previous Attempts
        doc.has_history = yes_no_answer(data.get("has_history"))
        if doc.has_history == "Yes":
            doc.attempt_count = data.get("attempt_count")
            doc.last_attempt = data.get("last_attempt")
        
        doc.psychiatric_history = data.get("psychiatric_history")
        if doc.psychiatric_history == "Yes":
            doc.prior_psychiatric_diagnosis = data.get("prior_psychiatric_diagnosis")
        
        # Section 4: Current Stressors
        doc.has_stressors = yes_no_answer(data.get("has_stressors"))
        if doc.has_stressors == "Yes":
            doc.stressors_description = data.get("stressors_description")
        
        # Section 5: Protective Factors - People
        doc.has_support = yes_no_answer(data.get("has_support"))
        if doc.has_support == "Yes":
            doc.support_people = data.get("support_people")
        
        # Section 6: Protective Factors - Coping
        doc.has_coping = yes_no_answer(data.get("has_coping"))
        if doc.has_coping == "Yes":
            doc.coping_strategies = data.get("coping_strategies")
        
        doc.reasons_to_live = data.get("reasons_to_live")
        doc.personal_strengths = data.get("personal_strengths")
        
        # Calculate Risk Score and Level
        risk_score = calculate_risk_score(data)
        doc.risk_score = risk_score
        doc.risk_level = get_risk_level(risk_score)
        
        # Actions
        doc.actions_required = data.get("actions_required")
        
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
        return {"success": True, "name": doc.name}
    except Exception as e:
        frappe.logger().error(f"Error creating suicide risk assessment: {str(e)}")
        return {"success": False, "message": str(e)}


def calculate_risk_score(data):
    """Calculate risk score based on responses."""
    score = 0
    
    # Ideation factors (max 40 points)
    if is_yes_answer(data.get("has_ideation")):
        score += 10
        
        # Frequency (0-10)
        frequency = data.get("ideation_frequency", "").lower()
        if "daily" in frequency or "constant" in frequency:
            score += 10
        elif "weekly" in frequency:
            score += 7
        elif "occasional" in frequency:
            score += 4
        
        # Duration (0-5)
        duration = data.get("ideation_duration", "").lower()
        if "year" in duration or "month" in duration:
            score += 5
        elif "week" in duration:
            score += 3
        
        # Increasing intensity (0-5)
        if data.get("ideation_increasing") == "Yes":
            score += 5
        
        # Past 24 hours (0-10)
        if is_yes_answer(data.get("ideation_24h")):
            score += 10
    
    # Plan factors (max 30 points)
    if is_yes_answer(data.get("has_plan")):
        score += 15
        
        # Immediacy (0-15)
        immediacy = data.get("plan_immediacy", "")
        if immediacy == "Immediate":
            score += 15
        elif immediacy == "Next 24 hours":
            score += 12
        elif immediacy == "Week":
            score += 8
        elif immediacy == "Nonspecific":
            score += 4
        
        # Access to lethal means (0-10)
        if is_yes_answer(data.get("access_lethal_means")):
            score += 10
    
    # Risk behavior (0-10)
    if is_yes_answer(data.get("risk_behavior")):
        score += 10
    
    # History factors (max 20 points)
    if is_yes_answer(data.get("has_history")):
        score += 10
        
        # Multiple attempts (0-10)
        attempt_count = data.get("attempt_count", 0)
        if attempt_count >= 3:
            score += 10
        elif attempt_count >= 2:
            score += 7
        elif attempt_count >= 1:
            score += 4
        
        # Recent attempt (0-5)
        last_attempt = data.get("last_attempt", "").lower()
        if "week" in last_attempt:
            score += 5
        elif "month" in last_attempt:
            score += 3
    
    # Psychiatric history (0-5)
    if data.get("psychiatric_history") == "Yes":
        score += 5
    
    # Stressors (0-10)
    if is_yes_answer(data.get("has_stressors")):
        score += 10
    
    # Protective factors (negative points)
    if is_yes_answer(data.get("has_support")):
        score -= 10
    if is_yes_answer(data.get("has_coping")):
        score -= 10
    if data.get("reasons_to_live"):
        score -= 5
    if data.get("personal_strengths"):
        score -= 5
    
    # Ensure score is within 0-100 range
    return max(0, min(100, score))


def get_risk_level(score):
    """Determine risk level based on score."""
    if score >= 75:
        return "Emergency"
    elif score >= 50:
        return "High"
    elif score >= 25:
        return "Medium"
    else:
        return "Low"


@frappe.whitelist()
def get_suicide_risk_assessments(
    patient=None,
    search=None,
    admission=None,
    patient_visit=None,
):
    """Fetch Suicide Risk assessments with optional filters."""
    filters = []

    if patient:
        filters.append(["patient", "=", patient])
    if search:
        filters.append(["patient", "like", f"%{search}%"])
    if patient_visit:
        filters.append(["patient_visit", "=", patient_visit])
    if admission:
        filters.append(["inpatient_admission", "=", admission])

    assessments = frappe.get_list(
        "Clinical Suicide Risk Assessment",
        fields=[
            "name",
            "patient",
            "assessment_date",
            "clinician",
            "inpatient_admission",
            "patient_visit",
            "cost_center",
            "risk_score",
            "risk_level",
            "docstatus",
        ],
        filters=filters,
        limit=50,
        order_by="assessment_date desc",
    )

    if assessments:
        patient_names = {
            row.name: row.patient_name
            for row in frappe.get_all(
                "Patient",
                filters={"name": ("in", list({a.patient for a in assessments}))},
                fields=["name", "patient_name"],
            )
        }
        clinician_names = {}
        clinician_ids = [a.clinician for a in assessments if a.clinician]
        if clinician_ids:
            clinician_names = {
                row.name: row.practitioner_name
                for row in frappe.get_all(
                    "Healthcare Practitioner",
                    filters={"name": ("in", clinician_ids)},
                    fields=["name", "practitioner_name"],
                )
            }
        for row in assessments:
            row["patient_name"] = patient_names.get(row.patient, row.patient)
            row["clinician_name"] = clinician_names.get(row.clinician, row.clinician)

    return assessments