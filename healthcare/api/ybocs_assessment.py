# healthcare/api/ybocs_assessment_api.py

import frappe

@frappe.whitelist()
def get_ybocs_template_questions(template_name):
    """Return question list for a YBOCS Template.
    
    Returns:
        {
            "name": str,
            "template_name": str,
            "description": str | None,
            "questions": [
                {
                    "question_no": int,
                    "section": str,
                    "question": str,
                    "option_0": str,
                    "option_1": str,
                    "option_2": str,
                    "option_3": str,
                    "option_4": str
                }
            ]
        }
    """
    if not template_name:
        return {"name": "", "template_name": "", "questions": []}
    
    try:
        tmpl = frappe.get_doc("YBOCS Template", template_name)
        questions = []
        for idx, q in enumerate(tmpl.questions or [], start=1):
            questions.append({
                "question_no": idx,
                "section": q.section,
                "question": q.question,
                "option_0": q.option_0,
                "option_1": q.option_1,
                "option_2": q.option_2,
                "option_3": q.option_3,
                "option_4": q.option_4,
            })
        return {
            "name": tmpl.name,
            "template_name": tmpl.template_name,
            "description": tmpl.description or None,
            "questions": questions,
        }
    except Exception as e:
        frappe.logger().error(f"get_ybocs_template_questions error: {e}")
        return {"name": template_name, "template_name": template_name, "questions": []}


@frappe.whitelist()
def create_ybocs_assessment(data):
    """Create a new YBOCS Assessment record."""
    try:
        if isinstance(data, str):
            data = frappe.parse_json(data)
        
        doc = frappe.new_doc("YBOCS Assessment")
        doc.patient = data.get("patient")
        doc.assessment_date = data.get("assessment_date")
        doc.template = data.get("template")
        doc.notes = data.get("notes")
        
        # Calculate scores
        total_obsessions = 0
        total_compulsions = 0
        total_score = 0
        responses = data.get("responses", [])
        
        for resp in responses:
            score = resp.get("score", 0)
            total_score += score
            
            if resp.get("section") == "Obsessions":
                total_obsessions += score
            else:
                total_compulsions += score
            
            doc.append("responses", {
                "question_no": resp.get("question_no"),
                "section": resp.get("section"),
                "question": resp.get("question"),
                "response": str(resp.get("response", "")),
                "score": score,
            })
        
        doc.total_obsessions = total_obsessions
        doc.total_compulsions = total_compulsions
        doc.total_score = total_score
        
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
        return {"success": True, "name": doc.name}
    except Exception as e:
        frappe.logger().error(f"Error creating YBOCS assessment: {str(e)}")
        return {"success": False, "message": str(e)}


@frappe.whitelist()
def get_ybocs_assessments(patient=None, search=None):
    """Fetch YBOCS assessments with optional filters."""
    filters = []
    if patient:
        filters.append(["patient", "=", patient])
    if search:
        filters.append(["patient_name", "like", f"%{search}%"])
    
    assessments = frappe.get_list(
        "YBOCS Assessment",
        fields=[
            "name", "patient", "patient_name", "assessment_date",
            "template", "total_score", "total_obsessions", "total_compulsions", "docstatus"
        ],
        filters=filters,
        limit=50,
        order_by="assessment_date desc"
    )
    
    return assessments