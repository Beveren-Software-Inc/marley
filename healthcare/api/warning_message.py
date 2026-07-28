# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import cint, now_datetime

# Portal users list/read warnings via whitelisted APIs; REST /api/resource enforces DocPerm.
WARNING_MESSAGE_PORTAL_READ_ROLES = frozenset(
	{
		"Administrator",
		"System Manager",
		"Healthcare Administrator",
		"Doctor",
		"Nurse",
		"Nursing User",
		"Physician",
		"Psychologist",
		"Anesthesiologist",
		"Therapist",
		"Nutritionist",
		"Laboratory User",
	}
)


def _warning_message_has_column(fieldname: str) -> bool:
	return bool(frappe.db.has_column("Warning Message", fieldname))


def _user_can_read_warning_message_portal() -> bool:
	if frappe.session.user in ("Guest", ""):
		return False
	return bool(WARNING_MESSAGE_PORTAL_READ_ROLES & set(frappe.get_roles(frappe.session.user)))


def _enrich_warning_message_row(warning) -> dict:
	as_dict = getattr(warning, "as_dict", None)
	if callable(as_dict):
		row = as_dict()
	else:
		row = dict(warning)

	if row.get("patient"):
		pinfo = frappe.db.get_value(
			"Patient", row["patient"], ["patient_name", "file_no"], as_dict=True
		) or {}
		row["patient_name"] = pinfo.get("patient_name") or row["patient"]
		row["file_no"] = pinfo.get("file_no") or ""

	if row.get("practitioner"):
		row["practitioner_name"] = (
			frappe.db.get_value(
				"Healthcare Practitioner", row["practitioner"], "practitioner_name"
			)
			or row["practitioner"]
		)

	if not row.get("type_of_warning"):
		row["type_of_warning"] = "Medical"

	row["is_special_phone_warning"] = cint(row.get("is_special_phone_warning") or 0)
	row["show_in_standard_warning_popup"] = cint(row.get("show_in_standard_warning_popup") or 0)
	if row.get("is_special_phone_warning") and not (row.get("warning") or "").strip():
		row["warning"] = row.get("reported_information") or ""
	if row.get("verified_by_practitioner"):
		row["verified_by_practitioner_name"] = (
			frappe.db.get_value(
				"Healthcare Practitioner", row["verified_by_practitioner"], "practitioner_name"
			)
			or row["verified_by_practitioner"]
		)

	return row


def _get_warning_message_fields(*, for_list: bool = False) -> list[str]:
	fields = [
		"name",
		"patient",
		"posting_date",
		"practitioner",
		"warning",
		"reported_information",
		"reference_doc",
		"reference_name",
		"medical_role",
		"type_of_warning",
		"is_special_phone_warning",
		"show_in_standard_warning_popup",
		"verification_status",
	]
	if not for_list:
		fields.extend(
			[
				"gender",
				"blood_group",
				"trans_id",
				"high_risk_text",
				"clinical_note_type",
				"cost_center",
				"warning_message_type",
				"warning_message_class",
				"creation",
				"modified",
				"source_type",
				"caller_name",
				"caller_phone",
				"relationship_to_patient",
				"received_at",
				"received_by_user",
				"received_by_practitioner",
				"verification_status",
				"verification_method",
				"clinical_urgency",
				"requires_follow_up",
				"follow_up_status",
				"doctor_review_note",
				"next_action",
			]
		)

	for optional_field in ("verified_by_user", "verified_by_practitioner", "verified_on"):
		if _warning_message_has_column(optional_field):
			fields.append(optional_field)

	return fields


def allocate_warning_trans_id() -> str:
	"""Next ``trans_id`` for Warning Message (autoname ``field:trans_id`` → document name).

	Uses only Warning Message rows (not Patient Medication Order). Considers both
	``trans_id`` and ``name`` so legacy rows still advance the sequence correctly.
	"""
	integers: list[int] = []
	for row in frappe.db.get_all(
		"Warning Message",
		fields=["name", "trans_id"],
		limit_page_length=None,
	):
		for val in (row.get("trans_id"), row.get("name")):
			if val is None:
				continue
			s = str(val).strip()
			if s.isdigit():
				integers.append(int(s))

	if not integers:
		return "1"

	return str(max(integers) + 1)


def _resolve_practitioner(data: dict) -> str | None:
	practitioner = (data.get("practitioner") or "").strip()
	if practitioner:
		return practitioner
	from healthcare.utils import get_current_user_practitioner

	return get_current_user_practitioner()


def _resolve_medical_role(data: dict, practitioner: str | None) -> str | None:
	medical_role = (data.get("medical_role") or "").strip()
	if medical_role:
		return medical_role
	if not practitioner:
		return None
	return frappe.db.get_value("Healthcare Practitioner", practitioner, "medical_role")


