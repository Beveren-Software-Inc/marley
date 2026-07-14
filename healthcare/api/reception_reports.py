"""Reception reports: Patient Receipts Summary, IP Payments & Discounts, IP Statement of Account.

Receipts are submitted Payment Entries. Each entry is attributed to a care episode by
following its references: Payment Entry -> Sales Invoice/Sales Order -> the Sales
Order's custom_base_reference (Patient Visit = OP, Inpatient Admission = IP, none =
Payment Only).
"""

import frappe
from frappe import _
from frappe.utils import flt, getdate


def _so_for_reference(reference_doctype, reference_name, cache):
	"""Resolve a PE reference row to a Sales Order name (directly or via invoice items)."""
	key = (reference_doctype, reference_name)
	if key in cache:
		return cache[key]
	so = None
	if reference_doctype == "Sales Order":
		so = reference_name
	elif reference_doctype == "Sales Invoice":
		so = frappe.db.get_value("Sales Invoice Item", {"parent": reference_name}, "sales_order")
	cache[key] = so
	return so


def _base_reference(so_name, cache):
	if not so_name:
		return (None, None, None, None)
	if so_name in cache:
		return cache[so_name]
	row = frappe.db.get_value(
		"Sales Order",
		so_name,
		["custom_base_reference", "custom_base_reference_name", "cost_center"],
		as_dict=True,
	)
	out = (
		(row.custom_base_reference, row.custom_base_reference_name, row.cost_center, None)
		if row
		else (None, None, None, None)
	)
	cache[so_name] = out
	return out


def _patient_for_customer(customer, cache):
	if not customer:
		return None
	if customer in cache:
		return cache[customer]
	patient = frappe.db.get_value("Patient", {"customer": customer}, "name")
	cache[customer] = patient
	return patient


def _patient_display(patient, cache):
	if not patient:
		return {"file_no": None, "patient_name": None}
	if patient in cache:
		return cache[patient]
	row = frappe.db.get_value("Patient", patient, ["file_no", "patient_name"], as_dict=True)
	out = {"file_no": row.file_no if row else None, "patient_name": row.patient_name if row else None}
	cache[patient] = out
	return out


def _full_name(user, cache):
	if not user:
		return None
	if user not in cache:
		cache[user] = frappe.utils.get_fullname(user)
	return cache[user]


