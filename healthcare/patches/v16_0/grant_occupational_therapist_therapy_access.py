import frappe
from frappe.permissions import add_permission, update_permission_property

# F017: the Occupational Therapist role is routed to /therapy but had no DocPerms on
# the therapy doctypes (every panel 403'd). Mirror the Therapist role's Custom DocPerm
# grants so OT gets a working therapy portal, per product decision.
TARGET_ROLE = "Occupational Therapist"
# doctypes the Therapist role is granted (read/write/create) via Custom DocPerm
DOCTYPES = ["Clinical Note", "Inpatient Admission", "Session Schedule"]


def execute():
	if not frappe.db.exists("Role", TARGET_ROLE):
		return
	for dt in DOCTYPES:
		add_permission(dt, TARGET_ROLE, 0)
		for ptype in ("read", "write", "create"):
			update_permission_property(dt, TARGET_ROLE, 0, ptype, 1, validate=False)
	frappe.clear_cache()
