# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import nowdate, now_datetime
import json

from healthcare.api.patient_visit_practitioner import (
	enrich_patient_visit_practitioner_names,
	resolve_patient_visit_practitioner_name,
)
from healthcare.api.utils.api_utility import get_next_transaction_number
from healthcare.healthcare.doctype.patient_visit.open_visit_guard import (
	ensure_patient_can_open_new_visit,
	get_open_patient_visits_for_patient,
	is_block_new_patient_visit_if_open_exist_enabled,
)


@frappe.whitelist()
def check_can_create_patient_visit(patient=None):
	"""Portal: whether a new Patient Visit is allowed for this patient."""
	if not patient:
		return {"allowed": True, "open_visits": [], "blocking_enabled": False}
	if not is_block_new_patient_visit_if_open_exist_enabled():
		return {"allowed": True, "open_visits": [], "blocking_enabled": False}
	open_visits = get_open_patient_visits_for_patient(patient)
	return {
		"allowed": not open_visits,
		"open_visits": open_visits,
		"blocking_enabled": True,
	}


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
from healthcare.healthcare.editing_lock import assert_editing_allowed

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
			"ip_admission_no",
			"inpatient_status",
			"appointment",
			"company",
			"invoice_created"
		],
		order_by="encounter_date desc, creation desc",
		limit_page_length=500
	)

	enrich_patient_visit_practitioner_names(visits)

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
		'practitioner_name': resolve_patient_visit_practitioner_name({
			'practitioner': visit.practitioner,
			'practitioner_name': visit.practitioner_name,
			'inpatient_record': visit.inpatient_record,
			'ip_admission_no': visit.ip_admission_no,
			'patient': visit.patient,
			'appointment': visit.appointment,
		}),
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
def get_patient_visits_full(search=None, patient=None, practitioner=None, from_date=None, to_date=None, visit_type=None, status=None, limit=20, offset=0):
	"""
	Fetch patient visits with all filters and pagination.
	Returns { data: [...], total_count: N }
	"""
	from frappe.utils import cint
	limit = cint(limit) or 20
	offset = cint(offset) or 0

	filters = [["docstatus", "!=", 2]]
	if patient:
		filters.append(["patient", "=", patient])

	if search:
		filters.append(["name", "like", f"%{search}%"])

	if practitioner:
		filters.append(["practitioner", "=", practitioner])

	if visit_type:
		filters.append(["visit_type", "=", visit_type])

	if status:
		filters.append(["status", "=", status])

	if from_date:
		filters.append(["encounter_date", ">=", from_date])

	if to_date:
		filters.append(["encounter_date", "<=", to_date])

	total_count = len(frappe.get_all(
		"Patient Visit",
		filters=filters,
		fields=["name"],
		limit=0,
	))

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
			"ip_admission_no",
			"inpatient_status",
			"appointment",
			"company",
			"invoice_created"
		],
		limit=limit,
		start=offset,
		order_by="creation desc",
	)

	enrich_patient_visit_practitioner_names(visits)

	visit_names = [v.name for v in visits if v.get("name")]
	lab_amount_map = {}
	service_amount_map = {}
	pharmacy_amount_map = {}

	if visit_names:
		lab_rows = frappe.db.sql(
			"""
			SELECT
				sr.patient_visit AS visit_name,
				SUM(COALESCE(so.grand_total, 0)) AS amount
			FROM `tabService Request` sr
			INNER JOIN `tabSales Order` so
				ON (
					(so.custom_reference_type = 'Patient Visit'
						AND so.custom_reference_name = sr.patient_visit
						AND so.custom_base_reference = 'Service Request'
						AND so.custom_base_reference_name = sr.name)
					OR (so.custom_reference_type = 'Service Request'
						AND so.custom_reference_name = sr.name)
				)
			WHERE
				sr.patient_visit IN %(visit_names)s
				AND so.docstatus != 2
				AND sr.template_dt = 'Lab Test Template'
			GROUP BY sr.patient_visit
			""",
			{"visit_names": tuple(visit_names)},
			as_dict=True,
		)
		for row in lab_rows:
			lab_amount_map[row.visit_name] = float(row.amount or 0)

		service_rows = frappe.db.sql(
			"""
			SELECT
				sr.patient_visit AS visit_name,
				SUM(COALESCE(so.grand_total, 0)) AS amount
			FROM `tabService Request` sr
			INNER JOIN `tabSales Order` so
				ON (
					(so.custom_reference_type = 'Patient Visit'
						AND so.custom_reference_name = sr.patient_visit
						AND so.custom_base_reference = 'Service Request'
						AND so.custom_base_reference_name = sr.name)
					OR (so.custom_reference_type = 'Service Request'
						AND so.custom_reference_name = sr.name)
				)
			WHERE
				sr.patient_visit IN %(visit_names)s
				AND so.docstatus != 2
				AND sr.template_dt != 'Lab Test Template'
			GROUP BY sr.patient_visit
			""",
			{"visit_names": tuple(visit_names)},
			as_dict=True,
		)
		for row in service_rows:
			service_amount_map[row.visit_name] = float(row.amount or 0)

		direct_visit_charge_rows = frappe.db.sql(
			"""
			SELECT
				so.custom_reference_name AS visit_name,
				SUM(COALESCE(so.grand_total, 0)) AS amount
			FROM `tabSales Order` so
			WHERE
				so.custom_reference_name IN %(visit_names)s
				AND so.custom_reference_type = 'Patient Visit'
				AND so.custom_base_reference = 'Patient Visit'
				AND so.docstatus != 2
			GROUP BY so.custom_reference_name
			""",
			{"visit_names": tuple(visit_names)},
			as_dict=True,
		)
		for row in direct_visit_charge_rows:
			service_amount_map[row.visit_name] = service_amount_map.get(row.visit_name, 0) + float(
				row.amount or 0
			)

		ip_service_rows = frappe.db.sql(
			"""
			SELECT
				so.custom_reference_name AS visit_name,
				SUM(COALESCE(so.grand_total, 0)) AS amount
			FROM `tabSales Order` so
			WHERE
				so.custom_reference_name IN %(visit_names)s
				AND so.custom_reference_type = 'Patient Visit'
				AND so.custom_base_reference = 'IP Service'
				AND so.docstatus != 2
			GROUP BY so.custom_reference_name
			""",
			{"visit_names": tuple(visit_names)},
			as_dict=True,
		)
		for row in ip_service_rows:
			service_amount_map[row.visit_name] = service_amount_map.get(row.visit_name, 0) + float(
				row.amount or 0
			)

		pharmacy_rows = frappe.db.sql(
			"""
			SELECT
				pmo.patient_encounter AS visit_name,
				SUM(COALESCE(so.grand_total, 0)) AS amount
			FROM `tabPatient Medication Order` pmo
			INNER JOIN `tabSales Order` so
				ON (
					(so.custom_reference_type = 'Patient Visit'
						AND so.custom_reference_name = pmo.patient_encounter
						AND so.custom_base_reference = 'Patient Medication Order'
						AND so.custom_base_reference_name = pmo.name)
					OR (so.custom_base_reference = 'Patient Medication Order'
						AND so.custom_base_reference_name = pmo.name)
				)
			WHERE
				pmo.patient_encounter IN %(visit_names)s
				AND so.docstatus != 2
			GROUP BY pmo.patient_encounter
			""",
			{"visit_names": tuple(visit_names)},
			as_dict=True,
		)
		for row in pharmacy_rows:
			pharmacy_amount_map[row.visit_name] = float(row.amount or 0)

	appointment_amount_map = {}
	appointment_names = [v.appointment for v in visits if v.get("appointment")]
	if appointment_names:
		for row in frappe.get_all(
			"Patient Appointment",
			filters={"name": ["in", appointment_names]},
			fields=["name", "paid_amount"],
		):
			appointment_amount_map[row.name] = float(row.paid_amount or 0)

	return {
		"data": [
			{
				"name": v.name,
				"label": v.name,
				"patient": v.patient or '',
				"patient_name": v.patient_name or '',
				"encounter_date": str(v.encounter_date) if v.encounter_date else None,
				"practitioner_name": v.practitioner_name,
				"status": v.status,
				"lab_amount": lab_amount_map.get(v.name, 0),
				"service_amount": service_amount_map.get(v.name, 0),
				"pharmacy_amount": pharmacy_amount_map.get(v.name, 0),
				"appointment_amount": appointment_amount_map.get(v.appointment, 0)
				if v.get("appointment")
				else 0,
			}
			for v in visits
		],
		"total_count": total_count,
	}
	
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


