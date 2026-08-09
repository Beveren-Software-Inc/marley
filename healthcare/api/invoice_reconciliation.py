# -*- coding: utf-8 -*-
"""Allocate patient advance (unallocated Payment Entry credit) against Sales Invoices."""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import flt

from healthcare.api.payment_entry import _money, _money_gt, _patient_customer, _resolve_company_for_patient

INVOICE_RECONCILIATOR_ROLE = "Invoice Reconciliator"
_RECONCILE_ROLES = (
	INVOICE_RECONCILIATOR_ROLE,
	"System Manager",
	"Healthcare Administrator",
	"Accounts Manager",
)


def _require_reconciliator() -> None:
	roles = set(frappe.get_roles())
	if not roles.intersection(_RECONCILE_ROLES):
		frappe.throw(
			_("Only users with role {0} can reconcile advances to invoices.").format(
				INVOICE_RECONCILIATOR_ROLE
			),
			frappe.PermissionError,
		)


def _load_json(value):
	if isinstance(value, str):
		return json.loads(value) if value.strip() else None
	return value


@frappe.whitelist()
def get_reconciliation_candidates(patient: str | None = None) -> dict:
	"""Return unallocated advances and outstanding invoices for a patient."""
	_require_reconciliator()
	if not patient:
		frappe.throw(_("Patient is required"))

	customer = _patient_customer(patient)
	company = _resolve_company_for_patient(patient)

	advances = frappe.db.sql(
		"""
		SELECT
			pe.name,
			pe.posting_date,
			pe.mode_of_payment,
			pe.paid_amount,
			pe.unallocated_amount,
			pe.cost_center,
			pe.remarks,
			pe.paid_from AS receivable_account
		FROM `tabPayment Entry` pe
		WHERE pe.docstatus = 1
		  AND pe.payment_type = 'Receive'
		  AND pe.party_type = 'Customer'
		  AND pe.party = %(customer)s
		  AND pe.company = %(company)s
		  AND IFNULL(pe.unallocated_amount, 0) > 0
		ORDER BY pe.posting_date ASC, pe.creation ASC
		""",
		{"customer": customer, "company": company},
		as_dict=True,
	)

	invoices = frappe.db.sql(
		"""
		SELECT
			si.name,
			si.posting_date,
			si.due_date,
			si.grand_total,
			si.outstanding_amount,
			si.status,
			si.custom_reference_type,
			si.custom_reference_name,
			si.debit_to AS receivable_account
		FROM `tabSales Invoice` si
		WHERE si.docstatus = 1
		  AND si.company = %(company)s
		  AND IFNULL(si.outstanding_amount, 0) > 0
		  AND IFNULL(si.is_return, 0) = 0
		  AND (
		  	si.patient = %(patient)s
		  	OR si.customer = %(customer)s
		  )
		ORDER BY si.posting_date ASC, si.creation ASC
		""",
		{"patient": patient, "customer": customer, "company": company},
		as_dict=True,
	)

	advance_total = _money(sum(_money(r.unallocated_amount) for r in advances))
	invoice_total = _money(sum(_money(r.outstanding_amount) for r in invoices))

	return {
		"patient": patient,
		"customer": customer,
		"company": company,
		"advance_total": advance_total,
		"invoice_outstanding_total": invoice_total,
		"can_reconcile": advance_total > 0 and invoice_total > 0,
		"advances": [
			{
				"name": r.name,
				"posting_date": str(r.posting_date) if r.posting_date else None,
				"mode_of_payment": r.mode_of_payment,
				"paid_amount": _money(r.paid_amount),
				"unallocated_amount": _money(r.unallocated_amount),
				"cost_center": r.cost_center,
				"remarks": r.remarks,
				"receivable_account": r.receivable_account,
			}
			for r in advances
		],
		"invoices": [
			{
				"name": r.name,
				"posting_date": str(r.posting_date) if r.posting_date else None,
				"due_date": str(r.due_date) if r.due_date else None,
				"grand_total": _money(r.grand_total),
				"outstanding_amount": _money(r.outstanding_amount),
				"status": r.status,
				"custom_reference_type": r.custom_reference_type,
				"custom_reference_name": r.custom_reference_name,
				"receivable_account": r.receivable_account,
			}
			for r in invoices
		],
	}


