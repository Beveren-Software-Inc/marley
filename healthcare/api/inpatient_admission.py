# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt


import frappe
import re
from frappe import _
from frappe.utils import cint,getdate, flt
from healthcare.api.patient_visit import create_invoice
from healthcare.api.utils.api_utility import get_next_transaction_number
from healthcare.controllers.discount_validation import apply_insurance_discounts

try:
	from erpnext import get_default_currency
except ImportError:
	# Fallback if erpnext is not available
	def get_default_currency():
		return frappe.db.get_single_value('Global Defaults', 'default_currency') or 'BHD'


@frappe.whitelist()
def get_patient_active_admission(patient):
	"""Get patient's most recent active admission (Admitted or Discharge Scheduled status)."""
	if not patient:
		frappe.throw(_("Patient is required"))

	records = frappe.get_all(
		"Inpatient Admission",
		filters={
			"patient": patient,
			"status": ["in", ["Admitted", "Discharge Scheduled"]],
		},
		fields=["name", "patient", "patient_name", "status"],
		order_by="scheduled_date desc",
		limit=1,
	)

	if not records:
		return None

	rec = records[0]
	return {
		"name": rec.name,
		"patient": rec.patient,
		"patient_name": rec.patient_name,
		"status": rec.status,
	}


@frappe.whitelist()
def get_inpatient_records(status=None, search=None, patient=None, practitioner=None, from_date=None, to_date=None, limit=20, offset=0):
	"""Get list of Inpatient Admissions with optional status, search, patient, practitioner and date filters.

	Always enforces Cost Center User Permissions so that users restricted to a
	specific cost center cannot see admissions belonging to other cost centers.
	Returns { data: [...], total_count: N }
	"""
	from healthcare.api.common import get_permitted_cost_centers
	permitted_cc = get_permitted_cost_centers()
	limit = cint(limit) or 20
	offset = cint(offset) or 0

	# Use SQL path when we have search, practitioner or date filters (avoids get_all OR filter format issues)
	use_sql = bool(search or practitioner or from_date or to_date)

	if use_sql:
		conditions = ["1=1"]
		params = {}
		if patient:
			conditions.append("ia.patient = %(patient)s")
			params['patient'] = patient
		if status:
			conditions.append("ia.status = %(status)s")
			params['status'] = status
		if search:
			conditions.append("(ia.name LIKE %(search)s OR ia.patient_name LIKE %(search)s OR ia.patient LIKE %(search)s OR p.file_no LIKE %(search)s)")
			params['search'] = f'%{search}%'
		if practitioner:
			conditions.append("(ia.primary_practitioner = %(practitioner)s OR ia.secondary_practitioner = %(practitioner)s)")
			params['practitioner'] = practitioner
		if from_date:
			conditions.append("ia.scheduled_date >= %(from_date)s")
			params['from_date'] = from_date
		if to_date:
			conditions.append("ia.scheduled_date <= %(to_date)s")
			params['to_date'] = to_date

		# ── Cost-centre User Permission enforcement ──────────────────────────
		if permitted_cc is not None:
			if not permitted_cc:
				return {"data": [], "total_count": 0}
			placeholders = ", ".join(f"%(cc_{i})s" for i in range(len(permitted_cc)))
			conditions.append(f"ia.cost_center IN ({placeholders})")
			for i, cc in enumerate(permitted_cc):
				params[f"cc_{i}"] = cc

		where_sql = " AND ".join(conditions)

		count_result = frappe.db.sql("""
			SELECT COUNT(*) as cnt
			FROM `tabInpatient Admission` ia
			LEFT JOIN `tabPatient` p ON ia.patient = p.name
			WHERE """ + where_sql,
			params,
			as_dict=True
		)
		total_count = count_result[0].cnt if count_result else 0

		params['limit'] = limit
		params['offset'] = offset
		records = frappe.db.sql("""
			SELECT 
				ia.name,
				ia.patient,
				ia.patient_name,
				ia.status,
				ia.scheduled_date,
				ia.admitted_datetime,
				ia.expected_discharge,
				ia.admission_service_unit_type,
				ia.medical_department,
				ia.primary_practitioner,
				ia.secondary_practitioner,
				ia.admission_encounter,
				ia.expected_length_of_stay,
				ia.cost_center
			FROM `tabInpatient Admission` ia
			LEFT JOIN `tabPatient` p ON ia.patient = p.name
			WHERE """ + where_sql + """
			ORDER BY ia.scheduled_date DESC
			LIMIT %(limit)s OFFSET %(offset)s""",
			params,
			as_dict=True
		)
	else:
		filters = {}
		if status:
			filters['status'] = status
		if patient:
			filters['patient'] = patient

		# ── Cost-centre User Permission enforcement ──────────────────────────
		if permitted_cc is not None:
			if not permitted_cc:
				return {"data": [], "total_count": 0}
			filters['cost_center'] = ['in', permitted_cc]

		total_count = len(frappe.get_all(
			'Inpatient Admission',
			filters=filters,
			fields=['name'],
			limit=0,
		))

		records = frappe.get_all(
			'Inpatient Admission',
			filters=filters,
			fields=[
				'name',
				'patient',
				'patient_name',
				'status',
				'scheduled_date',
				'admitted_datetime',
				'expected_discharge',
				'admission_service_unit_type',
				'medical_department',
				'primary_practitioner',
				'secondary_practitioner',
				'admission_encounter',
				'expected_length_of_stay',
				'cost_center',
			],
			order_by='scheduled_date desc',
			limit=limit,
			start=offset,
		)

	return {"data": records, "total_count": total_count}


