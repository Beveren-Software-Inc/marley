"""Copy Patient File No onto Customer.custom_patient_file_no (Data field)."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint

from healthcare.api.data_migration_jobs import (
	_acquire_lock,
	_job_progress_key,
	_release_lock,
	_require_admin,
	_set_progress,
)

JOB = "patient_customer_file_no_sync"
BATCH_SIZE = 1000
CUSTOM_FIELD = "custom_patient_file_no"


def _patient_file_no(row: dict) -> str | None:
	"""Prefer Patient.file_no; Patient is often named by file_no."""
	for key in ("file_no", "name"):
		val = (row.get(key) or "").strip()
		if val:
			return val
	return None


def _ensure_custom_field() -> None:
	if not frappe.db.has_column("Customer", CUSTOM_FIELD):
		frappe.throw(
			_(
				"Customer custom field {0} is missing. "
				"Install Healthcare fixtures / Custom Field Customer-custom_patient_file_no first."
			).format(CUSTOM_FIELD)
		)


def _sync_one(row: dict) -> str:
	"""Return: updated | skipped_ok | skipped_no_customer | skipped_no_file_no | error"""
	customer = (row.get("customer") or "").strip()
	if not customer:
		return "skipped_no_customer"
	if not frappe.db.exists("Customer", customer):
		return "skipped_no_customer"

	file_no = _patient_file_no(row)
	if not file_no:
		return "skipped_no_file_no"

	current = (frappe.db.get_value("Customer", customer, CUSTOM_FIELD) or "").strip()
	if current == file_no:
		return "skipped_ok"

	try:
		frappe.db.set_value(
			"Customer",
			customer,
			CUSTOM_FIELD,
			file_no,
			update_modified=False,
		)
		return "updated"
	except Exception:
		frappe.log_error(
			title="Patient → Customer file no sync failed",
			message=frappe.get_traceback(),
			reference_doctype="Patient",
			reference_name=row.get("name"),
		)
		return "error"


@frappe.whitelist()
def preview_patient_customer_file_no_sync() -> dict:
	_require_admin()
	_ensure_custom_field()

	rows = frappe.db.sql(
		f"""
		SELECT
			p.name,
			p.file_no,
			p.customer,
			IFNULL(c.`{CUSTOM_FIELD}`, '') AS current_file_no
		FROM `tabPatient` p
		INNER JOIN `tabCustomer` c ON c.name = p.customer
		WHERE IFNULL(p.customer, '') != ''
		""",
		as_dict=True,
	)

	needs_update = 0
	skipped_ok = 0
	skipped_no_file_no = 0
	sample: list[dict] = []

	for row in rows:
		file_no = _patient_file_no(row)
		if not file_no:
			skipped_no_file_no += 1
			continue
		current = (row.get("current_file_no") or "").strip()
		if current == file_no:
			skipped_ok += 1
			continue
		needs_update += 1
		if len(sample) < 10:
			sample.append(
				{
					"patient": row.name,
					"customer": row.customer,
					"from_value": current or "(empty)",
					"to_value": file_no,
				}
			)

	return {
		"patients_with_customer": len(rows),
		"needs_update": needs_update,
		"skipped_ok": skipped_ok,
		"skipped_no_file_no": skipped_no_file_no,
		"sample": sample,
	}


@frappe.whitelist()
def start_patient_customer_file_no_sync() -> dict:
	_require_admin()
	_ensure_custom_field()
	_acquire_lock(JOB)
	_set_progress(
		JOB,
		0,
		updated=0,
		skipped_ok=0,
		skipped_no_customer=0,
		skipped_no_file_no=0,
		errors=0,
	)
	frappe.enqueue(
		"healthcare.api.patient_customer_file_no_sync.process_patient_customer_file_no_sync_batch",
		offset=0,
		queue="long",
		timeout=3600,
		job_name="healthcare_sync_patient_customer_file_no",
	)
	return {
		"ok": True,
		"message": _(
			"Customer Patient File No sync started. "
			"Each linked Customer.custom_patient_file_no will be set to the Patient File No."
		),
	}


def process_patient_customer_file_no_sync_batch(offset: int = 0) -> None:
	try:
		_ensure_custom_field()
		rows = frappe.db.sql(
			"""
			SELECT name, file_no, customer
			FROM `tabPatient`
			ORDER BY name
			LIMIT %s OFFSET %s
			""",
			(BATCH_SIZE, offset),
			as_dict=True,
		)

		prev = frappe.cache().get_value(_job_progress_key(JOB)) or {}
		updated = cint(prev.get("updated"))
		skipped_ok = cint(prev.get("skipped_ok"))
		skipped_no_customer = cint(prev.get("skipped_no_customer"))
		skipped_no_file_no = cint(prev.get("skipped_no_file_no"))
		errors = cint(prev.get("errors"))

		for row in rows:
			result = _sync_one(row)
			if result == "updated":
				updated += 1
			elif result == "skipped_ok":
				skipped_ok += 1
			elif result == "skipped_no_customer":
				skipped_no_customer += 1
			elif result == "skipped_no_file_no":
				skipped_no_file_no += 1
			elif result == "error":
				errors += 1

		frappe.db.commit()
		processed = offset + len(rows)
		_set_progress(
			JOB,
			processed,
			updated=updated,
			skipped_ok=skipped_ok,
			skipped_no_customer=skipped_no_customer,
			skipped_no_file_no=skipped_no_file_no,
			errors=errors,
		)

		if len(rows) >= BATCH_SIZE:
			frappe.enqueue(
				"healthcare.api.patient_customer_file_no_sync.process_patient_customer_file_no_sync_batch",
				offset=processed,
				queue="long",
				timeout=3600,
				job_name=f"healthcare_sync_patient_customer_file_no_{processed}",
			)
		else:
			_set_progress(
				JOB,
				processed,
				done=True,
				updated=updated,
				skipped_ok=skipped_ok,
				skipped_no_customer=skipped_no_customer,
				skipped_no_file_no=skipped_no_file_no,
				errors=errors,
			)
			_release_lock(JOB)
			frappe.log_error(
				title="Healthcare patient customer file no sync complete",
				message=(
					f"Scanned {processed} patient row(s); "
					f"updated {updated}; already ok {skipped_ok}; "
					f"no customer {skipped_no_customer}; "
					f"no file no {skipped_no_file_no}; errors {errors}."
				),
			)
	except Exception:
		frappe.db.rollback()
		_set_progress(JOB, cint(offset), done=True, error=frappe.get_traceback())
		_release_lock(JOB)
		raise
