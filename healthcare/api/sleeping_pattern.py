# -*- coding: utf-8 -*-
from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import flt, get_datetime, nowdate

from healthcare.api.common import _owner_filter_for_practitioner, _user_can_read_nursing_portal
from healthcare.api.utils.api_utility import get_next_transaction_number
from healthcare.healthcare.care_episode_guard import assert_inpatient_admission_open_for_create
from healthcare.healthcare.editing_lock import (
	assert_editable_within_24h_if_enabled,
	assert_editing_allowed,
)


def _hours_between(start, end):
	if not start or not end:
		return None
	try:
		start_dt = get_datetime(start)
		end_dt = get_datetime(end)
		seconds = (end_dt - start_dt).total_seconds()
		if seconds < 0:
			seconds += 24 * 60 * 60
		if seconds <= 0:
			return None
		return flt(seconds / 3600.0, 2)
	except Exception:
		return None


def _serialize_sleeping_pattern(row) -> dict:
	morning_total = _hours_between(row.get("morning_from"), row.get("morning_to"))
	evening_total = _hours_between(row.get("evening_from"), row.get("evening_to"))
	night_total = _hours_between(row.get("night_from"), row.get("night_to"))
	total_hours = sum(value or 0 for value in (morning_total, evening_total, night_total))

	return {
		"name": row.get("name"),
		"trans_no": row.get("trans_no"),
		"date": row.get("date"),
		"admission_no": row.get("admission_no"),
		"admission_no_old": row.get("admission_no_old"),
		"file_no": row.get("file_no"),
		"patient_name": row.get("patient_name"),
		"branch": row.get("branch"),
		"cost_center": row.get("cost_center"),
		"user": row.get("owner"),
		"morning_from": row.get("morning_from"),
		"morning_to": row.get("morning_to"),
		"evening_from": row.get("evening_from"),
		"evening_to": row.get("evening_to"),
		"night_from": row.get("night_from"),
		"night_to": row.get("night_to"),
		"morning_total": morning_total,
		"evening_total": evening_total,
		"night_total": night_total,
		"total_hours": total_hours if total_hours else None,
		"creation": row.get("creation"),
		"modified": row.get("modified"),
	}


@frappe.whitelist()
def create_sleeping_pattern(**data):
	"""Create a standalone Sleeping Pattern document."""
	admission = (data.get("admission_no") or data.get("admission") or "").strip()
	if not admission:
		frappe.throw(_("Admission is required"))

	assert_inpatient_admission_open_for_create(admission)

	patient = (data.get("patient") or "").strip() or frappe.db.get_value(
		"Inpatient Admission", admission, "patient"
	)
	patient_name = frappe.db.get_value("Patient", patient, "patient_name") if patient else None

	# One record per admission per day: a second save on the same day appends the
	# newly filled periods (morning/evening/night) to the existing record.
	target_date = data.get("date") or nowdate()
	existing = frappe.db.get_value(
		"Sleeping Pattern", {"admission_no": admission, "date": target_date}, "name"
	)
	if existing:
		doc = frappe.get_doc("Sleeping Pattern", existing)
	else:
		doc = frappe.new_doc("Sleeping Pattern")
		doc.trans_no = get_next_transaction_number("Sleeping Pattern", fieldname="trans_no")
	doc.date = target_date
	doc.admission_no = admission
	doc.file_no = patient
	doc.patient_name = patient_name

	for fieldname in (
		"branch",
		"cost_center",
		"admission_no_old",
		"morning_from",
		"morning_to",
		"evening_from",
		"evening_to",
		"night_from",
		"night_to",
		"cr_id",
		"cr_date",
		"up_id",
		"up_date",
	):
		if fieldname in data and data.get(fieldname) not in (None, ""):
			doc.set(fieldname, data.get(fieldname))

	if doc.get("__islocal") or not doc.name:
		doc.insert(ignore_permissions=True)
	else:
		doc.save(ignore_permissions=True)
	frappe.db.commit()

	return _serialize_sleeping_pattern(doc.as_dict())


@frappe.whitelist()
def get_sleeping_patterns(
	patient: str | None = None,
	date_from: str | None = None,
	date_to: str | None = None,
	practitioner: str | None = None,
	limit: int = 50,
	offset: int = 0,
):
	"""Return standalone Sleeping Pattern rows for the healthcare portal."""
	portal_reader = _user_can_read_nursing_portal()
	has_read = frappe.has_permission("Sleeping Pattern", "read")

	filters = {}
	if patient:
		filters["file_no"] = patient
	if date_from and date_to:
		filters["date"] = ["between", [date_from, date_to]]
	elif date_from:
		filters["date"] = [">=", date_from]
	elif date_to:
		filters["date"] = ["<=", date_to]

	owner_user = _owner_filter_for_practitioner(practitioner)
	if owner_user:
		filters["owner"] = owner_user

	rows = frappe.get_all(
		"Sleeping Pattern",
		filters=filters,
		fields=[
			"name",
			"trans_no",
			"date",
			"admission_no",
			"admission_no_old",
			"file_no",
			"patient_name",
			"branch",
			"cost_center",
			"morning_from",
			"morning_to",
			"evening_from",
			"evening_to",
			"night_from",
			"night_to",
			"owner",
			"creation",
			"modified",
		],
		order_by="date desc, modified desc",
		limit_start=offset,
		limit_page_length=limit,
		ignore_permissions=portal_reader and not has_read,
	)
	return [_serialize_sleeping_pattern(row) for row in rows]


@frappe.whitelist()
def get_sleeping_pattern(name=None):
	"""Return one standalone Sleeping Pattern row for the healthcare portal."""
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Sleeping Pattern is required"))
	if not frappe.db.exists("Sleeping Pattern", name):
		frappe.throw(_("Sleeping Pattern {0} not found").format(name))

	if not frappe.has_permission("Sleeping Pattern", "read") and not _user_can_read_nursing_portal():
		frappe.throw(_("Not permitted to read Sleeping Pattern"), frappe.PermissionError)

	doc = frappe.get_doc("Sleeping Pattern", name)
	return _serialize_sleeping_pattern(doc.as_dict())


_SLEEPING_PATTERN_PERIOD_FIELDS = (
	"morning_from",
	"morning_to",
	"evening_from",
	"evening_to",
	"night_from",
	"night_to",
)


@frappe.whitelist()
def update_sleeping_pattern(**data):
	"""Update an existing Sleeping Pattern document from the healthcare portal."""
	assert_editing_allowed()

	name = (data.get("name") or "").strip()
	if not name:
		frappe.throw(_("Sleeping Pattern is required"))
	if not frappe.db.exists("Sleeping Pattern", name):
		frappe.throw(_("Sleeping Pattern {0} not found").format(name))

	assert_editable_within_24h_if_enabled("Sleeping Pattern", name, "unedit_within_24hour")

	if not frappe.has_permission("Sleeping Pattern", "write") and not _user_can_read_nursing_portal():
		frappe.throw(_("Not permitted to update Sleeping Pattern"), frappe.PermissionError)

	doc = frappe.get_doc("Sleeping Pattern", name)

	if data.get("date"):
		doc.date = data.get("date")

	for fieldname in _SLEEPING_PATTERN_PERIOD_FIELDS:
		if fieldname in data:
			value = data.get(fieldname)
			doc.set(fieldname, value if value not in (None, "") else None)

	for fieldname in ("branch", "cost_center"):
		if fieldname in data and data.get(fieldname) not in (None, ""):
			doc.set(fieldname, data.get(fieldname))

	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _serialize_sleeping_pattern(doc.as_dict())

