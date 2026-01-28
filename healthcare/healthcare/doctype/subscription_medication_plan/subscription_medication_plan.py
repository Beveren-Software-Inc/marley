import frappe
from frappe.model.document import Document


class SubscriptionMedicationPlan(Document):
	def before_insert(self):
		# initialise next_run_date to start_date if not set
		if not self.next_run_date:
			self.next_run_date = self.start_date

	def on_submit(self):
		# mark as Active on submit if not manually set
		if self.status in (None, "", "Draft"):
			self.db_set("status", "Active")

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

