# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc


class PatientReferral(Document):
	pass


@frappe.whitelist()
def create_referral_from_encounter(source_name, target_doc=None):
	"""Create Patient Referral from Patient Visit"""
	def set_missing_values(source, target):
		target.patient = source.patient
		target.file_number = source.patient
		target.referred_from_doctype = "Patient Visit"
		target.referred_from_docname = source.name
		target.referral_date = frappe.utils.today()
		if source.company:
			target.company = source.company

	doc = get_mapped_doc(
		"Patient Visit",
		source_name,
		{
			"Patient Visit": {
				"doctype": "Patient Referral",
			}
		},
		target_doc,
		set_missing_values,
	)

	return doc


@frappe.whitelist()
def create_referral_from_inpatient(source_name, target_doc=None):
	"""Create Patient Referral from Inpatient Admission"""
	def set_missing_values(source, target):
		target.patient = source.patient
		target.file_number = source.patient
		target.referred_from_doctype = "Inpatient Admission"
		target.referred_from_docname = source.name
		target.referral_date = frappe.utils.today()
		if source.company:
			target.company = source.company

	doc = get_mapped_doc(
		"Inpatient Admission",
		source_name,
		{
			"Inpatient Admission": {
				"doctype": "Patient Referral",
			}
		},
		target_doc,
		set_missing_values,
	)

	return doc

