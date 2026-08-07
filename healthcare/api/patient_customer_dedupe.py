"""Delete unlinked duplicate Customers that share a name with a patient-linked Customer.

Keeps every Customer linked on Patient.customer. Deletes siblings with the same
customer_name that are not linked to any Patient. Groups with no patient link
(e.g. Default Customer) are left alone.
"""

from __future__ import annotations

from collections import defaultdict

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

JOB = "patient_customer_dedupe"
BATCH_SIZE = 100


def _name_key(customer_name: str | None) -> str:
	return (customer_name or "").strip().lower()


def _fetch_duplicate_name_customers() -> list[dict]:
	"""Customers whose trimmed/lowered name appears more than once."""
	return frappe.db.sql(
		"""
		SELECT
			c.name,
			c.customer_name,
			TRIM(IFNULL(c.customer_name, '')) AS display_name,
			LOWER(TRIM(IFNULL(c.customer_name, ''))) AS name_key,
			p.name AS patient
		FROM `tabCustomer` c
		LEFT JOIN `tabPatient` p ON p.customer = c.name
		WHERE LOWER(TRIM(IFNULL(c.customer_name, ''))) IN (
			SELECT LOWER(TRIM(IFNULL(customer_name, '')))
			FROM `tabCustomer`
			WHERE TRIM(IFNULL(customer_name, '')) != ''
			GROUP BY LOWER(TRIM(IFNULL(customer_name, '')))
			HAVING COUNT(*) > 1
		)
		ORDER BY name_key, c.creation, c.name
		""",
		as_dict=True,
	)


def _plan_deletions(rows: list[dict] | None = None) -> dict:
	"""Build delete plan: unlinked customers that share a name with ≥1 patient-linked one."""
	rows = rows if rows is not None else _fetch_duplicate_name_customers()
	by_name: dict[str, list[dict]] = defaultdict(list)
	for row in rows:
		key = row.get("name_key") or _name_key(row.get("customer_name"))
		if not key:
			continue
		by_name[key].append(row)

	to_delete: list[dict] = []
	kept_linked: list[dict] = []
	groups_with_link = 0
	groups_skipped_no_link = 0

	for key, group in by_name.items():
		linked = [r for r in group if r.get("patient")]
		unlinked = [r for r in group if not r.get("patient")]
		if not linked:
			groups_skipped_no_link += 1
			continue
		if not unlinked:
			continue
		groups_with_link += 1
		for r in linked:
			kept_linked.append(
				{
					"customer": r.name,
					"customer_name": r.get("display_name") or r.get("customer_name"),
					"patient": r.patient,
				}
			)
		for r in unlinked:
			to_delete.append(
				{
					"customer": r.name,
					"customer_name": r.get("display_name") or r.get("customer_name"),
					"keep_customer": linked[0].name,
					"keep_patient": linked[0].patient,
				}
			)

	return {
		"duplicate_name_groups": len(by_name),
		"groups_with_patient_link": groups_with_link,
		"groups_skipped_no_patient_link": groups_skipped_no_link,
		"customers_to_delete": to_delete,
		"customers_kept_linked": kept_linked,
	}


def _customer_has_blocking_links(customer: str) -> str | None:
	"""Return a short reason if Customer should not be deleted, else None."""
	# Party documents that commonly block Customer delete
	checks = (
		("Sales Invoice", {"customer": customer}),
		("Sales Order", {"customer": customer}),
		("Quotation", {"party_name": customer}),
		("Delivery Note", {"customer": customer}),
		("Payment Entry", {"party": customer, "party_type": "Customer"}),
		("Journal Entry Account", {"party": customer, "party_type": "Customer"}),
		("POS Invoice", {"customer": customer}),
	)
	for doctype, filters in checks:
		if not frappe.db.exists("DocType", doctype):
			continue
		try:
			if frappe.db.exists(doctype, filters):
				return f"linked to {doctype}"
		except Exception:
			# DocType may lack those columns on some sites
			continue

	# Another Patient must never lose its customer via this job (belt-and-suspenders)
	if frappe.db.exists("Patient", {"customer": customer}):
		return "linked to Patient"

	return None


def _delete_one(customer: str) -> str:
	"""Return: deleted | skipped_missing | skipped_linked | skipped_has_links | error"""
	if not customer:
		return "skipped_missing"
	if not frappe.db.exists("Customer", customer):
		return "skipped_missing"
	if frappe.db.exists("Patient", {"customer": customer}):
		return "skipped_linked"

	reason = _customer_has_blocking_links(customer)
	if reason:
		return "skipped_has_links"

	try:
		frappe.delete_doc("Customer", customer, ignore_permissions=True, force=False)
		return "deleted"
	except frappe.LinkExistsError:
		return "skipped_has_links"
	except Exception:
		frappe.log_error(
			title="Patient customer dedupe delete failed",
			message=frappe.get_traceback(),
			reference_doctype="Customer",
			reference_name=customer,
		)
		return "error"


