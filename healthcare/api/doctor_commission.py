# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Doctor commission generation from billed Sales Orders linked to configured source DocTypes."""

from __future__ import annotations

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, now_datetime


GENERIC_PRACTITIONER_FIELDS = [
	"practitioner",
	"doctor",
	"healthcare_practitioner",
	"practioner",
	"primary_practitioner",
	"admission_by_doctor",
	"admission_practitioner",
	"discharge_doctor",
	"discharge_practitioner",
]

DOCTYPE_PRACTITIONER_FIELDS = {
	"Patient Visit": ["practitioner"],
	"Service Request": ["practitioner"],
	"Patient Appointment": ["practitioner"],
	"Patient Medication Order": ["practitioner"],
	"Lab Test": ["practitioner"],
	"Medication Request": ["practitioner"],
	"Therapy Session": ["practitioner"],
	"Session Schedule": ["doctor", "practitioner"],
	"Inpatient Admission": [
		"primary_practitioner",
		"admission_by_doctor",
		"admission_practitioner",
	],
	"Discharge": ["discharge_doctor", "discharge_practitioner"],
	"Observation": ["healthcare_practitioner"],
	"IP Service": ["practioner"],
}


def generate_doctor_commission_period(period_doc):
	"""Fill Doctor Commission Payroll child tables from Sales Order service lines."""
	period_doc = period_doc if hasattr(period_doc, "doctors") else frappe.get_doc(
		"Doctor Commission Payroll", period_doc
	)

	sources = get_enabled_commission_sources()
	if not sources:
		frappe.throw(
			_(
				"No enabled Doctor Commission Source records found. "
				"Add DocTypes that should earn commission (e.g. Session Schedule) first."
			)
		)

	source_doctypes = [s.source_doctype for s in sources]
	service_rows = fetch_commissionable_sales_order_items(
		from_date=period_doc.from_date,
		to_date=period_doc.to_date,
		company=period_doc.company,
		cost_center=period_doc.cost_center,
		source_doctypes=source_doctypes,
	)
	if not service_rows:
		period_doc.set("doctors", [])
		period_doc.set("items", [])
		period_doc.total_service_amount = 0
		period_doc.total_cases = 0
		period_doc.total_commission = 0
		period_doc.status = "Generated"
		period_doc.generated_on = now_datetime()
		period_doc.generated_by = frappe.session.user
		period_doc.save(ignore_permissions=True)
		return {"doctors": 0, "items": 0}

	practitioner_by_base = resolve_practitioners_for_sources(service_rows, sources)
	eligible = get_commission_eligible_practitioners(
		{p for p in practitioner_by_base.values() if p}
	)
	rules = load_active_commission_rules(period_doc.from_date, period_doc.to_date)
	default_percent = flt(period_doc.default_commission_percent)
	if default_percent <= 0:
		default_percent = flt(frappe.db.get_single_value("Healthcare Settings", "doctors_commission"))

	item_groups = get_item_groups({r.item_code for r in service_rows if r.item_code})

	# Sort for stable case indexing per doctor/branch
	service_rows = sorted(
		service_rows,
		key=lambda r: (
			str(r.transaction_date or ""),
			str(r.sales_order or ""),
			cint(r.idx or 0),
		),
	)

	case_counter = defaultdict(int)
	detail_rows = []
	skipped_no_practitioner = 0
	skipped_not_eligible = 0

	for row in service_rows:
		key = (row.custom_base_reference, row.custom_base_reference_name)
		practitioner = practitioner_by_base.get(key)
		if not practitioner:
			skipped_no_practitioner += 1
			continue
		if practitioner not in eligible:
			skipped_not_eligible += 1
			continue

		branch = (row.cost_center or "").strip() or None
		case_key = (practitioner, branch or "")
		case_counter[case_key] += 1
		case_index = case_counter[case_key]

		# Match base rule (practitioner+cost_center only) for free_cases
		base_rule = match_base_commission_rule(
			rules,
			practitioner=practitioner,
			cost_center=branch,
			on_date=row.transaction_date,
		)

		# Match full rule (with item specificity) for commission calculation
		rule = match_commission_rule(
			rules,
			practitioner=practitioner,
			cost_center=branch,
			item_code=row.item_code,
			item_group=item_groups.get(row.item_code),
			on_date=row.transaction_date,
		)

		commission_amount, calc_type, percent_used = calculate_line_commission(
			rule=rule,
			service_amount=flt(row.amount),
			case_index=case_index,
			default_percent=default_percent,
			base_rule=base_rule,
		)

		details = eligible.get(practitioner) or {}
		detail_rows.append(
			{
				"practitioner": practitioner,
				"practitioner_name": details.get("practitioner_name") or "",
				"transaction_date": row.transaction_date,
				"patient": row.patient,
				"patient_name": row.custom_patient_name or "",
				"source_doctype": row.custom_base_reference,
				"source_name": row.custom_base_reference_name,
				"sales_order": row.sales_order,
				"item_code": row.item_code,
				"item_name": row.item_name,
				"qty": flt(row.qty),
				"service_amount": flt(row.amount),
				"cost_center": branch,
				"commission_rule": rule.name if rule else None,
				"calculation_type": calc_type,
				"commission_percent": percent_used,
				"commission_amount": commission_amount,
				"case_index": case_index,
			}
		)

	doctor_map = defaultdict(
		lambda: {
			"cases_count": 0,
			"service_amount": 0.0,
			"calculated_commission": 0.0,
			"practitioner_name": "",
			"doctors_id": "",
			"cost_center": None,
		}
	)
	for line in detail_rows:
		dkey = (line["practitioner"], line.get("cost_center") or "")
		bucket = doctor_map[dkey]
		bucket["cases_count"] += 1
		bucket["service_amount"] += flt(line["service_amount"])
		bucket["calculated_commission"] += flt(line["commission_amount"])
		bucket["practitioner_name"] = line.get("practitioner_name") or bucket["practitioner_name"]
		details = eligible.get(line["practitioner"]) or {}
		bucket["doctors_id"] = details.get("doctors_id") or line["practitioner"]
		bucket["cost_center"] = line.get("cost_center")

	period_doc.set("items", [])
	for line in detail_rows:
		period_doc.append("items", line)

	period_doc.set("doctors", [])
	for (practitioner, _branch), data in sorted(doctor_map.items(), key=lambda x: x[0][0]):
		details = eligible.get(practitioner) or {}
		period_doc.append(
			"doctors",
			{
				"practitioner": practitioner,
				"practitioner_name": data["practitioner_name"],
				"doctors_id": data["doctors_id"],
				"employee": getattr(details, "employee", None) or details.get("employee"),
				"cost_center": data["cost_center"],
				"cases_count": data["cases_count"],
				"service_amount": data["service_amount"],
				"calculated_commission": data["calculated_commission"],
				"adjusted_commission": data["calculated_commission"],
			},
		)

	period_doc._recalc_totals()
	period_doc.status = "Generated"
	period_doc.generated_on = now_datetime()
	period_doc.generated_by = frappe.session.user
	period_doc.save(ignore_permissions=True)

	return {
		"doctors": len(period_doc.doctors or []),
		"items": len(period_doc.items or []),
		"skipped_no_practitioner": skipped_no_practitioner,
		"skipped_not_eligible": skipped_not_eligible,
	}


