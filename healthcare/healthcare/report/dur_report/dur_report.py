# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def execute(filters=None):
	filters = filters or {}
	columns = get_columns()
	data = get_data(filters)
	return columns, data


def get_columns():
	return [
		{
			"fieldname": "patient",
			"fieldtype": "Link",
			"label": _("Patient"),
			"options": "Patient",
			"width": 120,
		},
		{
			"fieldname": "patient_name",
			"fieldtype": "Data",
			"label": _("Patient Name"),
			"width": 150,
		},
		{
			"fieldname": "doctor_name",
			"fieldtype": "Data",
			"label": _("Doctor Name"),
			"width": 150,
		},
		{
			"fieldname": "pharmacy_person",
			"fieldtype": "Link",
			"label": _("Pharmacy Person / Nurse"),
			"options": "Healthcare Practitioner",
			"width": 150,
		},
		{
			"fieldname": "warehouse",
			"fieldtype": "Link",
			"label": _("Warehouse"),
			"options": "Warehouse",
			"width": 150,
		},
		{
			"fieldname": "quantity",
			"fieldtype": "Float",
			"label": _("Qty of Drugs"),
			"width": 100,
		},
		{
			"fieldname": "from_date",
			"fieldtype": "Date",
			"label": _("From Date"),
			"width": 100,
		},
		{
			"fieldname": "to_date",
			"fieldtype": "Date",
			"label": _("To Date"),
			"width": 100,
		},
		{
			"fieldname": "drug_code",
			"fieldtype": "Link",
			"label": _("Drug Code"),
			"options": "Item",
			"width": 120,
		},
		{
			"fieldname": "drug_name",
			"fieldtype": "Data",
			"label": _("Drug Name"),
			"width": 180,
		},
	]


def get_data(filters):
	conditions, values = get_conditions(filters)

	data = frappe.db.sql(
		"""
		SELECT
			parent.patient,
			parent.patient_name,
			parent.healthcare_practitioner_name AS doctor_name,
			parent.healthcare_practitioner AS pharmacy_person,
			parent.reference_doctype,
			parent.reference_document_name,
			parent.posting_date,
			parent.start_date AS from_date,
			parent.end_date AS to_date,
			child.drug AS drug_code,
			child.drug_name,
			child.quantity
		FROM `tabPatient Medication Order` parent
		INNER JOIN `tabInpatient Medication Order Entry` child
			ON child.parent = parent.name AND child.parenttype = 'Patient Medication Order'
		WHERE parent.docstatus = 1
		{conditions}
		ORDER BY parent.posting_date DESC, parent.name, child.idx
	""".format(
			conditions=conditions
		),
		values,
		as_dict=1,
	)

		# Resolve warehouse from reference doctype/document
	for row in data:
		row["warehouse"] = get_warehouse_from_reference(
			row.get("reference_doctype"), row.get("reference_document_name")
		)
		row.pop("reference_doctype", None)
		row.pop("reference_document_name", None)

	return data


def get_warehouse_from_reference(reference_doctype, reference_document_name):
	"""Get warehouse from reference doctype and document (e.g. Inpatient Medication Entry)."""
	if not reference_doctype or not reference_document_name:
		return None
	try:
		if reference_doctype == "Inpatient Medication Entry":
			return frappe.db.get_value(
				"Inpatient Medication Entry",
				reference_document_name,
				"warehouse",
			)
		# Fallback: check if reference doctype has warehouse field
		if frappe.db.exists("DocType", reference_doctype):
			meta = frappe.get_meta(reference_doctype)
			if meta.has_field("warehouse"):
				return frappe.db.get_value(
					reference_doctype,
					reference_document_name,
					"warehouse",
				)
	except Exception:
		pass
	return None


def get_conditions(filters):
	filters = filters or {}
	conditions = " AND 1=1"
	values = {}

	if filters.get("practitioner"):
		conditions += " AND (parent.practitioner = %(practitioner)s OR parent.healthcare_practitioner = %(practitioner)s)"
		values["practitioner"] = filters.get("practitioner")

	if filters.get("from_date"):
		conditions += " AND parent.posting_date >= %(from_date)s"
		values["from_date"] = filters.get("from_date")

	if filters.get("to_date"):
		conditions += " AND parent.posting_date <= %(to_date)s"
		values["to_date"] = filters.get("to_date")

	if filters.get("drug"):
		conditions += " AND child.drug = %(drug)s"
		values["drug"] = filters.get("drug")

	if filters.get("patient"):
		conditions += " AND parent.patient = %(patient)s"
		values["patient"] = filters.get("patient")

	if filters.get("cost_center"):
		conditions += " AND parent.cost_center = %(cost_center)s"
		values["cost_center"] = filters.get("cost_center")

	return conditions, values
