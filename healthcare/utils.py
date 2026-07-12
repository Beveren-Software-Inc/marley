# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt



import frappe
from frappe import _


def get_current_user_practitioner():
	"""
	Get the Healthcare Practitioner linked to the current logged-in user.
	
	Returns:
	    str: The practitioner name if found, None otherwise.
	    
	Usage in form hooks:
	    def onload(doc):
	        from healthcare.healthcare.utils import auto_populate_practitioner
	        auto_populate_practitioner(doc, ['doctor', 'nurse'])
	"""
	user = frappe.session.user
	
	if user == "Guest":
		return None
	
	# Find Healthcare Practitioner linked to this user via user_id field
	practitioner = frappe.db.get_value(
		"Healthcare Practitioner",
		{"user_id": user, "status": "Active"},
		"name"
	)
	
	return practitioner if practitioner else None


def auto_populate_practitioner(doc, fields=None):
	"""
	Auto-populate practitioner fields with the current user's linked Healthcare Practitioner.
	
	This is a convenience function to be used in form hooks (before_insert, onload, etc.)
	to automatically fill practitioner/doctor/nurse fields when creating documents.
	
	Args:
	    doc: The Frappe document being edited
	    fields: List of field names to populate (e.g., ['doctor', 'nurse', 'practitioner'])
	           If None, will try common field names: ['practitioner', 'doctor', 'nurse',
	           'anesthesiologist', 'psychologist', 'assigned_nurse', 'anesthesiologist', 
	           'assist_doctor', 'psychiatrist']
	
	Example:
	    # In DocType hooks or controller:
	    def onload(self):
	        from healthcare.healthcare.utils import auto_populate_practitioner
	        # Auto-populate only doctor and nurse
	        auto_populate_practitioner(self, ['doctor', 'nurse'])
	        
	        # Auto-populate any detected practitioner fields
	        auto_populate_practitioner(self)
	
	Returns:
	    None (modifies doc in place)
	"""
	
	if not fields:
		# List of common practitioner field names to check
		fields = [
			'practitioner',
			'doctor',
			'nurse',
			'anesthesiologist',
			'psychologist',
			'assigned_nurse',
			'assist_doctor',
			'psychiatrist',
			'primary_practitioner',
			'secondary_practitioner',
			'referring_doctor',
			'ref_practitioner',
		]
	
	# Get current user's practitioner
	practitioner = get_current_user_practitioner()
	
	if not practitioner:
		# User is not linked to any healthcare practitioner
		return
	
	# Populate matching fields that exist in the doctype and are currently empty
	for field in fields:
		if hasattr(doc, field):
			field_value = getattr(doc, field, None)
			# Only populate if field is empty
			if not field_value:
				setattr(doc, field, practitioner)


def get_practitioner_display_name(practitioner_name):
	"""
	Get the display name (practitioner_name) for a given Healthcare Practitioner.
	
	Args:
	    practitioner_name (str): The Healthcare Practitioner document name
	
	Returns:
	    str: The practitioner_name field value if found, None otherwise
	"""
	if not practitioner_name:
		return None
	
	return frappe.db.get_value(
		"Healthcare Practitioner",
		practitioner_name,
		"practitioner_name"
	)


def get_practitioner_medical_role(practitioner_name):
	"""
	Get the medical role for a given Healthcare Practitioner.
	
	Args:
	    practitioner_name (str): The Healthcare Practitioner document name
	
	Returns:
	    str: The medical_role field value if found, None otherwise
	"""
	if not practitioner_name:
		return None
	
	return frappe.db.get_value(
		"Healthcare Practitioner",
		practitioner_name,
		"medical_role"
	)


def get_practitioner_department(practitioner_name):
	"""
	Get the department for a given Healthcare Practitioner.
	
	Args:
	    practitioner_name (str): The Healthcare Practitioner document name
	
	Returns:
	    str: The department field value if found, None otherwise
	"""
	if not practitioner_name:
		return None
	
	return frappe.db.get_value(
		"Healthcare Practitioner",
		practitioner_name,
		"department"
	)
