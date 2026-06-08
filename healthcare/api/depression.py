
import frappe
from frappe import _

from healthcare.api.assessment_portal_utils import (
	apply_care_context_fields,
	ensure_assessment_read_permission,
	get_default_assessment_template,
	list_assessment_templates,
	list_assessments,
)

ASSESSMENT_DOCTYPE = "Depression Assessment"
TEMPLATE_DOCTYPE = "Depression Assessment Template"


def _serialize_depression_assessment(doc) -> dict:
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
			"option_0": r.option_0,
			"option_1": r.option_1,
			"option_2": r.option_2,
			"option_3": r.option_3,
			"response": r.response,
			"score": r.score,
		}
		for r in (doc.responses or [])
	]
	return row


@frappe.whitelist()
def get_depression_assessment(name: str | None = None):
	"""Return one Depression Assessment for the healthcare portal."""
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Depression Assessment is required"))

	doc = ensure_assessment_read_permission(ASSESSMENT_DOCTYPE, name)
	return _serialize_depression_assessment(doc)


@frappe.whitelist()
def get_depression_assessment_templates(search: str | None = None) -> list:
	"""List Depression Assessment Templates for the portal."""
	return list_assessment_templates(TEMPLATE_DOCTYPE, search)


@frappe.whitelist()
def get_default_depression_assessment_template() -> dict | None:
	"""Return the default Depression Assessment Template, if any."""
	return get_default_assessment_template(TEMPLATE_DOCTYPE)


@frappe.whitelist()
def get_depression_template_questions(template_name):
	"""Return question list for a Depression Assessment Template."""
	if not template_name:
		return {"name": "", "template_name": "", "questions": []}

	try:
		tmpl = frappe.get_doc(TEMPLATE_DOCTYPE, template_name, ignore_permissions=True)
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

		doc = frappe.new_doc(ASSESSMENT_DOCTYPE)
		for field in ("patient", "assessment_date", "template"):
			if data.get(field) is not None:
				setattr(doc, field, data[field])
		apply_care_context_fields(doc, data)

		total_score = 0
		for resp in data.get("responses", []):
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
def get_depression_assessments(
	patient=None, practitioner=None, date_from=None, date_to=None, search=None
):
	"""Fetch Depression assessments with optional filters."""
	return list_assessments(
		ASSESSMENT_DOCTYPE,
		patient=patient,
		practitioner=practitioner,
		date_from=date_from,
		date_to=date_to,
		fields=[
			"name", "patient", "patient_name", "assessment_date",
			"practitioner", "practitioner_name",
			"template", "total_score", "level_of_depression", "docstatus",
		],
	)
