import frappe
from frappe import _

from healthcare.api.assessment_portal_utils import (
	apply_care_context_fields,
	ensure_assessment_read_permission,
	enrich_assessment_row,
	get_default_assessment_template,
	list_assessment_templates,
	list_assessments,
)


def _ymrs_child_table_field(doc) -> str:
	if doc.meta.has_field("responses"):
		return "responses"
	if doc.meta.has_field("questions"):
		return "questions"
	return "responses"


def _serialize_ymrs_assessment(doc) -> dict:
	row = enrich_assessment_row(doc.as_dict())
	child_field = _ymrs_child_table_field(doc)
	rows = getattr(doc, child_field, None) or []
	question_rows = [
		{
			"question_no": r.question_no,
			"question": r.question,
			"response": r.response,
			"score": r.score,
		}
		for r in rows
	]
	row["responses"] = question_rows
	row["questions"] = question_rows

	if not row.get("severity") and row.get("total_score") is not None:
		score = float(row["total_score"])
		if score <= 12:
			row["severity"] = "No Mania"
		elif score <= 19:
			row["severity"] = "Hypomania"
		elif score <= 25:
			row["severity"] = "Mild Mania"
		elif score <= 37:
			row["severity"] = "Moderate Mania"
		else:
			row["severity"] = "Severe Mania"

	return row


@frappe.whitelist()
def get_ymrs_assessment_templates(search: str | None = None) -> list:
	return list_assessment_templates("YMRS Template", search)


@frappe.whitelist()
def get_default_ymrs_assessment_template() -> dict | None:
	return get_default_assessment_template("YMRS Template")


@frappe.whitelist()
def get_ymrs_assessment(name: str | None = None):
	name = (name or "").strip()
	if not name:
		frappe.throw(_("YMRS Assessment is required"))
	doc = ensure_assessment_read_permission("YMRS Assessment", name)
	return _serialize_ymrs_assessment(doc)


@frappe.whitelist()
def get_ymrs_template_questions(template_name):
	"""Return question list for a YMRS Template."""
	if not template_name:
		return {"name": "", "template_name": "", "questions": []}

	try:
		tmpl = frappe.get_doc("YMRS Template", template_name, ignore_permissions=True)
		questions = []
		for q in (tmpl.questions or []):
			options = []
			for i in range(0, 9):
				option_field = f"option_{i}"
				option_text = getattr(q, option_field, "")
				if option_text:
					options.append({"score": i, "text": option_text})

			questions.append({
				"question_no": q.question_no,
				"question": q.question,
				"max_score": q.max_score,
				"options": options,
			})
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
		apply_care_context_fields(doc, data)

		total_score = 0
		child_field = _ymrs_child_table_field(doc)
		for resp in data.get("responses", []):
			score = resp.get("score", 0)
			total_score += score
			doc.append(child_field, {
				"question_no": resp.get("question_no"),
				"question": resp.get("question"),
				"response": resp.get("response"),
				"score": score,
			})

		doc.total_score = total_score
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
def get_ymrs_assessments(
	patient=None, practitioner=None, date_from=None, date_to=None, search=None
):
	"""Fetch YMRS assessments with optional filters."""
	return list_assessments(
		"YMRS Assessment",
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
