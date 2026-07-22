# Copyright (c) 2026, healthcare contributors
"""DOC-110 - organisational risk register scoring."""

from __future__ import annotations

import frappe
from frappe.utils import cint

# score = likelihood x impact (1-25)
LEVELS = ((4, "Low"), (9, "Medium"), (16, "High"), (25, "Extreme"))


def set_risk_score(doc, method=None) -> None:
	"""Organisational Risk `validate` - compute score and level."""
	likelihood = max(min(cint(doc.get("likelihood")) or 0, 5), 0)
	impact = max(min(cint(doc.get("impact")) or 0, 5), 0)
	doc.likelihood = likelihood
	doc.impact = impact

	score = likelihood * impact
	doc.risk_score = score

	level = ""
	for ceiling, label in LEVELS:
		if score <= ceiling:
			level = label
			break
	doc.risk_level = level or "Extreme"


@frappe.whitelist()
def risk_register_summary(cost_center: str | None = None) -> dict:
	"""Counts by level and status for the QMPS view."""
	filters = {}
	if cost_center:
		filters["cost_center"] = cost_center

	rows = frappe.get_all(
		"Organisational Risk",
		filters=filters,
		fields=["risk_level", "status", "risk_category"],
		limit_page_length=0,
	)

	def tally(key):
		out = {}
		for r in rows:
			out[r.get(key) or "(unset)"] = out.get(r.get(key) or "(unset)", 0) + 1
		return out

	open_high = sum(
		1 for r in rows
		if r.status in ("Open", "Mitigating") and r.risk_level in ("High", "Extreme")
	)
	return {
		"total": len(rows),
		"by_level": tally("risk_level"),
		"by_status": tally("status"),
		"by_category": tally("risk_category"),
		"open_high_or_extreme": open_high,
	}
