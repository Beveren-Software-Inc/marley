"""Charge inpatient package days up to today (Statement of Account).

Uses the **existing** admission package Quotation and creates a **partial**
Sales Order for unbilled days (qty = days to charge). Does not create a new
Quotation.
"""

from __future__ import annotations

import re
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, today

from healthcare.api.inpatient_package import calculate_package_price


def _require_billing_user() -> None:
	roles = set(frappe.get_roles())
	if not roles.intersection(
		{
			"System Manager",
			"Healthcare Administrator",
			"Accounts User",
			"Accounts Manager",
			"Healthcare Receptionist",
			"Sales User",
			"Sales Manager",
		}
	):
		frappe.throw(_("Not permitted to charge package days."), frappe.PermissionError)


def _admission_start_date(admission) -> Any:
	for field in ("admission_date", "scheduled_date", "admitted_datetime"):
		val = admission.get(field)
		if val:
			return getdate(val)
	return None


def _package_days_elapsed(admission, as_of=None) -> int:
	start = _admission_start_date(admission)
	if not start:
		frappe.throw(_("Admission has no start date — cannot calculate package days."))
	end = getdate(as_of or today())
	if admission.get("discharge_datetime"):
		discharge = getdate(admission.discharge_datetime)
		if discharge and discharge < end:
			end = discharge
	# Match Statement of Account: max((end - start).days, 1)
	return max((end - start).days, 1)


def _days_from_unledgered_quotations(admission_name: str, package_name: str | None = None) -> int:
	"""Days ordered from package quotations that were never written to Package Detail.

	Does **not** treat an open admission Quotation (no Sales Order yet) as billed —
	only ordered qty / linked Sales Orders count.
	"""
	filters: dict[str, Any] = {
		"custom_inpatient_admission": admission_name,
		"docstatus": 1,
		"custom_package": ["is", "set"],
	}
	if package_name:
		filters["custom_package"] = package_name

	quotes = frappe.get_all("Quotation", filters=filters, pluck="name")
	if not quotes:
		return 0

	ledgered: set[str] = set()
	if frappe.db.has_column("Package Detail", "quotation"):
		ledgered = set(
			frappe.get_all(
				"Package Detail",
				filters={"admission_no": admission_name, "quotation": ["in", quotes]},
				pluck="quotation",
			)
		)

	total = 0
	for qname in quotes:
		if qname in ledgered:
			continue
		quotation = frappe.get_doc("Quotation", qname)
		ordered = _package_line_ordered_qty(quotation)
		if ordered > 0:
			total += ordered
			continue
		# Legacy mid-stay quote that created an SO but ordered_qty was not updated
		has_so = frappe.db.exists(
			"Sales Order Item",
			{"prevdoc_docname": qname, "docstatus": ["<", 2]},
		)
		if has_so:
			days = parse_package_days_from_quotation(quotation)
			if days <= 0 and package_name:
				days = cint(frappe.db.get_value("Inpatient Package", package_name, "no_of_days") or 0)
			total += max(days, 0)
	return total


def _package_line_ordered_qty(quotation) -> int:
	"""Days already ordered from the package Quotation line (via Sales Orders)."""
	row = _package_line_from_quotation(quotation)
	if not row:
		return 0
	return cint(getattr(row, "ordered_qty", None) or row.get("ordered_qty") or 0)


def _days_already_billed(admission_name: str, package_name: str | None = None) -> int:
	details = frappe.get_all(
		"Package Detail",
		filters={"admission_no": admission_name},
		fields=["total_days"],
	)
	detail_sum = sum(cint(d.total_days or 0) for d in details)
	unledgered = _days_from_unledgered_quotations(admission_name, package_name)

	ordered = 0
	q = _find_admission_package_quotation(admission_name, package_name, allow_draft=False)
	if q:
		ordered = _package_line_ordered_qty(q)

	total = max(detail_sum, unledgered, ordered)
	if frappe.db.has_column("Inpatient Admission", "package_days_billed"):
		billed = cint(
			frappe.db.get_value("Inpatient Admission", admission_name, "package_days_billed") or 0
		)
		return max(billed, total)
	return total


