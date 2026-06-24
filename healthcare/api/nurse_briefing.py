# -*- coding: utf-8 -*-
"""Nurse shift briefing data for login / landing modals."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint, flt

from healthcare.api.common import get_permitted_cost_centers
from healthcare.api.nursing_inventory import get_stock_ledger

NURSE_BRIEFING_ROLES = frozenset(
	{
		"Administrator",
		"System Manager",
		"Healthcare Administrator",
		"Nurse",
		"Nursing User",
	}
)

SAMPLE_COLLECTION_STATUSES = (
	"Requested",
	"Awaiting sample collection",
	"Sample Collection in Progress",
	"Sample collection in progress",
)

_LAB_TEST_BRIEFING_FIELDS = [
	"name",
	"patient",
	"patient_name",
	"lab_test_name",
	"template",
	"status",
	"date",
	"practitioner",
	"practitioner_name",
	"inpatient_record",
	"department",
	"creation",
]


def _require_nurse_briefing_access() -> None:
	if frappe.session.user in ("Guest", ""):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	roles = set(frappe.get_roles(frappe.session.user))
	if not (roles & NURSE_BRIEFING_ROLES):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


def _resolve_cost_center(cost_center: str | None) -> str | None:
	cc = (cost_center or "").strip() or None
	permitted = get_permitted_cost_centers()
	if permitted is not None:
		if not permitted:
			return None
		if cc and cc in permitted:
			return cc
		return permitted[0]
	return cc


def _cost_center_filters(cost_center: str | None) -> dict | None:
	"""Return cost_center filter dict, or None when user has no permitted branches."""
	permitted = get_permitted_cost_centers()
	if permitted is not None:
		if not permitted:
			return None
		if cost_center:
			return {"cost_center": cost_center}
		return {"cost_center": ["in", permitted]}
	if cost_center:
		return {"cost_center": cost_center}
	return {}


def _beds_for_admissions(admission_names: list[str]) -> dict[str, str | None]:
	if not admission_names:
		return {}
	rows = frappe.db.sql(
		"""
		SELECT io.parent AS admission, hsu.healthcare_service_unit_name AS bed
		FROM `tabInpatient Occupancy` io
		LEFT JOIN `tabHealthcare Service Unit` hsu ON hsu.name = io.service_unit
		WHERE io.parenttype = 'Inpatient Admission'
		  AND io.`left` = 0
		  AND io.parent IN %(parents)s
		ORDER BY io.check_in DESC
		""",
		{"parents": tuple(admission_names)},
		as_dict=True,
	)
	bed_map: dict[str, str | None] = {}
	for row in rows:
		admission = row.get("admission")
		if admission and admission not in bed_map:
			bed_map[admission] = row.get("bed") or None
	return bed_map


def _warnings_for_patients(patient_ids: list[str]) -> dict[str, list[dict]]:
	if not patient_ids:
		return {}
	rows = frappe.get_all(
		"Warning Message",
		filters={"patient": ["in", patient_ids]},
		fields=[
			"name",
			"patient",
			"warning",
			"type_of_warning",
			"warning_message_type",
			"warning_message_class",
			"posting_date",
			"practitioner",
			"high_risk_text",
		],
		order_by="posting_date desc, creation desc",
		limit_page_length=300,
	)
	grouped: dict[str, list[dict]] = {pid: [] for pid in patient_ids}
	for row in rows:
		patient = row.get("patient")
		if patient:
			grouped.setdefault(patient, []).append(row)
	return grouped


def _active_admissions(cost_center: str | None) -> list[dict]:
	cc_filters = _cost_center_filters(cost_center)
	if cc_filters is None:
		return []

	filters: dict = {"status": "Admitted", **cc_filters}

	records = frappe.get_all(
		"Inpatient Admission",
		filters=filters,
		fields=[
			"name",
			"patient",
			"patient_name",
			"status",
			"admitted_datetime",
			"scheduled_date",
			"medical_department",
			"primary_practitioner",
			"allergies",
			"cost_center",
		],
		order_by="admitted_datetime desc, scheduled_date desc",
		limit_page_length=150,
	)
	if not records:
		return []

	admission_names = [r["name"] for r in records]
	patient_ids = [r["patient"] for r in records if r.get("patient")]
	beds_by_admission = _beds_for_admissions(admission_names)
	warnings_by_patient = _warnings_for_patients(patient_ids)

	practitioner_ids = {
		r["primary_practitioner"] for r in records if r.get("primary_practitioner")
	}
	practitioner_names: dict[str, str] = {}
	if practitioner_ids:
		for row in frappe.get_all(
			"Healthcare Practitioner",
			filters={"name": ["in", list(practitioner_ids)]},
			fields=["name", "practitioner_name"],
		):
			practitioner_names[row["name"]] = row.get("practitioner_name") or row["name"]

	for record in records:
		patient = record.get("patient")
		record["bed"] = beds_by_admission.get(record["name"])
		if record.get("primary_practitioner"):
			record["primary_practitioner_name"] = practitioner_names.get(
				record["primary_practitioner"], record["primary_practitioner"]
			)
		record["allergy_summary"] = (record.get("allergies") or "").strip()
		record["warnings"] = warnings_by_patient.get(patient or "", [])

	return [record for record in records if record.get("warnings")]


def _pending_sample_lab_tests(cost_center: str | None) -> list[dict]:
	cc_filters = _cost_center_filters(cost_center)
	if cc_filters is None:
		return []

	nurse_templates = frappe.get_all(
		"Lab Test Template",
		filters={"by_nurse": 1},
		pluck="name",
	)
	if not nurse_templates:
		return []

	filters: dict = {
		"docstatus": ["!=", 2],
		"status": ["in", list(SAMPLE_COLLECTION_STATUSES)],
		"template": ["in", nurse_templates],
		**cc_filters,
	}

	return frappe.get_all(
		"Lab Test",
		filters=filters,
		fields=_LAB_TEST_BRIEFING_FIELDS,
		order_by="creation desc",
		limit_page_length=150,
	)


def _low_stock_items(cost_center: str | None) -> list[dict]:
	if not cost_center:
		return []
	stock_items = get_stock_ledger(cost_center, warehouse_context="nurse") or []
	low_stock = []
	for item in stock_items:
		current = flt(item.get("current_stock"))
		reorder = flt(item.get("reorder_level")) or 10
		if current <= reorder:
			low_stock.append(
				{
					"item_code": item.get("item_code"),
					"item_name": item.get("item_name"),
					"current_stock": current,
					"reorder_level": reorder,
					"uom": item.get("uom"),
					"status": "out_of_stock" if current <= 0 else "low_stock",
				}
			)
	low_stock.sort(key=lambda row: (row["status"] != "out_of_stock", row["current_stock"]))
	return low_stock


@frappe.whitelist()
def get_nurse_shift_briefing(cost_center=None, section=None):
	"""Nurse landing modal data. Pass section=admissions|lab_tests|low_stock to load one step."""
	_require_nurse_briefing_access()
	cc = _resolve_cost_center(cost_center)
	section_key = (section or "admissions").strip().lower()

	result = {"cost_center": cc}

	if section_key == "admissions":
		result["active_admissions"] = _active_admissions(cc)
	elif section_key == "lab_tests":
		result["pending_sample_lab_tests"] = _pending_sample_lab_tests(cc)
	elif section_key == "low_stock":
		result["low_stock_items"] = _low_stock_items(cc)
	else:
		# Legacy: load everything (avoid in portal — slow).
		result["active_admissions"] = _active_admissions(cc)
		result["pending_sample_lab_tests"] = _pending_sample_lab_tests(cc)
		result["low_stock_items"] = _low_stock_items(cc)

	return result
