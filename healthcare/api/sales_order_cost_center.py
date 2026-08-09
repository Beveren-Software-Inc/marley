# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

"""Propagate cost center onto Sales Orders created from clinical documents."""

import frappe
from frappe.utils import cint, flt


def apply_cost_center_to_sales_order(so, cost_center):
	"""Set ``cost_center`` on the Sales Order and each item row when provided."""
	if not cost_center:
		return
	cc = cost_center.strip() if isinstance(cost_center, str) else cost_center
	if not cc:
		return
	so.cost_center = cc
	for row in so.get("items") or []:
		if hasattr(row, "cost_center"):
			row.cost_center = cc


def cost_center_from_sales_order(so) -> str | None:
	"""Resolve branch/cost center from a Sales Order header or line items."""
	raw = getattr(so, "cost_center", None)
	if raw:
		return raw.strip() if isinstance(raw, str) else raw
	for row in so.get("items") or []:
		cc = getattr(row, "cost_center", None)
		if cc:
			return cc.strip() if isinstance(cc, str) else cc
	return None


def apply_cost_center_to_sales_invoice(invoice, cost_center):
	"""Set header + line cost centers on a Sales Invoice (incl. custom_created_at branch)."""
	if not cost_center:
		return
	cc = cost_center.strip() if isinstance(cost_center, str) else cost_center
	if not cc:
		return
	if hasattr(invoice, "cost_center"):
		invoice.cost_center = cc
	if hasattr(invoice, "custom_created_at"):
		invoice.custom_created_at = cc
	for table_field in ("items", "taxes"):
		for row in invoice.get(table_field) or []:
			if hasattr(row, "cost_center"):
				row.cost_center = cc


def _accounting_dimension_fieldnames():
	"""Configured accounting dimensions plus standard cost_center and project."""
	fields = []
	try:
		from erpnext.accounts.doctype.accounting_dimension.accounting_dimension import (
			get_accounting_dimensions,
		)

		fields.extend(get_accounting_dimensions() or [])
	except Exception:
		pass
	for name in ("cost_center", "project"):
		if name not in fields:
			fields.append(name)
	return fields


def _copy_accounting_dimensions(source_row, target_row, fallback_row=None):
	"""Copy accounting dimension values onto a header or child row when target is blank."""
	if not source_row or target_row is None:
		return

	is_dict = isinstance(target_row, dict)
	target_doctype = "Sales Invoice Item" if is_dict else getattr(target_row, "doctype", None)
	if not target_doctype:
		return

	target_meta = frappe.get_meta(target_doctype)

	for fieldname in _accounting_dimension_fieldnames():
		if not target_meta.has_field(fieldname):
			continue

		val = source_row.get(fieldname) if isinstance(source_row, dict) else getattr(source_row, fieldname, None)
		if not val and fallback_row is not None:
			val = (
				fallback_row.get(fieldname)
				if isinstance(fallback_row, dict)
				else getattr(fallback_row, fieldname, None)
			)
		if not val:
			continue

		if is_dict:
			if not target_row.get(fieldname):
				target_row[fieldname] = val
		elif not target_row.get(fieldname):
			target_row.set(fieldname, val)


def apply_accounting_dimensions_from_sales_order_to_sales_invoice(so, invoice):
	"""Propagate cost center and other accounting dimensions from Sales Order to Sales Invoice."""
	so_cc = cost_center_from_sales_order(so)
	if so_cc:
		apply_cost_center_to_sales_invoice(invoice, so_cc)

	invoice_meta = frappe.get_meta(invoice.doctype)
	for fieldname in _accounting_dimension_fieldnames():
		if fieldname == "cost_center":
			continue
		if not invoice_meta.has_field(fieldname):
			continue
		val = getattr(so, fieldname, None)
		if val and not invoice.get(fieldname):
			invoice.set(fieldname, val)


def sync_sales_invoice_uom_from_previous_docs(invoice) -> None:
	"""Keep UOM / conversion_factor identical to DN or SO (ERPNext validate_with_previous_doc).

	Do not round with default ``flt()`` precision — pharmacy UOMs often need 9 dp
	(e.g. 0.033333333). ``set_missing_values`` can also reset these from Item master.
	"""
	for item in invoice.get("items") or []:
		prev = None
		if item.get("dn_detail") and frappe.db.exists("Delivery Note Item", item.dn_detail):
			prev = frappe.db.get_value(
				"Delivery Note Item",
				item.dn_detail,
				["uom", "conversion_factor", "stock_uom"],
				as_dict=True,
			)
		elif item.get("so_detail") and frappe.db.exists("Sales Order Item", item.so_detail):
			prev = frappe.db.get_value(
				"Sales Order Item",
				item.so_detail,
				["uom", "conversion_factor", "stock_uom"],
				as_dict=True,
			)
		if not prev:
			continue
		if prev.get("uom"):
			item.uom = prev.uom
		if prev.get("stock_uom"):
			item.stock_uom = prev.stock_uom
		if prev.get("conversion_factor") is not None:
			try:
				prec = item.precision("conversion_factor")
			except Exception:
				prec = 9
			if prec is None or cint(prec) < 9:
				prec = 9
			item.conversion_factor = flt(prev.conversion_factor, prec)
			item.stock_qty = flt(flt(item.qty) * flt(item.conversion_factor, prec), item.precision("stock_qty"))


