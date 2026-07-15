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
	dob: str | None = None,
) -> dict | None:
	"""
	Return an existing Patient when another record has the same full name and either the
	same mobile/contact number OR the same date of birth (REG-08). Category is not compared.
	"""
	name_key = normalize_patient_name(patient_name)
	mobile_key = _contact_digits(mobile, phone)
	dob_key = str(dob).strip() if dob else None

	# Need the name plus at least one of mobile / DOB to make a meaningful match.
	if not name_key or (not mobile_key and not dob_key):
		return None

	filters: list = []
	if exclude_name:
		filters.append(["name", "!=", exclude_name])

	or_filters: list = []
	if mobile_key:
		# Narrow candidates by trailing digits before normalizing in Python.
		tail = mobile_key[-8:] if len(mobile_key) >= 8 else mobile_key
		or_filters.append(["mobile", "like", f"%{tail}%"])
		or_filters.append(["phone", "like", f"%{tail}%"])
	if dob_key:
		or_filters.append(["dob", "=", dob_key])

	candidates = frappe.get_all(
		"Patient",
		filters=filters,
		or_filters=or_filters,
		fields=["name", "patient_name", "file_no", "mobile", "phone", "dob"],
		limit=0,
	)

	for row in candidates:
		if normalize_patient_name(row.get("patient_name")) != name_key:
			continue
		row_digits = _contact_digits(row.get("mobile"), row.get("phone"))
		if mobile_key and row_digits == mobile_key:
			return row
		if dob_key and str(row.get("dob") or "").strip() == dob_key:
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