@frappe.whitelist()
def get_internal_transfers(limit=50, offset=0, patient=None, admission=None, search=None):
	"""Get Transfer Admission Event rows for internal transfer listing."""
	from healthcare.api.common import get_permitted_cost_centers
	permitted_cc = get_permitted_cost_centers()

	conditions = ["1=1"]
	params = {
		"limit": cint(limit or 50),
		"offset": cint(offset or 0),
	}

	if patient:
		conditions.append("tae.patient = %(patient)s")
		params["patient"] = patient

	if admission:
		conditions.append("tae.inpatient_admission = %(admission)s")
		params["admission"] = admission

	if search:
		conditions.append(
			"(tae.name LIKE %(search)s OR tae.patient_name LIKE %(search)s OR tae.inpatient_admission LIKE %(search)s)"
		)
		params["search"] = f"%{search}%"

	if permitted_cc is not None:
		if not permitted_cc:
			return []
		placeholders = ", ".join(f"%(cc_{i})s" for i in range(len(permitted_cc)))
		conditions.append(f"(tae.from_cost_center IN ({placeholders}) OR tae.to_cost_center IN ({placeholders}))")
		for i, cc in enumerate(permitted_cc):
			params[f"cc_{i}"] = cc

	where_sql = " AND ".join(conditions)

	rows = frappe.db.sql(
		"""
		SELECT
			tae.name,
			tae.inpatient_admission,
			tae.patient,
			tae.patient_name,
			tae.transfer_datetime,
			tae.from_cost_center,
			tae.to_cost_center,
			tae.from_service_unit,
			tae.to_service_unit,
			tae.transferred_by,
			tae.reason,
			tae.company
		FROM `tabTransfer Admission Event` tae
		WHERE """
		+ where_sql
		+ """
		ORDER BY tae.transfer_datetime DESC, tae.modified DESC
		LIMIT %(limit)s OFFSET %(offset)s
		""",
		params,
		as_dict=True,
	)

	return rows


