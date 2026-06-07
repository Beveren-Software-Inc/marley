import frappe
from frappe import _
import json


def _serialize_checklist(doc) -> dict:
	details = [
		{
			"name": row.name,
			"item_name": row.item_name,
			"checked": bool(row.checked),
		}
		for row in getattr(doc, "environmental_checklist_detail", []) or []
	]

	return {
		"name": doc.name,
		"patient": doc.patient,
		"patient_name": doc.patient_name,
		"cost_center": doc.cost_center,
		"practitioner": doc.practitioner,
		"practitioner_name": doc.practitioner_name,
		"inpatient_admission": doc.inpatient_admission,
		"patient_visit": doc.patient_visit,
		"environmental_checklist_template": doc.environmental_checklist_template,
		"creation": doc.creation,
		"details": details,
		"completed_count": sum(1 for row in details if row["checked"]),
		"total_count": len(details),
	}


def _get_default_template_name() -> str | None:
	default_template = frappe.db.get_value(
		"Environmental Checklist Template",
		{"default": 1},
		"name",
	)
	if default_template:
		return default_template

	templates = frappe.get_all("Environmental Checklist Template", pluck="name", limit=1)
	return templates[0] if templates else None


def _apply_template_to_doc(doc, template_name: str | None = None) -> None:
	template = template_name or doc.environmental_checklist_template or _get_default_template_name()
	if not template:
		frappe.throw(_("Environmental Checklist Template is required"))

	tpl = frappe.get_doc("Environmental Checklist Template", template)
	doc.environmental_checklist_template = tpl.name
	doc.set("environmental_checklist_detail", [])

	for row in tpl.get("checklist_items", []) or []:
		if row and row.get("item_name"):
			doc.append(
				"environmental_checklist_detail",
				{
					"item_name": row.item_name,
					"checked": 0,
				},
			)


@frappe.whitelist()
def list_environmental_checklists(
	patient: str | None = None,
	limit: int = 50,
	date_from: str | None = None,
	date_to: str | None = None,
	inpatient_admission: str | None = None,
) -> list:
	filters = {}
	if patient:
		filters["patient"] = patient
	if inpatient_admission:
		filters["inpatient_admission"] = inpatient_admission
	if date_from and date_to:
		filters["creation"] = ["between", [date_from, f"{date_to} 23:59:59"]]
	elif date_from:
		filters["creation"] = [">=", date_from]
	elif date_to:
		filters["creation"] = ["<=", f"{date_to} 23:59:59"]

	records = frappe.get_all(
		"Environmental Checklist",
		filters=filters,
		fields=[
			"name",
			"patient",
			"patient_name",
			"cost_center",
			"practitioner",
			"practitioner_name",
			"inpatient_admission",
			"patient_visit",
			"environmental_checklist_template",
			"creation",
			"modified",
		],
		order_by="creation desc",
		limit_page_length=int(limit or 50),
	)

	for row in records:
		counts = frappe.db.sql(
			"""
			SELECT
				COUNT(*) AS total_count,
				SUM(checked) AS completed_count
			FROM `tabEnvironmental Checklist Detail`
			WHERE parent = %s
			""",
			row.name,
			as_dict=True,
		)
		row["total_count"] = int((counts[0].total_count if counts else 0) or 0)
		row["completed_count"] = int((counts[0].completed_count if counts else 0) or 0)

	return records


@frappe.whitelist()
def get_environmental_checklist(checklist_name: str) -> dict:
	if not checklist_name:
		frappe.throw(_("Environmental Checklist is required"))

	doc = frappe.get_doc("Environmental Checklist", checklist_name)
	return _serialize_checklist(doc)


@frappe.whitelist()
def get_default_environmental_checklist_template() -> dict | None:
	template_name = _get_default_template_name()
	if not template_name:
		return None

	doc = frappe.get_doc("Environmental Checklist Template", template_name)
	return {
		"name": doc.name,
		"default": bool(doc.default),
		"checklist_items": [
			{"item_name": item.item_name}
			for item in doc.get("checklist_items", []) or []
			if item and item.item_name
		],
	}


@frappe.whitelist()
def create_environmental_checklist(
	patient: str,
	inpatient_admission: str | None = None,
	patient_visit: str | None = None,
	template_name: str | None = None,
	cost_center: str | None = None,
	practitioner: str | None = None,
) -> dict:
	if not patient:
		frappe.throw(_("Patient is required"))

	doc = frappe.new_doc("Environmental Checklist")
	doc.patient = patient
	doc.inpatient_admission = inpatient_admission or None
	doc.patient_visit = patient_visit or None
	doc.cost_center = cost_center or None
	doc.practitioner = practitioner or None
	if practitioner:
		doc.practitioner_name = frappe.db.get_value(
			"Healthcare Practitioner", practitioner, "practitioner_name"
		)
	_apply_template_to_doc(doc, template_name)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()

	return _serialize_checklist(doc)


@frappe.whitelist()
def apply_environmental_checklist_template(checklist_name: str, template_name: str | None = None) -> dict:
	if not checklist_name:
		frappe.throw(_("Environmental Checklist is required"))

	doc = frappe.get_doc("Environmental Checklist", checklist_name)
	_apply_template_to_doc(doc, template_name)
	doc.save(ignore_permissions=True)
	frappe.db.commit()

	return _serialize_checklist(doc)


@frappe.whitelist()
def update_environmental_checklist(
	checklist_name: str,
	details=None,
	cost_center: str | None = None,
	practitioner: str | None = None,
) -> dict:
	if not checklist_name:
		frappe.throw(_("Environmental Checklist is required"))

	if details is not None and isinstance(details, str):
		try:
			details = json.loads(details)
		except Exception:
			frappe.throw(_("Invalid details payload"))

	if details is not None and not isinstance(details, list):
		frappe.throw(_("Details must be a list"))

	doc = frappe.get_doc("Environmental Checklist", checklist_name)

	if cost_center is not None:
		doc.cost_center = cost_center or None

	if practitioner is not None:
		doc.practitioner = practitioner or None
		doc.practitioner_name = (
			frappe.db.get_value("Healthcare Practitioner", practitioner, "practitioner_name")
			if practitioner
			else None
		)

	if details is not None:
		row_map = {row.name: row for row in getattr(doc, "environmental_checklist_detail", []) or []}

		for item in details:
			name = item.get("name")
			if not name or name not in row_map:
				continue
			row = row_map[name]
			row.checked = 1 if item.get("checked") else 0

	doc.save(ignore_permissions=True)
	frappe.db.commit()

	return _serialize_checklist(doc)


@frappe.whitelist()
def get_environmental_checklist_templates() -> list:
	templates = frappe.get_all(
		"Environmental Checklist Template",
		fields=["name", "default"],
		order_by="default desc, modified desc",
	)

	result = []
	for template in templates:
		doc = frappe.get_doc("Environmental Checklist Template", template.name)
		checklist_items = doc.get("checklist_items", []) or []

		result.append(
			{
				"name": doc.name,
				"default": bool(doc.default),
				"checklist_items": [
					{"item_name": item.item_name}
					for item in checklist_items
					if item and item.item_name
				],
			}
		)

	return result
