"""Reception APIs for Practitioner Unavailability (doctor leave / hold)."""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import getdate, today

from healthcare.api.utils.api_utility import get_next_transaction_number


def _require_reception_access() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator", "Reception"))


def _serialize_row(row: dict) -> dict:
	return {
		"name": row.get("name"),
		"tran_num": row.get("tran_num"),
		"posting_date": row.get("posting_date"),
		"start_date": row.get("start_date"),
		"end_date": row.get("end_date"),
		"doctor_id": row.get("doctor_id"),
		"practitioner_name": row.get("practitioner_name"),
		"is_cancel": int(row.get("is_cancel") or 0),
		"any_remarks": row.get("any_remarks") or "",
		"branch": row.get("branch") or "",
		"cr_date": row.get("cr_date") or "",
		"up_date": row.get("up_date") or "",
	}


@frappe.whitelist()
def get_practitioner_unavailabilities(
	limit: int = 100,
	offset: int = 0,
	doctor_id: str | None = None,
	branch: str | None = None,
	include_cancelled: int = 1,
) -> list[dict]:
	_require_reception_access()
	filters: dict[str, Any] = {}
	if doctor_id:
		filters["doctor_id"] = doctor_id
	if branch:
		filters["branch"] = branch
	if not int(include_cancelled or 0):
		filters["is_cancel"] = 0

	rows = frappe.get_all(
		"Practitioner Unavailability",
		filters=filters,
		fields=[
			"name",
			"tran_num",
			"posting_date",
			"start_date",
			"end_date",
			"doctor_id",
			"practitioner_name",
			"is_cancel",
			"any_remarks",
			"branch",
			"cr_date",
			"up_date",
		],
		order_by="start_date desc, modified desc",
		limit_page_length=int(limit or 100),
		limit_start=int(offset or 0),
	)
	return [_serialize_row(row) for row in rows]


@frappe.whitelist()
def create_practitioner_unavailability(
	doctor_id: str,
	start_date: str,
	end_date: str,
	branch: str | None = None,
	any_remarks: str | None = None,
	is_cancel: int = 0,
	tran_num: str | None = None,
) -> dict:
	_require_reception_access()
	doctor_id = (doctor_id or "").strip()
	if not doctor_id:
		frappe.throw(_("Doctor is required."))
	if not frappe.db.exists("Healthcare Practitioner", doctor_id):
		frappe.throw(_("Healthcare Practitioner {0} not found.").format(doctor_id))

	start = getdate(start_date)
	end = getdate(end_date)
	if end < start:
		frappe.throw(_("End Date cannot be before Start Date."))

	tran_num = (tran_num or "").strip() or get_next_transaction_number(
		"Practitioner Unavailability",
		fieldname="tran_num",
	)
	if frappe.db.exists("Practitioner Unavailability", tran_num):
		frappe.throw(_("Tran Num {0} already exists.").format(tran_num))

	practitioner_name = frappe.db.get_value(
		"Healthcare Practitioner",
		doctor_id,
		"practitioner_name",
	)

	doc = frappe.new_doc("Practitioner Unavailability")
	doc.tran_num = tran_num
	doc.doctor_id = doctor_id
	doc.practitioner_name = practitioner_name or doctor_id
	doc.start_date = start
	doc.end_date = end
	doc.posting_date = today()
	doc.is_cancel = 1 if int(is_cancel or 0) else 0
	doc.any_remarks = (any_remarks or "").strip()
	if branch:
		doc.branch = branch
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return _serialize_row(doc.as_dict())


@frappe.whitelist()
def update_practitioner_unavailability(
	name: str,
	is_cancel: int | None = None,
	any_remarks: str | None = None,
	start_date: str | None = None,
	end_date: str | None = None,
	branch: str | None = None,
) -> dict:
	_require_reception_access()
	name = (name or "").strip()
	if not name or not frappe.db.exists("Practitioner Unavailability", name):
		frappe.throw(_("Practitioner Unavailability {0} not found.").format(name))

	doc = frappe.get_doc("Practitioner Unavailability", name)
	if is_cancel is not None:
		doc.is_cancel = 1 if int(is_cancel) else 0
	if any_remarks is not None:
		doc.any_remarks = (any_remarks or "").strip()
	if start_date:
		doc.start_date = getdate(start_date)
	if end_date:
		doc.end_date = getdate(end_date)
	if branch is not None:
		doc.branch = branch or None
	if doc.end_date and doc.start_date and getdate(doc.end_date) < getdate(doc.start_date):
		frappe.throw(_("End Date cannot be before Start Date."))
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _serialize_row(doc.as_dict())
