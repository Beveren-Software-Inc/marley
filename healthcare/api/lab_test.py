# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _


LAB_RESULT_EDIT_ROLES = frozenset(
	("LabTest Approver", "System Manager", "Healthcare Administrator", "Administrator")
)


def _ensure_lab_result_edit_permission():
	"""LabTest Approver, System Manager, Healthcare Administrator, or Administrator may enter/adjust results."""
	roles = set(frappe.get_roles(frappe.session.user))
	if roles & LAB_RESULT_EDIT_ROLES:
		return

	frappe.throw(
		_(
			"Only users with LabTest Approver, System Manager, Healthcare Administrator, "
			"or Administrator role may enter or adjust Lab Test results."
		),
		frappe.PermissionError,
	)


@frappe.whitelist(allow_guest=False)
def get_lab_test_template_details(template):
	"""Return display/meta fields from a Lab Test Template for result-entry UI.

	Also returns normal_test_templates rows so the frontend can pre-populate
	an empty result entry table even before any results have been saved.
	"""
	if not template or not frappe.db.exists('Lab Test Template', template):
		return {}
	doc = frappe.get_doc('Lab Test Template', template)

	# Compound test rows (normal_test_templates child table on the template)
	compound_rows = []
	for r in (doc.get('normal_test_templates') or []):
		compound_rows.append({
			'lab_test_event': getattr(r, 'lab_test_event', '') or '',
			'lab_test_uom': getattr(r, 'lab_test_uom', '') or '',
			'normal_range': getattr(r, 'normal_range', '') or '',
		})

	return {
		'lab_test_template_type': doc.lab_test_template_type,
		'min_range': doc.get('min_range'),
		'max_range': doc.get('max_range'),
		'worksheet_instructions': doc.get('worksheet_instructions') or '',
		'sample_details': doc.get('sample_details') or '',
		'lab_test_uom': doc.get('lab_test_uom') or '',
		'normal_range': doc.get('lab_test_normal_range') or '',
		'normal_test_templates': compound_rows,
		'cost_center': doc.get('cost_center')
	}


# @frappe.whitelist()
# def get_lab_tests(
# 	limit=50,
# 	offset=0,
# 	patient=None,
# 	status=None,
# 	pending_review=False,
# 	is_outsourced=None,
# 	from_date=None,
# 	to_date=None,
# 	template=None,
# 	patient_type=None,
# 	by_nurse=None,
# ):
# 	"""Get list of Lab Tests with optional filters (patient, status, date range, OP/IP, template, outsourcing)."""
# 	from healthcare.api.common import get_permitted_cost_centers
# 	filters = {"docstatus": ["!=", 2]}  # Exclude cancelled

# 	if patient:
# 		filters["patient"] = patient

# 	if status:
# 		filters["status"] = status

# 	if pending_review:
# 		filters["status"] = ["in", ["Pending Review", "Submitted"]]

# 	if is_outsourced is not None:
# 		if isinstance(is_outsourced, str):
# 			is_outsourced = is_outsourced == "1"
# 		filters["is_outsourced"] = 1 if is_outsourced else 0

# 	if template:
# 		filters["template"] = template

# 	# Filter by nurse-specific lab tests based on template's by_nurse field
# 	if by_nurse is not None:
# 		if isinstance(by_nurse, str):
# 			by_nurse = by_nurse.lower() in ('1', 'true', 'yes')
# 		# Get templates that have by_nurse set to the desired value
# 		template_filters = {"by_nurse": 1 if by_nurse else 0}
# 		nurse_templates = frappe.get_all("Lab Test Template", filters=template_filters, pluck="name")
# 		if nurse_templates:
# 			filters["template"] = ["in", nurse_templates]
# 		else:
# 			# If no templates match the criteria, return empty result
# 			return []

# 	# OP / IP filter based on inpatient_record link
# 	if patient_type == "IP":
# 		filters["inpatient_record"] = ["is", "set"]
# 	elif patient_type == "OP":
# 		filters["inpatient_record"] = ["is", "not set"]

