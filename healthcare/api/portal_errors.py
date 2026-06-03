# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

"""User-facing error messages for healthcare portal API methods."""

import re

import frappe
from frappe import _

# Common Service Request / portal field labels
_FIELD_LABELS = {
	"cost_center": _("Cost Center"),
	"practitioner": _("Practitioner"),
	"patient": _("Patient"),
	"patient_visit": _("Patient Visit"),
	"inpatient_record": _("Inpatient Admission"),
	"template_dt": _("Template Type"),
	"template_dn": _("Template"),
	"order_date": _("Order Date"),
	"order_time": _("Order Time"),
}


def portal_mandatory_message(exc):
	"""Turn Frappe MandatoryError into a short portal-friendly sentence."""
	text = str(exc) if exc else ""
	# e.g. [Service Request, HSR-00026]: cost_center, practitioner
	if "]:" in text:
		fields_part = text.split("]:", 1)[-1].strip()
		fields = [f.strip() for f in fields_part.split(",") if f.strip()]
		if fields:
			labels = [_FIELD_LABELS.get(f, f.replace("_", " ").title()) for f in fields]
			return _("Please provide: {0}.").format(", ".join(labels))
	match = re.search(r"MandatoryError:\s*\[[^\]]+\]:\s*(.+?)(?:\n|$)", text)
	if match:
		fields = [f.strip() for f in match.group(1).split(",") if f.strip()]
		if fields:
			labels = [_FIELD_LABELS.get(f, f.replace("_", " ").title()) for f in fields]
			return _("Please provide: {0}.").format(", ".join(labels))
	return _("Please fill in all required fields before saving.")


def portal_validation_message(exc):
	"""Short message for ValidationError / explicit frappe.throw."""
	text = str(exc) if exc else ""
	if not text:
		return _("Please check the form and try again.")
	# Strip exception class prefix when present
	for prefix in ("ValidationError:", "frappe.exceptions.ValidationError:"):
		if prefix in text:
			return text.split(prefix, 1)[-1].strip()
	return text.strip()
