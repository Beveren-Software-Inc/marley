# healthcare/api/suicidal_assessment.py
import frappe

@frappe.whitelist()
def get_suicidal_assessments(patient=None, admission=None, limit=50, offset=0):
    """Get list of Suicidal Patient Assessments"""
    filters = {}
    
    if patient:
        filters['patient'] = patient
    
    if admission:
        filters['admission_no'] = admission
    
    # Get permitted cost centers if applicable
    from healthcare.api.common import get_permitted_cost_centers
    permitted_cc = get_permitted_cost_centers()
    if permitted_cc is not None:
        if not permitted_cc:
            return []
        filters['cost_center'] = ['in', permitted_cc]
    
    assessments = frappe.get_all(
        'Suicidal Patient Assessment',
        filters=filters,
        fields=[
            'name',
            'admission_no',
            'patient',
            'patient_name',
            'assessment_date',
            'assessed_by',
            'active_suicidal_thoughts_plans',
            'overwhelmed_thoughts_harming',
            'made_current_plans',
            'previous_attempts',
            'creation',
            'modified'
        ],
        limit=int(limit),
        limit_start=int(offset),
        order_by='assessment_date desc, creation desc'
    )
    
    # Get assessed by names
    for assessment in assessments:
        if assessment.assessed_by:
            practitioner_name = frappe.db.get_value(
                'Healthcare Practitioner', 
                assessment.assessed_by, 
                'practitioner_name'
            )
            if practitioner_name:
                assessment.assessed_by_name = practitioner_name
    
    return assessments