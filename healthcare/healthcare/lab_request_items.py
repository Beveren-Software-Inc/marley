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


def _normalize_discount(source: dict[str, Any] | None) -> dict[str, Any]:
	"""Normalize per-test discount fields (Percentage or Amount)."""
	if not source:
		return {"discount_type": "Percentage", "discount_rate": 0.0, "discount": 0.0}
	discount_type = (source.get("discount_type") or "Percentage").strip()
	if discount_type not in ("Percentage", "Amount"):
		discount_type = "Percentage"
	return {
		"discount_type": discount_type,
		"discount_rate": flt(source.get("discount_rate") or 0),
		"discount": flt(source.get("discount") or 0),
	}


def discount_for_template(
	items: list[dict[str, Any]], template: str
) -> dict[str, Any]:
	"""Look up discount config for a concrete lab template from basket JSON."""
	for item in items or []:
		kind = (item.get("kind") or "").strip().lower()
		if kind == "single" and (item.get("template") or "").strip() == template:
			return _normalize_discount(item)
		if kind == "group":
			child_discounts = item.get("child_discounts") or {}
			if isinstance(child_discounts, dict) and template in child_discounts:
				return _normalize_discount(child_discounts.get(template))
	return _normalize_discount(None)


def compute_test_net_amount(
	amount: float,
	discount_type: str = "Percentage",
	discount_rate: float = 0,
	discount: float = 0,
) -> tuple[float, float]:
	"""Return (net_amount, discount_applied) for a single test line."""
	gross = flt(amount)
	discount_type = (discount_type or "Percentage").strip()
	if discount_type == "Amount":
		applied = min(gross, max(0, flt(discount)))
	else:
		applied = gross * max(0, flt(discount_rate)) / 100
	net = max(0, gross - applied)
	return net, applied


def apply_discounts_to_specs(
	specs: list[dict[str, Any]], items: list[dict[str, Any]]
) -> list[dict[str, Any]]:
	"""Attach discount + net_amount to expanded lab test specs."""
	enriched: list[dict[str, Any]] = []
	for spec in specs or []:
		tpl = spec.get("template")
		amount = flt(spec.get("amount") or 0)
		disc = discount_for_template(items, tpl)
		net, applied = compute_test_net_amount(
			amount,
			disc["discount_type"],
			disc["discount_rate"],
			disc["discount"],
		)
		row = dict(spec)
		row.update(disc)
		row["discount_applied"] = applied
		row["net_amount"] = net
		enriched.append(row)
	return enriched


def totals_from_specs(specs: list[dict[str, Any]]) -> dict[str, float]:
	"""Sum gross, net, and discount across expanded specs."""
	gross = sum(flt(s.get("amount") or 0) for s in specs or [])
	net = sum(flt(s.get("net_amount") if s.get("net_amount") is not None else s.get("amount") or 0) for s in specs or [])
	return {
		"cost": gross,
		"grand_total": net,
		"discount_amount": max(0, gross - net),
	}
