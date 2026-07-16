# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _
from frappe.utils import flt, nowdate

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

def _get_template_base_rate(template_dt: str, template_dn: str, patient_care_type: str | None = None) -> float:
    """Resolve base rate from template document safely.

    Healthcare Service Template (OP): ``op_rate`` when > 0, else ``rate``.
    Healthcare Service Template (IP): ``rate``.
    Lab Test Template (OP): ``op_rate`` when > 0, else ``lab_test_rate`` / ``rate`` / ``amount``.
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


def _ensure_lab_service_request_create_permission(template_dt):
	if template_dt != "Lab Test Template":
		return

	user_roles = set(frappe.get_roles(frappe.session.user))
	if user_roles.intersection(LAB_SERVICE_REQUEST_ALLOWED_ROLES):
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
		lines.append(
			{
				"template": tpl,
				"lab_test_name": frappe.db.get_value("Lab Test Template", tpl, "lab_test_name") or tpl,
				"parent_group": spec.get("parent_group"),
				"amount": amount,
				"discount_type": spec.get("discount_type") or "Percentage",
				"discount_rate": float(spec.get("discount_rate") or 0),
				"discount": float(spec.get("discount") or 0),
				"discount_applied": applied,
				"net_amount": net,
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
				fields=['name', 'lab_test_name'],
				order_by='lab_test_name asc',
				ignore_permissions=True,
			)

			group_templates = []
			for child in child_templates:
				if not child.name:
					continue
				label = child.lab_test_name or child.name
				group_templates.append({
					'template_dn': child.name,
					'template_label': label,
					'pricing': _build_pricing_rows_for_template(
						'Lab Test Template', child.name, patient_care_type, patient=patient
					),
				})
			return {'is_group': True, 'pricing': [], 'group_templates': group_templates}
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
):
	"""Get list of Service Requests.

	Optional ``patient_search``: when ``patient`` is not set, narrows to Service Requests
	whose patient id or patient_name matches (contains) the search string.
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
		elif sr.template_dn and sr.template_dt:
			name_field = _template_name_field.get(sr.template_dt)
			if name_field and name_field != 'name':
				resolved = frappe.db.get_value(sr.template_dt, sr.template_dn, name_field)
				sr['template_name'] = resolved or sr.template_dn
			else:
				sr['template_name'] = sr.template_dn
	
	return {"data": service_requests, "total_count": total_count}


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

	patient_care_type = (
		"OP" if data.get("patient_visit") else "IP" if data.get("inpatient_record") else None
	)

	if lab_request_items and data.get("template_dt") == "Lab Test Template":
		data["template_dn"] = primary_template_dn_for_items(lab_request_items) or data.get("template_dn")
		specs = expand_lab_test_specs(
			lab_request_items,
			data.get("patient"),
			patient_care_type=patient_care_type,
		)
		specs = apply_discounts_to_specs(specs, lab_request_items)
		totals = totals_from_specs(specs)
		data["cost"] = totals["cost"]
		data["grand_total"] = totals["grand_total"]
		data["discount_amount"] = totals["discount_amount"]
		data["discount"] = 0
		data["discount_margin"] = ""
	elif data.get("template_dt") == "Healthcare Service Template" and data.get("template_dn"):
		# List price in cost; insurance % in discount; net in grand_total (trackable to invoice)
		from healthcare.controllers.insurance_pricing import apply_discount as _apply_pct
		from healthcare.controllers.insurance_pricing import charge_list_and_discount, resolve_charge

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
		qty = flt(data.get("quantity") or 1) or 1
		list_unit = flt(parts["list_rate"])
		insurance_pct = flt(parts["discount_pct"])
		# Prefer UI-submitted discount when already set (reception override);
		# otherwise use insurance %.
		header_pct = flt(data.get("discount") or 0)
		header_amt = flt(data.get("discount_amount") or 0)
		if header_pct <= 0 and header_amt <= 0 and insurance_pct > 0:
			header_pct = insurance_pct
			data["discount"] = insurance_pct
			data["discount_margin"] = "Percentage"
		if header_pct > 0:
			unit_net = _apply_pct(list_unit, header_pct)
			data["discount"] = header_pct
			data["discount_margin"] = data.get("discount_margin") or "Percentage"
		elif header_amt > 0:
			unit_net = max(0.0, list_unit - (header_amt / qty))
			data["discount_margin"] = data.get("discount_margin") or "Amount"
		else:
			unit_net = flt(parts["net_rate"])
		data["cost"] = list_unit * qty
		data["grand_total"] = unit_net * qty
		data["discount_amount"] = max(0.0, flt(data["cost"]) - flt(data["grand_total"]))

	if not data.get('template_dn'):
		frappe.throw(_("Template is required"))
	_ensure_lab_service_request_create_permission(data.get("template_dt"))

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

	service_request = frappe.get_doc({
		'doctype': 'Service Request',
		'patient': data.get('patient'),
		'patient_visit': data.get('patient_visit'),
		'inpatient_record': data.get('inpatient_record'),
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


@frappe.whitelist()
def get_service_request(name):
	"""Get a single Service Request document for editing."""
	if not name:
		frappe.throw(_("Service Request name is required"))
	if not frappe.db.exists("Service Request", name):
		frappe.throw(_("Service Request not found"))
	doc = frappe.get_doc("Service Request", name)
	return doc.as_dict()


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
		patient_care_type = (
			"OP" if doc.patient_visit else "IP" if doc.inpatient_record else None
		)
		specs = expand_lab_test_specs(request_items, doc.patient, patient_care_type=patient_care_type)
		specs = apply_discounts_to_specs(specs, request_items)
		totals = totals_from_specs(specs)
		doc.cost = totals["cost"]
		doc.grand_total = totals["grand_total"]
		doc.discount_amount = totals["discount_amount"]
		if request_items:
			doc.discount = 0
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

	# Load dynamic template document
	template_doc = frappe.get_doc(sr.template_dt, sr.template_dn)
	delivery_date = sr.expected_date or nowdate()

	# ---- IMPORTANT PART ----
	# Try multiple possible field names for item code
	item_code = (
		getattr(template_doc, "item", None) or 
		getattr(template_doc, "item_code", None) or
		getattr(template_doc, "service_item", None) or
		getattr(template_doc, "service_item_code", None)
	)
	
	if not item_code:
		frappe.throw(_("{0} {1} must have an Item or Item Code configured for billing").format(sr.template_dt, sr.template_dn))

	# Validate item exists and is properly configured
	if not frappe.db.exists("Item", item_code):
		frappe.throw(_("Item {0} does not exist in the system").format(item_code))
	
	# Check item configuration and create/fix item group if needed
	item_doc = frappe.get_doc("Item", item_code)
	
	if not item_doc.item_group:
		# Check if "Lab Test" item group exists, create if not
		item_group_name = "Lab Test"
		if not frappe.db.exists("Item Group", item_group_name):
			item_group = frappe.new_doc("Item Group")
			item_group.item_group_name = item_group_name
			item_group.parent_item_group = "All Item Groups"  # or whatever your root is
			item_group.insert(ignore_permissions=True)
			frappe.db.commit()
			frappe.log_error(title="Item Group Created", message=f"Created Item Group: {item_group_name}")
		
		# Update the item with the item group
		item_doc.item_group = item_group_name
		item_doc.save(ignore_permissions=True)
		frappe.db.commit()
		frappe.log_error(title="Item Updated", message=f"Updated Item {item_code} with Item Group: {item_group_name}")

	amount = (
		getattr(template_doc, "lab_test_rate", None) or
		getattr(template_doc, "rate", None) or 
		getattr(template_doc, "amount", None) or
		0
	)

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

	list_rate = frappe.utils.flt(sr.cost) or frappe.utils.flt(amount) or 0
	net_rate = frappe.utils.flt(sr.grand_total) or list_rate
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

	# Update Service Request
	sr.db_set("patient_accepted_cost", 1)
	sr.db_set("reference_document_type", "Sales Order")
	sr.db_set("reference_document_name", so.name)

	patient_visit_name = getattr(sr, "patient_visit", None)
	
	if patient_visit_name:
		try:
			visit = frappe.get_doc("Patient Visit", patient_visit_name)

			# Avoid duplicate entries for the same service request
			already_added = any(
				row.get("test_code") == sr.name
				for row in visit.get("lab_tests_charges", [])
			)
			if not already_added:
				lab_test_name = getattr(sr, "lab_test", None) or getattr(template_doc, "name", None)
				visit.append("lab_tests_charges", {
					"test_code": lab_test_name,                         
					"test_name": sr.template_dn or "", 
					"amount": list_rate or 0,
					"discount_type": "Percentage" if frappe.utils.flt(sr.discount) else "Amount",
					"discount_rate": frappe.utils.flt(sr.discount) or 0,
					"discount": frappe.utils.flt(sr.discount_amount) or 0,
					"net_amount": net_rate or 0
				})
				visit.save(ignore_permissions=True)
				frappe.db.commit()

		except Exception as e:
			frappe.log_error(
				title="Failed to update Patient Visit lab charges",
				message=frappe.get_traceback()
			)
			# We don't throw here — SO was already created, don't block the flow

	frappe.db.commit()

	return {
		"ok": True,
		"patient_accepted_cost": 1,
		"sales_order": so.name
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