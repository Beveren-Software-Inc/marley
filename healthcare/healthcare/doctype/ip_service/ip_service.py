from frappe.model.document import Document

from healthcare.api.utils.api_utility import get_next_transaction_number


def assign_ip_service_trans_no(doc) -> None:
	"""Assign trans_no for new IP Service records (autoname: field:trans_no)."""
	if (doc.get("trans_no") or "").strip():
		return
	doc.trans_no = get_next_transaction_number("IP Service", fieldname="trans_no")


class IPService(Document):
	def before_insert(self):
		assign_ip_service_trans_no(self)
