# Add to healthcare/api/patient_appointment.py or create healthcare/api/daily_patient_visit.py

import frappe
from frappe import _
from frappe.utils import today, add_days

@frappe.whitelist()
def create_daily_patient_visit_setup(data):
    """Create a new Daily Patient Visit Setup document"""
    if isinstance(data, str):
        import json
        data = json.loads(data)
    
    frappe.log_error(f"Creating daily visit setup with data: {data}", "Daily Visit Setup Debug")
    
    doc = frappe.get_doc({
        'doctype': 'Daily Patient Visit Setup',
        'patient': data.get('patient'),
        'admission': data.get('admission'),  # This should now be present
        'discharge': data.get('discharge'),
        'from_date': data.get('from_date'),
        'to_date': data.get('to_date'),
        'time': data.get('time'),
        'session': data.get('session'),
        'is_active': data.get('is_active', 0),
        'amount': data.get('amount', 0)
    })
    doc.insert()
    frappe.db.commit()
    
    return doc.as_dict()

@frappe.whitelist()
def update_daily_patient_visit_setup(name, data):
    """Update an existing Daily Patient Visit Setup document"""
    if isinstance(data, str):
        import json
        data = json.loads(data)
    
    doc = frappe.get_doc('Daily Patient Visit Setup', name)
    doc.update(data)
    doc.save()
    frappe.db.commit()
    
    return doc.as_dict()


@frappe.whitelist()
def get_daily_patient_visit_setups(patient=None, active_only=0, limit=100):
    """List Daily Patient Visit Setup rows for UI."""
    filters = {}
    if patient:
        filters["patient"] = patient
    if str(active_only).lower() in ("1", "true", "yes"):
        filters["is_active"] = 1

    return frappe.get_all(
        "Daily Patient Visit Setup",
        filters=filters,
        fields=[
            "name",
            "patient",
            "patient_name",
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
    item.insert()
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

@frappe.whitelist()
def process_daily_patient_visits():
    """
    Scheduler function that runs daily at 12:01 AM to create patient visits
    for active daily visit setups.
    """
    
    current_date = today()
    # Get all active setups where from_date <= current_date <= to_date
    setups = frappe.get_all(
        'Daily Patient Visit Setup',
        filters={
            'is_active': 1,
            # 'from_date': ('<=', current_date),
            'to_date': ('>=', current_date)
        },
        fields=['name', 'patient', 'from_date', 'to_date', 'time', 'session', 'amount']
    )
    for setup in setups:
        try:
            # Check if a visit already exists for today
            existing_visit = frappe.db.exists('Patient Visit', {
                'patient': setup.patient,
                'visit_date': current_date,
                'visit_type': 'Daily Visit'
            })
            
            if not existing_visit:
                # Create Patient Visit
                visit = frappe.get_doc({
                    'doctype': 'Patient Visit',
                    'patient': setup.patient,
                    'visit_date': current_date,
                    'visit_time': setup.time,
                    'therapy_session': setup.session,
                    'visit_type': 'Daily Visit',
                    'status': 'Open'
                })
                visit.insert()
                # frappe.db.commit()
                # frappe.throw(str(setup.amount))
                # Add OP charge to the visit
                if setup.amount > 0:
                    # frappe.throw("Adding OP charge to visit {0} for patient {1} with amount {2}".format(visit.name, setup.patient, setup.amount))
                    add_op_charge_to_patient_visit(visit.name, setup.amount, current_date)
                
                frappe.db.commit()
                
        except Exception as e:
            frappe.log_error(f"Failed to create daily visit for setup {setup.name}: {str(e)}", "Daily Patient Visit")
    
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

