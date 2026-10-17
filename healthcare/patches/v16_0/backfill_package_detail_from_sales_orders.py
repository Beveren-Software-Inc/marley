"""Backfill missing Package Detail rows from submitted package Sales Orders.

Mid-stay package charges created the Sales Order, Sales Invoice and Payment
Entry correctly, but the Package Detail insert failed because its ``file_number``
field fetched from the removed ``Inpatient Admission.file_number`` column. The
charge API logs that failure without failing the billing, so affected admissions
show 0 billed days and no charge history.

Create one ledger row for each submitted package Sales Order that has no ledger
row yet. Existing Package Detail rows are left untouched.
"""

from __future__ import annotations

import frappe
from frappe.utils import add_days, cint, flt, getdate


def execute():
	if not frappe.db.table_exists("Package Detail"):
		return
	if not frappe.db.has_column("Package Detail", "sales_order"):
		return

	orders = frappe.db.sql(
		"""
		SELECT
			so.name AS sales_order,
			so.company,
			so.currency,
			so.transaction_date,
			so.custom_reference_name AS admission,
			soi.qty,
			soi.rate,
			soi.amount,
			soi.prevdoc_docname AS quotation
		FROM `tabSales Order` so
		INNER JOIN `tabSales Order Item` soi
			ON soi.parent = so.name
			AND soi.docstatus = 1
			AND soi.prevdoc_docname IS NOT NULL
			AND soi.prevdoc_docname != ''
		WHERE so.docstatus = 1
			AND so.custom_reference_type = 'Inpatient Admission'
			AND so.custom_reference_name IS NOT NULL
			AND so.custom_reference_name != ''
		ORDER BY so.transaction_date, so.creation, soi.idx
		""",
		as_dict=True,
	)

	seen_orders: set[str] = set()
	touched_admissions: set[str] = set()
	billed_days_by_admission = _billed_days_by_admission()

	for order in orders:
		sales_order = order.sales_order
		if sales_order in seen_orders:
			continue
		if frappe.db.exists("Package Detail", {"sales_order": sales_order}):
			seen_orders.add(sales_order)
			continue

		quotation = frappe.db.get_value(
			"Quotation",
			order.quotation,
			["custom_package", "custom_inpatient_admission", "company", "currency", "transaction_date"],
			as_dict=True,
		)
		if not quotation or not quotation.custom_package:
			continue

		admission_name = (order.admission or quotation.custom_inpatient_admission or "").strip()
		if not admission_name:
			continue
		admission = frappe.db.get_value(
			"Inpatient Admission",
			admission_name,
			["patient", "company", "admission_date", "scheduled_date", "admitted_datetime"],
			as_dict=True,
		)
		if not admission or not admission.patient:
			continue

		days = cint(order.qty)
		amount = flt(order.amount)
		if days <= 0 or amount <= 0:
			continue

		# Keep the ledger contiguous: continue after the days already billed for
		# this admission, then cover exactly the Sales Order quantity.
		already_billed = billed_days_by_admission.get(admission_name, 0)
		start = (
			admission.admission_date
			or admission.scheduled_date
			or admission.admitted_datetime
			or quotation.transaction_date
			or order.transaction_date
		)
		start = getdate(start)
		from_date = add_days(start, already_billed) if already_billed else start
		to_date = add_days(from_date, max(days - 1, 0))
		amount_per_day = flt(order.rate) or (amount / days)

		detail = frappe.new_doc("Package Detail")
		detail.company = order.company or quotation.company or admission.company
		detail.admission_no = admission_name
		detail.file_number = admission.patient
		detail.from_date = from_date
		detail.to_date = to_date
		detail.total_days = days
		detail.currency = order.currency or quotation.currency
		detail.transaction_amount = amount
		detail.vch_status = "Open"
		detail.remarks = frappe._(
			"Backfilled from Sales Order {0} (Quotation {1})."
		).format(sales_order, order.quotation)
		if detail.meta.has_field("inpatient_package"):
			detail.inpatient_package = quotation.custom_package
		if detail.meta.has_field("amount_per_day"):
			detail.amount_per_day = amount_per_day
		if detail.meta.has_field("quotation"):
			detail.quotation = order.quotation
		detail.sales_order = sales_order
		detail.insert(ignore_permissions=True)

		seen_orders.add(sales_order)
		touched_admissions.add(admission_name)
		billed_days_by_admission[admission_name] = already_billed + days

	for admission_name in touched_admissions.union(billed_days_by_admission):
		total = (
			frappe.db.sql(
				"""
				SELECT COALESCE(SUM(total_days), 0)
				FROM `tabPackage Detail`
				WHERE admission_no = %s
				""",
				admission_name,
			)[0][0]
			or 0
		)
		frappe.db.set_value(
			"Inpatient Admission",
			admission_name,
			"package_days_billed",
			cint(total),
			update_modified=False,
		)

	frappe.db.commit()


def _billed_days_by_admission() -> dict[str, int]:
	rows = frappe.db.sql(
		"""
		SELECT admission_no, COALESCE(SUM(total_days), 0) AS total_days
		FROM `tabPackage Detail`
		GROUP BY admission_no
		""",
		as_dict=True,
	)
	return {row.admission_no: cint(row.total_days) for row in rows}
