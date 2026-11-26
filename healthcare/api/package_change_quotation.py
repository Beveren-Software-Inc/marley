"""Draft quotations for package changes, preserving existing billing documents."""

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, today


def _remaining_planned_days(admission, source, changes):
    from healthcare.api.package_charge_to_today import (
        _admission_start_date,
        _days_already_billed,
        _package_line_from_quotation,
    )

    start = _admission_start_date(admission)
    end = admission.get("expected_discharge")
    if start and end:
        planned = (getdate(end) - start).days + 1
    elif changes and changes[0].get("planned_days"):
        planned = cint(changes[0]["planned_days"])
    else:
        row = _package_line_from_quotation(source) if source else None
        planned = cint(row.qty) if row else 0
    remaining = planned - _days_already_billed(admission.name)
    if remaining <= 0:
        frappe.throw(
            _(
                "No remaining planned stay days. Extend the expected discharge date before changing the package."
            )
        )
    return planned, remaining


def _already_billed_items(admission_name, codes):
    """Include separately billed admission fees; do not count SO and SI twice."""
    if not codes:
        return {}
    from healthcare.api.reception_reports import (
        _admission_sales_orders,
        _admission_sales_invoices,
    )

    orders = [row.name for row in _admission_sales_orders(admission_name)]
    invoices = [row.name for row in _admission_sales_invoices(admission_name, orders)]
    quantities = {}
    if orders:
        for row in frappe.get_all(
            "Sales Order Item",
            filters={
                "parent": ["in", orders],
                "item_code": ["in", list(codes)],
                "docstatus": ["<", 2],
            },
            fields=["item_code", "qty"],
        ):
            quantities[row.item_code] = quantities.get(row.item_code, 0) + flt(row.qty)
    if invoices:
        for row in frappe.get_all(
            "Sales Invoice Item",
            filters={
                "parent": ["in", invoices],
                "item_code": ["in", list(codes)],
                "docstatus": 1,
            },
            fields=["item_code", "qty", "sales_order"],
        ):
            if row.sales_order not in orders:
                quantities[row.item_code] = quantities.get(row.item_code, 0) + flt(
                    row.qty
                )
    return quantities


def _locked_quotation(name):
    frappe.db.get_value("Quotation", name, "name", for_update=True)
    return frappe.get_doc("Quotation", name)


def _select_change_quotation(admission, previous_package, changes):
    """Prefer explicit active history; do not guess between package Drafts."""
    from healthcare.api.package_charge_to_today import _find_admission_package_quotation

    active = changes[0].get("new_quotation") if changes else None
    if active:
        source = _locked_quotation(active)
        if source.get("custom_inpatient_admission") != admission.name or (
            previous_package
            and (source.get("custom_package") or "__custom__") != previous_package
        ):
            frappe.throw(
                _(
                    "The active quotation does not match this admission/package. Review the quotation history."
                )
            )
        if cint(source.docstatus) == 2:
            frappe.throw(
                _(
                    "The active quotation is cancelled. Review the quotation history before changing the package."
                )
            )
        return source
    drafts = frappe.get_all(
        "Quotation",
        filters={"custom_inpatient_admission": admission.name, "docstatus": 0},
        fields=["name", "custom_package", "custom_package_pricing_mode"],
    )
    unclassified = [
        row.name
        for row in drafts
        if not row.custom_package and not row.custom_package_pricing_mode
    ]
    custom = (
        set(
            frappe.get_all(
                "Quotation Item",
                filters={
                    "parent": ["in", unclassified],
                    "description": ["like", "Inpatient Package:%"],
                },
                pluck="parent",
            )
        )
        if unclassified
        else set()
    )
    drafts = [
        row
        for row in drafts
        if row.custom_package or row.custom_package_pricing_mode or row.name in custom
    ]
    if len(drafts) > 1:
        frappe.throw(
            _(
                "Multiple Draft package quotations exist and the active quotation is ambiguous: {0}. Review them before changing the package."
            ).format(", ".join(row.name for row in drafts))
        )
    if drafts and (
        not previous_package
        or (drafts[0].custom_package or "__custom__") == previous_package
    ):
        return _locked_quotation(drafts[0].name)
    source = _find_admission_package_quotation(
        admission.name, previous_package or None, allow_draft=True
    )
    return _locked_quotation(source.name) if source else None


