# # Add to healthcare/api/billing.py

# import frappe
# @frappe.whitelist()
# def get_inpatient_balances(patient=None):
#     """
#     Get inpatient balances for all patients or a specific patient
#     Returns list of admissions with outstanding balances
#     """
   
#     filters = {"docstatus": 1}
#     if patient:
#         filters["patient_name"] = patient
#     # Get all inpatient admissions
#     admissions = frappe.get_all("Inpatient Admission",
#         # filters=filters,
#         fields=["name", "patient", "patient_name", "admitted_datetime", "cost_center", "status"]
#     )
#     balances = []
#     today = frappe.utils.today()
    
#     for admission in admissions:
#         # Get all invoices for this admission
#         invoices = frappe.get_all("Sales Invoice",
#             filters={
#                 "custom_reference_name": admission.name,
#                 "docstatus": 1
#             },
#             fields=["name", "grand_total", "outstanding_amount", "posting_date", "status"]
#         )
#         total_amount = sum(inv.grand_total for inv in invoices)
#         total_paid = sum(inv.grand_total - inv.outstanding_amount for inv in invoices)
#         outstanding = sum(inv.outstanding_amount for inv in invoices)
        
#         # Calculate days overdue
#         days_overdue = 0
#         last_invoice_date = None
#         if invoices:
#             last_invoice = max(invoices, key=lambda x: x.posting_date)
#             last_invoice_date = last_invoice.posting_date
#             if last_invoice.outstanding_amount > 0:
#                 days_overdue = (frappe.utils.date_diff(today, last_invoice.posting_date))
        
#         if total_amount > 0:  # Only include admissions with charges
#             balances.append({
#                 "admission_id": admission.name,
#                 "patient_name": admission.patient_name,
#                 "patient_id": admission.patient,
#                 "admission_date": admission.admission_datetime.split()[0] if admission.admission_datetime else "",
#                 "discharge_date": admission.discharge_datetime.split()[0] if admission.discharge_datetime else None,
#                 "cost_center": admission.cost_center,
#                 "total_amount": total_amount,
#                 "total_paid": total_paid,
#                 "outstanding_amount": outstanding,
#                 "days_overdue": max(0, days_overdue),
#                 "last_invoice_date": last_invoice_date
#             })
    
#     # Sort by outstanding amount (highest first) and then by days overdue
#     balances.sort(key=lambda x: (-x["outstanding_amount"], -x["days_overdue"]))
    
#     return balances


# # Add to healthcare/api/billing.py

# @frappe.whitelist()
# def get_outpatient_balances(patient=None):
#     """
#     Get outpatient balances for all patients or a specific patient
#     Returns list of patient visits with outstanding balances
#     """
#     filters = {"docstatus": 1}
#     if patient:
#         filters["patient"] = patient
    
#     # Get all patient encounters (visits)
#     visits = frappe.get_all("Patient Visit",
#         # filters=filters,
#         fields=["name", "patient", "patient_name", "encounter_date", "practitioner", "status"]
#     )
    
#     balances = []
#     today = frappe.utils.today()
    
#     for visit in visits:
#         # Get all invoices for this visit
#         invoices = frappe.get_all("Sales Invoice",
#             filters={
#                 "custom_reference_name": visit.name,
#                 "docstatus": 1
#             },
#             fields=["name", "grand_total", "outstanding_amount", "posting_date", "status"]
#         )
#         print("huku ni wapi", str(invoices))
#         total_amount = sum(inv.grand_total for inv in invoices)
#         total_paid = sum(inv.grand_total - inv.outstanding_amount for inv in invoices)
#         outstanding = sum(inv.outstanding_amount for inv in invoices)
        
#         # Calculate days overdue
#         days_overdue = 0
#         last_invoice_date = None
#         if invoices:
#             last_invoice = max(invoices, key=lambda x: x.posting_date)
#             last_invoice_date = last_invoice.posting_date
#             if last_invoice.outstanding_amount > 0:
#                 days_overdue = frappe.utils.date_diff(today, last_invoice.posting_date)
        
#         if total_amount > 0:  # Only include visits with charges
#             balances.append({
#                 "visit_id": visit.name,
#                 "patient_name": visit.patient_name,
#                 "patient_id": visit.patient,
#                 "visit_date": visit.encounter_date if visit.encounter_date else "",
#                 "practitioner": visit.practitioner,
#                 "total_amount": total_amount,
#                 "total_paid": total_paid,
#                 "outstanding_amount": outstanding,
#                 "days_overdue": max(0, days_overdue),
#                 "last_invoice_date": last_invoice_date
#             })
    
#     # Sort by outstanding amount (highest first) and then by days overdue
#     balances.sort(key=lambda x: (-x["outstanding_amount"], -x["days_overdue"]))
    
#     return balances


# healthcare/api/billing.py

import frappe
from frappe import _

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


