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

	return {
		"patient": patient,
		"admission": admission,
		"medical_history": medical_history,
		"suicide_risk": suicide_risk,
		"history_form": history_form,
		"all_complete": medical_history and suicide_risk and history_form,
	}