def _quotation_has_billing(quotation, admission_name):
    """Protect ledgered Drafts, direct orders/invoices, and unattributed package invoices."""
    name = quotation.name
    # Package Detail is non-submittable: a valid ledger row has docstatus 0.
    if frappe.db.exists("Package Detail", {"quotation": name}):
        return True
    items = quotation.get("items") or []
    item_names = [row.name for row in items if row.get("name")]
    links = [["prevdoc_docname", "=", name]]
    if item_names:
        links.append(["quotation_item", "in", item_names])
    order_items = frappe.get_all(
        "Sales Order Item",
        or_filters=links,
        fields=["name", "parent"],
        limit_page_length=0,
    )
    orders = list({row.parent for row in order_items})
    if orders and frappe.db.exists(
        "Sales Order", {"name": ["in", orders], "docstatus": ["<", 2]}
    ):
        return True
    for reference_dt, reference_names in [
        ("Quotation", [name]),
        ("Quotation Item", item_names),
    ]:
        if reference_names and frappe.db.exists(
            "Sales Invoice Item",
            {
                "reference_dt": reference_dt,
                "reference_dn": ["in", reference_names],
                "docstatus": ["<", 2],
            },
        ):
            return True
    for dt_field, name_field in [
        ("custom_reference_type", "custom_reference_name"),
        ("custom_base_reference", "custom_base_reference_name"),
    ]:
        if frappe.db.exists(
            "Sales Invoice",
            {dt_field: "Quotation", name_field: name, "docstatus": ["<", 2]},
        ):
            return True
    invoice_links = []
    if orders:
        invoice_links.append(["sales_order", "in", orders])
    if order_items:
        invoice_links.append(["so_detail", "in", [row.name for row in order_items]])
    if invoice_links and frappe.get_all(
        "Sales Invoice Item",
        filters={"docstatus": ["<", 2]},
        or_filters=invoice_links,
        pluck="parent",
        limit_page_length=1,
    ):
        return True

    # Legacy standalone invoices may identify only the admission and package Item.
    # Explicit links to another quotation prove those are historical, not this Draft's billing.
    invoices = set()
    for dt_field, name_field in [
        ("custom_reference_type", "custom_reference_name"),
        ("custom_base_reference", "custom_base_reference_name"),
    ]:
        invoices.update(
            frappe.get_all(
                "Sales Invoice",
                filters={
                    dt_field: "Inpatient Admission",
                    name_field: admission_name,
                    "docstatus": ["<", 2],
                },
                pluck="name",
                limit_page_length=0,
            )
        )
    codes = list({row.item_code for row in items if row.get("item_code")})
    if not invoices or not codes:
        return False
    rows = frappe.get_all(
        "Sales Invoice Item",
        filters={
            "parent": ["in", list(invoices)],
            "item_code": ["in", codes],
            "docstatus": ["<", 2],
        },
        fields=["sales_order", "so_detail", "reference_dt", "reference_dn"],
        limit_page_length=0,
    )
    if not rows:
        return False
    details = [row.so_detail for row in rows if row.so_detail]
    parent_orders = list({row.sales_order for row in rows if row.sales_order})
    source_links = []
    if details:
        source_links.append(["name", "in", details])
    if parent_orders:
        source_links.append(["parent", "in", parent_orders])
    sources = (
        frappe.get_all(
            "Sales Order Item",
            or_filters=source_links,
            fields=["name", "parent", "prevdoc_docname", "quotation_item"],
            limit_page_length=0,
        )
        if source_links
        else []
    )
    by_detail = {row.name: row for row in sources}
    by_order = {}
    for row in sources:
        if row.prevdoc_docname:
            by_order.setdefault(row.parent, set()).add(row.prevdoc_docname)
    ledger = (
        frappe.get_all(
            "Package Detail",
            filters={"sales_order": ["in", parent_orders]},
            fields=["sales_order", "quotation"],
            limit_page_length=0,
        )
        if parent_orders
        else []
    )
    for row in ledger:
        if row.quotation:
            by_order.setdefault(row.sales_order, set()).add(row.quotation)
    for row in rows:
        if row.reference_dt == "Quotation" and row.reference_dn:
            if row.reference_dn == name:
                return True
            continue
        detail = by_detail.get(row.so_detail)
        if detail and detail.prevdoc_docname:
            if detail.prevdoc_docname == name or detail.quotation_item in item_names:
                return True
            continue
        linked = by_order.get(row.sales_order, set())
        if linked and name not in linked:
            continue
        return (
            True  # Admission/package match without proof it belongs to another quote.
        )
    return False


