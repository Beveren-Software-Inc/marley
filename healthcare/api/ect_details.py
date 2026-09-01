# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import cint
from healthcare.api.utils.api_utility import get_next_transaction_number


def _sanitize_ect_reference(reference_doctype, reference_name):
	"""Drop invalid dynamic-link pairs that cause confusing validation errors."""
	ref_dt = (reference_doctype or "").strip() or None
	ref_name = (reference_name or "").strip() or None
	if not ref_dt or not ref_name:
		return None, None
	if not frappe.db.exists("DocType", ref_dt):
		return None, None
	if not frappe.db.exists(ref_dt, ref_name):
		return None, None
	return ref_dt, ref_name


def _sanitize_practitioner_link(value):
	value = (value or "").strip() or None
	if value and frappe.db.exists("Healthcare Practitioner", value):
		return value
	return None


def _resolve_ect_cost_center(data, ref_doctype=None, ref_name=None):
	cost_center = (data.get("cost_center") or "").strip() or None
	if cost_center and frappe.db.exists("Cost Center", cost_center):
		return cost_center

	if ref_doctype and ref_name:
		from healthcare.api.sales_order_cost_center import cost_center_from_visit_or_admission

		cc = cost_center_from_visit_or_admission(ref_doctype, ref_name)
		if cc and frappe.db.exists("Cost Center", cc):
			return cc

	default_cc = frappe.defaults.get_user_default("cost_center")
	if default_cc and frappe.db.exists("Cost Center", default_cc):
		return default_cc

	frappe.throw(_("Cost Center is required"))


def _default_ect_template(data=None):
	template = ((data or {}).get("template") or "").strip()
	if template and frappe.db.exists("Patient History Template", template):
		return template
	default_name = "Default History Form"
	if frappe.db.exists("Patient History Template", default_name):
		return default_name
	return None


@frappe.whitelist()
def get_next_ect_details_trans_num():
	return get_next_transaction_number("ECT Details", fieldname="trans_num")


@frappe.whitelist()
def get_ect_details(limit=50, offset=0, patient=None):
	"""Get list of ECT Details"""
	filters = {}
	
	if patient:
		filters['patient'] = patient
	
	ect_details = frappe.get_all(
		'ECT Details',
		filters=filters,
		fields=[
			'name',
			'patient',
			'cost_center',
			'date',
			'time',
			'source',
			'duration',
			'energy',
			'_age',
			'success',
			'repeated',
			'vitals',
			'ecg',
			'anathesiologist',
			'assist_doctor',
			'psychiatrist',
			'nurse',
			'doctors_name',
			'ect_doctors_notes',
			'date_and_time',
			'nurse_name',
			'ect_nurse_notes',
			'n_date_and_time',
			'bp_1',
			'max_bp_1',
			'bp_2',
			'max_bp2',
			'propofol_detail',
			'succinycholine_detail',
			'psychology_doctor',
			'anaesthetic_doctor',
			'reference_doctype',
			'reference_name'
		],
		limit=limit,
		limit_start=offset,
		order_by='date desc, time desc'
	)
	
	# Get patient names
	for ect in ect_details:
		if ect.patient:
			patient_name = frappe.db.get_value('Patient', ect.patient, 'patient_name')
			if patient_name:
				ect['patient_name'] = patient_name

	return ect_details


@frappe.whitelist()
def get_consolidated_ect_details(limit=100, offset=0, patient=None, search=None):
	"""
	Consolidate ECT Details by patient: patient + how many ECT Detail sessions they have.
	"""
	limit = cint(limit) if limit is not None else 100
	offset = cint(offset) if offset is not None else 0
	patient = (patient or "").strip() or None
	search = (search or "").strip() or None

	conditions = ["ed.patient IS NOT NULL", "ed.patient != ''"]
	params = {}

	if patient:
		conditions.append("ed.patient = %(patient)s")
		params["patient"] = patient

	if search:
		conditions.append(
			"(ed.patient LIKE %(search)s OR IFNULL(p.patient_name, '') LIKE %(search)s)"
		)
		params["search"] = f"%{search}%"

	where_sql = " AND ".join(conditions)
	params["limit"] = limit
	params["offset"] = offset

	rows = frappe.db.sql(
		f"""
		SELECT
			ed.patient AS patient,
			COALESCE(MAX(p.patient_name), ed.patient) AS patient_name,
			COUNT(*) AS ect_count,
			MIN(ed.date) AS first_ect_date,
			MAX(ed.date) AS last_ect_date
		FROM `tabECT Details` ed
		LEFT JOIN `tabPatient` p ON p.name = ed.patient
		WHERE {where_sql}
		GROUP BY ed.patient
		ORDER BY ect_count DESC, patient_name ASC
		LIMIT %(limit)s OFFSET %(offset)s
		""",
		params,
		as_dict=True,
	)

	for row in rows:
		row["ect_count"] = cint(row.get("ect_count") or 0)

	return rows


