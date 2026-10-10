# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt
"""
Doctor Service Revenue — amounts attributed to doctors from all billed services.

The ``Source`` filter selects where the report starts from:

* **Sales Invoice** (default) — starts from submitted Sales Invoices; a service
  is recognised as soon as it is invoiced.
* **Sales Order** — starts from submitted Sales Orders (previous behaviour).

In both cases the practitioner is resolved from the linked healthcare base
document (``custom_base_reference`` / ``custom_base_reference_name``). Services
with no resolvable doctor — no base document, or the base document has no
practitioner attached — are grouped under **Others**, shown as the first row.

By default stock items (medicines / dispensed drugs) are excluded — they are
not doctor service income. Uncheck ``Exclude Medicines`` to include them.

``Exclude Inpatient`` drops rows whose base document is an inpatient admission
charge, IP service, or discharge.

``Paid Only`` keeps Sales Orders that are fully collected via advance, or whose
linked Sales Invoices have no outstanding; for the Sales Invoice source it keeps
invoices that have no outstanding amount.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate

# Base documents billed for inpatient stay / ward services (not OP doctor income).
INPATIENT_BASE_DOCTYPES = (
	"Inpatient Admission",
	"IP Service",
	"Discharge",
)

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
	view = (filters.get("view") or "Summary by Doctor").strip()
	if "detailed" in view.lower():
		columns = get_detail_columns()
		data = get_detail_data(filters)
	else:
		columns = get_summary_columns()
		data = get_summary_data(filters)
	return columns, data


def get_summary_columns():
	return [
		{"label": _("Doctor ID"), "fieldname": "doctor_id", "fieldtype": "Data", "width": 110},
		{"label": _("Doctor Name"), "fieldname": "doctor_name", "fieldtype": "Data", "width": 200},
		{"label": _("Cases"), "fieldname": "cases", "fieldtype": "Int", "width": 80},
		{
			"label": _("Total Service Amount"),
			"fieldname": "service_amount",
			"fieldtype": "Currency",
			"width": 160,
		},
	]


def get_detail_columns():
	# Column fieldnames must not clash with filter fieldnames (e.g. item_code).
	return [
		{"label": _("Doctor ID"), "fieldname": "doctor_id", "fieldtype": "Data", "width": 110},
		{"label": _("Doctor Name"), "fieldname": "doctor_name", "fieldtype": "Data", "width": 160},
		{"label": _("Service"), "fieldname": "service_name", "fieldtype": "Data", "width": 240},
		{
			"label": _("Item"),
			"fieldname": "service",
			"fieldtype": "Link",
			"options": "Item",
			"width": 120,
		},
		{"label": _("Source"), "fieldname": "base_doctype", "fieldtype": "Data", "width": 140},
		{
			"label": _("Source Document"),
			"fieldname": "base_name",
			"fieldtype": "Dynamic Link",
			"options": "base_doctype",
			"width": 140,
		},
		{"label": _("Date"), "fieldname": "transaction_date", "fieldtype": "Date", "width": 100},
		{
			"label": _("Patient"),
			"fieldname": "patient",
			"fieldtype": "Link",
			"options": "Patient",
			"width": 120,
		},
		{"label": _("Patient Name"), "fieldname": "patient_name", "fieldtype": "Data", "width": 150},
		{"label": _("Qty"), "fieldname": "qty", "fieldtype": "Float", "width": 70},
		{
			"label": _("Service Amount"),
			"fieldname": "service_amount",
			"fieldtype": "Currency",
			"width": 120,
		},
	]


def get_summary_data(filters):
	lines = build_earning_lines(filters)
	by_doctor = {}

	for line in lines:
		key = line["practitioner"]
		if key not in by_doctor:
			by_doctor[key] = {
				"doctor_id": line["doctor_id"],
				"doctor_name": line["doctor_name"],
				"practitioner": line["practitioner"],
				"cases": 0,
				"service_amount": 0.0,
				"_orders": set(),
			}
		order_name = line.get("sales_order")
		# One Sales Order (e.g. group lab / service request) = one case, not one per item line.
		if order_name and order_name not in by_doctor[key]["_orders"]:
			by_doctor[key]["_orders"].add(order_name)
			by_doctor[key]["cases"] += 1
		by_doctor[key]["service_amount"] += flt(line["service_amount"])

	rows = list(by_doctor.values())
	for row in rows:
		row.pop("_orders", None)

	# "Others" (unattributed services) is always shown as the first row.
	others = [row for row in rows if row["practitioner"] is None]
	named = [row for row in rows if row["practitioner"] is not None]
	return others + sorted(named, key=lambda r: r["service_amount"], reverse=True)


def get_detail_data(filters):
	rows = build_earning_lines(filters)
	# "Others" (unattributed services) is always shown as the first row.
	others = [row for row in rows if row["practitioner"] is None]
	named = [row for row in rows if row["practitioner"] is not None]
	return others + named


def build_earning_lines(filters):
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
		# Services with no linked doctor (no base document, or the base document
		# has no practitioner attached) fall through to the "Others" bucket.
		if filter_practitioner and practitioner != filter_practitioner:
			continue

		details = practitioner_details.get(practitioner) or {}
		service_amount = flt(row.amount)

		item_code = row.item_code or ""
		item_name = row.item_name or item_code
		rows.append(
			{
				"doctor_id": details.get("doctors_id") or (practitioner or ""),
				"doctor_name": details.get("practitioner_name") or (practitioner or _("Others")),
				"practitioner": practitioner,
				"sales_order": row.sales_order,
				"transaction_date": row.transaction_date,
				"patient": row.patient,
				"patient_name": row.custom_patient_name or "",
				"base_doctype": row.custom_base_reference,
				"base_name": row.custom_base_reference_name,
				"item_code": item_code,
				"item_name": item_name,
				# Keep legacy keys for any callers still reading them.
				"service": item_code,
				"service_name": item_name,
				"qty": flt(row.qty),
				"service_amount": service_amount,
			}
		)

	return rows


def get_service_items(filters):
	"""Return billed service lines from the selected ``Source`` (default Sales Invoice)."""
	source = (filters.get("source") or "Sales Invoice").strip().lower()
	if source.startswith("sales order"):
		return get_sales_order_service_items(filters)
	return get_sales_invoice_service_items(filters)


def get_sales_order_service_items(filters):
	conditions = [
		"so.docstatus = 1",
		"IFNULL(so.custom_base_reference, '') != ''",
		"IFNULL(so.custom_base_reference_name, '') != ''",
	]
	values = {}
	# Medicines / dispensed stock are not doctor service income.
	exclude_medicines = cint(filters.get("exclude_medicines"))
	if exclude_medicines:
		conditions.append("IFNULL(item.is_stock_item, 0) = 0")

	# Inpatient admission / IP service / discharge charges.
	if cint(filters.get("exclude_inpatient")):
		conditions.append("so.custom_base_reference NOT IN %(inpatient_base_doctypes)s")
		values["inpatient_base_doctypes"] = INPATIENT_BASE_DOCTYPES

	# Fully paid via advance on SO, or linked invoices with no outstanding.
	paid_only = cint(filters.get("paid_only") if filters.get("paid_only") is not None else filters.get("paid"))
	invoice_join = ""
	if paid_only:
		conditions.append(
			"""(
				IFNULL(so.advance_paid, 0) + 0.00001 >= IFNULL(so.grand_total, 0)
				OR (
					IFNULL(inv.invoice_count, 0) > 0
					AND IFNULL(inv.outstanding, 0) <= 0.00001
				)
			)"""
		)
		invoice_join = """
		LEFT JOIN (
			SELECT
				x.sales_order,
				COUNT(*) AS invoice_count,
				SUM(x.outstanding_amount) AS outstanding
			FROM (
				SELECT DISTINCT
					sii.sales_order,
					si.name,
					si.outstanding_amount
				FROM `tabSales Invoice Item` sii
				INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
				WHERE si.docstatus = 1
					AND IFNULL(sii.sales_order, '') != ''
			) x
			GROUP BY x.sales_order
		) inv ON inv.sales_order = so.name
		"""

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
		# Sales Register filters the item cost center, not the order header.
		# Fall back to the header when the line is blank.
		conditions.append(
			"COALESCE(NULLIF(soi.cost_center, ''), so.cost_center) = %(cost_center)s"
		)
		values["cost_center"] = filters.cost_center
	if filters.get("item_code"):
		conditions.append("soi.item_code = %(item_code)s")
		values["item_code"] = filters.item_code

	item_join = "LEFT JOIN `tabItem` item ON item.name = soi.item_code"

	return frappe.db.sql(
		f"""
		SELECT
			so.name AS sales_order,
			so.transaction_date,
			so.patient,
			so.custom_patient_name,
			so.customer,
			so.customer_name,
			so.custom_base_reference,
			so.custom_base_reference_name,
			soi.item_code,
			soi.item_name,
			IFNULL(item.item_group, '') AS item_group,
			IFNULL(item.is_stock_item, 0) AS is_stock_item,
			soi.qty,
			soi.amount
		FROM `tabSales Order` so
		INNER JOIN `tabSales Order Item` soi
			ON soi.parent = so.name AND soi.parenttype = 'Sales Order'
		{item_join}
		{invoice_join}
		WHERE {" AND ".join(conditions)}
		ORDER BY so.transaction_date DESC, so.name DESC, soi.idx ASC
		""",
		values,
		as_dict=True,
	)


def get_sales_invoice_service_items(filters):
	"""Billed service lines starting from submitted Sales Invoices.

	Unlike the Sales Order source this does *not* require a base reference: an
	invoice with no source (or whose source has no practitioner) is attributed to
	**Others**. The base reference / patient is taken from the invoice itself and
	falls back to the linked Sales Order when the invoice leaves it blank.
	"""
	# Sales Invoice stores the healthcare base reference directly; when the
	# invoice was raised from a Sales Order we fall back to that order.
	base_doctype_expr = (
		"COALESCE(NULLIF(si.custom_base_reference, ''), so.custom_base_reference, '')"
	)
	base_name_expr = (
		"COALESCE(NULLIF(si.custom_base_reference_name, ''), so.custom_base_reference_name, '')"
	)
	# `patient` / `custom_patient_name` may not be present on every site.
	patient_expr = "si.patient" if frappe.db.has_column("Sales Invoice", "patient") else "NULL"
	patient_name_expr = (
		"si.custom_patient_name"
		if frappe.db.has_column("Sales Invoice", "custom_patient_name")
		else "NULL"
	)

	conditions = ["si.docstatus = 1"]
	values = {}
	# Medicines / dispensed stock are not doctor service income.
	exclude_medicines = cint(filters.get("exclude_medicines"))
	if exclude_medicines:
		conditions.append("IFNULL(item.is_stock_item, 0) = 0")

	# Inpatient admission / IP service / discharge charges.
	if cint(filters.get("exclude_inpatient")):
		conditions.append(f"{base_doctype_expr} NOT IN %(inpatient_base_doctypes)s")
		values["inpatient_base_doctypes"] = INPATIENT_BASE_DOCTYPES

	# A fully settled invoice (no outstanding amount) counts as paid.
	paid_only = cint(filters.get("paid_only") if filters.get("paid_only") is not None else filters.get("paid"))
	if paid_only:
		conditions.append("IFNULL(si.outstanding_amount, 0) <= 0.00001")

	if filters.get("from_date"):
		conditions.append("si.posting_date >= %(from_date)s")
		values["from_date"] = getdate(filters.from_date)
	if filters.get("to_date"):
		conditions.append("si.posting_date <= %(to_date)s")
		values["to_date"] = getdate(filters.to_date)
	if filters.get("company"):
		conditions.append("si.company = %(company)s")
		values["company"] = filters.company
	if filters.get("cost_center"):
		# Sales Register filters Sales Invoice Item.cost_center (not the invoice header).
		# Fall back to the header when the line cost center is blank.
		conditions.append(
			"COALESCE(NULLIF(sii.cost_center, ''), si.cost_center) = %(cost_center)s"
		)
		values["cost_center"] = filters.cost_center
	if filters.get("item_code"):
		conditions.append("sii.item_code = %(item_code)s")
		values["item_code"] = filters.item_code

	item_join = "LEFT JOIN `tabItem` item ON item.name = sii.item_code"

	return frappe.db.sql(
		f"""
		SELECT
			si.name AS sales_order,
			si.posting_date AS transaction_date,
			COALESCE({patient_expr}, so.patient) AS patient,
			COALESCE({patient_name_expr}, so.custom_patient_name) AS custom_patient_name,
			si.customer,
			si.customer_name,
			{base_doctype_expr} AS custom_base_reference,
			{base_name_expr} AS custom_base_reference_name,
			sii.item_code,
			sii.item_name,
			IFNULL(item.item_group, '') AS item_group,
			IFNULL(item.is_stock_item, 0) AS is_stock_item,
			sii.qty,
			sii.amount
		FROM `tabSales Invoice` si
		INNER JOIN `tabSales Invoice Item` sii
			ON sii.parent = si.name AND sii.parenttype = 'Sales Invoice'
		LEFT JOIN `tabSales Order` so ON so.name = sii.sales_order
		{item_join}
		WHERE {" AND ".join(conditions)}
		ORDER BY si.posting_date DESC, si.name DESC, sii.idx ASC
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


