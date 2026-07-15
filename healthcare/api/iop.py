# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

import json
import frappe
from frappe import _
from frappe.model.rename_doc import rename_doc
from frappe.utils import add_days, flt, getdate
from healthcare.healthcare.editing_lock import assert_editing_allowed


@frappe.whitelist()
def get_iop_days(limit=50, offset=0, from_date=None, to_date=None):
	"""List IOP Days for reception dashboard."""
	from healthcare.api.common import get_permitted_cost_centers
	filters = {}
	if from_date:
		filters["posting_date"] = [">=", from_date]
	if to_date:
		filters["posting_date"] = ["<=", to_date]

	# ── Cost-centre User Permission enforcement ──────────────────────────────
	# IOP Days are hospital-wide (one per date, name = IOP-DAY-{date}). Show days in a
	# permitted cost centre OR days with no cost centre (unscoped/global), so a scoped
	# receptionist can still see globally-created days.
	or_filters = None
	permitted_cc = get_permitted_cost_centers()
	if permitted_cc is not None:
		if not permitted_cc:
			filters["cost_center"] = ["is", "not set"]
		else:
			or_filters = [
				["cost_center", "in", permitted_cc],
				["cost_center", "is", "not set"],
			]

	days = frappe.get_all(
		"IOP Day",
		filters=filters,
		or_filters=or_filters,
		fields=["name", "posting_date", "company", "cost_center"],
		limit=int(limit),
		limit_start=int(offset),
		order_by="posting_date desc",
	)
	return days


@frappe.whitelist()
def get_iop_day_with_sessions(name):
	"""Get one IOP Day with its sessions (for display/edit)."""
	doc = frappe.get_doc("IOP Day", name)
	sessions = [
		{
			"session_type": s.session_type,
			"from_time": str(s.from_time) if s.from_time else None,
			"to_time": str(s.to_time) if s.to_time else None,
		}
		for s in (doc.sessions or [])
	]
	enriched_sessions = _enrich_sessions_with_template_details(sessions)
	return {
		"name": doc.name,
		"posting_date": doc.posting_date,
		"company": doc.company,
		"cost_center": doc.cost_center,
		"session_total": _iop_day_session_total(enriched_sessions),
		"sessions": enriched_sessions,
	}


@frappe.whitelist()
def create_iop_day(data):
	"""Create IOP Day with sessions. One IOP Day per date (name = IOP-DAY-{posting_date})."""
	if isinstance(data, str):
		data = json.loads(data)
	if isinstance(data, dict) and "data" in data:
		data = data["data"]
	posting_date = data.get("posting_date")
	if not posting_date:
		frappe.throw(_("Date is required"), title=_("Validation Error"))
	# IOP Day naming is IOP-DAY-{posting_date}, so one per date
	existing = frappe.db.exists("IOP Day", {"posting_date": posting_date})
	if existing:
		frappe.throw(
			_("An IOP Day already exists for {0}. Use that day or choose a different date.").format(posting_date),
			title=_("Duplicate Date"),
		)
	company = data.get("company")
	if not company:
		first_company = frappe.get_all("Company", fields=["name"], limit=1, order_by="creation asc")
		company = first_company[0].name if first_company else None

	doc = frappe.new_doc("IOP Day")
	doc.posting_date = posting_date
	doc.company = company
	doc.cost_center = data.get("cost_center") or None
	for s in (data.get("sessions") or []):
		doc.append("sessions", {
			"session_type": s.get("session_type"),
			"from_time": s.get("from_time"),
			"to_time": s.get("to_time"),
		})
	try:
		doc.insert(ignore_permissions=True)
		frappe.db.commit()
	except frappe.DuplicateEntryError:
		frappe.db.rollback()
		frappe.throw(
			_("An IOP Day already exists for this date. Please choose a different date."),
			title=_("Duplicate Date"),
		)
	return {"name": doc.name, "posting_date": doc.posting_date}


