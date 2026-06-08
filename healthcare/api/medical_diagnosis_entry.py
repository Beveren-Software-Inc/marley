"""Medical Diagnosis Entry — standalone OP/IP diagnoses (replaces patient_diagnosis child tables)."""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import now_datetime

from healthcare.api.common import _enrich_diagnosis_display

ALLOWED_PARENT_DOCTYPES = ("Patient Visit", "Inpatient Admission")

# Portal users list/read via whitelisted APIs; REST /api/resource may enforce DocPerm gaps.
MEDICAL_DIAGNOSIS_PORTAL_READ_ROLES = frozenset(
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


def _user_can_read_medical_diagnosis_portal() -> bool:
	if frappe.session.user in ("Guest", ""):
		return False
	return bool(MEDICAL_DIAGNOSIS_PORTAL_READ_ROLES & set(frappe.get_roles(frappe.session.user)))


def _parse_rows(rows) -> list[dict]:
	if isinstance(rows, str):
		rows = json.loads(rows)
	return rows if isinstance(rows, list) else []


def _context_filters(parent_doctype: str, parent_name: str) -> dict:
	if parent_doctype == "Patient Visit":
		return {"visit_num": parent_name}
	if parent_doctype == "Inpatient Admission":
		return {"inpatient_admission": parent_name}
	frappe.throw(_("Parent must be Patient Visit or Inpatient Admission"))


def _apply_context_fields(doc, parent_doctype: str, parent_name: str, patient: str | None) -> None:
	if parent_doctype == "Patient Visit":
		doc.visit_num = parent_name
		doc.inpatient_admission = None
	elif parent_doctype == "Inpatient Admission":
		doc.inpatient_admission = parent_name
		doc.visit_num = None
	if patient:
		doc.patient = patient
		if not doc.patient_name:
			doc.patient_name = frappe.db.get_value("Patient", patient, "patient_name")


def serialize_entry(row) -> dict:
	"""Shape a Medical Diagnosis Entry row for the healthcare frontend."""
	dlink = row.diagnosis if hasattr(row, "diagnosis") else row.get("diagnosis")
	meta = _enrich_diagnosis_display(dlink)

	def _get(field):
		return getattr(row, field, None) if hasattr(row, field) else row.get(field)

	return {
		"name": _get("name"),
		"diagnosis": dlink or "",
		**meta,
		"details": _get("details") or "",
		"posting_date": str(_get("posting_date") or ""),
		"diagnoses_time": str(_get("diagnoses_time") or ""),
		"practitioner": _get("practitioner") or "",
		"practitioner_name": _get("practitioner_name") or "",
		"diagnoses_flag": cint(_get("diagnoses_flag")),
		"trans_num": _get("trans_num") or "",
		"visit_num": _get("visit_num") or "",
		"inpatient_admission": _get("inpatient_admission") or "",
		"patient": _get("patient") or "",
		"patient_name": _get("patient_name") or "",
		"group_code": _get("group_code") or "",
		"cost_center": _get("cost_center") or "",
	}


ENTRY_LIST_FIELDS = [
	"name",
	"diagnosis",
	"details",
	"posting_date",
	"diagnoses_time",
	"practitioner",
	"practitioner_name",
	"diagnoses_flag",
	"trans_num",
	"visit_num",
	"inpatient_admission",
	"patient",
	"patient_name",
	"group_code",
	"cost_center",
]


def _attach_parent_context(item: dict, row) -> dict:
	visit_num = row.visit_num if hasattr(row, "visit_num") else row.get("visit_num")
	admission = (
		row.inpatient_admission
		if hasattr(row, "inpatient_admission")
		else row.get("inpatient_admission")
	)
	if visit_num:
		item["parent"] = visit_num
		item["parent_type"] = "Patient Visit"
	elif admission:
		item["parent"] = admission
		item["parent_type"] = "Inpatient Admission"
	else:
		item["parent"] = ""
		item["parent_type"] = ""
	return item


def cint(value) -> int:
	return frappe.utils.cint(value)


def list_for_context(parent_doctype: str, parent_name: str) -> list[dict]:
	if not parent_name:
		return []
	filters = _context_filters(parent_doctype, parent_name)
	rows = frappe.get_all(
		"Medical Diagnosis Entry",
		filters=filters,
		fields=ENTRY_LIST_FIELDS,
		order_by="posting_date desc, creation desc",
	)
	return [serialize_entry(row) for row in rows]


def list_all_entries(limit=200, offset=0, patient=None) -> list[dict]:
	"""Return Medical Diagnosis Entry rows (newest first), optionally filtered by patient."""
	filters = {}
	if patient:
		filters["patient"] = patient

	limit = max(1, min(cint(limit) or 200, 500))
	offset = max(0, cint(offset))

	entries = frappe.get_all(
		"Medical Diagnosis Entry",
		filters=filters or None,
		fields=ENTRY_LIST_FIELDS,
		order_by="posting_date desc, creation desc",
		limit_page_length=limit,
		start=offset,
	)

	results = []
	for row in entries:
		item = serialize_entry(row)
		_attach_parent_context(item, row)
		results.append(item)

	return results


def _parent_context_defaults(parent_doctype: str, parent_name: str) -> dict:
	"""Default practitioner and cost center from the linked visit or admission."""
	if not parent_name:
		return {}
	if parent_doctype == "Patient Visit":
		row = frappe.db.get_value(
			"Patient Visit",
			parent_name,
			["cost_center", "practitioner", "practitioner_name"],
			as_dict=True,
		)
		return row or {}

	row = frappe.db.get_value(
		"Inpatient Admission",
		parent_name,
		["cost_center", "primary_practitioner", "admission_practitioner"],
		as_dict=True,
	) or {}
	practitioner = row.get("primary_practitioner") or row.get("admission_practitioner")
	practitioner_name = ""
	if practitioner:
		practitioner_name = (
			frappe.db.get_value("Healthcare Practitioner", practitioner, "practitioner_name")
			or ""
		)
	return {
		"cost_center": row.get("cost_center"),
		"practitioner": practitioner,
		"practitioner_name": practitioner_name,
	}


def list_for_patient(patient: str) -> list[dict]:
	if not patient:
		return []

	entries = frappe.get_all(
		"Medical Diagnosis Entry",
		filters={"patient": patient},
		fields=ENTRY_LIST_FIELDS,
		order_by="posting_date desc, creation desc",
	)

	visit_dates = {
		v.name: v.encounter_date
		for v in frappe.get_all(
			"Patient Visit",
			filters={"patient": patient},
			fields=["name", "encounter_date"],
		)
	}
	admission_dates = {
		a.name: a.admitted_datetime
		for a in frappe.get_all(
			"Inpatient Admission",
			filters={"patient": patient},
			fields=["name", "admitted_datetime"],
		)
	}

	results = []
	for row in entries:
		item = serialize_entry(row)
		_attach_parent_context(item, row)
		if row.visit_num:
			item["parent_date"] = str(visit_dates.get(row.visit_num) or "")
		elif row.inpatient_admission:
			item["parent_date"] = str(admission_dates.get(row.inpatient_admission) or "")
		else:
			item["parent_date"] = ""
		results.append(item)

	return results


def _row_to_doc_fields(row: dict, parent_doctype: str, parent_name: str, patient: str) -> dict:
	now = now_datetime()
	posting = row.get("posting_date") or now
	diagnoses_time = row.get("diagnoses_time") or posting
	defaults = _parent_context_defaults(parent_doctype, parent_name)

	practitioner = (row.get("practitioner") or defaults.get("practitioner") or "").strip()
	practitioner_name = (row.get("practitioner_name") or defaults.get("practitioner_name") or "").strip()
	if practitioner and not practitioner_name:
		practitioner_name = (
			frappe.db.get_value("Healthcare Practitioner", practitioner, "practitioner_name") or ""
		)

	cost_center = (row.get("cost_center") or defaults.get("cost_center") or "").strip()

	return {
		"patient": patient,
		"patient_name": row.get("patient_name")
		or frappe.db.get_value("Patient", patient, "patient_name"),
		"diagnosis": row.get("diagnosis"),
		"details": row.get("details") or "",
		"posting_date": posting,
		"diagnoses_time": diagnoses_time,
		"practitioner": practitioner,
		"practitioner_name": practitioner_name,
		"diagnoses_flag": 1 if row.get("diagnoses_flag") else 0,
		"trans_num": row.get("trans_num") or "",
		"group_code": row.get("group_code") or "",
		"cost_center": cost_center,
		"visit_num": parent_name if parent_doctype == "Patient Visit" else None,
		"inpatient_admission": parent_name if parent_doctype == "Inpatient Admission" else None,
	}


def save_for_context(parent_doctype: str, parent_name: str, rows) -> dict:
	"""Replace diagnoses for one visit/admission with the provided list."""
	if parent_doctype not in ALLOWED_PARENT_DOCTYPES:
		frappe.throw(_("Parent must be Patient Visit or Inpatient Admission"))
	if not parent_name:
		frappe.throw(_("Parent name is required"))

	rows = _parse_rows(rows)
	parent_doc = frappe.get_doc(parent_doctype, parent_name)
	if parent_doc.docstatus == 2:
		frappe.throw(_("Cannot modify diagnoses on a cancelled {0}").format(parent_doctype))

	patient = parent_doc.patient
	filters = _context_filters(parent_doctype, parent_name)
	existing_names = frappe.get_all("Medical Diagnosis Entry", filters=filters, pluck="name")
	kept: set[str] = set()

	for idx, row in enumerate(rows):
		diagnosis = (row.get("diagnosis") or "").strip()
		if not diagnosis:
			continue

		fields = _row_to_doc_fields(row, parent_doctype, parent_name, patient)
		entry_name = row.get("name")

		if entry_name and entry_name in existing_names:
			doc = frappe.get_doc("Medical Diagnosis Entry", entry_name)
			doc.update(fields)
			doc.save(ignore_permissions=True)
			kept.add(entry_name)
		else:
			doc = frappe.new_doc("Medical Diagnosis Entry")
			doc.update(fields)
			_apply_context_fields(doc, parent_doctype, parent_name, patient)
			doc.insert(ignore_permissions=True)
			kept.add(doc.name)

	for name in existing_names:
		if name not in kept:
			frappe.delete_doc("Medical Diagnosis Entry", name, force=True, ignore_permissions=True)

	frappe.db.commit()
	return {"ok": True, "saved": len(kept)}


def append_for_context(parent_doctype: str, parent_name: str, rows) -> dict:
	"""Insert new diagnoses for a visit/admission without changing or removing existing ones."""
	if parent_doctype not in ALLOWED_PARENT_DOCTYPES:
		frappe.throw(_("Parent must be Patient Visit or Inpatient Admission"))
	if not parent_name:
		frappe.throw(_("Parent name is required"))

	rows = _parse_rows(rows)
	parent_doc = frappe.get_doc(parent_doctype, parent_name)
	if parent_doc.docstatus == 2:
		frappe.throw(_("Cannot modify diagnoses on a cancelled {0}").format(parent_doctype))

	patient = parent_doc.patient
	created = 0

	for row in rows:
		if row.get("name"):
			continue
		diagnosis = (row.get("diagnosis") or "").strip()
		if not diagnosis:
			continue

		fields = _row_to_doc_fields(row, parent_doctype, parent_name, patient)
		doc = frappe.new_doc("Medical Diagnosis Entry")
		doc.update(fields)
		_apply_context_fields(doc, parent_doctype, parent_name, patient)
		doc.insert(ignore_permissions=True)
		created += 1

	frappe.db.commit()
	return {"ok": True, "saved": created}


def delete_entry(name: str) -> dict:
	if not name:
		frappe.throw(_("Entry name is required"))
	frappe.delete_doc("Medical Diagnosis Entry", name, force=True, ignore_permissions=True)
	frappe.db.commit()
	return {"success": True, "message": _("Diagnosis entry deleted")}


@frappe.whitelist()
def get_entries_for_context(parent_doctype: str, parent_name: str) -> list[dict]:
	return list_for_context(parent_doctype, parent_name)


@frappe.whitelist()
def get_context_defaults(parent_doctype: str, parent_name: str) -> dict:
	"""Practitioner and cost center defaults for new diagnosis rows."""
	if parent_doctype not in ALLOWED_PARENT_DOCTYPES:
		frappe.throw(_("Parent must be Patient Visit or Inpatient Admission"))
	return _parent_context_defaults(parent_doctype, parent_name)


@frappe.whitelist()
def get_entries_for_patient(patient: str) -> list[dict]:
	return list_for_patient(patient)


@frappe.whitelist()
def get_all_entries(limit=200, offset=0, patient=None) -> list[dict]:
	return list_all_entries(limit=limit, offset=offset, patient=patient)


@frappe.whitelist()
def get_medical_diagnosis_entry(name: str | None = None) -> dict:
	"""Return one Medical Diagnosis Entry for the healthcare portal."""
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Medical Diagnosis Entry is required"))

	if not frappe.db.exists("Medical Diagnosis Entry", name):
		frappe.throw(_("Medical Diagnosis Entry {0} not found").format(name))

	doc = frappe.get_doc("Medical Diagnosis Entry", name)

	if not frappe.has_permission("Medical Diagnosis Entry", "read", doc=doc):
		if not _user_can_read_medical_diagnosis_portal():
			frappe.throw(
				_("Not permitted to read Medical Diagnosis Entry"),
				frappe.PermissionError,
			)

	item = serialize_entry(doc)
	_attach_parent_context(item, doc)
	return item


@frappe.whitelist()
def save_entries_for_context(parent_doctype: str, parent_name: str, rows) -> dict:
	return save_for_context(parent_doctype, parent_name, rows)


@frappe.whitelist()
def append_entries_for_context(parent_doctype: str, parent_name: str, rows) -> dict:
	return append_for_context(parent_doctype, parent_name, rows)


@frappe.whitelist()
def delete_medical_diagnosis_entry(name: str) -> dict:
	return delete_entry(name)