@frappe.whitelist()
def get_patient_receipts_summary(from_date, to_date, cost_center=None):
	"""Patient Receipts Summary: OP / Payment Only / IP receipt rows + mode totals."""
	from healthcare.api.common import resolve_cost_center_filter

	if not from_date or not to_date:
		frappe.throw(_("From Date and To Date are required"))

	resolved_cc = resolve_cost_center_filter(cost_center)
	if resolved_cc is False:
		return {"op": [], "payment_only": [], "ip": [], "summary": {}, "grand_total": 0}

	entries = frappe.get_all(
		"Payment Entry",
		filters={
			"docstatus": 1,
			"payment_type": "Receive",
			"posting_date": ["between", [from_date, to_date]],
		},
		fields=[
			"name", "posting_date", "mode_of_payment", "party", "paid_amount",
			"reference_no", "reference_date", "owner", "creation",
		],
		order_by="posting_date, creation",
		limit_page_length=0,
	)
	if not entries:
		return {"op": [], "payment_only": [], "ip": [], "summary": {}, "grand_total": 0}

	refs = frappe.get_all(
		"Payment Entry Reference",
		filters={"parent": ["in", [e.name for e in entries]]},
		fields=["parent", "reference_doctype", "reference_name"],
		limit_page_length=0,
	)
	refs_by_pe = {}
	for r in refs:
		refs_by_pe.setdefault(r.parent, []).append(r)

	so_cache, base_cache, cust_cache, pat_cache, name_cache = {}, {}, {}, {}, {}
	booked_cache = {}
	allowed_cc = None
	if isinstance(resolved_cc, list):
		allowed_cc = set(resolved_cc)
	elif resolved_cc:
		allowed_cc = {resolved_cc}

	sections = {"op": [], "payment_only": [], "ip": []}
	summary = {}
	grand_total = 0.0

	for e in entries:
		base_ref = base_name = so_cc = so_patient = None
		for r in refs_by_pe.get(e.name, []):
			so = _so_for_reference(r.reference_doctype, r.reference_name, so_cache)
			base_ref, base_name, so_cc, so_patient = _base_reference(so, base_cache)
			if base_ref:
				break

		if allowed_cc is not None and so_cc and so_cc not in allowed_cc:
			continue

		patient = so_patient or _patient_for_customer(e.party, cust_cache)
		pdisp = _patient_display(patient, pat_cache)

		if base_ref == "Patient Visit":
			section, case_no = "op", base_name
		elif base_ref == "Inpatient Admission":
			section, case_no = "ip", base_name
		else:
			section, case_no = "payment_only", base_name

		# Visit Booked By = the creator of the Patient Visit / Inpatient Admission.
		booked_by = None
		if base_ref and base_name:
			bkey = (base_ref, base_name)
			if bkey not in booked_cache:
				owner = frappe.db.get_value(base_ref, base_name, "owner")
				booked_cache[bkey] = _full_name(owner, name_cache)
			booked_by = booked_cache[bkey]

		amount = flt(e.paid_amount)
		grand_total += amount
		mode = (e.mode_of_payment or "Other").upper()
		bucket = f"{'IP' if section == 'ip' else 'OP'} - {mode}"
		summary[bucket] = flt(summary.get(bucket, 0)) + amount

		# auto-generated references (PAY-...) are not real cheque numbers
		chq = e.reference_no if e.reference_no and not str(e.reference_no).startswith("PAY-") else None
		sections[section].append({
			"rv_no": e.name,
			"rv_date": str(e.posting_date),
			"payment_type": mode,
			"file_no": pdisp["file_no"],
			"patient_name": pdisp["patient_name"] or e.party,
			"chq_num": chq,
			"chq_date": str(e.reference_date) if chq and e.reference_date else None,
			"case_no": case_no,
			"visit_booked_by": booked_by,
			"received_by": _full_name(e.owner, name_cache),
			"received_date": str(e.creation)[:19],
			"amount": amount,
		})

	return {
		**sections,
		"totals": {k: round(sum(flt(r["amount"]) for r in v), 3) for k, v in sections.items()},
		"summary": {k: round(v, 3) for k, v in sorted(summary.items())},
		"grand_total": round(grand_total, 3),
	}


def _admission_sales_orders(admission):
	return frappe.get_all(
		"Sales Order",
		filters={
			"custom_base_reference": "Inpatient Admission",
			"custom_base_reference_name": admission,
			"docstatus": ["<", 2],
		},
		fields=["name", "transaction_date", "discount_amount", "owner", "creation", "grand_total"],
		order_by="transaction_date",
		limit_page_length=0,
	)


def _admission_payments(admission, from_date=None, to_date=None):
	"""Submitted receive Payment Entries allocated against the admission's SOs/SIs."""
	sos = [s.name for s in _admission_sales_orders(admission)]
	if not sos:
		return []
	sis = frappe.get_all(
		"Sales Invoice Item", filters={"sales_order": ["in", sos]}, pluck="parent", limit_page_length=0
	)
	ref_names = list(set(sos) | set(sis))
	if not ref_names:
		return []
	pe_names = frappe.get_all(
		"Payment Entry Reference",
		filters={"reference_name": ["in", ref_names]},
		pluck="parent",
		limit_page_length=0,
	)
	if not pe_names:
		return []
	filters = {"name": ["in", list(set(pe_names))], "docstatus": 1, "payment_type": "Receive"}
	if from_date and to_date:
		filters["posting_date"] = ["between", [from_date, to_date]]
	return frappe.get_all(
		"Payment Entry",
		filters=filters,
		fields=[
			"name", "posting_date", "mode_of_payment", "paid_amount",
			"reference_no", "reference_date", "owner", "creation",
		],
		order_by="posting_date, creation",
		limit_page_length=0,
	)


