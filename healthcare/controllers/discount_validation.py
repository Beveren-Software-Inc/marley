import frappe
from frappe.utils import cint, flt

from healthcare.controllers.insurance_pricing import (
	apply_discount,
	find_inclusive_row,
	get_inclusive_discount_pct,
	get_inclusive_price,
	get_patient_insurance,
)

SUPPORTED_DOCTYPES = ("Sales Order", "Quotation", "Sales Invoice")


def _resolve_patient_and_context(doc):
	patient = None
	context = None

	if hasattr(doc, "patient") and getattr(doc, "patient", None):
		patient = doc.patient

	ref_doctype = getattr(doc, "custom_reference_type", None)
	ref_name = getattr(doc, "custom_reference_name", None)
	if ref_doctype and ref_name:
		if ref_doctype == "Service Request":
			sr = frappe.get_doc("Service Request", ref_name)
			patient = patient or sr.patient
			if getattr(sr, "inpatient_record", None):
				context = "inpatient"
			elif getattr(sr, "patient_visit", None):
				context = "outpatient"
		elif ref_doctype == "Inpatient Admission":
			admission = frappe.get_doc("Inpatient Admission", ref_name)
			patient = patient or admission.patient
			context = "inpatient"
		elif ref_doctype == "Patient Visit":
			visit = frappe.get_doc("Patient Visit", ref_name)
			patient = patient or visit.patient
			context = "outpatient"
		elif ref_doctype == "Session Schedule":
			schedule = frappe.get_doc("Session Schedule", ref_name)
			patient = patient or schedule.patient
			if getattr(schedule, "admission_number", None):
				context = "inpatient"
			else:
				context = "outpatient"

	base_ref = getattr(doc, "custom_base_reference", None)
	base_name = getattr(doc, "custom_base_reference_name", None)
	if base_ref and base_name and context is None:
		if base_ref == "Inpatient Admission":
			admission = frappe.get_doc("Inpatient Admission", base_name)
			patient = patient or admission.patient
			context = "inpatient"
		elif base_ref == "Patient Visit":
			visit = frappe.get_doc("Patient Visit", base_name)
			patient = patient or visit.patient
			context = "outpatient"
		elif base_ref == "Session Schedule":
			schedule = frappe.get_doc("Session Schedule", base_name)
			patient = patient or schedule.patient
			context = "inpatient" if getattr(schedule, "admission_number", None) else "outpatient"

	if context is None:
		if getattr(doc, "custom_inpatient_admission", None):
			context = "inpatient"
		else:
			context = "outpatient"

	return patient, context


def _apply_line_discount(item, discount_percentage: float, price_list_rate: float | None = None):
	"""Set list in price_list_rate and insurance % in discount_percentage (never bake net into list)."""
	existing_list = flt(getattr(item, "price_list_rate", 0))
	existing_pct = flt(getattr(item, "discount_percentage", 0))
	existing_rate = flt(getattr(item, "rate", 0))

	base = flt(price_list_rate)
	if base <= 0:
		if existing_list > 0:
			base = existing_list
		elif existing_pct > 0 and existing_pct < 100 and existing_rate > 0:
			base = flt(existing_rate / (1 - existing_pct / 100))
		else:
			base = existing_rate

	item.discount_percentage = discount_percentage
	item.discount_amount = 0
	# Clear margins so ERPNext cannot turn a discount into rate > price_list_rate.
	if hasattr(item, "margin_type"):
		item.margin_type = ""
	if hasattr(item, "margin_rate_or_amount"):
		item.margin_rate_or_amount = 0
	if hasattr(item, "rate_with_margin"):
		item.rate_with_margin = 0
	if base > 0:
		item.price_list_rate = base
		item.rate = apply_discount(base, discount_percentage)
	else:
		item.rate = existing_rate
	item.amount = flt(item.rate) * flt(item.qty or 1)
	item.net_rate = item.rate
	item.net_amount = item.amount
	item.ignore_pricing_rule = 1


