# # healthcare/api/diagnosis.py

# import frappe
# from frappe import _

# @frappe.whitelist()
# def add_inpatient_diagnoses(admission: str, diagnoses: list):
#     """
#     Add diagnoses to an inpatient admission
#     diagnoses: list of dict objects with fields:
#         - diagnosis (required): Link to Diagnosis doctype
#         - details (required): Text description
#         - posting_date (required): Datetime
#         - diagnoses_time (required): Datetime
#         - practitioner (required): Link to Healthcare Practitioner
#         - practitioner_name (optional): Name of practitioner
#         - diagnoses_flag (optional): Check (0/1) - primary diagnosis flag
#         - trans_num (optional): Transaction number
#     """
#     if not admission:
#         frappe.throw(_("Admission is required"))
    
#     if not diagnoses or not isinstance(diagnoses, list):
#         frappe.throw(_("Diagnoses list is required"))
    
#     # Get the inpatient admission document
#     doc = frappe.get_doc("Inpatient Admission", admission)
    
#     # Validate the document is not cancelled
#     if doc.docstatus == 2:
#         frappe.throw(_("Cannot add diagnoses to a cancelled admission"))
    
#     # Prepare new diagnosis rows
#     new_rows = []
#     for idx, diag in enumerate(diagnoses):
#         # Validate required fields
#         if not diag.get("diagnosis"):
#             frappe.throw(_("Row {0}: Diagnosis is required").format(idx + 1))
#         if not diag.get("details"):
#             frappe.throw(_("Row {0}: Details are required").format(idx + 1))
#         if not diag.get("posting_date"):
#             frappe.throw(_("Row {0}: Posting date is required").format(idx + 1))
#         if not diag.get("diagnoses_time"):
#             frappe.throw(_("Row {0}: Diagnosis time is required").format(idx + 1))
#         if not diag.get("practitioner"):
#             frappe.throw(_("Row {0}: Practitioner is required").format(idx + 1))
        
#         # Create the row
#         new_row = {
#             "diagnosis": diag.get("diagnosis"),
#             "details": diag.get("details"),
#             "posting_date": diag.get("posting_date"),
#             "diagnoses_time": diag.get("diagnoses_time"),
#             "practitioner": diag.get("practitioner"),
#             "practitioner_name": diag.get("practitioner_name", ""),
#             "diagnoses_flag": 1 if diag.get("diagnoses_flag") else 0,
#             "trans_num": diag.get("trans_num", f"DIA-{frappe.utils.now()}-{idx}")
#         }
#         new_rows.append(new_row)
    
#     # Append new rows to existing diagnoses
#     for row in new_rows:
#         doc.append("patient_diagnosis", row)
    
#     # Save the document
#     doc.save(ignore_permissions=False)
#     frappe.db.commit()
    
#     return {
#         "success": True,
#         "message": f"Successfully added {len(new_rows)} diagnosis(es) to admission {admission}",
#         "admission": admission,
#         "diagnoses_added": len(new_rows)
#     }


# @frappe.whitelist()
# def get_inpatient_diagnoses(admission: str):
#     """
#     Get all diagnoses for an inpatient admission
#     """
#     if not admission:
#         frappe.throw(_("Admission is required"))
    
#     doc = frappe.get_doc("Inpatient Admission", admission)
    
#     diagnoses = []
#     for diag in doc.get("diagnoses", []):
#         diagnoses.append({
#             "name": diag.name,
#             "diagnosis": diag.diagnosis,
#             "diagnosis_label": frappe.get_cached_value("Diagnosis", diag.diagnosis, "diagnosis") if diag.diagnosis else "",
#             "details": diag.details,
#             "posting_date": diag.posting_date,
#             "diagnoses_time": diag.diagnoses_time,
#             "practitioner": diag.practitioner,
#             "practitioner_name": diag.practitioner_name,
#             "diagnoses_flag": diag.diagnoses_flag,
#             "trans_num": diag.trans_num
#         })
    
