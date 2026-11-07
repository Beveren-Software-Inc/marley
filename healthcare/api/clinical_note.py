# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import cint, nowdate

from healthcare.api.care_episode import patient_visit_type_info
from healthcare.api.utils.api_utility import get_next_transaction_number
from healthcare.healthcare.doctype.clinical_note.clinical_note import (
	assign_clinical_note_trans_no,
	fill_patient_from_inpatient_admission,
)

# Portal users create/list notes via whitelisted APIs; REST /api/resource still enforces DocPerm.
CLINICAL_NOTE_PORTAL_READ_ROLES = frozenset(
	{
		"Administrator",
		"System Manager",
		"Healthcare Administrator",
		"Doctor",
		"Nurse",
		"Physician",
		"Psychologist",
		"Anesthesiologist",
		"Therapist",
		"Nutritionist",
	}
)


def _user_can_read_clinical_note_portal() -> bool:
	if frappe.session.user in ("Guest", ""):
		return False
	return bool(CLINICAL_NOTE_PORTAL_READ_ROLES & set(frappe.get_roles(frappe.session.user)))


def _user_display_label(full_name: str | None, username: str | None, user_id: str | None = None) -> str:
	"""Prefer a human label over an email login id."""
	full_name = (full_name or "").strip()
	if full_name:
		return full_name
	username = (username or "").strip()
	if username and "@" not in username:
		return username
	user_id = (user_id or "").strip()
	return user_id


def _fill_clinical_note_author_label(note: dict) -> None:
	"""Ensure Username column has a value when username field is empty.

	Order: stored username → practitioner name → Frappe User → practitioner id
	→ Oracle User name for ``cr_id`` (legacy imports) → raw ``cr_id``.
	"""
	if (note.get("username") or "").strip():
		return
	label = (note.get("practitioner_name") or "").strip()
	if not label:
		label = _user_display_label(
			note.get("user_full_name"),
			note.get("user_username"),
			note.get("user"),
		)
	if not label:
		label = (note.get("practitioner") or "").strip()
	if not label:
		label = (note.get("cr_id_name") or "").strip()
	if not label and note.get("cr_id"):
		from healthcare.api.usr_00_01_import import get_user_name

		label = (get_user_name(note.get("cr_id")) or "").strip()
		if label:
			note["cr_id_name"] = label
	if not label:
		label = str(note.get("cr_id") or "").strip()
	if label:
		note["username"] = label


def _enrich_clinical_note_row(note: dict) -> dict:
	if note.get("patient"):
		patient_name = frappe.db.get_value("Patient", note["patient"], "patient_name")
		if patient_name:
			note["patient_name"] = patient_name
	if note.get("practitioner"):
		practitioner_name = frappe.db.get_value(
			"Healthcare Practitioner", note["practitioner"], "practitioner_name"
		)
		if practitioner_name:
			note["practitioner_name"] = practitioner_name
	if note.get("user"):
		user_row = frappe.db.get_value(
			"User", note["user"], ["full_name", "username"], as_dict=True
		)
		if user_row:
			if user_row.full_name:
				note["user_full_name"] = user_row.full_name
			if user_row.username:
				note["user_username"] = user_row.username
	if note.get("cr_id") and not (note.get("cr_id_name") or "").strip():
		from healthcare.api.usr_00_01_import import get_user_name

		oracle_name = (get_user_name(note.get("cr_id")) or "").strip()
		if oracle_name:
			note["cr_id_name"] = oracle_name
	if note.get("medical_role"):
		medical_role_name = frappe.db.get_value("Medical Role", note["medical_role"], "medical_role")
		if medical_role_name:
			note["medical_role_name"] = medical_role_name
	if note.get("clinical_note_type"):
		clinical_note_type_name = frappe.db.get_value(
			"Clinical Note Type", note["clinical_note_type"], "clinical_note_type"
		)
		if clinical_note_type_name:
			note["clinical_note_type_name"] = clinical_note_type_name
	_fill_clinical_note_author_label(note)
	return note


