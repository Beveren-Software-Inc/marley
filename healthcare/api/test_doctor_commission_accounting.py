# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and Contributors
# See license.txt

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from healthcare.api.doctor_commission_accounting import (
	build_payroll_ledger_rows,
	commission_amount,
	create_payment_entry_for_payslip,
	get_practitioner_expense_account,
	on_payment_entry_cancel,
)


def _doctor(**kwargs):
	"""A Doctor Commission Payroll Doctor row with sensible defaults.

	The practitioner is a fictional name, so the live Expense Account lookup on
	*Healthcare Practitioner* finds nothing unless a test patches it.
	"""
	row = {
		"practitioner": "HLC-PRAC-0001",
		"practitioner_name": "Dr. One",
		"employee": "HR-EMP-0001",
		"cost_center": "Main - Branch",
		"calculated_commission": 0.0,
		"adjusted_commission": None,
		"expense_account": None,
	}
	row.update(kwargs)
	return frappe._dict(row)


def _payroll(doctors=None, company="Test Company"):
	return frappe._dict({"name": "DCP-2026-0001", "company": company, "doctors": doctors or []})


class TestDoctorCommissionAccounting(IntegrationTestCase):
	"""The Journal Entry rows built from a payroll's doctors."""

	def test_commission_uses_adjusted_amount_when_set(self):
		self.assertEqual(commission_amount(_doctor(calculated_commission=100)), 100.0)
		self.assertEqual(
			commission_amount(_doctor(calculated_commission=100, adjusted_commission=80)), 80.0
		)
		# An explicit zero adjustment is a real amount, not a blank.
		self.assertEqual(
			commission_amount(_doctor(calculated_commission=100, adjusted_commission=0)), 0.0
		)

	def test_expense_is_debited_per_doctor_and_payable_credited_per_employee(self):
		expense_rows, payable_rows, problems = build_payroll_ledger_rows(
			_payroll(
				[
					_doctor(practitioner_name="Dr. One", calculated_commission=100, cost_center="A"),
					_doctor(
						practitioner_name="Dr. Two",
						practitioner="HLC-PRAC-0002",
						calculated_commission=25.5,
						cost_center="B",
					),
				]
			),
			default_expense_account="Commission Expense",
		)

		self.assertEqual(problems, [])
		self.assertEqual(
			expense_rows,
			[
				{
					"account": "Commission Expense",
					"cost_center": "A",
					"amount": 100.0,
					"practitioner_name": "Dr. One",
				},
				{
					"account": "Commission Expense",
					"cost_center": "B",
					"amount": 25.5,
					"practitioner_name": "Dr. Two",
				},
			],
		)
		self.assertEqual(
			payable_rows,
			[{"employee": "HR-EMP-0001", "amount": 125.5, "doctors": ["Dr. One", "Dr. Two"]}],
		)

	def test_payable_is_grouped_per_employee(self):
		"""Two doctors paid through one employee are credited once, in total."""
		_, payable_rows, _ = build_payroll_ledger_rows(
			_payroll(
				[
					_doctor(practitioner_name="Dr. One", calculated_commission=10),
					_doctor(
						practitioner_name="Dr. Two",
						practitioner="HLC-PRAC-0002",
						calculated_commission=15,
					),
					_doctor(
						practitioner_name="Dr. Three",
						practitioner="HLC-PRAC-0003",
						employee="HR-EMP-0002",
						calculated_commission=7,
					),
				]
			),
			default_expense_account="Commission Expense",
		)

		self.assertEqual(
			payable_rows,
			[
				{"employee": "HR-EMP-0001", "amount": 25.0, "doctors": ["Dr. One", "Dr. Two"]},
				{"employee": "HR-EMP-0002", "amount": 7.0, "doctors": ["Dr. Three"]},
			],
		)

	def test_doctor_expense_account_wins_over_the_default(self):
		expense_rows, _, problems = build_payroll_ledger_rows(
			_payroll([_doctor(calculated_commission=5, expense_account="Doctor Expense")]),
			default_expense_account="Commission Expense",
		)

		self.assertEqual(problems, [])
		self.assertEqual([row["account"] for row in expense_rows], ["Doctor Expense"])

	def test_practitioner_expense_account_is_used_when_the_row_has_none(self):
		"""A doctor who keeps his own account is posted to it, not to the default."""
		with patch(
			"healthcare.api.doctor_commission_accounting.get_practitioner_expense_account",
			return_value="Doctor Own Expense",
		):
			expense_rows, _, problems = build_payroll_ledger_rows(
				_payroll([_doctor(calculated_commission=5)]),
				default_expense_account="Commission Expense",
			)

		self.assertEqual(problems, [])
		self.assertEqual([row["account"] for row in expense_rows], ["Doctor Own Expense"])

	def test_row_expense_account_still_wins_over_the_practitioner(self):
		"""The payroll row stays the place for a one-off correction."""
		with patch(
			"healthcare.api.doctor_commission_accounting.get_practitioner_expense_account",
			return_value="Doctor Own Expense",
		):
			expense_rows, _, _ = build_payroll_ledger_rows(
				_payroll([_doctor(calculated_commission=5, expense_account="Payroll Correction")]),
				default_expense_account="Commission Expense",
			)

		self.assertEqual([row["account"] for row in expense_rows], ["Payroll Correction"])

	def test_practitioner_expense_account_lookup_is_blank_without_a_doctor(self):
		self.assertEqual(get_practitioner_expense_account(""), "")
		self.assertEqual(get_practitioner_expense_account("No Such Practitioner at All"), "")

	def test_doctors_without_an_amount_are_left_out(self):
		expense_rows, payable_rows, problems = build_payroll_ledger_rows(
			_payroll(
				[
					_doctor(practitioner_name="Dr. Zero", calculated_commission=0),
					_doctor(
						practitioner_name="Dr. One",
						calculated_commission=0,
						adjusted_commission=0,
					),
					_doctor(
						practitioner_name="Dr. Two",
						practitioner="HLC-PRAC-0002",
						calculated_commission=12,
					),
				]
			),
			default_expense_account="Commission Expense",
		)

		self.assertEqual(problems, [])
		self.assertEqual([row["practitioner_name"] for row in expense_rows], ["Dr. Two"])
		self.assertEqual([row["employee"] for row in payable_rows], ["HR-EMP-0001"])

	def test_missing_employee_and_account_are_reported_together(self):
		# "" = no fallback account configured, so the outcome does not depend on the
		# site's Healthcare Settings.
		expense_rows, payable_rows, problems = build_payroll_ledger_rows(
			_payroll(
				[
					_doctor(practitioner_name="Dr. No Account", calculated_commission=20),
					_doctor(
						practitioner_name="Dr. No Employee",
						practitioner="HLC-PRAC-0002",
						calculated_commission=10,
						employee=None,
						expense_account="Doctor Expense",
					),
				]
			),
			default_expense_account="",
		)

		self.assertEqual((expense_rows, payable_rows), ([], []))
		self.assertEqual(len(problems), 2)
		self.assertIn("Dr. No Account", problems[0])
		self.assertIn("expense account", problems[0])
		self.assertIn("Dr. No Employee", problems[1])
		self.assertIn("Employee", problems[1])