#     return diagnoses


# @frappe.whitelist()
# def delete_inpatient_diagnosis(admission: str, diagnosis_row_name: str):
#     """
#     Delete a specific diagnosis row from an inpatient admission
#     """
#     if not admission:
#         frappe.throw(_("Admission is required"))
    
#     if not diagnosis_row_name:
#         frappe.throw(_("Diagnosis row name is required"))
    
#     doc = frappe.get_doc("Inpatient Admission", admission)
    
#     # Find and remove the diagnosis row
#     for idx, diag in enumerate(doc.get("diagnoses", [])):
#         if diag.name == diagnosis_row_name:
#             doc.get("diagnoses").pop(idx)
#             doc.save(ignore_permissions=False)
#             frappe.db.commit()
#             return {
#                 "success": True,
#                 "message": "Diagnosis deleted successfully"
#             }
    
#     frappe.throw(_("Diagnosis row not found"))

# healthcare/api/diagnosis.py

import frappe
from frappe import _

@frappe.whitelist()
def update_inpatient_diagnoses(admission: str, diagnoses: list):
    """
    Update all diagnoses for an inpatient admission (replace entire table)
    diagnoses: list of dict objects with fields:
        - name (optional): existing row name for updates
        - diagnosis (required): Link to Diagnosis doctype
        - details (required): Text description
        - posting_date (required): Datetime
        - diagnoses_time (required): Datetime
        - practitioner (required): Link to Healthcare Practitioner
        - practitioner_name (optional): Name of practitioner
        - diagnoses_flag (optional): Check (0/1) - primary diagnosis flag
        - trans_num (optional): Transaction number
    """
    if not admission:
        frappe.throw(_("Admission is required"))
    
    if not isinstance(diagnoses, list):
        frappe.throw(_("Diagnoses list is required"))
    
    # Get the inpatient admission document
    doc = frappe.get_doc("Inpatient Admission", admission)
    
    # Validate the document is not cancelled
    if doc.docstatus == 2:
        frappe.throw(_("Cannot modify diagnoses of a cancelled admission"))
    
    # Clear existing diagnoses
    doc.set("patient_diagnosis", [])
    
    # Add all diagnoses back
    for idx, diag in enumerate(diagnoses):
        # Validate required fields
        if not diag.get("diagnosis"):
            frappe.throw(_("Row {0}: Diagnosis is required").format(idx + 1))
        if not diag.get("details"):
            frappe.throw(_("Row {0}: Details are required").format(idx + 1))
        if not diag.get("posting_date"):
            frappe.throw(_("Row {0}: Posting date is required").format(idx + 1))
        if not diag.get("diagnoses_time"):
            frappe.throw(_("Row {0}: Diagnosis time is required").format(idx + 1))
        if not diag.get("practitioner"):
            frappe.throw(_("Row {0}: Practitioner is required").format(idx + 1))
        
        # Create the row
        new_row = {
            "diagnosis": diag.get("diagnosis"),
            "details": diag.get("details"),
            "posting_date": diag.get("posting_date"),
            "diagnoses_time": diag.get("diagnoses_time"),
            "practitioner": diag.get("practitioner"),
            "practitioner_name": diag.get("practitioner_name", ""),
            "diagnoses_flag": 1 if diag.get("diagnoses_flag") else 0,
            "trans_num": diag.get("trans_num", f"DIA-{frappe.utils.now()}-{idx}")
        }
        
        # If this is an existing row with a name, set it to update
        if diag.get("name"):
            new_row["name"] = diag.get("name")
        
        doc.append("patient_diagnosis", new_row)
    
    # Save the document
    doc.save(ignore_permissions=False)
    frappe.db.commit()
    
    return {
        "success": True,
        "message": f"Successfully updated {len(diagnoses)} diagnosis(es) for admission {admission}",
        "admission": admission,
        "diagnoses_updated": len(diagnoses)
    }