@frappe.whitelist()
def update_patient_visit_status(visit_name, action, doc_name=None):
    assert_editing_allowed()
    ACTION_STATUS_MAP = {
        "medication_ordered": "Ordered",
        "invoice_created":    "Completed",
        "lab_test_created":   "Medication In Progress",
        "referral_created":   "External Referral",
        "cancel":             "Cancelled",
        "reopen":             "Open",
    }

    if action not in ACTION_STATUS_MAP:
        frappe.throw(
            f"Unknown action '{action}'. Valid actions: {', '.join(ACTION_STATUS_MAP.keys())}"
        )

    new_status = ACTION_STATUS_MAP[action]

    visit = frappe.get_doc("Patient Visit", visit_name)

    if visit.status == "Cancelled" and action != "reopen":
        frappe.msgprint(
            f"Patient Visit {visit_name} is Cancelled — status not changed.",
            indicator="orange",
            alert=True,
        )
        return {"updated": False, "status": visit.status}

    old_status = visit.status
    visit.status = new_status

    if action == "invoice_created":
        visit.invoice_created = 1
        visit.add_comment(
            "Info",
            f"Status changed from <b>{old_status}</b> to <b>{new_status}</b>"
            + (f" triggered by <b>{doc_name}</b>" if doc_name else ""),
        )
        visit.save(ignore_permissions=True)

        # Submit the Patient Visit if it's still in draft
        if visit.docstatus == 0:
            visit.submit()

    else:
        visit.add_comment(
            "Info",
            f"Status changed from <b>{old_status}</b> to <b>{new_status}</b>"
            + (f" triggered by <b>{doc_name}</b>" if doc_name else ""),
        )
        visit.save(ignore_permissions=True)

    return {"updated": True, "old_status": old_status, "new_status": new_status}


