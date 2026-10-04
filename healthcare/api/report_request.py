import re

import frappe
from frappe import _
from frappe.utils import add_days, cstr, format_date, get_fullname, now_datetime, today

from healthcare.api.common import apply_cost_center_scope_to_filters, ensure_file_url_public
from healthcare.healthcare.doctype.patient_appointment.patient_appointment import (
	_count_template_variables,
	_get_company_country_isd,
	_get_digiconnect_branch_info,
	_normalize_whatsapp_phone,
	_render_whatsapp_template_preview,
)
from healthcare.healthcare.doctype.report_request.report_request import _primary_role
from healthcare.healthcare.editing_lock import assert_editing_allowed

WHATSAPP_REFERENCE_DOCTYPE = "Report Request"
# Standalone template reception can use before a Template Mapping row exists.
DEFAULT_MEDICAL_REQUEST_TEMPLATE = "patient_medical_request"


def _row_dict(doc):
	audits = []
	for row in doc.get("audit_trail") or []:
		audits.append(
			{
				"action": row.action,
				"user": row.user,
				"user_full_name": row.user_full_name,
				"action_on": str(row.action_on) if row.action_on else None,
				"details": row.details,
			}
		)
	return {
		"name": doc.name,
		"status": doc.status,
		"request_date": str(doc.request_date) if doc.request_date else None,
		"urgency": doc.urgency,
		"patient": doc.patient,
		"patient_name": doc.patient_name,
		"file_no": doc.file_no,
		"id_number": doc.id_number,
		"requester": doc.requester,
		"requester_name": doc.requester_name,
		"requester_role": doc.requester_role,
		"recipient": doc.recipient,
		"signed_request": doc.signed_request,
		"remarks": doc.remarks,
		"reject_reason": doc.reject_reason,
		"completed_by": doc.completed_by,
		"completed_by_name": doc.completed_by_name,
		"completed_on": str(doc.completed_on) if doc.completed_on else None,
		"cost_center": doc.cost_center,
		"audit_trail": audits,
	}


def _load(name):
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Report request is required"))
	if not frappe.db.exists("Report Request", name):
		frappe.throw(_("Report request {0} not found").format(name))
	return frappe.get_doc("Report Request", name)


@frappe.whitelist()
def get_report_requests(status=None, patient=None, limit=50, offset=0):
	filters = {}
	if apply_cost_center_scope_to_filters(filters):
		return {"data": [], "total_count": 0}

	status = (status or "Pending").strip()
	if status == "Done":
		filters["status"] = "Done"
		filters["completed_on"] = [">=", add_days(now_datetime(), -3)]
	elif status and status != "All":
		filters["status"] = status

	if patient:
		filters["patient"] = patient

	total = frappe.db.count("Report Request", filters)
	rows = frappe.get_all(
		"Report Request",
		filters=filters,
		fields=[
			"name",
			"status",
			"request_date",
			"urgency",
			"patient",
			"patient_name",
			"file_no",
			"id_number",
			"requester",
			"requester_name",
			"requester_role",
			"recipient",
			"signed_request",
			"remarks",
			"reject_reason",
			"completed_by",
			"completed_by_name",
			"completed_on",
			"cost_center",
		],
		order_by="request_date desc, modified desc",
		limit_start=int(offset or 0),
		limit_page_length=int(limit or 50),
	)
	return {"data": rows, "total_count": total}


@frappe.whitelist()
def get_report_request(name):
	return _row_dict(_load(name))


