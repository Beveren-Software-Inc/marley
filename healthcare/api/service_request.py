# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _
from frappe.utils import cint, flt, nowdate

from healthcare.api.portal_errors import portal_mandatory_message, portal_validation_message
from healthcare.api.sales_order_cost_center import (
	apply_cost_center_to_sales_order,
	cost_center_from_service_request,
)
from healthcare.healthcare.editing_lock import assert_editing_allowed

LAB_SERVICE_REQUEST_ALLOWED_ROLES = {
	"Doctor",
	"System Manager",
	"Healthcare Administrator",
	"Administrator",
}


def _collect_lab_template_names_for_permission(
	template_dn=None, lab_request_items=None, selected_group_templates=None
):
	"""Gather all Lab Test Template names involved in a create/update payload."""
	names = set()
	if template_dn:
		names.add(str(template_dn).strip())
	for item in lab_request_items or []:
		if not isinstance(item, dict):
			continue
		kind = (item.get("kind") or "").strip().lower()
		if kind == "single":
			t = (item.get("template") or "").strip()
			if t:
				names.add(t)
		elif kind == "group":
			parent = (item.get("parent") or "").strip()
			if parent:
				names.add(parent)
			for child in item.get("children") or []:
				c = str(child).strip()
				if c:
					names.add(c)
		else:
			for key in ("template", "parent", "group_template"):
				v = (item.get(key) or "").strip()
				if v:
					names.add(v)
			for child in item.get("children") or item.get("templates") or []:
				c = str(child).strip()
				if c:
					names.add(c)
	for t in selected_group_templates or []:
		if t:
			names.add(str(t).strip())
	return {n for n in names if n}


def _get_template_base_rate(template_dt: str, template_dn: str, patient_care_type: str | None = None) -> float:
    """Resolve base rate from template document safely.

    Healthcare Service Template (OP): ``op_rate`` when > 0, else ``rate``.
    Healthcare Service Template (IP): ``rate``.
    Lab Test Template (OP): ``op_rate`` when > 0, else ``lab_test_rate`` / ``rate`` / ``amount``.
    Lab Test Template (IP): ``lab_test_rate`` / ``rate`` / ``amount``.
    """

    if template_dt == "Healthcare Service Template":
        from healthcare.healthcare.doctype.healthcare_service_template.healthcare_service_template import (
            get_healthcare_service_template_rate,
        )

        return get_healthcare_service_template_rate(
            template_name=template_dn,
            patient_care_type=patient_care_type,
        )

    meta = frappe.get_meta(template_dt)
    is_op_lab = template_dt == "Lab Test Template" and (patient_care_type or "").strip().upper() == "OP"

    possible_fields = (["op_rate"] if is_op_lab else []) + ["lab_test_rate", "rate", "amount"]
    existing_fields = [f for f in possible_fields if meta.has_field(f)]

    base = {}

    if existing_fields:
        base = frappe.db.get_value(
            template_dt,
            template_dn,
            existing_fields,
            as_dict=True,
        ) or {}

    for field in possible_fields:
        if field in base and base.get(field):
            return float(base[field])

    # fallback to Service Pricing
    first_pricing = frappe.get_all(
        "Service Pricing",
        filters={"parent": template_dn, "parenttype": template_dt},
        fields=["price"],
        order_by="idx asc",
        limit=1,
        ignore_permissions=True,
    )

    if first_pricing and first_pricing[0].get("price"):
        return float(first_pricing[0]["price"])

    return 0.0


def _resolve_patient_care_type(
	patient_care_type: str | None = None,
	patient_visit: str | None = None,
	inpatient_record: str | None = None,
) -> str | None:
	"""Normalize OP/IP from explicit care type or visit/admission context."""
	explicit = (patient_care_type or "").strip().upper()
	if explicit in ("OP", "IP"):
		return explicit
	if patient_visit:
		return "OP"
	if inpatient_record:
		return "IP"
	return None


def _lab_template_list_rate(row: dict, patient_care_type: str | None = None) -> float:
	"""Pick OP (op_rate) or IP (lab_test_rate) list price for a Lab Test Template row."""
	care = (patient_care_type or "").strip().upper()
	op = flt(row.get("op_rate") or 0)
	ip = flt(row.get("lab_test_rate") or 0)
	if care == "OP":
		return op if op > 0 else ip
	return ip if ip > 0 else op
# def _get_template_base_rate(template_dt: str, template_dn: str) -> float:
# 	"""Resolve base rate from template document."""
# 	base = frappe.db.get_value(
# 		template_dt,
# 		template_dn,
# 		["lab_test_rate", "rate", "amount"],
# 		as_dict=True,
# 	) or {}
# 	base = base.get("lab_test_rate") or base.get("rate") or base.get("amount")
# 	if base:
# 		return float(base)

# 	# Backward compatibility: if no single base-rate field exists, use first pricing row.
# 	first_pricing = frappe.get_all(
# 		"Service Pricing",
# 		filters={"parent": template_dn, "parenttype": template_dt},
# 		fields=["price"],
# 		order_by="idx asc",
# 		limit=1,
# 		ignore_permissions=True,
# 	)
# 	if first_pricing and first_pricing[0].get("price"):
# 		return float(first_pricing[0]["price"])

# 	return 0.0


def _get_patient_category_multipliers():
	"""Return patient-category multipliers from Healthcare Settings."""
	settings = frappe.get_cached_doc("Healthcare Settings")
	rows = []
	for row in (settings.get("patient_category_pricing") or []):
		category = getattr(row, "patient_category", None)
		if not category:
			continue
		multiplier = float(getattr(row, "multiplier", None) or 0)
		if multiplier <= 0:
			continue
		rows.append(
			{
				"patient_category": category,
				"multiplier": multiplier,
			}
		)
	return rows


def _build_pricing_rows_for_template(
	template_dt: str,
	template_dn: str,
	patient_care_type: str | None = None,
	patient: str | None = None,
):
	from healthcare.controllers.insurance_pricing import resolve_charge, should_apply_category_multiplier

	base_rate = _get_template_base_rate(template_dt, template_dn, patient_care_type)
	apply_mult = should_apply_category_multiplier(patient) if patient else True
	rows = []
	for row in _get_patient_category_multipliers():
		mult = row["multiplier"] if apply_mult else 1.0
		charged = resolve_charge(
			patient=patient,
			base_rate=base_rate,
			patient_care_type=patient_care_type,
			template_dt=template_dt,
			template_dn=template_dn,
			multiplier=mult,
		)
		list_price = (
			charged["rate_before_discount"]
			if base_rate or charged["used_insurance_price"]
			else 0.0
		)
		rows.append(
			{
				"patient_category": row["patient_category"],
				"multiplier": mult,
				# Catalog / Inclusive list price (before insurance %). Net is rate.
				"price": list_price,
				"rate": charged["rate"],
				"discount_pct": charged["discount_pct"],
				"discount_amount": charged.get("discount_amount") or 0.0,
				"base_rate": charged["base_rate"],
				"insurance": charged["insurance"],
			}
		)
	# When there are no category rows, still return a single effective price for the patient.
	if not rows and (base_rate or patient):
		charged = resolve_charge(
			patient=patient,
			base_rate=base_rate,
			patient_care_type=patient_care_type,
			template_dt=template_dt,
			template_dn=template_dn,
			multiplier=1.0,
		)
		rows.append(
			{
				"patient_category": None,
				"multiplier": 1.0,
				"price": charged["rate_before_discount"],
				"rate": charged["rate"],
				"discount_pct": charged["discount_pct"],
				"discount_amount": charged.get("discount_amount") or 0.0,
				"base_rate": charged["base_rate"],
				"insurance": charged["insurance"],
			}
		)
	return rows


def _ensure_lab_service_request_create_permission(template_dt, template_names=None):
	if template_dt != "Lab Test Template":
		return

	user_roles = set(frappe.get_roles(frappe.session.user))
	if user_roles.intersection(LAB_SERVICE_REQUEST_ALLOWED_ROLES):
		return

	if "Nurse" in user_roles:
		names = list(template_names or [])
		if not names:
			frappe.throw(_("Lab test template is required."), frappe.ValidationError)
		non_nurse = []
		for name in names:
			if not frappe.db.exists("Lab Test Template", name):
				frappe.throw(
					_("Lab Test Template {0} not found").format(name),
					frappe.ValidationError,
				)
			if not cint(frappe.db.get_value("Lab Test Template", name, "by_nurse")):
				non_nurse.append(name)
		if non_nurse:
			frappe.throw(
				_(
					"Nurses can only create Lab Service Requests for By Nurse templates. Not allowed: {0}"
				).format(", ".join(non_nurse)),
				frappe.PermissionError,
			)
		return

	frappe.throw(
		_(
			"Only users with Doctor, System Manager, or Healthcare Administrator roles can create Lab Service Requests."
		),
		frappe.PermissionError,
	)


