# healthcare/api/suicide_risk_assessment_api.py

import frappe

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
        
        # Section 1: Suicidal Ideation
        doc.has_ideation = data.get("has_ideation", 0)
        if doc.has_ideation:
            doc.ideation_frequency = data.get("ideation_frequency")
            doc.ideation_duration = data.get("ideation_duration")
            doc.ideation_increasing = data.get("ideation_increasing")
            doc.ideation_24h = data.get("ideation_24h", 0)
        
        # Section 2: Current Plan
        doc.has_plan = data.get("has_plan", 0)
        if doc.has_plan:
            doc.plan_method = data.get("plan_method")
            doc.plan_location = data.get("plan_location")
            doc.plan_immediacy = data.get("plan_immediacy")
            doc.access_lethal_means = data.get("access_lethal_means", 0)
        
        doc.risk_behavior = data.get("risk_behavior", 0)
        
        # Section 3: History / Previous Attempts
        doc.has_history = data.get("has_history", 0)
        if doc.has_history:
            doc.attempt_count = data.get("attempt_count")
            doc.last_attempt = data.get("last_attempt")
        
        doc.psychiatric_history = data.get("psychiatric_history")
        
        # Section 4: Current Stressors
        doc.has_stressors = data.get("has_stressors", 0)
        if doc.has_stressors:
            doc.stressors_description = data.get("stressors_description")
        
        # Section 5: Protective Factors - People
        doc.has_support = data.get("has_support", 0)
        if doc.has_support:
            doc.support_people = data.get("support_people")
        
        # Section 6: Protective Factors - Coping
        doc.has_coping = data.get("has_coping", 0)
        if doc.has_coping:
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
    if data.get("has_ideation"):
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
        if data.get("ideation_24h"):
            score += 10
    
    # Plan factors (max 30 points)
    if data.get("has_plan"):
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
        if data.get("access_lethal_means"):
            score += 10
    
    # Risk behavior (0-10)
    if data.get("risk_behavior"):
        score += 10
    
    # History factors (max 20 points)
    if data.get("has_history"):
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
    if data.get("has_stressors"):
        score += 10
    
    # Protective factors (negative points)
    if data.get("has_support"):
        score -= 10
    if data.get("has_coping"):
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
def get_suicide_risk_assessments(patient=None, search=None):
    """Fetch Suicide Risk assessments with optional filters."""
    filters = []
    if patient:
        filters.append(["patient", "=", patient])
    if search:
        filters.append(["patient_name", "like", f"%{search}%"])
    
    assessments = frappe.get_list(
        "Clinical Suicide Risk Assessment",
        fields=[
            "name", "patient", "patient_name", "assessment_date",
            "clinician", "risk_score", "risk_level", "docstatus"
        ],
        filters=filters,
        limit=50,
        order_by="assessment_date desc"
    )
    
    return assessments