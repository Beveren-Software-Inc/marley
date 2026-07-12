# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt, getdate


# Preferred Healthcare Practitioner link fields per base doctype (first non-empty wins).
DOCTYPE_PRACTITIONER_FIELDS = {
	"Patient Visit": ["practitioner"],
	"Service Request": ["practitioner"],
	"Patient Appointment": ["practitioner"],
	"Patient Medication Order": ["practitioner"],
	"Lab Test": ["practitioner"],
	"Medication Request": ["practitioner"],
	"Therapy Session": ["practitioner"],
	"Session Schedule": ["doctor", "practitioner"],
	"Inpatient Admission": [
		"primary_practitioner",
		"admission_by_doctor",
		"admission_practitioner",
	],
	"Discharge": ["discharge_doctor", "discharge_practitioner"],
	"Observation": ["healthcare_practitioner"],
	"IP Service": ["practioner"],  # field name is misspelled on the DocType
}

GENERIC_PRACTITIONER_FIELDS = [
	"practitioner",
	"doctor",
	"healthcare_practitioner",
	"practioner",
	"primary_practitioner",
	"admission_by_doctor",
	"admission_practitioner",
	"discharge_doctor",
	"discharge_practitioner",
]


def execute(filters=None):
	filters = frappe._dict(filters or {})
	columns = get_columns()
	data = get_data(filters)
	return columns, data


def get_columns():
	return [
		{
			"label": _("Doctor ID"),
			"fieldname": "doctor_id",
			"fieldtype": "Data",
			"width": 110,
		},
		{
			"label": _("Doctor Name"),
			"fieldname": "doctor_name",
			"fieldtype": "Data",
			"width": 160,
		},
		{
			"label": _("Practitioner"),
			"fieldname": "practitioner",
			"fieldtype": "Link",
			"options": "Healthcare Practitioner",
			"width": 130,
		},
		{
			"label": _("Date"),
			"fieldname": "transaction_date",
			"fieldtype": "Date",
			"width": 100,
		},
		{
			"label": _("Patient"),
			"fieldname": "patient",
			"fieldtype": "Link",
			"options": "Patient",
			"width": 120,
		},
		{
			"label": _("Patient Name"),
			"fieldname": "patient_name",
			"fieldtype": "Data",
			"width": 150,
		},
		{
			"label": _("Service"),
			"fieldname": "service",
			"fieldtype": "Link",
			"options": "Item",
			"width": 130,
		},
		{
			"label": _("Service Name"),
			"fieldname": "service_name",
			"fieldtype": "Data",
			"width": 180,
		},
		{
			"label": _("Qty"),
			"fieldname": "qty",
			"fieldtype": "Float",
			"width": 80,
		},
		{
			"label": _("Service Amount"),
			"fieldname": "service_amount",
			"fieldtype": "Currency",
			"width": 120,
		},
		{
			"label": _("Commission %"),
			"fieldname": "commission_percent",
			"fieldtype": "Percent",
			"width": 110,
		},
		{
			"label": _("Commission Amount"),
			"fieldname": "commission_amount",
			"fieldtype": "Currency",
			"width": 140,
		},
	]


def get_data(filters):
	commission_percent = flt(frappe.db.get_single_value("Healthcare Settings", "doctors_commission"))
	items = get_service_items(filters)
	if not items:
		return []

	practitioner_by_base = resolve_practitioners(items)
	practitioner_ids = {p for p in practitioner_by_base.values() if p}
	practitioner_details = get_practitioner_details(practitioner_ids)

	filter_practitioner = filters.get("practitioner")
	rows = []

	for row in items:
		key = (row.custom_base_reference, row.custom_base_reference_name)
		practitioner = practitioner_by_base.get(key)
		if not practitioner:
			continue
		if filter_practitioner and practitioner != filter_practitioner:
			continue

		details = practitioner_details.get(practitioner) or {}
		service_amount = flt(row.amount)
		commission_amount = flt(service_amount * commission_percent / 100.0)

		rows.append(
			{
				"doctor_id": details.get("doctors_id") or practitioner,
				"doctor_name": details.get("practitioner_name") or "",
				"practitioner": practitioner,
				"transaction_date": row.transaction_date,
				"patient": row.patient,
				"patient_name": row.custom_patient_name or "",
				"service": row.item_code,
				"service_name": row.item_name,
				"qty": flt(row.qty),
				"service_amount": service_amount,
				"commission_percent": commission_percent,
				"commission_amount": commission_amount,
			}
		)

	return rows


