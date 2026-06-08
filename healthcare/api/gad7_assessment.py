
import frappe
from frappe import _

from healthcare.api.assessment_portal_utils import (
	apply_care_context_fields,
	ensure_assessment_read_permission,
	get_default_assessment_template,
	list_assessment_templates,
	list_assessments,
)

ASSESSMENT_DOCTYPE = "GAD7 Assessment"
TEMPLATE_DOCTYPE = "GAD7 Template"


def _serialize_gad7_assessment(doc) -> dict:
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
			"question_type": r.question_type,
			"response": r.response,
			"score": r.score,
		}
		for r in (doc.responses or [])
	]
	return row


@frappe.whitelist()
def get_gad7_assessment(name: str | None = None):
	"""Return one GAD7 Assessment for the healthcare portal."""
	name = (name or "").strip()
	if not name:
		frappe.throw(_("GAD7 Assessment is required"))

	doc = ensure_assessment_read_permission(ASSESSMENT_DOCTYPE, name)
	return _serialize_gad7_assessment(doc)


@frappe.whitelist()
def get_gad7_assessment_templates(search: str | None = None) -> list:
	"""List GAD7 Templates for the portal."""
	return list_assessment_templates(TEMPLATE_DOCTYPE, search)


@frappe.whitelist()
def get_default_gad7_assessment_template() -> dict | None:
	"""Return the default GAD7 Template, if any."""
	return get_default_assessment_template(TEMPLATE_DOCTYPE)


@frappe.whitelist()
def get_gad7_template_questions(template_name):
	"""Return question list for a GAD7 Template."""
	if not template_name:
		return {"name": "", "template_name": "", "questions": []}

	try:
		tmpl = frappe.get_doc(TEMPLATE_DOCTYPE, template_name, ignore_permissions=True)
		questions = []
		for q in (tmpl.questions or []):
			questions.append({
				"question_no": q.question_no,
				"question": q.question,
				"question_type": q.question_type,
				"response_options": q.response_options,
			})
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

		doc = frappe.new_doc(ASSESSMENT_DOCTYPE)
		for field in ("patient", "assessment_date", "template"):
			if data.get(field) is not None:
				setattr(doc, field, data[field])
		apply_care_context_fields(doc, data)

		total_score = 0
		for resp in data.get("responses", []):
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
def get_gad7_assessments(
	patient=None, practitioner=None, date_from=None, date_to=None, search=None
):
	"""Fetch GAD7 assessments with optional filters."""
	return list_assessments(
		ASSESSMENT_DOCTYPE,
		patient=patient,
		practitioner=practitioner,
		date_from=date_from,
		date_to=date_to,
		fields=[
			"name", "patient", "patient_name", "assessment_date",
			"practitioner", "practitioner_name",
			"template", "total_score", "severity", "docstatus",
		],
	)
