# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

"""Discharge finance checklist APIs for Accounts (Frappe desk page)."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, now_datetime

from healthcare.healthcare.discharge_checklist_permissions import (
	is_accounts_checklist_row,
	user_can_edit_checklist_row,
)

FINANCE_DISCHARGE_ROLES = frozenset(
	{
		"Administrator",
		"System Manager",
		"Accounts Manager",
		"Accounts User",
	}
)


def _user_can_access_finance_discharge_checklist(user: str | None = None) -> bool:
	user = user or frappe.session.user
	if not user or user == "Guest":
		return False
	roles = set(frappe.get_roles(user))
	if FINANCE_DISCHARGE_ROLES & roles:
		return True
	from healthcare.healthcare.discharge_checklist_permissions import _is_admin_user

	return _is_admin_user(user)


def _ensure_finance_discharge_portal_access() -> None:
	if not _user_can_access_finance_discharge_checklist():
		frappe.throw(_("Not permitted to access discharge financial checklist"), frappe.PermissionError)


def _ensure_finance_discharge_admission_access(admission_name: str) -> None:
	"""Allow Accounts roles without Healthcare / Inpatient Admission DocPerm."""
	_ensure_finance_discharge_portal_access()

	admission_name = (admission_name or "").strip()
	if not admission_name:
		frappe.throw(_("Admission is required"))

	if not frappe.db.exists("Inpatient Admission", admission_name):
		frappe.throw(_("Inpatient Admission {0} not found").format(admission_name))

	if frappe.has_permission("Inpatient Admission", "read", admission_name):
		return

	# Accounts desk page: full visibility across branches (no cost-center User Permission gate).
	if set(frappe.get_roles()) & FINANCE_DISCHARGE_ROLES:
		return

	from healthcare.api.common import get_permitted_cost_centers

	permitted_cc = get_permitted_cost_centers()
	if permitted_cc is None:
		return

	if not permitted_cc:
		frappe.throw(_("Not permitted to access this admission"), frappe.PermissionError)

	admission_cc = frappe.db.get_value("Inpatient Admission", admission_name, "cost_center")
	if admission_cc and admission_cc not in permitted_cc:
		frappe.throw(_("Not permitted to access this admission"), frappe.PermissionError)


def _is_accounts_finance_page_row(row) -> bool:
	"""Rows the Accounts desk page may view/complete (Accounts dept or Final Financial Check)."""
	if is_accounts_checklist_row(row):
		return True
	from healthcare.healthcare.discharge_checklist_status import is_final_financial_check_item

	return is_final_financial_check_item(row.get("action_required"))


def _accounts_discharge_checklist_rows(discharge_doc) -> list[dict]:
	"""Accounts / finance sign-off rows on an in-progress discharge."""
	from healthcare.api.inpatient_admission import _serialize_discharge_draft_for_portal

	draft = _serialize_discharge_draft_for_portal(discharge_doc)
	return [
		row
		for row in (draft.get("discharge_checklist") or [])
		if _is_accounts_finance_page_row(row)
	]


def _user_can_complete_accounts_row(row) -> bool:
	if not _is_accounts_finance_page_row(row):
		return False
	if _user_can_access_finance_discharge_checklist():
		return True
	return user_can_edit_checklist_row(row)


def _format_discharge_date(discharge_row) -> str | None:
	"""Best display date for a discharge list row."""
	for field in ("discharge_date", "final_discharge_date"):
		val = discharge_row.get(field) if isinstance(discharge_row, dict) else getattr(discharge_row, field, None)
		if val:
			return str(getdate(val))
	for field in ("modified", "creation"):
		val = discharge_row.get(field) if isinstance(discharge_row, dict) else getattr(discharge_row, field, None)
		if val:
			return str(getdate(val))
	return None


def _discharge_matches_date_filter(discharge_row, from_date=None, to_date=None) -> bool:
	if not from_date and not to_date:
		return True
	discharge_date = _format_discharge_date(discharge_row)
	if not discharge_date:
		return False
	d = getdate(discharge_date)
	if from_date and d < getdate(from_date):
		return False
	if to_date and d > getdate(to_date):
		return False
	return True


def _format_admission_date(admission_name: str) -> str | None:
	from healthcare.healthcare.doctype.inpatient_admission.inpatient_admission import resolve_admission_datetime

	row = frappe.db.get_value(
		"Inpatient Admission",
		admission_name,
		["admitted_datetime", "admission_date", "admission_time"],
		as_dict=True,
	)
	if not row:
		return None
	adm_dt = resolve_admission_datetime(
		row.get("admitted_datetime"),
		row.get("admission_date"),
		row.get("admission_time"),
	)
	if not adm_dt:
		return None
	return str(getdate(adm_dt))


_INVOICE_SUMMARY_FIELDS = [
	"name",
	"grand_total",
	"outstanding_amount",
	"posting_date",
	"status",
	"docstatus",
]


def _invoice_effective_outstanding(inv) -> float:
	"""Draft invoices are unpaid; use grand total when outstanding is not set."""
	total = flt(inv.get("grand_total") if isinstance(inv, dict) else getattr(inv, "grand_total", 0))
	outstanding = flt(
		inv.get("outstanding_amount") if isinstance(inv, dict) else getattr(inv, "outstanding_amount", 0)
	)
	docstatus = cint(inv.get("docstatus") if isinstance(inv, dict) else getattr(inv, "docstatus", 1))
	if docstatus == 0:
		return outstanding if outstanding > 0 else total
	return outstanding


def _collect_admission_invoices(admission_name: str, patient: str | None = None) -> list[dict]:
	"""Draft and submitted Sales Invoices linked to an admission (or its discharge)."""
	from healthcare.api.billing import _sales_invoice_filters_for_reference

	by_name: dict[str, dict] = {}
	docstatus_filter = ["in", [0, 1]]

	def add_rows(rows):
		for inv in rows or []:
			name = inv.get("name") if isinstance(inv, dict) else getattr(inv, "name", None)
			if name and name not in by_name:
				by_name[name] = inv if isinstance(inv, dict) else inv.as_dict()

	inv_filters = _sales_invoice_filters_for_reference(
		"Inpatient Admission", admission_name, submitted_only=False
	)
	add_rows(
		frappe.get_all(
			"Sales Invoice",
			filters=inv_filters,
			fields=_INVOICE_SUMMARY_FIELDS,
			ignore_permissions=True,
		)
	)

	add_rows(
		frappe.get_all(
			"Sales Invoice",
			filters={"custom_reference_name": admission_name, "docstatus": docstatus_filter},
			fields=_INVOICE_SUMMARY_FIELDS,
			ignore_permissions=True,
		)
	)

	for discharge_name in frappe.get_all(
		"Discharge",
		filters={"admission": admission_name, "docstatus": ["in", [0, 1]]},
		pluck="name",
		ignore_permissions=True,
	):
		for ref_filters in (
			{
				"custom_base_reference": "Discharge",
				"custom_base_reference_name": discharge_name,
				"docstatus": docstatus_filter,
			},
			{
				"custom_reference_type": "Discharge",
				"custom_reference_name": discharge_name,
				"docstatus": docstatus_filter,
			},
		):
			add_rows(
				frappe.get_all(
					"Sales Invoice",
					filters=ref_filters,
					fields=_INVOICE_SUMMARY_FIELDS,
					ignore_permissions=True,
				)
			)

	if not by_name and patient:
		add_rows(
			frappe.get_all(
				"Sales Invoice",
				filters={"patient": patient, "docstatus": docstatus_filter},
				fields=_INVOICE_SUMMARY_FIELDS,
				order_by="posting_date desc, creation desc",
				limit=20,
				ignore_permissions=True,
			)
		)

	return list(by_name.values())


def _get_admission_invoice_summary(admission_name: str, patient: str | None = None) -> dict:
	"""Sales Invoice totals linked to this inpatient admission (draft and submitted)."""
	invoices = _collect_admission_invoices(admission_name, patient)

	total = sum(flt(inv.get("grand_total")) for inv in invoices)
	outstanding = sum(_invoice_effective_outstanding(inv) for inv in invoices)
	latest = max(invoices, key=lambda x: x.get("posting_date") or "") if invoices else None
	draft_count = sum(1 for inv in invoices if cint(inv.get("docstatus")) == 0)
	return {
		"invoice_count": len(invoices),
		"draft_invoice_count": draft_count,
		"invoice_total": total,
		"outstanding_amount": outstanding,
		"paid_amount": total - outstanding,
		"latest_invoice": latest.get("name") if latest else None,
		"latest_invoice_date": latest.get("posting_date") if latest else None,
	}


@frappe.whitelist()
def list_finance_discharge_pending(limit=25, from_date=None, to_date=None, pending_only=1):
	"""Draft discharges with Accounts / finance checklist lines (optional discharge date filter)."""
	_ensure_finance_discharge_portal_access()

	limit = min(cint(limit) or 25, 200)
	pending_only = cint(pending_only)

	rows = frappe.get_all(
		"Discharge",
		filters={"docstatus": 0},
		fields=[
			"name",
			"admission",
			"file_no",
			"patient_name",
			"modified",
			"creation",
			"cost_center",
			"discharge_date",
			"final_discharge_date",
		],
		order_by="modified desc",
		limit=limit * 10,
		ignore_permissions=True,
	)
	out = []
	for row in rows:
		if not row.admission:
			continue
		if not _discharge_matches_date_filter(row, from_date, to_date):
			continue
		try:
			_ensure_finance_discharge_admission_access(row.admission)
		except Exception:
			continue
		adm_status = frappe.db.get_value("Inpatient Admission", row.admission, "status")
		discharge_doc = frappe.get_doc("Discharge", row.name, ignore_permissions=True)
		finance_rows = _accounts_discharge_checklist_rows(discharge_doc)
		if not finance_rows:
			continue
		pending = sum(1 for r in finance_rows if not cint(r.get("click")))
		if pending_only and pending == 0:
			continue
		invoice_summary = _get_admission_invoice_summary(row.admission, row.file_no)
		out.append(
			{
				"admission": row.admission,
				"discharge_name": row.name,
				"patient": row.file_no,
				"patient_name": row.patient_name,
				"cost_center": row.cost_center,
				"admission_date": _format_admission_date(row.admission),
				"discharge_date": _format_discharge_date(row),
				"admission_status": adm_status,
				"pending_count": pending,
				"total_count": len(finance_rows),
				**invoice_summary,
			}
		)
		if len(out) >= limit:
			break
	return out


def _get_draft_discharge_for_finance(admission_name: str):
	"""Load an existing draft Discharge without creating one (clinical team starts discharge)."""
	from healthcare.api.inpatient_admission import _get_draft_discharge_name, _get_submitted_discharge_name

	_ensure_finance_discharge_admission_access(admission_name)

	if _get_submitted_discharge_name(admission_name):
		frappe.throw(_("This admission has already been discharged."))

	draft_name = _get_draft_discharge_name(admission_name)
	if not draft_name:
		frappe.throw(_("No discharge draft found for this admission. Clinical staff must start discharge first."))

	return frappe.get_doc("Discharge", draft_name, ignore_permissions=True)


@frappe.whitelist()
def get_finance_discharge_checklist(admission_name):
	"""Finance checklist lines for one admission."""
	admission_name = (admission_name or "").strip()
	if not admission_name:
		frappe.throw(_("Admission is required"))

	discharge_doc = _get_draft_discharge_for_finance(admission_name)
	finance_rows = _accounts_discharge_checklist_rows(discharge_doc)

	admission = frappe.db.get_value(
		"Inpatient Admission",
		admission_name,
		["patient", "patient_name", "status", "cost_center"],
		as_dict=True,
	) or {}

	pending = sum(1 for r in finance_rows if not cint(r.get("click")))
	completed = sum(1 for r in finance_rows if cint(r.get("click")))
	invoice_summary = _get_admission_invoice_summary(admission_name, admission.get("patient"))

	return {
		"admission": admission_name,
		"patient": admission.get("patient"),
		"patient_name": admission.get("patient_name"),
		"admission_status": admission.get("status"),
		"admission_date": _format_admission_date(admission_name),
		"discharge_date": _format_discharge_date(discharge_doc),
		"cost_center": admission.get("cost_center") or discharge_doc.get("cost_center"),
		"discharge_name": discharge_doc.name,
		"checklist_items": finance_rows,
		"pending_count": pending,
		"completed_count": completed,
		**invoice_summary,
	}


@frappe.whitelist()
def save_finance_discharge_checklist(admission_name, checklist):
	"""Save finance checklist ticks (Final Financial Check, Billing Finalization, etc.)."""
	from healthcare.api.inpatient_admission import (
		_apply_discharge_payload,
		_serialize_discharge_draft_for_portal,
	)

	admission_name = (admission_name or "").strip()
	if not admission_name:
		frappe.throw(_("Admission is required"))

	discharge_doc = _get_draft_discharge_for_finance(admission_name)
	current = _serialize_discharge_draft_for_portal(discharge_doc)
	all_rows = list(current.get("discharge_checklist") or [])

	updates = frappe.parse_json(checklist) if isinstance(checklist, str) else (checklist or [])
	update_by_name = {str(r.get("name")): r for r in updates if isinstance(r, dict) and r.get("name")}

	user = frappe.session.user
	full_name = frappe.db.get_value("User", user, "full_name") or user
	now = now_datetime()

	merged = []
	for row in all_rows:
		row_name = str(row.get("name") or "")
		if row_name in update_by_name and _user_can_complete_accounts_row(row):
			updated = dict(row)
			patch = update_by_name[row_name]
			for field in ("click", "user", "name1", "date_time", "description"):
				if field in patch:
					updated[field] = patch[field]
			if cint(updated.get("click")) and not updated.get("date_time"):
				updated["date_time"] = now
			if cint(updated.get("click")) and not updated.get("user"):
				updated["user"] = user
			if cint(updated.get("click")) and not updated.get("name1"):
				updated["name1"] = full_name
			merged.append(updated)
		else:
			merged.append(row)

	_apply_discharge_payload(discharge_doc, {"discharge_checklist": merged})
	discharge_doc.flags.ignore_links = True
	discharge_doc.save(ignore_permissions=True)
	frappe.db.commit()

	return get_finance_discharge_checklist(admission_name)


def resolve_admission_from_sales_invoice(sales_invoice_name: str) -> str | None:
	"""Find the inpatient admission linked to a Sales Invoice / in-progress discharge."""
	sales_invoice_name = (sales_invoice_name or "").strip()
	if not sales_invoice_name:
		return None

	inv = frappe.get_doc("Sales Invoice", sales_invoice_name)
	patient = (inv.get("patient") or "").strip()
	if not patient:
		return None

	for ref_type_field, ref_name_field in (
		("custom_base_reference", "custom_base_reference_name"),
		("custom_reference_type", "custom_reference_name"),
	):
		ref_type = (inv.get(ref_type_field) or "").strip()
		ref_name = (inv.get(ref_name_field) or "").strip()
		if ref_type == "Inpatient Admission" and ref_name:
			return ref_name
		if ref_type == "Discharge" and ref_name:
			admission = frappe.db.get_value("Discharge", ref_name, "admission")
			if admission:
				return admission

	draft_rows = frappe.get_all(
		"Discharge",
		filters={"file_no": patient, "docstatus": 0},
		fields=["admission", "modified"],
		order_by="modified desc",
		limit=1,
		ignore_permissions=True,
	)
	if draft_rows and draft_rows[0].admission:
		return draft_rows[0].admission

	active_rows = frappe.get_all(
		"Inpatient Admission",
		filters={"patient": patient, "status": ["in", ["Admitted", "Discharge Scheduled"]]},
		fields=["name"],
		order_by="modified desc",
		limit=1,
		ignore_permissions=True,
	)
	return active_rows[0].name if active_rows else None


def _mark_final_financial_check_rows(discharge_doc) -> list[str]:
	"""Mark Final Financial Check rows on a discharge draft; returns updated row names."""
	from healthcare.api.inpatient_admission import (
		_apply_discharge_payload,
		_serialize_discharge_draft_for_portal,
	)

	current = _serialize_discharge_draft_for_portal(discharge_doc)
	all_rows = list(current.get("discharge_checklist") or [])
	user = frappe.session.user
	full_name = frappe.db.get_value("User", user, "full_name") or user
	now = now_datetime()
	updated_names: list[str] = []

	merged = []
	for row in all_rows:
		if not _is_accounts_finance_page_row(row):
			merged.append(row)
			continue
		if not _user_can_complete_accounts_row(row):
			merged.append(row)
			continue
		updated = dict(row)
		if not cint(updated.get("click")):
			updated["click"] = 1
			updated["user"] = user
			updated["name1"] = full_name
			updated["date_time"] = now
			if updated.get("name"):
				updated_names.append(str(updated["name"]))
		merged.append(updated)

	if not updated_names:
		return []

	_apply_discharge_payload(discharge_doc, {"discharge_checklist": merged})
	discharge_doc.flags.ignore_links = True
	discharge_doc.save(ignore_permissions=True)
	frappe.db.commit()
	return updated_names


@frappe.whitelist()
def complete_final_financial_check_from_sales_invoice(sales_invoice):
	"""Mark Final Financial Check on the patient's latest discharge draft (from Sales Invoice)."""
	_ensure_finance_discharge_portal_access()

	sales_invoice = (sales_invoice or "").strip()
	if not sales_invoice:
		frappe.throw(_("Sales Invoice is required"))
	if not frappe.db.exists("Sales Invoice", sales_invoice):
		frappe.throw(_("Sales Invoice {0} not found").format(sales_invoice))

	admission = resolve_admission_from_sales_invoice(sales_invoice)
	if not admission:
		frappe.throw(
			_(
				"No in-progress inpatient discharge found for this patient. "
				"Clinical staff must start discharge first."
			)
		)

	discharge_doc = _get_draft_discharge_for_finance(admission)
	updated = _mark_final_financial_check_rows(discharge_doc)
	if not updated:
		frappe.throw(_("No pending Accounts checklist item found on this discharge."))

	return {
		"admission": admission,
		"discharge_name": discharge_doc.name,
		"sales_invoice": sales_invoice,
		"updated_rows": updated,
	}
