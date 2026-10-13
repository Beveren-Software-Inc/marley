"""Move legacy Check answers on the risk assessments to the new Yes/No Select fields.

The "Yes or No" questions on the Clinical Suicide Risk Assessment and the General
Risk Assessment stores the answer as 0/1 (Check). An answer the clinician never
gave was therefore stored as 0 and read back as "No". Both doctypes now use
Select fields ("Yes" / "No") where a blank value means "not answered yet".

The doctype sync has already retyped the columns by the time this runs; the
records still hold "0"/"1", so map those to the answer they used to display and
leave anything unset blank.
"""

from __future__ import annotations

import frappe

# Doctype → Yes/No answer fields converted from Check to Select.
ANSWER_FIELDS = {
	"Clinical Suicide Risk Assessment": (
		"has_ideation",
		"ideation_24h",
		"has_plan",
		"access_lethal_means",
		"risk_behavior",
		"has_history",
		"has_stressors",
		"has_support",
		"has_coping",
	),
	"General Risk Assessment": (
		"self_harm",
		"suicidal_risk",
		"others_bullying",
		"others_violence",
		"others_homicide",
		"from_bullying",
		"from_neglect",
		"from_violence",
	),
}

NUMERIC_TYPES = {"tinyint", "smallint", "mediumint", "int", "bigint", "decimal"}
YES_VALUES = ("1", "1.0", "yes", "true", "on")
NO_VALUES = ("0", "0.0", "no", "false", "off")


def execute():
	for doctype, fields in ANSWER_FIELDS.items():
		if not frappe.db.exists("DocType", doctype):
			continue

		columns = set(frappe.db.get_table_columns(doctype) or [])
		table = f"tab{doctype}"

		for field in fields:
			if field not in columns:
				continue
			_widen_column(table, field)
			_map_legacy_values(table, field)

	frappe.db.commit()


def _widen_column(table: str, field: str) -> None:
	"""Make sure the column can hold a blank answer.

	The doctype sync retypes Check (tinyint) columns to varchar. If that did not
	happen (the column is still numeric) retype it here so the answers below can
	be written as text.
	"""
	result = frappe.db.sql(
		"""
		SELECT DATA_TYPE FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %(table)s AND COLUMN_NAME = %(field)s
		""",
		{"table": table, "field": field},
	)
	if not result or (result[0][0] or "").lower() not in NUMERIC_TYPES:
		return

	frappe.db.sql(f"ALTER TABLE `{table}` MODIFY `{field}` VARCHAR(140) DEFAULT NULL")


def _map_legacy_values(table: str, field: str) -> None:
	"""0 → "No", 1 → "Yes"; anything else (already migrated / blank) is left blank."""
	yes_list = ", ".join(f"'{value}'" for value in YES_VALUES)
	no_list = ", ".join(f"'{value}'" for value in NO_VALUES)

	frappe.db.sql(
		f"""
		UPDATE `{table}`
		SET `{field}` = CASE
			WHEN LOWER(TRIM(COALESCE(CAST(`{field}` AS CHAR), ''))) IN ({yes_list}) THEN 'Yes'
			WHEN LOWER(TRIM(COALESCE(CAST(`{field}` AS CHAR), ''))) IN ({no_list}) THEN 'No'
			ELSE ''
		END
		WHERE LOWER(TRIM(COALESCE(CAST(`{field}` AS CHAR), ''))) <> ''
		"""
	)
