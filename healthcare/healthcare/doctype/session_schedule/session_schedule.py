# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class SessionSchedule(Document):
	def before_validate(self):
		self._sync_patient_num()

	def _sync_patient_num(self):
		"""Keep patient_num filled from admission, visit, or an explicit value.

		patient_num is read-only in the form and only had fetch_from admission, so OP /
		standalone sessions were saved with a blank patient and disappeared when the
		list was filtered by patient.
		"""
		patient = (self.patient_num or "").strip() or None

		if self.admission_number and frappe.db.exists("Inpatient Admission", self.admission_number):
			patient = frappe.db.get_value("Inpatient Admission", self.admission_number, "patient") or patient

		if not patient and self.patient_visit and frappe.db.exists("Patient Visit", self.patient_visit):
			patient = frappe.db.get_value("Patient Visit", self.patient_visit, "patient") or patient

		if patient:
			self.patient_num = patient
