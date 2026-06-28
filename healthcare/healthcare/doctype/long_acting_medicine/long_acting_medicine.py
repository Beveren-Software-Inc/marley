# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, cint, getdate, nowdate, nowtime


LONG_ACTING_GIVE_OUT_ROLES = frozenset(
	{
		"Administrator",
		"System Manager",
		"Healthcare Administrator",
		"Doctor",
		"Nurse",
		"Physician",
		"Nursing User",
	}
)


def _long_acting_frequency_interval_days(frequency):
	if not frequency:
		return 7
	frequency = frequency.strip()
	interval = frappe.db.get_value("Long Acting Frequency", frequency, "interval_days")
	if interval:
		return cint(interval)
	m = {
		"Weekly": 7,
		"Biweekly": 14,
		"Monthly": 30,
		"Every 2 Months": 60,
		"Every 3 Months": 90,
	}
	return m.get(frequency, 7)


def user_can_give_out_long_acting_medicine(user=None):
	user = user or frappe.session.user
	if user in ("Guest", ""):
		return False
	return bool(LONG_ACTING_GIVE_OUT_ROLES & set(frappe.get_roles(user)))


def _row_field(row, field):
	if not row:
		return None
	if isinstance(row, dict):
		return row.get(field)
	return getattr(row, field, None)


def _safe_getdate(value):
	if not value:
		return None
	try:
		return getdate(value)
	except Exception:
		return None


LONG_ACTING_GIVE_OUT_FIELDS = [
	"name",
	"date",
	"time",
	"user",
	"scheduled_run_date",
	"notes",
	"creation",
	"trans_no",
	"cr_id",
	"cr_date",
	"up_id",
	"up_date",
	"dose",
	"medication",
	"nurse_flag",
	"written_frequency",
	"is_cancelled",
	"cancelled_notes",
	"next_dose",
	"dose_term",
	"rt_flag",
	"lt_flag",
]


def _has_give_out_for_scheduled_date(doc, scheduled_run_date):
	scheduled = getdate(scheduled_run_date)
	for row in doc.get("give_outs") or []:
		row_date = _safe_getdate(_row_field(row, "scheduled_run_date"))
		if row_date and row_date == scheduled:
			return True
	return False


def _medication_display_label(drug_name=None, old_medication_name=None, medication=None):
	return (drug_name or "").strip() or (old_medication_name or "").strip() or (medication or "").strip() or None


def _first_medication_labels_for_parents(parent_names):
	"""Map LAM name -> first medication label (drug_name, else old_medication_name, else give-out medication)."""
	if not parent_names:
		return {}

	labels = {}
	med_rows = frappe.get_all(
		"Subscription Medication Plan Item",
		filters={"parent": ["in", parent_names]},
		fields=["parent", "drug_name", "old_medication_name", "idx"],
		order_by="parent asc, idx asc",
	)
	for row in med_rows:
		if row.parent in labels:
			continue
		label = _medication_display_label(row.drug_name, row.old_medication_name)
		if label:
			labels[row.parent] = label

	missing = [name for name in parent_names if name not in labels]
	if missing:
		give_out_rows = frappe.get_all(
			"Long Acting Medicine Give Out",
			filters={"parent": ["in", missing]},
			fields=["parent", "medication", "idx"],
			order_by="parent asc, idx asc",
		)
		for row in give_out_rows:
			if row.parent in labels:
				continue
			label = _medication_display_label(medication=row.medication)
			if label:
				labels[row.parent] = label

	return labels


def _first_medication_doses_for_parents(parent_names):
	"""Map LAM name -> {default_dosage, default_dosage_form} from first plan item."""
	if not parent_names:
		return {}

	defaults = {}
	med_rows = frappe.get_all(
		"Subscription Medication Plan Item",
		filters={"parent": ["in", parent_names]},
		fields=["parent", "dosage", "dosage_form", "idx"],
		order_by="parent asc, idx asc",
	)
	for row in med_rows:
		if row.parent in defaults:
			continue
		dosage = _format_dosage_value(row.dosage)
		dosage_form = (row.dosage_form or "").strip() or None
		if dosage or dosage_form:
			defaults[row.parent] = {
				"default_dosage": dosage,
				"default_dosage_form": dosage_form,
			}
	return defaults


def _format_dosage_value(dosage=None):
	if dosage in (None, "", 0, 0.0):
		return None
	text = str(dosage).strip()
	if isinstance(dosage, float) and text.endswith(".0"):
		text = text[:-2]
	if not text or text == "0":
		return None
	return text