@frappe.whitelist()
def preview_patient_customer_dedupe() -> dict:
	_require_admin()
	plan = _plan_deletions()
	to_delete = plan["customers_to_delete"]
	sample = [
		{
			"customer": row["customer"],
			"customer_name": row["customer_name"],
			"keep_customer": row["keep_customer"],
			"keep_patient": row["keep_patient"],
		}
		for row in to_delete[:15]
	]
	return {
		"duplicate_name_groups": plan["duplicate_name_groups"],
		"groups_with_patient_link": plan["groups_with_patient_link"],
		"groups_skipped_no_patient_link": plan["groups_skipped_no_patient_link"],
		"to_delete": len(to_delete),
		"kept_linked": len(plan["customers_kept_linked"]),
		"sample": sample,
	}


@frappe.whitelist()
def start_patient_customer_dedupe() -> dict:
	_require_admin()
	plan = _plan_deletions()
	names = [row["customer"] for row in plan["customers_to_delete"]]
	_acquire_lock(JOB)
	frappe.cache().set_value(
		f"healthcare:data_migration:{JOB}:queue",
		names,
		expires_in_sec=60 * 60 * 12,
	)
	_set_progress(
		JOB,
		0,
		deleted=0,
		skipped_missing=0,
		skipped_linked=0,
		skipped_has_links=0,
		errors=0,
		total=len(names),
	)
	frappe.enqueue(
		"healthcare.api.patient_customer_dedupe.process_patient_customer_dedupe_batch",
		offset=0,
		queue="long",
		timeout=3600,
		job_name="healthcare_patient_customer_dedupe",
	)
	return {
		"ok": True,
		"message": _(
			"Duplicate Customer cleanup started. "
			"Unlinked Customers that share a name with a patient-linked Customer will be deleted."
		),
	}


def process_patient_customer_dedupe_batch(offset: int = 0) -> None:
	try:
		queue = frappe.cache().get_value(f"healthcare:data_migration:{JOB}:queue") or []
		batch = queue[offset : offset + BATCH_SIZE]

		prev = frappe.cache().get_value(_job_progress_key(JOB)) or {}
		deleted = cint(prev.get("deleted"))
		skipped_missing = cint(prev.get("skipped_missing"))
		skipped_linked = cint(prev.get("skipped_linked"))
		skipped_has_links = cint(prev.get("skipped_has_links"))
		errors = cint(prev.get("errors"))

		for customer in batch:
			result = _delete_one(customer)
			if result == "deleted":
				deleted += 1
			elif result == "skipped_missing":
				skipped_missing += 1
			elif result == "skipped_linked":
				skipped_linked += 1
			elif result == "skipped_has_links":
				skipped_has_links += 1
			elif result == "error":
				errors += 1

		frappe.db.commit()
		processed = offset + len(batch)
		_set_progress(
			JOB,
			processed,
			deleted=deleted,
			skipped_missing=skipped_missing,
			skipped_linked=skipped_linked,
			skipped_has_links=skipped_has_links,
			errors=errors,
			total=len(queue),
		)

		if processed < len(queue):
			frappe.enqueue(
				"healthcare.api.patient_customer_dedupe.process_patient_customer_dedupe_batch",
				offset=processed,
				queue="long",
				timeout=3600,
				job_name=f"healthcare_patient_customer_dedupe_{processed}",
			)
		else:
			_set_progress(
				JOB,
				processed,
				done=True,
				deleted=deleted,
				skipped_missing=skipped_missing,
				skipped_linked=skipped_linked,
				skipped_has_links=skipped_has_links,
				errors=errors,
				total=len(queue),
			)
			frappe.cache().delete_value(f"healthcare:data_migration:{JOB}:queue")
			_release_lock(JOB)
			frappe.log_error(
				title="Healthcare patient customer dedupe complete",
				message=(
					f"Processed {processed} candidate(s); deleted {deleted}; "
					f"missing {skipped_missing}; still linked {skipped_linked}; "
					f"has transactions {skipped_has_links}; errors {errors}."
				),
			)
	except Exception:
		frappe.db.rollback()
		_set_progress(JOB, cint(offset), done=True, error=frappe.get_traceback())
		frappe.cache().delete_value(f"healthcare:data_migration:{JOB}:queue")
		_release_lock(JOB)
		raise
