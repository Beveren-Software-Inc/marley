# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

"""Propagate cost center onto Sales Orders created from clinical documents."""

import frappe


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
	if not cc:
		return

	invoice.set_missing_values()
	invoice.run_method("calculate_taxes_and_totals")
	apply_cost_center_to_sales_invoice(invoice, cc)


def sales_invoice_item_from_sales_order_item(so, item):
	"""Map a Sales Order Item row to a Sales Invoice Item dict (incl. cost center)."""
	so_cc = cost_center_from_sales_order(so)
	item_cc = getattr(item, "cost_center", None) or so_cc
	line = {
		"item_code": item.item_code,
		"item_name": item.item_name or item.item_code,
		"qty": item.qty,
		"rate": item.rate,
		"amount": item.amount,
		"description": item.description or frappe._("Order: {0}").format(so.name),
		"sales_order": so.name,
		"so_detail": item.name,
	}
	if getattr(item, "uom", None):
		line["uom"] = item.uom
	if getattr(item, "warehouse", None) and frappe.get_meta("Sales Invoice Item").has_field("warehouse"):
		line["warehouse"] = item.warehouse
	if item_cc:
		line["cost_center"] = item_cc
	_copy_accounting_dimensions(item, line, fallback_row=so)
	return line


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
