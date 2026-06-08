# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import cint, flt, nowdate

from healthcare.api.sales_order_cost_center import (
	apply_cost_center_to_sales_order,
	cost_center_from_visit_or_admission,
)
from healthcare.healthcare.doctype.observation.observation import fill_patient_from_admission

OBSERVATION_PORTAL_READ_ROLES = frozenset(
	{
		"Administrator",
		"System Manager",
		"Healthcare Administrator",
		"Doctor",
		"Nurse",
		"Physician",
		"Psychologist",
		"Anesthesiologist",
		"Therapist",
		"Nutritionist",
	}
)


def _user_can_read_observation_portal() -> bool:
	if frappe.session.user in ("Guest", ""):
		return False
	return bool(OBSERVATION_PORTAL_READ_ROLES & set(frappe.get_roles(frappe.session.user)))


def _enrich_observation_row(obs: dict) -> dict:
	if obs.get("patient") and not obs.get("patient_name"):
		patient_name = frappe.db.get_value("Patient", obs["patient"], "patient_name")
		if patient_name:
			obs["patient_name"] = patient_name
	if obs.get("healthcare_practitioner") and not obs.get("practitioner_name"):
		practitioner_name = frappe.db.get_value(
			"Healthcare Practitioner",
			obs["healthcare_practitioner"],
			"practitioner_name",
		)
		if practitioner_name:
			obs["practitioner_name"] = practitioner_name
	return obs


def _observation_visit_admission_refs(obs_doc):
	"""IP/OP context for Sales Order custom_reference_* — same idea as Service Request."""
	if getattr(obs_doc, "admission_no", None) and frappe.db.exists(
		"Inpatient Admission", obs_doc.admission_no
	):
		return "Inpatient Admission", obs_doc.admission_no

	rdt = (getattr(obs_doc, "reference_doctype", None) or "").strip()
	rdn = (getattr(obs_doc, "reference_docname", None) or "").strip()
	if rdt == "Patient Visit" and rdn and frappe.db.exists("Patient Visit", rdn):
		return "Patient Visit", rdn
	if rdt == "Inpatient Admission" and rdn and frappe.db.exists("Inpatient Admission", rdn):
		return "Inpatient Admission", rdn
	return None, None


@frappe.whitelist()
def get_observations(limit=50, offset=0, patient=None):
	"""Get list of Observations"""
	filters = {}
	
	if patient:
		filters['patient'] = patient
	
	observations = frappe.get_all(
		'Observation',
		filters=filters,
		fields=[
			'name',
			'trans_no',
			'patient',
			'patient_name',
			'observation_category',
			'posting_date',
			'start_date',
			'dc_date',
			'healthcare_practitioner',
			'practitioner_name',
			'obs_code',
			'observation_level',
			'result_data',
			'result_text',
			'result_float',
			'result_select',
			'result_boolean',
			'result_datetime',
			'result_time',
			'medical_department',
			'admission_no',
			'note',
			'amount',
			'duration',
			'designated_security_personel',
			'order_created',
			'reference_doctype',
			'reference_docname',
			'company',
		],
		limit=limit,
		limit_start=offset,
		order_by='posting_date desc, start_date desc'
	)
	
	# Enrich patient / practitioner names
	for obs in observations:
		_enrich_observation_row(obs)
	
	return observations


@frappe.whitelist()
def get_observation(name: str | None = None):
	"""Return one Observation for the healthcare portal (avoids REST DocPerm gaps)."""
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Observation is required"))

	if not frappe.db.exists("Observation", name):
		frappe.throw(_("Observation {0} not found").format(name))

	doc = frappe.get_doc("Observation", name)

	if not frappe.has_permission("Observation", "read", doc=doc):
		if not _user_can_read_observation_portal():
			frappe.throw(_("Not permitted to read Observation"), frappe.PermissionError)

	return _enrich_observation_row(doc.as_dict())


