
import frappe

@frappe.whitelist()
def get_gad7_template_questions(template_name):
    """Return question list for a GAD7 Template.
    
    Returns:
        {
            "name": str,
            "template_name": str,
            "description": str | None,
            "questions": [
                {
                    "question_no": int,
                    "question": str,
                    "question_type": str,
                    "response_options": str
                }
            ]
        }
    """
    if not template_name:
        return {"name": "", "template_name": "", "questions": []}
    
    try:
        tmpl = frappe.get_doc("GAD7 Template", template_name)
        questions = []
        for q in (tmpl.questions or []):
            questions.append({
                "question_no": q.question_no,
                "question": q.question,
                "question_type": q.question_type,
                "response_options": q.response_options,
            })
        # Sort by question number for consistent ordering
        questions.sort(key=lambda x: x["question_no"])
        return {
            "name": tmpl.name,
            "template_name": tmpl.template_name,
            "description": tmpl.description or None,
            "questions": questions,
        }
    except Exception as e:
        frappe.logger().error(f"get_gad7_template_questions error: {e}")
        return {"name": template_name, "template_name": template_name, "questions": []}


@frappe.whitelist()
def create_gad7_assessment(data):
    """Create a new GAD7 Assessment record."""
    try:
        if isinstance(data, str):
            data = frappe.parse_json(data)
        
        doc = frappe.new_doc("GAD7 Assessment")
        doc.patient = data.get("patient")
        doc.assessment_date = data.get("assessment_date")
        doc.template = data.get("template")
        doc.notes = data.get("notes")
        
        # Calculate total score
        total_score = 0
        responses = data.get("responses", [])
        
        for resp in responses:
            score = resp.get("score", 0)
            total_score += score
            doc.append("responses", {
                "question_no": resp.get("question_no"),
                "question": resp.get("question"),
                "question_type": resp.get("question_type"),
                "response": resp.get("response"),
                "score": score,
            })
        
        doc.total_score = total_score
        
        # Determine severity based on total score
        # Standard GAD-7 scoring: 0-4: Minimal, 5-9: Mild, 10-14: Moderate, 15-21: Severe
        if total_score <= 4:
            doc.severity = "Minimal anxiety"
        elif total_score <= 9:
            doc.severity = "Mild anxiety"
        elif total_score <= 14:
            doc.severity = "Moderate anxiety"
        else:
            doc.severity = "Severe anxiety"
        
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
        return {"success": True, "name": doc.name}
    except Exception as e:
        frappe.logger().error(f"Error creating GAD7 assessment: {str(e)}")
        return {"success": False, "message": str(e)}


@frappe.whitelist()
def get_gad7_assessments(patient=None, search=None):
    """Fetch GAD7 assessments with optional filters."""
    filters = []
    if patient:
        filters.append(["patient", "=", patient])
    if search:
        filters.append(["patient_name", "like", f"%{search}%"])
    
    assessments = frappe.get_list(
        "GAD7 Assessment",
        fields=[
            "name", "patient", "patient_name", "assessment_date",
            "template", "total_score", "severity", "docstatus"
        ],
        filters=filters,
        limit=50,
        order_by="assessment_date desc"
    )
    
    return assessments