def insert_medical_warning_message(
	patient: str,
	warning: str,
	*,
	reference_doc: str | None = None,
	reference_name: str | None = None,
	practitioner: str | None = None,
	posting_date=None,
	medical_role: str | None = None,
	extra_fields: dict | None = None,
):
	"""Insert a Medical Warning Message with mandatory ``trans_id`` set."""
	if not patient:
		frappe.throw(_("Patient is required for medical warnings"))
	if not (warning or "").strip():
		frappe.throw(_("Warning text is required"))

	doc = frappe.get_doc(
		{
			"doctype": "Warning Message",
			"trans_id": allocate_warning_trans_id(),
			"type_of_warning": "Medical",
			"patient": patient,
			"warning": (warning or "").strip(),
			"practitioner": practitioner,
			"posting_date": posting_date or frappe.utils.now(),
			"medical_role": medical_role,
			"reference_doc": reference_doc,
			"reference_name": reference_name,
			**(extra_fields or {}),
		}
	)
	doc.insert(ignore_permissions=True)
	return doc


@frappe.whitelist()
def get_warning_messages(
	limit=50,
	offset=0,
	patient=None,
	active_only=True,
	no_patient_scope=None,
	type_of_warning=None,
	practitioner=None,
	posting_date_from=None,
	posting_date_to=None,
	include_special_phone_warnings=False,
	special_phone_scope=None,
):
	"""Get list of Warning Messages.

	:param no_patient_scope: When ``patient`` is not set: ``organisation`` = only
		organisation-level warnings (``type_of_warning`` = Organisation); ``all`` or
		omitted = legacy behaviour (every warning).
	:param type_of_warning: Optional ``Medical`` / ``Organisation`` filter (also when patient is set).
	:param practitioner: Optional Healthcare Practitioner id.
	:param posting_date_from / posting_date_to: Optional posting_date range (YYYY-MM-DD).
	"""
	portal_reader = _user_can_read_warning_message_portal()
	has_read = frappe.has_permission("Warning Message", "read")

	filters = {}
	or_filters = None

	if patient:
		filters['patient'] = patient
	elif no_patient_scope and str(no_patient_scope).lower() in ('organisation', 'organization'):
		filters['type_of_warning'] = 'Organisation'

	if type_of_warning:
		filters['type_of_warning'] = type_of_warning

	if practitioner:
		filters['practitioner'] = practitioner

	scope = (special_phone_scope or "").strip().lower()

	if scope == "special_only":
		filters["is_special_phone_warning"] = 1
	elif not cint(include_special_phone_warnings):
		or_filters = [
			["Warning Message", "is_special_phone_warning", "=", 0],
			["Warning Message", "show_in_standard_warning_popup", "=", 1],
		]

	if posting_date_from and posting_date_to:
		filters['posting_date'] = ['between', [posting_date_from, posting_date_to]]
	elif posting_date_from:
		filters['posting_date'] = ['>=', posting_date_from]
	elif posting_date_to:
		filters['posting_date'] = ['<=', posting_date_to]

	if active_only:
		# Only get active warnings if there's an active field
		# For now, we'll get all warnings
		pass

	warnings = frappe.get_all(
		'Warning Message',
		filters=filters,
		or_filters=or_filters,
		fields=_get_warning_message_fields(for_list=True),
		limit=limit,
		limit_start=offset,
		order_by='posting_date desc',
		ignore_permissions=portal_reader and not has_read,
	)

	total_count = len(
		frappe.get_all(
			'Warning Message',
			filters=filters,
			or_filters=or_filters,
			pluck='name',
			ignore_permissions=portal_reader and not has_read,
		)
	)

	return {
		'data': [_enrich_warning_message_row(warning) for warning in warnings],
		'total_count': int(total_count or 0),
	}


@frappe.whitelist()
def get_warning_message(name=None):
	"""Return one Warning Message for the healthcare portal (avoids REST DocPerm gaps)."""
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Warning Message name is required"))

	if not frappe.db.exists("Warning Message", name):
		frappe.throw(_("Warning Message {0} not found").format(name))

	if not frappe.has_permission("Warning Message", "read"):
		if not _user_can_read_warning_message_portal():
			frappe.throw(
				_("Not permitted to read Warning Message"),
				frappe.PermissionError,
			)
	row = frappe.db.get_value(
		"Warning Message",
		name,
		_get_warning_message_fields(for_list=False),
		as_dict=True,
	)
	if not row:
		frappe.throw(_("Warning Message {0} not found").format(name))
	row["name"] = name
	return _enrich_warning_message_row(row)


