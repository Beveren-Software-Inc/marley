# -*- coding: utf-8 -*-
"""Doctor lab result review: structured decisions and turnaround metrics."""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import flt, get_datetime, now_datetime, time_diff_in_hours

REVIEW_REPORT_TYPES = ("Pathology", "Radiology", "Microbiology", "Other")

REVIEW_RESULT_INDICATORS = (
	"Normal",
	"Normal, but unexpected",
	"Satisfactory",
	"Borderline",
	"Abnormal, but expected",
	"Abnormal",
	"Specimen lost / unusable",
	"Not responded to invitation",
	"Positive",
	"Negative",
	"Unknown",
)

REVIEW_FOLLOW_UP_ACTIONS = (
	"Take no action",
	"Make appointment to see doctor",
	"Make appointment to see nurse",
	"Speak to doctor",
	"Speak to nurse",
	"Repeat test",
	"Request notes",
	"Patient to pick up script",
	"Communicate with patient",
	"Other",
)

FOLLOW_UP_CHILD_TABLE = "doctor_review_follow_ups"

LAB_DOCTOR_REVIEW_ROLES = frozenset(
	(
		"LabTest Approver",
		"System Manager",
		"Healthcare Administrator",
		"Administrator",
	)
)


def _ensure_lab_doctor_review_permission():
	roles = set(frappe.get_roles(frappe.session.user))
	if roles & LAB_DOCTOR_REVIEW_ROLES:
		return
	normalized = {r.lower() for r in roles}
	if any(
		"doctor" in r or "physician" in r or "practitioner" in r
		for r in normalized
	):
		return
	frappe.throw(
		_(
			"You do not have permission to review lab test results. "
			"Contact your administrator if you need access."
		),
		frappe.PermissionError,
	)


def ensure_follow_up_action(label: str) -> str:
	"""Create master record if missing; document name equals action label."""
	label = (label or "").strip()
	if not label:
		frappe.throw(_("Follow-up action label is required"))
	if not frappe.db.exists("Lab Review Follow Up Action", label):
		frappe.get_doc(
			{"doctype": "Lab Review Follow Up Action", "action": label}
		).insert(ignore_permissions=True)
	return label


def seed_default_follow_up_actions():
	for label in REVIEW_FOLLOW_UP_ACTIONS:
		ensure_follow_up_action(label)


def get_available_follow_up_actions() -> list[str]:
	"""Active follow-up options for UI (defaults first, then any added in Desk)."""
	seed_default_follow_up_actions()

	from_db = frappe.get_all(
		"Lab Review Follow Up Action",
		filters={"disabled": 0},
		pluck="name",
		order_by="name",
	)

	ordered: list[str] = []
	seen: set[str] = set()
	for label in REVIEW_FOLLOW_UP_ACTIONS:
		if label in from_db and label not in seen:
			ordered.append(label)
			seen.add(label)
	for label in from_db:
		if label not in seen:
			ordered.append(label)
			seen.add(label)
	return ordered


def follow_up_labels_from_doc(doc) -> list[str]:
	rows = getattr(doc, FOLLOW_UP_CHILD_TABLE, None) or []
	labels: list[str] = []
	for row in rows:
		link = row.get("follow_up_action") if isinstance(row, dict) else getattr(
			row, "follow_up_action", None
		)
		if link and link not in labels:
			labels.append(link)
	if labels:
		return labels
	return _parse_follow_up_actions(getattr(doc, "review_follow_up_actions", None))


def _parse_follow_up_actions(raw) -> list[str]:
	if not raw:
		return []
	if isinstance(raw, (list, tuple)):
		items = list(raw)
	else:
		text = str(raw).strip()
		if not text:
			return []
		try:
			parsed = json.loads(text)
			items = parsed if isinstance(parsed, list) else [text]
		except Exception:
			items = [a.strip() for a in text.split(",") if a.strip()]

	valid: list[str] = []
	for item in items:
		label = str(item).strip()
		if not label:
			continue
		if frappe.db.exists("Lab Review Follow Up Action", label):
			if frappe.db.get_value("Lab Review Follow Up Action", label, "disabled"):
				continue
		elif label in REVIEW_FOLLOW_UP_ACTIONS:
			ensure_follow_up_action(label)
		else:
			continue
		if label not in valid:
			valid.append(label)
	return valid


