# Copyright (c) 2026, healthcare contributors
"""Lab request rules from the Serene BRD.

LAB-029  A patient visit may not be completed without a lab request, unless the
         visit type is exempt (pharmacy pickups, payment-only visits, etc.).
LAB-039  Once a sample has been collected, the lab test may no longer be
         cancelled or deleted. A System Manager can override the block with the
         Force Delete / Force Cancel actions in `healthcare.api.lab_request_actions`,
         which set `force_override_active()` for the duration of the action.
"""

from __future__ import annotations

from contextlib import contextmanager

import frappe
from frappe import _
from frappe.utils import cint

# Set only by verified System Manager force actions (see lab_request_actions.py).
FORCE_OVERRIDE_FLAG = "lab_request_force_sample_override"

# Lab Test statuses that mean a sample already exists in the lab.
SAMPLE_TAKEN_STATUSES = frozenset(
	{
		"Sample Collected",
		"Partial Result Enter",
		"Testing in Progress",
		"Completed",
		"Pending Review",
		"Reviewed",
		"Approved",
	}
)

# Patient Visit statuses at which the lab-request rule is evaluated.
COMPLETING_VISIT_STATUSES = frozenset({"Completed"})


# --------------------------------------------------------------------------- #
# LAB-029
# --------------------------------------------------------------------------- #
def require_lab_request_on_visit_completion() -> bool:
	"""Healthcare Settings: when True, a visit cannot be completed with no lab request."""
	return bool(
		frappe.db.get_single_value(
			"Healthcare Settings",
			"require_lab_request_on_visit_completion",
		)
	)


def _visit_type_is_exempt(visit_type: str | None) -> bool:
	"""Visit types such as Pharmacy or Payment Only never involve a lab request."""
	if not visit_type:
		return True
	return bool(
		frappe.db.get_value("Patient Visit Type", visit_type, "exempt_from_lab_request_rule")
	)


def _visit_has_lab_request(visit_name: str) -> bool:
	if frappe.db.exists("Service Request", {"patient_visit": visit_name, "docstatus": ["<", 2]}):
		return True
	return bool(frappe.db.exists("Lab Test", {"patient_visit": visit_name, "docstatus": ["<", 2]}))


def validate_lab_request_on_visit(doc, method=None) -> None:
	"""Patient Visit `validate` hook - block completion when no lab test was requested."""
	if doc.status not in COMPLETING_VISIT_STATUSES:
		return

	# Only act on the transition into a completing status, so re-saving an
	# already-completed historical visit never blocks.
	if not doc.is_new():
		previous = doc.get_doc_before_save()
		if previous and previous.status == doc.status:
			return

	if not require_lab_request_on_visit_completion():
		return

	if _visit_type_is_exempt(doc.get("visit_type")):
		return

	if _visit_has_lab_request(doc.name):
		return

	frappe.throw(
		_(
			"No laboratory investigation has been requested for this visit. "
			"Raise the required lab request before completing the visit, or mark "
			"visit type {0} as exempt in the Patient Visit Type master."
		).format(frappe.bold(doc.get("visit_type") or "-")),
		title=_("Lab request required"),
	)


# --------------------------------------------------------------------------- #
# LAB-039
# --------------------------------------------------------------------------- #
def _linked_sample_collection_recorded(doc) -> bool:
	"""True when a Sample Collection still linked to the Lab Test is really collected.

	A Sample Collection that was deleted or cancelled (for example through the
	"Cancel Sample Handling" action) is no longer proof that a sample is with the
	lab, so a dangling link must not block the request.
	"""
	for row in doc.get("sample_instances") or []:
		name = (getattr(row, "sample_collection", None) or "").strip()
		if not name:
			continue
		meta = frappe.db.get_value(
			"Sample Collection", name, ["docstatus", "collected_time"], as_dict=True
		)
		if meta and cint(meta.docstatus) != 2 and meta.collected_time:
			return True

	return False


def _sample_already_collected(doc) -> tuple[bool, str]:
	"""Return (blocked, reason) for a Lab Test whose sample is already with the lab."""
	if doc.get("status") in SAMPLE_TAKEN_STATUSES:
		return True, _("its status is {0}").format(frappe.bold(doc.status))

	sample = doc.get("sample")
	if sample and frappe.db.exists("Sample Collection", sample):
		collected = frappe.db.get_value("Sample Collection", sample, "collected_time")
		if collected:
			return True, _("sample collection {0} is already recorded").format(frappe.bold(sample))

	if _linked_sample_collection_recorded(doc):
		return True, _("its sample collection is still recorded")

	# `sample_collected_date` on its own is not proof of a collected sample: undoing
	# sample handling resets the status and `sample_collected` flag but used to leave
	# a stale date behind, which blocked every later delete/cancel forever. Only trust
	# the date while the collected flag (or a submitted, immutable lab test) backs it up.
	if doc.get("sample_collected_date") and (
		cint(doc.get("sample_collected")) or cint(doc.get("docstatus")) == 1
	):
		return True, _("a sample collection date is recorded")

	return False, ""


def force_override_active() -> bool:
	"""True while a verified System Manager force delete / force cancel is running."""
	return bool(frappe.flags.get(FORCE_OVERRIDE_FLAG))


@contextmanager
def allow_sample_collection_override():
	"""Let a verified System Manager force action past the LAB-039 block.

	The flag is only ever set by `healthcare.api.lab_request_actions` after it has
	verified the session user holds the System Manager role, so a normal delete or
	cancel can never lift the guard.
	"""
	previous = frappe.flags.get(FORCE_OVERRIDE_FLAG)
	frappe.flags[FORCE_OVERRIDE_FLAG] = True
	try:
		yield
	finally:
		frappe.flags[FORCE_OVERRIDE_FLAG] = previous


def block_cancel_after_sample_collection(doc, method=None) -> None:
	"""Lab Test `before_cancel` hook."""
	blocked, reason = _sample_already_collected(doc)
	if not blocked or force_override_active():
		return

	frappe.throw(
		_(
			"Lab Test {0} cannot be cancelled because {1}. "
			"Once a sample has been collected the request must be completed or rejected "
			"through result entry so the sample remains auditable. "
			"A System Manager can override this with Force Cancel."
		).format(frappe.bold(doc.name), reason),
		title=_("Sample already collected"),
	)


def block_delete_after_sample_collection(doc, method=None) -> None:
	"""Lab Test `on_trash` hook."""
	blocked, reason = _sample_already_collected(doc)
	if not blocked or force_override_active():
		return

	frappe.throw(
		_(
			"Lab Test {0} cannot be deleted because {1}. "
			"A System Manager can override this with Force Delete."
		).format(frappe.bold(doc.name), reason),
		title=_("Sample already collected"),
	)
