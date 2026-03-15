# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _

@frappe.whitelist()
def get_lab_tests(
	limit=50,
	offset=0,
	patient=None,
	status=None,
	pending_review=False,
	is_outsourced=None,
	from_date=None,
	to_date=None,
	template=None,
	patient_type=None,
):
	"""Get list of Lab Tests with optional filters (patient, status, date range, OP/IP, template, outsourcing)."""
	filters = {"docstatus": ["!=", 2]}  # Exclude cancelled

	if patient:
		filters["patient"] = patient

	if status:
		filters["status"] = status

	if pending_review:
		filters["status"] = ["in", ["Pending Review", "Submitted"]]

	if is_outsourced is not None:
		if isinstance(is_outsourced, str):
			is_outsourced = is_outsourced == "1"
		filters["is_outsourced"] = 1 if is_outsourced else 0

	if template:
		filters["template"] = template

	# OP / IP filter based on inpatient_record link
	if patient_type == "IP":
		filters["inpatient_record"] = ["is", "set"]
	elif patient_type == "OP":
		filters["inpatient_record"] = ["is", "not set"]

	# Date range filter — apply on result_date
	if from_date or to_date:
		if from_date and to_date:
			filters["result_date"] = ["between", [from_date, to_date]]
		elif from_date:
			filters["result_date"] = [">=", from_date]
		elif to_date:
			filters["result_date"] = ["<=", to_date]

	lab_tests = frappe.get_all(
		"Lab Test",
		filters=filters,
		fields=[
			"name",
			"docstatus",
			"patient",
			"patient_name",
			"practitioner",
			"practitioner_name",
			"lab_test_name",
			"template",
			"status",
			"result_date",
			"submitted_date",
			"approved_date",
			"invoiced",
			"department",
			"is_outsourced",
			"material_request",
			"amount",
			"grand_total",
		],
		limit=limit,
		limit_start=offset,
		order_by="submitted_date desc, result_date desc",
	)

	for lab_test in lab_tests:
		if lab_test.patient and not lab_test.patient_name:
			lab_test["patient_name"] = (
				frappe.db.get_value("Patient", lab_test.patient, "patient_name") or lab_test.patient
			)
		if lab_test.practitioner and not lab_test.practitioner_name:
			lab_test["practitioner_name"] = (
				frappe.db.get_value("Healthcare Practitioner", lab_test.practitioner, "practitioner_name")
				or lab_test.practitioner
			)

	return lab_tests

@frappe.whitelist()
def get_lab_test(name):
	"""Get single Lab Test by name (includes documents child table)."""
	if not name:
		frappe.throw(_("Lab Test name is required"))

	lab_test = frappe.get_doc('Lab Test', name)
	out = {
		'name': lab_test.name,
		'docstatus': lab_test.docstatus,
		'patient': lab_test.patient,
		'patient_name': lab_test.patient_name,
		'practitioner': lab_test.practitioner,
		'practitioner_name': getattr(lab_test, 'practitioner_name', None),
		'lab_test_name': lab_test.lab_test_name,
		'template': lab_test.template,
		'status': lab_test.status,
		'result_date': lab_test.result_date,
		'submitted_date': lab_test.submitted_date,
		'approved_date': getattr(lab_test, 'approved_date', None),
		'invoiced': lab_test.invoiced,
		'department': lab_test.department,
		'custom_result': getattr(lab_test, 'custom_result', None),
		'lab_test_comment': getattr(lab_test, 'lab_test_comment', None),
		'worksheet_instructions': getattr(lab_test, 'worksheet_instructions', None),
		'material_request': getattr(lab_test, 'material_request', None),
		'amount': getattr(lab_test, 'amount', None),
		'discount_margin': getattr(lab_test, 'discount_margin', None),
		'discount': getattr(lab_test, 'discount', None),
		'discount_amount': getattr(lab_test, 'discount_amount', None),
		'grand_total': getattr(lab_test, 'grand_total', None),
	}
	# Include documents child table (Patient Upload Document)
	documents = getattr(lab_test, 'documents', None) or []
	out['documents'] = [
		{
			'file_name': r.get('document_name') or r.get('file_name'),
			'document_type': r.get('document_type'),
			'transaction_no': r.get('transaction_no'),
			'upload_remarks': r.get('upload_remarks'),
			'document': r.get('document'),
		}
		for r in documents
	]
	# Include remarks child table (Remark)
	remarks_table = getattr(lab_test, 'remarks', None) or []
	out['remarks'] = [{'rrmark': getattr(r, 'rrmark', None) or ''} for r in remarks_table]
	# Include sample_instances child table
	sample_instances = getattr(lab_test, 'sample_instances', None) or []
	out['sample_instances'] = [
		{
			'sample': getattr(r, 'sample', None),
			'sample_qty': getattr(r, 'sample_qty', None),
			'sample_details': getattr(r, 'sample_details', None),
			'sample_collection': getattr(r, 'sample_collection', None),
		}
		for r in sample_instances
	]
	return out


