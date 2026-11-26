# Copyright (c) 2026, healthcare contributors
"""Oracle → ERPNext Clean Check: read-only gap report for every import table.

Healthcare Settings → Update → Clean Check runs this in the background and
reports which entities still have Oracle rows missing in ERPNext. It reuses the
same compare / preview logic as the individual Oracle → ERPNext buttons; it
never creates or updates documents.
"""

from __future__ import annotations

import time
from typing import Any, Callable

import frappe
from frappe import _
from frappe.utils import cint, cstr, now_datetime

from healthcare.api.patient_info_import import _clean_oracle_num, _require_admin

JOB_KEY = "oracle_clean_check"
PROGRESS_KEY = "healthcare:oracle_clean_check:progress"
LOCK_KEY = "healthcare:oracle_clean_check:lock"
PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6
SAMPLE_LIMIT = 8


# ---------------------------------------------------------------------------
# Progress / lock
# ---------------------------------------------------------------------------


def _set_progress(progress: dict) -> None:
	progress["updated_at"] = str(now_datetime())
	frappe.cache().set_value(PROGRESS_KEY, progress, expires_in_sec=PROGRESS_TTL)


def _load_progress() -> dict:
	return frappe.cache().get_value(PROGRESS_KEY) or {}


def _lock_name() -> str:
	db_name = (frappe.local.conf or {}).get("db_name") or frappe.local.site
	return f"{db_name}|{LOCK_KEY}"


def _acquire_lock() -> str | None:
	token = frappe.generate_hash(length=12)
	if not frappe.cache().set(_lock_name(), token.encode(), nx=True, ex=LOCK_TTL):
		return None
	return token


def _owns_lock(token: str | None) -> bool:
	if not token:
		return False
	return (frappe.cache().get(_lock_name()) or b"").decode() == token


def _release_lock(token: str | None) -> None:
	if _owns_lock(token):
		frappe.cache().delete(_lock_name())


def _lock_held() -> bool:
	return bool(frappe.cache().get(_lock_name()))


def _new_progress(checks: list[dict]) -> dict:
	return {
		"job_key": JOB_KEY,
		"state": "queued",
		"phase": "starting",
		"processed": 0,
		"total": len(checks),
		"current_label": "",
		"message": _("Queued. Clean Check will compare Oracle with ERPNext for every import table."),
		"started_at": str(now_datetime()),
		"finished_at": None,
		"rows": [],
		"summary": {
			"checked": 0,
			"in_sync": 0,
			"with_gaps": 0,
			"errors": 0,
			"missing_total": 0,
		},
		"errors": [],
	}


# ---------------------------------------------------------------------------
# Normalize preview / compare payloads into one report row
# ---------------------------------------------------------------------------


def _first_int(data: dict, *keys: str) -> int | None:
	for key in keys:
		if key in data and data.get(key) is not None:
			return cint(data.get(key))
	return None


