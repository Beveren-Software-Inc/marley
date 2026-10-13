# -*- coding: utf-8 -*-
# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

"""Raise the ECT Service Request + ECT Service when a Patient Visit asks for ECT.

A ``Patient Visit Type`` flagged with ``is_ect_request`` means the visit is an ECT
request. For such a visit we:

1. Raise a draft ``Service Request`` for the default ECT service configured on
   Healthcare Settings (``default_ect_op_service`` for OP visits,
   ``default_ect_ip_service`` for visits linked to an Inpatient Admission), linked back
   to the visit through ``source_doc`` / ``order_group``.
2. Create the ECT Service (``IP Service``) for the visit from that request.

The ``IP Service`` is created with ``service_request`` set on purpose: that is what
makes ``create_ip_service`` skip Sales Order creation. The visit already carries the
ECT charge from the Patient Visit Type's *Services* table, so nothing must be billed
twice here.

Its service line is dated with the visit's **encounter date** (never today's date), so
an old visit converted later still carries the date the patient was seen.
"""

import frappe
from frappe.utils import flt, getdate, nowtime

# Patient care type -> Healthcare Settings field holding the default ECT service.
ECT_DEFAULT_SETTINGS_FIELD = {
	"OP": "default_ect_op_service",
	"IP": "default_ect_ip_service",
}


def get_ect_patient_care_type(visit):
	"""Return "IP" when the visit belongs to an admission, otherwise "OP"."""
	return "IP" if (visit.get("inpatient_record") or "").strip() else "OP"


def get_ect_service_date(visit):
	"""The date the ECT Service belongs to: the visit's encounter date.

	Falls back to the date the visit was created when no encounter date was recorded,
	and returns ``None`` when neither is known (``create_ip_service`` then dates the
	line with the Service Request's order date, else today).
	"""
	return visit.get("encounter_date") or (getdate(visit.creation) if visit.get("creation") else None)


def get_default_ect_service(patient_care_type):
	"""Return the default ECT Healthcare Service Template name for OP/IP, else None."""
	field = ECT_DEFAULT_SETTINGS_FIELD.get(patient_care_type)
	if not field:
		return None

	template_name = (frappe.db.get_single_value("Healthcare Settings", field) or "").strip()
	if template_name and frappe.db.exists("Healthcare Service Template", template_name):
		return template_name
	return None


def is_ect_request_visit_type(visit_type):
	"""True when the Patient Visit Type is flagged Is ECT Request."""
	if not visit_type:
		return False
	return bool(frappe.db.get_value("Patient Visit Type", visit_type, "is_ect_request"))


def create_ect_service_for_visit(visit):
	"""Create the ECT Service Request + ECT Service for ``visit``.

	Returns the Service Request name, or ``None`` when nothing was created. This never
	raises — a visit must not fail because its ECT request could not be raised.
	"""
	if not visit.get("patient") or not visit.get("name"):
		return None

	# Bulk / legacy imports are historical records; do not raise requests for them.
	if frappe.flags.in_import or getattr(visit.flags, "from_legacy_import", False):
		return None

	patient_care_type = get_ect_patient_care_type(visit)
	template_name = get_default_ect_service(patient_care_type)
	if not template_name:
		frappe.log_error(
			title="ECT Service Request not created",
			message=(
				f"Patient Visit {visit.name}: no default ECT {patient_care_type} service is set in "
				"Healthcare Settings (Default ECT OP Service / Default ECT IP Service)."
			),
		)
		return None

	practitioner = (visit.get("practitioner") or "").strip() or _appointment_practitioner(visit)
	if not practitioner:
		frappe.log_error(
			title="ECT Service Request not created",
			message=(
				f"Patient Visit {visit.name}: the ECT Service Request needs a Practitioner, and "
				"neither the visit nor its appointment has one."
			),
		)
		return None

	service_request = _find_existing_request(visit.name, template_name) or _insert_request(
		visit, template_name, patient_care_type, practitioner
	)
	if not service_request:
		return None

	_ensure_ect_service(visit, service_request)
	return service_request


