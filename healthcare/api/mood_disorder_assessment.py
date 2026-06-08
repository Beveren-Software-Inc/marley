
import frappe
from frappe import _

from healthcare.api.assessment_portal_utils import (
	apply_care_context_fields,
	ensure_assessment_read_permission,
	get_default_assessment_template,
	list_assessment_templates,
	list_assessments,
)

ASSESSMENT_DOCTYPE = "Mood Disorder Assessment"
TEMPLATE_DOCTYPE = "Mood Disorder Template"


def _serialize_mood_disorder_assessment(doc) -> dict:
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
			"question": r.question,
			"response": r.response,
			"score": r.score,
			"category": r.category,
		}
		for r in (doc.responses or [])
	]
	return row


@frappe.whitelist()
def get_mood_disorder_assessment(name: str | None = None):
	"""Return one Mood Disorder Assessment for the healthcare portal."""
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Mood Disorder Assessment is required"))

	doc = ensure_assessment_read_permission(ASSESSMENT_DOCTYPE, name)
	return _serialize_mood_disorder_assessment(doc)


@frappe.whitelist()
def get_mood_disorder_assessment_templates(search: str | None = None) -> list:
	"""List Mood Disorder Templates for the portal."""
	return list_assessment_templates(TEMPLATE_DOCTYPE, search)


@frappe.whitelist()
def get_default_mood_disorder_assessment_template() -> dict | None:
	"""Return the default Mood Disorder Template, if any."""
	return get_default_assessment_template(TEMPLATE_DOCTYPE)


@frappe.whitelist()
def get_mood_disorder_template_questions(template_name):
	"""Return question list for a Mood Disorder Template."""
	if not template_name:
		return {"name": "", "template_name": "", "questions": []}

	try:
		tmpl = frappe.get_doc(TEMPLATE_DOCTYPE, template_name, ignore_permissions=True)
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

		doc = frappe.new_doc(ASSESSMENT_DOCTYPE)
		for field in ("patient", "assessment_date", "template", "description"):
			if data.get(field) is not None:
				setattr(doc, field, data[field])
		apply_care_context_fields(doc, data)

		q1_yes_count = 0
		for resp in data.get("responses", []):
			score = resp.get("score", 0)
			response_value = resp.get("response", "")

			if resp.get("category") == "1" and response_value == "Yes":
				q1_yes_count += 1

			doc.append("responses", {
				"question": resp.get("question"),
				"response": response_value,
				"score": score,
				"category": resp.get("category"),
			})

		doc.q1_yes_count = q1_yes_count
		doc.further_assessment = "Warranted" if q1_yes_count >= 7 else "Not Warranted"

		doc.insert(ignore_permissions=True)
		frappe.db.commit()
		return {"success": True, "name": doc.name}
	except Exception as e:
		frappe.logger().error(f"Error creating mood disorder assessment: {str(e)}")
		return {"success": False, "message": str(e)}


@frappe.whitelist()
def get_mood_disorder_assessments(
	patient=None, practitioner=None, date_from=None, date_to=None, search=None
):
	"""Fetch Mood Disorder assessments with optional filters."""
	return list_assessments(
		ASSESSMENT_DOCTYPE,
		patient=patient,
		practitioner=practitioner,
		date_from=date_from,
		date_to=date_to,
		fields=[
			"name", "patient", "patient_name", "assessment_date",
			"practitioner", "practitioner_name",
			"template", "q1_yes_count", "further_assessment", "docstatus",
		],
	)