def _normalize_row(key: str, label: str, doctype: str, data: dict | None, error: str | None = None) -> dict:
	data = data or {}
	if error:
		return {
			"key": key,
			"label": label,
			"doctype": doctype,
			"oracle_table": data.get("oracle_table") or "",
			"oracle_count": None,
			"erpnext_count": None,
			"missing_count": None,
			"in_sync": False,
			"status": "error",
			"detail": error,
			"samples": [],
		}

	missing = _first_int(
		data,
		"missing_count",
		"missing_total",
		"missing_patients",
		"missing_registers",
		"missing_discharges",
		"missing_claims",
		"missing_groups",
		"missing_free",
	)
	# Long Acting reports give-outs separately; fold into missing when groups are zero.
	if key == "long_acting":
		missing = cint(data.get("missing_groups")) + cint(data.get("missing_give_outs"))

	oracle = _first_int(
		data,
		"oracle_count",
		"oracle_rows",
		"oracle_patients",
		"oracle_insured",
		"oracle_discharged",
		"oracle_claims",
		"oracle_rows_with_text",
		"source_count",
	)
	if oracle is None and isinstance(data.get("totals"), dict):
		oracle = _first_int(data["totals"], "oracle")

	erpnext = _first_int(
		data,
		"erpnext_count",
		"erpnext_rows",
		"erpnext_patients",
		"erpnext_registers",
		"erpnext_discharges",
		"erpnext_claims",
		"erpnext_ect",
		"target_count",
		"matched",
		"matched_patients",
		"matched_registers",
		"matched_discharges",
		"matched_claims",
		"matched_ect",
		"matched_vitals",
		"matched_schedules",
		"matched_exams",
		"matched_notes",
		"matched_histories",
		"lam_matched",
	)
	if erpnext is None and isinstance(data.get("totals"), dict):
		erpnext = _first_int(data["totals"], "erpnext")
	if erpnext is None and isinstance(data.get("erpnext"), dict):
		erpnext = _first_int(data["erpnext"], "clinical_notes", "doctor_progress_notes")

	if missing is None and oracle is not None and erpnext is not None:
		missing = max(0, cint(oracle) - cint(erpnext))

	in_sync = bool(data.get("in_sync")) if "in_sync" in data else not cint(missing or 0)
	if missing is None and not error:
		status = "unknown"
		detail = _("Compare did not return a missing count; open the entity reconcile for a full check.")
		in_sync = False
	elif cint(missing or 0) > 0:
		status = "missing"
		detail = _("{0} Oracle row(s) missing in ERPNext").format(cint(missing))
	else:
		status = "ok"
		detail = _("In sync")

	samples = data.get("samples") or data.get("missing") or data.get("missing_group_sample") or []
	if not isinstance(samples, list):
		samples = []
	samples = samples[:SAMPLE_LIMIT]

	return {
		"key": key,
		"label": label,
		"doctype": doctype,
		"oracle_table": cstr(data.get("oracle_table") or ""),
		"oracle_count": oracle,
		"erpnext_count": erpnext,
		"missing_count": missing,
		"in_sync": in_sync and status == "ok",
		"status": status,
		"detail": detail,
		"samples": samples,
		"extra": {
			k: data.get(k)
			for k in (
				"duplicates",
				"extra_count",
				"blocked_count",
				"importable_count",
				"headers_missing_lines",
				"missing_give_outs",
				"missing_groups",
				"conflicts",
			)
			if data.get(k) not in (None, 0, [], {})
		},
	}


def _run_check(key: str, label: str, doctype: str, runner: Callable[[], dict]) -> dict:
	try:
		raw = runner() or {}
		# Async previews should not be used from Clean Check; refuse quietly.
		if raw.get("async") or raw.get("queued"):
			return _normalize_row(
				key,
				label,
				doctype,
				raw,
				error=_("This entity uses an async preview; Clean Check skipped it."),
			)
		return _normalize_row(key, label, doctype, raw)
	except Exception:
		frappe.log_error(title=f"Clean Check failed: {label}")
		return _normalize_row(key, label, doctype, None, error=frappe.get_traceback(with_context=False)[:800])


# ---------------------------------------------------------------------------
# Entity runners (live Oracle; same compare as the buttons)
# ---------------------------------------------------------------------------


def _check_patients() -> dict:
	from healthcare.api.patient_reconcile import preview_patient_reconcile

	return preview_patient_reconcile()


def _check_insurance_register() -> dict:
	from healthcare.api.insurance_register_reconcile import preview_insurance_register_reconcile

	return preview_insurance_register_reconcile()


def _check_ip_admission() -> dict:
	from healthcare.api.oracle_sync import compare_ip_admissions

	return compare_ip_admissions(sample_limit=SAMPLE_LIMIT)


def _check_op_visit() -> dict:
	from healthcare.api.oracle_sync import compare_op_visits

	return compare_op_visits(sample_limit=SAMPLE_LIMIT)


