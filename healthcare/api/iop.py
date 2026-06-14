# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

import json
import frappe
from frappe import _
from frappe.utils import flt


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
	permitted_cc = get_permitted_cost_centers()
	if permitted_cc is not None:
		if not permitted_cc:
			return []
		filters["cost_center"] = ["in", permitted_cc]

	days = frappe.get_all(
		"IOP Day",
		filters=filters,
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
	return {
		"name": doc.name,
		"posting_date": doc.posting_date,
		"company": doc.company,
		"cost_center": doc.cost_center,
		"sessions": [
			{"session_type": s.session_type, "from_time": str(s.from_time) if s.from_time else None, "to_time": str(s.to_time) if s.to_time else None}
			for s in (doc.sessions or [])
		],
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


def _session_type_rates(session_types):
	"""Map IOP Session Type name -> rate."""
	if not session_types:
		return {}
	rates = {}
	for row in frappe.get_all(
		"IOP Session Type",
		filters={"name": ["in", list(set(session_types))]},
		fields=["name", "rate"],
	):
		rates[row.name] = flt(row.get("rate"))
	return rates


def _enrollment_cost_details(enrollment_name):
	"""Sum session rates and optional linked visit billing total."""
	sessions = frappe.get_all(
		"IOP Day Session",
		filters={"parent": enrollment_name, "parenttype": "IOP Enrollment"},
		fields=["session_type"],
	)
	session_types = [s.session_type for s in sessions if s.session_type]
	rates = _session_type_rates(session_types)
	session_costs = []
	session_total = 0.0
	for row in sessions:
		st = row.session_type
		if not st:
			continue
		amount = flt(rates.get(st))
		session_total += amount
		session_costs.append({"session_type": st, "rate": amount})

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
