import frappe
from frappe.utils import today, getdate

@frappe.whitelist()
def get_service_orders(
    reference_type=None,  # 'Patient Visit' or 'Inpatient Admission'
    reference_name=None,   # specific visit or admission ID
    patient=None,
    status=None,
    limit=50,
    offset=0
):
    """Get list of Sales Orders for services"""
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
    
    sales_orders = frappe.get_all(
        'Sales Order',
        filters=filters,
        fields=[
            'name',
            'customer',
            'customer_name',
            'transaction_date',
            'status',
            'grand_total',
            'total',
            'custom_reference_type',
            'custom_reference_name',
            'custom_base_reference',
            'custom_base_reference_name',
            'patient',
            'patient_name',
            'docstatus'
        ],
        limit=limit,
        limit_start=offset,
        order_by='transaction_date desc, creation desc'
    )
    
    # Check if invoice exists for each sales order
    for so in sales_orders:
        # Find linked Sales Invoice
        invoice = frappe.db.get_value(
            'Sales Invoice Item',
            {'sales_order': so.name},
            'parent'
        )
        
        if invoice:
            invoice_doc = frappe.get_doc('Sales Invoice', invoice)
            so.invoice_status = invoice_doc.status
            so.invoice_name = invoice
            so.invoice_amount = invoice_doc.grand_total
            so.invoice_date = invoice_doc.posting_date
        else:
            so.invoice_status = 'Not Created'
            so.invoice_name = None
            so.invoice_amount = 0
    
    return sales_orders


@frappe.whitelist()
def get_service_order_summary(reference_type=None, reference_name=None, patient=None):
    """Get summary of orders for a reference"""
    filters = {}
    
    if reference_type:
        filters['custom_reference_type'] = reference_type
    if reference_name:
        filters['custom_reference_name'] = reference_name
    if patient:
        filters['patient'] = patient
    
    sales_orders = frappe.get_all(
        'Sales Order',
        filters=filters,
        fields=['name', 'status', 'grand_total']
    )
    
    summary = {
        'total_orders': len(sales_orders),
        'total_amount': sum(so.grand_total for so in sales_orders),
        'draft': {'count': 0, 'amount': 0},
        'submitted': {'count': 0, 'amount': 0},
        'cancelled': {'count': 0, 'amount': 0},
        'invoiced': {'count': 0, 'amount': 0},
        'partially_invoiced': {'count': 0, 'amount': 0},
        'not_invoiced': {'count': 0, 'amount': 0}
    }
    
    for so in sales_orders:
        # Check if invoice exists
        invoice_exists = frappe.db.exists('Sales Invoice Item', {'sales_order': so.name})
        
        if invoice_exists:
            invoice = frappe.db.get_value('Sales Invoice Item', {'sales_order': so.name}, 'parent')
            invoice_status = frappe.db.get_value('Sales Invoice', invoice, 'status')
            
            if invoice_status == 'Paid':
                summary['invoiced']['count'] += 1
                summary['invoiced']['amount'] += so.grand_total
            elif invoice_status in ['Unpaid', 'Overdue']:
                summary['partially_invoiced']['count'] += 1
                summary['partially_invoiced']['amount'] += so.grand_total
        else:
            summary['not_invoiced']['count'] += 1
            summary['not_invoiced']['amount'] += so.grand_total
        
        # Status from sales order
        if so.status == 'Draft':
            summary['draft']['count'] += 1
            summary['draft']['amount'] += so.grand_total
        elif so.status == 'To Bill':
            summary['submitted']['count'] += 1
            summary['submitted']['amount'] += so.grand_total
    
    return summary


# @frappe.whitelist()
# def create_bulk_invoice(reference_type, reference_name):
#     """Create a single invoice for all orders under a reference"""
#     # Get all sales orders for this reference
#     sales_orders = frappe.get_all(
#         'Sales Order',
#         filters={
#             'custom_reference_type': reference_type,
#             'custom_reference_name': reference_name,
#             'status': ['in', ['To Bill', 'Draft']],
#             'docstatus': 1  # Submitted
#         },
#         fields=['name', 'customer', 'grand_total']
#     )
    
#     if not sales_orders:
#         frappe.throw("No orders found to invoice")
    
#     # Get customer from first order
#     customer = sales_orders[0].customer
    
#     # Create Sales Invoice
#     invoice = frappe.new_doc('Sales Invoice')
#     invoice.customer = customer
#     invoice.custom_reference_type = reference_type
#     invoice.custom_reference_name = reference_name
#     invoice.posting_date = today()
    
#     # Add items from each sales order
#     for so in sales_orders:
#         # Get items from sales order
#         so_items = frappe.get_all(
#             'Sales Order Item',
#             filters={'parent': so.name},
#             fields=['item_code', 'qty', 'rate', 'amount', 'description']
#         )
        
