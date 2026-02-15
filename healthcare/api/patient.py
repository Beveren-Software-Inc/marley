# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _


@frappe.whitelist()
def search_patients(search=None, limit=20):
	"""Search patients by name or file number"""
	if not search:
		return []
	
	# Convert limit to integer (it comes as string from URL params)
	limit = int(limit) if limit else 20
	
	patients = frappe.db.sql("""
		SELECT 
			p.name,
			p.patient_name,
			p.file_no as file_number,
			p.mobile,
			p.email,
			p.sex,
			p.id_number,
			p.category
		FROM `tabPatient` p
		WHERE 
			p.patient_name LIKE %(search)s
			OR p.name LIKE %(search)s
			OR p.file_no LIKE %(search)s
		ORDER BY p.patient_name
		LIMIT %(limit)s
	""", {
		'search': f'%{search}%',
		'limit': limit
	}, as_dict=True)
	
	return [{'name': p.name, 'patient_name': p.patient_name or p.name, 'file_number': p.file_number, 'mobile': p.mobile, 'email': p.email, 'sex': p.sex, 'id_number': p.id_number, 'category': p.category} for p in patients]


@frappe.whitelist()
def get_patients(limit=50, offset=0, search=None):
	"""Get list of patients"""
	# Convert limit and offset to integers (they come as strings from URL params)
	limit = int(limit) if limit else 50
	offset = int(offset) if offset else 0
	
	filters = {}
	
	if search:
		# Search by name, file number, or patient ID
		patients = frappe.db.sql("""
			SELECT 
				p.name,
				p.patient_name,
				p.file_no as file_number,
				p.mobile,
				p.email,
				p.sex,
				p.id_number,
				p.category
			FROM `tabPatient` p
			WHERE 
				p.patient_name LIKE %(search)s
				OR p.name LIKE %(search)s
				OR p.file_no LIKE %(search)s
			ORDER BY p.patient_name
			LIMIT %(limit)s OFFSET %(offset)s
		""", {
			'search': f'%{search}%',
			'limit': limit,
			'offset': offset
		}, as_dict=True)
		
		return [{'name': p.name, 'patient_name': p.patient_name or p.name, 'file_number': p.file_number, 'mobile': p.mobile, 'email': p.email, 'sex': p.sex, 'id_number': p.id_number, 'category': p.category} for p in patients]
	else:
		patients = frappe.get_all(
			'Patient',
			filters=filters,
			fields=['name', 'patient_name', 'file_no', 'mobile', 'email', 'sex', 'id_number', 'category'],
			limit=limit,
			limit_start=offset,
			order_by='patient_name'
		)
		
		return [{'name': p.name, 'patient_name': p.patient_name or p.name, 'file_number': p.file_no, 'mobile': p.mobile, 'email': p.email, 'sex': p.sex, 'id_number': p.id_number, 'category': p.category} for p in patients]


