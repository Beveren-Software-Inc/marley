"""One-off / bulk data maintenance jobs — run from Healthcare Settings in batches."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint, now_datetime

# ── Batch sizes (tune for ~1h runs on large datasets) ─────────────────────────
PATIENT_BATCH_SIZE = 2000
ADMISSION_BATCH_SIZE = 2000
VISIT_BATCH_SIZE = 25
APPOINTMENT_BATCH_SIZE = 2000
MEDICATION_ORDER_BATCH_SIZE = 25

JOB_LOCK_SECONDS = 7200  # 2 hours
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


def _set_progress(job: str, processed: int, *, done: bool = False, error: str | None = None) -> None:
	frappe.cache().set_value(
		_job_progress_key(job),
		{
			"processed": processed,
			"done": done,
			"error": error,
			"updated_at": str(now_datetime()),
		},
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
def get_migration_job_status(job: str) -> dict:
	_require_admin()
	progress = frappe.cache().get_value(_job_progress_key(job)) or {}
	running = bool(frappe.cache().get_value(_job_lock_key(job)))
	return {"running": running, **progress}


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
