# -*- coding: utf-8 -*-
# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

"""Convert past ECT requests into ECT Services (Healthcare Settings → ECT Conversion).

A ``Patient Visit`` whose *Patient Visit Type* is flagged ``Is ECT Request`` gets its
ECT Service Request + ECT Service on insert (see ``healthcare.api.patient_visit_ect``).
Visits created before that feature existed, or created while no default ECT service
was configured, have no ECT Service.

This module lets an administrator pick an **encounter-date range** and then walks the
ECT-request visits in it, raising for each visit exactly what the live path raises:

1. a draft ``Service Request`` for the default ECT service from Healthcare Settings
   (``default_ect_op_service`` for OP visits, ``default_ect_ip_service`` for visits
   linked to an Inpatient Admission), and
2. the ECT Service (``IP Service``) built from that request.

Visits that already have an ECT Service are left alone, so the conversion is safe to
re-run and safe to run over a range that also contains live visits. Each converted ECT
Service is dated with its visit's **encounter date** — the day the patient was seen —
not with the day the conversion runs. The work runs in the background in small batches
and reports progress through the shared migration job status
(``healthcare.api.data_migration_jobs.get_migration_job_status``).
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint, getdate

from healthcare.api.data_migration_jobs import (
	_acquire_lock,
	_job_progress_key,
	_release_lock,
	_renew_lock,
	_request_stop,
	_require_admin,
	_set_job_date_range,
	_set_progress,
	_stop_requested,
)
from healthcare.api.patient_visit_ect import (
	_appointment_practitioner,
	create_ect_service_for_visit,
	get_default_ect_service,
	get_ect_patient_care_type,
)

JOB = "ect_conversion"

# Visits per batch. Each visit inserts a Service Request plus an IP Service, so the
# batch stays small enough for the progress counters to stay meaningful.
ECT_CONVERSION_BATCH_SIZE = 25

# Outcome counters carried in the job progress and shown by the settings form.
_COUNTERS = (
	"created",
	"skipped_existing",
	"skipped_no_patient",
	"skipped_no_default_service",
	"skipped_no_practitioner",
	"failed",
	"errors",
)

_MAX_SAMPLE_NAMES = 5

# ECT-request visits with an encounter date inside the range. Cancelled visits and
# cancelled documents are historical only and must never be billed again.
_CANDIDATE_WHERE = """
	v.docstatus != 2
	AND IFNULL(v.status, '') != 'Cancelled'
	AND t.is_ect_request = 1
	AND v.encounter_date BETWEEN %(from_date)s AND %(to_date)s