class TestCommissionPaymentCancel(IntegrationTestCase):
	"""Cancelling a commission payment: the payslip becomes payable again.

	A cancelled Payment Entry is not a payment, so it must neither block the
	payslip's cancel nor be mistaken for a live payment when it is paid again.
	"""

	def _payslip(self, **kwargs):
		return frappe._dict(
			{
				"name": "CPS-2026-0001",
				"company": "Test Company",
				"employee": "HR-EMP-0001",
				"doctor_commission_payroll": "DCP-2026-0001",
				"practitioner": "HLC-PRAC-0001",
				"practitioner_name": "Dr. One",
				"cost_center": "",
				"total_commission": 10.0,
				"docstatus": 1,
				"payment_entry": None,
				**kwargs,
			}
		)

	def test_cancelled_payment_releases_the_payslip(self):
		with (
			patch("frappe.get_all", return_value=["CPS-2026-0001"]) as get_all,
			patch("frappe.db.set_value") as set_value,
			patch("frappe.get_doc") as get_doc,
		):
			on_payment_entry_cancel(frappe._dict(name="ACC-PAY-2026-0001"), "on_cancel")

		get_all.assert_called_once_with(
			"Commission Payslip",
			filters={"payment_entry": "ACC-PAY-2026-0001", "docstatus": ["<", 2]},
			pluck="name",
		)
		set_value.assert_called_once_with(
			"Commission Payslip",
			"CPS-2026-0001",
			{"payment_entry": None, "status": "Submitted"},
			update_modified=False,
		)
		get_doc.assert_called_once_with("Commission Payslip", "CPS-2026-0001")
		get_doc.return_value.add_comment.assert_called_once()

	def test_live_payment_still_blocks_paying_again(self):
		with patch("frappe.db.get_value", return_value=1):
			with self.assertRaises(frappe.ValidationError) as raised:
				create_payment_entry_for_payslip(
					self._payslip(payment_entry="ACC-PAY-2026-0001")
				)

		self.assertIn("already exists", str(raised.exception))

	def test_cancelled_payment_does_not_block_paying_again(self):
		"""The stale link is dropped and the commission can be paid again."""
		payslip = self._payslip(payment_entry="ACC-PAY-2026-0001")

		def docstatus(doctype, *args, **kwargs):
			# The linked payment is cancelled; the payroll that carries the commission
			# is submitted, so the flow goes on to the account check — proof that the
			# "already exists" guard was passed rather than raised.
			return 2 if doctype == "Payment Entry" else 1

		with (
			patch("frappe.db.get_value", side_effect=docstatus),
			patch("frappe.db.exists", return_value=True),
			patch(
				"healthcare.api.doctor_commission_accounting.get_default_payable_account",
				return_value="",
			),
			patch("frappe.db.set_value") as set_value,
		):
			with self.assertRaises(frappe.ValidationError) as raised:
				create_payment_entry_for_payslip(payslip)

		self.assertIn("Default Payable Account", str(raised.exception))
		self.assertNotIn("already exists", str(raised.exception))
		set_value.assert_called_once_with(
			"Commission Payslip", "CPS-2026-0001", "payment_entry", None, update_modified=False
		)
		self.assertIsNone(payslip.payment_entry)
