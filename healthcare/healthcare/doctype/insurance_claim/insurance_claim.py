from frappe.model.document import Document


class InsuranceClaim(Document):
	"""Header document for insurance claims.

	For now this only provides a concrete class so that Frappe can
	import the doctype module during migrations. Business logic like
	auto-calculating totals or syncing from Sales Invoice can be
	added here later.
	"""

	pass

