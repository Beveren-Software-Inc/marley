# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _

print("Module healthcare.api.common loaded")


@frappe.whitelist()
def get_current_user_roles():
	"""Return list of role names for the current user (for UI permissions)."""
	if frappe.session.user == "Guest":
		return []
	return list(frappe.get_roles(frappe.session.user))


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
def get_healthcare_practitioners(search=None, department=None):
	"""Get list of Healthcare Practitioners"""
	filters = {}
	if search:
		filters['practitioner_name'] = ['like', f'%{search}%']
	# if department:
	# 	filters['department'] = department
	
	practitioners = frappe.get_all(
		'Healthcare Practitioner',
		filters=filters,
		fields=['name', 'practitioner_name', 'department', 'medical_role'],
		limit=50,
		order_by='practitioner_name'
	)
	return [{'name': p.name, 'label': p.practitioner_name or p.name, 'department': p.department, 'medical_role': p.medical_role} for p in practitioners]


@frappe.whitelist()
def get_service_unit_types(search=None):
	"""Get list of Healthcare Service Unit Types with inpatient occupancy"""
	filters = {'inpatient_occupancy': 1, 'allow_appointments': 0}  # Only get leaf service unit types that are for inpatient occupancy and not for appointments
	
	service_unit_types = frappe.get_all(
		'Healthcare Service Unit Type',
		filters=filters,
		fields=['name', 'service_unit_type'],
		limit=50,
		order_by='service_unit_type'
	)
	
	if search:
		service_unit_types = [s for s in service_unit_types if search.lower() in (s.service_unit_type or '').lower()]
	
	return [{'name': s.name, 'label': s.service_unit_type or s.name} for s in service_unit_types]


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
def get_users(search=None):
	"""Get list of Users"""
	filters = {}
	if search:
		filters['full_name'] = ['like', f'%{search}%']
		# Also search by email
		users = frappe.db.sql("""
			SELECT name, full_name, email
			FROM `tabUser`
			WHERE 
				enabled = 1
				AND (full_name LIKE %(search)s OR email LIKE %(search)s OR name LIKE %(search)s)
			ORDER BY full_name
			LIMIT 50
		""", {
			'search': f'%{search}%'
		}, as_dict=True)
	else:
		users = frappe.get_all(
			'User',
			filters={**filters, 'enabled': 1},
			fields=['name', 'full_name', 'email'],
			limit=50,
			order_by='full_name'
		)
	
	return [{'name': u.name, 'label': u.full_name or u.email or u.name} for u in users]


@frappe.whitelist()
def get_discharge_templates(search=None):
	"""Get list of Discharge Templates"""
	filters = {}
	if search:
		filters['template_name'] = ['like', f'%{search}%']
	
	templates = frappe.get_all(
		'Discharge Template',
		filters=filters,
		fields=['name', 'template_name'],
		limit=50,
		order_by='template_name'
	)
	return [{'name': t.name, 'label': t.template_name or t.name} for t in templates]


@frappe.whitelist()
def get_lab_test_templates(search=None, department=None):
	"""Get list of Lab Test Templates (with outpatient_rate)."""
	filters = {'disabled': 0}  # Only get enabled templates
	if search:
		filters['lab_test_name'] = ['like', f'%{search}%']
	if department:
		filters['department'] = department
	
	templates = frappe.get_all(
		'Lab Test Template',
		filters=filters,
		# inpatient_rate may or may not exist; safe to include
		fields=['name', 'lab_test_name', 'department', 'outpatient_rate', 'inpatient_rate'],
		limit=50,
		order_by='lab_test_name'
	)
	return [
		{
			'name': t.name,
			'label': t.lab_test_name or t.name,
			'department': t.department,
			'outpatient_rate': t.outpatient_rate,
			'inpatient_rate': getattr(t, 'inpatient_rate', None),
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
		fields=['name', 'appointment_type'],
		limit=50,
		order_by='appointment_type'
	)
	
	return [{'name': a.name, 'label': a.appointment_type or a.name} for a in appointment_types]


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
			SELECT name, item_code, item_name, item_group
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
			fields=['name', 'item_code', 'item_name', 'item_group'],
			limit=50,
			order_by='item_name'
		)
	
	return [{'name': i.name, 'label': i.item_name or i.item_code or i.name, 'item_code': i.item_code, 'item_group': i.item_group} for i in items]


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
	if frappe.db.exists("DocType", "IP Service Type"):
		order_template_doctypes.append("IP Service Type")

	doctypes = frappe.get_all(
		'DocType',
		filters={'name': ['in', order_template_doctypes]},
		fields=['name'],
		limit=50
	)
	return [{'name': d.name, 'label': d.name} for d in doctypes]


