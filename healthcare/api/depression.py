
# healthcare/api/depression_assessment_api.py

import frappe

@frappe.whitelist()
def get_depression_template_questions(template_name):
    """Return question list for a Depression Assessment Template.
    
    Returns:
        {
            "name": str,
            "template_name": str,
            "description": str | None,
            "questions": [
                {
                    "question_no": int,
                    "question": str,
                    "option_0": str,
                    "option_1": str,
                    "option_2": str,
                    "option_3": str
                }
            ]
        }
    """
    if not template_name:
        return {"name": "", "template_name": "", "questions": []}
    
    try:
        tmpl = frappe.get_doc("Depression Assessment Template", template_name)
        questions = []
        for idx, q in enumerate(tmpl.questions or [], start=1):
            questions.append({
                "question_no": idx,
                "question": q.question,
                "option_0": q.option_0,
                "option_1": q.option_1,
                "option_2": q.option_2,
                "option_3": q.option_3,
            })
        return {
            "name": tmpl.name,
            "template_name": tmpl.template_name,
            "description": tmpl.description or None,
            "questions": questions,
        }
    except Exception as e:
        frappe.logger().error(f"get_depression_template_questions error: {e}")
        return {"name": template_name, "template_name": template_name, "questions": []}


@frappe.whitelist()
def create_depression_assessment(data):
    """Create a new Depression Assessment record."""
    try:
        if isinstance(data, str):
            data = frappe.parse_json(data)
        
        doc = frappe.new_doc("Depression Assessment")
        doc.patient = data.get("patient")
        doc.assessment_date = data.get("assessment_date")
        doc.template = data.get("template")
        doc.notes = data.get("notes")
        
        # Calculate total score and level
        total_score = 0
        responses = data.get("responses", [])
        
        for resp in responses:
            total_score += resp.get("score", 0)
            doc.append("responses", {
                "question_no": resp.get("question_no"),
                "question": resp.get("question"),
                "option_0": resp.get("option_0"),
                "option_1": resp.get("option_1"),
                "option_2": resp.get("option_2"),
                "option_3": resp.get("option_3"),
                "response": resp.get("response"),
                "score": resp.get("score", 0),
            })
        
        doc.total_score = total_score
        
        # Determine level of depression based on total score
        # Standard PHQ-9 scoring
        if total_score <= 4:
            doc.level_of_depression = "Normal"
        elif total_score <= 9:
            doc.level_of_depression = "Mild mood disturbance"
        elif total_score <= 14:
            doc.level_of_depression = "Borderline clinical depression"
        elif total_score <= 19:
            doc.level_of_depression = "Moderate depression"
        elif total_score <= 27:
            doc.level_of_depression = "Severe depression"
        else:
            doc.level_of_depression = "Extreme depression"
        
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
        return {"success": True, "name": doc.name}
    except Exception as e:
        frappe.logger().error(f"Error creating depression assessment: {str(e)}")
        return {"success": False, "message": str(e)}


@frappe.whitelist()
def get_depression_assessments(patient=None, search=None):
    """Fetch Depression assessments with optional filters."""
    filters = []
    if patient:
        filters.append(["patient", "=", patient])
    if search:
        filters.append(["patient_name", "like", f"%{search}%"])
    
    assessments = frappe.get_list(
        "Depression Assessment",
        fields=[
            "name", "patient", "patient_name", "assessment_date",
            "template", "total_score", "level_of_depression", "docstatus"
        ],
        filters=filters,
        limit=50,
        order_by="assessment_date desc"
    )
    
    return assessments