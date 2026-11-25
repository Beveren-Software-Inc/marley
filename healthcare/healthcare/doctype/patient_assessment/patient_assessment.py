# -*- coding: utf-8 -*-
# Copyright (c) 2020, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt


import frappe
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc


class PatientAssessment(Document):
	def validate(self):
		self.set_default_practitioner()
		self.set_total_score()

	def set_default_practitioner(self):
		"""Blank Username falls back to the practitioner linked to the record owner.

		The portal lets users leave "Username" empty; instead of storing a blank
		value (which hides who recorded the assessment), reuse the Healthcare
		Practitioner linked to the document owner's user account.
		"""
		if self.healthcare_practitioner:
			return

		user = self.owner or frappe.session.user
		if not user or user == "Guest":
			return

		practitioner = frappe.db.get_value("Healthcare Practitioner", {"user_id": user}, "name")
		if not practitioner:
			return

		self.healthcare_practitioner = practitioner
		if not self.practitioner_name:
			self.practitioner_name = frappe.db.get_value(
				"Healthcare Practitioner", practitioner, "practitioner_name"
			)

	def set_total_score(self):
		total_score = 0

		for entry in self.assessment_sheet:
			total_score += int(entry.score or 0)

		self.total_score_obtained = total_score


@frappe.whitelist()
def create_patient_assessment(source_name, target_doc=None):
	doc = get_mapped_doc(
		"Therapy Session",
		source_name,
		{
			"Therapy Session": {
				"doctype": "Patient Assessment",
				"field_map": [
					["therapy_session", "name"],
					["patient", "patient"],
					["practitioner", "practitioner"],
				],
			}
		},
		target_doc,
	)

	return doc
