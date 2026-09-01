"""Reception reports: Patient Receipts Summary, IP Payments & Discounts,
IP / OP Statement of Account.

Receipts are submitted Payment Entries. Each entry is attributed to a care episode by
following its references: Payment Entry -> Sales Invoice/Sales Order -> the Sales
Order's custom_base_reference (Patient Visit = OP, Inpatient Admission = IP, none =
Payment Only).
"""

import re

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


def _letter_head_for_cost_center(cost_center=None, **seed):
	"""Letter Head HTML from Cost Center.custom_letter_head (same as other prints)."""
	from healthcare.api.nursing_print import get_doc_letter_head

	payload = {k: v for k, v in seed.items() if v}
	if cost_center:
		payload["cost_center"] = cost_center
	if not payload:
		return {"content": "", "footer": ""}
	return get_doc_letter_head(payload)


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
					care_type="IP",
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


SOA_LAB_SUMMARY_CODES = frozenset({"Lab test", "Lab Tests", "IP-LAB", "OP-LAB"})
SOA_MED_SUMMARY_CODES = frozenset({"Medicine", "Medicines", "IP_MEDI", "IP-MED", "OP-MED"})

# IP Statement of Account: omit a heading when that category has no lines.
SOA_IP_CATEGORY_ORDER = (
	"Standard Admission Assessment Fee",
	"Room Charge",
	"Medical Supervision",
	"Medicines",
	"Lab Tests",
	"Services",
	"Other Services",
)

SOA_CLOSE_OBSERVATION_SERVICE_CODE = "Close Observation"


def _soa_normalized_label(value):
	return re.sub(r"\s+", " ", (value or "").strip()).casefold()


def _soa_close_observation_item_codes():
	"""Item codes that bill as Close Observation (Observation Level new item / legacy codes)."""
	cached = getattr(frappe.local, "_soa_close_obs_item_codes", None)
	if cached is not None:
		return cached
	codes: set[str] = set()
	if frappe.db.exists("DocType", "Observation Level"):
		for row in frappe.get_all(
			"Observation Level",
			fields=["item", "item_code", "new_item", "new_item_name", "observation_level"],
			limit_page_length=0,
		):
			labels = (
				row.get("new_item_name"),
				row.get("observation_level"),
			)
			if not any(_soa_normalized_label(label) == "close observation" for label in labels if label):
				continue
			for key in (row.get("item"), row.get("item_code"), row.get("new_item")):
				code = (key or "").strip()
				if code:
					codes.add(code)
	frappe.local._soa_close_obs_item_codes = codes
	return codes


def _soa_is_close_observation(code=None, name=None):
	"""True when a billed line is Close Observation (name or mapped Observation Level item)."""
	code = (code or "").strip()
	if code and code in _soa_close_observation_item_codes():
		return True
	labels: list[str] = []
	for val in (name,):
		if val:
			labels.append(str(val))
	if code:
		item_name = frappe.db.get_value("Item", code, "item_name")
		if item_name:
			labels.append(item_name)
		mapped = _soa_observation_display_map().get(code)
		if mapped:
			labels.append(mapped[1])
	return any(_soa_normalized_label(label) == "close observation" for label in labels)


def _soa_room_item_codes():
	codes = getattr(frappe.local, "_soa_room_item_codes", None)
	if codes is not None:
		return codes
	codes = set()
	for row in frappe.get_all(
		"Healthcare Service Unit Type",
		filters={"inpatient_occupancy": 1},
		fields=["item", "item_code"],
		limit_page_length=0,
	):
		if row.get("item"):
			codes.add(row.item)
		if row.get("item_code"):
			codes.add(row.item_code)
	frappe.local._soa_room_item_codes = codes
	return codes


def _soa_case_management_item_codes():
	codes = getattr(frappe.local, "_soa_cm_item_codes", None)
	if codes is not None:
		return codes
	codes = {
		c
		for c in frappe.get_all(
			"Healthcare Service Template",
			filters={"is_case_management": 1},
			pluck="item_code",
			limit_page_length=0,
		)
		if c
	}
	frappe.local._soa_cm_item_codes = codes
	return codes


