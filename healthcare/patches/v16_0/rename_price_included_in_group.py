import frappe
from frappe.model.utils.rename_field import rename_field


def execute():
	"""Rename typo field price_incuded_in_group → price_included_in_group."""
	if not frappe.db.exists("DocType", "Lab Test Template"):
		return

	has_typo = frappe.db.has_column("Lab Test Template", "price_incuded_in_group")
	has_correct = frappe.db.has_column("Lab Test Template", "price_included_in_group")

	if has_typo and not has_correct:
		rename_field("Lab Test Template", "price_incuded_in_group", "price_included_in_group")
		return

	if has_typo and has_correct:
		frappe.db.sql(
			"""
			UPDATE `tabLab Test Template`
			SET price_included_in_group = GREATEST(
				IFNULL(price_included_in_group, 0),
				IFNULL(price_incuded_in_group, 0)
			)
			"""
		)
		frappe.db.sql("ALTER TABLE `tabLab Test Template` DROP COLUMN `price_incuded_in_group`")