#         for item in so_items:
#             invoice.append('items', {
#                 'item_code': item.item_code,
#                 'qty': item.qty,
#                 'rate': item.rate,
#                 'amount': item.amount,
#                 'description': item.description,
#                 'sales_order': so.name
#             })
    
#     invoice.save()
#     frappe.db.commit()
    
#     return invoice.name

@frappe.whitelist()
def create_bulk_invoice(reference_type, reference_name):
    """Create a single invoice for all orders under a reference"""
    
    # Debug: Log the parameters
    frappe.log_error(f"create_bulk_invoice called with reference_type={reference_type}, reference_name={reference_name}", "Bulk Invoice Debug")
    
    # Build filters - make sure we're using the correct field names
    filters = {
        'custom_reference_type': reference_type,
        'custom_reference_name': reference_name,
        'docstatus': 1  # Submitted/To Bill status
    }
    
    # Debug: Log the filters
    frappe.log_error(f"Filters being used: {filters}", "Bulk Invoice Debug")
    
    # Get all sales orders for this reference
    sales_orders = frappe.get_all(
        'Sales Order',
        filters=filters,
        fields=['name', 'customer', 'grand_total', 'status']
    )
    
    # Debug: Log the found orders
    frappe.log_error(f"Found {len(sales_orders)} sales orders: {[so.name for so in sales_orders]}", "Bulk Invoice Debug")
    
    if not sales_orders:
        # Also try without docstatus filter to see if there are any orders at all
        all_orders = frappe.get_all(
            'Sales Order',
            filters={
                'custom_reference_type': reference_type,
                'custom_reference_name': reference_name
            },
            fields=['name', 'docstatus', 'status']
        )
        frappe.log_error(f"All orders (including drafts) found: {len(all_orders)}", "Bulk Invoice Debug")
        
        if all_orders:
            # Tell the user which orders exist but aren't billable
            draft_orders = [o.name for o in all_orders if o.docstatus == 0]
            frappe.throw(f"No billable orders found. Found {len(all_orders)} order(s) but {len(draft_orders)} are in Draft status. Please submit the orders first.")
        else:
            frappe.throw(f"No orders found for {reference_type}: {reference_name}")
    
    # Get customer from first order
    customer = sales_orders[0].customer
    
    # Create Sales Invoice
    invoice = frappe.new_doc('Sales Invoice')
    invoice.customer = customer
    invoice.custom_reference_type = reference_type
    invoice.custom_reference_name = reference_name
    invoice.posting_date = frappe.utils.today()
    invoice.due_date = frappe.utils.add_days(frappe.utils.today(), 30)  # 30 days due date
    
    # Add items from each sales order
    items_added = 0
    for so in sales_orders:
        # Get items from sales order
        so_items = frappe.get_all(
            'Sales Order Item',
            filters={'parent': so.name},
            fields=['item_code', 'item_name', 'qty', 'rate', 'amount', 'description']
        )
        
        for item in so_items:
            invoice.append('items', {
                'item_code': item.item_code,
                'item_name': item.item_name or item.item_code,
                'qty': item.qty,
                'rate': item.rate,
                'amount': item.amount,
                'description': item.description or f"Order: {so.name}",
                'sales_order': so.name
            })
            items_added += 1
    
    if items_added == 0:
        frappe.throw("No items found in the sales orders to invoice")
    
    invoice.save()
    frappe.db.commit()
    
    # Debug: Log success
    frappe.log_error(f"Invoice {invoice.name} created with {items_added} items", "Bulk Invoice Debug")
    
    return invoice.name


@frappe.whitelist()
def create_service_order(data):
    """Create a new service sales order"""
    import json
    
    if isinstance(data, str):
        data = json.loads(data)
    
    so = frappe.new_doc('Sales Order')
    so.customer = data.get('customer')
    so.patient = data.get('patient')
    so.patient_name = data.get('patient_name')
    so.custom_reference_type = data.get('reference_type')
    so.custom_reference_name = data.get('reference_name')
    so.custom_base_reference = data.get('base_reference')
    so.custom_base_reference_name = data.get('base_reference_name')
    so.transaction_date = data.get('transaction_date', today())
    
    # Add items
    for item in data.get('items', []):
        so.append('items', {
            'item_code': item.get('item_code'),
            'item_name': item.get('item_name'),
            'description': item.get('description'),
            'qty': item.get('qty', 1),
            'rate': item.get('rate'),
            'amount': item.get('qty', 1) * item.get('rate', 0)
        })
    
    so.save()
    frappe.db.commit()
    
    return so.name


# Add to healthcare/api/service_orders.py