def _resolve_package_name(admission) -> str:
	package = (admission.get("inpatient_package") or "").strip()
	if package and frappe.db.exists("Inpatient Package", package):
		return package

	row = frappe.db.get_value(
		"Quotation",
		{
			"custom_inpatient_admission": admission.name,
			"docstatus": ["<", 2],
			"custom_package": ["is", "set"],
		},
		["custom_package"],
		order_by="creation desc",
		as_dict=True,
	)
	if row and row.custom_package:
		return row.custom_package

	frappe.throw(
		_("No inpatient package is linked to admission {0}. Set Inpatient Package first.").format(
			admission.name
		)
	)


def _find_admission_package_quotation(
	admission_name: str,
	package_name: str | None = None,
	*,
	allow_draft: bool = True,
):
	"""Return the existing admission package Quotation (submitted preferred)."""
	filters: dict[str, Any] = {
		"custom_inpatient_admission": admission_name,
		"custom_package": ["is", "set"],
		"docstatus": ["<", 2] if allow_draft else 1,
	}
	if package_name:
		filters["custom_package"] = package_name

	names = frappe.get_all(
		"Quotation",
		filters=filters,
		fields=["name", "docstatus"],
		order_by="docstatus desc, creation asc",
		limit_page_length=20,
	)
	if not names:
		return None
	# Prefer submitted
	for row in names:
		if cint(row.docstatus) == 1:
			return frappe.get_doc("Quotation", row.name)
	return frappe.get_doc("Quotation", names[0].name) if allow_draft else None


def _amount_per_day(admission, package_name: str, service_unit: str | None = None) -> float:
	"""Daily rate from package / admission — room multipliers are not applied."""
	rate = flt(admission.get("rate_per_day") or 0)
	if rate > 0:
		return rate

	pricing = calculate_package_price(
		package_name,
		1,
		service_unit=service_unit,
		service_unit_type=admission.get("admission_service_unit_type"),
		room_multiplier=1,
	)
	per_day = flt(pricing.get("program_price") or pricing.get("total_price") or 0)
	if per_day > 0:
		return per_day

	package = frappe.get_doc("Inpatient Package", package_name)
	base_total = flt(getattr(package, "base_total", 0) or 0)
	program_days = cint(getattr(package, "no_of_days", 0) or 0)
	if base_total and program_days:
		return base_total / program_days
	return flt(package.package_rate or 0)


def _charge_window(admission, package, as_of=None) -> dict:
	from healthcare.api.inpatient_admission import _resolve_quotation_service_unit

	package_name = package.name
	service_unit = _resolve_quotation_service_unit(admission.name)
	program_days = cint(getattr(package, "no_of_days", 0) or 0)
	elapsed = _package_days_elapsed(admission, as_of=as_of)
	already = _days_already_billed(admission.name, package_name)

	quotation = _find_admission_package_quotation(admission.name, package_name, allow_draft=True)
	quot_days = parse_package_days_from_quotation(quotation) if quotation else 0
	ordered = _package_line_ordered_qty(quotation) if quotation else 0
	remaining_on_quote = max(quot_days - ordered, 0) if quot_days else None

	target_days = elapsed
	if program_days > 0:
		target_days = min(elapsed, program_days)

	days_to_charge = max(target_days - already, 0)
	# Cannot order more than remaining qty on the Quotation package line
	if remaining_on_quote is not None and quotation and cint(quotation.docstatus) == 1:
		days_to_charge = min(days_to_charge, remaining_on_quote)

	remaining_before = max(program_days - already, 0) if program_days else None
	remaining_after = (
		max(program_days - (already + days_to_charge), 0) if program_days else None
	)

	per_day = _amount_per_day(admission, package_name, service_unit=service_unit)
	# Prefer rate already on the Quotation package line
	if quotation:
		pline = _package_line_from_quotation(quotation)
		if pline and flt(pline.get("rate") or 0) > 0:
			per_day = flt(pline.get("rate"))

	amount = flt(per_day) * cint(days_to_charge)

	start = _admission_start_date(admission)
	from_date = None
	to_date = getdate(as_of or today())
	if start:
		from frappe.utils import add_days

		from_date = add_days(start, already) if already else start
		if from_date > to_date:
			from_date = to_date

	return {
		"admission": admission.name,
		"patient": admission.patient,
		"patient_name": admission.patient_name,
		"package": package_name,
		"package_name": package.package_name or package_name,
		"quotation": quotation.name if quotation else None,
		"quotation_status": (
			"Submitted"
			if quotation and cint(quotation.docstatus) == 1
			else ("Draft" if quotation else None)
		),
		"quotation_days": quot_days or None,
		"quotation_ordered_days": ordered or None,
		"program_days": program_days,
		"days_elapsed": elapsed,
		"days_already_billed": already,
		"days_to_charge": days_to_charge,
		"remaining_days_before": remaining_before,
		"remaining_days_after": remaining_after,
		"amount_per_day": per_day,
		"amount": amount,
		"from_date": str(from_date) if from_date else None,
		"to_date": str(to_date) if to_date else None,
		"service_unit": service_unit,
		"can_charge": days_to_charge > 0 and amount > 0 and bool(quotation),
	}


