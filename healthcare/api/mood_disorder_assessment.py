
import frappe

@frappe.whitelist()
def get_mood_disorder_template_questions(template_name):
    """Return question list for a Mood Disorder Template.
    
    Returns:
        {
            "name": str,
            "template_name": str,
            "description": str | None,
            "questions": [
                {
                    "question": str,
                    "response_type": str,
                    "response_options": str,
                    "category": str
                }
            ]
        }
    """
    if not template_name:
        return {"name": "", "template_name": "", "questions": []}
    
    try:
        tmpl = frappe.get_doc("Mood Disorder Template", template_name)
        questions = []
        for idx, q in enumerate(tmpl.questions or [], start=1):
            questions.append({
                "question_no": idx,
                "question": q.question,
                "response_type": q.response_type,
                "response_options": q.response_options,
                "category": q.category,
            })
        return {
            "name": tmpl.name,
            "template_name": tmpl.template_name,
            "description": tmpl.description or None,
            "questions": questions,
        }
    except Exception as e:
        frappe.logger().error(f"get_mood_disorder_template_questions error: {e}")
        return {"name": template_name, "template_name": template_name, "questions": []}


@frappe.whitelist()
def create_mood_disorder_assessment(data):
    """Create a new Mood Disorder Assessment record."""
    try:
        if isinstance(data, str):
            data = frappe.parse_json(data)
        
        doc = frappe.new_doc("Mood Disorder Assessment")
        doc.patient = data.get("patient")
        doc.assessment_date = data.get("assessment_date")
        doc.template = data.get("template")
        doc.description = data.get("description")
        
        # Calculate scores and counts
        q1_yes_count = 0
        responses = data.get("responses", [])
        
        for resp in responses:
            score = resp.get("score", 0)
            response_value = resp.get("response", "")
            
            # Count Yes responses for Q1 (category 1 questions)
            if resp.get("category") == "1" and response_value == "Yes":
                q1_yes_count += 1
            
            doc.append("responses", {
                "question": resp.get("question"),
                "response": response_value,
                "score": score,
                "category": resp.get("category"),
            })
        
        doc.q1_yes_count = q1_yes_count
        
        # Determine if further assessment is warranted
        # Criteria: 7+ Yes responses in category 1 AND functional impairment
        # For now, using simple threshold of 7+ Yes in category 1
        if q1_yes_count >= 7:
            doc.further_assessment = "Warranted"
        else:
            doc.further_assessment = "Not Warranted"
        
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
        return {"success": True, "name": doc.name}
    except Exception as e:
        frappe.logger().error(f"Error creating mood disorder assessment: {str(e)}")
        return {"success": False, "message": str(e)}


@frappe.whitelist()
def get_mood_disorder_assessments(patient=None, search=None):
    """Fetch Mood Disorder assessments with optional filters."""
    filters = []
    if patient:
        filters.append(["patient", "=", patient])
    if search:
        filters.append(["patient_name", "like", f"%{search}%"])
    
    assessments = frappe.get_list(
        "Mood Disorder Assessment",
        fields=[
            "name", "patient", "patient_name", "assessment_date",
            "template", "q1_yes_count", "further_assessment", "docstatus"
        ],
        filters=filters,
        limit=50,
        order_by="assessment_date desc"
    )
    
    return assessments