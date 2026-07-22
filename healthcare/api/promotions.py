# Copyright (c) 2026, healthcare contributors
"""REC-086 - promotion tagging and analysis for OP and IP.

A Promotion is tagged onto the revenue documents (Patient Visit, Inpatient
Admission, Sales Invoice). `get_promotion_analysis` then reports uptake and
value split by OP / IP so promotions can be filtered and compared.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import flt, getdate


@frappe.whitelist()
def get_active_promotions(
	applies_to: str | None = None, on_date: str | None = None, cost_center: str | None = None
) -> list[dict]:
	"""Promotions valid on a date, optionally narrowed to OP or IP."""
	on_date = getdate(on_date) if on_date else getdate()

	conditions = ["p.is_active = 1", "p.valid_from <= %(on_date)s"]
	values = {"on_date": on_date}
	conditions.append("(p.valid_upto IS NULL OR p.valid_upto >= %(on_date)s)")

	if applies_to in ("OP", "IP"):
		conditions.append("(p.applies_to = %(applies_to)s OR p.applies_to = 'Both')")
		values["applies_to"] = applies_to

	if cost_center:
		conditions.append("(p.cost_center IS NULL OR p.cost_center = '' OR p.cost_center = %(cc)s)")
		values["cc"] = cost_center

	return frappe.db.sql(
		f"""SELECT p.name, p.promotion_name, p.promotion_code, p.applies_to,
		           p.discount_type, p.discount_value, p.patient_category,
		           p.item_group, p.cost_center, p.valid_from, p.valid_upto
		    FROM `tabPromotion` p
		    WHERE {' AND '.join(conditions)}
		    ORDER BY p.promotion_name""",
		values,
		as_dict=True,
	)


def validate_promotion(doc, method=None) -> None:
	"""`validate` hook - keep the tagged promotion honest."""
	promotion = doc.get("promotion")
	if not promotion:
		return

	promo = frappe.db.get_value(
		"Promotion",
		promotion,
		["is_active", "applies_to", "valid_from", "valid_upto", "promotion_name"],
		as_dict=True,
	)
	if not promo:
		return

	if not promo.is_active:
		frappe.throw(
			_("Promotion {0} is not active.").format(frappe.bold(promo.promotion_name))
		)

	stream = "IP" if doc.doctype == "Inpatient Admission" else "OP"
	if promo.applies_to not in ("Both", stream):
		frappe.throw(
			_("Promotion {0} applies to {1} only.").format(
				frappe.bold(promo.promotion_name), promo.applies_to
			)
		)


@frappe.whitelist()
def get_promotion_analysis(
	from_date: str, to_date: str, cost_center: str | None = None, applies_to: str | None = None
) -> dict:
	"""Promotion uptake for OP and IP, with invoiced value where available."""
	cc_filter = " AND cost_center = %(cc)s" if cost_center else ""
	values = {"from_date": getdate(from_date), "to_date": getdate(to_date)}
	if cost_center:
		values["cc"] = cost_center

	op = frappe.db.sql(
		f"""SELECT promotion, COUNT(*) AS cnt
		    FROM `tabPatient Visit`
		    WHERE promotion IS NOT NULL AND promotion != ''
		      AND encounter_date BETWEEN %(from_date)s AND %(to_date)s
		      AND docstatus < 2 {cc_filter}
		    GROUP BY promotion""",
		values,
		as_dict=True,
	)

	ip = frappe.db.sql(
		f"""SELECT promotion, COUNT(*) AS cnt
		    FROM `tabInpatient Admission`
		    WHERE promotion IS NOT NULL AND promotion != ''
		      AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s {cc_filter}
		    GROUP BY promotion""",
		values,
		as_dict=True,
	)

	billed = frappe.db.sql(
		f"""SELECT promotion, COUNT(*) AS cnt,
		           SUM(grand_total) AS total, SUM(discount_amount) AS discount
		    FROM `tabSales Invoice`
		    WHERE promotion IS NOT NULL AND promotion != ''
		      AND posting_date BETWEEN %(from_date)s AND %(to_date)s
		      AND docstatus = 1 {cc_filter}
		    GROUP BY promotion""",
		values,
		as_dict=True,
	)

	summary: dict[str, dict] = {}
	for row in op:
		summary.setdefault(row.promotion, _blank(row.promotion))["op_count"] = row.cnt
	for row in ip:
		summary.setdefault(row.promotion, _blank(row.promotion))["ip_count"] = row.cnt
	for row in billed:
		entry = summary.setdefault(row.promotion, _blank(row.promotion))
		entry["invoice_count"] = row.cnt
		entry["invoiced_value"] = flt(row.total)
		entry["discount_given"] = flt(row.discount)

	rows = list(summary.values())
	for entry in rows:
		entry["total_count"] = entry["op_count"] + entry["ip_count"]
	rows.sort(key=lambda r: r["total_count"], reverse=True)

	return {
		"from_date": str(getdate(from_date)),
		"to_date": str(getdate(to_date)),
		"rows": rows,
		"totals": {
			"op": sum(r["op_count"] for r in rows),
			"ip": sum(r["ip_count"] for r in rows),
			"invoiced_value": sum(r["invoiced_value"] for r in rows),
			"discount_given": sum(r["discount_given"] for r in rows),
		},
	}


def _blank(promotion: str) -> dict:
	return {
		"promotion": promotion,
		"promotion_name": frappe.db.get_value("Promotion", promotion, "promotion_name")
		or promotion,
		"op_count": 0,
		"ip_count": 0,
		"invoice_count": 0,
		"invoiced_value": 0.0,
		"discount_given": 0.0,
	}
