# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _


@frappe.whitelist()
def get_patient_medical_history(patient):
	"""Get patient's medical history from the medical history tab"""
	if not patient:
		frappe.throw(_("Patient is required"))
	
	patient_doc = frappe.get_doc('Patient', patient)
	
	return {
		'allergies': patient_doc.allergies if hasattr(patient_doc, 'allergies') else None,
		'medication': patient_doc.medication if hasattr(patient_doc, 'medication') else None,
		'medical_history': patient_doc.medical_history if hasattr(patient_doc, 'medical_history') else None,
		'surgical_history': patient_doc.surgical_history if hasattr(patient_doc, 'surgical_history') else None,
		'occupation': patient_doc.occupation if hasattr(patient_doc, 'occupation') else None,
		'marital_status': patient_doc.marital_status if hasattr(patient_doc, 'marital_status') else None,
		'tobacco_past_use': patient_doc.tobacco_past_use if hasattr(patient_doc, 'tobacco_past_use') else None,
		'tobacco_current_use': patient_doc.tobacco_current_use if hasattr(patient_doc, 'tobacco_current_use') else None,
		'alcohol_past_use': patient_doc.alcohol_past_use if hasattr(patient_doc, 'alcohol_past_use') else None,
		'alcohol_current_use': patient_doc.alcohol_current_use if hasattr(patient_doc, 'alcohol_current_use') else None,
		'surrounding_factors': patient_doc.surrounding_factors if hasattr(patient_doc, 'surrounding_factors') else None,
		'other_risk_factors': patient_doc.other_risk_factors if hasattr(patient_doc, 'other_risk_factors') else None,
		'patient_name': patient_doc.patient_name,
		'file_no': patient_doc.name
	}
