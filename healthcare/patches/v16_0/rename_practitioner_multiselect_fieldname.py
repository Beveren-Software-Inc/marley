# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.utils.rename_field import rename_field


def execute():
	"""Rename the misspelled practioner field → practitioner on Practitioner Multiselect.

	Doctor Commission Rule matches doctors through this child table, so the column
	has to be renamed (not re-created) to keep the practitioners already selected
	on existing rules.
	"""
	doctype = "Practitioner Multiselect"
	if not frappe.db.exists("DocType", doctype):
		return

	has_typo = frappe.db.has_column(doctype, "practioner")
	has_correct = frappe.db.has_column(doctype, "practitioner")

	if has_typo and not has_correct:
		rename_field(doctype, "practioner", "practitioner")
		return

	if has_typo and has_correct:
		# Both columns present (the new one was added empty): keep what is set.
		frappe.db.sql(
			"""
			UPDATE `tabPractitioner Multiselect`
			SET practitioner = practioner
			WHERE IFNULL(practitioner, '') = '' AND IFNULL(practioner, '') != ''
			"""
		)
		frappe.db.sql("ALTER TABLE `tabPractitioner Multiselect` DROP COLUMN `practioner`")