def _enrich_clinical_note_rows(notes: list[dict]) -> None:
	"""Batch-enrich list rows (avoids N+1 at large page sizes on live)."""
	if not notes:
		return

	patient_ids = list({n["patient"] for n in notes if n.get("patient")})
	practitioner_ids = list({n["practitioner"] for n in notes if n.get("practitioner")})
	user_ids = list({n["user"] for n in notes if n.get("user")})
	role_ids = list({n["medical_role"] for n in notes if n.get("medical_role")})
	type_ids = list({n["clinical_note_type"] for n in notes if n.get("clinical_note_type")})

	patients = {}
	if patient_ids:
		patients = {
			r.name: r.patient_name
			for r in frappe.get_all(
				"Patient",
				filters={"name": ["in", patient_ids]},
				fields=["name", "patient_name"],
				limit_page_length=len(patient_ids),
			)
			if r.patient_name
		}

	practitioners = {}
	if practitioner_ids:
		practitioners = {
			r.name: r.practitioner_name
			for r in frappe.get_all(
				"Healthcare Practitioner",
				filters={"name": ["in", practitioner_ids]},
				fields=["name", "practitioner_name"],
				limit_page_length=len(practitioner_ids),
			)
			if r.practitioner_name
		}

	users = {}
	if user_ids:
		users = {
			r.name: r
			for r in frappe.get_all(
				"User",
				filters={"name": ["in", user_ids]},
				fields=["name", "full_name", "username"],
				limit_page_length=len(user_ids),
				ignore_permissions=True,
			)
		}

	roles = {}
	if role_ids:
		roles = {
			r.name: r.medical_role
			for r in frappe.get_all(
				"Medical Role",
				filters={"name": ["in", role_ids]},
				fields=["name", "medical_role"],
				limit_page_length=len(role_ids),
			)
			if r.medical_role
		}

	types = {}
	if type_ids:
		types = {
			r.name: r.clinical_note_type
			for r in frappe.get_all(
				"Clinical Note Type",
				filters={"name": ["in", type_ids]},
				fields=["name", "clinical_note_type"],
				limit_page_length=len(type_ids),
			)
			if r.clinical_note_type
		}

	from healthcare.api.usr_00_01_import import add_user_names

	add_user_names(notes, ("cr_id",))

	for note in notes:
		pid = note.get("patient")
		if pid and patients.get(pid):
			note["patient_name"] = patients[pid]
		pr = note.get("practitioner")
		if pr and practitioners.get(pr):
			note["practitioner_name"] = practitioners[pr]
		uid = note.get("user")
		if uid and users.get(uid):
			urow = users[uid]
			if urow.full_name:
				note["user_full_name"] = urow.full_name
			if urow.username:
				note["user_username"] = urow.username
		mr = note.get("medical_role")
		if mr and roles.get(mr):
			note["medical_role_name"] = roles[mr]
		ct = note.get("clinical_note_type")
		if ct and types.get(ct):
			note["clinical_note_type_name"] = types[ct]
		_fill_clinical_note_author_label(note)


def _attach_visit_encounter_date(note: dict) -> None:
	"""Expose the linked Patient Visit encounter date for UI display."""
	if (note.get("reference_doctype") or "") != "Patient Visit":
		return
	ref = (note.get("reference_document") or "").strip()
	if not ref:
		return
	enc = frappe.db.get_value("Patient Visit", ref, "encounter_date")
	if enc:
		note["visit_encounter_date"] = str(enc)


def _attach_visit_encounter_dates(notes: list[dict]) -> None:
	names = []
	for note in notes:
		if (note.get("reference_doctype") or "") == "Patient Visit" and note.get("reference_document"):
			names.append(note["reference_document"])
	if not names:
		return
	rows = frappe.db.get_all(
		"Patient Visit",
		filters={"name": ["in", list(set(names))]},
		fields=["name", "encounter_date"],
	)
	by_name = {r.name: r.encounter_date for r in rows}
	for note in notes:
		if (note.get("reference_doctype") or "") != "Patient Visit":
			continue
		enc = by_name.get(note.get("reference_document"))
		if enc:
			note["visit_encounter_date"] = str(enc)


def _get_or_create_clinical_note_type(name: str | None) -> str | None:
	if not name:
		return None

	if not frappe.db.exists("Clinical Note Type", name):
		doc = frappe.get_doc({
			"doctype": "Clinical Note Type",
			"clinical_note_type": name,
		})
		# Use ignore_permissions so clinicians can create types on the fly
		doc.insert(ignore_permissions=True)

	return name