@frappe.whitelist()
def preview_package_charge_to_today(admission: str, as_of: str | None = None) -> dict:
	"""Preview unbilled package days from admission start through today (or as_of)."""
	_require_billing_user()
	if not admission or not frappe.db.exists("Inpatient Admission", admission):
		frappe.throw(_("Inpatient Admission not found"))

	adm = frappe.get_doc("Inpatient Admission", admission)
	package_name = _resolve_package_name(adm)
	package = frappe.get_doc("Inpatient Package", package_name)
	return _charge_window(adm, package, as_of=as_of)


@frappe.whitelist()
def charge_package_to_today(admission: str, as_of: str | None = None) -> dict:
	"""Create a **partial** Sales Order from the existing package Quotation.

	Does **not** create a new Quotation. Orders only the unbilled days up to today.
	"""
	_require_billing_user()
	if not admission or not frappe.db.exists("Inpatient Admission", admission):
		frappe.throw(_("Inpatient Admission not found"))

	adm = frappe.get_doc("Inpatient Admission", admission)
	if adm.status == "Cancelled":
		frappe.throw(_("Cannot charge package on a cancelled admission."))

	package_name = _resolve_package_name(adm)
	package = frappe.get_doc("Inpatient Package", package_name)
	preview = _charge_window(adm, package, as_of=as_of)

	quotation = _find_admission_package_quotation(admission, package_name, allow_draft=True)
	if not quotation:
		frappe.throw(
			_(
				"No package Quotation found for this admission. "
				"Create the admission package Quotation first, then charge days from it."
			)
		)

	if not preview.get("can_charge"):
		if cint(preview.get("days_to_charge") or 0) <= 0:
			frappe.throw(
				_(
					"No unbilled package days to charge. Elapsed: {0}, already billed: {1}, "
					"package length: {2}, quotation: {3}."
				).format(
					preview.get("days_elapsed"),
					preview.get("days_already_billed"),
					preview.get("program_days") or _("(open)"),
					quotation.name,
				)
			)
		frappe.throw(_("Charge amount must be greater than zero."))

	# Submit draft quotation without auto full-SO (we create a partial SO below)
	if cint(quotation.docstatus) == 0:
		frappe.flags.healthcare_skip_package_auto_so = True
		try:
			quotation.flags.ignore_permissions = True
			quotation.flags.ignore_mandatory = True
			quotation.submit()
		finally:
			frappe.flags.healthcare_skip_package_auto_so = False
		quotation.reload()

	days_to_charge = cint(preview["days_to_charge"])
	sales_order = _make_partial_package_sales_order(
		quotation,
		days_to_charge=days_to_charge,
		amount_per_day=flt(preview["amount_per_day"]),
		note=_(
			"Package charge to {0}: {1} day(s) @ {2} = {3} (partial from Quotation {4})."
		).format(
			preview.get("to_date"),
			days_to_charge,
			preview.get("amount_per_day"),
			preview.get("amount"),
			quotation.name,
		),
	)

	try:
		record_partial_package_charge(
			quotation=quotation,
			sales_order=sales_order,
			days=days_to_charge,
			amount=flt(preview["amount"]),
			amount_per_day=flt(preview["amount_per_day"]),
			from_date=preview.get("from_date"),
			to_date=preview.get("to_date"),
		)
	except Exception:
		frappe.log_error(title=f"Package charge ledger (SOA) failed: {quotation.name}")

	billed_after = _days_already_billed(admission, package_name)

	return {
		"ok": True,
		"quotation": quotation.name,
		"sales_order": sales_order,
		"days_charged": days_to_charge,
		"amount": preview["amount"],
		"amount_per_day": preview["amount_per_day"],
		"days_already_billed": billed_after,
		"remaining_days": (
			max(cint(preview.get("program_days") or 0) - billed_after, 0)
			if preview.get("program_days")
			else None
		),
		"from_date": preview.get("from_date"),
		"to_date": preview.get("to_date"),
		"message": _(
			"Charged {0} package day(s) for {1} via partial Sales Order {2} from Quotation {3}."
		).format(
			days_to_charge,
			flt(preview["amount"]),
			sales_order,
			quotation.name,
		),
	}