@frappe.whitelist()
def create_lab_material_request(items, company=None, schedule_date=None, cost_center=None):
	"""Create a Material Request for lab consumables.

	`items` is expected to be a JSON list of objects with:
	- item_code
	- qty
	- warehouse (optional)
	"""
	import json

	if isinstance(items, str):
		items = json.loads(items)

	if not items:
		frappe.throw(_("No items provided to create Material Request"))

	mr = frappe.new_doc("Material Request")
	mr.material_request_type = "Material Transfer"

	if company:
		mr.company = company

	for row in items:
		if not row.get("item_code") or not row.get("qty"):
			continue

		mr_item = mr.append("items")
		mr_item.item_code = row.get("item_code")
		mr_item.qty = row.get("qty")
		if row.get("warehouse"):
			mr_item.warehouse = row.get("warehouse")
		if schedule_date:
			mr_item.schedule_date = schedule_date
		if cost_center:
			mr_item.cost_center = cost_center

	if not mr.items:
		frappe.throw(_("No valid items to create Material Request"))

	mr.insert(ignore_permissions=True)
	return mr.name


@frappe.whitelist()
def request_lab_consumables(lab_test, items, company=None, schedule_date=None):
	"""Persist requested consumables on a Lab Test and create a Material Request.

	This is intended for use from the frontend React UI.
	"""
	import json

	if isinstance(items, str):
		items = json.loads(items)

	if not lab_test:
		frappe.throw(_("Lab Test is required"))

	if not items:
		frappe.throw(_("No items provided to request consumables"))

	doc = frappe.get_doc("Lab Test", lab_test)

	# Update requested_consumables child table on Lab Test
	doc.set("requested_consumables", [])
	for row in items:
		if not row.get("item_code") or not row.get("qty"):
			continue

		child = doc.append("requested_consumables", {})
		child.item_code = row.get("item_code")
		child.item_name = row.get("item_name")
		child.qty_per_test = row.get("qty")
		child.uom = row.get("uom")
		child.warehouse = row.get("warehouse")

	doc.save(ignore_permissions=True)

	# Use Lab Test company if not explicitly provided
	if not company:
		company = doc.company

	if not schedule_date:
		schedule_date = frappe.utils.today()

	# Pass Lab Test cost center through to Material Request items
	lab_cost_center = getattr(doc, "cost_center", None)

	mr_name = create_lab_material_request(
		items,
		company=company,
		schedule_date=schedule_date,
		cost_center=lab_cost_center,
	)

	# Link MR back to Lab Test
	if mr_name:
		frappe.db.set_value("Lab Test", doc.name, "material_request", mr_name)

	return mr_name


def _apply_documents_to_doc(doc, documents):
	"""Replace doc.documents child table with the given list of dicts (Patient Upload Document shape)."""
	if documents is None:
		return
	if isinstance(documents, str):
		import json
		documents = json.loads(documents)
	doc.documents = []
	for row in (documents or []):
		if not isinstance(row, dict):
			continue
		if not (row.get('file_name') or row.get('document_name') or row.get('document')):
			continue
		user_label = row.get('file_name') or row.get('document_name') or ''
		doc_type = row.get('document_type') or None
		doc.append('documents', {
			'document_name': user_label,
			'file_name': doc_type if doc_type and frappe.db.exists('Document Type', doc_type) else None,
			'document_type': doc_type,
			'transaction_no': row.get('transaction_no') or None,
			'upload_remarks': row.get('upload_remarks') or None,
			'document': row.get('document') or None,
		})


