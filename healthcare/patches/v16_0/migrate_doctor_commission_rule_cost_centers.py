# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Restore stashed Doctor Commission Rule cost centers into Table MultiSelect."""

from __future__ import annotations

import frappe

CACHE_KEY = "healthcare:doctor_commission_rule_cost_center_migrate"


def execute():
	if not frappe.db.exists("DocType", "Doctor Commission Rule"):
		return
	if not frappe.db.exists("DocType", "Doctor Commission Rule Cost Center"):
		return

	rows = frappe.cache.get_value(CACHE_KEY) or []
	# Also try live column if somehow still present (sites that skipped pre patch).
	if not rows and frappe.db.has_column("Doctor Commission Rule", "cost_center"):
		rows = frappe.db.sql(
			"""
			select name, cost_center
			from `tabDoctor Commission Rule`
			where ifnull(cost_center, '') != ''
			""",
			as_dict=True,
		)

	for row in rows:
		name = row.get("name")
		cc = (row.get("cost_center") or "").strip()
		if not name or not cc or not frappe.db.exists("Doctor Commission Rule", name):
			continue
		exists = frappe.db.exists(
			"Doctor Commission Rule Cost Center",
			{"parent": name, "parenttype": "Doctor Commission Rule", "cost_center": cc},
		)
		if exists:
			continue
		doc = frappe.get_doc("Doctor Commission Rule", name)
		existing = {(r.cost_center or "").strip() for r in (doc.cost_centers or [])}
		if cc in existing:
			continue
		doc.append("cost_centers", {"cost_center": cc})
		doc.flags.ignore_validate = True
		doc.flags.ignore_mandatory = True
		doc.save(ignore_permissions=True)

	frappe.cache.delete_value(CACHE_KEY)
