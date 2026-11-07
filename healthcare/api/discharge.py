# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import cstr

from healthcare.api.inpatient_admission import (
	_ensure_discharge_admission_access,
	_user_can_access_discharge_portal,
)


def _is_legacy_oracle_user_code(value: str | None) -> bool:
	"""Legacy import stores Oracle USR_NUM in Discharged By (e.g. 263), not a User email."""
	text = cstr(value).strip()
	if not text or "@" in text:
		return False
	if text.endswith(".0"):
		text = text[:-2]
	return text.isdigit()


def _discharged_by_display_name(value: str | None, oracle_names: dict[str, str] | None = None) -> str:
	"""User full name when Discharged By is a Frappe User; otherwise Oracle User for a legacy code."""
	value = cstr(value).strip()
	if not value:
		return ""
	user_name = cstr(frappe.db.get_value("User", value, "full_name") or "").strip()
	if user_name:
		return user_name
	if not _is_legacy_oracle_user_code(value):
		return ""
	if oracle_names is not None:
		from healthcare.api.discharge_checklist_import import _clean_oracle_num

		return cstr(oracle_names.get(_clean_oracle_num(value)) or "").strip()
	from healthcare.api.usr_00_01_import import get_user_name

	return cstr(get_user_name(value) or "").strip()


def _attach_discharged_by_name(doc, oracle_names: dict[str, str] | None = None) -> None:
	if not doc:
		return
	name = _discharged_by_display_name(doc.get("discharged_by_user"), oracle_names=oracle_names)
	if name:
		doc["discharged_by_user_name"] = name


@frappe.whitelist()
def get_discharge(name=None):
	"""Return one Discharge for the healthcare portal (bypasses DocPerm read for clinical roles)."""
	from healthcare.healthcare.doctype.discharge.discharge import get_stopped_medications_for_admission
	from healthcare.healthcare.doctype.inpatient_admission.inpatient_admission import resolve_admission_datetime

	name = (name or "").strip()
	if not name:
		frappe.throw(_("Discharge is required"))
	if not frappe.db.exists("Discharge", name):
		frappe.throw(_("Discharge {0} not found").format(name))

	if frappe.has_permission("Discharge", "read", name):
		doc = frappe.get_doc("Discharge", name).as_dict()
	elif not _user_can_access_discharge_portal():
		frappe.throw(_("Not permitted to read Discharge"), frappe.PermissionError)
	else:
		admission = frappe.db.get_value("Discharge", name, "admission")
		if admission:
			_ensure_discharge_admission_access(admission)
		doc = frappe.get_doc("Discharge", name).as_dict()

	if doc.get("admission"):
		from healthcare.api.medicine_given import get_discharge_prescription_sections

		sections = get_discharge_prescription_sections(doc["admission"])
		doc["current_medications"] = sections.get("current_medications") or []
		doc["discharged_medications"] = sections.get("discharged_medications") or []
		doc["stopped_medications"] = sections.get("stopped_medications") or get_stopped_medications_for_admission(
			doc["admission"]
		)
		if not (doc.get("duration") or "").strip():
			admission_spend = frappe.db.get_value(
				"Inpatient Admission", doc["admission"], "spend_daysduration"
			)
			if admission_spend:
				doc["admission_spend_days"] = admission_spend

		# Admission datetime so the portal can calculate spend days when none were imported.
		admission_row = frappe.db.get_value(
			"Inpatient Admission",
			doc["admission"],
			["admitted_datetime", "admission_date", "admission_time"],
			as_dict=True,
		)
		if admission_row:
			admission_dt = resolve_admission_datetime(
				admission_row.get("admitted_datetime"),
				admission_row.get("admission_date"),
				admission_row.get("admission_time"),
			)
			if admission_dt:
				doc["admission_date"] = str(admission_dt)
	else:
		doc["current_medications"] = []
		doc["discharged_medications"] = []
		doc["stopped_medications"] = []

	if not doc.get("discharge_date") and doc.get("final_discharge_date"):
		doc["display_discharge_date"] = doc["final_discharge_date"]
	else:
		doc["display_discharge_date"] = doc.get("discharge_date")

	_attach_discharged_by_name(doc)
	return doc


