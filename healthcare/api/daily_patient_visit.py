# Add to healthcare/api/patient_appointment.py or create healthcare/api/daily_patient_visit.py

import frappe
from frappe import _
from frappe.utils import add_days, flt, getdate, today

from healthcare.api.patient_file_no_charge import _ensure_patient_customer
from healthcare.api.patient_visit_charge import (
	_existing_visit_charge_sales_order,
	maybe_create_patient_visit_charge_sales_order,
	visit_type_no_charges,
)
from healthcare.api.sales_order_cost_center import (
	apply_cost_center_to_sales_order,
	cost_center_from_visit_or_admission,
)
from healthcare.api.utils.api_utility import get_next_transaction_number
from healthcare.healthcare.editing_lock import assert_editing_allowed

DAILY_AUTO_VISIT_TYPE = "Daily Auto Visit"

@frappe.whitelist()
def create_daily_patient_visit_setup(data):
    """Create a new Daily Patient Visit Setup document"""
    if isinstance(data, str):
        import json
        data = json.loads(data)
    
    practioner = data.get('practioner') or data.get('practitioner') or data.get('doctor')
    practitioner_name = data.get('practitioner_name')
    if practioner and not practitioner_name:
        practitioner_name = frappe.db.get_value(
            'Healthcare Practitioner', practioner, 'practitioner_name'
        )

    doc = frappe.get_doc({
        'doctype': 'Daily Patient Visit Setup',
        'patient': data.get('patient'),
        'practioner': practioner,
        'practitioner_name': practitioner_name,
        'posting_date': data.get('posting_date') or today(),
        'admission': data.get('admission'),
        'discharge': data.get('discharge'),
        'from_date': data.get('from_date'),
        'to_date': data.get('to_date'),
        'time': data.get('time'),
        'session': data.get('session'),
        'is_active': data.get('is_active', 0),
        'amount': data.get('amount', 0)
    })
    doc.insert(ignore_permissions=True)
    frappe.db.commit()

    return _serialize_daily_patient_visit_setup(doc)

@frappe.whitelist()
def update_daily_patient_visit_setup(name, data):
    """Update an existing Daily Patient Visit Setup document"""
    assert_editing_allowed()
    if isinstance(data, str):
        import json
        data = json.loads(data)
    
    doc = frappe.get_doc('Daily Patient Visit Setup', name)
    practioner = data.pop('practioner', None) or data.pop('practitioner', None) or data.pop('doctor', None)
    if practioner is not None:
        doc.practioner = practioner
        doc.practitioner_name = (
            data.pop('practitioner_name', None)
            or frappe.db.get_value('Healthcare Practitioner', practioner, 'practitioner_name')
        )
    doc.update(data)
    doc.save()
    frappe.db.commit()

    return _serialize_daily_patient_visit_setup(doc)


def _patient_file_no_map(patient_ids):
    patient_ids = [p for p in patient_ids if p]
    if not patient_ids:
        return {}
    rows = frappe.get_all(
        'Patient',
        filters={'name': ('in', patient_ids)},
        fields=['name', 'file_no'],
    )
    return {row.name: row.file_no for row in rows}


def _serialize_daily_patient_visit_setup(doc):
    data = doc.as_dict() if hasattr(doc, 'as_dict') else dict(doc)
    patient = data.get('patient')
    if patient:
        data['file_no'] = frappe.db.get_value('Patient', patient, 'file_no')
    return data


@frappe.whitelist()
def get_daily_patient_visit_setup(name):
    """Get one Daily Patient Visit Setup for detail panel / edit."""
    if not name:
        frappe.throw(_('Setup name is required'))
    doc = frappe.get_doc('Daily Patient Visit Setup', name)
    return _serialize_daily_patient_visit_setup(doc)


@frappe.whitelist()
def get_daily_patient_visit_setups(patient=None, active_only=0, limit=100):
    """List Daily Patient Visit Setup rows for UI."""
    filters = {}
    if patient:
        filters["patient"] = patient
    if str(active_only).lower() in ("1", "true", "yes"):
        filters["is_active"] = 1

    rows = frappe.get_all(
        "Daily Patient Visit Setup",
        filters=filters,
        fields=[
            "name",
            "patient",
            "patient_name",
            "practioner",
            "practitioner_name",
            "posting_date",
            "creation",
            "admission",
            "discharge",
            "from_date",
            "to_date",
            "time",
            "session",
            "is_active",
            "amount",
        ],
        order_by="creation desc",
        limit_page_length=int(limit or 100),
    )
    file_map = _patient_file_no_map([row.get("patient") for row in rows])
    for row in rows:
        row["file_no"] = file_map.get(row.get("patient"))
    return rows


@frappe.whitelist()
def stop_daily_patient_visit_setup(name):
    """Stop Daily Auto Visit for a setup by toggling is_active off."""
    if not name:
        frappe.throw(_("Setup name is required"))
    doc = frappe.get_doc("Daily Patient Visit Setup", name)
    doc.is_active = 0
    doc.save()
    frappe.db.commit()
    return {"name": doc.name, "is_active": doc.is_active}