@frappe.whitelist()
def reconcile_advance_to_invoices(patient: str | None = None, allocations=None) -> dict:
	"""Apply unallocated Payment Entry credit against Sales Invoices.

	``allocations`` is a list of:
	``{payment_entry, invoice, allocated_amount}``
	"""
	_require_reconciliator()
	if not patient:
		frappe.throw(_("Patient is required"))

	allocations = _load_json(allocations) or []
	if not isinstance(allocations, list) or not allocations:
		frappe.throw(_("Select at least one advance-to-invoice allocation"))

	customer = _patient_customer(patient)
	company = _resolve_company_for_patient(patient)

	# Group by payment entry so unallocated amounts stay consistent within a batch
	by_pe: dict[str, list[dict]] = {}
	for row in allocations:
		if not isinstance(row, dict):
			continue
		pe_name = (row.get("payment_entry") or row.get("voucher_no") or "").strip()
		inv_name = (row.get("invoice") or row.get("against_voucher") or "").strip()
		amount = _money(row.get("allocated_amount") or row.get("amount") or 0)
		if not pe_name or not inv_name or amount <= 0:
			continue
		by_pe.setdefault(pe_name, []).append({"invoice": inv_name, "amount": amount})

	if not by_pe:
		frappe.throw(_("No valid allocations provided"))

	from erpnext.accounts.utils import reconcile_against_document

	applied = []
	for pe_name, rows in by_pe.items():
		pe = frappe.get_doc("Payment Entry", pe_name)
		if pe.docstatus != 1 or pe.payment_type != "Receive":
			frappe.throw(_("Payment Entry {0} must be a submitted Receive entry").format(pe_name))
		if pe.party_type != "Customer" or pe.party != customer:
			frappe.throw(_("Payment Entry {0} does not belong to this patient").format(pe_name))
		if pe.company != company:
			frappe.throw(_("Payment Entry {0} belongs to a different company").format(pe_name))

		remaining = _money(pe.unallocated_amount)
		if remaining <= 0:
			frappe.throw(_("Payment Entry {0} has no unallocated credit").format(pe_name))

		entry_args = []
		unreconciled_snapshot = remaining
		for row in rows:
			inv = frappe.get_doc("Sales Invoice", row["invoice"])
			if inv.docstatus != 1 or flt(inv.is_return):
				frappe.throw(_("Sales Invoice {0} is not eligible for reconciliation").format(inv.name))
			if inv.company != company:
				frappe.throw(_("Invoice {0} belongs to a different company").format(inv.name))
			if (getattr(inv, "patient", None) or "") != patient and inv.customer != customer:
				frappe.throw(_("Invoice {0} does not belong to this patient").format(inv.name))

			outstanding = _money(inv.outstanding_amount)
			if outstanding <= 0:
				frappe.throw(_("Invoice {0} has no outstanding balance").format(inv.name))

			take = _money(min(row["amount"], remaining, outstanding))
			if take <= 0:
				continue

			account = pe.paid_from or inv.debit_to
			entry_args.append(
				frappe._dict(
					{
						"voucher_type": "Payment Entry",
						"voucher_no": pe.name,
						"voucher_detail_no": None,
						"against_voucher_type": "Sales Invoice",
						"against_voucher": inv.name,
						"account": account,
						"party_type": "Customer",
						"party": customer,
						"is_advance": "Yes",
						"dr_or_cr": "credit_in_account_currency",
						"unreconciled_amount": unreconciled_snapshot,
						"unadjusted_amount": remaining,
						"allocated_amount": take,
						"grand_total": _money(inv.grand_total),
						"outstanding_amount": outstanding,
						"exchange_rate": 1,
						"difference_amount": None,
						"cost_center": pe.cost_center or inv.cost_center,
					}
				)
			)
			remaining = _money(remaining - take)
			applied.append(
				{
					"payment_entry": pe.name,
					"invoice": inv.name,
					"allocated_amount": take,
				}
			)

		if not entry_args:
			continue

		# Apply one PE row at a time so unallocated_amount checks stay valid after each save
		for arg in entry_args:
			# Refresh unallocated before each apply
			fresh = frappe.db.get_value(
				"Payment Entry",
				pe_name,
				["unallocated_amount", "paid_from", "party", "party_type"],
				as_dict=True,
			)
			arg.unreconciled_amount = _money(fresh.unallocated_amount)
			arg.unadjusted_amount = _money(fresh.unallocated_amount)
			if _money_gt(arg.allocated_amount, arg.unadjusted_amount):
				frappe.throw(
					_("Allocation for {0} exceeds remaining advance on {1}").format(
						arg.against_voucher, pe_name
					)
				)
			reconcile_against_document([arg])

	frappe.db.commit()
	total = _money(sum(_money(a["allocated_amount"]) for a in applied))
	return {
		"ok": True,
		"allocations": applied,
		"total_allocated": total,
		"message": _("Reconciled {0} to invoices").format(total),
	}