def _check_daily_patient_visit() -> dict:
	from healthcare.api.daily_patient_visit_reconcile import preview_daily_patient_visit_reconcile

	return preview_daily_patient_visit_reconcile()


def _check_prescriptions() -> dict:
	"""Visit / admission key compare for OP + HIS + IP prescriptions."""
	from healthcare.api.oracle_excel_source import oracle_schema
	from healthcare.api.prescription_sync import (
		HS_TABLE,
		IP_TABLE,
		OP_TABLE,
		_distinct_keys,
		_hs_visit_keys,
	)

	op_visits = {_clean_oracle_num(v) for v in _distinct_keys(OP_TABLE, "VISIT_CD") if _clean_oracle_num(v)}
	hs_visits = {_clean_oracle_num(v) for v in _hs_visit_keys() if _clean_oracle_num(v)}
	all_visits = op_visits | hs_visits
	ip_admissions = {
		_clean_oracle_num(v) for v in _distinct_keys(IP_TABLE, "ADMISSION_NUM") if _clean_oracle_num(v)
	}

	erp_visit_cds = {
		_clean_oracle_num(v)
		for v in frappe.get_all(
			"Patient Medication Order",
			filters={"visit_cd": ["is", "set"]},
			pluck="visit_cd",
		)
		if _clean_oracle_num(v)
	}
	erp_old_adm = {
		_clean_oracle_num(v)
		for v in frappe.get_all(
			"Patient Medication Order",
			filters={"old_admission_no": ["is", "set"]},
			pluck="old_admission_no",
		)
		if _clean_oracle_num(v)
	}
	# Also match through linked Inpatient Admission.case_no
	linked = frappe.db.sql(
		"""
		select distinct ifnull(nullif(ia.case_no, ''), ia.name)
		from `tabPatient Medication Order` pmo
		inner join `tabInpatient Admission` ia on ia.name = pmo.inpatient_record
		where ifnull(pmo.inpatient_record, '') != ''
		"""
	)
	erp_adm = erp_old_adm | {_clean_oracle_num(r[0]) for r in linked if _clean_oracle_num(r[0])}

	missing_visits = sorted(all_visits - erp_visit_cds, key=lambda x: (len(x), x))
	missing_admissions = sorted(ip_admissions - erp_adm, key=lambda x: (len(x), x))
	missing_total = len(missing_visits) + len(missing_admissions)

	samples = [{"key": k, "text": "OP/HIS visit"} for k in missing_visits[:SAMPLE_LIMIT]]
	room = max(0, SAMPLE_LIMIT - len(samples))
	samples.extend({"key": k, "text": "IP admission"} for k in missing_admissions[:room])

	return {
		"oracle_table": (
			f"{oracle_schema()}.{OP_TABLE} + {oracle_schema()}.{HS_TABLE} + {oracle_schema()}.{IP_TABLE}"
		),
		"oracle_rows": len(all_visits) + len(ip_admissions),
		"erpnext_rows": len(all_visits & erp_visit_cds) + len(ip_admissions & erp_adm),
		"missing_total": missing_total,
		"missing_visits": len(missing_visits),
		"missing_admissions": len(missing_admissions),
		"samples": samples,
		"in_sync": missing_total == 0,
	}


def _check_long_acting() -> dict:
	from healthcare.api.long_acting_reconcile import preview_long_acting_reconcile

	return preview_long_acting_reconcile()


def _check_visit_history() -> dict:
	from healthcare.api.visit_history_reconcile import preview_visit_history_reconcile

	return preview_visit_history_reconcile()


