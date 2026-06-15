import frappe
from frappe import _
from frappe.utils import cint, flt


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _payment_search_cost_center_filter(filters: dict) -> bool:
	"""Apply portal cost-center scope. Returns False when user has CC perm but none allowed."""
	from healthcare.api.common import get_permitted_cost_centers

	permitted_cc = get_permitted_cost_centers()
	if permitted_cc is None:
		return True
	if not permitted_cc:
		return False
	filters["cost_center"] = ["in", permitted_cc]
	return True


def _format_invoice_payment_label(row: dict) -> str:
	parts = [row.get("name") or ""]
	if row.get("custom_reference_name"):
		ref = row.get("custom_reference_name")
		ref_type = row.get("custom_reference_type") or "Case"
		parts.append(f"{ref_type}: {ref}")
	if row.get("customer_name"):
		parts.append(row["customer_name"])
	if row.get("patient_name"):
		parts.append(row["patient_name"])
	outstanding = flt(row.get("outstanding_amount"))
	if outstanding:
		parts.append(f"Outstanding {outstanding:.3f}")
	return " · ".join(p for p in parts if p)


def _format_order_payment_label(row: dict) -> str:
	parts = [row.get("name") or ""]
	if row.get("custom_reference_name"):
		ref = row.get("custom_reference_name")
		ref_type = row.get("custom_reference_type") or "Case"
		parts.append(f"{ref_type}: {ref}")
	if row.get("customer_name"):
		parts.append(row["customer_name"])
	if row.get("patient_name"):
		parts.append(row["patient_name"])
	grand = flt(row.get("grand_total"))
	if grand:
		parts.append(f"Total {grand:.3f}")
	return " · ".join(p for p in parts if p)


@frappe.whitelist()
def search_sales_invoices_for_payment(search=None, patient=None, limit=30):
	"""Portal invoice picker for standalone payments (cost-center scoped, ignores strict DocPerm)."""
	limit = min(cint(limit) or 30, 50)
	filters = {
		"docstatus": 1,
		"outstanding_amount": [">", 0],
	}
	if patient:
		filters["patient"] = patient
	if not _payment_search_cost_center_filter(filters):
		return []

	search = (search or "").strip()
	if search:
		from healthcare.api.billing_search import billing_search_or_filters

		or_filters = billing_search_or_filters(search, patient)
		rows = frappe.get_all(
			"Sales Invoice",
			filters=filters,
			or_filters=or_filters,
			fields=[
				"name",
				"customer_name",
				"patient_name",
				"outstanding_amount",
				"grand_total",
				"posting_date",
				"custom_reference_type",
				"custom_reference_name",
			],
			limit=limit,
			order_by="modified desc",
		)
	else:
		rows = frappe.get_all(
			"Sales Invoice",
			filters=filters,
			fields=[
				"name",
				"customer_name",
				"patient_name",
				"outstanding_amount",
				"grand_total",
				"posting_date",
			],
			limit=limit,
			order_by="posting_date desc, modified desc",
		)

	return [
		{
			"name": row.name,
			"label": _format_invoice_payment_label(row),
			"outstanding_amount": flt(row.outstanding_amount),
			"customer_name": row.customer_name,
			"patient_name": row.patient_name,
		}
		for row in rows
	]


@frappe.whitelist()
def search_sales_orders_for_payment(search=None, patient=None, limit=30):
	"""Portal sales order picker for standalone payments."""
	limit = min(cint(limit) or 30, 50)
	filters = {
		"docstatus": 1,
		"status": ["not in", ["Closed", "Cancelled", "Completed"]],
	}
	if patient:
		filters["patient"] = patient
	if not _payment_search_cost_center_filter(filters):
		return []

	search = (search or "").strip()
	if search:
		from healthcare.api.billing_search import billing_search_or_filters

		or_filters = billing_search_or_filters(search, patient)
		rows = frappe.get_all(
			"Sales Order",
			filters=filters,
			or_filters=or_filters,
			fields=[
				"name",
				"customer_name",
				"patient_name",
				"grand_total",
				"transaction_date",
				"custom_reference_type",
				"custom_reference_name",
			],
			limit=limit,
			order_by="modified desc",
		)
	else:
		rows = frappe.get_all(
			"Sales Order",
			filters=filters,
			fields=["name", "customer_name", "patient_name", "grand_total", "transaction_date"],
			limit=limit,
			order_by="transaction_date desc, modified desc",
		)

	return [
		{
			"name": row.name,
			"label": _format_order_payment_label(row),
			"grand_total": flt(row.grand_total),
			"customer_name": row.customer_name,
			"patient_name": row.patient_name,
		}
		for row in rows
	]

