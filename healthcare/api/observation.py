# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate, nowdate

from healthcare.api.sales_order_cost_center import (
	apply_cost_center_to_sales_order,
	cost_center_from_visit_or_admission,
)
from healthcare.healthcare.doctype.observation.observation import (
	fill_patient_from_admission,
	vacate_active_observation_rooms_for_patient,
	vacate_observation_room,
	validate_observation_room_available,
)
from healthcare.healthcare.editing_lock import assert_editing_allowed

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
	if obs.get("room") and not obs.get("room_name"):
		room_name = frappe.db.get_value(
			"Healthcare Service Unit",
			obs["room"],
			"healthcare_service_unit_name",
		)
		if room_name:
			obs["room_name"] = room_name
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
def get_latest_observation_for_admission(admission):
	"""Latest observation record for an admission — discharge form auto-fill."""
	if not admission:
		return None
	rows = frappe.get_all(
		'Observation',
		filters={'admission_no': admission, 'docstatus': ['!=', 2]},
		fields=[
			'name', 'observation_level', 'room', 'start_date', 'duration', 'amount',
			'healthcare_practitioner', 'practitioner_name', 'medical_department',
			'designated_security_personel', 'note',
		],
		order_by='posting_date desc, start_date desc',
		limit=1,
	)
	return rows[0] if rows else None


