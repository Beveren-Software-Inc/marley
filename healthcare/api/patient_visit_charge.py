"""Patient Visit registration charge: Sales Order on new Patient Visit creation."""

from __future__ import annotations

from collections import Counter

import frappe
from frappe import _
from frappe.utils import cint, flt, nowdate

from healthcare.api.patient_file_no_charge import _ensure_patient_customer
from healthcare.api.sales_order_cost_center import apply_cost_center_to_sales_order
from healthcare.healthcare.doctype.healthcare_service_template.healthcare_service_template import (
	get_healthcare_service_template_rate,
)


def _template_to_config(
	template_name: str | None,
	patient_care_type: str | None = "OP",
	patient: str | None = None,
) -> dict:
	template_name = (template_name or "").strip()
	if not template_name:
		return {
			"configured": False,
			"template": None,
			"service_name": None,
			"item_code": None,
			"item_name": None,
			"rate": 0,
			"source": None,
		}

	if not frappe.db.exists("Healthcare Service Template", template_name):
		return {
			"configured": False,
			"template": template_name,
			"service_name": None,
			"item_code": None,
			"item_name": None,
			"rate": 0,
			"source": None,
		}

	from healthcare.controllers.insurance_pricing import charge_list_and_discount, resolve_charge

	tpl = frappe.get_doc("Healthcare Service Template", template_name)
	item_code = (tpl.item_code or "").strip()
	base_rate = get_healthcare_service_template_rate(template_doc=tpl, patient_care_type=patient_care_type)
	charged = resolve_charge(
		patient=patient,
		base_rate=base_rate,
		patient_care_type=patient_care_type or "OP",
		template_dt="Healthcare Service Template",
		template_dn=template_name,
		service_type="OP",
	)
	parts = charge_list_and_discount(charged)
	item_name = frappe.db.get_value("Item", item_code, "item_name") if item_code else None

	return {
		"configured": bool(item_code),
		"template": template_name,
		"service_name": tpl.service_name or template_name,
		"item_code": item_code,
		"item_name": item_name,
		# List / Inclusive price before insurance % — discount tracked separately.
		"rate": parts["list_rate"],
		"discount_pct": parts["discount_pct"],
		"discount_amount": parts["discount_amount"],
		"net_rate": parts["net_rate"],
		"source": "insurance" if charged.get("used_insurance_price") or charged.get("discount_pct") else "template",
	}


def visit_type_no_charges(visit_type: str | None) -> bool:
	"""True when Patient Visit Type has No Charges ticked."""
	visit_type = (visit_type or "").strip()
	if not visit_type or not frappe.db.exists("Patient Visit Type", visit_type):
		return False
	return bool(cint(frappe.db.get_value("Patient Visit Type", visit_type, "no_charges")))


def resolve_visit_charge_config(visit_type: str | None = None, patient: str | None = None) -> dict:
	"""Resolve charge from Patient Visit Type.service_charge, else Healthcare Settings default."""
	visit_type = (visit_type or "").strip()
	no_charges = visit_type_no_charges(visit_type)
	template_name = None
	source = None

	if visit_type and frappe.db.exists("Patient Visit Type", visit_type):
		template_name = frappe.db.get_value("Patient Visit Type", visit_type, "service_charge")
		if template_name:
			source = "visit_type"

	if not template_name:
		template_name = frappe.db.get_single_value(
			"Healthcare Settings", "normal_patient_visit_charge_item"
		)
		if template_name:
			source = "default"

	config = _template_to_config(template_name, patient=patient)
	config["source"] = source
	config["visit_type"] = visit_type or None
	config["no_charges"] = no_charges
	if no_charges:
		config["configured"] = False
	return config


@frappe.whitelist()
def get_patient_visit_charge_preview(visit_type: str | None = None, patient: str | None = None) -> dict:
	"""API for create-visit UI: show configured charge amount for a visit type."""
	return resolve_visit_charge_config(visit_type, patient=patient)


def get_default_visit_type() -> str | None:
	"""The Patient Visit Type flagged as default, if any."""
	return frappe.db.get_value("Patient Visit Type", {"is_default": 1}, "name")


