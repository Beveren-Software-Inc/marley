# healthcare/api/ybocs_assessment_api.py

import frappe
from frappe import _

from healthcare.api.assessment_portal_utils import (
	apply_care_context_fields,
	ensure_assessment_read_permission,
	get_default_assessment_template,
	list_assessment_templates,
	list_assessments,
)


def _serialize_ybocs_assessment(doc) -> dict:
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
			"section": r.section,
			"question": r.question,
			"response": r.response,
			"score": r.score,
		}
		for r in (doc.responses or [])
	]
	return row


@frappe.whitelist()
def get_ybocs_assessment_templates(search: str | None = None) -> list:
	return list_assessment_templates("YBOCS Template", search)


@frappe.whitelist()
def get_default_ybocs_assessment_template() -> dict | None:
	return get_default_assessment_template("YBOCS Template")


@frappe.whitelist()
def get_ybocs_assessment(name: str | None = None):
	name = (name or "").strip()
	if not name:
		frappe.throw(_("YBOCS Assessment is required"))
	doc = ensure_assessment_read_permission("YBOCS Assessment", name)
	return _serialize_ybocs_assessment(doc)


@frappe.whitelist()
def get_ybocs_template_questions(template_name):
	"""Return question list for a YBOCS Template."""
	if not template_name:
		return {"name": "", "template_name": "", "questions": []}

	try:
		tmpl = frappe.get_doc("YBOCS Template", template_name, ignore_permissions=True)
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
		apply_care_context_fields(doc, data)

		total_obsessions = 0
		total_compulsions = 0
		total_score = 0

		for resp in data.get("responses", []):
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
def get_ybocs_assessments(
	patient=None, practitioner=None, date_from=None, date_to=None, search=None
):
	"""Fetch YBOCS assessments with optional filters."""
	return list_assessments(
		"YBOCS Assessment",
		patient=patient,
		practitioner=practitioner,
		date_from=date_from,
		date_to=date_to,
		fields=[
			"name", "patient", "patient_name", "assessment_date",
			"practitioner", "practitioner_name",
			"template", "total_score", "total_obsessions", "total_compulsions", "docstatus",
			"inpatient_admission", "patient_visit",
		],
	)