@frappe.whitelist()
def create_invoice(reference_doctype: str, reference_name: str):
    """
    Create a Sales Invoice combining all Sales Orders linked to a Patient Visit or Inpatient Admission.
    
    Args:
        reference_doctype: Either "Patient Visit" or "Inpatient Admission"
        reference_name: Name of the Patient Visit or Inpatient Admission document
    
    Returns:
        dict: Dictionary containing invoice name and status
    """
    if not reference_doctype or not reference_name:
        frappe.throw(_("Reference Doctype and Reference Name are required"))
    
    # Validate reference doctype
    allowed_doctypes = ["Patient Visit", "Inpatient Admission"]
    if reference_doctype not in allowed_doctypes:
        frappe.throw(_("Reference Doctype must be either Patient Visit or Inpatient Admission"))
    
    # Check if reference document exists
    if not frappe.db.exists(reference_doctype, reference_name):
        frappe.throw(_("{0} {1} does not exist").format(reference_doctype, reference_name))
    
    reference_doc = frappe.get_doc(reference_doctype, reference_name)
    # Find all Sales Orders with this reference
    sales_orders = frappe.get_all(
        "Sales Order",
        filters={
            "custom_reference_type": reference_doctype,
            "custom_reference_name": reference_name,
            # "docstatus": 0,  # Only draft Sales Orders
            # "status": "Draft"
        },
        fields=["name", "company", "customer", "patient"]
    )
    
    if not sales_orders:
        frappe.throw(_("No draft Sales Orders found for this {0}").format(reference_doctype))
    
    # Check if invoice already exists
    existing_invoice = frappe.db.exists(
        "Sales Invoice",
        {
            "custom_reference_type": reference_doctype,
            "custom_reference_name": reference_name,
            "docstatus": 0  # Draft invoice
        }
    )
    
    if existing_invoice:
        invoice = frappe.get_doc("Sales Invoice", existing_invoice)
        return {
            "sales_invoice": invoice.name,
            "status": invoice.status,
            "message": _("Invoice already exists for this {0}").format(reference_doctype)
        }
    
    # Get company from first Sales Order
    company = sales_orders[0].company
    
    # Create new Sales Invoice
    invoice = frappe.new_doc("Sales Invoice")
    invoice.company = company
    invoice.customer = sales_orders[0].customer
    invoice.patient = sales_orders[0].patient
    
    # Set transaction date
    invoice.posting_date = nowdate()
    
    # Set healthcare reference (align with Sales Order: IP/OP on custom_reference_*)
    invoice.custom_reference_type = reference_doctype
    invoice.custom_reference_name = reference_name
    invoice.custom_base_reference = reference_doctype
    invoice.custom_base_reference_name = reference_name

    # Set patient visit specific fields if applicable
    if reference_doctype == "Patient Visit":
        invoice.custom_patient_visit = reference_name
        if hasattr(reference_doc, "patient"):
            invoice.patient = reference_doc.patient
        if hasattr(reference_doc, "patient_name"):
            invoice.custom_patient_name = reference_doc.patient_name
    
    # Set inpatient admission specific fields if applicable
    if reference_doctype == "Inpatient Admission":
        invoice.custom_inpatient_admission = reference_name
        if hasattr(reference_doc, "patient"):
            invoice.patient = reference_doc.patient
        if hasattr(reference_doc, "patient_name"):
            invoice.custom_patient_name = reference_doc.patient_name
    
    # Combine items from all Sales Orders
    from healthcare.api.sales_order_cost_center import (
        apply_cost_center_to_sales_invoice,
        cost_center_from_sales_order,
        cost_center_from_visit_or_admission,
        sales_invoice_item_from_sales_order_item,
    )

    header_cc = None
    for so in sales_orders:
        sales_order_doc = frappe.get_doc("Sales Order", so.name)
        so_cc = cost_center_from_sales_order(sales_order_doc)
        if not header_cc and so_cc:
            header_cc = so_cc

        # Add items from this Sales Order
        for item in sales_order_doc.items:
            # Check if item already exists in invoice
            existing_item = None
            for inv_item in invoice.items:
                if inv_item.item_code == item.item_code and inv_item.description == item.description:
                    existing_item = inv_item
                    break

            if existing_item:
                # Combine quantities
                existing_item.qty += item.qty
            else:
                invoice.append("items", sales_invoice_item_from_sales_order_item(sales_order_doc, item))
        
        # Combine taxes from all Sales Orders
        for tax in sales_order_doc.taxes:
            existing_tax = None
            for inv_tax in invoice.taxes:
                if inv_tax.account_head == tax.account_head:
                    existing_tax = inv_tax
                    break
            
            if not existing_tax:
                invoice.append("taxes", {
                    "charge_type": tax.charge_type,
                    "account_head": tax.account_head,
                    "description": tax.description,
                    "rate": tax.rate,
                    "included_in_print_rate": tax.included_in_print_rate,
                    "included_in_paid_amount": tax.included_in_paid_amount
                })
    
    if not invoice.items:
        frappe.throw(_("No items found to create invoice"))

    if header_cc:
        apply_cost_center_to_sales_invoice(invoice, header_cc)
    else:
        visit_cc = cost_center_from_visit_or_admission(reference_doctype, reference_name)
        if visit_cc:
            apply_cost_center_to_sales_invoice(invoice, visit_cc)

    from healthcare.api.receptionist_shift import stamp_receptionist_shift_on_doc

    stamp_receptionist_shift_on_doc(invoice)
    # Insert invoice (draft)
    invoice.insert(ignore_permissions=True)
    
    # Link back to all Sales Orders
    for so in sales_orders:
        sales_order_doc = frappe.get_doc("Sales Order", so.name)
        sales_order_doc.custom_invoice_reference = invoice.name
        sales_order_doc.save(ignore_permissions=True)
    
    return {
        "sales_invoice": invoice.name,
        "status": invoice.status,
        "message": _("Invoice created successfully with {0} items from {1} sales orders").format(
            len(invoice.items), len(sales_orders)
        )
    }


