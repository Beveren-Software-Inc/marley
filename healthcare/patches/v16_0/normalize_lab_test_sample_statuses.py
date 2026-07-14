import frappe


def execute():
	"""F027: Sample Collection previously wrote case-variant Lab Test statuses that did
	not match the Lab Test `status` Select options, so exact-string filters missed them.
	Normalise existing rows to the canonical Select values."""
	frappe.db.sql(
		"""UPDATE `tabLab Test` SET status = 'Sample Collected'
		   WHERE status = 'Sample collected'"""
	)
	frappe.db.sql(
		"""UPDATE `tabLab Test` SET status = 'Sample Collection in Progress'
		   WHERE status = 'Sample collection in progress'"""
	)
