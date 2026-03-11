
import frappe


def apply_insurance_discounts(doc):
    """
    Apply Health Insurance discounts per item on Sales Order / Quotation.

    Rules (per user request):
    - Only if Patient has `is_insurance` checked and `insurance` (Health Insurance) set.
    - Use:
        - `outpatient_discount` when linked to a Patient Visit (OPD / outpatient)
        - `inpatient_discount` when linked to an Inpatient Admission (IPD / inpatient)
    - For each item on the document:
        - If the item is in Health Insurance.exclusive_item → NO discount
        - Otherwise, apply the appropriate discount percentage per item.
    - Do NOT override manually entered per-item discounts.
    """

    # Only handle Sales Order & Quotation here
    if doc.doctype not in ("Sales Order", "Quotation"):
        return
    
    patient = None
    context = None  

    # 2) Generic patient field, if not already found
    if not patient and hasattr(doc, "patient") and getattr(doc, "patient", None):
        patient = doc.patient
    # 3) For Sales Order / Quotation created from healthcare docs via custom_reference_type/name
    if hasattr(doc, "custom_reference_type") and hasattr(doc, "custom_reference_name"):
        ref_doctype = getattr(doc, "custom_reference_type", None)
        ref_name = getattr(doc, "custom_reference_name", None)

        if ref_doctype and ref_name:
            if ref_doctype == "Service Request":
                sr = frappe.get_doc("Service Request", ref_name)
                patient = sr.patient
                # Service Request can be linked to either IP record or Patient Visit
                if getattr(sr, "inpatient_record", None):
                    context = "inpatient"
                elif getattr(sr, "patient_visit", None):
                    context = "outpatient"

            elif ref_doctype == "Inpatient Admission":
                admission = frappe.get_doc("Inpatient Admission", ref_name)
                patient = admission.patient
                context = "inpatient"

            elif ref_doctype == "Patient Visit":
                visit = frappe.get_doc("Patient Visit", ref_name)
                patient = visit.patient
                context = "outpatient"
    if not patient:
        return
    patient_doc = frappe.get_doc("Patient", patient)
    if not getattr(patient_doc, "is_insurance", 0) or not getattr(patient_doc, "insurance", None):
        return

    insurance_doc = frappe.get_doc("Health Insurance", patient_doc.insurance)
    
    # Infer context if still unknown: default to outpatient unless a clear inpatient flag exists
    if context is None:
        if getattr(doc, "custom_inpatient_admission", None):
            context = "inpatient"
        else:
            context = "outpatient"

    base_discount = 0
    if context == "outpatient":
        base_discount = insurance_doc.outpatient_discount or 0
    else:
        base_discount = insurance_doc.inpatient_discount or 0
    # Nothing to apply
    if not base_discount:
        return
    # Exclusive items: never discounted
    exclusive_items = {row.item_code for row in getattr(insurance_doc, "exclusive_item", []) if getattr(row, "item_code", None)}
    
    # Optional: per-item overrides from inclusive_item
    inclusive_map = {
        row.item_code: row
        for row in getattr(insurance_doc, "inclusive_item", [])
        if getattr(row, "item_code", None)
    }
    
    # Apply discounts per item
    for item in getattr(doc, "items", []):
        item_code = getattr(item, "item_code", None)
        if not item_code:
            continue

        # Skip exclusive items
        if item_code in exclusive_items:
            continue
       
        # Start with base discount, allow item-level override if present
        discount_to_apply = base_discount
        row_override = inclusive_map.get(item_code)
        if row_override:
            if context == "outpatient" and getattr(row_override, "outpatient_discount", None) is not None:
                discount_to_apply = row_override.outpatient_discount or base_discount
            elif context == "inpatient" and getattr(row_override, "inpatient_discount", None) is not None:
                discount_to_apply = row_override.inpatient_discount or base_discount

        if discount_to_apply:
           
            item.discount_percentage = discount_to_apply
            item.rate = item.price_list_rate * (1 - discount_to_apply / 100)
            item.amount = item.rate * item.qty
            item.net_rate = item.rate
            item.net_amount = item.amount
            item.ignore_pricing_rule = 1            


def validate_discount(doc, method):
    # First, auto-apply Health Insurance discounts per item (if applicable)
    apply_insurance_discounts(doc)
 
    if doc.doctype in ("Sales Order", "Quotation"):
        try:
            doc.run_method("calculate_taxes_and_totals")
        except Exception:
            frappe.log_error(
                title="Failed to recalculate taxes/totals after insurance discount",
                message=frappe.get_traceback(),
            )

    # Then enforce global discount limit on additional_discount_percentage
    discount_limit = frappe.db.get_single_value("Healthcare Settings", "discount_limit")
    
    if not discount_limit:
        return

    if doc.additional_discount_percentage and doc.additional_discount_percentage > discount_limit:
        frappe.throw(
            f"Discount cannot exceed {discount_limit}%. "
            f"You entered {doc.additional_discount_percentage}%."
        )