@frappe.whitelist()
def get_inpatient_record(name):
	"""Get single Inpatient Admission by name"""
	if not name:
		frappe.throw(_("Inpatient Admission name is required"))

	record = frappe.get_doc('Inpatient Admission', name)
	
	# Get current occupancy (bed) information
	current_occupancy = None
	if record.inpatient_occupancies:
		for occupancy in record.inpatient_occupancies:
			if not occupancy.left:  # Current active occupancy
				service_unit_name = None
				if occupancy.service_unit:
					service_unit_name = frappe.db.get_value('Healthcare Service Unit', occupancy.service_unit, 'healthcare_service_unit_name')
				
				current_occupancy = {
					'service_unit': occupancy.service_unit,
					'service_unit_name': service_unit_name,
					'check_in': occupancy.check_in,
					'check_out': occupancy.check_out,
					'invoiced': occupancy.invoiced
				}
				break

	service_unit_selections = [
		{"service_unit": row.service_unit}
		for row in (getattr(record, "service_unit", None) or [])
		if getattr(row, "service_unit", None)
	]

	inpatient_occupancies_out = []
	for occ in record.inpatient_occupancies or []:
		su_label = None
		if occ.service_unit:
			su_label = frappe.db.get_value(
				"Healthcare Service Unit", occ.service_unit, "healthcare_service_unit_name"
			)
		inpatient_occupancies_out.append({
			"name": occ.name,
			"service_unit": occ.service_unit,
			"service_unit_name": su_label,
			"check_in": occ.check_in,
			"check_out": occ.check_out,
			"left": occ.left,
			"invoiced": occ.invoiced,
		})
	
	# Get charges information
	charges_info = {
		'admission_cost': record.admission_cost,
		'case_management_fee': record.case_management_fee,
		'room_charges': record.room_charges
	}
	
	# Patient relatives (guardian/relative details)
	relatives = []
	for row in getattr(record, "patient_relatives", []) or []:
		relatives.append({
			"relative_relation": getattr(row, "relative_relation", None),
			"relative_name": getattr(row, "relative_name", None),
			"relative_id_num": getattr(row, "relative_id_num", None),
			"any_remarks": getattr(row, "any_remarks", None),
		})

	return {
		'name': record.name,
		'patient': record.patient,
		'patient_name': record.patient_name,
		'status': record.status,
		'scheduled_date': record.scheduled_date,
		'admitted_datetime': record.admitted_datetime,
		'expected_discharge': record.expected_discharge,
		'admission_service_unit_type': record.admission_service_unit_type,
		'medical_department': record.medical_department,
		'primary_practitioner': record.primary_practitioner,
		'secondary_practitioner': record.secondary_practitioner,
		'admission_encounter': record.admission_encounter,
		'expected_length_of_stay': record.expected_length_of_stay,
		'patient_ip_category': getattr(record, "patient_ip_category", None),
		'bed_no': getattr(record, "bed_no", None),
		'service_unit_selections': service_unit_selections,
		'inpatient_occupancies': inpatient_occupancies_out,
		'current_occupancy': current_occupancy,
		'charges': charges_info,
		'patient_relatives': relatives,
		'gender': getattr(record, "gender", None),
		'blood_group': getattr(record, "blood_group", None),
		'dob': getattr(record, "dob", None),
		'mobile': getattr(record, "mobile", None),
		'email': getattr(record, "email", None),
		'phone': getattr(record, "phone", None),
		'company': getattr(record, "company", None),
		'cost_center': getattr(record, "cost_center", None),
		'admission_ordered_for': getattr(record, "admission_ordered_for", None),
		'admission_by_cpr': getattr(record, "admission_by_cpr", None),
		'reference_by': getattr(record, "reference_by", None),
		'admission_practitioner': getattr(record, "admission_practitioner", None),
		'admission_instruction': getattr(record, "admission_instruction", None),
		'admission_doctor_name': getattr(record, "admission_doctor_name", None),
		'admission_by_doctor': getattr(record, "admission_by_doctor", None),
		'admission_by_nm': getattr(record, "admission_by_nm", None),
		'psychologist_doctor_name': getattr(record, "psychologist_doctor_name", None),
		'psychologist_doctor': getattr(record, "psychologist_doctor", None),
		'resident_doctor_name': getattr(record, "resident_doctor_name", None),
		'residents_doctor_no': getattr(record, "residents_doctor_no", None),
		'escort': getattr(record, "escort", None),
		'guardian_name': getattr(record, "guardian_name", None),
		'contact_relationship': getattr(record, "contact_relationship", None),
		'contact_mobile': getattr(record, "contact_mobile", None),
		'contact_phone': getattr(record, "contact_phone", None),
		'contact_email': getattr(record, "contact_email", None),
		'admission_cost': getattr(record, "admission_cost", None),
		'case_management_fee': getattr(record, "case_management_fee", None),
		'room_charges': getattr(record, "room_charges", None),
		'weight': getattr(record, "weight", None),
		'height': getattr(record, "height", None),
		'blood_pressure': getattr(record, "blood_pressure", None),
		'pulse': getattr(record, "pulse", None),
		'temp': getattr(record, "temp", None),
		'resp_rate': getattr(record, "resp_rate", None),
		'general_condition': getattr(record, "general_condition", None),
		'cns': getattr(record, "cns", None),
		'cvs_resp': getattr(record, "cvs_resp", None),
		'git': getattr(record, "git", None),
		'others': getattr(record, "others", None),
		'allergies': getattr(record, "allergies", None),
		'medication_history': getattr(record, "medication_history", None),
		'medical_history': getattr(record, "medical_history", None),
		'surgical_history': getattr(record, "surgical_history", None),
		'discharge_ordered_date': getattr(record, "discharge_ordered_date", None),
		'discharge_datetime': getattr(record, "discharge_datetime", None),
		'discharge_instructions': getattr(record, "discharge_instructions", None),
		'discharge_note': getattr(record, "discharge_note", None),
		'followup_date': getattr(record, "followup_date", None),
		'discharge_practitioner': getattr(record, "discharge_practitioner", None),
	}


@frappe.whitelist()
def get_package_details(admission_no):
	"""Get Package Details for an Inpatient Admission"""
	if not admission_no:
		frappe.throw(_("Admission No is required"))

	# Get company from Inpatient Admission
	inpatient_record = frappe.get_doc('Inpatient Admission', admission_no)
	company = inpatient_record.company if hasattr(inpatient_record, 'company') and inpatient_record.company else frappe.defaults.get_user_default("Company")
	
	# Get company default currency
	default_currency = frappe.db.get_value('Company', company, 'default_currency') if company else None
	if not default_currency:
		from erpnext import get_default_currency
		default_currency = get_default_currency() or 'SAR'

	packages = frappe.get_all(
		'Package Detail',
		filters={'admission_no': admission_no},
		fields=[
			'name',
			'admission_no',
			'from_date',
			'to_date',
			'total_days',
			'transaction_amount',
			'currency',
			'vch_status',
			'remarks'
		]
	)

	# Return packages with default currency info
	return {
		'packages': packages,
		'default_currency': default_currency
	}


