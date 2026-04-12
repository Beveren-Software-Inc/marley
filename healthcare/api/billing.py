# Add to healthcare/api/billing.py

import frappe
@frappe.whitelist()
def get_inpatient_balances(patient=None):
    """
    Get inpatient balances for all patients or a specific patient
    Returns list of admissions with outstanding balances
    """
   
    filters = {"docstatus": 1}
    if patient:
        filters["patient_name"] = patient
    # Get all inpatient admissions
    admissions = frappe.get_all("Inpatient Admission",
        # filters=filters,
        fields=["name", "patient", "patient_name", "admitted_datetime", "cost_center", "status"]
    )
    balances = []
    today = frappe.utils.today()
    
    for admission in admissions:
        # Get all invoices for this admission
        invoices = frappe.get_all("Sales Invoice",
            filters={
                "custom_reference_name": admission.name,
                "docstatus": 1
            },
            fields=["name", "grand_total", "outstanding_amount", "posting_date", "status"]
        )
        total_amount = sum(inv.grand_total for inv in invoices)
        total_paid = sum(inv.grand_total - inv.outstanding_amount for inv in invoices)
        outstanding = sum(inv.outstanding_amount for inv in invoices)
        
        # Calculate days overdue
        days_overdue = 0
        last_invoice_date = None
        if invoices:
            last_invoice = max(invoices, key=lambda x: x.posting_date)
            last_invoice_date = last_invoice.posting_date
            if last_invoice.outstanding_amount > 0:
                days_overdue = (frappe.utils.date_diff(today, last_invoice.posting_date))
        
        if total_amount > 0:  # Only include admissions with charges
            balances.append({
                "admission_id": admission.name,
                "patient_name": admission.patient_name,
                "patient_id": admission.patient,
                "admission_date": admission.admission_datetime.split()[0] if admission.admission_datetime else "",
                "discharge_date": admission.discharge_datetime.split()[0] if admission.discharge_datetime else None,
                "cost_center": admission.cost_center,
                "total_amount": total_amount,
                "total_paid": total_paid,
                "outstanding_amount": outstanding,
                "days_overdue": max(0, days_overdue),
                "last_invoice_date": last_invoice_date
            })
    
    # Sort by outstanding amount (highest first) and then by days overdue
    balances.sort(key=lambda x: (-x["outstanding_amount"], -x["days_overdue"]))
    
    return balances


# Add to healthcare/api/billing.py

@frappe.whitelist()
def get_outpatient_balances(patient=None):
    """
    Get outpatient balances for all patients or a specific patient
    Returns list of patient visits with outstanding balances
    """
    filters = {"docstatus": 1}
    if patient:
        filters["patient"] = patient
    
    # Get all patient encounters (visits)
    visits = frappe.get_all("Patient Visit",
        # filters=filters,
        fields=["name", "patient", "patient_name", "encounter_date", "practitioner", "status"]
    )
    
    balances = []
    today = frappe.utils.today()
    
    for visit in visits:
        # Get all invoices for this visit
        invoices = frappe.get_all("Sales Invoice",
            filters={
                "custom_reference_name": visit.name,
                "docstatus": 1
            },
            fields=["name", "grand_total", "outstanding_amount", "posting_date", "status"]
        )
        print("huku ni wapi", str(invoices))
        total_amount = sum(inv.grand_total for inv in invoices)
        total_paid = sum(inv.grand_total - inv.outstanding_amount for inv in invoices)
        outstanding = sum(inv.outstanding_amount for inv in invoices)
        
        # Calculate days overdue
        days_overdue = 0
        last_invoice_date = None
        if invoices:
            last_invoice = max(invoices, key=lambda x: x.posting_date)
            last_invoice_date = last_invoice.posting_date
            if last_invoice.outstanding_amount > 0:
                days_overdue = frappe.utils.date_diff(today, last_invoice.posting_date)
        
        if total_amount > 0:  # Only include visits with charges
            balances.append({
                "visit_id": visit.name,
                "patient_name": visit.patient_name,
                "patient_id": visit.patient,
                "visit_date": visit.encounter_date if visit.encounter_date else "",
                "practitioner": visit.practitioner,
                "total_amount": total_amount,
                "total_paid": total_paid,
                "outstanding_amount": outstanding,
                "days_overdue": max(0, days_overdue),
                "last_invoice_date": last_invoice_date
            })
    
    # Sort by outstanding amount (highest first) and then by days overdue
    balances.sort(key=lambda x: (-x["outstanding_amount"], -x["days_overdue"]))
    
    return balances