def _resolve_clinical_note_medical_role(data: dict) -> str:
	"""
	Clinical Note.medical_role is mandatory. Prefer payload, then Healthcare Practitioner,
	then fallback to Medical Role "Doctor".
	"""
	mr = (data.get('medical_role') or '').strip()
	if mr:
		return mr
	pr = (data.get('practitioner') or '').strip()
	if pr:
		from_pr = frappe.db.get_value('Healthcare Practitioner', pr, 'medical_role')
		if from_pr:
			return from_pr
	if frappe.db.exists('Medical Role', 'Doctor'):
		return 'Doctor'
	frappe.throw(
		_(
			'Medical Role is missing. Either pass medical_role, set Healthcare Practitioner.medical_role, '
			'or create a Medical Role named "Doctor".'
		),
	)


# @frappe.whitelist()
# def get_clinical_notes(limit=50, offset=0, patient=None, medical_role=None, clinical_note_type=None, note_type=None):
# 	"""Get list of Clinical Notes with optional filters"""
# 	filters = {}
	
# 	if patient:
# 		filters['patient'] = patient
	
# 	if medical_role:
# 		filters['medical_role'] = medical_role
# 	print("Clinical note",clinical_note_type )
# 	# if clinical_note_type:
# 	# 	filters['clinical_note_type'] = clinical_note_type
	
# 	if note_type:
# 		filters['note_type'] = note_type
	
# 	print("here nafikjal filters", filters)
# 	clinical_notes = frappe.get_all(
# 		'Clinical Note',
# 		filters=filters,
# 		fields=[
# 			'name',
# 			'patient',
# 			'posting_date',
# 			'practitioner',
# 			'user',
# 			'clinical_note_type',
# 			# 'note_type',
# 			'medical_role',
# 			'note',
# 			'reference_doc',
# 			'reference_name',
# 			'branch'
# 		],
# 		limit=limit,
# 		limit_start=offset,
# 		order_by='posting_date desc'
# 	)
def _clinical_note_list_filters(kwargs: dict) -> tuple[list, list | None]:
	"""Build frappe AND filters and optional OR filters for Clinical Note listing."""
	patient = kwargs.get('patient')
	medical_role = kwargs.get('medical_role')
	clinical_note_type = kwargs.get('clinical_note_type')
	reference_doctype = kwargs.get('ref_doctype')
	reference_document = kwargs.get('ref_document')
	inpatient_admission = (
		kwargs.get('inpatient_admission')
		or kwargs.get('admission_no')
		or kwargs.get('admission')
	)
	if inpatient_admission:
		inpatient_admission = str(inpatient_admission).strip() or None

	practitioner = kwargs.get('practitioner')
	posting_date_from = kwargs.get('posting_date_from') or kwargs.get('from_date')
	posting_date_to = kwargs.get('posting_date_to') or kwargs.get('to_date')

	filter_list: list = []

	if patient:
		filter_list.append(['patient', '=', patient])

	if practitioner:
		filter_list.append(['practitioner', '=', practitioner])

	if clinical_note_type:
		filter_list.append(['clinical_note_type', '=', clinical_note_type])
	elif medical_role:
		roles_to_filter = resolve_medical_role_filter(medical_role)
		if len(roles_to_filter) == 1:
			filter_list.append(['medical_role', '=', roles_to_filter[0]])
		else:
			filter_list.append(['medical_role', 'in', roles_to_filter])

	# IP: scope by inpatient_admission link (admission no is stored here, not reference_document).
	or_filters = None
	if inpatient_admission:
		filter_list.append(['inpatient_admission', '=', inpatient_admission])
	elif reference_doctype:
		filter_list.append(['reference_doctype', '=', reference_doctype])
		if reference_document:
			filter_list.append(['reference_document', '=', reference_document])
	elif reference_document:
		filter_list.append(['reference_document', '=', reference_document])

	if posting_date_from and posting_date_to:
		filter_list.append(['posting_date', 'between', [posting_date_from, posting_date_to]])
	elif posting_date_from:
		filter_list.append(['posting_date', '>=', posting_date_from])
	elif posting_date_to:
		filter_list.append(['posting_date', '<=', posting_date_to])

	return filter_list, or_filters  # or_filters reserved; admission uses inpatient_admission only