@frappe.whitelist()
def get_package_detail_dashboard(patient=None):
	"""Return data for Package Detail view: available Inpatient Packages, active admission, assigned package (from Quotation)."""
	# 1) Available Inpatient Packages (master list)
	available = frappe.get_all(
		'Inpatient Package',
		filters={'active': 1},
		fields=['name', 'package_name', 'package_category', 'no_of_days', 'package_rate', 'cost_center'],
		order_by='package_name',
	)
	for p in available:
		if p.get('package_category'):
			p['category_name'] = frappe.db.get_value('Room Category', p.package_category, 'room_category_name') or p.package_category

	company = frappe.defaults.get_user_default('Company')
	default_currency = frappe.db.get_value('Company', company, 'default_currency') if company else None
	if not default_currency:
		try:
			from erpnext import get_default_currency
			default_currency = get_default_currency() or 'BHD'
		except ImportError:
			default_currency = 'BHD'

	result = {
		'available_packages': available,
		'packages_available_count': len(available),
		'default_currency': default_currency,
		'active_admission': None,
		'assigned_package': None,
		'package_detail_records': [],
	}

	if not patient:
		return result

	# 2) Active admission for patient
	admission = frappe.db.get_value(
		'Inpatient Admission',
		{'patient': patient, 'status': ['in', ['Admitted', 'Discharge Scheduled']]},
		['name', 'patient', 'patient_name', 'status', 'scheduled_date', 'admitted_datetime', 'expected_discharge'],
		order_by='scheduled_date desc',
		as_dict=True,
	)
	if not admission:
		return result

	result['active_admission'] = {
		'name': admission.name,
		'patient': admission.patient,
		'patient_name': admission.patient_name,
		'status': admission.status,
		'scheduled_date': str(admission.scheduled_date) if admission.scheduled_date else None,
		'admitted_datetime': str(admission.admitted_datetime) if admission.admitted_datetime else None,
		'expected_discharge': str(admission.expected_discharge) if admission.expected_discharge else None,
	}

	# 3) Assigned package from Quotation (custom_package, custom_inpatient_admission)
	quotation = frappe.db.get_value(
		'Quotation',
		{'custom_inpatient_admission': admission.name, 'docstatus': ['<', 2]},
		['name', 'custom_package'],
		order_by='modified desc',
		as_dict=True,
	)
	if quotation and quotation.get('custom_package'):
		pkg = frappe.db.get_value(
			'Inpatient Package',
			quotation.custom_package,
			['name', 'package_name', 'no_of_days', 'package_rate'],
			as_dict=True,
		)
		result['assigned_package'] = {
			'quotation_name': quotation.name,
			'inpatient_package': quotation.custom_package,
			'package_name': pkg.package_name if pkg else quotation.custom_package,
			'no_of_days': pkg.no_of_days if pkg else None,
			'package_rate': pkg.package_rate if pkg else None,
			'admission_no': admission.name,
		}

	# 4) Package Detail records for this admission (standalone doctype Package Detail)
	pd_records = frappe.get_all(
		'Package Detail',
		filters={'admission_no': admission.name},
		fields=['name', 'admission_no', 'from_date', 'to_date', 'total_days', 'transaction_amount', 'currency', 'vch_status', 'remarks'],
		order_by='from_date desc',
	)
	result['package_detail_records'] = pd_records

	return result


@frappe.whitelist()
def get_service_units(service_unit_type=None, occupancy_status=None, search=None, room_category=None, cost_center=None):
	"""Get Healthcare Service Units with optional filters and search.

	Used by the React Admit Patient modal to pick a room/bed.
	We always restrict this to inpatient units that are currently vacant.
	"""
	# Always restrict to inpatient occupancy units
	filters = {"inpatient_occupancy": 1}
	if service_unit_type:
		filters['service_unit_type'] = service_unit_type
	if occupancy_status:
		filters['occupancy_status'] = occupancy_status
	if room_category:
		filters['room_category'] = room_category
	if cost_center:
		filters['cost_center'] = cost_center
	# If search is provided, search by name
	if search:
		query = """
			SELECT 
				name,
				healthcare_service_unit_name,
				service_unit_type,
				occupancy_status,
				company,
				room_category,
				cost_center
			FROM `tabHealthcare Service Unit`
			WHERE 
				inpatient_occupancy = 1
				AND (healthcare_service_unit_name LIKE %(search)s
				OR name LIKE %(search)s)
		"""
		params = {'search': f'%{search}%'}
		
		# Add filters
		if service_unit_type:
			query += " AND service_unit_type = %(service_unit_type)s"
			params['service_unit_type'] = service_unit_type
		if occupancy_status:
			query += " AND occupancy_status = %(occupancy_status)s"
			params['occupancy_status'] = occupancy_status
		if room_category:
			query += " AND room_category = %(room_category)s"
			params['room_category'] = room_category
		if cost_center:
			query += " AND cost_center = %(cost_center)s"
			params['cost_center'] = cost_center
		
		units = frappe.db.sql(query, params, as_dict=True)
		
		# Limit results
		units = units[:50]
	else:
		fields = [
			'name',
			'healthcare_service_unit_name',
			'service_unit_type',
			'occupancy_status',
			'company',
			'room_category',
			'cost_center'
		]
		units = frappe.get_all(
			'Healthcare Service Unit',
			filters=filters,
			fields=fields,
			limit=50
		)

	return units


