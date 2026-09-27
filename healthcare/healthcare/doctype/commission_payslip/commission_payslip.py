# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt, getdate


class CommissionPayslip(Document):
	def validate(self):
		if self.from_date and self.to_date and getdate(self.from_date) > getdate(self.to_date):
			frappe.throw(_("From Date cannot be after To Date"))
		self._recalc_totals()
		# A new (or amended) payslip starts life as a draft again.
		if self.docstatus == 0 and not self.payment_entry:
			self.status = "Draft"

	def before_submit(self):
		"""A payslip is submitted once the doctor's commission is approved and payable."""
		if not self.items:
			frappe.throw(_("There are no services on this payslip, so there is nothing to approve."))

	def on_submit(self):
		self.db_set("status", "Submitted", update_modified=False)

	def on_cancel(self):
		"""A payslip can be cancelled once its payment is out of the way.

		Only a *live* Payment Entry is in the way. One that has itself been
		cancelled leaves a stale link behind, which is cleared here rather than
		blocking the cancel (and rather than being mistaken for a payment that
		still exists when the commission is paid again).
		"""
		if self.payment_entry:
			if cint(frappe.db.get_value("Payment Entry", self.payment_entry, "docstatus")) == 1:
				frappe.throw(
					_("Cancel Payment Entry {0} before cancelling this payslip.").format(
						self.payment_entry
					)
				)
			self.db_set("payment_entry", None, update_modified=False)
		self.db_set("status", "Cancelled", update_modified=False)

	def _recalc_totals(self):
		"""Service amount, commission and distinct cases across the payslip lines.

		Each service line is split into one row per mode of payment, so a case is
		counted once per (branch, case #) — not once per payment mode row. The mode's
		charge (e.g. the card fee) comes off the collection, so the commission totals
		are computed on the net paid amounts.
		"""
		total_service = 0.0
		total_commission = 0.0
		total_deduction = 0.0
		cases = set()
		for row in self.items or []:
			total_service += flt(row.service_amount)
			total_deduction += flt(row.get("deduction_amount"))
			total_commission += (
				flt(row.get("net_commission_amount"))
				if row.get("net_commission_amount") is not None
				else flt(row.commission_amount)
			)
			cases.add((row.cost_center or "", cint(row.case_index)))
		self.total_service_amount = total_service
		self.total_commission = total_commission
		if hasattr(self, "total_deduction"):
			self.total_deduction = total_deduction
		self.total_cases = len(cases)

	@frappe.whitelist()
	def view_statement(self):
		"""Doctor commission statement for this payslip (view and print)."""
		from healthcare.api.doctor_commission_statement import get_statement_for_payslip

		self.flags.ignore_permissions = True
		return get_statement_for_payslip(self)

	@frappe.whitelist()
	def create_payment_entry(self):
		"""Pay this doctor's commission from the bank/cash account."""
		from healthcare.api.doctor_commission_accounting import create_payment_entry_for_payslip

		payment_entry = create_payment_entry_for_payslip(self)
		return {
			"payment_entry": payment_entry.name,
			"paid_from": payment_entry.paid_from,
			"mode_of_payment": payment_entry.mode_of_payment,
			"paid_amount": payment_entry.paid_amount,
		}
