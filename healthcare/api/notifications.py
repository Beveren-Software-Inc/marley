# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import cint

# Personal Frappe notification types — always for the addressed user.
_PERSONAL_TYPES = ("Mention", "Assignment", "Share")

# Alert document types that belong in the healthcare UI bell.
# Role-wide ERP spam (Item, Employee, …) is excluded so users only see
# notifications that relate to clinical / care work — same per-user scoping
# as Frappe Notification Log (`for_user`).
_HEALTHCARE_ALERT_DOCTYPES = (
	"Nurse Task",
	"Nursing Task",
	"Patient Visit",
	"Patient Appointment",
	"Patient",
	"Patient Encounter",
	"Lab Test",
	"Sample Collection",
	"Patient Medication Order",
	"Inpatient Record",
	"Inpatient Medication Entry",
	"Inpatient Medication Order",
	"Clinical Procedure",
	"Therapy Session",
	"Therapy Plan",
	"Observation",
	"Service Request",
	"Diagnostic Report",
	"Vital Signs",
	"Medication Request",
	"Healthcare Service Unit",
	"Discharge Checklist",
	"Admission Detail",
)


def _session_user() -> str:
	user = frappe.session.user
	if not user or user == "Guest":
		frappe.throw(_("Login required to view notifications"), frappe.AuthenticationError)
	return user


def _relevance_sql_clause():
	"""SQL: this user's Mentions/Assignments/Shares/Alerts on healthcare docs only."""
	personal_placeholders = ", ".join(["%s"] * len(_PERSONAL_TYPES))
	doctype_placeholders = ", ".join(["%s"] * len(_HEALTHCARE_ALERT_DOCTYPES))
	# Assignments on Sales Invoice / Employee / etc. stay in Frappe desk,
	# but must not appear in the healthcare UI bell.
	clause = f"""
		(
			(
				`type` IN ({personal_placeholders})
				AND document_type IN ({doctype_placeholders})
			)
			OR (
				`type` = 'Alert'
				AND document_type IN ({doctype_placeholders})
			)
		)
	"""
	return clause, (*_PERSONAL_TYPES, *_HEALTHCARE_ALERT_DOCTYPES, *_HEALTHCARE_ALERT_DOCTYPES)


def _fetch_user_notifications(user: str, unread_only: bool = False, limit: int = 50):
	relevance_sql, relevance_values = _relevance_sql_clause()
	unread_sql = "AND `read` = 0" if unread_only else ""
	rows = frappe.db.sql(
		f"""
		SELECT
			name, type, document_type, document_name, for_user,
			`read`, creation, subject, email_content
		FROM `tabNotification Log`
		WHERE for_user = %s
		  {unread_sql}
		  AND {relevance_sql}
		ORDER BY creation DESC
		LIMIT %s
		""",
		(user, *relevance_values, limit),
		as_dict=True,
	)
	# Defence in depth — never leak another user's row.
	return [r for r in rows if (r.get("for_user") or "") == user]


def _count_relevant_unread(user: str) -> int:
	relevance_sql, relevance_values = _relevance_sql_clause()
	return cint(
		frappe.db.sql(
			f"""
			SELECT COUNT(*)
			FROM `tabNotification Log`
			WHERE for_user = %s
			  AND `read` = 0
			  AND {relevance_sql}
			""",
			(user, *relevance_values),
		)[0][0]
	)


def _strip_html(value) -> str:
	from frappe.utils import strip_html

	return strip_html(value or "").strip()


def _format_notification(notif) -> dict:
	created = notif.get("creation")
	return {
		"id": notif.get("name"),
		"type": notif.get("type") or "Info",
		"title": _strip_html(notif.get("subject")) or "Notification",
		"message": _strip_html(notif.get("email_content")),
		"document_type": notif.get("document_type"),
		"document_name": notif.get("document_name"),
		"read": cint(notif.get("read")),
		"created": created.isoformat() if hasattr(created, "isoformat") else created,
		"for_user": notif.get("for_user"),
	}


@frappe.whitelist()
def get_user_notifications(unread_only=False):
	"""Return Notification Log rows for the logged-in user only (Frappe-style).

	Never returns another user's logs — including for Administrator.
	Only healthcare-related Assignments/Mentions/Shares/Alerts are returned
	(ERP docs like Sales Invoice stay in Frappe desk notifications).
	"""
	user = _session_user()

	try:
		if not frappe.db.exists("DocType", "Notification Log"):
			return {"notifications": [], "unread_count": 0}

		notifications = _fetch_user_notifications(user, unread_only=cint(unread_only))
		return {
			"notifications": [_format_notification(n) for n in notifications],
			"unread_count": _count_relevant_unread(user),
		}
	except frappe.AuthenticationError:
		raise
	except Exception as e:
		frappe.log_error(f"Error fetching notifications: {e!s}")
		return {"notifications": [], "unread_count": 0}


@frappe.whitelist()
def mark_notification_read(notification_id):
	"""Mark a notification as read (only if it belongs to the current user)."""
	user = _session_user()

	try:
		if not frappe.db.exists("Notification Log", {"name": notification_id, "for_user": user}):
			return {"success": False, "error": "Notification not found"}

		frappe.db.set_value(
			"Notification Log",
			{"name": str(notification_id), "for_user": user},
			"read",
			1,
			update_modified=False,
		)
		return {"success": True}
	except frappe.AuthenticationError:
		raise
	except Exception as e:
		frappe.log_error(f"Error marking notification as read: {e!s}")
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def mark_all_notifications_read():
	"""Mark all of the current user's notifications as read."""
	user = _session_user()

	try:
		if not frappe.db.exists("DocType", "Notification Log"):
			return {"success": False, "error": "Notification Log not available"}

		# `read` is reserved in MariaDB — must be back-quoted.
		frappe.db.sql(
			"""
			UPDATE `tabNotification Log`
			SET `read` = 1
			WHERE for_user = %s AND `read` = 0
			""",
			user,
		)
		frappe.db.commit()
		return {"success": True}
	except frappe.AuthenticationError:
		raise
	except Exception as e:
		frappe.log_error(f"Error marking all notifications as read: {e!s}")
		return {"success": False, "error": str(e)}
