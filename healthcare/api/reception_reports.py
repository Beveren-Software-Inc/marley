"""Reception reports: Patient Receipts Summary, IP Payments & Discounts,
IP / OP Statement of Account.

Receipts are submitted Payment Entries. Each entry is attributed to a care episode by
following its references: Payment Entry -> Sales Invoice/Sales Order -> the Sales
Order's custom_base_reference (Patient Visit = OP, Inpatient Admission = IP, none =
Payment Only).
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate


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

	Package mid-stay charges may only be linked via Package Detail / Quotation
	(when SO references were not copied) — those are included too.
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

	# Package Detail → Sales Order (Charge Package to Today / admit package)
	if frappe.db.has_column("Package Detail", "sales_order"):
		pd_sos = frappe.get_all(
			"Package Detail",
			filters={"admission_no": admission, "sales_order": ["is", "set"]},
			pluck="sales_order",
			limit_page_length=0,
		)
		missing = [n for n in set(pd_sos or []) if n and n not in by_name]
		if missing:
			for row in frappe.get_all(
				"Sales Order",
				filters={"name": ["in", missing], "docstatus": ["<", 2]},
				fields=fields,
				limit_page_length=0,
			):
				by_name[row.name] = row

	# Package Quotation → Sales Order Item.prevdoc_docname
	quote_names = frappe.get_all(
		"Quotation",
		filters={
			"custom_inpatient_admission": admission,
			"docstatus": 1,
			"custom_package": ["is", "set"],
		},
		pluck="name",
		limit_page_length=0,
	)
	if quote_names:
		so_from_q = frappe.get_all(
			"Sales Order Item",
			filters={"prevdoc_docname": ["in", quote_names], "docstatus": ["<", 2]},
			pluck="parent",
			limit_page_length=0,
		)
		missing = [n for n in set(so_from_q or []) if n and n not in by_name]
		if missing:
			for row in frappe.get_all(
				"Sales Order",
				filters={"name": ["in", missing], "docstatus": ["<", 2]},
				fields=fields,
				limit_page_length=0,
			):
				by_name[row.name] = row

	return sorted(by_name.values(), key=lambda r: (str(r.transaction_date or ""), str(r.creation or "")))


def _admission_package_quotation_lines(admission):
	"""Package Quotation item lines not yet covered by a Sales Order (SOA fallback).

	When 'Create Sales Order on Quotation Submission' is off, Package Detail still
	marks days billed but SOA would otherwise miss the charge.
	"""
	quotes = frappe.get_all(
		"Quotation",
		filters={
			"custom_inpatient_admission": admission,
			"docstatus": 1,
			"custom_package": ["is", "set"],
		},
		fields=["name", "transaction_date"],
		limit_page_length=0,
	)
	if not quotes:
		return []

	qnames = [q.name for q in quotes]
	linked = set(
		frappe.get_all(
			"Sales Order Item",
			filters={"prevdoc_docname": ["in", qnames], "docstatus": ["<", 2]},
			pluck="prevdoc_docname",
			limit_page_length=0,
		)
		or []
	)

	lines = []
	for q in quotes:
		if q.name in linked:
			continue
		items = frappe.get_all(
			"Quotation Item",
			filters={"parent": q.name},
			fields=[
				"item_code",
				"item_name",
				"item_group",
				"qty",
				"rate",
				"amount",
				"price_list_rate",
				"discount_amount",
				"discount_percentage",
			],
			limit_page_length=0,
		)
		for it in items:
			list_rate = flt(it.price_list_rate) or flt(it.rate) + flt(it.discount_amount)
			lines.append(
				_soa_line_from_item(
					it,
					rate=list_rate,
					amount=flt(it.amount),
					discount_amount=flt(it.discount_amount),
					discount_percentage=it.discount_percentage,
				)
			)
	return lines


def _case_tagged_payments(case_no, from_date=None, to_date=None):
	"""Receive Payment Entries tagged to a visit/admission (advance or history)."""
	case_no = (case_no or "").strip()
	if not case_no:
		return []
	if not frappe.get_meta("Payment Entry").has_field("custom_case_no"):
		return []
	filters = {
		"docstatus": 1,
		"payment_type": "Receive",
		"custom_case_no": case_no,
	}
	if from_date and to_date:
		filters["posting_date"] = ["between", [from_date, to_date]]
	return frappe.get_all(
		"Payment Entry",
		filters=filters,
		fields=[
			"name",
			"posting_date",
			"mode_of_payment",
			"paid_amount",
			"unallocated_amount",
			"reference_no",
			"reference_date",
			"owner",
			"creation",
		],
		order_by="posting_date, creation",
		limit_page_length=0,
	)


def _merge_payment_entries(*groups):
	"""Dedupe Payment Entry rows by name (keep first)."""
	seen = set()
	out = []
	for group in groups:
		for e in group or []:
			name = e.get("name") if hasattr(e, "get") else getattr(e, "name", None)
			if not name or name in seen:
				continue
			seen.add(name)
			out.append(e)
	return out


def _admission_payments(admission, from_date=None, to_date=None):
	"""Submitted receive Payment Entries for an admission (allocated + case-tagged)."""
	sos = [s.name for s in _admission_sales_orders(admission)]
	allocated = []
	if sos:
		sis = frappe.get_all(
			"Sales Invoice Item", filters={"sales_order": ["in", sos]}, pluck="parent", limit_page_length=0
		)
		ref_names = list(set(sos) | set(sis))
		if ref_names:
			pe_names = frappe.get_all(
				"Payment Entry Reference",
				filters={"reference_name": ["in", ref_names]},
				pluck="parent",
				limit_page_length=0,
			)
			if pe_names:
				filters = {"name": ["in", list(set(pe_names))], "docstatus": 1, "payment_type": "Receive"}
				if from_date and to_date:
					filters["posting_date"] = ["between", [from_date, to_date]]
				allocated = frappe.get_all(
					"Payment Entry",
					filters=filters,
					fields=[
						"name", "posting_date", "mode_of_payment", "paid_amount",
						"reference_no", "reference_date", "owner", "creation",
					],
					order_by="posting_date, creation",
					limit_page_length=0,
				)
	tagged = _case_tagged_payments(admission, from_date, to_date)
	return _merge_payment_entries(allocated, tagged)


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


def _soa_is_lab_item(item_code, item_group=None, base_reference=None):
	"""Lab billing lines collapse to a single 'Lab test' SOA row."""
	br = (base_reference or "").strip()
	if br in ("Lab Test", "Lab Test Template"):
		return True
	ig = (item_group or "").strip().lower()
	if not ig and item_code:
		ig = (frappe.db.get_value("Item", item_code, "item_group") or "").strip().lower()
	if ig in ("lab test", "lab tests", "laboratory") or "lab test" in ig:
		return True
	if item_code and frappe.db.exists("Lab Test Template", {"item": item_code}):
		return True
	return False


def _soa_is_medicine_item(item_code, item_group=None, base_reference=None):
	"""
	Medicine / pharmacy stock on SOA → single 'Medicine' row.

	Primary source: Sales Orders from Patient Medication Order (stock drugs).
	Fallback: stock items in a pharmacy / medicine item group.
	"""
	br = (base_reference or "").strip()
	if br == "Patient Medication Order":
		return True
	if not item_code or _soa_is_lab_item(item_code, item_group=item_group, base_reference=base_reference):
		return False
	row = frappe.db.get_value("Item", item_code, ["is_stock_item", "item_group"], as_dict=True)
	if not row or not cint(row.is_stock_item):
		return False
	ig = (row.item_group or item_group or "").strip().lower()
	return any(h in ig for h in ("medic", "pharma", "drug", "pharmacy"))


def _soa_line_from_item(it, *, rate, amount, discount_amount, discount_percentage=0, base_reference=None):
	"""One SOA raw line. Labs → Lab test; PMO/stock meds → Medicine (print summary)."""
	code = getattr(it, "item_code", None) or (it.get("item_code") if isinstance(it, dict) else None)
	name = getattr(it, "item_name", None) or (it.get("item_name") if isinstance(it, dict) else None)
	group = getattr(it, "item_group", None) or (it.get("item_group") if isinstance(it, dict) else None)
	qty = getattr(it, "qty", None)
	if qty is None and isinstance(it, dict):
		qty = it.get("qty")

	if _soa_is_lab_item(code, item_group=group, base_reference=base_reference):
		code, name, group = "Lab test", "Lab test", "Lab test"
		rate = None
	elif _soa_is_medicine_item(code, item_group=group, base_reference=base_reference):
		code, name, group = "Medicine", "Medicine", "Medicine"
		rate = None

	return {
		"item_code": code,
		"item_name": name,
		"category": group or "Other Services",
		"rate": None if rate is None else flt(rate),
		"discount_amount": flt(discount_amount),
		"discount_percentage": flt(discount_percentage),
		"qty": flt(qty),
		"amount": flt(amount),
	}


def _soa_bucket_raw_lines(raw_lines):
	"""Aggregate SOA lines: Lab test / Medicine collapse to one row each; else by item+rate."""
	lines = {}
	for it in raw_lines or []:
		code = it.get("item_code")
		if code in ("Lab test", "Medicine", "Lab Tests", "Medicines"):
			# Normalize legacy labels from any leftover callers
			if code in ("Lab Tests", "Lab test"):
				code = "Lab test"
				it = {**it, "item_code": code, "item_name": code, "category": code}
			else:
				code = "Medicine"
				it = {**it, "item_code": code, "item_name": code, "category": code}
			key = (code,)
			display_rate = None
		else:
			key = (code, round(flt(it["rate"]), 6))
			display_rate = flt(it["rate"])
		row = lines.setdefault(
			key,
			{
				"item_code": code,
				"item_name": it["item_name"],
				"category": it["category"],
				"rate": display_rate,
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
	return lines


def _soa_so_base_map(sos):
	return {
		s.name: getattr(s, "custom_base_reference", None)
		for s in (sos or [])
		if getattr(s, "name", None)
	}


def _soa_base_for_si_item(it, so_base_map, so_detail_parent=None):
	"""Resolve Patient Medication Order / Lab Test base ref from linked Sales Order."""
	so = getattr(it, "sales_order", None)
	if so:
		if so in so_base_map:
			return so_base_map[so]
		return frappe.db.get_value("Sales Order", so, "custom_base_reference")
	detail = getattr(it, "so_detail", None)
	if detail and so_detail_parent:
		parent = so_detail_parent.get(detail)
		if parent:
			if parent in so_base_map:
				return so_base_map[parent]
			return frappe.db.get_value("Sales Order", parent, "custom_base_reference")
	return None


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
	so_base_map = _soa_so_base_map(sos)
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
				"sales_order",
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
					base_reference=_soa_base_for_si_item(it, so_base_map),
				)
			)

	if so_names:
		so_items = frappe.get_all(
			"Sales Order Item",
			filters={"parent": ["in", so_names]},
			fields=[
				"name",
				"parent",
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
					base_reference=so_base_map.get(it.parent),
				)
			)

	# Package quotations with no Sales Order (settings off / mapping failed)
	raw_lines.extend(_admission_package_quotation_lines(admission))

	# Aggregate: Lab test / Medicine one line each; other services by item + rate
	lines = _soa_bucket_raw_lines(raw_lines)
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

	paid_entries = _admission_payments(admission)
	net_total = round(bill_total - discount_total, 3)
	pay_block = _soa_payment_payload(paid_entries, adm.patient, case_no=adm.name)
	paid_total = flt(pay_block.get("paid_total"))

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
		**pay_block,
	}


def _reference_sales_orders(doctype: str, name: str):
	"""Sales Orders billed against a Patient Visit or Inpatient Admission."""
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
			"custom_reference_type": doctype,
			"custom_reference_name": name,
			"docstatus": ["<", 2],
		},
		{
			"custom_base_reference": doctype,
			"custom_base_reference_name": name,
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


def _visit_sales_orders(visit: str):
	return _reference_sales_orders("Patient Visit", visit)


def _visit_sales_invoices(visit: str, so_names=None):
	"""Sales Invoices for an OP visit (by SO link and/or custom reference)."""
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
			"custom_reference_type": "Patient Visit",
			"custom_reference_name": visit,
			"docstatus": ["<", 2],
			"is_return": 0,
		},
		{
			"custom_base_reference": "Patient Visit",
			"custom_base_reference_name": visit,
			"docstatus": ["<", 2],
			"is_return": 0,
		},
	):
		for inv in frappe.get_all("Sales Invoice", filters=filters, pluck="name", limit_page_length=0):
			if inv:
				names.add(inv)
	if not names:
		return []
	return frappe.get_all(
		"Sales Invoice",
		filters={"name": ["in", list(names)], "docstatus": ["<", 2], "is_return": 0},
		fields=["name", "grand_total", "net_total", "total", "discount_amount", "posting_date"],
		order_by="posting_date",
		limit_page_length=0,
	)


def _visit_payments(visit: str, from_date=None, to_date=None):
	"""Submitted receive Payment Entries for a visit (allocated + case-tagged)."""
	sos = [s.name for s in _visit_sales_orders(visit)]
	allocated = []
	if sos:
		sis = frappe.get_all(
			"Sales Invoice Item", filters={"sales_order": ["in", sos]}, pluck="parent", limit_page_length=0
		)
		ref_names = list(set(sos) | set(sis))
		if ref_names:
			pe_names = frappe.get_all(
				"Payment Entry Reference",
				filters={"reference_name": ["in", ref_names]},
				pluck="parent",
				limit_page_length=0,
			)
			if pe_names:
				filters = {"name": ["in", list(set(pe_names))], "docstatus": 1, "payment_type": "Receive"}
				if from_date and to_date:
					filters["posting_date"] = ["between", [from_date, to_date]]
				allocated = frappe.get_all(
					"Payment Entry",
					filters=filters,
					fields=[
						"name", "posting_date", "mode_of_payment", "paid_amount",
						"reference_no", "reference_date", "owner", "creation",
					],
					order_by="posting_date, creation",
					limit_page_length=0,
				)
	tagged = _case_tagged_payments(visit, from_date, to_date)
	return _merge_payment_entries(allocated, tagged)


def _payments_by_mode(entries):
	"""Aggregate Payment Entries into [{mode, amount}, ...] + detail rows."""
	by_mode = {}
	details = []
	for e in entries or []:
		mode = (e.get("mode_of_payment") or "Other").strip() or "Other"
		amt = flt(e.get("paid_amount"))
		by_mode[mode] = by_mode.get(mode, 0.0) + amt
		details.append(
			{
				"rv_no": e.get("name"),
				"rv_date": str(e.get("posting_date") or ""),
				"mode_of_payment": mode,
				"amount": round(amt, 3),
				"status": "Paid",
			}
		)
	modes = [
		{"mode": m, "amount": round(a, 3)}
		for m, a in sorted(by_mode.items(), key=lambda x: (-x[1], x[0]))
	]
	return modes, details


def _soa_patient_advances(patient, case_no=None):
	"""Unallocated Receive payments = patient advance credit still held on account.
	Shown on SOA as Paid (not yet applied to invoices).
	"""
	if not patient:
		return [], 0.0
	customer = frappe.db.get_value("Patient", patient, "customer")
	if not customer:
		return [], 0.0

	pe_meta = frappe.get_meta("Payment Entry")
	fields = [
		"name",
		"posting_date",
		"mode_of_payment",
		"paid_amount",
		"unallocated_amount",
	]
	has_case = pe_meta.has_field("custom_case_no")
	if has_case:
		fields.append("custom_case_no")

	rows = frappe.get_all(
		"Payment Entry",
		filters={
			"docstatus": 1,
			"payment_type": "Receive",
			"party_type": "Customer",
			"party": customer,
			"unallocated_amount": [">", 0],
		},
		fields=fields,
		order_by="posting_date, creation",
		limit_page_length=0,
	)

	advances = []
	total = 0.0
	case_no = (case_no or "").strip() or None
	for r in rows:
		pe_case = (r.get("custom_case_no") or "").strip() if has_case else ""
		if case_no and pe_case and pe_case != case_no:
			continue
		unalloc = flt(r.get("unallocated_amount"))
		if unalloc <= 0:
			continue
		mode = (r.get("mode_of_payment") or "Other").strip() or "Other"
		advances.append(
			{
				"rv_no": r.get("name"),
				"rv_date": str(r.get("posting_date") or ""),
				"mode_of_payment": mode,
				"amount": round(unalloc, 3),
				"paid_amount": round(flt(r.get("paid_amount")), 3),
				"status": "Paid",
			}
		)
		total += unalloc
	return advances, round(total, 3)


def _soa_payment_payload(payment_entries, patient, case_no=None):
	"""Shared payment + advance block for IP/OP Statement of Account.

	``paid_total`` includes allocated / case-tagged payments **and** unallocated
	patient advances (money received even when invoices are still unpaid).
	"""
	modes, details = _payments_by_mode(payment_entries)
	advances, _advance_raw = _soa_patient_advances(patient, case_no=case_no)

	pe_names = set()
	allocated_total = 0.0
	for e in payment_entries or []:
		name = e.get("name") if hasattr(e, "get") else getattr(e, "name", None)
		if name:
			pe_names.add(name)
		allocated_total += flt(e.get("paid_amount") if hasattr(e, "get") else getattr(e, "paid_amount", 0))

	# Extra credit not already covered by a Payment Entry in payment_entries
	extra_advances = [a for a in advances if a.get("rv_no") not in pe_names]
	advance_extra = round(sum(flt(a.get("amount")) for a in extra_advances), 3)
	allocated_total = round(allocated_total, 3)
	paid_total = round(allocated_total + advance_extra, 3)

	# Fold only not-yet-counted advances into mode totals
	mode_map = {m["mode"]: flt(m["amount"]) for m in modes}
	advance_by_mode = {}
	for a in advances:
		m = (a.get("mode_of_payment") or "Other").strip() or "Other"
		amt = flt(a.get("amount"))
		advance_by_mode[m] = advance_by_mode.get(m, 0.0) + amt
	for a in extra_advances:
		m = (a.get("mode_of_payment") or "Other").strip() or "Other"
		mode_map[m] = mode_map.get(m, 0.0) + flt(a.get("amount"))

	modes = [
		{"mode": m, "amount": round(a, 3)}
		for m, a in sorted(mode_map.items(), key=lambda x: (-x[1], x[0]))
	]

	return {
		"payments_by_mode": modes,
		"payments": details,
		# Full unallocated list for the Paid detail table (invoice may still be unpaid)
		"advances": advances,
		"advance_total": round(sum(flt(a.get("amount")) for a in advances), 3),
		"allocated_total": allocated_total,
		"paid_total": paid_total,
		"advances_by_mode": [
			{"mode": m, "amount": round(a, 3)}
			for m, a in sorted(advance_by_mode.items(), key=lambda x: (-x[1], x[0]))
		],
	}


def _soa_aggregate_lines(sos, invoices):
	"""Build category-grouped SOA lines + totals from Sales Orders / Invoices."""
	so_names = [s.name for s in sos]
	si_names = [i.name for i in invoices]
	so_base_map = _soa_so_base_map(sos)

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
				"sales_order",
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
					base_reference=_soa_base_for_si_item(it, so_base_map),
				)
			)

	if so_names:
		so_items = frappe.get_all(
			"Sales Order Item",
			filters={"parent": ["in", so_names]},
			fields=[
				"name",
				"parent",
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
					base_reference=so_base_map.get(it.parent),
				)
			)

	lines = _soa_bucket_raw_lines(raw_lines)

	by_category = {}
	for row in lines.values():
		row["qty"] = round(row["qty"], 2)
		row["amount"] = round(row["amount"], 3)
		row["discount_amount"] = round(row["discount_amount"], 3)
		by_category.setdefault(row["category"], []).append(row)
	for rows in by_category.values():
		rows.sort(key=lambda r: -r["amount"])

	line_net = sum(flt(r["amount"]) for r in lines.values())
	line_discount = sum(flt(r["discount_amount"]) for r in lines.values())
	bill_total = round(line_net + line_discount, 3)
	discount_total = round(line_discount, 3)

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

	return by_category, bill_total, discount_total

@frappe.whitelist()
def get_op_statement_of_account(visit=None, from_date=None, to_date=None, patient=None):
	"""Statement of Account for OP.

	- With ``visit``: one Patient Visit (existing behaviour).
	- Without ``visit``: require ``patient`` + ``from_date``/``to_date`` and include
	  services/items from all of that patient's OP visits whose SO/SI dates fall
	  in the range.
	"""
	visit = (visit or "").strip() or None
	patient = (patient or "").strip() or None
	from_date = (from_date or "").strip() or None
	to_date = (to_date or "").strip() or None

	if visit:
		if not frappe.db.exists("Patient Visit", visit):
			frappe.throw(_("Patient Visit not found"))
		return _build_op_soa(
			visits=[visit],
			from_date=from_date,
			to_date=to_date,
			filter_docs_by_date=False,
			header_visit=visit,
		)

	if not patient or not frappe.db.exists("Patient", patient):
		frappe.throw(_("Select a patient, or pick a Patient Visit"))
	if not from_date or not to_date:
		frappe.throw(_("From Date and To Date are required when Visit is not selected"))

	visits = frappe.get_all(
		"Patient Visit",
		filters={"patient": patient},
		pluck="name",
		limit_page_length=0,
	)
	return _build_op_soa(
		visits=visits,
		from_date=from_date,
		to_date=to_date,
		filter_docs_by_date=True,
		header_visit=None,
		patient=patient,
	)


def _build_op_soa(
	visits,
	from_date=None,
	to_date=None,
	filter_docs_by_date=False,
	header_visit=None,
	patient=None,
):
	"""Aggregate OP SOA lines for one or many Patient Visits."""
	visits = [v for v in (visits or []) if v]

	pv = None
	if header_visit:
		pv = frappe.db.get_value(
			"Patient Visit",
			header_visit,
			[
				"name",
				"patient",
				"patient_name",
				"encounter_date",
				"cost_center",
				"practitioner_name",
				"practitioner",
				"visit_type",
				"status",
			],
			as_dict=True,
		)
		patient = pv.patient if pv else patient

	if not patient and visits:
		patient = frappe.db.get_value("Patient Visit", visits[0], "patient")

	patient_name = None
	file_no = None
	if patient:
		prow = frappe.db.get_value("Patient", patient, ["patient_name", "file_no"], as_dict=True)
		if prow:
			patient_name = prow.patient_name
			file_no = prow.file_no
	if pv:
		patient_name = pv.patient_name or patient_name

	sos_by_name = {}
	for v in visits:
		for so in _visit_sales_orders(v):
			sos_by_name[so.name] = so
	all_sos = list(sos_by_name.values())
	all_so_names = [s.name for s in all_sos]

	invoices_by_name = {}
	for v in visits:
		for inv in _visit_sales_invoices(v, all_so_names):
			invoices_by_name[inv.name] = inv
	all_invoices = list(invoices_by_name.values())

	sos = all_sos
	invoices = all_invoices
	if filter_docs_by_date and from_date and to_date:
		fd, td = getdate(from_date), getdate(to_date)
		sos = [
			s
			for s in all_sos
			if s.transaction_date and fd <= getdate(s.transaction_date) <= td
		]
		invoices = [
			i
			for i in all_invoices
			if i.posting_date and fd <= getdate(i.posting_date) <= td
		]

	by_category, bill_total, discount_total = _soa_aggregate_lines(sos, invoices)

	paid_entries = []
	seen_pe = set()
	for v in visits:
		for e in _visit_payments(v, from_date, to_date):
			if e.name in seen_pe:
				continue
			seen_pe.add(e.name)
			paid_entries.append(e)
	net_total = round(bill_total - discount_total, 3)
	pay_block = _soa_payment_payload(
		paid_entries,
		patient,
		case_no=header_visit or None,
	)
	paid_total = flt(pay_block.get("paid_total"))

	doctor_name = None
	visit_date = None
	visit_type = None
	status = None
	branch = None
	case_no = None
	visit_label = None

	if pv:
		doctor_name = pv.practitioner_name
		if not doctor_name and pv.practitioner:
			doctor_name = frappe.db.get_value(
				"Healthcare Practitioner", pv.practitioner, "practitioner_name"
			)
		visit_date = str(pv.encounter_date) if pv.encounter_date else None
		visit_type = pv.visit_type
		status = pv.status
		branch = (pv.cost_center or "").replace(" - SPH", "") or None
		case_no = pv.name
		visit_label = pv.name
	else:
		case_no = "Multiple visits"
		visit_label = "Multiple visits"
		if from_date and to_date:
			visit_date = f"{from_date} to {to_date}"

	return {
		"visit": visit_label,
		"case_no": case_no,
		"patient": patient,
		"patient_name": patient_name,
		"file_no": file_no,
		"doctor_name": doctor_name,
		"visit_date": visit_date,
		"visit_type": visit_type,
		"status": status,
		"branch": branch,
		"categories": by_category,
		"bill_total": bill_total,
		"discount_total": discount_total,
		"paid_total": paid_total,
		"net_total": net_total,
		"balance": round(net_total - paid_total, 3),
		"from_date": from_date,
		"to_date": to_date,
		"visit_count": len(visits),
		**pay_block,
	}
