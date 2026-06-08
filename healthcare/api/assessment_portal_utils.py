"""Shared helpers for portal scale/assessment APIs."""

import frappe
from frappe import _

ASSESSMENT_PORTAL_READ_ROLES = frozenset(
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


def user_can_read_assessment_portal() -> bool:
	if frappe.session.user in ("Guest", ""):
		return False
	return bool(ASSESSMENT_PORTAL_READ_ROLES & set(frappe.get_roles(frappe.session.user)))


def ensure_assessment_portal_write_access(assessment_doctype: str) -> None:
	"""Allow portal clinical roles to create via whitelisted APIs."""
	if frappe.session.user in ("Guest", ""):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if user_can_read_assessment_portal():
		return
	if frappe.has_permission(assessment_doctype, "create"):
		return
	frappe.throw(_("Not permitted to create {0}").format(assessment_doctype), frappe.PermissionError)


def ensure_assessment_read_permission(assessment_doctype: str, name: str):
	if not frappe.db.exists(assessment_doctype, name):
		frappe.throw(_("{0} {1} not found").format(assessment_doctype, name))

	doc = frappe.get_doc(assessment_doctype, name)
	if not frappe.has_permission(assessment_doctype, "read", doc=doc):
		if not user_can_read_assessment_portal():
			frappe.throw(_("Not permitted to read {0}").format(assessment_doctype), frappe.PermissionError)
	return doc


def apply_care_context_fields(doc, data: dict):
	for field in ("practitioner", "inpatient_admission", "patient_visit", "notes"):
		if data.get(field) is not None:
			setattr(doc, field, data[field] or None)

	if doc.get("practitioner") and doc.meta.has_field("practitioner_name") and not doc.get("practitioner_name"):
		doc.practitioner_name = frappe.db.get_value(
			"Healthcare Practitioner",
			doc.practitioner,
			"practitioner_name",
		)

	# Legacy field names on some assessments
	if data.get("practitioner") and doc.meta.has_field("clinician") and not doc.get("clinician"):
		doc.clinician = data["practitioner"]
	if data.get("practitioner") and doc.meta.has_field("rater") and not doc.get("rater"):
		doc.rater = data["practitioner"]


def enrich_assessment_row(row: dict) -> dict:
	if row.get("patient") and not row.get("patient_name"):
		row["patient_name"] = frappe.db.get_value("Patient", row["patient"], "patient_name")
	if row.get("practitioner") and not row.get("practitioner_name"):
		row["practitioner_name"] = frappe.db.get_value(
			"Healthcare Practitioner",
			row["practitioner"],
			"practitioner_name",
		)
	return row


def list_assessment_templates(
	template_doctype: str,
	search: str | None = None,
	label_field: str = "template_name",
) -> list[dict]:
	filters = {}
	if search and search.strip():
		filters[label_field] = ["like", f"%{search.strip()}%"]

	fields = ["name", label_field, "description"]
	if frappe.get_meta(template_doctype).has_field("default"):
		fields.append("default")

	rows = frappe.get_all(
		template_doctype,
		filters=filters,
		fields=fields,
		order_by="default desc, modified desc" if "default" in fields else f"{label_field} asc",
		limit_page_length=50,
	)
	result = []
	for row in rows:
		result.append(
			{
				"name": row.name,
				"label": getattr(row, label_field, None) or row.name,
				"description": row.description or None,
				"default": bool(getattr(row, "default", 0)) if "default" in fields else False,
			}
		)
	return result


def get_default_assessment_template(template_doctype: str, label_field: str = "template_name") -> dict | None:
	meta = frappe.get_meta(template_doctype)
	if meta.has_field("default"):
		default_name = frappe.db.get_value(
			template_doctype,
			{"default": 1},
			"name",
			order_by="modified desc",
		)
		if default_name:
			return _template_row(template_doctype, default_name, label_field)

	rows = frappe.get_all(
		template_doctype,
		fields=["name"],
		order_by="modified desc",
		limit_page_length=1,
	)
	if not rows:
		return None
	return _template_row(template_doctype, rows[0].name, label_field)


def _template_row(template_doctype: str, name: str, label_field: str) -> dict:
	doc = frappe.get_doc(template_doctype, name, ignore_permissions=True)
	return {
		"name": doc.name,
		"label": getattr(doc, label_field, None) or doc.name,
		"description": getattr(doc, "description", None) or None,
		"default": bool(getattr(doc, "default", 0)),
	}


STANDARD_ASSESSMENT_LIST_FIELDS = frozenset(
	{"name", "docstatus", "creation", "modified", "owner", "idx"}
)


def list_assessments(
	assessment_doctype: str,
	patient: str | None = None,
	practitioner: str | None = None,
	date_from: str | None = None,
	date_to: str | None = None,
	fields: list[str] | None = None,
	date_field: str = "assessment_date",
) -> list[dict]:
	filters = {}
	if patient:
		filters["patient"] = patient
	if practitioner:
		filters["practitioner"] = practitioner
	if date_from:
		filters[date_field] = [">=", date_from]
	if date_to:
		if date_field in filters:
			filters[date_field] = ["between", [date_from, date_to]]
		else:
			filters[date_field] = ["<=", date_to]

	if fields is None:
		fields = ["name", "patient", "patient_name", date_field, "docstatus"]
	else:
		meta = frappe.get_meta(assessment_doctype)
		valid_fieldnames = {f.fieldname for f in meta.fields} | STANDARD_ASSESSMENT_LIST_FIELDS
		fields = [field for field in fields if field in valid_fieldnames]
		if not fields:
			fields = ["name", "patient", "patient_name", date_field, "docstatus"]
		elif "name" not in fields:
			fields = ["name", *fields]

	ignore_permissions = user_can_read_assessment_portal()

	rows = frappe.get_all(
		assessment_doctype,
		filters=filters,
		fields=fields,
		order_by=f"{date_field} desc",
		limit_page_length=50,
		ignore_permissions=ignore_permissions,
	)
	return [enrich_assessment_row(dict(row)) for row in rows]
