"""Convert legacy Mental State orientation text values to Check (0/1) before schema sync."""

from __future__ import annotations

import frappe

ORIENTATION_CHECK_FIELDS = ("time", "place", "person")
BATCH_SIZE = 1000


def execute():
	if not frappe.db.table_exists("tabMental State"):
		return

	columns = set(frappe.db.get_table_columns("Mental State") or [])
	fields = [field for field in ORIENTATION_CHECK_FIELDS if field in columns]
	if not fields:
		return

	set_clauses = []
	for field in fields:
		set_clauses.append(
			f"""`{field}` = IF(
				`{field}` IS NULL
				OR TRIM(CAST(`{field}` AS CHAR)) = ''
				OR TRIM(CAST(`{field}` AS CHAR)) IN ('0', '0.0', 'false', 'False', 'no', 'No', 'N'),
				0,
				1
			)"""
		)
	set_sql = ", ".join(set_clauses)

	names = frappe.get_all("Mental State", pluck="name")
	for offset in range(0, len(names), BATCH_SIZE):
		batch = names[offset : offset + BATCH_SIZE]
		if not batch:
			continue
		frappe.db.sql(
			f"""
			UPDATE `tabMental State`
			SET {set_sql}
			WHERE name IN %(names)s
			""",
			{"names": batch},
		)
		for field in fields:
			frappe.db.sql(
				f"""
				UPDATE `tabMental State`
				SET `{field}` = '0'
				WHERE name IN %(names)s AND `{field}` IS NULL
				""",
				{"names": batch},
			)

	frappe.db.commit()
