
import frappe 

def validate_discount(doc, method):
    # Fetch discount limit from Healthcare Settings (Single Doctype)
    discount_limit = frappe.db.get_single_value(
        "Healthcare Settings",
        "discount_limit"
    )

    # If no limit is set, allow
    if not discount_limit:
        return

    # Check additional discount percentage
    if doc.additional_discount_percentage and doc.additional_discount_percentage > discount_limit:
        frappe.throw(
            f"Discount cannot exceed {discount_limit}%. "
            f"You entered {doc.additional_discount_percentage}%."
        )