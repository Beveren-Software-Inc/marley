# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import nowdate

LAB_SERVICE_REQUEST_ALLOWED_ROLES = {
	"Doctor",
	"System Manager",
	"Healthcare Administrator",
	"Administrator",
}

def _get_template_base_rate(template_dt: str, template_dn: str) -> float:
    """Resolve base rate from template document safely."""

    meta = frappe.get_meta(template_dt)

    possible_fields = ["lab_test_rate", "rate", "amount"]
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


def _build_pricing_rows_for_template(template_dt: str, template_dn: str):
	base_rate = _get_template_base_rate(template_dt, template_dn)
	rows = []
	print("Hapa pia nafika")
	for row in _get_patient_category_multipliers():
		rows.append(
			{
				"patient_category": row["patient_category"],
				"multiplier": row["multiplier"],
				"price": (base_rate * row["multiplier"]) if base_rate else 0.0,
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
def get_service_request_template_pricing(template_dt, template_dn):
	"""
	Return computed pricing rows for any service request template type.
	Price is derived as: template_base_rate * Healthcare Settings category multiplier.
	For group lab templates, child-template pricing is returned per child.
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
					'pricing': _build_pricing_rows_for_template('Lab Test Template', child.name),
				})
			return {'is_group': True, 'pricing': [], 'group_templates': group_templates}
		else:
			# Regular lab test template (not a group)
			pricing = _build_pricing_rows_for_template(template_dt, template_dn)
			return {'is_group': False, 'pricing': pricing, 'group_templates': []}

	# Regular / all other template types
	pricing = _build_pricing_rows_for_template(template_dt, template_dn)
	return {'is_group': False, 'pricing': pricing, 'group_templates': []}


@frappe.whitelist()
def get_service_requests(limit=50, offset=0, patient=None, template_dt=None, status=None, search=None):
	"""Get list of Service Requests"""
	from healthcare.api.common import get_permitted_cost_centers
	filters = {'docstatus': ['!=', 2]}

	if patient:
		filters['patient'] = patient
	# print("Template dt", str(template_dt))
	# if template_dt:
	# 	filters['template_dt'] = template_dt
	if status:
		filters['status'] = status
	if search:
		filters['name'] = ['like', f'%{search}%']

	# ── Cost-centre User Permission enforcement ──────────────────────────────
	# Records with no cost_center are visible regardless (use or_filters).
	permitted_cc = get_permitted_cost_centers()
	or_filters = None
	if permitted_cc is not None:
		if not permitted_cc:
			return []
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
		'IP Service Type': 'service_name',
		'Consultation Service Template': 'template_name',
		'Appointment Type': 'name',
	}

	fetch_kwargs = dict(
		filters=filters,
		fields=[
			'name', 'patient', 'patient_name', 'practitioner',
			'template_dt', 'template_dn', 'status', 'order_date', 'order_time',
			'occurrence_date', 'occurrence_time', 'medical_department',
			'billing_status', 'priority', 'intent', 'patient_accepted_cost',
			'booked', 'order_group', 'cost', 'cost_center',
		],
		limit=limit,
		limit_start=offset,
		order_by='order_date desc, order_time desc',
	)
	if or_filters:
		fetch_kwargs['or_filters'] = or_filters

	service_requests = frappe.get_all('Service Request', **fetch_kwargs)
	for sr in service_requests:
		if sr.practitioner:
			sr['practitioner_name'] = (
				frappe.db.get_value('Healthcare Practitioner', sr.practitioner, 'practitioner_name')
				or sr.practitioner
			)

		if sr.template_dn and sr.template_dt:
			name_field = _template_name_field.get(sr.template_dt)
			if name_field and name_field != 'name':
				resolved = frappe.db.get_value(sr.template_dt, sr.template_dn, name_field)
				sr['template_name'] = resolved or sr.template_dn
			else:
				sr['template_name'] = sr.template_dn
	
	return service_requests

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
	"""Create Lab Test(s) from a Service Request. For group templates, creates one per child."""
	if not service_request:
		frappe.throw(_("Service Request name is required"))

	try:
		from healthcare.healthcare.doctype.service_request.service_request import make_lab_test
	except ImportError:
		frappe.throw(_("Could not import make_lab_test function"))

	service_request_doc = frappe.get_doc('Service Request', service_request)

	# Handle group Lab Test Template
	if service_request_doc.template_dt == 'Lab Test Template':
		is_group = frappe.db.get_value('Lab Test Template', service_request_doc.template_dn, 'is_group')
		if is_group:
			existing = frappe.get_all(
				'Lab Test',
				filters={'service_request': service_request, 'docstatus': ['!=', 2]},
				fields=['name']
			)
			if existing:
				frappe.throw(
					_("Lab Tests already exist for this Service Request: {0}").format(
						', '.join([e.name for e in existing])
					)
				)

			group_rows = frappe.get_all(
				'Lab Test Group Template',
				filters={
					'parent': service_request_doc.template_dn,
					'parenttype': 'Lab Test Template',
					'template_or_new_line': 'Add Test'
				},
				fields=['lab_test_template'],
				order_by='idx asc',
				ignore_permissions=True
			)

			created_tests = []
			for row in group_rows:
				if not row.lab_test_template:
					continue
				sr_dict = frappe._dict(service_request_doc.as_dict())
				sr_dict.template_dn = row.lab_test_template
				lab_test = make_lab_test(sr_dict)
				lab_test.service_request = service_request
				lab_test.insert()
				created_tests.append({
					'name': lab_test.name,
					'patient': lab_test.patient,
					'patient_name': lab_test.patient_name,
					'template': lab_test.template,
					'lab_test_name': lab_test.lab_test_name,
					'status': lab_test.status,
				})

			frappe.db.commit()
			return {'is_group': True, 'lab_tests': created_tests, 'count': len(created_tests)}

	# Non-group: existing single lab test behaviour
	existing_lab_test = frappe.db.get_value('Lab Test', {'service_request': service_request}, 'name')
	if existing_lab_test:
		frappe.throw(_("Lab Test {0} already exists for this Service Request").format(existing_lab_test))

	service_request_dict = service_request_doc.as_dict()
	print("Inafika hapa")
	lab_test = make_lab_test(service_request_dict)
	lab_test.insert()
	frappe.db.commit()

	return {
		'is_group': False,
		'name': lab_test.name,
		'patient': lab_test.patient,
		'patient_name': lab_test.patient_name,
		'template': lab_test.template,
		'lab_test_name': lab_test.lab_test_name,
		'status': lab_test.status
	}


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
	
	if not data.get('template_dn'):
		frappe.throw(_("Template is required"))
	_ensure_lab_service_request_create_permission(data.get("template_dt"))

	# Require either Patient Visit (OP) or Inpatient Admission for clinical context
	if not data.get('patient_visit') and not data.get('inpatient_record'):
		frappe.throw(_("Please select either a Patient Visit or an Inpatient Admission for the service request"))
	
	# Get naming series
	naming_series = frappe.db.get_value('Service Request', {'naming_series': 'HSR-'}, 'naming_series')
	if not naming_series:
		naming_series = 'HSR-'
	
	# Create the service request
	selected_group_templates = data.get("selected_group_templates") or []
	if isinstance(selected_group_templates, str):
		import json
		try:
			selected_group_templates = json.loads(selected_group_templates)
		except Exception:
			selected_group_templates = [selected_group_templates]
	if not isinstance(selected_group_templates, list):
		selected_group_templates = []
	selected_group_templates = [t for t in selected_group_templates if t]

	service_request = frappe.get_doc({
		'doctype': 'Service Request',
		'patient': data.get('patient'),
		'patient_visit': data.get('patient_visit'),
		'inpatient_record': data.get('inpatient_record'),
		'template_dt': data.get('template_dt'),
		'template_dn': data.get('template_dn'),
		'practitioner': data.get('practitioner'),
		'order_date': data.get('order_date') or frappe.utils.today(),
		'order_time': data.get('order_time') or frappe.utils.now_time(),
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
		# Discount fields
		'discount': frappe.utils.flt(data.get('discount') or 0),
		'discount_value': data.get('discount_value') or '',
		'discount_amount': frappe.utils.flt(data.get('discount_amount') or 0),
		'grand_total': frappe.utils.flt(data.get('grand_total') or data.get('cost') or 0),
		'selected_group_templates': frappe.as_json(selected_group_templates),
	})
	
	service_request.insert()
	
	# Get template name for response based on template_dt
	template_name = None
	if service_request.template_dn:
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
		elif service_request.template_dt == 'IP Service Type':
			template_name = frappe.db.get_value('IP Service Type', service_request.template_dn, 'service_name')
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
		"order_date", "order_time", "medical_department", "department",
		"status", "priority", "intent", "quantity", "occurrence_date", "occurrence_time",
		"order_group", "order_description", "patient_instructions", "expected_date",
		"amount", "cost", "referred_to_practitioner",
		"staff_role", "patient_care_type", "healthcare_service_unit_type", "as_needed",
		"dosage_form", "dosage", "period", "cost_center",
		# Discount fields
		"discount", "discount_value", "discount_amount", "grand_total",
	}
	for key, value in data.items():
		if key == "department":
			doc.medical_department = value
		elif key in allowed and hasattr(doc, key):
			doc.set(key, value)
	doc.save()
	return {"name": doc.name, "status": doc.status}


import frappe
from frappe import _
from frappe.utils import nowdate

@frappe.whitelist()
# def confirm_payment(service_request_name):

# 	if not service_request_name:
# 		frappe.throw(_("Service Request name is required"))

# 	sr = frappe.get_doc("Service Request", service_request_name)

# 	# Prevent duplicate execution
# 	if sr.patient_accepted_cost:
# 		return {"ok": True, "patient_accepted_cost": 1}

# 	# Validate dynamic template
# 	if not sr.template_dt or not sr.template_dn:
# 		frappe.throw(_("Template is required"))

# 	# Load dynamic template document
# 	template_doc = frappe.get_doc(sr.template_dt, sr.template_dn)
# 	delivery_date = sr.expected_date or nowdate()

# 	# ---- IMPORTANT PART ----
# 	# Template may have `item` or `item_code` (e.g. IP Service Type)
# 	item_code = getattr(template_doc, "item", None) or getattr(template_doc, "item_code", None)
# 	if not item_code:
# 		frappe.throw(_("{0} must have an Item or Item Code for billing").format(sr.template_dt))

# 	amount = (
# 		getattr(template_doc, "lab_test_rate", None)
# 		or getattr(template_doc, "rate", None)
# 		or 0
# 		)

# 	# ------------------------
# 	# Create Sales Order
# 	# ------------------------
# 	so = frappe.new_doc("Sales Order")
# 	so.patient = sr.patient
# 	so.customer = sr.patient   # adjust if mapped via Customer
# 	so.transaction_date = nowdate()
# 	so.delivery_date = delivery_date
# 	so.ignore_pricing_rule = 1
# 	# Use grand_total (post-discount) if set and non-zero; fall back to cost
# 	billing_rate = frappe.utils.flt(sr.grand_total) or frappe.utils.flt(sr.cost) or 0
# 	so.append("items", {
# 		"item_code": item_code,
# 		"qty": 1,
# 		"rate": billing_rate,
# 		"price_list_rate": billing_rate,
# 		"description": f"Service Request {sr.name}"
# 	})
# 	so.custom_reference_type = "Service Request"
# 	so.custom_reference_name = sr.name

# 	so.insert(ignore_permissions=True)
# 	so.submit()

# 	# Update Service Request
# 	sr.db_set("patient_accepted_cost", 1)
# 	sr.db_set("reference_document_type", "Sales Order")
# 	sr.db_set("reference_document_name", so.name)

	
# 	patient_visit_name = getattr(sr, "patient_visit", None)
	
# 	if patient_visit_name:
# 		try:
# 			visit = frappe.get_doc("Patient Visit", patient_visit_name)

# 			# Avoid duplicate entries for the same service request
# 			already_added = any(
# 				row.get("test_code") == sr.name
# 				for row in visit.get("lab_tests_charges", [])
# 			)
# 			print("amount ni: ", sr.amount)
# 			if not already_added:
# 				visit.append("lab_tests_charges", {
# 					"test_code": lab_test.name,                         
# 					# "test_name": sr.template_dn or "", 
# 					# # Fetched from template
# 					"amount": amount or 0,
# 					"discount_type": "Percentage",
# 					"discount_rate": 0,
# 					"net_amount": amount or 0
# 				})
# 				visit.save(ignore_permissions=True)
# 				frappe.db.commit()

# 		except Exception as e:
# 			frappe.log_error(
# 				title="Failed to update Patient Visit lab charges",
# 				message=frappe.get_traceback()
# 			)
# 			# We don't throw here — SO was already created, don't block the flow

# 	frappe.db.commit()

# 	return {
# 		"ok": True,
# 		"patient_accepted_cost": 1,
# 		"sales_order": so.name
# 	}
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
	
	# Get customer from patient if not set
	customer = sr.patient
	if frappe.db.exists("Patient", sr.patient):
		customer = frappe.db.get_value("Patient", sr.patient, "customer") or sr.patient
	
	so.customer = customer
	so.transaction_date = nowdate()
	so.delivery_date = delivery_date
	so.ignore_pricing_rule = 1
	
	# Use grand_total (post-discount) if set and non-zero; fall back to cost
	billing_rate = frappe.utils.flt(sr.grand_total) or frappe.utils.flt(sr.cost) or amount or 0
	
	so.append("items", {
		"item_code": item_code,
		"qty": 1,
		"rate": billing_rate,
		"price_list_rate": billing_rate,
		"description": f"Service Request {sr.name}"
	})
	so.custom_reference_type = "Service Request"
	so.custom_reference_name = sr.name

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
			print("amount ni: ", sr.amount)
			if not already_added:
				# You need to define lab_test here - maybe from sr or template_doc
				lab_test_name = getattr(sr, "lab_test", None) or getattr(template_doc, "name", None)
				visit.append("lab_tests_charges", {
					"test_code": lab_test_name,                         
					"test_name": sr.template_dn or "", 
					"amount": amount or 0,
					"discount_type": "Percentage",
					"discount_rate": 0,
					"net_amount": amount or 0
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

	billing_rate = (
		frappe.utils.flt(sr.grand_total)
		or frappe.utils.flt(sr.cost)
		or 0
	)
	delivery_date = sr.get("expected_date") or nowdate()

	so = frappe.new_doc("Sales Order")
	so.patient = sr.patient
	so.customer = sr.patient
	so.transaction_date = nowdate()
	so.delivery_date = delivery_date
	so.ignore_pricing_rule = 1
	so.append("items", {
		"item_code": item_code,
		"qty": 1,
		"rate": billing_rate,
		"price_list_rate": billing_rate,
		"description": f"Service Request {sr.name}",
	})
	so.custom_reference_type = "Service Request"
	so.custom_reference_name = sr.name
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
	elif sr.template_dt == "IP Service Type":
		if not sr.get("inpatient_record"):
			frappe.throw(_("An Inpatient Admission is required to book an IP Service request"))
		if not sr.get("cost_center"):
			frappe.throw(_("Cost Center is required on the Service Request before booking"))

		template_category = None
		if sr.get("template_dn") and frappe.db.exists("IP Service Type", sr.template_dn):
			template_category = frappe.db.get_value("IP Service Type", sr.template_dn, "category")

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