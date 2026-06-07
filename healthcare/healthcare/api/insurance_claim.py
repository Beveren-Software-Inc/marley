import frappe
from frappe import _
from frappe.utils import flt, today


@frappe.whitelist()
def create_insurance_claim_from_invoice(sales_invoice: str) -> str:
    """
    Create (or fetch existing) Insurance Claim for a submitted Sales Invoice.

    - Requires the Sales Invoice to be submitted.
    - Requires the linked Patient to have `is_insurance` checked and `insurance` set.
    - Populates Insurance Claim header + claim_items from Sales Invoice items.
    """
    if not sales_invoice:
        frappe.throw(_("Sales Invoice is required"))

    inv = frappe.get_doc("Sales Invoice", sales_invoice)
    if inv.docstatus != 1:
        frappe.throw(_("Sales Invoice must be submitted before creating an Insurance Claim"))

    patient = getattr(inv, "patient", None)
    if not patient:
        frappe.throw(_("Sales Invoice must have a Patient to create an Insurance Claim"))

    patient_doc = frappe.get_doc("Patient", patient)
    if not getattr(patient_doc, "is_insurance", 0) or not getattr(patient_doc, "insurance", None):
        frappe.throw(
            _("Patient {0} is not marked as Insurance or missing Health Insurance").format(patient_doc.name)
        )

    insurance_doc = frappe.get_doc("Health Insurance", patient_doc.insurance)

    claim = frappe.new_doc("Insurance Claim")
    claim.patient = patient_doc.name
    claim.health_insurance = patient_doc.insurance
    claim.insurance_payor = insurance_doc.insurance_company
    claim.claim_date = today()
    claim.reference_doctype = "Sales Invoice"
    claim.reference_name = inv.name
    claim.sales_invoice = inv.name
    claim.status = "Draft"

    total_claimed = 0.0
    total_patient_liability = 0.0
    total_qty = 0.0

    # Try to infer OP/IP from custom reference on the Sales Invoice (if present)
    ref_doctype = getattr(inv, "custom_reference_type", None)
    default_service_type = None
    if ref_doctype == "Inpatient Admission":
        default_service_type = "IP"
    elif ref_doctype == "Patient Visit":
        default_service_type = "OP"

    for si_item in inv.get("items", []):
        if not si_item.item_code:
            continue

        row = claim.append("claim_items", {})

        # Service type
        row.service_type = default_service_type or "Other"

        # Reference back to the originating healthcare document if available
        # (via standard Sales Invoice custom fields, if configured)
        if hasattr(si_item, "reference_dt") and hasattr(si_item, "reference_dn"):
            row.reference_doctype = si_item.reference_dt
            row.reference_name = si_item.reference_dn

        row.sales_invoice_item = si_item.item_code
        row.item_name = si_item.item_name or si_item.item_code

        gross = flt(getattr(si_item, "net_amount", None) or getattr(si_item, "amount", 0))
        row.gross_amount = gross
        row.covered_amount = gross
        row.co_pay_amount = 0
        row.non_covered_amount = 0
        row.patient_liability = 0

        total_claimed += gross
        total_qty += flt(si_item.qty or 0)

    claim.total_claimed = total_claimed
    claim.total_patient_liability = total_patient_liability
    claim.total_quantity = total_qty

    claim.insert(ignore_permissions=True)
    frappe.db.commit()
    return claim.name


def _mode_of_payment_needs_bank_reference(mode_of_payment: str) -> bool:
	"""Bank-type modes (and Cheque) require Payment Entry reference no/date."""
	if not mode_of_payment:
		return False
	mop_type = frappe.get_cached_value("Mode of Payment", mode_of_payment, "type")
	if mop_type == "Bank":
		return True
	name_lower = mode_of_payment.lower()
	return "cheque" in name_lower or "check" in name_lower


@frappe.whitelist()
def update_insurance_claim_payment(
	name: str,
	paid_amount: float,
	mode_of_payment: str,
	reference_no: str | None = None,
	reference_date: str | None = None,
) -> dict:
    """
    Update Insurance Claim payment information and create a Payment Entry.

    - `paid_amount` is the NEW total paid amount for the claim.
    - We compute the delta from the existing `total_amount_paid` and
      create a Payment Entry only for the difference (if positive).
    - Status rules:
        - if total_paid >= total_claimed -> Paid
        - elif total_paid > 0          -> Partially Paid
    """
    if not name:
        frappe.throw(_("Insurance Claim name is required"))
    if not mode_of_payment:
        frappe.throw(_("Mode of Payment is required"))

    claim = frappe.get_doc("Insurance Claim", name)
    inv_name = claim.sales_invoice
    if not inv_name:
        frappe.throw(_("Insurance Claim {0} is not linked to a Sales Invoice").format(claim.name))

    new_total_paid = flt(paid_amount)
    if new_total_paid < 0:
        frappe.throw(_("Paid amount cannot be negative"))

    current_paid = flt(claim.total_approved or 0)
    delta = new_total_paid - current_paid

    if _mode_of_payment_needs_bank_reference(mode_of_payment):
        if not (reference_no or "").strip() or not reference_date:
            frappe.throw(_("Reference No and Reference Date are required for bank/cheque payments"))

    pe_name = None
    if delta > 0:
        # Create Payment Entry for the delta
        from healthcare.api.payment_entry import create_payment_entry

        pe_payload = {
            "reference_doctype": "Sales Invoice",
            "reference_name": inv_name,
            "paid_amount": delta,
            "mode_of_payment": mode_of_payment,
            "patient": claim.patient,
            "custom_insurance_claim": claim.name,
            "remarks": _("Insurance Claim {0} payment update").format(claim.name),
        }
        if reference_no:
            pe_payload["reference_no"] = reference_no.strip()
        if reference_date:
            pe_payload["reference_date"] = reference_date

        pe_info = create_payment_entry(pe_payload)
        pe_name = pe_info.get("name")

    # Update totals and status on claim
    claim.total_approved = new_total_paid + current_paid

    total_claimed = flt(claim.total_claimed or 0)
    if total_claimed and claim.total_approved >= total_claimed:
        claim.status = "Paid"
    elif claim.total_approved > 0:
        claim.status = "Partially Paid"

    claim.save(ignore_permissions=True)
    frappe.db.commit()

    return {
        "insurance_claim": claim.name,
        "payment_entry": pe_name,
        "total_approved": new_total_paid,
        "status": claim.status,
    }

