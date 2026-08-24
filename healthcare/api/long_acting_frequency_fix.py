"""Fix Long Acting Medicine records that were saved as Weekly instead of the PMO frequency."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import add_days, cint, getdate

from healthcare.api.data_migration_jobs import (
	_acquire_lock,
	_job_progress_key,
	_release_lock,
	_require_admin,
	_set_progress,
)
from healthcare.api.op_injection_prescription_import import _map_long_acting_frequency
from healthcare.api.patient_medication_order import _long_acting_frequency_interval_days

JOB = "long_acting_frequency_fix"
BATCH_SIZE = 100
QUEUE_KEY = f"healthcare:data_migration:{JOB}:queue"


def _date_range(from_date, to_date):
	from_date = getdate(from_date)
	to_date = getdate(to_date)
	if not from_date or not to_date:
		frappe.throw(_("From Date and To Date are required"))
	if from_date > to_date:
		frappe.throw(_("From Date must be on or before To Date"))
	return from_date, to_date


def _weekly_lams_in_range(from_date, to_date, *, limit=None, offset=0):
	params = {"from_date": from_date, "to_date": to_date}
	limit_sql = ""
	if limit:
		params["limit"] = cint(limit)
		params["offset"] = cint(offset)
		limit_sql = " LIMIT %(limit)s OFFSET %(offset)s"
	return frappe.db.sql(
		f"""
		SELECT
			lam.name,
			lam.patient,
			lam.patient_name,
			lam.frequency,
			lam.start_date,
			lam.next_run_date,
			DATE(IFNULL(lam.start_date, lam.creation)) AS as_of_date
		FROM `tabLong Acting Medicine` lam
		WHERE lam.docstatus < 2
			AND LOWER(TRIM(IFNULL(lam.frequency, 'Weekly'))) = 'weekly'
			AND DATE(IFNULL(lam.start_date, lam.creation)) BETWEEN %(from_date)s AND %(to_date)s
		ORDER BY DATE(IFNULL(lam.start_date, lam.creation)) ASC, lam.name ASC
		{limit_sql}
		""",
		params,
		as_dict=True,
	)


def _weekly_lam_count(from_date, to_date) -> int:
	return cint(
		frappe.db.sql(
			"""
			SELECT COUNT(*) FROM `tabLong Acting Medicine` lam
			WHERE lam.docstatus < 2
				AND LOWER(TRIM(IFNULL(lam.frequency, 'Weekly'))) = 'weekly'
				AND DATE(IFNULL(lam.start_date, lam.creation)) BETWEEN %s AND %s
			""",
			(from_date, to_date),
		)[0][0]
	)


def _entry_fields():
	fields = ["name", "parent", "drug", "patient_frequency", "written_frequency", "date"]
	if frappe.db.has_column("Inpatient Medication Order Entry", "long_acting_frequency"):
		fields.append("long_acting_frequency")
	return fields


def _canonical_lam_frequency(raw):
	"""Map PMO text (Q2W, every 2 weeks, Monthly, …) to a Long Acting Frequency name.

	Returns None when the text is empty or still Weekly.
	"""
	raw = (raw or "").strip()
	if not raw:
		return None
	mapped = _map_long_acting_frequency(raw)
	if mapped:
		if mapped.lower() == "weekly":
			return None
		return mapped
	if frappe.db.exists("Long Acting Frequency", raw) and raw.lower() != "weekly":
		return raw
	return None


def _frequency_from_entry_row(row):
	if not row:
		return None
	for key in ("long_acting_frequency", "patient_frequency", "written_frequency"):
		canon = _canonical_lam_frequency(row.get(key))
		if canon:
			return canon
	return None


def _frequency_from_pmo_entry(entry_name):
	if not entry_name or not frappe.db.exists("Inpatient Medication Order Entry", entry_name):
		return None, None
	row = frappe.db.get_value(
		"Inpatient Medication Order Entry",
		entry_name,
		_entry_fields(),
		as_dict=True,
	)
	if not row:
		return None, None
	return _frequency_from_entry_row(row), row


def _pmo_lines_for_patient_drug(patient, drug, anchor=None, limit=20):
	"""PMO lines for this patient (optionally same drug). Does not require the long-acting checkbox."""
	if not patient:
		return []
	has_laf = frappe.db.has_column("Inpatient Medication Order Entry", "long_acting_frequency")
	laf_select = "e.long_acting_frequency," if has_laf else "NULL AS long_acting_frequency,"
	conditions = ["p.patient = %(patient)s", "p.docstatus < 2"]
	params = {"patient": patient, "limit": cint(limit)}
	if drug:
		conditions.append("e.drug = %(drug)s")
		params["drug"] = drug
	order = "e.creation DESC"
	if anchor:
		params["anchor"] = getdate(anchor)
		order = (
			"ABS(DATEDIFF(DATE(IFNULL(e.date, p.start_date)), %(anchor)s)) ASC, e.creation DESC"
		)
	return frappe.db.sql(
		f"""
		SELECT e.name, e.parent, e.drug, e.patient_frequency, e.written_frequency, e.date,
			{laf_select}
			p.start_date, p.patient
		FROM `tabInpatient Medication Order Entry` e
		INNER JOIN `tabPatient Medication Order` p ON p.name = e.parent
		WHERE {" AND ".join(conditions)}
		ORDER BY {order}
		LIMIT %(limit)s
		""",
		params,
		as_dict=True,
	)


def _fallback_pmo_entry(lam_row, item=None):
	"""Match PMO by patient + drug (then patient only), closest date to the LAM start date."""
	patient = lam_row.get("patient")
	drug = (item or {}).get("drug")
	anchor = lam_row.get("start_date") or lam_row.get("as_of_date")
	rows = _pmo_lines_for_patient_drug(patient, drug, anchor=anchor)
	if not rows and drug:
		rows = _pmo_lines_for_patient_drug(patient, None, anchor=anchor, limit=30)
	for row in rows:
		resolved = _frequency_from_entry_row(row)
		if resolved:
			return resolved, row
	return None


def _resolve_correct_frequency(lam_row):
	"""How a Long Acting record is tied to a Patient Medication Order:

	1. LAM medication row.medication_order_entry → PMO child row (created with the prescription).
	2. Frequency already stored on that LAM medication row (not Weekly).
	3. Same patient + same drug on a PMO line (closest start/line date).
	4. Same patient on a PMO line with a non-Weekly frequency (closest date).
	"""
	items = frappe.get_all(
		"Subscription Medication Plan Item",
		filters={"parent": lam_row.get("name")},
		fields=["medication_order_entry", "drug", "patient_frequency", "name"],
		order_by="idx asc",
	)
	for item in items:
		resolved, entry = _frequency_from_pmo_entry(item.get("medication_order_entry"))
		if resolved:
			return resolved, item, entry, "pmo_line"
		child_freq = _canonical_lam_frequency(item.get("patient_frequency"))
		if child_freq:
			return child_freq, item, None, "lam_line"
		fallback = _fallback_pmo_entry(lam_row, item)
		if fallback:
			return fallback[0], item, fallback[1], "patient_drug"
	fallback = _fallback_pmo_entry(lam_row, items[0] if items else None)
	if fallback:
		return fallback[0], (items[0] if items else None), fallback[1], "patient"
	return None, None, None, None


def _next_run_after_fix(lam_name, start_date, frequency):
	interval = _long_acting_frequency_interval_days(frequency)
	filters = {"parent": lam_name}
	if frappe.db.has_column("Long Acting Medicine Give Out", "is_cancelled"):
		filters["is_cancelled"] = ["!=", 1]
	give_outs = frappe.get_all(
		"Long Acting Medicine Give Out",
		filters=filters,
		fields=["scheduled_run_date", "date"],
		order_by="creation desc",
		limit=1,
	)
	anchor = None
	if give_outs:
		anchor = give_outs[0].get("scheduled_run_date") or give_outs[0].get("date")
	anchor = getdate(anchor or start_date)
	if not anchor:
		return None
	return add_days(anchor, interval)


def _apply_frequency_fix(lam_row) -> dict | None:
	from healthcare.api.common import _ensure_default_long_acting_frequencies

	_ensure_default_long_acting_frequencies()
	resolved, item, entry, match_via = _resolve_correct_frequency(lam_row)
	if not resolved:
		return None
	name = lam_row.get("name")
	# Always persist a known Long Acting Frequency name (Biweekly, Monthly, …).
	if not frappe.db.exists("Long Acting Frequency", resolved):
		from healthcare.api.common import ensure_prescription_frequency_for_long_acting

		doc = frappe.new_doc("Long Acting Frequency")
		doc.frequency = resolved
		doc.interval_days = _long_acting_frequency_interval_days(resolved)
		doc.insert(ignore_permissions=True)
		ensure_prescription_frequency_for_long_acting(resolved)

	updates = {"frequency": resolved}
	if frappe.get_meta("Long Acting Medicine").has_field("written_frequency"):
		current_written = frappe.db.get_value("Long Acting Medicine", name, "written_frequency")
		if not (current_written or "").strip():
			updates["written_frequency"] = resolved
	next_run = _next_run_after_fix(name, lam_row.get("start_date"), resolved)
	if next_run:
		updates["next_run_date"] = next_run
	frappe.db.set_value("Long Acting Medicine", name, updates, update_modified=True)

	if item and item.get("name"):
		frappe.db.set_value(
			"Subscription Medication Plan Item",
			item["name"],
			{"patient_frequency": resolved},
			update_modified=False,
		)

	return {
		"name": name,
		"from_frequency": lam_row.get("frequency") or "Weekly",
		"to_frequency": resolved,
		"pmo": (entry or {}).get("parent"),
		"patient": lam_row.get("patient_name") or lam_row.get("patient"),
		"match_via": match_via,
	}


@frappe.whitelist()
def preview_long_acting_frequency_fix(from_date=None, to_date=None):
	_require_admin()
	from_date, to_date = _date_range(from_date, to_date)
	candidates = _weekly_lams_in_range(from_date, to_date)
	sample = []
	will_update = 0
	skipped_no_source = 0
	for row in candidates:
		resolved, _item, entry, match_via = _resolve_correct_frequency(row)
		if resolved:
			will_update += 1
			if len(sample) < 15:
				sample.append(
					{
						"name": row.name,
						"patient": row.patient_name or row.patient,
						"from_frequency": row.frequency or "Weekly",
						"to_frequency": resolved,
						"pmo": (entry or {}).get("parent") or "",
						"match_via": match_via,
						"as_of_date": str(row.as_of_date) if row.as_of_date else "",
					}
				)
		else:
			skipped_no_source += 1
	return {
		"from_date": str(from_date),
		"to_date": str(to_date),
		"weekly_in_range": len(candidates),
		"will_update": will_update,
		"skipped_no_source": skipped_no_source,
		"sample": sample,
	}


@frappe.whitelist()
def start_long_acting_frequency_fix(from_date=None, to_date=None):
	"""Apply the Weekly → PMO frequency fix immediately (small set; no background worker)."""
	_require_admin()
	from_date, to_date = _date_range(from_date, to_date)
	rows = _weekly_lams_in_range(from_date, to_date)
	updated_rows = []
	skipped = 0
	errors = 0
	error_names = []
	for row in rows:
		try:
			result = _apply_frequency_fix(row)
			if result:
				updated_rows.append(result)
			else:
				skipped += 1
		except Exception:
			errors += 1
			error_names.append(row.get("name"))
			frappe.log_error(
				title="Long acting frequency fix failed",
				message=frappe.get_traceback(),
				reference_doctype="Long Acting Medicine",
				reference_name=row.get("name"),
			)
	frappe.db.commit()
	return {
		"ok": True,
		"updated": len(updated_rows),
		"skipped": skipped,
		"errors": errors,
		"error_names": error_names,
		"updated_rows": updated_rows,
		"message": _(
			"Updated {0} Long Acting Medicine record(s) from Patient Medication Order. Skipped {1}. Errors {2}."
		).format(len(updated_rows), skipped, errors),
	}


def process_long_acting_frequency_fix_batch(offset: int = 0) -> None:
	try:
		queue = frappe.cache().get_value(QUEUE_KEY) or []
		batch = queue[offset : offset + BATCH_SIZE]

		prev = frappe.cache().get_value(_job_progress_key(JOB)) or {}
		updated = cint(prev.get("updated"))
		skipped = cint(prev.get("skipped"))
		errors = cint(prev.get("errors"))

		for name in batch:
			try:
				rows = frappe.db.sql(
					"""
					SELECT
						lam.name, lam.patient, lam.patient_name, lam.frequency,
						lam.start_date, lam.next_run_date,
						DATE(IFNULL(lam.start_date, lam.creation)) AS as_of_date
					FROM `tabLong Acting Medicine` lam
					WHERE lam.name = %s
					""",
					name,
					as_dict=True,
				)
				if not rows:
					skipped += 1
					continue
				result = _apply_frequency_fix(rows[0])
				if result:
					updated += 1
				else:
					skipped += 1
			except Exception:
				errors += 1
				frappe.log_error(
					title="Long acting frequency fix failed",
					message=frappe.get_traceback(),
					reference_doctype="Long Acting Medicine",
					reference_name=name,
				)

		frappe.db.commit()
		processed = offset + len(batch)
		_set_progress(
			JOB,
			processed,
			updated=updated,
			skipped=skipped,
			errors=errors,
			total=len(queue),
		)

		if processed < len(queue):
			frappe.enqueue(
				"healthcare.api.long_acting_frequency_fix.process_long_acting_frequency_fix_batch",
				offset=processed,
				queue="long",
				timeout=3600,
				job_name=f"healthcare_long_acting_frequency_fix_{processed}",
			)
		else:
			_set_progress(
				JOB,
				processed,
				done=True,
				updated=updated,
				skipped=skipped,
				errors=errors,
				total=len(queue),
			)
			frappe.cache().delete_value(QUEUE_KEY)
			_release_lock(JOB)
	except Exception:
		frappe.db.rollback()
		_set_progress(JOB, cint(offset), done=True, error=frappe.get_traceback())
		frappe.cache().delete_value(QUEUE_KEY)
		_release_lock(JOB)
		raise