def resolve_visit_charge_lines(visit_type: str | None = None, patient: str | None = None) -> dict:
	"""Resolve every charge line to bill for a visit.

	Order of resolution:
	  1. When no visit type is chosen, fall back to the default Patient Visit Type.
	  2. The visit type's "Services" child table (one charge line per row).
	  3. Legacy single Patient Visit Type.service_charge.
	  4. Healthcare Settings Normal Patient Visit Charge Item.
	All resolved services are included by default; the doctor edits them on the UI.
	"""
	visit_type = (visit_type or "").strip()

	used_default_visit_type = False
	if not visit_type:
		default_type = get_default_visit_type()
		if default_type:
			visit_type = default_type
			used_default_visit_type = True

	no_charges = visit_type_no_charges(visit_type)
	lines: list[dict] = []
	source: str | None = None

	rows = []
	if visit_type and frappe.db.exists("Patient Visit Type", visit_type):
		rows = frappe.get_all(
			"Patient Visit Type Service",
			filters={"parent": visit_type, "parenttype": "Patient Visit Type"},
			fields=["service_charge"],
			order_by="idx asc",
		)

	if rows:
		source = "visit_type_services"
		for row in rows:
			config = _template_to_config((row.get("service_charge") or "").strip(), patient=patient)
			if not config.get("configured"):
				continue
			lines.append({**config, "source": "visit_type"})
	else:
		config = resolve_visit_charge_config(visit_type, patient=patient)
		source = config.get("source")
		if config.get("configured"):
			lines.append(
				{
					"configured": True,
					"template": config.get("template"),
					"service_name": config.get("service_name"),
					"item_code": config.get("item_code"),
					"item_name": config.get("item_name"),
					"rate": config.get("rate"),
					"discount_pct": config.get("discount_pct") or 0,
					"discount_amount": config.get("discount_amount") or 0,
					"net_rate": config.get("net_rate"),
					"source": config.get("source"),
				}
			)

	if no_charges:
		lines = []

	return {
		"no_charges": no_charges,
		"visit_type": visit_type or None,
		"used_default_visit_type": used_default_visit_type,
		"source": source,
		"configured": bool(lines),
		"lines": lines,
	}


@frappe.whitelist()
def get_patient_visit_charge_lines(visit_type: str | None = None, patient: str | None = None) -> dict:
	"""API for create-visit UI: list every configured charge line for a visit type."""
	return resolve_visit_charge_lines(visit_type, patient=patient)


def _visit_charge_sales_order_names(
	visit_name: str,
	*,
	item_code: str | None = None,
	docstatus: list | int | None = None,
) -> list[str]:
	item_code = (item_code or "").strip()
	if not item_code or not visit_name:
		return []

	filters: dict = {
		"custom_reference_type": "Patient Visit",
		"custom_reference_name": visit_name,
	}
	if docstatus is not None:
		filters["docstatus"] = docstatus

	candidates = frappe.get_all("Sales Order", filters=filters, pluck="name", order_by="creation desc")
	matched: list[str] = []
	for so_name in candidates:
		if frappe.db.exists("Sales Order Item", {"parent": so_name, "item_code": item_code}):
			matched.append(so_name)
	return matched


def _existing_visit_charge_sales_order(visit_name: str, item_code: str) -> str | None:
	names = _visit_charge_sales_order_names(visit_name, item_code=item_code, docstatus=["!=", 2])
	return names[0] if names else None