def _make_partial_package_sales_order(
	quotation,
	*,
	days_to_charge: int,
	amount_per_day: float,
	note: str | None = None,
) -> str:
	"""Map existing Quotation → Sales Order with only ``days_to_charge`` on the package line."""
	from erpnext.selling.doctype.quotation.quotation import _make_sales_order
	from healthcare.controllers.quotation import (
		_copy_quotation_fields_to_sales_order,
		_set_default_delivery_date,
	)

	package_row = _package_line_from_quotation(quotation)
	if not package_row:
		frappe.throw(_("Quotation {0} has no package line to charge.").format(quotation.name))

	remaining = flt(package_row.qty) - flt(getattr(package_row, "ordered_qty", 0) or 0)
	if remaining <= 0:
		frappe.throw(
			_("Quotation {0} has no remaining package days to order (all {1} already ordered).").format(
				quotation.name, cint(package_row.qty)
			)
		)
	if days_to_charge > remaining + 0.0001:
		frappe.throw(
			_("Cannot charge {0} days — only {1} remain on Quotation {2}.").format(
				days_to_charge, cint(remaining), quotation.name
			)
		)

	# Only map the package line (partial). Case-management lines stay on the Quotation
	# until ordered separately / on full convert.
	sales_order = _make_sales_order(
		quotation.name,
		ignore_permissions=True,
		args={"filtered_children": [package_row.name]},
	)
	if not sales_order.get("items"):
		frappe.throw(_("Could not map package line from Quotation {0} to Sales Order.").format(quotation.name))

	# Cap qty to days_to_charge (mapper would take full remaining balance)
	rate = flt(amount_per_day) or flt(package_row.rate) or 0
	for row in sales_order.items:
		row.qty = days_to_charge
		if rate > 0:
			row.rate = rate
			row.price_list_rate = rate
		row.amount = flt(row.rate) * flt(row.qty)
		row.description = (
			f"{package_row.description or package_row.item_name or 'Inpatient Package'} "
			f"— charged {days_to_charge} day(s) @ {rate}/day"
		).strip()

	_copy_quotation_fields_to_sales_order(quotation, sales_order)
	_set_default_delivery_date(sales_order)

	if note and sales_order.meta.has_field("custom_notes"):
		sales_order.custom_notes = note
	elif note and sales_order.meta.has_field("remarks"):
		sales_order.remarks = note

	sales_order.flags.ignore_permissions = True
	sales_order.flags.ignore_pricing_rule = True
	# Avoid Stock Settings "auto insert Item Price" noise / masked errors on portal charge
	frappe.flags.mute_messages = True
	try:
		sales_order.run_method("set_missing_values")
		sales_order.run_method("calculate_taxes_and_totals")
		sales_order.insert(ignore_permissions=True)
		sales_order.submit()
	finally:
		frappe.flags.mute_messages = False
		frappe.clear_messages()

	return sales_order.name


