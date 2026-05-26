# Copyright (c) 2026, healthcare contributors

import frappe

from healthcare.healthcare.care_episode_guard import (
	CLOSED_INPATIENT_ADMISSION_STATUSES,
	CLOSED_PATIENT_VISIT_STATUSES,
	_admission_status,
	_visit_status,
	block_clinical_records_on_discharged_ip,
)


@frappe.whitelist()
def get_active_care_episode_status(patient_visit=None, inpatient_admission=None):
	"""Return statuses for the OP visit / IP admission selected in the care context header."""
	block_ip = block_clinical_records_on_discharged_ip()
	out = {
		"patient_visit_status": None,
		"inpatient_admission_status": None,
		"blocks_create": False,
		"block_reason": None,
		"block_clinical_records_on_discharged_ip": block_ip,
	}
	if patient_visit:
		status = _visit_status(patient_visit)
		out["patient_visit_status"] = status
		if status in CLOSED_PATIENT_VISIT_STATUSES:
			out["blocks_create"] = True
			out["block_reason"] = (
				f"This patient visit is {status}. Select or create an open OP visit to continue."
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
