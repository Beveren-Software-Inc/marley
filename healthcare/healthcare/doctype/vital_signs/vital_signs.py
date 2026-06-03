# -*- coding: utf-8 -*-
# Copyright (c) 2015, ESS LLP and contributors
# For license information, please see license.txt


import frappe
from frappe import _
from frappe.model.document import Document

from healthcare.api.utils.api_utility import get_next_transaction_number


def assign_vital_signs_trans_no(doc) -> None:
	"""Assign trans_no for new Vital Signs (autoname: field:trans_no). Server-only."""
	if (doc.get("trans_no") or "").strip():
		return
	doc.trans_no = get_next_transaction_number("Vital Signs", fieldname="trans_no")


def _patient_visit_link(doc):
	"""Patient Visit on Vital Signs is stored in `encounter` (desk label: Patient Visit)."""
	return doc.get("patient_visit") or doc.get("encounter")


def fill_patient_from_care_context(doc) -> None:
	"""Fill patient / patient_name from IP admission or OP patient visit when patient is missing."""
	if doc.get("patient"):
		if not doc.get("patient_name"):
			doc.patient_name = frappe.db.get_value("Patient", doc.patient, "patient_name")
		return

	admission = doc.get("inpatient_record")
	if admission:
		row = frappe.db.get_value(
			"Inpatient Admission",
			admission,
			["patient", "patient_name"],
			as_dict=True,
		)
		if row and row.patient:
			doc.patient = row.patient
			if row.patient_name:
				doc.patient_name = row.patient_name
			return

	visit = _patient_visit_link(doc)
	if visit:
		row = frappe.db.get_value(
			"Patient Visit",
			visit,
			["patient", "patient_name"],
			as_dict=True,
		)
		if row and row.patient:
			doc.patient = row.patient
			if row.patient_name:
				doc.patient_name = row.patient_name

	if doc.get("patient") and not doc.get("patient_name"):
		doc.patient_name = frappe.db.get_value("Patient", doc.patient, "patient_name")


class VitalSigns(Document):
	def before_insert(self):
		assign_vital_signs_trans_no(self)
		fill_patient_from_care_context(self)

	def validate(self):
		fill_patient_from_care_context(self)
		if not self.patient:
			frappe.throw(
				_("Patient is required. Select a patient, or set Inpatient Admission or Patient Visit.")
			)
		self.set_title()

	def set_title(self):
		self.title = _("{0} on {1}").format(
			self.patient_name or self.patient, frappe.utils.format_date(self.signs_date)
		)[:100]