def _soa_medical_supervision_item_codes():
	codes = getattr(frappe.local, "_soa_ms_item_codes", None)
	if codes is not None:
		return codes
	codes = set()
	template_name = (frappe.db.get_single_value("Healthcare Settings", "medical_supervision_item") or "").strip()
	if template_name and frappe.db.exists("Healthcare Service Template", template_name):
		item_code = frappe.db.get_value("Healthcare Service Template", template_name, "item_code")
		if item_code:
			codes.add(item_code)
	frappe.local._soa_ms_item_codes = codes
	return codes


def _soa_template_info_by_item():
	"""item_code → Healthcare Service Template fields used for IP SOA grouping."""
	cached = getattr(frappe.local, "_soa_tpl_by_item", None)
	if cached is not None:
		return cached
	mapping = {}
	for row in frappe.get_all(
		"Healthcare Service Template",
		fields=["item_code", "service_name", "category", "is_case_management"],
		limit_page_length=0,
	):
		code = (row.get("item_code") or "").strip()
		if code:
			mapping[code] = row
	frappe.local._soa_tpl_by_item = mapping
	return mapping


def _soa_looks_like_room(text):
	return bool(re.search(r"\brooms?\b", text or "", flags=re.I))


def _soa_looks_like_supervision(text):
	return bool(re.search(r"medical\s+supervision", text or "", flags=re.I))


def _soa_looks_like_session(text):
	t = (text or "").strip().lower()
	if not t:
		return False
	return any(h in t for h in ("session", "therapy", "psycholog", "occupational", "medical service"))


def _soa_display_category(group, code=None, name=None):
	"""Keep Room and Case Management as their own categories; rename Other Service → Service."""
	g = (group or "").strip()
	if not g and code:
		g = (frappe.db.get_value("Item", code, "item_group") or "").strip()

	if code and code in _soa_case_management_item_codes():
		return "Case Management"
	if _soa_looks_like_room(g) or _soa_looks_like_room(name) or (code and code in _soa_room_item_codes()):
		return g if _soa_looks_like_room(g) else "Room"

	if g.lower() in ("other service", "other services"):
		return "Service"
	return g or "Service"


def _soa_ip_display_category(group, code=None, name=None, base_reference=None):
	"""Fixed IP SOA headings. Unknown billed items fall through to Other Services."""
	g = (group or "").strip()
	if not g and code:
		g = (frappe.db.get_value("Item", code, "item_group") or "").strip()
	tpl = _soa_template_info_by_item().get((code or "").strip())
	br = (base_reference or "").strip()

	if code and code in _soa_case_management_item_codes():
		return "Standard Admission Assessment Fee"
	if tpl and cint(tpl.get("is_case_management")):
		return "Standard Admission Assessment Fee"
	if re.search(r"admission\s+assessment|case\s+management", name or "", flags=re.I):
		return "Standard Admission Assessment Fee"

	if (
		_soa_looks_like_room(g)
		or _soa_looks_like_room(name)
		or (code and code in _soa_room_item_codes())
	):
		return "Room Charge"

	if (code and code in _soa_medical_supervision_item_codes()) or _soa_looks_like_supervision(name) or _soa_looks_like_supervision(g):
		return "Medical Supervision"

	if br == "Session Schedule":
		return "Services"
	tpl_cat = ((tpl.get("category") if tpl else None) or "").strip()
	if tpl_cat == "Other Service":
		return "Other Services"
	if tpl_cat == "Medical Service" or _soa_looks_like_session(g) or _soa_looks_like_session(name):
		return "Services"

	return "Other Services"


def _soa_ordered_ip_categories(by_category):
	"""Emit IP SOA groups in the required order; skip headings that have no rows."""
	ordered = {}
	for cat in SOA_IP_CATEGORY_ORDER:
		rows = by_category.get(cat)
		if rows:
			ordered[cat] = rows
	for cat, rows in by_category.items():
		if cat not in ordered and rows:
			ordered[cat] = rows
	return ordered


