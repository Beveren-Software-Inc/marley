# Copyright (c) 2026, Healthcare and contributors
"""Block new Patient Visit while the patient has a non-closed visit."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import formatdate

# Statuses that allow opening another visit for the same patient.
CLOSED_PATIENT_VISIT_STATUSES = frozenset(
	{
		"Completed",
		"External Referral",
		"Cancelled",
	}
)


def is_block_new_patient_visit_if_open_exist_enabled() -> bool:
	"""Whether Healthcare Settings blocks a second open visit for the same patient."""
	return bool(
		frappe.db.get_single_value(
			"Healthcare Settings",
			"block_new_patient_visit_if_open_exist",
		)
	)


def get_open_patient_visits_for_patient(patient: str | None, exclude_name: str | None = None) -> list[dict]:
	"""Visits that are still active (not Completed / External Referral / Cancelled)."""
	if not patient:
		return []

	filters: dict = {
		"patient": patient,
		"docstatus": ["<", 2],
		"status": ["not in", list(CLOSED_PATIENT_VISIT_STATUSES)],
	}
	if exclude_name:
		filters["name"] = ["!=", exclude_name]

	return frappe.get_all(
		"Patient Visit",
		filters=filters,
		fields=["name", "status", "encounter_date", "practitioner_name"],
		order_by="encounter_date desc, creation desc",
		limit=20,
	)


def ensure_patient_can_open_new_visit(
	patient: str | None,
	exclude_name: str | None = None,
	visit_type: str | None = None,
) -> None:
	"""Raise if the patient already has an open visit (when enabled in Healthcare Settings)."""
	if (visit_type or "").strip() == "Daily Auto Visit":
		return
	if not is_block_new_patient_visit_if_open_exist_enabled():
		return

	open_visits = get_open_patient_visits_for_patient(patient, exclude_name=exclude_name)
	if not open_visits:
		return

	lines = []
	for visit in open_visits[:5]:
		date_label = formatdate(visit.encounter_date) if visit.get("encounter_date") else ""
		lines.append(
			_("{0} — {1}{2}").format(
				visit.name,
				visit.status,
				f" ({date_label})" if date_label else "",
			)
		)

	detail = "<br>".join(lines)
	if len(open_visits) > 5:
		detail += "<br>" + _("…and {0} more").format(len(open_visits) - 5)

	frappe.throw(
		_(
			"This patient already has an open visit. Complete it, mark External Referral, "
			"or cancel it before creating a new visit.<br><br>{0}"
		).format(detail),
		title=_("Open patient visit exists"),
		exc=frappe.ValidationError,
	)
