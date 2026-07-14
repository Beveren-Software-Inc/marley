import frappe
from frappe.permissions import add_permission, update_permission_property

# The Nutritionist role is routed to /nutritionist, which surfaces "Nutritionist Note"
# clinical notes. Grant it the Custom DocPerms the notes need (mirrors the Therapist/OT
# grant) so its screens don't 403.
TARGET_ROLE = "Nutritionist"
DOCTYPES = ["Clinical Note", "Inpatient Admission"]


def execute():
	if not frappe.db.exists("Role", TARGET_ROLE):
		return
	for dt in DOCTYPES:
		add_permission(dt, TARGET_ROLE, 0)
		for ptype in ("read", "write", "create"):
			update_permission_property(dt, TARGET_ROLE, 0, ptype, 1, validate=False)
	frappe.clear_cache()