def _format_medication_dose(dosage=None, dosage_form=None):
	dose = _format_dosage_value(dosage)
	if not dose:
		return None
	if dosage_form:
		return f"{dose} {str(dosage_form).strip()}".strip()
	return dose


def _plan_item_dose_fields(med):
	return {
		"dose": _format_dosage_value(_row_field(med, "dosage")),
		"dose_term": (_row_field(med, "dosage_form") or "").strip() or None,
	}


def _first_medication_give_out_fields(doc):
	"""Medication + dose from the first plan item on a Long Acting Medicine doc."""
	for med in doc.get("medications") or []:
		medication = _medication_display_label(
			_row_field(med, "drug_name"),
			_row_field(med, "old_medication_name"),
		)
		if not medication:
			continue
		dose_fields = _plan_item_dose_fields(med)
		return {
			"medication": medication,
			"dose": dose_fields["dose"],
			"dose_term": dose_fields["dose_term"],
			"written_frequency": doc.get("written_frequency") or _row_field(med, "patient_frequency"),
		}

	medication = _first_medication_labels_for_parents([doc.name]).get(doc.name)
	if not medication:
		return {}

	return {
		"medication": medication,
		"dose": None,
		"dose_term": None,
		"written_frequency": doc.get("written_frequency"),
	}


def enrich_long_acting_medicine_row(doc):
	"""Attach give-out summary fields for portal list/detail views."""
	data = doc.as_dict() if isinstance(doc, Document) else dict(doc)
	name = data.get("name")
	if name and not data.get("give_outs"):
		data["give_outs"] = frappe.get_all(
			"Long Acting Medicine Give Out",
			filters={"parent": name},
			fields=LONG_ACTING_GIVE_OUT_FIELDS,
			order_by="date desc, time desc, creation desc",
		)

	today = getdate()
	next_run = _safe_getdate(data.get("next_run_date"))
	give_outs = data.get("give_outs") or []
	last_row = give_outs[0] if give_outs else None

	data["last_give_out_date"] = _row_field(last_row, "date")
	data["last_give_out_time"] = _row_field(last_row, "time")
	data["last_give_out_by"] = _row_field(last_row, "user")
	data["is_given_out_for_current_run"] = bool(
		next_run
		and any(
			_safe_getdate(_row_field(row, "scheduled_run_date")) == next_run for row in give_outs
		)
	)
	data["can_give_out"] = bool(
		user_can_give_out_long_acting_medicine()
		and next_run
		and next_run <= today
		and not data["is_given_out_for_current_run"]
		and data.get("status") in (None, "", "Active", "Draft")
	)
	data["can_stop"] = bool(
		user_can_give_out_long_acting_medicine()
		and data.get("status") in (None, "", "Active", "Draft", "Paused")
	)

	medication_label = None
	for med in data.get("medications") or []:
		medication_label = _medication_display_label(
			_row_field(med, "drug_name"),
			_row_field(med, "old_medication_name"),
		)
		if medication_label:
			break
	if not medication_label and name:
		medication_label = _first_medication_labels_for_parents([name]).get(name)
	data["medication_label"] = medication_label

	default_dosage = None
	default_dosage_form = None
	for med in data.get("medications") or []:
		dose_fields = _plan_item_dose_fields(med)
		if dose_fields["dose"] or dose_fields["dose_term"]:
			default_dosage = dose_fields["dose"]
			default_dosage_form = dose_fields["dose_term"]
			break
	data["default_dosage"] = default_dosage
	data["default_dosage_form"] = default_dosage_form

	return data


def enrich_long_acting_medicine_list_rows(rows):
	if not rows:
		return rows

	names = [row["name"] for row in rows if row.get("name")]
	give_out_rows = []
	if names:
		give_out_rows = frappe.get_all(
			"Long Acting Medicine Give Out",
			filters={"parent": ["in", names]},
			fields=["parent", "date", "time", "user", "scheduled_run_date", "creation"],
			order_by="date desc, time desc, creation desc",
		)

	by_parent = {}
	for row in give_out_rows:
		by_parent.setdefault(row.parent, []).append(row)

	medication_labels = _first_medication_labels_for_parents(names)
	medication_defaults = _first_medication_doses_for_parents(names)

	today = getdate()
	can_give = user_can_give_out_long_acting_medicine()
	enriched = []
	for row in rows:
		item = dict(row)
		parent_give_outs = by_parent.get(item["name"], [])
		last_row = parent_give_outs[0] if parent_give_outs else None
		next_run = _safe_getdate(item.get("next_run_date"))
		is_given = bool(
			next_run
			and any(_safe_getdate(go.scheduled_run_date) == next_run for go in parent_give_outs)
		)
		item["last_give_out_date"] = last_row.date if last_row else None
		item["last_give_out_time"] = last_row.time if last_row else None
		item["last_give_out_by"] = last_row.user if last_row else None
		item["is_given_out_for_current_run"] = is_given
		item["can_give_out"] = bool(
			can_give
			and next_run
			and next_run <= today
			and not is_given
			and item.get("status") in (None, "", "Active", "Draft")
		)
		item["can_stop"] = bool(
			can_give
			and item.get("status") in (None, "", "Active", "Draft", "Paused")
		)
		item["medication_label"] = medication_labels.get(item["name"])
		plan_defaults = medication_defaults.get(item["name"]) or {}
		item["default_dosage"] = plan_defaults.get("default_dosage")
		item["default_dosage_form"] = plan_defaults.get("default_dosage_form")
		enriched.append(item)
	return enriched


