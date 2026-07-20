# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import re

import frappe
from frappe import _
from healthcare.api.utils.api_utility import get_next_transaction_number

@frappe.whitelist()
def get_current_user_roles():
	"""Return list of role names for the current user (for UI permissions)."""
	if frappe.session.user == "Guest":
		return []
	return list(frappe.get_roles(frappe.session.user))


@frappe.whitelist()
def get_current_nursing_shift():
	"""Return Morning, Evening, or Night for the server clock (portal nursing notes)."""
	from healthcare.utils.nursing_shift import get_nursing_shift_for_datetime

	return get_nursing_shift_for_datetime()


@frappe.whitelist()
def get_healthcare_portal_settings():
	"""Portal flags from Healthcare Settings (single)."""
	from healthcare.healthcare.editing_lock import is_editing_locked

	return {
		"lock_editing_data": is_editing_locked(),
	}


@frappe.whitelist()
def get_current_user_healthcare_practitioner():
	"""
	Get the Healthcare Practitioner linked to the current logged-in user.
	
	Returns the practitioner name if found, None otherwise.
	Used by frontend forms to auto-populate practitioner/doctor/nurse fields.
	"""
	user = frappe.session.user
	
	if user == "Guest":
		return None
	
	# Find Healthcare Practitioner linked to this user via user_id field
	practitioner = frappe.db.get_value(
		"Healthcare Practitioner",
		{"user_id": user, "status": "Active"},
		"name"
	)

	return practitioner if practitioner else None


@frappe.whitelist()
def get_current_user_practitioner_option():
	"""Current user's linked Healthcare Practitioner as a {name, label} option.

	Unlike get_doctor_practitioners this is NOT restricted to doctors — it covers
	any specialty (psychologist / nutritionist / therapist / etc.) so their
	dashboards can default the "Doctor" filter to themselves. `name` is the
	practitioner docname (sent to the visit filter), `label` is the display name.
	"""
	user = frappe.session.user

	if user == "Guest":
		return None

	practitioner = frappe.db.get_value(
		"Healthcare Practitioner",
		{"user_id": user, "status": "Active"},
		["name", "practitioner_name"],
		as_dict=True,
	)

	if not practitioner:
		return None

	return {
		"name": practitioner.name,
		"label": practitioner.practitioner_name or practitioner.name,
	}


@frappe.whitelist()
def get_print_formats(doctype):
	"""Return list of print format names for the given doctype (for print dropdown)."""
	if not doctype:
		return ["Standard"]
	formats = frappe.get_all(
		"Print Format",
		filters={"doc_type": doctype, "disabled": 0},
		pluck="name",
		order_by="name",
	)
	result = ["Standard"]
	seen = {"Standard"}
	for name in formats:
		if name and name not in seen:
			result.append(name)
			seen.add(name)
	return result


@frappe.whitelist()
def get_medical_departments(search=None):
	"""Get list of Medical Departments"""
	filters = {}
	if search:
		filters['department'] = ['like', f'%{search}%']
  
	
	departments = frappe.get_all(
		'Medical Department',
		filters=filters,
		fields=['name', 'department'],
		limit=50,
		order_by='department'
	)
	
	return [{'name': d.name, 'label': d.department or d.name} for d in departments]

@frappe.whitelist()
def get_company_departments(search=None):
	"""Get list of Medical Departments"""
	filters = {}
	if search:
		filters['department'] = ['like', f'%{search}%']
  
	
	departments = frappe.get_all(
		'Department',
		filters=filters,
		fields=['name', 'department'],
		limit=50,
		order_by='department'
	)
	
	return [{'name': d.name, 'label': d.department or d.name} for d in departments]


@frappe.whitelist()
def get_anaesthesia_types(search=None):
	"""Get list of Anaesthesia Type for link dropdowns (e.g. ECT Procedure)."""
	filters = {}
	if search and search.strip():
		filters["anaesthesia_type_name"] = ["like", f"%{search.strip()}%"]
	types = frappe.get_all(
		"Anaesthesia Type",
		filters=filters,
		fields=["name", "anaesthesia_type_name"],
		limit=50,
		order_by="anaesthesia_type_name",
	)
	return [{"name": t.name, "label": t.anaesthesia_type_name or t.name} for t in types]


@frappe.whitelist()
def get_nationalities(search=None):
	filters = {}

	if search:
		filters = {
			"nationality": ["like", f"%{search}%"]
		}

	nationalities = frappe.get_all(
		"Nationality",
		filters=filters,
		fields=["name", "nationality", "country"],
		limit_page_length=50,
		order_by="nationality asc"
	)
	return nationalities

@frappe.whitelist()
def get_healthcare_practitioners(search=None, department=None, appointment_only=None):
	"""Get list of active Healthcare Practitioners. Search by ID, doctors_id, or name.

	When appointment_only is truthy, only practitioners with the Appointment checkbox set.
	"""
	filters = {'status': 'Active'}
	if department:
		filters['department'] = department
	if frappe.utils.cint(appointment_only):
		filters['appointment'] = 1

	or_filters = None
	if search:
		like = f'%{search}%'
		or_filters = {
			'practitioner_name': ['like', like],
			'name': ['like', like],
			'doctors_id': ['like', like],
		}

	practitioners = frappe.get_all(
		'Healthcare Practitioner',
		filters=filters,
		or_filters=or_filters,
		fields=['name', 'practitioner_name', 'doctors_id', 'department', 'medical_role'],
		limit=100,
		order_by='practitioner_name',
	)
	result = []
	for p in practitioners:
		pid = (p.doctors_id or p.name or '').strip()
		pname = (p.practitioner_name or '').strip()
		label = pname or pid or p.name
		result.append({
			'name': p.name,
			'label': label,
			'practitioner_name': pname or None,
			'practitioner_id': pid or p.name,
			'department': p.department,
			'medical_role': p.medical_role,
		})
	return result


DOCTOR_PARENT_MEDICAL_ROLE = "Doctor"


def fill_missing_patient_names(rows, patient_field="patient", name_field="patient_name"):
	"""List display: when a row has a patient id but no stored patient_name, resolve
	the name from the Patient master (one batched query)."""
	missing = list({
		r.get(patient_field)
		for r in rows or []
		if r.get(patient_field) and not (r.get(name_field) or "").strip()
	})
	if not missing:
		return rows
	name_map = {
		p.name: p.patient_name
		for p in frappe.get_all("Patient", filters={"name": ["in", missing]}, fields=["name", "patient_name"])
	}
	for r in rows:
		if r.get(patient_field) and not (r.get(name_field) or "").strip():
			r[name_field] = name_map.get(r.get(patient_field)) or r.get(name_field)
	return rows


def get_medical_roles_under(group):
	"""Medical Role names in a group: the group itself and every role under it.

	Walks the Medical Role tree via parent_medical_role (groups may be
	self-parented, so a visited-set guards the loop).
	"""
	all_roles = frappe.get_all('Medical Role', fields=['name', 'parent_medical_role'])
	children = {}
	for r in all_roles:
		children.setdefault(r.parent_medical_role, []).append(r.name)

	result = set()
	stack = [group]
	while stack:
		node = stack.pop()
		if node in result:
			continue
		result.add(node)
		stack.extend(children.get(node, []))
	return result


def _get_doctor_medical_roles():
	"""Medical Role names that count as 'Doctor' (the Doctor group + descendants)."""
	return get_medical_roles_under(DOCTOR_PARENT_MEDICAL_ROLE)


@frappe.whitelist()
def get_doctor_practitioners(search=None):
	"""Active Healthcare Practitioners who are doctors (Medical Role under the 'Doctor' group).

	Powers the 'Doctor' filter/dropdowns and doctor auto-fill on create forms.
	"""
	doctor_roles = list(_get_doctor_medical_roles())
	if not doctor_roles:
		return []

	filters = {'status': 'Active', 'medical_role': ['in', doctor_roles]}
	or_filters = None
	if search:
		or_filters = {
			'practitioner_name': ['like', f'%{search}%'],
			'name': ['like', f'%{search}%'],
		}

	practitioners = frappe.get_all(
		'Healthcare Practitioner',
		filters=filters,
		or_filters=or_filters,
		fields=['name', 'practitioner_name', 'department', 'medical_role'],
		limit=100,
		order_by='practitioner_name',
	)
	return [
		{
			'name': p.name,
			'label': p.practitioner_name or p.name,
			'department': p.department,
			'medical_role': p.medical_role,
		}
		for p in practitioners
	]


@frappe.whitelist()
def get_current_user_doctor():
	"""Return the logged-in user's Healthcare Practitioner name IF they are a doctor.

	A doctor = the linked practitioner's Medical Role is under the 'Doctor' group.
	Returns the practitioner name (str) for auto-fill, or None. Mirrors the branch
	auto-apply: a doctor's own name is pre-filled on create forms.
	"""
	user = frappe.session.user
	if not user or user == 'Guest':
		return None

	practitioner = frappe.db.get_value(
		'Healthcare Practitioner',
		{'user_id': user, 'status': 'Active'},
		['name', 'medical_role'],
		as_dict=True,
	)
	if not practitioner or not practitioner.medical_role:
		return None

	if practitioner.medical_role in _get_doctor_medical_roles():
		return practitioner.name
	return None


DISCHARGE_NURSE_MEDICAL_ROLE = "Nurse"


def _practitioner_row_is_nurse(medical_role, parent_medical_role) -> bool:
	"""True when Medical Role is Nurse or parent Medical Role is Nurse."""
	role = (medical_role or "").strip()
	parent = (parent_medical_role or "").strip()
	return role == DISCHARGE_NURSE_MEDICAL_ROLE or parent == DISCHARGE_NURSE_MEDICAL_ROLE


def _get_practitioners_for_discharge_role(search=None, *, nurses: bool):
	"""Active practitioners filtered for discharge nurse vs doctor dropdowns."""
	filters = {"status": "Active"}
	or_filters = None
	if search:
		or_filters = {
			"practitioner_name": ["like", f"%{search}%"],
			"name": ["like", f"%{search}%"],
		}

	practitioners = frappe.get_all(
		"Healthcare Practitioner",
		filters=filters,
		or_filters=or_filters,
		fields=["name", "practitioner_name", "department", "medical_role", "parent_medical_role"],
		limit=100,
		order_by="practitioner_name",
	)

	rows = []
	for p in practitioners:
		is_nurse = _practitioner_row_is_nurse(p.medical_role, p.parent_medical_role)
		if nurses and not is_nurse:
			continue
		if not nurses and is_nurse:
			continue
		rows.append(
			{
				"name": p.name,
				"label": p.practitioner_name or p.name,
				"department": p.department,
				"medical_role": p.medical_role,
				"parent_medical_role": p.parent_medical_role,
			}
		)
	return rows


@frappe.whitelist()
def get_discharge_nurse_practitioners(search=None):
	"""Healthcare Practitioners with Medical Role Nurse or parent Medical Role Nurse."""
	return _get_practitioners_for_discharge_role(search, nurses=True)


@frappe.whitelist()
def get_discharge_doctor_practitioners(search=None):
	"""Healthcare Practitioners who are not nurses (for Discharge Doctor)."""
	return _get_practitioners_for_discharge_role(search, nurses=False)


LAB_TECHNICIAN_MEDICAL_ROLES = ("Lab Technologist", "Lab Technician")


@frappe.whitelist()
def get_lab_technician_practitioners(search=None):
	"""Healthcare Practitioners whose Medical Role is Lab Technologist or Lab Technician (active only)."""
	filters = {
		"status": "Active",
		"medical_role": ["in", list(LAB_TECHNICIAN_MEDICAL_ROLES)],
	}
	if search:
		filters["practitioner_name"] = ["like", f"%{search}%"]

	practitioners = frappe.get_all(
		"Healthcare Practitioner",
		filters=filters,
		fields=["name", "practitioner_name", "department", "medical_role"],
		limit=100,
		order_by="practitioner_name",
	)
	return [
		{
			"name": p.name,
			"label": p.practitioner_name or p.name,
			"department": p.department,
			"medical_role": p.medical_role,
		}
		for p in practitioners
	]


@frappe.whitelist()
def get_service_unit_types(search=None):
	"""Get list of Healthcare Service Unit Types with inpatient occupancy (room types)."""
	from frappe.utils import flt

	filters = {"inpatient_occupancy": 1, "allow_appointments": 0, "disabled": 0}

	fields = ["name", "service_unit_type"]
	if frappe.db.has_column("Healthcare Service Unit Type", "room_multiplier"):
		fields.append("room_multiplier")

	service_unit_types = frappe.get_all(
		"Healthcare Service Unit Type",
		filters=filters,
		fields=fields,
		limit=50,
		order_by="service_unit_type",
	)

	if search:
		q = search.lower()
		service_unit_types = [
			s for s in service_unit_types if q in (s.service_unit_type or "").lower()
		]

	out = []
	for s in service_unit_types:
		out.append(
			{
				"name": s.name,
				"label": s.service_unit_type or s.name,
				"room_multiplier": flt(getattr(s, "room_multiplier", None) or 1),
			}
		)
	return out


@frappe.whitelist()
def get_nursing_checklist_templates(search=None):
	"""Get list of Nursing Checklist Templates"""
	filters = {}
	if search:
		filters['template_name'] = ['like', f'%{search}%']
	
	templates = frappe.get_all(
		'Nursing Checklist Template',
		filters=filters,
		fields=['name', 'title'],
		limit=50,
		order_by='title'
	)
	return [{'name': t.name, 'label': t.title or t.name} for t in templates]


@frappe.whitelist()
def get_patient_visit_types(search=None):
	"""Patient Visit Type options for dropdowns — portal roles (e.g. Nurse) lack doctype read perms
	(REST grants Patient Visit Type only to Doctor / Reception / System Manager)."""
	filters = {}

	if search:
		filters['visit_type'] = ['like', f'%{search}%']

	rows = frappe.get_all(
		'Patient Visit Type',
		filters=filters,
		fields=['name', 'visit_type'],
		limit_page_length=200,
		order_by='visit_type asc',
	)
	return [{'name': r.name, 'visit_type': r.visit_type or r.name} for r in rows]


@frappe.whitelist()
def get_patient_categories(search=None):
	"""Patient Category options for dropdowns — portal roles (Doctor, Nurse) lack doctype read perms."""
	filters = {}

	if search:
		filters['patient_category'] = ['like', f'%{search}%']

	rows = frappe.get_all(
		'Patient Category',
		filters=filters,
		fields=['name', 'patient_category'],
		limit_page_length=200,
		order_by='patient_category asc',
	)
	return [{'name': r.name, 'label': (r.patient_category or r.name or '').strip() or r.name} for r in rows]


@frappe.whitelist()
def get_lead_sources(search=None):
	"""Get Lead Source options for dropdown"""
	filters = {}
	
	if search:
		filters['source_name'] = ['like', f'%{search}%']
	
	sources = frappe.get_all(
		'Patient Source',
		filters=filters,
		fields=['name', 'source'],
		limit=50,
		order_by='source'
	)
	return [{'name': s.name, 'label': s.source or s.name} for s in sources]


@frappe.whitelist()
def get_users(search=None, role=None):
	"""Get list of enabled Users. Optionally filter by Role (Has Role)."""
	role = (role or "").strip() or None
	search = (search or "").strip() or None

	role_users = None
	if role:
		role_users = frappe.get_all(
			"Has Role",
			filters={"role": role, "parenttype": "User"},
			pluck="parent",
		)
		role_users = [u for u in role_users if u and u not in ("Guest", "Administrator")]
		if not role_users:
			return []

	params = {}
	conditions = ["u.enabled = 1", "u.name NOT IN ('Guest', 'Administrator')"]

	if role_users is not None:
		placeholders = ", ".join(f"%(ru_{i})s" for i in range(len(role_users)))
		for i, user in enumerate(role_users):
			params[f"ru_{i}"] = user
		conditions.append(f"u.name IN ({placeholders})")

	if search:
		conditions.append(
			"(u.full_name LIKE %(search)s OR u.email LIKE %(search)s OR u.name LIKE %(search)s)"
		)
		params["search"] = f"%{search}%"

	where_sql = " AND ".join(conditions)
	users = frappe.db.sql(
		f"""
		SELECT u.name, u.full_name, u.email
		FROM `tabUser` u
		WHERE {where_sql}
		ORDER BY u.full_name
		LIMIT 50
		""",
		params,
		as_dict=True,
	)

	return [{"name": u.name, "label": u.full_name or u.email or u.name} for u in users]


@frappe.whitelist()
def get_discharge_templates(search=None):
	"""Get list of Discharge Templates"""
	filters = {}
	if search:
		filters['template_name'] = ['like', f'%{search}%']
	
	templates = frappe.get_all(
		'Discharge Template',
		filters=filters,
		fields=['name', 'template_name', 'default'],
		limit=50,
		order_by='default desc, template_name'
	)
	return [
		{'name': t.name, 'label': t.template_name or t.name, 'default': t.default or 0}
		for t in templates
	]


@frappe.whitelist()
def get_lab_test_templates(search=None, department=None, by_nurse=None):
	"""Get list of Lab Test Templates (with outpatient_rate) for link fields / create lab test.

	Optional by_nurse: when truthy, only templates with Lab Test Template.by_nurse set.
	"""
	# Include rows where disabled is 0 or unset (imported templates often have NULL).
	filters = {"disabled": ["!=", 1]}
	or_filters = None
	if search and str(search).strip():
		like = f"%{search.strip()}%"
		or_filters = [
			["lab_test_name", "like", like],
			["name", "like", like],
			["lab_test_code", "like", like],
			["no", "like", like],
		]
	if department:
		filters["department"] = department
	if by_nurse is not None:
		if isinstance(by_nurse, str):
			by_nurse = by_nurse.lower() in ("1", "true", "yes")
		if by_nurse:
			filters["by_nurse"] = 1

	query_kwargs = {
		"doctype": "Lab Test Template",
		"filters": filters,
		"fields": [
			"name",
			"lab_test_name",
			"department",
			"outpatient_rate",
			"inpatient_rate",
			"female_min_range",
			"female_max_range",
			"male_min_range",
			"male_max_range",
			"min_range",
			"max_range",
			"lab_test_uom",
		],
		"limit": 100,
		"order_by": "lab_test_name asc",
	}
	if or_filters:
		query_kwargs["or_filters"] = or_filters

	templates = frappe.get_all(**query_kwargs)
	return [
		{
			'name': t.name,
			'label': t.lab_test_name or t.name,
			'department': t.department,
			'outpatient_rate': t.outpatient_rate,
			'inpatient_rate': getattr(t, 'inpatient_rate', None),
			'female_min_range': t.female_min_range,
			'female_max_range': t.female_max_range,
			'male_min_range': t.male_min_range,
			'male_max_range': t.male_max_range,
			'min_range': t.min_range,
			'max_range': t.max_range,
			'uom': t.lab_test_uom
		}
		for t in templates
	]


@frappe.whitelist()
def get_clinical_note_types(search=None):
	"""Get list of Clinical Note Types"""
	filters = {}
	if search:
		filters['clinical_note_type'] = ['like', f'%{search}%']
	
	note_types = frappe.get_all(
		'Clinical Note Type',
		filters=filters,
		fields=['name', 'clinical_note_type'],
		limit=50,
		order_by='clinical_note_type'
	)
	return [{'name': n.name, 'label': n.clinical_note_type or n.name} for n in note_types]


@frappe.whitelist()
def get_medical_roles(search=None):
	"""Get list of Medical Roles"""
	filters = {}
	if search:
		filters['medical_role'] = ['like', f'%{search}%']
	
	roles = frappe.get_all(
		'Medical Role',
		filters=filters,
		fields=['name', 'medical_role'],
		limit=50,
		order_by='medical_role'
	)
	return [{'name': r.name, 'label': r.medical_role or r.name} for r in roles]


@frappe.whitelist()
def get_practitioner_medical_role(practitioner):
	"""Get medical role from Healthcare Practitioner"""
	if not practitioner:
		return None
	
	medical_role = frappe.db.get_value('Healthcare Practitioner', practitioner, 'medical_role')
	return medical_role