@frappe.whitelist()
def get_clinical_notes(**kwargs):
	"""Get list of Clinical Notes with optional filters"""
	portal_reader = _user_can_read_clinical_note_portal()
	has_read = frappe.has_permission("Clinical Note", "read")
	if not has_read and not portal_reader:
		frappe.throw(_("Not permitted to access Clinical Notes"), frappe.PermissionError)

	# Note: ref_doctype/ref_document used instead of reference_doctype/reference_document
	# because Frappe's request handler strips those reserved parameter names before
	# they reach the whitelisted function.
	limit = kwargs.get('limit', 50)
	offset = kwargs.get('offset', 0)
	patient = kwargs.get('patient')
	practitioner = kwargs.get('practitioner')
	mine_only = cint(kwargs.get('mine_only'))

	# Without a patient context, optional "only my notes" (linked Healthcare Practitioner).
	if mine_only and not patient:
		practitioner = frappe.db.get_value(
			'Healthcare Practitioner', {'user_id': frappe.session.user}, 'name'
		)
		if not practitioner:
			return {'data': [], 'total_count': 0}
		kwargs = dict(kwargs)
		kwargs['practitioner'] = practitioner

	filter_list, or_filters = _clinical_note_list_filters(kwargs)
	ignore_permissions = portal_reader and not has_read

	total_count = len(
		frappe.get_all(
			'Clinical Note',
			filters=filter_list,
			or_filters=or_filters,
			pluck='name',
			ignore_permissions=ignore_permissions,
		)
	)

	clinical_notes = frappe.get_all(
		'Clinical Note',
		filters=filter_list,
		or_filters=or_filters,
		fields=[
			'name',
			'patient',
			'posting_date',
			'practitioner',
			'user',
			'username',
			'cr_id',
			'clinical_note_type',
			'medical_role',
			'note',
			'reference_doctype',
			'reference_document',
			'inpatient_admission',
			'branch',
			'creation',
			'modified',
			'note_locked',
		],
		limit=int(limit),
		limit_start=int(offset),
		order_by='posting_date desc',
		ignore_permissions=ignore_permissions,
	)
	_enrich_clinical_note_rows(clinical_notes)
	_attach_visit_encounter_dates(clinical_notes)

	return {
		'data': clinical_notes,
		'total_count': int(total_count or 0),
	}


@frappe.whitelist()
def get_clinical_note(name: str | None = None):
	"""Return one Clinical Note for the healthcare portal (avoids REST DocPerm gaps)."""
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Clinical Note is required"))

	if not frappe.db.exists("Clinical Note", name):
		frappe.throw(_("Clinical Note {0} not found").format(name))

	doc = frappe.get_doc("Clinical Note", name)

	if not frappe.has_permission("Clinical Note", "read", doc=doc):
		if not _user_can_read_clinical_note_portal():
			frappe.throw(
				_("Not permitted to read Clinical Note"),
				frappe.PermissionError,
			)

	row = _enrich_clinical_note_row(doc.as_dict())
	_attach_visit_encounter_date(row)
	return row


