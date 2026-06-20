# Copyright (c) 2026, healthcare contributors

import frappe

from healthcare.healthcare.care_episode_guard import (
	CLOSED_INPATIENT_ADMISSION_STATUSES,
	CLOSED_PATIENT_VISIT_STATUSES,
	_admission_status,
	_visit_status,
	block_clinical_records_on_completed_visit,
	block_clinical_records_on_discharged_ip,
)


def patient_visit_type_info(patient_visit: str | None) -> dict:
	"""Resolve Patient Visit Type label and whether the visit is IOP."""
	if not patient_visit or not frappe.db.exists("Patient Visit", patient_visit):
		return {
			"visit_type": None,
			"visit_type_label": None,
			"is_iop_visit": False,
		}

	row = frappe.db.get_value(
		"Patient Visit",
		patient_visit,
		["visit_type", "iop_enrollment"],
		as_dict=True,
	) or {}
	link = (row.get("visit_type") or "").strip()
	label = link
	if link and frappe.db.exists("Patient Visit Type", link):
		label = (frappe.db.get_value("Patient Visit Type", link, "visit_type") or link).strip()

	is_iop = bool(row.get("iop_enrollment"))
	if not is_iop:
		for candidate in (label, link):
			if candidate and str(candidate).strip().upper() == "IOP":
				is_iop = True
				break

	return {
		"visit_type": link or None,
		"visit_type_label": label or None,
		"is_iop_visit": is_iop,
	}


@frappe.whitelist()
def get_active_care_episode_status(patient_visit=None, inpatient_admission=None):
	"""Return statuses for the OP visit / IP admission selected in the care context header."""
	block_ip = block_clinical_records_on_discharged_ip()
	block_op = block_clinical_records_on_completed_visit()
	out = {
		"patient_visit_status": None,
		"patient_visit_type": None,
		"patient_visit_type_label": None,
		"is_iop_visit": False,
		"inpatient_admission_status": None,
		"blocks_create": False,
		"block_reason": None,
		"block_clinical_records_on_discharged_ip": block_ip,
		"block_clinical_records_on_completed_visit": block_op,
	}
	if patient_visit:
		status = _visit_status(patient_visit)
		out["patient_visit_status"] = status
		visit_info = patient_visit_type_info(patient_visit)
		out["patient_visit_type"] = visit_info["visit_type"]
		out["patient_visit_type_label"] = visit_info["visit_type_label"]
		out["is_iop_visit"] = visit_info["is_iop_visit"]
		if block_op and status in CLOSED_PATIENT_VISIT_STATUSES:
			out["blocks_create"] = True
			visit_kind = "IOP visit" if visit_info["is_iop_visit"] else "OP visit"
			out["block_reason"] = (
				f"This patient visit is {status}. Select or create an open {visit_kind} to continue."
			)
	if inpatient_admission:
		status = _admission_status(inpatient_admission)
		out["inpatient_admission_status"] = status
		if (
			block_clinical_records_on_discharged_ip()
			and status in CLOSED_INPATIENT_ADMISSION_STATUSES
		):
			out["blocks_create"] = True
			out["block_reason"] = (
				f"This inpatient admission is {status}. Select or create an active IP admission to continue."
			)
	return out
