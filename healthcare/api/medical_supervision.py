"""Continuous Medical Supervision: manage activate/stop and daily billing."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate, today


def bill_medical_supervision_service_request(service_request_name, billing_date=None):
	"""Create/submit Sales Order for a Medical Supervision Service Request on a given date."""
	from healthcare.api.sales_order_cost_center import (
		apply_cost_center_to_sales_order,
		cost_center_from_service_request,
	)
	from healthcare.api.service_request import apply_service_request_refs_to_sales_order
	from healthcare.controllers.insurance_pricing import sales_item_from_list_and_discount

	if not service_request_name:
		frappe.throw(_("Service Request name is required"))

	sr = frappe.get_doc("Service Request", service_request_name)
	billing_date = getdate(billing_date or today())

	if sr.patient_accepted_cost and sr.reference_document_type == "Sales Order" and sr.reference_document_name:
		# Already billed once — still allow daily charges via separate SRs; return existing if same day
		existing_date = frappe.db.get_value("Sales Order", sr.reference_document_name, "transaction_date")
		if existing_date and getdate(existing_date) == billing_date:
			return sr.reference_document_name

	if not sr.template_dt or not sr.template_dn:
		frappe.throw(_("Template is required on the Service Request"))

	template_doc = frappe.get_doc(sr.template_dt, sr.template_dn)
	item_code = getattr(template_doc, "item", None) or getattr(template_doc, "item_code", None)
	if not item_code:
		frappe.throw(
			_("{0} '{1}' must have an Item or Item Code configured before confirming payment").format(
				sr.template_dt, sr.template_dn
			)
		)

	list_rate = flt(sr.cost) or 0
	net_rate = flt(sr.grand_total) or list_rate

	customer = frappe.db.get_value("Patient", sr.patient, "customer") if sr.patient else None
	if not customer:
		frappe.throw(
			_("Patient {0} has no Customer linked. Link a customer on the patient record first.").format(
				sr.patient
			)
		)

	so = frappe.new_doc("Sales Order")
	so.patient = sr.patient
	if getattr(sr, "company", None):
		so.company = sr.company
	so.customer = customer
	so.transaction_date = billing_date
	so.delivery_date = billing_date
	so.ignore_pricing_rule = 1
	so.append(
		"items",
		sales_item_from_list_and_discount(
			item_code=item_code,
			list_rate=list_rate,
			discount_pct=flt(sr.discount),
			discount_amount=flt(sr.discount_amount),
			net_rate=net_rate,
			description=f"Medical Supervision {billing_date} · Service Request {sr.name}",
		),
	)
	apply_service_request_refs_to_sales_order(so, sr)
	apply_cost_center_to_sales_order(so, cost_center_from_service_request(sr))
	so.insert(ignore_permissions=True)
	so.submit()

	# Master continuous SR may already be linked to day-1 SO; only stamp if unset
	if not sr.patient_accepted_cost:
		sr.db_set("patient_accepted_cost", 1)
		sr.db_set("status", "active-Request Status")
		sr.db_set("reference_document_type", "Sales Order")
		sr.db_set("reference_document_name", so.name)

	return so.name


def _template_item_code(template_name: str) -> str | None:
	row = frappe.db.get_value(
		"Healthcare Service Template",
		template_name,
		["item_code", "item"],
		as_dict=True,
	) or {}
	return (row.get("item_code") or row.get("item") or "").strip() or None


def _existing_ms_charge_for_date(admission_name: str, template_name: str, billing_date) -> str | None:
	"""Return Sales Order name if this admission already has an MS charge for the date."""
	billing_date = getdate(billing_date)
	item_code = _template_item_code(template_name)
	if not item_code:
		return None

	# Prefer SO linked to admission on that transaction date with matching item
	orders = frappe.get_all(
		"Sales Order",
		filters={
			"docstatus": 1,
			"transaction_date": billing_date,
			"custom_reference_type": "Inpatient Admission",
			"custom_reference_name": admission_name,
		},
		pluck="name",
		limit_page_length=50,
	)
	if not orders:
		return None
	hit = frappe.db.sql(
		"""
		SELECT parent FROM `tabSales Order Item`
		WHERE parent IN %(parents)s AND item_code = %(item)s
		LIMIT 1
		""",
		{"parents": tuple(orders), "item": item_code},
	)
	return hit[0][0] if hit else None


def _active_continuous_ms_srs(admission_name: str | None = None):
	filters = {
		"is_continous_medical_supervision": 1,
		"template_dt": "Healthcare Service Template",
		"docstatus": ["<", 2],
		"status": ["not in", ["completed-Request Status", "stopped-Request Status", "cancelled-Request Status"]],
	}
	if admission_name:
		filters["inpatient_record"] = admission_name
	return frappe.get_all(
		"Service Request",
		filters=filters,
		fields=[
			"name",
			"patient",
			"inpatient_record",
			"template_dn",
			"cost",
			"grand_total",
			"practitioner",
			"cost_center",
			"expected_date",
		],
		order_by="creation desc",
	)


def _admission_ms_context(admission_name: str) -> dict:
	if not admission_name or not frappe.db.exists("Inpatient Admission", admission_name):
		frappe.throw(_("Inpatient Admission {0} not found").format(admission_name))
	adm = frappe.get_doc("Inpatient Admission", admission_name)
	continuous = _active_continuous_ms_srs(admission_name)
	active = continuous[0] if continuous else None
	return {
		"admission": admission_name,
		"patient": adm.patient,
		"patient_name": adm.patient_name,
		"status": adm.status,
		"is_med_supr_required": cint(adm.get("is_med_supr_required")),
		"med_supr_service_code": (adm.get("med_supr_service_code") or "").strip() or None,
		"continuous_active": bool(active),
		"active_service_request": active.name if active else None,
		"active_template": active.template_dn if active else None,
		"active_amount": flt(active.grand_total or active.cost) if active else None,
		"continuous_service_requests": continuous,
	}


@frappe.whitelist()
def get_admission_medical_supervision(admission):
	"""Status of continuous Medical Supervision for an admission."""
	return _admission_ms_context(admission)


@frappe.whitelist()
def create_medical_supervision(
	admission,
	template=None,
	amount=None,
	continuous=1,
	bill_today=1,
):
	"""Create Medical Supervision for an admitted patient (optionally continuous)."""
	from healthcare.api.inpatient_admission import (
		_create_medical_supervision_service_request,
		_get_medical_supervision_ip_rate,
		_validate_medical_supervision_template,
	)

	ctx = _admission_ms_context(admission)
	if ctx["status"] != "Admitted":
		frappe.throw(_("Patient must be Admitted to manage Medical Supervision"))

	template = (template or ctx.get("med_supr_service_code") or "").strip()
	if not template:
		frappe.throw(_("Select a Medical Supervision service"))
	_validate_medical_supervision_template(template)

	if cint(continuous) and ctx["continuous_active"]:
		frappe.throw(
			_("Continuous Medical Supervision is already active ({0}). Stop it first or use Activate.").format(
				ctx["active_service_request"]
			)
		)

	rate = flt(amount) if amount is not None else _get_medical_supervision_ip_rate(template)
	adm = frappe.get_doc("Inpatient Admission", admission)
	billing_date = getdate(today())
	result = _create_medical_supervision_service_request(
		adm,
		template,
		amount=rate,
		continuous=bool(cint(continuous)),
		billing_date=billing_date,
		bill=bool(cint(bill_today)),
	)

	if adm.meta.has_field("is_med_supr_required"):
		adm.db_set("is_med_supr_required", 1 if cint(continuous) else cint(adm.is_med_supr_required))
	if adm.meta.has_field("med_supr_service_code") and cint(continuous):
		adm.db_set("med_supr_service_code", template)

	frappe.db.commit()
	out = _admission_ms_context(admission)
	out["created"] = result
	out["message"] = _("Medical Supervision created")
	return out


@frappe.whitelist()
def activate_medical_supervision(admission, service_request=None, template=None, amount=None):
	"""Turn continuous Medical Supervision on (existing SR or create new)."""
	from healthcare.api.inpatient_admission import _get_medical_supervision_ip_rate

	ctx = _admission_ms_context(admission)
	if ctx["status"] != "Admitted":
		frappe.throw(_("Patient must be Admitted to manage Medical Supervision"))

	sr_name = (service_request or "").strip() or None
	if not sr_name and ctx["active_service_request"]:
		# Already continuous — no-op success
		ctx["message"] = _("Medical Supervision is already active")
		return ctx

	if sr_name:
		if not frappe.db.exists("Service Request", sr_name):
			frappe.throw(_("Service Request {0} not found").format(sr_name))
		sr = frappe.get_doc("Service Request", sr_name)
		if sr.inpatient_record != admission:
			frappe.throw(_("Service Request does not belong to this admission"))
		if frappe.get_meta("Service Request").has_field("is_continous_medical_supervision"):
			sr.db_set("is_continous_medical_supervision", 1)
		template = sr.template_dn
		adm = frappe.get_doc("Inpatient Admission", admission)
		if adm.meta.has_field("is_med_supr_required"):
			adm.db_set("is_med_supr_required", 1)
		if adm.meta.has_field("med_supr_service_code") and template:
			adm.db_set("med_supr_service_code", template)
		frappe.db.commit()
		out = _admission_ms_context(admission)
		out["message"] = _("Medical Supervision activated")
		return out

	# No continuous SR — create one (bill today)
	return create_medical_supervision(
		admission,
		template=template or ctx.get("med_supr_service_code"),
		amount=amount if amount is not None else None,
		continuous=1,
		bill_today=1,
	)


@frappe.whitelist()
def stop_medical_supervision(admission, service_request=None):
	"""Stop continuous Medical Supervision (untick flag so daily job skips it)."""
	ctx = _admission_ms_context(admission)
	targets = []
	sr_name = (service_request or "").strip() or None
	if sr_name:
		targets = [sr_name]
	else:
		targets = [r.name for r in ctx["continuous_service_requests"]]

	if not targets:
		frappe.throw(_("No active continuous Medical Supervision to stop"))

	stopped = []
	for name in targets:
		if not frappe.db.exists("Service Request", name):
			continue
		sr = frappe.get_doc("Service Request", name)
		if sr.inpatient_record != admission:
			continue
		if frappe.get_meta("Service Request").has_field("is_continous_medical_supervision"):
			sr.db_set("is_continous_medical_supervision", 0)
		stopped.append(name)

	adm = frappe.get_doc("Inpatient Admission", admission)
	if adm.meta.has_field("is_med_supr_required"):
		adm.db_set("is_med_supr_required", 0)

	frappe.db.commit()
	out = _admission_ms_context(admission)
	out["stopped"] = stopped
	out["message"] = _("Medical Supervision stopped")
	return out


@frappe.whitelist()
def generate_medical_supervision_charges(
	admission,
	from_date=None,
	to_date=None,
	template=None,
	amount=None,
	days=None,
):
	"""Backfill / generate Medical Supervision bills for a date range (or N days ending today)."""
	from healthcare.api.inpatient_admission import (
		_create_medical_supervision_service_request,
		_get_medical_supervision_ip_rate,
		_validate_medical_supervision_template,
	)

	ctx = _admission_ms_context(admission)
	if ctx["status"] not in ("Admitted", "Discharge Scheduled", "Discharged"):
		frappe.throw(_("Admission must be admitted (or later) to generate Medical Supervision charges"))

	template = (
		(template or "").strip()
		or (ctx.get("active_template") or "")
		or (ctx.get("med_supr_service_code") or "")
	).strip()
	if not template:
		frappe.throw(_("Select a Medical Supervision service"))
	_validate_medical_supervision_template(template)
	rate = flt(amount) if amount is not None else (
		flt(ctx.get("active_amount")) or _get_medical_supervision_ip_rate(template)
	)

	if days is not None and str(days).strip() != "":
		n = cint(days)
		if n < 1:
			frappe.throw(_("Days must be at least 1"))
		to_d = getdate(to_date or today())
		from_d = add_days(to_d, -(n - 1))
	else:
		if not from_date or not to_date:
			frappe.throw(_("From Date and To Date are required (or pass days)"))
		from_d = getdate(from_date)
		to_d = getdate(to_date)
		if to_d < from_d:
			frappe.throw(_("To Date cannot be before From Date"))

	adm = frappe.get_doc("Inpatient Admission", admission)
	created = []
	skipped = []
	d = from_d
	while d <= to_d:
		existing = _existing_ms_charge_for_date(admission, template, d)
		if existing:
			skipped.append({"date": str(d), "sales_order": existing})
		else:
			row = _create_medical_supervision_service_request(
				adm,
				template,
				amount=rate,
				continuous=False,
				billing_date=d,
				bill=True,
			)
			created.append(row)
		d = add_days(d, 1)

	frappe.db.commit()
	out = _admission_ms_context(admission)
	out["created"] = created
	out["skipped"] = skipped
	out["from_date"] = str(from_d)
	out["to_date"] = str(to_d)
	out["message"] = _("Generated {0} charge(s); skipped {1} existing day(s)").format(
		len(created), len(skipped)
	)
	return out


@frappe.whitelist()
def process_daily_medical_supervision(billing_date=None):
	"""Scheduler: bill one day of Medical Supervision for each continuous SR on an Admitted IP."""
	from healthcare.api.inpatient_admission import _create_medical_supervision_service_request

	billing_date = getdate(billing_date or today())
	rows = _active_continuous_ms_srs()
	created = []
	skipped = []
	failed = []

	for row in rows:
		admission = row.inpatient_record
		if not admission:
			skipped.append({"service_request": row.name, "reason": "no_admission"})
			continue
		status = frappe.db.get_value("Inpatient Admission", admission, "status")
		if status != "Admitted":
			skipped.append({"service_request": row.name, "reason": f"status:{status}"})
			continue
		template = row.template_dn
		if not template:
			skipped.append({"service_request": row.name, "reason": "no_template"})
			continue
		existing = _existing_ms_charge_for_date(admission, template, billing_date)
		if existing:
			skipped.append(
				{"service_request": row.name, "reason": "already_billed", "sales_order": existing}
			)
			continue
		try:
			adm = frappe.get_doc("Inpatient Admission", admission)
			rate = flt(row.grand_total or row.cost) or None
			result = _create_medical_supervision_service_request(
				adm,
				template,
				amount=rate,
				continuous=False,
				billing_date=billing_date,
				bill=True,
			)
			created.append({"parent_service_request": row.name, **result})
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			failed.append({"service_request": row.name, "error": frappe.get_traceback().splitlines()[-1]})
			frappe.log_error(
				title=f"Daily medical supervision failed: {row.name}",
				message=frappe.get_traceback(),
			)

	return {
		"billing_date": str(billing_date),
		"created": created,
		"skipped": skipped,
		"failed": failed,
	}