def _resolve_charge_lines_for_so(
	visit_type: str | None,
	charge_lines: list | None,
	patient: str | None = None,
) -> list[dict]:
	"""Turn the requested charge lines (or the auto defaults) into SO line configs.

	`charge_lines` (from the UI) is a list of dicts:
	    {template, item_code, rate?, qty?, discount_type?, discount_rate?, discount?}
	When rate is explicitly provided by the UI, it overrides the template rate.
	When no charge lines are supplied the visit type's default service(s) are used.
	Insured patients get Inclusive Item price + outpatient discount when rates are auto.
	"""
	resolved: list[dict] = []

	if charge_lines:
		for cl in charge_lines:
			if not isinstance(cl, dict):
				continue
			template = (cl.get("template") or "").strip()
			item_code = (cl.get("item_code") or "").strip()
			ui_rate = cl.get("rate")

			if template:
				config = _template_to_config(template, patient=patient)
				if not config.get("configured"):
					continue
				# Explicit UI rate overrides list rate; insurance discount still applied below.
				if ui_rate is not None and ui_rate != "" and flt(ui_rate) > 0:
					config["rate"] = flt(ui_rate)
					config["source"] = "manual"
			elif item_code:
				from healthcare.controllers.insurance_pricing import charge_list_and_discount, resolve_charge

				base = flt(ui_rate) if ui_rate is not None else 0
				charged = resolve_charge(
					patient=patient,
					base_rate=base,
					patient_care_type="OP",
					item_code=item_code,
					service_type="OP",
				)
				parts = charge_list_and_discount(charged)
				config = {
					"configured": True,
					"template": None,
					"service_name": cl.get("item_name") or cl.get("service_name") or item_code,
					"item_code": item_code,
					"item_name": cl.get("item_name"),
					"rate": parts["list_rate"] if patient else base,
					"discount_pct": parts["discount_pct"],
					"discount_amount": parts["discount_amount"],
					"net_rate": parts["net_rate"],
					"source": "manual",
				}
			else:
				continue
			discount_type = (cl.get("discount_type") or "").strip()
			discount_rate = flt(cl.get("discount_rate"))
			discount = flt(cl.get("discount"))
			# Default to insurance % when the UI didn't send a discount.
			if not discount_type and flt(config.get("discount_pct") or 0) > 0:
				discount_type = "Percentage"
				discount_rate = flt(config.get("discount_pct"))
			resolved.append(
				{
					**config,
					"qty": flt(cl.get("qty")) or 1,
					"discount_type": discount_type,
					"discount_rate": discount_rate,
					"discount": discount,
				}
			)
		return resolved

	data = resolve_visit_charge_lines(visit_type, patient=patient)
	for line in data.get("lines") or []:
		if line.get("configured"):
			row = {**line, "qty": 1}
			if not row.get("discount_type") and flt(row.get("discount_pct") or 0) > 0:
				row["discount_type"] = "Percentage"
				row["discount_rate"] = flt(row.get("discount_pct"))
			resolved.append(row)
	return resolved


def _append_charge_line_to_so(so, line: dict, visit_label: str) -> float:
	"""Append one resolved charge line to the Sales Order. Returns the line net total."""
	from healthcare.controllers.insurance_pricing import sales_item_from_list_and_discount

	rate = flt(line.get("rate"))
	qty = flt(line.get("qty")) or 1
	service_name = line.get("service_name") or _("Patient Visit Charge")
	discount_type = (line.get("discount_type") or "").strip()
	discount_pct = 0.0
	discount_amount = 0.0
	if rate > 0 and discount_type == "Percentage" and flt(line.get("discount_rate")) > 0:
		discount_pct = min(100.0, flt(line.get("discount_rate")))
	elif rate > 0 and discount_type == "Amount" and flt(line.get("discount")) != 0:
		discount_amount = flt(line.get("discount"))
	elif flt(line.get("discount_pct") or 0) > 0:
		discount_pct = flt(line.get("discount_pct"))

	item = sales_item_from_list_and_discount(
		item_code=line["item_code"],
		list_rate=rate,
		discount_pct=discount_pct,
		discount_amount=discount_amount,
		qty=qty,
		item_name=line.get("item_name") or service_name,
		description=_("Visit charge: {0}").format(visit_label),
	)
	so.append("items", item)
	return flt(item.get("rate")) * qty