@frappe.whitelist()
def create_warning_message(data):
	"""Create a new Warning Message"""
	if isinstance(data, str):
		import json
		data = json.loads(data)

	practitioner = _resolve_practitioner(data)
	medical_role = _resolve_medical_role(data, practitioner)
	is_special_phone_warning = cint(data.get('is_special_phone_warning') or 0)
	show_in_standard_warning_popup = cint(data.get('show_in_standard_warning_popup') or 0)

	if is_special_phone_warning and not data.get('patient'):
		frappe.throw(_("Patient is required for special phone warnings"))

	effective_warning = (data.get('warning') or '').strip()
	if is_special_phone_warning and not effective_warning:
		effective_warning = (data.get('reported_information') or '').strip()

	extra_fields = {
		'is_special_phone_warning': is_special_phone_warning,
		'show_in_standard_warning_popup': show_in_standard_warning_popup,
		'caller_name': data.get('caller_name'),
		'caller_phone': data.get('caller_phone'),
		'relationship_to_patient': data.get('relationship_to_patient'),
		'source_type': data.get('source_type'),
		'verification_status': data.get('verification_status') or 'Unverified',
		'verification_method': data.get('verification_method'),
		'clinical_urgency': data.get('clinical_urgency') or 'Low',
		'requires_follow_up': cint(data.get('requires_follow_up') or 0),
		'follow_up_status': data.get('follow_up_status') or 'Open',
		'received_by_user': data.get('received_by_user') or frappe.session.user,
		'received_by_practitioner': data.get('received_by_practitioner') or practitioner,
		'received_at': data.get('received_at') or data.get('posting_date') or frappe.utils.now(),
		'reported_information': data.get('reported_information'),
		'doctor_review_note': data.get('doctor_review_note'),
		'next_action': data.get('next_action'),
	}
	
	wtype = (data.get('type_of_warning') or 'Medical').strip()
	if wtype not in ('Medical', 'Organisation'):
		wtype = 'Medical'

	if wtype == 'Medical' and not data.get('patient'):
		frappe.throw(_("Patient is required for medical warnings"))

	if wtype == 'Medical':
		warning = insert_medical_warning_message(
			data.get('patient'),
			effective_warning,
			practitioner=practitioner,
			posting_date=data.get('posting_date'),
			medical_role=medical_role,
			extra_fields=extra_fields,
		)
	else:
		warning = frappe.get_doc(
			{
				'doctype': 'Warning Message',
				'trans_id': allocate_warning_trans_id(),
				'type_of_warning': wtype,
				'patient': data.get('patient') or None,
				'warning': effective_warning,
				'practitioner': practitioner,
				'posting_date': data.get('posting_date') or frappe.utils.now(),
				'medical_role': medical_role,
				**extra_fields,
			}
		)
		warning.insert(ignore_permissions=True)
	
	# Return the created warning message
	patient_name = None
	if warning.patient:
		patient_name = frappe.db.get_value('Patient', warning.patient, 'patient_name') or warning.patient
	return {
		'name': warning.name,
		'patient': warning.patient,
		'patient_name': patient_name,
		'type_of_warning': warning.type_of_warning,
		'posting_date': warning.posting_date,
		'practitioner': warning.practitioner,
		'practitioner_name': warning.practitioner_name if warning.practitioner else None,
		'warning': warning.warning
	}


@frappe.whitelist()
def mark_sticky_note_verified(name: str):
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Warning Message name is required"))

	row = frappe.db.get_value(
		"Warning Message",
		name,
		["is_special_phone_warning", "verification_method"],
		as_dict=True,
	)
	if not row:
		frappe.throw(_("Warning Message {0} not found").format(name))
	if not row.is_special_phone_warning:
		frappe.throw(_("Only sticky notes can be marked as verified"))

	from healthcare.utils import get_current_user_practitioner

	practitioner = get_current_user_practitioner()
	verified_by_label = practitioner or frappe.session.user

	update_values = {"verification_status": "Verified"}
	if _warning_message_has_column("verified_by_user"):
		update_values["verified_by_user"] = frappe.session.user
	if practitioner and _warning_message_has_column("verified_by_practitioner"):
		update_values["verified_by_practitioner"] = practitioner
	if _warning_message_has_column("verified_on"):
		update_values["verified_on"] = now_datetime()
	else:
		update_values["verification_method"] = (
			f"{(row.verification_method or '').strip()}\nVerified by {verified_by_label} on {now_datetime()}"
		).strip()

	frappe.db.set_value("Warning Message", name, update_values, update_modified=True)
	return get_warning_message(name)