def parse_package_days_from_quotation(quotation) -> int:
	"""Days on the package line: prefer item qty (days × daily rate), else '(N days)' in description."""
	items = quotation.get("items") or []
	for row in items:
		text = str(row.get("description") or row.get("item_name") or "")
		lower = text.lower()
		is_package_line = (
			"inpatient package" in lower
			or "/day" in lower
			or bool(re.search(r"\(\d+\s*days?", text, flags=re.IGNORECASE))
		)
		if not is_package_line and len(items) > 1:
			continue
		match = re.search(r"\((\d+)\s*days?", text, flags=re.IGNORECASE)
		if match:
			return cint(match.group(1))
		qty = cint(row.get("qty") or 0)
		if qty > 0 and (is_package_line or len(items) == 1):
			return qty
	return 0


def _package_line_from_quotation(quotation) -> Any:
	items = quotation.get("items") or []
	for row in items:
		text = str(row.get("description") or row.get("item_name") or "").lower()
		if "inpatient package" in text or "/day" in text:
			return row
	return items[0] if len(items) == 1 else None


def record_partial_package_charge(
	quotation,
	sales_order,
	*,
	days: int,
	amount: float,
	amount_per_day: float,
	from_date=None,
	to_date=None,
) -> None:
	"""Ledger Package Detail for a partial SO charge (allows multiple rows per Quotation)."""
	admission = (getattr(quotation, "custom_inpatient_admission", None) or "").strip()
	package = (getattr(quotation, "custom_package", None) or "").strip()
	if not admission or not package or days <= 0:
		return
	if not frappe.db.exists("Inpatient Admission", admission):
		return

	so_name = sales_order if isinstance(sales_order, str) else getattr(sales_order, "name", None)
	if so_name and frappe.db.has_column("Package Detail", "sales_order"):
		if frappe.db.exists("Package Detail", {"sales_order": so_name}):
			_sync_admission_days_billed(admission)
			return

	adm = frappe.get_doc("Inpatient Admission", admission)
	start = _admission_start_date(adm) or getdate(quotation.transaction_date)
	from frappe.utils import add_days

	if from_date:
		fdate = getdate(from_date)
	else:
		already_before = max(_days_already_billed(admission, package) - days, 0)
		fdate = add_days(start, already_before) if already_before else start
	tdate = getdate(to_date) if to_date else add_days(fdate, max(days - 1, 0))

	per_day = flt(amount_per_day) or (flt(amount) / days if days else 0)
	detail = frappe.new_doc("Package Detail")
	detail.company = quotation.company or adm.company
	detail.admission_no = admission
	detail.file_number = adm.patient
	detail.from_date = fdate
	detail.to_date = tdate
	detail.total_days = days
	detail.transaction_amount = flt(amount)
	detail.currency = quotation.currency
	detail.vch_status = "Open"
	detail.remarks = _("Partial charge from Quotation {0} → Sales Order {1}").format(
		quotation.name, so_name or ""
	)
	if detail.meta.has_field("inpatient_package"):
		detail.inpatient_package = package
	if detail.meta.has_field("quotation"):
		detail.quotation = quotation.name
	if detail.meta.has_field("sales_order") and so_name:
		detail.sales_order = so_name
	if detail.meta.has_field("amount_per_day"):
		detail.amount_per_day = per_day
	detail.insert(ignore_permissions=True)
	_sync_admission_days_billed(admission)