def create_patient_visit_charge_sales_order(
	visit_name: str,
	*,
	visit_type: str | None = None,
	cost_center: str | None = None,
	charge_lines: list | None = None,
	submit: bool = True,
) -> dict:
	"""Create (or return) a Sales Order for a patient visit registration charge."""
	if not visit_name or not frappe.db.exists("Patient Visit", visit_name):
		frappe.throw(_("Patient Visit not found"))

	visit = frappe.get_doc("Patient Visit", visit_name)
	visit_type = visit_type or visit.visit_type

	lines = _resolve_charge_lines_for_so(visit_type, charge_lines, patient=visit.patient)
	if not lines:
		frappe.throw(
			_(
				"Patient visit charge is not configured for visit type {0}. "
				"Add Services to the Patient Visit Type or set the Normal Patient Visit Charge Item in Healthcare Settings."
			).format(visit_type or _("(default)"))
		)

	existing_names = _existing_visit_charge_sales_orders(visit.name, docstatus=["!=", 2])
	if existing_names:
		so = frappe.get_doc("Sales Order", existing_names[0])
		if submit and so.docstatus == 0:
			so.flags.ignore_permissions = True
			so.submit()
		total_rate = sum(flt(row.rate) * flt(row.qty) for row in so.items)
		return {
			"sales_order": so.name,
			"status": so.status,
			"existing": True,
			"rate": total_rate,
		}

	customer = _ensure_patient_customer(visit.patient)
	company = visit.company or frappe.defaults.get_user_default("company") or frappe.db.get_single_value(
		"Global Defaults", "default_company"
	)
	if not company:
		frappe.throw(_("Default Company is not set"))

	doctor_discount = flt(visit.get("discount_amount")) or 0
	visit_label = visit.case_no or visit.name

	so = frappe.new_doc("Sales Order")
	so.company = company
	so.customer = customer
	so.patient = visit.patient
	if hasattr(so, "custom_patient"):
		so.custom_patient = visit.patient
	if hasattr(so, "custom_patient_name"):
		so.custom_patient_name = visit.patient_name

	so.custom_reference_type = "Patient Visit"
	so.custom_reference_name = visit.name
	so.custom_base_reference = "Patient Visit"
	so.custom_base_reference_name = visit.name
	so.transaction_date = visit.encounter_date or nowdate()
	so.delivery_date = visit.encounter_date or nowdate()
	so.ignore_pricing_rule = 1

	total_rate = 0.0
	for line in lines:
		total_rate += _append_charge_line_to_so(so, line, visit_label)

	if doctor_discount:
		so.apply_discount_on = "Grand Total"
		so.discount_amount = doctor_discount

	cc = (cost_center or visit.cost_center or "").strip() or None
	apply_cost_center_to_sales_order(so, cc)
	so.insert(ignore_permissions=True)

	if submit:
		so.flags.ignore_permissions = True
		so.submit()

	return {
		"sales_order": so.name,
		"status": so.status,
		"existing": False,
		"rate": total_rate,
	}


def maybe_create_patient_visit_charge_sales_order(
	visit_name: str,
	*,
	charge_visit: bool | int | None = None,
	visit_type: str | None = None,
	cost_center: str | None = None,
	charge_lines: list | None = None,
) -> dict | None:
	"""Create visit charge SO when requested; return None when skipped."""
	if charge_visit is None:
		charge_visit = True
	if not cint(charge_visit):
		return None

	if not visit_type and visit_name and frappe.db.exists("Patient Visit", visit_name):
		visit_type = frappe.db.get_value("Patient Visit", visit_name, "visit_type")
	if visit_type_no_charges(visit_type):
		return None

	try:
		return create_patient_visit_charge_sales_order(
			visit_name,
			visit_type=visit_type,
			cost_center=cost_center,
			charge_lines=charge_lines,
			submit=True,
		)
	except Exception:
		frappe.log_error(title=f"Patient visit charge failed: {visit_name}")
		return {"error": True}


def _sales_order_is_invoiced(so_name: str) -> bool:
	"""True when a submitted Sales Invoice references this Sales Order."""
	if not so_name:
		return False
	return bool(
		frappe.db.exists("Sales Invoice Item", {"sales_order": so_name, "docstatus": 1})
	)