def _validate_input(data: dict) -> None:
    """Raise if any required field is missing or values are invalid."""
    required = ["reference_doctype", "reference_name", "paid_amount", "mode_of_payment"]
    for field in required:
        if not data.get(field):
            frappe.throw(_(f"{field.replace('_', ' ').title()} is required"))

    if data["reference_doctype"] not in ("Sales Invoice", "Sales Order"):
        frappe.throw(_("Reference Type must be Sales Invoice or Sales Order"))

    if frappe.utils.flt(data["paid_amount"]) <= 0:
        frappe.throw(_("Paid Amount must be greater than zero"))


def _get_reference_doc(reference_doctype: str, reference_name: str):
    """Fetch and return the reference document, throwing if it doesn't exist."""
    if not frappe.db.exists(reference_doctype, reference_name):
        frappe.throw(_(f"{reference_doctype} {reference_name} does not exist"))
    return frappe.get_doc(reference_doctype, reference_name)


def _resolve_company_and_currency(ref_doc) -> tuple[str, str]:
    """Return (company, currency) from the reference doc or system defaults."""
    company = ref_doc.get("company") or frappe.defaults.get_global_default("company")
    currency = (
        ref_doc.get("currency")
        or frappe.get_cached_value("Company", company, "default_currency")
    )
    return company, currency


def _resolve_party(ref_doc) -> str:
    """Return the customer/party name from the reference doc."""
    party = ref_doc.get("customer") or ref_doc.get("patient")
    if not party:
        frappe.throw(_("Could not determine customer/party from the reference document"))
    return party


def _mop_account_for_company(mode_of_payment: str, company: str) -> str | None:
    mop_doc = frappe.get_doc("Mode of Payment", mode_of_payment)
    return next((a.default_account for a in mop_doc.accounts if a.company == company), None)


def _resolve_accounts(company: str, mode_of_payment: str) -> tuple[str, str]:
    """
    Return (paid_from, paid_to) accounts.
    paid_from = company default receivable account
    paid_to   = cash/bank account based on Mode of Payment type
    """
    company_doc = frappe.get_cached_doc("Company", company)
    paid_from = company_doc.default_receivable_account
    if not paid_from:
        frappe.throw(_("Default Receivable Account is not set for company '{0}'").format(company))

    mop_doc = frappe.get_doc("Mode of Payment", mode_of_payment)
    mop_type = (mop_doc.type or "").strip()
    mop_account = _mop_account_for_company(mode_of_payment, company)

    mop_account_type = frappe.get_cached_value("Account", mop_account, "account_type") if mop_account else None

    if mop_type == "Cash":
        # Cash payments should not land on a Bank GL (ERPNext then requires cheque ref fields).
        if mop_account and mop_account_type != "Bank":
            paid_to = mop_account
        else:
            paid_to = company_doc.default_cash_account or mop_account
    elif mop_type == "Bank":
        paid_to = mop_account or company_doc.default_bank_account
    else:
        paid_to = mop_account or company_doc.default_cash_account or company_doc.default_bank_account

    if not paid_to:
        frappe.throw(
            _("No Cash or Bank account configured for Mode of Payment '{0}' in company '{1}'").format(
                mode_of_payment, company
            )
        )

    for account, label in [(paid_from, "Receivable Account"), (paid_to, "Payment Account")]:
        if not frappe.db.exists("Account", account):
            frappe.throw(_("{0} '{1}' does not exist").format(label, account))

    return paid_from, paid_to


def _default_transaction_reference(reference_name: str, data: dict) -> tuple[str, str]:
    reference_no = (data.get("reference_no") or "").strip()
    reference_date = data.get("reference_date") or frappe.utils.today()
    if not reference_no:
        reference_no = f"PAY-{reference_name}"
    return reference_no, reference_date


