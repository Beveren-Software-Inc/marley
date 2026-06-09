# healthcare/api/suicidal_assessment.py
import frappe
from frappe import _

from healthcare.api.assessment_portal_utils import (
	ensure_assessment_read_permission,
	ensure_assessment_portal_write_access,
	user_can_read_assessment_portal,
)

ASSESSMENT_DOCTYPE = "Suicidal Patient Assessment"
DEFAULT_NAMING_SERIES = "SPA-.YYYY.-"


def _apply_suicidal_assessment_data(doc, data: dict):
	meta = doc.meta
	skip = {"doctype", "name", "__islocal", "__unsaved", "amended_from"}
	for fieldname, value in data.items():
		if fieldname in skip or value is None:
			continue
		if meta.has_field(fieldname):
			setattr(doc, fieldname, value)

	if not doc.get("naming_series"):
		doc.naming_series = DEFAULT_NAMING_SERIES


def _practitioner_display_name(practitioner: str | None) -> str | None:
	if not practitioner:
		return None
	return frappe.db.get_value("Healthcare Practitioner", practitioner, "practitioner_name")


def _serialize_suicidal_assessment(doc) -> dict:
	row = doc.as_dict()
	if row.get("assessed_by") and not row.get("assessed_by_name"):
		row["assessed_by_name"] = _practitioner_display_name(row["assessed_by"])
	if row.get("practitioner") and not row.get("practitioner_name"):
		row["practitioner_name"] = _practitioner_display_name(row["practitioner"])
	return row


@frappe.whitelist()
def get_suicidal_assessments(
	patient=None,
	admission=None,
	practitioner=None,
	date_from=None,
	date_to=None,
	limit=50,
	offset=0,
):
	"""Get list of Suicidal Patient Assessments."""
	filters = {}

	if patient:
		filters["patient"] = patient

	if admission:
		filters["admission_no"] = admission

	if practitioner:
		filters["practitioner"] = practitioner

	if date_from and date_to:
		filters["assessment_date"] = ["between", [date_from, date_to]]
	elif date_from:
		filters["assessment_date"] = [">=", date_from]
	elif date_to:
		filters["assessment_date"] = ["<=", date_to]

	from healthcare.api.common import get_permitted_cost_centers

	permitted_cc = get_permitted_cost_centers()
	if permitted_cc is not None:
		if not permitted_cc:
			return []
		filters["cost_center"] = ["in", permitted_cc]

	ignore_permissions = user_can_read_assessment_portal()

	assessments = frappe.get_all(
		ASSESSMENT_DOCTYPE,
		filters=filters,
		fields=[
			"name",
			"admission_no",
			"patient",
			"patient_name",
			"assessment_date",
			"assessed_by",
			"practitioner",
			"practitioner_name",
			"active_suicidal_thoughts_plans",
			"overwhelmed_thoughts_harming",
			"made_current_plans",
			"previous_attempts",
			"creation",
			"modified",
		],
		limit=int(limit),
		limit_start=int(offset),
		order_by="assessment_date desc, creation desc",
		ignore_permissions=ignore_permissions,
	)

	for assessment in assessments:
		if assessment.assessed_by and not assessment.get("assessed_by_name"):
			assessment.assessed_by_name = _practitioner_display_name(assessment.assessed_by)
		if assessment.practitioner and not assessment.get("practitioner_name"):
			assessment.practitioner_name = _practitioner_display_name(assessment.practitioner)

	return assessments


@frappe.whitelist()
def get_suicidal_patient_assessment(name: str | None = None):
	"""Fetch a single Suicidal Patient Assessment."""
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Suicidal Patient Assessment is required"))
	doc = ensure_assessment_read_permission(ASSESSMENT_DOCTYPE, name)
	return _serialize_suicidal_assessment(doc)


@frappe.whitelist()
def create_suicidal_patient_assessment(data):
	"""Create a Suicidal Patient Assessment from the healthcare portal."""
	try:
		if isinstance(data, str):
			data = frappe.parse_json(data)

		ensure_assessment_portal_write_access(ASSESSMENT_DOCTYPE)

		doc = frappe.new_doc(ASSESSMENT_DOCTYPE)
		_apply_suicidal_assessment_data(doc, data or {})
		if doc.get("practitioner") and not doc.get("practitioner_name"):
			doc.practitioner_name = _practitioner_display_name(doc.practitioner)
		doc.insert(ignore_permissions=True)
		frappe.db.commit()
		return {"success": True, "name": doc.name}
	except Exception as e:
		frappe.logger().error(f"Error creating suicidal patient assessment: {str(e)}")
		return {"success": False, "message": str(e)}
