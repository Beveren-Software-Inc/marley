"""File number registration charge: Sales Order on new Patient creation."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import flt, nowdate

from healthcare.api.sales_order_cost_center import apply_cost_center_to_sales_order
from healthcare.healthcare.doctype.healthcare_service_template.healthcare_service_template import (
	get_healthcare_service_template_rate,
)


def get_file_no_charge_config() -> dict:
	"""Resolve Healthcare Settings → File No Charge Item (Healthcare Service Template)."""
	template_name = (frappe.db.get_single_value("Healthcare Settings", "file_no_charge_item") or "").strip()
	if not template_name:
		return {
			"configured": False,
			"template": None,
			"service_name": None,
			"item_code": None,
			"item_name": None,
			"rate": 0,
		}

	if not frappe.db.exists("Healthcare Service Template", template_name):
		return {
			"configured": False,
			"template": template_name,
			"service_name": None,
			"item_code": None,
			"item_name": None,
			"rate": 0,
		}

	tpl = frappe.get_doc("Healthcare Service Template", template_name)
	item_code = (tpl.item_code or "").strip()
	rate = get_healthcare_service_template_rate(template_doc=tpl, patient_care_type="OP")
	item_name = frappe.db.get_value("Item", item_code, "item_name") if item_code else None

	return {
		"configured": bool(item_code),
		"template": template_name,
		"service_name": tpl.service_name or template_name,
		"item_code": item_code,
		"item_name": item_name,
		"rate": rate,
	}


@frappe.whitelist()
def get_file_no_charge_preview() -> dict:
	"""API for create-patient UI: show configured charge amount."""
	return get_file_no_charge_config()


def _ensure_patient_customer(patient_name: str) -> str:
	customer = frappe.db.get_value("Patient", patient_name, "customer")
	if customer:
		return customer

	if frappe.db.get_single_value("Healthcare Settings", "link_customer_to_patient"):
		from healthcare.healthcare.doctype.patient.patient import create_customer

		patient_doc = frappe.get_doc("Patient", patient_name)
		create_customer(patient_doc)
		patient_doc.reload()
		customer = patient_doc.customer

	if not customer:
		frappe.throw(
			_("Patient {0} has no Customer. Enable Link Customer to Patient in Healthcare Settings.").format(
				patient_name
			)
		)
	return customer


def _file_no_charge_sales_order_names(
	patient_name: str,
	*,
	item_code: str | None = None,
	docstatus: list | int | None = None,
) -> list[str]:
	"""Sales Orders for this patient's file-number registration charge."""
	item_code = (item_code or get_file_no_charge_config().get("item_code") or "").strip()
	if not item_code or not patient_name:
		return []

	filters: dict = {
		"patient": patient_name,
		"custom_reference_type": "Patient",
		"custom_reference_name": patient_name,
	}
	if docstatus is not None:
		filters["docstatus"] = docstatus

	candidates = frappe.get_all("Sales Order", filters=filters, pluck="name", order_by="creation desc")
	matched: list[str] = []
	for so_name in candidates:
		if frappe.db.exists("Sales Order Item", {"parent": so_name, "item_code": item_code}):
			matched.append(so_name)
	return matched


def _existing_file_no_charge_sales_order(patient_name: str) -> str | None:
	names = _file_no_charge_sales_order_names(patient_name, docstatus=["!=", 2])
	return names[0] if names else None


def create_patient_file_no_sales_order(patient_name: str, *, submit: bool = True) -> dict:
	"""Create (or return) a Sales Order for the file number registration charge."""
	if not patient_name or not frappe.db.exists("Patient", patient_name):
		frappe.throw(_("Patient not found"))

	config = get_file_no_charge_config()
	if not config.get("configured"):
		frappe.throw(
			_(
				"File No Charge Item is not configured in Healthcare Settings "
				"(Healthcare Service Template with Item and Rate)."
			)
		)

	existing = _existing_file_no_charge_sales_order(patient_name)
	if existing:
		so = frappe.get_doc("Sales Order", existing)
		if submit and so.docstatus == 0:
			so.flags.ignore_permissions = True
			so.submit()
		return {
			"sales_order": so.name,
			"status": so.status,
			"existing": True,
			"rate": config.get("rate"),
		}

	patient = frappe.get_doc("Patient", patient_name)
	customer = _ensure_patient_customer(patient_name)
	company = frappe.defaults.get_user_default("company") or frappe.db.get_single_value(
		"Global Defaults", "default_company"
	)
	if not company:
		frappe.throw(_("Default Company is not set"))

	item_code = config["item_code"]
	service_name = config.get("service_name") or _("File Number Charge")
	rate = flt(config.get("rate"))

	so = frappe.new_doc("Sales Order")
	so.company = company
	so.customer = customer
	so.patient = patient.name
	if hasattr(so, "custom_patient"):
		so.custom_patient = patient.name
	if hasattr(so, "custom_patient_name"):
		so.custom_patient_name = patient.patient_name

	# custom_base_reference is a Link to DocType — must be a real doctype (e.g. Patient).
	so.custom_reference_type = "Patient"
	so.custom_reference_name = patient.name
	so.custom_base_reference = "Patient"
	so.custom_base_reference_name = patient.name
	so.transaction_date = nowdate()
	so.delivery_date = nowdate()
	so.ignore_pricing_rule = 1

	so.append(
		"items",
		{
			"item_code": item_code,
			"item_name": config.get("item_name") or service_name,
			"description": _("File number charge: {0}").format(patient.name),
			"qty": 1,
			"rate": rate,
			"price_list_rate": rate,
		},
	)

	apply_cost_center_to_sales_order(so, None)
	so.insert(ignore_permissions=True)

	if submit:
		so.flags.ignore_permissions = True
		so.submit()

	return {
		"sales_order": so.name,
		"status": so.status,
		"existing": False,
		"rate": rate,
	}


