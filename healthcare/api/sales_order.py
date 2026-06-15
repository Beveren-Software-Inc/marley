import frappe
from frappe.utils import today, getdate

from healthcare.api.sales_order_cost_center import (
	apply_cost_center_to_sales_order,
	cost_center_from_base_reference,
	cost_center_from_visit_or_admission,
)

@frappe.whitelist()
def get_service_orders(
    reference_type=None,  # 'Patient Visit' or 'Inpatient Admission'
    reference_name=None,   # specific visit or admission ID
    patient=None,
    status=None,
    from_date=None,
    to_date=None,
    search=None,
    limit=50,
    offset=0
):
    """Get list of Sales Orders for services"""
    from healthcare.api.billing_search import billing_search_or_filters

    filters = {}
    search_term = (search or "").strip()
    or_filters = billing_search_or_filters(search_term, patient) if search_term else None

    if not search_term:
        if reference_type:
            filters['custom_reference_type'] = reference_type
        if reference_name:
            filters['custom_reference_name'] = reference_name
    if patient:
        filters['patient'] = patient
    if status:
        filters['status'] = status
    if from_date and to_date:
        filters['transaction_date'] = ['between', [from_date, to_date]]
    elif from_date:
        filters['transaction_date'] = ['>=', from_date]
    elif to_date:
        filters['transaction_date'] = ['<=', to_date]

    # Get permitted cost centers
    from healthcare.api.common import get_permitted_cost_centers
    permitted_cc = get_permitted_cost_centers()
    if permitted_cc is not None:
        if not permitted_cc:
            return []
        filters['cost_center'] = ['in', permitted_cc]
    
    list_kwargs = dict(
        doctype='Sales Order',
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
            'docstatus',
            'cost_center',
        ],
        limit=limit,
        limit_start=offset,
        order_by='transaction_date desc, creation desc',
    )
    if or_filters:
        list_kwargs['or_filters'] = or_filters
    sales_orders = frappe.get_all(**list_kwargs)
    
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

    cc_keys = list({so.get('cost_center') for so in sales_orders if so.get('cost_center')})
    cc_labels = {}
    if cc_keys:
        for row in frappe.get_all('Cost Center', filters={'name': ['in', cc_keys]}, fields=['name', 'cost_center_name']):
            cc_labels[row.name] = row.cost_center_name or row.name
    for so in sales_orders:
        cc = so.get('cost_center')
        so['cost_center_name'] = cc_labels.get(cc) if cc else ''

    from healthcare.api.billing import _attach_sales_order_items

    _attach_sales_order_items(sales_orders)

    return sales_orders


@frappe.whitelist()
def get_service_order_summary(reference_type=None, reference_name=None, patient=None, from_date=None, to_date=None, search=None):
    """Get summary of orders for a reference"""
    from healthcare.api.billing_search import billing_search_or_filters

    filters = {}
    search_term = (search or "").strip()
    or_filters = billing_search_or_filters(search_term, patient) if search_term else None

    if not search_term:
        if reference_type:
            filters['custom_reference_type'] = reference_type
        if reference_name:
            filters['custom_reference_name'] = reference_name
    if patient:
        filters['patient'] = patient
    if from_date and to_date:
        filters['transaction_date'] = ['between', [from_date, to_date]]
    elif from_date:
        filters['transaction_date'] = ['>=', from_date]
    elif to_date:
        filters['transaction_date'] = ['<=', to_date]

    from healthcare.api.common import get_permitted_cost_centers
    permitted_cc = get_permitted_cost_centers()
    if permitted_cc is not None:
        if not permitted_cc:
            return {
                'total_orders': 0,
                'total_amount': 0,
                'draft': {'count': 0, 'amount': 0},
                'submitted': {'count': 0, 'amount': 0},
                'cancelled': {'count': 0, 'amount': 0},
                'invoiced': {'count': 0, 'amount': 0},
                'partially_invoiced': {'count': 0, 'amount': 0},
                'not_invoiced': {'count': 0, 'amount': 0},
            }
        filters['cost_center'] = ['in', permitted_cc]

    summary_kwargs = dict(
        doctype='Sales Order',
        filters=filters,
        fields=['name', 'status', 'grand_total'],
    )
    if or_filters:
        summary_kwargs['or_filters'] = or_filters
    sales_orders = frappe.get_all(**summary_kwargs)
    
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

def _load_billable_sales_orders_by_names(names):
	"""Return submitted, not-yet-invoiced Sales Order docs for the given names."""
	import json

	if isinstance(names, str):
		names = json.loads(names) if names.strip().startswith("[") else [names]
	if not names:
		frappe.throw(frappe._("Select at least one sales order to invoice."))

	from healthcare.api.common import get_permitted_cost_centers

	permitted_cc = get_permitted_cost_centers()
	docs = []
	customer = None

	for name in names:
		name = (name or "").strip()
		if not name:
			continue
		if not frappe.db.exists("Sales Order", name):
			frappe.throw(frappe._("Sales Order {0} not found").format(name))

		so = frappe.get_doc("Sales Order", name)
		if so.docstatus != 1:
			frappe.throw(
				frappe._("Sales Order {0} must be submitted before invoicing.").format(name)
			)
		if frappe.db.exists("Sales Invoice Item", {"sales_order": name}):
			frappe.throw(frappe._("Sales Order {0} is already invoiced.").format(name))

		if permitted_cc is not None:
			if not permitted_cc:
				frappe.throw(frappe._("You do not have permission to bill these orders."))
			if so.cost_center and so.cost_center not in permitted_cc:
				frappe.throw(
					frappe._("You do not have permission for the cost center on {0}.").format(name)
				)

		if customer and so.customer != customer:
			frappe.throw(frappe._("All selected orders must belong to the same customer."))
		customer = so.customer
		docs.append(so)

	if not docs:
		frappe.throw(frappe._("Select at least one sales order to invoice."))
	return docs