@frappe.whitelist()
def get_observation_level_details(name):
	"""Return billable/item/rate fields for Observation Level picker (portal create form)."""
	if not name:
		return {}
	name = frappe.utils.cstr(name).strip()
	if not frappe.db.exists("Observation Level", name):
		return {}
	row = frappe.db.get_value(
		"Observation Level",
		name,
		[
			"observation_level",
			"interval",
			"is_billable",
			"rate",
			"item",
			"item_code",
			"link_existing_item",
		],
		as_dict=True,
	)
	if not row:
		return {}
	row["rate"] = flt(row.get("rate"))
	return row


@frappe.whitelist()
def create_observation(data):
	"""Create a new Observation"""
	if isinstance(data, str):
		import json
		data = json.loads(data)
	
	if not data.get('patient') and not data.get('admission_no'):
		frappe.throw(_("Patient or Inpatient Admission is required"))
	
	# Note: observation_template is now optional as per user request
	
	# Get naming series
	naming_series = frappe.db.get_value('Observation', {'naming_series': 'HLC-OBS-.YYYY.-'}, 'naming_series')
	if not naming_series:
		naming_series = 'HLC-OBS-.YYYY.-'

	company = data.get('company')
	if not company:
		company = frappe.defaults.get_user_default('Company') or frappe.db.get_single_value(
			'Global Defaults', 'default_company'
		)
	if not company:
		frappe.throw(_("Company is required"))

	amount = flt(data.get('amount'))
	duration = frappe.utils.cstr(data.get('duration') or '').strip()
	lvl_key = frappe.utils.cstr(data.get('observation_level') or '').strip()
	if lvl_key and frappe.db.exists('Observation Level', lvl_key):
		lvl = frappe.db.get_value(
			'Observation Level',
			lvl_key,
			['rate', 'interval'],
			as_dict=True,
		) or {}
		lvl_rate = flt(lvl.get('rate'))
		if lvl_rate and amount <= 0:
			amount = lvl_rate
		if not duration and lvl.get('interval'):
			duration = frappe.utils.cstr(lvl.get('interval')).strip()
	
	# Create the observation
	observation = frappe.get_doc({
		'doctype': 'Observation',
		'patient': data.get('patient'),
		'posting_date': data.get('posting_date') or frappe.utils.now_datetime(),
		'start_date': data.get('start_date') or frappe.utils.today(),
		'status': 'Registered',
		'healthcare_practitioner': data.get('practitioner'),
		'medical_department': data.get('department'),
		'admission_no': data.get('admission_no'),
		'observation_level': data.get('observation_level') or '',
		'designated_security_personel': data.get('designated_security_personel') or '',
		'note': data.get('note') or '',
		'amount': amount,
		'duration': duration,
		'naming_series': naming_series,
		'company': company,
	})
	
	pv = data.get("patient_visit")
	if pv:
		observation.reference_doctype = "Patient Visit"
		observation.reference_docname = pv

	fill_patient_from_admission(observation)
	if not observation.patient:
		frappe.throw(_("Patient is required"))

	observation.insert(ignore_permissions=True)
	
	# Return the created observation
	return {
		'name': observation.name,
		'trans_no': observation.trans_no,
		'patient': observation.patient,
		'patient_name': frappe.db.get_value('Patient', observation.patient, 'patient_name') or observation.patient,
		'observation_level': observation.observation_level,
		'designated_security_personel': observation.designated_security_personel,
		'amount': observation.amount,
		'duration': observation.duration,
		'company': observation.company,
	}


