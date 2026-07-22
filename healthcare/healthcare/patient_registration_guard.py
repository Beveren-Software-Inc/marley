# Copyright (c) 2026, healthcare contributors
"""REC-021 - address is mandatory on patient registration.

Enforced server-side so the rule holds for the Desk form, the reception SPA and
the REST API alike.

Blast-radius note: 17,605 of 18,452 patients pre-date this rule and carry no
address at all. Enforcing on every save would make those records unsaveable, so
the default policy is:

  * new patients                      -> address required
  * existing patient that HAS one     -> address may not be cleared
  * existing patient that has none    -> allowed through (grandfathered)

Set Healthcare Settings -> "Enforce Patient Address on Existing Records" once the
back-data has been cleaned to drop the grandfather clause.
"""

from __future__ import annotations

import frappe
from frappe import _

# Any one of these satisfies "the patient has an address".
ADDRESS_FIELDS = ("address", "flat_num", "bldg_num", "road_num", "block_num", "city", "country")


def require_patient_address() -> bool:
	return bool(frappe.db.get_single_value("Healthcare Settings", "require_patient_address"))


def enforce_on_existing_records() -> bool:
	return bool(
		frappe.db.get_single_value("Healthcare Settings", "enforce_patient_address_on_existing")
	)


def _has_address(doc) -> bool:
	return any((doc.get(f) or "").strip() for f in ADDRESS_FIELDS)


def validate_patient_address(doc, method=None) -> None:
	"""Patient `validate` hook."""
	if not require_patient_address():
		return

	if _has_address(doc):
		return

	if doc.is_new():
		_throw()

	if enforce_on_existing_records():
		_throw()

	# Grandfathered record: allow the save, but never let an existing address be
	# wiped out once one is on file.
	previous = doc.get_doc_before_save()
	if previous and _has_address(previous):
		frappe.throw(
			_("Address cannot be removed once it has been recorded for a patient."),
			title=_("Address required"),
		)


def _throw() -> None:
	frappe.throw(
		_(
			"Address is required to register a patient. Fill in the address "
			"(building / road / block / city) before saving."
		),
		title=_("Address required"),
	)


@frappe.whitelist()
def patients_missing_address(limit: int = 0) -> dict:
	"""Data-cleanup helper: how many patients still have no address on file."""
	conditions = " AND ".join(f"COALESCE({f}, '') = ''" for f in ADDRESS_FIELDS)
	total = frappe.db.sql(f"SELECT COUNT(*) FROM `tabPatient` WHERE {conditions}")[0][0]
	rows = []
	if limit:
		rows = frappe.db.sql(
			f"""SELECT name, patient_name, mobile, status FROM `tabPatient`
			    WHERE {conditions} ORDER BY modified DESC LIMIT %s""",
			(limit,),
			as_dict=True,
		)
	return {"count": total, "sample": rows}