def _create_invoice_from_sales_orders(sales_orders, reference_type=None, reference_name=None, patient=None):
	"""Build one Sales Invoice from one or more submitted Sales Orders."""
	first = sales_orders[0]
	ref_type = reference_type or first.custom_reference_type
	ref_name = reference_name or first.custom_reference_name
	pt = patient or getattr(first, "patient", None)

	invoice = frappe.new_doc("Sales Invoice")
	invoice.customer = first.customer
	if ref_type:
		invoice.custom_reference_type = ref_type
	if ref_name:
		invoice.custom_reference_name = ref_name
		if ref_type:
			invoice.custom_base_reference = ref_type
		invoice.custom_base_reference_name = ref_name
	if pt and hasattr(invoice, "patient"):
		invoice.patient = pt
	invoice.posting_date = today()
	invoice.due_date = frappe.utils.add_days(today(), 30)

	items_added = 0
	for so in sales_orders:
		so_items = frappe.get_all(
			"Sales Order Item",
			filters={"parent": so.name},
			fields=["item_code", "item_name", "qty", "rate", "amount", "description"],
		)
		for item in so_items:
			invoice.append(
				"items",
				{
					"item_code": item.item_code,
					"item_name": item.item_name or item.item_code,
					"qty": item.qty,
					"rate": item.rate,
					"amount": item.amount,
					"description": item.description or frappe._("Order: {0}").format(so.name),
					"sales_order": so.name,
				},
			)
			items_added += 1

	if items_added == 0:
		frappe.throw(frappe._("No items found in the sales orders to invoice"))

	invoice.save()
	frappe.db.commit()
	return invoice.name


@frappe.whitelist()
def create_bulk_invoice(reference_type=None, reference_name=None, sales_order_names=None, patient=None):
	"""Create a single invoice from selected sales orders or all billable orders on a reference."""
	import json

	if isinstance(sales_order_names, str):
		try:
			sales_order_names = json.loads(sales_order_names)
		except json.JSONDecodeError:
			sales_order_names = [sales_order_names]

	if sales_order_names:
		sales_orders = _load_billable_sales_orders_by_names(sales_order_names)
		return _create_invoice_from_sales_orders(
			sales_orders,
			reference_type=reference_type,
			reference_name=reference_name,
			patient=patient,
		)

	if reference_type and reference_name:
		filters = {
			"custom_reference_type": reference_type,
			"custom_reference_name": reference_name,
			"docstatus": 1,
		}
		from healthcare.api.common import get_permitted_cost_centers

		permitted_cc = get_permitted_cost_centers()
		if permitted_cc is not None:
			if not permitted_cc:
				frappe.throw(frappe._("You do not have permission to bill these orders."))
			filters["cost_center"] = ["in", permitted_cc]

		order_rows = frappe.get_all(
			"Sales Order",
			filters=filters,
			fields=["name"],
		)
		names = []
		for row in order_rows:
			if not frappe.db.exists("Sales Invoice Item", {"sales_order": row.name}):
				names.append(row.name)

		if not names:
			all_orders = frappe.get_all(
				"Sales Order",
				filters={
					"custom_reference_type": reference_type,
					"custom_reference_name": reference_name,
				},
				fields=["name", "docstatus"],
			)
			if all_orders:
				draft_count = sum(1 for o in all_orders if o.docstatus == 0)
				frappe.throw(
					frappe._(
						"No billable orders found. Found {0} order(s); {1} are still draft or already invoiced."
					).format(len(all_orders), draft_count)
				)
			frappe.throw(
				frappe._("No orders found for {0}: {1}").format(reference_type, reference_name)
			)

		sales_orders = _load_billable_sales_orders_by_names(names)
		return _create_invoice_from_sales_orders(
			sales_orders,
			reference_type=reference_type,
			reference_name=reference_name,
			patient=patient,
		)

	frappe.throw(
		frappe._("Select at least one sales order to invoice, or choose a patient visit / admission.")
	)


@frappe.whitelist()
def create_service_order(data):
    """Create a new service sales order.

    Expected mapping (same as Sales Invoice):
    - reference_type / reference_name: ``Patient Visit`` or ``Inpatient Admission`` and the document name.
    - base_reference / base_reference_name: underlying doc (e.g. ``Lab Test``, ``Service Request``,
      ``Patient Medication Order``, ``Inpatient Healthcare Service``) and its name.
    """
    import json

    if isinstance(data, str):
        data = json.loads(data)

    ref_type = data.get('reference_type')
    if ref_type and ref_type not in ('Patient Visit', 'Inpatient Admission'):
        frappe.throw(frappe._('reference_type must be Patient Visit or Inpatient Admission'))

    so = frappe.new_doc('Sales Order')
    so.customer = data.get('customer')
    so.patient = data.get('patient')
    so.patient_name = data.get('patient_name')
    so.custom_reference_type = ref_type
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

    cc = data.get('cost_center')
    if not cc:
        cc = cost_center_from_base_reference(
            data.get('base_reference'), data.get('base_reference_name')
        )
    if not cc and ref_type:
        cc = cost_center_from_visit_or_admission(ref_type, data.get('reference_name'))
    apply_cost_center_to_sales_order(so, cc)

    so.save()
    frappe.db.commit()
    
    return so.name


# Add to healthcare/api/service_orders.py
