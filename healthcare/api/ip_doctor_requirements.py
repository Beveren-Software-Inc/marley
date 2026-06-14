"""IP admission mandatory doctor documents — completion status for dashboard."""

import frappe
from frappe import _


@frappe.whitelist()
def get_ip_doctor_required_documents_status(
	patient: str,
	admission: str | None = None,
) -> dict:
	"""Return whether mandatory doctor documents exist for an IP admission.

	- Patient Medical History linked to admission (or patient when no admission)
	- Clinical Suicide Risk Assessment linked to admission when admission set
	- Patient History (history form) linked to admission
	"""
	if not patient:
		frappe.throw(_("Patient is required"))

	medical_history_filters: dict = {"patient": patient}
	history_form_filters: dict = {"patient": patient}
	suicide_filters: dict = {"patient": patient}

	if admission:
		medical_history_filters["inpatient_admission"] = admission
		history_form_filters["inpatient_admission"] = admission
		suicide_filters["inpatient_admission"] = admission

	medical_history = bool(frappe.db.exists("Patient Medical History", medical_history_filters))
	suicide_risk = bool(frappe.db.exists("Clinical Suicide Risk Assessment", suicide_filters))
	history_form = bool(frappe.db.exists("Patient History", history_form_filters))
	morse_fall_scale = bool(
		frappe.db.exists("Morse Fall Scale", {"admission_no": admission})
	) if admission else False

	return {
		"patient": patient,
		"admission": admission,
		"medical_history": medical_history,
		"suicide_risk": suicide_risk,
		"history_form": history_form,
		"morse_fall_scale": morse_fall_scale,
		"all_complete": medical_history and suicide_risk and history_form and morse_fall_scale,
	}


@frappe.whitelist()
def get_op_doctor_required_documents_status(
	patient: str,
	patient_visit: str | None = None,
) -> dict:
	"""Return whether mandatory doctor documents exist for an OP visit.

	- Patient Medical History linked to the active patient visit
	"""
	if not patient:
		frappe.throw(_("Patient is required"))

	medical_history_filters: dict = {"patient": patient}
	if patient_visit:
		medical_history_filters["patient_visit"] = patient_visit

	medical_history = bool(frappe.db.exists("Patient Medical History", medical_history_filters))

	return {
		"patient": patient,
		"patient_visit": patient_visit,
		"medical_history": medical_history,
		"all_complete": medical_history,
	}
