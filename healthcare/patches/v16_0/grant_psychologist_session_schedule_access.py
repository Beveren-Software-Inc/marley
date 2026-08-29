import frappe
from frappe.permissions import add_permission, update_permission_property

# Psychologists are routed to /psychologist?screen=t-session. Session Schedule
# (and Patient Appointment on the same panel) had no Psychologist DocPerms, so
# the list APIs 403'd even after the UI gate was removed.
TARGET_ROLE = "Psychologist"
DOCTYPES = ["Session Schedule", "Patient Appointment"]
READ_ONLY_DOCTYPES = ["Healthcare Service Template"]


def execute():
	if not frappe.db.exists("Role", TARGET_ROLE):
		return
	for dt in DOCTYPES:
		if not frappe.db.exists("DocType", dt):
			continue
		add_permission(dt, TARGET_ROLE, 0)
		for ptype in ("read", "write", "create", "select"):
			update_permission_property(dt, TARGET_ROLE, 0, ptype, 1, validate=False)
	for dt in READ_ONLY_DOCTYPES:
		if not frappe.db.exists("DocType", dt):
			continue
		add_permission(dt, TARGET_ROLE, 0)
		for ptype in ("read", "select"):
			update_permission_property(dt, TARGET_ROLE, 0, ptype, 1, validate=False)
	frappe.clear_cache()
