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
