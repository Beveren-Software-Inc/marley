import frappe
from frappe.model.document import Document


class SubscriptionMedicationPlan(Document):
	def before_insert(self):
		# Initialise next_run_date based on frequency for new docs
		if self.start_date and self.frequency:
			self.next_run_date = self._compute_next_run_date()

	def validate(self):
		# Recalculate next_run_date whenever start_date or frequency changes
		if self.start_date and self.frequency:
			self.next_run_date = self._compute_next_run_date()

	def on_submit(self):
		# mark as Active on submit if not manually set
		if self.status in (None, "", "Draft"):
			self.db_set("status", "Active")

	def _compute_next_run_date(self):
		"""Compute next_run_date from start_date and frequency.

		For now:
		- Monthly => +30 days
		- Every 2 Months => +60 days
		- Every 3 Months => +90 days
		"""
		if not self.start_date:
			return None

		from frappe.utils import add_days

		freq_map = {
			"Monthly": 30,
			"Every 2 Months": 60,
			"Every 3 Months": 90,
		}
		days = freq_map.get(self.frequency) or 30
		return add_days(self.start_date, days)

	@frappe.whitelist()
	def create_medication_order_now(self):
		"""Create a Patient Medication Order immediately from this plan."""
		if not self.patient:
			frappe.throw("Patient is required on Subscription Medication Plan")

		mo = frappe.new_doc("Patient Medication Order")
		mo.patient = self.patient
		mo.patient_name = self.patient_name
		mo.practitioner = self.practitioner
		mo.company = self.company
		mo.start_date = frappe.utils.getdate()

		for item in self.medications:
			if not getattr(item, "is_active", 0):
				continue
			row = mo.append("medication_orders")
			row.drug = item.drug
			row.drug_name = item.drug_name
			row.dosage = item.dosage
			row.dosage_form = item.dosage_form
			row.date = item.date or mo.start_date
			row.time = item.time
			row.instructions = item.instructions
			row.patient_frequency = item.patient_frequency

		mo.insert()
		# leave as Draft so pharmacist can review; change to submit() if needed

		return {
			"name": mo.name,
			"patient": mo.patient,
		}

