# Copyright (c) 2026, Healthcare and contributors
"""Multi lab-test lines on a single Service Request (singles + groups)."""

from __future__ import annotations

import json
from typing import Any

import frappe
from frappe import _
from frappe.utils import flt


def _get_patient_category_multiplier(patient: str) -> tuple[float, str | None]:
	from healthcare.healthcare.doctype.service_request.service_request import (
		_get_patient_category_multiplier as _sr_multiplier,
	)

	return _sr_multiplier(patient)


def _get_lab_template_base_rate(template_dn: str, patient_care_type: str | None = None) -> float:
	from healthcare.healthcare.doctype.service_request.service_request import (
		_get_lab_template_base_rate as _sr_rate,
	)

	return _sr_rate(template_dn, patient_care_type)


def parse_lab_request_items(doc) -> list[dict[str, Any]]:
	"""Normalize lab lines from ``lab_request_items`` JSON or legacy single/group fields."""
	raw = getattr(doc, "lab_request_items", None) or ""
	if raw and str(raw).strip():
		try:
			parsed = json.loads(raw)
			if isinstance(parsed, list) and parsed:
				return [item for item in parsed if isinstance(item, dict)]
		except Exception:
			pass

	if getattr(doc, "template_dt", None) != "Lab Test Template":
		return []

	template_dn = (getattr(doc, "template_dn", None) or "").strip()
	if not template_dn:
		return []

	is_group = frappe.db.get_value("Lab Test Template", template_dn, "is_group")
	if is_group:
		children: list[str] = []
		if getattr(doc, "selected_group_templates", None):
			try:
				children = json.loads(doc.selected_group_templates)
			except Exception:
				children = []
		if not isinstance(children, list):
			children = []
		children = [t for t in children if t]
		return [{"kind": "group", "parent": template_dn, "children": children}]

	return [{"kind": "single", "template": template_dn}]


def expand_lab_test_specs(
	items: list[dict[str, Any]],
	patient: str,
	patient_care_type: str | None = None,
) -> list[dict[str, Any]]:
	"""Expand basket lines into concrete lab tests to create."""
	multiplier, _ = _get_patient_category_multiplier(patient)
	specs: list[dict[str, Any]] = []
	seen_templates: set[str] = set()

	for item in items or []:
		kind = (item.get("kind") or "").strip().lower()
		if kind == "single":
			tpl = (item.get("template") or "").strip()
			if not tpl or tpl in seen_templates:
				continue
			seen_templates.add(tpl)
			base_rate = _get_lab_template_base_rate(tpl, patient_care_type)
			specs.append(
				{
					"template": tpl,
					"amount": flt(base_rate) * flt(multiplier),
					"parent_group": None,
				}
			)
			continue

		if kind == "group":
			parent = (item.get("parent") or "").strip()
			if not parent:
				continue
			children = item.get("children") or []
			if not isinstance(children, list):
				children = []
			children = [t for t in children if t]

			filters: dict[str, Any] = {"lab_group": parent, "disabled": 0}
			if children:
				filters["name"] = ["in", children]

			child_rows = frappe.get_all(
				"Lab Test Template",
				filters=filters,
				fields=["name"],
				order_by="lab_test_name asc",
				ignore_permissions=True,
			)
			for child in child_rows:
				tpl = child.name
				if not tpl or tpl in seen_templates:
					continue
				seen_templates.add(tpl)
				base_rate = _get_lab_template_base_rate(tpl, patient_care_type)
				specs.append(
					{
						"template": tpl,
						"amount": flt(base_rate) * flt(multiplier),
						"parent_group": parent,
					}
				)

	return specs


def lab_request_items_summary(items: list[dict[str, Any]]) -> str:
	"""Human-readable summary for list views."""
	labels: list[str] = []
	for item in items or []:
		kind = (item.get("kind") or "").strip().lower()
		if kind == "single":
			tpl = item.get("template")
			if tpl:
				labels.append(
					frappe.db.get_value("Lab Test Template", tpl, "lab_test_name") or tpl
				)
		elif kind == "group":
			parent = item.get("parent")
			if parent:
				name = frappe.db.get_value("Lab Test Template", parent, "lab_test_name") or parent
				child_count = len(item.get("children") or [])
				labels.append(f"{name} ({child_count} tests)" if child_count else name)
	if not labels:
		return ""
	if len(labels) <= 3:
		return ", ".join(labels)
	return f"{', '.join(labels[:2])} + {len(labels) - 2} more"


def primary_template_dn_for_items(items: list[dict[str, Any]]) -> str:
	"""Legacy ``template_dn`` for Service Request row (first line)."""
	if not items:
		return ""
	first = items[0]
	if first.get("kind") == "single":
		return (first.get("template") or "").strip()
	if first.get("kind") == "group":
		return (first.get("parent") or "").strip()
	return ""