def _visit_charge_editor_lines(so) -> list[dict]:
	lines: list[dict] = []
	for it in so.items:
		gross = flt(it.price_list_rate) or flt(it.rate)
		net = flt(it.rate)
		discount = flt(it.discount_amount)
		if not discount and gross > net:
			discount = gross - net
		lines.append(
			{
				"item_code": it.item_code,
				"item_name": it.item_name,
				"rate": gross,
				"qty": flt(it.qty) or 1,
				"discount": discount,
				"net": net,
			}
		)
	return lines


@frappe.whitelist()
def get_patient_visit_charge_editor(visit_name: str) -> dict:
	"""Return the current visit charge lines (from the Sales Order) plus the
	visit type's services, so the doctor can edit discounts / add / remove."""
	if not visit_name or not frappe.db.exists("Patient Visit", visit_name):
		frappe.throw(_("Patient Visit not found"))

	visit = frappe.get_doc("Patient Visit", visit_name)
	names = _existing_visit_charge_sales_orders(visit_name, docstatus=["!=", 2])
	sales_order = names[0] if names else None

	lines: list[dict] = []
	editable = True
	locked_reason = None
	if sales_order:
		so = frappe.get_doc("Sales Order", sales_order)
		lines = _visit_charge_editor_lines(so)
		if _sales_order_is_invoiced(so.name):
			editable = False
			locked_reason = "invoiced"

	charge_data = resolve_visit_charge_lines(visit.visit_type)
	available_services = [
		{
			"template": line.get("template"),
			"item_code": line.get("item_code"),
			"item_name": line.get("item_name") or line.get("service_name"),
			"rate": flt(line.get("rate")),
		}
		for line in charge_data.get("lines") or []
		if line.get("configured") and line.get("item_code")
	]

	return {
		"editable": editable,
		"locked_reason": locked_reason,
		"sales_order": sales_order,
		"no_charges": charge_data.get("no_charges"),
		"lines": lines,
		"available_services": available_services,
	}


@frappe.whitelist()
def update_patient_visit_charge(visit_name: str, lines=None) -> dict:
	"""Replace the visit charge Sales Order with the supplied lines.

	`lines` is a list of {item_code, item_name, rate, qty, discount} (fixed
	amount discount). Removing all lines removes the charge entirely.
	Fails when the existing charge has already been invoiced.
	"""
	if isinstance(lines, str):
		lines = frappe.parse_json(lines)
	lines = lines or []

	if not visit_name or not frappe.db.exists("Patient Visit", visit_name):
		frappe.throw(_("Patient Visit not found"))

	visit = frappe.get_doc("Patient Visit", visit_name)
	existing = _existing_visit_charge_sales_orders(visit_name, docstatus=["!=", 2])

	for so_name in existing:
		if _sales_order_is_invoiced(so_name):
			frappe.throw(
				_("This visit charge has already been invoiced and can no longer be edited.")
			)

	charge_lines: list[dict] = []
	for cl in lines:
		if not isinstance(cl, dict):
			continue
		item_code = (cl.get("item_code") or "").strip()
		template = (cl.get("template") or "").strip()
		if not item_code and not template:
			continue
		charge_lines.append(
			{
				"item_code": item_code,
				"template": template,
				"item_name": cl.get("item_name"),
				"rate": flt(cl.get("rate")),
				"qty": flt(cl.get("qty")) or 1,
				"discount_type": "Amount",
				"discount": flt(cl.get("discount")),
			}
		)

	for so_name in existing:
		so = frappe.get_doc("Sales Order", so_name)
		so.flags.ignore_permissions = True
		if so.docstatus == 1:
			so.cancel()
		elif so.docstatus == 0:
			frappe.delete_doc("Sales Order", so_name, ignore_permissions=True, force=True)

	if not charge_lines:
		frappe.db.commit()
		return {"sales_order": None, "removed": True}

	result = create_patient_visit_charge_sales_order(
		visit_name,
		visit_type=visit.visit_type,
		cost_center=visit.cost_center,
		charge_lines=charge_lines,
		submit=True,
	)
	frappe.db.commit()
	return result