@frappe.whitelist()
def get_discharges(limit=20, offset=0, patient=None, admission=None, search=None, from_date=None, to_date=None, status=None, discharge_type=None, exclude_cancelled=None):
	"""Get list of Discharge documents with pagination.
	Returns { data: [...], total_count: N }
	"""
	from frappe.utils import cint
	from healthcare.api.common import get_permitted_cost_centers
	from healthcare.healthcare.discharge_checklist_status import attach_checklist_status_to_discharges
	from healthcare.healthcare.doctype.inpatient_admission.inpatient_admission import resolve_admission_datetime

	limit = cint(limit) or 20
	offset = cint(offset) or 0
	portal_reader = _user_can_access_discharge_portal()
	has_read = frappe.has_permission("Discharge", "read")
	ignore_permissions = portal_reader and not has_read

	filters = {}

	if patient:
		filters['file_no'] = patient

	if admission:
		filters['admission'] = admission

	if search and search.strip():
		filters['name'] = ['like', f'%{search.strip()}%']

	if from_date and to_date:
		filters['discharge_date'] = ['between', [from_date, to_date]]
	elif from_date:
		filters['discharge_date'] = ['>=', from_date]
	elif to_date:
		filters['discharge_date'] = ['<=', to_date]

	if status:
		docstatus_map = {'Draft': 0, 'Submitted': 1, 'Cancelled': 2}
		if status in docstatus_map:
			filters['docstatus'] = docstatus_map[status]
	elif cint(exclude_cancelled):
		filters['docstatus'] = ['!=', 2]

	if discharge_type:
		filters['discharge_type'] = discharge_type

	# ── Cost-centre User Permission enforcement ──────────────────────────────
	permitted_cc = get_permitted_cost_centers()
	if permitted_cc is not None:
		if not permitted_cc:
			return {"data": [], "total_count": 0}
		filters['cost_center'] = ['in', permitted_cc]

	total_count = len(frappe.get_all(
		'Discharge',
		filters=filters,
		fields=['name'],
		limit=0,
		ignore_permissions=ignore_permissions,
	))

	discharges = frappe.get_all(
		'Discharge',
		filters=filters,
		fields=[
			'name',
			'admission',
			'file_no',
			'patient_name',
			'discharge_date',
			'final_discharge_date',
			'duration',
			'discharge_type',
			'discharged_by_user',
			'final_discharge_user_id',
			'receiving_doctors',
			'discharge_template',
			'docstatus',
			'cost_center',
		],
		limit=limit,
		limit_start=offset,
		order_by='discharge_date desc',
		ignore_permissions=ignore_permissions,
	)
	
	from healthcare.api.usr_00_01_import import get_user_name_map

	oracle_names = get_user_name_map()

	# Get patient names if not already set
	for discharge in discharges:
		if discharge.file_no and not discharge.patient_name:
			patient_name = frappe.db.get_value('Patient', discharge.file_no, 'patient_name')
			if patient_name:
				discharge['patient_name'] = patient_name

		_attach_discharged_by_name(discharge, oracle_names=oracle_names)

		if discharge.final_discharge_user_id:
			final_user_name = frappe.db.get_value('User', discharge.final_discharge_user_id, 'full_name')
			if final_user_name:
				discharge['final_discharge_user_name'] = final_user_name

		# Get practitioner name
		if discharge.receiving_doctors:
			practitioner_name = frappe.db.get_value('Healthcare Practitioner', discharge.receiving_doctors, 'practitioner_name')
			if practitioner_name:
				discharge['receiving_doctor_name'] = practitioner_name

		# Get template name
		if discharge.discharge_template:
			template_name = frappe.db.get_value('Discharge Template', discharge.discharge_template, 'template_name')
			if template_name:
				discharge['template_name'] = template_name

		# Get admission date from the linked Inpatient Record
		if discharge.admission:
			admission_row = frappe.db.get_value(
				'Inpatient Admission',
				discharge.admission,
				['admitted_datetime', 'admission_date', 'admission_time'],
				as_dict=True,
			)
			if admission_row:
				admission_dt = resolve_admission_datetime(
					admission_row.get('admitted_datetime'),
					admission_row.get('admission_date'),
					admission_row.get('admission_time'),
				)
				if admission_dt:
					discharge['admission_date'] = str(admission_dt)

		if not discharge.get('discharge_date') and discharge.get('final_discharge_date'):
			discharge['display_discharge_date'] = discharge['final_discharge_date']
		else:
			discharge['display_discharge_date'] = discharge.get('discharge_date')

		spend_days = (discharge.get('duration') or '').strip()
		if not spend_days and discharge.get('admission'):
			spend_days = (
				frappe.db.get_value('Inpatient Admission', discharge.admission, 'spend_daysduration') or ''
			).strip()
		if spend_days:
			discharge['spend_days'] = spend_days

	attach_checklist_status_to_discharges(discharges)
	
	return {"data": discharges, "total_count": total_count}