@frappe.whitelist(allow_guest=False)
def get_lab_test_template_pricing(template):
	"""Return computed pricing rows for a Lab Test Template."""
	if not template:
		return []
	if not frappe.db.exists('Lab Test Template', template):
		return []
	return _build_pricing_rows_for_template("Lab Test Template", template)


@frappe.whitelist(allow_guest=False)
def get_lab_test_template_info(template):
	"""
	Return full pricing info for a Lab Test Template.
	For group templates, returns child template details and their pricing.
	For regular templates, returns the pricing table.
	"""
	if not template:
		return {'is_group': False, 'pricing': []}
	if not frappe.db.exists('Lab Test Template', template):
		return {'is_group': False, 'pricing': []}

	is_group = frappe.db.get_value('Lab Test Template', template, 'is_group')

	if not is_group:
		pricing = _build_pricing_rows_for_template("Lab Test Template", template)
		return {'is_group': False, 'pricing': pricing}

	# Group template — fetch each child template with its own pricing
	group_rows = frappe.get_all(
		'Lab Test Group Template',
		filters={
			'parent': template,
			'parenttype': 'Lab Test Template',
			'template_or_new_line': 'Add Test'
		},
		fields=['lab_test_template'],
		order_by='idx asc',
		ignore_permissions=True
	)

	group_templates = []
	for row in group_rows:
		if not row.lab_test_template:
			continue
		lab_test_name = frappe.db.get_value('Lab Test Template', row.lab_test_template, 'lab_test_name') or row.lab_test_template
		pricing = _build_pricing_rows_for_template("Lab Test Template", row.lab_test_template)
		group_templates.append({
			'lab_test_template': row.lab_test_template,
			'lab_test_name': lab_test_name,
			'pricing': pricing,
		})

	return {'is_group': True, 'group_templates': group_templates}


@frappe.whitelist(allow_guest=False)
def get_multi_lab_request_pricing(items, patient=None, patient_care_type=None):
	"""Return pricing breakdown for a multi-line lab basket."""
	from healthcare.healthcare.lab_request_items import (
		apply_discounts_to_specs,
		expand_lab_test_specs,
		lab_request_items_summary,
	)

	if isinstance(items, str):
		try:
			items = json.loads(items)
		except Exception:
			items = []
	if not isinstance(items, list):
		items = []

	if not patient:
		return {"lines": [], "subtotal": 0, "summary": ""}

	specs = expand_lab_test_specs(items, patient, patient_care_type=patient_care_type)
	specs = apply_discounts_to_specs(specs, items)
	lines = []
	subtotal = 0.0
	grand_total = 0.0
	discount_amount = 0.0
	for spec in specs:
		amount = float(spec.get("amount") or 0)
		net = float(spec.get("net_amount") if spec.get("net_amount") is not None else amount)
		applied = float(
			spec.get("discount_applied")
			if spec.get("discount_applied") is not None
			else (amount - net)
		)
		subtotal += amount
		grand_total += net
		discount_amount += applied
		tpl = spec.get("template")
		parent_group = spec.get("parent_group")
		parent_group_name = None
		if parent_group:
			parent_group_name = (
				frappe.db.get_value("Lab Test Template", parent_group, "lab_test_name") or parent_group
			)
		lab_test_name = frappe.db.get_value("Lab Test Template", tpl, "lab_test_name") or tpl
		# When children are free and the parent group carries the rate, label that line clearly.
		if spec.get("billed_from_parent_group") and parent_group_name:
			lab_test_name = f"{parent_group_name} (group charge)"
		lines.append(
			{
				"template": tpl,
				"lab_test_name": lab_test_name,
				"parent_group": parent_group,
				"parent_group_name": parent_group_name,
				"amount": amount,
				"discount_type": spec.get("discount_type") or "Percentage",
				"discount_rate": float(spec.get("discount_rate") or 0),
				"discount": float(spec.get("discount") or 0),
				"discount_applied": applied,
				"net_amount": net,
				"billed_from_parent_group": 1 if spec.get("billed_from_parent_group") else 0,
				"billing_only": 1 if spec.get("billing_only") else 0,
				"price_included_in_group": 1 if spec.get("price_included_in_group") else 0,
			}
		)
	return {
		"lines": lines,
		"subtotal": subtotal,
		"grand_total": grand_total,
		"discount_amount": discount_amount,
		"summary": lab_request_items_summary(items),
	}


@frappe.whitelist(allow_guest=False)
# def get_service_request_template_pricing(template_dt, template_dn):
# 	"""
# 	Return Service Pricing rows for any service request template type.
# 	For Lab Test Templates that are groups, also returns child template pricing breakdowns.
# 	All templates now share the 'service_pricing' child table (linked to Service Pricing doctype).
# 	"""
# 	if not template_dt or not template_dn:
# 		return {'is_group': False, 'pricing': [], 'group_templates': []}

# 	if not frappe.db.exists(template_dt, template_dn):
# 		return {'is_group': False, 'pricing': [], 'group_templates': []}

# 	def get_pricing(parent, parenttype=''):
# 		return frappe.get_all(
# 			'Service Pricing',
# 			filters={'parent': parent, 'parenttype': parenttype or template_dt},
# 			fields=['patient_category', 'price'],
# 			order_by='idx asc',
# 			ignore_permissions=True,
# 		)

# 	# Lab Test Template — handle group templates specially
# 	if template_dt == 'Lab Test Template':
# 		is_group = frappe.db.get_value('Lab Test Template', template_dn, 'is_group')
# 		if is_group:
# 			group_rows = frappe.get_all(
# 				'Lab Test Group Template',
# 				filters={
# 					'parent': template_dn,
# 					'parenttype': 'Lab Test Template',
# 					'template_or_new_line': 'Add Test',
# 				},
# 				fields=['lab_test_template'],
# 				order_by='idx asc',
# 				ignore_permissions=True,
# 			)
# 			group_templates = []
# 			for row in group_rows:
# 				if not row.lab_test_template:
# 					continue
# 				label = (
# 					frappe.db.get_value('Lab Test Template', row.lab_test_template, 'lab_test_name')
# 					or row.lab_test_template
# 				)
# 				group_templates.append({
# 					'template_dn': row.lab_test_template,
# 					'template_label': label,
# 					'pricing': get_pricing(row.lab_test_template, 'Lab Test Template'),
# 				})
# 			return {'is_group': True, 'pricing': [], 'group_templates': group_templates}

# 	# Regular / all other template types
# 	pricing = get_pricing(template_dn)
# 	return {'is_group': False, 'pricing': pricing, 'group_templates': []}

@frappe.whitelist(allow_guest=False)
def get_service_request_template_pricing(template_dt, template_dn, patient_care_type=None, patient=None):
	"""
	Return computed pricing rows for any service request template type.

	When ``patient`` is insured (e.g. TRICARE):
	- uses Inclusive Item price when set
	- applies outpatient/inpatient % (0% = no discount)
	- category multiplier only if Healthcare Settings Apply Multiplier on Insurance is on
	"""
	if not template_dt or not template_dn:
		return {'is_group': False, 'pricing': [], 'group_templates': []}

	if not frappe.db.exists(template_dt, template_dn):
		return {'is_group': False, 'pricing': [], 'group_templates': []}

	# Lab Test Template — handle group templates specially
	if template_dt == 'Lab Test Template':
		is_group = frappe.db.get_value('Lab Test Template', template_dn, 'is_group')
		if is_group:
			# Find all child lab test templates where lab_group equals the current template_dn
			child_templates = frappe.get_all(
				'Lab Test Template',
				filters={
					'lab_group': template_dn,
					'disabled': 0  # Only get enabled templates
				},
				fields=['name', 'lab_test_name', 'price_included_in_group'],
				order_by='lab_test_name asc',
				ignore_permissions=True,
			)

			group_templates = []
			for child in child_templates:
				if not child.name:
					continue
				label = child.lab_test_name or child.name
				included = cint(child.get('price_included_in_group'))
				child_pricing = _build_pricing_rows_for_template(
					'Lab Test Template', child.name, patient_care_type, patient=patient
				)
				# Included-in-group children show 0 for basket UI (covered by parent).
				if included:
					child_pricing = [
						{**row, 'price': 0} if isinstance(row, dict) else row
						for row in (child_pricing or [])
					]
				group_templates.append({
					'template_dn': child.name,
					'template_label': label,
					'price_included_in_group': included,
					'pricing': child_pricing,
				})
			# Parent group rate — always included in the group total.
			parent_pricing = _build_pricing_rows_for_template(
				'Lab Test Template', template_dn, patient_care_type, patient=patient
			)
			return {
				'is_group': True,
				'pricing': parent_pricing,
				'group_templates': group_templates,
				'parent_template_dn': template_dn,
			}
		else:
			# Regular lab test template (not a group)
			pricing = _build_pricing_rows_for_template(
				template_dt, template_dn, patient_care_type, patient=patient
			)
			return {'is_group': False, 'pricing': pricing, 'group_templates': []}

	# Regular / all other template types
	pricing = _build_pricing_rows_for_template(
		template_dt, template_dn, patient_care_type, patient=patient
	)
	return {'is_group': False, 'pricing': pricing, 'group_templates': []}


