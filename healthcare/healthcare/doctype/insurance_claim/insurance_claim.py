from frappe.model.document import Document
from frappe.utils import flt
import frappe
from frappe import _

class InsuranceClaim(Document):
    """Header document for insurance claims with basic totals logic."""

    def validate(self):
        self._recalculate_totals()

    def _recalculate_totals(self):
        total_claimed = 0.0
        total_patient_liability = 0.0
        total_qty = 0.0

        for row in self.get("claim_items", []):
            total_claimed += flt((getattr(row, "covered_amount", 0) or getattr(row, "gross_amount", 0) or 0))
            total_patient_liability += flt(getattr(row, "patient_liability", 0) or 0)
            total_qty += flt(getattr(row, "qty", 0) or 0)

        self.total_claimed = total_claimed
        self.total_patient_liability = total_patient_liability
        self.total_quantity = total_qty
        
    def on_submit(self):
        # Preserve an already-computed payment status (e.g. legacy imports set
        # Paid / Partially Paid from the source amounts); otherwise default to Submitted.
        if self.status not in ("Paid", "Partially Paid", "Rejected"):
            self.status = "Submitted"
        self.db_set("status", self.status, update_modified=False)
        
    def on_cancel(self):
        """Cancel all Payment Entries linked to this Insurance Claim"""

        payment_entries = frappe.get_all(
            "Payment Entry",
            filters={
                "custom_insurance_claim": self.name,
                "docstatus": 1
            },
            pluck="name",
        )

        for pe_name in payment_entries:
            pe = frappe.get_doc("Payment Entry", pe_name)

            try:
                pe.cancel()
            except Exception:
                frappe.throw(
                    _("Unable to cancel Payment Entry {0}. Cancel it manually first.")
                    .format(pe_name)
                )

        frappe.msgprint(
            _("Related Payment Entries cancelled successfully.")
        )