def _check_clinical_notes() -> dict:
	"""Oracle non-empty diagnosis rows vs Clinical Notes imported with OPDX-/OPHX- prefixes.

	IP doctor notes are counted against Clinical Notes linked to an admission.
	Missing is an estimate suitable for Clean Check; use Clinical Notes reconcile
	for exact per-patient gaps.
	"""
	from healthcare.api.clinical_note_reconcile import (
		DOCTOR_PROGRESS_NOTE_TYPE,
		HISTORY_TRANS_PREFIX,
		OP_TRANS_PREFIX,
		SOURCE_HISTORY,
		SOURCE_IP,
		SOURCE_OP,
		SOURCE_ORDER,
		_oracle_patient_counts,
		_site_erpnext_totals,
	)
	from healthcare.api.oracle_excel_source import oracle_schema

	counts = _oracle_patient_counts()
	oracle_by = {s: 0 for s in SOURCE_ORDER}
	for bucket in counts.values():
		for source in SOURCE_ORDER:
			oracle_by[source] += cint(bucket.get(source))
	oracle_total = sum(oracle_by.values())

	opdx = cint(
		frappe.db.sql(
			"""
			select count(*) from `tabClinical Note`
			where docstatus != 2 and ifnull(trans_no, '') like %s
			""",
			(f"{OP_TRANS_PREFIX}%",),
		)[0][0]
	)
	ophx = cint(
		frappe.db.sql(
			"""
			select count(*) from `tabClinical Note`
			where docstatus != 2 and ifnull(trans_no, '') like %s
			""",
			(f"{HISTORY_TRANS_PREFIX}%",),
		)[0][0]
	)
	ip_linked = cint(
		frappe.db.sql(
			"""
			select count(*) from `tabClinical Note`
			where docstatus != 2
			  and clinical_note_type = %s
			  and (
			  	ifnull(inpatient_admission, '') != ''
			  	or reference_doctype = 'Inpatient Admission'
			  )
			  and ifnull(trans_no, '') not like %s
			  and ifnull(trans_no, '') not like %s
			""",
			(DOCTOR_PROGRESS_NOTE_TYPE, f"{OP_TRANS_PREFIX}%", f"{HISTORY_TRANS_PREFIX}%"),
		)[0][0]
	)
	imported = opdx + ophx + ip_linked
	missing_op = max(0, oracle_by[SOURCE_OP] - opdx)
	missing_hist = max(0, oracle_by[SOURCE_HISTORY] - ophx)
	missing_ip = max(0, oracle_by[SOURCE_IP] - ip_linked)
	missing_total = missing_op + missing_hist + missing_ip
	erp = _site_erpnext_totals()

	return {
		"oracle_table": (
			f"{oracle_schema()}.VISIT_00_01 + VISIT_00_01_HISTORY + IP_ADMISSION_DIAGNOSES"
		),
		"oracle_rows": oracle_total,
		"oracle_count": oracle_total,
		"erpnext_count": imported,
		"erpnext_rows": imported,
		"missing_total": missing_total,
		"totals": {"oracle": oracle_total, "erpnext": imported, "missing": missing_total},
		"erpnext": erp,
		"samples": [
			{"key": "op", "text": f"OP missing ≈ {missing_op} (Oracle {oracle_by[SOURCE_OP]}, OPDX {opdx})"},
			{
				"key": "history",
				"text": f"History missing ≈ {missing_hist} (Oracle {oracle_by[SOURCE_HISTORY]}, OPHX {ophx})",
			},
			{
				"key": "ip",
				"text": f"IP missing ≈ {missing_ip} (Oracle {oracle_by[SOURCE_IP]}, linked {ip_linked})",
			},
		],
		"in_sync": missing_total == 0,
	}


def _check_medical_diagnosis() -> dict:
	from healthcare.api.medical_diagnosis_reconcile import preview_medical_diagnosis_reconcile

	return preview_medical_diagnosis_reconcile()


def _check_morse() -> dict:
	from healthcare.api.care_record_reconcile import preview_morse_fall_scale_reconcile

	return preview_morse_fall_scale_reconcile()


def _check_patient_assessment() -> dict:
	from healthcare.api.care_record_reconcile import preview_patient_assessment_reconcile

	return preview_patient_assessment_reconcile()


def _check_medicine_given() -> dict:
	from healthcare.api.care_record_reconcile import preview_medicine_given_reconcile

	return preview_medicine_given_reconcile()