def _resolve_quotation_service_unit(admission_name, explicit_service_unit=None):
	"""Pick a Healthcare Service Unit for quotation line item: explicit, then admission multiselect, then bed."""
	if explicit_service_unit:
		return explicit_service_unit
	if not admission_name:
		return None
	bed = frappe.db.get_value("Inpatient Admission", admission_name, "bed_no")
	if bed:
		su = frappe.db.get_value("Hospital Bed", bed, "service_unit")
		if su:
			return su
	rows = frappe.get_all(
		"Service Unit Multiselect",
		filters={"parent": admission_name, "parenttype": "Inpatient Admission"},
		pluck="service_unit",
		limit=1,
	)
	return rows[0] if rows else None


@frappe.whitelist()
def get_hospital_beds(
	occupancy_status=None,
	search=None,
	room_category=None,
	company=None,
	cost_center=None,
	service_units=None,
):
	"""Vacant hospital beds for admission UI (each bed links to a Healthcare Service Unit).

	If ``service_units`` is provided (list or JSON array string), only beds whose ``service_unit``
	is in that list are returned — use this after the user selects wards/units in the admit UI.
	Pass an empty list to get no beds.
	"""
	# Resolve allowed Healthcare Service Unit names (intersection of optional filters)
	allowed_su = None

	if service_units is not None:
		if isinstance(service_units, str):
			service_units = frappe.parse_json(service_units)
		if not isinstance(service_units, (list, tuple)):
			service_units = []
		allowed_su = [str(s).strip() for s in service_units if s]
		if not allowed_su:
			return []

	if cost_center:
		su_with_cc = frappe.get_all(
			"Healthcare Service Unit",
			filters={"cost_center": cost_center},
			pluck="name",
		)
		if not su_with_cc:
			return []
		if allowed_su is not None:
			allowed_su = list(set(allowed_su) & set(su_with_cc))
			if not allowed_su:
				return []
		else:
			allowed_su = su_with_cc

	filters = {"is_group": 0}
	if occupancy_status:
		filters["occupancy_status"] = occupancy_status
	else:
		filters["occupancy_status"] = "Vacant"
	if room_category:
		filters["room_category"] = room_category
	if company:
		filters["company"] = company

	if allowed_su is not None:
		filters["service_unit"] = ["in", allowed_su]

	out_fields = ["name", "bed_no", "service_unit", "occupancy_status", "room_category", "company"]

	if search:
		txt = f"%{search}%"
		occ = filters.get("occupancy_status", "Vacant")
		conditions = ["is_group = 0", "occupancy_status = %(occ)s", "(bed_no LIKE %(txt)s OR name LIKE %(txt)s)"]
		params = {"occ": occ, "txt": txt}
		if room_category:
			conditions.append("room_category = %(room_category)s")
			params["room_category"] = room_category
		if company:
			conditions.append("company = %(company)s")
			params["company"] = company
		if filters.get("service_unit"):
			su_list = filters["service_unit"][1]
			if not su_list:
				return []
			placeholders = ", ".join(f"%(su{i})s" for i in range(len(su_list)))
			conditions.append(f"service_unit in ({placeholders})")
			for i, n in enumerate(su_list):
				params[f"su{i}"] = n
		where_sql = " AND ".join(conditions)
		return frappe.db.sql(
			f"""
			select name, bed_no, service_unit, occupancy_status, room_category, company
			from `tabHospital Bed`
			where {where_sql}
			order by bed_no asc
			limit 50
			""",
			params,
			as_dict=True,
		)

	return frappe.get_all(
		"Hospital Bed",
		filters=filters,
		fields=out_fields,
		order_by="bed_no asc",
		limit=50,
	)


@frappe.whitelist()
def add_patient_visitor(admission: str, visitors_name: str, relationship_with_patient: str, cpr__id_no: str | None = None, any_remarks: str | None = None):
	"""Append a Patient Visitor row to an Inpatient Admission and return the created row."""
	if not admission:
		frappe.throw(_("Inpatient Admission is required"))
	if not visitors_name:
		frappe.throw(_("Visitor name is required"))
	if not relationship_with_patient:
		frappe.throw(_("Relationship with patient is required"))

	doc = frappe.get_doc("Inpatient Admission", admission)

	row = doc.append("patient_visitors", {
		"visitors_name": visitors_name,
		"relationship_with_patient": relationship_with_patient,
		"cpr__id_no": cpr__id_no,
		"any_remarks": any_remarks,
		"entered_by": frappe.session.user,
		"entered_date": frappe.utils.today(),
	})

	doc.save(ignore_permissions=True)

	return {
		"name": row.name,
		"visitors_name": row.visitors_name,
		"relationship_with_patient": row.relationship_with_patient,
		"cpr__id_no": row.cpr__id_no,
		"any_remarks": row.any_remarks,
		"entered_by": row.entered_by,
		"entered_date": row.entered_date,
	}


