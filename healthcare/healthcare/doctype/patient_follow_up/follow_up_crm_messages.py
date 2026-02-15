# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

"""Send mid-year and end-of-year follow-up messages to patients (OP & IP discharged)."""

import frappe
from frappe import _
from frappe.utils import getdate


def send_follow_up_mid_end_year_messages():
	"""Called by scheduler (monthly). Sends on 15th June and 15th December."""
	if not frappe.db.get_single_value(
		"Healthcare Settings", "enable_follow_up_mid_end_year_message"
	):
		return
	today = getdate()
	month, day = today.month, today.day
	# Mid-year: 15 June (6); End of year: 15 December (12)
	if (month, day) == (6, 15):
		_send_follow_up_bulk_message("follow_up_mid_year_message")
	elif (month, day) == (12, 15):
		_send_follow_up_bulk_message("follow_up_end_year_message")


def _send_follow_up_bulk_message(message_field):
	"""Get message template from Healthcare Settings and send to patients who allow follow up."""
	message = frappe.db.get_single_value("Healthcare Settings", message_field)
	if not message or not message.strip():
		return
	# Patients with is_follow_up = 1 (allow follow up), with mobile
	patients = frappe.get_all(
		"Patient",
		filters={"is_follow_up": 1, "mobile": ["!=", ""], "mobile": ["is", "set"]},
		fields=["name", "patient_name", "mobile"],
		limit=5000,
	)
	if not patients:
		return
	try:
		from frappe.core.doctype.sms_settings.sms_settings import send_sms
	except ImportError:
		frappe.log_error("SMS Settings not available for follow-up messages", "Follow Up CRM")
		return
	sent = 0
	for p in patients:
		try:
			ctx = {"doc": frappe._dict(p), "patient_name": p.get("patient_name") or p.name}
			rendered = frappe.render_template(message, ctx)
			send_sms([p.mobile], rendered)
			sent += 1
		except Exception as e:
			frappe.log_error(
				title="Follow Up SMS failed",
				message=frappe.get_traceback() + f"\nPatient: {p.name}",
			)
	if sent:
		frappe.db.commit()