def get_or_create_daily_session_charge_item():
    """
    Get or create the 'Daily Session Charge' item.
    Returns the item name.
    """
    item_name = "Daily Session Charge"
    
    # Check if item exists
    if frappe.db.exists('Item', item_name):
        return item_name
    
    # Create the item
    item = frappe.get_doc({
        'doctype': 'Item',
        'item_code': item_name,
        'item_name': item_name,
        'item_group': 'Services',
        'is_stock_item': 0,
        'standard_rate': 0,
        'description': 'Daily session charge for automatic patient visits'
    })
    item.insert(ignore_permissions=True)
    frappe.db.commit()
    
    return item_name
def add_op_charge_to_patient_visit(visit_name, amount, charge_date=None):
    """
    Add an OP charge to a Patient Visit.
    """
    if not charge_date:
        charge_date = today()
    
    # Get or create the daily session charge item
    item_code = get_or_create_daily_session_charge_item()
    
    # Get the Patient Visit document
    visit = frappe.get_doc('Patient Visit', visit_name)
    
    # Get op_charges, ensure it's a list (not None)
    op_charges = visit.get('charges')
    if op_charges is None:
        op_charges = []
    
    # Check if charge already exists for today to avoid duplicates
    existing_charge = False
    for charge in op_charges:
        if charge.charges_item == item_code and str(charge.date) == str(charge_date):
            existing_charge = True
            # Update amount if needed
            if charge.amount != amount:
                charge.amount = amount
                visit.save()
                frappe.db.commit()
            break
    
    if not existing_charge:
        # Add new charge to the op_charges table
        visit.append('charges', {
            'charges_item': item_code,
            'date': charge_date,
            'amount': amount
        })
        visit.save()
        frappe.db.commit()


def _resolve_setup_cost_center(setup):
    if setup.admission and frappe.db.exists('Inpatient Admission', setup.admission):
        return cost_center_from_visit_or_admission('Inpatient Admission', setup.admission)
    return None


def _visit_dates_for_setup(setup, current_date):
    """All dates from from_date through min(to_date, current_date)."""
    start = getdate(setup.from_date)
    end = getdate(setup.to_date)
    today_date = getdate(current_date)
    if end > today_date:
        end = today_date
    if not start or not end or start > end:
        return []

    dates = []
    cursor = start
    while cursor <= end:
        dates.append(cursor)
        cursor = add_days(cursor, 1)
    return dates


def _existing_daily_auto_visit_dates(patient, from_date, to_date):
    rows = frappe.get_all(
        'Patient Visit',
        filters={
            'patient': patient,
            'visit_type': DAILY_AUTO_VISIT_TYPE,
            'encounter_date': ['between', [from_date, to_date]],
        },
        pluck='encounter_date',
    )
    return {getdate(row) for row in rows if row}


def create_daily_auto_visit_sales_order(visit_name, amount, charge_date=None, cost_center=None):
    """Create a submitted Sales Order for a daily auto visit charge."""
    amount = flt(amount)
    if amount <= 0:
        return None

    visit = frappe.get_doc('Patient Visit', visit_name)
    item_code = get_or_create_daily_session_charge_item()
    existing = _existing_visit_charge_sales_order(visit.name, item_code)
    if existing:
        so = frappe.get_doc('Sales Order', existing)
        if so.docstatus == 0:
            so.flags.ignore_permissions = True
            so.submit()
        return {'sales_order': so.name, 'existing': True}

    customer = _ensure_patient_customer(visit.patient)
    company = visit.company or frappe.defaults.get_user_default('company') or frappe.db.get_single_value(
        'Global Defaults', 'default_company'
    )
    if not company:
        frappe.throw(_('Default Company is not set'))

    billing_date = getdate(charge_date or visit.encounter_date or today())
    visit_label = visit.case_no or visit.name

    so = frappe.new_doc('Sales Order')
    so.company = company
    so.customer = customer
    so.patient = visit.patient
    if hasattr(so, 'custom_patient'):
        so.custom_patient = visit.patient
    if hasattr(so, 'custom_patient_name'):
        so.custom_patient_name = visit.patient_name

    so.custom_reference_type = 'Patient Visit'
    so.custom_reference_name = visit.name
    so.custom_base_reference = 'Patient Visit'
    so.custom_base_reference_name = visit.name
    so.transaction_date = billing_date
    so.delivery_date = billing_date
    so.ignore_pricing_rule = 1
    so.append(
        'items',
        {
            'item_code': item_code,
            'item_name': item_code,
            'description': _('Daily auto visit charge: {0}').format(visit_label),
            'qty': 1,
            'rate': amount,
            'price_list_rate': amount,
        },
    )

    cc = (cost_center or visit.cost_center or '').strip() or None
    apply_cost_center_to_sales_order(so, cc)
    so.insert(ignore_permissions=True)
    so.flags.ignore_permissions = True
    so.submit()
    return {'sales_order': so.name, 'existing': False}


