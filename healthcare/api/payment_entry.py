import frappe
from frappe import _


# ─── Helpers ──────────────────────────────────────────────────────────────────

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


def _resolve_accounts(company: str, mode_of_payment: str) -> tuple[str, str]:
    """
    Return (paid_from, paid_to) accounts.
    paid_from = company default receivable account
    paid_to   = mode of payment account for the given company
    """
    paid_from = frappe.get_cached_value("Company", company, "default_receivable_account")
    if not paid_from:
        frappe.throw(_("Default Receivable Account is not set for company '{0}'").format(company))

    mop_doc = frappe.get_doc("Mode of Payment", mode_of_payment)
    paid_to = next(
        (a.default_account for a in mop_doc.accounts if a.company == company),
        None
    )
    if not paid_to:
        frappe.throw(
            _(f"No account configured for Mode of Payment '{mode_of_payment}' in company '{company}'")
        )

    for account, label in [(paid_from, "Receivable Account"), (paid_to, "Payment Account")]:
        if not frappe.db.exists("Account", account):
            frappe.throw(_(f"{label} '{account}' does not exist"))

    return paid_from, paid_to


def _build_remarks(reference_doctype: str, reference_name: str, visit: str | None, patient: str | None, remarks: str) -> str:
    """Compose the remarks string from available context."""
    parts = [f"Payment against {reference_doctype} {reference_name}"]
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
        reference_doctype, reference_name,
        data.get("visit"), data.get("patient"), data.get("remarks", "")
    )
    pe.custom_insurance_claim = data.get("custom_insurance_claim")  # Optional link to Insurance Claim

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