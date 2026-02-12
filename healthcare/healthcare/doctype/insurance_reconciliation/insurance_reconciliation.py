from frappe.model.document import Document


class InsuranceReconciliation(Document):
	"""Header document for insurance claim reconciliation.

	This is the place to add logic later for:
	- validating that allocated amounts match total_received
	- updating related Insurance Claim documents
	- optionally updating linked Payment Entry allocations
	"""

	pass

