
"""
healthcare/api/adhd_assessment.py

Whitelisted API methods for the ADHD Assessment module.
Wire these into healthcare/api/common.py or call them directly.
"""

import frappe
from frappe import _

from healthcare.api.assessment_portal_utils import list_assessments


ADHD_PORTAL_READ_ROLES = frozenset(
	{
		"Administrator",
		"System Manager",
		"Healthcare Administrator",
		"Doctor",
		"Nurse",
		"Nursing User",
		"Physician",
		"Psychologist",
		"Anesthesiologist",
		"Therapist",
		"Nutritionist",
	}
)


def _user_can_read_adhd_assessment_portal() -> bool:
	if frappe.session.user in ("Guest", ""):
		return False
	return bool(ADHD_PORTAL_READ_ROLES & set(frappe.get_roles(frappe.session.user)))


def _serialize_adhd_assessment(doc) -> dict:
	row = doc.as_dict()
	if row.get("patient") and not row.get("patient_name"):
		row["patient_name"] = frappe.db.get_value("Patient", row["patient"], "patient_name")
	if row.get("practitioner") and not row.get("practitioner_name"):
		row["practitioner_name"] = frappe.db.get_value(
			"Healthcare Practitioner",
			row["practitioner"],
			"practitioner_name",
		)
	row["responses"] = [
		{
			"question_no": r.question_no,
			"question": r.question,
			"part": r.part,
			"response": r.response,
			"score": r.score,
			"is_positive": bool(r.is_positive),
		}
		for r in (doc.responses or [])
	]
	return row


@frappe.whitelist()
def get_adhd_assessment(name: str | None = None):
	"""Return one ADHD Assessment for the healthcare portal (avoids REST DocPerm gaps)."""
	name = (name or "").strip()
	if not name:
		frappe.throw(_("ADHD Assessment is required"))

	if not frappe.db.exists("ADHD Assessment", name):
		frappe.throw(_("ADHD Assessment {0} not found").format(name))

	doc = frappe.get_doc("ADHD Assessment", name)

	if not frappe.has_permission("ADHD Assessment", "read", doc=doc):
		if not _user_can_read_adhd_assessment_portal():
			frappe.throw(_("Not permitted to read ADHD Assessment"), frappe.PermissionError)

	return _serialize_adhd_assessment(doc)


def _serialize_adhd_template(name: str) -> dict:
    doc = frappe.get_doc("ADHD Assessment Template", name, ignore_permissions=True)
    return {
        "name": doc.name,
        "label": doc.template_name or doc.name,
        "description": doc.description or None,
        "footer_description": doc.footer_description or None,
        "default": bool(doc.default),
    }


@frappe.whitelist()
def get_adhd_assessment_templates(search: str | None = None) -> list:
    """List ADHD Assessment Templates for the portal (avoids REST DocPerm gaps)."""
    filters = {}
    if search:
        filters["template_name"] = ["like", f"%{search.strip()}%"]

    rows = frappe.get_all(
        "ADHD Assessment Template",
        filters=filters,
        fields=["name", "template_name", "description", "footer_description", "default"],
        order_by="default desc, template_name asc",
        limit_page_length=50,
    )
    return [
        {
            "name": row.name,
            "label": row.template_name or row.name,
            "description": row.description or None,
            "footer_description": row.footer_description or None,
            "default": bool(row.default),
        }
        for row in rows
    ]


@frappe.whitelist()
def get_default_adhd_assessment_template() -> dict | None:
    """Return the ADHD Assessment Template marked Default, if any."""
    default_name = frappe.db.get_value(
        "ADHD Assessment Template",
        {"default": 1},
        "name",
        order_by="modified desc",
    )
    if not default_name:
        return None
    return _serialize_adhd_template(default_name)


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
        tmpl = frappe.get_doc("ADHD Assessment Template", template_name, ignore_permissions=True)
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
        for field in [
            "patient",
            "assessment_date",
            "template",
            "notes",
            "practitioner",
            "inpatient_admission",
            "patient_visit",
        ]:
            if data.get(field) is not None:
                setattr(doc, field, data[field])

        if doc.get("practitioner") and not doc.get("practitioner_name"):
            doc.practitioner_name = frappe.db.get_value(
                "Healthcare Practitioner",
                doc.practitioner,
                "practitioner_name",
            )

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


@frappe.whitelist()
def get_adhd_assessments(
	patient=None, practitioner=None, date_from=None, date_to=None, search=None
):
	"""Fetch ADHD assessments with optional filters (portal-safe list)."""
	return list_assessments(
		"ADHD Assessment",
		patient=patient,
		practitioner=practitioner,
		date_from=date_from,
		date_to=date_to,
		fields=[
			"name", "patient", "patient_name", "assessment_date",
			"practitioner", "practitioner_name",
			"template", "positive_count", "result", "docstatus", "notes",
			"inpatient_admission", "patient_visit",
		],
	)