@frappe.whitelist()
def create_invoice_from_visit(visit_name: str):
    """
    Create an invoice for a Patient Visit by combining all associated Sales Orders.
    
    Args:
        visit_name: Name of the Patient Visit
    
    Returns:
        dict: Dictionary containing invoice name and status
    """
    return create_invoice("Patient Visit", visit_name)



def try_create_patient_visit_for_iop_enrollment(enrollment_doc):
	"""Best-effort IOP Patient Visit when Healthcare Settings auto-create is enabled.

	Returns visit name if created or already linked, None if skipped.
	Does not raise — enrollment creation must still succeed.
	"""
	if not frappe.db.get_single_value(
		"Healthcare Settings", "auto_create_patient_visit_on_iop_enrollment"
	):
		return None

	existing_visit = frappe.db.get_value(
		"Patient Visit",
		{"iop_enrollment": enrollment_doc.name},
		"name",
	)
	if existing_visit:
		return existing_visit

	practitioner = enrollment_doc.doctor
	if not practitioner:
		from healthcare.utils import get_current_user_practitioner

		practitioner = get_current_user_practitioner()
	if not practitioner:
		frappe.log_error(
			title="IOP auto patient visit skipped",
			message=(
				f"Enrollment {enrollment_doc.name}: no doctor on enrollment and "
				f"no Healthcare Practitioner linked to user {frappe.session.user}."
			),
		)
		return None

	if (
		is_block_new_patient_visit_if_open_exist_enabled()
		and get_open_patient_visits_for_patient(enrollment_doc.patient)
	):
		frappe.log_error(
			title="IOP auto patient visit skipped",
			message=(
				f"Enrollment {enrollment_doc.name}: patient {enrollment_doc.patient} "
				"already has an open visit."
			),
		)
		return None

	encounter_date = enrollment_doc.posting_date or nowdate()
	encounter_time = now_datetime().strftime("%H:%M:%S")
	case_no = get_next_transaction_number("Patient Visit", fieldname="case_no")
	visit_doc = frappe.get_doc(
		{
			"doctype": "Patient Visit",
			"patient": enrollment_doc.patient,
			"case_no": case_no,
			"practitioner": practitioner,
			"encounter_date": encounter_date,
			"encounter_time": encounter_time,
			"visit_type": "IOP",
			"iop_enrollment": enrollment_doc.name,
			"status": "Open",
		}
	)
	visit_doc.insert(ignore_permissions=True)
	from healthcare.api.patient_visit_charge import maybe_create_iop_enrollment_visit_charge_sales_order

	cost_center = None
	if enrollment_doc.iop_day:
		cost_center = frappe.db.get_value("IOP Day", enrollment_doc.iop_day, "cost_center")

	maybe_create_iop_enrollment_visit_charge_sales_order(
		visit_doc.name,
		enrollment_doc,
		charge_visit=True,
		cost_center=cost_center,
	)
	return visit_doc.name