@frappe.whitelist()
def get_appointment_types(search=None):
	"""Get list of Appointment Types"""
	filters = {}
	if search:
		filters['appointment_type'] = ['like', f'%{search}%']
	
	appointment_types = frappe.get_all(
		'Appointment Type',
		filters=filters,
		fields=['name', 'appointment_type', 'default_duration', 'default'],
		limit=50,
		order_by='default desc, appointment_type'
	)
	
	return [
		{
			'name': a.name,
			'label': a.appointment_type or a.name,
			'default_duration': a.default_duration,
			'default': a.default,
		}
		for a in appointment_types
	]


@frappe.whitelist()
def get_observation_templates(search=None, department=None):
	"""Get list of Observation Templates"""
	filters = {}
	if search:
		filters['observation'] = ['like', f'%{search}%']
	if department:
		filters['medical_department'] = department
	
	templates = frappe.get_all(
		'Observation Template',
		filters=filters,
		fields=['name', 'observation', 'observation_category', 'medical_department'],
		limit=50,
		order_by='observation'
	)
	return [{'name': t.name, 'label': t.observation or t.name, 'category': t.observation_category, 'department': t.medical_department} for t in templates]


@frappe.whitelist()
def get_items(search=None):
	"""Get list of Items for service selection"""
	filters = {}
	if search:
		filters['item_name'] = ['like', f'%{search}%']
		# Also search by item_code
		items = frappe.db.sql("""
			SELECT name, item_code, item_name, item_group, stock_uom
			FROM `tabItem`
			WHERE 
				disabled = 0
				AND (item_name LIKE %(search)s OR item_code LIKE %(search)s)
			ORDER BY item_name
			LIMIT 50
		""", {
			'search': f'%{search}%'
		}, as_dict=True)
	else:
		items = frappe.get_all(
			'Item',
			filters={**filters, 'disabled': 0},
			fields=['name', 'item_code', 'item_name', 'item_group', 'stock_uom'],
			limit=50,
			order_by='item_name'
		)
	
	return [{
		'name': i.name,
		'label': i.item_name or i.item_code or i.name,
		'item_code': i.item_code,
		'item_group': i.item_group,
		'stock_uom': i.stock_uom,
	} for i in items]


def _normalize_prescription_item_label(label):
	if not label:
		return ''
	s = str(label).strip().lower()
	return re.sub(r'\s+', ' ', s)


def _item_group_chain_has_prescription_flag(item_group_name, cache, ig_meta_has_field):
	"""True if Item Group.custom_added_in_prescription is set on this group or any ancestor."""
	if not ig_meta_has_field:
		return True
	if not item_group_name:
		return False
	if item_group_name in cache:
		return cache[item_group_name]
	row = frappe.db.get_value(
		'Item Group',
		item_group_name,
		['custom_added_in_prescription', 'parent_item_group'],
		as_dict=True,
	)
	if not row:
		cache[item_group_name] = False
		return False
	if row.get('custom_added_in_prescription'):
		cache[item_group_name] = True
		return True
	parent = (row.get('parent_item_group') or '').strip()
	result = _item_group_chain_has_prescription_flag(parent, cache, ig_meta_has_field) if parent else False
	cache[item_group_name] = result
	return result


def _item_route_of_administration_fieldname():
	"""First Item field that stores route of administration, if any."""
	item_meta = frappe.get_meta('Item')
	for fieldname in (
		'custom_route_of_administration',
		'route_of_administration',
		'custom_route',
	):
		if item_meta.has_field(fieldname):
			return fieldname
	return None


def get_item_route_of_administration_value(item_name):
	"""Return route of administration stored on Item, when configured."""
	item_name = (item_name or '').strip()
	if not item_name:
		return None
	fieldname = _item_route_of_administration_fieldname()
	if not fieldname:
		return None
	value = frappe.db.get_value('Item', item_name, fieldname)
	value = (value or '').strip()
	return value or None


@frappe.whitelist()
def get_item_route_of_administration(item):
	"""API: route of administration for a prescription drug Item."""
	return get_item_route_of_administration_value(item)


def _item_group_chain_has_custom_is_pink(item_group_name, cache):
	"""True if Item Group.custom_is_pink is set on this group or any ancestor."""
	if not frappe.get_meta('Item Group').has_field('custom_is_pink'):
		return False
	if not item_group_name:
		return False
	if item_group_name in cache:
		return cache[item_group_name]
	row = frappe.db.get_value(
		'Item Group',
		item_group_name,
		['custom_is_pink', 'parent_item_group'],
		as_dict=True,
	)
	if not row:
		cache[item_group_name] = False
		return False
	if row.get('custom_is_pink'):
		cache[item_group_name] = True
		return True
	parent = (row.get('parent_item_group') or '').strip()
	result = _item_group_chain_has_custom_is_pink(parent, cache) if parent else False
	cache[item_group_name] = result
	return result


def _prescription_warehouse_for_cost_center(cost_center):
	"""Branch pharmacy/prescription warehouse from Healthcare Settings (prescr_warehouse)."""
	cost_center = (cost_center or "").strip()
	if not cost_center:
		return None
	try:
		settings = frappe.get_single("Healthcare Settings")
		for row in settings.get("table_yjeh") or []:
			if getattr(row, "cost_center", None) == cost_center and getattr(row, "warehouse", None):
				return (row.warehouse or "").strip() or None
	except Exception:
		pass
	return None


def resolve_branch_pharmacy_warehouse(cost_center=None, warehouse=None):
	"""
	Warehouse used to decide in-stock medicines for pharmacy give-out.

	Priority: explicit warehouse → Prescription Warehouse for branch → nurse mini warehouse.
	"""
	warehouse = (warehouse or "").strip() or None
	if warehouse:
		return warehouse
	cost_center = (cost_center or "").strip() or None
	if not cost_center:
		return None
	wh = _prescription_warehouse_for_cost_center(cost_center)
	if wh:
		return wh
	return get_warehouse_for_cost_center(cost_center)


def get_item_codes_with_stock(warehouse):
	"""Item codes with positive Bin.actual_qty in the given warehouse."""
	warehouse = (warehouse or "").strip()
	if not warehouse:
		return set()
	rows = frappe.db.sql(
		"""
		SELECT item_code
		FROM `tabBin`
		WHERE warehouse = %s AND actual_qty > 0
		""",
		warehouse,
		as_dict=True,
	)
	return {r.item_code for r in rows if r.item_code}


@frappe.whitelist()
def get_prescription_items(search=None, warehouse=None, cost_center=None, in_stock_only=None):
	"""Items for prescription drug search / pharmacy give-out.

	Filters:

	- Item Group (or ancestor) must have ``custom_added_in_prescription`` when that field exists on Item Group.
	- Exclude Items linked from Lab Test Template (service/lab SKU rows).
	- Dedupe rows by normalized display name (same ``item_name`` on multiple SKUs).
	- When ``warehouse`` / ``cost_center`` / ``in_stock_only`` is set, only items with
	  positive stock at the branch pharmacy warehouse are returned.

	Returns the same shape as ``get_items`` plus optional ``default_route_of_administration``
	when Item.custom_route_of_administration exists on the install.
	"""
	from frappe.utils import cint

	in_stock_only = cint(in_stock_only)
	stock_warehouse = resolve_branch_pharmacy_warehouse(cost_center, warehouse)
	if warehouse or cost_center or in_stock_only:
		in_stock_only = 1
		if not stock_warehouse:
			return []

	in_stock_codes = None
	if in_stock_only and stock_warehouse:
		in_stock_codes = get_item_codes_with_stock(stock_warehouse)
		if not in_stock_codes:
			return []

	exclude_templates = frappe.get_all(
		'Lab Test Template',
		filters={'item': ['is', 'set']},
		pluck='item',
	)
	exclude_names = list({x for x in exclude_templates if x})

	filters = {'disabled': 0}
	if in_stock_codes is not None:
		allowed = list(in_stock_codes)
		if exclude_names:
			exclude_set = set(exclude_names)
			allowed = [c for c in allowed if c not in exclude_set]
		if not allowed:
			return []
		filters['name'] = ['in', allowed]
	elif exclude_names:
		filters['name'] = ['not in', exclude_names]

	# Drug searches offer NHRA Medicine items only (nurse-department requirement).
	NHRA_MEDICINE_ITEM_GROUP = 'NHRA Medicine'
	if frappe.db.exists('Item Group', NHRA_MEDICINE_ITEM_GROUP):
		from frappe.utils.nestedset import get_descendants_of

		try:
			nhra_groups = [NHRA_MEDICINE_ITEM_GROUP] + list(
				get_descendants_of('Item Group', NHRA_MEDICINE_ITEM_GROUP) or []
			)
		except Exception:
			nhra_groups = [NHRA_MEDICINE_ITEM_GROUP]
		filters['item_group'] = ['in', nhra_groups]

	ig_meta_has_field = frappe.get_meta('Item Group').has_field('custom_added_in_prescription')

	route_field = _item_route_of_administration_fieldname()
	item_meta = frappe.get_meta('Item')
	sci_field = 'custom_scientific_name' if item_meta.has_field('custom_scientific_name') else None

	fields = ['name', 'item_code', 'item_name', 'item_group', 'stock_uom']
	if route_field:
		fields.append(route_field)
	if sci_field:
		fields.append(sci_field)

	or_filters = None
	search = (search or '').strip()
	if search:
		or_filters = {
			'item_name': ['like', f'%{search}%'],
			'item_code': ['like', f'%{search}%'],
		}
		# Allow searching drugs by their scientific / generic name too.
		if sci_field:
			or_filters[sci_field] = ['like', f'%{search}%']

	items = frappe.get_all(
		'Item',
		filters=filters,
		or_filters=or_filters,
		fields=fields,
		order_by='item_name asc',
		limit_page_length=200 if search else 100,
	)

	group_cache = {}
	pink_cache = {}
	out = []
	seen_labels = {}
	for row in items:
		ig = row.get('item_group')
		if not _item_group_chain_has_prescription_flag(ig, group_cache, ig_meta_has_field):
			continue

		label = (row.item_name or row.item_code or row.name or '').strip()
		key = _normalize_prescription_item_label(label)
		if not key:
			key = row.name
		if key in seen_labels:
			continue
		seen_labels[key] = True

		entry = {
			'name': row.name,
			'label': label,
			'item_code': row.item_code,
			'item_group': row.item_group,
			'stock_uom': row.stock_uom,
			'is_pink': bool(_item_group_chain_has_custom_is_pink(ig, pink_cache)),
		}
		if stock_warehouse and in_stock_only:
			entry['warehouse'] = stock_warehouse
			entry['in_stock'] = True
		if route_field:
			route_val = row.get(route_field)
			if route_val:
				entry['default_route_of_administration'] = route_val
		if sci_field:
			sci_val = (row.get(sci_field) or '').strip()
			if sci_val:
				entry['scientific_name'] = sci_val

		out.append(entry)
		if len(out) >= 50:
			break

	return out


@frappe.whitelist()
def filter_items_in_stock(item_codes=None, warehouse=None, cost_center=None):
	"""Return which of the given item codes have stock at the branch pharmacy warehouse."""
	import json

	if isinstance(item_codes, str):
		try:
			item_codes = json.loads(item_codes)
		except Exception:
			item_codes = [c.strip() for c in item_codes.split(",") if c.strip()]

	codes = [(c or "").strip() for c in (item_codes or []) if (c or "").strip()]
	stock_warehouse = resolve_branch_pharmacy_warehouse(cost_center, warehouse)
	if not stock_warehouse or not codes:
		return {
			"warehouse": stock_warehouse,
			"in_stock": [],
			"out_of_stock": codes,
		}

	in_stock_set = get_item_codes_with_stock(stock_warehouse)
	in_stock = [c for c in codes if c in in_stock_set]
	out_of_stock = [c for c in codes if c not in in_stock_set]
	return {
		"warehouse": stock_warehouse,
		"in_stock": in_stock,
		"out_of_stock": out_of_stock,
	}


@frappe.whitelist()
def get_service_request_template_types():
	"""Get list of valid template types for Service Request"""
	order_template_doctypes = [
		"Therapy Type",
		"Lab Test Template",
		"Clinical Procedure Template",
		"Appointment Type",
		"Observation Template",
		"Healthcare Activity",
		"Consultation Service Template",
	]
	if frappe.db.exists("DocType", "Healthcare Service Template"):
		order_template_doctypes.append("Healthcare Service Template")

	doctypes = frappe.get_all(
		'DocType',
		filters={'name': ['in', order_template_doctypes]},
		fields=['name'],
		limit=50
	)
	return [{'name': d.name, 'label': d.name} for d in doctypes]


@frappe.whitelist()
def get_service_request_templates(template_dt, search=None, department=None, is_group=None):
	"""Get list of templates based on template_dt (Order Template Type).

	For Lab Test Template only, pass is_group=0 or is_group=1 to filter non-group vs group templates.
	"""
	if not template_dt:
		return []
	
	filters = {}
	or_filters = None
	if search:
		term = str(search).strip()
		if term:
			like = f'%{term}%'
			# Different fields for different template types
			if template_dt == 'Lab Test Template':
				or_filters = [
					['lab_test_name', 'like', like],
					['name', 'like', like],
					['lab_test_code', 'like', like],
					['no', 'like', like],
				]
			elif template_dt == 'Clinical Procedure Template':
				filters['procedure_name'] = ['like', like]
			elif template_dt == 'Observation Template':
				filters['observation'] = ['like', like]
			elif template_dt == 'Therapy Type':
				filters['therapy_type'] = ['like', like]
			elif template_dt == 'Appointment Type':
				filters['name'] = ['like', like]
			elif template_dt == 'Healthcare Activity':
				filters['activity_type'] = ['like', like]

	if template_dt == 'Lab Test Template' and is_group is not None and str(is_group).strip() != '':
		try:
			ig = int(is_group)
			if ig in (0, 1):
				filters['is_group'] = ig
		except (TypeError, ValueError):
			pass
	
	if department:
		if template_dt == 'Lab Test Template':
			filters['department'] = department
		elif template_dt == 'Clinical Procedure Template':
			filters['medical_department'] = department
		elif template_dt == 'Observation Template':
			filters['medical_department'] = department
	
	# Get templates based on type
	if template_dt == 'Lab Test Template':
		lab_kwargs = {
			"doctype": "Lab Test Template",
			"filters": {**filters, "disabled": ["!=", 1]},
			"fields": ["name", "lab_test_name", "department", "is_group"],
			"limit": 100,
			"order_by": "lab_test_name asc",
		}
		if or_filters:
			lab_kwargs["or_filters"] = or_filters
		templates = frappe.get_all(**lab_kwargs)
		return [{'name': t.name, 'label': t.lab_test_name or t.name, 'department': t.department, 'is_group': t.is_group} for t in templates]
	
	elif template_dt == 'Clinical Procedure Template':
		templates = frappe.get_all(
			'Clinical Procedure Template',
			filters=filters,
			fields=['name', 'procedure_name', 'medical_department'],
			limit=50,
			# order_by='procedure_name'
		)
		return [{'name': t.name, 'label': t.procedure_name or t.name, 'department': t.medical_department} for t in templates]
	
	elif template_dt == 'Observation Template':
		templates = frappe.get_all(
			'Observation Template',
			filters=filters,
			fields=['name', 'observation', 'medical_department'],
			limit=50,
			order_by='observation'
		)
		return [{'name': t.name, 'label': t.observation or t.name, 'department': t.medical_department} for t in templates]
	
	elif template_dt == 'Therapy Type':
		templates = frappe.get_all(
			'Therapy Type',
			filters=filters,
			fields=['name', 'therapy_type'],
			limit=50,
			order_by='therapy_type'
		)
		return [{'name': t.name, 'label': t.therapy_type or t.name} for t in templates]
	
	elif template_dt == 'Appointment Type':
		templates = frappe.get_all(
			'Appointment Type',
			filters=filters,
			fields=['name'],
			limit=50,
			order_by='name'
		)
		return [{'name': t.name, 'label': t.name} for t in templates]
	
	elif template_dt == 'Healthcare Activity':
		templates = frappe.get_all(
			'Healthcare Activity',
			filters=filters,
			fields=['name', 'activity_type'],
			limit=50,
			order_by='activity_type'
		)
		return [{'name': t.name, 'label': t.activity_type or t.name} for t in templates]

	elif template_dt == 'Healthcare Service Template' and frappe.db.exists("DocType", "Healthcare Service Template"):
		if search:
			filters['service_name'] = ['like', f'%{search}%']
		filters['disabled'] = 0
		templates = frappe.get_all(
			'Healthcare Service Template',
			filters=filters,
			fields=['name', 'service_name'],
			limit=50,
			order_by='service_name'
		)
		return [{'name': t.name, 'label': getattr(t, 'service_name', None) or t.name} for t in templates]

	elif template_dt == 'Consultation Service Template':
		if search:
			filters['template_name'] = ['like', f'%{search}%']
		templates = frappe.get_all(
			'Consultation Service Template',
			filters=filters,
			fields=['name', 'template_name', 'type'],
			limit=50,
			order_by='template_name'
		)
		return [{'name': t.name, 'label': t.template_name or t.name, 'type': t.type} for t in templates]

	return []


@frappe.whitelist()
def get_service_request_statuses(search=None):
	"""Get list of Service Request statuses (Code Values)
	
	Returns Code Value records where the name is in format: {code_value}-{code_system}
	The name field is what should be used as the Link value in Service Request status field.
	
	Code System uses autoname: field:code_system, so the name is the same as code_system field value.
	"""
	print("=" * 50)
	print("API FUNCTION CALLED: get_service_request_statuses")
	print("=" * 50)
	
	# Code System uses autoname: field:code_system, so name = code_system field value
	# So we can use "Request Status" directly as the filter
	filters = {'code_system': 'Request Status'}
	
	if search:
		filters['display'] = ['like', f'%{search}%']
	
	# Filter Code Values by the Code System name (Link field)
	statuses = frappe.get_all(
		'Code Value',
		filters=filters,
		fields=['name', 'code_value', 'display', 'code_system'],
		limit=50,
		order_by='code_value'
	)
	print("Number of statuses found:", len(statuses))
	print("Statuses:", statuses)
	
	# Return the name field which is the Link value (format: code_value-code_system)
	result = [{'name': s.name, 'label': s.display or s.code_value, 'code_value': s.code_value, 'code_system': s.code_system} for s in statuses]
	print("Returning result:", result)
	return result


@frappe.whitelist()
def create_healthcare_practitioner(data):
	"""Create a new Healthcare Practitioner.

	Accepts `full_name` (single field) or legacy `first_name`/`middle_name`/`last_name`.
	When `full_name` is provided the entire string is stored as `first_name` so that
	`practitioner_name` equals the full name exactly as entered.
	"""
	if isinstance(data, str):
		import json
		data = json.loads(data)

	full_name = (data.get('full_name') or '').strip()
	first_name = full_name or (data.get('first_name') or '').strip()

	if not first_name:
		frappe.throw(_("Full Name is required"))

	doc_data = {
		'doctype': 'Healthcare Practitioner',
		'doctors_id': get_next_transaction_number('Healthcare Practitioner', fieldname='doctors_id'),
		'first_name': first_name,
		'practitioner_name': first_name,
		'gender': data.get('gender') or None,
		'status': data.get('status') or 'Active',
		'mobile_phone': data.get('mobile_phone') or None,
		'office_phone': data.get('office_phone') or None,
		'department': data.get('department') or None,
		'medical_role': data.get('medical_role') or None,
	}

	if not full_name:
		doc_data['middle_name'] = data.get('middle_name') or ''
		doc_data['last_name'] = data.get('last_name') or ''

	practitioner = frappe.get_doc(doc_data)

	schedules = data.get('practitioner_schedules') or []
	if isinstance(schedules, str):
		import json
		schedules = json.loads(schedules)
	for s in schedules:
		if s.get('schedule'):
			practitioner.append('practitioner_schedules', {
				'schedule': s.get('schedule'),
				'service_unit': s.get('service_unit') or None,
			})

	practitioner.ensure_default_practitioner_schedule()
	practitioner.insert(ignore_permissions=True)

	return {
		'name': practitioner.name,
		'practitioner_name': practitioner.practitioner_name,
	}


