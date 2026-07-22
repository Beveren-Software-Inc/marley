# Copyright (c) 2026, healthcare contributors
"""LAB-013 / LAB-021 - laboratory turnaround time.

Target TAT is declared on the Lab Test Template; actual TAT is measured from when
the test was raised to when the result was recorded, and a breach flag is set so
lab performance can be filtered and reported.
"""

from __future__ import annotations

import frappe
from frappe.utils import flt, get_datetime, now_datetime

RESULT_STATUSES = frozenset(
	{"Completed", "Pending Review", "Reviewed", "Approved"}
)


def set_turnaround_time(doc, method=None) -> None:
	"""Lab Test `validate` hook."""
	if not doc.meta.has_field("actual_tat_hours"):
		return

	target = _target_for(doc)
	if target:
		doc.target_tat_hours = target

	finished = _finished_at(doc)
	if not finished:
		doc.actual_tat_hours = 0
		doc.tat_breached = 0
		return

	started = get_datetime(doc.get("creation") or now_datetime())
	hours = (get_datetime(finished) - started).total_seconds() / 3600.0
	doc.actual_tat_hours = round(max(hours, 0), 2)
	doc.tat_breached = int(bool(target and doc.actual_tat_hours > flt(target)))


def _target_for(doc) -> float:
	template = doc.get("template") or doc.get("lab_test_template")
	if not template:
		return 0.0
	return flt(
		frappe.db.get_value("Lab Test Template", template, "turnaround_time_hours")
	)


def _finished_at(doc):
	if doc.get("result_date"):
		return doc.get("result_date")
	if doc.get("status") in RESULT_STATUSES:
		return doc.get("modified")
	return None


@frappe.whitelist()
def tat_summary(from_date: str, to_date: str, cost_center: str | None = None) -> dict:
	"""Lab TAT performance for a period - used by the lab dashboard/report."""
	conditions = ["docstatus < 2", "creation BETWEEN %(from_date)s AND %(to_date)s"]
	values = {"from_date": from_date, "to_date": to_date}
	if cost_center:
		conditions.append("cost_center = %(cc)s")
		values["cc"] = cost_center

	rows = frappe.db.sql(
		f"""SELECT template, COUNT(*) AS total,
		           AVG(actual_tat_hours) AS avg_tat,
		           MAX(actual_tat_hours) AS max_tat,
		           SUM(tat_breached) AS breached
		    FROM `tabLab Test`
		    WHERE {' AND '.join(conditions)} AND actual_tat_hours > 0
		    GROUP BY template
		    ORDER BY breached DESC, avg_tat DESC""",
		values,
		as_dict=True,
	)
	total = sum(r.total for r in rows)
	breached = sum(r.breached or 0 for r in rows)
	return {
		"rows": rows,
		"total_tests": total,
		"breached": breached,
		"compliance_pct": round((total - breached) / total * 100, 2) if total else 0,
	}