def get_enabled_commission_sources():
	return frappe.get_all(
		"Doctor Commission Source",
		filters={"enabled": 1},
		fields=["name", "source_doctype", "practitioner_field"],
		order_by="source_doctype asc",
	)


def fetch_commissionable_sales_order_items(
	from_date, to_date, company=None, cost_center=None, source_doctypes=None
):
	"""Sales Order item lines billed against configured commission source DocTypes."""
	if not source_doctypes:
		return []

	conditions = [
		"so.docstatus = 1",
		"so.transaction_date >= %(from_date)s",
		"so.transaction_date <= %(to_date)s",
		"IFNULL(so.custom_base_reference, '') != ''",
		"IFNULL(so.custom_base_reference_name, '') != ''",
		"so.custom_base_reference IN %(source_doctypes)s",
	]
	values = {
		"from_date": getdate(from_date),
		"to_date": getdate(to_date),
		"source_doctypes": tuple(source_doctypes),
	}

	# cost_center may be on SO header and/or item; prefer header then item
	has_so_cc = frappe.get_meta("Sales Order").has_field("cost_center")
	has_soi_cc = frappe.get_meta("Sales Order Item").has_field("cost_center")

	if company:
		conditions.append("so.company = %(company)s")
		values["company"] = company

	cc_expr = "NULL"
	if has_so_cc and has_soi_cc:
		cc_expr = "IFNULL(so.cost_center, soi.cost_center)"
	elif has_so_cc:
		cc_expr = "so.cost_center"
	elif has_soi_cc:
		cc_expr = "soi.cost_center"

	if cost_center:
		if has_so_cc and has_soi_cc:
			conditions.append(
				"(IFNULL(so.cost_center, '') = %(cost_center)s OR IFNULL(soi.cost_center, '') = %(cost_center)s)"
			)
		elif has_so_cc:
			conditions.append("so.cost_center = %(cost_center)s")
		elif has_soi_cc:
			conditions.append("soi.cost_center = %(cost_center)s")
		values["cost_center"] = cost_center

	return frappe.db.sql(
		f"""
		SELECT
			so.name AS sales_order,
			so.transaction_date,
			so.patient,
			so.custom_patient_name,
			so.custom_base_reference,
			so.custom_base_reference_name,
			soi.idx,
			soi.item_code,
			soi.item_name,
			soi.qty,
			soi.amount,
			{cc_expr} AS cost_center
		FROM `tabSales Order` so
		INNER JOIN `tabSales Order Item` soi
			ON soi.parent = so.name AND soi.parenttype = 'Sales Order'
		WHERE {" AND ".join(conditions)}
		ORDER BY so.transaction_date ASC, so.name ASC, soi.idx ASC
		""",
		values,
		as_dict=True,
	)


