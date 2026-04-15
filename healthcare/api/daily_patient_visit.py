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

# Scheduler function - add to your hooks.py or create a scheduled task
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
            'from_date': ('<=', current_date),
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
                'appointment_type': 'Daily Visit'
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
                frappe.db.commit()
                
                # Optionally create a service line with the amount
                if setup.amount > 0:
                    service_line = frappe.get_doc({
                        'doctype': 'Patient Visit Service',
                        'parent': visit.name,
                        'parentfield': 'services',
                        'parenttype': 'Patient Visit',
                        'item_code': 'Daily Visit Fee',
                        'amount': setup.amount
                    })
                    service_line.db_insert()
                
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