@frappe.whitelist()
def create_report_request(data=None):
	assert_editing_allowed()
	if isinstance(data, str):
		data = frappe.parse_json(data) or {}
	data = data or {}
	patient = (data.get("patient") or "").strip()
	recipient = (data.get("recipient") or "").strip()
	if not patient:
		frappe.throw(_("Patient is required"))
	if not recipient:
		frappe.throw(_("Intended recipient is required"))

	signed = (data.get("signed_request") or "").strip()
	if signed:
		signed = ensure_file_url_public(signed)

	user = frappe.session.user
	doc = frappe.get_doc(
		{
			"doctype": "Report Request",
			"naming_series": "RR-.YYYY.-",
			"patient": patient,
			"request_date": data.get("request_date") or today(),
			"urgency": data.get("urgency") or "Non-Urgent",
			"recipient": recipient,
			"signed_request": signed or None,
			"remarks": (data.get("remarks") or "").strip() or None,
			"status": "Pending",
			"requester": user,
			"requester_name": get_fullname(user) or user,
			"requester_role": _primary_role(user),
			"cost_center": data.get("cost_center") or None,
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return _row_dict(doc)


@frappe.whitelist()
def update_report_request(name, data=None):
	assert_editing_allowed()
	if isinstance(data, str):
		data = frappe.parse_json(data) or {}
	data = data or {}
	doc = _load(name)
	changed = []
	if "remarks" in data:
		doc.remarks = (data.get("remarks") or "").strip() or None
		changed.append("remarks")
	if "recipient" in data and (data.get("recipient") or "").strip():
		doc.recipient = (data.get("recipient") or "").strip()
		changed.append("recipient")
	if "urgency" in data and data.get("urgency") in ("Urgent", "Non-Urgent"):
		doc.urgency = data.get("urgency")
		changed.append("urgency")
	if "signed_request" in data:
		signed = (data.get("signed_request") or "").strip()
		doc.signed_request = ensure_file_url_public(signed) if signed else None
		changed.append("signed request")
	if not changed:
		return _row_dict(doc)
	doc.add_audit("Updated", "Updated " + ", ".join(changed))
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _row_dict(doc)


@frappe.whitelist()
def complete_report_request(name):
	assert_editing_allowed()
	doc = _load(name)
	if doc.status == "Done":
		return _row_dict(doc)
	if doc.status == "Archived":
		frappe.throw(_("Archived requests cannot be completed"))
	user = frappe.session.user
	doc.status = "Done"
	doc.completed_by = user
	doc.completed_by_name = get_fullname(user) or user
	doc.completed_on = now_datetime()
	doc.add_audit("Completed", "Marked Done / Completed")
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _row_dict(doc)


@frappe.whitelist()
def reopen_report_request(name):
	assert_editing_allowed()
	doc = _load(name)
	if doc.status not in ("Done", "Rejected", "Archived"):
		frappe.throw(_("Only completed, rejected, or archived requests can be reopened"))
	prev = doc.status
	doc.status = "Pending"
	doc.completed_by = None
	doc.completed_by_name = None
	doc.completed_on = None
	if prev == "Rejected":
		doc.reject_reason = None
	doc.add_audit("Reopened", f"Reversed {prev} status")
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _row_dict(doc)


@frappe.whitelist()
def reject_report_request(name, reason=None):
	assert_editing_allowed()
	reason = (reason or "").strip()
	if not reason:
		frappe.throw(_("Reject reason is required"))
	doc = _load(name)
	if doc.status == "Archived":
		frappe.throw(_("Archived requests cannot be rejected"))
	doc.status = "Rejected"
	doc.reject_reason = reason
	doc.add_audit("Rejected", reason)
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _row_dict(doc)


def archive_done_report_requests():
	"""Daily: Done reports older than 3 days move to Archived."""
	cutoff = add_days(now_datetime(), -3)
	names = frappe.get_all(
		"Report Request",
		filters={"status": "Done", "completed_on": ["<", cutoff]},
		pluck="name",
	)
	for name in names:
		doc = frappe.get_doc("Report Request", name)
		doc.status = "Archived"
		doc.add_audit("Archived", "Auto-archived after 3 days in Done")
		doc.save(ignore_permissions=True)
	if names:
		frappe.db.commit()
	return {"archived": len(names)}


# ── Doctor WhatsApp notification (reception → doctor) ─────────────────────────
# Mirrors the Patient Appointment WhatsApp reminder flow: reception opens a
# "Notify Doctor" dialog, picks the doctor, edits the number resolved from the
# practitioner/employee record and sends an approved Digital Whatsapp Template.


def _report_request_company(doc):
	"""Company used for phone normalization, resolved from the request's branch/cost center."""
	cost_center = (doc.get("cost_center") or "").strip()
	if cost_center:
		company = frappe.db.get_value("Cost Center", cost_center, "company")
		if company:
			return company
	return frappe.db.get_single_value("Global Defaults", "default_company") or ""


def _resolve_practitioner_mobile(practitioner, company=None):
	"""Resolve a doctor's WhatsApp mobile: Healthcare Practitioner → linked Employee → Contact.

	Returns the normalized international number (digits only), or an empty string.
	"""
	raw = ""
	if practitioner:
		row = (
			frappe.db.get_value(
				"Healthcare Practitioner",
				practitioner,
				["mobile_phone", "mobile_no", "employee", "user_id", "practitioner_primary_contact"],
				as_dict=True,
			)
			or {}
		)
		for field in ("mobile_phone", "mobile_no"):
			number = (row.get(field) or "").strip()
			if number:
				raw = number
				break

		if not raw:
			employee = row.get("employee")
			if not employee and row.get("user_id"):
				employee = frappe.db.get_value("Employee", {"user_id": row.get("user_id")}, "name")
			if employee:
				raw = (frappe.db.get_value("Employee", employee, "cell_number") or "").strip()

		if not raw and row.get("practitioner_primary_contact"):
			raw = (
				frappe.db.get_value("Contact", row.get("practitioner_primary_contact"), "mobile_no") or ""
			).strip()

	if not raw:
		return ""

	return _normalize_whatsapp_phone(raw, company=company)


def _parse_whatsapp_parameters(template_parameters):
	"""Parse WhatsApp template parameters from a JSON list or comma-separated string."""
	if template_parameters is None or template_parameters == "":
		return []
	if isinstance(template_parameters, (list, tuple)):
		return [cstr(p).strip() for p in template_parameters]
	if isinstance(template_parameters, str):
		text = template_parameters.strip()
		if not text:
			return []
		if text.startswith("["):
			try:
				parsed = frappe.parse_json(text)
				if isinstance(parsed, list):
					return [cstr(p).strip() for p in parsed]
			except Exception:
				pass
		return [p.strip() for p in text.split(",")]
	return [cstr(template_parameters).strip()]


def _get_report_request_whatsapp_templates():
	"""Resolve approved WhatsApp templates for Report Request from settings mapping.

	Falls back to templates flagged for the Report Request doctype and finally to
	the standalone "patient_medical_request" template, so reception can notify a
	doctor before a Template Mapping row is configured.
	"""
	seen = set()
	out = []

	def add_template(name, purpose=None):
		if not name or name in seen:
			return
		row = frappe.db.get_value(
			"Digital Whatsapp Template",
			name,
			[
				"name",
				"template_name",
				"actual_name",
				"status",
				"header_type",
				"header_text",
				"body_text",
				"footer_text",
				"field_names",
				"language_code",
			],
			as_dict=True,
		)
		if not row or row.status != "APPROVED":
			return
		seen.add(name)
		out.append(
			{
				"name": row.name,
				"template_name": row.template_name,
				"actual_name": row.actual_name,
				"purpose": purpose or "",
				"header_type": row.header_type,
				"header_text": row.header_text or "",
				"body_text": row.body_text or "",
				"footer_text": row.footer_text or "",
				"field_names": row.field_names or "",
				"language_code": row.language_code or "",
				"variable_count": _count_template_variables(
					row.header_text if row.header_type == "TEXT" else ""
				)
				+ _count_template_variables(row.body_text),
			}
		)

	if frappe.db.exists("DocType", "Digital Connect Whatsap Settings"):
		settings = frappe.get_single("Digital Connect Whatsap Settings")
		for row in settings.get("template_mapping") or []:
			if row.get("reference_document") == WHATSAPP_REFERENCE_DOCTYPE and row.get("template"):
				add_template(row.template, purpose=row.get("purpose") or "")

	if not out:
		for name in frappe.get_all(
			"Digital Whatsapp Template",
			filters={"for_doctype": WHATSAPP_REFERENCE_DOCTYPE, "status": "APPROVED"},
			pluck="name",
		):
			add_template(name)

	if not out:
		# Try both the snake_case template name and its human-readable variant.
		needles = [DEFAULT_MEDICAL_REQUEST_TEMPLATE, DEFAULT_MEDICAL_REQUEST_TEMPLATE.replace("_", " ")]
		or_filters = []
		for needle in needles:
			or_filters.extend(
				[
					["template_name", "like", f"%{needle}%"],
					["actual_name", "like", f"%{needle}%"],
					["name", "like", f"%{needle}%"],
				]
			)
		for name in frappe.get_all(
			"Digital Whatsapp Template",
			filters={"status": "APPROVED"},
			or_filters=or_filters,
			pluck="name",
		):
			add_template(name, purpose="Medical Request")

	return out



def _build_report_request_whatsapp_param_map(doc, doctor=None, doctor_name=None):
	"""Build a lookup of common report-request WhatsApp template parameters."""
	branch = _get_digiconnect_branch_info(doc.get("cost_center"))
	patient_name = doc.patient_name or doc.patient or ""
	branch_label = branch.get("branch_label") or branch.get("branch") or ""
	doctor_label = doctor_name or doctor or ""
	request_date = format_date(doc.request_date) if doc.request_date else ""

	return {
		"patient_name": patient_name,
		"patient": patient_name,
		"doctor_name": doctor_label,
		"doctor": doctor_label,
		"practitioner_name": doctor_label,
		"practitioner": doctor_label,
		"requester_name": doc.requester_name or doc.requester or "",
		"recipient": doc.recipient or "",
		"urgency": doc.urgency or "",
		"report_request": doc.name or "",
		"file_no": doc.file_no or "",
		"id_number": doc.id_number or "",
		"request_date": request_date,
		"date": request_date,
		"branch": branch_label,
		"cost_center": branch_label,
		"branch_prefix": branch.get("branch_prefix") or branch_label,
		"branch_contacts": branch.get("contacts") or "",
		"contacts": branch.get("contacts") or "",
	}


def _build_report_request_whatsapp_parameters(doc, template_name, doctor=None, doctor_name=None):
	"""Build ordered parameter values for a report-request WhatsApp template."""
	template = frappe.get_doc("Digital Whatsapp Template", template_name)
	param_map = _build_report_request_whatsapp_param_map(doc, doctor=doctor, doctor_name=doctor_name)
	header_count = (
		_count_template_variables(template.header_text) if template.header_type == "TEXT" else 0
	)
	body_count = _count_template_variables(template.body_text)
	total = header_count + body_count

	field_names = []
	if template.field_names:
		field_names = [x.strip() for x in re.split(r"[,\n;]+", template.field_names) if x.strip()]

	# The medical request template greets the doctor first, then the patient.
	defaults = [
		param_map["doctor_name"],
		param_map["patient_name"],
		param_map["branch"],
		param_map["request_date"],
		param_map["urgency"],
		param_map["branch_contacts"],
	]

	values = []
	for i in range(total):
		if i < len(field_names):
			key = field_names[i]
			if key in param_map:
				values.append(cstr(param_map[key]))
			else:
				raw = doc.get(key) if hasattr(doc, "get") else None
				values.append("" if raw is None else cstr(raw))
		elif i < len(defaults):
			values.append(cstr(defaults[i]))
		else:
			values.append("")
	return values


@frappe.whitelist()
def get_report_request_whatsapp_preview(name, template_name=None, doctor=None):
	"""Return WhatsApp preview data for a report request (doctor phone, templates, filled message).

	Mirrors ``get_appointment_whatsapp_preview``: the UI picks the doctor, gets the
	number resolved from the practitioner/employee record and the rendered template.
	"""
	doc = _load(name)
	templates = _get_report_request_whatsapp_templates()
	if not templates:
		frappe.throw(
			_(
				"No WhatsApp template mapped for Report Request. "
				"Add one under Digital Connect Whatsap Settings → Template Mapping."
			)
		)

	selected_name = (template_name or "").strip() or (templates[0]["name"] if len(templates) == 1 else None)
	if selected_name and selected_name not in {t["name"] for t in templates}:
		frappe.throw(_("Template {0} is not available for this report request").format(selected_name))

	doctor = (doctor or "").strip()
	doctor_name = ""
	if doctor:
		doctor_name = frappe.db.get_value("Healthcare Practitioner", doctor, "practitioner_name") or doctor

	selected = None
	preview = None
	parameters = []
	if selected_name:
		selected = next(t for t in templates if t["name"] == selected_name)
		parameters = _build_report_request_whatsapp_parameters(
			doc, selected_name, doctor=doctor, doctor_name=doctor_name
		)
		preview = _render_whatsapp_template_preview(selected_name, parameters)

	company = _report_request_company(doc)
	country, country_isd = _get_company_country_isd(company)

	return {
		"report_request": doc.name,
		"patient": doc.patient,
		"patient_name": doc.patient_name or doc.patient or "",
		"recipient": doc.recipient or "",
		"doctor": doctor,
		"doctor_name": doctor_name,
		"phone_number": _resolve_practitioner_mobile(doctor, company=company) if doctor else "",
		"country": country,
		"country_isd": country_isd,
		"templates": templates,
		"selected_template": selected_name,
		"parameters": parameters,
		"preview": preview,
		"selected": selected,
	}


@frappe.whitelist()
def send_report_request_doctor_whatsapp(
	name,
	doctor=None,
	phone_number=None,
	template_name=None,
	template_parameters=None,
):
	"""Notify a doctor that a medical/report request needs attention, via WhatsApp.

	The doctor's number is resolved from the Healthcare Practitioner (falling back to
	the linked Employee / Contact); the UI may override it before sending.
	"""
	assert_editing_allowed()
	doc = _load(name)

	doctor = (doctor or "").strip()
	if not doctor:
		frappe.throw(_("Doctor is required"))
	if not frappe.db.exists("Healthcare Practitioner", doctor):
		frappe.throw(_("Healthcare Practitioner {0} not found").format(doctor))
	doctor_name = frappe.db.get_value("Healthcare Practitioner", doctor, "practitioner_name") or doctor

	company = _report_request_company(doc)
	override = (phone_number or "").strip()
	recipient_mobile = (
		_normalize_whatsapp_phone(override, company=company)
		if override
		else _resolve_practitioner_mobile(doctor, company=company)
	)
	if not recipient_mobile:
		frappe.throw(
			_("Doctor {0} has no mobile number. Enter a number to send WhatsApp.").format(doctor_name)
		)

	templates = _get_report_request_whatsapp_templates()
	resolved_template = (template_name or "").strip()
	if not resolved_template:
		if len(templates) == 1:
			resolved_template = templates[0]["name"]
		elif len(templates) > 1:
			frappe.throw(_("Multiple WhatsApp templates found. Please select one."))
	if not resolved_template:
		frappe.throw(
			_(
				"No WhatsApp template mapped for Report Request. "
				"Add one under Digital Connect Whatsap Settings → Template Mapping."
			)
		)
	if resolved_template not in {t["name"] for t in templates}:
		frappe.throw(_("Template {0} is not available for this report request").format(resolved_template))

	if template_parameters is None:
		params_list = _build_report_request_whatsapp_parameters(
			doc, resolved_template, doctor=doctor, doctor_name=doctor_name
		)
	else:
		params_list = _parse_whatsapp_parameters(template_parameters)

	from healthcare.healthcare.doctype.digital_connect_whatsap_settings.digital_connect_whatsap_settings import (
		send_test_message,
	)

	result = send_test_message(
		phone_number=recipient_mobile,
		template_name=resolved_template,
		template_parameters=params_list,
	)

	chat_name = result.get("chat_name") if isinstance(result, dict) else None
	if chat_name:
		frappe.db.set_value(
			"Digital Whatsapp Chat",
			chat_name,
			{
				"reference_doctype": WHATSAPP_REFERENCE_DOCTYPE,
				"reference_name": doc.name,
				"bulk_message_reference": f"report-request-doctor-{doc.name}-{doctor}",
			},
			update_modified=True,
		)

	doc.add_audit(
		"Notified Doctor",
		f"Sent WhatsApp ({resolved_template}) to {doctor_name} · {recipient_mobile}",
	)
	frappe.db.commit()

	return {
		"status": "success",
		"report_request": doc.name,
		"doctor": doctor,
		"doctor_name": doctor_name,
		"phone_number": recipient_mobile,
		"template_name": resolved_template,
		"chat_name": chat_name,
	}