@frappe.whitelist()
def create_patient_visit(data):
	"""Create a new Patient Visit through backend API."""
	if isinstance(data, str):
		data = json.loads(data)

	if not data:
		frappe.throw(_("Patient Visit data is required"))

	required_fields = ["patient", "practitioner", "encounter_date", "encounter_time"]
	for field in required_fields:
		if not data.get(field):
			frappe.throw(_("{0} is required").format(field.replace("_", " ").title()))

	ensure_patient_can_open_new_visit(data.get("patient"))

	iop_enrollment = data.get("iop_enrollment")
	if iop_enrollment:
		existing_visit = frappe.db.get_value(
			"Patient Visit",
			{"iop_enrollment": iop_enrollment},
			"name",
		)
		if existing_visit:
			frappe.throw(
				_("A patient visit ({0}) is already linked to this IOP enrollment.").format(existing_visit),
				title=_("Visit Already Exists"),
			)

	case_no = get_next_transaction_number('Patient Visit', fieldname='case_no')
	visit_doc = frappe.get_doc({
		"doctype": "Patient Visit",
		"patient": data.get("patient"),
		"case_no": case_no,
		"practitioner": data.get("practitioner"),
		"encounter_date": data.get("encounter_date"),
		"encounter_time": data.get("encounter_time"),
		"visit_type": data.get("visit_type") or "New Visit",
		"appointment": data.get("appointment"),
		"iop_enrollment": data.get("iop_enrollment"),
		"status": data.get("status") or "Open",
	})

	# Optional child table rows (Patient Upload Document table on Patient Visit).
	if data.get("documents") and isinstance(data.get("documents"), list):
		for row in data.get("documents"):
			if isinstance(row, dict):
				visit_doc.append("documents", row)

	from healthcare.api.sales_order_cost_center import resolve_cost_center_for_clinical_doc

	cost_center = resolve_cost_center_for_clinical_doc(data)
	if cost_center:
		visit_doc.cost_center = cost_center

	visit_doc.insert(ignore_permissions=True)

	charge_result = None
	charge_error = None
	if iop_enrollment:
		from healthcare.api.patient_visit_charge import maybe_create_iop_enrollment_visit_charge_sales_order

		enrollment_doc = frappe.get_doc("IOP Enrollment", iop_enrollment)
		charge_info = maybe_create_iop_enrollment_visit_charge_sales_order(
			visit_doc.name,
			enrollment_doc,
			charge_visit=data.get("charge_visit"),
			cost_center=cost_center,
		)
	else:
		from healthcare.api.patient_visit_charge import maybe_create_patient_visit_charge_sales_order

		charge_info = maybe_create_patient_visit_charge_sales_order(
			visit_doc.name,
			charge_visit=data.get("charge_visit"),
			visit_type=visit_doc.visit_type,
			cost_center=cost_center,
		)
	if charge_info and charge_info.get("error"):
		charge_error = _("Visit charge order could not be created. Visit was saved.")
	elif charge_info:
		charge_result = charge_info

	frappe.db.commit()

	result = {
		"name": visit_doc.name,
		"patient": visit_doc.patient,
		"patient_name": visit_doc.patient_name,
		"status": visit_doc.status,
		"encounter_date": visit_doc.encounter_date,
		"encounter_time": visit_doc.encounter_time,
		"practitioner": visit_doc.practitioner,
		"practitioner_name": visit_doc.practitioner_name,
		"medical_department": visit_doc.medical_department,
		"visit_type": visit_doc.visit_type,
		"file_number": visit_doc.file_number,
		"inpatient_record": visit_doc.inpatient_record,
		"inpatient_status": visit_doc.inpatient_status,
		"appointment": visit_doc.appointment,
		"company": visit_doc.company,
	}
	if charge_result:
		result["sales_order"] = charge_result.get("sales_order")
		result["visit_charge_rate"] = charge_result.get("rate")
	if charge_error:
		result["visit_charge_error"] = charge_error

	return result