@frappe.whitelist()
def get_dosage_forms(search=None):
	"""Get list of Dosage Form for prescription medication rows."""
	filters = {}
	if search:
		filters["name"] = ["like", f"%{search}%"]
	items = frappe.get_all(
		"Dosage Form",
		filters=filters,
		fields=["name"],
		order_by="name asc",
		limit=50,
	)
	return [{"name": d.name, "label": d.name} for d in items]


@frappe.whitelist()
def get_prescription_frequencies(search=None):
	"""Get list of active Prescription Frequency records for medication rows."""
	_ensure_default_long_acting_frequencies()
	filters = {}
	if frappe.db.has_column("Prescription Frequency", "active"):
		filters["active"] = 1
	if search:
		filters["dosage"] = ["like", f"%{search}%"]
	items = frappe.get_all(
		"Prescription Frequency",
		filters=filters,
		fields=["name"],
		order_by="name asc",
		limit=50,
	)
	return [{"name": p.name, "label": p.name} for p in items]


DEFAULT_LONG_ACTING_FREQUENCIES = [
	("Weekly", 7),
	("Biweekly", 14),
	("Monthly", 30),
	("Every 2 Months", 60),
	("Every 3 Months", 90),
]


def _ensure_prescription_frequency_exists(dosage, frequency_in_a_day=1):
	"""Create Prescription Frequency if missing (idempotent)."""
	from frappe.utils import cint

	dosage = (dosage or "").strip()
	if not dosage or frappe.db.exists("Prescription Frequency", dosage):
		return
	doc = frappe.new_doc("Prescription Frequency")
	doc.dosage = dosage
	doc.frequency_in_a_day = cint(frequency_in_a_day)
	if frappe.db.has_column("Prescription Frequency", "active"):
		doc.active = 1
	doc.insert(ignore_permissions=True)


def ensure_prescription_frequency_for_long_acting(frequency_name):
	"""Long-acting interval labels also exist as Prescription Frequency (not daily automation)."""
	_ensure_prescription_frequency_exists(frequency_name, frequency_in_a_day=0)
	if frappe.db.has_column("Prescription Frequency", "daily"):
		frappe.db.set_value("Prescription Frequency", frequency_name, "daily", 0)


def _ensure_default_long_acting_frequencies():
	created = False
	for frequency, interval_days in DEFAULT_LONG_ACTING_FREQUENCIES:
		if not frappe.db.exists("Long Acting Frequency", frequency):
			doc = frappe.new_doc("Long Acting Frequency")
			doc.frequency = frequency
			doc.interval_days = interval_days
			doc.insert(ignore_permissions=True)
			created = True
		ensure_prescription_frequency_for_long_acting(frequency)
	if created:
		frappe.db.commit()


@frappe.whitelist()
def get_long_acting_frequencies(search=None):
	"""Get list of Long Acting Frequency options for prescription rows."""
	_ensure_default_long_acting_frequencies()
	filters = {}
	if search:
		filters["frequency"] = ["like", f"%{search}%"]
	items = frappe.get_all(
		"Long Acting Frequency",
		filters=filters,
		fields=["frequency", "interval_days"],
		order_by="frequency asc",
		limit=50,
	)
	return [
		{"name": item.frequency, "label": item.frequency, "interval_days": item.interval_days}
		for item in items
	]


@frappe.whitelist()
def create_prescription_frequency(dosage, frequency_in_a_day=1):
	"""Create a new Prescription Frequency record."""
	from frappe.utils import cint

	dosage = (dosage or "").strip()
	if not dosage:
		frappe.throw(_("Frequency is required"))
	if frappe.db.exists("Prescription Frequency", dosage):
		frappe.throw(_("Prescription Frequency '{0}' already exists").format(dosage))
	doc = frappe.new_doc("Prescription Frequency")
	doc.dosage = dosage
	doc.frequency_in_a_day = cint(frequency_in_a_day) or 1
	if frappe.db.has_column("Prescription Frequency", "active"):
		doc.active = 1
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"name": doc.name, "label": doc.name}


@frappe.whitelist()
def create_long_acting_frequency(frequency, interval_days=7):
	"""Create a new Long Acting Frequency record."""
	from frappe.utils import cint

	frequency = (frequency or "").strip()
	if not frequency:
		frappe.throw(_("Frequency is required"))
	interval_days = cint(interval_days)
	if interval_days <= 0:
		frappe.throw(_("Interval must be at least 1 day"))
	if frappe.db.exists("Long Acting Frequency", frequency):
		frappe.throw(_("Long Acting Frequency '{0}' already exists").format(frequency))
	doc = frappe.new_doc("Long Acting Frequency")
	doc.frequency = frequency
	doc.interval_days = interval_days
	doc.insert(ignore_permissions=True)
	ensure_prescription_frequency_for_long_acting(frequency)
	frappe.db.commit()
	return {"name": doc.frequency, "label": doc.frequency, "interval_days": doc.interval_days}


@frappe.whitelist()
def get_route_of_administration_list(search=None):
	"""Get list of Route of Administration for prescription medication rows."""
	filters = {}
	if search:
		filters["name"] = ["like", f"%{search}%"]
	items = frappe.get_all(
		"Route of Administration",
		filters=filters,
		fields=["name"],
		order_by="name asc",
		limit=50,
	)
	return [{"name": r.name, "label": r.name} for r in items]


@frappe.whitelist()
def get_long_acting_medicine_list(patient=None, limit=50, offset=0):
	"""Get list of Long Acting Medicine docs for a patient (for Doctor dashboard card)."""
	if not patient:
		return []
	limit = int(limit) if limit else 50
	offset = int(offset) if offset else 0
	docs = frappe.get_all(
		"Long Acting Medicine",
		filters={"patient": patient, "docstatus": ["!=", 2]},
		fields=["name", "patient", "patient_name", "frequency", "start_date", "end_date", "next_run_date", "status"],
		order_by="next_run_date asc",
		limit=limit,
		limit_start=offset,
	)
	return list(docs)


LONG_ACTING_MEDICINE_PORTAL_ROLES = frozenset(
	{
		"Administrator",
		"System Manager",
		"Healthcare Administrator",
		"Doctor",
		"Nurse",
		"Physician",
		"Psychologist",
		"Anesthesiologist",
		"Therapist",
		"Nutritionist",
		"Receptionist",
	}
)


def _user_can_access_long_acting_medicine_portal() -> bool:
	if frappe.session.user in ("Guest", ""):
		return False
	return bool(LONG_ACTING_MEDICINE_PORTAL_ROLES & set(frappe.get_roles(frappe.session.user)))


@frappe.whitelist()
def get_long_acting_medicine(name: str | None = None):
	"""Return one Long Acting Medicine for the healthcare portal (avoids REST DocPerm gaps)."""
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Long Acting Medicine is required"))

	if not frappe.db.exists("Long Acting Medicine", name):
		frappe.throw(_("Long Acting Medicine {0} not found").format(name))

	doc = frappe.get_doc("Long Acting Medicine", name)

	if not frappe.has_permission("Long Acting Medicine", "read", doc=doc):
		if not _user_can_access_long_acting_medicine_portal():
			frappe.throw(
				_("Not permitted to read Long Acting Medicine"),
				frappe.PermissionError,
			)

	data = doc.as_dict()
	if doc.practitioner:
		data["practitioner_name"] = (
			frappe.db.get_value("Healthcare Practitioner", doc.practitioner, "practitioner_name")
			or doc.practitioner
		)
	from healthcare.healthcare.doctype.long_acting_medicine.long_acting_medicine import enrich_long_acting_medicine_row

	return enrich_long_acting_medicine_row(data)


@frappe.whitelist()
def get_long_acting_medicine_list_for_reception(start_date=None, frequency=None, patient=None, limit=50, offset=0):
	"""Get Long Acting Medicine docs for receptionist view, with optional filters.

	- start_date: filter by start_date (exact date)
	- frequency: filter by frequency (Weekly, Biweekly, etc.)
	- patient: optional filter by patient
	"""
	limit = int(limit) if limit else 50
	offset = int(offset) if offset else 0

	filters = {"docstatus": ["!=", 2]}
	if start_date:
		filters["start_date"] = start_date
	if frequency:
		filters["frequency"] = frequency
	if patient:
		filters["patient"] = patient

	docs = frappe.get_all(
		"Long Acting Medicine",
		filters=filters,
		fields=[
			"name",
			"patient",
			"patient_name",
			"frequency",
			"start_date",
			"end_date",
			"next_run_date",
			"status",
			"remarks",
			"injection_given_on",
		],
		order_by="next_run_date asc, start_date asc, name asc",
		limit=limit,
		limit_start=offset,
	)
	from healthcare.healthcare.doctype.long_acting_medicine.long_acting_medicine import enrich_long_acting_medicine_list_rows

	return enrich_long_acting_medicine_list_rows(list(docs))


@frappe.whitelist()
def update_long_acting_medicine_remarks(name: str, remarks: str):
	"""Update the remarks field on a Long Acting Medicine record."""
	assert_editing_allowed()
	if not name:
		frappe.throw(_("Long Acting Medicine name is required"))
	if not frappe.db.exists("Long Acting Medicine", name):
		frappe.throw(_("Long Acting Medicine {0} does not exist").format(frappe.bold(name)))
	doc = frappe.get_doc("Long Acting Medicine", name)
	doc.remarks = remarks or ''
	doc.save(ignore_permissions=True)
	return {"name": doc.name, "remarks": doc.remarks}


@frappe.whitelist()
def send_long_acting_medicine_reminder(name: str, channel: str = "email"):
	"""Send a reminder for a Long Acting Medicine via the specified channel.

	channel: 'email' | 'whatsapp' | 'sms'
	Extend each branch below to hook into your messaging gateway.
	"""
	if not name:
		frappe.throw(_("Long Acting Medicine name is required"))
	if not frappe.db.exists("Long Acting Medicine", name):
		frappe.throw(_("Long Acting Medicine {0} does not exist").format(frappe.bold(name)))

	channel = (channel or "email").lower()
	valid_channels = ("email", "whatsapp", "sms")
	if channel not in valid_channels:
		frappe.throw(_("Invalid channel '{0}'. Must be one of: {1}").format(channel, ", ".join(valid_channels)))

	doc = frappe.get_doc("Long Acting Medicine", name)
	patient = frappe.get_doc("Patient", doc.patient) if doc.patient else None
	patient_name = doc.patient_name or (patient.patient_name if patient else doc.patient or name)

	if channel == "email":
		# Hook: send email via frappe.sendmail or Communication doctype
		# frappe.sendmail(recipients=[patient.email], subject="...", message="...")
		pass
	elif channel == "whatsapp":
		_send_long_acting_medicine_whatsapp(doc, patient)
	elif channel == "sms":
		# Hook: send SMS via frappe.core.doctype.sms_settings or external gateway
		pass

	return {"sent": True, "channel": channel, "patient": patient_name}


def _send_long_acting_medicine_whatsapp(doc, patient):
	"""Send WhatsApp reminder for a Long Acting Medicine document."""
	from healthcare.healthcare.doctype.digital_connect_whatsap_settings.digital_connect_whatsap_settings import (
		send_test_message,
	)

	if not patient:
		frappe.throw(_("Patient record not found for this Long Acting Medicine"))

	phone = (
		getattr(patient, "mobile", "") or
		getattr(patient, "mobile_no", "") or
		getattr(patient, "mobile_no_1", "") or
		getattr(patient, "phone", "") or ""
	).strip()
	if not phone:
		frappe.throw(_("Patient {0} has no mobile number").format(patient.patient_name or patient.name))

	template_name = doc.get("whatsapp_template")
	if template_name:
		result = send_test_message(
			phone_number=phone,
			template_name=template_name,
		)
	else:
		patient_name = doc.patient_name or patient.patient_name or doc.patient
		body = _(
			"Dear {0}, this is a reminder for your Long Acting Medicine. "
			"Please visit the hospital as scheduled."
		).format(patient_name)
		result = send_test_message(phone_number=phone, body=body, preview_url=1)

	chat_name = result.get("chat_name") if isinstance(result, dict) else None
	if chat_name:
		frappe.db.set_value(
			"Digital Whatsapp Chat",
			chat_name,
			{
				"reference_doctype": "Long Acting Medicine",
				"reference_name": doc.name,
			},
			update_modified=True,
		)


def _enrich_diagnosis_display(diagnosis_link_name):
	"""Return display fields from Diagnosis master (by doc name / link)."""
	empty = {
		"diagnosis_label": "",
		"diagnosis_group_name": "",
		"disease_no": "",
		"diagnosis_name": "",
	}
	if not diagnosis_link_name:
		return empty
	if not frappe.db.exists("Diagnosis", diagnosis_link_name):
		empty["diagnosis_label"] = diagnosis_link_name
		return empty
	d = frappe.db.get_value(
		"Diagnosis",
		diagnosis_link_name,
		["disease_no", "diagnosis", "diagnosis_group_name"],
		as_dict=True,
	)
	if not d:
		empty["diagnosis_label"] = diagnosis_link_name
		return empty
	no = (d.get("disease_no") or "").strip() or (diagnosis_link_name or "")
	nm = (d.get("diagnosis") or "").strip()
	gn = (d.get("diagnosis_group_name") or "").strip()
	if nm and no:
		label = f"[{no}] {nm}"
	elif nm:
		label = nm
	else:
		label = no or diagnosis_link_name
	return {
		"diagnosis_label": label,
		"diagnosis_group_name": gn,
		"disease_no": no,
		"diagnosis_name": nm,
	}


def _diagnosis_row_to_link_option(row) -> dict:
	"""Build portal link option dict from a Diagnosis row or doc name."""
	if isinstance(row, str):
		if not frappe.db.exists("Diagnosis", row):
			return {
				"name": row,
				"label": row,
				"disease_no": row,
				"diagnosis_name": "",
				"diagnosis_group_name": "",
			}
		row = frappe.db.get_value(
			"Diagnosis",
			row,
			["name", "disease_no", "diagnosis", "diagnosis_group_name"],
			as_dict=True,
		)
	no = (row.get("disease_no") or row.get("name") or "").strip()
	nm = (row.get("diagnosis") or "").strip()
	gn = (row.get("diagnosis_group_name") or "").strip()
	if nm and no:
		label = f"[{no}] {nm}"
	elif nm:
		label = nm
	else:
		label = no
	return {
		"name": row.get("name") or no,
		"label": label,
		"disease_no": no,
		"diagnosis_name": nm,
		"diagnosis_group_name": gn,
	}


@frappe.whitelist()
def get_diagnosis(search=None):
	"""Get list of Diagnosis for encounter selection. Search matches Disease No (id) or Diagnosis name."""
	filters = {}
	or_filters = None
	if search and str(search).strip():
		s = str(search).strip()
		or_filters = [
			["disease_no", "like", f"%{s}%"],
			["diagnosis", "like", f"%{s}%"],
		]
	items = frappe.get_all(
		"Diagnosis",
		filters=filters,
		or_filters=or_filters,
		fields=["name", "disease_no", "diagnosis", "diagnosis_group_name"],
		order_by="disease_no asc, diagnosis asc",
		limit=50,
	)
	return [_diagnosis_row_to_link_option(d) for d in items]


@frappe.whitelist()
def get_diagnosis_groups(search=None):
	"""List Diagnosis Group records for the create-diagnosis form."""
	or_filters = None
	if search and str(search).strip():
		s = str(search).strip()
		or_filters = [
			["disease_no", "like", f"%{s}%"],
			["disease_name", "like", f"%{s}%"],
		]
	items = frappe.get_all(
		"Diagnosis Group",
		or_filters=or_filters,
		fields=["name", "disease_no", "disease_name"],
		order_by="disease_name asc",
		limit=50,
	)
	out = []
	for g in items:
		no = (g.get("disease_no") or g.get("name") or "").strip()
		nm = (g.get("disease_name") or "").strip()
		if nm and no:
			label = f"[{no}] {nm}"
		elif nm:
			label = nm
		else:
			label = no or g.name
		out.append({"name": g.name, "label": label})
	return out


@frappe.whitelist()
def get_complaints(search=None):
	"""Get list of Complaint (doctype) for encounter symptoms/chief complaint selection."""
	filters = {}
	if search:
		filters["complaints"] = ["like", f"%{search}%"]
	items = frappe.get_all(
		"Complaint",
		filters=filters,
		fields=["name", "complaints"],
		order_by="complaints asc",
		limit=50,
	)
	return [{"name": c.name, "label": c.complaints or c.name} for c in items]


@frappe.whitelist()
def create_diagnosis(diagnosis, disease_no=None, diagnosis_group=None):
	"""Create a Diagnosis master (template). Returns link option dict for the portal."""
	if not diagnosis or not str(diagnosis).strip():
		frappe.throw(_("Diagnosis text is required"))
	text = str(diagnosis).strip()
	existing = frappe.db.get_value("Diagnosis", {"diagnosis": text}, "name")
	if existing:
		return _diagnosis_row_to_link_option(existing)

	if disease_no and str(disease_no).strip():
		code = str(disease_no).strip()
		if frappe.db.exists("Diagnosis", code):
			frappe.throw(_("Disease No {0} already exists").format(code))
	else:
		base = frappe.scrub(text)[:120] or "diag"
		code = base
		idx = 1
		while frappe.db.exists("Diagnosis", code):
			idx += 1
			suffix = f"-{idx}"
			code = f"{base[: 140 - len(suffix)]}{suffix}"

	group = (diagnosis_group or "").strip() or None
	if group and not frappe.db.exists("Diagnosis Group", group):
		frappe.throw(_("Diagnosis Group {0} does not exist").format(group))

	doc = frappe.get_doc(
		{
			"doctype": "Diagnosis",
			"disease_no": code,
			"diagnosis": text,
			"diagnosis_group": group,
		}
	)
	doc.insert(ignore_permissions=False)
	return _diagnosis_row_to_link_option(doc.name)


@frappe.whitelist()
def create_complaint(complaints):
	"""Create a new Complaint master record. Returns the new doc name."""
	if not complaints or not str(complaints).strip():
		frappe.throw(_("Complaint text is required"))
	name = str(complaints).strip()
	if frappe.db.exists("Complaint", name):
		return name
	doc = frappe.get_doc({"doctype": "Complaint", "complaints": name})
	doc.insert(ignore_permissions=False)
	return doc.name


@frappe.whitelist()
def get_companies(search=None):
	"""Get list of Companies"""

	filters = {}
	if search:
		filters["name"] = ["like", f"%{search}%"]

	companies = frappe.get_all(
		"Company",
		filters=filters,
		fields=["name"],
		order_by="name asc",
		limit=50
	)

	return [{"name": c.name, "label": c.name} for c in companies]


@frappe.whitelist()
def get_default_company_currency(company=None):
	"""Return ``Company.default_currency`` for the named company or the session default company.

	Always prefers the Company document currency — not Global Defaults — so the UI
	symbol matches billing (e.g. BHD) even when Global Defaults still say USD.
	"""
	comp = (company or "").strip() if company else None
	if comp and not frappe.db.exists("Company", comp):
		frappe.throw(_("Company {0} not found").format(comp))

	if not comp:
		try:
			import erpnext

			comp = erpnext.get_default_company()
		except Exception:
			comp = None

	if not comp:
		first = frappe.get_all("Company", fields=["name"], order_by="creation asc", limit_page_length=1)
		comp = first[0].name if first else None

	if not comp:
		return {"currency": None, "company": None}

	cur = frappe.get_cached_value("Company", comp, "default_currency")
	if not cur:
		try:
			import erpnext

			cur = erpnext.get_default_currency()
		except Exception:
			cur = None

	return {"currency": cur, "company": comp}


@frappe.whitelist()
def get_cost_centers(search=None, company=None):
	"""Get list of Cost Centers. Optionally filter by company (e.g. for transfer admission)."""

	filters = {}
	if search:
		filters["name"] = ["like", f"%{search}%"]
	if company:
		filters["company"] = company

	cost_centers = frappe.get_all(
		"Cost Center",
		filters=filters if filters else None,
		fields=["name"],
		order_by="name asc",
		limit=50
	)
	return [{"name": c.name, "label": c.name} for c in cost_centers]