def get_service_items(filters):
	conditions = [
		"so.docstatus = 1",
		"IFNULL(so.custom_base_reference, '') != ''",
		"IFNULL(so.custom_base_reference_name, '') != ''",
	]
	values = {}

	if filters.get("from_date"):
		conditions.append("so.transaction_date >= %(from_date)s")
		values["from_date"] = getdate(filters.from_date)
	if filters.get("to_date"):
		conditions.append("so.transaction_date <= %(to_date)s")
		values["to_date"] = getdate(filters.to_date)
	if filters.get("company"):
		conditions.append("so.company = %(company)s")
		values["company"] = filters.company
	if filters.get("cost_center"):
		conditions.append("so.cost_center = %(cost_center)s")
		values["cost_center"] = filters.cost_center
	if filters.get("item_code"):
		conditions.append("soi.item_code = %(item_code)s")
		values["item_code"] = filters.item_code

	return frappe.db.sql(
		f"""
		SELECT
			so.transaction_date,
			so.patient,
			so.custom_patient_name,
			so.custom_base_reference,
			so.custom_base_reference_name,
			soi.item_code,
			soi.item_name,
			soi.qty,
			soi.amount
		FROM `tabSales Order` so
		INNER JOIN `tabSales Order Item` soi
			ON soi.parent = so.name AND soi.parenttype = 'Sales Order'
		WHERE {" AND ".join(conditions)}
		ORDER BY so.transaction_date DESC, so.name DESC, soi.idx ASC
		""",
		values,
		as_dict=True,
	)


def resolve_practitioners(rows):
	"""Map (base_doctype, base_name) -> Healthcare Practitioner name."""
	by_doctype = {}
	for row in rows:
		by_doctype.setdefault(row.custom_base_reference, set()).add(row.custom_base_reference_name)

	resolved = {}
	for doctype, names in by_doctype.items():
		if not frappe.db.exists("DocType", doctype):
			continue
		fields = get_practitioner_fields_for_doctype(doctype)
		if not fields:
			continue

		names = list(names)
		for i in range(0, len(names), 500):
			chunk = names[i : i + 500]
			docs = frappe.get_all(
				doctype,
				filters={"name": ["in", chunk]},
				fields=["name", *fields],
			)
			for doc in docs:
				practitioner = None
				for field in fields:
					value = doc.get(field)
					if value:
						practitioner = value
						break
				if practitioner:
					resolved[(doctype, doc.name)] = practitioner

	return resolved


def get_practitioner_fields_for_doctype(doctype):
	try:
		meta = frappe.get_meta(doctype)
	except Exception:
		return []

	preferred = DOCTYPE_PRACTITIONER_FIELDS.get(doctype, GENERIC_PRACTITIONER_FIELDS)
	available = []
	for fieldname in preferred:
		df = meta.get_field(fieldname)
		if df and df.fieldtype == "Link" and df.options == "Healthcare Practitioner":
			available.append(fieldname)

	for df in meta.fields:
		if (
			df.fieldtype == "Link"
			and df.options == "Healthcare Practitioner"
			and df.fieldname not in available
		):
			available.append(df.fieldname)

	return available


def get_practitioner_details(practitioner_ids):
	if not practitioner_ids:
		return {}
	rows = frappe.get_all(
		"Healthcare Practitioner",
		filters={"name": ["in", list(practitioner_ids)]},
		fields=["name", "doctors_id", "practitioner_name"],
	)
	return {row.name: row for row in rows}
