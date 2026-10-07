# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt
"""Drop the Doctor Wise Income Analysis single DocType.

The script report covers the same layout. Remove the form, its child table,
print format, and workspace links that opened the DocType.
"""

from __future__ import annotations

import frappe

PARENT = "Doctor Wise Income Analysis"
CHILD = "Doctor Wise Income Analysis Row"


def execute():
	_drop_print_format()
	_drop_doctype_workspace_links()
	# Child table first so the parent Table field can be removed cleanly.
	_delete_doctype(CHILD)
	_delete_doctype(PARENT)
	frappe.db.commit()


def _drop_print_format():
	if frappe.db.exists("Print Format", PARENT):
		frappe.delete_doc("Print Format", PARENT, force=1, ignore_permissions=True)


def _drop_doctype_workspace_links():
	"""Remove links that open the single form. Report links stay."""
	names = frappe.get_all(
		"Workspace Link",
		filters={"link_type": "DocType", "link_to": PARENT},
		pluck="parent",
	)
	for workspace in set(names):
		if not frappe.db.exists("Workspace", workspace):
			continue
		doc = frappe.get_doc("Workspace", workspace)
		kept = [
			row
			for row in doc.links
			if not (row.link_type == "DocType" and row.link_to == PARENT)
		]
		if len(kept) == len(doc.links):
			continue
		doc.set("links", [])
		for row in kept:
			doc.append("links", row)
		doc.flags.ignore_links = True
		doc.flags.ignore_validate = True
		doc.save(ignore_permissions=True)


def _delete_doctype(name: str):
	if not frappe.db.exists("DocType", name):
		return
	frappe.delete_doc("DocType", name, force=1, ignore_permissions=True)
