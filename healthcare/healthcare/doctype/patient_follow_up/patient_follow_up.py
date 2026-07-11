# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, nowdate


def _permitted_cost_center_sql(alias=""):
	"""Return (sql_fragment, params) for cost-center user permission filtering."""
	from healthcare.api.common import get_permitted_cost_centers

	permitted = get_permitted_cost_centers()
	prefix = f"{alias}." if alias else ""
	if permitted is None:
		return "", {}
	if not permitted:
		return " AND 1=0", {}
	placeholders = ", ".join(f"%(cc_{i})s" for i in range(len(permitted)))
	params = {f"cc_{i}": cc for i, cc in enumerate(permitted)}
	return f" AND {prefix}cost_center IN ({placeholders})", params


def _search_sql(search, columns):
	if not search:
		return "", {}
	search = f"%{search.strip()}%"
	conditions = " OR ".join(f"{col} LIKE %(search)s" for col in columns)
	return f" AND ({conditions})", {"search": search}


@frappe.whitelist()
def update_follow_up_remarks(
	name=None,
	remarks=None,
	reference_doctype=None,
	reference_name=None,
	follow_up_type=None,
):
	"""Reception follow-up dashboard: save/update the remark on a follow-up.

	If ``name`` is missing, create/ensure a Patient Follow Up from the OP/IP reference.
	"""
	if not name and reference_doctype and reference_name and follow_up_type:
		name = ensure_follow_up_for_reference(reference_doctype, reference_name, follow_up_type)
	if not name or not frappe.db.exists("Patient Follow Up", name):
		frappe.throw(_("Follow Up {0} not found").format(name or _("(missing)")))
	clean = (remarks or "").strip()
	frappe.db.set_value("Patient Follow Up", name, "remarks", clean, update_modified=True)
	frappe.db.commit()
	return {"name": name, "remarks": clean}


@frappe.whitelist()
def get_follow_ups(
	status=None,
	cost_center=None,
	follow_up_type=None,
	patient=None,
	search=None,
	date_from=None,
	date_to=None,
	limit=20,
	offset=0,
):
	"""List Patient Follow Up for UI with filters. Returns {data, total_count}."""
	from healthcare.api.common import resolve_cost_center_filter

	filters = {}
	if status:
		filters["status"] = status
	if status != "No Follow Up Required":
		filters["no_follow_up_required"] = 0
	resolved_cc = resolve_cost_center_filter(cost_center)
	if resolved_cc is False:
		return {"data": [], "total_count": 0}
	if resolved_cc:
		filters["cost_center"] = resolved_cc if isinstance(resolved_cc, str) else ["in", resolved_cc]
	if patient:
		filters["patient"] = patient
	# if follow_up_type:
	# 	filters["follow_up_type"] = follow_up_type
	if date_from and date_to:
		filters["follow_up_date"] = ["between", [date_from, date_to]]
	elif date_from:
		filters["follow_up_date"] = [">=", date_from]
	elif date_to:
		filters["follow_up_date"] = ["<=", date_to]

	or_filters = None
	if search:
		search_term = f"%{search.strip()}%"
		or_filters = [
			["patient_name", "like", search_term],
			["patient", "like", search_term],
			["name", "like", search_term],
		]

	fields = [
		"name", "patient", "patient_name", "follow_up_type", "follow_up_date",
		"status", "cost_center", "remarks", "company", "reference_doctype", "reference_name",
	]

	count_args = {"doctype": "Patient Follow Up", "filters": filters}
	list_kwargs = dict(
		count_args,
		fields=fields,
		order_by="follow_up_date asc, creation asc",
		limit=cint(limit) or 20,
		limit_start=cint(offset) or 0,
	)
	if or_filters:
		count_args["or_filters"] = or_filters
		list_kwargs["or_filters"] = or_filters
	
	total_count = len(frappe.get_all(**count_args, fields=["name"], limit=0))
	
	# total_count = frappe.db.count("Patient Follow Up", filters=filters)
	print(f"Total count: {total_count}")
 
	out = frappe.get_all(**list_kwargs)
	return {"data": out, "total_count": total_count}


