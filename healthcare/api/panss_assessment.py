# healthcare/api/panss_assessment_api.py

import frappe

@frappe.whitelist()
def get_panss_terms():
    """Fetch PANSS terms for header and footer."""
    terms_data = {
        "header_description": "",
        "footer_description": ""
    }
    
    # Fetch Default PANSS Header
    header_terms = frappe.db.get_value("PANSS Terms", "Default PANSS Header", "description")
    if header_terms:
        terms_data["header_description"] = header_terms
    
    # Fetch Default PANSS Footer
    footer_terms = frappe.db.get_value("PANSS Terms", "Default PANSS Footer", "description")
    if footer_terms:
        terms_data["footer_description"] = footer_terms
    
    return terms_data


@frappe.whitelist()
def calculate_panss_scores(data):
    """Calculate PANSS scores from ratings."""
    try:
        if isinstance(data, str):
            data = frappe.parse_json(data)
        
        # Extract scores
        positive_scores = [
            int(data.get("p1", 1)), int(data.get("p2", 1)), int(data.get("p3", 1)),
            int(data.get("p4", 1)), int(data.get("p5", 1)), int(data.get("p6", 1)),
            int(data.get("p7", 1))
        ]
        negative_scores = [
            int(data.get("n1", 1)), int(data.get("n2", 1)), int(data.get("n3", 1)),
            int(data.get("n4", 1)), int(data.get("n5", 1)), int(data.get("n6", 1)),
            int(data.get("n7", 1))
        ]
        general_scores = [
            int(data.get("g1", 1)), int(data.get("g2", 1)), int(data.get("g3", 1)),
            int(data.get("g4", 1)), int(data.get("g5", 1)), int(data.get("g6", 1)),
            int(data.get("g7", 1)), int(data.get("g8", 1)), int(data.get("g9", 1)),
            int(data.get("g10", 1)), int(data.get("g11", 1)), int(data.get("g12", 1)),
            int(data.get("g13", 1)), int(data.get("g14", 1)), int(data.get("g15", 1)),
            int(data.get("g16", 1))
        ]
        
        positive_total = sum(positive_scores)
        negative_total = sum(negative_scores)
        general_total = sum(general_scores)
        panss_total = positive_total + negative_total + general_total
        composite_index = positive_total - negative_total
        
        # Calculate severity band
        if panss_total < 58:
            severity_band = "Mild"
        elif panss_total <= 75:
            severity_band = "Moderate"
        elif panss_total <= 95:
            severity_band = "Moderate-Severe"
        else:
            severity_band = "Severe"
        
        return {
            "success": True,
            "positive_total": positive_total,
            "negative_total": negative_total,
            "general_total": general_total,
            "panss_total": panss_total,
            "composite_index": composite_index,
            "severity_band": severity_band
        }
    except Exception as e:
        return {"success": False, "message": str(e)}


@frappe.whitelist()
def create_panss_assessment(data):
    """Create a new PANSS Assessment record."""
    try:
        if isinstance(data, str):
            data = frappe.parse_json(data)
        
        doc = frappe.new_doc("PANSS Assessment")
        doc.patient = data.get("patient")
        doc.assessment_date = data.get("assessment_date")
        doc.rater = data.get("rater")
        doc.header_terms = "Default PANSS Header"
        doc.footer_terms = "Default PANSS Footer"
        doc.clinical_notes = data.get("clinical_notes")
        
        # Set all ratings
        doc.p1 = int(data.get("p1", 1))
        doc.p2 = int(data.get("p2", 1))
        doc.p3 = int(data.get("p3", 1))
        doc.p4 = int(data.get("p4", 1))
        doc.p5 = int(data.get("p5", 1))
        doc.p6 = int(data.get("p6", 1))
        doc.p7 = int(data.get("p7", 1))
        
        doc.n1 = int(data.get("n1", 1))
        doc.n2 = int(data.get("n2", 1))
        doc.n3 = int(data.get("n3", 1))
        doc.n4 = int(data.get("n4", 1))
        doc.n5 = int(data.get("n5", 1))
        doc.n6 = int(data.get("n6", 1))
        doc.n7 = int(data.get("n7", 1))
        
        doc.g1 = int(data.get("g1", 1))
        doc.g2 = int(data.get("g2", 1))
        doc.g3 = int(data.get("g3", 1))
        doc.g4 = int(data.get("g4", 1))
        doc.g5 = int(data.get("g5", 1))
        doc.g6 = int(data.get("g6", 1))
        doc.g7 = int(data.get("g7", 1))
        doc.g8 = int(data.get("g8", 1))
        doc.g9 = int(data.get("g9", 1))
        doc.g10 = int(data.get("g10", 1))
        doc.g11 = int(data.get("g11", 1))
        doc.g12 = int(data.get("g12", 1))
        doc.g13 = int(data.get("g13", 1))
        doc.g14 = int(data.get("g14", 1))
        doc.g15 = int(data.get("g15", 1))
        doc.g16 = int(data.get("g16", 1))
        
        # Calculate totals
        positive_total = sum([doc.p1, doc.p2, doc.p3, doc.p4, doc.p5, doc.p6, doc.p7])
        negative_total = sum([doc.n1, doc.n2, doc.n3, doc.n4, doc.n5, doc.n6, doc.n7])
        general_total = sum([doc.g1, doc.g2, doc.g3, doc.g4, doc.g5, doc.g6, doc.g7, doc.g8, doc.g9, doc.g10, doc.g11, doc.g12, doc.g13, doc.g14, doc.g15, doc.g16])
        
        doc.positive_total = positive_total
        doc.negative_total = negative_total
        doc.general_total = general_total
        doc.panss_total = positive_total + negative_total + general_total
        doc.composite_index = positive_total - negative_total
        
        # Set severity band
        if doc.panss_total < 58:
            doc.severity_band = "Mild"
        elif doc.panss_total <= 75:
            doc.severity_band = "Moderate"
        elif doc.panss_total <= 95:
            doc.severity_band = "Moderate-Severe"
        else:
            doc.severity_band = "Severe"
        
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
        return {"success": True, "name": doc.name}
    except Exception as e:
        frappe.logger().error(f"Error creating PANSS assessment: {str(e)}")
        return {"success": False, "message": str(e)}


@frappe.whitelist()
def get_panss_assessments(patient=None, search=None):
    """Fetch PANSS assessments with optional filters."""
    filters = []
    if patient:
        filters.append(["patient", "=", patient])
    if search:
        filters.append(["patient_name", "like", f"%{search}%"])
    
    assessments = frappe.get_list(
        "PANSS Assessment",
        fields=[
            "name", "patient", "patient_name", "assessment_date",
            "rater", "positive_total", "negative_total", "general_total",
            "panss_total", "composite_index", "severity_band", "docstatus"
        ],
        filters=filters,
        limit=50,
        order_by="assessment_date desc"
    )
    
    return assessments