def _soa_summary_labels(care_type, kind):
	"""Service code + name for collapsed Medicine / Lab rows on SOA."""
	is_ip = str(care_type or "").strip().upper() == "IP"
	if kind == "lab":
		code = "IP-LAB" if is_ip else "OP-LAB"
		name = "Lab Tests" if is_ip else "Lab tests"
	else:
		code = "IP-MED" if is_ip else "OP-MED"
		name = "Medicines" if is_ip else "Medicine Charges"
	return code, name, name


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


def _soa_is_medicine_item(item_code, item_group=None, base_reference=None, item_name=None):
	"""
	Medicine / pharmacy stock / injections on SOA → single 'Medicines' row.

	Primary source: Sales Orders from Patient Medication Order (stock drugs).
	Fallback: stock items in a pharmacy / medicine item group, or injection items.
	"""
	br = (base_reference or "").strip()
	if br == "Patient Medication Order":
		return True
	if _soa_is_lab_item(item_code, item_group=item_group, base_reference=base_reference):
		return False
	ig = (item_group or "").strip().lower()
	name = (item_name or "").strip().lower()
	if "inject" in ig or "inject" in name:
		return True
	if not item_code:
		return False
	row = frappe.db.get_value("Item", item_code, ["is_stock_item", "item_group", "item_name"], as_dict=True)
	if not row:
		return False
	ig = (row.item_group or item_group or "").strip().lower()
	name = (row.item_name or item_name or "").strip().lower()
	if "inject" in ig or "inject" in name:
		return True
	if not cint(row.is_stock_item):
		return False
	return any(h in ig for h in ("medic", "pharma", "drug", "pharmacy"))


def _soa_observation_display_map():
	"""Map auto-generated Observation Level items to receptionist New Item / New Item Name."""
	cached = getattr(frappe.local, "_soa_observation_display_map", None)
	if cached is not None:
		return cached
	mapping = {}
	if not frappe.db.exists("DocType", "Observation Level"):
		frappe.local._soa_observation_display_map = mapping
		return mapping
	rows = frappe.get_all(
		"Observation Level",
		fields=["item", "item_code", "new_item", "new_item_name"],
		limit_page_length=0,
	)
	for row in rows:
		display_code = (row.get("new_item") or "").strip()
		display_name = (row.get("new_item_name") or "").strip()
		if not display_code and not display_name:
			continue
		if display_code and not display_name:
			display_name = frappe.db.get_value("Item", display_code, "item_name") or display_code
		keys = {row.get("item"), row.get("item_code"), row.get("new_item")}
		for key in keys:
			code = (key or "").strip()
			if code:
				mapping[code] = (display_code or code, display_name or code)
	frappe.local._soa_observation_display_map = mapping
	return mapping


def _soa_apply_observation_display(code, name):
	mapped = _soa_observation_display_map().get((code or "").strip())
	if not mapped:
		return code, name
	display_code, display_name = mapped
	return display_code or code, display_name or name


