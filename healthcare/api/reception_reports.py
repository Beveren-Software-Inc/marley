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
	"""Sales Orders billed against an IP admission.

	Billing lists use ``custom_reference_type/name`` = Inpatient Admission.
	``custom_base_reference`` is the underlying source doc (Lab Test, Service Request,
	Discharge, etc.) — not the admission — so SOA must not filter on base alone.
	"""
	fields = [
		"name",
		"transaction_date",
		"discount_amount",
		"owner",
		"creation",
		"grand_total",
		"custom_reference_type",
		"custom_reference_name",
		"custom_base_reference",
		"custom_base_reference_name",
	]
	by_name = {}
	for filters in (
		{
			"custom_reference_type": "Inpatient Admission",
			"custom_reference_name": admission,
			"docstatus": ["<", 2],
		},
		{
			"custom_base_reference": "Inpatient Admission",
			"custom_base_reference_name": admission,
			"docstatus": ["<", 2],
		},
	):
		for row in frappe.get_all(
			"Sales Order",
			filters=filters,
			fields=fields,
			order_by="transaction_date",
			limit_page_length=0,
		):
			by_name[row.name] = row
	return sorted(by_name.values(), key=lambda r: (str(r.transaction_date or ""), str(r.creation or "")))


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


def _admission_sales_invoices(admission, so_names=None):
	"""Sales Invoices for an IP admission (by SO link and/or custom reference)."""
	names = set()
	so_names = [n for n in (so_names or []) if n]
	if so_names:
		for parent in frappe.get_all(
			"Sales Invoice Item",
			filters={"sales_order": ["in", so_names]},
			pluck="parent",
			limit_page_length=0,
		):
			if parent:
				names.add(parent)
	for filters in (
		{
			"custom_reference_type": "Inpatient Admission",
			"custom_reference_name": admission,
			"docstatus": ["<", 2],
			"is_return": 0,
		},
		{
			"custom_base_reference": "Inpatient Admission",
			"custom_base_reference_name": admission,
			"docstatus": ["<", 2],
			"is_return": 0,
		},
	):
		for name in frappe.get_all("Sales Invoice", filters=filters, pluck="name", limit_page_length=0):
			if name:
				names.add(name)
	if not names:
		return []
	return frappe.get_all(
		"Sales Invoice",
		filters={"name": ["in", list(names)], "docstatus": ["<", 2], "is_return": 0},
		fields=["name", "grand_total", "net_total", "total", "discount_amount", "posting_date"],
		order_by="posting_date",
		limit_page_length=0,
	)


def _soa_line_from_item(it, *, rate, amount, discount_amount, discount_percentage=0):
	return {
		"item_code": it.item_code,
		"item_name": it.item_name,
		"category": it.item_group or "Other Services",
		"rate": flt(rate),
		"discount_amount": flt(discount_amount),
		"discount_percentage": flt(discount_percentage),
		"qty": flt(it.qty),
		"amount": flt(amount),
	}


