"""Charge inpatient package days up to today (Statement of Account).

Creates a package Quotation for the unbilled days since admission (or since last
package charge), then submits it so the existing Quotation hook creates the Sales
Order and records Package Detail / package_days_billed.
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
	"""Days on submitted package quotations that were never written to Package Detail."""
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
		days = parse_package_days_from_quotation(quotation)
		if days <= 0 and package_name:
			days = cint(frappe.db.get_value("Inpatient Package", package_name, "no_of_days") or 0)
		total += max(days, 0)
	return total


def _days_already_billed(admission_name: str, package_name: str | None = None) -> int:
	details = frappe.get_all(
		"Package Detail",
		filters={"admission_no": admission_name},
		fields=["total_days"],
	)
	detail_sum = sum(cint(d.total_days or 0) for d in details)
	unledgered = _days_from_unledgered_quotations(admission_name, package_name)
	total = detail_sum + unledgered
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


def _amount_per_day(admission, package_name: str, service_unit: str | None = None) -> float:
	"""Daily rate from package / admission — room multipliers are not applied."""
	rate = flt(admission.get("rate_per_day") or 0)
	if rate > 0:
		return rate

	# Prefer program (package) price only — Service Unit Type selects Item, not rate
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

	# Cap at package length when package has a fixed program length
	target_days = elapsed
	if program_days > 0:
		target_days = min(elapsed, program_days)

	days_to_charge = max(target_days - already, 0)
	remaining_before = max(program_days - already, 0) if program_days else None
	remaining_after = (
		max(program_days - (already + days_to_charge), 0) if program_days else None
	)

	per_day = _amount_per_day(admission, package_name, service_unit=service_unit)
	amount = flt(per_day) * cint(days_to_charge)

	start = _admission_start_date(admission)
	from_date = None
	to_date = getdate(as_of or today())
	if start:
		# Next unbilled day ≈ start + already days (SOA uses day-diff, not inclusive count)
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
		"can_charge": days_to_charge > 0 and amount > 0,
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
	"""Create & submit package Quotation for unbilled days → Sales Order via hook."""
	_require_billing_user()
	if not admission or not frappe.db.exists("Inpatient Admission", admission):
		frappe.throw(_("Inpatient Admission not found"))

	adm = frappe.get_doc("Inpatient Admission", admission)
	if adm.status in ("Cancelled", "Discharged"):
		# Allow Discharged so they can still settle remaining package days if needed
		if adm.status == "Cancelled":
			frappe.throw(_("Cannot charge package on a cancelled admission."))

	package_name = _resolve_package_name(adm)
	package = frappe.get_doc("Inpatient Package", package_name)
	preview = _charge_window(adm, package, as_of=as_of)

	if not preview.get("can_charge"):
		if cint(preview.get("days_to_charge") or 0) <= 0:
			frappe.throw(
				_(
					"No unbilled package days to charge. Elapsed: {0}, already billed: {1}, package length: {2}."
				).format(
					preview.get("days_elapsed"),
					preview.get("days_already_billed"),
					preview.get("program_days") or _("(open)"),
				)
			)
		frappe.throw(_("Charge amount must be greater than zero."))

	from healthcare.api.inpatient_admission import create_admission_quotation

	result = create_admission_quotation(
		admission_name=admission,
		package_name=package_name,
		days=cint(preview["days_to_charge"]),
		total_amount=flt(preview["amount"]),
		service_unit=preview.get("service_unit"),
	)
	quotation_name = result.get("quotation_name")
	if not quotation_name:
		frappe.throw(_("Quotation was not created."))

	quotation = frappe.get_doc("Quotation", quotation_name)
	# Stamp charge window on remarks for audit (Package Detail filled on submit)
	note = _(
		"Package charge to {0}: {1} day(s) @ {2} = {3}. Remaining after: {4}."
	).format(
		preview.get("to_date"),
		preview.get("days_to_charge"),
		preview.get("amount_per_day"),
		preview.get("amount"),
		preview.get("remaining_days_after"),
	)
	if quotation.meta.has_field("terms"):
		quotation.terms = ((quotation.terms or "") + "\n" + note).strip()
	quotation.flags.ignore_permissions = True
	quotation.flags.ignore_mandatory = True
	quotation.save(ignore_permissions=True)
	quotation.submit()

	sales_order = frappe.db.get_value(
		"Sales Order Item",
		{"prevdoc_docname": quotation_name, "docstatus": ["<", 2]},
		"parent",
	)

	# Ensure ledger even if the Quotation on_submit hook failed to write Package Detail
	try:
		record_package_charge_from_quotation(quotation, sales_order)
	except Exception:
		frappe.log_error(title=f"Package charge ledger (SOA) failed: {quotation_name}")

	# Refresh billed days after hook
	billed_after = _days_already_billed(admission, package_name)

	return {
		"ok": True,
		"quotation": quotation_name,
		"sales_order": sales_order,
		"days_charged": preview["days_to_charge"],
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
			"Charged {0} package day(s) for {1}. Quotation {2} submitted; Sales Order {3}."
		).format(
			preview["days_to_charge"],
			flt(preview["amount"]),
			quotation_name,
			sales_order or _("(pending)"),
		),
	}


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


def record_package_charge_from_quotation(quotation, sales_order=None) -> None:
	"""Ledger Package Detail + bump admission.package_days_billed after SO is created."""
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

	package_line = _package_line_from_quotation(quotation)
	if package_line:
		amount = flt(package_line.get("amount") or 0)
		if amount <= 0:
			amount = flt(package_line.get("rate") or 0) * cint(package_line.get("qty") or days)
		per_day = flt(package_line.get("rate") or 0) or (flt(amount) / days if days else 0)
	else:
		amount = flt(quotation.grand_total or quotation.base_grand_total or 0)
		if amount <= 0:
			amount = sum(flt(r.amount) for r in (quotation.get("items") or []))
		per_day = flt(amount) / days if days else 0

	# Avoid duplicate Package Detail for the same quotation
	if frappe.db.has_column("Package Detail", "quotation") and frappe.db.exists(
		"Package Detail", {"quotation": quotation.name}
	):
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
	if detail.meta.has_field("sales_order") and sales_order:
		detail.sales_order = sales_order if isinstance(sales_order, str) else sales_order.name
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
