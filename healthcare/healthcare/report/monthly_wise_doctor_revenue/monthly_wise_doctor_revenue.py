# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt
"""
Monthly Wise Doctor Revenue — doctor service amounts pivoted by month.

Uses the same Sales Order / base-document attribution as Doctor Service Revenue.
Defaults to the last 12 complete calendar months through the selected to_date.
"""

from __future__ import annotations

from dateutil.relativedelta import relativedelta

import frappe
from frappe import _, scrub
from frappe.utils import add_months, flt, get_first_day, get_last_day, getdate

from healthcare.healthcare.report.doctor_service_revenue.doctor_service_revenue import (
	build_earning_lines,
)

MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
]


def execute(filters=None):
	filters = frappe._dict(filters or {})
	apply_default_date_range(filters)

	months = get_month_periods(filters.from_date, filters.to_date)
	columns = get_columns(months)
	data = get_data(filters, months)
	chart = get_chart_data(data, months)

	return columns, data, None, chart


def apply_default_date_range(filters):
	"""Last 12 months ending on to_date (or today), aligned to calendar months."""
	to_date = getdate(filters.get("to_date") or getdate())
	from_date = filters.get("from_date")
	if from_date:
		from_date = getdate(from_date)
	else:
		# First day of the month 11 months before to_date → 12 calendar months.
		from_date = get_first_day(add_months(to_date, -11))

	filters.from_date = get_first_day(from_date)
	filters.to_date = get_last_day(to_date)


def get_month_periods(from_date, to_date):
	"""Return ordered list of {key, label, start, end} for each month in range."""
	start = get_first_day(getdate(from_date))
	end = get_last_day(getdate(to_date))
	cross_year = start.year != end.year
	periods = []
	cursor = start

	while cursor <= end:
		month_end = get_last_day(cursor)
		if month_end > end:
			month_end = end

		label = MONTHS[cursor.month - 1]
		if cross_year:
			label = f"{label} {cursor.year}"

		periods.append(
			{
				"key": scrub(label),
				"label": label,
				"start": cursor,
				"end": month_end,
			}
		)
		cursor = get_first_day(cursor + relativedelta(months=1))

	return periods


def get_columns(months):
	columns = [
		{"label": _("Doctor ID"), "fieldname": "doctor_id", "fieldtype": "Data", "width": 110},
		{"label": _("Doctor Name"), "fieldname": "doctor_name", "fieldtype": "Data", "width": 200},
		{
			"label": _("Practitioner"),
			"fieldname": "practitioner",
			"fieldtype": "Link",
			"options": "Healthcare Practitioner",
			"width": 150,
		},
		{"label": _("Cases"), "fieldname": "cases", "fieldtype": "Int", "width": 80},
	]

	for month in months:
		columns.append(
			{
				"label": _(month["label"]),
				"fieldname": month["key"],
				"fieldtype": "Currency",
				"width": 110,
			}
		)

	columns.append(
		{
			"label": _("Total"),
			"fieldname": "total",
			"fieldtype": "Currency",
			"width": 130,
		}
	)
	return columns


def get_data(filters, months):
	lines = build_earning_lines(filters)
	if not lines:
		return []

	month_key_by_ym = {(m["start"].year, m["start"].month): m["key"] for m in months}

	by_doctor = {}
	for line in lines:
		practitioner = line["practitioner"]
		if practitioner not in by_doctor:
			by_doctor[practitioner] = {
				"doctor_id": line["doctor_id"],
				"doctor_name": line["doctor_name"],
				"practitioner": practitioner,
				"cases": 0,
				"total": 0.0,
				**{month["key"]: 0.0 for month in months},
			}

		row = by_doctor[practitioner]
		amount = flt(line["service_amount"])
		txn_date = getdate(line["transaction_date"])
		month_key = month_key_by_ym.get((txn_date.year, txn_date.month))

		row["cases"] += 1
		row["total"] += amount
		if month_key:
			row[month_key] += amount

	return sorted(by_doctor.values(), key=lambda r: r["total"], reverse=True)


def get_chart_data(data, months):
	if not data or not months:
		return None

	labels = [month["label"] for month in months]
	values = []
	for month in months:
		values.append(flt(sum(flt(row.get(month["key"])) for row in data)))

	return {
		"data": {
			"labels": labels,
			"datasets": [{"name": _("Service Amount"), "values": values}],
		},
		"type": "bar",
		"fieldtype": "Currency",
	}