@frappe.whitelist()
def save_and_submit_lab_test(
	name,
	custom_result=None,
	lab_test_comment=None,
	worksheet_instructions=None,
	documents=None,
	amount=None,
	discount_margin=None,
	discount=None,
	discount_amount=None,
	submit: bool = False,
):
	"""Save custom result/comment/worksheet/documents/pricing on Lab Test and optionally submit it."""
	if not name:
		frappe.throw(_("Lab Test name is required"))

	doc = frappe.get_doc("Lab Test", name)

	if custom_result is not None:
		doc.custom_result = custom_result
	if lab_test_comment is not None:
		doc.lab_test_comment = lab_test_comment
	if worksheet_instructions is not None:
		doc.worksheet_instructions = worksheet_instructions

	# Pricing updates
	if amount is not None:
		doc.amount = amount
	if discount_margin is not None:
		doc.discount_margin = discount_margin
	if discount is not None:
		doc.discount = discount
	if discount_amount is not None:
		doc.discount_amount = discount_amount

	# Recompute grand_total whenever we have an amount
	if getattr(doc, "amount", None) is not None:
		base = doc.amount or 0
		disc_amt = doc.discount_amount or 0
		if doc.discount_margin == "Percentage" and doc.discount:
			disc_amt = (base * doc.discount) / 100.0
			doc.discount_amount = disc_amt
		doc.grand_total = base - (disc_amt or 0)

	_apply_documents_to_doc(doc, documents)

	if submit:
		if doc.docstatus == 0:
			doc.save(ignore_permissions=True)
			doc.submit()
		else:
			# If already submitted, just save changes
			doc.save(ignore_permissions=True)
	else:
		doc.save(ignore_permissions=True)

	return {
		"name": doc.name,
		"docstatus": doc.docstatus,
		"status": doc.status,
		"custom_result": getattr(doc, "custom_result", None),
		"lab_test_comment": getattr(doc, "lab_test_comment", None),
		"worksheet_instructions": getattr(doc, "worksheet_instructions", None),
		"amount": getattr(doc, "amount", None),
		"discount_margin": getattr(doc, "discount_margin", None),
		"discount": getattr(doc, "discount", None),
		"discount_amount": getattr(doc, "discount_amount", None),
		"grand_total": getattr(doc, "grand_total", None),
	}


@frappe.whitelist()
def update_lab_test_remarks(name, remarks=None):
	"""Update the Remarks table on a Lab Test. remarks can be a list of dicts with key 'rrmark' (Remark child table)."""
	if not name:
		frappe.throw(_("Lab Test name is required"))
	doc = frappe.get_doc("Lab Test", name)
	if doc.docstatus == 2:
		frappe.throw(_("Cannot update a cancelled Lab Test"))
	if remarks is not None:
		if isinstance(remarks, str):
			import json
			remarks = json.loads(remarks)
		doc.remarks = []
		for row in (remarks or []):
			if not isinstance(row, dict):
				continue
			rrmark = (row.get("rrmark") or "").strip()
			if rrmark:
				doc.append("remarks", {"rrmark": rrmark})
	doc.save(ignore_permissions=True)
	out_remarks = [{"rrmark": getattr(r, "rrmark", None) or ""} for r in doc.remarks]
	return {"name": name, "remarks": out_remarks}


@frappe.whitelist()
def update_lab_test_basic(name, data=None):
	"""Update basic editable fields on a Lab Test (Draft only) from the React UI.

	Allowed fields:
	- template
	- practitioner
	- department
	- service_unit
	- date
	- time
	- status
	"""
	if not name:
		frappe.throw(_("Lab Test name is required"))

	if isinstance(data, str):
		import json
		data = json.loads(data)

	data = data or {}

	doc = frappe.get_doc("Lab Test", name)

	# Only allow editing in Draft
	if doc.docstatus != 0:
		frappe.throw(_("Only Draft lab tests can be edited from this screen"))

	allowed = {"template", "practitioner", "department", "service_unit", "date", "time", "status"}

	for key, value in data.items():
		if key in allowed and hasattr(doc, key):
			doc.set(key, value)

	doc.save(ignore_permissions=True)

	return {
		"name": doc.name,
		"patient": doc.patient,
		"patient_name": getattr(doc, "patient_name", None),
		"template": doc.template,
		"lab_test_name": getattr(doc, "lab_test_name", None),
		"practitioner": doc.practitioner,
		"practitioner_name": getattr(doc, "practitioner_name", None),
		"department": doc.department,
		"service_unit": getattr(doc, "service_unit", None),
		"date": getattr(doc, "date", None),
		"time": getattr(doc, "time", None),
		"status": doc.status,
	}