@frappe.whitelist()
def get_service_requests(
	limit=50,
	offset=0,
	patient=None,
	template_dt=None,
	status=None,
	search=None,
	practitioner=None,
	patient_search=None,
	patient_visit=None,
	inpatient_record=None,
	booked=None,
):
	"""Get list of Service Requests.

	Optional ``patient_search``: when ``patient`` is not set, narrows to Service Requests
	whose patient id or patient_name matches (contains) the search string.
	Optional ``booked``: when set (0/1/true/false), filter by Service Request.booked.
	"""
	from healthcare.api.common import get_permitted_cost_centers
	filters = {'docstatus': ['!=', 2]}

	if patient:
		filters['patient'] = patient
	elif patient_search and str(patient_search).strip():
		ps = str(patient_search).strip()
		matching = frappe.db.sql(
			"""
			SELECT name FROM `tabPatient`
			WHERE name LIKE %(q)s OR patient_name LIKE %(q)s
			LIMIT 500
			""",
			{'q': f'%{ps}%'},
			pluck='name',
		)
		if not matching:
			return {'data': [], 'total_count': 0}
		filters['patient'] = ['in', list(matching)]

	if template_dt:
		filters['template_dt'] = template_dt
	if status:
		filters['status'] = status
	if practitioner:
		filters['practitioner'] = practitioner
	if search:
		filters['name'] = ['like', f'%{search}%']
	if patient_visit:
		filters['patient_visit'] = patient_visit
	if inpatient_record:
		filters['inpatient_record'] = inpatient_record
	if booked is not None and str(booked).strip() != '':
		filters['booked'] = 1 if cint(booked) else 0

	# ── Cost-centre User Permission enforcement ──────────────────────────────
	# Records with no cost_center are visible regardless (use or_filters).
	permitted_cc = get_permitted_cost_centers()
	or_filters = None
	if permitted_cc is not None:
		if not permitted_cc:
			return {"data": [], "total_count": 0}
		or_filters = [
			['Service Request', 'cost_center', 'in', permitted_cc],
			['Service Request', 'cost_center', 'is', 'not set'],
		]

	# Resolve human-readable template names for all supported template types
	_template_name_field = {
		'Lab Test Template': 'lab_test_name',
		'Clinical Procedure Template': 'procedure_name',
		'Observation Template': 'observation',
		'Therapy Type': 'therapy_type',
		'Healthcare Activity': 'activity_type',
		'Healthcare Service Template': 'service_name',
		'Consultation Service Template': 'template_name',
		'Appointment Type': 'name',
	}

	fetch_kwargs = dict(
		filters=filters,
		fields=[
			'name', 'patient', 'patient_name', 'practitioner',
			'template_dt', 'template_dn', 'lab_request_items', 'status', 'order_date', 'order_time',
			'occurrence_date', 'occurrence_time', 'medical_department',
			'billing_status', 'priority', 'intent', 'patient_accepted_cost',
			'booked', 'order_group', 'cost', 'grand_total', 'amount', 'cost_center',
		],
		limit=limit,
		limit_start=offset,
		order_by='order_date desc, order_time desc',
	)
	if or_filters:
		fetch_kwargs['or_filters'] = or_filters

	# Count total matching records (without limit/offset)
	count_kwargs = dict(filters=filters)
	if or_filters:
		count_kwargs['or_filters'] = or_filters
	total_count = frappe.get_all('Service Request', **count_kwargs, limit=0, fields=['name'])
	total_count = len(total_count)

	from healthcare.healthcare.lab_request_items import (
		lab_request_items_summary,
		parse_lab_request_items,
	)

	service_requests = frappe.get_all('Service Request', **fetch_kwargs)
	for sr in service_requests:
		if sr.practitioner:
			sr['practitioner_name'] = (
				frappe.db.get_value('Healthcare Practitioner', sr.practitioner, 'practitioner_name')
				or sr.practitioner
			)

		items = parse_lab_request_items(sr)
		if items and sr.template_dt == 'Lab Test Template':
			sr['template_name'] = lab_request_items_summary(items) or sr.template_dn
			groups = []
			for item in items:
				if (item.get("kind") or "").strip().lower() != "group":
					continue
				parent = (item.get("parent") or "").strip()
				if not parent:
					continue
				parent_label = (
					frappe.db.get_value("Lab Test Template", parent, "lab_test_name")
					or parent
				)
				child_templates = [child for child in (item.get("children") or []) if child]
				if not child_templates:
					# Legacy group requests may omit the selected child list; in
					# that case the booking flow treats all active group children
					# as selected, so the visit panel should display the same set.
					child_templates = frappe.get_all(
						"Lab Test Template",
						filters={"lab_group": parent, "disabled": 0},
						pluck="name",
						order_by="lab_test_name asc",
						ignore_permissions=True,
					)
				children = []
				for child in child_templates:
					children.append(
						{
							"template": child,
							"label": (
								frappe.db.get_value(
									"Lab Test Template", child, "lab_test_name"
								)
								or child
							),
						}
					)
				groups.append(
					{
						"template": parent,
						"label": parent_label,
						"children": children,
					}
				)
			sr["lab_request_groups"] = groups
		elif sr.template_dn and sr.template_dt:
			name_field = _template_name_field.get(sr.template_dt)
			if name_field and name_field != 'name':
				resolved = frappe.db.get_value(sr.template_dt, sr.template_dn, name_field)
				sr['template_name'] = resolved or sr.template_dn
			else:
				sr['template_name'] = sr.template_dn
	
	return {"data": service_requests, "total_count": total_count}


def _parse_normal_range_bounds(normal_range):
	"""Best-effort min/max from free-text normal range (e.g. ``4.0 - 11.0``)."""
	import re

	text = (normal_range or "").strip()
	if not text:
		return None, None
	match = re.search(
		r"(-?\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(-?\d+(?:\.\d+)?)",
		text,
		flags=re.IGNORECASE,
	)
	if not match:
		return None, None
	return match.group(1), match.group(2)


def _range_value_or_none(value):
	"""Normalize template range fields; blank / unset → None (keep ``0`` when intentional)."""
	if value is None:
		return None
	if isinstance(value, str):
		text = value.strip()
		return text or None
	# Numeric 0 on Lab Test Template is often an unset default when sex-specific
	# ranges are used instead — still allow explicit non-zero generics.
	try:
		num = flt(value)
	except Exception:
		return str(value).strip() or None
	if num == 0:
		return None
	# Keep integer-looking values clean (2 not 2.0) when possible.
	if float(num).is_integer():
		return str(int(num))
	return str(num)


def _pick_template_min_max(row, patient_sex=None):
	"""Prefer sex-specific template ranges, then generic min/max, then normal_range text."""
	sex = (patient_sex or "").strip().lower()
	if sex in ("male", "m"):
		mn = _range_value_or_none(row.get("male_min_range"))
		mx = _range_value_or_none(row.get("male_max_range"))
		if mn is not None or mx is not None:
			return mn, mx
	elif sex in ("female", "f"):
		mn = _range_value_or_none(row.get("female_min_range"))
		mx = _range_value_or_none(row.get("female_max_range"))
		if mn is not None or mx is not None:
			return mn, mx

	mn = _range_value_or_none(row.get("min_range"))
	mx = _range_value_or_none(row.get("max_range"))
	if mn is not None or mx is not None:
		return mn, mx

	return _parse_normal_range_bounds(row.get("lab_test_normal_range"))


def _lab_result_type_label(template_type=None, is_multiple=0):
	if cint(is_multiple):
		return "Multiple"
	tt = (template_type or "").strip()
	if tt in ("Compound", "Descriptive", "Grouped"):
		return "Multiple"
	if tt == "Single" or not tt:
		return "Single"
	return tt or "Single"


