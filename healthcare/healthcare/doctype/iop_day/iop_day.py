# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class IOPDay(Document):
	"""IOP schedule for a single day: date + list of sessions (e.g. Morning Group, Afternoon)."""

	pass