@frappe.whitelist()
def get_encounters_pending_doctor_progress_note(clinical_note_type='Doctor Progress Note'):
	"""Encounters (IP or same-day OP) with no Doctor Progress Note yet — any doctor.

	Once any Doctor Progress Note exists for that admission/visit, the row is omitted.
	"""
	if not clinical_note_type or not frappe.db.exists('Clinical Note Type', clinical_note_type):
		return []

	today = nowdate()
	rows = []

	admissions = frappe.db.sql(
		"""
		SELECT ia.name AS reference_document, ia.patient, ia.status AS context_status
		FROM `tabInpatient Admission` ia
		WHERE ia.docstatus = 1
			AND ia.status IN ('Admission Scheduled', 'Admitted')
			AND NOT EXISTS (
				SELECT 1 FROM `tabClinical Note` cn
				WHERE cn.docstatus != 2
					AND cn.clinical_note_type = %(cnt)s
					AND cn.reference_doctype = 'Inpatient Admission'
					AND cn.reference_document = ia.name
			)
		ORDER BY ia.modified DESC
		LIMIT 200
		""",
		{'cnt': clinical_note_type},
		as_dict=True,
	)

	for a in admissions:
		pname = frappe.db.get_value('Patient', a.patient, 'patient_name') or a.patient
		rows.append({
			'patient': a.patient,
			'patient_name': pname,
			'reference_doctype': 'Inpatient Admission',
			'reference_document': a.reference_document,
			'context_label': 'Inpatient',
			'context_status': a.context_status,
		})

	visits = frappe.db.sql(
		"""
		SELECT pv.name AS reference_document, pv.patient, pv.status AS context_status,
			pv.encounter_date
		FROM `tabPatient Visit` pv
		WHERE pv.docstatus = 1
			AND pv.status IN ('Open', 'Medication In Progress', 'Ordered')
			AND pv.encounter_date = %(today)s
			AND NOT EXISTS (
				SELECT 1 FROM `tabClinical Note` cn
				WHERE cn.docstatus != 2
					AND cn.clinical_note_type = %(cnt)s
					AND cn.reference_doctype = 'Patient Visit'
					AND cn.reference_document = pv.name
			)
		ORDER BY pv.encounter_time ASC, pv.name ASC
		LIMIT 200
		""",
		{'cnt': clinical_note_type, 'today': today},
		as_dict=True,
	)

	for v in visits:
		pname = frappe.db.get_value('Patient', v.patient, 'patient_name') or v.patient
		visit_info = patient_visit_type_info(v.reference_document)
		context_label = 'IOP (today)' if visit_info.get('is_iop_visit') else 'Outpatient (today)'
		rows.append({
			'patient': v.patient,
			'patient_name': pname,
			'reference_doctype': 'Patient Visit',
			'reference_document': v.reference_document,
			'context_label': context_label,
			'context_status': v.context_status,
			'encounter_date': v.encounter_date,
			'is_iop_visit': visit_info.get('is_iop_visit'),
		})

	# De-duplicate by patient + reference (same patient could appear twice if multiple visits — keep all visits)
	return rows


@frappe.whitelist()
def get_next_clinical_note_trans_no():
	"""Preview next trans_no for Clinical Note (portal / desk)."""
	return get_next_transaction_number("Clinical Note", fieldname="trans_no")


@frappe.whitelist()
def create_clinical_note(data):
	"""Create a new Clinical Note (used for Diagnosis Detail etc.)"""
	if isinstance(data, str):
		import json
		data = json.loads(data)

	# trans_no is server-assigned only (autoname: field:trans_no)
	data.pop("trans_no", None)
	data.pop("name", None)

	patient = data.get('patient')
	note = data.get('note')
	
	if not patient:
		frappe.throw(_("Patient is required"))
	if not note:
		frappe.throw(_("Note is required"))

	# Derive / ensure Clinical Note Type
	clinical_note_type = data.get('clinical_note_type') or data.get('note_type')
	clinical_note_type = _get_or_create_clinical_note_type(clinical_note_type)

	if not clinical_note_type:
		frappe.throw(_("Clinical Note Type is required"))

	# Determine reference doctype and document
	reference_doctype = None
	reference_document = None
	
	admission_no = data.get('admission_no')
	patient_visit = data.get('patient_visit')
	
	if admission_no:
		reference_doctype = 'Inpatient Admission'
		reference_document = admission_no
	elif patient_visit:
		reference_doctype = 'Patient Visit'
		reference_document = patient_visit
	# If neither is provided, we can still create the note without a reference
	
	inpatient_admission = data.get('inpatient_admission') or admission_no

	cost_center = None
	try:
		from healthcare.api.sales_order_cost_center import resolve_cost_center_for_clinical_doc

		cost_center = resolve_cost_center_for_clinical_doc(data)
	except Exception:
		pass

	practitioner = (data.get('practitioner') or '').strip() or None
	username = (data.get('username') or '').strip() or None
	if not username and frappe.session.user not in ("Guest", ""):
		user_row = frappe.db.get_value(
			"User", frappe.session.user, ["full_name", "username"], as_dict=True
		)
		username = _user_display_label(
			user_row.full_name if user_row else None,
			user_row.username if user_row else None,
			frappe.session.user,
		) or None

	doc = frappe.get_doc({
		'doctype': 'Clinical Note',
		'patient': patient,
		'clinical_note_type': clinical_note_type,
		'medical_role': _resolve_clinical_note_medical_role(data),
		'practitioner': practitioner,
		'username': username,
		'posting_date': data.get('posting_date') or nowdate(),
		'note': note,
		'reference_doctype': reference_doctype,
		'reference_document': reference_document,
		'inpatient_admission': inpatient_admission,
	})
	if cost_center:
		doc.cost_center = cost_center

	fill_patient_from_inpatient_admission(doc)
	assign_clinical_note_trans_no(doc)
	doc.insert(ignore_permissions=True)

	return {
		'name': doc.name,
		'trans_no': doc.trans_no,
		'patient': doc.patient,
		'clinical_note_type': doc.clinical_note_type,
		'medical_role': doc.medical_role,
		'reference_doctype': doc.reference_doctype,
		'reference_document': doc.reference_document,
	}