def _template_review_fields(template_names, patient_sex=None, patient_care_type=None):
	"""Map template name → display fields for lab request review modal."""
	names = [n for n in {(n or "").strip() for n in (template_names or [])} if n]
	if not names:
		return {}

	has_included = frappe.db.has_column("Lab Test Template", "price_included_in_group")
	has_typo_included = frappe.db.has_column("Lab Test Template", "price_incuded_in_group")
	fields = [
		"name",
		"lab_test_code",
		"lab_test_name",
		"lab_test_uom",
		"lab_test_normal_range",
		"lab_test_template_type",
		"lab_test_rate",
		"op_rate",
		"is_multiple",
		"min_range",
		"max_range",
		"male_min_range",
		"male_max_range",
		"female_min_range",
		"female_max_range",
	]
	if has_included:
		fields.append("price_included_in_group")
	elif has_typo_included:
		fields.append("price_incuded_in_group")

	# Only request columns that exist on this site.
	fields = [f for f in fields if f == "name" or frappe.db.has_column("Lab Test Template", f)]

	rows = frappe.get_all(
		"Lab Test Template",
		filters={"name": ["in", names]},
		fields=fields,
		ignore_permissions=True,
	)
	out = {}
	for row in rows:
		included = cint(
			row.get("price_included_in_group")
			if row.get("price_included_in_group") is not None
			else row.get("price_incuded_in_group")
		)
		min_v, max_v = _pick_template_min_max(row, patient_sex)
		out[row.name] = {
			"template": row.name,
			# Document name is the stable lab code (LAB-001, LAB-001-014, …).
			# lab_test_code often mirrors the long display name on this site.
			"test_code": row.name,
			"test_name": row.get("lab_test_name") or row.get("lab_test_code") or row.name,
			"uom": row.get("lab_test_uom") or "",
			"normal_range": row.get("lab_test_normal_range") or "",
			"min_value": min_v,
			"max_value": max_v,
			"result_type": _lab_result_type_label(
				row.get("lab_test_template_type"), row.get("is_multiple")
			),
			"template_type": row.get("lab_test_template_type") or "",
			"price_included_in_group": included,
			"list_rate": _lab_template_list_rate(row, patient_care_type),
		}
	return out


@frappe.whitelist(allow_guest=False)
def get_lab_request_review(name):
	"""Read-only Lab Request review payload for the Lab page modal.

	Returns request header + test groups with child rows (code, name, price, result type, unit, min/max).
	Only for booked Lab Test Template Service Requests.
	"""
	from healthcare.healthcare.lab_request_items import (
		expand_lab_test_specs,
		lab_request_items_summary,
		parse_lab_request_items,
	)

	if not name:
		frappe.throw(_("Service Request name is required"))
	if not frappe.db.exists("Service Request", name):
		frappe.throw(_("Service Request not found"))

	doc = frappe.get_doc("Service Request", name)
	if doc.template_dt != "Lab Test Template":
		frappe.throw(_("This Service Request is not a Lab Request"))
	if not cint(doc.booked):
		frappe.throw(_("Only booked Lab Requests can be reviewed here"))

	items = parse_lab_request_items(doc)
	patient_care_type = _resolve_patient_care_type(
		getattr(doc, "patient_care_type", None),
		getattr(doc, "patient_visit", None),
		getattr(doc, "inpatient_record", None),
	)
	specs = expand_lab_test_specs(items, doc.patient, patient_care_type=patient_care_type)
	price_by_template = {s.get("template"): flt(s.get("amount") or 0) for s in specs if s.get("template")}

	# Resolve child lists the same way as list enrichment (legacy groups may omit children).
	groups = []
	all_child_names = []
	for item in items:
		kind = (item.get("kind") or "").strip().lower()
		if kind == "group":
			parent = (item.get("parent") or "").strip()
			if not parent:
				continue
			child_templates = [c for c in (item.get("children") or []) if c]
			if not child_templates:
				child_templates = frappe.get_all(
					"Lab Test Template",
					filters={"lab_group": parent, "disabled": 0},
					pluck="name",
					order_by="lab_test_name asc",
					ignore_permissions=True,
				)
			all_child_names.extend(child_templates)
			all_child_names.append(parent)
			groups.append({"kind": "group", "template": parent, "children": child_templates})
		elif kind == "single":
			tpl = (item.get("template") or "").strip()
			if not tpl:
				continue
			all_child_names.append(tpl)
			groups.append({"kind": "single", "template": tpl, "children": [tpl]})

	patient_sex = None
	if doc.patient and frappe.db.exists("Patient", doc.patient):
		sex_field = "sex" if frappe.db.has_column("Patient", "sex") else None
		if not sex_field and frappe.db.has_column("Patient", "gender"):
			sex_field = "gender"
		if sex_field:
			patient_sex = frappe.db.get_value("Patient", doc.patient, sex_field)

	meta = _template_review_fields(
		all_child_names, patient_sex=patient_sex, patient_care_type=patient_care_type
	)
	group_rows = []
	for g in groups:
		parent = g["template"]
		parent_meta = meta.get(parent) or {
			"test_code": parent,
			"test_name": parent,
		}
		tests = []
		for child in g["children"]:
			cm = meta.get(child) or {
				"template": child,
				"test_code": child,
				"test_name": child,
				"uom": "",
				"normal_range": "",
				"min_value": None,
				"max_value": None,
				"result_type": "Single",
				"price_included_in_group": 0,
				"list_rate": 0,
			}
			price = price_by_template.get(child)
			if price is None:
				price = 0.0 if cint(cm.get("price_included_in_group")) else flt(cm.get("list_rate") or 0)
			tests.append(
				{
					"template": child,
					"test_code": child,
					"test_name": cm.get("test_name") or child,
					"price": flt(price),
					"result_type": cm.get("result_type") or "Single",
					"uom": cm.get("uom") or "",
					"min_value": cm.get("min_value"),
					"max_value": cm.get("max_value"),
					"normal_range": cm.get("normal_range") or "",
					"price_included_in_group": cint(cm.get("price_included_in_group")),
				}
			)
		item_finished = 0
		for raw in items:
			kind = (raw.get("kind") or "").strip().lower()
			key = (raw.get("parent") or "").strip() if kind == "group" else (raw.get("template") or "").strip()
			if key == parent:
				item_finished = cint(raw.get("finished"))
				break

		group_rows.append(
			{
				"kind": g["kind"],
				"template": parent,
				"group_code": parent,
				"group_name": parent_meta.get("test_name")
				or frappe.db.get_value("Lab Test Template", parent, "lab_test_name")
				or parent,
				"is_group": 1 if g["kind"] == "group" else 0,
				"finished": item_finished,
				"tests": tests,
				"test_count": len(tests),
				"total_price": flt(sum(flt(t.get("price") or 0) for t in tests)),
			}
		)

	# Group price often lives on the parent template (children are 0 / included).
	for g in group_rows:
		if cint(g.get("is_group")) and flt(g.get("total_price") or 0) <= 0:
			parent_meta = meta.get(g["template"]) or {}
			parent_price = price_by_template.get(g["template"])
			if parent_price is None:
				parent_price = flt(parent_meta.get("list_rate") or 0)
			g["total_price"] = flt(parent_price)

	# Prefer stored billed totals when present.
	stored_total = flt(doc.get("grand_total") or doc.get("amount") or doc.get("cost") or 0)
	computed_total = flt(sum(flt(g.get("total_price") or 0) for g in group_rows))

	# Whole request finished → every group is finished.
	if (doc.status or "").strip() == "completed-Request Status":
		for g in group_rows:
			g["finished"] = 1

	# Linked Lab Tests created when this request was booked (for sample / results actions).
	lab_test_rows = frappe.get_all(
		"Lab Test",
		filters={"service_request": doc.name, "docstatus": ["!=", 2]},
		fields=[
			"name",
			"template",
			"lab_test_name",
			"status",
			"docstatus",
			"is_group_lab_test",
			"lab_test_group",
			"result_date",
			"custom_result",
			"patient",
			"patient_name",
			"practitioner",
			"practitioner_name",
		],
		order_by="creation asc",
		ignore_permissions=True,
	)
	lab_tests_by_template = {}
	for lt in lab_test_rows:
		tpl = (lt.get("template") or "").strip()
		if not tpl:
			continue
		lab_tests_by_template.setdefault(tpl, []).append(lt)

	for g in group_rows:
		for test in g.get("tests") or []:
			linked = lab_tests_by_template.get(test.get("template") or "", [])
			# Prefer exact template match; first linked doc is enough for actions.
			lt = linked[0] if linked else None
			test["lab_test"] = lt.get("name") if lt else None
			test["lab_test_status"] = lt.get("status") if lt else None
			test["lab_test_docstatus"] = cint(lt.get("docstatus")) if lt else None
			test["sample_collection"] = None
			test["custom_result"] = (lt.get("custom_result") or "") if lt else ""

	return {
		"name": doc.name,
		"patient": doc.patient,
		"patient_name": doc.patient_name,
		"practitioner": doc.practitioner,
		"practitioner_name": (
			frappe.db.get_value("Healthcare Practitioner", doc.practitioner, "practitioner_name")
			if doc.practitioner
			else None
		),
		# Lab users only care that it is booked — not Service Request workflow status.
		"status": "Booked",
		"service_request_status": doc.status,
		"booked": 1,
		"order_date": doc.order_date,
		"order_time": doc.order_time,
		"template_name": lab_request_items_summary(items) or doc.template_dn,
		"cost_center": doc.cost_center,
		"groups": group_rows,
		"group_count": len(group_rows),
		"test_count": sum(int(g.get("test_count") or 0) for g in group_rows),
		"total_price": stored_total or computed_total,
		"lab_tests": lab_test_rows,
	}


