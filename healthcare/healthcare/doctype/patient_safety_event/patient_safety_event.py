import frappe
from frappe.model.document import Document


class PatientSafetyEvent(Document):
	"""Simple controller for Patient Safety Event.

	Currently no custom logic; exists so Frappe can import the doctype module.
	"""
	pass

