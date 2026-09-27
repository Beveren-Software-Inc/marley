# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and Contributors
# See license.txt

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from healthcare.healthcare.doctype.commission_payslip.commission_payslip import CommissionPayslip


# On IntegrationTestCase, the doctype test records and all
# link-field test record dependencies are recursively loaded
# Use these module variables to add/remove to/from that list
EXTRA_TEST_RECORD_DEPENDENCIES = []  # eg. ["User"]
IGNORE_TEST_RECORD_DEPENDENCIES = []  # eg. ["User"]


class _FakePayslip:
	"""Just enough of a payslip for the cancel guard, which touches no database."""

	def __init__(self, payment_entry=None):
		self.name = "CPS-2026-0001"
		self.payment_entry = payment_entry
		self.status = "Paid" if payment_entry else "Submitted"
		self.updates = []

	def db_set(self, fieldname, value=None, update_modified=True):
		setattr(self, fieldname, value)
		self.updates.append((fieldname, value))


class IntegrationTestCommissionPayslip(IntegrationTestCase):
	"""
	Integration tests for CommissionPayslip.
	Use this class for testing interactions between multiple components.
	"""

	def test_cancel_is_blocked_while_the_payment_is_live(self):
		payslip = _FakePayslip(payment_entry="ACC-PAY-2026-0001")

		with patch("frappe.db.get_value", return_value=1):
			with self.assertRaises(frappe.ValidationError) as raised:
				CommissionPayslip.on_cancel(payslip)

		self.assertIn("ACC-PAY-2026-0001", str(raised.exception))
		self.assertEqual(payslip.updates, [])
		self.assertEqual(payslip.payment_entry, "ACC-PAY-2026-0001")

	def test_cancel_is_allowed_once_the_payment_is_cancelled(self):
		payslip = _FakePayslip(payment_entry="ACC-PAY-2026-0001")

		with patch("frappe.db.get_value", return_value=2):
			CommissionPayslip.on_cancel(payslip)

		self.assertEqual(
			payslip.updates, [("payment_entry", None), ("status", "Cancelled")]
		)
		self.assertIsNone(payslip.payment_entry)

	def test_cancel_without_a_payment_only_sets_the_status(self):
		payslip = _FakePayslip()

		CommissionPayslip.on_cancel(payslip)

		self.assertEqual(payslip.updates, [("status", "Cancelled")])