def generate_lab_test_trans_num(format_type="integer", prefix="", suffix="", padding=6):
    """
    Generate a sequential Trans Num for Lab Test by finding the largest existing integer.
    
    Args:
        format_type (str): "integer", "padded", "prefixed", or "suffixed"
        prefix (str): Prefix to add to the number (e.g., "LT-")
        suffix (str): Suffix to add to the number (e.g., "-2024")
        padding (int): Number of digits for zero padding (e.g., 6 for "000001")
    
    Returns:
        str: The next sequential Trans Num
    """
    # Get all Lab Test documents that have a Trans Num value
    # Use a more robust query to get all possible trans_num values
    lab_tests = frappe.db.sql("""
        SELECT trans_num 
        FROM `tabLab Test` 
        WHERE trans_num IS NOT NULL 
        AND trans_num != ''
        AND docstatus != 2
        ORDER BY 
            CASE 
                WHEN trans_num REGEXP '^[0-9]+$' THEN CAST(trans_num AS UNSIGNED)
                ELSE 0
            END DESC
        LIMIT 1
    """, as_dict=True)
    
    max_num = 0
    
    if lab_tests and lab_tests[0].get("trans_num"):
        trans_num = lab_tests[0]["trans_num"]
        
        # Try to extract number if it has prefix/suffix
        import re
        
        # Remove non-numeric characters and try to get the number
        numeric_part = re.sub(r'[^0-9]', '', str(trans_num))
        
        if numeric_part:
            try:
                max_num = int(numeric_part)
            except (ValueError, TypeError):
                max_num = 0
    
    # Increment by 1
    next_num = max_num + 1
    
    # Format based on requirements
    if format_type == "padded":
        return str(next_num).zfill(padding)
    elif format_type == "prefixed":
        return f"{prefix}{next_num}"
    elif format_type == "suffixed":
        return f"{next_num}{suffix}"
    else:  # "integer" or default
        return str(next_num)
    
@frappe.whitelist()
def create_lab_test_from_service_request(service_request):
	"""Create Lab Test(s) from a Service Request (supports multi-line lab baskets)."""
	if not service_request:
		frappe.throw(_("Service Request name is required"))

	from healthcare.healthcare.doctype.service_request.service_request import book_lab_and_forward

	service_request_doc = frappe.get_doc("Service Request", service_request)
	if service_request_doc.template_dt != "Lab Test Template":
		frappe.throw(_("Only Lab Test Template service requests can create lab tests."))

	# book_lab_and_forward requires patient_accepted_cost; allow direct create from API otherwise
	if not service_request_doc.patient_accepted_cost:
		service_request_doc.db_set("patient_accepted_cost", 1)

	result = book_lab_and_forward(service_request)
	names = result.get("lab_tests") or []
	if not names and result.get("lab_test"):
		names = [result["lab_test"]]

	lab_tests = []
	for name in names:
		lt = frappe.get_doc("Lab Test", name)
		lab_tests.append(
			{
				"name": lt.name,
				"patient": lt.patient,
				"patient_name": lt.patient_name,
				"template": lt.template,
				"lab_test_name": lt.lab_test_name,
				"status": lt.status,
			}
		)

	if len(lab_tests) == 1:
		row = lab_tests[0]
		return {
			"is_group": False,
			"name": row["name"],
			"patient": row["patient"],
			"patient_name": row["patient_name"],
			"template": row["template"],
			"lab_test_name": row["lab_test_name"],
			"status": row["status"],
			"lab_tests": lab_tests,
			"count": 1,
		}
	return {"is_group": True, "lab_tests": lab_tests, "count": len(lab_tests)}


