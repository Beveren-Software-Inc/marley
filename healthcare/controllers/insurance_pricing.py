"""Shared TRICARE / Health Insurance pricing helpers.

- Inclusive Item Detail.price overrides template rate when set
- Patient Visit / OP context → outpatient_discount
- Inpatient Admission / IP context → inpatient_discount
- 0% discount means no discount calculation
- Category multiplier skipped for insured patients when Healthcare Settings
  Apply Multiplier on Insurance is unticked
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe.utils import cint, flt


def care_type_to_context(patient_care_type: str | None) -> str:
	"""OP / outpatient → outpatient; IP / inpatient → inpatient."""
	text = (patient_care_type or "").strip().upper()
	if text in ("IP", "INPATIENT", "IOP"):
		# IOP sessions bill like outpatient clinically but use IP rates when linked to admission;
		# caller should pass OP/IP explicitly. Treat bare IOP as outpatient.
		if text == "IOP":
			return "outpatient"
		return "inpatient"
	return "outpatient"


def get_patient_insurance(patient: str | None) -> tuple[Any | None, Any | None]:
	"""Return (patient_doc, health_insurance_doc) when patient is actively insured."""
	if not patient or not frappe.db.exists("Patient", patient):
		return None, None

	patient_doc = frappe.get_cached_doc("Patient", patient)
	if not cint(getattr(patient_doc, "is_insurance", 0)) or not getattr(patient_doc, "insurance", None):
		return patient_doc, None

	register = getattr(patient_doc, "insurance_register", None)
	if register:
		status = frappe.db.get_value("Insurance Patient Register", register, "status")
		if status and status != "Active":
			return patient_doc, None

	if not frappe.db.exists("Health Insurance", patient_doc.insurance):
		return patient_doc, None

	return patient_doc, frappe.get_cached_doc("Health Insurance", patient_doc.insurance)


def should_apply_category_multiplier(patient: str | None) -> bool:
	"""Non-insurance patients always get multiplier; insurance only when setting is on."""
	if not patient:
		return True
	_patient_doc, insurance_doc = get_patient_insurance(patient)
	if not insurance_doc:
		return True
	return bool(
		cint(frappe.db.get_single_value("Healthcare Settings", "apply_multiplier_on_insurance") or 0)
	)


def find_inclusive_row(
	insurance_doc,
	*,
	item_code: str | None = None,
	lab_test_template: str | None = None,
	healthcare_service: str | None = None,
	service_type: str | None = None,
):
	"""Match Insurance Item Detail by item, lab template, or healthcare service."""
	if not insurance_doc:
		return None

	item_code = (item_code or "").strip() or None
	lab_test_template = (lab_test_template or "").strip() or None
	healthcare_service = (healthcare_service or "").strip() or None
	service_type = (service_type or "").strip().upper() or None

	rows = list(getattr(insurance_doc, "inclusive_item", []) or [])

	def _stype_ok(row) -> bool:
		if not service_type:
			return True
		row_type = (getattr(row, "service_type", None) or "").strip().upper()
		return not row_type or row_type == service_type

	if item_code:
		for row in rows:
			if getattr(row, "item_code", None) == item_code and _stype_ok(row):
				return row
	if lab_test_template:
		for row in rows:
			if getattr(row, "lab_test_template", None) == lab_test_template and _stype_ok(row):
				return row
	if healthcare_service:
		for row in rows:
			if getattr(row, "healthcare_service", None) == healthcare_service and _stype_ok(row):
				return row
	return None


def resolve_item_code_for_template(template_dt: str | None, template_dn: str | None) -> str | None:
	if not template_dt or not template_dn or not frappe.db.exists(template_dt, template_dn):
		return None
	if template_dt == "Lab Test Template":
		return frappe.db.get_value("Lab Test Template", template_dn, "item") or None
	if template_dt == "Healthcare Service Template":
		return frappe.db.get_value("Healthcare Service Template", template_dn, "item_code") or None
	return None


def get_inclusive_discount_pct(insurance_doc, inclusive_row, context: str) -> float:
	"""Discount % for OP/IP context. 0 means no discount."""
	if not insurance_doc:
		return 0.0

	plan_base = (
		flt(getattr(insurance_doc, "outpatient_discount", 0) or 0)
		if context == "outpatient"
		else flt(getattr(insurance_doc, "inpatient_discount", 0) or 0)
	)

	if inclusive_row:
		if not cint(getattr(inclusive_row, "discount_apply", 0)):
			return 0.0
		if context == "outpatient":
			value = getattr(inclusive_row, "outpatient_discount", None)
		else:
			value = getattr(inclusive_row, "inpatient_discount", None)
		# Explicit 0 (or blank) on the row → no discount; do not fall back to plan %
		if value in (None, ""):
			return 0.0
		return flt(value)

	# Not in inclusive table — use plan %.
	return flt(plan_base)


def get_inclusive_price(inclusive_row) -> float | None:
	if not inclusive_row:
		return None
	price = flt(getattr(inclusive_row, "price", 0) or 0)
	return price if price > 0 else None


def apply_discount(amount: float, discount_pct: float) -> float:
	amount = flt(amount)
	discount_pct = flt(discount_pct)
	if amount <= 0 or discount_pct <= 0:
		return amount
	return flt(amount * (1 - discount_pct / 100))


def resolve_charge(
	*,
	patient: str | None,
	base_rate: float,
	patient_care_type: str | None = None,
	context: str | None = None,
	item_code: str | None = None,
	template_dt: str | None = None,
	template_dn: str | None = None,
	service_type: str | None = None,
	multiplier: float | None = None,
) -> dict:
	"""Resolve final charge for a template/item for a patient.

	Returns keys: base_rate, multiplier, rate_before_discount, discount_pct,
	rate, context, insurance, used_insurance_price
	"""
	ctx = context or care_type_to_context(patient_care_type)
	base = flt(base_rate)
	used_insurance_price = False

	_patient_doc, insurance_doc = get_patient_insurance(patient)

	if not item_code and template_dt and template_dn:
		item_code = resolve_item_code_for_template(template_dt, template_dn)

	lab_tpl = template_dn if template_dt == "Lab Test Template" else None
	svc_tpl = template_dn if template_dt == "Healthcare Service Template" else None

	inclusive = find_inclusive_row(
		insurance_doc,
		item_code=item_code,
		lab_test_template=lab_tpl,
		healthcare_service=svc_tpl,
		service_type=service_type,
	)

	insurance_price = get_inclusive_price(inclusive)
	if insurance_price is not None:
		base = insurance_price
		used_insurance_price = True

	if multiplier is None:
		if should_apply_category_multiplier(patient):
			mult, _ = get_category_multiplier(patient) if patient else (1.0, None)
			multiplier = mult
		else:
			multiplier = 1.0

	multiplier = flt(multiplier) if flt(multiplier) > 0 else 1.0
	rate_before = flt(base) * multiplier
	discount_pct = get_inclusive_discount_pct(insurance_doc, inclusive, ctx) if insurance_doc else 0.0
	rate = apply_discount(rate_before, discount_pct)

	return {
		"base_rate": base,
		"multiplier": multiplier,
		"rate_before_discount": rate_before,
		"discount_pct": discount_pct,
		"discount_amount": max(0.0, flt(rate_before) - flt(rate)),
		"rate": rate,
		"context": ctx,
		"insurance": insurance_doc.name if insurance_doc else None,
		"used_insurance_price": used_insurance_price,
		"inclusive_row": inclusive.name if inclusive and getattr(inclusive, "name", None) else None,
	}


def charge_list_and_discount(charged: dict) -> dict:
	"""Split resolve_charge into list (pre-discount) + insurance discount parts for persistence."""
	list_rate = flt(charged.get("rate_before_discount"))
	net_rate = flt(charged.get("rate"))
	pct = flt(charged.get("discount_pct"))
	discount_amount = flt(charged.get("discount_amount"))
	if discount_amount <= 0 and list_rate > net_rate:
		discount_amount = max(0.0, list_rate - net_rate)
	return {
		"list_rate": list_rate,
		"net_rate": net_rate,
		"discount_pct": pct,
		"discount_amount": discount_amount,
		"insurance": charged.get("insurance"),
		"used_insurance_price": charged.get("used_insurance_price"),
		"multiplier": charged.get("multiplier"),
		"base_rate": charged.get("base_rate"),
		"context": charged.get("context"),
	}


def sales_item_from_list_and_discount(
	*,
	item_code: str,
	list_rate: float,
	discount_pct: float = 0,
	discount_amount: float = 0,
	net_rate: float | None = None,
	qty: float = 1,
	**extra,
) -> dict:
	"""Build a Sales Order / Invoice item with list in price_list_rate and discount tracked."""
	list_rate = flt(list_rate)
	qty = flt(qty) or 1
	pct = flt(discount_pct)
	amt = flt(discount_amount)
	item = {
		"item_code": item_code,
		"qty": qty,
		"price_list_rate": list_rate,
		"ignore_pricing_rule": 1,
		**extra,
	}
	if pct > 0:
		item["discount_percentage"] = pct
		item["discount_amount"] = 0
		item["rate"] = apply_discount(list_rate, pct)
	elif amt > 0:
		item["discount_percentage"] = 0
		item["discount_amount"] = min(list_rate, amt) if list_rate > 0 else amt
		item["rate"] = max(0.0, list_rate - flt(item["discount_amount"]))
	elif net_rate is not None:
		item["rate"] = flt(net_rate)
		if list_rate > 0 and flt(net_rate) < list_rate:
			item["discount_amount"] = max(0.0, list_rate - flt(net_rate))
	else:
		item["rate"] = list_rate
	return item


def get_category_multiplier(patient_name: str | None) -> tuple[float, str | None]:
	"""Patient category multiplier from Healthcare Settings (ungated)."""
	if not patient_name:
		return 1.0, None
	category = frappe.db.get_value("Patient", patient_name, "category")
	if not category:
		return 1.0, None
	settings = frappe.get_cached_doc("Healthcare Settings")
	for row in settings.get("patient_category_pricing") or []:
		if getattr(row, "patient_category", None) == category:
			multiplier = flt(getattr(row, "multiplier", None) or 0)
			if multiplier > 0:
				return multiplier, category
	return 1.0, category


def get_effective_category_multiplier(patient_name: str | None) -> tuple[float, str | None]:
	"""Category multiplier honoring Apply Multiplier on Insurance."""
	mult, category = get_category_multiplier(patient_name)
	if not should_apply_category_multiplier(patient_name):
		return 1.0, category
	return mult, category
