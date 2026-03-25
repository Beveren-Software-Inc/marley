# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import nowdate


@frappe.whitelist()
def get_patient_visits(status=None, search=None, patient=None):
	"""Get list of Patient Visits with optional status, search, and patient filter"""
	filters = {}
	if status:
		filters['status'] = status
	if patient:
		filters['patient'] = patient

	if search:
		# Search by visit name, patient name, file number, or practitioner
		visits = frappe.db.sql("""
			SELECT 
				pv.name,
				pv.patient,
				pv.patient_name,
				pv.status,
				pv.encounter_date,
				pv.encounter_time,
				pv.practitioner,
				pv.practitioner_name,
				pv.medical_department,
				pv.visit_type,
				pv.file_number,
				pv.inpatient_record
			FROM `tabPatient Visit` pv
			LEFT JOIN `tabPatient` p ON pv.patient = p.name
			WHERE 
				(%(patient)s IS NULL OR pv.patient = %(patient)s)
				AND (
					pv.name LIKE %(search)s
					OR pv.patient_name LIKE %(search)s
					OR pv.patient LIKE %(search)s
					OR p.file_no LIKE %(search)s
					OR pv.practitioner_name LIKE %(search)s
					OR pv.practitioner LIKE %(search)s
				)
		""", {
			'search': f'%{search}%',
			'patient': patient
		}, as_dict=True)
		
		# Apply status filter if provided
		if status:
			visits = [v for v in visits if v.status == status]
		
		# Sort by encounter_date desc
		visits.sort(key=lambda x: x.encounter_date or '', reverse=True)
	else:
		visits = frappe.get_all(
			'Patient Visit',
			filters=filters,
			fields=[
				'name',
				'patient',
				'patient_name',
				'status',
				'encounter_date',
				'encounter_time',
				'practitioner',
				'practitioner_name',
				'medical_department',
				'visit_type',
				'file_number',
				'inpatient_record'
			],
			order_by='encounter_date desc, encounter_time desc'
		)

	return visits


import frappe
from frappe import _

@frappe.whitelist()
def get_patient_visits(
	status: str = None,
	search: str = None,
	patient: str = None,
	visit_name: str = None,
	practitioner: str = None,
	from_date: str = None,
	to_date: str = None
):
	"""
	Get list of Patient Visits with optional filters:
	:param status: Visit status ('Open', 'Ordered', 'Completed', 'Cancelled')
	:param search: Search term for patient name or visit name
	:param patient: Filter by patient ID
	:param visit_name: Filter by specific visit name
	:param practitioner: Filter by healthcare practitioner
	:param from_date: Filter visits from this date (YYYY-MM-DD)
	:param to_date: Filter visits up to this date (YYYY-MM-DD)
	"""
	filters = {}

	if status:
		filters["status"] = status
	if patient:
		filters["patient"] = patient
	if visit_name:
		filters["name"] = visit_name
	if practitioner:
		filters["practitioner"] = practitioner
	if from_date:
		filters["encounter_date"] = [">=", from_date]
	if to_date:
		if "encounter_date" in filters:
			# Already has a ">=" filter, so use between
			filters["encounter_date"] = ["between", [from_date, to_date]]
		else:
			filters["encounter_date"] = ["<=", to_date]

	# Use Frappe ORM to get visits
	visits = frappe.get_all(
		"Patient Visit",
		filters=filters,
		fields=[
			"name",
			"patient",
			"patient_name",
			"status",
			"encounter_date",
			"encounter_time",
			"practitioner",
			"practitioner_name",
			"medical_department",
			"visit_type",
			"file_number",
			"inpatient_record",
			"inpatient_status",
			"appointment",
			"company",
			"invoice_created"
		],
		order_by="encounter_date desc, creation desc",
		limit_page_length=500
	)

	# Optional: further search filtering
	if search:
		search_lower = search.lower()
		visits = [
			v for v in visits
			if search_lower in (v.get("patient_name") or "").lower()
			or search_lower in (v.get("name") or "").lower()
		]

	return visits