@frappe.whitelist()
def get_ip_payment_discounts(admission, from_date=None, to_date=None):
	"""IP Payments & Discounts for one admission (case)."""
	if not admission or not frappe.db.exists("Inpatient Admission", admission):
		frappe.throw(_("Inpatient Admission not found"))

	name_cache = {}
	discounts = []
	for so in _admission_sales_orders(admission):
		if not flt(so.discount_amount):
			continue
		if from_date and to_date and not (getdate(from_date) <= getdate(so.transaction_date) <= getdate(to_date)):
			continue
		discounts.append({
			"rv_no": so.name,
			"rv_date": str(so.transaction_date),
			"payment_type": None,
			"chq_num": None,
			"chq_date": None,
			"user": _full_name(so.owner, name_cache),
			"entry_date": str(so.creation)[:19],
			"amount": flt(so.discount_amount),
		})

	paid = []
	for e in _admission_payments(admission, from_date, to_date):
		chq = e.reference_no if e.reference_no and not str(e.reference_no).startswith("PAY-") else None
		paid.append({
			"rv_no": e.name,
			"rv_date": str(e.posting_date),
			"payment_type": (e.mode_of_payment or "").upper(),
			"chq_num": chq,
			"chq_date": str(e.reference_date) if chq and e.reference_date else None,
			"user": _full_name(e.owner, name_cache),
			"entry_date": str(e.creation)[:19],
			"amount": flt(e.paid_amount),
		})

	discount_total = round(sum(d["amount"] for d in discounts), 3)
	paid_total = round(sum(p["amount"] for p in paid), 3)
	return {
		"admission": admission,
		"discounts": discounts,
		"paid": paid,
		"discount_total": discount_total,
		"paid_total": paid_total,
		"gross_total": round(discount_total + paid_total, 3),
	}


@frappe.whitelist()
def get_ip_statement_of_account(admission, from_date=None, to_date=None):
	"""Statement of Account for one IP case: services by category + bill totals."""
	if not admission or not frappe.db.exists("Inpatient Admission", admission):
		frappe.throw(_("Inpatient Admission not found"))

	adm = frappe.db.get_value(
		"Inpatient Admission",
		admission,
		[
			"name", "patient", "patient_name", "scheduled_date", "discharge_date",
			"cost_center", "admission_doctor_name", "case_no",
		],
		as_dict=True,
	)
	file_no = frappe.db.get_value("Patient", adm.patient, "file_no") if adm.patient else None

	start = getdate(adm.scheduled_date) if adm.scheduled_date else None
	end = getdate(adm.discharge_date) if adm.discharge_date else getdate(frappe.utils.today())
	days_charged = max((end - start).days, 1) if start else None

	sos = _admission_sales_orders(admission)
	so_names = [s.name for s in sos]
	items = []
	if so_names:
		items = frappe.get_all(
			"Sales Order Item",
			filters={"parent": ["in", so_names]},
			fields=["item_code", "item_name", "item_group", "rate", "qty", "amount"],
			limit_page_length=0,
		)

	# Aggregate identical services: same item -> one line with frequency (count) / qty.
	lines = {}
	for it in items:
		key = (it.item_code, flt(it.rate))
		row = lines.setdefault(key, {
			"item_code": it.item_code,
			"item_name": it.item_name,
			"category": it.item_group or "Other Services",
			"rate": flt(it.rate),
			"qty": 0.0,
			"frequency": 0,
			"amount": 0.0,
		})
		row["qty"] += flt(it.qty)
		row["frequency"] += 1
		row["amount"] += flt(it.amount)

	by_category = {}
	for row in lines.values():
		row["qty"] = round(row["qty"], 2)
		row["amount"] = round(row["amount"], 3)
		by_category.setdefault(row["category"], []).append(row)
	for rows in by_category.values():
		rows.sort(key=lambda r: -r["amount"])

	bill_total = round(sum(flt(s.grand_total) + flt(s.discount_amount) for s in sos), 3)
	discount_total = round(sum(flt(s.discount_amount) for s in sos), 3)
	paid_total = round(sum(flt(e.paid_amount) for e in _admission_payments(admission)), 3)
	net_total = round(bill_total - discount_total, 3)

	return {
		"admission": adm.name,
		"case_no": adm.case_no or adm.name,
		"patient": adm.patient,
		"patient_name": adm.patient_name,
		"file_no": file_no,
		"doctor_name": adm.admission_doctor_name,
		"admission_date": str(adm.scheduled_date) if adm.scheduled_date else None,
		"discharge_date": str(adm.discharge_date) if adm.discharge_date else None,
		"days_charged": days_charged,
		"branch": (adm.cost_center or "").replace(" - SPH", "") or None,
		"categories": by_category,
		"bill_total": bill_total,
		"discount_total": discount_total,
		"paid_total": paid_total,
		"net_total": net_total,
		"balance": round(net_total - paid_total, 3),
	}
