
import frappe
from frappe.utils import cint, flt

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

	if context is None:
		if getattr(doc, "custom_inpatient_admission", None):
			context = "inpatient"
		else:
			context = "outpatient"

	return patient, context


def _get_inclusive_item_map(insurance_doc) -> dict:
	return {
		row.item_code: row
		for row in getattr(insurance_doc, "inclusive_item", [])
		if getattr(row, "item_code", None)
	}


def _get_discount_percentage_for_item(
	*,
	insurance_doc,
	item_code: str,
	context: str,
	base_discount: float,
	inclusive_map: dict,
) -> float | None:
	"""Return discount % to apply, or None when the item must stay at full price."""
	row_override = inclusive_map.get(item_code)
	if row_override:
		if not cint(getattr(row_override, "discount_apply", 0)):
			return None
		discount_to_apply = base_discount
		if context == "outpatient" and getattr(row_override, "outpatient_discount", None) is not None:
			discount_to_apply = row_override.outpatient_discount or base_discount
		elif context == "inpatient" and getattr(row_override, "inpatient_discount", None) is not None:
			discount_to_apply = row_override.inpatient_discount or base_discount
		return flt(discount_to_apply)

	return flt(base_discount)


def _apply_line_discount(item, discount_percentage: float):
	item.discount_percentage = discount_percentage
	price_list_rate = flt(getattr(item, "price_list_rate", 0)) or flt(getattr(item, "rate", 0))
	if price_list_rate:
		item.rate = price_list_rate * (1 - discount_percentage / 100)
	else:
		item.rate = flt(getattr(item, "rate", 0))
	item.amount = flt(item.rate) * flt(item.qty or 1)
	item.net_rate = item.rate
	item.net_amount = item.amount
	item.ignore_pricing_rule = 1


def _clear_line_discount(item):
	item.discount_percentage = 0
	item.discount_amount = 0
	price_list_rate = flt(getattr(item, "price_list_rate", 0)) or flt(getattr(item, "rate", 0))
	if price_list_rate:
		item.rate = price_list_rate
	item.amount = flt(item.rate) * flt(item.qty or 1)
	item.net_rate = item.rate
	item.net_amount = item.amount
	item.ignore_pricing_rule = 1


def apply_insurance_discounts(doc):
	"""
	Apply Health Insurance discounts per item on Sales Order / Quotation / Sales Invoice.

	Rules:
	- Only if Patient has `is_insurance` checked and `insurance` (Health Insurance) set.
	- Use outpatient_discount for outpatient context, inpatient_discount for inpatient.
	- Items in exclusive_item / exclusive_item_group never receive a discount.
	- Items in inclusive_item with Discount Apply unchecked never receive a discount.
	- Other items receive the plan discount (with optional per-row % override).
	"""

	if doc.doctype not in SUPPORTED_DOCTYPES:
		return

	patient, context = _resolve_patient_and_context(doc)
	if not patient:
		return

	patient_doc = frappe.get_doc("Patient", patient)
	if not getattr(patient_doc, "is_insurance", 0) or not getattr(patient_doc, "insurance", None):
		return

	insurance_register = getattr(patient_doc, "insurance_register", None)
	if insurance_register:
		ipr_status = frappe.db.get_value("Insurance Patient Register", insurance_register, "status")
		if ipr_status != "Active":
			return

	insurance_doc = frappe.get_doc("Health Insurance", patient_doc.insurance)
	base_discount = (
		insurance_doc.outpatient_discount or 0
		if context == "outpatient"
		else insurance_doc.inpatient_discount or 0
	)
	if not base_discount:
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

	inclusive_map = _get_inclusive_item_map(insurance_doc)

	for item in getattr(doc, "items", []):
		item_code = getattr(item, "item_code", None)
		if not item_code:
			continue

		if item_code in exclusive_items:
			continue

		if exclusive_groups and get_item_group(item_code) in exclusive_groups:
			continue

		inclusive_row = inclusive_map.get(item_code)
		if inclusive_row and not cint(getattr(inclusive_row, "discount_apply", 0)):
			_clear_line_discount(item)
			continue

		discount_to_apply = _get_discount_percentage_for_item(
			insurance_doc=insurance_doc,
			item_code=item_code,
			context=context,
			base_discount=base_discount,
			inclusive_map=inclusive_map,
		)
		if not discount_to_apply:
			continue

		_apply_line_discount(item, discount_to_apply)


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