@frappe.whitelist()
def get_patient_visit(name):
	"""Get single Patient Visit by name"""
	if not name:
		frappe.throw(_("Patient Visit name is required"))

	visit = frappe.get_doc('Patient Visit', name)
	# Base fields
	data = {
		'name': visit.name,
		'patient': visit.patient,
		'patient_name': visit.patient_name,
		'status': visit.status,
		'encounter_date': visit.encounter_date,
		'encounter_time': visit.encounter_time,
		'practitioner': visit.practitioner,
		'practitioner_name': visit.practitioner_name,
		'medical_department': visit.medical_department,
		'visit_type': visit.visit_type,
		'file_number': visit.file_number,
		'inpatient_record': visit.inpatient_record,
		'inpatient_status': visit.inpatient_status,
		'appointment': visit.appointment,
		'company': visit.company
	}

	# Attach uploaded documents from the Patient Visit's "documents" child table
	try:
		documents = []
		for row in (visit.get("documents") or []):
			documents.append({
				"name": row.name,
				"document_name": getattr(row, "document_name", None),
				"file_name": getattr(row, "file_name", None),
				"document_type": getattr(row, "document_type", None),
				"transaction_no": getattr(row, "transaction_no", None),
				"upload_remarks": getattr(row, "upload_remarks", None),
				"document": getattr(row, "document", None),
			})
		if documents:
			data["documents"] = documents
	except Exception:
		# Do not block details view if something goes wrong with documents
		pass

	return data
 
# healthcare/api/common.py

@frappe.whitelist()
def get_patient_visits_full(search=None, patient=None, practitioner=None, from_date=None, to_date=None, limit=50):
	"""
	Fetch patient visits with all filters:
	- search: filters by visit name
	- patient: filters by patient
	- practitioner: filters by practitioner
	- from_date / to_date: filters by encounter date
	"""
	filters = [["docstatus", "!=", 2]]
	if patient:
		filters.append(["patient", "=", patient])

	if search:
		filters.append(["name", "like", f"%{search}%"])

	if practitioner:
		filters.append(["practitioner", "=", practitioner])

	if from_date:
		filters.append(["encounter_date", ">=", from_date])

	if to_date:
		filters.append(["encounter_date", "<=", to_date])

	visits = frappe.get_all(
		"Patient Visit",
		filters=filters,
		fields=[
			"name",
			"patient",
			"patient_name",
			"status",
			"encounter_date",
			"encounter_time",
			"practitioner",
			"practitioner_name",
			"medical_department",
			"visit_type",
			"file_number",
			"inpatient_record",
			"inpatient_status",
			"appointment",
			"company",
			"invoice_created"
		],
		limit=limit,
		order_by="creation desc",
	)

	return [
		{
			"name": v.name,
			"label": f"{v.name} - {v.patient_name or v.patient or ''}",
			"patient": v.patient or '',
			"patient_name": v.patient_name or '',
			"encounter_date": str(v.encounter_date) if v.encounter_date else None,
			"practitioner_name": v.practitioner_name,
			"status": v.status,
		}
		for v in visits
	]
	
@frappe.whitelist()
def cancel_patient_visit(visit_name: str, reason_for_cancel: str = None):
	"""
	Cancel a Patient Visit with a reason and trigger standard document cancellation
	:param visit_name: Name of the Patient Visit
	:param reason_for_cancel: Reason for cancelling the visit
	"""
	if not visit_name:
		frappe.throw(_("Visit name is required"))

	visit = frappe.get_doc("Patient Visit", visit_name)

	visit.reason_for_cancel = reason_for_cancel

	visit.save(ignore_permissions=True)

	if visit.docstatus == 1:  
		visit.cancel()
	else:
		visit.status = "Cancelled"
		visit.save(ignore_permissions=True)

	frappe.db.commit()

	return "success"