@frappe.whitelist()
def get_ect_admissions(limit=50, offset=0, patient=None):
	"""Get list of ECT Admission"""
	filters = {}

	if patient:
		filters['patient'] = patient

	admissions = frappe.get_all(
		'ECT Admission',
		filters=filters,
		fields=[
			'name',
			'patient',
			'patient_name',
			'date',
			'bp',
			'hr',
			'resp_rate',
			'spo2',
			'doctor',
			'doctors_name',
		],
		limit=limit,
		limit_start=offset,
		order_by='date desc, creation desc'
	)

	# Ensure patient_name populated
	for adm in admissions:
		if adm.get('patient') and not adm.get('patient_name'):
			patient_name = frappe.db.get_value('Patient', adm['patient'], 'patient_name')
			if patient_name:
				adm['patient_name'] = patient_name

	return admissions


@frappe.whitelist()
def get_ect_procedures(limit=50, offset=0, patient=None):
	"""Get list of ECT Procedure"""
	filters = {}

	if patient:
		filters['patient'] = patient

	procedures = frappe.get_all(
		'ECT Procedure',
		filters=filters,
		fields=[
			'name',
			'patient',
			'patient_name',
			'date',
			'date_of_session',
			'no_of_session',
			'bp',
			'hr',
			'resp_rate',
			'spo2',
			'energy',
			'consultant_doctor',
			'assistant_doctor',
			'anaesthetist',
		],
		limit=limit,
		limit_start=offset,
		order_by='date_of_session desc, creation desc'
	)

	# Ensure patient_name populated
	for proc in procedures:
		if proc.get('patient') and not proc.get('patient_name'):
			patient_name = frappe.db.get_value('Patient', proc['patient'], 'patient_name')
			if patient_name:
				proc['patient_name'] = patient_name

	return procedures


@frappe.whitelist()
def create_ect_detail(data):
	"""Create a new ECT Details record."""
	if isinstance(data, str):
		import json
		data = json.loads(data)

	if not data.get("patient"):
		frappe.throw(_("Patient is required"))

	ref_doctype, ref_name = _sanitize_ect_reference(
		data.get("reference_doctype"), data.get("reference_name")
	)
	cost_center = _resolve_ect_cost_center(data, ref_doctype, ref_name)
	trans_num = (data.get("trans_num") or "").strip() or get_next_transaction_number(
		"ECT Details", fieldname="trans_num"
	)

	payload = {
		"doctype": "ECT Details",
		"trans_num": trans_num,
		"patient": data.get("patient"),
		"template": _default_ect_template(data),
		"cost_center": cost_center,
		"date": data.get("date") or frappe.utils.getdate(),
		"time": data.get("time") or frappe.utils.get_time(),
		"source": data.get("source") or None,
		"duration": data.get("duration"),
		"energy": data.get("energy") or None,
		"_age": data.get("_age"),
		"success": data.get("success") or None,
		"reference_doctype": ref_doctype,
		"reference_name": ref_name,
		"repeated": data.get("repeated") or None,
		"vitals": data.get("vitals") or None,
		"ecg": data.get("ecg") or None,
		"anathesiologist": data.get("anathesiologist") or None,
		"assist_doctor": data.get("assist_doctor") or None,
		"psychiatrist": data.get("psychiatrist") or None,
		"nurse": data.get("nurse") or None,
		"doctors_name": data.get("doctors_name") or None,
		"ect_doctors_notes": data.get("ect_doctors_notes") or None,
		"date_and_time": data.get("date_and_time") or None,
		"nurse_name": data.get("nurse_name") or None,
		"ect_nurse_notes": data.get("ect_nurse_notes") or None,
		"n_date_and_time": data.get("n_date_and_time") or None,
		"bp_1": data.get("bp_1") or None,
		"max_bp_1": data.get("max_bp_1") or None,
		"bp_2": data.get("bp_2") or None,
		"max_bp2": data.get("max_bp2") or None,
		"propofol_detail": data.get("propofol_detail") or None,
		"succinycholine_detail": data.get("succinycholine_detail") or None,
		"psychology_doctor": _sanitize_practitioner_link(data.get("psychology_doctor")),
		"anaesthetic_doctor": _sanitize_practitioner_link(data.get("anaesthetic_doctor")),
	}
	if frappe.get_meta("ECT Details").has_field("custom_cost_center"):
		payload["custom_cost_center"] = cost_center
	doc = frappe.get_doc(payload)
	doc.insert(ignore_permissions=True)

	return {
		"name": doc.name,
		"trans_num": doc.trans_num,
		"template": doc.template,
		"patient": doc.patient,
		"patient_name": frappe.db.get_value("Patient", doc.patient, "patient_name"),
		"cost_center": doc.cost_center,
		"date": doc.date,
		"time": doc.time,
		"energy": doc.energy,
		"duration": doc.duration,
		"success": doc.success,
	}