def create_package_change_quotation(
    admission, previous_package, package_name, mode, rate
):
    from healthcare.api.inpatient_admission import _resolve_package_quotation_item
    from healthcare.api.package_change_history import get_package_changes
    from healthcare.api.package_charge_to_today import (
        _package_line_from_quotation,
    )
    from healthcare.api.room_package_pricing import preserve_room_rate_precision

    changes = get_package_changes(admission.name)
    source = _select_change_quotation(admission, previous_package, changes)
    if source:
        if source.get("custom_inpatient_admission") != admission.name or (
            previous_package
            and (source.get("custom_package") or "__custom__") != previous_package
        ):
            frappe.throw(
                _(
                    "The quotation changed while selecting it. Refresh and review the active quotation."
                )
            )
        if cint(source.docstatus) not in (0, 1):
            frappe.throw(
                _("Cancelled quotations cannot be reused for a package change.")
            )
        source.check_permission("read")
    reuse = bool(
        source
        and cint(source.docstatus) == 0
        and not _quotation_has_billing(source, admission.name)
    )
    if reuse:
        source.check_permission("write")
    planned, remaining = _remaining_planned_days(admission, source, changes)
    source_line = _package_line_from_quotation(source) if source else None
    original_items = source.get("items") or [] if source else []
    extra_rows = [row for row in original_items if row is not source_line]
    billed = _already_billed_items(
        admission.name, {row.item_code for row in extra_rows}
    )

    quotation = (
        source
        if reuse
        else (
            frappe.copy_doc(source, ignore_no_copy=False)
            if source
            else frappe.new_doc("Quotation")
        )
    )
    quotation.docstatus = 0
    quotation.status = "Draft"
    quotation.quotation_to = "Customer"
    quotation.party_name = (
        source.party_name if source else None
    ) or frappe.db.get_value("Patient", admission.patient, "customer")
    if not quotation.party_name:
        frappe.throw(
            _(
                "Patient must have a linked Customer before creating a package quotation."
            )
        )
    quotation.patient = admission.patient
    quotation.company = admission.company
    quotation.transaction_date = today()
    quotation.valid_till = None
    quotation.custom_inpatient_admission = admission.name
    quotation.custom_reference_type = "Inpatient Admission"
    quotation.custom_reference_name = admission.name
    quotation.custom_package = package_name if package_name != "__custom__" else None
    quotation.custom_package_pricing_mode = mode
    quotation.custom_package_daily_rate = rate
    if source:
        quotation.custom_include_lab_tests = cint(
            source.get("custom_include_lab_tests")
        )
        quotation.custom_include_observation = cint(
            source.get("custom_include_observation")
        )
        quotation.custom_include_therapy_sessions = cint(source.get("custom_include_therapy_sessions"))
        quotation.custom_include_consultations = cint(source.get("custom_include_consultations"))

    elif package_name != "__custom__":
        from healthcare.api.inpatient_admission import is_enhanced_workflow_enabled

        if is_enhanced_workflow_enabled():
            package = frappe.get_doc("Inpatient Package", package_name)
            quotation.custom_include_lab_tests = cint(
                package.get("custom_include_lab_tests")
            )
            quotation.custom_include_observation = cint(
                package.get("custom_include_observation")
            )
            quotation.custom_include_therapy_sessions = cint(package.get("include_therapy_sessions"))
            quotation.custom_include_consultations = cint(package.get("include_consultations"))

    copied_items = list(quotation.get("items") or [])
    quotation.set("items", [])
    info = _resolve_package_quotation_item(
        admission,
        None,
        service_unit_type=admission.get("admission_service_unit_type"),
        package_name=package_name,
        fallback_item=source_line,
    )
    label = (
        "Custom Package"
        if package_name == "__custom__"
        else frappe.db.get_value("Inpatient Package", package_name, "package_name")
        or package_name
    )
    package_row = quotation.append(
        "items",
        {
            "name": source_line.get("name") if reuse and source_line else None,
            "item_code": info["item_code"],
            "item_name": info["item_name"],
            "qty": remaining,
            "rate": rate,
            "price_list_rate": rate,
            "ignore_pricing_rule": 1,
            "description": f"Inpatient Package: {label} - Room type: {info['type_label']} ({remaining} days @ {rate:.2f}/day)",
        },
    )
    if package_name != "__custom__":
        package_row.cost_center = frappe.db.get_value(
            "Inpatient Package", package_name, "cost_center"
        )

    # Retain unbilled one-time rows; reset copied order counters and child identities.
    available = dict(billed)
    for original, copied in zip(original_items, copied_items):
        if original is source_line:
            continue
        used = max(
            flt(original.get("ordered_qty")),
            min(available.get(original.item_code, 0), flt(original.qty)),
        )
        available[original.item_code] = max(
            available.get(original.item_code, 0) - used, 0
        )
        qty = max(flt(original.qty) - used, 0)
        if qty > 0:
            values = copied.as_dict()
            values.update(
                name=original.get("name") if reuse else None,
                docstatus=0,
                qty=qty,
                ordered_qty=0,
                idx=len(quotation.get("items") or []) + 1,
            )
            quotation.append("items", values)
    quotation.check_permission("write" if reuse else "create")
    quotation.flags.ignore_pricing_rule = True
    quotation.flags.ignore_mandatory = True
    preserve_room_rate_precision(quotation)
    quotation.set_missing_values(for_validate=True)
    quotation.calculate_taxes_and_totals()
    if reuse:
        quotation.save()
    else:
        quotation.insert()
    return {
        "source_quotation": source.name if source else None,
        "new_quotation": quotation.name,
        "planned_days": planned,
        "quotation_days": remaining,
        "quotation_reused": reuse,
    }