def _build_remarks(
    reference_doctype: str,
    reference_name: str,
    visit: str | None,
    patient: str | None,
    remarks: str,
    appointment: str | None = None,
) -> str:
    """Compose the remarks string from available context."""
    parts = [f"Payment against {reference_doctype} {reference_name}"]
    if appointment:
        parts.append(f"Appointment: {appointment}")
    if visit:
        parts.append(f"Visit: {visit}")
    if patient:
        parts.append(f"Patient: {patient}")
    if remarks:
        parts.append(remarks)
    return " | ".join(parts)


def _append_reference_row(pe, reference_doctype: str, reference_name: str, ref_doc, paid_amount: float) -> None:
    """Append the correct reference row to the Payment Entry."""
    if reference_doctype == "Sales Invoice":
        outstanding = frappe.utils.flt(ref_doc.outstanding_amount)
        allocated  = min(paid_amount, outstanding) if outstanding > 0 else paid_amount
        pe.append("references", {
            "reference_doctype":  "Sales Invoice",
            "reference_name":     reference_name,
            "bill_no":            ref_doc.get("bill_no") or "",
            "due_date":           ref_doc.get("due_date"),
            "total_amount":       frappe.utils.flt(ref_doc.grand_total),
            "outstanding_amount": outstanding,
            "allocated_amount":   allocated,
        })

    elif reference_doctype == "Sales Order":
        pe.append("references", {
            "reference_doctype":  "Sales Order",
            "reference_name":     reference_name,
            "total_amount":       frappe.utils.flt(ref_doc.grand_total),
            "outstanding_amount": frappe.utils.flt(ref_doc.get("advance_paid", 0)),
            "allocated_amount":   paid_amount,
        })


# ─── Main whitelisted method ──────────────────────────────────────────────────

@frappe.whitelist()
def create_payment_entry(data: dict) -> dict:
    """
    Create a Payment Entry against a Sales Invoice or Sales Order.

    Expected data keys:
        reference_doctype   : "Sales Invoice" | "Sales Order"  (required)
        reference_name      : name of the reference doc         (required)
        paid_amount         : float                             (required)
        mode_of_payment     : str                               (required)
        visit               : Patient Visit name                (optional)
        patient             : Patient docname                   (optional)
        remarks             : str                               (optional)
    """
    _validate_input(data)

    reference_doctype = data["reference_doctype"]
    reference_name    = data["reference_name"]
    paid_amount       = frappe.utils.flt(data["paid_amount"])
    mode_of_payment   = data["mode_of_payment"]

    ref_doc           = _get_reference_doc(reference_doctype, reference_name)
    company, currency = _resolve_company_and_currency(ref_doc)
    party             = _resolve_party(ref_doc)
    paid_from, paid_to = _resolve_accounts(company, mode_of_payment)

    pe = frappe.new_doc("Payment Entry")
    pe.payment_type               = "Receive"
    pe.company                    = company
    pe.posting_date               = frappe.utils.today()
    pe.mode_of_payment            = mode_of_payment
    pe.party_type                 = "Customer"
    pe.party                      = party
    pe.party_name                 = frappe.db.get_value("Customer", party, "customer_name") or party
    pe.paid_from                  = paid_from
    pe.paid_to                    = paid_to
    pe.paid_from_account_currency = currency
    pe.paid_to_account_currency   = currency
    pe.paid_amount                = paid_amount
    pe.received_amount            = paid_amount
    pe.source_exchange_rate       = 1
    pe.target_exchange_rate       = 1
    pe.difference_amount          = 0
    pe.remarks                    = _build_remarks(
        reference_doctype,
        reference_name,
        data.get("visit"),
        data.get("patient"),
        data.get("remarks", ""),
        data.get("appointment"),
    )
    pe.custom_insurance_claim = data.get("custom_insurance_claim")  # Optional link to Insurance Claim

    reference_no, reference_date = _default_transaction_reference(reference_name, data)
    pe.reference_no = reference_no
    pe.reference_date = reference_date

    _append_reference_row(pe, reference_doctype, reference_name, ref_doc, paid_amount)

    # Skipping pe.set_missing_values() — fails when Payment Entry controller
    # is overridden (e.g. EmployeePaymentEntry). All fields set explicitly.
    pe.insert(ignore_permissions=True)
    pe.submit()
    frappe.db.commit()

    return {
        "name": pe.name,
        "server_message": f"Payment Entry {pe.name} created successfully",
    }