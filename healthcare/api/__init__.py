# API endpoints for healthcare app
import frappe


def check_app_permission():
	"""Check if user has permission to access Healthcare app"""
	if frappe.session.user == "Administrator":
		return True

	# Check if user has access to Healthcare module
	allowed_modules = frappe.get_all(
		"Module Def",
		filters={"name": "Healthcare"},
		fields=["name"]
	)
	if not allowed_modules:
		return False

	# Allow users with healthcare-related roles
	roles = frappe.get_roles()
	healthcare_roles = [
		"Healthcare Administrator",
		"Physician",
		"Nursing User",
		"Laboratory User",
		"LabTest Approver",
		"System Manager",
	]
	if any(role in healthcare_roles for role in roles):
		return True

	return False