def _check_appointments() -> dict:
	from healthcare.api.care_record_reconcile import preview_appointment_reconcile

	return preview_appointment_reconcile()


def _check_nursing_notes() -> dict:
	from healthcare.api.main_nursing_note_reconcile import preview_main_nursing_note_reconcile

	return preview_main_nursing_note_reconcile()


def _check_physical_examination() -> dict:
	from healthcare.api.physical_examination_reconcile import preview_physical_examination_reconcile

	return preview_physical_examination_reconcile()


def _check_grooming() -> dict:
	from healthcare.api.ip_chart_reconcile import preview_grooming_chart_reconcile

	return preview_grooming_chart_reconcile()


def _check_mental_state() -> dict:
	from healthcare.api.ip_chart_reconcile import preview_mental_state_reconcile

	return preview_mental_state_reconcile()


def _check_admission_transfer() -> dict:
	from healthcare.api.ip_chart_reconcile import preview_admission_transfer_reconcile

	return preview_admission_transfer_reconcile()


def _check_vital_signs() -> dict:
	from healthcare.api.vital_signs_reconcile import preview_vital_signs_reconcile

	return preview_vital_signs_reconcile()


def _check_session_schedule() -> dict:
	from healthcare.api.session_schedule_reconcile import preview_session_schedule_reconcile

	return preview_session_schedule_reconcile()


def _check_warning_messages() -> dict:
	from healthcare.api.warning_message_reconcile import preview_warning_message_reconcile

	return preview_warning_message_reconcile()


def _check_allergies() -> dict:
	from healthcare.api.allergy_reconcile import preview_allergy_reconcile

	return preview_allergy_reconcile()


def _check_lab_tests() -> dict:
	from healthcare.api.lab_test_reconcile import preview_lab_test_reconcile

	return preview_lab_test_reconcile()


def _check_observations() -> dict:
	from healthcare.api.observation_reconcile import preview_observation_reconcile

	return preview_observation_reconcile()


def _check_ect() -> dict:
	from healthcare.api.ect_details_reconcile import preview_ect_details_reconcile

	return preview_ect_details_reconcile()


def _check_patient_history() -> dict:
	from healthcare.api.patient_history_reconcile import preview_patient_history_reconcile

	return preview_patient_history_reconcile()


def _check_discharge() -> dict:
	from healthcare.api.discharge_reconcile import preview_discharge_reconcile

	return preview_discharge_reconcile()


def _check_insurance_claims() -> dict:
	from healthcare.api.insurance_claim_reconcile import preview_insurance_claim_reconcile

	return preview_insurance_claim_reconcile()


def _check_legacy_sales() -> dict:
	"""Call the sync compare (not the async whitelist preview)."""
	from healthcare.api.legacy_sales_reconcile import ORACLE_DETAIL, ORACLE_HEADER, _compare
	from healthcare.api.oracle_excel_source import excel_source

	with excel_source(None, tables=[ORACLE_HEADER, ORACLE_DETAIL]):
		data = _compare()
	# Drop huge key maps before caching the report.
	data = {k: v for k, v in data.items() if k not in {"oracle_by_key", "missing_headers", "work_headers", "empty_line_headers"}}
	data["in_sync"] = not cint(data.get("missing_total")) and not cint(data.get("headers_missing_lines"))
	return data


