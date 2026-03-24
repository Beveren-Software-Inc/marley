# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt
import frappe
from frappe import _
from frappe.utils import cint


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
			OR p.id_number LIKE %(search)s
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
				OR p.id_number LIKE %(search)s
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
	print("Data received for patient creation:", data)
	
	_validate_patient_payload(data)
	patient = frappe.get_doc({
		"doctype": "Patient",
		"title": data.get("title") or None,
		# "first_name": data.get("first_name"),
		# "middle_name": data.get("middle_name") or "",
		# "last_name": data.get("last_name") or "",
		"patient_name": data.get("patient_name"),
		"file_no": data.get("file_no") or None,
		"sex": data.get("sex"),
		"dob": data.get("dob") or None,
		"blood_group": data.get("blood_group") or None,
		"mobile": data.get("mobile") or None,
		"phone": data.get("phone") or None,
		"email": data.get("email") or None,
		"id_number": data.get("id_number") or None,
		"nationality": data.get("nationality") or None,
		"category": data.get("category") or None,
		"source": data.get("source") or None,
		"marital_status": data.get("marital_status") or None,
		"is_black_list": 1 if data.get("is_black_list") else 0,
		"patient_details": data.get("remarks") or None,
		"alter_mobile_no": data.get("alternative_mobile_no_1") or None,
		"alter_2_mobile_no": data.get("alternative_mobile_no_2") or None,
		
		"is_insurance": 1 if data.get("has_insurance") else 0,
		"insurance": data.get("insurance") or None,
		"insurance_policy_no": data.get("insurance_policy") or None,
		"insurance_company_no": data.get("insurance_company_no") or None,
		"insurance_valid_till": data.get("insurance_valid_till") or None,
		"ref_no": data.get("ref_no") or None,
		"insurance_type": data.get("insurance_type") or None,
	})

	patient.insert(ignore_permissions=True)

	_add_patient_relations(patient, data)
	_setup_patient_links(patient, data)
	_add_patient_documents(patient, data)

	return {
		"name": patient.name,
		"patient_name": patient.patient_name,
		"file_no": patient.name,
	}

def _validate_patient_payload(data):

	if not data.get("first_name"):
		frappe.throw(_("First Name is required"))

	if not data.get("sex"):
		frappe.throw(_("Gender is required"))

	if not data.get("mobile") and not data.get("phone"):
		frappe.throw(_("At least one Contact No. is required"))

	if not data.get("source"):
		frappe.throw(_("Patient Referral or Source is required"))

	if not data.get("category"):
		frappe.throw(_("Patient type is required"))


from frappe.utils import cint

def _add_patient_relations(patient, data):

	relations = data.get("patient_relation") or []

	if isinstance(relations, str):
		import json
		relations = json.loads(relations) if relations.strip() else []

	for row in relations:
		if not isinstance(row, dict):
			continue

		relation = (row.get("relation") or "").strip()
		mobile_no = (row.get("mobile_no") or "").strip() or None
		email = (row.get("email") or "").strip() or None
		description = (row.get("description") or "").strip() or None
		full_name = (row.get("full_name") or "").strip() or None
		is_next_of_kin = cint(row.get("is_next_of_kin"))

		if relation or mobile_no or email or full_name or is_next_of_kin:
			patient.append("patient_relation", {
				"patient": patient.name,
				"relation": relation,
				"mobile_no": mobile_no,
				"email": email,
				"description": description,
				"full_name": full_name,
				"is_next_of_kin": is_next_of_kin,
			})

	if patient.get("patient_relation"):
		patient.save(ignore_permissions=True)

def _setup_patient_links(patient, data):

	address_line1 = (data.get("address_line1") or "").strip()
	city = (data.get("city") or "").strip()
	country = (data.get("country") or "").strip()

	if address_line1 and city:
		if not country:
			country = frappe.db.get_single_value("System Settings", "country")

		try:
			addr = frappe.get_doc({
				"doctype": "Address",
				"address_title": patient.patient_name or patient.name,
				"address_type": "Billing",
				"address_line1": address_line1,
				"address_line2": data.get("address_line2"),
				"city": city,
				"state": data.get("state"),
				"country": country,
				"pincode": data.get("pincode"),
				"is_primary_address": 1,
				"links": [{"link_doctype": "Patient", "link_name": patient.name}],
			})
			addr.insert(ignore_permissions=True)

			frappe.db.set_value(
				"Patient", patient.name,
				"patient_primary_address", addr.name
			)
		except Exception:
			frappe.log_error(frappe.get_traceback(), "Create Patient Address")

	# Customer Auto Link
	if frappe.db.get_single_value(
		"Healthcare Settings", "link_customer_to_patient"
	) and not patient.customer:
		try:
			from healthcare.healthcare.doctype.patient.patient import create_customer
			create_customer(patient)
		except Exception:
			pass

	# Contact
	try:
		patient.set_contact()
	except Exception:
		pass

def _add_patient_documents(patient, data):

	documents = data.get("patient_document") or data.get("documents") or []

	if isinstance(documents, str):
		import json
		documents = json.loads(documents) if documents.strip() else []

	for row in documents:
		if not isinstance(row, dict):
			continue

		display_name = (row.get("file_name") or "").strip()
		document_url = (row.get("document") or "").strip() or None
		document_type = (row.get("document_type") or "").strip() or None

		if not display_name and not document_url:
			continue

		if not display_name and document_url:
			display_name = document_url.split("/")[-1]

		patient.append("patient_document", {
			"document_name": display_name,
			"file_name": document_type,
			"document_type": document_type,
			"transaction_no": row.get("transaction_no"),
			"upload_remarks": row.get("upload_remarks"),
			"document": document_url,
		})

	if patient.get("patient_document"):
		patient.save(ignore_permissions=True)



