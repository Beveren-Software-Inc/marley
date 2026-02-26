import frappe
from frappe import _
import json


@frappe.whitelist()
def get_environmental_checklist(admission_name: str) -> dict:
    """Return environmental checklist info for a given Inpatient Admission."""
    if not admission_name:
        frappe.throw(_("Inpatient Admission is required"))

    adm = frappe.get_doc("Inpatient Admission", admission_name)

    details = [
        {
            "name": row.name,
            "item_name": row.item_name,
            "checked": bool(row.checked),
        }
        for row in getattr(adm, "environmental_checklist_detail", []) or []
    ]

    return {
        "admission": adm.name,
        "patient": adm.patient,
        "patient_name": adm.patient_name,
        "environmental_checklist_template": getattr(adm, "environmental_checklist_template", None),
        "details": details,
    }


@frappe.whitelist()
def apply_environmental_checklist_template(admission_name: str, template_name: str | None = None) -> dict:
    """Apply (or re-apply) an Environmental Checklist Template to an Inpatient Admission.

    - If template_name is provided, set it on the admission.
    - Existing environmental_checklist_detail rows are replaced with rows from the template.
    """
    if not admission_name:
        frappe.throw(_("Inpatient Admission is required"))

    adm = frappe.get_doc("Inpatient Admission", admission_name)

    template = template_name or getattr(adm, "environmental_checklist_template", None)
    if not template:
        frappe.throw(_("Environmental Checklist Template is required"))

    tpl = frappe.get_doc("Environmental Checklist Template", template)

    adm.environmental_checklist_template = tpl.name
    adm.set("environmental_checklist_detail", [])

    for row in tpl.get("details", []):
        adm.append("environmental_checklist_detail", {"item_name": row.item_name, "checked": 0})

    adm.save(ignore_permissions=True)
    frappe.db.commit()

    return get_environmental_checklist(admission_name)


@frappe.whitelist()
def update_environmental_checklist(admission_name: str, details) -> dict:
    """Update Environmental Checklist Detail rows (checked flags) on an Inpatient Admission.

    `details` is a list of dicts: { name, checked }.
    """
    if not admission_name:
        frappe.throw(_("Inpatient Admission is required"))

    if isinstance(details, str):
        try:
            details = json.loads(details)
        except Exception:
            frappe.throw(_("Invalid details payload"))

    if not isinstance(details, list):
        frappe.throw(_("Details must be a list"))

    adm = frappe.get_doc("Inpatient Admission", admission_name)
    row_map = {row.name: row for row in getattr(adm, "environmental_checklist_detail", []) or []}

    for item in details:
        name = item.get("name")
        if not name or name not in row_map:
            continue
        row = row_map[name]
        row.checked = 1 if item.get("checked") else 0

    adm.save(ignore_permissions=True)
    frappe.db.commit()

    return get_environmental_checklist(admission_name)