def _resolve_iop_enrollment_charge_lines(enrollment_doc) -> list[dict]:
	"""One line per Healthcare Service Template on the enrollment (qty aggregated)."""
	templates = [
		(row.session_type or "").strip()
		for row in (enrollment_doc.get("iop_session") or [])
		if (row.session_type or "").strip()
	]
	lines: list[dict] = []
	for template_name, qty in Counter(templates).items():
		config = _template_to_config(template_name)
		if config.get("configured"):
			lines.append({**config, "qty": qty})
	return lines


def _iop_enrollment_charge_fallback_lines() -> list[dict]:
	"""Healthcare Settings IOP charge, else Patient Visit Type IOP service charge."""
	template_name = frappe.db.get_single_value("Healthcare Settings", "iop_charge_item")
	if template_name:
		config = _template_to_config(template_name)
		if config.get("configured"):
			return [{**config, "qty": 1}]

	config = resolve_visit_charge_config("IOP")
	if config.get("configured"):
		return [{**config, "qty": 1}]
	return []


def _existing_visit_charge_sales_orders(
	visit_name: str,
	*,
	docstatus: list | int | None = None,
) -> list[str]:
	filters: dict = {
		"custom_reference_type": "Patient Visit",
		"custom_reference_name": visit_name,
	}
	if docstatus is not None:
		filters["docstatus"] = docstatus
	return frappe.get_all("Sales Order", filters=filters, pluck="name", order_by="creation desc")


def create_iop_enrollment_visit_charge_sales_order(
	visit_name: str,
	enrollment_doc,
	*,
	cost_center: str | None = None,
	submit: bool = True,
) -> dict:
	"""Create visit charge SO from IOP enrollment Healthcare Service Templates."""
	if not visit_name or not frappe.db.exists("Patient Visit", visit_name):
		frappe.throw(_("Patient Visit not found"))

	existing_names = _existing_visit_charge_sales_orders(visit_name, docstatus=["!=", 2])
	if existing_names:
		so = frappe.get_doc("Sales Order", existing_names[0])
		if submit and so.docstatus == 0:
			so.flags.ignore_permissions = True
			so.submit()
		total_rate = sum(flt(row.rate) * flt(row.qty) for row in so.items)
		return {
			"sales_order": so.name,
			"status": so.status,
			"existing": True,
			"rate": total_rate,
		}

	lines = _resolve_iop_enrollment_charge_lines(enrollment_doc)
	if not lines:
		lines = _iop_enrollment_charge_fallback_lines()
	if not lines:
		frappe.throw(
			_(
				"IOP visit charge is not configured. Add Healthcare Service Templates to the "
				"enrollment sessions, or set IOP Charge Item / IOP Patient Visit Type service charge "
				"in Healthcare Settings."
			)
		)

	visit = frappe.get_doc("Patient Visit", visit_name)
	customer = _ensure_patient_customer(visit.patient)
	company = visit.company or frappe.defaults.get_user_default("company") or frappe.db.get_single_value(
		"Global Defaults", "default_company"
	)
	if not company:
		frappe.throw(_("Default Company is not set"))

	visit_label = visit.case_no or visit.name
	so = frappe.new_doc("Sales Order")
	so.company = company
	so.customer = customer
	so.patient = visit.patient
	if hasattr(so, "custom_patient"):
		so.custom_patient = visit.patient
	if hasattr(so, "custom_patient_name"):
		so.custom_patient_name = visit.patient_name

	so.custom_reference_type = "Patient Visit"
	so.custom_reference_name = visit.name
	so.custom_base_reference = "Patient Visit"
	so.custom_base_reference_name = visit.name
	so.transaction_date = visit.encounter_date or nowdate()
	so.delivery_date = visit.encounter_date or nowdate()
	so.ignore_pricing_rule = 1

	total_rate = 0.0
	for line in lines:
		qty = flt(line.get("qty") or 1)
		rate = flt(line.get("rate"))
		total_rate += rate * qty
		service_name = line.get("service_name") or _("IOP Session")
		so.append(
			"items",
			{
				"item_code": line["item_code"],
				"item_name": line.get("item_name") or service_name,
				"description": _("IOP visit charge ({0}): {1}").format(service_name, visit_label),
				"qty": qty,
				"rate": rate,
				"price_list_rate": rate,
			},
		)

	cc = (cost_center or visit.cost_center or "").strip() or None
	apply_cost_center_to_sales_order(so, cc)
	so.insert(ignore_permissions=True)

	if submit:
		so.flags.ignore_permissions = True
		so.submit()

	return {
		"sales_order": so.name,
		"status": so.status,
		"existing": False,
		"rate": total_rate,
	}