@frappe.whitelist()
def get_patient_health_history_templates(search=None):
	"""Return list of Patient Health History Templates for dropdown (name + label)."""
	filters = {}
	if search:
		filters["template_name"] = ["like", f"%{search}%"]
	templates = frappe.get_all(
		"Patient Health History Template",
		filters=filters,
		fields=["name", "template_name"],
		limit=50,
		order_by="template_name",
	)
	return [{"name": t.name, "label": t.template_name or t.name} for t in templates]


@frappe.whitelist()
def get_patient_health_history_template_details(template_name: str):
	"""Return template doc with patient_history_details for creating PMH from template."""
	if not template_name:
		frappe.throw(_("Template is required"))
	doc = frappe.get_doc("Patient Health History Template", template_name)
	details = []
	for row in doc.patient_history_details or []:
		details.append({
			"attributes": row.attributes,
			"description": row.description or "",
			"yesno": row.yesno or "",
		})
	return {
		"name": doc.name,
		"template_name": doc.template_name,
		"patient_history_details": details,
	}


@frappe.whitelist()
def get_patient_medical_history(patient: str):
	"""Return Patient Medical History document (template-driven child table)."""
	if not patient:
		frappe.throw(_("Patient is required"))

	# Try to fetch the latest Patient Medical History document for this patient
	records = frappe.get_all(
		"Patient Medical History",
		filters={"patient": patient},
		fields=["name", "patient", "patient_name", "template"],
		order_by="creation desc",
		limit_page_length=1,
	)

	if not records:
		# No history yet – return a minimal payload so UI can still show an empty state
		patient_doc = frappe.get_doc("Patient", patient)
		return {
			"name": None,
			"patient": patient_doc.name,
			"patient_name": patient_doc.patient_name,
			"template": None,
			"patient_history_details": [],
		}

	doc = frappe.get_doc("Patient Medical History", records[0].name)
	return {
		"name": doc.name,
		"patient": doc.patient,
		"patient_name": getattr(doc, "patient_name", None),
		"template": getattr(doc, "template", None),
		"patient_history_details": [
			{
				"attributes": row.attributes,
				"description": row.description,
				"yesno": row.yesno,
			}
			for row in (doc.patient_history_details or [])
		],
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

	data = {
		'name': patient_doc.name,
		'patient_name': patient_doc.patient_name,
		'file_no': getattr(patient_doc, 'file_no', None) or patient_doc.name,
		'dob': getattr(patient_doc, 'dob', None),
		'sex': getattr(patient_doc, 'sex', None),
		'marital_status': getattr(patient_doc, 'marital_status', None),
		'mobile': getattr(patient_doc, 'mobile', None),
		'category': getattr(patient_doc, 'category', None),
		'is_blacklist': is_blacklist,
		"remarks": getattr(patient_doc, 'patient_details', None),
	}

	# Include patient_document child table (Patient Upload Document) for demographics / history
	try:
		documents = []
		for row in (patient_doc.get("patient_document") or []):
			documents.append({
				"name": getattr(row, "name", None),
				"document_name": getattr(row, "document_name", None),
				"file_name": getattr(row, "file_name", None),
				"document_type": getattr(row, "document_type", None),
				"transaction_no": getattr(row, "transaction_no", None),
				"upload_remarks": getattr(row, "upload_remarks", None),
				"document": getattr(row, "document", None),
			})
		data["documents"] = documents
	except Exception:
		data["documents"] = []

	return data


@frappe.whitelist()
def get_patient_history_summary(patient):
	"""Get counts and invoice summary for Patient History page: visits, admissions, paid totals, unbilled, amount to pay."""
	if not patient:
		frappe.throw(_("Patient is required"))

	# Visit count (excluding cancelled)
	visit_count = frappe.db.count(
		"Patient Visit",
		filters={"patient": patient, "docstatus": ["!=", 2]}
	)

	# Admission count (all statuses)
	admission_count = frappe.db.count(
		"Inpatient Admission",
		filters={"patient": patient}
	)

	# Invoice stats: Sales Invoice may have custom field "patient" in healthcare
	paid_invoice_count = 0
	paid_invoice_total = 0.0
	amount_to_pay = 0.0
	unbilled_count = 0

	try:
		if "patient" in (frappe.db.get_table_columns("Sales Invoice") or []):
			invoices = frappe.get_all(
				"Sales Invoice",
				filters={"patient": patient, "docstatus": 1},
				fields=["name", "grand_total", "outstanding_amount"]
			)
			paid_invoice_count = len(invoices)
			paid_invoice_total = sum((float(inv.grand_total or 0) for inv in invoices))
			amount_to_pay = sum((float(inv.outstanding_amount or 0) for inv in invoices))
	except Exception:
		pass

	try:
		pv_columns = frappe.db.get_table_columns("Patient Visit") or []
		if "invoice_created" in pv_columns:
			unbilled_count = frappe.db.count(
				"Patient Visit",
				filters={"patient": patient, "docstatus": 1, "invoice_created": 0}
			)
		elif "invoiced" in pv_columns:
			unbilled_count = frappe.db.count(
				"Patient Visit",
				filters={"patient": patient, "docstatus": 1, "invoiced": 0}
			)
	except Exception:
		pass

	return {
		"visit_count": cint(visit_count),
		"admission_count": cint(admission_count),
		"paid_invoice_count": cint(paid_invoice_count),
		"paid_invoice_total": float(paid_invoice_total),
		"unbilled_count": cint(unbilled_count),
		"amount_to_pay": float(amount_to_pay),
	}
