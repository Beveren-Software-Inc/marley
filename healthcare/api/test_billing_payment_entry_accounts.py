# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and Contributors
# See license.txt

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests import IntegrationTestCase

from healthcare.api import billing

COMPANY = "Test Company"
RECEIVABLE = "Debtors - TC"
MOP_BANK = "Credit Card Machine - TC"
MOP_CASH = "Main Cash - TC"


def _invoice(**kwargs):
	"""A submitted Sales Invoice stand-in; nothing is written to the database."""
	values = {
		"docstatus": 1,
		"outstanding_amount": 100.0,
		"grand_total": 100.0,
		"company": COMPANY,
		"customer": "PAT-0001",
		"customer_name": "Test Patient",
	}
	values.update(kwargs)
	invoice = SimpleNamespace(**values)
	invoice.reload = lambda: None
	return invoice


class TestReceptionPaymentEntryAccounts(IntegrationTestCase):
	"""Reception payments post to the Mode of Payment account, not company defaults.

	The company's Cash/Bank defaults are only a fallback for modes of payment that
	have no account mapped for the company (handled inside ``_resolve_accounts``).
	"""

	def _create(self, payment_modes, accounts):
		payment_entry = MagicMock()
		payment_entry.name = "PE-0001"
		company = SimpleNamespace(
			default_currency="BHD",
			default_receivable_account=RECEIVABLE,
			default_cash_account="Company Default Cash - TC",
			default_bank_account="Company Default Bank - TC",
		)
		real_get_doc = frappe.get_doc

		def fake_get_doc(doctype, *args, **kwargs):
			if doctype == "Sales Invoice":
				return _invoice()
			if doctype == "Company":
				return company
			return real_get_doc(doctype, *args, **kwargs)

		with (
			patch.object(billing.frappe, "get_doc", side_effect=fake_get_doc),
			patch.object(billing.frappe, "new_doc", return_value=payment_entry),
			patch(
				"healthcare.api.payment_entry._resolve_accounts",
				side_effect=lambda company_name, mode: accounts[mode],
			) as resolve_accounts,
			patch("healthcare.api.receptionist_shift.stamp_receptionist_shift_on_doc"),
		):
			result = billing.create_payment_entry(
				invoice_name="SINV-0001", payment_modes=payment_modes
			)

		return result, payment_entry, resolve_accounts

	def test_bank_mode_posts_to_mode_of_payment_account(self):
		result, payment_entry, resolve_accounts = self._create(
			[{"mode_of_payment": "Credit Card", "amount": 100}],
			{"Credit Card": (RECEIVABLE, MOP_BANK)},
		)

		self.assertTrue(result.get("success"))
		resolve_accounts.assert_called_once_with(COMPANY, "Credit Card")
		self.assertEqual(payment_entry.mode_of_payment, "Credit Card")
		self.assertEqual(payment_entry.paid_from, RECEIVABLE)
		self.assertEqual(payment_entry.paid_to, MOP_BANK)

	def test_each_mode_resolves_its_own_account(self):
		_, payment_entry, resolve_accounts = self._create(
			[
				{"mode_of_payment": "Credit Card", "amount": 60},
				{"mode_of_payment": "Cash", "amount": 40},
			],
			{
				"Credit Card": (RECEIVABLE, MOP_BANK),
				"Cash": (RECEIVABLE, MOP_CASH),
			},
		)

		self.assertEqual(
			[
				("Test Company", "Credit Card"),
				("Test Company", "Cash"),
			],
			[call.args for call in resolve_accounts.call_args_list],
		)
		# The last submitted entry is the cash leg; it must not fall back to the
		# company default bank/cash account.
		self.assertEqual(payment_entry.paid_to, MOP_CASH)
