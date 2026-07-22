import frappe


def execute():
	"""The React portal creates Clinical Notes typed "Psychologist Order" and
	"Doctors Note", but those Clinical Note Type masters were never seeded —
	every such create failed with LinkValidationError."""
	for note_type in ("Psychologist Order", "Doctors Note"):
		if not frappe.db.exists("Clinical Note Type", note_type):
			frappe.get_doc(
				{"doctype": "Clinical Note Type", "clinical_note_type": note_type}
			).insert(ignore_permissions=True)