def _soa_line_from_item(
	it, *, rate, amount, discount_amount, discount_percentage=0, base_reference=None, care_type="IP"
):
	"""One SOA raw line. Labs / PMO stock meds collapse to one summary row each."""
	code = getattr(it, "item_code", None) or (it.get("item_code") if isinstance(it, dict) else None)
	name = getattr(it, "item_name", None) or (it.get("item_name") if isinstance(it, dict) else None)
	group = getattr(it, "item_group", None) or (it.get("item_group") if isinstance(it, dict) else None)
	qty = getattr(it, "qty", None)
	if qty is None and isinstance(it, dict):
		qty = it.get("qty")

	is_ip = str(care_type or "").strip().upper() == "IP"
	orig_code, orig_name, orig_group = code, name, group

	if _soa_is_lab_item(code, item_group=group, base_reference=base_reference):
		code, name, group = _soa_summary_labels(care_type, "lab")
		rate = None
		category = "Lab Tests" if is_ip else _soa_display_category(group, code=code, name=name)
	elif _soa_is_medicine_item(code, item_group=group, base_reference=base_reference, item_name=name):
		code, name, group = _soa_summary_labels(care_type, "medicine")
		rate = None
		category = "Medicines" if is_ip else _soa_display_category(group, code=code, name=name)
	else:
		code, name = _soa_apply_observation_display(code, name)
		is_close_obs = _soa_is_close_observation(orig_code, name or orig_name)
		if is_close_obs:
			code = SOA_CLOSE_OBSERVATION_SERVICE_CODE
			if _soa_normalized_label(name) != "close observation":
				name = SOA_CLOSE_OBSERVATION_SERVICE_CODE
		if is_ip:
			category = _soa_ip_display_category(
				orig_group, code=orig_code, name=orig_name or name, base_reference=base_reference
			)
			if category == "Services" and not is_close_obs:
				tpl = _soa_template_info_by_item().get((orig_code or "").strip())
				if tpl and tpl.get("service_name"):
					name = tpl.service_name
		else:
			category = _soa_display_category(group, code=code, name=name)

	return {
		"item_code": code,
		"item_name": name,
		"category": category,
		"rate": None if rate is None else flt(rate),
		"discount_amount": flt(discount_amount),
		"discount_percentage": flt(discount_percentage),
		"qty": flt(qty),
		"amount": flt(amount),
	}


def _soa_bucket_raw_lines(raw_lines):
	"""Aggregate SOA lines: Lab / Medicine one row; IP sessions by type; else by item+rate."""
	lines = {}
	for it in raw_lines or []:
		code = it.get("item_code")
		cat = (it.get("category") or "").strip()
		if code in SOA_LAB_SUMMARY_CODES or code in SOA_MED_SUMMARY_CODES or cat in ("Lab Tests", "Medicines"):
			key = (cat or code,)
			display_rate = None
			session_row = False
		elif cat == "Services":
			key = ("Services", code)
			display_rate = flt(it["rate"]) if it.get("rate") is not None else None
			session_row = True
		else:
			key = (code, round(flt(it["rate"] or 0), 6))
			display_rate = flt(it["rate"]) if it.get("rate") is not None else None
			session_row = False
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
		row["amount"] += flt(it["amount"])
		row["discount_amount"] += flt(it["discount_amount"])
		if session_row:
			row["frequency"] += flt(it["qty"])
			incoming_rate = flt(it["rate"]) if it.get("rate") is not None else None
			if row["rate"] is not None and incoming_rate is not None and abs(flt(row["rate"]) - incoming_rate) > 0.000001:
				row["rate"] = None
		else:
			row["frequency"] += 1
	for row in lines.values():
		if (row.get("category") or "").strip() != "Services":
			continue
		qty = flt(row.get("qty"))
		if row.get("rate") is None and qty:
			row["rate"] = round(flt(row["amount"]) / qty, 3)
		if qty == int(qty):
			row["frequency"] = int(qty)
		else:
			row["frequency"] = round(qty, 2)
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

	# Aggregate: Lab / Medicine one line; sessions by type; else by item + rate
	lines = _soa_bucket_raw_lines(raw_lines)
	by_category = {}
	for row in lines.values():
		row["qty"] = round(row["qty"], 2)
		row["amount"] = round(row["amount"], 3)
		row["discount_amount"] = round(row["discount_amount"], 3)
		if (row.get("category") or "").strip() == "Services":
			qty = flt(row["qty"])
			row["frequency"] = int(qty) if qty == int(qty) else qty
		by_category.setdefault(row["category"], []).append(row)
	for cat, rows in by_category.items():
		if cat == "Services":
			rows.sort(key=lambda r: (r.get("item_name") or r.get("item_code") or "").lower())
		else:
			rows.sort(key=lambda r: -r["amount"])
	by_category = _soa_ordered_ip_categories(by_category)

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
		"cost_center": adm.cost_center,
		"branch": (adm.cost_center or "").replace(" - SPH", "") or None,
		"letter_head": _letter_head_for_cost_center(
			adm.cost_center, inpatient_admission=adm.name
		),
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


