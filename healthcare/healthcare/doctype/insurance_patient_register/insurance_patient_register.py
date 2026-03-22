# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import add_days, getdate, nowdate


class InsurancePatientRegister(Document):
	pass


def expire_unused_registers():
	"""Daily scheduler: mark Unused IPRs as Expired when approval validity has lapsed."""
	today = getdate(nowdate())
	registers = frappe.get_all(
		"Insurance Patient Register",
		filters={"status": "Unused", "approval_validitydays": [">", 0], "posting_date": ["is", "set"]},
		fields=["name", "posting_date", "approval_validitydays"],
	)
	for reg in registers:
		try:
			expiry_date = add_days(getdate(reg.posting_date), int(reg.approval_validitydays))
			if expiry_date < today:
				frappe.db.set_value("Insurance Patient Register", reg.name, "status", "Expired")
		except Exception:
			frappe.log_error(
				title="IPR expiry error",
				message=frappe.get_traceback(),
			)