def resolve_practitioners_for_sources(rows, sources):
	"""Map (source_doctype, source_name) -> practitioner using configured/auto fields."""
	field_by_dt = {
		s.source_doctype: (s.practitioner_field or "").strip() or None for s in sources
	}
	by_doctype = defaultdict(set)
	for row in rows:
		by_doctype[row.custom_base_reference].add(row.custom_base_reference_name)

	resolved = {}
	for doctype, names in by_doctype.items():
		if not frappe.db.exists("DocType", doctype):
			continue
		fields = []
		configured = field_by_dt.get(doctype)
		if configured:
			fields = [configured]
		else:
			fields = get_practitioner_fields_for_doctype(doctype)
		if not fields:
			continue

		names = list(names)
		for i in range(0, len(names), 500):
			chunk = names[i : i + 500]
			docs = frappe.get_all(
				doctype,
				filters={"name": ["in", chunk]},
				fields=["name", *fields],
			)
			for doc in docs:
				practitioner = None
				for field in fields:
					value = doc.get(field)
					if value:
						practitioner = value
						break
				if practitioner:
					resolved[(doctype, doc.name)] = practitioner
	return resolved


def get_practitioner_fields_for_doctype(doctype):
	try:
		meta = frappe.get_meta(doctype)
	except Exception:
		return []

	preferred = DOCTYPE_PRACTITIONER_FIELDS.get(doctype, GENERIC_PRACTITIONER_FIELDS)
	available = []
	for fieldname in preferred:
		df = meta.get_field(fieldname)
		if df and df.fieldtype == "Link" and df.options == "Healthcare Practitioner":
			available.append(fieldname)

	for df in meta.fields:
		if (
			df.fieldtype == "Link"
			and df.options == "Healthcare Practitioner"
			and df.fieldname not in available
		):
			available.append(df.fieldname)
	return available


def get_commission_eligible_practitioners(practitioner_ids):
	"""Only practitioners with receive_commision checked."""
	if not practitioner_ids:
		return {}

	has_flag = frappe.get_meta("Healthcare Practitioner").has_field("receive_commision")
	fields = ["name", "practitioner_name", "employee"]
	if frappe.get_meta("Healthcare Practitioner").has_field("doctors_id"):
		fields.append("doctors_id")

	filters = {"name": ["in", list(practitioner_ids)]}
	if has_flag:
		filters["receive_commision"] = 1

	rows = frappe.get_all("Healthcare Practitioner", filters=filters, fields=fields)
	return {r.name: r for r in rows}


def list_all_commission_eligible_practitioners():
	"""All practitioners marked to receive commission."""
	has_flag = frappe.get_meta("Healthcare Practitioner").has_field("receive_commision")
	fields = ["name", "practitioner_name", "employee"]
	if frappe.get_meta("Healthcare Practitioner").has_field("doctors_id"):
		fields.append("doctors_id")

	filters = {}
	if has_flag:
		filters["receive_commision"] = 1

	rows = frappe.get_all(
		"Healthcare Practitioner",
		filters=filters,
		fields=fields,
		order_by="practitioner_name asc",
	)
	return rows


