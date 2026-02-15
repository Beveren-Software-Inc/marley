from frappe.model.document import Document


class InsuranceClaimItem(Document):
	"""Child table rows for Insurance Claim.

	Currently no custom server-side logic; this class exists
	only to satisfy Frappe's doctype module import during migrate.
	"""

	pass

