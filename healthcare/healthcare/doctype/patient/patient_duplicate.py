# Copyright (c) 2026, Healthcare and contributors
"""Detect duplicate Patient records by full name and mobile."""

from __future__ import annotations

import re

import frappe
from frappe import _

_WHITESPACE_RE = re.compile(r"\s+")
_NON_DIGIT_RE = re.compile(r"\D")


def normalize_patient_name(name: str | None) -> str:
	"""Case-insensitive, collapsed whitespace for comparison."""
	if not name:
		return ""
	return _WHITESPACE_RE.sub(" ", str(name).strip()).casefold()


def normalize_mobile(value: str | None) -> str:
	"""Digits-only mobile for comparison (+, spaces, dashes ignored)."""
	if not value:
		return ""
	return _NON_DIGIT_RE.sub("", str(value).strip())


def _contact_digits(mobile: str | None, phone: str | None) -> str:
	return normalize_mobile(mobile) or normalize_mobile(phone)


def find_duplicate_patient(
	patient_name: str | None,
	mobile: str | None = None,
	phone: str | None = None,
	exclude_name: str | None = None,
) -> dict | None:
	"""
	Return an existing Patient when another record has the same full name and
	mobile/contact number (category is not compared — it may change over time).
	"""
	name_key = normalize_patient_name(patient_name)
	mobile_key = _contact_digits(mobile, phone)

	if not name_key or not mobile_key:
		return None

	filters: list = []
	if exclude_name:
		filters.append(["name", "!=", exclude_name])

	# Narrow candidates by trailing digits before normalizing in Python.
	tail = mobile_key[-8:] if len(mobile_key) >= 8 else mobile_key
	or_filters = [
		["mobile", "like", f"%{tail}%"],
		["phone", "like", f"%{tail}%"],
	]

	candidates = frappe.get_all(
		"Patient",
		filters=filters,
		or_filters=or_filters,
		fields=["name", "patient_name", "file_no", "mobile", "phone"],
		limit=0,
	)

	for row in candidates:
		if normalize_patient_name(row.get("patient_name")) != name_key:
			continue
		row_digits = _contact_digits(row.get("mobile"), row.get("phone"))
		if row_digits == mobile_key:
			return row

	return None


def throw_if_duplicate_patient(
	patient_name: str | None,
	mobile: str | None = None,
	phone: str | None = None,
	exclude_name: str | None = None,
) -> None:
	"""Block save/create when a matching patient already exists."""
	dup = find_duplicate_patient(
		patient_name,
		mobile=mobile,
		phone=phone,
		exclude_name=exclude_name,
	)
	if not dup:
		return

	label = (dup.get("patient_name") or dup.get("name") or "").strip()
	file_no = (dup.get("file_no") or dup.get("name") or "").strip()
	frappe.throw(
		_(
			"A patient already exists with the same full name and mobile number: "
			"{0} (File No: {1}). Open that record instead of creating a duplicate."
		).format(label, file_no),
		frappe.DuplicateEntryError,
		title=_("Duplicate patient"),
	)