@frappe.whitelist()
def get_payment_modes(search=None):
	"""F047: whitelisted list of Modes of Payment so portal roles (e.g. Reception)
	that cannot read the Mode of Payment doctype directly can still populate the
	billing payment-mode dropdown without a 403."""
	filters = {}
	if search:
		filters["name"] = ["like", f"%{search}%"]
	modes = frappe.get_all(
		"Mode of Payment",
		filters=filters or None,
		fields=["name"],
		order_by="name asc",
		limit=50,
	)
	return [{"name": m.name} for m in modes]


# Branches offered in the portal branch/cost-center filter, as (cost center name, label).
# Order here = order shown in the dropdown. Only these branches are selectable; every
# other cost center is hidden from the branch filter. Edit this list to change which
# branches appear or how they are labelled.
BRANCH_FILTER_COST_CENTERS = [
	("Serene Hospital - SPH", "Juffair Branch"),
	("Serene Center - SPH", "Serene Center"),
	("Jau Hospital - SPH", "Jau Branch"),
	("British Medical Center W.L.L - SPH", "British Medical Center"),
	("Dr. Abdul Karim Clinic - SPH", "Dr. Abdul Karim Clinic"),
]


@frappe.whitelist()
def get_branch_options():
	"""Cost centers shown in the portal branch filter.

	Deliberately limited to a fixed allowlist (see BRANCH_FILTER_COST_CENTERS) so the
	branch selector only exposes the chosen branches. This does NOT affect the general
	cost-center pickers used elsewhere (see get_cost_centers). Selecting "All branches"
	in the UI still means "no filter".
	"""
	found = set(
		frappe.get_all(
			"Cost Center",
			filters={"name": ["in", [name for name, _label in BRANCH_FILTER_COST_CENTERS]], "disabled": 0},
			pluck="name",
		)
	)
	# Preserve the order defined in BRANCH_FILTER_COST_CENTERS.
	return [
		{"name": name, "label": label}
		for name, label in BRANCH_FILTER_COST_CENTERS
		if name in found
	]


@frappe.whitelist()
def get_portal_company():
	"""Default company name, used for portal branding (e.g. the Settings header)."""
	company = frappe.defaults.get_global_default("company")
	if not company:
		try:
			import erpnext

			company = erpnext.get_default_company()
		except Exception:
			company = None
	return {"company": company or ""}