@frappe.whitelist()
def create_service_request(data):
	"""Create a new Service Request"""
	if isinstance(data, str):
		import json
		data = json.loads(data)
	
	# Validate required fields
	if not data.get('patient'):
		frappe.throw(_("Patient is required"))
	
	if not data.get('template_dt'):
		frappe.throw(_("Template Type is required"))
	
	from healthcare.healthcare.lab_request_items import (
		apply_discounts_to_specs,
		expand_lab_test_specs,
		primary_template_dn_for_items,
		totals_from_specs,
	)

	lab_request_items = data.get("lab_request_items")
	if isinstance(lab_request_items, str):
		try:
			lab_request_items = json.loads(lab_request_items)
		except Exception:
			lab_request_items = []
	if not isinstance(lab_request_items, list):
		lab_request_items = []

	patient_care_type = _resolve_patient_care_type(
		data.get("patient_care_type"),
		data.get("patient_visit"),
		data.get("inpatient_record"),
	)
	if patient_care_type:
		data["patient_care_type"] = patient_care_type

	if lab_request_items and data.get("template_dt") == "Lab Test Template":
		data["template_dn"] = primary_template_dn_for_items(lab_request_items) or data.get("template_dn")
		specs = expand_lab_test_specs(
			lab_request_items,
			data.get("patient"),
			patient_care_type=patient_care_type,
		)
		specs = apply_discounts_to_specs(specs, lab_request_items)
		totals = totals_from_specs(specs)
		general_discount_amount = flt(data.get("general_discount_amount") or 0)
		line_grand_total = flt(totals["grand_total"])
		if general_discount_amount > line_grand_total:
			frappe.throw(
				_("General discount cannot be greater than the total after per-test discounts.")
			)
		data["cost"] = totals["cost"]
		data["grand_total"] = line_grand_total - general_discount_amount
		data["discount_amount"] = (
			flt(totals["discount_amount"]) + general_discount_amount
		)
		data["discount"] = 0
		data["discount_margin"] = "Amount"
	elif data.get("template_dt") == "Healthcare Service Template" and data.get("template_dn"):
		# List price in cost; insurance % in discount; net in grand_total (trackable to invoice)
		from healthcare.controllers.insurance_pricing import apply_discount as _apply_pct
		from healthcare.controllers.insurance_pricing import charge_list_and_discount, resolve_charge

		qty = flt(data.get("quantity") or 1) or 1
		ui_cost = data.get("cost")
		ui_grand = data.get("grand_total")
		# Explicit override (e.g. edited Admission Assessment Fee on admit) — keep submitted rates.
		if cint(data.get("override_rate")) and ui_cost is not None:
			list_unit = flt(ui_cost) / qty if qty else flt(ui_cost)
			unit_net = (
				flt(ui_grand) / qty if ui_grand is not None and qty else list_unit
			)
			data["cost"] = list_unit * qty
			data["grand_total"] = unit_net * qty
			data["discount_amount"] = max(0.0, flt(data["cost"]) - flt(data["grand_total"]))
			if not data.get("discount_margin"):
				data["discount"] = data.get("discount") or 0
				data["discount_margin"] = "Amount"
		else:
			base = _get_template_base_rate(
				data["template_dt"], data["template_dn"], patient_care_type
			)
			charged = resolve_charge(
				patient=data.get("patient"),
				base_rate=base,
				patient_care_type=patient_care_type,
				template_dt=data["template_dt"],
				template_dn=data["template_dn"],
				service_type=patient_care_type,
			)
			parts = charge_list_and_discount(charged)
			list_unit = flt(parts["list_rate"])
			# Catalog may have no rate (free / no-payment nursing Other Services).
			# Prefer UI-submitted cost when catalog list price is zero.
			if list_unit <= 0 and ui_cost is not None:
				list_unit = flt(ui_cost) / qty if qty else flt(ui_cost)
			insurance_pct = flt(parts["discount_pct"])
			# Prefer UI-submitted discount when already set (reception override);
			# otherwise use insurance %.
			header_pct = flt(data.get("discount") or 0)
			header_amt = flt(data.get("discount_amount") or 0)
			if header_pct <= 0 and header_amt <= 0 and insurance_pct > 0 and list_unit > 0:
				header_pct = insurance_pct
				data["discount"] = insurance_pct
				data["discount_margin"] = "Percentage"
			if header_pct > 0 and list_unit > 0:
				unit_net = _apply_pct(list_unit, header_pct)
				data["discount"] = header_pct
				data["discount_margin"] = data.get("discount_margin") or "Percentage"
			elif header_amt > 0 and list_unit > 0:
				unit_net = max(0.0, list_unit - (header_amt / qty))
				data["discount_margin"] = data.get("discount_margin") or "Amount"
			else:
				# No catalog price → keep UI list (may be 0 for free services)
				unit_net = (
					flt(parts["net_rate"]) if flt(parts["list_rate"]) > 0 else list_unit
				)
			data["cost"] = list_unit * qty
			data["grand_total"] = unit_net * qty
			data["discount_amount"] = max(0.0, flt(data["cost"]) - flt(data["grand_total"]))

	if not data.get('template_dn'):
		frappe.throw(_("Template is required"))

	# Require either Patient Visit (OP) or Inpatient Admission for clinical context
	if not data.get('patient_visit') and not data.get('inpatient_record'):
		frappe.throw(_("Please select either a Patient Visit or an Inpatient Admission for the service request"))

	if not data.get("cost_center"):
		frappe.throw(_("Please select a cost center for this service request."))

	if not data.get("practitioner"):
		frappe.throw(_("Please select a practitioner for this service request."))
	
	# Get naming series
	naming_series = frappe.db.get_value('Service Request', {'naming_series': 'HSR-'}, 'naming_series')
	if not naming_series:
		naming_series = 'HSR-'
	
	# Create the service request
	selected_group_templates = data.get("selected_group_templates") or []
	if isinstance(selected_group_templates, str):
		try:
			selected_group_templates = json.loads(selected_group_templates)
		except Exception:
			selected_group_templates = [selected_group_templates]
	if not isinstance(selected_group_templates, list):
		selected_group_templates = []
	selected_group_templates = [t for t in selected_group_templates if t]

	# Legacy single group: build lab_request_items when not sent from client
	if (
		not lab_request_items
		and data.get("template_dt") == "Lab Test Template"
		and data.get("template_dn")
	):
		is_group = frappe.db.get_value("Lab Test Template", data["template_dn"], "is_group")
		if is_group:
			lab_request_items = [
				{
					"kind": "group",
					"parent": data["template_dn"],
					"children": selected_group_templates,
				}
			]
		else:
			lab_request_items = [{"kind": "single", "template": data["template_dn"]}]

	_ensure_lab_service_request_create_permission(
		data.get("template_dt"),
		_collect_lab_template_names_for_permission(
			data.get("template_dn"),
			lab_request_items,
			selected_group_templates,
		),
	)

	service_request = frappe.get_doc({
		'doctype': 'Service Request',
		'patient': data.get('patient'),
		'patient_visit': data.get('patient_visit'),
		'inpatient_record': data.get('inpatient_record'),
		'patient_care_type': data.get('patient_care_type') or patient_care_type,
		'template_dt': data.get('template_dt'),
		'template_dn': data.get('template_dn'),
		'lab_request_items': frappe.as_json(lab_request_items) if lab_request_items else None,
		'practitioner': data.get('practitioner'),
		'order_date': data.get('order_date') or frappe.utils.today(),
		'order_time': data.get('order_time') or frappe.utils.nowtime(),
		'medical_department': data.get('department'),
		'cost': data.get('cost'),
		'cost_center': data.get('cost_center'),
		'status': data.get('status') or 'draft-Request Status',
		'priority': data.get('priority'),
		'intent': data.get('intent'),
		'quantity': data.get('quantity') or 1,
		'occurrence_date': data.get('occurrence_date'),
		'occurrence_time': data.get('occurrence_time'),
		'naming_series': naming_series,
		# Discount fields (header discount for non-basket requests; basket uses per-test discounts in JSON)
		'discount': frappe.utils.flt(data.get('discount') or 0),
		'discount_margin': data.get('discount_margin') or data.get('discount_value') or '',
		'discount_amount': frappe.utils.flt(data.get('discount_amount') or 0),
		'grand_total': frappe.utils.flt(data.get('grand_total') or data.get('cost') or 0),
		'selected_group_templates': frappe.as_json(selected_group_templates),
	})
	
	try:
		service_request.insert(ignore_permissions=True)
	except frappe.MandatoryError as e:
		frappe.throw(portal_mandatory_message(e), exc=e, title=_("Missing required fields"))
	except frappe.ValidationError as e:
		frappe.throw(portal_validation_message(e), exc=e, title=_("Could not save"))
	
	# Get template name for response based on template_dt
	template_name = None
	if lab_request_items and service_request.template_dt == 'Lab Test Template':
		from healthcare.healthcare.lab_request_items import lab_request_items_summary
		template_name = lab_request_items_summary(lab_request_items)
	elif service_request.template_dn:
		if service_request.template_dt == 'Lab Test Template':
			template_name = frappe.db.get_value('Lab Test Template', service_request.template_dn, 'lab_test_name')
		elif service_request.template_dt == 'Clinical Procedure Template':
			template_name = frappe.db.get_value('Clinical Procedure Template', service_request.template_dn, 'procedure_name')
		elif service_request.template_dt == 'Observation Template':
			template_name = frappe.db.get_value('Observation Template', service_request.template_dn, 'observation')
		elif service_request.template_dt == 'Therapy Type':
			template_name = frappe.db.get_value('Therapy Type', service_request.template_dn, 'therapy_type')
		elif service_request.template_dt == 'Healthcare Activity':
			template_name = frappe.db.get_value('Healthcare Activity', service_request.template_dn, 'activity_type')
		elif service_request.template_dt == 'Healthcare Service Template':
			template_name = frappe.db.get_value('Healthcare Service Template', service_request.template_dn, 'service_name')
		else:
			template_name = service_request.template_dn
	
	# Get practitioner name if practitioner exists
	practitioner_name = None
	if service_request.practitioner:
		practitioner_name = frappe.db.get_value('Healthcare Practitioner', service_request.practitioner, 'practitioner_name')
	
	# Return the created service request
	return {
		'name': service_request.name,
		'patient': service_request.patient,
		'patient_name': service_request.patient_name or frappe.db.get_value('Patient', service_request.patient, 'patient_name'),
		'template_dt': service_request.template_dt,
		'template_dn': service_request.template_dn,
		'template_name': template_name or service_request.template_dn,
		'practitioner': service_request.practitioner,
		'practitioner_name': practitioner_name or service_request.practitioner if service_request.practitioner else None,
		'status': service_request.status,
		'order_date': service_request.order_date
	}


def _get_general_lab_discount(doc, request_items=None):
	"""Return the request-level discount excluding discounts stored on test lines."""
	if doc.template_dt != "Lab Test Template" or not doc.patient:
		return 0.0

	from healthcare.healthcare.lab_request_items import (
		apply_discounts_to_specs,
		expand_lab_test_specs,
		parse_lab_request_items,
		totals_from_specs,
	)

	items = request_items if request_items is not None else parse_lab_request_items(doc)
	if not items:
		return flt(doc.discount_amount)
	patient_care_type = _resolve_patient_care_type(
		getattr(doc, "patient_care_type", None),
		getattr(doc, "patient_visit", None),
		getattr(doc, "inpatient_record", None),
	)
	specs = expand_lab_test_specs(items, doc.patient, patient_care_type=patient_care_type)
	specs = apply_discounts_to_specs(specs, items)
	line_totals = totals_from_specs(specs)
	return flt(doc.discount_amount) - flt(line_totals["discount_amount"])


@frappe.whitelist()
def get_service_request(name):
	"""Get a single Service Request document for editing."""
	if not name:
		frappe.throw(_("Service Request name is required"))
	if not frappe.db.exists("Service Request", name):
		frappe.throw(_("Service Request not found"))
	doc = frappe.get_doc("Service Request", name)
	data = doc.as_dict()
	if doc.template_dt == "Lab Test Template":
		# Always expose normalized lines to the edit form. This also gives legacy
		# single/group requests per-test discount controls even when they predate
		# the lab_request_items JSON field.
		from healthcare.healthcare.lab_request_items import (
			enrich_lab_request_items_for_display,
			lab_request_items_summary,
			parse_lab_request_items,
		)

		request_items = parse_lab_request_items(doc)
		data["lab_request_items"] = enrich_lab_request_items_for_display(request_items)
		data["general_discount_amount"] = _get_general_lab_discount(doc, request_items)
		data["template_name"] = (
			lab_request_items_summary(request_items)
			or frappe.db.get_value("Lab Test Template", doc.template_dn, "lab_test_name")
			or doc.template_dn
		)
	elif doc.template_dn:
		_template_name_field = {
			"Clinical Procedure Template": "procedure_name",
			"Observation Template": "observation",
			"Therapy Type": "therapy_type",
			"Healthcare Activity": "activity_type",
			"Healthcare Service Template": "service_name",
			"Consultation Service Template": "template_name",
		}
		name_field = _template_name_field.get(doc.template_dt or "")
		if name_field and frappe.db.exists(doc.template_dt, doc.template_dn):
			data["template_name"] = (
				frappe.db.get_value(doc.template_dt, doc.template_dn, name_field)
				or doc.template_dn
			)
		else:
			data["template_name"] = doc.template_dn
	return data