@frappe.whitelist()
def get_op_follow_up_visits(
	search=None,
	cost_center=None,
	patient=None,
	date_from=None,
	date_to=None,
	limit=20,
	offset=0,
):
	"""Latest outpatient visit per patient for follow-up outreach."""
	return _get_latest_reference_rows(
		reference_doctype="Patient Visit",
		follow_up_type="OP",
		search=search,
		cost_center=cost_center,
		patient=patient,
		date_from=date_from,
		date_to=date_to,
		limit=limit,
		offset=offset,
	)


@frappe.whitelist()
def get_ip_follow_up_admissions(
	search=None,
	cost_center=None,
	patient=None,
	date_from=None,
	date_to=None,
	limit=20,
	offset=0,
):
	"""Latest inpatient admission per patient for follow-up outreach."""
	return _get_latest_reference_rows(
		reference_doctype="Inpatient Admission",
		follow_up_type="IP",
		search=search,
		cost_center=cost_center,
		patient=patient,
		date_from=date_from,
		date_to=date_to,
		limit=limit,
		offset=offset,
	)


def _get_latest_reference_rows(
	reference_doctype,
	follow_up_type,
	search=None,
	cost_center=None,
	patient=None,
	date_from=None,
	date_to=None,
	limit=20,
	offset=0,
):
	limit = cint(limit) or 20
	offset = cint(offset) or 0
	from healthcare.api.common import resolve_cost_center_filter

	params = {}
	conditions = ["p.is_follow_up = 1", "base.patient IS NOT NULL", "base.patient != ''"]

	if patient:
		conditions.append("base.patient = %(patient)s")
		params["patient"] = patient
	resolved_cc = resolve_cost_center_filter(cost_center)
	if resolved_cc is False:
		return {"data": [], "total_count": 0}
	if resolved_cc:
		if isinstance(resolved_cc, str):
			conditions.append("base.cost_center = %(cost_center)s")
			params["cost_center"] = resolved_cc
		else:
			placeholders = ", ".join(f"%(cc_{i})s" for i in range(len(resolved_cc)))
			for i, cc in enumerate(resolved_cc):
				params[f"cc_{i}"] = cc
			conditions.append(f"base.cost_center IN ({placeholders})")

	if reference_doctype == "Patient Visit":
		base_table = "`tabPatient Visit` base"
		date_col = "base.encounter_date"
		extra_fields = "base.encounter_date as reference_date, base.practitioner_name"
		status_col = "base.status"
		docstatus_filter = "base.docstatus < 2"
		order_cols = "base.encounter_date DESC, base.creation DESC"
		follow_up_date_expr = "pfu.follow_up_date"
	elif reference_doctype == "Inpatient Admission":
		base_table = "`tabInpatient Admission` base"
		date_col = "COALESCE(base.admitted_datetime, base.scheduled_date)"
		extra_fields = (
			"COALESCE(DATE(base.admitted_datetime), base.scheduled_date) as reference_date, "
			"base.primary_practitioner as practitioner_name"
		)
		follow_up_date_expr = "COALESCE(pfu.follow_up_date, base.followup_date)"
		status_col = "base.status"
		docstatus_filter = "base.docstatus < 2"
		order_cols = "base.admitted_datetime DESC, base.creation DESC"
	else:
		frappe.throw(_("Unsupported reference doctype"))

	if date_from:
		conditions.append(f"{date_col} >= %(date_from)s")
		params["date_from"] = date_from
	if date_to:
		conditions.append(f"{date_col} <= %(date_to)s")
		params["date_to"] = date_to

	cc_sql, cc_params = _permitted_cost_center_sql("base")
	conditions.append(docstatus_filter)
	search_sql, search_params = _search_sql(
		search,
		["base.patient_name", "base.patient", "base.name", "p.file_no", "p.mobile"],
	)
	params.update(search_params)
	params.update(cc_params)

	where_sql = " AND ".join(conditions) + cc_sql + search_sql

	ranked_sql = f"""
		SELECT
			base.name AS reference_name,
			'{reference_doctype}' AS reference_doctype,
			base.patient,
			base.patient_name,
			{extra_fields},
			{status_col} AS reference_status,
			base.cost_center,
			base.company,
			p.mobile,
			pfu.name AS follow_up_name,
			{follow_up_date_expr} AS follow_up_date,
			pfu.status AS follow_up_status,
			pfu.remarks AS remarks,
			ROW_NUMBER() OVER (
				PARTITION BY base.patient
				ORDER BY {order_cols}
			) AS rn
		FROM {base_table}
		INNER JOIN `tabPatient` p ON p.name = base.patient
		LEFT JOIN `tabPatient Follow Up` pfu
			ON pfu.reference_doctype = '{reference_doctype}'
			AND pfu.reference_name = base.name
			AND pfu.follow_up_type = '{follow_up_type}'
		WHERE {where_sql}
	"""

	count_sql = f"SELECT COUNT(*) AS cnt FROM ({ranked_sql}) ranked WHERE ranked.rn = 1"
	total_count = frappe.db.sql(count_sql, params, as_dict=True)[0].cnt

	params["limit"] = limit
	params["offset"] = offset
	data_sql = f"""
		SELECT
			reference_name,
			reference_doctype,
			patient,
			patient_name,
			reference_date,
			practitioner_name,
			reference_status,
			cost_center,
			company,
			mobile,
			follow_up_name,
			follow_up_date,
			follow_up_status,
			remarks
		FROM ({ranked_sql}) ranked
		WHERE ranked.rn = 1
		ORDER BY reference_date DESC, reference_name DESC
		LIMIT %(limit)s OFFSET %(offset)s
	"""
	rows = frappe.db.sql(data_sql, params, as_dict=True)
	for row in rows:
		row["follow_up_type"] = follow_up_type
		if row.get("reference_date"):
			row["reference_date"] = str(row["reference_date"])[:10]
		if row.get("follow_up_date"):
			row["follow_up_date"] = str(row["follow_up_date"])[:10]
	return {"data": rows, "total_count": total_count}


