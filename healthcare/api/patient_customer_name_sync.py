"""Rename linked Customer document IDs to Patient File No (with merge when safe)."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint

from healthcare.api.data_migration_jobs import (
	PATIENT_CUSTOMER_NAME_BATCH_SIZE,
	_acquire_lock,
	_job_progress_key,
	_release_lock,
	_require_admin,
	_set_progress,
)

JOB = "patient_customer_name_sync"
CUSTOM_FILE_NO_FIELD = "custom_patient_file_no"

# Denormalized display fields (rename_doc updates link fields, not these)
_TRANSACTION_SPECS = (
	("Sales Invoice", "customer", "customer_name", None),
	("Sales Order", "customer", "customer_name", None),
	("Delivery Note", "customer", "customer_name", None),
	("POS Invoice", "customer", "customer_name", None),
	("Quotation", "party_name", "customer_name", "quotation_to = 'Customer'"),
	("Payment Entry", "party", "party_name", "party_type = 'Customer'"),
)


def _target_customer_id(row: dict) -> str | None:
	"""Customer document name = File No, then ID Number, then Patient name."""
	for key in ("file_no", "id_number", "name"):
		val = (row.get(key) or "").strip()
		if val:
			return val
	return None


def _set_customer_file_no_field(customer_id: str, file_no: str) -> None:
	"""Keep Customer.custom_patient_file_no in sync when present."""
	if not file_no or not frappe.db.has_column("Customer", CUSTOM_FILE_NO_FIELD):
		return
	current = (frappe.db.get_value("Customer", customer_id, CUSTOM_FILE_NO_FIELD) or "").strip()
	if current != file_no:
		frappe.db.set_value(
			"Customer",
			customer_id,
			CUSTOM_FILE_NO_FIELD,
			file_no,
			update_modified=False,
		)


def _backfill_transaction_display_names(customer_id: str, new_name: str) -> int:
	updated = 0
	for doctype, link_field, name_field, extra_where in _TRANSACTION_SPECS:
		where = f"`{link_field}` = %s AND IFNULL(`{name_field}`, '') != %s"
		params: list = [customer_id, new_name]
		if extra_where:
			where += f" AND {extra_where}"
		names = frappe.db.sql(
			f"SELECT name FROM `tab{doctype}` WHERE {where}",
			params,
			pluck=True,
		)
		if not names:
			continue
		frappe.db.sql(
			f"UPDATE `tab{doctype}` SET `{name_field}` = %s, modified = modified WHERE name IN %s",
			(new_name, names),
		)
		updated += len(names)
	return updated


def _other_patient_using_customer(customer_id: str, patient: str) -> str | None:
	"""Return another Patient name that already uses this Customer, if any."""
	linked = frappe.db.get_value("Patient", {"customer": customer_id}, "name")
	if linked and linked != patient:
		return linked
	return None


def _sync_one_patient_customer(row: dict) -> str:
	"""Return: renamed | merged | updated_name | skipped_ok | skipped_no_customer | skipped_no_id | skipped_conflict | error"""
	customer = (row.get("customer") or "").strip()
	if not customer:
		return "skipped_no_customer"

	target_id = _target_customer_id(row)
	if not target_id:
		return "skipped_no_id"

	patient = row.name
	current_id = customer
	current_name = (frappe.db.get_value("Customer", current_id, "customer_name") or "").strip()
	file_no = (row.get("file_no") or target_id or "").strip()

	if current_id == target_id:
		if current_name == target_id:
			_set_customer_file_no_field(target_id, file_no)
			return "skipped_ok"
		frappe.db.set_value(
			"Customer",
			target_id,
			"customer_name",
			target_id,
			update_modified=False,
		)
		_set_customer_file_no_field(target_id, file_no)
		_backfill_transaction_display_names(target_id, target_id)
		return "updated_name"

	target_exists = frappe.db.exists("Customer", target_id)
	if target_exists:
		other = _other_patient_using_customer(target_id, patient)
		if other:
			return "skipped_conflict"
		# Target Customer exists but is not linked to a different patient —
		# merge so all transactions from both IDs land on the File No customer.
		try:
			frappe.rename_doc("Customer", current_id, target_id, force=True, merge=True)
		except Exception:
			frappe.log_error(
				title="Patient customer merge failed",
				message=frappe.get_traceback(),
				reference_doctype="Patient",
				reference_name=patient,
			)
			return "error"
		frappe.db.set_value(
			"Customer",
			target_id,
			"customer_name",
			target_id,
			update_modified=False,
		)
		_set_customer_file_no_field(target_id, file_no)
		if frappe.db.get_value("Patient", patient, "customer") != target_id:
			frappe.db.set_value("Patient", patient, "customer", target_id, update_modified=False)
		_backfill_transaction_display_names(target_id, target_id)
		return "merged"

	try:
		frappe.rename_doc("Customer", current_id, target_id, force=True, merge=False)
	except Exception:
		frappe.log_error(
			title="Patient customer rename failed",
			message=frappe.get_traceback(),
			reference_doctype="Patient",
			reference_name=patient,
		)
		return "error"

	frappe.db.set_value(
		"Customer",
		target_id,
		"customer_name",
		target_id,
		update_modified=False,
	)
	_set_customer_file_no_field(target_id, file_no)
	if frappe.db.get_value("Patient", patient, "customer") != target_id:
		frappe.db.set_value("Patient", patient, "customer", target_id, update_modified=False)

	_backfill_transaction_display_names(target_id, target_id)
	return "renamed"


@frappe.whitelist()
def preview_patient_customer_name_sync() -> dict:
	_require_admin()

	rows = frappe.db.sql(
		"""
		SELECT
			p.name,
			p.file_no,
			p.id_number,
			p.customer,
			c.name AS customer_id,
			c.customer_name AS current_customer_name
		FROM `tabPatient` p
		INNER JOIN `tabCustomer` c ON c.name = p.customer
		WHERE IFNULL(p.customer, '') != ''
		""",
		as_dict=True,
	)

	needs_rename = 0
	needs_merge = 0
	needs_name_only = 0
	skipped_no_id = 0
	skipped_conflict = 0
	sample: list[dict] = []

	for row in rows:
		target_id = _target_customer_id(row)
		if not target_id:
			skipped_no_id += 1
			continue

		current_id = (row.get("customer_id") or "").strip()
		current_name = (row.get("current_customer_name") or "").strip()
		id_ok = current_id == target_id
		name_ok = current_name == target_id

		if id_ok and name_ok:
			continue

		will_merge = False
		if not id_ok and frappe.db.exists("Customer", target_id):
			linked = frappe.db.get_value("Patient", {"customer": target_id}, "name")
			if linked and linked != row.name:
				skipped_conflict += 1
				continue
			will_merge = True

		if not id_ok:
			if will_merge:
				needs_merge += 1
			else:
				needs_rename += 1
			if len(sample) < 8:
				sample.append(
					{
						"patient": row.name,
						"from_id": current_id,
						"to_id": target_id,
						"from_name": current_name,
						"action": "merge" if will_merge else "rename",
					}
				)
		elif not name_ok:
			needs_name_only += 1

	return {
		"patients_with_customer": len(rows),
		"needs_rename": needs_rename,
		"needs_merge": needs_merge,
		"needs_name_only": needs_name_only,
		"needs_update": needs_rename + needs_merge + needs_name_only,
		"skipped_no_id": skipped_no_id,
		"skipped_conflict": skipped_conflict,
		"sample": sample,
	}


@frappe.whitelist()
def start_patient_customer_name_sync() -> dict:
	_require_admin()
	_acquire_lock(JOB)
	_set_progress(
		JOB,
		0,
		renamed=0,
		merged=0,
		updated_name=0,
		updated_transactions=0,
		skipped_no_customer=0,
		skipped_no_id=0,
		skipped_already_ok=0,
		skipped_conflict=0,
		errors=0,
	)
	frappe.enqueue(
		"healthcare.api.patient_customer_name_sync.process_patient_customer_name_sync_batch",
		offset=0,
		queue="long",
		timeout=3600,
		job_name="healthcare_sync_patient_customer_name",
	)
	return {
		"ok": True,
		"message": _(
			"Customer ID sync started. "
			"Each linked Customer will be renamed to the Patient File No "
			"(merge with an existing Customer of that ID when safe). "
			"Sales Invoices, Orders, Payment Entries, and other links follow the new ID."
		),
	}


def process_patient_customer_name_sync_batch(offset: int = 0) -> None:
	try:
		rows = frappe.db.sql(
			"""
			SELECT name, file_no, id_number, customer
			FROM `tabPatient`
			ORDER BY name
			LIMIT %s OFFSET %s
			""",
			(PATIENT_CUSTOMER_NAME_BATCH_SIZE, offset),
			as_dict=True,
		)

		prev = frappe.cache().get_value(_job_progress_key(JOB)) or {}
		renamed = cint(prev.get("renamed"))
		merged = cint(prev.get("merged"))
		updated_name = cint(prev.get("updated_name"))
		updated_transactions = cint(prev.get("updated_transactions"))
		skipped_no_customer = cint(prev.get("skipped_no_customer"))
		skipped_no_id = cint(prev.get("skipped_no_id"))
		skipped_already_ok = cint(prev.get("skipped_already_ok"))
		skipped_conflict = cint(prev.get("skipped_conflict"))
		errors = cint(prev.get("errors"))

		for row in rows:
			result = _sync_one_patient_customer(row)
			if result == "renamed":
				renamed += 1
			elif result == "merged":
				merged += 1
			elif result == "updated_name":
				updated_name += 1
			elif result == "skipped_no_customer":
				skipped_no_customer += 1
			elif result == "skipped_no_id":
				skipped_no_id += 1
			elif result == "skipped_ok":
				skipped_already_ok += 1
			elif result == "skipped_conflict":
				skipped_conflict += 1
			elif result == "updated_link":
				renamed += 1
			elif result == "error":
				errors += 1

		frappe.db.commit()
		processed = offset + len(rows)
		_set_progress(
			JOB,
			processed,
			renamed=renamed,
			merged=merged,
			updated_name=updated_name,
			updated_transactions=updated_transactions,
			skipped_no_customer=skipped_no_customer,
			skipped_no_id=skipped_no_id,
			skipped_already_ok=skipped_already_ok,
			skipped_conflict=skipped_conflict,
			errors=errors,
		)

		if len(rows) >= PATIENT_CUSTOMER_NAME_BATCH_SIZE:
			frappe.enqueue(
				"healthcare.api.patient_customer_name_sync.process_patient_customer_name_sync_batch",
				offset=processed,
				queue="long",
				timeout=3600,
				job_name=f"healthcare_sync_patient_customer_name_{processed}",
			)
		else:
			_set_progress(
				JOB,
				processed,
				done=True,
				renamed=renamed,
				merged=merged,
				updated_name=updated_name,
				updated_transactions=updated_transactions,
				skipped_no_customer=skipped_no_customer,
				skipped_no_id=skipped_no_id,
				skipped_already_ok=skipped_already_ok,
				skipped_conflict=skipped_conflict,
				errors=errors,
			)
			_release_lock(JOB)
			frappe.log_error(
				title="Healthcare patient customer name sync complete",
				message=(
					f"Scanned {processed} patient row(s); "
					f"renamed {renamed}; merged {merged}; "
					f"updated customer_name only {updated_name}; "
					f"skipped already correct {skipped_already_ok}; "
					f"skipped without customer {skipped_no_customer}; "
					f"skipped without File No/ID {skipped_no_id}; "
					f"skipped ID conflict {skipped_conflict}; "
					f"errors {errors}."
				),
			)
	except Exception:
		frappe.db.rollback()
		_set_progress(JOB, cint(offset), done=True, error=frappe.get_traceback())
		_release_lock(JOB)
		raise
