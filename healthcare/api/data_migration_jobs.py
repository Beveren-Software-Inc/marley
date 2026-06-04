"""One-off / bulk data maintenance jobs — run from Healthcare Settings in batches."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint, now_datetime, nowdate, get_time, getdate
from healthcare.api.utils.api_utility import get_next_transaction_number

# ── Batch sizes (tune for ~1h runs on large datasets) ─────────────────────────
PATIENT_BATCH_SIZE = 2000
ADMISSION_BATCH_SIZE = 2000
VISIT_BATCH_SIZE = 25
APPOINTMENT_BATCH_SIZE = 2000
MEDICATION_ORDER_BATCH_SIZE = 25
DISCHARGE_BATCH_SIZE = 10
IP_ADMISSION_MEDICINE_BATCH_SIZE = 50
IP_ADMISSION_MEDICINE_SHEET_BATCH_SIZE = 200
IP_PATIENT_ASSESSMENT_BATCH_SIZE = 200
CLINICAL_NOTE_TYPE_BATCH_SIZE = 500
DISCHARGE_CHECKLIST_IMPORT_BATCH_SIZE = 25

JOB_LOCK_SECONDS = 7200  # 2 hours

# Legacy DIAGNOSES_FLAG → Clinical Note Type (Clinical Note.diagnosis_flag is Data)
_DIAGNOSIS_FLAG_TO_NOTE_TYPE = {
	"1": "Doctor Progress Note",
	"DOC": "Doctor Progress Note",
	"2": "Psychologist Note",
	"PSY": "Psychologist Note",
	"3": "Nutritionist Note",
	"NUT": "Nutritionist Note",
	"4": "General Note",
	"OCC": "General Note",
}
ALL_CUSTOMER_GROUP_NAMES = ("All Customer Groups", "All Customer Group")


def _require_admin():
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def _job_lock_key(job: str) -> str:
	return f"healthcare:data_migration:{job}:lock"


def _job_progress_key(job: str) -> str:
	return f"healthcare:data_migration:{job}:progress"


def _acquire_lock(job: str) -> None:
	if frappe.cache().get_value(_job_lock_key(job)):
		frappe.throw(
			_("Job “{0}” is already running. Wait for it to finish before starting again.").format(job)
		)
	frappe.cache().set_value(_job_lock_key(job), 1, expires_in_sec=JOB_LOCK_SECONDS)


def _release_lock(job: str) -> None:
	frappe.cache().delete_value(_job_lock_key(job))


def _set_progress(
	job: str,
	processed: int,
	*,
	done: bool = False,
	error: str | None = None,
	**extra,
) -> None:
	payload = {
		"processed": processed,
		"done": done,
		"error": error,
		"updated_at": str(now_datetime()),
	}
	if extra:
		payload.update(extra)
	frappe.cache().set_value(
		_job_progress_key(job),
		payload,
		expires_in_sec=JOB_LOCK_SECONDS,
	)


def _ensure_patient_category(name: str) -> None:
	if frappe.db.exists("Patient Category", name):
		return
	doc = frappe.new_doc("Patient Category")
	doc.patient_category = name
	doc.insert(ignore_permissions=True)


def _ensure_customer_group_patient() -> None:
	if frappe.db.exists("Customer Group", "Patient"):
		return
	parent = frappe.db.get_single_value("Selling Settings", "customer_group") or "All Customer Groups"
	if not frappe.db.exists("Customer Group", parent):
		parent = "All Customer Groups"
	frappe.get_doc(
		{
			"doctype": "Customer Group",
			"customer_group_name": "Patient",
			"is_group": 0,
			"parent_customer_group": parent,
		}
	).insert(ignore_permissions=True)


def _patient_row_updates(row: dict) -> dict:
	updates = {}
	category = (row.get("category") or "").strip()
	if category == "American Navy":
		updates["category"] = "Military"
	elif category == "Royal":
		updates["category"] = "VIP"
	elif not category:
		updates["category"] = "Regular"

	cg = (row.get("customer_group") or "").strip()
	if cg in ALL_CUSTOMER_GROUP_NAMES:
		updates["customer_group"] = "Patient"

	return updates


# ── Starters (whitelisted from Healthcare Settings) ───────────────────────────


@frappe.whitelist()
def start_patient_migration() -> dict:
	_require_admin()
	_acquire_lock("patients")
	_set_progress("patients", 0)
	frappe.enqueue(
		"healthcare.api.data_migration_jobs.process_patient_migration_batch",
		offset=0,
		queue="long",
		timeout=3600,
		job_name="healthcare_migrate_patients",
	)
	return {"ok": True, "message": _("Patient migration started in the background.")}


@frappe.whitelist()
def start_admission_migration() -> dict:
	_require_admin()
	_acquire_lock("admissions")
	_set_progress("admissions", 0)
	frappe.enqueue(
		"healthcare.api.data_migration_jobs.process_admission_migration_batch",
		offset=0,
		queue="long",
		timeout=3600,
		job_name="healthcare_migrate_admissions",
	)
	return {"ok": True, "message": _("Admission migration started in the background.")}


@frappe.whitelist()
def start_patient_visit_migration() -> dict:
	_require_admin()
	_acquire_lock("patient_visits")
	_clear_failed_visits()
	_set_progress("patient_visits", 0)
	frappe.enqueue(
		"healthcare.api.data_migration_jobs.process_patient_visit_migration_batch",
		offset=0,
		queue="long",
		timeout=3600,
		job_name="healthcare_migrate_patient_visits",
	)
	return {"ok": True, "message": _("Submit & complete Patient Visits job started in the background.")}


@frappe.whitelist()
def start_appointment_close_migration() -> dict:
	_require_admin()
	_acquire_lock("appointments")
	_set_progress("appointments", 0)
	frappe.enqueue(
		"healthcare.api.data_migration_jobs.process_appointment_close_batch",
		offset=0,
		queue="long",
		timeout=3600,
		job_name="healthcare_close_appointments",
	)
	return {"ok": True, "message": _("Close appointments job started in the background.")}


@frappe.whitelist()
def start_medication_order_complete_migration() -> dict:
	_require_admin()
	_acquire_lock("medication_orders")
	_clear_failed_medication_orders()
	_set_progress("medication_orders", 0)
	frappe.enqueue(
		"healthcare.api.data_migration_jobs.process_medication_order_complete_batch",
		offset=0,
		queue="long",
		timeout=3600,
		job_name="healthcare_complete_medication_orders",
	)
	return {
		"ok": True,
		"message": _("Submit & complete Patient Medication Orders job started in the background."),
	}


@frappe.whitelist()
def start_discharge_submit_migration() -> dict:
	_require_admin()
	_acquire_lock("discharges")
	_clear_failed_discharges()
	_set_progress("discharges", 0)
	frappe.enqueue(
		"healthcare.api.data_migration_jobs.process_discharge_submit_batch",
		offset=0,
		queue="long",
		timeout=3600,
		job_name="healthcare_submit_discharges",
	)
	return {
		"ok": True,
		"message": _("Submit all draft Discharge documents job started in the background."),
	}


@frappe.whitelist()
def start_ip_admission_medicine_link_migration() -> dict:
	"""Create/update Patient Medication Orders from imported IP Admission Medicine rows."""
	_require_admin()
	_acquire_lock("ip_admission_medicine_link")
	_set_progress("ip_admission_medicine_link", 0)
	frappe.enqueue(
		"healthcare.api.data_migration_jobs.process_ip_admission_medicine_link_batch",
		offset=0,
		queue="long",
		timeout=3600,
		job_name="healthcare_ip_admission_medicine_link",
	)
	return {
		"ok": True,
		"message": _("IP Admission Medicine linking job started in the background."),
	}


@frappe.whitelist()
def start_ip_admission_medicine_sheet_map_migration() -> dict:
	"""Map IP Admission Medicine Sheet rows into Admission Detail child tables."""
	_require_admin()
	_acquire_lock("ip_admission_medicine_sheet_map")
	_set_progress("ip_admission_medicine_sheet_map", 0)
	frappe.enqueue(
		"healthcare.api.data_migration_jobs.process_ip_admission_medicine_sheet_map_batch",
		offset=0,
		queue="long",
		timeout=3600,
		job_name="healthcare_ip_admission_medicine_sheet_map",
	)
	return {
		"ok": True,
		"message": _("IP Admission Medicine Sheet mapping job started in the background."),
	}


@frappe.whitelist()
def start_ip_patient_assessment_map_migration() -> dict:
	"""Map imported IP Patient Assessment rows to Patient Assessment."""
	_require_admin()
	_acquire_lock("ip_patient_assessment_map")
	_set_progress("ip_patient_assessment_map", 0)
	frappe.enqueue(
		"healthcare.api.data_migration_jobs.process_ip_patient_assessment_map_batch",
		offset=0,
		queue="long",
		timeout=3600,
		job_name="healthcare_ip_patient_assessment_map",
	)
	return {
		"ok": True,
		"message": _("IP Patient Assessment mapping job started in the background."),
	}


@frappe.whitelist()
def start_clinical_note_type_from_flag_migration() -> dict:
	"""Set Clinical Note Type from legacy diagnosis_flag (and IP nurse notes when applicable)."""
	_require_admin()
	_acquire_lock("clinical_note_type_from_flag")
	_set_progress("clinical_note_type_from_flag", 0)
	frappe.enqueue(
		"healthcare.api.data_migration_jobs.process_clinical_note_type_from_flag_batch",
		offset=0,
		queue="long",
		timeout=3600,
		job_name="healthcare_clinical_note_type_from_flag",
	)
	return {
		"ok": True,
		"message": _("Clinical Note type mapping job started in the background."),
	}


@frappe.whitelist()
def get_migration_job_status(job: str) -> dict:
	_require_admin()
	progress = frappe.cache().get_value(_job_progress_key(job)) or {}
	running = bool(frappe.cache().get_value(_job_lock_key(job)))
	return {"running": running, **progress}


def _patient_history_import_admissions_cache_key() -> str:
	return "healthcare:data_migration:patient_history_import:admissions"


def _patient_history_import_grouped_cache_key() -> str:
	return "healthcare:data_migration:patient_history_import:grouped"


@frappe.whitelist()
def start_patient_history_import_migration() -> dict:
	_require_admin()
	from healthcare.api.patient_history_import import (
		_default_template_name,
		_fetch_import_rows,
		_group_rows_by_import_key,
	)

	_acquire_lock("patient_history_import")
	rows = _fetch_import_rows()
	by_admission, unresolved = _group_rows_by_import_key(rows)
	admission_keys = sorted(by_admission.keys())
	frappe.cache().set_value(
		_patient_history_import_admissions_cache_key(),
		admission_keys,
		expires_in_sec=JOB_LOCK_SECONDS,
	)
	frappe.cache().set_value(
		_patient_history_import_grouped_cache_key(),
		by_admission,
		expires_in_sec=JOB_LOCK_SECONDS,
	)
	_set_progress(
		"patient_history_import",
		0,
		total_admissions=len(admission_keys),
		unresolved_rows=len(unresolved),
		template=_default_template_name(),
	)
	frappe.enqueue(
		"healthcare.api.data_migration_jobs.process_patient_history_import_batch",
		offset=0,
		queue="long",
		timeout=3600,
		job_name="healthcare_patient_history_import",
	)
	return {
		"ok": True,
		"message": _(
			"Patient History import started in the background ({0} admissions, {1} unresolved rows)."
		).format(len(admission_keys), len(unresolved)),
	}


# ── Batch workers ─────────────────────────────────────────────────────────────


def process_patient_migration_batch(offset: int = 0) -> None:
	try:
		for name in ("Military", "VIP", "Regular"):
			_ensure_patient_category(name)
		_ensure_customer_group_patient()

		rows = frappe.db.sql(
			"""
			SELECT name, category, customer_group, customer
			FROM `tabPatient`
			ORDER BY name
			LIMIT %s OFFSET %s
			""",
			(PATIENT_BATCH_SIZE, offset),
			as_dict=True,
		)

		updated = 0
		for row in rows:
			updates = _patient_row_updates(row)
			if not updates:
				continue
			frappe.db.set_value("Patient", row.name, updates, update_modified=False)
			if updates.get("customer_group") == "Patient" and row.get("customer"):
				frappe.db.set_value(
					"Customer",
					row.customer,
					"customer_group",
					"Patient",
					update_modified=False,
				)
			updated += 1

		frappe.db.commit()
		processed = offset + len(rows)
		_set_progress("patients", processed)

		if len(rows) >= PATIENT_BATCH_SIZE:
			frappe.enqueue(
				"healthcare.api.data_migration_jobs.process_patient_migration_batch",
				offset=processed,
				queue="long",
				timeout=3600,
				job_name=f"healthcare_migrate_patients_{processed}",
			)
		else:
			_set_progress("patients", processed, done=True)
			_release_lock("patients")
			frappe.log_error(
				title="Healthcare patient migration complete",
				message=f"Processed {processed} patient row(s); updated {updated} in final batch.",
			)
	except Exception:
		frappe.db.rollback()
		_set_progress("patients", cint(offset), done=True, error=frappe.get_traceback())
		_release_lock("patients")
		raise


def process_admission_migration_batch(offset: int = 0) -> None:
	try:
		names = frappe.get_all(
			"Inpatient Admission",
			filters={"status": "Admission Scheduled"},
			pluck="name",
			order_by="name asc",
			limit_page_length=ADMISSION_BATCH_SIZE,
		)

		for name in names:
			frappe.db.set_value(
				"Inpatient Admission",
				name,
				"status",
				"Discharged",
				update_modified=False,
			)

		frappe.db.commit()
		prev = frappe.cache().get_value(_job_progress_key("admissions")) or {}
		processed = cint(prev.get("processed", 0)) + len(names)
		_set_progress("admissions", processed)

		if len(names) >= ADMISSION_BATCH_SIZE:
			frappe.enqueue(
				"healthcare.api.data_migration_jobs.process_admission_migration_batch",
				offset=0,
				queue="long",
				timeout=3600,
				job_name=f"healthcare_migrate_admissions_{processed}",
			)
		else:
			_set_progress("admissions", processed, done=True)
			_release_lock("admissions")
			frappe.log_error(
				title="Healthcare admission migration complete",
				message=f"Set {processed} admission(s) from Admission Scheduled to Discharged.",
			)
	except Exception:
		frappe.db.rollback()
		_set_progress("admissions", cint(offset), done=True, error=frappe.get_traceback())
		_release_lock("admissions")
		raise


def _failed_visits_key() -> str:
	return "healthcare:data_migration:patient_visits:failed"


def _mark_visit_failed(name: str) -> None:
	failed = set(frappe.cache().get_value(_failed_visits_key()) or [])
	failed.add(name)
	frappe.cache().set_value(_failed_visits_key(), list(failed), expires_in_sec=JOB_LOCK_SECONDS)


def _clear_failed_visits() -> None:
	frappe.cache().delete_value(_failed_visits_key())


def process_patient_visit_migration_batch(offset: int = 0) -> None:
	try:
		failed_skip = frappe.cache().get_value(_failed_visits_key()) or []
		filters: dict = {
			"docstatus": ["!=", 2],
			"status": ["not in", ["Completed", "Cancelled"]],
		}
		if failed_skip:
			filters["name"] = ["not in", failed_skip]

		visits = frappe.get_all(
			"Patient Visit",
			filters=filters,
			pluck="name",
			order_by="name asc",
			limit_page_length=VISIT_BATCH_SIZE,
		)

		submitted = 0
		completed = 0
		failed = 0
		for name in visits:
			try:
				doc = frappe.get_doc("Patient Visit", name)
				if doc.docstatus == 2:
					continue
				if doc.docstatus == 0:
					doc.flags.ignore_mandatory = True
					doc.submit()
					submitted += 1
					doc.reload()

				doc.db_set("status", "Completed", update_modified=False)
				completed += 1
			except Exception:
				failed += 1
				_mark_visit_failed(name)
				frappe.log_error(
					title=f"Patient Visit submit/complete failed: {name}",
					message=frappe.get_traceback(),
				)

		frappe.db.commit()
		prev = frappe.cache().get_value(_job_progress_key("patient_visits")) or {}
		processed = cint(prev.get("processed", 0)) + len(visits)
		_set_progress("patient_visits", processed)

		if len(visits) >= VISIT_BATCH_SIZE:
			frappe.enqueue(
				"healthcare.api.data_migration_jobs.process_patient_visit_migration_batch",
				offset=0,
				queue="long",
				timeout=3600,
				job_name=f"healthcare_migrate_patient_visits_{processed}",
			)
		else:
			_set_progress("patient_visits", processed, done=True)
			_release_lock("patient_visits")
			_clear_failed_visits()
			frappe.log_error(
				title="Healthcare Patient Visit migration complete",
				message=(
					f"Processed {processed} visit(s). "
					f"Submitted {submitted} in final batch; marked {completed} Completed; "
					f"{failed} failed (see Error Log)."
				),
			)
	except Exception:
		frappe.db.rollback()
		_set_progress("patient_visits", cint(offset), done=True, error=frappe.get_traceback())
		_release_lock("patient_visits")
		_clear_failed_visits()
		raise


def process_appointment_close_batch(offset: int = 0) -> None:
	try:
		appointments = frappe.get_all(
			"Patient Appointment",
			filters={"status": ["not in", ["Closed", "Cancelled"]]},
			pluck="name",
			order_by="name asc",
			limit_page_length=APPOINTMENT_BATCH_SIZE,
		)

		for name in appointments:
			frappe.db.set_value(
				"Patient Appointment",
				name,
				"status",
				"Closed",
				update_modified=False,
			)

		frappe.db.commit()
		prev = frappe.cache().get_value(_job_progress_key("appointments")) or {}
		processed = cint(prev.get("processed", 0)) + len(appointments)
		_set_progress("appointments", processed)

		if len(appointments) >= APPOINTMENT_BATCH_SIZE:
			frappe.enqueue(
				"healthcare.api.data_migration_jobs.process_appointment_close_batch",
				offset=0,
				queue="long",
				timeout=3600,
				job_name=f"healthcare_close_appointments_{processed}",
			)
		else:
			_set_progress("appointments", processed, done=True)
			_release_lock("appointments")
			frappe.log_error(
				title="Healthcare appointment close migration complete",
				message=f"Set {processed} appointment(s) to Closed.",
			)
	except Exception:
		frappe.db.rollback()
		_set_progress("appointments", cint(offset), done=True, error=frappe.get_traceback())
		_release_lock("appointments")
		raise


def _failed_medication_orders_key() -> str:
	return "healthcare:data_migration:medication_orders:failed"


def _mark_medication_order_failed(name: str) -> None:
	failed = set(frappe.cache().get_value(_failed_medication_orders_key()) or [])
	failed.add(name)
	frappe.cache().set_value(_failed_medication_orders_key(), list(failed), expires_in_sec=JOB_LOCK_SECONDS)


def _clear_failed_medication_orders() -> None:
	frappe.cache().delete_value(_failed_medication_orders_key())


def process_medication_order_complete_batch(offset: int = 0) -> None:
	try:
		failed_skip = frappe.cache().get_value(_failed_medication_orders_key()) or []
		filters: dict = {
			"docstatus": ["!=", 2],
			"status": ["not in", ["Completed", "Cancelled"]],
		}
		if failed_skip:
			filters["name"] = ["not in", failed_skip]

		names = frappe.get_all(
			"Patient Medication Order",
			filters=filters,
			pluck="name",
			order_by="name asc",
			limit_page_length=MEDICATION_ORDER_BATCH_SIZE,
		)

		submitted = 0
		completed = 0
		failed = 0
		for name in names:
			try:
				doc = frappe.get_doc("Patient Medication Order", name)
				if doc.docstatus == 2:
					continue
				if doc.docstatus == 0:
					doc.flags.ignore_mandatory = True
					doc.submit()
					submitted += 1
					doc.reload()

				total = doc.total_orders or len(doc.get("medication_orders") or []) or 0
				doc.db_set("completed_orders", total, update_modified=False)
				doc.completed_orders = total
				doc.set_status()
				completed += 1
			except Exception:
				failed += 1
				_mark_medication_order_failed(name)
				frappe.log_error(
					title=f"Patient Medication Order submit/complete failed: {name}",
					message=frappe.get_traceback(),
				)

		frappe.db.commit()
		prev = frappe.cache().get_value(_job_progress_key("medication_orders")) or {}
		processed = cint(prev.get("processed", 0)) + len(names)
		_set_progress("medication_orders", processed)

		if len(names) >= MEDICATION_ORDER_BATCH_SIZE:
			frappe.enqueue(
				"healthcare.api.data_migration_jobs.process_medication_order_complete_batch",
				offset=0,
				queue="long",
				timeout=3600,
				job_name=f"healthcare_complete_medication_orders_{processed}",
			)
		else:
			_set_progress("medication_orders", processed, done=True)
			_release_lock("medication_orders")
			_clear_failed_medication_orders()
			frappe.log_error(
				title="Healthcare Patient Medication Order migration complete",
				message=(
					f"Processed {processed} order(s). "
					f"Submitted {submitted} in final batch; marked {completed} Completed; "
					f"{failed} failed (see Error Log)."
				),
			)
	except Exception:
		frappe.db.rollback()
		_set_progress("medication_orders", cint(offset), done=True, error=frappe.get_traceback())
		_release_lock("medication_orders")
		_clear_failed_medication_orders()
		raise


def _failed_discharges_key() -> str:
	return "healthcare:data_migration:discharges:failed"


def _mark_discharge_failed(name: str) -> None:
	failed = set(frappe.cache().get_value(_failed_discharges_key()) or [])
	failed.add(name)
	frappe.cache().set_value(_failed_discharges_key(), list(failed), expires_in_sec=JOB_LOCK_SECONDS)


def _clear_failed_discharges() -> None:
	frappe.cache().delete_value(_failed_discharges_key())


def process_discharge_submit_batch(offset: int = 0) -> None:
	"""Submit draft Discharge documents (docstatus 0) in batches via RQ."""
	try:
		failed_skip = frappe.cache().get_value(_failed_discharges_key()) or []
		filters: dict = {"docstatus": 0}
		if failed_skip:
			filters["name"] = ["not in", failed_skip]

		names = frappe.get_all(
			"Discharge",
			filters=filters,
			pluck="name",
			order_by="name asc",
			limit_page_length=DISCHARGE_BATCH_SIZE,
		)

		submitted = 0
		failed = 0
		for name in names:
			try:
				doc = frappe.get_doc("Discharge", name)
				if doc.docstatus != 0:
					continue
				doc.flags.ignore_mandatory = True
				doc.submit()
				submitted += 1
			except Exception:
				failed += 1
				_mark_discharge_failed(name)
				frappe.log_error(
					title=f"Discharge submit failed: {name}",
					message=frappe.get_traceback(),
				)

		frappe.db.commit()
		prev = frappe.cache().get_value(_job_progress_key("discharges")) or {}
		processed = cint(prev.get("processed", 0)) + len(names)
		_set_progress("discharges", processed)

		if len(names) >= DISCHARGE_BATCH_SIZE:
			frappe.enqueue(
				"healthcare.api.data_migration_jobs.process_discharge_submit_batch",
				offset=0,
				queue="long",
				timeout=3600,
				job_name=f"healthcare_submit_discharges_{processed}",
			)
		else:
			_set_progress("discharges", processed, done=True)
			_release_lock("discharges")
			_clear_failed_discharges()
			frappe.log_error(
				title="Healthcare Discharge submit migration complete",
				message=(
					f"Processed {processed} discharge(s). "
					f"Submitted {submitted} in final batch; "
					f"{failed} failed (see Error Log)."
				),
			)
	except Exception:
		frappe.db.rollback()
		_set_progress("discharges", cint(offset), done=True, error=frappe.get_traceback())
		_release_lock("discharges")
		_clear_failed_discharges()
		raise


def process_patient_history_import_batch(offset: int = 0) -> None:
	from healthcare.api.patient_history_import import (
		_default_template_name,
		run_patient_history_import_batch,
	)

	job = "patient_history_import"
	try:
		admission_keys = frappe.cache().get_value(
			_patient_history_import_admissions_cache_key()
		)
		if admission_keys is None:
			_set_progress(job, cint(offset), done=True, error="missing admission list cache")
			_release_lock(job)
			return

		by_admission = frappe.cache().get_value(
			_patient_history_import_grouped_cache_key()
		)
		result = run_patient_history_import_batch(
			offset=offset,
			template_name=_default_template_name(),
			admission_keys=admission_keys,
			by_admission=by_admission,
		)
		processed = cint(result.get("processed") or 0)
		_set_progress(
			job,
			processed,
			total_admissions=result.get("total_admissions"),
			stats=result.get("stats"),
		)

		if not result.get("done"):
			frappe.enqueue(
				"healthcare.api.data_migration_jobs.process_patient_history_import_batch",
				offset=processed,
				queue="long",
				timeout=3600,
				job_name=f"healthcare_patient_history_import_{processed}",
			)
		else:
			_set_progress(job, processed, done=True, stats=result.get("stats"))
			_release_lock(job)
			frappe.cache().delete_value(_patient_history_import_admissions_cache_key())
			frappe.cache().delete_value(_patient_history_import_grouped_cache_key())
			frappe.log_error(
				title="Healthcare Patient History import complete",
				message=frappe.as_json(result.get("stats") or {}),
			)
	except Exception:
		frappe.db.rollback()
		_set_progress(job, cint(offset), done=True, error=frappe.get_traceback())
		_release_lock(job)
		frappe.cache().delete_value(_patient_history_import_admissions_cache_key())
		frappe.cache().delete_value(_patient_history_import_grouped_cache_key())
		raise


def _resolve_item_00_01_name(code_value) -> str | None:
	"""Resolve ITEM_00_01 link name from incoming medicine code."""
	if code_value in (None, ""):
		return None
	code_str = str(code_value).strip()
	if not code_str:
		return None
	if frappe.db.exists("ITEM_00_01", code_str):
		return code_str
	if code_str.endswith(".0"):
		trimmed = code_str[:-2]
		if frappe.db.exists("ITEM_00_01", trimmed):
			return trimmed
	return None


def _normalize_time_value(raw_time) -> str:
	"""Normalize imported time values to HH:MM:SS for MariaDB TIME column."""
	if raw_time in (None, ""):
		return "00:00:00"
	try:
		return str(get_time(str(raw_time).strip()))
	except Exception:
		return "00:00:00"


def _get_or_create_pmo_for_admission(admission_name: str, line_rows: list[dict]) -> tuple:
	"""Return PMO doc and created flag for one admission."""
	draft_name = frappe.db.get_value(
		"Patient Medication Order",
		{
			"inpatient_record": admission_name,
			"care_context": "Inpatient Admission",
			"docstatus": 0,
		},
		"name",
		order_by="modified desc",
	)
	if draft_name:
		return frappe.get_doc("Patient Medication Order", draft_name), False

	adm = frappe.db.get_value(
		"Inpatient Admission",
		admission_name,
		[
			"patient",
			"patient_name",
			"company",
			"primary_practitioner",
			"secondary_practitioner",
			"admission_date",
			"scheduled_date",
		],
		as_dict=True,
	)
	if not adm:
		frappe.throw(_("Inpatient Admission {0} not found").format(admission_name))

	doc = frappe.new_doc("Patient Medication Order")
	doc.trans_no = get_next_transaction_number("Patient Medication Order", fieldname="trans_no")
	doc.care_context = "Inpatient Admission"
	doc.inpatient_record = admission_name
	doc.patient = adm.get("patient")
	doc.patient_name = adm.get("patient_name")
	doc.company = adm.get("company")
	doc.practitioner = adm.get("primary_practitioner") or adm.get("secondary_practitioner")
	doc.posting_date = nowdate()
	doc.start_date = (
		line_rows[0].get("start_date")
		or adm.get("admission_date")
		or adm.get("scheduled_date")
		or nowdate()
	)
	doc.written_inpatient_admission = admission_name
	doc.old_admission_no = line_rows[0].get("old_admission_no")
	doc.ip_admission_rec_id = line_rows[0].get("ip_admission_rec_id")
	return doc, True


def process_ip_admission_medicine_link_batch(offset: int = 0) -> None:
	job = "ip_admission_medicine_link"
	try:
		admissions = frappe.db.sql(
			"""
			SELECT DISTINCT admission
			FROM `tabIP Admission Medicine`
			WHERE admission IS NOT NULL AND admission != ''
			ORDER BY admission
			LIMIT %s OFFSET %s
			""",
			(IP_ADMISSION_MEDICINE_BATCH_SIZE, offset),
			as_dict=True,
		)

		created_orders = 0
		updated_orders = 0
		linked_rows = 0
		skipped_rows = 0

		for adm_row in admissions:
			admission_name = adm_row.get("admission")
			line_rows = frappe.get_all(
				"IP Admission Medicine",
				filters={"admission": admission_name},
				fields=[
					"name",
					"medicine",
					"dose_notes",
					"dose_note",
					"notes",
					"route",
					"strength",
					"unit",
					"frequency",
					"duration",
					"duration_type",
					"qty",
					"start_date",
					"end_date",
					"trans_date",
					"trans_time",
					"status",
					"effective_status",
					"stop_reason",
					"stop_by",
					"stop_date",
					"old_admission_no",
					"ip_admission_rec_id",
				],
				order_by="trans_date asc, creation asc",
			)
			if not line_rows:
				continue

			doc, created = _get_or_create_pmo_for_admission(admission_name, line_rows)
			if created:
				created_orders += 1

			existing_trans_nums = {
				(c.trans_num or "").strip()
				for c in (doc.get("medication_orders") or [])
				if (c.trans_num or "").strip()
			}
			added_any = False

			for row in line_rows:
				trans_link = (row.get("name") or "").strip()
				if not trans_link:
					skipped_rows += 1
					continue
				if trans_link in existing_trans_nums:
					skipped_rows += 1
					continue

				old_code = _resolve_item_00_01_name(row.get("medicine"))
				old_name = None
				if old_code:
					old_name = frappe.db.get_value("ITEM_00_01", old_code, "item_nam")
				if not old_name:
					old_name = (row.get("medicine") or "").strip() or None

				entry = doc.append("medication_orders", {})
				entry.trans_num = trans_link
				entry.old_medicine_code = old_code
				entry.old_medicine_name = old_name
				entry.dosage = (
					(row.get("dose_notes") or "").strip()
					or (row.get("strength") or "").strip()
				)
				entry.uom = (row.get("unit") or "").strip()
				entry.no_of_days = cint(row.get("duration") or 0)
				entry.quantity = row.get("qty") or 0
				entry.instructions = (
					(row.get("notes") or "").strip()
					or (row.get("dose_note") or "").strip()
					or (row.get("dose_notes") or "").strip()
				)
				entry.date = row.get("start_date") or row.get("trans_date") or doc.start_date
				entry.end_date = row.get("end_date")
				entry.time = _normalize_time_value(row.get("trans_time"))
				entry.written_frequency = (row.get("frequency") or "").strip()
				entry.duration = str(row.get("duration") or "")
				entry.trans_type = (row.get("duration_type") or "").strip()
				entry.redundancy_type = (row.get("effective_status") or "").strip()
				entry.dc = (row.get("status") or "").strip()

				stopped_reason = (row.get("stop_reason") or "").strip()
				effective_status = (row.get("effective_status") or "").strip().lower()
				status = (row.get("status") or "").strip().lower()
				is_stopped = bool(
					stopped_reason
					or status == "stopped"
					or effective_status == "stopped"
				)
				entry.stopped = 1 if is_stopped else 0
				entry.reason_stopped = stopped_reason
				entry.stopped_date = row.get("stop_date")
				entry.stop_by = (row.get("stop_by") or "").strip() or None

				existing_trans_nums.add(trans_link)
				linked_rows += 1
				added_any = True

			if added_any:
				doc.flags.ignore_mandatory = True
				doc.save(ignore_permissions=True)
				if not created:
					updated_orders += 1

		frappe.db.commit()

		processed = offset + len(admissions)
		_set_progress(
			job,
			processed,
			created_orders=created_orders,
			updated_orders=updated_orders,
			linked_rows=linked_rows,
			skipped_rows=skipped_rows,
		)

		if len(admissions) >= IP_ADMISSION_MEDICINE_BATCH_SIZE:
			frappe.enqueue(
				"healthcare.api.data_migration_jobs.process_ip_admission_medicine_link_batch",
				offset=processed,
				queue="long",
				timeout=3600,
				job_name=f"healthcare_ip_admission_medicine_link_{processed}",
			)
		else:
			_set_progress(
				job,
				processed,
				done=True,
				created_orders=created_orders,
				updated_orders=updated_orders,
				linked_rows=linked_rows,
				skipped_rows=skipped_rows,
			)
			_release_lock(job)
			frappe.log_error(
				title="IP Admission Medicine link migration complete",
				message=(
					f"Processed admissions: {processed}, created PMO: {created_orders}, "
					f"updated PMO: {updated_orders}, linked rows: {linked_rows}, skipped rows: {skipped_rows}"
				),
			)
	except Exception:
		frappe.db.rollback()
		_set_progress(job, cint(offset), done=True, error=frappe.get_traceback())
		_release_lock(job)
		raise


def _normalize_doc_name(value) -> str:
	if value in (None, ""):
		return ""
	s = str(value).strip()
	if s.endswith(".0"):
		s = s[:-2]
	return s


def _resolve_item_code_for_given_tables(value) -> str | None:
	"""Return valid Item code for medicine_code if it exists; else None."""
	code = _normalize_doc_name(value)
	if not code:
		return None
	return code if frappe.db.exists("Item", code) else None


def _to_yes_no_flag(value) -> int:
	"""Normalize imported true-ish values to 1, else 0."""
	if value is None:
		return 0
	s = str(value).strip().upper()
	return 1 if s in {"1", "Y", "YES", "TRUE", "T"} else 0


def _safe_row_value(row: dict, key: str):
	"""Read row field by case-sensitive key with lowercase fallback."""
	if key in row:
		return row.get(key)
	lower = key.lower()
	if lower in row:
		return row.get(lower)
	return None


def _load_default_patient_assessment_template():
	template_name = (
		frappe.db.get_value("Patient Assessment Template", {"assessment_name": "Default Patient Evaluation"}, "name")
		or frappe.db.get_value("Patient Assessment Template", {"default": 1}, "name")
	)
	if not template_name:
		frappe.throw(_("Patient Assessment Template “Default Patient Evaluation” was not found."))
	return frappe.get_doc("Patient Assessment Template", template_name)


def process_ip_patient_assessment_map_batch(offset: int = 0) -> None:
	job = "ip_patient_assessment_map"
	try:
		template = _load_default_patient_assessment_template()
		template_name = template.name

		parameter_rows = frappe.get_all(
			"Patient Assessment Parameter",
			fields=["name", "parameter_abbrev"],
			limit_page_length=10000,
		)
		parameter_abbrev_by_name = {
			(p.get("name") or ""): (p.get("parameter_abbrev") or "").strip()
			for p in parameter_rows
		}

		ip_rows = frappe.get_all(
			"IP Patient Assessment",
			fields=["*"],
			order_by="name asc",
			limit_start=offset,
			limit_page_length=IP_PATIENT_ASSESSMENT_BATCH_SIZE,
		)

		created = 0
		skipped_existing = 0
		skipped_missing_admission = 0
		skipped_missing_patient = 0
		skipped_errors = 0

		for row in ip_rows:
			try:
				ip_name = str(row.get("name") or "").strip()
				if not ip_name:
					skipped_errors += 1
					continue

				if frappe.db.exists("Patient Assessment", {"ip_patient_assessment": ip_name, "docstatus": ["!=", 2]}):
					skipped_existing += 1
					continue

				admission = _normalize_doc_name(row.get("admission_num"))
				if not admission or not frappe.db.exists("Inpatient Admission", admission):
					skipped_missing_admission += 1
					continue

				inpatient = frappe.db.get_value(
					"Inpatient Admission",
					admission,
					["patient", "patient_name", "company", "primary_practitioner", "secondary_practitioner"],
					as_dict=True,
				) or {}
				patient = (inpatient.get("patient") or "").strip()
				if not patient:
					skipped_missing_patient += 1
					continue

				doc = frappe.new_doc("Patient Assessment")
				doc.patient = patient
				doc.patient_name = inpatient.get("patient_name")
				doc.assessment_template = template_name
				doc.reference_type = "Inpatient Admission"
				doc.encounter = admission
				doc.admission = admission
				doc.company = inpatient.get("company")
				doc.healthcare_practitioner = (
					inpatient.get("primary_practitioner") or inpatient.get("secondary_practitioner")
				)
				doc.assessment_datetime = row.get("cr_date") or now_datetime()
				doc.ip_patient_assessment = ip_name
				doc.assessment_description = (
					(_safe_row_value(row, "history_dscp") or "").strip()
					or (_safe_row_value(row, "others") or "").strip()
				)

				for detail in template.get("parameters") or []:
					param_name = (detail.get("assessment_parameter") or "").strip()
					if not param_name:
						continue
					abbrev = (parameter_abbrev_by_name.get(param_name) or "").strip()
					if not abbrev:
						continue

					flag_value = _safe_row_value(row, abbrev)
					yes_flag = _to_yes_no_flag(flag_value)

					desc_key = f"{abbrev.lower()}_desc"
					comments = (_safe_row_value(row, desc_key) or "").strip()
					if not comments and abbrev.lower() == "history":
						comments = (_safe_row_value(row, "history_dscp") or "").strip()

					doc.append(
						"assessment_sheet",
						{
							"parameter": param_name,
							"yes": yes_flag,
							"comments": comments if yes_flag else "",
						},
					)

				doc.flags.ignore_mandatory = True
				doc.insert(ignore_permissions=True)
				created += 1
			except Exception:
				skipped_errors += 1
				frappe.log_error(
					title=f"IP Patient Assessment map row failed: {row.get('name')}",
					message=frappe.get_traceback(),
				)

		frappe.db.commit()

		processed = offset + len(ip_rows)
		_set_progress(
			job,
			processed,
			template=template_name,
			created=created,
			skipped_existing=skipped_existing,
			skipped_missing_admission=skipped_missing_admission,
			skipped_missing_patient=skipped_missing_patient,
			skipped_errors=skipped_errors,
		)

		if len(ip_rows) >= IP_PATIENT_ASSESSMENT_BATCH_SIZE:
			frappe.enqueue(
				"healthcare.api.data_migration_jobs.process_ip_patient_assessment_map_batch",
				offset=processed,
				queue="long",
				timeout=3600,
				job_name=f"healthcare_ip_patient_assessment_map_{processed}",
			)
		else:
			_set_progress(
				job,
				processed,
				done=True,
				template=template_name,
				created=created,
				skipped_existing=skipped_existing,
				skipped_missing_admission=skipped_missing_admission,
				skipped_missing_patient=skipped_missing_patient,
				skipped_errors=skipped_errors,
			)
			_release_lock(job)
			frappe.log_error(
				title="IP Patient Assessment map migration complete",
				message=(
					f"Processed rows: {processed}, created: {created}, "
					f"skipped existing: {skipped_existing}, "
					f"skipped missing admission: {skipped_missing_admission}, "
					f"skipped missing patient: {skipped_missing_patient}, "
					f"skipped errors: {skipped_errors}"
				),
			)
	except Exception:
		frappe.db.rollback()
		_set_progress(job, cint(offset), done=True, error=frappe.get_traceback())
		_release_lock(job)
		raise


def _normalize_clinical_note_diagnosis_flag(raw) -> str | None:
	if raw is None:
		return None
	value = str(raw).strip().upper()
	return value or None


def _nurse_medical_roles() -> set[str]:
	roles = set(
		frappe.get_all(
			"Medical Role",
			filters={"parent_medical_role": "Nurse"},
			pluck="name",
		)
		or []
	)
	roles.add("Nurse")
	return roles


def _target_clinical_note_type_from_row(
	diagnosis_flag,
	medical_role,
	inpatient_admission,
	*,
	nurse_roles: set[str],
) -> str | None:
	"""Resolve target Clinical Note Type name from legacy flags and IP nursing context."""
	flag = _normalize_clinical_note_diagnosis_flag(diagnosis_flag)
	if flag and flag in _DIAGNOSIS_FLAG_TO_NOTE_TYPE:
		return _DIAGNOSIS_FLAG_TO_NOTE_TYPE[flag]

	# IP nursing imports: only when flag is empty, admission present, and role is nursing.
	if not flag and (inpatient_admission or "").strip():
		role = (medical_role or "").strip()
		if role in nurse_roles:
			return "Nursing Note"

	return None


def process_clinical_note_type_from_flag_batch(offset: int = 0) -> None:
	from healthcare.api.clinical_note import _get_or_create_clinical_note_type

	job = "clinical_note_type_from_flag"
	try:
		nurse_roles = _nurse_medical_roles()
		rows = frappe.get_all(
			"Clinical Note",
			fields=["name", "diagnosis_flag", "clinical_note_type", "medical_role", "inpatient_admission"],
			filters={"docstatus": ["!=", 2]},
			order_by="name asc",
			limit_start=offset,
			limit_page_length=CLINICAL_NOTE_TYPE_BATCH_SIZE,
		)

		updated = 0
		skipped_unchanged = 0
		skipped_no_mapping = 0
		skipped_errors = 0

		for row in rows:
			try:
				target = _target_clinical_note_type_from_row(
					row.get("diagnosis_flag"),
					row.get("medical_role"),
					row.get("inpatient_admission"),
					nurse_roles=nurse_roles,
				)
				if not target:
					skipped_no_mapping += 1
					continue

				current = (row.get("clinical_note_type") or "").strip()
				if current == target:
					skipped_unchanged += 1
					continue

				_get_or_create_clinical_note_type(target)
				frappe.db.set_value(
					"Clinical Note",
					row.name,
					"clinical_note_type",
					target,
					update_modified=False,
				)
				updated += 1
			except Exception:
				skipped_errors += 1
				frappe.log_error(
					title=f"Clinical Note type map failed: {row.get('name')}",
					message=frappe.get_traceback(),
				)

		frappe.db.commit()

		processed = offset + len(rows)
		_set_progress(
			job,
			processed,
			updated=updated,
			skipped_unchanged=skipped_unchanged,
			skipped_no_mapping=skipped_no_mapping,
			skipped_errors=skipped_errors,
		)

		if len(rows) >= CLINICAL_NOTE_TYPE_BATCH_SIZE:
			frappe.enqueue(
				"healthcare.api.data_migration_jobs.process_clinical_note_type_from_flag_batch",
				offset=processed,
				queue="long",
				timeout=3600,
				job_name=f"healthcare_clinical_note_type_from_flag_{processed}",
			)
		else:
			_set_progress(
				job,
				processed,
				done=True,
				updated=updated,
				skipped_unchanged=skipped_unchanged,
				skipped_no_mapping=skipped_no_mapping,
				skipped_errors=skipped_errors,
			)
			_release_lock(job)
			frappe.log_error(
				title="Clinical Note type from diagnosis_flag migration complete",
				message=(
					f"Processed: {processed}, updated: {updated}, "
					f"unchanged: {skipped_unchanged}, no mapping: {skipped_no_mapping}, "
					f"errors: {skipped_errors}"
				),
			)
	except Exception:
		frappe.db.rollback()
		_set_progress(job, cint(offset), done=True, error=frappe.get_traceback())
		_release_lock(job)
		raise


def _resolve_ip_admission_medicine_doc(medi_trans_num) -> str | None:
	"""Resolve IP Admission Medicine document name from sheet medi_trans_num."""
	name_guess = _normalize_doc_name(medi_trans_num)
	if not name_guess:
		return None
	if frappe.db.exists("IP Admission Medicine", name_guess):
		return name_guess
	match = frappe.db.get_value("IP Admission Medicine", {"trans_no": name_guess}, "name")
	return match or None


def _resolve_patient_medication_order_for_ip_med(admission_name: str, ip_med_name: str | None) -> str | None:
	"""Find PMO for exact admission + imported IP medicine transaction."""
	if not admission_name or not ip_med_name:
		return None
	match = frappe.db.sql(
		"""
		SELECT pmo.name
		FROM `tabPatient Medication Order` pmo
		INNER JOIN `tabInpatient Medication Order Entry` child
			ON child.parent = pmo.name
		WHERE pmo.inpatient_record = %(admission)s
		  AND child.trans_num = %(trans_num)s
		  AND pmo.docstatus != 2
		ORDER BY pmo.modified DESC
		LIMIT 1
		""",
		{"admission": admission_name, "trans_num": ip_med_name},
		as_dict=True,
	)
	return match[0].name if match else None


def _get_admission_detail_for_sheet_row(admission_num, patient_num):
	"""Resolve or create Admission Detail using admission_num / patient_num."""
	adm = _normalize_doc_name(admission_num)
	patient = _normalize_doc_name(patient_num)

	if adm:
		doc_name = frappe.db.get_value("Admission Detail", {"admission": adm}, "name")
		if doc_name:
			return frappe.get_doc("Admission Detail", doc_name)

		# Auto-create Admission Detail when admission exists but detail row is missing.
		if frappe.db.exists("Inpatient Admission", adm):
			inpatient = frappe.db.get_value(
				"Inpatient Admission",
				adm,
				["patient", "patient_name"],
				as_dict=True,
			) or {}
			file_no = inpatient.get("patient") or patient
			patient_name = inpatient.get("patient_name") or (
				frappe.db.get_value("Patient", file_no, "patient_name") if file_no else None
			)
			if file_no and patient_name:
				new_detail = frappe.new_doc("Admission Detail")
				new_detail.admission = adm
				new_detail.file_no = file_no
				new_detail.patient_name = patient_name
				new_detail.flags.ignore_mandatory = True
				new_detail.insert(ignore_permissions=True)
				return new_detail

	if patient:
		doc_name = frappe.db.get_value(
			"Admission Detail",
			{"file_no": patient},
			"name",
			order_by="modified desc",
		)
		if doc_name:
			return frappe.get_doc("Admission Detail", doc_name)

	return None


def process_ip_admission_medicine_sheet_map_batch(offset: int = 0) -> None:
	job = "ip_admission_medicine_sheet_map"
	try:
		prev = frappe.cache().get_value(_job_progress_key(job)) or {}
		prev_processed_rows = cint(prev.get("processed_rows", 0))
		prev_given_rows = cint(prev.get("given_rows", 0))
		prev_missed_rows = cint(prev.get("missed_rows", 0))
		prev_created_given = cint(prev.get("created_given", 0))
		prev_created_missed = cint(prev.get("created_missed", 0))
		prev_skipped_rows = cint(prev.get("skipped_rows", 0))
		prev_skip_no_admission_or_patient = cint(prev.get("skip_no_admission_or_patient", 0))
		prev_skip_no_admission_detail = cint(prev.get("skip_no_admission_detail", 0))
		prev_skip_already_mapped = cint(prev.get("skip_already_mapped", 0))
		prev_skip_error = cint(prev.get("skip_error", 0))
		prev_created_admission_detail = cint(prev.get("created_admission_detail", 0))
		prev_rows_without_pmo = cint(prev.get("rows_without_pmo", 0))
		prev_rows_without_ip_med = cint(prev.get("rows_without_ip_med", 0))

		rows = frappe.get_all(
			"IP Admission Medicine Sheet",
			fields=[
				"name",
				"trans_num",
				"medi_trans_num",
				"admission_num",
				"patient_num",
				"given_yn",
				"given_date",
				"remarks",
			],
			order_by="admission_num asc, trans_num asc",
			limit_start=offset,
			limit_page_length=IP_ADMISSION_MEDICINE_SHEET_BATCH_SIZE,
		)

		processed_rows = 0
		given_rows = 0
		missed_rows = 0
		skipped_rows = 0
		created_given = 0
		created_missed = 0
		skip_no_admission_or_patient = 0
		skip_no_admission_detail = 0
		skip_already_mapped = 0
		skip_error = 0
		created_admission_detail = 0
		rows_without_pmo = 0
		rows_without_ip_med = 0

		admission_cache: dict[str, object] = {}
		for row in rows:
			processed_rows += 1
			admission = _normalize_doc_name(row.get("admission_num"))
			patient_num = _normalize_doc_name(row.get("patient_num"))
			cache_key = f"{admission}|{patient_num}"
			if not admission and not patient_num:
				skipped_rows += 1
				skip_no_admission_or_patient += 1
				continue

			ad_detail = admission_cache.get(cache_key)
			if ad_detail is None:
				existed_before = bool(admission and frappe.db.exists("Admission Detail", {"admission": admission}))
				ad_detail = _get_admission_detail_for_sheet_row(admission, patient_num)
				if not ad_detail:
					skipped_rows += 1
					skip_no_admission_detail += 1
					continue
				if not existed_before and admission and (ad_detail.get("admission") == admission):
					created_admission_detail += 1
				admission_cache[cache_key] = ad_detail

			sheet_name = row.get("name")
			given_flag = (row.get("given_yn") or "").strip().upper()
			ip_med_name = _resolve_ip_admission_medicine_doc(row.get("medi_trans_num"))
			if not ip_med_name:
				rows_without_ip_med += 1
			ip_med_row = (
				frappe.db.get_value(
					"IP Admission Medicine",
					ip_med_name,
					["medicine", "dose_notes", "qty", "unit", "frequency"],
					as_dict=True,
				)
				if ip_med_name
				else None
			)

			legacy_code_name = _resolve_item_00_01_name((ip_med_row or {}).get("medicine"))
			legacy_name = (
				frappe.db.get_value("ITEM_00_01", legacy_code_name, "item_nam")
				if legacy_code_name
				else None
			)

			item_code = _resolve_item_code_for_given_tables((ip_med_row or {}).get("medicine"))
			item_name = (
				frappe.db.get_value("Item", item_code, "item_name")
				if item_code
				else (legacy_name or _normalize_doc_name((ip_med_row or {}).get("medicine")) or None)
			)
			pmo_name = _resolve_patient_medication_order_for_ip_med(
				admission or (ad_detail.get("admission") if ad_detail else ""),
				ip_med_name,
			)
			if not pmo_name:
				rows_without_pmo += 1

			date_val = None
			time_val = "00:00:00"
			if row.get("given_date"):
				date_val = getdate(row.get("given_date"))
				time_val = _normalize_time_value(row.get("given_date"))
			else:
				date_val = nowdate()

			common_payload = {
				"date": date_val,
				"time": time_val,
				"medicine_code": item_code,
				"medicine_name": item_name,
				"medication_order": pmo_name,
				"qty": (ip_med_row or {}).get("qty") or 0,
				"dose_notes": (row.get("remarks") or "").strip() or (ip_med_row or {}).get("dose_notes"),
				"medicine_given_timing": (ip_med_row or {}).get("frequency"),
				"user": frappe.session.user,
				"old_medicine_code": legacy_code_name,
				"old_medicine_name": legacy_name or item_name,
				"ip_admission_medicine": ip_med_name,
				"ip_admission_medicine_sheet": sheet_name,
				"patient_medication_order": pmo_name,
			}

			try:
				existing = any(
					(r.ip_admission_medicine_sheet or "") == sheet_name
					for r in (ad_detail.get("table_yrwe") or [])
				) or any(
					(r.ip_admission_medicine_sheet or "") == sheet_name
					for r in (ad_detail.get("missed_medicine") or [])
				)
				if existing:
					skipped_rows += 1
					skip_already_mapped += 1
					continue

				if given_flag == "N":
					ad_detail.append("missed_medicine", common_payload)
					missed_rows += 1
					created_missed += 1
				else:
					ad_detail.append("table_yrwe", common_payload)
					given_rows += 1
					created_given += 1
			except Exception:
				skipped_rows += 1
				skip_error += 1
				frappe.log_error(
					title=f"IP Medicine Sheet row map failed: {sheet_name}",
					message=frappe.get_traceback(),
				)

		for ad_doc in admission_cache.values():
			ad_doc.flags.ignore_mandatory = True
			ad_doc.save(ignore_permissions=True)

		frappe.db.commit()
		processed = offset + len(rows)
		total_processed_rows = prev_processed_rows + processed_rows
		total_given_rows = prev_given_rows + given_rows
		total_missed_rows = prev_missed_rows + missed_rows
		total_created_given = prev_created_given + created_given
		total_created_missed = prev_created_missed + created_missed
		total_skipped_rows = prev_skipped_rows + skipped_rows
		total_skip_no_admission_or_patient = prev_skip_no_admission_or_patient + skip_no_admission_or_patient
		total_skip_no_admission_detail = prev_skip_no_admission_detail + skip_no_admission_detail
		total_skip_already_mapped = prev_skip_already_mapped + skip_already_mapped
		total_skip_error = prev_skip_error + skip_error
		total_created_admission_detail = prev_created_admission_detail + created_admission_detail
		total_rows_without_pmo = prev_rows_without_pmo + rows_without_pmo
		total_rows_without_ip_med = prev_rows_without_ip_med + rows_without_ip_med
		_set_progress(
			job,
			processed,
			processed_rows=total_processed_rows,
			given_rows=total_given_rows,
			missed_rows=total_missed_rows,
			created_given=total_created_given,
			created_missed=total_created_missed,
			skipped_rows=total_skipped_rows,
			skip_no_admission_or_patient=total_skip_no_admission_or_patient,
			skip_no_admission_detail=total_skip_no_admission_detail,
			skip_already_mapped=total_skip_already_mapped,
			skip_error=total_skip_error,
			created_admission_detail=total_created_admission_detail,
			rows_without_pmo=total_rows_without_pmo,
			rows_without_ip_med=total_rows_without_ip_med,
		)

		if len(rows) >= IP_ADMISSION_MEDICINE_SHEET_BATCH_SIZE:
			frappe.enqueue(
				"healthcare.api.data_migration_jobs.process_ip_admission_medicine_sheet_map_batch",
				offset=processed,
				queue="long",
				timeout=3600,
				job_name=f"healthcare_ip_admission_medicine_sheet_map_{processed}",
			)
		else:
			_set_progress(
				job,
				processed,
				done=True,
				processed_rows=total_processed_rows,
				given_rows=total_given_rows,
				missed_rows=total_missed_rows,
				created_given=total_created_given,
				created_missed=total_created_missed,
				skipped_rows=total_skipped_rows,
				skip_no_admission_or_patient=total_skip_no_admission_or_patient,
				skip_no_admission_detail=total_skip_no_admission_detail,
				skip_already_mapped=total_skip_already_mapped,
				skip_error=total_skip_error,
				created_admission_detail=total_created_admission_detail,
				rows_without_pmo=total_rows_without_pmo,
				rows_without_ip_med=total_rows_without_ip_med,
			)
			_release_lock(job)
			frappe.log_error(
				title="IP Admission Medicine Sheet map migration complete",
				message=(
					f"Processed rows: {total_processed_rows}, created given: {total_created_given}, "
					f"created missed: {total_created_missed}, skipped: {total_skipped_rows}, "
					f"skip(no admission+patient): {total_skip_no_admission_or_patient}, "
					f"skip(no admission detail): {total_skip_no_admission_detail}, "
					f"skip(already mapped): {total_skip_already_mapped}, "
					f"skip(row error): {total_skip_error}, "
					f"created admission detail: {total_created_admission_detail}, "
					f"rows without IP med link: {total_rows_without_ip_med}, "
					f"rows without PMO link: {total_rows_without_pmo}"
				),
			)
	except Exception:
		frappe.db.rollback()
		_set_progress(job, cint(offset), done=True, error=frappe.get_traceback())
		_release_lock(job)
		raise


# ── Discharge checklist Excel import (Oracle IP_ADMISSION_04) ─────────────────


@frappe.whitelist()
def start_discharge_checklist_import_migration(file_url: str) -> dict:
	_require_admin()
	from healthcare.api.discharge_checklist_import import parse_and_cache_excel

	if not (file_url or "").strip():
		frappe.throw(_("Please upload an Excel file first."))

	job = "discharge_checklist_import"
	_acquire_lock(job)
	summary = parse_and_cache_excel(file_url)
	_set_progress(
		job,
		0,
		total_admissions=summary.get("admissions"),
		resolvable_admissions=summary.get("resolvable_admissions"),
		excel_rows=summary.get("excel_rows"),
		unresolved_rows=summary.get("unresolved_rows"),
		template=summary.get("template"),
	)
	frappe.enqueue(
		"healthcare.api.data_migration_jobs.process_discharge_checklist_import_batch",
		offset=0,
		queue="long",
		timeout=3600,
		job_name="healthcare_discharge_checklist_import",
	)
	return {
		"ok": True,
		"message": _(
			"Discharge checklist import started ({0} admissions in file, {1} can be matched to Discharge)."
		).format(
			summary.get("admissions") or 0,
			summary.get("resolvable_admissions") or 0,
		),
	}


def process_discharge_checklist_import_batch(offset: int = 0) -> None:
	from healthcare.api.discharge_checklist_import import run_discharge_checklist_import_batch

	job = "discharge_checklist_import"
	try:
		result = run_discharge_checklist_import_batch(offset=offset)
		prev = frappe.cache().get_value(_job_progress_key(job)) or {}
		processed = result.get("processed", offset)
		_set_progress(
			job,
			processed,
			ok=cint(prev.get("ok", 0)) + cint(result.get("ok", 0)),
			skip_no_admission=cint(prev.get("skip_no_admission", 0))
			+ cint(result.get("skip_no_admission", 0)),
			skip_no_discharge=cint(prev.get("skip_no_discharge", 0))
			+ cint(result.get("skip_no_discharge", 0)),
			errors=cint(prev.get("errors", 0)) + cint(result.get("errors", 0)),
			total_admissions=prev.get("total_admissions"),
		)

		if not result.get("done"):
			frappe.enqueue(
				"healthcare.api.data_migration_jobs.process_discharge_checklist_import_batch",
				offset=processed,
				queue="long",
				timeout=3600,
				job_name=f"healthcare_discharge_checklist_import_{processed}",
			)
		else:
			_set_progress(job, processed, done=True)
			_release_lock(job)
			frappe.log_error(
				title="Discharge checklist import complete",
				message=frappe.as_json(frappe.cache().get_value(_job_progress_key(job)) or {}),
			)
	except Exception:
		frappe.db.rollback()
		_set_progress(job, cint(offset), done=True, error=frappe.get_traceback())
		_release_lock(job)
		raise


# ── Normalize comma legacy IDs (1,415 → 1415) ─────────────────────────────────


def _accumulate_comma_job_progress(job: str, result: dict, counter_fields: list[str]) -> dict:
	"""Merge batch counters into job progress; keep total/remaining accurate."""
	prev = frappe.cache().get_value(_job_progress_key(job)) or {}
	batch_count = cint(result.get("batch_count", 0))
	processed = cint(prev.get("processed", 0)) + batch_count
	remaining = cint(result.get("remaining", 0))
	total = cint(prev.get("total")) or (processed + remaining)
	if remaining:
		total = max(total, processed + remaining)

	extra = {
		"total": total,
		"remaining": remaining,
	}
	for field in counter_fields:
		extra[field] = cint(prev.get(field, 0)) + cint(result.get(field, 0))

	_set_progress(job, processed, **extra)
	return {"processed": processed, **extra}


def _finish_comma_job(job: str, title: str, counter_fields: list[str]) -> None:
	prev = frappe.cache().get_value(_job_progress_key(job)) or {}
	processed = cint(prev.get("processed", 0))
	extra = {
		"remaining": 0,
		"total": cint(prev.get("total")) or processed,
	}
	for field in counter_fields:
		extra[field] = prev.get(field, 0)
	_set_progress(job, processed, done=True, **extra)
	_release_lock(job)
	frappe.log_error(title=title, message=frappe.as_json({"processed": processed, "done": True, **extra}))


@frappe.whitelist()
def start_comma_admission_id_migration() -> dict:
	_require_admin()
	from healthcare.api.legacy_id_normalize import _comma_inpatient_admission_names

	job = "comma_admission_ids"
	_acquire_lock(job)
	names = _comma_inpatient_admission_names()
	_set_progress(job, 0, total=len(names), remaining=len(names))
	frappe.enqueue(
		"healthcare.api.data_migration_jobs.process_comma_admission_id_batch",
		queue="long",
		timeout=3600,
		job_name="healthcare_comma_admission_ids",
	)
	return {
		"ok": True,
		"message": _("Comma admission ID cleanup started ({0} records).").format(len(names)),
	}


def process_comma_admission_id_batch() -> None:
	from healthcare.api.legacy_id_normalize import run_comma_admission_batch_next

	job = "comma_admission_ids"
	counter_fields = ["ok", "case_no_fixed", "skip", "errors"]
	try:
		result = run_comma_admission_batch_next()
		_accumulate_comma_job_progress(job, result, counter_fields)
		if not result.get("done"):
			processed = cint(
				(frappe.cache().get_value(_job_progress_key(job)) or {}).get("processed", 0)
			)
			frappe.enqueue(
				"healthcare.api.data_migration_jobs.process_comma_admission_id_batch",
				queue="long",
				timeout=3600,
				job_name=f"healthcare_comma_admission_ids_{processed}",
			)
		else:
			_finish_comma_job(job, "Comma admission ID cleanup complete", counter_fields)
	except Exception:
		frappe.db.rollback()
		prev = frappe.cache().get_value(_job_progress_key(job)) or {}
		_set_progress(
			job,
			cint(prev.get("processed", 0)),
			done=True,
			error=frappe.get_traceback(),
			total=prev.get("total"),
		)
		_release_lock(job)
		raise


@frappe.whitelist()
def start_comma_discharge_id_migration() -> dict:
	_require_admin()
	from healthcare.api.legacy_id_normalize import _comma_discharge_names

	job = "comma_discharge_ids"
	_acquire_lock(job)
	names = _comma_discharge_names()
	_set_progress(job, 0, total=len(names), remaining=len(names))
	frappe.enqueue(
		"healthcare.api.data_migration_jobs.process_comma_discharge_id_batch",
		queue="long",
		timeout=3600,
		job_name="healthcare_comma_discharge_ids",
	)
	return {
		"ok": True,
		"message": _("Comma discharge ID cleanup started ({0} records).").format(len(names)),
	}


def process_comma_discharge_id_batch() -> None:
	from healthcare.api.legacy_id_normalize import run_comma_discharge_batch_next

	job = "comma_discharge_ids"
	counter_fields = ["ok", "admission_fixed", "skip", "errors"]
	try:
		result = run_comma_discharge_batch_next()
		_accumulate_comma_job_progress(job, result, counter_fields)
		if not result.get("done"):
			processed = cint(
				(frappe.cache().get_value(_job_progress_key(job)) or {}).get("processed", 0)
			)
			frappe.enqueue(
				"healthcare.api.data_migration_jobs.process_comma_discharge_id_batch",
				queue="long",
				timeout=3600,
				job_name=f"healthcare_comma_discharge_ids_{processed}",
			)
		else:
			_finish_comma_job(job, "Comma discharge ID cleanup complete", counter_fields)
	except Exception:
		frappe.db.rollback()
		prev = frappe.cache().get_value(_job_progress_key(job)) or {}
		_set_progress(
			job,
			cint(prev.get("processed", 0)),
			done=True,
			error=frappe.get_traceback(),
			total=prev.get("total"),
		)
		_release_lock(job)
		raise
