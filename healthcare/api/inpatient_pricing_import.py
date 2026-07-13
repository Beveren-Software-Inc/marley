# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt
"""
Import inpatient pricing structure from the May 2026 pricing Word doc
(or apply the documented default matrix).

Creates / updates:
- Healthcare Service Unit Type (room types) with room_multiplier
- Inpatient Package (programs) with base rate / base total for Triple Sharing
"""

from __future__ import annotations

import re
import zipfile
import xml.etree.ElementTree as ET
from io import BytesIO
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, flt, get_files_path


# Documented defaults — Inpatient Pricing Structure (Jau + Juffair, May 2026)
DEFAULT_ROOM_TYPES = [
	{"name": "Triple Sharing", "multiplier": 1.0, "notes": "Base reference room"},
	{"name": "Double Sharing", "multiplier": 1.1, "notes": "Baseline of the Juffair Branch"},
	{"name": "Private Room", "multiplier": 1.4, "notes": ""},
	{"name": "Royal Suite", "multiplier": 1.5, "notes": "Premium accommodation"},
]

DEFAULT_PROGRAMS = [
	{
		"name": "Daily (default)",
		"days": 1,
		"rate_per_day": 150.0,
		"base_total": 150.0,
		"is_daily_default": 1,
	},
	{
		"name": "Acute Intervention Program",
		"days": 7,
		"rate_per_day": 109.0,
		"base_total": 763.0,
		"is_daily_default": 0,
	},
	{
		"name": "Crisis Stabilisation Program",
		"days": 30,
		"rate_per_day": 79.0,
		"base_total": 2370.0,
		"is_daily_default": 0,
	},
	{
		"name": "Recovery Program",
		"days": 90,
		"rate_per_day": 70.0,
		"base_total": 6300.0,
		"is_daily_default": 0,
	},
	{
		"name": "Relapse Prevention Program",
		"days": 180,
		"rate_per_day": 61.0,
		"base_total": 10980.0,
		"is_daily_default": 0,
	},
	{
		"name": "Extended Relapse Prevention Program",
		"days": 365,
		"rate_per_day": 43.0,
		"base_total": 15695.0,
		"is_daily_default": 0,
	},
]

_W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _resolve_file_path(file_url: str) -> str:
	file_url = (file_url or "").strip()
	if not file_url:
		frappe.throw(_("File URL is required"))

	name = frappe.db.get_value("File", {"file_url": file_url}, "name")
	if name:
		file_doc = frappe.get_doc("File", name)
		path = file_doc.get_full_path()
		if path:
			return path

	# Fallback for public/private paths
	if file_url.startswith("/files/"):
		return get_files_path(file_url.replace("/files/", ""), is_private=False)
	if file_url.startswith("/private/files/"):
		return get_files_path(file_url.replace("/private/files/", ""), is_private=True)
	frappe.throw(_("Could not resolve file path for {0}").format(file_url))


def _extract_docx_lines(file_path: str) -> list[str]:
	with open(file_path, "rb") as fh:
		data = fh.read()
	with zipfile.ZipFile(BytesIO(data)) as zf:
		xml = zf.read("word/document.xml")
	root = ET.fromstring(xml)
	lines: list[str] = []
	for p in root.iter(f"{_W_NS}p"):
		runs: list[str] = []
		for t in p.iter(f"{_W_NS}t"):
			if t.text:
				runs.append(t.text)
			if t.tail:
				runs.append(t.tail)
		line = "".join(runs).strip()
		if line:
			lines.append(line)
	return lines


def _parse_room_types(lines: list[str]) -> list[dict[str, Any]]:
	canonical = {
		"triple sharing": ("Triple Sharing", 1.0),
		"double sharing": ("Double Sharing", 1.1),
		"private room": ("Private Room", 1.4),
		"royal suite": ("Royal Suite", 1.5),
		"deluxe": ("Royal Suite", 1.5),
	}
	found: dict[str, float] = {}
	pat = re.compile(
		r"(Triple Sharing|Double Sharing|Private Room|Royal Suite|Deluxe)\s*[×xX*]?\s*([\d.]+)?",
		re.I,
	)
	for line in lines:
		for m in pat.finditer(line):
			raw = m.group(1).strip().lower()
			canon_name, default_mult = canonical.get(raw, (m.group(1).strip(), 1.0))
			mult = m.group(2)
			found[canon_name] = flt(mult) if mult else default_mult
	if not found:
		return list(DEFAULT_ROOM_TYPES)
	order = ["Triple Sharing", "Double Sharing", "Private Room", "Royal Suite"]
	out = []
	for name in order:
		if name in found:
			out.append({"name": name, "multiplier": found[name], "notes": ""})
	for name, mult in found.items():
		if name not in {r["name"] for r in out}:
			out.append({"name": name, "multiplier": mult, "notes": ""})
	return out


