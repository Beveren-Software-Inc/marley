"""Structured package-change audit records in the existing admission Comment timeline."""

import html
import json
import re

import frappe

EVENT = "inpatient_package_change"


def has_package_change(admission):
    return bool(
        frappe.db.exists(
            "Comment",
            {
                "reference_doctype": "Inpatient Admission",
                "reference_name": admission,
                "comment_type": "Comment",
                "content": ["like", "%" + EVENT + "%"],
            },
        )
    )


def _selection_price(package, mode, daily_rate, packages):
    if mode == "Daily":
        return float(daily_rate or 0)
    days = {"Weekly": 7, "Monthly": 30}.get(mode)
    if not days or not package or package == "__custom__":
        return None
    if package not in packages:
        packages[package] = (
            frappe.get_doc("Inpatient Package", package)
            if frappe.db.exists("Inpatient Package", package)
            else None
        )
    doc = packages[package]
    rows = (
        [
            row
            for row in (doc.get("duration_pricing") or [])
            if int(row.from_day or 0) == 1 and int(row.to_day or 0) == days
        ]
        if doc
        else []
    )
    return float(rows[0].amount) if len(rows) == 1 else None


def record_package_change(
    admission,
    previous_package,
    previous_mode,
    previous_rate,
    package,
    mode,
    rate,
    quotation_change=None,
):
    packages = {}
    previous_changes = get_package_changes(admission.name)
    last = previous_changes[0] if previous_changes else {}
    previous_price = (
        last.get("new_package_price")
        if last.get("new_package") == previous_package
        and last.get("new_mode") == previous_mode
        else None
    )
    if previous_price is None:
        previous_price = _selection_price(
            previous_package, previous_mode, previous_rate, packages
        )
    payload = {
        "event": EVENT,
        "admission": admission.name,
        "previous_package": previous_package or None,
        "previous_mode": previous_mode or None,
        "previous_rate": previous_rate,
        "new_package": package or None,
        "new_mode": mode,
        "new_rate": rate,
        "previous_package_price": previous_price,
        "new_package_price": _selection_price(package, mode, rate, packages),
    }
    if quotation_change:
        payload.update(quotation_change)
    # An audit failure must roll back the change; never silently lose history.
    admission.add_comment(
        "Comment",
        text="<p>Inpatient package change</p><pre>"
        + html.escape(json.dumps(payload), quote=False)
        + "</pre>",
    )


def active_change_quotation(admission, package=None):
    changes = get_package_changes(admission)
    if not changes:
        return None
    change = changes[0]
    if package is not None and change.get("new_package") != package:
        return None
    return change.get("new_quotation")


def get_package_changes(admission):
    rows = frappe.get_all(
        "Comment",
        filters={
            "reference_doctype": "Inpatient Admission",
            "reference_name": admission,
            "comment_type": "Comment",
            "content": ["like", "%" + EVENT + "%"],
        },
        fields=["name", "content", "creation", "owner", "comment_email"],
        order_by="creation desc",
    )
    changes = []
    for row in rows:
        match = re.search(r"<pre[^>]*>(.*?)</pre>", row.content or "", re.S)
        if not match:
            continue
        try:
            data = json.loads(html.unescape(match.group(1)))
        except (ValueError, TypeError):
            continue
        if data.get("event") != EVENT or data.get("admission") != admission:
            continue
        changes.append(
            {
                **data,
                "name": row.name,
                "changed_on": str(row.creation),
                "changed_by": row.comment_email or row.owner,
            }
        )
    # Older audit entries did not snapshot the configured period price. Read
    # current configuration in one batch; do not rewrite those historical records.
    missing = {
        change.get(prefix + "_package")
        for change in changes
        for prefix in ("previous", "new")
        if prefix + "_package_price" not in change
        and change.get(prefix + "_mode") in ("Weekly", "Monthly")
        and change.get(prefix + "_package") not in (None, "__custom__")
    }
    prices = {}
    if missing:
        durations = frappe.get_all(
            "Inpatient Package Duration",
            filters={
                "parent": ["in", list(missing)],
                "parenttype": "Inpatient Package",
                "parentfield": "duration_pricing",
            },
            fields=["parent", "from_day", "to_day", "amount"],
        )
        for row in durations:
            if int(row.from_day or 0) == 1 and int(row.to_day or 0) in (7, 30):
                prices.setdefault((row.parent, int(row.to_day)), []).append(
                    float(row.amount)
                )
    for change in changes:
        for prefix in ("previous", "new"):
            key = prefix + "_package_price"
            if key in change:
                continue
            mode = change.get(prefix + "_mode")
            if mode == "Daily":
                change[key] = change.get(prefix + "_rate")
            else:
                values = prices.get(
                    (
                        change.get(prefix + "_package"),
                        {"Weekly": 7, "Monthly": 30}.get(mode),
                    ),
                    [],
                )
                change[key] = values[0] if len(values) == 1 else None
                change[prefix + "_price_from_current_config"] = change[key] is not None
    return changes