@frappe.whitelist()
def create_lab_test(data):
	"""Create a new Lab Test"""
	if isinstance(data, str):
		import json
		data = json.loads(data)
	
	# Validate required fields
	if not data.get('patient'):
		frappe.throw(_("Patient is required"))
	if not data.get('cost_center'):
		frappe.throw(_("Cost Center is required"))

	# Optional but recommended clinical context: either inpatient admission or patient visit
	# (only enforce when the fields exist in payload, so older callers are not broken)
	if not data.get('inpatient_record') and not data.get('patient_visit'):
		frappe.msgprint(
			_("It is recommended to link a Lab Test to either a Patient Visit or an Inpatient Admission for better context."),
			title=_("Missing Clinical Context"),
			indicator="orange",
		)
	
	# Fetch patient details
	patient = frappe.get_doc('Patient', data.get('patient'))
	patient_sex = patient.sex if patient.sex else None
	
	if not patient_sex:
		frappe.throw(_("Patient gender is required. Please update the patient record with gender information."))
	
	# Get naming series
	naming_series = frappe.db.get_value('Lab Test', {'naming_series': 'HLC-LAB-.YYYY.-'}, 'naming_series')
	if not naming_series:
		naming_series = 'HLC-LAB-.YYYY.-'
	
	# Create the lab test
	lab_test = frappe.get_doc({
		'doctype': 'Lab Test',
		'patient': data.get('patient'),
		'patient_sex': patient_sex,
		'cost_center': data.get('cost_center'),
		'template': data.get('template'),
		'practitioner': data.get('practitioner'),
		'date': data.get('date') or frappe.utils.today(),
		'time': data.get('time') or frappe.utils.now_time(),
		'department': data.get('department'),
		'service_unit': data.get('service_unit'),
		'status': data.get('status') or 'Draft',
		'naming_series': naming_series
	})
	
	lab_test.insert()

	# Append documents if provided (same child table as Patient/Discharge/Admission)
	documents = data.get('documents')
	if documents:
		if isinstance(documents, str):
			import json
			documents = json.loads(documents)
		for row in (documents or []):
			if not isinstance(row, dict):
				continue
			if not (row.get('file_name') or row.get('document_name') or row.get('document')):
				continue
			# file_name in Patient Upload Document is Link to "Document Type"; use document_name (Data) for display/filename
			user_label = row.get('file_name') or row.get('document_name') or ''
			doc_type = row.get('document_type') or None
			lab_test.append('documents', {
				'document_name': user_label,
				'file_name': doc_type if doc_type and frappe.db.exists('Document Type', doc_type) else None,
				'document_type': doc_type,
				'transaction_no': row.get('transaction_no') or None,
				'upload_remarks': row.get('upload_remarks') or None,
				'document': row.get('document') or None,
			})
		if lab_test.documents:
			lab_test.save(ignore_permissions=True)

	# Return the created lab test
	return {
		'name': lab_test.name,
		'patient': lab_test.patient,
		'patient_name': frappe.db.get_value('Patient', lab_test.patient, 'patient_name') or lab_test.patient,
		'practitioner': lab_test.practitioner,
		'practitioner_name': lab_test.practitioner_name if lab_test.practitioner else None,
		'lab_test_name': lab_test.lab_test_name,
		'template': lab_test.template,
		'status': lab_test.status
	}

