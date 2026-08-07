"""Mark Long Acting Medicine Inactive when End Date has passed."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint, nowdate

from healthcare.api.data_migration_jobs import (
	_acquire_lock,
	_job_progress_key,
	_release_lock,
	_require_admin,
	_set_progress,
)

JOB = "long_acting_medicine_expire"
BATCH_SIZE = 200
# Still “open” statuses that should flip to Inactive once End Date has passed.
ACTIVE_LIKE = ("Draft", "Active", "Paused")
QUEUE_KEY = f"healthcare:data_migration:{JOB}:queue"


def _expired_filters() -> dict:
	"""End Date is set and before today (today is greater than End Date)."""
	return {
		"end_date": ["<", nowdate()],
		"status": ["in", list(ACTIVE_LIKE)],
	}


def _list_expired(*, limit: int, offset: int = 0) -> list[dict]:
	return frappe.get_all(
		"Long Acting Medicine",
		filters=_expired_filters(),
		fields=["name", "patient", "patient_name", "status", "end_date"],
		order_by="end_date asc, name asc",
		limit_start=offset,
		limit_page_length=limit,
	)


@frappe.whitelist()
def preview_long_acting_medicine_expire() -> dict:
	_require_admin()
	to_update = cint(frappe.db.count("Long Acting Medicine", _expired_filters()))
	sample = _list_expired(limit=15)
	return {
		"to_update": to_update,
		"as_of": nowdate(),
		"sample": [
			{
				"name": row.name,
				"patient": row.patient_name or row.patient,
				"status": row.status,
				"end_date": str(row.end_date) if row.end_date else "",
			}
			for row in sample
		],
	}


@frappe.whitelist()
def start_long_acting_medicine_expire() -> dict:
	_require_admin()
	names = frappe.get_all(
		"Long Acting Medicine",
		filters=_expired_filters(),
		pluck="name",
		order_by="end_date asc, name asc",
	)
	_acquire_lock(JOB)
	frappe.cache().set_value(QUEUE_KEY, names, expires_in_sec=60 * 60 * 12)
	_set_progress(JOB, 0, updated=0, errors=0, total=len(names))
	frappe.enqueue(
		"healthcare.api.long_acting_medicine_expire.process_long_acting_medicine_expire_batch",
		offset=0,
		queue="long",
		timeout=3600,
		job_name="healthcare_long_acting_medicine_expire",
	)
	return {
		"ok": True,
		"message": _(
			"Long Acting Medicine expiry started. "
			"Records with End Date before today will be set to Inactive."
		),
	}


def process_long_acting_medicine_expire_batch(offset: int = 0) -> None:
	try:
		queue = frappe.cache().get_value(QUEUE_KEY) or []
		batch = queue[offset : offset + BATCH_SIZE]

		prev = frappe.cache().get_value(_job_progress_key(JOB)) or {}
		updated = cint(prev.get("updated"))
		errors = cint(prev.get("errors"))

		for name in batch:
			try:
				status = frappe.db.get_value("Long Acting Medicine", name, "status")
				end_date = frappe.db.get_value("Long Acting Medicine", name, "end_date")
				if not end_date or status not in ACTIVE_LIKE:
					continue
				if str(end_date) >= nowdate():
					continue
				frappe.db.set_value(
					"Long Acting Medicine",
					name,
					"status",
					"Inactive",
					update_modified=True,
				)
				updated += 1
			except Exception:
				errors += 1
				frappe.log_error(
					title="Long acting medicine expire failed",
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
			errors=errors,
			total=len(queue),
		)

		if processed < len(queue):
			frappe.enqueue(
				"healthcare.api.long_acting_medicine_expire.process_long_acting_medicine_expire_batch",
				offset=processed,
				queue="long",
				timeout=3600,
				job_name=f"healthcare_long_acting_medicine_expire_{processed}",
			)
		else:
			_set_progress(
				JOB,
				processed,
				done=True,
				updated=updated,
				errors=errors,
				total=len(queue),
			)
			frappe.cache().delete_value(QUEUE_KEY)
			_release_lock(JOB)
			frappe.log_error(
				title="Healthcare long acting medicine expire complete",
				message=f"Updated {updated}; errors {errors}; scanned {processed}.",
			)
	except Exception:
		frappe.db.rollback()
		_set_progress(JOB, cint(offset), done=True, error=frappe.get_traceback())
		frappe.cache().delete_value(QUEUE_KEY)
		_release_lock(JOB)
		raise