@frappe.whitelist()
def get_service_request_templates(template_dt, search=None, department=None):
	"""Get list of templates based on template_dt (Order Template Type)"""
	if not template_dt:
		return []
	
	filters = {}
	if search:
		# Different fields for different template types
		if template_dt == 'Lab Test Template':
			filters['lab_test_name'] = ['like', f'%{search}%']
		elif template_dt == 'Clinical Procedure Template':
			filters['procedure_name'] = ['like', f'%{search}%']
		elif template_dt == 'Observation Template':
			filters['observation'] = ['like', f'%{search}%']
		elif template_dt == 'Therapy Type':
			filters['therapy_type'] = ['like', f'%{search}%']
		elif template_dt == 'Appointment Type':
			filters['name'] = ['like', f'%{search}%']
		elif template_dt == 'Healthcare Activity':
			filters['activity_type'] = ['like', f'%{search}%']
	
	if department:
		if template_dt == 'Lab Test Template':
			filters['department'] = department
		elif template_dt == 'Clinical Procedure Template':
			filters['medical_department'] = department
		elif template_dt == 'Observation Template':
			filters['medical_department'] = department
	
	# Get templates based on type
	if template_dt == 'Lab Test Template':
		templates = frappe.get_all(
			'Lab Test Template',
			filters={**filters, 'disabled': 0},
			fields=['name', 'lab_test_name', 'department'],
			limit=50,
			order_by='lab_test_name'
		)
		return [{'name': t.name, 'label': t.lab_test_name or t.name, 'department': t.department} for t in templates]
	
	elif template_dt == 'Clinical Procedure Template':
		templates = frappe.get_all(
			'Clinical Procedure Template',
			filters=filters,
			fields=['name', 'procedure_name', 'medical_department'],
			limit=50,
			order_by='procedure_name'
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

	elif template_dt == 'IP Service Type' and frappe.db.exists("DocType", "IP Service Type"):
		if search:
			filters['service_name'] = ['like', f'%{search}%']
		filters['disabled'] = 0
		templates = frappe.get_all(
			'IP Service Type',
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
	"""Create a new Healthcare Practitioner"""
	if isinstance(data, str):
		import json
		data = json.loads(data)
	
	# Validate required fields
	if not data.get('first_name'):
		frappe.throw(_("First Name is required"))
	
	# Create the practitioner
	practitioner = frappe.get_doc({
		'doctype': 'Healthcare Practitioner',
		'first_name': data.get('first_name'),
		'middle_name': data.get('middle_name') or '',
		'last_name': data.get('last_name') or '',
		'gender': data.get('gender') or None,
		'status': data.get('status') or 'Active',
		'mobile_phone': data.get('mobile_phone') or None,
		'office_phone': data.get('office_phone') or None,
		'department': data.get('department') or None,
		'medical_role': data.get('medical_role') or None
	})
	
	practitioner.insert()
	
	# Return the created practitioner
	return {
		'name': practitioner.name,
		'practitioner_name': practitioner.practitioner_name
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
	"""Get list of Prescription Frequency for medication rows."""
	filters = {}
	if search:
		filters["name"] = ["like", f"%{search}%"]
	items = frappe.get_all(
		"Prescription Frequency",
		filters=filters,
		fields=["name"],
		order_by="name asc",
		limit=50,
	)
	return [{"name": p.name, "label": p.name} for p in items]


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
	print("Unafika hapa")
	docs = frappe.get_all(
		"Long Acting Medicine",
		filters={"patient": patient, "docstatus": ["!=", 2]},
		fields=["name", "patient", "patient_name", "frequency", "start_date", "end_date", "next_run_date", "status"],
		order_by="next_run_date asc",
		limit=limit,
		limit_start=offset,
	)
	return list(docs)


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
		],
		order_by="next_run_date asc, start_date asc, name asc",
		limit=limit,
		limit_start=offset,
	)
	return list(docs)


@frappe.whitelist()
def update_long_acting_medicine_remarks(name: str, remarks: str):
	"""Update the remarks field on a Long Acting Medicine record."""
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
		# Hook: send WhatsApp via your gateway (e.g. Twilio, Meta Cloud API)
		pass
	elif channel == "sms":
		# Hook: send SMS via frappe.core.doctype.sms_settings or external gateway
		pass

	return {"sent": True, "channel": channel, "patient": patient_name}


@frappe.whitelist()
def get_diagnosis(search=None):
	"""Get list of Diagnosis (doctype) for encounter diagnosis selection."""
	filters = {}
	if search:
		filters["diagnosis"] = ["like", f"%{search}%"]
	items = frappe.get_all(
		"Diagnosis",
		filters=filters,
		fields=["name", "diagnosis"],
		order_by="diagnosis asc",
		limit=50,
	)
	return [{"name": d.name, "label": d.diagnosis or d.name} for d in items]


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
def create_diagnosis(diagnosis):
	"""Create a new Diagnosis master record. Returns the new doc name."""
	if not diagnosis or not str(diagnosis).strip():
		frappe.throw(_("Diagnosis text is required"))
	name = str(diagnosis).strip()
	if frappe.db.exists("Diagnosis", name):
		return name
	doc = frappe.get_doc({"doctype": "Diagnosis", "diagnosis": name})
	doc.insert(ignore_permissions=False)
	return doc.name


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
def get_patient_visits(search=None, patient=None, limit=20):
	filters = {"docstatus": ["!=", 2]}

	if patient:
		filters["patient"] = patient

	if search:
		filters["name"] = ["like", f"%{search}%"]
	
	visits = frappe.get_all(
		"Patient Visit",
		filters=filters,
		fields=["name", "patient", "practitioner"],
		limit=limit,
		order_by="creation desc",
	)
	
	return [
		{
			"name": v.name,
			"label": f"{v.name} - {v.patient or ''}"
		}
		for v in visits
	]


@frappe.whitelist()
def get_inpatient_admissions(search=None, patient=None, limit=20):
	# filters = {"docstatus": ["!=", 2]}
	filters = {}

	if patient:
		filters["patient"] = patient

	if search:
		filters["name"] = ["like", f"%{search}%"]
	admissions = frappe.get_all(
		"Inpatient Admission",
		filters=filters,
		fields=["name", "patient", "admitted_datetime"],
		limit=limit,
		order_by="creation desc",
	)
	return [
		{
			"name": a.name,
			"label": f"{a.name} ({a.admission_date})"
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
	if user == "Administrator":
		return None
	if _user_is_exempt(user):
		return None

	perms = frappe.get_all(
		"User Permission",
		filters={"user": user, "allow": "Cost Center"},
		fields=["for_value"],
	)
	if not perms:
		return None  # No restriction — see everything

	return [p["for_value"] for p in perms]


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

	- If the user is Administrator, System Manager, or Healthcare Administrator the
	  call is a no-op (permissions are ignored for these roles).
	- Deletes any existing ``Cost Center`` User Permission rows for this user first.
	- If *cost_center* is a non-empty string, creates a fresh User Permission row.
	"""
	user = frappe.session.user

	if _user_is_exempt(user):
		return {"status": "skipped", "message": "User has elevated privileges — permission not changed."}

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
def get_lab_test_templates(search=None):
	"""Get list of Lab Test Templates for the setup screen."""
	filters = {}
	if search:
		filters["lab_test_name"] = ["like", f"%{search}%"]

	templates = frappe.get_all(
		"Lab Test Template",
		filters=filters,
		fields=[
			"name", "lab_test_name", "department",
			"lab_test_template_type", "is_group", "is_billable", "disabled",
		],
		limit=200,
		order_by="lab_test_name asc",
	)
	return templates


@frappe.whitelist()
def get_insurance_claims(search=None, patient=None):
	"""Get list of Insurance Claims."""
	filters = {}
	if search:
		filters["name"] = ["like", f"%{search}%"]
	if patient:
		filters["patient"] = patient

	claims = frappe.get_all(
		"Insurance Claim",
		filters=filters,
		fields=[
			"name", "patient", "patient_name", "health_insurance",
			"insurance_payor", "claim_date", "status",
			"total_claimed", "total_approved", "total_rejected",
			"total_patient_liability", "sales_invoice",
			"authorization_no", "remark",
		],
		limit=100,
		order_by="creation desc",
	)
	return claims


@frappe.whitelist()
def link_patient_to_insurance_register(register_name, patient):
	"""Link a newly created Patient back to the Insurance Patient Register."""
	doc = frappe.get_doc("Insurance Patient Register", register_name)
	doc.patient = patient
	# allow_on_submit is set on the patient field so db_set works even on submitted docs
	doc.db_set("patient", patient, update_modified=True)
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


@frappe.whitelist()
def get_grooming_charts(search=None, patient=None, page=1, page_size=20):
	"""Fetch IP Grooming Chart records."""
	try:
		page = frappe.utils.cint(page) or 1
		page_size = frappe.utils.cint(page_size) or 20
		filters = {}
		if patient:
			filters["file_no"] = patient
		if search:
			filters["patient_name"] = ["like", f"%{search}%"]

		charts = frappe.get_all(
			"IP Grooming Chart",
			filters=filters,
			fields=[
				"name", "date", "admission_no", "file_no", "patient_name", "cost_center",
				"brush_teeth_morning", "change_clothes_morning", "brush_teeth_noon",
				"change_clothes_noon", "shower", "bowel", "bed_wetting",
				"breakfast", "snack_1", "lunch", "snack_2", "dinner", "snack_3",
				"weight", "lmp", "creation"
			],
			order_by="creation desc",
			limit_page_length=page_size,
			limit_start=(page - 1) * page_size,
		)
		total = frappe.db.count("IP Grooming Chart", filters=filters)
		return {"success": True, "data": charts, "page": page, "page_size": page_size, "total": total}
	except Exception as e:
		frappe.logger().error(f"Error in get_grooming_charts: {str(e)}")
		return {"success": False, "message": str(e), "data": []}


@frappe.whitelist()
def create_grooming_chart(data):
	"""Create a new IP Grooming Chart record."""
	try:
		if isinstance(data, str):
			data = frappe.parse_json(data)

		doc = frappe.new_doc("IP Grooming Chart")
		allowed_fields = [
			"date", "admission_no", "file_no", "patient_name", "cost_center",
			"brush_teeth_morning", "change_clothes_morning", "brush_teeth_noon",
			"change_clothes_noon", "shower", "bowel", "bed_wetting",
			"breakfast", "snack_1", "lunch", "snack_2", "dinner", "snack_3",
			"weight", "lmp",
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
def get_branches(search=None):
	"""Fetch Branch records."""
	filters = {}
	if search:
		filters["name"] = ["like", f"%{search}%"]
	branches = frappe.get_all("Cost Center", filters=filters, fields=["name"], order_by="name asc", limit=50)
	return [{"name": b.name, "label": b.name} for b in branches]


@frappe.whitelist()
def get_mental_states(search=None, patient=None, page=1, page_size=20):
	"""Fetch Mental State records."""
	try:
		page = frappe.utils.cint(page) or 1
		page_size = frappe.utils.cint(page_size) or 20
		filters = {}
		if patient:
			filters["file_no"] = patient
		if search:
			filters["patient_name"] = ["like", f"%{search}%"]

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
				"restless", "gait", "tics", "agitated", "abnormal", "hallucinatory_behaviour",
				"place", "time", "normal_ap", "person",
				"increased", "poor_ap", "reported", "non_reported", "normal_b", "reported_type",
				"sleep_duration", "normal_sleep", "disturbed", "intermittent",
				"excessive", "a_little",
				"conscious", "alert", "disturbed_con",
				"creation"
			],
			order_by="creation desc",
			limit_page_length=page_size,
			limit_start=(page - 1) * page_size,
		)
		total = frappe.db.count("Mental State", filters=filters)
		return {"success": True, "data": records, "page": page, "page_size": page_size, "total": total}
	except Exception as e:
		frappe.logger().error(f"Error in get_mental_states: {str(e)}")
		return {"success": False, "message": str(e), "data": []}


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
			"defence", "impulsive", "sedative",
			"normal_s", "rapid", "slow", "poor_sp", "slurred", "coherent",
			"incoherent", "talkative", "anxious", "angry", "depressed", "elated",
			"euthymic", "irritable", "twitches", "hyperactive", "stereotypes",
			"restless", "gait", "tics", "agitated", "abnormal", "hallucinatory_behaviour",
			"place", "time", "normal_ap", "person",
			"increased", "poor_ap", "reported", "non_reported", "normal_b", "reported_type",
			"sleep_duration", "normal_sleep", "disturbed", "intermittent",
			"excessive", "a_little",
			"conscious", "alert", "disturbed_con",
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
def get_sick_leaves(search=None, patient=None, page=1, page_size=20):
	"""Fetch Sick Leave records."""
	try:
		page = frappe.utils.cint(page) or 1
		page_size = frappe.utils.cint(page_size) or 20
		filters = {}
		if patient:
			filters["patient"] = patient
		if search:
			filters["patient_name"] = ["like", f"%{search}%"]

		records = frappe.get_all(
			"Sick Leave",
			filters=filters,
			fields=[
				"name", "admission_no", "patient", "patient_name",
				"from_date", "to_date", "days", "diagnosis", "doctor", "source",
				"creation"
			],
			order_by="creation desc",
			limit_page_length=page_size,
			limit_start=(page - 1) * page_size,
		)
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
def get_patient_assessments(patient=None, search=None, page=1, page_size=20):
	"""Fetch Patient Assessment records."""
	try:
		page = frappe.utils.cint(page) or 1
		page_size = frappe.utils.cint(page_size) or 20
		filters = {}
		if patient:
			filters["patient"] = patient
		if search:
			filters["patient_name"] = ["like", f"%{search}%"]

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
					"score": frappe.utils.flt(row.get("score") or 0),
					"time": row.get("time") or None,
					"comments": row.get("comments") or "",
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
			"item_code": item.item_code,
			"item_name": item.item_name,
			"description": item.description or "",
			"qty": item.qty,
			"rate": item.rate,
			"amount": item.amount,
			"net_rate": item.net_rate,
			"net_amount": item.net_amount,
			"discount_percentage": item.discount_percentage,
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
	"""Create an Insurance Claim document and immediately submit it (docstatus=1)."""
	import json
	if isinstance(data, str):
		data = json.loads(data)

	doc = frappe.get_doc({
		"doctype": "Insurance Claim",
		"patient": data.get("patient"),
		"health_insurance": data.get("health_insurance") or None,
		"insurance_payor": data.get("insurance_payor") or None,
		"claim_date": data.get("claim_date") or None,
		"status": data.get("status") or "Submitted",
		"sales_invoice": data.get("sales_invoice") or None,
		"reference_doctype": data.get("reference_doctype") or None,
		"reference_name": data.get("reference_name") or None,
		"authorization_no": data.get("authorization_no") or None,
		"remark": data.get("remark") or None,
	})

	claim_items = data.get("claim_items") or []
	for ci in claim_items:
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

	doc.insert(ignore_permissions=True)
	doc.submit()
	frappe.db.commit()

	return {"name": doc.name}


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
	filters = {}
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
	"""Return all Patient Diagnosis rows across all Patient Visits and Inpatient Admissions for a patient."""
	if not patient:
		return []

	results = []

	visits = frappe.get_all("Patient Visit", filters={"patient": patient}, fields=["name", "encounter_date"], order_by="encounter_date desc")
	for visit in visits:
		rows = frappe.get_all(
			"Patient Diagnosis",
			filters={"parent": visit.name, "parenttype": "Patient Visit"},
			fields=["name", "diagnosis", "details", "posting_date"],
			order_by="posting_date desc",
		)
		for row in rows:
			results.append({
				"name": row.name,
				"diagnosis": row.diagnosis,
				"details": row.details or "",
				"posting_date": str(row.posting_date) if row.posting_date else "",
				"parent": visit.name,
				"parent_type": "Patient Visit",
				"parent_date": str(visit.encounter_date) if visit.encounter_date else "",
			})

	admissions = frappe.get_all("Inpatient Admission", filters={"patient": patient}, fields=["name", "admitted_datetime"], order_by="admitted_datetime desc")
	for admission in admissions:
		rows = frappe.get_all(
			"Patient Diagnosis",
			filters={"parent": admission.name, "parenttype": "Inpatient Admission"},
			fields=["name", "diagnosis", "details", "posting_date"],
			order_by="posting_date desc",
		)
		for row in rows:
			results.append({
				"name": row.name,
				"diagnosis": row.diagnosis,
				"details": row.details or "",
				"posting_date": str(row.posting_date) if row.posting_date else "",
				"parent": admission.name,
				"parent_type": "Inpatient Admission",
				"parent_date": str(admission.admitted_datetime) if admission.admitted_datetime else "",
			})

	results.sort(key=lambda x: x.get("posting_date") or "", reverse=True)
	return results


@frappe.whitelist()
def get_patient_diagnosis(parent_doctype, parent_name):
	"""Return Patient Diagnosis child table rows for a Patient Visit or Inpatient Admission."""
	if parent_doctype not in ("Patient Visit", "Inpatient Admission"):
		frappe.throw(_("Parent must be Patient Visit or Inpatient Admission"))
	if not parent_name:
		return []

	doc = frappe.get_doc(parent_doctype, parent_name)
	rows = []
	for row in (doc.get("patient_diagnosis") or []):
		rows.append({
			"name": row.name,
			"diagnosis": row.diagnosis,
			"details": row.details or "",
			"posting_date": str(row.posting_date) if row.posting_date else "",
		})
	return rows


@frappe.whitelist()
def save_patient_diagnosis(parent_doctype, parent_name, rows):
	"""Save Patient Diagnosis child table rows for a Patient Visit or Inpatient Admission."""
	import json
	if parent_doctype not in ("Patient Visit", "Inpatient Admission"):
		frappe.throw(_("Parent must be Patient Visit or Inpatient Admission"))
	if not parent_name:
		frappe.throw(_("Parent name is required"))

	if isinstance(rows, str):
		rows = json.loads(rows)

	doc = frappe.get_doc(parent_doctype, parent_name)
	doc.set("patient_diagnosis", [])
	for row in rows:
		diagnosis_val = row.get("diagnosis") or ""
		if not diagnosis_val:
			continue
		doc.append("patient_diagnosis", {
			"diagnosis": diagnosis_val,
			"details": row.get("details") or "",
			"posting_date": row.get("posting_date") or frappe.utils.now_datetime(),
		})

	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True}