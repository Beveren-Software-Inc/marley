"""Ensure Subscription Medication Plan Item.dosage_form values exist as Pharmaceutical Form.

The plan-item Link was switched from Dosage Form to Pharmaceutical Form (same concept as
prescription lines). Existing rows may still hold Dosage Form names that are missing from
Pharmaceutical Form; give-out / stop save the whole Long Acting Medicine and would fail
link validation. Create missing Pharmaceutical Form masters from Dosage Form (or the
stored text), then leave values that cannot be created cleared.
"""

from __future__ import annotations

import frappe


def _ensure_pharmaceutical_form(name: str) -> bool:
	name = (name or "").strip()
	if not name:
		return False
	if frappe.db.exists("Pharmaceutical Form", name):
		return True
	if not frappe.db.exists("DocType", "Pharmaceutical Form"):
		return False
	try:
		doc = frappe.get_doc(
			{
				"doctype": "Pharmaceutical Form",
				"pharmaceutical_form": name,
			}
		)
		doc.insert(ignore_permissions=True)
		return True
	except Exception:
		frappe.log_error(
			title=f"Could not create Pharmaceutical Form {name!r}",
			message=frappe.get_traceback(),
		)
		return False


def execute():
	if not frappe.db.exists("DocType", "Pharmaceutical Form"):
		return
	if not frappe.db.exists("DocType", "Subscription Medication Plan Item"):
		return
	if not frappe.db.has_column("Subscription Medication Plan Item", "dosage_form"):
		return

	values = frappe.db.sql(
		"""
		SELECT DISTINCT dosage_form
		FROM `tabSubscription Medication Plan Item`
		WHERE IFNULL(dosage_form, '') != ''
		"""
	)
	clear: list[str] = []
	for (raw,) in values:
		name = (raw or "").strip()
		if not name:
			continue
		if _ensure_pharmaceutical_form(name):
			continue
		clear.append(name)

	for name in clear:
		frappe.db.sql(
			"""
			UPDATE `tabSubscription Medication Plan Item`
			SET dosage_form = NULL
			WHERE dosage_form = %s
			""",
			(name,),
		)
