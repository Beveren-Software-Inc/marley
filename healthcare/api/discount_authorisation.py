# Copyright (c) 2026, healthcare contributors
"""LAB-062 - management approval for discounts above a threshold.

A Workflow on Sales Invoice was deliberately avoided: the klik_pos POS flow
submits invoices programmatically and Frappe allows only one active workflow per
doctype, so a workflow here would break the till. Instead the discount is gated
by a threshold plus a named authoriser, which works for both POS and back office.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import flt

AUTHORISER_ROLES = ("Healthcare Administrator", "Accounts Manager", "System Manager")


def _threshold() -> float:
	return flt(
		frappe.db.get_single_value("Healthcare Settings", "discount_approval_threshold_percent")
	)


def _enabled() -> bool:
	return bool(
		frappe.db.get_single_value("Healthcare Settings", "require_discount_approval")
	)


def _effective_discount_percent(doc) -> float:
	pct = flt(doc.get("additional_discount_percentage"))
	if pct:
		return pct
	net = flt(doc.get("base_net_total")) or flt(doc.get("net_total"))
	amount = flt(doc.get("discount_amount"))
	if net and amount:
		return amount / net * 100.0
	return 0.0


def validate_discount_authorisation(doc, method=None) -> None:
	"""Sales Invoice / Sales Order `validate` hook."""
	if not _enabled() or doc.get("is_return"):
		return

	threshold = _threshold()
	if not threshold:
		return

	pct = _effective_discount_percent(doc)
	if pct <= threshold:
		return

	if doc.meta.has_field("custom_discount_authorised_by") and doc.get(
		"custom_discount_authorised_by"
	):
		return

	if set(frappe.get_roles()).intersection(AUTHORISER_ROLES):
		# The authoriser is acting directly - stamp them and allow it.
		if doc.meta.has_field("custom_discount_authorised_by"):
			doc.custom_discount_authorised_by = frappe.session.user
			if doc.meta.has_field("custom_discount_authorised_on"):
				doc.custom_discount_authorised_on = frappe.utils.now_datetime()
		return

	frappe.throw(
		_(
			"A discount of {0}% exceeds the {1}% approval threshold. "
			"Management authorisation is required before this can be saved."
		).format(round(pct, 2), threshold),
		title=_("Discount approval required"),
	)
