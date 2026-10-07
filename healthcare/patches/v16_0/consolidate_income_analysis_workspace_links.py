# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt
"""Workspace links: Income by Doctor Patient and Source + Doctor Wise (separate)."""

from __future__ import annotations

import frappe

IBDPS = "Income by Doctor Patient and Source"
DWIA = "Doctor Wise Income Analysis"
WRONG_LABEL = "Income Analysis (Doctor / Patient / Source)"


def execute():
	_fix_financial_reports()
	from healthcare.patches.v16_0.ensure_doctor_commission_workspace import execute as sync_dc

	sync_dc()
	frappe.db.commit()


def _fix_financial_reports():
	if not frappe.db.exists("Workspace", "Financial Reports"):
		return

	frappe.flags.in_patch = True
	doc = frappe.get_doc("Workspace", "Financial Reports")
	changed = False

	# Fix mis-labeled unified link that pointed at DWIA
	for row in doc.links:
		if row.type == "Link" and row.link_to == DWIA and row.label == WRONG_LABEL:
			row.label = "Doctor Wise Income Analysis"
			changed = True

	has_ibdps = any(
		row.type == "Link" and row.link_type == "Report" and row.link_to == IBDPS
		for row in doc.links
	)
	if not has_ibdps and frappe.db.exists("Report", IBDPS):
		doc.append(
			"links",
			{
				"type": "Link",
				"label": IBDPS,
				"link_type": "Report",
				"link_to": IBDPS,
				"is_query_report": 1,
				"dependencies": "Sales Invoice",
				"hidden": 0,
				"onboard": 0,
			},
		)
		changed = True

	has_dwia = any(
		row.type == "Link" and row.link_type == "Report" and row.link_to == DWIA
		for row in doc.links
	)
	if not has_dwia and frappe.db.exists("Report", DWIA):
		doc.append(
			"links",
			{
				"type": "Link",
				"label": "Doctor Wise Income Analysis",
				"link_type": "Report",
				"link_to": DWIA,
				"is_query_report": 1,
				"dependencies": "Sales Invoice",
				"hidden": 0,
				"onboard": 0,
			},
		)
		changed = True

	if changed:
		doc.flags.ignore_links = True
		doc.flags.ignore_validate = True
		doc.save(ignore_permissions=True)