def _parse_programs(lines: list[str]) -> list[dict[str, Any]]:
	"""Try to recover program rows; fall back to defaults."""
	patterns = [
		(
			r"Daily\s*\(default\)\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)",
			"Daily (default)",
			1,
		),
		(
			r"Acute Intervention Program\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)",
			"Acute Intervention Program",
			0,
		),
		(
			r"Crisis Stabilisation Program\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)",
			"Crisis Stabilisation Program",
			0,
		),
		(
			r"Recovery Program\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)",
			"Recovery Program",
			0,
		),
		(
			r"Relapse Prevention Program\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)",
			"Relapse Prevention Program",
			0,
		),
		(
			r"Extended Relapse Prevention Program\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)",
			"Extended Relapse Prevention Program",
			0,
		),
	]
	text = "\n".join(lines)
	parsed: list[dict[str, Any]] = []
	for pat, name, is_daily in patterns:
		m = re.search(pat, text, re.I)
		if not m:
			continue
		days = cint(m.group(1))
		rate = flt(m.group(2).replace(",", ""))
		total = flt(m.group(3).replace(",", ""))
		parsed.append(
			{
				"name": name,
				"days": days,
				"rate_per_day": rate,
				"base_total": total,
				"is_daily_default": is_daily,
			}
		)
	return parsed if len(parsed) >= 3 else list(DEFAULT_PROGRAMS)


def _default_company(company: str | None = None) -> str:
	company = (company or "").strip()
	if company and frappe.db.exists("Company", company):
		return company
	company = frappe.defaults.get_user_default("Company")
	if company:
		return company
	companies = frappe.get_all("Company", pluck="name", limit=1)
	if companies:
		return companies[0]
	frappe.throw(_("Please set a default Company before importing inpatient packages."))


def _load_structure_from_file(file_url: str | None) -> dict[str, Any]:
	if not file_url:
		return {
			"room_types": list(DEFAULT_ROOM_TYPES),
			"programs": list(DEFAULT_PROGRAMS),
			"source": "defaults",
		}
	path = _resolve_file_path(file_url)
	if not path.lower().endswith(".docx"):
		# Non-docx uploads still apply documented defaults
		return {
			"room_types": list(DEFAULT_ROOM_TYPES),
			"programs": list(DEFAULT_PROGRAMS),
			"source": "defaults_non_docx",
			"file_url": file_url,
		}
	lines = _extract_docx_lines(path)
	return {
		"room_types": _parse_room_types(lines),
		"programs": _parse_programs(lines),
		"source": "docx",
		"file_url": file_url,
		"line_count": len(lines),
	}


@frappe.whitelist()
def preview_inpatient_pricing_import(file_url: str | None = None, company: str | None = None):
	"""Preview room types + programs that will be created/updated."""
	structure = _load_structure_from_file(file_url)
	company = _default_company(company)

	room_existing = 0
	for room in structure["room_types"]:
		if frappe.db.exists("Healthcare Service Unit Type", room["name"]):
			room_existing += 1

	pkg_existing = 0
	for prog in structure["programs"]:
		if frappe.db.exists("Inpatient Package", prog["name"]):
			pkg_existing += 1

	return {
		"company": company,
		"source": structure.get("source"),
		"room_types": structure["room_types"],
		"programs": structure["programs"],
		"room_types_count": len(structure["room_types"]),
		"programs_count": len(structure["programs"]),
		"existing_service_unit_types": room_existing,
		"existing_packages": pkg_existing,
		"new_service_unit_types": len(structure["room_types"]) - room_existing,
		"new_packages": len(structure["programs"]) - pkg_existing,
	}