@frappe.whitelist()
def create_sales_order_from_observation(observation_name):
	"""Create a Draft Sales Order for an Observation (or return existing linked on order_created).

	Sets custom_reference_type / custom_reference_name to Patient Visit or Inpatient Admission,
	and custom_base_reference to Observation — same billing convention as Service Request / PMO.
	"""
	if not observation_name:
		frappe.throw(_("Observation name is required"))

	if not frappe.db.exists("Observation", observation_name):
		frappe.throw(_("Observation {0} does not exist").format(observation_name))

	obs = frappe.get_doc("Observation", observation_name)

	if getattr(obs, "order_created", None) and frappe.db.exists("Sales Order", obs.order_created):
		so = frappe.get_doc("Sales Order", obs.order_created)
		return {"sales_order": so.name, "status": so.status, "existing": True}

	if not obs.company:
		frappe.throw(_("Company is required on Observation {0}").format(observation_name))
	if not obs.patient:
		frappe.throw(_("Patient is required on Observation {0}").format(observation_name))

	ref_dt, ref_name = _observation_visit_admission_refs(obs)
	if not ref_dt or not ref_name:
		frappe.throw(
			_(
				"Observation {0} must be linked to an Inpatient Admission or a Patient Visit "
				"(set Admission on IP, or Visit on OP) before creating a Sales Order."
			).format(observation_name)
		)

	if not obs.observation_level:
		frappe.throw(_("Observation Level is required to bill observation {0}").format(observation_name))

	lvl = frappe.get_doc("Observation Level", obs.observation_level)

	if not cint(lvl.is_billable):
		frappe.throw(_("Observation Level {0} must be billable to create a Sales Order").format(lvl.name))

	def _level_has_resolved_item(doc):
		code = (getattr(doc, "item_code", None) or "").strip()
		link = (getattr(doc, "item", None) or "").strip()
		if code and frappe.db.exists("Item", code):
			return True
		if link and frappe.db.exists("Item", link):
			return True
		return False

	if cint(lvl.link_existing_item) and not lvl.item:
		frappe.throw(
			_("Observation Level {0}: link an Item when Link Existing Item is enabled").format(lvl.name)
		)

	if not _level_has_resolved_item(lvl):
		lvl.flags.ignore_permissions = True
		lvl.save()
		lvl.reload()

	item_code = (getattr(lvl, "item_code", None) or getattr(lvl, "item", None) or "").strip()
	if not item_code or not frappe.db.exists("Item", item_code):
		frappe.throw(
			_("Observation Level {0} has no Item for billing — save the level with Is Billable or link an Item").format(
				lvl.name
			)
		)

	billing_rate = flt(obs.amount)
	if billing_rate <= 0:
		billing_rate = flt(getattr(lvl, "rate", None)) or 0

	customer = frappe.db.get_value("Patient", obs.patient, "customer") or obs.patient

	so = frappe.new_doc("Sales Order")
	so.company = obs.company
	so.patient = obs.patient
	so.customer = customer
	so.transaction_date = nowdate()
	so.delivery_date = nowdate()
	so.ignore_pricing_rule = 1

	pname = getattr(obs, "patient_name", None) or frappe.db.get_value("Patient", obs.patient, "patient_name")
	if pname and hasattr(so, "custom_patient_name"):
		so.custom_patient_name = pname
	if hasattr(so, "custom_patient"):
		so.custom_patient = obs.patient

	so.custom_reference_type = ref_dt
	so.custom_reference_name = ref_name
	so.custom_base_reference = "Observation"
	so.custom_base_reference_name = obs.name

	desc = getattr(lvl, "observation_level", None) or obs.observation_level or obs.name
	so.append(
		"items",
		{
			"item_code": item_code,
			"qty": 1,
			"rate": billing_rate,
			"price_list_rate": billing_rate,
			"description": _("Observation {0}: {1}").format(obs.name, desc),
		},
	)

	cc = cost_center_from_visit_or_admission(ref_dt, ref_name)
	apply_cost_center_to_sales_order(so, cc)

	so.insert(ignore_permissions=True)
	frappe.db.set_value("Observation", observation_name, "order_created", so.name)

	return {"sales_order": so.name, "status": so.status, "existing": False}