@frappe.whitelist()
def get_observations(
	limit=50,
	offset=0,
	patient=None,
	observation_level=None,
	practitioner=None,
	date_from=None,
	date_to=None,
	dc_date_from=None,
	dc_date_to=None,
):
	"""Get list of Observations with optional patient, level, and date filters."""
	from healthcare.api.common import apply_cost_center_scope_to_filters

	filters = {}
	if apply_cost_center_scope_to_filters(filters):
		return []

	if patient:
		filters["patient"] = patient

	level = (observation_level or "").strip()
	if level:
		filters["observation_level"] = level

	practitioner = (practitioner or "").strip()
	if practitioner:
		filters["healthcare_practitioner"] = practitioner

	# One From/To range covers both dates: a row matches when its start date OR DC date falls inside.
	or_filters = None
	if date_from and date_to:
		or_filters = [
			["start_date", "between", [date_from, date_to]],
			["dc_date", "between", [date_from, date_to]],
		]
	elif date_from:
		or_filters = [["start_date", ">=", date_from], ["dc_date", ">=", date_from]]
	elif date_to:
		or_filters = [["start_date", "<=", date_to], ["dc_date", "<=", date_to]]

	# Legacy explicit DC-date range (no longer sent by the list UI, kept for compatibility)
	if dc_date_from and dc_date_to:
		filters["dc_date"] = ["between", [dc_date_from, dc_date_to]]
	elif dc_date_from:
		filters["dc_date"] = [">=", dc_date_from]
	elif dc_date_to:
		filters["dc_date"] = ["<=", dc_date_to]

	observations = frappe.get_all(
		'Observation',
		filters=filters,
		or_filters=or_filters,
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
			'room',
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


def _submit_observation_if_draft(observation) -> None:
	"""Submit an observation document when it is still a draft."""
	if isinstance(observation, str):
		observation = frappe.get_doc("Observation", observation)
	if cint(observation.docstatus) == 0:
		observation.flags.ignore_permissions = True
		observation.submit()


@frappe.whitelist()
def create_observation(data):
	"""Create and submit a new Observation."""
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

	room = frappe.utils.cstr(data.get('room') or '').strip()
	if room:
		validate_observation_room_available(room)
		observation.room = room
	
	pv = data.get("patient_visit")
	if pv:
		observation.reference_doctype = "Patient Visit"
		observation.reference_docname = pv

	fill_patient_from_admission(observation)
	if not observation.patient:
		frappe.throw(_("Patient is required"))

	observation.insert(ignore_permissions=True)
	_submit_observation_if_draft(observation)
	
	# Return the created observation
	return {
		'name': observation.name,
		'trans_no': observation.trans_no,
		'docstatus': observation.docstatus,
		'patient': observation.patient,
		'patient_name': frappe.db.get_value('Patient', observation.patient, 'patient_name') or observation.patient,
		'observation_level': observation.observation_level,
		'designated_security_personel': observation.designated_security_personel,
		'amount': observation.amount,
		'duration': observation.duration,
		'company': observation.company,
		'room': observation.room,
	}


@frappe.whitelist()
def schedule_observation_discharge(name, dc_date=None):
	"""Set DC date on an observation and release its room (Vacant)."""
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Observation is required"))
	if not frappe.db.exists("Observation", name):
		frappe.throw(_("Observation {0} not found").format(name))

	obs = frappe.get_doc("Observation", name)
	if obs.get("dc_date"):
		frappe.throw(_("Observation {0} is already discharged (DC date set).").format(name))

	discharge_date = getdate(dc_date) if dc_date else getdate(nowdate())
	room = (obs.get("room") or "").strip()

	obs.dc_date = discharge_date
	obs.save(ignore_permissions=True)

	if room:
		vacate_observation_room(room)

	return {
		"name": obs.name,
		"dc_date": obs.dc_date,
		"room": obs.room,
		"message": _("Observation discharge scheduled"),
	}


@frappe.whitelist()
def update_observation(data):
	"""Update observation fields (room, dc_date) with occupancy side effects."""
	assert_editing_allowed()
	if isinstance(data, str):
		import json
		data = json.loads(data)

	name = (data.get("name") or "").strip()
	if not name:
		frappe.throw(_("Observation name is required"))
	if not frappe.db.exists("Observation", name):
		frappe.throw(_("Observation {0} not found").format(name))

	obs = frappe.get_doc("Observation", name)

	if "room" in data:
		new_room = frappe.utils.cstr(data.get("room") or "").strip()
		if new_room and not obs.get("dc_date"):
			if new_room != (obs.get("room") or "").strip():
				validate_observation_room_available(new_room)
		obs.room = new_room or None

	if data.get("dc_date"):
		if obs.get("dc_date"):
			frappe.throw(_("Observation {0} is already discharged.").format(name))
		obs.dc_date = getdate(data.get("dc_date"))

	obs.save(ignore_permissions=True)

	return _enrich_observation_row(obs.as_dict())


@frappe.whitelist()
def create_sales_order_from_observation(observation_name, billing_date=None):
	"""Create and submit a Sales Order for an Observation for a given billing day.

	Returns an existing order when one already exists for the same observation and date.
	"""
	if not observation_name:
		frappe.throw(_("Observation name is required"))

	if not frappe.db.exists("Observation", observation_name):
		frappe.throw(_("Observation {0} does not exist").format(observation_name))

	obs = frappe.get_doc("Observation", observation_name)
	return _create_observation_sales_order(obs, billing_date=billing_date or nowdate())


def _observation_end_date(obs) -> object:
	"""Last calendar day observation charges apply (date or None when open-ended)."""
	start = getdate(obs.start_date) if obs.get("start_date") else None
	if not start:
		return None

	candidates = []
	if obs.get("dc_date"):
		candidates.append(getdate(obs.dc_date))

	duration = (obs.get("duration") or "").strip()
	if duration.isdigit() and int(duration) > 0:
		candidates.append(add_days(start, int(duration) - 1))

	if not candidates:
		return None
	return min(candidates)


def _observation_is_billable_on_date(obs, billing_date) -> bool:
	billing_date = getdate(billing_date)
	if not obs.get("start_date"):
		return False

	start = getdate(obs.start_date)
	if billing_date < start:
		return False

	end = _observation_end_date(obs)
	if end and billing_date > end:
		return False

	if obs.get("dc_date") and billing_date > getdate(obs.dc_date):
		return False

	status = (obs.get("status") or "").strip()
	if status in ("Cancelled", "Entered in Error", "Rejected"):
		return False

	if not obs.get("observation_level"):
		return False

	if not cint(frappe.db.get_value("Observation Level", obs.observation_level, "is_billable")):
		return False

	ref_dt, ref_name = _observation_visit_admission_refs(obs)
	return bool(ref_dt and ref_name)


def _existing_observation_sales_order_for_date(observation_name: str, billing_date) -> str | None:
	billing_date = getdate(billing_date)
	rows = frappe.db.sql(
		"""
		SELECT so.name
		FROM `tabSales Order` so
		WHERE so.custom_base_reference = 'Observation'
			AND so.custom_base_reference_name = %s
			AND so.transaction_date = %s
			AND so.docstatus < 2
		ORDER BY so.creation DESC
		LIMIT 1
		""",
		(observation_name, billing_date),
	)
	return rows[0][0] if rows else None


def _resolve_observation_billing_item(obs, lvl):
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

	desc = getattr(lvl, "observation_level", None) or obs.observation_level or obs.name
	return item_code, billing_rate, desc


def _create_observation_sales_order(obs, billing_date=None) -> dict:
	"""Create (or return) a submitted Sales Order for one observation billing day."""
	billing_date = getdate(billing_date or nowdate())
	observation_name = obs.name

	existing = _existing_observation_sales_order_for_date(observation_name, billing_date)
	if existing:
		so = frappe.get_doc("Sales Order", existing)
		if cint(so.docstatus) == 0:
			so.flags.ignore_permissions = True
			so.submit()
		return {"sales_order": so.name, "status": so.status, "existing": True, "billing_date": str(billing_date)}

	# if not _observation_is_billable_on_date(obs, billing_date):
	# 	frappe.throw(
	# 		_("Observation {0} is not billable on {1}").format(observation_name, billing_date)
	# 	)

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

	lvl = frappe.get_doc("Observation Level", obs.observation_level)
	if not cint(lvl.is_billable):
		frappe.throw(_("Observation Level {0} must be billable to create a Sales Order").format(lvl.name))

	item_code, billing_rate, desc = _resolve_observation_billing_item(obs, lvl)
	customer = frappe.db.get_value("Patient", obs.patient, "customer") or obs.patient

	so = frappe.new_doc("Sales Order")
	so.company = obs.company
	so.patient = obs.patient
	so.customer = customer
	so.transaction_date = billing_date
	so.delivery_date = billing_date
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

	so.append(
		"items",
		{
			"item_code": item_code,
			"qty": 1,
			"rate": billing_rate,
			"price_list_rate": billing_rate,
			"description": _("Observation {0} ({1}): {2}").format(obs.name, billing_date, desc),
		},
	)

	cc = cost_center_from_visit_or_admission(ref_dt, ref_name)
	apply_cost_center_to_sales_order(so, cc)

	so.insert(ignore_permissions=True)
	so.flags.ignore_permissions = True
	so.submit()

	if not obs.get("order_created"):
		frappe.db.set_value("Observation", observation_name, "order_created", so.name, update_modified=False)

	return {
		"sales_order": so.name,
		"status": so.status,
		"existing": False,
		"billing_date": str(billing_date),
	}


def create_daily_observation_sales_orders(billing_date=None):
	"""Scheduled job: bill active observations once per calendar day (default: today at 11:59 PM)."""
	billing_date = getdate(billing_date or nowdate())

	observations = frappe.get_all(
		"Observation",
		filters={
			"docstatus": 1,
			"status": ["not in", ["Cancelled", "Entered in Error", "Rejected"]],
			"start_date": ["<=", billing_date],
		},
		fields=["name"],
	)

	created = []
	skipped = []
	failed = []

	for row in observations:
		obs = frappe.get_doc("Observation", row.name)
		if not _observation_is_billable_on_date(obs, billing_date):
			skipped.append(row.name)
			continue

		if _existing_observation_sales_order_for_date(row.name, billing_date):
			skipped.append(row.name)
			continue

		try:
			result = _create_observation_sales_order(obs, billing_date=billing_date)
			created.append(result)
			frappe.logger().info(
				f"Created observation sales order {result['sales_order']} for {row.name} on {billing_date}"
			)
		except Exception as exc:
			failed.append({"observation": row.name, "error": str(exc)})
			frappe.log_error(
				title=f"Daily observation sales order failed: {row.name}",
				message=frappe.get_traceback(),
			)

	if created:
		frappe.db.commit()

	return {
		"billing_date": str(billing_date),
		"created": created,
		"skipped": len(skipped),
		"failed": failed,
	}

