# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

from __future__ import annotations

import json
import re
from typing import Iterable

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

from healthcare.healthcare.doctype.digital_connect_whatsap_settings.digital_connect_whatsap_settings import (
	send_test_message,
)


SKIP_DOCTYPES = {
	"Digi Whatsapp Notification Setup",
	"Digi Whatsapp Notification Recipient",
	"Digital Connect Whatsap Settings",
	"Digital Whatsapp Chat",
	"Digital Whatsapp Template",
}


class DigiWhatsappNotificationSetup(Document):
	pass


def handle_after_insert(doc, method=None):
	_process_notifications(doc, "after_insert")


def handle_on_update(doc, method=None):
	_process_notifications(doc, "on_update")


def handle_on_submit(doc, method=None):
	_process_notifications(doc, "on_submit")


def handle_on_cancel(doc, method=None):
	_process_notifications(doc, "on_cancel")


def handle_on_update_after_submit(doc, method=None):
	_process_notifications(doc, "on_update_after_submit")


def _process_notifications(doc, event: str):
	if _skip_notification_runtime():
		return

	if not doc or getattr(doc, "doctype", None) in SKIP_DOCTYPES:
		return

	setups = frappe.get_all(
		"Digi Whatsapp Notification Setup",
		filters={
			"enabled": 1,
			"reference_doctype": doc.doctype,
			"event": event,
		},
		fields=["name"],
		ignore_permissions=True,
	)
	for row in setups:
		try:
			setup = frappe.get_doc("Digi Whatsapp Notification Setup", row.name)
			_execute_notification(setup, doc)
		except Exception:
			frappe.log_error(
				frappe.get_traceback(),
				f"Digi WhatsApp Notification failed: {row.name}",
			)


def _skip_notification_runtime() -> bool:
	# Avoid running during schema sync/migrate/install where doctypes may not exist yet.
	if getattr(frappe.flags, "in_migrate", False) or getattr(frappe.flags, "in_install", False):
		return True

	# Guard against early hook execution before DocType/table creation.
	if not frappe.db.table_exists("tabDocType"):
		return True
	if not frappe.db.exists("DocType", "Digi Whatsapp Notification Setup"):
		return True
	if not frappe.db.table_exists("tabDigi Whatsapp Notification Setup"):
		return True
	return False


def _execute_notification(setup: DigiWhatsappNotificationSetup, doc, override_numbers: Iterable[str] | None = None):
	if not _passes_condition(setup, doc):
		return {"sent": 0, "skipped": True}

	recipients = set(_normalize_phone(x) for x in (override_numbers or []))
	recipients.discard("")

	if not recipients:
		recipients.update(_resolve_recipients(setup, doc))

	if not recipients:
		_update_setup_state(setup, "No recipients resolved")
		return {"sent": 0, "skipped": True}

	template_params = _build_template_parameters(setup, doc)
	sent = 0
	errors: list[str] = []

	for recipient in recipients:
		try:
			send_test_message(
				phone_number=recipient,
				template_name=setup.template,
				template_parameters=template_params,
			)
			sent += 1
		except Exception as exc:
			errors.append(f"{recipient}: {exc}")

	if errors:
		_update_setup_state(setup, "\n".join(errors))
	else:
		_update_setup_state(setup, "")
	return {"sent": sent, "errors": errors}


def _passes_condition(setup: DigiWhatsappNotificationSetup, doc) -> bool:
	condition = (setup.condition or "").strip()
	if not condition:
		return True
	try:
		return bool(frappe.safe_eval(condition, None, {"doc": doc, "frappe": frappe}))
	except Exception:
		frappe.log_error(
			frappe.get_traceback(),
			f"Digi WhatsApp Notification condition failed: {setup.name}",
		)
		return False


def _resolve_recipients(setup: DigiWhatsappNotificationSetup, doc) -> set[str]:
	recipients: set[str] = set()

	if setup.mobile_field:
		mobile_from_doc = _extract_from_doc(doc, setup.mobile_field)
		if mobile_from_doc:
			recipients.add(mobile_from_doc)

	if setup.additional_numbers:
		for row in re.split(r"[,\n;]+", setup.additional_numbers):
			phone = _normalize_phone(row)
			if phone:
				recipients.add(phone)

	for role_row in setup.get("recipient_roles") or []:
		role_name = getattr(role_row, "role", None)
		if role_name:
			recipients.update(_get_role_phone_numbers(role_name))

	return recipients


def _extract_from_doc(doc, fieldname: str) -> str:
	value = doc.get(fieldname) if hasattr(doc, "get") else None
	return _normalize_phone(value)


def _get_role_phone_numbers(role_name: str) -> set[str]:
	numbers: set[str] = set()
	user_rows = frappe.get_all(
		"Has Role",
		filters={"role": role_name, "parenttype": "User"},
		fields=["parent"],
		ignore_permissions=True,
	)
	for row in user_rows:
		user_name = row.parent
		user = frappe.db.get_value(
			"User",
			user_name,
			["enabled", "mobile_no", "phone"],
			as_dict=True,
		)
		if not user or not user.get("enabled"):
			continue
		phone = _normalize_phone(user.get("mobile_no") or user.get("phone"))
		if phone:
			numbers.add(phone)
	return numbers


def _build_template_parameters(setup: DigiWhatsappNotificationSetup, doc) -> str:
	fields_source = (setup.template_parameter_fields or "").strip()
	if not fields_source:
		fields_source = frappe.db.get_value("Digital Whatsapp Template", setup.template, "field_names") or ""

	fields = [x.strip() for x in re.split(r"[,\n;]+", fields_source) if x.strip()]
	values = []
	for fieldname in fields:
		value = doc.get(fieldname) if hasattr(doc, "get") else None
		if isinstance(value, (dict, list)):
			values.append(json.dumps(value))
		elif value is None:
			values.append("")
		else:
			values.append(str(value))
	return ",".join(values)


def _normalize_phone(value) -> str:
	if not value:
		return ""
	text = str(value).strip()
	text = text.replace(" ", "").replace("-", "")
	text = re.sub(r"[^\d+]", "", text)
	if text.startswith("+"):
		text = text[1:]
	if len(text) < 8:
		return ""
	return text


def _update_setup_state(setup: DigiWhatsappNotificationSetup, error_message: str):
	frappe.db.set_value(
		"Digi Whatsapp Notification Setup",
		setup.name,
		{
			"last_run_on": now_datetime(),
			"last_error": (error_message or "")[:1400],
		},
		update_modified=True,
	)


@frappe.whitelist()
def send_test_notification(setup_name: str, reference_name: str, override_phone: str | None = None):
	if not setup_name:
		frappe.throw(_("Notification setup is required"))
	if not reference_name:
		frappe.throw(_("Reference document name is required"))

	setup = frappe.get_doc("Digi Whatsapp Notification Setup", setup_name)
	if not setup.enabled:
		frappe.throw(_("Notification setup is disabled"))
	doc = frappe.get_doc(setup.reference_doctype, reference_name)

	override_numbers = []
	if override_phone:
		phone = _normalize_phone(override_phone)
		if not phone:
			frappe.throw(_("Override phone is invalid"))
		override_numbers = [phone]

	result = _execute_notification(setup, doc, override_numbers=override_numbers)
	return {
		"ok": True,
		"setup": setup.name,
		"doctype": setup.reference_doctype,
		"reference_name": reference_name,
		"sent": result.get("sent", 0),
		"errors": result.get("errors", []),
	}