def record_package_charge_from_quotation(quotation, sales_order=None) -> None:
	"""Ledger Package Detail after a (full) package Quotation → Sales Order.

	Used by the Quotation on_submit hook when auto-SO creates a full order.
	Partial mid-stay charges use ``record_partial_package_charge`` instead.
	"""
	admission = (getattr(quotation, "custom_inpatient_admission", None) or "").strip()
	package = (getattr(quotation, "custom_package", None) or "").strip()
	if not admission or not package:
		return
	if not frappe.db.exists("Inpatient Admission", admission):
		return

	days = parse_package_days_from_quotation(quotation)
	if days <= 0:
		days = cint(frappe.db.get_value("Inpatient Package", package, "no_of_days") or 0)
	if days <= 0:
		return

	# If this quotation already has any Package Detail (partial charges), don't
	# also ledger the full quotation amount — mid-stay flow owns the ledger.
	if frappe.db.has_column("Package Detail", "quotation") and frappe.db.exists(
		"Package Detail", {"quotation": quotation.name}
	):
		_sync_admission_days_billed(admission)
		return

	so_name = sales_order if isinstance(sales_order, str) else getattr(sales_order, "name", None)
	# Prefer SO qty when this is a mapped order
	so_days = days
	so_amount = None
	so_rate = None
	if so_name and frappe.db.exists("Sales Order", so_name):
		so_items = frappe.get_all(
			"Sales Order Item",
			filters={"parent": so_name},
			fields=["qty", "rate", "amount"],
			limit_page_length=5,
		)
		if so_items:
			so_days = cint(so_items[0].qty) or days
			so_amount = flt(so_items[0].amount)
			so_rate = flt(so_items[0].rate)

	package_line = _package_line_from_quotation(quotation)
	if so_amount is not None:
		amount = so_amount
		per_day = so_rate or (flt(amount) / so_days if so_days else 0)
		days = so_days
	elif package_line:
		amount = flt(package_line.get("amount") or 0)
		if amount <= 0:
			amount = flt(package_line.get("rate") or 0) * cint(package_line.get("qty") or days)
		per_day = flt(package_line.get("rate") or 0) or (flt(amount) / days if days else 0)
	else:
		amount = flt(quotation.grand_total or quotation.base_grand_total or 0)
		if amount <= 0:
			amount = sum(flt(r.amount) for r in (quotation.get("items") or []))
		per_day = flt(amount) / days if days else 0

	if so_name and frappe.db.has_column("Package Detail", "sales_order"):
		if frappe.db.exists("Package Detail", {"sales_order": so_name}):
			_sync_admission_days_billed(admission)
			return

	adm = frappe.get_doc("Inpatient Admission", admission)
	start = _admission_start_date(adm) or getdate(quotation.transaction_date)
	already_before = max(_days_already_billed(admission, package) - days, 0)
	from frappe.utils import add_days

	from_date = add_days(start, already_before) if already_before else start
	to_date = add_days(from_date, max(days - 1, 0))
	if not per_day:
		per_day = flt(amount) / days if days else 0

	detail = frappe.new_doc("Package Detail")
	detail.company = quotation.company or adm.company
	detail.admission_no = admission
	detail.file_number = adm.patient
	detail.from_date = from_date
	detail.to_date = to_date
	detail.total_days = days
	detail.transaction_amount = amount
	detail.currency = quotation.currency
	detail.vch_status = "Open"
	detail.remarks = _("From Quotation {0}").format(quotation.name)
	if detail.meta.has_field("inpatient_package"):
		detail.inpatient_package = package
	if detail.meta.has_field("quotation"):
		detail.quotation = quotation.name
	if detail.meta.has_field("sales_order") and so_name:
		detail.sales_order = so_name
	if detail.meta.has_field("amount_per_day"):
		detail.amount_per_day = per_day
	detail.insert(ignore_permissions=True)

	_sync_admission_days_billed(admission)


def _sync_admission_days_billed(admission_name: str) -> None:
	if not frappe.db.has_column("Inpatient Admission", "package_days_billed"):
		return
	total = (
		frappe.db.sql(
			"""
			SELECT COALESCE(SUM(total_days), 0)
			FROM `tabPackage Detail`
			WHERE admission_no = %s
			""",
			admission_name,
		)[0][0]
		or 0
	)
	frappe.db.set_value(
		"Inpatient Admission",
		admission_name,
		"package_days_billed",
		cint(total),
		update_modified=False,
	)