CLEAN_CHECKS: list[tuple[str, str, str, Callable[[], dict]]] = [
	("patients", "Patients", "Patient", _check_patients),
	("insurance_register", "Insurance Register", "Insurance Patient Register", _check_insurance_register),
	("ip_admission", "IP Admission", "Inpatient Admission", _check_ip_admission),
	("op_visit", "OP Visit", "Patient Visit", _check_op_visit),
	("daily_patient_visit", "Daily Patient Visit / Auto Visit", "Daily Patient Visit Setup", _check_daily_patient_visit),
	("prescriptions", "Prescriptions (OP / HIS / IP)", "Patient Medication Order", _check_prescriptions),
	("long_acting", "Long Acting Medicine", "Long Acting Medicine", _check_long_acting),
	("visit_history", "Visit History", "VISIT_00_01_HISTORY", _check_visit_history),
	("clinical_notes", "Clinical Notes", "Clinical Note", _check_clinical_notes),
	("medical_diagnosis", "Medical Diagnosis Entry", "Medical Diagnosis Entry", _check_medical_diagnosis),
	("morse_fall_scale", "Morse Fall Scale", "Morse Fall Scale", _check_morse),
	("patient_assessment", "Patient Assessment", "Patient Assessment", _check_patient_assessment),
	("medicine_given", "Medicine Given", "Medicine Given", _check_medicine_given),
	("appointments", "Appointments", "Patient Appointment", _check_appointments),
	("nursing_notes", "Nursing Notes", "Main Nursing Note", _check_nursing_notes),
	("physical_examination", "Physical Examination", "Physical Examination", _check_physical_examination),
	("grooming_chart", "IP Grooming Chart", "IP Grooming Chart", _check_grooming),
	("mental_state", "IP Mental State", "Mental State", _check_mental_state),
	("admission_transfer", "IP Admission Transfer", "Transfer Admission Event", _check_admission_transfer),
	("vital_signs", "Vital Signs", "Vital Signs", _check_vital_signs),
	("session_schedule", "Session Schedule", "Session Schedule", _check_session_schedule),
	("warning_messages", "Warning Messages", "Warning Message", _check_warning_messages),
	("allergies", "Allergies", "Warning Message", _check_allergies),
	("lab_tests", "Lab Tests", "Lab Test", _check_lab_tests),
	("observations", "Observations", "Observation", _check_observations),
	("ect_details", "ECT Details", "ECT Details", _check_ect),
	("patient_history", "Patient History", "Patient History", _check_patient_history),
	("discharge", "Discharge", "Discharge", _check_discharge),
	("insurance_claims", "Insurance Claims", "Insurance Claim", _check_insurance_claims),
	("legacy_sales", "Legacy Sales / Pharmacy Dispensed", "Legacy Sales Transactions", _check_legacy_sales),
]


# ---------------------------------------------------------------------------
# Job
# ---------------------------------------------------------------------------


