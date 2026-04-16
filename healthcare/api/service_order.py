import frappe
@frappe.whitelist()
def get_invoices_by_reference(reference_type, reference_name, patient=None):
    """
    Get invoices for a specific reference (Inpatient Admission or Patient Visit)
    """
    filters = {
        "docstatus": 1,
        "custom_base_reference_type": reference_type,
        "custom_base_reference_name": reference_name
    }
    
    if patient:
        filters["patient"] = patient
    
    invoices = frappe.get_all("Sales Invoice",
        filters=filters,
        fields=["name", "posting_date", "due_date", "grand_total", 
                "paid_amount", "outstanding_amount", "status"],
        order_by="posting_date desc"
    )
    
    # Get order count for each invoice
    for invoice in invoices:
        order_count = frappe.db.count("Service Order", {
            "sales_invoice": invoice.name,
            "docstatus": 1
        })
        invoice["order_count"] = order_count
    
    return invoices