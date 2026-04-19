import frappe
from frappe.utils import today

@frappe.whitelist()
def get_service_invoices(
    reference_type=None,
    reference_name=None,
    patient=None,
    status=None,
    limit=50,
    offset=0
):
    """Get list of Sales Invoices for services"""
    filters = {}
    
    if reference_type:
        filters['custom_reference_type'] = reference_type
    if reference_name:
        filters['custom_reference_name'] = reference_name
    if patient:
        filters['patient'] = patient
    if status:
        filters['status'] = status
    # Get permitted cost centers
    from healthcare.api.common import get_permitted_cost_centers
    permitted_cc = get_permitted_cost_centers()
    if permitted_cc is not None:
        if not permitted_cc:
            return []
        filters['cost_center'] = ['in', permitted_cc]
    # frappe.throw(str(filters))
    invoices = frappe.get_all(
        'Sales Invoice',
        filters=filters,
        fields=[
            'name',
            'customer',
            'customer_name',
            'posting_date',
            'due_date',
            'status',
            'grand_total',
            'outstanding_amount',
            'paid_amount',
            'custom_reference_type',
            'custom_reference_name',
            'patient',
            'patient_name'
        ],
        limit=limit,
        limit_start=offset,
        order_by='posting_date desc, creation desc'
    )
    
    # Get linked orders count for each invoice
    for inv in invoices:
        orders = frappe.get_all(
            'Sales Invoice Item',
            filters={'parent': inv.name},
            fields=['sales_order'],
            distinct=True
        )
        inv.order_count = len(orders)
    
    return invoices


@frappe.whitelist()
def get_invoice_summary(reference_type=None, reference_name=None, patient=None):
    """Get summary of invoices for a reference"""
    filters = {}
    
    if reference_type:
        filters['custom_reference_type'] = reference_type
    if reference_name:
        filters['custom_reference_name'] = reference_name
    if patient:
        filters['patient'] = patient
    
    invoices = frappe.get_all(
        'Sales Invoice',
        filters=filters,
        fields=['status', 'grand_total', 'outstanding_amount', 'paid_amount']
    )
    
    summary = {
        'total_invoices': len(invoices),
        'total_amount': sum(inv.grand_total for inv in invoices),
        'total_paid': sum(inv.paid_amount for inv in invoices),
        'total_outstanding': sum(inv.outstanding_amount for inv in invoices),
        'paid': {'count': 0, 'amount': 0},
        'unpaid': {'count': 0, 'amount': 0},
        'overdue': {'count': 0, 'amount': 0},
        'partially_paid': {'count': 0, 'amount': 0}
    }
    
    for inv in invoices:
        if inv.status == 'Paid':
            summary['paid']['count'] += 1
            summary['paid']['amount'] += inv.grand_total
        elif inv.status == 'Unpaid':
            summary['unpaid']['count'] += 1
            summary['unpaid']['amount'] += inv.grand_total
        elif inv.status == 'Overdue':
            summary['overdue']['count'] += 1
            summary['overdue']['amount'] += inv.grand_total
        elif inv.status == 'Partially Paid':
            summary['partially_paid']['count'] += 1
            summary['partially_paid']['amount'] += inv.grand_total
    
    return summary