@frappe.whitelist()
def create_and_submit_discharge(admission_name, discharge_data):
    """Create and submit a Discharge document from Inpatient Admission"""
    
    try:
        discharge_data = frappe.parse_json(discharge_data or {})
        trans_no = get_next_transaction_number('Discharge')
        if not admission_name:
            frappe.throw(_("Admission is required"))
            
        frappe.logger().info(f"Creating discharge for admission {admission_name}")
        
        # Prevent duplicate discharge
        existing_discharge = frappe.db.get_value(
            "Discharge", {"admission": admission_name}, "name"
        )
        if existing_discharge:
            frappe.throw(
                _("Discharge already exists for this admission: {0}").format(
                    frappe.get_desk_link("Discharge", existing_discharge)
                )
            )
        
        from healthcare.healthcare.doctype.inpatient_admission.inpatient_admission import (
            create_discharge_from_inpatient_admission,
        )
        discharge_doc = create_discharge_from_inpatient_admission(admission_name)
        
        CHILD_TABLES = {"patient_documents", "patient_document", "discharge_checklist", 
                       "nursing_checklist", "patient_relatives"}  # Add nursing_checklist
        
        for key, value in discharge_data.items():
            if key in CHILD_TABLES:
                continue
            if hasattr(discharge_doc, key) and value not in (None, ""):
                discharge_doc.set(key, value)
        
        # Handle discharge checklist
        checklist = frappe.parse_json(discharge_data.get("discharge_checklist") or [])
        if isinstance(checklist, list) and checklist:
            discharge_doc.set("discharge_checklist", [])
            for idx, row in enumerate(checklist, start=1):
                if not isinstance(row, dict):
                    continue
                discharge_doc.append("discharge_checklist", {
                    "idx": idx,
                    "action_required": (row.get("action_required") or "").strip() or None,
                    "department": (row.get("department") or "").strip() or None,
                    "user": (row.get("user") or "").strip() or None,
                    "name1": (row.get("name1") or "").strip() or None,
                    "date_time": (row.get("date_time") or "").strip() or None,
                    "click": cint(row.get("click") or 0),
                    "description": (row.get("description") or "").strip() or None,
                })
        
        # Handle nursing checklist (NEW)
        nursing_checklist = frappe.parse_json(discharge_data.get("nursing_checklist") or [])
        if isinstance(nursing_checklist, list) and nursing_checklist:
            discharge_doc.set("nursing_checklist", [])
            for idx, row in enumerate(nursing_checklist, start=1):
                if not isinstance(row, dict):
                    continue
                discharge_doc.append("nursing_checklist", {
                    "idx": idx,
                    "action_required": (row.get("action_required") or "").strip() or None,
                    "department": (row.get("department") or "").strip() or None,
                    "user": (row.get("user") or "").strip() or None,
                    "name1": (row.get("name1") or "").strip() or None,
                    "date_time": (row.get("date_time") or "").strip() or None,
                    "click": cint(row.get("click") or 0),
                    "description": (row.get("description") or "").strip() or None,
                })
        
        # Handle patient documents
        documents = frappe.parse_json(
            discharge_data.get("patient_documents")
            or discharge_data.get("patient_document")
            or []
        )
        if isinstance(documents, list) and documents:
            discharge_doc.set("patient_documents", [])
            for idx, row in enumerate(documents, start=1):
                if not isinstance(row, dict):
                    continue
                discharge_doc.append("patient_documents", {
                    "idx": idx,
                    "file_name": (row.get("file_name") or "").strip() or None,
                    "document_type": (row.get("document_type") or "").strip() or None,
                    "transaction_no": (row.get("transaction_no") or "").strip() or None,
                    "upload_remarks": (row.get("upload_remarks") or "").strip() or None,
                    "document": (row.get("document") or "").strip() or None,
                })
        
        # Handle patient relatives
        relatives = frappe.parse_json(discharge_data.get("patient_relatives") or [])
        if isinstance(relatives, list) and relatives:
            discharge_doc.set("patient_relatives", [])
            for row in relatives:
                if not isinstance(row, dict):
                    continue
                child = discharge_doc.append("patient_relatives", {})
                for key in ("relationship_with_patient", "relative_name", "cpr__id_no", 
                           "any_remarks", "relative_phone_no", "relative_alternative_phone_no", 
                           "relative_alternative_phone_no_2"):
                    if key in row:
                        value = (row.get(key) or "").strip()
                        if value:
                            child.set(key, value)
        
        discharge_doc.save(ignore_permissions=True)
        if cint(discharge_doc.docstatus) == 0:
            discharge_doc.submit()
        
        return {
            "name": discharge_doc.name,
            "message": _("Discharge created and submitted successfully"),
        }
        
    except Exception as e:
        import traceback
        error_message = str(e)
        frappe.log_error(traceback.format_exc(), "Create Discharge Error")
        
        # Clean message for frontend
        clean_message = re.sub(r"<[^>]+>", "", error_message)
        clean_message = re.sub(r"\s+", " ", clean_message).strip()
        
        # Frappe-friendly throw
        frappe.throw(_("Failed to create discharge: {0}").format(clean_message))