@frappe.whitelist()
def add_inpatient_diagnoses(admission: str, diagnoses: list):
    """
    Add new diagnoses to an inpatient admission (append only)
    """
    if not admission:
        frappe.throw(_("Admission is required"))
    
    if not diagnoses or not isinstance(diagnoses, list):
        frappe.throw(_("Diagnoses list is required"))
    
    doc = frappe.get_doc("Inpatient Admission", admission)
    
    if doc.docstatus == 2:
        frappe.throw(_("Cannot add diagnoses to a cancelled admission"))
    
    new_rows = []
    for idx, diag in enumerate(diagnoses):
        if not diag.get("diagnosis"):
            frappe.throw(_("Row {0}: Diagnosis is required").format(idx + 1))
        if not diag.get("details"):
            frappe.throw(_("Row {0}: Details are required").format(idx + 1))
        if not diag.get("posting_date"):
            frappe.throw(_("Row {0}: Posting date is required").format(idx + 1))
        if not diag.get("diagnoses_time"):
            frappe.throw(_("Row {0}: Diagnosis time is required").format(idx + 1))
        if not diag.get("practitioner"):
            frappe.throw(_("Row {0}: Practitioner is required").format(idx + 1))
        
        new_row = {
            "diagnosis": diag.get("diagnosis"),
            "details": diag.get("details"),
            "posting_date": diag.get("posting_date"),
            "diagnoses_time": diag.get("diagnoses_time"),
            "practitioner": diag.get("practitioner"),
            "practitioner_name": diag.get("practitioner_name", ""),
            "diagnoses_flag": 1 if diag.get("diagnoses_flag") else 0,
            "trans_num": diag.get("trans_num", f"DIA-{frappe.utils.now()}-{idx}")
        }
        new_rows.append(new_row)
    
    for row in new_rows:
        doc.append("patient_diagnosis", row)
    
    doc.save(ignore_permissions=False)
    frappe.db.commit()
    
    return {
        "success": True,
        "message": f"Successfully added {len(new_rows)} diagnosis(es) to admission {admission}",
        "admission": admission,
        "diagnoses_added": len(new_rows)
    }


@frappe.whitelist()
def get_inpatient_diagnoses(admission: str):
    """
    Get all diagnoses for an inpatient admission
    """
    if not admission:
        frappe.throw(_("Admission is required"))
    
    doc = frappe.get_doc("Inpatient Admission", admission)
    
    diagnoses = []
    for diag in doc.get("patient_diagnosis", []):
        diagnoses.append({
            "name": diag.name,
            "diagnosis": diag.diagnosis,
            "diagnosis_label": frappe.get_cached_value("Diagnosis", diag.diagnosis, "diagnosis") if diag.diagnosis else "",
            "details": diag.details,
            "posting_date": diag.posting_date,
            "diagnoses_time": diag.diagnoses_time,
            "practitioner": diag.practitioner,
            "practitioner_name": diag.practitioner_name,
            "diagnoses_flag": diag.diagnoses_flag,
            "trans_num": diag.trans_num
        })
    
    return diagnoses


@frappe.whitelist()
def delete_inpatient_diagnosis(admission: str, diagnosis_row_name: str):
    """
    Delete a specific diagnosis row from an inpatient admission
    """
    if not admission:
        frappe.throw(_("Admission is required"))
    
    if not diagnosis_row_name:
        frappe.throw(_("Diagnosis row name is required"))
    
    doc = frappe.get_doc("Inpatient Admission", admission)
    
    for idx, diag in enumerate(doc.get("patient_diagnosis", [])):
        if diag.name == diagnosis_row_name:
            doc.get("patient_diagnosis").pop(idx)
            doc.save(ignore_permissions=False)
            frappe.db.commit()
            return {
                "success": True,
                "message": "Diagnosis deleted successfully"
            }
    
    frappe.throw(_("Diagnosis row not found"))