def _soa_aggregate_lines(sos, invoices, care_type="OP"):
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
					care_type=care_type,
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
					care_type=care_type,
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


def _soa_use_old_approach():
	return bool(cint(frappe.db.get_single_value("Healthcare Settings", "use_old_approach_soa")))


def _soa_is_iop_visit_type(visit_type):
	"""True when the Patient Visit Type is IOP (word match, not e.g. BIOPSY)."""
	vt = (visit_type or "").strip().upper()
	return bool(re.search(r"\bIOP\b", vt))


def _soa_visit_row_is_iop(row, type_labels=None):
	if not row:
		return False
	if row.get("iop_enrollment"):
		return True
	link = (row.get("visit_type") or "").strip()
	label = (type_labels or {}).get(link) or link
	return _soa_is_iop_visit_type(link) or _soa_is_iop_visit_type(label)


def _soa_service_category_from_visits(visit_rows, type_labels=None):
	"""OP, IOP, or OP / IOP from the visits that appear on this statement."""
	has_op = False
	has_iop = False
	for row in visit_rows or []:
		if _soa_visit_row_is_iop(row, type_labels):
			has_iop = True
		else:
			has_op = True
	if has_op and has_iop:
		return "OP / IOP"
	if has_iop:
		return "IOP"
	return "OP"


def _soa_format_age(dob):
	if not dob:
		return None
	born = getdate(dob)
	today = getdate()
	months = (today.year - born.year) * 12 + (today.month - born.month)
	if today.day < born.day:
		months -= 1
	years, rem_m = divmod(max(months, 0), 12)
	return f"{years} Y - {rem_m} M"


def _soa_patient_demographics(patient):
	"""File no, CPR, gender, nationality, age, address for the old OP SOA header."""
	if not patient or not frappe.db.exists("Patient", patient):
		return {}
	meta = frappe.get_meta("Patient")
	wanted = [
		"patient_name",
		"file_no",
		"sex",
		"dob",
		"uid",
		"id_number",
		"nationality",
		"pat_nationality",
		"address",
	]
	fields = [f for f in wanted if meta.has_field(f)]
	row = frappe.db.get_value("Patient", patient, fields, as_dict=True) or {}
	cpr = (row.get("id_number") or row.get("uid") or "").strip() or None
	nationality = (row.get("nationality") or row.get("pat_nationality") or "").strip() or None
	return {
		"cpr": cpr,
		"gender": row.get("sex") or None,
		"nationality": nationality,
		"age": _soa_format_age(row.get("dob")),
		"address": (row.get("address") or "").strip() or None,
		"file_no": row.get("file_no") or None,
		"patient_name": row.get("patient_name") or None,
	}


def _soa_item_net_amounts(it, is_invoice=False):
	if is_invoice:
		item_disc = flt(it.discount_amount)
		distributed = flt(getattr(it, "distributed_discount_amount", None) or 0)
		line_disc = item_disc + distributed
		net_amt = flt(it.net_amount)
		if net_amt <= 0 and line_disc > 0:
			net_amt = max(flt(it.amount) - distributed, 0)
		elif net_amt <= 0:
			net_amt = flt(it.amount)
		return net_amt, line_disc
	return flt(it.amount), flt(it.discount_amount)


def _soa_pe_allocated_by_reference(ref_names):
	"""Submitted Payment Entry allocations keyed by Sales Order / Invoice name."""
	names = [n for n in (ref_names or []) if n]
	if not names:
		return {}
	refs = frappe.get_all(
		"Payment Entry Reference",
		filters={"reference_name": ["in", names]},
		fields=["reference_name", "allocated_amount", "parent"],
		limit_page_length=0,
	)
	if not refs:
		return {}
	parents = list({r.parent for r in refs if r.parent})
	submitted = set(
		frappe.get_all(
			"Payment Entry",
			filters={"name": ["in", parents], "docstatus": 1, "payment_type": "Receive"},
			pluck="name",
			limit_page_length=0,
		)
	)
	out = {}
	for r in refs:
		if r.parent not in submitted:
			continue
		out[r.reference_name] = out.get(r.reference_name, 0.0) + flt(r.allocated_amount)
	return out