class LongActingMedicine(Document):
	pass


@frappe.whitelist()
def record_long_acting_medicine_give_out(name, notes=None, dose=None, dose_term=None):
	"""Record a give-out for the current scheduled run and advance next_run_date."""
	if not name:
		frappe.throw(_("Long Acting Medicine is required"))
	if not user_can_give_out_long_acting_medicine():
		frappe.throw(_("Only nurses and doctors can record give-outs."), frappe.PermissionError)

	doc = frappe.get_doc("Long Acting Medicine", name)
	if doc.docstatus == 2:
		frappe.throw(_("Cannot give out a cancelled Long Acting Medicine"))

	if not doc.next_run_date:
		frappe.throw(_("Next Run Date is not set on this long acting medicine"))

	scheduled_run_date = getdate(doc.next_run_date)
	today = getdate()
	if scheduled_run_date > today:
		frappe.throw(_("This dose is not due yet"))

	if _has_give_out_for_scheduled_date(doc, scheduled_run_date):
		frappe.throw(_("This scheduled run has already been given out"))

	med_fields = _first_medication_give_out_fields(doc)
	if dose is not None:
		med_fields["dose"] = (dose or "").strip() or None
	if dose_term is not None:
		med_fields["dose_term"] = (dose_term or "").strip() or None
	give_out_row = {
		"date": today,
		"time": nowtime(),
		"scheduled_run_date": scheduled_run_date,
		"user": frappe.session.user,
		"notes": (notes or "").strip() or None,
	}
	for key, value in med_fields.items():
		if value:
			give_out_row[key] = value

	doc.append("give_outs", give_out_row)

	interval_days = _long_acting_frequency_interval_days(doc.frequency)
	doc.next_run_date = add_days(scheduled_run_date, interval_days)
	if doc.status in (None, "", "Draft"):
		doc.status = "Active"

	doc.save(ignore_permissions=True)
	frappe.db.commit()

	return enrich_long_acting_medicine_row(doc)


@frappe.whitelist()
def stop_long_acting_medicine(name, reason=None):
	"""Stop an active long acting medicine subscription (no further doses scheduled)."""
	if not name:
		frappe.throw(_("Long Acting Medicine is required"))
	if not user_can_give_out_long_acting_medicine():
		frappe.throw(_("Only nurses and doctors can stop long acting medicine."), frappe.PermissionError)

	doc = frappe.get_doc("Long Acting Medicine", name)
	if doc.docstatus == 2:
		frappe.throw(_("Cannot stop a cancelled Long Acting Medicine"))

	if doc.status in ("Completed",):
		frappe.throw(_("This long acting medicine is already stopped"))

	today = getdate()
	doc.status = "Completed"
	doc.end_date = today
	stop_note = (reason or "").strip()
	if stop_note:
		existing = (doc.doctors_remark or "").strip()
		stop_line = _("Stopped on {0}: {1}").format(today, stop_note)
		doc.doctors_remark = f"{existing}\n{stop_line}".strip() if existing else stop_line

	doc.save(ignore_permissions=True)
	frappe.db.commit()

	return enrich_long_acting_medicine_row(doc)


@frappe.whitelist()
def get_long_acting_medicine_give_outs(name):
	"""Return give-out rows for one Long Acting Medicine."""
	if not name:
		frappe.throw(_("Long Acting Medicine is required"))
	return frappe.get_all(
		"Long Acting Medicine Give Out",
		filters={"parent": name},
		fields=LONG_ACTING_GIVE_OUT_FIELDS,
		order_by="date desc, time desc, creation desc",
	)
