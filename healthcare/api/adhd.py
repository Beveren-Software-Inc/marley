
"""
healthcare/api/adhd_assessment.py

Whitelisted API methods for the ADHD Assessment module.
Wire these into healthcare/api/common.py or call them directly.
"""

import frappe


@frappe.whitelist()
def get_adhd_template_questions(template_name):
    """Return question list for an ADHD Assessment Template.

    Returns:
        {
            "name": str,
            "template_name": str,
            "description": str | None,
            "footer_description": str | None,
            "questions": [
                {"question_no": int, "question": str, "part": "Part A"|"Part B"}
            ]
        }
    """
    if not template_name:
        return {"name": "", "template_name": "", "questions": []}

    try:
        tmpl = frappe.get_doc("ADHD Assessment Template", template_name)
        questions = []
        for q in (tmpl.questions or []):
            questions.append({
                "question_no": q.question_no,
                "question": q.question,
                "part": q.part,
            })
        # Sort by part then question number for consistent ordering
        questions.sort(key=lambda x: (x["part"], x["question_no"]))
        return {
            "name": tmpl.name,
            "template_name": tmpl.template_name,
            "description": tmpl.description or None,
            "footer_description": tmpl.footer_description or None,
            "questions": questions,
        }
    except Exception as e:
        frappe.logger().error(f"get_adhd_template_questions error: {e}")
        return {"name": template_name, "template_name": template_name, "questions": []}


@frappe.whitelist()
def create_adhd_assessment(data):
    """Create a new ADHD Assessment record.

    Expected input (JSON string):
        {
            "patient": str,
            "assessment_date": str,   # YYYY-MM-DD
            "template": str,
            "notes": str | None,
            "responses": [
                {
                    "question_no": int,
                    "question": str,
                    "part": "Part A"|"Part B",
                    "response": "Never"|"Rarely"|"Sometimes"|"Often"|"Very Often" | None,
                    "score": int,          # 0 or 1 (computed on frontend)
                    "is_positive": bool,   # True when Part A & score==1
                }
            ]
        }

    Returns:
        {"success": True, "name": str}  or  {"success": False, "message": str}
    """
    try:
        if isinstance(data, str):
            data = frappe.parse_json(data)

        doc = frappe.new_doc("ADHD Assessment")
        doc.naming_series = "ADHD-.#####"

        # Header fields
        for field in ["patient", "assessment_date", "template", "notes"]:
            if data.get(field) is not None:
                setattr(doc, field, data[field])

        # Response rows
        response_score_map = {
            "Never": 0,
            "Rarely": 0,
            "Sometimes": 0,
            "Often": 1,
            "Very Often": 1,
        }

        positive_count = 0
        for row in (data.get("responses") or []):
            response_val = row.get("response") or ""
            score = response_score_map.get(response_val, 0)
            part = row.get("part", "")
            is_positive = 1 if (part == "Part A" and score == 1) else 0
            if is_positive:
                positive_count += 1

            doc.append("responses", {
                "question_no": row.get("question_no"),
                "question": row.get("question"),
                "part": part,
                "response": response_val or None,
                "score": score,
                "is_positive": is_positive,
            })

        # Compute summary fields (read_only, set programmatically)
        doc.positive_count = positive_count
        doc.result = "Positive" if positive_count >= 4 else "Negative"

        doc.insert(ignore_permissions=True)
        frappe.db.commit()

        return {"success": True, "name": doc.name}

    except Exception as e:
        frappe.logger().error(f"create_adhd_assessment error: {e}")
        return {"success": False, "message": str(e)}