def _set_review_follow_up_rows(doc, follow_ups: list[str]):
	doc.set(FOLLOW_UP_CHILD_TABLE, [])
	for label in follow_ups:
		action_name = ensure_follow_up_action(label)
		doc.append(
			FOLLOW_UP_CHILD_TABLE,
			{"follow_up_action": action_name},
		)


def _results_entered_at(doc):
	stored = getattr(doc, "results_entered_datetime", None)
	if stored:
		return get_datetime(stored)
	if doc.submitted_date:
		return get_datetime(doc.submitted_date)
	return None


def record_results_entered(lab_test_name: str):
	"""Stamp when lab results were submitted for doctor review (idempotent)."""
	if not lab_test_name:
		return
	if frappe.db.get_value("Lab Test", lab_test_name, "results_entered_datetime"):
		return
	now = now_datetime()
	frappe.db.set_value(
		"Lab Test",
		lab_test_name,
		{
			"results_entered_datetime": now,
			"submitted_date": now,
		},
		update_modified=False,
	)


def _turnaround_hours(results_entered, reviewed_at) -> float | None:
	if not results_entered or not reviewed_at:
		return None
	hours = time_diff_in_hours(reviewed_at, results_entered)
	return flt(hours, 3) if hours is not None else None


@frappe.whitelist()
def get_doctor_review_form_options():
	"""Options for the doctor review dialog (frontend)."""
	return {
		"report_types": list(REVIEW_REPORT_TYPES),
		"result_indicators": list(REVIEW_RESULT_INDICATORS),
		"follow_up_actions": get_available_follow_up_actions(),
	}


@frappe.whitelist()
def submit_doctor_lab_test_review(
	lab_test_name: str,
	new_status: str = "Reviewed",
	review_report_type: str | None = None,
	review_result_indicator: str | None = None,
	review_follow_up_actions: str | list | None = None,
	review_follow_up_other: str | None = None,
	review_comments: str | None = None,
	review_prescription_message: str | None = None,
	patient_informed_of_report: int | str | None = None,
	archive_report_on_review: int | str | None = None,
	create_task_on_review: int | str | None = None,
):
	"""Record a structured doctor review and update lab test status."""
	_ensure_lab_doctor_review_permission()

	if not lab_test_name:
		frappe.throw(_("Lab Test name is required"))

	if new_status not in ("Reviewed", "Rejected"):
		frappe.throw(_("Status must be Reviewed or Rejected"))

	if not review_result_indicator:
		frappe.throw(_("Result indicator is required"))

	if review_result_indicator not in REVIEW_RESULT_INDICATORS:
		frappe.throw(_("Invalid result indicator"))

	if review_report_type and review_report_type not in REVIEW_REPORT_TYPES:
		frappe.throw(_("Invalid report type"))

	follow_ups = _parse_follow_up_actions(review_follow_up_actions)
	if "Other" in follow_ups and not (review_follow_up_other or "").strip():
		frappe.throw(_("Please describe the other follow-up action"))

	if new_status == "Reviewed" and not follow_ups:
		frappe.throw(_("Select at least one follow-up action (e.g. Take no action)"))

	doc = frappe.get_doc("Lab Test", lab_test_name)
	if doc.docstatus == 2:
		frappe.throw(_("Cannot review a cancelled Lab Test"))
	if doc.docstatus not in (0, 1):
		frappe.throw(_("This Lab Test cannot be reviewed"))
	if doc.status in ("Reviewed", "Rejected"):
		frappe.throw(_("This lab test has already been reviewed"))
	if doc.docstatus == 0 and doc.status != "Pending Review":
		frappe.throw(
			_("Save lab results first so the test is Pending Review before doctor review.")
		)

	results_entered = _results_entered_at(doc)
	if not results_entered:
		record_results_entered(doc.name)
		results_entered = now_datetime()

	reviewed_at = now_datetime()
	turnaround = _turnaround_hours(results_entered, reviewed_at)

	doc.status = new_status
	doc.reviewed_by = frappe.session.user
	doc.doctor_reviewed_datetime = reviewed_at
	doc.review_turnaround_hours = turnaround
	doc.review_report_type = review_report_type or None
	doc.review_result_indicator = review_result_indicator
	doc.review_follow_up_other = (review_follow_up_other or "").strip() or None
	doc.review_comments = (review_comments or "").strip() or None
	doc.review_prescription_message = (review_prescription_message or "").strip() or None
	doc.patient_informed_of_report = 1 if frappe.utils.cint(patient_informed_of_report) else 0
	doc.archive_report_on_review = 1 if frappe.utils.cint(archive_report_on_review) else 0
	doc.create_task_on_review = 1 if frappe.utils.cint(create_task_on_review) else 0

	if new_status == "Reviewed":
		doc.approved_date = reviewed_at

	_set_review_follow_up_rows(doc, follow_ups)

	doc.flags.ignore_permissions = True
	if doc.docstatus == 0:
		# Submit once with all review fields — do not save() first (read-only
		# datetime fields may not persist on draft save, then submit fails
		# UpdateAfterSubmitError when setting them on submit).
		doc.flags.via_doctor_review = True
		doc.submit()
	else:
		# Already submitted (e.g. legacy flow); allow programmatic review updates.
		doc.flags.ignore_validate_update_after_submit = True
		doc.save()

	if frappe.utils.cint(create_task_on_review):
		_create_review_task(doc, review_result_indicator, follow_ups, review_comments)

	frappe.db.commit()

	return {
		"name": doc.name,
		"status": new_status,
		"reviewed_by": frappe.session.user,
		"doctor_reviewed_datetime": str(reviewed_at),
		"results_entered_datetime": str(results_entered),
		"review_turnaround_hours": turnaround,
		"review_result_indicator": review_result_indicator,
		"review_follow_up_actions": follow_ups,
	}


