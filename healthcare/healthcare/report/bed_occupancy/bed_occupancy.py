# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt


def execute(filters: dict | None = None):
	filters = frappe._dict(filters or {})
	columns = get_columns()
	data = get_data(filters)
	chart = get_chart(data)
	report_summary = get_report_summary(data)
	return columns, data, None, chart, report_summary


def get_columns() -> list[dict]:
	return [
		{
			"label": _("Bed No"),
			"fieldname": "bed_no",
			"fieldtype": "Link",
			"options": "Bed No",
			"width": 120,
		},
		{
			"label": _("Occupancy Status"),
			"fieldname": "occupancy_status",
			"fieldtype": "Data",
			"width": 130,
		},
		{
			"label": _("Room / Service Unit"),
			"fieldname": "service_unit",
			"fieldtype": "Link",
			"options": "Healthcare Service Unit",
			"width": 180,
		},
		{
			"label": _("Branch"),
			"fieldname": "cost_center",
			"fieldtype": "Link",
			"options": "Cost Center",
			"width": 150,
		},
		{
			"label": _("Admission"),
			"fieldname": "admission",
			"fieldtype": "Link",
			"options": "Inpatient Admission",
			"width": 140,
		},
		{
			"label": _("Admission Status"),
			"fieldname": "admission_status",
			"fieldtype": "Data",
			"width": 130,
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
			"width": 180,
		},
		{
			"label": _("Consultant Doctor"),
			"fieldname": "primary_practitioner",
			"fieldtype": "Link",
			"options": "Healthcare Practitioner",
			"width": 180,
		},
		{
			"label": _("Admitted Since"),
			"fieldname": "admitted_datetime",
			"fieldtype": "Datetime",
			"width": 160,
		},
		{
			"label": _("Price / Day"),
			"fieldname": "price_per_day",
			"fieldtype": "Currency",
			"width": 110,
		},
	]


def get_data(filters: dict) -> list[dict]:
	conditions = ["1=1"]
	params: dict = {}

	if filters.get("occupancy_status"):
		conditions.append("b.occupancy_status = %(occupancy_status)s")
		params["occupancy_status"] = filters.occupancy_status

	if filters.get("service_unit"):
		conditions.append("b.service_unit = %(service_unit)s")
		params["service_unit"] = filters.service_unit

	if filters.get("cost_center"):
		conditions.append("b.cost_center = %(cost_center)s")
		params["cost_center"] = filters.cost_center

	where_sql = " AND ".join(conditions)

	# Latest active admission per bed (Admitted / Discharge Scheduled).
	rows = frappe.db.sql(
		f"""
		SELECT
			b.name AS bed_no,
			b.bed_no AS bed_label,
			b.occupancy_status,
			b.service_unit,
			b.cost_center,
			b.price_per_day,
			b.currency,
			ia.name AS admission,
			ia.status AS admission_status,
			ia.patient,
			ia.patient_name,
			ia.primary_practitioner,
			ia.admitted_datetime
		FROM `tabBed No` b
		LEFT JOIN `tabInpatient Admission` ia
			ON ia.name = (
				SELECT ia2.name
				FROM `tabInpatient Admission` ia2
				WHERE ia2.bed_no = b.name
					AND ia2.status IN ('Admitted', 'Discharge Scheduled')
				ORDER BY ia2.admitted_datetime DESC, ia2.modified DESC
				LIMIT 1
			)
		WHERE {where_sql}
		ORDER BY
			CASE b.occupancy_status
				WHEN 'Occupied' THEN 0
				WHEN 'Vacant' THEN 1
				ELSE 2
			END,
			IFNULL(b.service_unit, ''),
			IFNULL(b.bed_no, b.name)
		""",
		params,
		as_dict=True,
	)

	# If bed is marked Occupied but no admission is linked, still show the bed.
	# If bed is Vacant, clear any stale admission join (should not happen with status filter).
	for row in rows:
		if (row.get("occupancy_status") or "").strip() != "Occupied":
			row["admission"] = None
			row["admission_status"] = None
			row["patient"] = None
			row["patient_name"] = None
			row["primary_practitioner"] = None
			row["admitted_datetime"] = None

	return rows


def get_chart(data: list[dict]) -> dict | None:
	if not data:
		return None

	occupied = sum(1 for d in data if (d.get("occupancy_status") or "") == "Occupied")
	vacant = sum(1 for d in data if (d.get("occupancy_status") or "") == "Vacant")
	other = len(data) - occupied - vacant

	labels = [_("Occupied"), _("Vacant")]
	values = [occupied, vacant]
	colors = ["#F97316", "#10B981"]
	if other > 0:
		labels.append(_("Other"))
		values.append(other)
		colors.append("#94A3B8")

	return {
		"data": {
			"labels": labels,
			"datasets": [{"name": _("Beds"), "values": values}],
		},
		"type": "donut",
		"colors": colors,
		"height": 260,
	}


def get_report_summary(data: list[dict]) -> list[dict]:
	total = len(data)
	occupied = sum(1 for d in data if (d.get("occupancy_status") or "") == "Occupied")
	vacant = sum(1 for d in data if (d.get("occupancy_status") or "") == "Vacant")
	other = total - occupied - vacant
	occupancy_pct = flt((occupied / total) * 100, 1) if total else 0.0

	summary = [
		{
			"value": total,
			"indicator": "Blue",
			"label": _("Total Beds"),
			"datatype": "Int",
		},
		{
			"value": occupied,
			"indicator": "Orange",
			"label": _("Occupied"),
			"datatype": "Int",
		},
		{
			"value": vacant,
			"indicator": "Green",
			"label": _("Vacant"),
			"datatype": "Int",
		},
		{
			"value": occupancy_pct,
			"indicator": "Red" if occupancy_pct >= 90 else ("Orange" if occupancy_pct >= 70 else "Blue"),
			"label": _("Occupancy %"),
			"datatype": "Percent",
		},
	]
	if other > 0:
		summary.insert(
			3,
			{
				"value": other,
				"indicator": "Grey",
				"label": _("Other Status"),
				"datatype": "Int",
			},
		)
	return summary