@frappe.whitelist()
def admit_patient(
	name,
	service_unit=None,
	check_in=None,
	expected_discharge=None,
	patient_ip_category=None,
	patient_documents=None,
	patient_relatives=None,
	service_units=None,
	hospital_bed=None,
	inpatient_package=None,
	rate_per_day=None,
	standard_package=None,
):
	"""Admit a patient - wrapper for the DocType method"""
	if not name:
		frappe.throw(_("Inpatient Admission name is required"))
	if not check_in:
		frappe.throw(_("Check In datetime is required"))

	record = frappe.get_doc("Inpatient Admission", name)

	# Update patient IP category if provided
	if patient_ip_category:
		record.patient_ip_category = patient_ip_category

	# Set package fields if provided
	if inpatient_package and inpatient_package != '__custom__':
		record.inpatient_package = inpatient_package
	if rate_per_day is not None:
		record.rate_per_day = flt(rate_per_day)
	if standard_package is not None:
		record.standard_package = cint(standard_package)

	# Table MultiSelect: apply before admit so occupancy rows are built correctly
	service_unit_list = frappe.parse_json(service_units or [])
	if isinstance(service_unit_list, list) and service_unit_list:
		record.set("service_unit", [])
		for su_name in service_unit_list:
			if su_name:
				record.append("service_unit", {"service_unit": su_name})

	if hospital_bed:
		record.bed_no = hospital_bed

	# Perform admit (sets status, occupancy, hospital bed, service units)
	record.admit(service_unit, check_in, expected_discharge)

	# Save patient documents if provided (stored as e-signatures)
	documents = frappe.parse_json(patient_documents or [])
	if isinstance(documents, list) and documents:
		record.set("e_signatures", [])
		for idx, row in enumerate(documents, start=1):
			if not isinstance(row, dict):
				continue
			record.append(
				"e_signatures",
				{
					"idx": idx,
					"file_name": (row.get("document_type") or "").strip() or None,
					"document_type": (row.get("document_type") or "").strip() or None,
					"transaction_no": (row.get("transaction_no") or "").strip() or None,
					"upload_remarks": (row.get("upload_remarks") or "").strip() or None,
					"document": (row.get("document") or "").strip() or None,
				},
			)

	# Save patient relatives (guardians) if provided.
	# IP Patient Relative child table uses: relationship_with_patient (required), relative_name, cpr__id_no, any_remarks
	relatives = frappe.parse_json(patient_relatives or [])
	if isinstance(relatives, list) and relatives:
		record.set("patient_relatives", [])
		for row in relatives:
			if not isinstance(row, dict):
				continue
			# Map frontend keys to child doctype field names
			relation = (row.get("relationship_with_patient") or row.get("relative_relation") or "").strip()
			name_val = (row.get("relative_name") or "").strip()
			id_no = (row.get("cpr__id_no") or row.get("relative_id_num") or "").strip()
			relative_phone_no = (row.get("relative_phone_no") or "").strip()
	
			relative_alternative_phone_no = (row.get("relative_alternative_phone_no") or "").strip()
			relative_alternative_phone_no_2 = (row.get("relative_alternative_phone_no_2") or "").strip()
			remarks = (row.get("any_remarks") or "").strip()
			# Skip empty rows; child doctype requires relationship_with_patient
			if not relation:
				continue
			child = record.append("patient_relatives", {})
			child.relationship_with_patient = relation
			if name_val:
				child.relative_name = name_val
			if id_no:
				child.cpr__id_no = id_no
			if remarks:
				child.any_remarks = remarks
			if relative_phone_no:
				child.relative_phone_no = relative_phone_no
			if relative_alternative_phone_no:
				child.relative_alternative_phone_no = relative_alternative_phone_no
			if relative_alternative_phone_no_2:
				child.relative_alternative_phone_no_2 = relative_alternative_phone_no_2

	record.save(ignore_permissions=True)
	frappe.db.commit()

	return {
		"success": True,
		"message": _("Patient admitted successfully"),
		"name": record.name,
	}



