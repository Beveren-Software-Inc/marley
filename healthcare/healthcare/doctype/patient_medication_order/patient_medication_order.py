# -*- coding: utf-8 -*-
# Copyright (c) 2020, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt


import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cstr

from healthcare.healthcare.doctype.patient_visit.patient_visit import (
	get_prescription_dates,
)


class PatientMedicationOrder(Document):
	def validate(self):
		self.validate_inpatient()
		self.validate_duplicate()
		self.set_total_orders()
		self.set_status()

	def on_submit(self):
		self.validate_inpatient()
		self.set_status()

	def on_cancel(self):
		self.set_status()

	def validate_inpatient(self):
		pass
		# if not self.inpatient_record:
		# 	frappe.throw(_("No Inpatient Admission found against patient {0}").format(self.patient))

	def validate_duplicate(self):
		# Allow creating a new order when the existing one is Completed
		# Only block if there's an active (non-cancelled, non-completed) order for this visit
		existing_mo = frappe.db.sql(
			"""
			SELECT name FROM `tabPatient Medication Order`
			WHERE patient_encounter = %(patient_encounter)s
				AND docstatus != 2
				AND (status IS NULL OR status != 'Completed')
				AND (name != %(name)s OR %(name)s IS NULL OR %(name)s = '')
			LIMIT 1
			""",
			{"patient_encounter": self.patient_encounter, "name": self.name or ""},
			as_dict=True,
		)
		# if existing_mo:
		# 	frappe.throw(
		# 		_("A Patient Medication Order {0} against Patient Visit {1} already exists.").format(
		# 			existing_mo[0].name, self.patient_encounter
		# 		),
		# 		frappe.DuplicateEntryError,
		# 	)

	def set_total_orders(self):
		self.db_set("total_orders", len(self.medication_orders))

	def set_status(self):
		status = {"0": "Draft", "1": "Submitted", "2": "Cancelled"}[cstr(self.docstatus or 0)]

		if self.docstatus == 1:
			if not self.completed_orders:
				status = "Pending"
			elif self.completed_orders < self.total_orders:
				status = "In Process"
			else:
				status = "Completed"

		self.db_set("status", status)

	@frappe.whitelist()
	def add_order_entries(self, order):
		if order.get("drug_code"):
			dosage = frappe.get_doc("Prescription Frequency", order.get("dosage"))
			dates = get_prescription_dates(order.get("period"), self.start_date)
			for date in dates:
				for dose in dosage.dosage_strength:
					entry = self.append("medication_orders")
					entry.drug = order.get("drug_code")
					entry.drug_name = frappe.db.get_value("Item", order.get("drug_code"), "item_name")
					entry.dosage = dose.strength
					entry.dosage_form = order.get("dosage_form")
					entry.date = date
					entry.time = dose.strength_time
			self.end_date = dates[-1]
		return

	@frappe.whitelist()
	def get_from_encounter(self, encounter):
		patient_encounter = frappe.get_doc("Patient Visit", encounter)
		if not patient_encounter.drug_prescription:
			return
		for drug in patient_encounter.drug_prescription:
			self.add_order_entries(drug)

	@frappe.whitelist()
	def create_subscription_plan(self, medications, frequency, start_date=None, end_date=None):
		"""Create a Subscription Medication Plan from this Medication Order.

		:medications: list of row dicts coming from the dialog Table
		"""
		if not medications:
			frappe.throw(_("Please add at least one medication"))

		start_date = start_date or self.start_date

		plan = frappe.new_doc("Subscription Medication Plan")
		plan.patient = self.patient
		plan.practitioner = self.practitioner
		plan.company = self.company
		plan.frequency = frequency
		plan.start_date = start_date
		plan.end_date = end_date
		plan.next_run_date = start_date

		for row in medications:
			if not row.get("drug"):
				continue
			child = plan.append("medications")
			# optional link back to original entry if provided
			child.medication_order_entry = row.get("medication_order_entry")
			child.drug = row.get("drug")
			child.drug_name = row.get("drug_name")
			child.dosage = row.get("dosage")
			child.dosage_form = row.get("dosage_form")
			child.instructions = row.get("instructions")
			child.patient_frequency = row.get("patient_frequency")
			child.date = row.get("date")
			child.time = row.get("time")
			child.qty_per_cycle = row.get("qty_per_cycle") or 1
			child.is_active = row.get("is_active", 1)

		plan.insert()
		plan.submit()

		return {
			"name": plan.name,
			"patient": plan.patient,
			"next_run_date": plan.next_run_date,
		}
