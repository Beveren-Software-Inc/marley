# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt


import frappe
import re
from frappe import _
from datetime import timedelta

from frappe.utils import cint, flt, format_timedelta, get_datetime, getdate
from healthcare.api.patient_visit import create_invoice
from healthcare.api.utils.api_utility import get_next_transaction_number
from healthcare.controllers.discount_validation import apply_insurance_discounts
from healthcare.healthcare.doctype.observation.observation import vacate_active_observation_rooms_for_patient

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
		fields=["name", "patient", "patient_name", "status", "cost_center", "company"],
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
		"cost_center": rec.get("cost_center"),
		"company": rec.get("company"),
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

	# Use SQL path when we have search, practitioner, date, or status filters (avoids get_all OR filter format issues)
	use_sql = bool(search or practitioner or from_date or to_date or status)

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
			"relative_relation": getattr(row, "relationship_with_patient", None) or getattr(row, "relative_relation", None),
			"relationship_with_patient": getattr(row, "relationship_with_patient", None) or getattr(row, "relative_relation", None),
			"relative_name": getattr(row, "relative_name", None),
			"relative_id_num": getattr(row, "cpr__id_no", None) or getattr(row, "relative_id_num", None),
			"cpr__id_no": getattr(row, "cpr__id_no", None) or getattr(row, "relative_id_num", None),
			"relative_phone_no": getattr(row, "relative_phone_no", None),
			"relative_alternative_phone_no": getattr(row, "relative_alternative_phone_no", None),
			"relative_alternative_phone_no_2": getattr(row, "relative_alternative_phone_no_2", None),
			"relation_email": getattr(row, "relation_email", None),
			"any_remarks": getattr(row, "any_remarks", None),
		})

	visitors = []
	for row in getattr(record, "patient_visitors", []) or []:
		visitors.append({
			"name": row.name,
			"visitors_name": row.visitors_name,
			"relationship_with_patient": row.relationship_with_patient,
			"cpr__id_no": row.cpr__id_no,
			"any_remarks": row.any_remarks,
			"entered_by": row.entered_by,
			"entered_date": row.entered_date,
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
		'patient_visitors': visitors,
		'signature': getattr(record, "signature", None),
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
		'admission_nursing_checklist_template': getattr(record, "admission_nursing_checklist_template", None),
		'discharge_nursing_checklist_template': getattr(record, "discharge_nursing_checklist_template", None),
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
		su = frappe.db.get_value("Bed No", bed, "service_unit")
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
def get_bed_numbers(
	occupancy_status=None,
	search=None,
	cost_center=None,
	service_units=None,
):
	"""Vacant Bed No records for admission UI (each links to a Healthcare Service Unit / room).

	If ``service_units`` is provided (list or JSON array string), only beds in those rooms are returned.
	Pass an empty list to get no beds.
	"""
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

	occ = occupancy_status or "Vacant"
	out_fields = ["name", "bed_no", "service_unit", "occupancy_status"]

	if search:
		txt = f"%{search}%"
		conditions = ["occupancy_status = %(occ)s", "(bed_no LIKE %(txt)s OR name LIKE %(txt)s)"]
		params = {"occ": occ, "txt": txt}
		if allowed_su is not None:
			placeholders = ", ".join(f"%(su{i})s" for i in range(len(allowed_su)))
			conditions.append(f"service_unit in ({placeholders})")
			for i, n in enumerate(allowed_su):
				params[f"su{i}"] = n
		where_sql = " AND ".join(conditions)
		return frappe.db.sql(
			f"""
			SELECT name, bed_no, service_unit, occupancy_status
			FROM `tabBed No`
			WHERE {where_sql}
			ORDER BY bed_no ASC
			LIMIT 50
			""",
			params,
			as_dict=True,
		)

	filters = {"occupancy_status": occ}
	if allowed_su is not None:
		filters["service_unit"] = ["in", allowed_su]

	return frappe.get_all(
		"Bed No",
		filters=filters,
		fields=out_fields,
		order_by="bed_no asc",
		limit=50,
	)


@frappe.whitelist()
def get_hospital_beds(
	occupancy_status=None,
	search=None,
	room_category=None,
	company=None,
	cost_center=None,
	service_units=None,
):
	"""Backward-compatible alias — returns Bed No records for the admission UI."""
	return get_bed_numbers(
		occupancy_status=occupancy_status,
		search=search,
		cost_center=cost_center,
		service_units=service_units,
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


DISCHARGE_PORTAL_ROLES = frozenset(
	{
		"Administrator",
		"System Manager",
		"Healthcare Administrator",
		"Website Manager",
		"Reception",
		"Receptionist",
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


def _user_can_access_discharge_portal() -> bool:
	if frappe.session.user in ("Guest", ""):
		return False
	return bool(DISCHARGE_PORTAL_ROLES & set(frappe.get_roles(frappe.session.user)))


def _ensure_discharge_admission_access(admission_name: str) -> None:
	"""Portal discharge APIs: allow clinical/reception roles without Inpatient Admission DocPerm."""
	admission_name = (admission_name or "").strip()
	if not admission_name:
		frappe.throw(_("Admission is required"))

	if not frappe.db.exists("Inpatient Admission", admission_name):
		frappe.throw(_("Inpatient Admission {0} not found").format(admission_name))

	if frappe.has_permission("Inpatient Admission", "read", admission_name):
		return

	if not _user_can_access_discharge_portal():
		frappe.throw(
			_("You need the 'read' permission on Inpatient Admission {0} to perform this action.").format(
				admission_name
			),
			frappe.PermissionError,
		)

	from healthcare.api.common import get_permitted_cost_centers

	permitted_cc = get_permitted_cost_centers()
	if permitted_cc is None:
		return

	if not permitted_cc:
		frappe.throw(_("Not permitted to access this admission"), frappe.PermissionError)

	admission_cc = frappe.db.get_value("Inpatient Admission", admission_name, "cost_center")
	if admission_cc and admission_cc not in permitted_cc:
		frappe.throw(_("Not permitted to access this admission"), frappe.PermissionError)


DISCHARGE_CHILD_TABLE_KEYS = frozenset(
	{
		"patient_documents",
		"patient_document",
		"discharge_checklist",
		"nursing_checklist",
		"patient_relatives",
	}
)

DISCHARGE_PORTAL_SCALAR_FIELDS = (
	"discharge_type",
	"ama_type",
	"discharge_date",
	"discharge_time",
	"final_discharge_date",
	"final_discharge_time",
	"discharged_by_user",
	"final_discharge_user_id",
	"receiving_doctors",
	"discharge_receptionist",
	"discharge_doctor",
	"discharge_nurse",
	"discharge_template",
	"nurse_discharge_template",
	"discharge_treatment_plan",
	"discharge_reason",
	"discharge_diagnosis",
	"discharge_conditions",
	"discharge_instructions",
	"final_exam_mental_status_summary",
	"management_in_hospital",
	"prognosis",
	"next_appointment_date",
	"next_appointment_time",
	"nurse_discharge_template",
)


def _get_submitted_discharge_name(admission_name: str) -> str | None:
	return frappe.db.get_value(
		"Discharge",
		{"admission": admission_name, "docstatus": 1},
		"name",
	)


def _get_draft_discharge_name(admission_name: str) -> str | None:
	
	data =  frappe.db.get_value(
		"Discharge",
		{"admission": admission_name, "docstatus": 0},
		"name",
	)
	return data


def _apply_discharge_payload(discharge_doc, discharge_data: dict) -> None:
	"""Apply portal discharge form JSON onto a Discharge document (draft or before submit)."""
	discharge_data = discharge_data or {}

	for key, value in discharge_data.items():
		if key in DISCHARGE_CHILD_TABLE_KEYS:
			continue
		if hasattr(discharge_doc, key) and value not in (None, ""):
			discharge_doc.set(key, value)

	# Only replace child tables when the portal sends them. Doctors/reception do not
	# have the Nursing tab; an empty nursing_checklist in their payload must not wipe
	# rows nurses already completed on the same draft.
	if "discharge_checklist" in discharge_data:
		checklist = frappe.parse_json(discharge_data.get("discharge_checklist") or [])
		discharge_doc.set("discharge_checklist", [])
		if isinstance(checklist, list):
			for idx, row in enumerate(checklist, start=1):
				if not isinstance(row, dict):
					continue
				discharge_doc.append(
					"discharge_checklist",
					{
						"idx": idx,
						"action_required": (row.get("action_required") or "").strip() or None,
						"department": (row.get("department") or "").strip() or None,
						"user": (row.get("user") or "").strip() or None,
						"name1": (row.get("name1") or "").strip() or None,
						"date_time": (row.get("date_time") or "").strip() or None,
						"click": cint(row.get("click") or 0),
						"description": (row.get("description") or "").strip() or None,
					},
				)

	if "nursing_checklist" in discharge_data:
		nursing_checklist = frappe.parse_json(discharge_data.get("nursing_checklist") or [])
		discharge_doc.set("nursing_checklist", [])
		if isinstance(nursing_checklist, list):
			for idx, row in enumerate(nursing_checklist, start=1):
				if not isinstance(row, dict):
					continue
				discharge_doc.append(
					"nursing_checklist",
					{
						"idx": idx,
						"action_required": (row.get("action_required") or "").strip() or None,
						"department": (row.get("department") or "").strip() or None,
						"department_name": (row.get("department_name") or row.get("department_label") or "Nursing").strip()
						or "Nursing",
						"user": (row.get("user") or "").strip() or None,
						"name1": (row.get("name1") or "").strip() or None,
						"date_time": (row.get("date_time") or "").strip() or None,
						"click": cint(row.get("click") or 0),
						"description": (row.get("description") or "").strip() or None,
						"sr_num": (row.get("sr_num") or "").strip() or str(idx),
						"cr_id": (row.get("cr_id") or "").strip() or None,
						"cr_date": (row.get("cr_date") or "").strip() or None,
						"up_id": (row.get("up_id") or "").strip() or None,
						"up_date": (row.get("up_date") or "").strip() or None,
						"auto_create": (row.get("auto_create") or "").strip() or None,
					},
				)

	documents = frappe.parse_json(
		discharge_data.get("patient_documents") or discharge_data.get("patient_document") or []
	)
	discharge_doc.set("patient_documents", [])
	if isinstance(documents, list):
		for idx, row in enumerate(documents, start=1):
			if not isinstance(row, dict):
				continue
			if not (row.get("file_name") or row.get("document") or row.get("document_type")):
				continue
			discharge_doc.append(
				"patient_documents",
				{
					"idx": idx,
					"file_name": (row.get("file_name") or "").strip() or None,
					"document_type": (row.get("document_type") or "").strip() or None,
					"transaction_no": (row.get("transaction_no") or "").strip() or None,
					"upload_remarks": (row.get("upload_remarks") or "").strip() or None,
					"document": (row.get("document") or "").strip() or None,
				},
			)

	relatives = frappe.parse_json(discharge_data.get("patient_relatives") or [])
	discharge_doc.set("patient_relatives", [])
	if isinstance(relatives, list):
		for row in relatives:
			if not isinstance(row, dict):
				continue
			child = discharge_doc.append("patient_relatives", {})
			for key in (
				"relationship_with_patient",
				"relative_name",
				"cpr__id_no",
				"any_remarks",
				"relative_phone_no",
				"relative_alternative_phone_no",
				"relative_alternative_phone_no_2",
			):
				if key in row:
					value = (row.get(key) or "").strip()
					if value:
						child.set(key, value)


def _portal_dt_string(value) -> str:
	if not value:
		return ""
	from frappe.utils import get_datetime

	try:
		return get_datetime(value).strftime("%Y-%m-%dT%H:%M")
	except Exception:
		return str(value)


def _portal_date_string(value) -> str:
	if not value:
		return ""
	return str(getdate(value))


def _portal_time_string(value) -> str:
	if not value:
		return ""
	if isinstance(value, timedelta):
		return format_timedelta(value)
	return str(value)


def _portal_scalar_string(value) -> str:
	if value is None or value == "":
		return ""
	if isinstance(value, timedelta):
		return _portal_time_string(value)
	return str(value)


def _serialize_checklist_row(row, default_department: str = "") -> dict:
	"""Map discharge or nursing checklist child row for the portal."""
	dept = (getattr(row, "department", None) or "") or default_department
	raw_dt = getattr(row, "date_time", None)
	if raw_dt:
		date_time = _portal_dt_string(raw_dt)
	else:
		date_time = ""
	return {
		"name": row.name or f"row-{getattr(row, 'idx', 0)}",
		"action_required": getattr(row, "action_required", None) or "",
		"department": dept,
		"department_label": dept or default_department,
		"user": getattr(row, "user", None) or "",
		"name1": getattr(row, "name1", None) or "",
		"date_time": date_time,
		"click": bool(getattr(row, "click", 0)),
		"description": getattr(row, "description", None) or "",
	}


def _serialize_checklist_rows(rows, default_department: str = "") -> list[dict]:
	return [_serialize_checklist_row(row, default_department) for row in (rows or [])]


def _serialize_discharge_draft_for_portal(discharge_doc) -> dict:
	form_data = {}
	for field in DISCHARGE_PORTAL_SCALAR_FIELDS:
		val = discharge_doc.get(field)
		if field == "discharge_date":
			# Portal uses datetime-local; append midnight when doctype stores Date only.
			d = _portal_date_string(val)
			form_data[field] = f"{d}T00:00" if d else ""
		elif field in ("final_discharge_date", "next_appointment_date"):
			form_data[field] = _portal_date_string(val)
		elif field == "final_discharge_time":
			form_data[field] = _portal_time_string(val)
		else:
			form_data[field] = _portal_scalar_string(val)
	return {
		"name": discharge_doc.name,
		"docstatus": discharge_doc.docstatus,
		"form_data": form_data,
		"discharge_checklist": _serialize_checklist_rows(discharge_doc.get("discharge_checklist")),
		"nursing_checklist": _serialize_checklist_rows(
			discharge_doc.get("nursing_checklist"), default_department="Nursing"
		),
		"patient_documents": [
			{
				"file_name": row.file_name or "",
				"document_type": row.document_type or "",
				"transaction_no": row.transaction_no or "",
				"upload_remarks": row.upload_remarks or "",
				"document": row.document or "",
			}
			for row in (discharge_doc.get("patient_documents") or [])
		],
		"patient_relatives": [
			{
				"relationship_with_patient": row.relationship_with_patient or "",
				"relative_name": row.relative_name or "",
				"relative_phone_no": row.relative_phone_no or "",
				"relative_alternative_phone_no": row.relative_alternative_phone_no or "",
				"relative_alternative_phone_no_2": row.relative_alternative_phone_no_2 or "",
				"cpr__id_no": row.cpr__id_no or "",
				"any_remarks": row.any_remarks or "",
			}
			for row in (discharge_doc.get("patient_relatives") or [])
		],
	}


def _get_or_create_draft_discharge(admission_name: str):
	from healthcare.healthcare.doctype.inpatient_admission.inpatient_admission import (
		create_discharge_from_inpatient_admission,
	)

	_ensure_discharge_admission_access(admission_name)

	if _get_submitted_discharge_name(admission_name):
		frappe.throw(_("This admission has already been discharged."))

	draft_name = _get_draft_discharge_name(admission_name)
	if draft_name:
		return frappe.get_doc("Discharge", draft_name, ignore_permissions=True)

	return create_discharge_from_inpatient_admission(
		admission_name,
		ignore_permissions=True,
	)


@frappe.whitelist()
def get_discharge_draft_for_admission(admission_name):
	"""Return draft Discharge (docstatus 0) for portal resume, or null."""
	if not admission_name:
		frappe.throw(_("Admission is required"))

	_ensure_discharge_admission_access(admission_name)

	draft_name = _get_draft_discharge_name(admission_name)
	if not draft_name:
		return None
	
	discharge_doc = frappe.get_doc("Discharge", draft_name, ignore_permissions=True)
	
	return _serialize_discharge_draft_for_portal(discharge_doc)


@frappe.whitelist()
def save_discharge_draft(admission_name, discharge_data):
	"""Create or update a draft Discharge without submitting."""
	if not admission_name:
		frappe.throw(_("Admission is required"))

	discharge_data = frappe.parse_json(discharge_data or {})
	discharge_doc = _get_or_create_draft_discharge(admission_name)
	_apply_discharge_payload(discharge_doc, discharge_data)
	# Nursing Checklist Template names may be stored in nurse_discharge_template (Link → DNT).
	discharge_doc.flags.ignore_links = True
	discharge_doc.save(ignore_permissions=True)
	frappe.db.commit()

	return {
		"name": discharge_doc.name,
		"message": _("Discharge draft saved"),
	}


@frappe.whitelist()
def create_and_submit_discharge(admission_name, discharge_data):
	"""Create or update draft Discharge, then submit."""
	try:
		discharge_data = frappe.parse_json(discharge_data or {})
		if not admission_name:
			frappe.throw(_("Admission is required"))

		frappe.logger().info(f"Creating discharge for admission {admission_name}")

		discharge_doc = _get_or_create_draft_discharge(admission_name)
		_apply_discharge_payload(discharge_doc, discharge_data)
		discharge_doc.flags.ignore_links = True
		discharge_doc.save(ignore_permissions=True)
		if cint(discharge_doc.docstatus) == 0:
			discharge_doc.flags.ignore_permissions = True
			discharge_doc.submit()

		return {
			"name": discharge_doc.name,
			"message": _("Discharge created and submitted successfully"),
		}

	except Exception as e:
		import traceback

		error_message = str(e)
		frappe.log_error(traceback.format_exc(), "Create Discharge Error")

		clean_message = re.sub(r"<[^>]+>", "", error_message)
		clean_message = re.sub(r"\s+", " ", clean_message).strip()

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
	bed_no=None,
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

	selected_bed = bed_no or hospital_bed
	if selected_bed:
		record.bed_no = selected_bed

	# Perform admit (sets status, occupancy, bed no, service units)
	record.admit(service_unit, check_in, expected_discharge)

	admitted_service_units = []
	if service_unit:
		admitted_service_units.append(service_unit)
	if isinstance(service_unit_list, list):
		admitted_service_units.extend([u for u in service_unit_list if u])
	for row in record.get("service_unit") or []:
		su_name = getattr(row, "service_unit", None) or (row.get("service_unit") if isinstance(row, dict) else None)
		if su_name:
			admitted_service_units.append(su_name)
	vacate_active_observation_rooms_for_patient(
		record.patient,
		exclude_service_units=admitted_service_units,
		dc_date=check_in,
	)

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


def _apply_patient_relatives(doc, relatives_data):
	relatives = frappe.parse_json(relatives_data) if isinstance(relatives_data, str) else relatives_data
	if not isinstance(relatives, list):
		return

	doc.set("patient_relatives", [])
	for row in relatives:
		if not isinstance(row, dict):
			continue
		relation = (row.get("relationship_with_patient") or row.get("relative_relation") or "").strip()
		if not relation:
			continue
		child = doc.append("patient_relatives", {})
		child.relationship_with_patient = relation
		name_val = (row.get("relative_name") or "").strip()
		if name_val:
			child.relative_name = name_val
		id_no = (row.get("cpr__id_no") or row.get("relative_id_num") or "").strip()
		if id_no:
			child.cpr__id_no = id_no
			child.relative_id_no = id_no
		phone = (row.get("relative_phone_no") or "").strip()
		if phone:
			child.relative_phone_no = phone
		alt_phone = (row.get("relative_alternative_phone_no") or "").strip()
		if alt_phone:
			child.relative_alternative_phone_no = alt_phone
		alt_phone_2 = (row.get("relative_alternative_phone_no_2") or "").strip()
		if alt_phone_2:
			child.relative_alternative_phone_no_2 = alt_phone_2
		email = (row.get("relation_email") or "").strip()
		if email:
			child.relation_email = email
		remarks = (row.get("any_remarks") or "").strip()
		if remarks:
			child.any_remarks = remarks
		child.entered_by = row.get("entered_by") or frappe.session.user
		child.entered_date = row.get("entered_date") or frappe.utils.today()


def _apply_patient_visitors(doc, visitors_data):
	visitors = frappe.parse_json(visitors_data) if isinstance(visitors_data, str) else visitors_data
	if not isinstance(visitors, list):
		return

	doc.set("patient_visitors", [])
	for row in visitors:
		if not isinstance(row, dict):
			continue
		visitor_name = (row.get("visitors_name") or "").strip()
		relationship = (row.get("relationship_with_patient") or "").strip()
		if not visitor_name or not relationship:
			continue
		child = doc.append("patient_visitors", {})
		child.visitors_name = visitor_name
		child.relationship_with_patient = relationship
		id_no = (row.get("cpr__id_no") or "").strip()
		if id_no:
			child.cpr__id_no = id_no
		remarks = (row.get("any_remarks") or "").strip()
		if remarks:
			child.any_remarks = remarks
		child.entered_by = row.get("entered_by") or frappe.session.user
		child.entered_date = row.get("entered_date") or frappe.utils.today()


@frappe.whitelist()
def update_inpatient_admission(name, data):
	"""Update editable fields on a scheduled or admitted Inpatient Admission."""
	if isinstance(data, str):
		data = frappe.parse_json(data) if data else {}
	if not name:
		frappe.throw(_("Admission name is required"))

	doc = frappe.get_doc("Inpatient Admission", name)
	if doc.status not in ("Admission Scheduled", "Admitted"):
		frappe.throw(_("Only scheduled or admitted admissions can be edited"))

	# Frontend aliases
	if data.get("consultant_doctor"):
		data["primary_practitioner"] = data.pop("consultant_doctor")
	if data.get("residents_doctor"):
		data["residents_doctor_no"] = data.pop("residents_doctor")

	allowed_fields = {
		"company",
		"cost_center",
		"medical_department",
		"primary_practitioner",
		"psychologist_doctor",
		"residents_doctor_no",
		"admission_ordered_for",
		"expected_length_of_stay",
		"admission_instruction",
		"admission_nursing_checklist_template",
		"scheduled_date",
	}

	for key, value in data.items():
		if key not in allowed_fields:
			continue
		if value is None or value == "":
			continue
		doc.set(key, value)

	if "patient_relatives" in data:
		_apply_patient_relatives(doc, data.get("patient_relatives"))

	if "patient_visitors" in data:
		_apply_patient_visitors(doc, data.get("patient_visitors"))

	if "signature" in data:
		doc.signature = data.get("signature") or ""

	practitioner = doc.get("primary_practitioner")
	if practitioner:
		doc.admission_by_doctor = practitioner
		practitioner_name = frappe.db.get_value(
			"Healthcare Practitioner", practitioner, "practitioner_name"
		)
		if practitioner_name:
			doc.admission_doctor_name = practitioner_name

	if doc.get("psychologist_doctor"):
		psych_name = frappe.db.get_value(
			"Healthcare Practitioner", doc.psychologist_doctor, "practitioner_name"
		)
		if psych_name:
			doc.psychologist_doctor_name = psych_name

	if doc.get("residents_doctor_no"):
		res_name = frappe.db.get_value(
			"Healthcare Practitioner", doc.residents_doctor_no, "practitioner_name"
		)
		if res_name:
			doc.resident_doctor_name = res_name

	doc.save(ignore_permissions=True)
	frappe.db.commit()

	return get_inpatient_record(doc.name)