@frappe.whitelist()
def create_patient(data):
	"""Create a new Patient"""
	if isinstance(data, str):
		import json
		data = json.loads(data)
	
	# Validate required fields
	if not data.get('first_name'):
		frappe.throw(_("First Name is required"))
	
	if not data.get('sex'):
		frappe.throw(_("Gender is required"))
	
	# Validate BRD: Contact No., Address, Patient Referral/Source, Patient type required
	if not data.get('mobile') and not data.get('phone'):
		frappe.throw(_("At least one Contact No. (Mobile or Phone) is required"))
	if not data.get('source'):
		frappe.throw(_("Patient Referral or Source is required"))
	if not data.get('category'):
		frappe.throw(_("Patient type is required"))

	# Build doc; address is set via primary address or separate API
	patient = frappe.get_doc({
		'doctype': 'Patient',
		'first_name': data.get('first_name'),
		'middle_name': data.get('middle_name') or '',
		'last_name': data.get('last_name') or '',
		'sex': data.get('sex'),
		'dob': data.get('dob') or None,
		'blood_group': data.get('blood_group') or None,
		'mobile': data.get('mobile') or None,
		'phone': data.get('phone') or None,
		'email': data.get('email') or None,
		'id_number': data.get('id_number') or None,
		'nationality': data.get('nationality') or None,
		'category': data.get('category') or None,
		'source': data.get('source') or None,
		'marital_status': data.get('marital_status') or None,
		'is_black_list': 1 if data.get('is_black_list') else 0,
	})
	patient.insert()

	# Set address if provided (BRD: Address required at registration)
	address_line1 = data.get('address_line1')
	city = data.get('city')
	if (address_line1 or city) and frappe.db.exists("DocType", "Address"):
		try:
			addr = frappe.get_doc({
				"doctype": "Address",
				"address_line1": address_line1 or "",
				"city": city or "",
				"state": data.get("state") or "",
				"country": data.get("country") or "",
				"pincode": data.get("pincode") or "",
				"address_type": "Billing",
				"links": [{"link_doctype": "Patient", "link_name": patient.name}],
			})
			addr.insert(ignore_permissions=True)
			frappe.db.set_value("Patient", patient.name, "patient_primary_address", addr.name)
		except Exception:
			pass
	
	# Return the created patient
	return {
		'name': patient.name,
		'patient_name': patient.patient_name,
		'file_no': patient.name
	}


@frappe.whitelist()
def get_patient_medical_history(patient):
	"""Get patient's medical history from the medical history tab"""
	if not patient:
		frappe.throw(_("Patient is required"))
	
	patient_doc = frappe.get_doc('Patient', patient)
	
	return {
		'allergies': patient_doc.allergies if hasattr(patient_doc, 'allergies') else None,
		'medication': patient_doc.medication if hasattr(patient_doc, 'medication') else None,
		'medical_history': patient_doc.medical_history if hasattr(patient_doc, 'medical_history') else None,
		'surgical_history': patient_doc.surgical_history if hasattr(patient_doc, 'surgical_history') else None,
		'occupation': patient_doc.occupation if hasattr(patient_doc, 'occupation') else None,
		'marital_status': patient_doc.marital_status if hasattr(patient_doc, 'marital_status') else None,
		'tobacco_past_use': patient_doc.tobacco_past_use if hasattr(patient_doc, 'tobacco_past_use') else None,
		'tobacco_current_use': patient_doc.tobacco_current_use if hasattr(patient_doc, 'tobacco_current_use') else None,
		'alcohol_past_use': patient_doc.alcohol_past_use if hasattr(patient_doc, 'alcohol_past_use') else None,
		'alcohol_current_use': patient_doc.alcohol_current_use if hasattr(patient_doc, 'alcohol_current_use') else None,
		'surrounding_factors': patient_doc.surrounding_factors if hasattr(patient_doc, 'surrounding_factors') else None,
		'other_risk_factors': patient_doc.other_risk_factors if hasattr(patient_doc, 'other_risk_factors') else None,
		'patient_name': patient_doc.patient_name,
		'file_no': patient_doc.name
	}


@frappe.whitelist()
def get_patient_summary(patient):
	"""Get basic patient demographic information for header cards"""
	if not patient:
		frappe.throw(_("Patient is required"))

	patient_doc = frappe.get_doc('Patient', patient)

	# Try to get blacklist info from the latest Patient Visit
	is_blacklist = 0
	last_visit = frappe.db.get_value(
		'Patient Visit',
		{'patient': patient},
		['is_blacklist'],
		as_dict=True,
		order_by='creation desc'
	)
	if last_visit and 'is_blacklist' in last_visit:
		is_blacklist = last_visit.get('is_blacklist') or 0

	return {
		'name': patient_doc.name,
		'patient_name': patient_doc.patient_name,
		'file_no': getattr(patient_doc, 'file_no', None) or patient_doc.name,
		'dob': getattr(patient_doc, 'dob', None),
		'sex': getattr(patient_doc, 'sex', None),
		'marital_status': getattr(patient_doc, 'marital_status', None),
		'mobile': getattr(patient_doc, 'mobile', None),
		'category': getattr(patient_doc, 'category', None),
		'is_blacklist': is_blacklist,
	}