def _create_review_task(doc, indicator: str, follow_ups: list, comments: str | None):
	subject = _("Lab result review: {0} — {1}").format(doc.lab_test_name or doc.name, indicator)
	description = _("Follow-up: {0}").format(", ".join(follow_ups) if follow_ups else "—")
	if comments:
		description += f"\n\n{comments}"
	try:
		task = frappe.get_doc(
			{
				"doctype": "Task",
				"subject": subject,
				"description": description,
				"priority": "Medium",
				"status": "Open",
			}
		)
		task.insert(ignore_permissions=True)
	except Exception:
		frappe.log_error(title=_("Lab review task creation failed"))


@frappe.whitelist()
def get_lab_review_turnaround_metrics(
	from_date: str | None = None,
	to_date: str | None = None,
	company: str | None = None,
	cost_center: str | None = None,
):
	"""Aggregate review turnaround for management dashboards (hours)."""
	_ensure_lab_doctor_review_permission()

	conditions = ["docstatus = 1", "status = 'Reviewed'", "review_turnaround_hours IS NOT NULL"]
	params: dict = {}

	if from_date:
		conditions.append("DATE(doctor_reviewed_datetime) >= %(from_date)s")
		params["from_date"] = from_date
	if to_date:
		conditions.append("DATE(doctor_reviewed_datetime) <= %(to_date)s")
		params["to_date"] = to_date
	if company:
		conditions.append("company = %(company)s")
		params["company"] = company
	if cost_center:
		conditions.append("cost_center = %(cost_center)s")
		params["cost_center"] = cost_center

	where_sql = " AND ".join(conditions)

	rows = frappe.db.sql(
		f"""
		SELECT
			COUNT(*) AS reviewed_count,
			AVG(review_turnaround_hours) AS avg_hours,
			MIN(review_turnaround_hours) AS min_hours,
			MAX(review_turnaround_hours) AS max_hours
		FROM `tabLab Test`
		WHERE {where_sql}
		""",
		params,
		as_dict=True,
	)

	pending = frappe.db.sql(
		f"""
		SELECT COUNT(*) AS pending_count
		FROM `tabLab Test`
		WHERE docstatus = 1
			AND status IN ('Pending Review', 'Submitted', 'Completed')
			{" AND company = %(company)s" if company else ""}
			{" AND cost_center = %(cost_center)s" if cost_center else ""}
		""",
		params,
		as_dict=True,
	)

	summary = rows[0] if rows else {}
	return {
		"reviewed_count": summary.get("reviewed_count") or 0,
		"pending_review_count": (pending[0].pending_count if pending else 0) or 0,
		"avg_turnaround_hours": flt(summary.get("avg_hours"), 2),
		"min_turnaround_hours": flt(summary.get("min_hours"), 2),
		"max_turnaround_hours": flt(summary.get("max_hours"), 2),
	}