def _soa_old_description(so, items, kind):
	"""Match the legacy print: LAB/…- Lab Charges, SAL/…- Pharmacy Charges, CODE- NAME."""
	so_name = getattr(so, "name", None) or ""
	base = (getattr(so, "custom_base_reference", None) or "").strip()
	base_name = (getattr(so, "custom_base_reference_name", None) or "").strip()
	if kind == "lab":
		label = base_name if base in ("Lab Test", "Lab Test Template") and base_name else so_name
		return f"{label}- Lab Charges"
	if kind == "medicine":
		return f"{so_name}- Pharmacy Charges"
	it = items[0] if items else None
	code = (getattr(it, "item_code", None) or "") if it else ""
	name = (getattr(it, "item_name", None) or "") if it else ""
	if code and name:
		return f"{code}- {name}"
	return name or code or so_name


def _soa_old_allocate_paid(dues, paid):
	"""Spread SO/invoice paid across sibling rows; never exceed each row's due."""
	paid = max(flt(paid), 0.0)
	total_due = sum(dues)
	shares = []
	remaining = paid
	for i, due in enumerate(dues):
		due = flt(due)
		if i == len(dues) - 1:
			share = min(max(remaining, 0.0), due)
		elif total_due > 0:
			share = min(round(paid * due / total_due, 3), due, remaining)
		else:
			share = 0.0
		share = round(max(share, 0.0), 3)
		shares.append(share)
		remaining = round(remaining - share, 3)
	return shares