@frappe.whitelist()
def create_admission_quotation(admission_name, package_name, days, total_amount, service_unit=None):
	"""Create a Draft Quotation for admission with package"""
	
	if not admission_name:
		frappe.throw(_("Inpatient Admission name is required"))
	if not package_name:
		frappe.throw(_("Package name is required"))
	if not days or days <= 0:
		frappe.throw(_("Number of days must be greater than 0"))
	if not total_amount or total_amount <= 0:
		frappe.throw(_("Total amount must be greater than 0"))

	service_unit = _resolve_quotation_service_unit(admission_name, explicit_service_unit=service_unit)
	if not service_unit:
		frappe.throw(
			_(
				"Could not determine a service unit for the quotation. Select at least one service unit or a hospital bed with a unit."
			)
		)

	# Get admission record
	admission = frappe.get_doc('Inpatient Admission', admission_name)
	patient = admission.patient
	company = admission.company or frappe.defaults.get_user_default("Company")
	
	if not company:
		frappe.throw(_("Company is required. Please set company in admission or user defaults."))
	
	# Get patient customer
	customer = frappe.db.get_value('Patient', patient, 'customer')
	if not customer:
		frappe.throw(_("Patient {0} does not have a linked customer").format(patient))
	
	# Get package details
	is_custom = package_name == '__custom__'
	package = None if is_custom else frappe.get_doc('Inpatient Package', package_name)

	# Get service unit (room) name
	service_unit_name = frappe.db.get_value(
		'Healthcare Service Unit',
		service_unit,
		'healthcare_service_unit_name'
	) or service_unit
	
	item_code = service_unit_name
	
	# Check if item exists
	if not frappe.db.exists('Item', item_code):
		
		item_group = (
			frappe.db.get_value('Item Group', {'name': 'Services'}) or
			frappe.db.get_value('Item Group', {'name': 'All Item Groups'}) or
			frappe.db.get_value('Item Group', {}, 'name')
		)
		
		uom = (
			frappe.db.exists("UOM", "Unit") or
			frappe.db.get_single_value("Stock Settings", "stock_uom") or
			"Unit"
		)
		
		item = frappe.get_doc({
			"doctype": "Item",
			"item_code": item_code,
			"item_name": service_unit_name,
			"item_group": item_group or "All Item Groups",
			"description": f"Room: {service_unit_name}",
			"is_sales_item": 1,
			"is_service_item": 1,
			"is_purchase_item": 0,
			"is_stock_item": 0,
			"stock_uom": uom,
			"disabled": 0,
		})
		item.insert(ignore_permissions=True, ignore_mandatory=True)
	
	# ✅ Create Quotation instead of Sales Order
	quotation = frappe.new_doc("Quotation")
	quotation.patient = patient
	quotation.party_name = frappe.db.get_value('Customer', patient, 'customer_name') or customer
	quotation.company = company
	quotation.transaction_date = getdate()
	quotation.valid_till = getdate()
	quotation.custom_package = package_name if not is_custom else None
	quotation.custom_inpatient_admission= admission_name
	quotation.custom_reference_type = "Inpatient Admission"
	quotation.custom_reference_name = admission_name
	
	# Add item
	item_row = quotation.append("items", {})
	item_row.item_code = item_code
	item_row.item_name = service_unit_name
	package_label = "Custom Package" if is_custom else package.package_name
	item_row.description = (
		f"Inpatient Package: {package_label} - "
		f"Room: {service_unit_name} ({days} days)"
	)
	item_row.qty = 1
	item_row.rate = flt(total_amount)
	item_row.amount = flt(total_amount)
	
	if not is_custom and package.cost_center:
		item_row.cost_center = package.cost_center
	
	# Link to admission if field exists
	if hasattr(quotation, 'inpatient_admission'):
		quotation.inpatient_admission = admission_name
	
	# Set missing values
	quotation.set_missing_values(for_validate=True)
	
	# ✅ Save only (Draft)
	quotation.flags.ignore_mandatory = True
	quotation.calculate_taxes_and_totals()
	# from healthcare.controllers.discount_validation import apply_insurance_discounts
	# apply_insurance_discounts(quotation)
	quotation.save(ignore_permissions=True)
	
	
	return {
		'success': True,
		'quotation_name': quotation.name,
		'message': _('Quotation {0} created successfully (Draft)').format(quotation.name)
	}


@frappe.whitelist()
def check_admission_quotation(admission_name, package_name):
	"""Check if a quotation already exists for this admission and package"""
	
	if not admission_name or not package_name:
		return {'exists': False}
	
	# Check for existing quotation
	existing = frappe.db.get_value(
		'Quotation',
		{
			'custom_inpatient_admission': admission_name,
			'custom_package': package_name,
			'docstatus': ['<', 2]  # Not cancelled
		},
		['name'],
		as_dict=True
	)
	
	if existing:
		return {
			'exists': True,
			'quotation_name': existing.name
		}
	
	return {'exists': False}


@frappe.whitelist()
def create_invoice_from_inpatient_admission(inpatient_admission_name: str):
    """
    Create an invoice for an Inpatient Admission by combining all associated Sales Orders.
    
    Args:
        inpatient_admission_name: Name of the Inpatient Admission
    
    Returns:
        dict: Dictionary containing invoice name and status
    """
    return create_invoice("Inpatient Admission", inpatient_admission_name)