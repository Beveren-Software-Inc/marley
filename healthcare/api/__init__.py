"""Public API module for Healthcare app."""

# API endpoints for healthcare app
import frappe


def check_app_permission():
	"""Check if user has permission to see Healthcare app on the desk."""
	if frappe.session.user == "Administrator":
		return True
	if frappe.session.user == "Guest":
		return False

	# Allow any logged-in user to see the icon; doctype permissions control access inside
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

	# If Healthcare module exists, allow users who have access to it
	if frappe.db.exists("Module Def", "Healthcare"):
		return True

	# Fallback: show to all authenticated users (v16 desk visibility)
	return True