def _soa_old_op_lines(sos, invoices, so_to_visit, visit_meta):
	"""One printable row per Sales Order (lab/pharmacy collapsed; other items listed).

	Invoice No. = Sales Order name, Invoice Date = Sales Order date.
	"""
	sos = list(sos or [])
	invoices = list(invoices or [])
	so_names = [s.name for s in sos]
	si_names = [i.name for i in invoices]
	so_by_name = {s.name: s for s in sos}
	so_base_map = _soa_so_base_map(sos)

	si_by_so = {}
	orphan_invoices = []
	si_to_so = {}
	if si_names:
		si_items = frappe.get_all(
			"Sales Invoice Item",
			filters={"parent": ["in", si_names]},
			fields=[
				"parent",
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
			so = it.sales_order
			if so:
				si_by_so.setdefault(so, []).append(it)
				si_to_so[it.parent] = so
			else:
				orphan_invoices.append(it)

	so_items_by_parent = {}
	invoiced_details = set()
	for items in si_by_so.values():
		for it in items:
			if it.so_detail:
				invoiced_details.add(it.so_detail)
	if so_names:
		for it in frappe.get_all(
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
		):
			if it.name in invoiced_details:
				continue
			so_items_by_parent.setdefault(it.parent, []).append(it)

	from healthcare.api.pos_dispense_return import get_returned_amount_map_for_sales_orders

	returned_by_so = get_returned_amount_map_for_sales_orders(so_names)

	alloc = _soa_pe_allocated_by_reference(so_names + si_names)
	paid_by_so = {n: flt(alloc.get(n)) for n in so_names}
	for si_name, so_name in si_to_so.items():
		paid_by_so[so_name] = paid_by_so.get(so_name, 0.0) + flt(alloc.get(si_name))

	inv_date_by_name = {i.name: i.posting_date for i in invoices}

	def visit_doctor(visit_name):
		meta = (visit_meta or {}).get(visit_name) or {}
		doctor = meta.get("practitioner_name")
		if not doctor and meta.get("practitioner"):
			doctor = frappe.db.get_value(
				"Healthcare Practitioner", meta.get("practitioner"), "practitioner_name"
			)
		return doctor

	def classify(items, so):
		base = so_base_map.get(getattr(so, "name", None)) if so else None
		labs, meds, others = [], [], []
		for it in items:
			group = getattr(it, "item_group", None)
			code = getattr(it, "item_code", None)
			if _soa_is_lab_item(code, item_group=group, base_reference=base):
				labs.append(it)
			elif _soa_is_medicine_item(code, item_group=group, base_reference=base):
				meds.append(it)
			else:
				others.append(it)
		return labs, meds, others

	def emit(so, invoice_no, invoice_date, items, is_invoice, paid_pool, visit_name):
		if not items:
			return []
		labs, meds, others = classify(items, so)
		chunks = []
		if labs:
			chunks.append(("lab", labs, sum(_soa_item_net_amounts(it, is_invoice)[0] for it in labs)))
		if meds:
			due = sum(_soa_item_net_amounts(it, is_invoice)[0] for it in meds)
			if not is_invoice and so:
				due = max(0.0, flt(due) - flt(returned_by_so.get(so.name, 0)))
			if due > 0:
				chunks.append(("medicine", meds, due))
		for it in others:
			chunks.append(("other", [it], _soa_item_net_amounts(it, is_invoice)[0]))
		dues = [c[2] for c in chunks]
		pays = _soa_old_allocate_paid(dues, paid_pool)
		doctor = visit_doctor(visit_name)
		rows = []
		for (kind, group, due), paid in zip(chunks, pays):
			due = round(flt(due), 3)
			paid = round(flt(paid), 3)
			rows.append(
				{
					"invoice_date": str(invoice_date)[:10] if invoice_date else None,
					"invoice_no": invoice_no,
					"description": _soa_old_description(so, group, kind),
					"doctor_name": doctor,
					"due_amount": due,
					"paid_amount": paid,
					"balance_amount": round(due - paid, 3),
					"visit": visit_name,
				}
			)
		return rows

	out = []
	for so in sorted(sos, key=lambda s: (str(s.transaction_date or ""), str(s.creation or ""), s.name)):
		items = si_by_so.get(so.name) or so_items_by_parent.get(so.name) or []
		is_invoice = so.name in si_by_so
		visit_name = (so_to_visit or {}).get(so.name)
		out.extend(
			emit(
				so,
				so.name,
				so.transaction_date,
				items,
				is_invoice,
				paid_by_so.get(so.name, 0.0),
				visit_name,
			)
		)

	# Invoices with no Sales Order still print, using the invoice number/date.
	orphan_by_parent = {}
	for it in orphan_invoices:
		orphan_by_parent.setdefault(it.parent, []).append(it)
	for si_name, items in orphan_by_parent.items():
		dummy = frappe._dict(name=si_name, custom_base_reference=None, custom_base_reference_name=None)
		out.extend(
			emit(
				dummy,
				si_name,
				inv_date_by_name.get(si_name),
				items,
				True,
				flt(alloc.get(si_name)),
				None,
			)
		)

	out.sort(key=lambda r: (r.get("invoice_date") or "", r.get("invoice_no") or "", r.get("description") or ""))
	return out


def _patient_first_visit_date(patient: str):
	"""Earliest Patient Visit encounter_date for this patient (any visit ever)."""
	patient = (patient or "").strip()
	if not patient:
		return None
	first = frappe.db.sql(
		"""
		SELECT MIN(encounter_date)
		FROM `tabPatient Visit`
		WHERE patient = %s AND encounter_date IS NOT NULL
		""",
		patient,
	)
	d = first[0][0] if first and first[0] else None
	return str(getdate(d)) if d else None


@frappe.whitelist()
def get_patient_first_visit_date(patient=None):
	"""Return YYYY-MM-DD of the patient's first Patient Visit, or None."""
	return _patient_first_visit_date(patient or "")


@frappe.whitelist()
def get_op_statement_of_account(visit=None, from_date=None, to_date=None, patient=None):
	"""Statement of Account for OP.

	- With ``visit``: one Patient Visit (existing behaviour).
	- Without ``visit``: require ``patient`` + ``from_date``/``to_date`` and include
	  services/items from all of that patient's OP visits whose SO/SI dates fall
	  in the range. If From Date is blank, default to the patient's first visit.
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
	if not from_date:
		from_date = _patient_first_visit_date(patient)
	if not to_date:
		to_date = str(frappe.utils.today())
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
	so_to_visit = {}
	for v in visits:
		for so in _visit_sales_orders(v):
			sos_by_name[so.name] = so
			so_to_visit[so.name] = v
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

	by_category, bill_total, discount_total = _soa_aggregate_lines(sos, invoices, care_type="OP")

	visit_meta = {}
	if visits:
		for row in frappe.get_all(
			"Patient Visit",
			filters={"name": ["in", visits]},
			fields=[
				"name",
				"visit_type",
				"iop_enrollment",
				"practitioner_name",
				"practitioner",
				"encounter_date",
				"cost_center",
			],
			limit_page_length=0,
		):
			visit_meta[row.name] = row

	type_names = {r.get("visit_type") for r in visit_meta.values() if r.get("visit_type")}
	type_labels = {}
	if type_names:
		for t in frappe.get_all(
			"Patient Visit Type",
			filters={"name": ["in", list(type_names)]},
			fields=["name", "visit_type"],
			limit_page_length=0,
		):
			type_labels[t.name] = t.visit_type or t.name

	contributor = set()
	for so in sos:
		vname = so_to_visit.get(so.name)
		if vname:
			contributor.add(vname)
	if from_date and to_date:
		fd, td = getdate(from_date), getdate(to_date)
		for name, meta in visit_meta.items():
			enc = meta.get("encounter_date")
			if enc and fd <= getdate(enc) <= td:
				contributor.add(name)
	if not contributor:
		contributor = set(visit_meta)
	use_old = _soa_use_old_approach()
	# Old HIS print is the combined OP / IOP statement (see sample SOA).
	service_category = (
		"OP / IOP"
		if use_old
		else _soa_service_category_from_visits(
			[visit_meta[n] for n in contributor if n in visit_meta],
			type_labels,
		)
	)
	old_lines = _soa_old_op_lines(sos, invoices, so_to_visit, visit_meta) if use_old else []
	demo = _soa_patient_demographics(patient)

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
	line_paid = round(sum(flt(r.get("paid_amount")) for r in old_lines), 3) if old_lines else 0.0
	pending_adjustment = round(max(paid_total - line_paid, 0.0), 3)

	doctor_name = None
	visit_date = None
	visit_type = None
	status = None
	cost_center = None
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
		cost_center = pv.cost_center
		branch = (pv.cost_center or "").replace(" - SPH", "") or None
		case_no = pv.name
		visit_label = pv.name
	else:
		case_no = "Multiple visits"
		visit_label = "Multiple visits"
		if from_date and to_date:
			visit_date = f"{from_date} to {to_date}"
		for name in list(contributor) or visits:
			meta = visit_meta.get(name) or {}
			if meta.get("cost_center"):
				cost_center = meta.get("cost_center")
				branch = (cost_center or "").replace(" - SPH", "") or None
				break

	if not cost_center:
		cost_center = frappe.defaults.get_user_default("cost_center")

	return {
		"visit": visit_label,
		"case_no": case_no,
		"patient": patient,
		"patient_name": patient_name or demo.get("patient_name"),
		"file_no": file_no or demo.get("file_no"),
		"cpr": demo.get("cpr"),
		"gender": demo.get("gender"),
		"nationality": demo.get("nationality"),
		"age": demo.get("age"),
		"address": demo.get("address"),
		"doctor_name": doctor_name,
		"visit_date": visit_date,
		"visit_type": visit_type,
		"status": status,
		"cost_center": cost_center,
		"branch": branch,
		"letter_head": _letter_head_for_cost_center(
			cost_center, patient_visit=header_visit
		),
		"service_category": service_category,
		"use_old_approach_soa": use_old,
		"old_lines": old_lines,
		"pending_adjustment": pending_adjustment,
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