def _apply_patient_visit_documents(doc, documents_data):
	documents = frappe.parse_json(documents_data) if isinstance(documents_data, str) else documents_data
	if not isinstance(documents, list):
		return
	doc.set("documents", [])
	for idx, row in enumerate(documents, start=1):
		if not isinstance(row, dict):
			continue
		file_name = (row.get("file_name") or row.get("document_type") or "").strip()
		document_type = (row.get("document_type") or "").strip()
		document_url = (row.get("document") or "").strip()
		if not file_name and not document_type and not document_url:
			continue
		doc.append(
			"documents",
			{
				"idx": idx,
				"file_name": file_name or document_type or None,
				"document_type": document_type or None,
				"transaction_no": (row.get("transaction_no") or "").strip() or None,
				"upload_remarks": (row.get("upload_remarks") or "").strip() or None,
				"document": document_url or None,
			},
		)


@frappe.whitelist()
def update_patient_visit_documents(name, documents):
	"""Replace Patient Visit uploaded documents child table."""
	assert_editing_allowed()
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Patient Visit name is required"))
	if not frappe.db.exists("Patient Visit", name):
		frappe.throw(_("Patient Visit {0} not found").format(name))

	doc = frappe.get_doc("Patient Visit", name)
	_apply_patient_visit_documents(doc, documents)
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"success": True, "name": doc.name}