@frappe.whitelist()
def create_ect_admission(data):
	"""Create a new ECT Admission record."""
	if isinstance(data, str):
		import json
		data = json.loads(data)

	if not data.get("patient"):
		frappe.throw(_("Patient is required"))

	doc = frappe.get_doc({
		"doctype": "ECT Admission",
		"patient": data.get("patient"),
		"patient_name": data.get("patient_name"),
		"inpatient_admission": data.get("inpatient_admission"),
		"patient_visit": data.get("patient_visit"),
		"date": data.get("date"),
		"bp": data.get("bp"),
		"hr": data.get("hr"),
		"resp_rate": data.get("resp_rate"),
		"spo2": data.get("spo2"),
		"psychiatric_diagnosis": data.get("psychiatric_diagnosis"),
		"medical_history": data.get("medical_history"),
		"patient_allergy_history": data.get("patient_allergy_history"),
		"other_complications": data.get("other_complications"),
		"instructions": data.get("instructions"),
		"doctor": data.get("doctor"),
		"doctors_name": data.get("doctors_name"),
	})
	doc.insert(ignore_permissions=True)

	return {
		"name": doc.name,
		"patient": doc.patient,
		"patient_name": doc.patient_name,
		"date": doc.date,
	}


@frappe.whitelist()
def create_ect_procedure(data):
	"""Create a new ECT Procedure record."""
	if isinstance(data, str):
		import json
		data = json.loads(data)

	if not data.get("patient"):
		frappe.throw(_("Patient is required"))

	doc = frappe.get_doc({
		"doctype": "ECT Procedure",
		"patient": data.get("patient"),
		"patient_name": data.get("patient_name"),
		"date": data.get("date"),
		"npo_since": data.get("npo_since"),
		"consultant_doctor": data.get("consultant_doctor"),
		"assistant_doctor": data.get("assistant_doctor"),
		"anaesthetist": data.get("anaesthetist"),
		"type_of_anaesthesia": data.get("type_of_anaesthesia"),
		"date_of_session": data.get("date_of_session"),
		"no_of_session": data.get("no_of_session"),
		"bp": data.get("bp"),
		"hr": data.get("hr"),
		"temp": data.get("temp"),
		"resp_rate": data.get("resp_rate"),
		"spo2": data.get("spo2"),
		"energy": data.get("energy"),
		"gtcs_for": data.get("gtcs_for"),
		"bp_after": data.get("bp_after"),
		"hr_after": data.get("hr_after"),
		"resp_rate_after": data.get("resp_rate_after"),
		"spo2_after": data.get("spo2_after"),
		"progress_plan": data.get("progress_plan"),
		"other_complications": data.get("other_complications"),
		"sign_date": data.get("sign_date"),
		"consultant_sign_date": data.get("consultant_sign_date"),
	})
	doc.insert(ignore_permissions=True)

	return {
		"name": doc.name,
		"patient": doc.patient,
		"patient_name": doc.patient_name,
		"date": doc.date,
	}