CLINICAL_NOTE_EDIT_WINDOW_HOURS = 24

CLINICAL_NOTE_EDIT_LOCKED_MESSAGE = _(
	"This clinical note can no longer be edited or deleted. Notes are locked 24 hours after creation."
)


def clinical_note_edit_window_expired(creation) -> bool:
	"""True when more than 24 hours have passed since the note was created."""
	from datetime import timedelta

	from frappe.utils import get_datetime, now_datetime

	if not creation:
		return False
	created_dt = get_datetime(creation)
	if not created_dt:
		return False
	return now_datetime() - created_dt > timedelta(hours=CLINICAL_NOTE_EDIT_WINDOW_HOURS)


def assert_clinical_note_editable(doc) -> None:
	"""Reject portal edit/delete when permanently locked, or past 24h if setting is on."""
	if doc.is_new():
		return
	if frappe.db.get_value(doc.doctype, doc.name, "note_locked"):
		frappe.throw(
			_("This clinical note is locked and cannot be edited or deleted."),
			title=_("Note Locked"),
		)
	# Only enforce the 24h window when Healthcare Settings asks for it.
	if not frappe.db.get_single_value("Healthcare Settings", "therapy_note_uneditable_in_24_hour"):
		return
	creation = frappe.db.get_value(doc.doctype, doc.name, "creation")
	if clinical_note_edit_window_expired(creation):
		frappe.throw(
			CLINICAL_NOTE_EDIT_LOCKED_MESSAGE,
			title=_("Not allowed"),
			exc=frappe.ValidationError,
		)


@frappe.whitelist()
def update_clinical_note(data):
	"""Update note text and/or posting_date (24h lock only if Healthcare Settings enables it)."""
	from healthcare.healthcare.editing_lock import assert_editing_allowed

	assert_editing_allowed()
	if isinstance(data, str):
		import json

		data = json.loads(data)
	data = data or {}

	name = (data.get("name") or "").strip()
	if not name:
		frappe.throw(_("Clinical Note name is required"))

	if not frappe.db.exists("Clinical Note", name):
		frappe.throw(_("Clinical Note {0} not found").format(name))

	doc = frappe.get_doc("Clinical Note", name)
	assert_clinical_note_editable(doc)

	if "note" in data:
		note = (data.get("note") or "").strip()
		if not note:
			frappe.throw(_("Note is required"))
		doc.note = note

	if data.get("posting_date"):
		doc.posting_date = data.get("posting_date")

	doc.save(ignore_permissions=True)
	frappe.db.commit()

	return {
		"success": True,
		"name": doc.name,
		"note": doc.note,
		"posting_date": str(doc.posting_date) if doc.posting_date else None,
		"creation": str(doc.creation) if doc.creation else None,
		"modified": str(doc.modified) if doc.modified else None,
	}


@frappe.whitelist()
def delete_clinical_note(name):
	"""Delete a clinical note (same 24h / lock rules as edit)."""
	from healthcare.healthcare.editing_lock import assert_editing_allowed

	assert_editing_allowed()
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Clinical Note name is required"))

	if not frappe.db.exists("Clinical Note", name):
		frappe.throw(_("Clinical Note {0} not found").format(name))

	doc = frappe.get_doc("Clinical Note", name)
	assert_clinical_note_editable(doc)

	frappe.delete_doc("Clinical Note", name, ignore_permissions=True)
	frappe.db.commit()

	return {"success": True, "name": name}
 
 
def resolve_medical_role_filter(medical_role):
    """
    Resolve a medical role (parent or child) to the appropriate filter.
    Returns a list of role names to filter by.
    """
    if not medical_role:
        return []
    
    # Get child roles under this parent
    child_roles = frappe.get_all(
        'Medical Role',
        filters={'parent_medical_role': medical_role},
        pluck='name'
    )
    
    # If children exist, return them; otherwise return the original role
    return child_roles if child_roles else [medical_role]

