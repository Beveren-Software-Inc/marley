# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

import json
import os

import frappe


def execute():
	"""Ensure Doctor Commission workspace exists and is public."""
	if "healthcare" not in frappe.get_installed_apps():
		return

	path = frappe.get_app_path(
		"healthcare",
		"healthcare",
		"workspace",
		"doctor_commission",
		"doctor_commission.json",
	)
	if not os.path.exists(path):
		return

	with open(path) as f:
		data = json.load(f)

	name = data.get("name") or "Doctor Commission"
	data["type"] = data.get("type") or "Workspace"
	data["public"] = 1
	data["is_hidden"] = 0
	data["module"] = "Healthcare"

	if frappe.db.exists("Workspace", name):
		doc = frappe.get_doc("Workspace", name)
		doc.type = data["type"]
		doc.public = 1
		doc.is_hidden = 0
		doc.module = "Healthcare"
		doc.icon = data.get("icon") or doc.icon or "percentage"
		doc.title = data.get("title") or doc.title or name
		doc.label = data.get("label") or doc.label or name
		doc.content = data.get("content") or doc.content or "[]"
		doc.set("links", [])
		for row in data.get("links") or []:
			doc.append("links", row)
		doc.set("shortcuts", [])
		for row in data.get("shortcuts") or []:
			doc.append("shortcuts", row)
		doc.set("roles", [])
		for row in data.get("roles") or []:
			doc.append("roles", row)
		doc.flags.ignore_links = True
		doc.flags.ignore_validate = True
		doc.save(ignore_permissions=True)
	else:
		doc = frappe.get_doc(data)
		doc.flags.ignore_links = True
		doc.insert(ignore_permissions=True)

	frappe.db.commit()
