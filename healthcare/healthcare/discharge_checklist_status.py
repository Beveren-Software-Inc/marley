# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

"""Discharge checklist completion helpers (finance vs non-finance items)."""

from __future__ import annotations

from frappe.utils import cint

# Template items such as "Billing Finalization" and "Final Financial Check".
FINANCE_CHECKLIST_PATTERNS = (
	"billing finalization",
	"final financial check",
	"final finance check",
)


def is_finance_checklist_item(action_required: str | None) -> bool:
	label = (action_required or "").strip().lower()
	if not label:
		return False
	return any(pattern in label for pattern in FINANCE_CHECKLIST_PATTERNS)


def is_checklist_row_complete(row) -> bool:
	if isinstance(row, dict):
		return cint(row.get("click")) == 1
	return cint(getattr(row, "click", 0)) == 1


def summarize_checklist_status(rows) -> dict:
	"""Return checklist summary for portal list / validation."""
	rows = list(rows or [])
	total = len(rows)
	if not total:
		return {
			"checklist_status": "none",
			"checklist_total": 0,
			"checklist_completed": 0,
			"checklist_incomplete": 0,
		}

	incomplete_rows = [row for row in rows if not is_checklist_row_complete(row)]
	completed = total - len(incomplete_rows)
	incomplete = len(incomplete_rows)

	if incomplete == 0:
		status = "complete"
	elif any(not is_finance_checklist_item(_action_required(row)) for row in incomplete_rows):
		status = "incomplete"
	else:
		status = "finance_pending"

	return {
		"checklist_status": status,
		"checklist_total": total,
		"checklist_completed": completed,
		"checklist_incomplete": incomplete,
	}


def _action_required(row) -> str | None:
	if isinstance(row, dict):
		return row.get("action_required")
	return getattr(row, "action_required", None)


def attach_checklist_status_to_discharges(discharges: list[dict]) -> None:
	if not discharges:
		return

	import frappe

	names = [row["name"] for row in discharges if row.get("name")]
	if not names:
		return

	checklist_rows = frappe.get_all(
		"Discharge Checklist Details",
		filters={"parent": ["in", names], "parenttype": "Discharge"},
		fields=["parent", "action_required", "click"],
	)

	by_parent: dict[str, list] = {}
	for row in checklist_rows:
		by_parent.setdefault(row.parent, []).append(row)

	for discharge in discharges:
		discharge.update(summarize_checklist_status(by_parent.get(discharge.get("name"), [])))
