# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, getdate, today

from healthcare.api.billing import _ensure_sales_invoice_due_date
from healthcare.api.sales_invoice import _invoice_status_bucket


def _doc(posting_date, due_date, schedule_due_dates=()):
	"""Sales Invoice stand-in: only the fields the due-date guard touches."""
	return frappe._dict(
		posting_date=posting_date,
		due_date=due_date,
		payment_schedule=[frappe._dict(due_date=d) for d in schedule_due_dates],
	)


class TestSalesInvoiceDueDateGuard(IntegrationTestCase):
	"""Submitting a draft must not overwrite a valid credit due date.

	Clobbering it made the invoice due date disagree with the payment schedule, so
	ERPNext fell back to its "Submitted" invoice status once the due date passed and
	the reception UI stopped offering "Record payment" for the outstanding balance.
	"""

	def test_keeps_valid_future_due_date(self):
		posting = add_days(today(), -1)
		due = add_days(today(), 30)

		doc = _doc(posting, due, [due])
		_ensure_sales_invoice_due_date(doc)

		self.assertEqual(getdate(doc.due_date), getdate(due))
		self.assertEqual(getdate(doc.payment_schedule[0].due_date), getdate(due))

	def test_keeps_due_date_for_old_draft(self):
		posting = add_days(today(), -10)
		due = add_days(today(), 20)

		doc = _doc(posting, due)
		_ensure_sales_invoice_due_date(doc)

		self.assertEqual(getdate(doc.due_date), getdate(due))

	def test_moves_due_date_before_posting_date(self):
		posting = add_days(today(), -2)

		doc = _doc(posting, add_days(today(), -5))
		_ensure_sales_invoice_due_date(doc)

		self.assertEqual(getdate(doc.due_date), getdate(today()))

	def test_stale_due_date_follows_payment_schedule(self):
		posting = add_days(today(), -2)
		schedule_due = add_days(today(), 30)

		doc = _doc(posting, add_days(today(), -5), [schedule_due])
		_ensure_sales_invoice_due_date(doc)

		self.assertEqual(getdate(doc.due_date), getdate(schedule_due))

	def test_fills_missing_due_date(self):
		posting = add_days(today(), -1)

		doc = _doc(posting, None)
		_ensure_sales_invoice_due_date(doc)

		self.assertEqual(getdate(doc.due_date), getdate(today()))

	def test_moves_only_invalid_payment_schedule_rows(self):
		posting = add_days(today(), -1)
		due = add_days(today(), 30)
		future_row = add_days(today(), 60)

		doc = _doc(posting, due, [add_days(today(), -20), future_row])
		_ensure_sales_invoice_due_date(doc)

		self.assertEqual(getdate(doc.payment_schedule[0].due_date), getdate(due))
		self.assertEqual(getdate(doc.payment_schedule[1].due_date), getdate(future_row))


class TestInvoiceStatusBucket(IntegrationTestCase):
	"""Every ERPNext status that still carries a balance counts as pending."""

	def test_pending_statuses(self):
		self.assertEqual(_invoice_status_bucket("Unpaid"), "unpaid")
		self.assertEqual(_invoice_status_bucket("Submitted"), "unpaid")
		self.assertEqual(_invoice_status_bucket("Overdue"), "overdue")
		self.assertEqual(_invoice_status_bucket("Partly Paid"), "partially_paid")
		self.assertEqual(_invoice_status_bucket("Partially Paid"), "partially_paid")

	def test_discounted_suffix_is_ignored(self):
		self.assertEqual(_invoice_status_bucket("Unpaid and Discounted"), "unpaid")
		self.assertEqual(_invoice_status_bucket("Overdue and Discounted"), "overdue")
		self.assertEqual(_invoice_status_bucket("Partly Paid and Discounted"), "partially_paid")
		self.assertEqual(_invoice_status_bucket("Paid and Discounted"), "paid")

	def test_closed_and_unknown_statuses(self):
		self.assertEqual(_invoice_status_bucket("Paid"), "paid")
		self.assertEqual(_invoice_status_bucket("Return"), "")
		self.assertEqual(_invoice_status_bucket("Credit Note Issued"), "")
		self.assertEqual(_invoice_status_bucket("Draft"), "")
		self.assertEqual(_invoice_status_bucket(None), "")