def _get_daily_auto_visit_name(patient, visit_date):
    return frappe.db.get_value(
        'Patient Visit',
        {
            'patient': patient,
            'encounter_date': visit_date,
            'visit_type': DAILY_AUTO_VISIT_TYPE,
        },
        'name',
    )


def _ensure_daily_auto_visit_billing(setup, visit_name, visit_date):
    if visit_type_no_charges(DAILY_AUTO_VISIT_TYPE):
        return
    cost_center = _resolve_setup_cost_center(setup)
    amount = flt(setup.amount)
    if amount > 0:
        add_op_charge_to_patient_visit(visit_name, amount, visit_date)
        item_code = get_or_create_daily_session_charge_item()
        if not _existing_visit_charge_sales_order(visit_name, item_code):
            create_daily_auto_visit_sales_order(
                visit_name,
                amount,
                charge_date=visit_date,
                cost_center=cost_center,
            )
    else:
        maybe_create_patient_visit_charge_sales_order(
            visit_name,
            visit_type=DAILY_AUTO_VISIT_TYPE,
            cost_center=cost_center,
        )


def _create_daily_auto_visit_for_date(setup, visit_date):
    cost_center = _resolve_setup_cost_center(setup)
    visit_fields = {
        'doctype': 'Patient Visit',
        'patient': setup.patient,
        'case_no': get_next_transaction_number('Patient Visit', fieldname='case_no'),
        'encounter_date': visit_date,
        'encounter_time': setup.time or '00:00:00',
        'visit_type': DAILY_AUTO_VISIT_TYPE,
        'status': 'Open',
    }
    if setup.practioner:
        visit_fields['practitioner'] = setup.practioner
    if setup.admission and frappe.db.exists('Inpatient Admission', setup.admission):
        visit_fields['inpatient_record'] = setup.admission
    if cost_center:
        visit_fields['cost_center'] = cost_center

    visit = frappe.get_doc(visit_fields)
    visit.insert(ignore_permissions=True)

    if visit_type_no_charges(DAILY_AUTO_VISIT_TYPE):
        return visit.name

    amount = flt(setup.amount)
    if amount > 0:
        add_op_charge_to_patient_visit(visit.name, amount, visit_date)
        create_daily_auto_visit_sales_order(
            visit.name,
            amount,
            charge_date=visit_date,
            cost_center=cost_center,
        )
    else:
        maybe_create_patient_visit_charge_sales_order(
            visit.name,
            visit_type=DAILY_AUTO_VISIT_TYPE,
            cost_center=cost_center,
        )

    return visit.name


@frappe.whitelist()
def process_daily_patient_visits():
    """
    Scheduler function that runs daily at 12:01 AM to create patient visits
    for active daily visit setups. Backfills any missing dates in the setup range.
    """
    
    current_date = today()
    setups = frappe.get_all(
        'Daily Patient Visit Setup',
        filters={
            'is_active': 1,
            'from_date': ('<=', current_date),
            'to_date': ('>=', current_date)
        },
        fields=[
            'name',
            'patient',
            'practioner',
            'admission',
            'from_date',
            'to_date',
            'time',
            'session',
            'amount',
        ]
    )
    for setup in setups:
        try:
            if not setup.patient:
                continue

            visit_dates = _visit_dates_for_setup(setup, current_date)
            if not visit_dates:
                continue

            existing_dates = _existing_daily_auto_visit_dates(
                setup.patient,
                visit_dates[0],
                visit_dates[-1],
            )

            for visit_date in visit_dates:
                if visit_date in existing_dates:
                    visit_name = _get_daily_auto_visit_name(setup.patient, visit_date)
                    if visit_name:
                        _ensure_daily_auto_visit_billing(setup, visit_name, visit_date)
                    continue
                _create_daily_auto_visit_for_date(setup, visit_date)
                existing_dates.add(visit_date)

            frappe.db.commit()
                
        except Exception:
            frappe.db.rollback()
            frappe.log_error(
                title=f"Failed to create daily visit for setup {setup.name}",
                message=frappe.get_traceback(),
            )
    
    # Deactivate setups where to_date < current_date
    expired_setups = frappe.get_all(
        'Daily Patient Visit Setup',
        filters={
            'is_active': 1,
            'to_date': ('<', current_date)
        },
        fields=['name']
    )
    
    for expired in expired_setups:
        try:
            doc = frappe.get_doc('Daily Patient Visit Setup', expired.name)
            doc.is_active = 0
            doc.save()
            frappe.db.commit()
        except Exception as e:
            frappe.log_error(f"Failed to deactivate setup {expired.name}: {str(e)}", "Daily Patient Visit")

