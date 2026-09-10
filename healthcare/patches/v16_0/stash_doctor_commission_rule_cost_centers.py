# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Stash Doctor Commission Rule.cost_center Link values before schema drop."""

from __future__ import annotations

import frappe

CACHE_KEY = "healthcare:doctor_commission_rule_cost_center_migrate"


def execute():
	if not frappe.db.exists("DocType", "Doctor Commission Rule"):
		return
	if not frappe.db.has_column("Doctor Commission Rule", "cost_center"):
		return

	rows = frappe.db.sql(
		"""
		select name, cost_center
		from `tabDoctor Commission Rule`
		where ifnull(cost_center, '') != ''
		""",
		as_dict=True,
	)
	frappe.cache.set_value(CACHE_KEY, rows or [])