def pending_file_no_charge_sales_orders(patient_name: str) -> list[str]:
	"""Submitted, not-yet-invoiced file-number charge orders for a patient."""
	if not patient_name:
		return []

	from healthcare.api.common import get_permitted_cost_centers

	permitted_cc = get_permitted_cost_centers()
	if permitted_cc is not None and not permitted_cc:
		return []

	names: list[str] = []
	for so_name in _file_no_charge_sales_order_names(patient_name, docstatus=1):
		so = frappe.db.get_value("Sales Order", so_name, ["cost_center"], as_dict=True)
		if permitted_cc is not None and so and so.cost_center and so.cost_center not in permitted_cc:
			continue
		if not frappe.db.exists("Sales Invoice Item", {"sales_order": so_name}):
			names.append(so_name)
	return names


def file_no_charge_invoices_for_list(patient_name: str) -> list[dict]:
	"""Return Sales Invoice rows for service-invoice list merge (visit/admission + patient context)."""
	if not patient_name:
		return []

	from healthcare.api.common import get_permitted_cost_centers

	permitted_cc = get_permitted_cost_centers()
	if permitted_cc is not None and not permitted_cc:
		return []

	item_code = (get_file_no_charge_config().get("item_code") or "").strip()
	if not item_code:
		return []

	fields = [
		"name",
		"docstatus",
		"company",
		"customer",
		"customer_name",
		"posting_date",
		"due_date",
		"status",
		"grand_total",
		"outstanding_amount",
		"paid_amount",
		"custom_reference_type",
		"custom_reference_name",
		"patient",
		"patient_name",
		"custom_created_at",
		"cost_center",
	]
	rows: list[dict] = []
	filters = {
		"patient": patient_name,
		"custom_reference_type": "Patient",
		"custom_reference_name": patient_name,
		"docstatus": ["!=", 2],
	}
	for inv_name in frappe.get_all("Sales Invoice", filters=filters, pluck="name", order_by="posting_date desc"):
		if not frappe.db.exists("Sales Invoice Item", {"parent": inv_name, "item_code": item_code}):
			continue
		inv_row = frappe.db.get_value("Sales Invoice", inv_name, fields, as_dict=True)
		if not inv_row:
			continue
		if permitted_cc is not None and inv_row.cost_center and inv_row.cost_center not in permitted_cc:
			continue
		rows.append(inv_row)
	return rows


def file_no_charge_sales_orders_for_list(patient_name: str) -> list[dict]:
	"""Return Sales Order rows for service-order list merge (visit/admission + patient context)."""
	if not patient_name:
		return []

	from healthcare.api.common import get_permitted_cost_centers

	permitted_cc = get_permitted_cost_centers()
	if permitted_cc is not None and not permitted_cc:
		return []

	fields = [
		"name",
		"customer",
		"customer_name",
		"transaction_date",
		"status",
		"grand_total",
		"total",
		"custom_reference_type",
		"custom_reference_name",
		"custom_base_reference",
		"custom_base_reference_name",
		"patient",
		"patient_name",
		"docstatus",
		"cost_center",
	]
	rows: list[dict] = []
	for so_name in _file_no_charge_sales_order_names(patient_name, docstatus=["!=", 2]):
		so_row = frappe.db.get_value("Sales Order", so_name, fields, as_dict=True)
		if not so_row:
			continue
		if permitted_cc is not None and so_row.cost_center and so_row.cost_center not in permitted_cc:
			continue
		rows.append(so_row)
	return rows