@frappe.whitelist()
def update_display_name(full_name=None):
	"""Update the logged-in user's display name (User.full_name)."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Not permitted"))
	full_name = (full_name or "").strip()
	if not full_name:
		frappe.throw(_("Display name cannot be empty"))
	frappe.db.set_value("User", user, "full_name", full_name)
	frappe.db.commit()
	return {"full_name": full_name}


@frappe.whitelist()
def set_profile_photo():
	"""Set the logged-in user's profile photo from an uploaded image file.

	Only ever touches the session user's own record.
	"""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Not permitted"))

	file = frappe.request.files.get("file") if (frappe.request and frappe.request.files) else None
	if not file:
		frappe.throw(_("No image uploaded"))

	content = file.stream.read()
	if not content:
		frappe.throw(_("Uploaded image is empty"))

	file_doc = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": file.filename or f"{frappe.scrub(user)}.png",
			"attached_to_doctype": "User",
			"attached_to_name": user,
			"attached_to_field": "user_image",
			"is_private": 0,
			"content": content,
		}
	).insert(ignore_permissions=True)

	frappe.db.set_value("User", user, "user_image", file_doc.file_url)
	frappe.db.commit()
	return {"user_image": file_doc.file_url}


@frappe.whitelist()
def get_patient_visits(search=None, patient=None, limit=20):
	from healthcare.api.common import apply_cost_center_scope_to_filters

	filters = {"docstatus": ["!=", 2]}
	if apply_cost_center_scope_to_filters(filters):
		return []

	if patient:
		filters["patient"] = patient

	if search:
		filters["name"] = ["like", f"%{search}%"]
	
	visits = frappe.get_all(
		"Patient Visit",
		filters=filters,
		fields=["name", "patient", "practitioner", "cost_center", "status"],
		limit=limit,
		order_by="creation desc",
	)

	return [
		{
			"name": v.name,
			"label": f"{v.name} - {v.patient or ''}",
			"cost_center": v.get("cost_center"),
			"status": v.get("status"),
		}
		for v in visits
	]


@frappe.whitelist()
def get_ip_risk_analyses(search=None, patient=None, admission=None, limit=20):
	"""Link options for IP Risk Analysis (Suicidal Patient Assessment reference field)."""
	filters = {}

	if admission:
		filters["admission_no"] = admission
	elif patient:
		filters["file_number"] = patient

	if search:
		filters["name"] = ["like", f"%{search}%"]

	records = frappe.get_all(
		"IP Risk Analysis",
		filters=filters,
		fields=["name", "admission_no", "patient_name", "file_number"],
		limit=int(limit),
		order_by="modified desc",
	)

	return [
		{
			"name": r.name,
			"label": " – ".join(p for p in [r.name, r.patient_name or r.file_number] if p),
		}
		for r in records
	]


@frappe.whitelist()
def get_inpatient_admissions(search=None, patient=None, limit=20):
	# filters = {"docstatus": ["!=", 2]}
	from healthcare.api.common import apply_cost_center_scope_to_filters

	filters = {}
	if apply_cost_center_scope_to_filters(filters):
		return []

	if patient:
		filters["patient"] = patient

	if search:
		filters["name"] = ["like", f"%{search}%"]
	admissions = frappe.get_all(
		"Inpatient Admission",
		filters=filters,
		fields=["name", "patient", "patient_name", "status", "admitted_datetime", "cost_center"],
		limit=limit,
		order_by="creation desc",
	)
	return [
		{
			"name": a.name,
			"label": f"{a.name} ({frappe.utils.formatdate(a.admitted_datetime) if a.admitted_datetime else '—'})",
			"patient": a.get("patient"),
			"patient_name": a.get("patient_name"),
			"status": a.get("status"),
			"cost_center": a.get("cost_center"),
		}
		for a in admissions
	]


import frappe

@frappe.whitelist()
def get_healthcare_insurance(search=None):
	filters = {}
	print("uko home ama Nairobi")
	if search:
		filters["name"] = ["like", f"%{search}%"]

	insurances = frappe.get_all(
		"Health Insurance",
		fields=[
			"name",
			"insurance_company",
			"insurance_type",
			"policy_no",
			"insurance_no"
		],
		filters=filters,
		limit_page_length=20,
		order_by="modified desc"
	)

	# return in LinkFieldOption format
	return [
		{
			"name": d.name,
			"label": d.name,
			"insurance_company": d.insurance_company,
			"insurance_type": d.insurance_type,
			"policy_no": d.policy_no,
		}
		for d in insurances
	]
 
from typing import Dict  # Optional, you can also just use dict
from healthcare.healthcare.editing_lock import assert_editing_allowed

@frappe.whitelist()
def get_salutations(query: str = "") -> list[Dict]:
    """
    Fetch salutations from Salutation doctype.
    :param query: optional search string to filter salutations
    :return: list of dictionaries with 'name' and 'label'
    """
    filters = {}
    if query:
        filters["salutation"] = ["like", f"%{query}%"]

    salutations = frappe.get_all(
        "Salutation",
        fields=["name", "salutation as label"],
        filters=filters,
        order_by="salutation asc"
    )

    return salutations


# ─── Cost Centre User Permission ──────────────────────────────────────────────

EXEMPT_ROLES = {"Administrator", "System Manager", "Healthcare Administrator"}


def _user_is_exempt(user=None):
	"""Return True if the user holds any role that bypasses Cost Centre restrictions."""
	user = user or frappe.session.user
	if user == "Administrator":
		return True
	roles = set(frappe.get_roles(user))
	return bool(roles & EXEMPT_ROLES)


def get_permitted_cost_centers():
	"""
	Shared helper — call this at the top of any list-fetching API function.

	Returns
	-------
	``None``    The current user has no Cost Center restriction; show everything.
	``[...]``   The user is restricted to this list of Cost Centers only.
	``[]``      The user has a permission row but it holds no values; show nothing.
	"""
	user = frappe.session.user

	perms = frappe.get_all(
		"User Permission",
		filters={"user": user, "allow": "Cost Center"},
		fields=["for_value"],
	)
	if not perms:
		return None  # No restriction — see everything

	return [p["for_value"] for p in perms]


def apply_cost_center_scope_to_filters(filters):
	"""Apply User Permission cost-center restriction to a frappe filters dict.

	Returns ``True`` when the user is restricted but has no permitted cost centers
	(caller should return empty results).
	"""
	permitted_cc = get_permitted_cost_centers()
	if permitted_cc is None:
		return False
	if not permitted_cc:
		return True
	filters["cost_center"] = ["in", permitted_cc]
	return False


def apply_cost_center_scope_to_list_filters(filters):
	"""Same as :func:`apply_cost_center_scope_to_filters` for list-style filters."""
	permitted_cc = get_permitted_cost_centers()
	if permitted_cc is None:
		return False
	if not permitted_cc:
		return True
	filters.append(["cost_center", "in", permitted_cc])
	return False


def resolve_cost_center_filter(requested=None):
	"""Resolve an optional UI cost-center filter against User Permission scope.

	Returns ``None`` when unrestricted, a single cost center string, a list for
	``['in', ...]``, or ``False`` when results must be empty.
	"""
	permitted_cc = get_permitted_cost_centers()
	requested = (requested or "").strip() or None
	if permitted_cc is None:
		return requested
	if not permitted_cc:
		return False
	if requested:
		return requested if requested in permitted_cc else False
	return permitted_cc


@frappe.whitelist()
def get_billing_cost_center_scope():
	"""Whether the current user is restricted to specific cost centers (User Permission).

	When ``restricted`` is false, reception billing may show a multi–cost center breakdown
	for a patient. When true, list APIs already filter to permitted cost centers only.
	"""
	permitted = get_permitted_cost_centers()
	return {"restricted": permitted is not None}


@frappe.whitelist()
def get_user_cost_center_permission():
	"""
	Return the Cost Center currently restricted to the logged-in user via
	User Permission, plus whether they are exempt (admin / system manager).
	"""
	user = frappe.session.user
	exempt = _user_is_exempt(user)

	existing = frappe.get_all(
		"User Permission",
		filters={
			"user": user,
			"allow": "Cost Center",
		},
		fields=["name", "for_value"],
		limit=1,
	)

	return {
		"cost_center": existing[0]["for_value"] if existing else "",
		"is_exempt": exempt,
	}


@frappe.whitelist()
def set_cost_center_permission(cost_center=None):
	"""
	Set (or clear) a Cost Center User Permission for the logged-in user.

	- Deletes any existing ``Cost Center`` User Permission rows for this user first.
	- If *cost_center* is a non-empty string, creates a fresh User Permission row.
	- Clear *cost_center* to remove the restriction and see all branches (when permitted).
	"""
	user = frappe.session.user

	# ── Remove all existing Cost Center permissions for this user ──────────────
	old_perms = frappe.get_all(
		"User Permission",
		filters={"user": user, "allow": "Cost Center"},
		fields=["name"],
	)
	for perm in old_perms:
		frappe.delete_doc("User Permission", perm["name"], ignore_permissions=True, force=True)

	# ── Create new permission if a cost center was supplied ────────────────────
	if cost_center and cost_center.strip():
		# Verify the cost center actually exists
		if not frappe.db.exists("Cost Center", cost_center.strip()):
			frappe.throw(f"Cost Center '{cost_center}' does not exist.")

		doc = frappe.get_doc({
			"doctype": "User Permission",
			"user": user,
			"allow": "Cost Center",
			"for_value": cost_center.strip(),
			"apply_to_all_doctypes": 1,
		})
		doc.insert(ignore_permissions=True)
		frappe.db.commit()
		return {"status": "set", "cost_center": cost_center.strip()}

	frappe.db.commit()
	return {"status": "cleared", "cost_center": ""}


@frappe.whitelist()
def get_insurance_patient_registers(search=None):
	"""Get list of Insurance Patient Registers."""
	filters = {}
	if search:
		filters["full_name"] = ["like", f"%{search}%"]

	records = frappe.get_all(
		"Insurance Patient Register",
		filters=filters,
		fields=[
			"name", "full_name", "national_id_cpr_no", "posting_date",
			"status", "insurance_provider", "approval_id",
			"approval_validitydays", "no_of_visits", "patient",
			"no_of_patient_visit",
		],
		limit=100,
		order_by="creation desc",
	)

	if records:
		patient_ids = list({r.patient for r in records if r.patient})
		patient_map = {}
		if patient_ids:
			for p in frappe.get_all(
				"Patient",
				filters={"name": ["in", patient_ids]},
				fields=["name", "patient_name", "file_no"],
			):
				patient_map[p.name] = p
		for r in records:
			pm = patient_map.get(r.patient) if r.patient else None
			r["patient_name"] = (pm.patient_name or "") if pm else ""
			r["patient_file_no"] = (pm.file_no or pm.name or "") if pm else ""

	return records


@frappe.whitelist()
def get_lab_test_template_detail(name):
	"""Fetch a single Lab Test Template with all display fields and full child table rows."""
	doc = frappe.get_doc("Lab Test Template", name)

	def rows(child_list, fields):
		result = []
		for row in (child_list or []):
			result.append({f: getattr(row, f, None) for f in fields})
		return result

	return {
		"name": doc.name,
		"lab_test_name": doc.lab_test_name,
		"department": doc.department,
		"lab_test_template_type": doc.lab_test_template_type,
		"is_group": doc.is_group,
		"is_billable": doc.is_billable,
		"disabled": doc.disabled,
		"nursing_checklist_template": doc.nursing_checklist_template,
		# Billing
		"item": doc.item,
		"lab_test_code": doc.lab_test_code,
		"lab_test_group": doc.lab_test_group,
		"link_existing_item": doc.link_existing_item,
		# Single/Compound UOM
		"lab_test_uom": getattr(doc, "lab_test_uom", None),
		"secondary_uom": getattr(doc, "secondary_uom", None),
		# Imaging
		"lab_test_description": getattr(doc, "lab_test_description", None),
		# Worksheet
		"worksheet_instructions": doc.worksheet_instructions,
		"legend_print_position": doc.legend_print_position,
		"result_legend": doc.result_legend,
		# Child tables — full rows
		"pricing": rows(doc.get("pricing"), ["patient_category", "price"]),
		"lab_test_groups": rows(doc.get("lab_test_groups"), [
			"lab_test_template", "lab_test_description", "group_event",
			"group_test_uom", "secondary_uom",
		]),
		"normal_test_templates": rows(doc.get("normal_test_templates"), [
			"lab_test_event", "lab_test_uom", "normal_range",
			"secondary_uom", "conversion_factor",
		]),
		"descriptive_test_templates": rows(doc.get("descriptive_test_templates"), [
			"particulars",
		]),
		"sample_requirements": rows(doc.get("sample_requirements"), [
			"sample", "sample_qty", "sample_details",
		]),
	}


@frappe.whitelist()
def get_lab_test_templates_admin_list(search=None):
	"""Get list of Lab Test Templates for the admin/setup template list screen (wide field set)."""
	filters = {}
	or_filters = None
	if search and str(search).strip():
		like = f"%{search.strip()}%"
		or_filters = [
			["lab_test_name", "like", like],
			["name", "like", like],
			["lab_test_code", "like", like],
			["no", "like", like],
		]

	query_kwargs = {
		"doctype": "Lab Test Template",
		"filters": filters,
		"fields": [
			"name", "lab_test_name", "lab_test_code", "department",
			"lab_test_template_type", "is_group", "is_billable", "disabled",
			"outpatient_rate", "inpatient_rate", "female_min_range", "female_max_range", "male_min_range", "male_max_range", "min_range", "max_range", "lab_test_uom",
			"lab_test_rate",
		],
		"limit": 500,
		"order_by": "lab_test_name asc",
	}
	if or_filters:
		query_kwargs["or_filters"] = or_filters

	templates = frappe.get_all(**query_kwargs)
	return templates


@frappe.whitelist()
def get_insurance_claims(
	search=None,
	patient=None,
	status=None,
	health_insurance=None,
	insurance_payor=None,
	patient_category=None,
):
	"""Get list of Insurance Claims with optional filters."""
	from frappe.utils import flt

	filters = {}
	if search:
		filters["name"] = ["like", f"%{search}%"]
	if patient:
		filters["patient"] = patient
	if status:
		filters["status"] = status
	if health_insurance:
		filters["health_insurance"] = health_insurance
	if insurance_payor:
		filters["insurance_payor"] = insurance_payor
	if patient_category:
		patient_names = frappe.get_all(
			"Patient", filters={"category": patient_category}, pluck="name"
		)
		if not patient_names:
			return []
		filters["patient"] = ["in", patient_names]

	claims = frappe.get_all(
		"Insurance Claim",
		filters=filters,
		fields=[
			"name", "patient", "patient_name", "health_insurance",
			"insurance_payor", "claim_date", "status", "docstatus",
			"total_claimed", "total_approved", "total_rejected",
			"total_patient_liability", "sales_invoice",
			"authorization_no", "remark", "vch_status",
		],
		limit=200,
		order_by="creation desc",
	)

	if claims:
		patients = list({c.patient for c in claims if c.patient})
		cat_map = {}
		if patients:
			for p in frappe.get_all(
				"Patient", filters={"name": ["in", patients]}, fields=["name", "category"]
			):
				cat_map[p.name] = p.category or ""
		for c in claims:
			c["patient_category"] = cat_map.get(c.patient, "")

	return claims


def _claimed_sales_invoices(exclude_claim=None):
	"""Sales invoices already linked to a non-cancelled Insurance Claim."""
	filters = {"sales_invoice": ["is", "set"], "docstatus": ["!=", 2]}
	if exclude_claim:
		filters["name"] = ["!=", exclude_claim]
	return set(
		frappe.get_all("Insurance Claim", filters=filters, pluck="sales_invoice")
	)


def _is_insurance_patient(patient):
	if not patient:
		return False
	if frappe.db.get_value("Patient", patient, "is_insurance"):
		return True
	return bool(frappe.db.get_value("Patient", patient, "insurance"))


def _get_eligible_insurance_patients(patient_names):
	"""Patients with is_insurance ticked and an Active Insurance Patient Register."""
	if not patient_names:
		return set()

	patients = frappe.get_all(
		"Patient",
		filters={
			"name": ["in", list(patient_names)],
			"is_insurance": 1,
			"insurance_register": ["is", "set"],
		},
		fields=["name", "insurance_register"],
	)
	if not patients:
		return set()

	register_names = list({p.insurance_register for p in patients if p.insurance_register})
	if not register_names:
		return set()

	active_registers = set(
		frappe.get_all(
			"Insurance Patient Register",
			filters={"name": ["in", register_names], "status": "Active"},
			pluck="name",
		)
	)
	return {p.name for p in patients if p.insurance_register in active_registers}


def _patient_eligible_for_insurance_claim(patient):
	return patient in _get_eligible_insurance_patients([patient])


@frappe.whitelist()
def get_insurance_claims_dashboard(patient=None, health_insurance=None):
	"""KPI summary for the insurance claims portal."""
	from frappe.utils import flt

	base_filters = {}
	if patient:
		base_filters["patient"] = patient
	if health_insurance:
		base_filters["health_insurance"] = health_insurance

	claims = frappe.get_all(
		"Insurance Claim",
		filters=base_filters,
		fields=[
			"name", "status", "health_insurance", "insurance_payor",
			"total_claimed", "total_approved", "total_rejected", "patient",
			"legacy",
		],
	)

	status_counts = {}
	for c in claims:
		st = c.status or "Draft"
		status_counts[st] = status_counts.get(st, 0) + 1

	by_insurance = {}
	for c in claims:
		key = c.health_insurance or c.insurance_payor or "Unspecified"
		if key not in by_insurance:
			by_insurance[key] = {
				"health_insurance": key,
				"total": 0,
				"legacy": 0,
				"pending": 0,
				"submitted": 0,
				"paid": 0,
				"rejected": 0,
				"total_claimed": 0.0,
				"total_approved": 0.0,
				"unpaid_amount": 0.0,
			}
		row = by_insurance[key]
		row["total"] += 1
		st = c.status or "Draft"
		# Legacy imports have an unknown workflow state — don't count them as pending.
		if c.legacy:
			row["legacy"] += 1
		elif st in ("Draft", "Submitted", "Partially Paid"):
			row["pending"] += 1
		if st == "Submitted":
			row["submitted"] += 1
		elif st == "Paid":
			row["paid"] += 1
		elif st == "Rejected":
			row["rejected"] += 1
		row["total_claimed"] += flt(c.total_claimed)
		row["total_approved"] += flt(c.total_approved)
		if st not in ("Paid", "Rejected"):
			row["unpaid_amount"] += max(flt(c.total_claimed) - flt(c.total_approved), 0)

	patients = list({c.patient for c in claims if c.patient})
	cat_map = {}
	if patients:
		for p in frappe.get_all(
			"Patient", filters={"name": ["in", patients]}, fields=["name", "category"]
		):
			cat_map[p.name] = p.category or "Uncategorized"

	by_category = {}
	for c in claims:
		cat = cat_map.get(c.patient, "Uncategorized")
		if cat not in by_category:
			by_category[cat] = {"category": cat, "count": 0, "total_claimed": 0.0}
		by_category[cat]["count"] += 1
		by_category[cat]["total_claimed"] += flt(c.total_claimed)

	# Legacy imports have an unknown workflow state — exclude them from "pending".
	pending = sum(
		1
		for c in claims
		if not c.legacy and (c.status or "Draft") in ("Draft", "Submitted", "Partially Paid")
	)

	return {
		"totals": {
			"claims": len(claims),
			"pending": pending,
			"submitted": status_counts.get("Submitted", 0),
			"partially_paid": status_counts.get("Partially Paid", 0),
			"paid": status_counts.get("Paid", 0),
			"rejected": status_counts.get("Rejected", 0),
			"total_claimed": sum(flt(c.total_claimed) for c in claims),
			"total_approved": sum(flt(c.total_approved) for c in claims),
			"total_unpaid": sum(
				max(flt(c.total_claimed) - flt(c.total_approved), 0)
				for c in claims
				if (c.status or "") not in ("Paid", "Rejected")
			),
		},
		"by_insurance": sorted(by_insurance.values(), key=lambda x: x["total_claimed"], reverse=True),
		"by_category": sorted(by_category.values(), key=lambda x: x["total_claimed"], reverse=True),
		"by_status": status_counts,
		"invoices_needing_claim": len(_get_invoices_needing_insurance_claim_rows(patient=patient)),
	}


def _get_invoices_needing_insurance_claim_rows(
	patient=None,
	limit=50,
	patient_category=None,
	date_from=None,
	date_to=None,
	health_insurance=None,
):
	"""Draft or unpaid/partly-paid invoices for insured patients with active register, no claim yet."""
	claimed = _claimed_sales_invoices()
	limit = int(limit)

	if patient and not _patient_eligible_for_insurance_claim(patient):
		return []

	if patient_category:
		category_patients = frappe.get_all(
			"Patient", filters={"category": patient_category}, pluck="name"
		)
		if not category_patients:
			return []
		if patient:
			if patient not in category_patients:
				return []
		else:
			patient = None  # use list filter below

	fields = [
		"name", "patient", "patient_name", "posting_date",
		"grand_total", "discount_amount", "outstanding_amount", "status", "docstatus",
		"custom_base_reference", "custom_base_reference_name",
		"custom_health_insurance",
	]

	base = {"patient": ["is", "set"]}
	if patient:
		base["patient"] = patient
	elif patient_category:
		base["patient"] = ["in", category_patients]

	if date_from and date_to:
		base["posting_date"] = ["between", [date_from, date_to]]
	elif date_from:
		base["posting_date"] = [">=", date_from]
	elif date_to:
		base["posting_date"] = ["<=", date_to]

	draft_rows = frappe.get_all(
		"Sales Invoice",
		filters={**base, "docstatus": 0},
		fields=fields,
		order_by="posting_date desc, creation desc",
		limit=limit * 5,
	)
	submitted_rows = frappe.get_all(
		"Sales Invoice",
		filters={
			**base,
			"docstatus": 1,
			"status": ["in", ["Unpaid", "Partly Paid"]],
		},
		fields=fields,
		order_by="posting_date desc, creation desc",
		limit=limit * 5,
	)

	seen = set()
	rows = []
	for r in draft_rows + submitted_rows:
		if r.name in seen:
			continue
		seen.add(r.name)
		rows.append(r)

	if not rows:
		return []

	patient_fields = ["name", "insurance_register", "insurance"]
	if frappe.get_meta("Patient").has_field("category"):
		patient_fields.append("category")

	patient_meta = {}
	for p in frappe.get_all(
		"Patient",
		filters={"name": ["in", list({r.patient for r in rows if r.patient})]},
		fields=patient_fields,
	):
		patient_meta[p.name] = p

	register_status = {}
	register_names = list({
		p.insurance_register
		for p in patient_meta.values()
		if getattr(p, "insurance_register", None)
	})
	if register_names:
		for reg in frappe.get_all(
			"Insurance Patient Register",
			filters={"name": ["in", register_names]},
			fields=["name", "status", "insurance_provider"],
		):
			register_status[reg.name] = reg

	eligible = _get_eligible_insurance_patients({r.patient for r in rows if r.patient})

	result = []
	for r in rows:
		if r.name in claimed:
			continue
		if r.patient not in eligible:
			continue
		pm = patient_meta.get(r.patient)
		reg_name = pm.insurance_register if pm else None
		reg = register_status.get(reg_name) if reg_name else None
		effective_hi = (
			r.custom_health_insurance
			or (reg.insurance_provider if reg else None)
			or (getattr(pm, "insurance", None) if pm else None)
		)

		if health_insurance and effective_hi != health_insurance:
			continue

		r["insurance_register"] = reg_name
		r["insurance_register_status"] = reg.status if reg else None
		r["insurance_provider"] = reg.insurance_provider if reg else None
		r["health_insurance"] = effective_hi or ""
		r["patient_category"] = (getattr(pm, "category", None) or "") if pm else ""
		if r.docstatus == 0:
			r["status"] = r.status or "Draft"
			if not r.outstanding_amount:
				r["outstanding_amount"] = r.grand_total
		result.append(r)
		if len(result) >= limit:
			break

	result.sort(
		key=lambda x: (
			0 if x.get("docstatus") == 0 else 1,
			str(x.get("posting_date") or ""),
		),
	)
	return result


@frappe.whitelist()
def get_invoices_needing_insurance_claim(
	patient=None,
	limit=50,
	patient_category=None,
	date_from=None,
	date_to=None,
	health_insurance=None,
):
	"""Portal: unpaid insurance invoices without an Insurance Claim."""
	return _get_invoices_needing_insurance_claim_rows(
		patient=patient,
		limit=limit,
		patient_category=patient_category,
		date_from=date_from,
		date_to=date_to,
		health_insurance=health_insurance,
	)


@frappe.whitelist()
def get_insurance_claim_detail(claim_name):
	"""Return a full Insurance Claim with line items for edit/view."""
	if not claim_name:
		frappe.throw(_("Claim name is required"))
	if not frappe.db.exists("Insurance Claim", claim_name):
		frappe.throw(_("Insurance Claim {0} not found").format(claim_name))

	doc = frappe.get_doc("Insurance Claim", claim_name)
	patient_category = frappe.db.get_value("Patient", doc.patient, "category") if doc.patient else ""

	items = []
	for row in doc.claim_items or []:
		items.append({
			"service_type": row.service_type,
			"item_name": row.item_name,
			"description": row.description,
			"sales_invoice_item": row.sales_invoice_item,
			"gross_amount": row.gross_amount,
			"covered_amount": row.covered_amount,
			"co_pay_amount": row.co_pay_amount,
			"non_covered_amount": row.non_covered_amount,
			"patient_liability": row.patient_liability,
			"paid_amount": row.paid_amount or 0,
		})

	return {
		"name": doc.name,
		"docstatus": doc.docstatus,
		"patient": doc.patient,
		"patient_name": doc.patient_name,
		"patient_category": patient_category or "",
		"health_insurance": doc.health_insurance,
		"insurance_payor": doc.insurance_payor,
		"claim_date": str(doc.claim_date) if doc.claim_date else None,
		"status": doc.status,
		"sales_invoice": doc.sales_invoice,
		"reference_doctype": doc.reference_doctype,
		"reference_name": doc.reference_name,
		"authorization_no": doc.authorization_no,
		"remark": doc.remark,
		"total_claimed": doc.total_claimed,
		"total_approved": doc.total_approved,
		"total_rejected": doc.total_rejected,
		"claim_items": items,
	}


def _apply_insurance_claim_payload(doc, data):
	"""Set header fields on an Insurance Claim from portal payload."""
	doc.patient = data.get("patient")
	doc.health_insurance = data.get("health_insurance") or None
	doc.insurance_payor = data.get("insurance_payor") or None
	doc.claim_date = data.get("claim_date") or None
	doc.status = data.get("status") or "Draft"
	doc.sales_invoice = data.get("sales_invoice") or None
	doc.reference_doctype = data.get("reference_doctype") or None
	doc.reference_name = data.get("reference_name") or None
	doc.authorization_no = data.get("authorization_no") or None
	doc.remark = data.get("remark") or None


def _append_claim_items(doc, claim_items):
	doc.claim_items = []
	for ci in claim_items or []:
		doc.append("claim_items", {
			"service_type": ci.get("service_type") or "OP",
			"item_name": ci.get("item_name") or "",
			"description": ci.get("description") or "",
			"sales_invoice_item": ci.get("sales_invoice_item") or None,
			"gross_amount": ci.get("gross_amount") or 0,
			"covered_amount": ci.get("covered_amount") or 0,
			"co_pay_amount": ci.get("co_pay_amount") or 0,
			"non_covered_amount": ci.get("non_covered_amount") or 0,
			"patient_liability": ci.get("patient_liability") or 0,
			"paid_amount": ci.get("paid_amount") or 0,
		})


@frappe.whitelist()
def save_insurance_claim(data):
	"""Create or update a draft Insurance Claim; optionally submit."""
	import json
	from frappe.utils import cint

	assert_editing_allowed()
	if isinstance(data, str):
		data = json.loads(data)

	submit = cint(data.get("submit"))
	claim_name = (data.get("name") or "").strip()
	sales_invoice = data.get("sales_invoice")

	if sales_invoice:
		claimed = _claimed_sales_invoices(exclude_claim=claim_name or None)
		if sales_invoice in claimed:
			frappe.throw(
				_("Sales Invoice {0} is already linked to an Insurance Claim").format(sales_invoice)
			)

	if claim_name:
		doc = frappe.get_doc("Insurance Claim", claim_name)
		if doc.docstatus != 0:
			frappe.throw(_("Only draft claims can be edited"))
	else:
		doc = frappe.new_doc("Insurance Claim")

	_apply_insurance_claim_payload(doc, data)
	if not submit and doc.status not in ("Draft",):
		doc.status = "Draft"
	if submit and doc.status == "Draft":
		doc.status = "Submitted"
	_append_claim_items(doc, data.get("claim_items"))

	if not claim_name:
		# New claim: auto-generate a legacy-style trans_no and make sure an
		# insurer is attached (fall back to the patient's insurance / TRICARE).
		from healthcare.healthcare.api.insurance_claim import (
			ensure_claim_insurance,
			get_next_insurance_claim_trans_no,
		)

		if not (getattr(doc, "trans_no", None) or "").strip():
			doc.trans_no = get_next_insurance_claim_trans_no()
		ensure_claim_insurance(doc)

	if claim_name:
		doc.save(ignore_permissions=True)
	else:
		doc.insert(ignore_permissions=True)

	if submit:
		doc.submit()

	frappe.db.commit()
	return {"name": doc.name, "docstatus": doc.docstatus, "status": doc.status}


@frappe.whitelist()
def reject_insurance_claim(claim_name, remark=None):
	"""Mark an Insurance Claim as Rejected."""
	assert_editing_allowed()
	if not claim_name:
		frappe.throw(_("Claim name is required"))
	if not frappe.db.exists("Insurance Claim", claim_name):
		frappe.throw(_("Insurance Claim {0} not found").format(claim_name))

	updates = {"status": "Rejected"}
	if remark is not None:
		updates["remark"] = remark
	frappe.db.set_value("Insurance Claim", claim_name, updates, update_modified=True)
	frappe.db.commit()
	return {"name": claim_name, "status": "Rejected"}


def _sync_patient_with_insurance_register(register_name, patient, insurance_provider=None):
	"""Link Patient ↔ Insurance Patient Register and mark patient as insured."""
	if not register_name or not patient:
		frappe.throw(_("Register and Patient are required"))

	if not frappe.db.exists("Insurance Patient Register", register_name):
		frappe.throw(_("Insurance Patient Register {0} not found").format(register_name))
	if not frappe.db.exists("Patient", patient):
		frappe.throw(_("Patient {0} not found").format(patient))

	if not insurance_provider:
		insurance_provider = frappe.db.get_value(
			"Insurance Patient Register", register_name, "insurance_provider"
		)

	register_updates = {"patient": patient, "status": "Active"}
	frappe.db.set_value(
		"Insurance Patient Register",
		register_name,
		register_updates,
		update_modified=True,
	)

	patient_updates = {
		"insurance_register": register_name,
		"is_insurance": 1,
	}
	if insurance_provider:
		patient_updates["insurance"] = insurance_provider

	frappe.db.set_value("Patient", patient, patient_updates, update_modified=True)


@frappe.whitelist()
def create_insurance_patient_register(data):
	"""Portal: create IPR and optionally link an existing patient in one step."""
	data = frappe.parse_json(data) if isinstance(data, str) else (data or {})
	patient = (data.get("patient") or "").strip() or None

	if not (data.get("full_name") or "").strip():
		frappe.throw(_("Full Name is required"))
	if not (data.get("insurance_provider") or "").strip():
		frappe.throw(_("Insurance Provider is required"))

	status = (data.get("status") or "Unused").strip()
	if patient:
		status = "Active"

	doc = frappe.get_doc(
		{
			"doctype": "Insurance Patient Register",
			"full_name": data.get("full_name").strip(),
			"national_id_cpr_no": (data.get("national_id_cpr_no") or "").strip() or None,
			"posting_date": data.get("posting_date") or None,
			"status": status,
			"insurance_provider": data.get("insurance_provider"),
			"approval_id": (data.get("approval_id") or "").strip() or None,
			"approval_validitydays": data.get("approval_validitydays") or None,
			"no_of_visits": (data.get("no_of_visits") or "").strip() or None,
			"patient": patient,
		}
	)
	doc.insert(ignore_permissions=True)

	if patient:
		_sync_patient_with_insurance_register(
			doc.name, patient, doc.insurance_provider
		)

	frappe.db.commit()

	return {
		"name": doc.name,
		"full_name": doc.full_name,
		"insurance_provider": doc.insurance_provider,
		"national_id_cpr_no": doc.national_id_cpr_no,
		"patient": doc.patient,
		"status": doc.status,
		"linked_patient": bool(patient),
	}


@frappe.whitelist()
def update_insurance_patient_register(name, data):
	"""Portal: update editable fields on an Insurance Patient Register."""
	assert_editing_allowed()
	data = frappe.parse_json(data) if isinstance(data, str) else (data or {})
	register_name = (name or data.get("name") or "").strip()
	if not register_name:
		frappe.throw(_("Register name is required"))
	if not frappe.db.exists("Insurance Patient Register", register_name):
		frappe.throw(_("Insurance Patient Register {0} not found").format(register_name))

	if not (data.get("full_name") or "").strip():
		frappe.throw(_("Full Name is required"))
	if not (data.get("insurance_provider") or "").strip():
		frappe.throw(_("Insurance Provider is required"))

	used = frappe.db.get_value(
		"Insurance Patient Register", register_name, "no_of_patient_visit"
	) or 0
	status = (data.get("status") or "Unused").strip()
	no_of_visits = (data.get("no_of_visits") or "").strip() or None

	try:
		if no_of_visits and int(no_of_visits) <= used:
			status = "Exhausted"
		elif status == "Exhausted" and no_of_visits and int(no_of_visits) > used:
			status = "Active"
	except (ValueError, TypeError):
		pass

	updates = {
		"full_name": data.get("full_name").strip(),
		"national_id_cpr_no": (data.get("national_id_cpr_no") or "").strip() or None,
		"posting_date": data.get("posting_date") or None,
		"status": status,
		"insurance_provider": data.get("insurance_provider"),
		"approval_id": (data.get("approval_id") or "").strip() or None,
		"approval_validitydays": data.get("approval_validitydays") or None,
		"no_of_visits": no_of_visits,
	}

	frappe.db.set_value(
		"Insurance Patient Register",
		register_name,
		updates,
		update_modified=True,
	)

	patient = frappe.db.get_value("Insurance Patient Register", register_name, "patient")
	if patient and updates.get("insurance_provider"):
		frappe.db.set_value(
			"Patient",
			patient,
			"insurance",
			updates["insurance_provider"],
			update_modified=True,
		)

	frappe.db.commit()

	row = frappe.db.get_value(
		"Insurance Patient Register",
		register_name,
		[
			"name",
			"full_name",
			"national_id_cpr_no",
			"posting_date",
			"status",
			"insurance_provider",
			"approval_id",
			"approval_validitydays",
			"no_of_visits",
			"patient",
			"no_of_patient_visit",
		],
		as_dict=True,
	)
	return row


@frappe.whitelist()
def link_patient_to_insurance_register(register_name, patient):
	"""Link Patient ↔ Insurance Patient Register (both directions)."""
	_sync_patient_with_insurance_register(register_name, patient)
	frappe.db.commit()
	return {"status": "ok", "register": register_name, "patient": patient}


@frappe.whitelist()
def get_lab_test_samples(search=None):
	"""Get list of Lab Test Samples."""
	filters = {}
	if search:
		filters["sample"] = ["like", f"%{search}%"]

	samples = frappe.get_all(
		"Lab Test Sample",
		filters=filters,
		fields=["name", "sample", "sample_type", "sample_uom"],
		limit=100,
		order_by="sample asc",
	)
	return samples


@frappe.whitelist()
def get_sample_types(search=None):
	"""Get list of Sample Types."""
	filters = {}
	if search:
		filters["sample_type"] = ["like", f"%{search}%"]

	types = frappe.get_all(
		"Sample Type",
		filters=filters,
		fields=["name", "sample_type"],
		limit=100,
		order_by="sample_type asc",
	)
	return types


@frappe.whitelist()
def get_insurance_companies(search=None):
	"""Get list of Insurance Companies for dropdown."""
	filters = {}
	if search:
		filters["name"] = ["like", f"%{search}%"]
	return frappe.get_all(
		"Insurance Company",
		filters=filters,
		fields=["name"],
		limit=50,
		order_by="name asc",
	)


@frappe.whitelist()
def get_health_insurances(search=None, insurance_company=None):
	"""Get list of Health Insurance records."""
	filters = {}
	if search:
		filters["name"] = ["like", f"%{search}%"]
	if insurance_company:
		filters["insurance_company"] = insurance_company

	records = frappe.get_all(
		"Health Insurance",
		filters=filters,
		fields=[
			"name", "insurance_company", "insurance_type", "policy_no",
			"outpatient_discount", "inpatient_discount", "insurance_coverage_",
			"mode_of_payment", "insurance_no",
		],
		limit=100,
		order_by="name asc",
	)
	return records


@frappe.whitelist()
def get_health_insurance_detail(name):
	"""Get full detail of a Health Insurance record including summary counts."""
	doc = frappe.get_doc("Health Insurance", name)
	patient_count = frappe.db.count("Patient", {"insurance": name, "is_insurance": 1})
	active_register_count = frappe.db.count(
		"Insurance Patient Register", {"insurance_provider": name, "status": "Active"}
	)
	unused_register_count = frappe.db.count(
		"Insurance Patient Register", {"insurance_provider": name, "status": "Unused"}
	)
	return {
		"doc": doc.as_dict(),
		"patient_count": patient_count,
		"active_register_count": active_register_count,
		"unused_register_count": unused_register_count,
	}


@frappe.whitelist()
def create_health_insurance(data):
	"""Create a new Health Insurance record."""
	import json as _json
	if isinstance(data, str):
		data = _json.loads(data)
	doc = frappe.new_doc("Health Insurance")
	for key, val in data.items():
		if val is not None and val != "":
			doc.set(key, val)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"name": doc.name}


@frappe.whitelist()
def get_inpatient_packages(search=None):
	"""Fetch Inpatient Package records for dropdown selection."""
	filters = [["active", "=", 1]]
	if search:
		filters.append(["package_name", "like", f"%{search}%"])
	packages = frappe.get_all(
		"Inpatient Package",
		filters=filters,
		fields=["name", "package_name", "package_rate", "no_of_days", "package_category"],
		order_by="package_name asc",
		limit=50,
	)
	return packages


@frappe.whitelist()
def create_insurance_company(company_name):
	"""Create a new Insurance Company."""
	if frappe.db.exists("Insurance Company", company_name):
		frappe.throw(f"Insurance Company '{company_name}' already exists.")
	doc = frappe.new_doc("Insurance Company")
	doc.name1 = company_name
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"name": doc.name}


@frappe.whitelist()
def get_uoms(search=None):
	"""Fetch Lab Test UOM records for dropdown selection."""
	filters = []
	if search:
		filters.append(["name", "like", f"%{search}%"])
	uoms = frappe.get_all(
		"Lab Test UOM",
		filters=filters,
		fields=["name"],
		order_by="name asc",
		limit=50,
	)
	return [{"name": u.name, "label": u.name} for u in uoms]


@frappe.whitelist()
def get_standard_uoms(search=None):
	"""Fetch standard UOM records (Item UOM) for medication and inventory use."""
	filters = []
	if search:
		filters.append(["name", "like", f"%{search}%"])
	uoms = frappe.get_all(
		"UOM",
		filters=filters,
		fields=["name"],
		order_by="name asc",
		limit=50,
	)
	return [{"name": u.name, "label": u.name} for u in uoms]


@frappe.whitelist()
def create_uom(uom_name):
	"""Create a new Lab Test UOM record."""
	uom_name = (uom_name or "").strip()
	if not uom_name:
		frappe.throw("UOM name is required.")
	if frappe.db.exists("Lab Test UOM", uom_name):
		frappe.throw(f"Lab Test UOM '{uom_name}' already exists.")
	doc = frappe.new_doc("Lab Test UOM")
	doc.lab_test_uom = uom_name
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"name": doc.name, "label": doc.name}


@frappe.whitelist()
def create_item_group(group_name):
	"""Create a new Item Group under All Item Groups."""
	group_name = (group_name or "").strip()
	if not group_name:
		frappe.throw("Item Group name is required.")
	if frappe.db.exists("Item Group", group_name):
		frappe.throw(f"Item Group '{group_name}' already exists.")
	doc = frappe.new_doc("Item Group")
	doc.item_group_name = group_name
	doc.parent_item_group = "All Item Groups"
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"name": doc.name, "label": doc.name}


@frappe.whitelist()
def get_colors(search=None):
	"""Fetch Color records for dropdown selection."""
	filters = []
	if search:
		filters.append(["name", "like", f"%{search}%"])
	colors = frappe.get_all(
		"Color",
		filters=filters,
		fields=["name"],
		order_by="name asc",
		limit=50,
	)
	return [{"name": c.name, "label": c.name} for c in colors]


@frappe.whitelist()
def create_color(color_name):
	"""Create a new Color record."""
	color_name = (color_name or "").strip()
	if not color_name:
		frappe.throw("Color name is required.")
	if frappe.db.exists("Color", color_name):
		frappe.throw(f"Color '{color_name}' already exists.")
	doc = frappe.new_doc("Color")
	doc.name = color_name
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"name": doc.name, "label": doc.name}


@frappe.whitelist()
def create_sample_type(type_name):
	"""Create a new Sample Type record."""
	type_name = (type_name or "").strip()
	if not type_name:
		frappe.throw("Sample Type name is required.")
	if frappe.db.exists("Sample Type", type_name):
		frappe.throw(f"Sample Type '{type_name}' already exists.")
	doc = frappe.new_doc("Sample Type")
	doc.sample_type = type_name
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"name": doc.name, "label": doc.name}


@frappe.whitelist()
def get_sample_collections(search=None, patient=None, page=1, page_size=20):
	"""
	Fetch Sample Collection records with linked lab tests and sample type.
	
	Args:
		search (str, optional): Search by Sample Collection name
		patient (str, optional): Filter by patient
		page (int, optional): Page number for pagination (default: 1)
		page_size (int, optional): Records per page (default: 20)
	
	Returns:
		list: List of Sample Collection records with enriched data
	"""
	try:
		# Validate inputs
		page = int(page) if page else 1
		page_size = int(page_size) if page_size else 20
		
		if page < 1:
			page = 1
		if page_size < 1:
			page_size = 20

		# Build filters
		filters = {}
		if search:
			filters["name"] = ["like", f"%{search}%"]
		if patient:
			filters["patient"] = patient

		# Fetch Sample Collections
		collections = frappe.get_all(
			"Sample Collection",
			filters=filters,
			fields=[
				"name",
				"patient",
				"patient_name",
				"patient_age",
				"sample",
				"sample_uom",
				"owner",
				"creation",
				"status"
			],
			order_by="creation desc",
			limit_page_length=page_size,
			limit_start=(page - 1) * page_size,
		)

		# Enrich each collection record
		for col in collections:
			# Get sample type from the linked Lab Test Sample record
			col["sample_type"] = None
			if col.get("sample"):
				try:
					col["sample_type"] = frappe.db.get_value(
						"Lab Test Sample",
						col["sample"],
						"sample_type"
					)
				except frappe.DoesNotExistError:
					col["sample_type"] = None

			# Get collector display name from the document owner
			col["collected_by"] = col.get("owner")
			col["collector_name"] = None
			if col.get("owner"):
				try:
					full_name = frappe.db.get_value(
						"User",
						col["owner"],
						"full_name"
					)
					col["collector_name"] = full_name or col["owner"]
				except frappe.DoesNotExistError:
					col["collector_name"] = col["owner"]

			# Get collected time from creation time
			col["collected_time"] = col.get("creation")

			# Get Lab Tests that have this Sample Collection in their sample_instances child table
			# Lab Test.sample_instances.sample_collection → Sample Collection.name
			try:
				lab_tests = frappe.db.sql(
					"""
					SELECT DISTINCT lt.name, lt.lab_test_name, lt.patient_name
					FROM `tabLab Test` lt
					INNER JOIN `tabLab Test Sample Instance` ltsi 
						ON ltsi.parent = lt.name
					WHERE ltsi.sample_collection = %s
					LIMIT 5
					""",
					(col["name"],),
					as_dict=True
				)
				col["lab_tests"] = lab_tests or []
			except Exception as e:
				frappe.logger().warning(f"Error fetching lab tests for {col['name']}: {str(e)}")
				col["lab_tests"] = []
		return {
			"success": True,
			"data": collections,
			"page": page,
			"page_size": page_size,
			"total": len(collections)
		}

	except Exception as e:
		frappe.logger().error(f"Error in get_sample_collections: {str(e)}")
		return {
			"success": False,
			"message": str(e),
			"data": []
		}


@frappe.whitelist()
def get_sample_collection_detail(name):
	"""
	Fetch detailed information about a specific Sample Collection.
	
	Args:
		name (str): Sample Collection document name
	
	Returns:
		dict: Detailed Sample Collection data
	"""
	try:
		# Check if document exists
		if not frappe.db.exists("Sample Collection", name):
			return {
				"success": False,
				"message": _("Sample Collection not found"),
				"data": None
			}

		# Fetch the full document
		doc = frappe.get_doc("Sample Collection", name)

		# Build response
		data = {
			"name": doc.name,
			"patient": doc.patient,
			"patient_name": doc.patient_name,
			"patient_age": doc.patient_age,
			"sample": doc.sample,
			"sample_uom": doc.sample_uom,
			"status": doc.status,
			"owner": doc.owner,
			"creation": doc.creation,
			"modified": doc.modified,
			"sample_type": None,
			"collected_by": doc.owner,
			"collector_name": None,
			"collected_time": doc.creation,
			"lab_tests": []
		}

		# Get sample type
		if doc.sample:
			try:
				data["sample_type"] = frappe.db.get_value(
					"Lab Test Sample",
					doc.sample,
					"sample_type"
				)
			except frappe.DoesNotExistError:
				data["sample_type"] = None

		# Get collector name
		if doc.owner:
			try:
				full_name = frappe.db.get_value("User", doc.owner, "full_name")
				data["collector_name"] = full_name or doc.owner
			except frappe.DoesNotExistError:
				data["collector_name"] = doc.owner

		# Get linked lab tests
		try:
			lab_tests = frappe.db.sql(
				"""
				SELECT DISTINCT lt.name, lt.lab_test_name, lt.patient_name, ltsi.sample_collection
				FROM `tabLab Test` lt
				INNER JOIN `tabLab Test Sample Instance` ltsi 
					ON ltsi.parent = lt.name
				WHERE ltsi.sample_collection = %s
				""",
				(doc.name,),
				as_dict=True
			)
			data["lab_tests"] = lab_tests or []
		except Exception as e:
			frappe.logger().warning(f"Error fetching lab tests for {doc.name}: {str(e)}")
			data["lab_tests"] = []

		return {
			"success": True,
			"data": data
		}

	except Exception as e:
		frappe.logger().error(f"Error in get_sample_collection_detail: {str(e)}")
		return {
			"success": False,
			"message": str(e),
			"data": None
		}


@frappe.whitelist()
def get_sample_collections_by_patient(patient, page=1, page_size=20):
	"""
	Fetch Sample Collections for a specific patient.
	
	Args:
		patient (str): Patient name/ID
		page (int, optional): Page number for pagination
		page_size (int, optional): Records per page
	
	Returns:
		dict: Sample Collections for the patient
	"""
	try:
		# Validate patient exists
		if not frappe.db.exists("Patient", patient):
			return {
				"success": False,
				"message": _("Patient not found"),
				"data": []
			}

		# Reuse the main function with patient filter
		result = get_sample_collections(
			search=None,
			patient=patient,
			page=page,
			page_size=page_size
		)
		
		return result

	except Exception as e:
		frappe.logger().error(f"Error in get_sample_collections_by_patient: {str(e)}")
		return {
			"success": False,
			"message": str(e),
			"data": []
		}


@frappe.whitelist()
def get_sample_collection_statistics(patient=None):
	"""
	Get statistics about Sample Collections.
	
	Args:
		patient (str, optional): Filter by patient
	
	Returns:
		dict: Statistics about sample collections
	"""
	try:
		filters = {}
		if patient:
			filters["patient"] = patient

		# Get total count
		total = frappe.db.count("Sample Collection", filters=filters)

		# Get count by status
		status_counts = frappe.db.sql(
			"""
			SELECT status, COUNT(*) as count
			FROM `tabSample Collection`
			{}
			GROUP BY status
			""".format(
				"WHERE patient = %s" if patient else ""
			),
			(patient,) if patient else (),
			as_dict=True
		)

		# Get recent collections (last 7 days)
		recent_count = frappe.db.count(
			"Sample Collection",
			filters={
				**filters,
				"creation": [">=", frappe.utils.add_days(frappe.utils.today(), -7)]
			}
		)

		return {
			"success": True,
			"data": {
				"total": total,
				"recent_7_days": recent_count,
				"by_status": {item["status"]: item["count"] for item in status_counts}
			}
		}

	except Exception as e:
		frappe.logger().error(f"Error in get_sample_collection_statistics: {str(e)}")
		return {
			"success": False,
			"message": str(e),
			"data": None
		}


NURSING_PORTAL_READ_ROLES = frozenset(
	{
		"Administrator",
		"System Manager",
		"Healthcare Administrator",
		"Doctor",
		"Nurse",
		"Nursing User",
		"Physician",
		"Psychologist",
		"Anesthesiologist",
		"Therapist",
		"Nutritionist",
	}
)


def _user_can_read_nursing_portal() -> bool:
	if frappe.session.user in ("Guest", ""):
		return False
	return bool(NURSING_PORTAL_READ_ROLES & set(frappe.get_roles(frappe.session.user)))


def _owner_filter_for_practitioner(practitioner: str | None) -> str | None:
	if not practitioner:
		return None
	return frappe.db.get_value("Healthcare Practitioner", practitioner, "user_id")


@frappe.whitelist()
def get_grooming_charts(
	search=None,
	patient=None,
	date_from=None,
	date_to=None,
	practitioner=None,
	page=1,
	page_size=20,
):
	"""Fetch IP Grooming Chart records."""
	try:
		page = frappe.utils.cint(page) or 1
		page_size = frappe.utils.cint(page_size) or 20
		portal_reader = _user_can_read_nursing_portal()
		has_read = frappe.has_permission("IP Grooming Chart", "read")

		filters = {}
		if patient:
			filters["file_no"] = patient
		if search:
			filters["patient_name"] = ["like", f"%{search}%"]
		if date_from and date_to:
			filters["date"] = ["between", [date_from, date_to]]
		elif date_from:
			filters["date"] = [">=", date_from]
		elif date_to:
			filters["date"] = ["<=", date_to]
		owner_user = _owner_filter_for_practitioner(practitioner)
		if owner_user:
			filters["owner"] = owner_user

		charts = frappe.get_all(
			"IP Grooming Chart",
			filters=filters,
			fields=[
				"name", "date", "admission_no", "file_no", "patient_name", "cost_center",
				"brush_teeth_morning", "change_clothes_morning", "brush_teeth_noon",
				"change_clothes_noon", "shower", "bowel", "bed_wetting",
				"breakfast", "snack_1", "lunch", "snack_2", "dinner", "snack_3",
				"weight", "lmp", "creation", "modified", "owner"
			],
			order_by="date desc, creation desc",
			limit_page_length=page_size,
			limit_start=(page - 1) * page_size,
			ignore_permissions=portal_reader and not has_read,
		)
		total = frappe.db.count("IP Grooming Chart", filters=filters)
		return {"success": True, "data": charts, "page": page, "page_size": page_size, "total": total}
	except Exception as e:
		frappe.logger().error(f"Error in get_grooming_charts: {str(e)}")
		return {"success": False, "message": str(e), "data": []}


@frappe.whitelist()
def get_grooming_chart(name=None):
	"""Return one IP Grooming Chart for the healthcare portal."""
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Grooming Chart is required"))
	if not frappe.db.exists("IP Grooming Chart", name):
		frappe.throw(_("Grooming Chart {0} not found").format(name))

	doc = frappe.get_doc("IP Grooming Chart", name)
	if not frappe.has_permission("IP Grooming Chart", "read", doc=doc):
		if not _user_can_read_nursing_portal():
			frappe.throw(_("Not permitted to read Grooming Chart"), frappe.PermissionError)
	return doc.as_dict()


@frappe.whitelist()
def create_grooming_chart(data):
	"""Create a new IP Grooming Chart record."""
	try:
		if isinstance(data, str):
			data = frappe.parse_json(data)

		doc = frappe.new_doc("IP Grooming Chart")
		doc.trans_num = (data.get("trans_num") or "").strip() or get_next_transaction_number(
			"IP Grooming Chart", fieldname="trans_num"
		)
		allowed_fields = [
			"date", "admission_no", "file_no", "patient_name", "cost_center", "trans_num",
			"brush_teeth_morning", "change_clothes_morning", "brush_teeth_noon",
			"change_clothes_noon", "shower", "bowel", "bed_wetting",
			"breakfast", "snack_1", "lunch", "snack_2", "dinner", "snack_3",
			"weight", "lmp","fluid_intake", "fluid_output",
		]
		for field in allowed_fields:
			if field in data:
				setattr(doc, field, data[field])
		doc.insert(ignore_permissions=True)
		frappe.db.commit()
		return {"success": True, "name": doc.name}
	except Exception as e:
		frappe.logger().error(f"Error creating grooming chart: {str(e)}")
		return {"success": False, "message": str(e)}


@frappe.whitelist()
def get_next_ip_grooming_chart_trans_num():
	"""Preview next trans_num for IP Grooming Chart."""
	return get_next_transaction_number("IP Grooming Chart", fieldname="trans_num")


@frappe.whitelist()
def get_main_nursing_notes(
	search=None,
	patient=None,
	admission=None,
	date_from=None,
	date_to=None,
	practitioner=None,
	shift=None,
	page=1,
	page_size=50,
):
	"""Fetch Main Nursing Note records for the portal."""
	try:
		page = frappe.utils.cint(page) or 1
		page_size = frappe.utils.cint(page_size) or 50
		filters = {}
		if patient:
			filters["file_no"] = patient
		if admission:
			filters["admission"] = admission
		if search:
			filters["patient_name"] = ["like", f"%{search}%"]
		if date_from and date_to:
			filters["date"] = ["between", [date_from, date_to]]
		elif date_from:
			filters["date"] = [">=", date_from]
		elif date_to:
			filters["date"] = ["<=", date_to]
		if practitioner:
			user_id = frappe.db.get_value("Healthcare Practitioner", practitioner, "user_id")
			if user_id:
				filters["user"] = user_id
		if shift:
			filters["shift"] = shift

		records = frappe.get_all(
			"Main Nursing Note",
			filters=filters,
			fields=[
				"name",
				"trans_no",
				"admission",
				"file_no",
				"patient_name",
				"date",
				"data",
				"shift",
				"nursing_notes",
				"user",
				"user_name",
				"cost_center",
				"creation",
				"modified",
			],
			order_by="date desc, creation desc",
			limit_page_length=page_size,
			limit_start=(page - 1) * page_size,
		)
		total = frappe.db.count("Main Nursing Note", filters=filters)
		return {"success": True, "data": records, "page": page, "page_size": page_size, "total": total}
	except Exception as e:
		frappe.logger().error(f"Error in get_main_nursing_notes: {str(e)}")
		return {"success": False, "message": str(e), "data": []}


@frappe.whitelist()
def get_next_main_nursing_note_trans_no():
	"""Preview next trans_no for Main Nursing Note (same sequence helper as other doctypes)."""
	return get_next_transaction_number("Main Nursing Note", fieldname="trans_no")


def _nursing_note_time_label(time_value=None):
	"""Format a Time/datetime value as HH:MM for nursing note lines."""
	if time_value:
		value = str(time_value).strip()
		if " " in value:
			value = value.split(" ")[-1]
		if "." in value:
			value = value.split(".")[0]
		parts = value.split(":")
		if len(parts) >= 2:
			return f"{parts[0].zfill(2)}:{parts[1].zfill(2)}"
	return frappe.utils.now_datetime().strftime("%H:%M")


def _append_nursing_note_line(existing, new_text, time_value=None):
	new_text = (new_text or "").strip()
	if not new_text:
		return (existing or "").strip()
	line = f"[{_nursing_note_time_label(time_value)}] {new_text}"
	base = (existing or "").strip()
	return f"{base}\n{line}" if base else line


@frappe.whitelist()
def create_main_nursing_note(data):
	"""Create a Main Nursing Note (portal — not Clinical Note)."""
	try:
		if isinstance(data, str):
			data = frappe.parse_json(data)
		data = data or {}

		# trans_no is server-assigned only (autoname: field:trans_no)
		data.pop("trans_no", None)
		data.pop("name", None)

		shift = (data.get("shift") or "").strip()
		if shift not in ("Morning", "Evening", "Night"):
			return {"success": False, "message": "Nursing shift is required (Morning, Evening, or Night)"}

		trans_no = get_next_transaction_number("Main Nursing Note", fieldname="trans_no")

		nursing_notes = data.get("nursing_notes")
		if nursing_notes:
			nursing_notes = _append_nursing_note_line("", nursing_notes, data.get("data"))

		doc = frappe.get_doc(
			{
				"doctype": "Main Nursing Note",
				"trans_no": trans_no,
				"admission": data.get("admission"),
				"file_no": data.get("file_no"),
				"patient_name": data.get("patient_name"),
				"date": data.get("date"),
				"data": data.get("data"),
				"shift": shift,
				"nursing_notes": nursing_notes,
				"user": data.get("user") or frappe.session.user,
				"user_name": data.get("user_name"),
				"cost_center": data.get("cost_center"),
				"admission_old_no": data.get("admission_old_no"),
			}
		)

		if not doc.get("user_name") and doc.user:
			doc.user_name = frappe.db.get_value("User", doc.user, "full_name") or doc.user

		if doc.get("admission") and not doc.get("file_no"):
			admission_patient = frappe.db.get_value(
				"Inpatient Admission", doc.admission, "patient"
			)
			if admission_patient:
				doc.file_no = admission_patient
				if not doc.get("patient_name"):
					doc.patient_name = frappe.db.get_value(
						"Patient", admission_patient, "patient_name"
					)

		if doc.get("admission") and not doc.get("cost_center"):
			admission_cc = frappe.db.get_value(
				"Inpatient Admission", doc.admission, "cost_center"
			)
			if admission_cc:
				doc.cost_center = admission_cc

		doc.insert(ignore_permissions=True)
		frappe.db.commit()
		return {"success": True, "name": doc.name, "trans_no": doc.trans_no}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "create_main_nursing_note")
		return {"success": False, "message": str(e)}


@frappe.whitelist()
def update_main_nursing_note(data):
	"""Update an existing Main Nursing Note — edit full text and/or append a timestamped line."""
	assert_editing_allowed()
	try:
		if isinstance(data, str):
			data = frappe.parse_json(data)
		data = data or {}

		name = data.get("name")
		if not name:
			return {"success": False, "message": "Nursing note name is required"}

		doc = frappe.get_doc("Main Nursing Note", name)
		from healthcare.healthcare.doctype.main_nursing_note.main_nursing_note import (
			assert_main_nursing_note_editable,
		)

		assert_main_nursing_note_editable(doc)
		append_notes = (data.get("append_notes") or "").strip()
		replace_notes = frappe.utils.cint(data.get("replace_notes"))

		if replace_notes or (data.get("nursing_notes") is not None and not append_notes):
			doc.nursing_notes = (data.get("nursing_notes") or "").strip()
		elif append_notes:
			doc.nursing_notes = _append_nursing_note_line(
				doc.nursing_notes,
				append_notes,
				data.get("time") or data.get("data"),
			)
		else:
			return {"success": False, "message": "Enter nursing notes to save"}

		doc.save(ignore_permissions=True)
		frappe.db.commit()
		return {
			"success": True,
			"name": doc.name,
			"nursing_notes": doc.nursing_notes,
		}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "update_main_nursing_note")
		return {"success": False, "message": str(e)}


@frappe.whitelist()
def get_branches(search=None):
	"""Fetch Branch records."""
	filters = {}
	if search:
		filters["name"] = ["like", f"%{search}%"]
	branches = frappe.get_all("Cost Center", filters=filters, fields=["name"], order_by="name asc", limit=50)
	return [{"name": b.name, "label": b.name} for b in branches]


@frappe.whitelist()
def get_mental_states(
	search=None,
	patient=None,
	date_from=None,
	date_to=None,
	practitioner=None,
	page=1,
	page_size=20,
):
	"""Fetch Mental State records."""
	try:
		page = frappe.utils.cint(page) or 1
		page_size = frappe.utils.cint(page_size) or 20
		portal_reader = _user_can_read_nursing_portal()
		has_read = frappe.has_permission("Mental State", "read")

		filters = {}
		if patient:
			filters["file_no"] = patient
		if search:
			filters["patient_name"] = ["like", f"%{search}%"]
		if date_from and date_to:
			filters["creation"] = ["between", [date_from, f"{date_to} 23:59:59"]]
		elif date_from:
			filters["creation"] = [">=", date_from]
		elif date_to:
			filters["creation"] = ["<=", f"{date_to} 23:59:59"]
		owner_user = _owner_filter_for_practitioner(practitioner)
		if owner_user:
			filters["owner"] = owner_user

		records = frappe.get_all(
			"Mental State",
			filters=filters,
			fields=[
				"name", "admission_no", "file_no", "patient_name", "branch", "trans_shift",
				"normal_at",
				"cooperative", "aggressive", "paranoid", "demanding", "preoccupied",
				"defence", "impulsive", "sedative",
				"normal_s", "rapid", "slow", "poor_sp", "slurred", "coherent",
				"incoherent", "talkative", "anxious", "angry", "depressed", "elated",
				"euthymic", "irritable", "twitches", "hyperactive", "stereotypes",
				"restless", "gait", "tics", "agitated", "abnormal", "hallucinatory_behaviour", "normal",
				"place", "time", "normal_ap", "person",
				"increased", "poor_ap", "reported", "non_reported", "normal_b", "reported_type",
				"sleep_duration", "normal_sleep", "disturbed", "intermittent",
				"excessive", "a_little",
				"conscious", "alert", "disturbed_con",
				"delusion", "dellusion", "perception", "remark",
				"creation", "modified", "owner"
			],
			order_by="creation desc",
			limit_page_length=page_size,
			limit_start=(page - 1) * page_size,
			ignore_permissions=portal_reader and not has_read,
		)
		total = frappe.db.count("Mental State", filters=filters)
		return {"success": True, "data": records, "page": page, "page_size": page_size, "total": total}
	except Exception as e:
		frappe.logger().error(f"Error in get_mental_states: {str(e)}")
		return {"success": False, "message": str(e), "data": []}


@frappe.whitelist()
def get_mental_state(name=None):
	"""Return one Mental State for the healthcare portal."""
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Mental State is required"))
	if not frappe.db.exists("Mental State", name):
		frappe.throw(_("Mental State {0} not found").format(name))

	doc = frappe.get_doc("Mental State", name)
	if not frappe.has_permission("Mental State", "read", doc=doc):
		if not _user_can_read_nursing_portal():
			frappe.throw(_("Not permitted to read Mental State"), frappe.PermissionError)
	return doc.as_dict()


@frappe.whitelist()
def create_mental_state(data):
	"""Create a new Mental State record."""
	try:
		if isinstance(data, str):
			data = frappe.parse_json(data)

		doc = frappe.new_doc("Mental State")
		allowed_fields = [
			"admission_no", "file_no", "patient_name", "branch", "trans_shift",
			"normal_at",
			"cooperative", "aggressive", "paranoid", "demanding", "preoccupied",
			"defence", "impulsive", "sedative", "dellusion",
			"normal_s", "rapid", "slow", "poor_sp", "slurred", "coherent",
			"incoherent", "talkative", "anxious", "angry", "depressed", "elated",
			"euthymic", "irritable", "twitches", "hyperactive", "stereotypes",
			"restless", "gait", "tics", "agitated", "abnormal", "hallucinatory_behaviour", "normal",
			"place", "time", "normal_ap", "person",
			"increased", "poor_ap", "reported", "non_reported", "normal_b", "reported_type",
			"sleep_duration", "normal_sleep", "disturbed", "intermittent",
			"excessive", "a_little",
			"conscious", "alert", "disturbed_con", "delusion", "perception", "remark"
		]
		for field in allowed_fields:
			if field in data:
				setattr(doc, field, data[field])
		doc.insert(ignore_permissions=True)
		frappe.db.commit()
		return {"success": True, "name": doc.name}
	except Exception as e:
		frappe.logger().error(f"Error creating mental state: {str(e)}")
		return {"success": False, "message": str(e)}


@frappe.whitelist()
def get_sick_leaves(
	search=None,
	patient=None,
	date_from=None,
	date_to=None,
	doctor=None,
	page=1,
	page_size=20,
):
	"""Fetch Sick Leave records."""
	try:
		page = frappe.utils.cint(page) or 1
		page_size = frappe.utils.cint(page_size) or 20
		portal_reader = _user_can_read_nursing_portal()
		has_read = frappe.has_permission("Sick Leave", "read")

		filters = {}
		if patient:
			filters["patient"] = patient
		if search:
			filters["patient_name"] = ["like", f"%{search}%"]
		if date_from and date_to:
			filters["from_date"] = ["between", [date_from, date_to]]
		elif date_from:
			filters["from_date"] = [">=", date_from]
		elif date_to:
			filters["from_date"] = ["<=", date_to]
		if doctor:
			filters["doctor"] = doctor

		list_kwargs = {
			"filters": filters,
			"fields": [
				"name", "admission_no", "patient", "patient_name",
				"from_date", "to_date", "days", "diagnosis", "doctor", "source",
				"creation",
			],
			"order_by": "creation desc",
			"limit_page_length": page_size,
			"limit_start": (page - 1) * page_size,
		}
		if portal_reader and not has_read:
			list_kwargs["ignore_permissions"] = True

		records = frappe.get_all("Sick Leave", **list_kwargs)
		total = frappe.db.count("Sick Leave", filters=filters)
		return {"success": True, "data": records, "page": page, "page_size": page_size, "total": total}
	except Exception as e:
		frappe.logger().error(f"Error in get_sick_leaves: {str(e)}")
		return {"success": False, "message": str(e), "data": []}


@frappe.whitelist()
def create_sick_leave(data):
	"""Create a new Sick Leave record."""
	try:
		if isinstance(data, str):
			data = frappe.parse_json(data)

		doc = frappe.new_doc("Sick Leave")
		allowed_fields = [
			"admission_no", "patient", "patient_name",
			"from_date", "to_date", "days", "diagnosis", "doctor", "source",
		]
		for field in allowed_fields:
			if field in data:
				setattr(doc, field, data[field])
		doc.insert(ignore_permissions=True)
		frappe.db.commit()
		return {"success": True, "name": doc.name}
	except Exception as e:
		frappe.logger().error(f"Error creating sick leave: {str(e)}")
		return {"success": False, "message": str(e)}


@frappe.whitelist()
def get_employees(search=None):
	"""Fetch Employee records for nurse/staff assignment dropdowns."""
	filters = {"status": "Active"}
	if search:
		filters["employee_name"] = ["like", f"%{search}%"]
	employees = frappe.get_all(
		"Employee",
		filters=filters,
		fields=["name", "employee_name", "designation", "department"],
		order_by="employee_name asc",
		limit=50,
	)
	return [
		{
			"name": e.name,
			"label": e.employee_name or e.name,
			"designation": e.designation or "",
			"department": e.department or "",
		}
		for e in employees
	]


@frappe.whitelist()
def get_patient_assessments(
	patient=None,
	search=None,
	assessment_template=None,
	date_from=None,
	date_to=None,
	practitioner=None,
	page=1,
	page_size=20,
):
	"""Fetch Patient Assessment records."""
	try:
		page = frappe.utils.cint(page) or 1
		page_size = frappe.utils.cint(page_size) or 20
		filters = {}
		if patient:
			filters["patient"] = patient
		if search:
			filters["patient_name"] = ["like", f"%{search}%"]
		if assessment_template:
			filters["assessment_template"] = assessment_template
		if date_from and date_to:
			filters["assessment_datetime"] = ["between", [date_from, date_to]]
		elif date_from:
			filters["assessment_datetime"] = [">=", date_from]
		elif date_to:
			filters["assessment_datetime"] = ["<=", date_to]
		if practitioner:
			filters["healthcare_practitioner"] = practitioner

		records = frappe.get_all(
			"Patient Assessment",
			filters=filters,
			fields=[
				"name", "patient", "patient_name", "assessment_template",
				"reference_type", "encounter", "healthcare_practitioner",
				"assessment_datetime", "assessment_description",
				"total_score", "total_score_obtained", "docstatus", "creation",
			],
			order_by="creation desc",
			limit_page_length=page_size,
			limit_start=(page - 1) * page_size,
		)
		total = frappe.db.count("Patient Assessment", filters=filters)
		return {"success": True, "data": records, "page": page, "page_size": page_size, "total": total}
	except Exception as e:
		frappe.logger().error(f"Error in get_patient_assessments: {str(e)}")
		return {"success": False, "message": str(e), "data": []}


PATIENT_ASSESSMENT_PORTAL_READ_ROLES = frozenset(
	{
		"Administrator",
		"System Manager",
		"Healthcare Administrator",
		"Doctor",
		"Nurse",
		"Nursing User",
		"Physician",
		"Psychologist",
		"Anesthesiologist",
		"Therapist",
		"Nutritionist",
	}
)


def _user_can_read_patient_assessment_portal() -> bool:
	if frappe.session.user in ("Guest", ""):
		return False
	return bool(PATIENT_ASSESSMENT_PORTAL_READ_ROLES & set(frappe.get_roles(frappe.session.user)))


def _serialize_patient_assessment(doc) -> dict:
	row = doc.as_dict()
	if row.get("patient") and not row.get("patient_name"):
		row["patient_name"] = frappe.db.get_value("Patient", row["patient"], "patient_name")
	if row.get("healthcare_practitioner") and not row.get("practitioner_name"):
		row["practitioner_name"] = frappe.db.get_value(
			"Healthcare Practitioner",
			row["healthcare_practitioner"],
			"practitioner_name",
		)
	sheet = []
	for line in doc.get("assessment_sheet") or []:
		param = line.parameter
		param_label = (
			frappe.db.get_value("Patient Assessment Parameter", param, "assessment_parameter")
			if param
			else None
		) or param
		sheet.append(
			{
				"parameter": param,
				"parameter_label": param_label,
				"score": line.score,
				"time": line.time,
				"comments": line.comments,
				"yes": line.yes,
			}
		)
	row["assessment_sheet"] = sheet
	return row


@frappe.whitelist()
def get_patient_assessment(name=None):
	"""Return one Patient Assessment for the healthcare portal (avoids REST DocPerm gaps)."""
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Patient Assessment is required"))

	if not frappe.db.exists("Patient Assessment", name):
		frappe.throw(_("Patient Assessment {0} not found").format(name))

	doc = frappe.get_doc("Patient Assessment", name)

	if not frappe.has_permission("Patient Assessment", "read", doc=doc):
		if not _user_can_read_patient_assessment_portal():
			frappe.throw(
				_("Not permitted to read Patient Assessment"),
				frappe.PermissionError,
			)

	return _serialize_patient_assessment(doc)


@frappe.whitelist()
def create_patient_assessment(data):
	"""Create a new Patient Assessment record.

	If assessment_sheet rows are provided in data, they are used directly.
	Otherwise, if assessment_template is set, the sheet is auto-populated from the template.
	"""
	try:
		if isinstance(data, str):
			data = frappe.parse_json(data)
		doc = frappe.new_doc("Patient Assessment")
		doc.naming_series = "HLC-PA-.YYYY.-"
		for field in [
			"patient", "patient_name", "assessment_template",
			"reference_type", "encounter", "healthcare_practitioner",
			"assessment_datetime", "assessment_description",
			"company", "therapy_session", "family_history",
		]:
			if data.get(field):
				setattr(doc, field, data[field])

		sheet_rows = data.get("assessment_sheet") or []
		template_name = data.get("assessment_template")

		if sheet_rows:
			# Use rows supplied from the frontend (may have scores, times, comments)
			for row in sheet_rows:
				doc.append("assessment_sheet", {
					"parameter": row.get("parameter"),
					"score": 0,
					"time": row.get("time") or None,
					"comments": row.get("comments") or "",
					"yes": row.get("yes") or 0,
				})
		elif template_name:
			# Fall back: auto-populate from template with zero scores
			try:
				tmpl = frappe.get_doc("Patient Assessment Template", template_name)
				doc.scale_min = tmpl.scale_min
				doc.scale_max = tmpl.scale_max
				for p in (tmpl.parameters or []):
					doc.append("assessment_sheet", {
						"parameter": p.assessment_parameter,
						"score": 0,
					})
			except Exception:
				pass

		doc.insert(ignore_permissions=True)
		frappe.db.commit()
		return {"success": True, "name": doc.name}
	except Exception as e:
		frappe.logger().error(f"Error creating patient assessment: {str(e)}")
		return {"success": False, "message": str(e)}


@frappe.whitelist()
def get_default_patient_assessment_template():
	"""Return the default Patient Assessment Template for the portal."""
	template_name = (
		frappe.db.get_value("Patient Assessment Template", {"default": 1}, "name")
		or frappe.db.get_value(
			"Patient Assessment Template",
			{"assessment_name": "Default Patient Evaluation"},
			"name",
		)
	)
	if not template_name:
		return None
	assessment_name = frappe.db.get_value(
		"Patient Assessment Template", template_name, "assessment_name"
	)
	return {"name": template_name, "label": assessment_name or template_name}


@frappe.whitelist()
def get_patient_assessment_templates(search=None):
	"""Return Patient Assessment Template names for the combobox."""
	filters = {}
	if search:
		filters["assessment_name"] = ["like", f"%{search}%"]
	rows = frappe.get_all(
		"Patient Assessment Template",
		filters=filters,
		fields=["name", "assessment_name"],
		order_by="assessment_name asc",
		limit=50,
	)
	return [{"name": r.name, "label": r.assessment_name or r.name} for r in rows]


@frappe.whitelist()
def get_assessment_template_parameters(template_name):
	"""Return the parameter list for a Patient Assessment Template.

	Used by the frontend to pre-fill the Assessment Sheet tab when a template is selected.
	Returns list of {parameter, parameter_label, scale_min, scale_max}.
	"""
	if not template_name:
		return []
	try:
		tmpl = frappe.get_doc("Patient Assessment Template", template_name)
		params = []
		for p in (tmpl.parameters or []):
			params.append({
				"parameter": p.assessment_parameter,
				"parameter_label": p.assessment_parameter,
			})
		return {
			"parameters": params,
			"scale_min": tmpl.scale_min or 0,
			"scale_max": tmpl.scale_max or 100,
		}
	except Exception as e:
		frappe.logger().error(f"get_assessment_template_parameters error: {e}")
		return {"parameters": [], "scale_min": 0, "scale_max": 100}


@frappe.whitelist()
def get_assessment_parameters(search=None):
	"""Return all Patient Assessment Parameter records for the dropdown combobox."""
	filters = {}
	if search:
		filters["assessment_parameter"] = ["like", f"%{search}%"]
	rows = frappe.get_all(
		"Patient Assessment Parameter",
		filters=filters,
		fields=["name", "assessment_parameter"],
		order_by="assessment_parameter asc",
		limit=100,
	)


# ─────────────────────────────────────────────────────────────────
# Patient Referral
# ─────────────────────────────────────────────────────────────────

@frappe.whitelist()
def create_patient_referral(
	patient,
	referral_date,
	referred_to_hospital,
	reason_for_referral,
	referred_from_doctype=None,
	referred_from_docname=None,
	referred_to_doctor=None,
	referred_to_address=None,
	referred_to_contact=None,
	referral_status="Pending",
	notes=None,
	company=None,
	cost_center=None,
	referral_doctor=None,
):
	"""Create a Patient Referral and update the source document's status to 'External Referral'."""
	doc = frappe.new_doc("Patient Referral")
	doc.patient = patient
	doc.referral_date = referral_date
	doc.referred_to_hospital = referred_to_hospital
	doc.reason_for_referral = reason_for_referral
	doc.referred_from_doctype = referred_from_doctype or None
	doc.referred_from_docname = referred_from_docname or None
	doc.referred_to_doctor = referred_to_doctor
	doc.referred_to_address = referred_to_address
	doc.referred_to_contact = referred_to_contact
	doc.referral_status = referral_status
	doc.notes = notes
	if company:
		doc.company = company
	if cost_center:
		doc.cost_center = cost_center
	if referral_doctor:
		doc.referral_doctor = referral_doctor
	doc.insert(ignore_permissions=True)

	# Update source document status to External Referral
	if referred_from_doctype and referred_from_docname:
		try:
			if referred_from_doctype == "Patient Visit":
				frappe.db.set_value("Patient Visit", referred_from_docname, "status", "External Referral")
			elif referred_from_doctype == "Inpatient Admission":
				frappe.db.set_value("Inpatient Admission", referred_from_docname, "status", "External Referral")
		except Exception:
			pass  # don't fail referral creation if status update fails

	return {"name": doc.name}


