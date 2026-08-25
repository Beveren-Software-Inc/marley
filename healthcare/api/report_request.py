import frappe
from frappe import _
from frappe.utils import add_days, get_fullname, now_datetime, today

from healthcare.api.common import apply_cost_center_scope_to_filters, ensure_file_url_public
from healthcare.healthcare.doctype.report_request.report_request import _primary_role
from healthcare.healthcare.editing_lock import assert_editing_allowed


def _row_dict(doc):
	audits = []
	for row in doc.get("audit_trail") or []:
		audits.append(
			{
				"action": row.action,
				"user": row.user,
				"user_full_name": row.user_full_name,
				"action_on": str(row.action_on) if row.action_on else None,
				"details": row.details,
			}
		)
	return {
		"name": doc.name,
		"status": doc.status,
		"request_date": str(doc.request_date) if doc.request_date else None,
		"urgency": doc.urgency,
		"patient": doc.patient,
		"patient_name": doc.patient_name,
		"file_no": doc.file_no,
		"id_number": doc.id_number,
		"requester": doc.requester,
		"requester_name": doc.requester_name,
		"requester_role": doc.requester_role,
		"recipient": doc.recipient,
		"signed_request": doc.signed_request,
		"remarks": doc.remarks,
		"reject_reason": doc.reject_reason,
		"completed_by": doc.completed_by,
		"completed_by_name": doc.completed_by_name,
		"completed_on": str(doc.completed_on) if doc.completed_on else None,
		"cost_center": doc.cost_center,
		"audit_trail": audits,
	}


def _load(name):
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Report request is required"))
	if not frappe.db.exists("Report Request", name):
		frappe.throw(_("Report request {0} not found").format(name))
	return frappe.get_doc("Report Request", name)


@frappe.whitelist()
def get_report_requests(status=None, patient=None, limit=50, offset=0):
	filters = {}
	if apply_cost_center_scope_to_filters(filters):
		return {"data": [], "total_count": 0}

	status = (status or "Pending").strip()
	if status == "Done":
		filters["status"] = "Done"
		filters["completed_on"] = [">=", add_days(now_datetime(), -3)]
	elif status and status != "All":
		filters["status"] = status

	if patient:
		filters["patient"] = patient

	total = frappe.db.count("Report Request", filters)
	rows = frappe.get_all(
		"Report Request",
		filters=filters,
		fields=[
			"name",
			"status",
			"request_date",
			"urgency",
			"patient",
			"patient_name",
			"file_no",
			"id_number",
			"requester",
			"requester_name",
			"requester_role",
			"recipient",
			"signed_request",
			"remarks",
			"reject_reason",
			"completed_by",
			"completed_by_name",
			"completed_on",
			"cost_center",
		],
		order_by="request_date desc, modified desc",
		limit_start=int(offset or 0),
		limit_page_length=int(limit or 50),
	)
	return {"data": rows, "total_count": total}


@frappe.whitelist()
def get_report_request(name):
	return _row_dict(_load(name))


@frappe.whitelist()
def create_report_request(data=None):
	assert_editing_allowed()
	if isinstance(data, str):
		data = frappe.parse_json(data) or {}
	data = data or {}
	patient = (data.get("patient") or "").strip()
	recipient = (data.get("recipient") or "").strip()
	if not patient:
		frappe.throw(_("Patient is required"))
	if not recipient:
		frappe.throw(_("Intended recipient is required"))

	signed = (data.get("signed_request") or "").strip()
	if signed:
		signed = ensure_file_url_public(signed)

	user = frappe.session.user
	doc = frappe.get_doc(
		{
			"doctype": "Report Request",
			"naming_series": "RR-.YYYY.-",
			"patient": patient,
			"request_date": data.get("request_date") or today(),
			"urgency": data.get("urgency") or "Non-Urgent",
			"recipient": recipient,
			"signed_request": signed or None,
			"remarks": (data.get("remarks") or "").strip() or None,
			"status": "Pending",
			"requester": user,
			"requester_name": get_fullname(user) or user,
			"requester_role": _primary_role(user),
			"cost_center": data.get("cost_center") or None,
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return _row_dict(doc)


@frappe.whitelist()
def update_report_request(name, data=None):
	assert_editing_allowed()
	if isinstance(data, str):
		data = frappe.parse_json(data) or {}
	data = data or {}
	doc = _load(name)
	changed = []
	if "remarks" in data:
		doc.remarks = (data.get("remarks") or "").strip() or None
		changed.append("remarks")
	if "recipient" in data and (data.get("recipient") or "").strip():
		doc.recipient = (data.get("recipient") or "").strip()
		changed.append("recipient")
	if "urgency" in data and data.get("urgency") in ("Urgent", "Non-Urgent"):
		doc.urgency = data.get("urgency")
		changed.append("urgency")
	if "signed_request" in data:
		signed = (data.get("signed_request") or "").strip()
		doc.signed_request = ensure_file_url_public(signed) if signed else None
		changed.append("signed request")
	if not changed:
		return _row_dict(doc)
	doc.add_audit("Updated", "Updated " + ", ".join(changed))
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _row_dict(doc)


@frappe.whitelist()
def complete_report_request(name):
	assert_editing_allowed()
	doc = _load(name)
	if doc.status == "Done":
		return _row_dict(doc)
	if doc.status == "Archived":
		frappe.throw(_("Archived requests cannot be completed"))
	user = frappe.session.user
	doc.status = "Done"
	doc.completed_by = user
	doc.completed_by_name = get_fullname(user) or user
	doc.completed_on = now_datetime()
	doc.add_audit("Completed", "Marked Done / Completed")
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _row_dict(doc)


@frappe.whitelist()
def reopen_report_request(name):
	assert_editing_allowed()
	doc = _load(name)
	if doc.status not in ("Done", "Rejected", "Archived"):
		frappe.throw(_("Only completed, rejected, or archived requests can be reopened"))
	prev = doc.status
	doc.status = "Pending"
	doc.completed_by = None
	doc.completed_by_name = None
	doc.completed_on = None
	if prev == "Rejected":
		doc.reject_reason = None
	doc.add_audit("Reopened", f"Reversed {prev} status")
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _row_dict(doc)


@frappe.whitelist()
def reject_report_request(name, reason=None):
	assert_editing_allowed()
	reason = (reason or "").strip()
	if not reason:
		frappe.throw(_("Reject reason is required"))
	doc = _load(name)
	if doc.status == "Archived":
		frappe.throw(_("Archived requests cannot be rejected"))
	doc.status = "Rejected"
	doc.reject_reason = reason
	doc.add_audit("Rejected", reason)
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _row_dict(doc)


def archive_done_report_requests():
	"""Daily: Done reports older than 3 days move to Archived."""
	cutoff = add_days(now_datetime(), -3)
	names = frappe.get_all(
		"Report Request",
		filters={"status": "Done", "completed_on": ["<", cutoff]},
		pluck="name",
	)
	for name in names:
		doc = frappe.get_doc("Report Request", name)
		doc.status = "Archived"
		doc.add_audit("Archived", "Auto-archived after 3 days in Done")
		doc.save(ignore_permissions=True)
	if names:
		frappe.db.commit()
	return {"archived": len(names)}