def finalize_sales_invoice_cost_centers(invoice, cost_center=None):
	"""Ensure header, item, and tax rows have cost center before save/submit."""
	cc = cost_center or getattr(invoice, "cost_center", None) or getattr(invoice, "custom_created_at", None)
	if not cc:
		for row in invoice.get("items") or []:
			if getattr(row, "cost_center", None):
				cc = row.cost_center
				break
	if not cc and getattr(invoice, "company", None):
		try:
			import erpnext

			cc = erpnext.get_default_cost_center(invoice.company)
		except Exception:
			cc = None

	# set_missing_values can overwrite UOM conversion from Item master — restore after
	if cc:
		invoice.set_missing_values()
		invoice.run_method("calculate_taxes_and_totals")
		apply_cost_center_to_sales_invoice(invoice, cc)
	sync_sales_invoice_uom_from_previous_docs(invoice)


def sales_invoice_item_from_sales_order_item(so, item):
	"""Map a Sales Order Item row to a Sales Invoice Item dict (incl. cost center).

	Copies list rate + discount % so insurance discounts survive SO → Invoice.
	Does not copy margin fields — those can reinflate rate (e.g. 140 → 220).

	Lines already on a submitted Delivery Note are skipped — invoice those from the DN.
	"""
	from healthcare.api.pos_dispense_return import get_net_billable_qty_for_so_item

	if _so_item_has_submitted_delivery_note(item.name):
		return None

	so_cc = cost_center_from_sales_order(so)
	item_cc = getattr(item, "cost_center", None) or so_cc
	net_qty = get_net_billable_qty_for_so_item(so, item)
	if net_qty <= 0:
		return None

	rate = flt(item.rate)
	price_list_rate = flt(getattr(item, "price_list_rate", 0) or 0)
	if price_list_rate <= 0:
		price_list_rate = rate
	discount_pct = flt(getattr(item, "discount_percentage", 0) or 0)
	discount_amt = flt(getattr(item, "discount_amount", 0) or 0)

	line = {
		"item_code": item.item_code,
		"item_name": item.item_name or item.item_code,
		"qty": net_qty,
		"price_list_rate": price_list_rate,
		"rate": rate,
		"amount": flt(net_qty * rate, item.precision("amount") if hasattr(item, "precision") else 2),
		"description": item.description or frappe._("Order: {0}").format(so.name),
		"sales_order": so.name,
		"so_detail": item.name,
		# Keep healthcare insurance pricing (list + %) and block ERPNext pricing rules/margins.
		"ignore_pricing_rule": 1,
		"margin_type": "",
		"margin_rate_or_amount": 0,
		"rate_with_margin": 0,
	}
	if discount_pct > 0:
		line["discount_percentage"] = discount_pct
		line["discount_amount"] = 0
	elif discount_amt > 0:
		line["discount_percentage"] = 0
		line["discount_amount"] = discount_amt
	else:
		line["discount_percentage"] = 0
		line["discount_amount"] = 0
	if getattr(item, "uom", None):
		line["uom"] = item.uom
	if getattr(item, "stock_uom", None):
		line["stock_uom"] = item.stock_uom
	cf = getattr(item, "conversion_factor", None)
	if cf is not None and flt(cf) != 0:
		line["conversion_factor"] = flt(cf)
		line["stock_qty"] = flt(net_qty) * flt(cf)
	if getattr(item, "warehouse", None) and frappe.get_meta("Sales Invoice Item").has_field("warehouse"):
		line["warehouse"] = item.warehouse
	if item_cc:
		line["cost_center"] = item_cc
	_copy_accounting_dimensions(item, line, fallback_row=so)
	return line


def _so_item_has_submitted_delivery_note(so_detail: str) -> bool:
	if not so_detail:
		return False
	return bool(
		frappe.db.sql(
			"""
			SELECT 1
			FROM `tabDelivery Note Item` dni
			INNER JOIN `tabDelivery Note` dn ON dn.name = dni.parent
			WHERE dni.so_detail = %s
			  AND dn.docstatus = 1
			  AND IFNULL(dn.is_return, 0) = 0
			LIMIT 1
			""",
			so_detail,
		)
	)