def fetch_doctors_for_period(period_doc):
	"""Fill Doctors table with all eligible practitioners (receive_commision = 1).

	Does not calculate commission — use generate_commission for that.
	"""
	period_doc = period_doc if hasattr(period_doc, "doctors") else frappe.get_doc(
		"Doctor Commission Payroll", period_doc
	)

	practitioners = list_all_commission_eligible_practitioners()
	if not practitioners:
		frappe.throw(
			_(
				"No Healthcare Practitioners found with Receive Commission enabled. "
				"Open Healthcare Practitioner and tick Receive Commision."
			)
		)

	existing_adjusted = {
		(row.practitioner or ""): flt(row.adjusted_commission)
		for row in (period_doc.doctors or [])
		if row.practitioner and row.adjusted_commission not in (None, "")
	}

	period_doc.set("doctors", [])
	for p in practitioners:
		period_doc.append(
			"doctors",
			{
				"practitioner": p.name,
				"practitioner_name": p.practitioner_name or "",
				"doctors_id": getattr(p, "doctors_id", None) or p.name,
				"employee": p.employee,
				"cost_center": period_doc.cost_center,
				"cases_count": 0,
				"service_amount": 0,
				"calculated_commission": 0,
				"adjusted_commission": existing_adjusted.get(p.name, 0),
			},
		)

	# Keep service lines as-is; only refresh doctor list.
	period_doc._recalc_totals()
	period_doc.save(ignore_permissions=True)

	return {"doctors": len(period_doc.doctors or [])}


def create_additional_salaries_for_payroll(payroll_doc):
	"""Create one Additional Salary per doctor row (HRMS) after payroll is submitted."""
	payroll_doc = payroll_doc if hasattr(payroll_doc, "doctors") else frappe.get_doc(
		"Doctor Commission Payroll", payroll_doc
	)

	if "hrms" not in frappe.get_installed_apps():
		frappe.throw(_("Install HRMS to create Additional Salary from doctor commission."))

	if not frappe.db.exists("DocType", "Additional Salary"):
		frappe.throw(_("Additional Salary DocType not found. Ensure HRMS is installed."))

	salary_component = payroll_doc.salary_component or frappe.db.get_single_value(
		"Healthcare Settings", "doctor_commission_salary_component"
	)
	if not salary_component:
		frappe.throw(
			_(
				"Set Salary Component on Doctor Commission Payroll "
				"(or Healthcare Settings → Doctor Commission Salary Component)."
			)
		)

	payroll_date = payroll_doc.payroll_date or payroll_doc.to_date
	if not payroll_date:
		frappe.throw(_("Set Payroll Date (or To Date) before creating Additional Salary."))

	created = 0
	skipped = 0
	errors = []

	for row in payroll_doc.doctors or []:
		amount = flt(
			row.adjusted_commission
			if row.adjusted_commission not in (None, "")
			else row.calculated_commission
		)
		if amount <= 0:
			skipped += 1
			continue

		if row.additional_salary and frappe.db.exists("Additional Salary", row.additional_salary):
			skipped += 1
			continue

		employee = row.employee or frappe.db.get_value(
			"Healthcare Practitioner", row.practitioner, "employee"
		)
		if not employee:
			skipped += 1
			errors.append(
				_("{0}: no Employee linked on Healthcare Practitioner").format(
					row.practitioner_name or row.practitioner
				)
			)
			continue

		company = payroll_doc.company or frappe.db.get_value("Employee", employee, "company")
		if not company:
			skipped += 1
			errors.append(
				_("{0}: could not resolve Company for employee {1}").format(
					row.practitioner_name or row.practitioner, employee
				)
			)
			continue

		try:
			ads = frappe.get_doc(
				{
					"doctype": "Additional Salary",
					"naming_series": "HR-ADS-.YY.-.MM.-",
					"employee": employee,
					"company": company,
					"salary_component": salary_component,
					"amount": amount,
					"payroll_date": payroll_date,
					"is_recurring": 0,
					"overwrite_salary_structure_amount": 0,
					"ref_doctype": "Doctor Commission Payroll",
					"ref_docname": payroll_doc.name,
				}
			)
			ads.flags.ignore_permissions = True
			ads.insert()
			ads.submit()
			row.additional_salary = ads.name
			row.employee = employee
			created += 1
		except Exception as e:
			skipped += 1
			errors.append(
				_("{0}: {1}").format(row.practitioner_name or row.practitioner, str(e))
			)

	if created:
		payroll_doc.salary_component = salary_component
		payroll_doc.payroll_date = payroll_date
		payroll_doc.additional_salaries_created = 1
		payroll_doc.status = "Salary Created"
		payroll_doc.flags.ignore_validate_update_after_submit = True
		payroll_doc.save(ignore_permissions=True)

	return {"created": created, "skipped": skipped, "errors": errors}


