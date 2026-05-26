# -*- coding: utf-8 -*-
import frappe
from frappe import _
from frappe.utils import nowdate, get_datetime, flt

from healthcare.api.medicine_given import _get_or_create_admission_detail
from healthcare.healthcare.care_episode_guard import assert_inpatient_admission_open_for_create
from healthcare.api.utils.api_utility import get_next_transaction_number


@frappe.whitelist()
def create_sleeping_pattern(**data):
	"""Append a Sleeping Pattern Detail row on Admission Detail for an admission.

	This mirrors the Medicine Given behaviour: ensure an Admission Detail exists for the
	given Inpatient Admission and then append a child row under the sleeping_pattern table.
	"""
	admission = data.get("admission_no") or data.get("admission")
	date = data.get("date")
	morning_from = data.get("morning_from")
	morning_to = data.get("morning_to")
	evening_from = data.get("evening_from")
	evening_to = data.get("evening_to")
	night_from = data.get("night_from")
	night_to = data.get("night_to")
	patient = data.get("patient")

	if not admission:
		frappe.throw(_("Admission is required"))

	assert_inpatient_admission_open_for_create(admission)

	admission_detail = _get_or_create_admission_detail(admission)
	trans_no = get_next_transaction_number("Sleeping Pattern", fieldname="trans_no")

	# Derive patient/file_no for the row
	if patient:
		file_no = patient
		patient_name = frappe.db.get_value("Patient", patient, "patient_name")
	else:
		file_no = getattr(admission_detail, "file_no", None) or frappe.db.get_value(
			"Inpatient Admission", admission, "patient"
		)
		patient_name = frappe.db.get_value("Patient", file_no, "patient_name") if file_no else None

	row = admission_detail.append("sleeping_pattern", {})
	row.trans_no = trans_no
	row.date = date or nowdate()
	row.file_no = file_no
	row.patient_name = patient_name
	row.user = frappe.session.user
	row.morning_from = morning_from
	row.morning_to = morning_to
	row.evening_from = evening_from
	row.evening_to = evening_to
	row.night_from = night_from
	row.night_to = night_to

	# Compute period totals in hours based on from/to
	def _hours_between(start, end):
		if not start or not end:
			return None
		try:
			start_dt = get_datetime(start)
			end_dt = get_datetime(end)
			seconds = (end_dt - start_dt).total_seconds()
			if seconds <= 0:
				return None
			return flt(seconds / 3600.0, 2)
		except Exception:
			return None

	row.morning_total = _hours_between(morning_from, morning_to)
	row.evening_total = _hours_between(evening_from, evening_to)
	row.night_total = _hours_between(night_from, night_to)

	admission_detail.save()

	return {
		"name": row.name,
		"trans_no": row.trans_no,
		"date": row.date,
		"admission_no": admission,
		"file_no": row.file_no,
		"patient_name": row.patient_name,
	}


@frappe.whitelist()
def get_sleeping_patterns(patient: str | None = None, limit: int = 50, offset: int = 0):
	"""Return Sleeping Pattern Detail rows (from Admission Detail.child table) for a patient."""
	admission_filters = {}
	if patient:
		admission_filters["file_no"] = patient

	admission_details = frappe.get_all(
		"Admission Detail",
		filters=admission_filters,
		fields=["name", "admission", "file_no", "patient_name"],
	)
	if not admission_details:
		return []

	admission_map = {a.name: a for a in admission_details}
	parent_names = list(admission_map.keys())

	children = frappe.get_all(
		"Sleeping Pattern Detail",
		filters={"parent": ["in", parent_names], "parenttype": "Admission Detail"},
		fields=[
			"name",
			"parent",
			"date",
			"branch",
			"user",
			"morning_total",
			"evening_total",
			"night_total",
			"morning_from",
			"morning_to",
			"evening_from",
			"evening_to",
			"night_from",
			"night_to",
		],
		order_by="date desc, modified desc",
		limit_start=offset,
		limit_page_length=limit,
	)

	result = []
	for row in children:
		ad = admission_map.get(row.parent)
		def _to_float(val):
			try:
				return float(val) if val not in (None, "", "None") else 0.0
			except Exception:
				return 0.0
		total_hours = _to_float(row.morning_total) + _to_float(row.evening_total) + _to_float(row.night_total)
		result.append(
			{
				"name": row.name,
				"date": row.date,
				"admission_no": ad.admission if ad else None,
				"file_no": ad.file_no if ad else None,
				"patient_name": ad.patient_name if ad else None,
				"branch": row.branch,
				"user": row.user,
				"morning_total": row.morning_total,
				"evening_total": row.evening_total,
				"night_total": row.night_total,
				"total_hours": total_hours if total_hours else None,
			}
		)

	return result

