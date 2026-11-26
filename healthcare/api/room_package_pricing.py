"""Explicit duration pricing from the selected Inpatient Package."""

import frappe
from frappe import _
from frappe.utils import cint, flt

MODES = {"Daily": 1, "Weekly": 7, "Monthly": 30}


def resolve_room_package_price(
    pricing_mode, package_name, days, company=None, service_unit_type=None
):
    if pricing_mode not in MODES:
        frappe.throw(_("Select Daily, Weekly or Monthly pricing."))
    if not package_name or cint(days) <= 0:
        frappe.throw(_("Select an Inpatient Package and a positive number of days."))
    package = frappe.get_doc("Inpatient Package", package_name)
    if not cint(package.get("active")):
        frappe.throw(_("The selected Inpatient Package is inactive."))
    if company and package.get("company") != company:
        frappe.throw(
            _("The selected Inpatient Package belongs to a different company.")
        )
    period_days = MODES[pricing_mode]
    if pricing_mode == "Daily":
        period_price = flt(package.package_rate)
    else:
        rows = [
            d
            for d in package.get("duration_pricing") or []
            if cint(d.from_day) == 1 and cint(d.to_day) == period_days
        ]
        if len(rows) != 1:
            frappe.throw(
                _("Configure one day 1–{0} price on package {1}.").format(
                    period_days, package.name
                )
            )
        period_price = flt(rows[0].amount)
    if period_price <= 0:
        frappe.throw(_("The selected package price must be greater than zero."))
    daily_rate = period_price / period_days
    return {
        "package_name": package.name,
        "pricing_mode": pricing_mode,
        "daily_rate": daily_rate,
        "program_price": flt(daily_rate * cint(days), 2),
        "total_price": flt(daily_rate * cint(days), 2),
        "days": cint(days),
        "period_days": period_days,
        "period_price": period_price,
        "room_multiplier": 1,
        "service_unit_type": service_unit_type,
    }


def discounted_package_daily_rate(
    pricing, days, total_amount, discount_percentage=None
):
    rate = pricing["daily_rate"]
    if discount_percentage not in (None, ""):
        discount = flt(discount_percentage)
        if not 0 <= discount < 100:
            frappe.throw(_("Package discount must be between 0 and 100 percent."))
        rate *= 1 - discount / 100
    elif abs(flt(total_amount) - flt(rate * cint(days), 2)) > 0.005:
        # Compatibility for existing API callers that supply only a discounted total.
        rate = flt(total_amount) / cint(days)
    if rate <= 0 or abs(flt(rate * cint(days), 2) - flt(total_amount)) > 0.005:
        frappe.throw(
            _("Package total does not match the selected pricing and discount.")
        )
    return rate


def room_category_aliases(value):
    import re

    aliases = [
        {"triple", "triplesharing", "tripplesuits", "triplesuits"},
        {"double", "doublesharing", "doublesuits"},
        {
            "singleprivate",
            "private",
            "privateroom",
            "single",
            "singlesuits",
            "singlesuites",
        },
        {"royal", "royalsuite", "royalsuits"},
    ]

    def normalize(value):
        return re.sub(r"[^a-z0-9]", "", (value or "").lower())

    return next((group for group in aliases if normalize(value) in group), None)


def package_service_unit_type(package_name):
    """Resolve the selected package category to the configured type; never move occupancy."""
    if not package_name or package_name == "__custom__":
        return None
    package = frappe.get_doc("Inpatient Package", package_name)
    category = room_category_aliases(
        package.get("package_category")
    ) or room_category_aliases(package.name)
    if not category:
        return None
    types = frappe.get_all(
        "Healthcare Service Unit Type", filters={"disabled": 0}, fields=["name"]
    )
    matches = [row.name for row in types if room_category_aliases(row.name) == category]
    if len(matches) != 1:
        frappe.throw(
            _(
                "Configure exactly one Healthcare Service Unit Type for package {0}."
            ).format(package_name)
        )
    return matches[0]


def daily_room_package_price(service_unit_type, days, company):
    """Daily charging uses the admitted room category; duration pricing never does."""
    category = room_category_aliases(service_unit_type)
    if not category:
        frappe.throw(
            _("Set a supported admission Room Type before selecting Daily charging.")
        )
    candidates = frappe.get_all(
        "Inpatient Package",
        filters={"active": 1, "company": company},
        fields=["name", "package_category"],
    )
    matches = [
        row
        for row in candidates
        if room_category_aliases(row.name) == category
        or room_category_aliases(row.package_category) == category
    ]
    if len(matches) != 1:
        frappe.throw(
            _("Configure exactly one active daily package for the admission Room Type.")
        )
    return resolve_room_package_price(
        "Daily", matches[0].name, days, company, service_unit_type
    )


def preserve_room_rate_precision(doc, method=None):
    """Keep prorated rates precise; amounts retain normal currency precision.

    Only explicit room pricing is affected. Source order/quotation rates are
    restored before ERPNext's next calculation (e.g. after document mapping).
    """
    explicit = bool(doc.get("custom_package_pricing_mode"))
    admission_name = (
        doc.get("custom_reference_name")
        if doc.get("custom_reference_type") == "Inpatient Admission"
        else None
    )
    if not explicit and admission_name:
        explicit = bool(
            frappe.db.get_value(
                "Inpatient Admission", admission_name, "package_pricing_mode"
            )
        )
    sources = {}
    for row in doc.get("items") or []:
        if row.get("sales_order") and row.get("so_detail"):
            source = frappe.get_doc("Sales Order Item", row.so_detail)
            so = frappe.get_cached_doc("Sales Order", row.sales_order)
            name = (
                so.get("custom_reference_name")
                if so.get("custom_reference_type") == "Inpatient Admission"
                else None
            )
            if name and frappe.db.get_value(
                "Inpatient Admission", name, "package_pricing_mode"
            ):
                explicit = True
                sources[id(row)] = source
        elif row.get("prevdoc_docname"):
            quote = frappe.get_cached_doc("Quotation", row.prevdoc_docname)
            if quote.get("custom_package_pricing_mode"):
                explicit = True
                source = next(
                    (q for q in quote.items if q.name == row.get("quotation_item")),
                    None,
                )
                if source:
                    sources[id(row)] = source
    if not explicit:
        return
    fields = (
        "rate",
        "price_list_rate",
        "net_rate",
        "base_rate",
        "base_net_rate",
        "base_price_list_rate",
    )
    if not hasattr(doc, "_precision"):
        doc._precision = frappe._dict()
    doc._precision.setdefault("items", frappe._dict()).update({f: 9 for f in fields})
    for index, row in enumerate(doc.get("items") or []):
        if not hasattr(row, "_precision"):
            row._precision = frappe._dict()
        row._precision.setdefault("main", frappe._dict()).update({f: 9 for f in fields})
        source = sources.get(id(row))
        description = str((source or row).get("description") or "").lower()
        package_row = (index == 0 and bool(doc.get("custom_package_pricing_mode"))) or (
            "medical supervision" not in description
            and ("inpatient package" in description or "/day" in description)
        )
        if package_row:
            row._precision["main"].update(
                {
                    f: 2
                    for f in ("amount", "net_amount", "base_amount", "base_net_amount")
                }
            )
        if source:
            # Restore mapping rounding only; retain deliberately changed discounts/rates.
            if abs(flt(row.get("rate")) - flt(source.rate)) < 0.001:
                row.rate = source.rate
            if (
                abs(flt(row.get("price_list_rate")) - flt(source.price_list_rate))
                < 0.001
            ):
                row.price_list_rate = source.price_list_rate