"""


def _validate_range(from_date, to_date):
	"""Return the validated (from_date, to_date) pair or throw."""
	if not from_date or not to_date:
		frappe.throw(_("From Date and To Date are required"))
	from_date = getdate(from_date)
	to_date = getdate(to_date)
	if from_date > to_date:
		frappe.throw(_("From Date must be on or before To Date"))
	return from_date, to_date


def _candidate_visit_names(from_date, to_date, limit, offset):
	"""ECT-request visits in the range, oldest first."""
	return frappe.db.sql(
		f"""
		SELECT v.name
		FROM `tabPatient Visit` v
		INNER JOIN `tabPatient Visit Type` t ON t.name = v.visit_type
		WHERE {_CANDIDATE_WHERE}
		ORDER BY v.encounter_date, v.name
		LIMIT %(limit)s OFFSET %(offset)s
		""",
		{
			"from_date": from_date,
			"to_date": to_date,
			"limit": cint(limit),
			"offset": cint(offset),
		},
		pluck=True,
	)


def _empty_counters():
	return {key: 0 for key in _COUNTERS} | {"samples": []}


def _counters_from_progress(progress):
	"""Counters carried from the previous batch of the same job."""
	counters = _empty_counters()
	for key in _COUNTERS:
		counters[key] = cint(progress.get(key))
	counters["samples"] = list(progress.get("samples") or [])[:_MAX_SAMPLE_NAMES]
	return counters


def _counters_payload(counters):
	payload = {key: cint(counters.get(key)) for key in _COUNTERS}
	samples = [name for name in counters.get("samples") or [] if name]
	if samples:
		payload["samples"] = samples[:_MAX_SAMPLE_NAMES]
	return payload


def _add_sample(counters, visit_name):
	"""Remember the first few visits that need attention, for the summary message."""
	samples = counters.setdefault("samples", [])
	if visit_name and len(samples) < _MAX_SAMPLE_NAMES:
		samples.append(visit_name)


def _skip_reason(visit):
	"""Why this visit cannot be converted — mirrors the live after_insert guards.

	``patient_visit_ect.create_ect_service_for_visit`` cannot raise a Service Request
	without a default ECT service or a practitioner, so those visits are reported as
	skips (with their own counter) instead of being counted as failures.
	"""
	if not (visit.get("patient") or "").strip():
		return "skipped_no_patient"
	if not get_default_ect_service(get_ect_patient_care_type(visit)):
		return "skipped_no_default_service"
	if not (visit.get("practitioner") or "").strip() and not _appointment_practitioner(visit):
		return "skipped_no_practitioner"
	return None


def _convert_visit(visit_name, counters):
	"""Raise the ECT Service Request + ECT Service for one visit, counting the outcome."""
	if frappe.db.exists("IP Service", {"patient_visit": visit_name, "docstatus": ["!=", 2]}):
		counters["skipped_existing"] += 1
		return

	visit = frappe.get_doc("Patient Visit", visit_name)
	blocker = _skip_reason(visit)
	if blocker:
		counters[blocker] += 1
		_add_sample(counters, visit_name)
		return

	try:
		service_request = create_ect_service_for_visit(visit)
		frappe.db.commit()
	except Exception:
		frappe.db.rollback()
		counters["errors"] += 1
		_add_sample(counters, visit_name)
		frappe.log_error(
			title=f"ECT Conversion failed for Patient Visit {visit_name}",
			message=frappe.get_traceback(),
		)
		return

	if service_request and frappe.db.exists(
		"IP Service", {"service_request": service_request, "docstatus": ["!=", 2]}
	):
		counters["created"] += 1
		return

	# A request without an ECT Service — no cost center, no pricing on the template,
	# missing item … The exact reason is in the Error Log entry raised while converting.
	counters["failed"] += 1
	_add_sample(counters, visit_name)


def _finalize(job, processed, payload, *, stopped):
	"""Mark the run done (or stopped) and release its lock.

	The lock is released *before* the final progress payload is written: releasing it
	flushes the site cache namespace (``frappe.db.set_global`` → ``clear_cache``), which
	would otherwise erase the counters the settings form reads when it polls for the
	job summary.
	"""
	processed = cint(processed)
	final = {
		"from_date": payload.get("from_date"),
		"to_date": payload.get("to_date"),
		"candidates": payload.get("candidates"),
		"samples": list(payload.get("samples") or [])[:_MAX_SAMPLE_NAMES],
		**{key: cint(payload.get(key)) for key in _COUNTERS},
	}

	_release_lock(job)
	_set_progress(job, processed, done=True, stopped=stopped, **final)
	frappe.db.commit()

	frappe.log_error(
		title="ECT Conversion stopped" if stopped else "ECT Conversion complete",
		message=frappe.as_json({"processed": processed, "done": True, **final}),
	)


@frappe.whitelist()
def preview_ect_conversion(from_date=None, to_date=None) -> dict:
	"""Count the ECT-request visits in an encounter-date range and their ECT state."""
	_require_admin()
	from_date, to_date = _validate_range(from_date, to_date)

	row = frappe.db.sql(
		f"""
		SELECT
			COUNT(*) AS visits,
			SUM(IFNULL(v.inpatient_record, '') != '') AS ip_visits,
			SUM(IFNULL(v.practitioner, '') = '') AS without_practitioner,
			SUM(EXISTS(
				SELECT 1 FROM `tabIP Service` s
				WHERE s.patient_visit = v.name AND s.docstatus != 2
			)) AS already_converted
		FROM `tabPatient Visit` v
		INNER JOIN `tabPatient Visit Type` t ON t.name = v.visit_type
		WHERE {_CANDIDATE_WHERE}
		""",
		{"from_date": from_date, "to_date": to_date},
		as_dict=True,
	)[0]

	visits = cint(row.get("visits"))
	ip_visits = cint(row.get("ip_visits"))
	already_converted = cint(row.get("already_converted"))

	return {
		"from_date": str(from_date),
		"to_date": str(to_date),
		"visits": visits,
		"op_visits": visits - ip_visits,
		"ip_visits": ip_visits,
		"already_converted": already_converted,
		"pending": max(visits - already_converted, 0),
		"without_practitioner": cint(row.get("without_practitioner")),
		"default_op_service": get_default_ect_service("OP") or "",
		"default_ip_service": get_default_ect_service("IP") or "",
		"sample": _candidate_visit_names(from_date, to_date, _MAX_SAMPLE_NAMES, 0),
	}


@frappe.whitelist()
def start_ect_conversion(from_date=None, to_date=None) -> dict:
	"""Queue the ECT Conversion background job for an encounter-date range."""
	_require_admin()
	preview = preview_ect_conversion(from_date, to_date)
	if not cint(preview.get("pending")):
		return {
			"ok": True,
			"message": _(
				"Nothing to convert: no ECT-request Patient Visit without an ECT Service "
				"between {0} and {1}."
			).format(preview.get("from_date"), preview.get("to_date")),
		}

	_acquire_lock(JOB)
	_set_job_date_range(JOB, preview["from_date"], preview["to_date"])
	_set_progress(
		JOB,
		0,
		from_date=preview.get("from_date"),
		to_date=preview.get("to_date"),
		candidates=preview.get("pending"),
		**_counters_payload(_empty_counters()),
	)
	frappe.enqueue(
		"healthcare.api.ect_conversion.process_ect_conversion_batch",
		from_date=preview["from_date"],
		to_date=preview["to_date"],
		offset=0,
		queue="long",
		timeout=3600,
		job_name="healthcare_ect_conversion",
	)
	return {
		"ok": True,
		"message": _(
			"ECT Conversion started for Patient Visits with encounter date {0} to {1} "
			"({2} ECT visit(s) to check)."
		).format(preview.get("from_date"), preview.get("to_date"), preview.get("pending")),
	}


@frappe.whitelist()
def stop_ect_conversion() -> dict:
	"""Ask the running ECT Conversion job to halt after the current batch."""
	_require_admin()
	_request_stop(JOB)
	progress = frappe.cache().get_value(_job_progress_key(JOB)) or {}
	_set_progress(
		JOB,
		cint(progress.get("processed")),
		stop_requested=True,
		done=False,
		from_date=progress.get("from_date"),
		to_date=progress.get("to_date"),
		candidates=progress.get("candidates"),
		**_counters_payload(_counters_from_progress(progress)),
	)
	return {
		"ok": True,
		"message": _(
			"Stop requested. The ECT Conversion job halts after the batch it is working on."
		),
	}


def process_ect_conversion_batch(from_date=None, to_date=None, offset=0) -> None:
	"""Convert one batch of ECT-request visits, then queue the next batch."""
	job = JOB
	offset = cint(offset)
	try:
		progress = frappe.cache().get_value(_job_progress_key(job)) or {}
		from_date = from_date or progress.get("from_date")
		to_date = to_date or progress.get("to_date")
		from_date, to_date = _validate_range(from_date, to_date)

		_renew_lock(job)
		if _stop_requested(job):
			_finalize(job, offset, progress, stopped=True)
			return

		visit_names = _candidate_visit_names(from_date, to_date, ECT_CONVERSION_BATCH_SIZE, offset)
		counters = _counters_from_progress(progress)
		for visit_name in visit_names:
			_convert_visit(visit_name, counters)

		frappe.db.commit()
		processed = offset + len(visit_names)
		_set_progress(job, processed, **_counters_payload(counters))

		if len(visit_names) >= ECT_CONVERSION_BATCH_SIZE and not _stop_requested(job):
			frappe.enqueue(
				"healthcare.api.ect_conversion.process_ect_conversion_batch",
				from_date=str(from_date),
				to_date=str(to_date),
				offset=processed,
				queue="long",
				timeout=3600,
				job_name=f"healthcare_ect_conversion_{processed}",
			)
			return

		_finalize(job, processed, frappe.cache().get_value(_job_progress_key(job)) or {}, stopped=False)
	except Exception:
		frappe.db.rollback()
		_set_progress(job, offset, done=True, error=frappe.get_traceback())
		_release_lock(job)
		raise