@frappe.whitelist()
def get_invoice_items(invoice_name):
    """
    Get items from a specific sales invoice
    """
    if not invoice_name:
        return []
    
    invoice = frappe.get_doc("Sales Invoice", invoice_name)
    items = []
    
    for item in invoice.items:
        items.append({
            "item_code": item.item_code,
            "item_name": item.item_name,
            "description": item.description,
            "qty": item.qty,
            "rate": item.rate,
            "amount": item.amount,
            "discount_amount": item.discount_amount,
            "net_amount": item.net_amount
        })
    
    return items


@frappe.whitelist()
def get_invoice_details(invoice_name):
    """
    Get detailed information about an invoice including items
    """
    if not invoice_name:
        return None
    
    invoice = frappe.get_doc("Sales Invoice", invoice_name)
    
    return {
        "name": invoice.name,
        "customer": invoice.customer,
        "customer_name": invoice.customer_name,
        "posting_date": invoice.posting_date,
        "due_date": invoice.due_date,
        "grand_total": invoice.grand_total,
        "outstanding_amount": invoice.outstanding_amount,
        "status": invoice.status,
        "cost_center": invoice.cost_center,
        "items": [
            {
                "item_code": item.item_code,
                "item_name": item.item_name,
                "description": item.description,
                "qty": item.qty,
                "rate": item.rate,
                "amount": item.amount,
                "net_amount": item.net_amount
            }
            for item in invoice.items
        ]
    }


@frappe.whitelist()
def create_payment_entry(invoice_name, payment_amount, payment_mode, cost_center=None,department=None, reference_number=None):
    """
    Create a payment entry against a sales invoice
    """
    try:
        # Get the sales invoice
        invoice = frappe.get_doc("Sales Invoice", invoice_name)
        
        # Get the company document
        company = frappe.get_doc("Company", invoice.company)
        
        # Get default accounts from Company
        default_receivable_account = company.default_receivable_account
        default_cash_account = company.default_cash_account
        default_bank_account = company.default_bank_account
        
        # Determine which account to use for 'paid_to' based on payment mode
        # Cash payment -> use default_cash_account
        # Bank payment -> use default_bank_account
        paid_to_account = None
        if payment_mode.lower() == 'cash':
            paid_to_account = default_cash_account
        else:
            paid_to_account = default_bank_account
        
        # Fallback if no account found for the payment mode
        if not paid_to_account:
            paid_to_account = default_cash_account or default_bank_account
        
        # Validate we have required accounts
        if not default_receivable_account:
            frappe.throw("Default Receivable Account not set in Company {0}".format(invoice.company))
        
        if not paid_to_account:
            frappe.throw("No Cash or Bank account found. Please set default_cash_account or default_bank_account in Company {0}".format(invoice.company))
        
        # Create payment entry
        payment_entry = frappe.new_doc("Payment Entry")
        payment_entry.payment_type = "Receive"
        payment_entry.company = invoice.company
        payment_entry.party_type = "Customer"
        payment_entry.party = invoice.customer
        payment_entry.party_name = invoice.customer_name
        payment_entry.paid_amount = payment_amount
        payment_entry.received_amount = payment_amount
        payment_entry.reference_date = frappe.utils.today()
        payment_entry.reference_no = reference_number or f"PAY-{invoice_name}"
        payment_entry.mode_of_payment = payment_mode
        payment_entry.department = department
        
        # Set the accounts correctly for a Receive payment
        # paid_from = where money is coming FROM (Party's Receivable account)
        # paid_to = where money is going TO (Your Cash/Bank account)
        payment_entry.paid_from = default_receivable_account
        payment_entry.paid_to = paid_to_account
        
        # Set cost center if provided
        if cost_center:
            payment_entry.cost_center = cost_center
        
        # Set currency (single currency - no exchange rate needed)
        payment_entry.currency = company.default_currency
        
        # Add reference to the invoice
        payment_entry.append("references", {
            "reference_doctype": "Sales Invoice",
            "reference_name": invoice_name,
            "total_amount": invoice.outstanding_amount,
            "outstanding_amount": invoice.outstanding_amount,
            "allocated_amount": payment_amount
        })
        
        # Insert and submit
        payment_entry.insert()
        payment_entry.submit()
        
        frappe.db.commit()
        
        return {
            "success": True,
            "message": f"Payment of {payment_amount} successfully recorded against invoice {invoice_name}",
            "payment_entry": payment_entry.name
        }
        
    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(f"Payment Entry Error: {str(e)}", "Billing Payment")
        return {
            "success": False,
            "message": str(e)
        }

@frappe.whitelist()
def get_invoices_by_reference(reference_name, reference_type):
    """
    Get all invoices for a specific reference (Inpatient Admission or Patient Visit)
    """
    if not reference_name:
        return []
    
    invoices = frappe.get_all("Sales Invoice",
        filters={
            "custom_reference_name": reference_name,
            "docstatus": 1
        },
        fields=["name", "grand_total", "outstanding_amount", "posting_date", "status"]
    )
    
    return invoices