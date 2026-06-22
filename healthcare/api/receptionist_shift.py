# -*- coding: utf-8 -*-
# Copyright (c) 2026, Healthcare and contributors
# Receptionist shift open/close APIs for the reception portal (POS-style).

import json

import frappe
from frappe import _
from frappe.utils import now_datetime


def _parse_payload(data=None):
	if data is None:
		data = frappe.local.form_dict.get("data") or frappe.local.form_dict
	if isinstance(data, str):
		data = json.loads(data)
	return data or {}


def _get_shift_settings():
	if not frappe.db.exists("DocType", "Receptionist Shift Settings"):
		return {"enable_shift": 0, "receptionists": []}
	settings = frappe.get_single("Receptionist Shift Settings")
	return {
		"enable_shift": int(settings.enable_shift or 0),
		"receptionists": [
			row.user
			for row in settings.receptionists
			if row.user and int(row.enabled or 0)
		],
	}


SHIFT_LINK_FIELD = "custom_receptionist_shift"


def get_open_receptionist_shift_name(user=None):
	"""Return the current user's open Receptionist Shift name, if any."""
	open_shift = _open_shift_for_user(user)
	return open_shift.get("name") if open_shift else None


def stamp_receptionist_shift_on_doc(doc, user=None):
	"""Set custom_receptionist_shift when the user has an open shift."""
	shift_name = get_open_receptionist_shift_name(user)
	if not shift_name:
		return None
	if doc.meta.has_field(SHIFT_LINK_FIELD):
		doc.set(SHIFT_LINK_FIELD, shift_name)
	return shift_name


def resolve_receptionist_shift_filter(receptionist_shift=None, filter_by_open_shift=False):
	"""Resolve list filter for billing: explicit shift name or current open shift."""
	shift = (receptionist_shift or "").strip()
	if shift:
		return shift
	if int(filter_by_open_shift or 0):
		return get_open_receptionist_shift_name() or ""
	return None


def _user_uses_shift(user=None):
	"""True when shift is enabled and the user is listed in Receptionist Shift Settings."""
	user = user or frappe.session.user
	if user == "Guest":
		return False

	settings = _get_shift_settings()
	if not settings["enable_shift"]:
		return False

	receptionists = {row.lower() for row in settings["receptionists"] if row}
	if not receptionists:
		return False

	if user.lower() in receptionists:
		return True

	user_email = frappe.db.get_value("User", user, "email")
	return bool(user_email and user_email.lower() in receptionists)


def _user_cost_center(user=None):
	user = user or frappe.session.user
	rows = frappe.get_all(
		"User Permission",
		filters={"user": user, "allow": "Cost Center"},
		fields=["for_value"],
		limit=1,
	)
	return rows[0].for_value if rows else ""


def _default_company(user=None):
	user = user or frappe.session.user
	company = frappe.defaults.get_user_default("Company", user)
	if company:
		return company
	return frappe.db.get_single_value("Global Defaults", "default_company")


def _serialize_shift(doc):
	data = doc.as_dict()
	return {
		"name": data.get("name"),
		"status": data.get("status"),
		"user": data.get("user"),
		"user_full_name": data.get("user_full_name"),
		"company": data.get("company"),
		"cost_center": data.get("cost_center"),
		"opened_at": data.get("opened_at"),
		"closed_at": data.get("closed_at"),
		"opening_notes": data.get("opening_notes"),
		"closing_notes": data.get("closing_notes"),
	}


def _open_shift_for_user(user=None):
	user = user or frappe.session.user
	return frappe.db.get_value(
		"Receptionist Shift",
		{"user": user, "status": "Open"},
		[
			"name",
			"status",
			"user",
			"user_full_name",
			"company",
			"cost_center",
			"opened_at",
			"closed_at",
			"opening_notes",
			"closing_notes",
		],
		as_dict=True,
	)


@frappe.whitelist()
def get_receptionist_shift_context():
	"""Return whether shift is required for this user and their current open shift, if any."""
	user = frappe.session.user
	settings = _get_shift_settings()
	shift_required = _user_uses_shift(user)
	open_shift = _open_shift_for_user(user) if shift_required else None

	return {
		"enabled": bool(settings["enable_shift"]),
		"shift_required": shift_required,
		"open_shift": open_shift,
		"company": _default_company(user),
		"cost_center": _user_cost_center(user),
	}


@frappe.whitelist()
def open_receptionist_shift(data=None):
	"""Create an Open receptionist shift for the current user."""
	user = frappe.session.user
	if not _user_uses_shift(user):
		frappe.throw(_("Receptionist shift is not enabled for your user."))

	existing = _open_shift_for_user(user)
	if existing:
		frappe.throw(
			_("You already have an open shift ({0}). Close it before opening a new one.").format(
				existing.get("name")
			)
		)

	payload = _parse_payload(data)
	company = payload.get("company") or _default_company(user)
	if not company:
		frappe.throw(_("No default company found for user {0}").format(user))

	doc = frappe.get_doc(
		{
			"doctype": "Receptionist Shift",
			"status": "Open",
			"user": user,
			"company": company,
			"cost_center": payload.get("cost_center") or _user_cost_center(user),
			"opened_at": now_datetime(),
			"opening_notes": payload.get("opening_notes") or "",
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()

	return _serialize_shift(doc)


@frappe.whitelist()
def close_receptionist_shift(name=None, data=None):
	"""Close an open receptionist shift and set closed_at."""
	user = frappe.session.user
	if not name:
		payload = _parse_payload(data)
		name = payload.get("name")
	if not name:
		open_shift = _open_shift_for_user(user)
		name = open_shift.get("name") if open_shift else None
	if not name:
		frappe.throw(_("No open receptionist shift found to close."))

	doc = frappe.get_doc("Receptionist Shift", name)
	if doc.user != user and not frappe.has_permission("Receptionist Shift", "write", doc=doc):
		frappe.throw(_("You cannot close this shift."), frappe.PermissionError)

	payload = _parse_payload(data)
	doc.close_shift(closing_notes=payload.get("closing_notes"))
	frappe.db.commit()

	return _serialize_shift(doc)