def cost_center_from_service_request(sr):
	"""Prefer SR cost center, then order-reference doc, then visit/admission."""
	raw = getattr(sr, "cost_center", None)
	if raw:
		return raw.strip() if isinstance(raw, str) else raw

	odt = (getattr(sr, "order_reference_doctype", None) or "").strip()
	odn = (getattr(sr, "order_reference_name", None) or "").strip()
	if odt and odn:
		try:
			meta = frappe.get_meta(odt)
			if meta.has_field("cost_center") and frappe.db.exists(odt, odn):
				doc_cc = frappe.db.get_value(odt, odn, "cost_center")
				if doc_cc:
					return doc_cc.strip() if isinstance(doc_cc, str) else doc_cc
		except Exception:
			pass

	pv = getattr(sr, "patient_visit", None)
	if pv and frappe.db.exists("Patient Visit", pv):
		vcc = frappe.db.get_value("Patient Visit", pv, "cost_center")
		if vcc:
			return vcc.strip() if isinstance(vcc, str) else vcc

	ip = getattr(sr, "inpatient_record", None)
	if ip and frappe.db.exists("Inpatient Admission", ip):
		icc = frappe.db.get_value("Inpatient Admission", ip, "cost_center")
		if icc:
			return icc.strip() if isinstance(icc, str) else icc

	return None


def cost_center_from_patient_medication_order(pmo, ref_doctype, ref_name):
	"""Prefer PMO cost center, then linked Patient Visit / Inpatient Admission."""
	raw = getattr(pmo, "cost_center", None)
	if raw:
		return raw.strip() if isinstance(raw, str) else raw
	if ref_doctype and ref_name and ref_doctype in ("Patient Visit", "Inpatient Admission"):
		if frappe.db.exists(ref_doctype, ref_name):
			v = frappe.db.get_value(ref_doctype, ref_name, "cost_center")
			if v:
				return v.strip() if isinstance(v, str) else v
	return None


def cost_center_from_visit_or_admission(reference_type, reference_name):
	if not reference_type or not reference_name:
		return None
	if reference_type not in ("Patient Visit", "Inpatient Admission"):
		return None
	if not frappe.db.exists(reference_type, reference_name):
		return None
	v = frappe.db.get_value(reference_type, reference_name, "cost_center")
	if v:
		return v.strip() if isinstance(v, str) else v
	return None


def cost_center_from_base_reference(base_reference, base_reference_name):
	"""When caller passes a concrete base doc (e.g. Lab Test), copy its cost center if set."""
	if not base_reference or not base_reference_name:
		return None
	if base_reference in ("Patient Visit", "Inpatient Admission"):
		return cost_center_from_visit_or_admission(base_reference, base_reference_name)
	try:
		meta = frappe.get_meta(base_reference)
		if meta.has_field("cost_center") and frappe.db.exists(base_reference, base_reference_name):
			v = frappe.db.get_value(base_reference, base_reference_name, "cost_center")
			if v:
				return v.strip() if isinstance(v, str) else v
	except Exception:
		pass
	return None


def _user_default_cost_center():
	"""First permitted cost center for the user, else employee cost center."""
	from healthcare.api.common import get_permitted_cost_centers

	permitted = get_permitted_cost_centers()
	if permitted:
		return permitted[0]

	user = frappe.session.user
	if user in ("Guest", ""):
		return None
	employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
	if employee:
		return frappe.db.get_value("Employee", employee, "cost_center")
	return None


def resolve_cost_center_for_clinical_doc(data):
	"""Resolve cost center from payload, care context, appointment, or user default."""
	if not data:
		return None

	explicit = data.get("cost_center")
	if explicit:
		explicit = explicit.strip() if isinstance(explicit, str) else explicit
		if explicit:
			return explicit

	admission = data.get("admission_no") or data.get("inpatient_admission") or data.get("inpatient_record")
	if admission:
		cc = cost_center_from_visit_or_admission("Inpatient Admission", admission)
		if cc:
			return cc

	visit = data.get("patient_visit") or data.get("patient_encounter")
	if visit:
		cc = cost_center_from_visit_or_admission("Patient Visit", visit)
		if cc:
			return cc

	appointment = data.get("appointment")
	if appointment and frappe.db.exists("Patient Appointment", appointment):
		cc = frappe.db.get_value("Patient Appointment", appointment, "cost_center")
		if cc:
			return cc.strip() if isinstance(cc, str) else cc

	return _user_default_cost_center()