# 	# Date range filter — apply on result_date
# 	if from_date or to_date:
# 		if from_date and to_date:
# 			filters["result_date"] = ["between", [from_date, to_date]]
# 		elif from_date:
# 			filters["result_date"] = [">=", from_date]
# 		elif to_date:
# 			filters["result_date"] = ["<=", to_date]

# 	# ── Cost-centre User Permission enforcement ──────────────────────────────
# 	permitted_cc = get_permitted_cost_centers()
# 	if permitted_cc is not None:
# 		if not permitted_cc:
# 			return []
# 		filters["cost_center"] = ["in", permitted_cc]

# 	lab_tests = frappe.get_all(
# 		"Lab Test",
# 		filters=filters,
# 		fields=[
# 			"name",
# 			"docstatus",
# 			"patient",
# 			"patient_name",
# 			"practitioner",
# 			"practitioner_name",
# 			"lab_test_name",
# 			"template",
# 			"status",
# 			"result_date",
# 			"submitted_date",
# 			"approved_date",
# 			"invoiced",
# 			"department",
# 			"is_outsourced",
# 			"material_request",
# 			"amount",
# 			"grand_total",
# 			"cost_center",
# 			"min_range",
# 			"max_range",
# 			"results",
# 			"female_min_range",
# 			"female_max_range",
# 			"male_min_range",
# 			"male_max_range"

# 		],
# 		limit=limit,
# 		limit_start=offset,
# 		order_by="submitted_date desc, result_date desc",
# 	)

# 	for lab_test in lab_tests:
# 		if lab_test.patient and not lab_test.patient_name:
# 			lab_test["patient_name"] = (
# 				frappe.db.get_value("Patient", lab_test.patient, "patient_name") or lab_test.patient
# 			)
# 		if lab_test.practitioner and not lab_test.practitioner_name:
# 			lab_test["practitioner_name"] = (
# 				frappe.db.get_value("Healthcare Practitioner", lab_test.practitioner, "practitioner_name")
# 				or lab_test.practitioner
# 			)