def _appointment_practitioner(visit):
	"""Practitioner of the visit's appointment — the ECT request needs one."""
	appointment = (visit.get("appointment") or "").strip()
	if not appointment or not frappe.db.exists("Patient Appointment", appointment):
		return None
	return frappe.db.get_value("Patient Appointment", appointment, "practitioner")


def _find_existing_request(visit_name, template_name):
	"""Non-cancelled request already raised for this visit + template, if any.

	Covers retried inserts and re-created visits pointing at the same visit group.
	"""
	return frappe.db.exists(
		"Service Request",
		{
			"order_group": visit_name,
			"template_dt": "Healthcare Service Template",
			"template_dn": template_name,
			"docstatus": ["!=", 2],
		},
	)


def _insert_request(visit, template_name, patient_care_type, practitioner):
	"""Insert the draft ECT Service Request. Returns its name, or None on failure."""
	try:
		from healthcare.healthcare.doctype.healthcare_service_template.healthcare_service_template import (
			get_healthcare_service_template_rate,
		)

		rate = flt(
			get_healthcare_service_template_rate(
				template_name=template_name, patient_care_type=patient_care_type
			),
			2,
		)

		request = frappe.get_doc(
			{
				"doctype": "Service Request",
				"naming_series": "HSR-",
				"status": "draft-Request Status",
				"patient": visit.patient,
				"patient_visit": visit.name,
				"inpatient_record": visit.get("inpatient_record"),
				"practitioner": practitioner,
				"assigned_healthcare_practioner": practitioner,
				"medical_department": visit.get("medical_department"),
				"order_date": visit.get("encounter_date") or frappe.utils.nowdate(),
				"order_time": visit.get("encounter_time") or nowtime(),
				"company": visit.get("company"),
				"cost_center": visit.get("cost_center"),
				"template_dt": "Healthcare Service Template",
				"template_dn": template_name,
				"quantity": 1,
				"cost": rate,
				"grand_total": rate,
				"source_doc": "Patient Visit",
				"order_group": visit.name,
			}
		)
		request.insert(ignore_permissions=True)
	except Exception:
		frappe.log_error(
			title=f"ECT Service Request failed for Patient Visit {visit.name}",
			message=frappe.get_traceback(),
		)
		return None

	return request.name


def _ensure_ect_service(visit, service_request_name):
	"""Create the ECT Service (``IP Service``) for the visit from its request.

	``service_request`` is passed on purpose — ``create_ip_service`` skips Sales Order
	creation when it is set, so the session is not billed on top of the visit charge.
	Returns the ``IP Service`` name, or None when it could not be created.
	"""
	if not frappe.db.exists("DocType", "IP Service"):
		return None

	existing = frappe.db.exists(
		"IP Service", {"service_request": service_request_name, "docstatus": ["!=", 2]}
	)
	if existing:
		return existing

	try:
		from healthcare.api.ip_service import create_ip_service

		result = create_ip_service(
			admission_no=(visit.get("inpatient_record") or "").strip() or None,
			patient_visit=visit.name,
			cost_center=(visit.get("cost_center") or "").strip() or None,
			service_request=service_request_name,
			category="Medical Service",
			service_date=get_ect_service_date(visit),
		)
	except Exception:
		frappe.log_error(
			title=f"ECT Service not created for Patient Visit {visit.name}",
			message=frappe.get_traceback(),
		)
		return None

	ip_service = result.get("name") if isinstance(result, dict) else None
	if ip_service:
		_mark_request_booked(service_request_name)
	return ip_service


def _mark_request_booked(service_request_name):
	"""Flag the request as fulfilled so it cannot be booked into a second ECT Service."""
	if not frappe.get_meta("Service Request").has_field("booked"):
		return
	frappe.db.set_value("Service Request", service_request_name, "booked", 1, update_modified=False)