@frappe.whitelist()
def search_referral_source_documents(doctype, patient=None, search=None, limit=20):
	"""Return a list of Patient Visit or Inpatient Admission names for the Dynamic Link field."""
	if doctype not in ("Patient Visit", "Inpatient Admission"):
		return []
	filters = {}
	if patient:
		filters["patient"] = patient
	if search:
		filters["name"] = ["like", f"%{search}%"]

	if doctype == "Patient Visit":
		rows = frappe.get_all(
			"Patient Visit",
			filters=filters,
			fields=["name", "patient", "patient_name", "encounter_date", "status"],
			order_by="encounter_date desc",
			limit=int(limit),
		)
	else:
		rows = frappe.get_all(
			"Inpatient Admission",
			filters=filters,
			fields=["name", "patient", "patient_name", "admission_date", "status"],
			order_by="admission_date desc",
			limit=int(limit),
		)
	return rows


@frappe.whitelist()
def get_sales_invoice_with_items(invoice_name):
	"""Return a Sales Invoice document with its items for pre-filling an Insurance Claim."""
	if not invoice_name:
		return None

	doc = frappe.get_doc("Sales Invoice", invoice_name)

	items = []
	for item in doc.items:
		items.append({
			"name": item.name,
			"item_code": item.item_code,
			"item_name": item.item_name,
			"description": item.description or "",
			"qty": item.qty,
			"rate": item.rate,
			"amount": item.amount,
			"net_rate": item.net_rate,
			"net_amount": item.net_amount,
			"discount_percentage": item.discount_percentage,
			"discount_amount": item.discount_amount or 0,
		})

	return {
		"name": doc.name,
		"grand_total": doc.grand_total,
		"net_total": doc.net_total,
		"discount_amount": doc.discount_amount or 0,
		"outstanding_amount": doc.outstanding_amount,
		"status": doc.status,
		"posting_date": str(doc.posting_date) if doc.posting_date else None,
		"custom_base_reference": doc.get("custom_base_reference"),
		"custom_base_reference_name": doc.get("custom_base_reference_name"),
		"custom_health_insurance": doc.get("custom_health_insurance"),
		"items": items,
	}


