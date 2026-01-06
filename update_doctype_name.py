#!/usr/bin/env python3
"""
Script to update Inpatient Record to Inpatient Admission in the database
Run this with: bench --site health execute healthcare.update_doctype_name.update_doctype_name
"""

import frappe

def update_doctype_name():
	"""Update DocType name from Inpatient Record to Inpatient Admission"""
	frappe.connect()
	
	# Check if Inpatient Record exists
	old_name = "Inpatient Record"
	new_name = "Inpatient Admission"
	
	if frappe.db.exists("DocType", old_name):
		print(f"Found {old_name}, updating to {new_name}...")
		
		# Update the DocType name
		frappe.db.sql(f"""
			UPDATE `tabDocType` 
			SET name = '{new_name}' 
			WHERE name = '{old_name}'
		""")
		
		# Update any child table references
		frappe.db.sql(f"""
			UPDATE `tabDocField` 
			SET options = '{new_name}' 
			WHERE options = '{old_name}'
		""")
		
		# Update any custom field references
		frappe.db.sql(f"""
			UPDATE `tabCustom Field` 
			SET options = '{new_name}' 
			WHERE options = '{old_name}'
		""")
		
		frappe.db.commit()
		print(f"Successfully updated {old_name} to {new_name}")
	else:
		print(f"{old_name} not found in database")
		
		# Check if new name already exists
		if frappe.db.exists("DocType", new_name):
			print(f"{new_name} already exists in database")
		else:
			print(f"Neither {old_name} nor {new_name} found. Please check the database.")

if __name__ == "__main__":
	update_doctype_name()
 
 