def _clear_line_discount(item, price_list_rate: float | None = None):
	item.discount_percentage = 0
	item.discount_amount = 0
	if hasattr(item, "margin_type"):
		item.margin_type = ""
	if hasattr(item, "margin_rate_or_amount"):
		item.margin_rate_or_amount = 0
	if hasattr(item, "rate_with_margin"):
		item.rate_with_margin = 0
	base = flt(price_list_rate)
	if base <= 0:
		base = flt(getattr(item, "price_list_rate", 0)) or flt(getattr(item, "rate", 0))
	if base > 0:
		item.price_list_rate = base
		item.rate = base
	item.amount = flt(item.rate) * flt(item.qty or 1)
	item.net_rate = item.rate
	item.net_amount = item.amount
	item.ignore_pricing_rule = 1


def apply_insurance_discounts(doc):
	"""
	Apply Health Insurance discounts per item on Sales Order / Quotation / Sales Invoice.

	Rules:
	- Only if Patient has Active insurance (is_insurance + Health Insurance).
	- Patient Visit / OP → outpatient_discount; Inpatient → inpatient_discount.
	- Inclusive Item Detail.price is used as the base rate when set.
	- 0% discount means no discount (full insurance/template price).
	- Exclusive items / groups never receive a discount.
	- Inclusive rows with Discount Apply unchecked never receive a discount.
	"""

	if doc.doctype not in SUPPORTED_DOCTYPES:
		return

	patient, context = _resolve_patient_and_context(doc)
	if not patient:
		return

	_patient_doc, insurance_doc = get_patient_insurance(patient)
	if not insurance_doc:
		return

	exclusive_items = {
		row.item_code
		for row in getattr(insurance_doc, "exclusive_item", [])
		if getattr(row, "item_code", None)
	}
	exclusive_groups = {
		row.item_group
		for row in getattr(insurance_doc, "exclusive_item_group", [])
		if getattr(row, "item_group", None)
	}

	item_group_cache: dict[str, str] = {}

	def get_item_group(item_code: str) -> str:
		if item_code not in item_group_cache:
			item_group_cache[item_code] = frappe.db.get_value("Item", item_code, "item_group") or ""
		return item_group_cache[item_code]

	for item in getattr(doc, "items", []):
		item_code = getattr(item, "item_code", None)
		if not item_code:
			continue

		if item_code in exclusive_items:
			continue

		if exclusive_groups and get_item_group(item_code) in exclusive_groups:
			continue

		inclusive_row = find_inclusive_row(insurance_doc, item_code=item_code)
		insurance_price = get_inclusive_price(inclusive_row)

		if inclusive_row and not cint(getattr(inclusive_row, "discount_apply", 0)):
			_clear_line_discount(item, insurance_price)
			continue

		discount_to_apply = get_inclusive_discount_pct(insurance_doc, inclusive_row, context)
		if flt(discount_to_apply) <= 0:
			# Still prefer insurance price as the billed rate when configured.
			if insurance_price is not None:
				_clear_line_discount(item, insurance_price)
			continue

		_apply_line_discount(item, discount_to_apply, insurance_price)


def validate_discount(doc, method):
	apply_insurance_discounts(doc)

	if doc.doctype in SUPPORTED_DOCTYPES:
		try:
			doc.run_method("calculate_taxes_and_totals")
		except Exception:
			frappe.log_error(
				title="Failed to recalculate taxes/totals after insurance discount",
				message=frappe.get_traceback(),
			)

	discount_limit = frappe.db.get_single_value("Healthcare Settings", "discount_limit")
	if not discount_limit:
		return

	if doc.additional_discount_percentage and doc.additional_discount_percentage > discount_limit:
		frappe.throw(
			f"Discount cannot exceed {discount_limit}%. "
			f"You entered {doc.additional_discount_percentage}%."
		)
