# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt
"""Add Healthcare income/commission reports to Accounts → Financial Reports."""

from __future__ import annotations

import json

import frappe

WORKSPACE = "Financial Reports"
CARD_NAME = "Healthcare Income"

# (label, report_name, is_query_report)
REPORT_LINKS = [
	("Income by Doctor Patient and Source", "Income by Doctor Patient and Source", 1),
	("Doctor Wise Income Analysis", "Doctor Wise Income Analysis", 1),
	("Source Income Analysis", "Source Income Analysis", 1),
	("Patient Wise Income Analysis", "Patient Wise Income Analysis", 1),
	("Doctor Commission Summary", "Doctor Commission Summary", 1),
	("Doctor Commission Details", "Doctor Commission", 1),
	("Doctor Due Payment", "Doctor Due Payment", 1),
]


def execute():
	if not frappe.db.exists("Workspace", WORKSPACE):
		return

	# Only add links for reports that exist on this site
	links = []
	for label, report_name, is_qr in REPORT_LINKS:
		if frappe.db.exists("Report", report_name):
			links.append((label, report_name, is_qr))
	if not links:
		return

	doc = frappe.get_doc("Workspace", WORKSPACE)
	existing = {
		(row.link_to, row.link_type)
		for row in doc.links
		if row.type == "Link" and row.link_to
	}

	to_add = [(lbl, rn, qr) for lbl, rn, qr in links if (rn, "Report") not in existing]
	if not to_add:
		_ensure_card_in_content(doc)
		return

	# Card Break (create if missing)
	has_card = any(
		row.type == "Card Break" and row.label == CARD_NAME for row in doc.links
	)
	if not has_card:
		doc.append(
			"links",
			{
				"type": "Card Break",
				"label": CARD_NAME,
				"hidden": 0,
				"is_query_report": 0,
				"link_count": len(to_add),
				"onboard": 0,
			},
		)

	for label, report_name, is_qr in to_add:
		doc.append(
			"links",
			{
				"type": "Link",
				"label": label,
				"link_type": "Report",
				"link_to": report_name,
				"is_query_report": is_qr,
				"dependencies": "Sales Invoice",
				"hidden": 0,
				"onboard": 0,
			},
		)

	# Keep Card Break link_count accurate
	for row in doc.links:
		if row.type == "Card Break" and row.label == CARD_NAME:
			row.link_count = sum(
				1
				for r in doc.links
				if r.type == "Link"
				and r.link_type == "Report"
				and any(r.link_to == rn for _, rn, _ in links)
			)

	_ensure_card_in_content(doc)
	# Do not export into ERPNext's Workspace JSON (developer_mode sites).
	frappe.flags.in_patch = True
	doc.flags.ignore_links = True
	doc.flags.ignore_validate = True
	doc.save(ignore_permissions=True)
	frappe.db.commit()


def _ensure_card_in_content(doc):
	"""Show the Healthcare Income card on the Financial Reports page body."""
	try:
		content = json.loads(doc.content or "[]")
	except Exception:
		content = []

	for block in content:
		if block.get("type") == "card" and (block.get("data") or {}).get("card_name") == CARD_NAME:
			return

	content.append(
		{
			"id": "hc_income_reports",
			"type": "card",
			"data": {"card_name": CARD_NAME, "col": 4},
		}
	)
	doc.content = json.dumps(content)
