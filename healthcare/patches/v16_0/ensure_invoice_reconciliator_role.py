import frappe


ROLE = "Invoice Reconciliator"


def execute():
	"""Ensure Invoice Reconciliator role exists for advance↔invoice reconciliation UI."""
	if frappe.db.exists("Role", ROLE):
		return
	doc = frappe.get_doc(
		{
			"doctype": "Role",
			"role_name": ROLE,
			"desk_access": 1,
			"is_custom": 1,
		}
	)
	doc.insert(ignore_permissions=True)