def _upsert_service_unit_type(name: str, multiplier: float, notes: str = "") -> str:
	exists = frappe.db.exists("Healthcare Service Unit Type", name)
	if exists:
		doc = frappe.get_doc("Healthcare Service Unit Type", name)
		doc.inpatient_occupancy = 1
		doc.allow_appointments = 0
		if frappe.db.has_column("Healthcare Service Unit Type", "room_multiplier"):
			doc.room_multiplier = flt(multiplier)
		if notes and not doc.description:
			doc.description = notes
		doc.disabled = 0
		doc.save(ignore_permissions=True)
		return "updated"

	payload = {
		"doctype": "Healthcare Service Unit Type",
		"service_unit_type": name,
		"inpatient_occupancy": 1,
		"allow_appointments": 0,
		"disabled": 0,
		"description": notes or None,
	}
	if frappe.db.has_column("Healthcare Service Unit Type", "room_multiplier"):
		payload["room_multiplier"] = flt(multiplier)
	frappe.get_doc(payload).insert(ignore_permissions=True)
	return "created"


def _upsert_package(prog: dict[str, Any], company: str) -> str:
	name = prog["name"]
	days = cint(prog.get("days") or 0)
	rate = flt(prog.get("rate_per_day") or 0)
	base_total = flt(prog.get("base_total") or 0) or (rate * days if days else 0)
	is_daily = cint(prog.get("is_daily_default") or 0)

	if frappe.db.exists("Inpatient Package", name):
		doc = frappe.get_doc("Inpatient Package", name)
		doc.company = company
		doc.package_rate = rate
		doc.no_of_days = days
		doc.active = 1
		if frappe.db.has_column("Inpatient Package", "base_total"):
			doc.base_total = base_total
		if frappe.db.has_column("Inpatient Package", "is_daily_default"):
			doc.is_daily_default = is_daily
		doc.save(ignore_permissions=True)
		return "updated"

	payload = {
		"doctype": "Inpatient Package",
		"company": company,
		"package_name": name,
		"package_rate": rate,
		"no_of_days": days,
		"active": 1,
	}
	if frappe.db.has_column("Inpatient Package", "base_total"):
		payload["base_total"] = base_total
	if frappe.db.has_column("Inpatient Package", "is_daily_default"):
		payload["is_daily_default"] = is_daily
	frappe.get_doc(payload).insert(ignore_permissions=True)
	return "created"


@frappe.whitelist()
def import_inpatient_pricing_structure(file_url: str | None = None, company: str | None = None):
	"""
	Create/update Service Unit Types (room multipliers) and Inpatient Packages (programs)
	from the uploaded pricing docx, or from documented May 2026 defaults.
	"""
	structure = _load_structure_from_file(file_url)
	company = _default_company(company)

	result = {
		"company": company,
		"source": structure.get("source"),
		"room_types_created": 0,
		"room_types_updated": 0,
		"packages_created": 0,
		"packages_updated": 0,
		"errors": 0,
		"error_messages": [],
		"room_types": [],
		"packages": [],
	}

	for room in structure["room_types"]:
		try:
			action = _upsert_service_unit_type(
				room["name"], flt(room["multiplier"]), room.get("notes") or ""
			)
			if action == "created":
				result["room_types_created"] += 1
			else:
				result["room_types_updated"] += 1
			result["room_types"].append(
				{"name": room["name"], "multiplier": room["multiplier"], "action": action}
			)
		except Exception as exc:
			result["errors"] += 1
			result["error_messages"].append(f"{room['name']}: {exc}")
			frappe.log_error(title=f"Inpatient pricing room type failed: {room['name']}")

	for prog in structure["programs"]:
		try:
			action = _upsert_package(prog, company)
			if action == "created":
				result["packages_created"] += 1
			else:
				result["packages_updated"] += 1
			result["packages"].append(
				{
					"name": prog["name"],
					"days": prog["days"],
					"base_total": prog["base_total"],
					"action": action,
				}
			)
		except Exception as exc:
			result["errors"] += 1
			result["error_messages"].append(f"{prog['name']}: {exc}")
			frappe.log_error(title=f"Inpatient pricing package failed: {prog['name']}")

	frappe.db.commit()
	return result
