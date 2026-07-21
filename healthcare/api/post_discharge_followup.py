# Copyright (c) 2026, healthcare contributors
"""DOC-048 - automatic free follow-up visit after discharge.

The existing transfer_medications_on_discharge() is doctor-triggered from the
SPA and prices the visit normally. The BRD asks for the follow-up visit to be
raised automatically on discharge and to be free of charge.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import add_days, getdate, nowdate

FOLLOW_UP_VISIT_TYPE = "Follow-up for the Psychiatrist"


def _enabled() -> bool:
	return bool(
		frappe.db.get_single_value("Healthcare Settings", "auto_free_visit_after_discharge")
	)


def _free_visit_days() -> int:
	value = frappe.db.get_single_value("Healthcare Settings", "free_visit_days_after_discharge")
	try:
		return int(value or 0) or 14
	except (TypeError, ValueError):
		return 14


def create_free_followup_visit(doc, method=None) -> None:
	"""Discharge `on_submit` hook."""
	if not _enabled():
		return

	patient = doc.get("patient")
	if not patient:
		admission = doc.get("admission_no") or doc.get("inpatient_admission")
		if admission:
			patient = frappe.db.get_value("Inpatient Admission", admission, "patient")
	if not patient:
		return

	if not frappe.db.exists("Patient Visit Type", FOLLOW_UP_VISIT_TYPE):
		return

	# Never raise a second free visit for the same discharge.
	if frappe.db.exists("Patient Visit", {"discharge_reference": doc.name}):
		return

	target_date = add_days(getdate(doc.get("discharge_date") or nowdate()), _free_visit_days())

	visit = frappe.new_doc("Patient Visit")
	visit.patient = patient
	visit.visit_type = FOLLOW_UP_VISIT_TYPE
	visit.encounter_date = target_date
	visit.status = "Open"
	visit.company = doc.get("company")
	if visit.meta.has_field("cost_center"):
		visit.cost_center = doc.get("cost_center")
	if visit.meta.has_field("practitioner"):
		visit.practitioner = doc.get("discharge_doctor")
	# free of charge
	visit.visit_price = 0
	if visit.meta.has_field("discount_percentage"):
		visit.discount_percentage = 100
	if visit.meta.has_field("discharge_reference"):
		visit.discharge_reference = doc.name
	if visit.meta.has_field("is_free_visit"):
		visit.is_free_visit = 1

	try:
		visit.flags.ignore_mandatory = True
		visit.insert(ignore_permissions=True)
		doc.add_comment(
			"Info",
			_("Free follow-up visit {0} scheduled for {1} after discharge.").format(
				visit.name, target_date
			),
		)
	except Exception:
		frappe.log_error(
			title="DOC-048 free follow-up visit failed",
			message=f"Discharge {doc.name}\n{frappe.get_traceback()}",
		)