@frappe.whitelist()
def bulk_create_iop_days(data):
	"""F022: create an IOP Day (one per date) for every matching date in a range.

	data = {start_date, end_date, weekdays:[0..6 Mon..Sun] (empty = every day),
	        sessions:[{session_type, from_time, to_time}], company?, cost_center?}.
	Dates that already have an IOP Day are skipped and reported."""
	if isinstance(data, str):
		data = json.loads(data)
	if isinstance(data, dict) and "data" in data:
		data = data["data"]

	start = getdate(data.get("start_date"))
	end = getdate(data.get("end_date"))
	if not start or not end:
		frappe.throw(_("Start and end date are required"), title=_("Validation Error"))
	if end < start:
		frappe.throw(_("End date must be on or after the start date"), title=_("Validation Error"))

	weekdays = data.get("weekdays")
	weekday_set = {int(w) for w in weekdays} if weekdays else None

	sessions = data.get("sessions") or []
	if not sessions:
		frappe.throw(_("Select at least one session type"), title=_("Validation Error"))

	company = data.get("company")
	if not company:
		first_company = frappe.get_all("Company", fields=["name"], limit=1, order_by="creation asc")
		company = first_company[0].name if first_company else None
	cost_center = data.get("cost_center") or None

	created, skipped_existing = [], []
	day = start
	while day <= end:
		if weekday_set is None or day.weekday() in weekday_set:
			date_str = str(day)
			if frappe.db.exists("IOP Day", {"posting_date": date_str}):
				skipped_existing.append(date_str)
			else:
				doc = frappe.new_doc("IOP Day")
				doc.posting_date = date_str
				doc.company = company
				doc.cost_center = cost_center
				for s in sessions:
					doc.append(
						"sessions",
						{
							"session_type": s.get("session_type"),
							"from_time": s.get("from_time"),
							"to_time": s.get("to_time"),
						},
					)
				try:
					doc.insert(ignore_permissions=True)
					created.append(date_str)
				except frappe.DuplicateEntryError:
					skipped_existing.append(date_str)
		day = getdate(add_days(day, 1))

	frappe.db.commit()
	return {"created": created, "skipped_existing": skipped_existing, "count": len(created)}


def _iop_day_session_total(sessions):
	"""Sum Healthcare Service Template rates for IOP Day session rows."""
	if not sessions:
		return 0.0
	rates = _healthcare_service_template_rates(
		[s.get("session_type") for s in sessions if s.get("session_type")]
	)
	return sum(flt(rates.get(st, {}).get("rate")) for st in rates)


@frappe.whitelist()
def update_iop_day(name, data=None, sessions=None):
	"""Update IOP Day date, sessions, and optional company / cost center."""
	assert_editing_allowed()
	if not name:
		frappe.throw(_("IOP Day is required"))
	if isinstance(data, str):
		data = json.loads(data) if data else {}
	if not isinstance(data, dict):
		data = {}
	if sessions is None and "sessions" in data:
		sessions = data.get("sessions")

	doc = frappe.get_doc("IOP Day", name)
	if "posting_date" in data:
		new_posting_date = data.get("posting_date")
		if not new_posting_date:
			frappe.throw(_("Date is required"), title=_("Validation Error"))
		if str(new_posting_date) != str(doc.posting_date):
			existing = frappe.db.exists("IOP Day", {"posting_date": new_posting_date})
			if existing and existing != doc.name:
				frappe.throw(
					_("An IOP Day already exists for {0}. Choose a different date.").format(
						new_posting_date
					),
					title=_("Duplicate Date"),
				)
			doc.posting_date = new_posting_date
	if "company" in data:
		doc.company = data.get("company") or None
	if "cost_center" in data:
		doc.cost_center = data.get("cost_center") or None
	if sessions is not None:
		valid_sessions = [s for s in (sessions or []) if (s.get("session_type") or "").strip()]
		if not valid_sessions:
			frappe.throw(_("Add at least one session with a Healthcare Service"))
		doc.sessions = []
		for s in valid_sessions:
			doc.append(
				"sessions",
				{
					"session_type": s.get("session_type"),
					"from_time": s.get("from_time"),
					"to_time": s.get("to_time"),
				},
			)
	doc.save(ignore_permissions=True)

	new_name = f"IOP-DAY-{doc.posting_date}"
	if doc.name != new_name and not frappe.db.exists("IOP Day", new_name):
		rename_doc("IOP Day", doc.name, new_name, force=True, ignore_permissions=True)
		doc.name = new_name
		frappe.db.set_value(
			"IOP Enrollment",
			{"iop_day": new_name},
			"posting_date",
			doc.posting_date,
			update_modified=False,
		)

	frappe.db.commit()
	enriched_sessions = _enrich_sessions_with_template_details(
		[
			{
				"session_type": s.session_type,
				"from_time": str(s.from_time) if s.from_time else None,
				"to_time": str(s.to_time) if s.to_time else None,
			}
			for s in (doc.sessions or [])
		]
	)
	return {
		"name": doc.name,
		"posting_date": doc.posting_date,
		"session_total": _iop_day_session_total(enriched_sessions),
		"sessions": enriched_sessions,
	}


