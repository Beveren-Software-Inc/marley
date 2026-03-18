# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

import json
import frappe
from frappe import _


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
	doc = frappe.new_doc("IOP Day")
	doc.posting_date = posting_date
	doc.company = data.get("company") or None
	doc.cost_center = data.get("cost_center") or None
	for s in (data.get("sessions") or []):
		doc.append("sessions", {
			"session_type": s.get("session_type"),
			"from_time": s.get("from_time"),
			"to_time": s.get("to_time"),
		})
	try:
		doc.insert()
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
		fields=["name", "session_type_name", "description"],
		order_by="session_type_name asc",
	)


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
	doc.insert()
	frappe.db.commit()
	posting_date = doc.iop_day and frappe.db.get_value("IOP Day", doc.iop_day, "posting_date")
	return {
		"name": doc.name,
		"patient": doc.patient,
		"patient_name": doc.patient_name,
		"iop_day": doc.iop_day,
		"posting_date": posting_date,
		"status": doc.status,
	}


@frappe.whitelist()
def get_iop_enrollment(name):
	"""Get one IOP Enrollment with iop_session child table (for edit modal)."""
	doc = frappe.get_doc("IOP Enrollment", name)
	return {
		"name": doc.name,
		"patient": doc.patient,
		"patient_name": doc.patient_name,
		"iop_day": doc.iop_day,
		"posting_date": doc.posting_date,
		"status": doc.status,
		"notes": doc.notes,
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
def update_iop_enrollment(name, iop_session=None):
	"""Update IOP Enrollment child table iop_session only."""
	if isinstance(iop_session, str):
		iop_session = json.loads(iop_session) if iop_session else []
	doc = frappe.get_doc("IOP Enrollment", name)
	doc.iop_session = []
	for row in (iop_session or []):
		doc.append("iop_session", {
			"session_type": row.get("session_type"),
			"from_time": row.get("from_time"),
			"to_time": row.get("to_time"),
			"notes": row.get("notes"),
		})
	doc.save()
	frappe.db.commit()
	return {"name": doc.name}
