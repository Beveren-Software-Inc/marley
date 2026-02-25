# Copyright (c) 2025, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class HealthInsurance(Document):
     def before_save(self):
        """Apply parent discounts to inclusive items only"""

        for row in self.inclusive_item:

            # Skip rows without item
            if not row.item_code:
                continue

            # Only fill if EMPTY (do not override manual entry)
            if not row.outpatient_discount:
                row.outpatient_discount = self.outpatient_discount or 0

            if not row.inpatient_discount:
                row.inpatient_discount = self.inpatient_discount or 0


@frappe.whitelist()
def fetch_inclusive_items(docname):
    doc = frappe.get_doc("Health Insurance", docname)

    items = frappe.get_all(
        "Item",
        fields=["name", "item_name"],
        filters={"disabled": 0}
    )

    doc.set("inclusive_item", [])

    for item in items:
        doc.append("inclusive_item", {
            "item_code": item.name,
            "item_name": item.item_name,
            # discounts intentionally empty
        })

    doc.save()
    return "Inclusive items fetched successfully"


@frappe.whitelist()
def fetch_exclusive_items(docname):
    doc = frappe.get_doc("Health Insurance", docname)

    items = frappe.get_all(
        "Item",
        fields=["name", "item_name"],
        filters={"disabled": 0}
    )

    doc.set("exclusive_item", [])

    for item in items:
        doc.append("exclusive_item", {
            "item_code": item.name,
            "item_name": item.item_name
        })

    doc.save()
    return "Exclusive items fetched successfully"