@frappe.whitelist()
def delete_iop_day(name):
	"""Delete an IOP Day when it has no enrollments."""
	if not name:
		frappe.throw(_("IOP Day is required"))
	if not frappe.db.exists("IOP Day", name):
		frappe.throw(_("IOP Day {0} not found").format(name))

	enrollment_count = frappe.db.count("IOP Enrollment", {"iop_day": name})
	if enrollment_count:
		frappe.throw(
			_("Cannot delete IOP Day with {0} enrollment(s). Remove or reassign enrollments first.").format(
				enrollment_count
			)
		)

	frappe.delete_doc("IOP Day", name, ignore_permissions=True)
	frappe.db.commit()
	return {"message": _("IOP Day deleted")}


@frappe.whitelist()
def get_iop_session_types():
	"""List IOP Session Types for dropdowns."""
	return frappe.get_all(
		"IOP Session Type",
		fields=["name", "session_type_name", "description", "rate"],
		order_by="session_type_name asc",
	)


@frappe.whitelist()
def create_iop_session_type(session_type_name=None, description=None):
	"""Create an IOP Session Type from the portal when the needed type is missing."""
	session_type_name = (session_type_name or "").strip()
	if not session_type_name:
		frappe.throw(_("Session Type is required"))

	existing = frappe.db.exists("IOP Session Type", {"session_type_name": session_type_name})
	if existing:
		return {
			"name": existing,
			"session_type_name": frappe.db.get_value("IOP Session Type", existing, "session_type_name"),
		}

	doc = frappe.get_doc(
		{
			"doctype": "IOP Session Type",
			"session_type_name": session_type_name,
			"description": (description or "").strip() or None,
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"name": doc.name, "session_type_name": doc.session_type_name}


def _linked_patient_visits_by_enrollment(enrollment_names):
	"""Map IOP Enrollment name -> linked Patient Visit name (first match)."""
	if not enrollment_names:
		return {}
	visits = frappe.get_all(
		"Patient Visit",
		filters={"iop_enrollment": ["in", enrollment_names]},
		fields=["name", "iop_enrollment"],
		order_by="creation desc",
	)
	linked = {}
	for row in visits:
		enrollment = row.get("iop_enrollment")
		if enrollment and enrollment not in linked:
			linked[enrollment] = row.get("name")
	return linked


def _healthcare_service_template_rates(template_names, patient_care_type="OP"):
	"""Map Healthcare Service Template name -> service_name, item_code, rate."""
	if not template_names:
		return {}
	from healthcare.healthcare.doctype.healthcare_service_template.healthcare_service_template import (
		get_healthcare_service_template_rate,
	)

	rates = {}
	for row in frappe.get_all(
		"Healthcare Service Template",
		filters={"name": ["in", list(set(template_names))]},
		fields=["name", "service_name", "item_code", "rate", "op_rate"],
	):
		rates[row.name] = {
			"service_name": row.service_name or row.name,
			"item_code": row.item_code,
			"rate": get_healthcare_service_template_rate(
				template_name=row.name,
				patient_care_type=patient_care_type,
			),
		}
	return rates


def _enrich_sessions_with_template_details(sessions):
	"""Add service_name and rate to session rows for the portal."""
	if not sessions:
		return sessions
	rates = _healthcare_service_template_rates(
		[s.get("session_type") for s in sessions if s.get("session_type")]
	)
	for session in sessions:
		details = rates.get(session.get("session_type"), {})
		session["service_name"] = details.get("service_name")
		session["rate"] = details.get("rate")
		session["item_code"] = details.get("item_code")
	return sessions


def _enrollment_cost_details(enrollment_name):
	"""Sum session rates and optional linked visit billing total."""
	sessions = frappe.get_all(
		"IOP Day Session",
		filters={"parent": enrollment_name, "parenttype": "IOP Enrollment"},
		fields=["session_type"],
	)
	session_types = [s.session_type for s in sessions if s.session_type]
	rates = _healthcare_service_template_rates(session_types)
	session_costs = []
	session_total = 0.0
	for row in sessions:
		st = row.session_type
		if not st:
			continue
		details = rates.get(st, {})
		amount = flt(details.get("rate"))
		session_total += amount
		session_costs.append(
			{
				"session_type": st,
				"service_name": details.get("service_name"),
				"item_code": details.get("item_code"),
				"rate": amount,
			}
		)

	visit_amount = 0.0
	visit_name = frappe.db.get_value(
		"Patient Visit", {"iop_enrollment": enrollment_name}, "name"
	)
	if visit_name:
		visit_amount = flt(
			frappe.db.sql(
				"""
				SELECT COALESCE(SUM(so.grand_total), 0)
				FROM `tabSales Order` so
				WHERE so.custom_reference_type = 'Patient Visit'
					AND so.custom_reference_name = %s
					AND so.docstatus < 2
				""",
				visit_name,
			)[0][0]
		)

	return {
		"session_total": session_total,
		"session_costs": session_costs,
		"visit_amount": visit_amount,
		"total_cost": session_total or visit_amount,
	}


@frappe.whitelist()
def get_iop_enrollments(limit=50, offset=0, iop_day=None, patient=None, status=None):
	"""List IOP Enrollments for reception dashboard."""
	filters = {}
	if iop_day:
		filters["iop_day"] = iop_day
	if patient:
		filters["patient"] = patient
	if status:
		filters["status"] = status
	enrollments = frappe.get_all(
		"IOP Enrollment",
		filters=filters,
		fields=["name", "patient", "patient_name", "iop_day", "posting_date", "status", "notes"],
		limit=int(limit),
		limit_start=int(offset),
		order_by="posting_date desc, modified desc",
	)
	linked_visits = _linked_patient_visits_by_enrollment([e["name"] for e in enrollments])
	for enrollment in enrollments:
		enrollment["patient_visit"] = linked_visits.get(enrollment["name"])
		cost = _enrollment_cost_details(enrollment["name"])
		enrollment["session_total"] = cost["session_total"]
		enrollment["session_costs"] = cost["session_costs"]
		enrollment["visit_amount"] = cost["visit_amount"]
		enrollment["total_cost"] = cost["total_cost"]
	return enrollments


@frappe.whitelist()
def create_iop_enrollment(patient, iop_day=None, status=None, notes=None, doctor=None, practitioner=None, iop_session=None):
	"""Create IOP Enrollment. IOP Day (slot) is optional. Optional iop_session list of dicts: session_type, from_time, to_time, notes."""
	if isinstance(iop_session, str):
		iop_session = json.loads(iop_session) if iop_session else []
	doc = frappe.new_doc("IOP Enrollment")
	doc.patient = patient
	if iop_day:
		doc.iop_day = iop_day
	doc.status = status or "Scheduled"
	if notes:
		doc.notes = notes
	doc.doctor = doctor or practitioner
	for row in (iop_session or []):
		doc.append("iop_session", {
			"session_type": row.get("session_type"),
			"from_time": row.get("from_time"),
			"to_time": row.get("to_time"),
			"notes": row.get("notes"),
		})
	doc.insert(ignore_permissions=True)

	patient_visit = None
	try:
		from healthcare.api.patient_visit import try_create_patient_visit_for_iop_enrollment

		patient_visit = try_create_patient_visit_for_iop_enrollment(doc)
	except Exception:
		frappe.log_error(
			frappe.get_traceback(),
			f"IOP enrollment auto patient visit failed for {doc.name}",
		)

	frappe.db.commit()
	posting_date = doc.iop_day and frappe.db.get_value("IOP Day", doc.iop_day, "posting_date")
	return {
		"name": doc.name,
		"patient": doc.patient,
		"patient_name": doc.patient_name,
		"iop_day": doc.iop_day,
		"posting_date": posting_date or doc.posting_date,
		"status": doc.status,
		"patient_visit": patient_visit,
	}


@frappe.whitelist()
def get_iop_enrollment(name):
	"""Get one IOP Enrollment with iop_session child table (for edit modal)."""
	doc = frappe.get_doc("IOP Enrollment", name)
	linked_visits = _linked_patient_visits_by_enrollment([doc.name])
	return {
		"name": doc.name,
		"patient": doc.patient,
		"patient_name": doc.patient_name,
		"iop_day": doc.iop_day,
		"posting_date": doc.posting_date,
		"status": doc.status,
		"notes": doc.notes,
		"doctor": doc.doctor,
		"patient_visit": linked_visits.get(doc.name),
		"iop_session": [
			{
				"session_type": s.session_type,
				"from_time": str(s.from_time) if s.from_time else None,
				"to_time": str(s.to_time) if s.to_time else None,
				"notes": s.notes,
			}
			for s in (doc.iop_session or [])
		],
	}


@frappe.whitelist()
def update_iop_enrollment(name, iop_session=None, status=None, notes=None):
	"""Update IOP Enrollment sessions, status, and/or notes."""
	assert_editing_allowed()
	if isinstance(iop_session, str):
		iop_session = json.loads(iop_session) if iop_session else []
	doc = frappe.get_doc("IOP Enrollment", name)
	if status is not None:
		doc.status = status
	if notes is not None:
		doc.notes = notes
	if iop_session is not None:
		doc.iop_session = []
		for row in (iop_session or []):
			doc.append("iop_session", {
				"session_type": row.get("session_type"),
				"from_time": row.get("from_time"),
				"to_time": row.get("to_time"),
				"notes": row.get("notes"),
			})
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"name": doc.name, "status": doc.status}
