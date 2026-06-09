# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _

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
		row["patient_name"] = (
			frappe.db.get_value("Patient", row["patient"], "patient_name") or row["patient"]
		)

	if row.get("practitioner"):
		row["practitioner_name"] = (
			frappe.db.get_value(
				"Healthcare Practitioner", row["practitioner"], "practitioner_name"
			)
			or row["practitioner"]
		)

	if not row.get("type_of_warning"):
		row["type_of_warning"] = "Medical"

	return row


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


def insert_medical_warning_message(
	patient: str,
	warning: str,
	*,
	reference_doc: str | None = None,
	reference_name: str | None = None,
	practitioner: str | None = None,
	posting_date=None,
	clinical_note_type: str | None = None,
	medical_role: str | None = None,
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
			"clinical_note_type": clinical_note_type,
			"medical_role": medical_role,
			"reference_doc": reference_doc,
			"reference_name": reference_name,
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

	if patient:
		filters['patient'] = patient
	elif no_patient_scope and str(no_patient_scope).lower() in ('organisation', 'organization'):
		filters['type_of_warning'] = 'Organisation'

	if type_of_warning:
		filters['type_of_warning'] = type_of_warning

	if practitioner:
		filters['practitioner'] = practitioner

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
		fields=[
			'name',
			'patient',
			'posting_date',
			'practitioner',
			'warning',
			'reference_doc',
			'reference_name',
			'medical_role',
			'type_of_warning',
		],
		limit=limit,
		limit_start=offset,
		order_by='posting_date desc',
		ignore_permissions=portal_reader and not has_read,
	)

	return [_enrich_warning_message_row(warning) for warning in warnings]


@frappe.whitelist()
def get_warning_message(name=None):
	"""Return one Warning Message for the healthcare portal (avoids REST DocPerm gaps)."""
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Warning Message name is required"))

	if not frappe.db.exists("Warning Message", name):
		frappe.throw(_("Warning Message {0} not found").format(name))

	doc = frappe.get_doc("Warning Message", name)

	if not frappe.has_permission("Warning Message", "read", doc=doc):
		if not _user_can_read_warning_message_portal():
			frappe.throw(
				_("Not permitted to read Warning Message"),
				frappe.PermissionError,
			)

	return _enrich_warning_message_row(doc)


@frappe.whitelist()
def create_warning_message(data):
	"""Create a new Warning Message"""
	if isinstance(data, str):
		import json
		data = json.loads(data)
	
	wtype = (data.get('type_of_warning') or 'Medical').strip()
	if wtype not in ('Medical', 'Organisation'):
		wtype = 'Medical'

	if wtype == 'Medical' and not data.get('patient'):
		frappe.throw(_("Patient is required for medical warnings"))

	if wtype == 'Medical':
		warning = insert_medical_warning_message(
			data.get('patient'),
			data.get('warning', ''),
			practitioner=data.get('practitioner'),
			posting_date=data.get('posting_date'),
			clinical_note_type=data.get('clinical_note_type'),
			medical_role=data.get('medical_role'),
		)
	else:
		warning = frappe.get_doc(
			{
				'doctype': 'Warning Message',
				'trans_id': allocate_warning_trans_id(),
				'type_of_warning': wtype,
				'patient': data.get('patient') or None,
				'warning': data.get('warning', ''),
				'practitioner': data.get('practitioner'),
				'posting_date': data.get('posting_date') or frappe.utils.now(),
				'clinical_note_type': data.get('clinical_note_type'),
				'medical_role': data.get('medical_role'),
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