def load_active_commission_rules(from_date, to_date):
	from_date = getdate(from_date)
	to_date = getdate(to_date)
	rules = frappe.get_all(
		"Doctor Commission Rule",
		filters={"is_active": 1},
		fields=[
			"name",
			"practitioner",
			"cost_center",
			"item_code",
			"item_group",
			"calculation_type",
			"commission_percent",
			"fixed_amount",
			"free_cases",
			"tier_after_cases",
			"tier_commission_percent",
			"valid_from",
			"valid_to",
			"priority",
		],
		order_by="priority desc, modified desc",
	)
	out = []
	for rule in rules:
		vf = getdate(rule.valid_from) if rule.valid_from else None
		vt = getdate(rule.valid_to) if rule.valid_to else None
		# Keep rule if it overlaps the period at all; line-level still checks date.
		if vf and vf > to_date:
			continue
		if vt and vt < from_date:
			continue
		out.append(rule)
	return out


def match_commission_rule(rules, practitioner, cost_center, item_code, item_group, on_date):
	on_date = getdate(on_date) if on_date else None
	best = None
	best_score = -1

	for rule in rules:
		vf = getdate(rule.valid_from) if rule.valid_from else None
		vt = getdate(rule.valid_to) if rule.valid_to else None
		if on_date:
			if vf and on_date < vf:
				continue
			if vt and on_date > vt:
				continue

		score = cint(rule.priority or 0)
		# Specificity bonus
		if rule.practitioner:
			if rule.practitioner != practitioner:
				continue
			score += 100
		if rule.cost_center:
			if rule.cost_center != (cost_center or ""):
				continue
			score += 40
		if rule.item_code:
			if rule.item_code != item_code:
				continue
			score += 30
		if rule.item_group:
			if rule.item_group != item_group:
				continue
			score += 20

		if score > best_score:
			best_score = score
			best = rule
	return best


def match_base_commission_rule(rules, practitioner, cost_center, on_date):
	"""Match rule for practitioner+cost_center (ignore item filters).
	
	Used to check free_cases across all items for a practitioner/branch.
	Returns the best matching rule based on practitioner and cost_center only,
	even if that rule has item_code or item_group filters.
	"""
	on_date = getdate(on_date) if on_date else None
	best = None
	best_score = -1

	for rule in rules:
		vf = getdate(rule.valid_from) if rule.valid_from else None
		vt = getdate(rule.valid_to) if rule.valid_to else None
		if on_date:
			if vf and on_date < vf:
				continue
			if vt and on_date > vt:
				continue

		score = cint(rule.priority or 0)
		# Only match on practitioner and cost_center (ignore item filters)
		if rule.practitioner:
			if rule.practitioner != practitioner:
				continue
			score += 100
		if rule.cost_center:
			if rule.cost_center != (cost_center or ""):
				continue
			score += 40

		if score > best_score:
			best_score = score
			best = rule
	return best


def calculate_line_commission(rule, service_amount, case_index, default_percent, base_rule=None):
	"""Return (commission_amount, calculation_type, percent_used).
	
	base_rule: practitioner+cost_center rule (no item filters) for free_cases check.
	rule: fully matched rule (with item specificity) for commission calculation.
	"""
	service_amount = flt(service_amount)
	case_index = cint(case_index)

	# Check free_cases from base rule (applies to all items)
	free_cases_rule = base_rule or rule
	if free_cases_rule:
		free_cases = cint(free_cases_rule.free_cases or 0)
		if free_cases and case_index <= free_cases:
			calc_type = free_cases_rule.calculation_type or "Percent of Amount"
			return 0.0, calc_type, 0.0

	# If no rule matched for commission calculation, use default
	if not rule:
		percent = flt(default_percent)
		return flt(service_amount * percent / 100.0), "Percent of Amount (Default)", percent

	calc = rule.calculation_type or "Percent of Amount"
	if calc == "Fixed Per Case":
		return flt(rule.fixed_amount), calc, 0.0

	if calc == "Tiered by Cases":
		tier_after = cint(rule.tier_after_cases or 0)
		if tier_after and case_index > tier_after:
			percent = flt(rule.tier_commission_percent)
		else:
			percent = flt(rule.commission_percent)
		return flt(service_amount * percent / 100.0), calc, percent

	percent = flt(rule.commission_percent)
	return flt(service_amount * percent / 100.0), calc, percent


def get_item_groups(item_codes):
	if not item_codes:
		return {}
	rows = frappe.get_all(
		"Item",
		filters={"name": ["in", list(item_codes)]},
		fields=["name", "item_group"],
	)
	return {r.name: r.item_group for r in rows}


@frappe.whitelist()
def get_default_commission_percent():
	return flt(frappe.db.get_single_value("Healthcare Settings", "doctors_commission"))
