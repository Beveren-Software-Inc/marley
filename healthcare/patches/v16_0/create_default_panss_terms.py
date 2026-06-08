import frappe

from healthcare.api.panss_assessment import ensure_default_panss_terms


def execute():
	ensure_default_panss_terms()
	frappe.db.commit()
