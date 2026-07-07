"""Move legacy session/amount on Daily Patient Visit Setup into services child table."""

from __future__ import annotations

import frappe
from frappe.utils import flt


def execute():
	if not frappe.db.table_exists("tabDaily Patient Visit Setup"):
		return

	columns = set(frappe.db.get_table_columns("Daily Patient Visit Setup") or [])
	has_session = "session" in columns
	has_amount = "amount" in columns
	if not has_session and not has_amount:
		return

	rows = frappe.db.sql(
		"""
		SELECT name, `session`, amount
		FROM `tabDaily Patient Visit Setup`
		WHERE IFNULL(`session`, '') != '' OR IFNULL(amount, 0) != 0
		""",
		as_dict=True,
	)

	for row in rows:
		existing = frappe.db.count(
			"Daily Patient Visit Setup Service",
			{"parent": row.name},
		)
		if existing:
			continue
		session = (row.get("session") or "").strip()
		amount = flt(row.get("amount"))
		if not session and not amount:
			continue
		doc = frappe.get_doc("Daily Patient Visit Setup", row.name)
		doc.append("services", {"session": session, "amount": amount})
		doc.flags.ignore_permissions = True
		doc.save()

	frappe.db.commit()
