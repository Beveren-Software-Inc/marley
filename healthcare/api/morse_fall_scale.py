import json

import frappe
from frappe import _
from frappe.utils import nowdate

from healthcare.api.utils.api_utility import get_next_transaction_number

MORSE_FALL_SCALE_PORTAL_READ_ROLES = frozenset(
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
	}
)


def _user_can_read_morse_fall_scale_portal() -> bool:
	if frappe.session.user in ("Guest", ""):
		return False
	return bool(MORSE_FALL_SCALE_PORTAL_READ_ROLES & set(frappe.get_roles(frappe.session.user)))


def _serialize_morse_fall_scale(doc) -> dict:
	row = doc.as_dict()
	if row.get("patient_no") and not row.get("patient_name"):
		row["patient_name"] = frappe.db.get_value("Patient", row["patient_no"], "patient_name")
	if row.get("practitioner") and not row.get("practitioner_name"):
		row["practitioner_name"] = frappe.db.get_value(
			"Healthcare Practitioner",
			row["practitioner"],
			"practitioner_name",
		)
	return row


@frappe.whitelist()
def get_morse_fall_scale(name: str | None = None):
	"""Return one Morse Fall Scale for the healthcare portal (avoids REST DocPerm gaps)."""
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Morse Fall Scale is required"))

	if not frappe.db.exists("Morse Fall Scale", name):
		frappe.throw(_("Morse Fall Scale {0} not found").format(name))

	doc = frappe.get_doc("Morse Fall Scale", name)

	if not frappe.has_permission("Morse Fall Scale", "read", doc=doc):
		if not _user_can_read_morse_fall_scale_portal():
			frappe.throw(_("Not permitted to read Morse Fall Scale"), frappe.PermissionError)

	return _serialize_morse_fall_scale(doc)


@frappe.whitelist()
def get_morse_fall_scale_list(patient=None, practitioner=None, from_date=None, to_date=None, limit=50, offset=0):
	"""List Morse Fall Scale records for the healthcare portal (avoids REST DocPerm gaps).

	Portal roles (incl. Nurse) read through this endpoint instead of /api/resource,
	which only grants read to Nursing User / Physician / System Manager.
	"""
	if not _user_can_read_morse_fall_scale_portal():
		frappe.throw(_("Not permitted to read Morse Fall Scale"), frappe.PermissionError)

	limit = frappe.utils.cint(limit) or 50
	offset = frappe.utils.cint(offset)

	filters = [["docstatus", "<", 2]]
	if patient:
		filters.append(["patient_no", "=", patient])
	if practitioner:
		filters.append(["practitioner", "=", practitioner])
	if from_date:
		filters.append(["date", ">=", from_date])
	if to_date:
		filters.append(["date", "<=", to_date])

	return frappe.get_all(
		"Morse Fall Scale",
		filters=filters,
		fields=[
			"name",
			"trans_no",
			"admission_no",
			"patient_no",
			"company",
			"practitioner",
			"practitioner_name",
			"cost_center",
			"total_points",
			"date",
			"creation",
			"modified",
		],
		order_by="modified desc",
		limit_page_length=limit,
		limit_start=offset,
		ignore_permissions=True,
	)


@frappe.whitelist()
def create_morse_fall_scale(data):
	"""Create a Morse Fall Scale doc through backend API."""
	if isinstance(data, str):
		data = json.loads(data)

	if not data:
		frappe.throw(_("Morse Fall Scale data is required"))

	required_fields = ["admission_no", "patient_no"]
	for field in required_fields:
		if not data.get(field):
			frappe.throw(_("{0} is required").format(field.replace("_", " ").title()))

	admission_no = data.get("admission_no")
	practitioner = data.get("practitioner")
	cost_center = (
		frappe.db.get_value("Inpatient Admission", admission_no, "cost_center")
		if admission_no
		else None
	)
	practitioner_name = None
	if practitioner:
		practitioner_name = frappe.db.get_value(
			"Healthcare Practitioner", practitioner, "practitioner_name"
		)

	trans_no = get_next_transaction_number("Morse Fall Scale", fieldname="trans_no")

	doc = frappe.get_doc(
		{
			"doctype": "Morse Fall Scale",
			"trans_no": trans_no,
			"admission_no": admission_no,
			"patient_no": data.get("patient_no"),
			"orderer_number": data.get("orderer_number"),
			"company": data.get("company"),
			"date": data.get("date") or nowdate(),
			"written_admission": data.get("written_admission"),
			"cost_center": cost_center,
			"practitioner": practitioner,
			"practitioner_name": practitioner_name,
		}
	)

	if data.get("morse_fall_scale_detail") and isinstance(data.get("morse_fall_scale_detail"), list):
		for row in data.get("morse_fall_scale_detail"):
			if isinstance(row, dict):
				doc.append("morse_fall_scale_detail", row)

	doc.insert(ignore_permissions=True)
	frappe.db.commit()

	return {
		"name": doc.name,
		"admission_no": doc.admission_no,
		"patient_no": doc.patient_no,
		"orderer_number": doc.orderer_number,
		"company": doc.company,
		"cost_center": doc.cost_center,
		"practitioner": doc.practitioner,
		"practitioner_name": doc.practitioner_name,
		"total_points": doc.total_points,
		"creation": doc.creation,
		"modified": doc.modified,
		"morse_fall_scale_detail": doc.morse_fall_scale_detail,
	}


_MORSE_FALL_SCALE_UPDATE_FIELDS = (
	"admission_no",
	"patient_no",
	"orderer_number",
	"company",
	"date",
	"written_admission",
	"cost_center",
	"practitioner",
)


@frappe.whitelist()
def update_morse_fall_scale(data):
	"""Update an existing Morse Fall Scale (24h window when setting enabled)."""
	from healthcare.healthcare.editing_lock import assert_editable_within_24h_if_enabled

	if isinstance(data, str):
		data = json.loads(data)
	data = data or {}
	name = (data.get("name") or "").strip()
	if not name:
		frappe.throw(_("Morse Fall Scale name is required"))
	if not frappe.db.exists("Morse Fall Scale", name):
		frappe.throw(_("Morse Fall Scale {0} not found").format(name))

	assert_editable_within_24h_if_enabled("Morse Fall Scale", name, "unedit_within_24hour")

	doc = frappe.get_doc("Morse Fall Scale", name)
	for field in _MORSE_FALL_SCALE_UPDATE_FIELDS:
		if field not in data:
			continue
		setattr(doc, field, data.get(field))

	if "practitioner" in data:
		practitioner = data.get("practitioner")
		doc.practitioner_name = (
			frappe.db.get_value("Healthcare Practitioner", practitioner, "practitioner_name")
			if practitioner
			else None
		)

	if "morse_fall_scale_detail" in data and isinstance(data.get("morse_fall_scale_detail"), list):
		doc.set("morse_fall_scale_detail", [])
		for row in data.get("morse_fall_scale_detail"):
			if isinstance(row, dict):
				doc.append("morse_fall_scale_detail", row)

	doc.save(ignore_permissions=True)
	frappe.db.commit()

	return {
		"name": doc.name,
		"admission_no": doc.admission_no,
		"patient_no": doc.patient_no,
		"orderer_number": doc.orderer_number,
		"company": doc.company,
		"cost_center": doc.cost_center,
		"practitioner": doc.practitioner,
		"practitioner_name": doc.practitioner_name,
		"total_points": doc.total_points,
		"creation": doc.creation,
		"modified": doc.modified,
		"morse_fall_scale_detail": doc.morse_fall_scale_detail,
	}
