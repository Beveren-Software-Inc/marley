import frappe
from frappe.utils import today, flt
from collections import defaultdict

@frappe.whitelist()
def get_service_invoices(
    reference_type=None,
    reference_name=None,
    patient=None,
    status=None,
    from_date=None,
    to_date=None,
    search=None,
    limit=50,
    offset=0,
    receptionist_shift=None,
    filter_by_open_shift=None,
):
    """Get list of Sales Invoices for services"""
    from healthcare.api.billing_search import billing_search_or_filters

    filters = {}
    search_term = (search or "").strip()
    or_filters = billing_search_or_filters(search_term, patient) if search_term else None

    if not search_term and reference_name:
        if reference_type:
            filters['custom_reference_type'] = reference_type
        filters['custom_reference_name'] = reference_name
    if patient:
        filters['patient'] = patient
    if status:
        if isinstance(status, str) and "," in status:
            parts = [s.strip() for s in status.split(",") if s.strip()]
            if len(parts) > 1:
                filters["status"] = ["in", parts]
            else:
                filters["status"] = parts[0] if parts else status
        else:
            filters["status"] = status
    if from_date and to_date:
        filters['posting_date'] = ['between', [from_date, to_date]]
    elif from_date:
        filters['posting_date'] = ['>=', from_date]
    elif to_date:
        filters['posting_date'] = ['<=', to_date]

    from healthcare.api.receptionist_shift import resolve_receptionist_shift_filter, SHIFT_LINK_FIELD

    shift_filter = resolve_receptionist_shift_filter(
        receptionist_shift=receptionist_shift,
        filter_by_open_shift=filter_by_open_shift,
    )
    if shift_filter is not None:
        if not shift_filter:
            return []
        if frappe.get_meta("Sales Invoice").has_field(SHIFT_LINK_FIELD):
            filters[SHIFT_LINK_FIELD] = shift_filter

    # Get permitted cost centers
    from healthcare.api.common import get_permitted_cost_centers
    permitted_cc = get_permitted_cost_centers()
    if permitted_cc is not None:
        if not permitted_cc:
            return []
        filters['cost_center'] = ['in', permitted_cc]
    # frappe.throw(str(filters))
    list_kwargs = dict(
        doctype='Sales Invoice',
        filters=filters,
        fields=[
            'name',
            'docstatus',
            'company',
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
            'patient_name',
            'custom_created_at',
            'cost_center',
        ],
        limit=limit,
        limit_start=offset,
        order_by='posting_date desc, creation desc',
    )
    if or_filters:
        list_kwargs['or_filters'] = or_filters
    invoices = frappe.get_all(**list_kwargs)

    if patient and reference_name and not search_term:
        from healthcare.api.patient_file_no_charge import file_no_charge_invoices_for_list

        seen = {inv.name for inv in invoices}
        for row in file_no_charge_invoices_for_list(patient):
            row_name = row.get("name")
            if row_name and row_name not in seen:
                invoices.append(frappe._dict(row))
                seen.add(row_name)

    # Get linked orders count for each invoice
    for inv in invoices:
        orders = frappe.get_all(
            'Sales Invoice Item',
            filters={'parent': inv.name},
            fields=['sales_order'],
            distinct=True
        )
        inv.order_count = len(orders)

    cc_keys = list({inv.get('cost_center') for inv in invoices if inv.get('cost_center')})
    cc_labels = {}
    if cc_keys:
        for row in frappe.get_all('Cost Center', filters={'name': ['in', cc_keys]}, fields=['name', 'cost_center_name']):
            cc_labels[row.name] = row.cost_center_name or row.name
    for inv in invoices:
        cc = inv.get('cost_center')
        inv['cost_center_name'] = cc_labels.get(cc) if cc else ''

    return invoices