@frappe.whitelist()
def create_and_submit_insurance_claim(data):
	"""Create an Insurance Claim document and submit it (docstatus=1)."""
	import json
	if isinstance(data, str):
		data = json.loads(data)
	data["submit"] = 1
	if not data.get("status"):
		data["status"] = "Submitted"
	return save_insurance_claim(data)


@frappe.whitelist()
def update_insurance_claim(claim_name, status=None, total_approved=None, total_rejected=None,
	authorization_no=None, remark=None):
	"""Update editable fields on a submitted Insurance Claim.

	Status is auto-derived from approved vs claimed amounts unless the caller
	explicitly passes 'Rejected':
	  - total_approved >= total_claimed  → Paid
	  - 0 < total_approved < total_claimed → Partially Paid
	  - total_approved == 0  → Submitted (no payment yet)
	"""
	if not claim_name:
		frappe.throw(_("Claim name is required"))
	assert_editing_allowed()

	updates = {}

	approved = float(total_approved) if total_approved is not None else None
	rejected = float(total_rejected) if total_rejected is not None else None

	if approved is not None:
		updates["total_approved"] = approved
	if rejected is not None:
		updates["total_rejected"] = rejected
	if authorization_no is not None:
		updates["authorization_no"] = authorization_no
	if remark is not None:
		updates["remark"] = remark

	# Derive status from amounts when approved amount is provided
	if approved is not None and status != "Rejected":
		total_claimed = frappe.db.get_value("Insurance Claim", claim_name, "total_claimed") or 0
		total_claimed = float(total_claimed)
		if total_claimed > 0 and approved >= total_claimed:
			updates["status"] = "Paid"
		elif approved > 0:
			updates["status"] = "Partially Paid"
		else:
			updates["status"] = "Submitted"
	elif status is not None:
		updates["status"] = status

	if updates:
		frappe.db.set_value("Insurance Claim", claim_name, updates)
		frappe.db.commit()

	return {"name": claim_name, "derived_status": updates.get("status")}