# 	return lab_tests

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
	by_nurse=None,
):
	"""Get list of Lab Tests with optional filters (patient, status, date range, OP/IP, template, outsourcing)."""
	from healthcare.api.common import get_permitted_cost_centers
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

	# Filter by nurse-specific lab tests based on template's by_nurse field
	if by_nurse is not None:
		if isinstance(by_nurse, str):
			by_nurse = by_nurse.lower() in ('1', 'true', 'yes')
		# Get templates that have by_nurse set to the desired value
		template_filters = {"by_nurse": 1 if by_nurse else 0}
		nurse_templates = frappe.get_all("Lab Test Template", filters=template_filters, pluck="name")
		if nurse_templates:
			filters["template"] = ["in", nurse_templates]
		else:
			# If no templates match the criteria, return empty result
			return []

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

	# ── Cost-centre User Permission enforcement ──────────────────────────────
	permitted_cc = get_permitted_cost_centers()
	if permitted_cc is not None:
		if not permitted_cc:
			return []
		filters["cost_center"] = ["in", permitted_cc]

	lab_tests = frappe.get_all(
		"Lab Test",
		filters=filters,
		fields=[
			"name",
			"docstatus",
			"patient",
   'cost_center',
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
			"cost_center",
			"custom_result",
			"service_request",
			"lab_test_group",
			"is_group_lab_test",
			"lab_technician",
			"lab_technician_name",
			# "min_range",
			# "max_range",
			"results",
			"gender",
		],
		limit=limit,
		limit_start=offset,
		order_by="submitted_date desc, result_date desc",
	)

	# Fetch template details for each lab test to get gender-specific ranges
	template_cache = {}
	for lab_test in lab_tests:
		# Get patient gender for proper range selection
		patient_gender = None
		if lab_test.patient:
			patient_gender = frappe.db.get_value("Patient", lab_test.patient, "sex")
		
		# Initialize range fields with None
		lab_test["female_min_range"] = None
		lab_test["female_max_range"] = None
		lab_test["male_min_range"] = None
		lab_test["male_max_range"] = None
		lab_test['min_range'] = None
		lab_test['max_range'] = None
		
		# Fetch template details if template exists
		if lab_test.template:
			if lab_test.template not in template_cache:
				template_doc = frappe.get_doc("Lab Test Template", lab_test.template)
				template_cache[lab_test.template] = template_doc
			else:
				template_doc = template_cache[lab_test.template]
			
			# Get min/max ranges from the first normal_test_template (or aggregate as needed)
			# You might need to adjust this logic based on your requirements
			# if template_doc.normal_test_templates and len(template_doc.normal_test_templates) > 0:
			# 	first_test = template_doc.normal_test_templates[0]
			lab_test["female_min_range"] = template_doc.get("female_min_range")
			lab_test["female_max_range"] = template_doc.get("female_max_range")
			lab_test["male_min_range"] = template_doc.get("male_min_range")
			lab_test["male_max_range"] = template_doc.get("male_max_range")
			lab_test['min_range'] = template_doc.get('min_range')
			lab_test['max_range'] = template_doc.get('max_range')
		
		# Fill patient_name and practitioner_name if missing
		if lab_test.patient and not lab_test.patient_name:
			lab_test["patient_name"] = (
				frappe.db.get_value("Patient", lab_test.patient, "patient_name") or lab_test.patient
			)
		if lab_test.practitioner and not lab_test.practitioner_name:
			lab_test["practitioner_name"] = (
				frappe.db.get_value("Healthcare Practitioner", lab_test.practitioner, "practitioner_name")
				or lab_test.practitioner
			)
		if lab_test.get("lab_technician") and not (lab_test.get("lab_technician_name") or "").strip():
			lab_test["lab_technician_name"] = (
				frappe.db.get_value("Healthcare Practitioner", lab_test.lab_technician, "practitioner_name")
				or lab_test.lab_technician
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
		'cost_center': lab_test.cost_center,
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
		'lab_technician': getattr(lab_test, 'lab_technician', None),
		'lab_technician_name': getattr(lab_test, 'lab_technician_name', None),
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
	# Include normal_test_items child table (compound test results)
	normal_items = getattr(lab_test, 'normal_test_items', None) or []
	out['normal_test_items'] = [
		{
			'lab_test_name': getattr(r, 'lab_test_name', None) or '',
			'lab_test_event': getattr(r, 'lab_test_event', None) or '',
			'result_value': getattr(r, 'result_value', None) or '',
			'lab_test_uom': getattr(r, 'lab_test_uom', None) or '',
			'normal_range': getattr(r, 'normal_range', None) or '',
			'lab_test_comment': getattr(r, 'lab_test_comment', None) or '',
			'template': getattr(r, 'template', None) or '',
		}
		for r in normal_items
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
	normal_test_items=None,
	amount=None,
	discount_margin=None,
	discount=None,
	discount_amount=None,
	lab_technician=None,
	submit: bool = False,
):
	"""Save custom result/comment/worksheet/documents/normal_test_items/pricing on Lab Test and optionally submit it."""
	_ensure_lab_result_edit_permission()

	if not name:
		frappe.throw(_("Lab Test name is required"))

	doc = frappe.get_doc("Lab Test", name)

	if lab_technician is not None:
		doc.lab_technician = lab_technician or None

	if custom_result is not None:
		doc.custom_result = custom_result
	if lab_test_comment is not None:
		doc.lab_test_comment = lab_test_comment
	if worksheet_instructions is not None:
		doc.worksheet_instructions = worksheet_instructions

	# Save editable normal test result rows (result_value + lab_test_comment per row)
	if normal_test_items is not None:
		if isinstance(normal_test_items, str):
			import json
			normal_test_items = json.loads(normal_test_items)
		# Build a lookup by lab_test_event so we can update existing rows in-place
		existing = {(r.get('lab_test_event') or r.get('lab_test_name') or ''): r for r in doc.normal_test_items or []}
		for item in (normal_test_items or []):
			event_key = item.get('lab_test_event') or item.get('lab_test_name') or ''
			if event_key in existing:
				row = existing[event_key]
				if item.get('result_value') is not None:
					row.result_value = item['result_value']
				if item.get('lab_test_comment') is not None:
					row.lab_test_comment = item['lab_test_comment']
			else:
				# New row (shouldn't happen normally but handle gracefully)
				doc.append('normal_test_items', {
					'lab_test_name': item.get('lab_test_name') or event_key,
					'lab_test_event': event_key,
					'result_value': item.get('result_value') or '',
					'lab_test_uom': item.get('lab_test_uom') or '',
					'normal_range': item.get('normal_range') or '',
					'lab_test_comment': item.get('lab_test_comment') or '',
					'template': item.get('template') or '',
				})

	# Pricing updates
	if amount is not None:
		doc.amount = amount
	if discount_margin is not None:
		doc.discount_margin = discount_margin
	if discount is not None:
		doc.discount = discount
	if discount_amount is not None:
		doc.discount_amount = discount_amount

	# Auto-populate doc.results from the result_value entries in normal_test_items
	if doc.normal_test_items:
		values = [
			str(r.result_value).strip()
			for r in doc.normal_test_items
			if r.result_value is not None and str(r.result_value).strip()
		]
		if values:
			doc.results = ", ".join(values)

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
			doc.flags.ignore_permissions = True
			doc.save(ignore_permissions=True)
			doc.flags.ignore_permissions = True
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

	allowed = {"template", "practitioner", "department", "service_unit", "date", "time", "status",
			   "priority", "is_outsourced", "outsource_lab_name", "outsource_ref_no"}

	for key, value in data.items():
		if key in allowed and hasattr(doc, key):
			doc.set(key, value)

	# Auto-advance status when marking as outsourced
	if data.get("is_outsourced") and doc.status not in (
		"Testing in Progress", "Completed", "Pending Review", "Reviewed", "Approved", "Rejected", "Cancelled"
	):
		doc.status = "Testing in Progress"

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
		"is_outsourced": getattr(doc, "is_outsourced", 0),
		"outsource_lab_name": getattr(doc, "outsource_lab_name", None),
		"outsource_ref_no": getattr(doc, "outsource_ref_no", None),
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
	observation_rows: str | list | None = None,
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

	# Add observation rows if provided
	if observation_rows:
		if isinstance(observation_rows, str):
			import json
			observation_rows = json.loads(observation_rows)
		for obs in (observation_rows or []):
			if not isinstance(obs, dict):
				continue
			sample_doc.append('observation_sample_collection', {
				'sample': obs.get('sample') or row.sample,
				'sample_type': obs.get('sample_type') or '',
				'uom': obs.get('uom') or '',
				'status': obs.get('status') or 'Active',
				'observation_template': obs.get('observation_template') or '',
				'collection_date_time': obs.get('collection_date_time') or frappe.utils.now_datetime(),
				'sample_qty': frappe.utils.flt(obs.get('sample_qty') or getattr(row, 'sample_qty', 0) or 0),
				'collection_point': obs.get('collection_point') or '',
				'collected_by': obs.get('collected_by') or '',
				'medical_department': obs.get('medical_department') or '',
				'specimen': obs.get('specimen') or '',
			})

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
		doc.status = "Sample Collection in Progress"
	else:
		# All samples have a Sample Collection
		doc.status = "Sample Collected"

	doc.save(ignore_permissions=True)

	return {"sample_collection": sample_doc.name}


# healthcare/api/lab_test.py

import frappe
from frappe import _

@frappe.whitelist()
def get_lab_tests_by_inpatient_record(inpatient_record: str):
    """
    Get all lab tests for a specific inpatient admission
    """
    if not inpatient_record:
        frappe.throw(_("Inpatient record is required"))
    
    lab_tests = frappe.get_all(
        "Lab Test",
        filters={
            "inpatient_record": inpatient_record,
            "docstatus": ("!=", 2)  # Not cancelled
        },
        fields=[
            "name", "patient", "patient_name", "lab_test_name", "template",
            "status", "date", "result_date", "submitted_date", "approved_date",
            "practitioner", "practitioner_name", "department", "invoiced",
            "amount", "grand_total", "results", "descriptive_result", "lab_test_comment"
        ],
        order_by="date desc"
    )
    
    return lab_tests


@frappe.whitelist()
def get_lab_test_by_id(name: str):
    """
    Get a single lab test by ID with all details
    """
    if not name:
        frappe.throw(_("Lab test name is required"))
    
    doc = frappe.get_doc("Lab Test", name)
    
    # Get normal test items
    normal_items = []
    for item in doc.normal_test_items:
        normal_items.append({
            "lab_test_name": item.lab_test_name,
            "lab_test_event": item.lab_test_event,
            "result_value": item.result_value,
            "min_range": item.min_range,
            "max_range": item.max_range,
            "result_date": item.result_date,
            "in_range": item.in_range,
            "allow_edit": item.allow_edit
        })
    
    # Get sensitivity test items
    sensitivity_items = []
    for item in doc.sensitivity_test_items:
        sensitivity_items.append({
            "antibiotic": item.antibiotic,
            "sensitivity": item.sensitivity,
            "antibiotic_sensitivity": item.antibiotic_sensitivity
        })
    
    return {
        "name": doc.name,
        "patient": doc.patient,
        "patient_name": doc.patient_name,
        "lab_test_name": doc.lab_test_name,
        "template": doc.template,
        "status": doc.status,
        "date": doc.date,
        "result_date": doc.result_date,
        "submitted_date": doc.submitted_date,
        "approved_date": doc.approved_date,
        "practitioner": doc.practitioner,
        "practitioner_name": doc.practitioner_name,
        "department": doc.department,
        "inpatient_record": doc.inpatient_record,
        "service_unit": doc.service_unit,
        "invoiced": doc.invoiced,
        "amount": doc.amount,
        "grand_total": doc.grand_total,
        "results": doc.results,
        "descriptive_result": doc.descriptive_result,
        "lab_test_comment": doc.lab_test_comment,
        "normal_test_items": normal_items,
        "sensitivity_test_items": sensitivity_items
    }


@frappe.whitelist(allow_guest=False)
def finish_group_lab_tests(service_request_name: str):
	"""Mark grouped lab request as finished only if all child tests are completed."""
	if not service_request_name:
		frappe.throw(_("Service Request name is required"))

	if not frappe.db.exists("Service Request", service_request_name):
		frappe.throw(_("Service Request not found"))

	lab_tests = frappe.get_all(
		"Lab Test",
		filters={"service_request": service_request_name, "docstatus": ["!=", 2]},
		fields=["name", "docstatus", "status", "is_group_lab_test"],
		order_by="creation asc",
	)

	if not lab_tests:
		frappe.throw(_("No Lab Tests found for this Service Request"))

	grouped = [lt for lt in lab_tests if int(lt.get("is_group_lab_test") or 0) == 1]
	if not grouped:
		frappe.throw(_("This Service Request is not a grouped lab request"))

	done_statuses = {"Completed", "Pending Review", "Reviewed"}
	incomplete = [
		lt.get("name")
		for lt in grouped
		if int(lt.get("docstatus") or 0) != 1 or lt.get("status") not in done_statuses
	]

	if incomplete:
		frappe.throw(_("Cannot finish group. Pending tests: {0}").format(", ".join(incomplete)))

	frappe.db.set_value(
		"Service Request",
		service_request_name,
		"status",
		"completed-Request Status",
		update_modified=True,
	)

	return {"ok": True, "service_request": service_request_name, "finished": True}