def maybe_create_iop_enrollment_visit_charge_sales_order(
	visit_name: str,
	enrollment_doc,
	*,
	charge_visit: bool | int | None = None,
	cost_center: str | None = None,
) -> dict | None:
	"""Create IOP enrollment visit charge SO when requested; return None when skipped."""
	if charge_visit is None:
		charge_visit = True
	if not cint(charge_visit):
		return None

	if visit_name and frappe.db.exists("Patient Visit", visit_name):
		visit_type = frappe.db.get_value("Patient Visit", visit_name, "visit_type")
		if visit_type_no_charges(visit_type):
			return None

	try:
		return create_iop_enrollment_visit_charge_sales_order(
			visit_name,
			enrollment_doc,
			cost_center=cost_center,
			submit=True,
		)
	except Exception:
		frappe.log_error(title=f"IOP enrollment visit charge failed: {visit_name}")
		return {"error": True}


DOCTOR_PRICING_ROLES = frozenset(
	{"Administrator", "System Manager", "Healthcare Administrator", "Doctor", "Physician"}
)


@frappe.whitelist()
def set_visit_price_discount(visit, visit_price=None, discount_percentage=None, discount_amount=None):
	"""Doctor sets/edits the visit price and discount (% and amount validate each other).

	Updates the linked visit-charge Sales Order while it is still Draft; once the
	Sales Order is submitted, reception must amend billing.
	"""
	if not set(frappe.get_roles()) & DOCTOR_PRICING_ROLES:
		frappe.throw(_("Only a doctor can change the visit price"), frappe.PermissionError)
	if not visit or not frappe.db.exists("Patient Visit", visit):
		frappe.throw(_("Patient Visit not found"))

	doc = frappe.get_doc("Patient Visit", visit)
	price = flt(visit_price) if visit_price not in (None, "") else flt(doc.get("visit_price"))
	pct = flt(discount_percentage) if discount_percentage not in (None, "") else 0
	amt = flt(discount_amount) if discount_amount not in (None, "") else 0

	if price < 0 or pct < 0 or amt < 0:
		frappe.throw(_("Price and discount cannot be negative"))
	if pct > 100:
		frappe.throw(_("Discount percentage cannot exceed 100%"))
	if price:
		if pct and amt:
			expected = round(price * pct / 100, 3)
			if abs(expected - amt) > 0.05:
				frappe.throw(
					_("Discount % and amount do not match: {0}% of {1} is {2}, not {3}").format(
						pct, price, expected, amt
					)
				)
		elif pct:
			amt = round(price * pct / 100, 3)
		elif amt:
			if amt > price:
				frappe.throw(_("Discount amount cannot exceed the visit price"))
			pct = round(amt / price * 100, 2)

	doc.db_set("visit_price", price, update_modified=True)
	doc.db_set("discount_percentage", pct)
	doc.db_set("discount_amount", amt)

	# Update the linked visit-charge Sales Order while still draft.
	so_name = frappe.db.get_value(
		"Sales Order",
		{"custom_base_reference": "Patient Visit", "custom_base_reference_name": visit, "docstatus": ["<", 2]},
		"name",
	)
	so_status = None
	if so_name:
		so = frappe.get_doc("Sales Order", so_name)
		if so.docstatus == 0:
			if price and so.items:
				so.items[0].rate = price
				so.items[0].price_list_rate = price
			so.apply_discount_on = "Grand Total"
			so.discount_amount = amt
			so.flags.ignore_permissions = True
			so.save()
			so_status = "updated"
		else:
			so_status = "submitted-unchanged"

	frappe.db.commit()
	return {
		"visit": visit,
		"visit_price": price,
		"discount_percentage": pct,
		"discount_amount": amt,
		"sales_order": so_name,
		"sales_order_status": so_status,
	}
