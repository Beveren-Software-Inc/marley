# Copyright (c) 2026, healthcare contributors
"""WF-025 - patient category drives priority handling.

Each Patient Category carries a priority level. That level is stamped onto the
Patient Appointment and Patient Visit when they are saved, so reception and
clinical queues can sort and filter by it.
"""

from __future__ import annotations

import frappe

PRIORITY_ORDER = {"Critical": 1, "High": 2, "Normal": 3, "Low": 4}
DEFAULT_PRIORITY = "Normal"


def get_category_priority(category: str | None) -> str:
	if not category:
		return DEFAULT_PRIORITY
	priority = frappe.db.get_value("Patient Category", category, "priority_level")
	return priority or DEFAULT_PRIORITY


def get_patient_priority(patient: str | None) -> str:
	if not patient:
		return DEFAULT_PRIORITY
	category = frappe.db.get_value("Patient", patient, "category")
	return get_category_priority(category)


def set_priority_on_save(doc, method=None) -> None:
	"""`validate` hook for Patient Appointment and Patient Visit."""
	if not doc.meta.has_field("patient_priority"):
		return
	# Respect a value a user has deliberately overridden on this document.
	if doc.get("patient_priority_overridden"):
		return
	doc.patient_priority = get_patient_priority(doc.get("patient"))


@frappe.whitelist()
def get_priority_queue(cost_center: str | None = None, limit: int = 100) -> list[dict]:
	"""Open appointments for the day, highest priority first.

	Used by the reception queue so VIP / Royal and insurance-military patients
	surface above routine walk-ins.
	"""
	filters = {
		"appointment_date": frappe.utils.today(),
		"status": ["not in", ["Cancelled", "Closed", "No Show"]],
	}
	if cost_center:
		filters["cost_center"] = cost_center

	rows = frappe.get_all(
		"Patient Appointment",
		filters=filters,
		fields=[
			"name",
			"patient",
			"patient_name",
			"appointment_time",
			"status",
			"practitioner",
			"patient_priority",
		],
		limit_page_length=limit,
	)

	rows.sort(
		key=lambda r: (
			PRIORITY_ORDER.get(r.get("patient_priority") or DEFAULT_PRIORITY, 3),
			r.get("appointment_time") or "",
		)
	)
	return rows


def backfill_patient_priority(doctype: str = "Patient Appointment", batch: int = 2000) -> int:
	"""One-off helper to stamp priority on existing open records."""
	names = frappe.get_all(
		doctype,
		filters={"patient_priority": ["in", [None, ""]]},
		pluck="name",
		limit_page_length=batch,
	)
	for name in names:
		patient = frappe.db.get_value(doctype, name, "patient")
		frappe.db.set_value(
			doctype, name, "patient_priority", get_patient_priority(patient), update_modified=False
		)
	frappe.db.commit()
	return len(names)
