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