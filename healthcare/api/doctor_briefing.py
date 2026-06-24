# -*- coding: utf-8 -*-
"""Doctor shift briefing data for login / landing modals."""

from __future__ import annotations

import frappe
from frappe import _

from healthcare.api.nurse_briefing import (
	_LAB_TEST_BRIEFING_FIELDS,
	_active_admissions,
	_cost_center_filters,
	_resolve_cost_center,
)

DOCTOR_BRIEFING_ROLES = frozenset(
	{
		"Administrator",
		"System Manager",
		"Healthcare Administrator",
		"Doctor",
		"Physician",
	}
)

PENDING_REVIEW_STATUSES = ("Pending Review", "Submitted")


def _require_doctor_briefing_access() -> None:
	if frappe.session.user in ("Guest", ""):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	roles = set(frappe.get_roles(frappe.session.user))
	if not (roles & DOCTOR_BRIEFING_ROLES):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


def _pending_review_lab_tests(cost_center: str | None) -> list[dict]:
	cc_filters = _cost_center_filters(cost_center)
	if cc_filters is None:
		return []

	filters: dict = {
		"docstatus": ["!=", 2],
		"status": ["in", list(PENDING_REVIEW_STATUSES)],
		**cc_filters,
	}

	return frappe.get_all(
		"Lab Test",
		filters=filters,
		fields=_LAB_TEST_BRIEFING_FIELDS,
		order_by="creation desc",
		limit_page_length=150,
	)


@frappe.whitelist()
def get_doctor_shift_briefing(cost_center=None, section=None):
	"""Doctor landing modals. section=admissions|lab_tests."""
	_require_doctor_briefing_access()
	cc = _resolve_cost_center(cost_center)
	section_key = (section or "admissions").strip().lower()

	result = {"cost_center": cc}

	if section_key == "admissions":
		result["active_admissions"] = _active_admissions(cc)
	elif section_key == "lab_tests":
		result["pending_review_lab_tests"] = _pending_review_lab_tests(cc)
	else:
		result["active_admissions"] = _active_admissions(cc)
		result["pending_review_lab_tests"] = _pending_review_lab_tests(cc)

	return result