@frappe.whitelist()
def update_lab_test_status(lab_test_name: str, new_status: str):
	"""
	Update Lab Test review status (Reviewed / Rejected)
	for already submitted Lab Tests.
	"""

	if not lab_test_name:
		frappe.throw(_("Lab Test name is required"))

	if not new_status:
		frappe.throw(_("New status is required"))

	allowed_statuses = ["Reviewed", "Rejected"]
	if new_status not in allowed_statuses:
		frappe.throw(_("Invalid status change"))

	doc = frappe.get_doc("Lab Test", lab_test_name)

	# Prevent updates on cancelled docs
	if doc.docstatus == 2:
		frappe.throw(_("Cannot update a cancelled Lab Test"))

	# Allow review only after submission
	if doc.docstatus != 1:
		frappe.throw(_("Only submitted Lab Tests can be reviewed"))

	update_values = {
		"status": new_status,
		"reviewed_by": frappe.session.user,
	}

	if new_status == "Reviewed":
		update_values["approved_date"] = frappe.utils.now_datetime()

	# ✅ Direct DB update (safe for submitted docs)
	frappe.db.set_value(
		"Lab Test",
		doc.name,
		update_values,
		update_modified=True
	)

	frappe.db.commit()

	return {
		"name": doc.name,
		"status": new_status,
		"approved_date": update_values.get("approved_date"),
		"reviewed_by": frappe.session.user,
	}


@frappe.whitelist()
def create_sample_collection_for_lab_sample(
	lab_test_name: str,
	row_index: int,
	sample_details: str | None = None,
	collection_point: str | None = None,
	referring_practitioner: str | None = None,
):
	"""Create (or return existing) Sample Collection for a specific sample_instances row on Lab Test.

	row_index is 0-based index into lab_test.sample_instances.
	"""
	if not lab_test_name:
		frappe.throw(_("Lab Test name is required"))

	try:
		row_index = int(row_index)
	except Exception:
		frappe.throw(_("Row index is required"), title=_("Invalid Input"))

	doc = frappe.get_doc("Lab Test", lab_test_name)
	rows = doc.get("sample_instances") or []
	if row_index < 0 or row_index >= len(rows):
		frappe.throw(_("Invalid sample instance row"), title=_("Invalid Row"))

	row = rows[row_index]

	# If already linked, just return existing Sample Collection
	if getattr(row, "sample_collection", None) and frappe.db.exists("Sample Collection", row.sample_collection):
		return {"sample_collection": row.sample_collection}

	if not getattr(row, "sample", None):
		frappe.throw(_("Sample is required on the selected row"))

	if not doc.patient:
		frappe.throw(_("Patient is required on Lab Test"))

	patient = frappe.get_doc("Patient", doc.patient)

	sample_doc = frappe.new_doc("Sample Collection")
	sample_doc.patient = patient.name
	sample_doc.patient_age = patient.get_age()
	sample_doc.patient_sex = patient.sex
	sample_doc.sample = row.sample
	# UOM from Lab Test Sample
	uom = frappe.db.get_value("Lab Test Sample", row.sample, "sample_uom")
	if uom:
		sample_doc.sample_uom = uom
	sample_doc.sample_qty = getattr(row, "sample_qty", 0) or 0
	# Prefer explicit sample_details from caller, fall back to row
	sample_doc.sample_details = sample_details or getattr(row, "sample_details", None)
	if doc.company:
		sample_doc.company = doc.company
	if collection_point:
		sample_doc.collection_point = collection_point
	if referring_practitioner:
		sample_doc.referring_practitioner = referring_practitioner

	sample_doc.save(ignore_permissions=True)

	# Link back to sample_instances row (and keep latest details in row)
	row.sample_collection = sample_doc.name
	if sample_details:
		row.sample_details = sample_details

	# Update Lab Test status based on how many sample instances are linked
	rows = doc.get("sample_instances") or []
	total = len(rows)
	linked = 0
	for r in rows:
		if getattr(r, "sample_collection", None):
			linked += 1

	if linked <= 0:
		# No samples collected yet
		doc.status = "Awaiting sample collection"
	elif linked < total:
		# At least one collected, but not all
		doc.status = "Sample collection in progress"
	else:
		# All samples have a Sample Collection: testing can start, but results not yet entered
		doc.status = "Sample collected"

	doc.save(ignore_permissions=True)

	return {"sample_collection": sample_doc.name}
