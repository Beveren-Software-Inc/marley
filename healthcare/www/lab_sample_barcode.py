import frappe
from frappe import _

no_cache = 1


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in to print the sample label"), frappe.AuthenticationError)

	name = (frappe.form_dict.get("name") or "").strip()
	if not name:
		frappe.throw(_("Lab Request is required"))

	from healthcare.api.service_request import get_lab_sample_barcode_label

	context.no_cache = 1
	context.no_header = 1
	context.no_breadcrumbs = 1
	context.no_sidebar = 1
	context.label = get_lab_sample_barcode_label(name)
	context.trigger_print = 1 if frappe.form_dict.get("trigger_print") else 0
	return context