@frappe.whitelist()
def update_service_request(name, data):
	"""Update an existing Service Request. Only allows updating specific fields."""
	assert_editing_allowed()
	if isinstance(data, str):
		import json
		data = json.loads(data)
	if not name:
		frappe.throw(_("Service Request name is required"))
	if not frappe.db.exists("Service Request", name):
		frappe.throw(_("Service Request not found"))
	doc = frappe.get_doc("Service Request", name)
	if doc.docstatus == 2:
		frappe.throw(_("Cannot update a cancelled Service Request"))
	general_discount_amount = data.pop("general_discount_amount", None)
	if general_discount_amount is None:
		general_discount_amount = _get_general_lab_discount(doc)
	general_discount_amount = flt(general_discount_amount)
	# Allowed fields for update (editable in edit modal).
	# Exclude set_only_once fields: practitioner, referring_practitioner, source (cannot be changed after set).
	allowed = {
		"patient", "patient_visit", "inpatient_record", "template_dt", "template_dn",
		"lab_request_items",
		"order_date", "order_time", "medical_department", "department",
		"status", "priority", "intent", "quantity", "occurrence_date", "occurrence_time",
		"order_group", "order_description", "patient_instructions", "expected_date",
		"amount", "cost", "referred_to_practitioner",
		"staff_role", "patient_care_type", "healthcare_service_unit_type", "as_needed",
		"dosage_form", "dosage", "period", "cost_center",
		# Discount fields
		"discount", "discount_margin", "discount_value", "discount_amount", "grand_total",
	}
	for key, value in data.items():
		if key == "department":
			doc.medical_department = value
		elif key == "discount_value" and hasattr(doc, "discount_margin"):
			doc.discount_margin = value
		elif key == "lab_request_items":
			if isinstance(value, list):
				doc.lab_request_items = frappe.as_json(value) if value else None
			else:
				doc.lab_request_items = value
		elif key in allowed and hasattr(doc, key):
			doc.set(key, value)

	if doc.template_dt == "Lab Test Template" and doc.lab_request_items and doc.patient:
		from healthcare.healthcare.lab_request_items import (
			apply_discounts_to_specs,
			expand_lab_test_specs,
			parse_lab_request_items,
			totals_from_specs,
		)

		request_items = parse_lab_request_items(doc)
		patient_care_type = _resolve_patient_care_type(
			getattr(doc, "patient_care_type", None),
			getattr(doc, "patient_visit", None),
			getattr(doc, "inpatient_record", None),
		)
		specs = expand_lab_test_specs(request_items, doc.patient, patient_care_type=patient_care_type)
		specs = apply_discounts_to_specs(specs, request_items)
		totals = totals_from_specs(specs)
		line_grand_total = flt(totals["grand_total"])
		if general_discount_amount > line_grand_total:
			frappe.throw(
				_("General discount cannot be greater than the total after per-test discounts.")
			)
		doc.cost = totals["cost"]
		doc.grand_total = line_grand_total - general_discount_amount
		doc.discount_amount = flt(totals["discount_amount"]) + general_discount_amount
		if request_items:
			doc.discount = 0
			doc.discount_margin = "Amount"
	doc.save()
	return {"name": doc.name, "status": doc.status}


def _service_request_visit_admission_refs(sr):
	"""IP/OP context for Sales Order.custom_reference_* (same convention as Sales Invoice)."""
	if getattr(sr, "inpatient_record", None):
		return "Inpatient Admission", sr.inpatient_record
	if getattr(sr, "patient_visit", None):
		return "Patient Visit", sr.patient_visit
	return None, None


def _service_request_base_doc_refs(sr):
	"""Underlying clinical/billing doc: Lab Test, IP service, PMO, etc.; else Service Request."""
	odt = (getattr(sr, "order_reference_doctype", None) or "").strip()
	odn = (getattr(sr, "order_reference_name", None) or "").strip()
	if odt and odn:
		try:
			if frappe.db.exists(odt, odn):
				return odt, odn
		except Exception:
			pass
	return "Service Request", sr.name


def apply_service_request_refs_to_sales_order(so, sr):
	"""Set custom_reference_* to Patient Visit / Inpatient Admission; base to lab/service/PMO or SR."""
	rt, rn = _service_request_visit_admission_refs(sr)
	if not rt or not rn:
		frappe.throw(
			_(
				"Service Request {0} must be linked to a Patient Visit or Inpatient Admission before billing."
			).format(sr.name)
		)
	so.custom_reference_type = rt
	so.custom_reference_name = rn
	bdt, bdn = _service_request_base_doc_refs(sr)
	so.custom_base_reference = bdt
	so.custom_base_reference_name = bdn


def _resolve_template_item_code(template_dt, template_dn):
	"""Resolve billing Item from a service/lab template."""
	template_doc = frappe.get_doc(template_dt, template_dn)
	item_code = (
		getattr(template_doc, "item", None)
		or getattr(template_doc, "item_code", None)
		or getattr(template_doc, "service_item", None)
		or getattr(template_doc, "service_item_code", None)
	)
	if not item_code:
		frappe.throw(
			_("{0} {1} must have an Item or Item Code configured for billing").format(
				template_dt, template_dn
			)
		)
	if not frappe.db.exists("Item", item_code):
		frappe.throw(_("Item {0} does not exist in the system").format(item_code))
	return item_code, template_doc


def _ensure_lab_item_group(item_code):
	"""Ensure billing Item has an Item Group (create Lab Test group if missing)."""
	item_doc = frappe.get_doc("Item", item_code)
	if item_doc.item_group:
		return
	item_group_name = "Lab Test"
	if not frappe.db.exists("Item Group", item_group_name):
		item_group = frappe.new_doc("Item Group")
		item_group.item_group_name = item_group_name
		item_group.parent_item_group = "All Item Groups"
		item_group.insert(ignore_permissions=True)
	item_doc.item_group = item_group_name
	item_doc.save(ignore_permissions=True)


def _lab_request_sales_order_specs(sr):
	"""Expand multi-test lab baskets into concrete billed lines."""
	from healthcare.healthcare.lab_request_items import (
		apply_discounts_to_specs,
		expand_lab_test_specs,
		parse_lab_request_items,
	)

	request_items = parse_lab_request_items(sr)
	if not request_items or sr.template_dt != "Lab Test Template":
		return [], 0.0

	patient_care_type = _resolve_patient_care_type(
		getattr(sr, "patient_care_type", None),
		getattr(sr, "patient_visit", None),
		getattr(sr, "inpatient_record", None),
	)
	specs = expand_lab_test_specs(
		request_items, sr.patient, patient_care_type=patient_care_type
	)
	specs = apply_discounts_to_specs(specs, request_items)
	general_discount = _get_general_lab_discount(sr, request_items)
	return specs, general_discount