@frappe.whitelist()
def get_patient_unpaid_invoices(patient):
	"""Return unpaid or partly-paid Sales Invoices for the given patient.

	Each row includes:
	  name, posting_date, grand_total, discount_amount, outstanding_amount, status,
	  custom_base_reference, custom_base_reference_name
	"""
	if not patient:
		return []

	rows = frappe.get_all(
		"Sales Invoice",
		filters={
			"patient": patient,
			"docstatus": 1,
			"status": ["in", ["Unpaid", "Partly Paid"]],
		},
		fields=[
			"name",
			"posting_date",
			"grand_total",
			"discount_amount",
			"outstanding_amount",
			"status",
			"custom_base_reference",
			"custom_base_reference_name",
		],
		order_by="posting_date desc, creation desc",
		limit=100,
	)
	return rows


@frappe.whitelist()
def get_patient_referrals(patient=None, referral_status=None, date_from=None, date_to=None, limit=50, offset=0):
	"""Return a list of Patient Referral records."""
	from healthcare.api.common import apply_cost_center_scope_to_filters

	filters = {}
	if apply_cost_center_scope_to_filters(filters):
		return []
	if patient:
		filters["patient"] = patient
	if referral_status:
		filters["referral_status"] = referral_status
	if date_from:
		filters["referral_date"] = [">=", date_from]
	if date_to:
		if "referral_date" in filters:
			filters["referral_date"] = ["between", [date_from, date_to]]
		else:
			filters["referral_date"] = ["<=", date_to]

	rows = frappe.get_all(
		"Patient Referral",
		filters=filters,
		fields=[
			"name", "patient", "patient_name", "referral_date",
			"referred_from_doctype", "referred_from_docname",
			"referred_to_hospital", "referred_to_doctor",
			"reason_for_referral", "referral_status", "notes",
			"company", "cost_center",
		],
		order_by="referral_date desc, creation desc",
		limit=int(limit),
		start=int(offset),
	)
	return rows
	return [{"name": r.name, "label": r.assessment_parameter or r.name} for r in rows]


@frappe.whitelist()
def get_all_patient_diagnoses(patient):
	"""Return Medical Diagnosis Entry rows for a patient (OP visits and IP admissions)."""
	from healthcare.api.medical_diagnosis_entry import list_for_patient

	return list_for_patient(patient)


@frappe.whitelist()
def get_patient_diagnosis(parent_doctype, parent_name):
	"""Return Medical Diagnosis Entry rows for a Patient Visit or Inpatient Admission."""
	from healthcare.api.medical_diagnosis_entry import list_for_context

	return list_for_context(parent_doctype, parent_name)


@frappe.whitelist()
def save_patient_diagnosis(parent_doctype, parent_name, rows):
	"""Save Medical Diagnosis Entry rows for a Patient Visit or Inpatient Admission."""
	from healthcare.api.medical_diagnosis_entry import save_for_context

	return save_for_context(parent_doctype, parent_name, rows)


@frappe.whitelist()
def get_current_user_departments():
	"""Department link names for the logged-in user (Employee.department)."""
	from healthcare.healthcare.discharge_checklist_permissions import get_user_department_ids

	return get_user_department_ids()


def _resolve_department_link_label(dept_id):
	from healthcare.healthcare.discharge_checklist_permissions import resolve_department_link_label

	return resolve_department_link_label(dept_id)


def _portal_checklist_item_from_row(row, idx, department_label=None):
	"""Shape template / draft rows for the discharge portal checklist UI."""
	from healthcare.healthcare.discharge_checklist_permissions import resolve_department_link

	def _val(field):
		v = getattr(row, field, None)
		if v is None and isinstance(row, dict):
			v = row.get(field)
		return v

	dept = department_label if department_label is not None else _val("department")
	if not dept:
		dept_name = _val("department_name")
		if dept_name:
			dept = resolve_department_link(dept_name) or dept_name
	dept_label = department_label if department_label is not None else (_resolve_department_link_label(dept) or "General")

	dept_2 = _val("department_2")
	dept_2_label = _resolve_department_link_label(dept_2) if dept_2 else ""
	dept_3 = _val("department_3")
	dept_3_label = _resolve_department_link_label(dept_3) if dept_3 else ""

	action = _val("action_required")
	if not action:
		activity = _val("activity")
		desc = _val("description")
		if activity:
			action = frappe.db.get_value("Healthcare Activity", activity, "description") or activity
		else:
			action = desc or _("Task")

	row_name = _val("name")

	return {
		"name": row_name or f"row-{idx}",
		"action_required": action,
		"department": dept if isinstance(dept, str) else (dept or ""),
		"department_label": dept_label,
		"department_2": dept_2 or "",
		"department_2_label": dept_2_label,
		"department_3": dept_3 or "",
		"department_3_label": dept_3_label,
		"user": _val("user") or "",
		"name1": _val("name1") or "",
		"date_time": _val("date_time") or "",
		"click": bool(_val("click")),
		"description": _val("description") or "",
		"sr_num": _val("sr_num") or "",
	}


@frappe.whitelist()
def get_discharge_checklist_from_template(template_name):
	"""Load main discharge checklist rows for the portal (avoids /api/resource permission issues)."""
	if not template_name:
		return []
	if not frappe.db.exists("Discharge Template", template_name):
		return []

	doc = frappe.get_doc("Discharge Template", template_name, ignore_permissions=True)
	out = []
	for idx, row in enumerate(doc.get("discharge_checklist") or [], start=1):
		out.append(_portal_checklist_item_from_row(row, idx))
	return out


@frappe.whitelist()
def get_nursing_discharge_checklist_from_template(template_name, template_source=None):
	"""Load nursing discharge checklist rows for the portal.

	template_source:
	  - discharge_nursing: Discharge Nursing Template
	  - nursing_checklist: Nursing Checklist Template (tasks on admission)
	"""
	if not template_name:
		return []

	source = (template_source or "").strip().lower()
	if not source:
		if frappe.db.exists("Discharge Nursing Template", template_name):
			source = "discharge_nursing"
		elif frappe.db.exists("Nursing Checklist Template", template_name):
			source = "nursing_checklist"
		else:
			return []

	if source == "nursing_checklist":
		if not frappe.db.exists("Nursing Checklist Template", template_name):
			return []
		doc = frappe.get_doc("Nursing Checklist Template", template_name, ignore_permissions=True)
		dept_label = "Nursing"
		if doc.department:
			dept_label = (
				frappe.db.get_value("Medical Department", doc.department, "department")
				or doc.department
			)
		out = []
		for idx, row in enumerate(doc.get("tasks") or [], start=1):
			out.append(_portal_checklist_item_from_row(row, idx, department_label=dept_label))
		return out

	if not frappe.db.exists("Discharge Nursing Template", template_name):
		return []
	doc = frappe.get_doc("Discharge Nursing Template", template_name, ignore_permissions=True)
	out = []
	for idx, row in enumerate(doc.get("discharge_checklist") or [], start=1):
		out.append(_portal_checklist_item_from_row(row, idx, department_label="Nursing"))
	return out


@frappe.whitelist()
def get_nursing_template_display_label(template_name=None, template_source=None):
	"""Human-readable label for portal nursing template picker (resume draft)."""
	if not template_name:
		return ""
	source = (template_source or "").strip().lower()
	if source == "nursing_checklist" or (
		not source and frappe.db.exists("Nursing Checklist Template", template_name)
	):
		return (
			frappe.db.get_value("Nursing Checklist Template", template_name, "title")
			or template_name
		)
	if frappe.db.exists("Discharge Nursing Template", template_name):
		return (
			frappe.db.get_value("Discharge Nursing Template", template_name, "template_name")
			or template_name
		)
	return template_name


@frappe.whitelist()
def fetch_nursing_discharge_template_options(template_name=None):
	"""Discharge nursing template picker: Discharge Nursing Template + Nursing Checklist Template."""
	search = (template_name or "").strip()
	out = []

	dnt_filters = {}
	if search:
		dnt_filters["template_name"] = ["like", f"%{search}%"]
	for row in frappe.get_all(
		"Discharge Nursing Template",
		filters=dnt_filters,
		fields=["name", "template_name", "default"],
		limit=50,
		order_by="default desc, template_name",
	):
		label = row.template_name or row.name
		out.append(
			{
				"name": row.name,
				"label": label,
				"default": row.default or 0,
				"template_source": "discharge_nursing",
			}
		)

	nct_filters = {"disabled": 0}
	if search:
		nct_filters["title"] = ["like", f"%{search}%"]
	for row in frappe.get_all(
		"Nursing Checklist Template",
		filters=nct_filters,
		fields=["name", "title", "default"],
		limit=50,
		order_by="default desc, title",
	):
		label = row.title or row.name
		out.append(
			{
				"name": row.name,
				"label": f"{label} (Nursing Checklist)",
				"default": row.default or 0,
				"template_source": "nursing_checklist",
			}
		)

	return out


@frappe.whitelist()
def fetch_nursing_discharge_templates(template_name=None):
	"""Backward-compatible alias — returns Discharge Nursing Template rows only."""
	return [
		{
			"name": t["name"],
			"label": t["label"],
			"default": 0,
			"template_source": "discharge_nursing",
		}
		for t in fetch_nursing_discharge_template_options(template_name)
		if t.get("template_source") == "discharge_nursing"
	]


MINI_WAREHOUSE_TABLES = {
	"nurse": "nurse_mini_warehouse",
	"laboratory": "laboratory_mini_warehouse",
}


def normalize_mini_warehouse_context(warehouse_context=None):
	ctx = (warehouse_context or "nurse").strip().lower()
	return ctx if ctx in MINI_WAREHOUSE_TABLES else "nurse"


def _iter_mini_warehouse_rows(settings, warehouse_context=None):
	fieldname = MINI_WAREHOUSE_TABLES[normalize_mini_warehouse_context(warehouse_context)]
	return settings.get(fieldname) or []


@frappe.whitelist()
def get_warehouse_for_cost_center(cost_center, warehouse_context=None):
	"""
	Get the default warehouse for a given cost center from Healthcare Settings.

	warehouse_context: 'nurse' (default) uses Nurse Mini Warehouse;
	                   'laboratory' uses Laboratory Mini Warehouse.
	"""
	if not cost_center:
		return None

	try:
		settings = frappe.get_doc("Healthcare Settings")
		for warehouse_row in _iter_mini_warehouse_rows(settings, warehouse_context):
			if warehouse_row.cost_center == cost_center:
				return warehouse_row.warehouse
	except Exception:
		pass

	return None


@frappe.whitelist()
def get_warehouses_for_cost_centers(cost_centers=None, warehouse_context=None):
	"""
	Get warehouses for one or more cost centers from Healthcare Settings.
	"""
	if cost_centers is None:
		permitted_cc = get_permitted_cost_centers()
		cost_centers = permitted_cc if permitted_cc else []

	warehouse_map = {}

	if not cost_centers:
		return warehouse_map

	try:
		settings = frappe.get_doc("Healthcare Settings")
		for warehouse_row in _iter_mini_warehouse_rows(settings, warehouse_context):
			if warehouse_row.cost_center in cost_centers:
				warehouse_map[warehouse_row.cost_center] = warehouse_row.warehouse
	except Exception:
		pass

	return warehouse_map


@frappe.whitelist()
def get_warehouses_for_cost_center(cost_center, warehouse_context=None):
	"""
	Get all warehouses for a cost center from the configured mini-warehouse table.
	Returns list of {name, label} for dropdown selection.
	"""
	if not cost_center:
		return []

	warehouses = []
	try:
		settings = frappe.get_doc("Healthcare Settings")
		for warehouse_row in _iter_mini_warehouse_rows(settings, warehouse_context):
			if warehouse_row.cost_center == cost_center:
				warehouses.append({
					"name": warehouse_row.warehouse,
					"label": warehouse_row.warehouse,
				})
	except Exception:
		pass

	return warehouses


PHARMACY_GIVEOUT_SETTINGS_FIELD = "phamarcy_give_out"


def get_pharmacy_giveout_warehouses():
	"""Warehouses configured in Healthcare Settings for nursing pharmacy give-out."""
	warehouses = []
	seen = set()
	try:
		settings = frappe.get_single("Healthcare Settings")
		for row in settings.get(PHARMACY_GIVEOUT_SETTINGS_FIELD) or []:
			wh = ""
			if isinstance(row, str):
				wh = row.strip()
			else:
				wh = (getattr(row, "warehouse", None) or "").strip()
			if wh and wh not in seen:
				seen.add(wh)
				warehouses.append({"name": wh, "label": wh})
		if not warehouses and frappe.db.exists("DocType", "Nurse Give Out Medicine"):
			for row in frappe.get_all(
				"Nurse Give Out Medicine",
				filters={
					"parent": "Healthcare Settings",
					"parenttype": "Healthcare Settings",
					"parentfield": PHARMACY_GIVEOUT_SETTINGS_FIELD,
				},
				fields=["warehouse"],
				order_by="idx asc",
			):
				wh = (row.get("warehouse") or "").strip()
				if wh and wh not in seen:
					seen.add(wh)
					warehouses.append({"name": wh, "label": wh})
	except Exception:
		pass
	return warehouses


def resolve_pharmacy_giveout_default_warehouse(cost_center):
	"""Pick default give-out warehouse: branch pharmacy warehouse, then nurse mini, else first configured."""
	allowed = get_pharmacy_giveout_warehouses()
	if not allowed:
		return None, allowed
	allowed_names = {row["name"] for row in allowed}
	prescr_wh = _prescription_warehouse_for_cost_center(cost_center) if cost_center else None
	if prescr_wh and prescr_wh in allowed_names:
		return prescr_wh, allowed
	mini_wh = get_warehouse_for_cost_center(cost_center) if cost_center else None
	if mini_wh and mini_wh in allowed_names:
		return mini_wh, allowed
	return allowed[0]["name"], allowed


def validate_warehouse_change_permission():
	"""
	Check if current user has permission to change warehouse/cost_center.
	Only Administrator and System Manager can change these values.
	
	Raises:
		frappe.PermissionError if user doesn't have permission
	"""
	user = frappe.session.user
	if _user_is_exempt(user):
		return True
	
	frappe.throw(
		_("Only Administrators and System Managers can change warehouse and cost center assignments"),
		frappe.PermissionError
	)
 
 


@frappe.whitelist()
def get_observation_levels(query=None):
	"""Fetch observation levels (link field options)."""
	search = (query or "").strip()
	filters = {}
	or_filters = None
	if search:
		like = f"%{search}%"
		or_filters = [
			["name", "like", like],
			["observation_level", "like", like],
		]

	rows = frappe.get_all(
		"Observation Level",
		fields=["name", "observation_level", "default"],
		filters=filters,
		or_filters=or_filters,
		limit=50,
		order_by="default desc, observation_level asc, name asc",
	)

	return [
		{
			"name": row.name,
			"label": (row.observation_level or row.name or "").strip() or row.name,
			"default": frappe.utils.cint(row.get("default")),
		}
		for row in rows
	]


@frappe.whitelist()
def get_document_types(search=None):
	"""Document Type options for portal upload forms."""
	filters = {}
	search = (search or "").strip()
	if search:
		filters["document_name"] = ["like", f"%{search}%"]

	return frappe.get_all(
		"Document Type",
		fields=["name", "document_name"],
		filters=filters,
		limit=200,
		order_by="document_name asc",
	)


@frappe.whitelist()
def create_document_type(document_name=None):
	"""Create a Document Type from the portal when the needed type is missing."""
	document_name = (document_name or "").strip()
	if not document_name:
		frappe.throw(_("Document Name is required"))

	if frappe.db.exists("Document Type", document_name):
		return {"name": document_name, "document_name": document_name}

	doc = frappe.get_doc({"doctype": "Document Type", "document_name": document_name})
	doc.insert(ignore_permissions=True)
	return {"name": doc.name, "document_name": doc.document_name}


