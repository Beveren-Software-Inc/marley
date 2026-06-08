# healthcare/api/phq9_assessment_api.py

import frappe
from frappe import _

from healthcare.api.assessment_portal_utils import (
	apply_care_context_fields,
	ensure_assessment_read_permission,
	get_default_assessment_template,
	list_assessment_templates,
	list_assessments,
)


def _serialize_phq9_assessment(doc) -> dict:
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
			"question_type": r.question_type,
			"response": r.response,
			"score": r.score,
		}
		for r in (doc.responses or [])
	]
	return row


@frappe.whitelist()
def get_phq9_assessment_templates(search: str | None = None) -> list:
	return list_assessment_templates("PHQ9 Template", search)


@frappe.whitelist()
def get_default_phq9_assessment_template() -> dict | None:
	return get_default_assessment_template("PHQ9 Template")


@frappe.whitelist()
def get_phq9_assessment(name: str | None = None):
	name = (name or "").strip()
	if not name:
		frappe.throw(_("PHQ9 Assessment is required"))
	doc = ensure_assessment_read_permission("PHQ9 Assessment", name)
	return _serialize_phq9_assessment(doc)


@frappe.whitelist()
def get_phq9_template_questions(template_name):
	"""Return question list for a PHQ9 Template."""
	if not template_name:
		return {"name": "", "template_name": "", "questions": []}

	try:
		tmpl = frappe.get_doc("PHQ9 Template", template_name, ignore_permissions=True)
		questions = []
		for idx, q in enumerate(tmpl.questions or [], start=1):
			questions.append({
				"question_no": idx,
				"question": q.question,
				"question_type": q.question_type,
				"response_options": q.response_options,
			})
		return {
			"name": tmpl.name,
			"template_name": tmpl.template_name,
			"description": tmpl.description or None,
			"questions": questions,
		}
	except Exception as e:
		frappe.logger().error(f"get_phq9_template_questions error: {e}")
		return {"name": template_name, "template_name": template_name, "questions": []}


@frappe.whitelist()
def create_phq9_assessment(data):
	"""Create a new PHQ9 Assessment record."""
	try:
		if isinstance(data, str):
			data = frappe.parse_json(data)

		doc = frappe.new_doc("PHQ9 Assessment")
		doc.patient = data.get("patient")
		doc.assessment_date = data.get("assessment_date")
		doc.template = data.get("template")
		apply_care_context_fields(doc, data)

		total_score = 0
		for resp in data.get("responses", []):
			score = resp.get("score", 0)
			total_score += score
			doc.append("responses", {
				"question": resp.get("question"),
				"question_type": resp.get("question_type"),
				"response": resp.get("response"),
				"score": score,
			})

		doc.total_score = total_score

		if total_score <= 4:
			doc.severity = "Minimal"
		elif total_score <= 9:
			doc.severity = "Mild"
		elif total_score <= 14:
			doc.severity = "Moderate"
		elif total_score <= 19:
			doc.severity = "Moderately Severe"
		else:
			doc.severity = "Severe"

		doc.insert(ignore_permissions=True)
		frappe.db.commit()
		return {"success": True, "name": doc.name}
	except Exception as e:
		frappe.logger().error(f"Error creating PHQ9 assessment: {str(e)}")
		return {"success": False, "message": str(e)}


@frappe.whitelist()
def get_phq9_assessments(
	patient=None, practitioner=None, date_from=None, date_to=None, search=None
):
	"""Fetch PHQ9 assessments with optional filters."""
	return list_assessments(
		"PHQ9 Assessment",
		patient=patient,
		practitioner=practitioner,
		date_from=date_from,
		date_to=date_to,
		fields=[
			"name", "patient", "patient_name", "assessment_date",
			"practitioner", "practitioner_name",
			"template", "total_score", "severity", "docstatus", "notes",
			"inpatient_admission", "patient_visit",
		],
	)