def run_oracle_clean_check(token: str | None = None) -> dict:
	"""Background worker: compare every Oracle → ERPNext import table."""
	if not _owns_lock(token):
		return {"state": "skipped", "message": _("Clean Check was replaced by a newer run.")}

	progress = _load_progress() or _new_progress(
		[{"key": k, "label": lab} for k, lab, _dt, _fn in CLEAN_CHECKS]
	)
	progress["state"] = "running"
	progress["phase"] = "comparing"
	progress["message"] = _("Comparing Oracle with ERPNext…")
	progress["lock_token"] = token
	_set_progress(progress)

	rows: list[dict] = list(progress.get("rows") or [])
	started_keys = {r.get("key") for r in rows}
	summary = progress.get("summary") or {
		"checked": 0,
		"in_sync": 0,
		"with_gaps": 0,
		"errors": 0,
		"missing_total": 0,
	}

	try:
		for key, label, doctype, runner in CLEAN_CHECKS:
			if key in started_keys:
				continue
			progress["current_label"] = label
			progress["message"] = _("Checking {0}…").format(label)
			_set_progress(progress)

			row = _run_check(key, label, doctype, runner)
			rows.append(row)
			started_keys.add(key)

			summary["checked"] = cint(summary.get("checked")) + 1
			if row.get("status") == "error":
				summary["errors"] = cint(summary.get("errors")) + 1
				errs = list(progress.get("errors") or [])
				errs.append(f"{label}: {row.get('detail')}")
				progress["errors"] = errs[-20:]
			elif row.get("status") == "ok":
				summary["in_sync"] = cint(summary.get("in_sync")) + 1
			elif cint(row.get("missing_count") or 0) > 0 or row.get("status") == "missing":
				summary["with_gaps"] = cint(summary.get("with_gaps")) + 1
				summary["missing_total"] = cint(summary.get("missing_total")) + cint(
					row.get("missing_count") or 0
				)
			else:
				summary["with_gaps"] = cint(summary.get("with_gaps")) + 1

			progress["rows"] = rows
			progress["summary"] = summary
			progress["processed"] = len(rows)
			progress["total"] = len(CLEAN_CHECKS)
			_set_progress(progress)
			# Soft yield so Redis / UI can poll.
			time.sleep(0.05)

		gaps = [r for r in rows if r.get("status") == "missing"]
		errors = [r for r in rows if r.get("status") == "error"]
		lines = [
			_("Clean Check finished."),
			"",
			_("Tables checked: {0}").format(len(rows)),
			_("In sync: {0}").format(summary.get("in_sync")),
			_("With gaps: {0}").format(summary.get("with_gaps")),
			_("Errors: {0}").format(summary.get("errors")),
			_("Total missing rows (sum): {0}").format(summary.get("missing_total")),
		]
		if gaps:
			lines.append("")
			lines.append(_("Needs re-import:"))
			for r in gaps:
				lines.append(f"• {r['label']}: {cint(r.get('missing_count'))} missing")
		if errors:
			lines.append("")
			lines.append(_("Failed checks:"))
			for r in errors:
				lines.append(f"• {r['label']}")

		progress["state"] = "finished"
		progress["phase"] = "done"
		progress["finished_at"] = str(now_datetime())
		progress["current_label"] = ""
		progress["message"] = "\n".join(lines)
		progress["rows"] = rows
		progress["summary"] = summary
		_set_progress(progress)
		return {"state": "finished", "progress": progress}
	except Exception:
		progress["state"] = "failed"
		progress["message"] = frappe.get_traceback()
		_set_progress(progress)
		frappe.log_error(title="Oracle Clean Check failed")
		raise
	finally:
		_release_lock(token)


# ---------------------------------------------------------------------------
# Whitelist API
# ---------------------------------------------------------------------------


@frappe.whitelist()
def start_oracle_clean_check() -> dict[str, Any]:
	"""Queue Clean Check (Healthcare Settings → Update → Clean Check)."""
	_require_admin()
	if _lock_held():
		return {
			"queued": False,
			"running": True,
			"message": _("A Clean Check is already running."),
			"status": _load_progress(),
		}

	token = _acquire_lock()
	if not token:
		return {
			"queued": False,
			"running": True,
			"message": _("A Clean Check is already running."),
			"status": _load_progress(),
		}

	progress = _new_progress(
		[{"key": k, "label": lab} for k, lab, _dt, _fn in CLEAN_CHECKS]
	)
	progress["state"] = "queued"
	progress["lock_token"] = token
	progress["message"] = _("Queued. Comparing all Oracle → ERPNext tables in the background.")
	_set_progress(progress)

	frappe.enqueue(
		"healthcare.api.oracle_clean_check.run_oracle_clean_check",
		queue="long",
		timeout=7200,
		token=token,
	)
	return {"queued": True, "job_key": JOB_KEY, "status": progress}


@frappe.whitelist()
def get_oracle_clean_check_status() -> dict[str, Any]:
	"""Poll Clean Check progress / finished report."""
	_require_admin()
	progress = _load_progress() or {
		"job_key": JOB_KEY,
		"state": "idle",
		"processed": 0,
		"total": len(CLEAN_CHECKS),
		"rows": [],
		"summary": {},
	}
	# If lock vanished mid-run, surface as failed so the UI stops polling forever.
	if progress.get("state") in ("queued", "running") and not _lock_held():
		# Worker may have finished between load and lock check; re-read.
		progress = _load_progress() or progress
		if progress.get("state") in ("queued", "running"):
			progress["state"] = "failed"
			progress["message"] = progress.get("message") or _(
				"Clean Check stopped unexpectedly (lock released)."
			)
	return progress
