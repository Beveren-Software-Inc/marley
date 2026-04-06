# healthcare/api/ymrs_assessment_api.py

import frappe

@frappe.whitelist()
def get_ymrs_template_questions(template_name):
    """Return question list for a YMRS Template."""
    if not template_name:
        return {"name": "", "template_name": "", "questions": []}
    
    try:
        tmpl = frappe.get_doc("YMRS Template", template_name)
        questions = []
        for q in (tmpl.questions or []):
            # Build options array with only non-empty options
            options = []
            for i in range(0, 9):
                option_field = f"option_{i}"
                option_text = getattr(q, option_field, "")
                if option_text:
                    options.append({
                        "score": i,
                        "text": option_text
                    })
            
            questions.append({
                "question_no": q.question_no,
                "question": q.question,
                "max_score": q.max_score,
                "options": options
            })
        # Sort by question number
        questions.sort(key=lambda x: x["question_no"])
        return {
            "name": tmpl.name,
            "template_name": tmpl.template_name,
            "description": tmpl.description or None,
            "questions": questions,
        }
    except Exception as e:
        frappe.logger().error(f"get_ymrs_template_questions error: {e}")
        return {"name": template_name, "template_name": template_name, "questions": []}


@frappe.whitelist()
def create_ymrs_assessment(data):
    """Create a new YMRS Assessment record."""
    try:
        if isinstance(data, str):
            data = frappe.parse_json(data)
        
        doc = frappe.new_doc("YMRS Assessment")
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
                "response": resp.get("response"),
                "score": score,
            })
        
        doc.total_score = total_score
        
        # Determine severity based on total score
        if total_score <= 12:
            doc.severity = "No Mania"
        elif total_score <= 19:
            doc.severity = "Hypomania"
        elif total_score <= 25:
            doc.severity = "Mild Mania"
        elif total_score <= 37:
            doc.severity = "Moderate Mania"
        else:
            doc.severity = "Severe Mania"
        
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
        return {"success": True, "name": doc.name}
    except Exception as e:
        frappe.logger().error(f"Error creating YMRS assessment: {str(e)}")
        return {"success": False, "message": str(e)}


@frappe.whitelist()
def get_ymrs_assessments(patient=None, search=None):
    """Fetch YMRS assessments with optional filters."""
    filters = []
    if patient:
        filters.append(["patient", "=", patient])
    if search:
        filters.append(["patient_name", "like", f"%{search}%"])
    
    assessments = frappe.get_list(
        "YMRS Assessment",
        fields=[
            "name", "patient", "patient_name", "assessment_date",
            "template", "total_score", "severity", "docstatus", "notes"
        ],
        filters=filters,
        limit=50,
        order_by="assessment_date desc"
    )
    
    return assessments