@frappe.whitelist()
def get_ip_statement_of_account(admission, from_date=None, to_date=None):
	"""Statement of Account for one IP case: services by category + bill totals.

	Prefers Sales Invoice lines (incl. item + additional/distributed discounts) when
	orders have been invoiced; otherwise falls back to Sales Order lines.
	"""
	if not admission or not frappe.db.exists("Inpatient Admission", admission):
		frappe.throw(_("Inpatient Admission not found"))

	adm = frappe.db.get_value(
		"Inpatient Admission",
		admission,
		[
			"name", "patient", "patient_name", "scheduled_date", "discharge_datetime",
			"cost_center", "admission_doctor_name", "case_no",
		],
		as_dict=True,
	)
	file_no = frappe.db.get_value("Patient", adm.patient, "file_no") if adm.patient else None

	start = getdate(adm.scheduled_date) if adm.scheduled_date else None
	end = getdate(adm.discharge_datetime) if adm.discharge_datetime else getdate(frappe.utils.today())
	days_charged = max((end - start).days, 1) if start else None

	sos = _admission_sales_orders(admission)
	so_names = [s.name for s in sos]
	invoices = _admission_sales_invoices(admission, so_names)
	si_names = [i.name for i in invoices]

	raw_lines = []
	invoiced_so_details = set()

	if si_names:
		si_items = frappe.get_all(
			"Sales Invoice Item",
			filters={"parent": ["in", si_names]},
			fields=[
				"item_code",
				"item_name",
				"item_group",
				"qty",
				"rate",
				"amount",
				"net_amount",
				"price_list_rate",
				"discount_amount",
				"discount_percentage",
				"distributed_discount_amount",
				"so_detail",
			],
			limit_page_length=0,
		)
		for it in si_items:
			if it.so_detail:
				invoiced_so_details.add(it.so_detail)
			item_disc = flt(it.discount_amount)
			distributed = flt(getattr(it, "distributed_discount_amount", None) or 0)
			line_disc = item_disc + distributed
			list_rate = flt(it.price_list_rate)
			if list_rate <= 0:
				list_rate = flt(it.rate) + item_disc
			# Net after item + additional (distributed) discounts
			net_amt = flt(it.net_amount)
			if net_amt <= 0 and line_disc > 0:
				net_amt = max(flt(it.amount) - distributed, 0)
			elif net_amt <= 0:
				net_amt = flt(it.amount)
			raw_lines.append(
				_soa_line_from_item(
					it,
					rate=list_rate,
					amount=net_amt,
					discount_amount=line_disc,
					discount_percentage=it.discount_percentage,
				)
			)

	if so_names:
		so_items = frappe.get_all(
			"Sales Order Item",
			filters={"parent": ["in", so_names]},
			fields=[
				"name",
				"item_code",
				"item_name",
				"item_group",
				"rate",
				"qty",
				"amount",
				"price_list_rate",
				"discount_amount",
				"discount_percentage",
			],
			limit_page_length=0,
		)
		for it in so_items:
			if it.name in invoiced_so_details:
				continue
			list_rate = flt(it.price_list_rate) or flt(it.rate) + flt(it.discount_amount)
			raw_lines.append(
				_soa_line_from_item(
					it,
					rate=list_rate,
					amount=flt(it.amount),
					discount_amount=flt(it.discount_amount),
					discount_percentage=it.discount_percentage,
				)
			)

	# Aggregate identical services: same item + display rate
	lines = {}
	for it in raw_lines:
		key = (it["item_code"], round(flt(it["rate"]), 6))
		row = lines.setdefault(
			key,
			{
				"item_code": it["item_code"],
				"item_name": it["item_name"],
				"category": it["category"],
				"rate": flt(it["rate"]),
				"discount_amount": 0.0,
				"discount_percentage": flt(it["discount_percentage"]),
				"qty": 0.0,
				"frequency": 0,
				"amount": 0.0,
			},
		)
		row["qty"] += flt(it["qty"])
		row["frequency"] += 1
		row["amount"] += flt(it["amount"])
		row["discount_amount"] += flt(it["discount_amount"])

	by_category = {}
	for row in lines.values():
		row["qty"] = round(row["qty"], 2)
		row["amount"] = round(row["amount"], 3)
		row["discount_amount"] = round(row["discount_amount"], 3)
		by_category.setdefault(row["category"], []).append(row)
	for rows in by_category.values():
		rows.sort(key=lambda r: -r["amount"])

	# Gross bill = net line amounts + all discounts shown on lines
	line_net = sum(flt(r["amount"]) for r in lines.values())
	line_discount = sum(flt(r["discount_amount"]) for r in lines.values())
	bill_total = round(line_net + line_discount, 3)
	discount_total = round(line_discount, 3)

	# Unbilled SO header discounts not already reflected on lines
	unbilled_so_header_disc = 0.0
	if sos:
		invoiced_sos = set()
		if si_names:
			invoiced_sos = set(
				frappe.get_all(
					"Sales Invoice Item",
					filters={"parent": ["in", si_names], "sales_order": ["is", "set"]},
					pluck="sales_order",
					limit_page_length=0,
				)
			)
		for so in sos:
			if so.name in invoiced_sos:
				continue
			unbilled_so_header_disc += flt(so.discount_amount)
	discount_total = round(discount_total + unbilled_so_header_disc, 3)
	bill_total = round(bill_total + unbilled_so_header_disc, 3)

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
		"discharge_date": str(adm.discharge_datetime)[:10] if adm.discharge_datetime else None,
		"days_charged": days_charged,
		"branch": (adm.cost_center or "").replace(" - SPH", "") or None,
		"categories": by_category,
		"bill_total": bill_total,
		"discount_total": discount_total,
		"paid_total": paid_total,
		"net_total": net_total,
		"balance": round(net_total - paid_total, 3),
	}