@frappe.whitelist()
def confirm_payment(service_request_name):

	if not service_request_name:
		frappe.throw(_("Service Request name is required"))

	sr = frappe.get_doc("Service Request", service_request_name)

	# Prevent duplicate execution
	if sr.patient_accepted_cost:
		return {"ok": True, "patient_accepted_cost": 1}

	# Validate dynamic template
	if not sr.template_dt or not sr.template_dn:
		frappe.throw(_("Template is required"))

	delivery_date = sr.expected_date or nowdate()

	# ------------------------
	# Create Sales Order
	# ------------------------
	so = frappe.new_doc("Sales Order")
	so.patient = sr.patient
	if getattr(sr, "company", None):
		so.company = sr.company

	customer = frappe.db.get_value("Patient", sr.patient, "customer") if sr.patient else None
	if not customer:
		frappe.throw(
			_("Patient {0} has no Customer linked. Link a customer on the patient record first.").format(
				sr.patient
			)
		)

	so.customer = customer
	so.transaction_date = nowdate()
	so.delivery_date = delivery_date
	so.ignore_pricing_rule = 1

	from healthcare.controllers.insurance_pricing import sales_item_from_list_and_discount

	lab_specs, general_discount = _lab_request_sales_order_specs(sr)
	visit_charge_rows = []

	if lab_specs:
		# One Sales Order line per concrete child lab test (not per group parent).
		for spec in lab_specs:
			tpl = spec.get("template")
			item_code, _template_doc = _resolve_template_item_code("Lab Test Template", tpl)
			_ensure_lab_item_group(item_code)
			lab_test_name = (
				frappe.db.get_value("Lab Test Template", tpl, "lab_test_name") or tpl
			)
			if spec.get("billed_from_parent_group"):
				lab_test_name = f"{lab_test_name} (group charge)"
			list_rate = flt(spec.get("amount") or 0)
			net_rate = flt(
				spec.get("net_amount") if spec.get("net_amount") is not None else list_rate
			)
			disc_type = (spec.get("discount_type") or "Amount").strip()
			so.append(
				"items",
				sales_item_from_list_and_discount(
					item_code=item_code,
					list_rate=list_rate,
					discount_pct=flt(spec.get("discount_rate") or 0) if disc_type == "Percentage" else 0,
					discount_amount=flt(spec.get("discount") or 0) if disc_type == "Amount" else 0,
					net_rate=net_rate,
					description=f"{lab_test_name} ({sr.name})",
				),
			)
			visit_charge_rows.append(
				{
					"sr_no": sr.name,
					"test_name": lab_test_name,
					"lab_test_template": tpl,
					"lab_test_group": spec.get("parent_group"),
					"amount": list_rate,
					"discount_type": disc_type,
					"discount_rate": flt(spec.get("discount_rate") or 0) if disc_type == "Percentage" else 0,
					"discount": flt(spec.get("discount") or 0) if disc_type == "Amount" else 0,
					"net_amount": net_rate,
				}
			)
		if general_discount:
			# ERPNext Sales Order additional/header discount field is discount_amount
			# (not additional_discount_amount).
			so.apply_discount_on = "Grand Total"
			so.discount_amount = flt(general_discount)
			so.additional_discount_percentage = 0
	else:
		# Legacy / non-basket: single template line.
		item_code, template_doc = _resolve_template_item_code(sr.template_dt, sr.template_dn)
		_ensure_lab_item_group(item_code)
		amount = (
			getattr(template_doc, "lab_test_rate", None)
			or getattr(template_doc, "rate", None)
			or getattr(template_doc, "amount", None)
			or 0
		)
		list_rate = flt(sr.cost) or flt(amount) or 0
		net_rate = flt(sr.grand_total) or list_rate
		so.append(
			"items",
			sales_item_from_list_and_discount(
				item_code=item_code,
				list_rate=list_rate,
				discount_pct=flt(sr.discount),
				discount_amount=flt(sr.discount_amount),
				net_rate=net_rate,
				description=f"Service Request {sr.name}",
			),
		)
		visit_charge_rows.append(
			{
				"sr_no": sr.name,
				"test_name": sr.template_dn or "",
				"lab_test_template": sr.template_dn if sr.template_dt == "Lab Test Template" else None,
				"amount": list_rate or 0,
				"discount_type": "Percentage" if flt(sr.discount) else "Amount",
				"discount_rate": flt(sr.discount) or 0,
				"discount": flt(sr.discount_amount) or 0,
				"net_amount": net_rate or 0,
			}
		)

	apply_service_request_refs_to_sales_order(so, sr)
	apply_cost_center_to_sales_order(so, cost_center_from_service_request(sr))

	so.insert(ignore_permissions=True)
	so.submit()

	# Update Service Request
	sr.db_set("patient_accepted_cost", 1)
	sr.db_set("reference_document_type", "Sales Order")
	sr.db_set("reference_document_name", so.name)

	patient_visit_name = getattr(sr, "patient_visit", None)

	if patient_visit_name:
		try:
			visit = frappe.get_doc("Patient Visit", patient_visit_name)

			existing_templates = {
				(row.get("lab_test_template") or "").strip()
				for row in visit.get("lab_tests_charges", [])
			}
			already_for_sr = any(
				(row.get("sr_no") or "").strip() == sr.name
				for row in visit.get("lab_tests_charges", [])
			)
			added = False
			if not already_for_sr:
				for row in visit_charge_rows:
					key = (row.get("lab_test_template") or "").strip()
					if key and key in existing_templates:
						continue
					visit.append("lab_tests_charges", row)
					if key:
						existing_templates.add(key)
					added = True
			if added:
				visit.save(ignore_permissions=True)
				frappe.db.commit()

		except Exception:
			frappe.log_error(
				title="Failed to update Patient Visit lab charges",
				message=frappe.get_traceback()
			)
			# We don't throw here — SO was already created, don't block the flow

		# Lab Visit types already charged a registration SO; remove it so the patient
		# is not billed twice when this lab Sales Order is created for the same visit.
		try:
			from healthcare.api.patient_visit_charge import remove_lab_visit_registration_charge

			remove_lab_visit_registration_charge(patient_visit_name)
		except Exception:
			frappe.log_error(
				title="Failed to remove lab-visit registration charge",
				message=frappe.get_traceback(),
			)

	frappe.db.commit()

	return {
		"ok": True,
		"patient_accepted_cost": 1,
		"sales_order": so.name,
		"item_count": len(so.items),
	}


@frappe.whitelist(allow_guest=False)
def confirm_session_payment(service_request_name):
	"""
	Confirm payment for non-Lab Test service requests.
	Looks up the item/item_code from the linked template, creates a Sales Order,
	and marks the service request as payment accepted.
	"""
	if not service_request_name:
		frappe.throw(_("Service Request name is required"))

	sr = frappe.get_doc("Service Request", service_request_name)

	if sr.patient_accepted_cost:
		return {"ok": True, "patient_accepted_cost": 1}

	if not sr.template_dt or not sr.template_dn:
		frappe.throw(_("Template is required on the Service Request"))

	template_doc = frappe.get_doc(sr.template_dt, sr.template_dn)

	# Resolve item code — templates use either `item` (Link) or `item_code` (Data)
	item_code = (
		getattr(template_doc, "item", None)
		or getattr(template_doc, "item_code", None)
	)
	if not item_code:
		frappe.throw(
			_("{0} '{1}' must have an Item or Item Code configured before confirming payment").format(
				sr.template_dt, sr.template_dn
			)
		)

	from healthcare.controllers.insurance_pricing import sales_item_from_list_and_discount

	list_rate = frappe.utils.flt(sr.cost) or 0
	net_rate = frappe.utils.flt(sr.grand_total) or list_rate
	delivery_date = sr.get("expected_date") or nowdate()

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
	so.transaction_date = nowdate()
	so.delivery_date = delivery_date
	so.ignore_pricing_rule = 1
	so.append(
		"items",
		sales_item_from_list_and_discount(
			item_code=item_code,
			list_rate=list_rate,
			discount_pct=frappe.utils.flt(sr.discount),
			discount_amount=frappe.utils.flt(sr.discount_amount),
			net_rate=net_rate,
			description=f"Service Request {sr.name}",
		),
	)
	apply_service_request_refs_to_sales_order(so, sr)
	apply_cost_center_to_sales_order(so, cost_center_from_service_request(sr))
	so.insert(ignore_permissions=True)
	so.submit()

	sr.db_set("patient_accepted_cost", 1)
	sr.db_set("status", "active-Request Status")
	sr.db_set("reference_document_type", "Sales Order")
	sr.db_set("reference_document_name", so.name)
	frappe.db.commit()

	return {"ok": True, "patient_accepted_cost": 1, "sales_order": so.name}


@frappe.whitelist(allow_guest=False)
def book_session(service_request_name, appointment=None):
	"""
	Book a session for a non-Lab Test service request.
	- For 'Consultation Service Template': creates a Consultation Service linked to the SR.
	  If an appointment name is provided it is linked to the SR and the Consultation Service.
	- For all other types: marks the SR as booked.
	"""
	if not service_request_name:
		frappe.throw(_("Service Request name is required"))

	sr = frappe.get_doc("Service Request", service_request_name)

	if not sr.patient_accepted_cost:
		frappe.throw(_("Payment must be confirmed before booking a session"))

	if sr.booked:
		return {"ok": True, "already_booked": True}

	created_doc = None

	# Link the Patient Appointment back to this Service Request
	if appointment and frappe.db.exists("Patient Appointment", appointment):
		frappe.db.set_value("Patient Appointment", appointment, "service_request", sr.name)

	if sr.template_dt == "Consultation Service Template":
		cs = frappe.new_doc("Consultation Service")
		cs.file_number = sr.patient
		cs.admission_no = sr.get("inpatient_record") or None
		cs.patient_full_name = (
			sr.patient_name
			or frappe.db.get_value("Patient", sr.patient, "patient_name")
			or ""
		)
		cs.cost_center = sr.cost_center or None
		cs.service_request = sr.name
		cs.type = "Internal Service"
		cs.flags.ignore_mandatory = True
		cs.flags.ignore_permissions = True
		cs.insert()
		created_doc = {"doctype": "Consultation Service", "name": cs.name}
	elif sr.template_dt == "Healthcare Service Template":
		if not sr.get("inpatient_record"):
			frappe.throw(_("An Inpatient Admission is required to book an IP Service request"))
		if not sr.get("cost_center"):
			frappe.throw(_("Cost Center is required on the Service Request before booking"))

		template_category = None
		if sr.get("template_dn") and frappe.db.exists("Healthcare Service Template", sr.template_dn):
			template_category = frappe.db.get_value("Healthcare Service Template", sr.template_dn, "category")

		from healthcare.api.ip_service import create_ip_service

		result = create_ip_service(
			admission_no=sr.inpatient_record,
			cost_center=sr.cost_center,
			service_request=sr.name,
			type="Internal Service",
			category=template_category or None,
		)
		ip_service_name = result.get("name") if isinstance(result, dict) else None
		if ip_service_name:
			created_doc = {"doctype": "IP Service", "name": ip_service_name}

	sr.db_set("booked", 1)
	frappe.db.commit()

	return {
		"ok": True,
		"booked": 1,
		"created": created_doc,
	}