def ensure_follow_up_for_reference(reference_doctype, reference_name, follow_up_type):
	"""Return Patient Follow Up name for a visit/admission, creating one when needed."""
	existing = frappe.db.exists(
		"Patient Follow Up",
		{
			"reference_doctype": reference_doctype,
			"reference_name": reference_name,
			"follow_up_type": follow_up_type,
		},
	)
	if existing:
		return existing

	if reference_doctype == "Patient Visit":
		source = frappe.db.get_value(
			"Patient Visit",
			reference_name,
			["patient", "patient_name", "encounter_date", "company", "cost_center"],
			as_dict=True,
		)
		if not source or not source.patient:
			return None
		if not frappe.db.get_value("Patient", source.patient, "is_follow_up"):
			return None
		follow_up_date = source.encounter_date or nowdate()
	elif reference_doctype == "Inpatient Admission":
		source = frappe.db.get_value(
			"Inpatient Admission",
			reference_name,
			["patient", "patient_name", "followup_date", "company", "cost_center", "name"],
			as_dict=True,
		)
		if not source or not source.patient:
			return None
		if not frappe.db.get_value("Patient", source.patient, "is_follow_up"):
			return None
		follow_up_date = source.followup_date
		if not follow_up_date:
			discharge_date = frappe.db.get_value(
				"Discharge",
				{"admission": reference_name, "docstatus": 1},
				"next_appointment_date",
				order_by="creation desc",
			)
			follow_up_date = discharge_date
		if not follow_up_date:
			follow_up_date = nowdate()
	else:
		return None

	doc = frappe.get_doc(
		{
			"doctype": "Patient Follow Up",
			"patient": source.patient,
			"patient_name": source.patient_name,
			"follow_up_type": follow_up_type,
			"reference_doctype": reference_doctype,
			"reference_name": reference_name,
			"follow_up_date": follow_up_date,
			"company": source.company,
			"cost_center": source.cost_center,
			"status": "Open",
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


@frappe.whitelist()
def send_follow_up_reminders_selected(
	names=None,
	references=None,
	channel="sms",
):
	"""Send reminders for selected Patient Follow Up rows or visit/admission references."""
	channel = (channel or "sms").lower()
	follow_up_names = []

	if names:
		if isinstance(names, str):
			names = json.loads(names)
		follow_up_names.extend([n for n in names if n])

	if references:
		if isinstance(references, str):
			references = json.loads(references)
		for ref in references or []:
			if not isinstance(ref, dict):
				continue
			ref_doctype = ref.get("reference_doctype")
			ref_name = ref.get("reference_name")
			follow_up_type = ref.get("follow_up_type")
			if not ref_doctype or not ref_name or not follow_up_type:
				continue
			created = ensure_follow_up_for_reference(ref_doctype, ref_name, follow_up_type)
			if created:
				follow_up_names.append(created)

	seen = set()
	unique_names = []
	for name in follow_up_names:
		if name not in seen:
			seen.add(name)
			unique_names.append(name)

	sent = 0
	for name in unique_names:
		res = send_follow_up_reminder(name, channel=channel)
		if res.get("sent"):
			sent += 1
	return {"sent": sent, "total": len(unique_names)}


@frappe.whitelist()
def send_follow_up_reminder(patient_follow_up_name, channel="sms"):
	"""Send one reminder for the given Patient Follow Up.

	channel: 'email' | 'whatsapp' | 'sms'
	"""
	if not patient_follow_up_name:
		return {"sent": False, "message": "No follow-up specified"}

	channel = (channel or "sms").lower()

	doc = frappe.db.get_value(
		"Patient Follow Up",
		patient_follow_up_name,
		["patient", "patient_name", "follow_up_date", "whatsapp_template"],
		as_dict=True,
	)
	if not doc:
		return {"sent": False, "message": "Follow-up not found"}

	message_text = _("Follow-up reminder: Dear {0}, your follow-up date is {1}. Please contact the hospital.").format(
		doc.patient_name or doc.patient,
		doc.follow_up_date,
	)

	if channel == "whatsapp":
		mobile = _resolve_follow_up_mobile(doc.patient)
		if not mobile:
			return {"sent": False, "message": "Patient has no mobile number"}
		return _send_follow_up_via_whatsapp(doc, mobile, patient_follow_up_name, message_text)
	elif channel == "email":
		patient_email = frappe.db.get_value("Patient", doc.patient, "email") if doc.patient else None
		if not patient_email:
			return {"sent": False, "message": "Patient has no email address"}
		try:
			frappe.sendmail(
				recipients=[patient_email],
				subject=_("Follow-Up Reminder"),
				message=message_text,
			)
			return {"sent": True, "channel": "email"}
		except Exception as e:
			frappe.log_error(title="Follow-up email reminder failed", message=frappe.get_traceback())
			return {"sent": False, "message": str(e)}
	else:
		mobile = _resolve_follow_up_mobile(doc.patient)
		if not mobile:
			return {"sent": False, "message": "Patient has no mobile number"}
		try:
			from frappe.core.doctype.sms_settings.sms_settings import send_sms
			send_sms([mobile], message_text)
			return {"sent": True, "channel": "sms"}
		except Exception as e:
			frappe.log_error(title="Follow-up SMS reminder failed", message=frappe.get_traceback())
			return {"sent": False, "message": str(e)}


def _resolve_follow_up_mobile(patient):
	"""Resolve the best mobile number for a patient."""
	values = frappe.db.get_value(
		"Patient", patient,
		["mobile", "mobile_no", "mobile_no_1", "phone"],
		as_dict=True,
	) or {}
	for field in ("mobile", "mobile_no", "mobile_no_1", "phone"):
		number = (values.get(field) or "").strip()
		if number:
			return number
	return ""


def _send_follow_up_via_whatsapp(doc, mobile, follow_up_name, fallback_body=""):
	"""Send a WhatsApp message for a follow-up reminder (template or plain text)."""
	try:
		from healthcare.healthcare.doctype.digital_connect_whatsap_settings.digital_connect_whatsap_settings import (
			send_test_message,
		)

		template_name = doc.get("whatsapp_template")
		if template_name:
			result = send_test_message(phone_number=mobile, template_name=template_name)
		else:
			result = send_test_message(phone_number=mobile, body=fallback_body, preview_url=1)
		chat_name = result.get("chat_name") if isinstance(result, dict) else None
		if chat_name:
			frappe.db.set_value(
				"Digital Whatsapp Chat",
				chat_name,
				{
					"reference_doctype": "Patient Follow Up",
					"reference_name": follow_up_name,
				},
				update_modified=True,
			)
		return {"sent": True, "channel": "whatsapp"}
	except Exception as e:
		frappe.log_error(title="Follow-up WhatsApp reminder failed", message=frappe.get_traceback())
		return {"sent": False, "message": str(e)}


@frappe.whitelist()
def send_follow_up_reminders_bulk(
	status=None,
	cost_center=None,
	follow_up_type=None,
	search=None,
	channel="sms",
):
	"""Send reminders for all follow-ups matching filters (default status Open)."""
	filters = [["no_follow_up_required", "=", 0]]
	if status:
		filters.append(["status", "=", status])
	else:
		filters.append(["status", "=", "Open"])
	if cost_center:
		filters.append(["cost_center", "=", cost_center])
	if follow_up_type:
		filters.append(["follow_up_type", "=", follow_up_type])
	if search:
		search_term = f"%{search.strip()}%"
		filters.append(
			[
				"patient_name",
				"like",
				search_term,
			]
		)
	names = frappe.get_all(
		"Patient Follow Up",
		filters=filters,
		pluck="name",
		limit=500,
	)
	sent = 0
	for name in names:
		res = send_follow_up_reminder(name, channel=channel)
		if res.get("sent"):
			sent += 1
	return {"sent": sent, "total": len(names)}


class PatientFollowUp(Document):
	def validate(self):
		if self.patient and not self.patient_name:
			self.patient_name = frappe.db.get_value("Patient", self.patient, "patient_name")
		# When user checks "No Follow Up Required", set status so list views can filter
		if self.no_follow_up_required and self.status != "No Follow Up Required":
			self.status = "No Follow Up Required"
		if not self.no_follow_up_required and self.status == "No Follow Up Required":
			self.no_follow_up_required = 1  # keep in sync

	def on_update(self):
		# Optional: when marked "No Follow Up Required", exclude patient from future follow-up lists
		if self.no_follow_up_required or self.status == "No Follow Up Required":
			frappe.db.set_value("Patient", self.patient, "is_follow_up", 0)


def create_patient_follow_up_from_discharge(admission_name, discharge_doc=None):
	"""Create a Patient Follow Up (IP) when discharge is submitted. Call from Discharge on_submit.
	Uses Follow Up Date from Discharge form (or Inpatient Admission) and only if Patient has Allow Follow up? = 1.
	"""
	admission = frappe.db.get_value(
		"Inpatient Admission",
		admission_name,
		["patient", "patient_name", "company", "followup_date", "name"],
		as_dict=True,
	)
	if not admission:
		return None
	# Follow Up Date: from Discharge form (follow_up_date or next_appointment_date) or Inpatient Admission
	follow_up_date = None
	if discharge_doc:
		follow_up_date = getattr(discharge_doc, "follow_up_date", None) or getattr(
			discharge_doc, "next_appointment_date", None
		)
	if not follow_up_date and admission.get("followup_date"):
		follow_up_date = admission.followup_date
	if not follow_up_date:
		return None
	# Only if patient allows follow up
	if not frappe.db.get_value("Patient", admission.patient, "is_follow_up"):
		return None
	existing = frappe.db.exists(
		"Patient Follow Up",
		{
			"reference_doctype": "Inpatient Admission",
			"reference_name": admission_name,
			"follow_up_type": "IP",
		},
	)
	if existing:
		return existing
	doc = frappe.get_doc(
		{
			"doctype": "Patient Follow Up",
			"patient": admission.patient,
			"patient_name": admission.patient_name,
			"follow_up_type": "IP",
			"reference_doctype": "Inpatient Admission",
			"reference_name": admission_name,
			"follow_up_date": follow_up_date,
			"company": admission.company,
			"status": "Open",
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name

@frappe.whitelist()
def update_follow_up_status(patient_follow_up_name, status):
	"""Update status of a Patient Follow Up. Call from UI or API."""
	if not patient_follow_up_name:
		return {"updated": False, "message": "No follow-up specified"}
	if status not in ["Open", "Contacted", "Completed", "No Follow Up Required"]:
		return {"updated": False, "message": "Invalid status"}
	try:
		doc = frappe.get_doc("Patient Follow Up", patient_follow_up_name)
		doc.status = status
		if status == "No Follow Up Required":
			doc.no_follow_up_required = 1
		doc.save()
		return {"updated": True}
	except Exception as e:
		frappe.log_error(title="Follow-up status update failed", message=frappe.get_traceback())
		return {"updated": False, "message": str(e)}