@frappe.whitelist()
def get_invoice_summary(
    reference_type=None,
    reference_name=None,
    patient=None,
    from_date=None,
    to_date=None,
    search=None,
    receptionist_shift=None,
    filter_by_open_shift=None,
):
    """Get summary of invoices for a reference"""
    from healthcare.api.billing_search import billing_search_or_filters

    filters = {}
    search_term = (search or "").strip()
    or_filters = billing_search_or_filters(search_term, patient) if search_term else None

    if not search_term and reference_name:
        if reference_type:
            filters['custom_reference_type'] = reference_type
        filters['custom_reference_name'] = reference_name
    if patient:
        filters['patient'] = patient
    if from_date and to_date:
        filters['posting_date'] = ['between', [from_date, to_date]]
    elif from_date:
        filters['posting_date'] = ['>=', from_date]
    elif to_date:
        filters['posting_date'] = ['<=', to_date]

    from healthcare.api.receptionist_shift import resolve_receptionist_shift_filter, SHIFT_LINK_FIELD

    shift_filter = resolve_receptionist_shift_filter(
        receptionist_shift=receptionist_shift,
        filter_by_open_shift=filter_by_open_shift,
    )
    if shift_filter is not None:
        if not shift_filter:
            return {
                'total_invoices': 0,
                'total_amount': 0,
                'total_paid': 0,
                'total_outstanding': 0,
                'paid': {'count': 0, 'amount': 0},
                'unpaid': {'count': 0, 'amount': 0},
                'overdue': {'count': 0, 'amount': 0},
                'partially_paid': {'count': 0, 'amount': 0},
            }
        if frappe.get_meta("Sales Invoice").has_field(SHIFT_LINK_FIELD):
            filters[SHIFT_LINK_FIELD] = shift_filter

    from healthcare.api.common import get_permitted_cost_centers
    permitted_cc = get_permitted_cost_centers()
    if permitted_cc is not None:
        if not permitted_cc:
            return {
                'total_invoices': 0,
                'total_amount': 0,
                'total_paid': 0,
                'total_outstanding': 0,
                'paid': {'count': 0, 'amount': 0},
                'unpaid': {'count': 0, 'amount': 0},
                'overdue': {'count': 0, 'amount': 0},
                'partially_paid': {'count': 0, 'amount': 0},
            }
        filters['cost_center'] = ['in', permitted_cc]

    summary_kwargs = dict(
        doctype='Sales Invoice',
        filters=filters,
        fields=['status', 'grand_total', 'outstanding_amount', 'paid_amount'],
    )
    if or_filters:
        summary_kwargs['or_filters'] = or_filters
    invoices = frappe.get_all(**summary_kwargs)

    if patient and reference_name and not search_term:
        from healthcare.api.patient_file_no_charge import file_no_charge_invoices_for_list

        seen = {inv.name for inv in invoices if getattr(inv, "name", None)}
        for row in file_no_charge_invoices_for_list(patient):
            row_name = row.get("name")
            if not row_name or row_name in seen:
                continue
            inv = frappe.db.get_value(
                "Sales Invoice",
                row_name,
                ["name", "status", "grand_total", "outstanding_amount", "paid_amount"],
                as_dict=True,
            )
            if inv:
                invoices.append(frappe._dict(inv))
                seen.add(row_name)
    
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


@frappe.whitelist()
def get_patient_billing_cost_center_breakdown(reference_type=None, reference_name=None, patient=None):
    """Aggregate service orders and invoices by cost center for reception billing overview.

    Only meaningful when the user is **not** restricted to specific cost centers
    (``get_permitted_cost_centers()`` returns ``None``). Restricted users get
    ``restricted: true`` and an empty ``rows`` list (their lists are already filtered).
    """
    from healthcare.api.common import get_permitted_cost_centers

    permitted_cc = get_permitted_cost_centers()
    if permitted_cc is not None:
        return {'restricted': True, 'rows': []}

    base_so = {}
    base_inv = {}
    if reference_name:
        if reference_type:
            base_so['custom_reference_type'] = reference_type
            base_inv['custom_reference_type'] = reference_type
        base_so['custom_reference_name'] = reference_name
        base_inv['custom_reference_name'] = reference_name
    if patient:
        base_so['patient'] = patient
        base_inv['patient'] = patient

    if not patient and not reference_name:
        return {'restricted': False, 'rows': []}

    orders = frappe.get_all('Sales Order', filters=base_so, fields=['cost_center', 'grand_total'])
    invoices = frappe.get_all(
        'Sales Invoice',
        filters=base_inv,
        fields=['cost_center', 'grand_total', 'outstanding_amount'],
    )

    agg = defaultdict(
        lambda: {
            'sales_orders': 0,
            'orders_amount': 0.0,
            'invoices': 0,
            'invoices_grand_total': 0.0,
            'outstanding': 0.0,
        }
    )

    for o in orders:
        cc = (o.get('cost_center') or '').strip()
        bucket = agg[cc]
        bucket['sales_orders'] += 1
        bucket['orders_amount'] += flt(o.get('grand_total'))

    for inv in invoices:
        cc = (inv.get('cost_center') or '').strip()
        bucket = agg[cc]
        bucket['invoices'] += 1
        bucket['invoices_grand_total'] += flt(inv.get('grand_total'))
        bucket['outstanding'] += flt(inv.get('outstanding_amount'))

    def _cc_label(cc_key):
        if not cc_key:
            return '(No cost center)'
        return frappe.db.get_value('Cost Center', cc_key, 'cost_center_name') or cc_key

    rows = []
    for cc_key in sorted(agg.keys(), key=lambda k: (_cc_label(k) or '').lower()):
        d = agg[cc_key]
        rows.append(
            {
                'cost_center': cc_key,
                'cost_center_name': _cc_label(cc_key),
                'sales_orders': d['sales_orders'],
                'orders_amount': d['orders_amount'],
                'invoices': d['invoices'],
                'invoices_grand_total': d['invoices_grand_total'],
                'outstanding': d['outstanding'],
            }
        )

    return {'restricted': False, 'rows': rows}