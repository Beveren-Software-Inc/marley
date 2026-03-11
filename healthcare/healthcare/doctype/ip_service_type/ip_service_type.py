# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class IPServiceType(Document):
	"""Template for IP/hospital services (e.g. Transport with Nurse, Transport Only).
	Used as template_dn with template_dt='IP Service Type' on Service Request.
	"""
	pass
