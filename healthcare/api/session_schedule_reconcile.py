"""One-button Oracle -> ERPNext reconciliation for OP Session Schedule.

Oracle keeps every outpatient session note in ``CLINIC2.VISIT_00_05`` (one row
per service request line: ``VISIT_NUM`` + ``SR_NUM``). ERPNext stores the same
rows in ``Session Schedule`` (``visit_00_05`` flag, ``sr_num``, ``patient_visit``
linked by ``Patient Visit.case_no``). The workbook import
(``healthcare.api.visit_00_05_import``) only runs when somebody exports the table
by hand, so the register drifts from Oracle over time.

What one run does
-----------------
1. Reads ``VISIT_00_05`` (live from Oracle, or from its Excel export) and
   compares each ``VISIT_NUM`` + ``SR_NUM`` pair with ``tabSession Schedule``.
2. A row counts as imported when a schedule of the *same visit* carries its
   ``SR_NUM`` (including rows reconciled earlier under ``<SR_NUM>-S``).
3. A row whose ``SR_NUM`` is already on another visit's schedule is created
   under ``<SR_NUM>-S`` (``-S-2`` if that is taken too).
4. Before creating, ``date``, session service and note text are compared with
   the schedules the visit already has. A row whose content is already there is
   skipped.
5. Existing Session Schedule rows are never updated or deleted.

Execution model matches ``vital_signs_reconcile``: site-wide scan, work list in
cache, self-chaining ``long`` queue job with lock and progress polling.

Usage::

    bench --site <site> execute healthcare.api.session_schedule_reconcile.preview_session_schedule_reconcile
    bench --site <site> execute healthcare.api.session_schedule_reconcile.start_session_schedule_reconcile
    bench --site <site> execute healthcare.api.session_schedule_reconcile.get_session_schedule_reconcile_status
    bench --site <site> execute healthcare.api.session_schedule_reconcile.run_session_schedule_reconcile --kwargs "{'limit': 5}"
"""

from __future__ import annotations

import re
import time
from typing import Any, Iterable

import frappe
from frappe import _
from frappe.utils import cint, getdate, now_datetime, nowdate

from healthcare.api.oracle_excel_source import excel_source, normalize_files, oracle_schema
from healthcare.api.oracle_sync import _fetch_rows, _query
from healthcare.api.patient_info_import import _cell_text, _clean_oracle_num, _require_admin
from healthcare.api.service_request_visit_import import (
	_build_healthcare_service_template_index,
	_order_date_time_from_cr_date,
)
from healthcare.api.visit_00_05_import import (
	EXCEL_HEADER_MAP,
	_find_existing_session_schedule,
	_normalize_visit_num,
	upsert_session_schedule_from_row,
)
from healthcare.api.visit_diagnosis_sync import _resolve_patient_visit

JOB_KEY = "session_schedule_reconcile"
PROGRESS_KEY = "healthcare:session_schedule_reconcile:progress"
WORK_KEY = "healthcare:session_schedule_reconcile:work"
LOCK_KEY = "healthcare:session_schedule_reconcile:lock"
PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6

ORACLE_TABLE = "VISIT_00_05"
DOCTYPE = "Session Schedule"
CONFLICT_SUFFIX = "-S"

ERP_PAGE = 50000
IMPORT_CHUNK = 300
TIME_BUDGET = 15 * 60
SAMPLE_LIMIT = 15
ERROR_LIMIT = 5
_SUFFIXED_KEY = re.compile(r"^(?P<number>\d+)" + re.escape(CONFLICT_SUFFIX) + r"(?:-\d+)?$")

_CONTENT_FINGERPRINT_FIELDS = ("doc_remarks", "feedback_remarks", "doc_code")


# ---------------------------------------------------------------------------
# Progress, work list and lock
# ---------------------------------------------------------------------------


def _set_progress(progress: dict) -> None:
	progress["updated_at"] = str(now_datetime())
	frappe.cache().set_value(PROGRESS_KEY, progress, expires_in_sec=PROGRESS_TTL)


def _load_progress() -> dict:
	return frappe.cache().get_value(PROGRESS_KEY) or {}


def _set_work(work: dict) -> None:
	frappe.cache().set_value(WORK_KEY, work, expires_in_sec=PROGRESS_TTL)


def _load_work() -> dict:
	return frappe.cache().get_value(WORK_KEY) or {}


def _lock_key() -> str:
	db_name = (frappe.local.conf or {}).get("db_name") or frappe.local.site
	return f"{db_name}|{LOCK_KEY}"


def _acquire_lock() -> str | None:
	token = frappe.generate_hash(length=12)
	if not frappe.cache().set(_lock_key(), token.encode(), nx=True, ex=LOCK_TTL):
		return None
	return token


def _owns_lock(token: str | None) -> bool:
	if not token:
		return False
	return (frappe.cache().get(_lock_key()) or b"").decode() == token


def _refresh_lock(token: str) -> None:
	frappe.cache().set(_lock_key(), token.encode(), ex=LOCK_TTL)


def _release_lock(token: str | None) -> None:
	if _owns_lock(token):
		frappe.cache().delete(_lock_key())


def _lock_held() -> bool:
	return bool(frappe.cache().get(_lock_key()))


def _new_progress(limit: int = 0) -> dict:
	stamp = str(now_datetime())
	return {
		"job_key": JOB_KEY,
		"state": "queued",
		"limit": cint(limit),
		"dry_run": 0,
		"suffix_conflicts": 1,
		"patient": "",
		"files": [],
		"index": 0,
		"processed": 0,
		"total": 0,
		"oracle_rows": 0,
		"oracle_visits": 0,
		"erpnext_schedules": 0,
		"matched_schedules": 0,
		"missing_free": 0,
		"missing_blocked": 0,
		"missing_total": 0,
		"foreign_schedules": 0,
		"extra_schedules": 0,
		"created": 0,
		"suffixed_sr_nums": 0,
		"skipped_existing": 0,
		"skipped_same_content": 0,
		"skipped_conflict": 0,
		"skipped_no_visit": 0,
		"skipped_no_patient": 0,
		"failed": 0,
		"errors": [],
		"samples": [],
		"started_at": stamp,
		"updated_at": stamp,
	}


def _record_samples(progress: dict, samples: Iterable[str]) -> None:
	room = SAMPLE_LIMIT - len(progress.get("samples") or [])
	if room <= 0:
		return
	for sample in samples or []:
		if room <= 0:
			break
		text = str(sample or "").strip()
		if not text:
			continue
		progress.setdefault("samples", []).append(text)
		room -= 1


def _record_errors(progress: dict, errors: Iterable[str]) -> None:
	for error in errors or []:
		text = str(error or "").strip()
		if not text:
			continue
		progress["failed"] = cint(progress.get("failed")) + 1
		if len(progress.get("errors") or []) < ERROR_LIMIT:
			progress.setdefault("errors", []).append(text[:800])


# ---------------------------------------------------------------------------
# Value helpers
# ---------------------------------------------------------------------------


def _legacy_record_key(visit_num: str, sr_num: str) -> str:
	return f"{visit_num}::{sr_num}"


def _sr_numeric_key(value: Any) -> str:
	text = _clean_oracle_num(value)
	match = _SUFFIXED_KEY.match(text)
	return match.group("number") if match else text


def _sql_text(value: str) -> str:
	return "'" + str(value).replace("'", "''") + "'"


def _norm_text(value: Any) -> str:
	text = _cell_text(value).replace("\r\n", "\n")
	text = re.sub(r"[ \t]+", " ", text)
	return text.strip().lower()


def _schedule_date_key(row: dict) -> str:
	order_date, _order_time = _order_date_time_from_cr_date(row.get("cr_date"))
	if order_date:
		try:
			return str(getdate(order_date))
		except Exception:
			return str(order_date)[:10]
	return ""


def _content_fingerprint(row: dict) -> tuple[str, ...]:
	serv = _cell_text(row.get("serv_num")).strip().lower()
	return (_schedule_date_key(row), serv) + tuple(
		_norm_text(row.get(field)) for field in _CONTENT_FINGERPRINT_FIELDS
	)


def _content_fingerprint_from_doc(row: dict) -> tuple[str, ...]:
	date_key = ""
	if row.get("date"):
		try:
			date_key = str(getdate(row.get("date")))
		except Exception:
			date_key = str(row.get("date"))[:10]
	serv = _cell_text(row.get("doc_code")).strip().lower()
	return (date_key, serv) + tuple(_norm_text(row.get(field)) for field in _CONTENT_FINGERPRINT_FIELDS)


# ---------------------------------------------------------------------------
# Comparison: Oracle VISIT_00_05 vs tabSession Schedule
# ---------------------------------------------------------------------------


def _oracle_schedule_index() -> dict[str, str]:
	rows = _query(
		f"select VISIT_NUM, SR_NUM from {oracle_schema()}.{ORACLE_TABLE} "
		"where VISIT_NUM is not null and SR_NUM is not null"
	)
	index: dict[str, str] = {}
	for row in rows or []:
		visit_num = _normalize_visit_num(row.get("VISIT_NUM"))
		sr_num = _sr_numeric_key(row.get("SR_NUM"))
		if not visit_num or not sr_num:
			continue
		index[_legacy_record_key(visit_num, sr_num)] = visit_num
	return index


def _oracle_totals() -> dict:
	rows = _query(
		f"select count(*) as TOTAL, count(distinct VISIT_NUM) as VISITS "
		f"from {oracle_schema()}.{ORACLE_TABLE}"
	)
	row = (rows or [{}])[0]
	return {
		"oracle_rows": cint(row.get("TOTAL")),
		"oracle_visits": cint(row.get("VISITS")),
	}


def _erpnext_page(after: str = "", limit: int = ERP_PAGE) -> list[tuple]:
	return frappe.db.sql(
		"""
		select ss.name, ifnull(ss.sr_num, ''), ifnull(pv.case_no, '')
		from `tabSession Schedule` ss
		left join `tabPatient Visit` pv on pv.name = ss.patient_visit
		where ss.name > %s and ifnull(ss.sr_num, '') != ''
		order by ss.name asc
		limit %s
		""",
		(after, limit),
	)


def _scan() -> dict:
	totals = _oracle_totals()
	oracle = _oracle_schedule_index()

	missing = set(oracle)
	matched = 0
	foreign_schedules = 0
	extra_schedules = 0
	erp_total = 0
	sr_to_visit: dict[str, str] = {}
	after = ""
	while True:
		rows = _erpnext_page(after)
		if not rows:
			break
		for _name, sr_num, visit_num in rows:
			after = _name
			erp_total += 1
			visit_num = _normalize_visit_num(visit_num)
			sr_key = _sr_numeric_key(sr_num)
			if not visit_num or not sr_key:
				extra_schedules += 1
				continue
			sr_to_visit[sr_key] = visit_num
			key = _legacy_record_key(visit_num, sr_key)
			owner = oracle.get(key)
			if owner is None:
				extra_schedules += 1
				continue
			if owner == visit_num:
				if key in missing:
					missing.discard(key)
					matched += 1
				continue
			foreign_schedules += 1
		if len(rows) < ERP_PAGE:
			break

	missing_free: list[list[str]] = []
	missing_blocked: list[list[str]] = []
	for key in missing:
		visit_num = oracle[key]
		sr_num = key.split("::", 1)[1]
		claimant = sr_to_visit.get(sr_num)
		if claimant and claimant != visit_num:
			missing_blocked.append([key, visit_num, "blocked", claimant])
		else:
			missing_free.append([key, visit_num, "free"])

	return {
		"oracle_rows": totals["oracle_rows"],
		"oracle_visits": totals["oracle_visits"],
		"erpnext_schedules": erp_total,
		"matched_schedules": matched,
		"extra_schedules": extra_schedules,
		"foreign_schedules": foreign_schedules,
		"missing_free": missing_free,
		"missing_blocked": missing_blocked,
	}


# ---------------------------------------------------------------------------
# Repair: create the session schedules ERPNext is missing
# ---------------------------------------------------------------------------


def _prepare_row(raw: dict) -> dict | None:
	row: dict[str, Any] = {}
	for name, value in (raw or {}).items():
		key = EXCEL_HEADER_MAP.get(str(name or "").strip().upper(), str(name or "").strip().lower())
		row[key] = value

	visit_num = _normalize_visit_num(row.get("visit_num"))
	sr_num = _clean_oracle_num(row.get("sr_num"))
	if not visit_num or not sr_num:
		return None
	row["visit_num"] = visit_num
	row["sr_num"] = sr_num
	row["patient_num"] = _clean_oracle_num(row.get("patient_num")) or None
	row["serv_num"] = _cell_text(row.get("serv_num")) or None
	row["doc_remarks"] = _cell_text(row.get("doc_remarks"))
	row["feedback_remarks"] = _cell_text(row.get("feedback_remarks"))
	row["legacy_record_key"] = _legacy_record_key(visit_num, _sr_numeric_key(sr_num))
	return row


def _oracle_rows_by_keys(keys: list[str]) -> list[dict]:
	if not keys:
		return []
	clauses: list[str] = []
	for key in keys:
		parts = str(key).split("::", 1)
		if len(parts) != 2:
			continue
		visit_num, sr_num = parts
		clauses.append(
			f"(VISIT_NUM = {_sql_text(visit_num)} and SR_NUM = {_sql_text(sr_num)})"
		)
	if not clauses:
		return []
	where = " or ".join(clauses)
	return _fetch_rows(ORACLE_TABLE, where=where, order_by="VISIT_NUM, SR_NUM")


def _existing_schedules(patient_visit: str) -> tuple[set[str], set[tuple[str, ...]]]:
	rows = frappe.get_all(
		DOCTYPE,
		filters={"patient_visit": patient_visit},
		fields=["sr_num", "date", "doc_code", *_CONTENT_FINGERPRINT_FIELDS],
		limit_page_length=0,
	)
	numbers = {_sr_numeric_key(row.get("sr_num")) for row in rows if row.get("sr_num")}
	fingerprints = {_content_fingerprint_from_doc(row) for row in rows}
	return numbers, fingerprints


def _free_suffixed_sr_num(patient_visit: str, sr_num: str) -> str:
	candidate = f"{sr_num}{CONFLICT_SUFFIX}"
	index = 2
	while _find_existing_session_schedule(patient_visit, candidate):
		candidate = f"{sr_num}{CONFLICT_SUFFIX}-{index}"
		index += 1
	return candidate


def _sr_taken_on_visit(patient_visit: str, sr_num: str) -> bool:
	return bool(_find_existing_session_schedule(patient_visit, sr_num))


def _row_label(row: dict) -> str:
	date = _schedule_date_key(row) or "?"
	serv = _cell_text(row.get("serv_num")) or "?"
	text = _cell_text(row.get("doc_remarks")).replace("\n", " ").strip()[:60]
	return f"{row.get('visit_num')} · sr {row.get('sr_num')} · {date} · {serv} · {text}"


def _process_chunk(
	items: list[list[str]],
	progress: dict,
	*,
	dry_run: int = 0,
	suffix_conflicts: int = 1,
	template_index: dict[str, str] | None = None,
) -> None:
	keys = [item[0] for item in items]
	prepared = [row for row in (_prepare_row(raw) for raw in _oracle_rows_by_keys(keys)) if row]

	by_visit: dict[str, list[dict]] = {}
	for row in prepared:
		patient_visit = _resolve_patient_visit(row.get("visit_num"), row.get("patient_num"))
		if not patient_visit:
			progress["skipped_no_visit"] = cint(progress.get("skipped_no_visit")) + 1
			_record_samples(
				progress,
				[f"{row['legacy_record_key']}: no Patient Visit for {row.get('visit_num') or '?'}"],
			)
			continue
		row["_patient_visit"] = patient_visit
		by_visit.setdefault(patient_visit, []).append(row)

	for patient_visit, rows in by_visit.items():
		existing_numbers, fingerprints = _existing_schedules(patient_visit)
		for row in rows:
			sr_num = row["sr_num"]
			base_sr = _sr_numeric_key(sr_num)
			if base_sr in existing_numbers:
				progress["skipped_existing"] = cint(progress.get("skipped_existing")) + 1
				continue
			fingerprint = _content_fingerprint(row)
			if fingerprint[0] and fingerprint in fingerprints:
				progress["skipped_same_content"] = cint(progress.get("skipped_same_content")) + 1
				continue

			create_sr = sr_num
			kind = next((item[2] for item in items if item[0] == row["legacy_record_key"]), "free")
			if kind == "blocked" or _sr_taken_on_visit(patient_visit, create_sr):
				if not cint(suffix_conflicts):
					progress["skipped_conflict"] = cint(progress.get("skipped_conflict")) + 1
					_record_samples(progress, [f"{_row_label(row)} (sr num taken on visit)"])
					continue
				create_sr = _free_suffixed_sr_num(patient_visit, base_sr)

			if _sr_taken_on_visit(patient_visit, create_sr):
				progress["skipped_existing"] = cint(progress.get("skipped_existing")) + 1
				continue

			progress["created"] = cint(progress.get("created")) + 1
			if create_sr != sr_num:
				progress["suffixed_sr_nums"] = cint(progress.get("suffixed_sr_nums")) + 1
			_record_samples(
				progress,
				[f"sr {create_sr} · visit {row.get('visit_num')} · {_row_label(row)}"],
			)
			if cint(dry_run):
				fingerprints.add(fingerprint)
				existing_numbers.add(base_sr)
				continue

			try:
				result = upsert_session_schedule_from_row(
					{**row, "sr_num": create_sr},
					template_index=template_index,
				)
			except Exception:
				_record_errors(progress, [f"{row['legacy_record_key']}: {frappe.get_traceback()}"])
				progress["created"] = cint(progress.get("created")) - 1
				continue
			status = (result or {}).get("status")
			if status == "skip":
				progress["skipped_no_patient"] = cint(progress.get("skipped_no_patient")) + 1
				progress["created"] = cint(progress.get("created")) - 1
			elif status == "updated":
				progress["skipped_existing"] = cint(progress.get("skipped_existing")) + 1
				progress["created"] = cint(progress.get("created")) - 1
			elif status != "created":
				_record_errors(
					progress,
					[f"{row['legacy_record_key']}: {status or 'unexpected result'}"],
				)
				progress["created"] = cint(progress.get("created")) - 1
			else:
				fingerprints.add(fingerprint)
				existing_numbers.add(_sr_numeric_key(create_sr))


# ---------------------------------------------------------------------------
# Work list and filters
# ---------------------------------------------------------------------------


_PATIENT_BY_VISIT: dict[str, str | None] = {}


def _patient_for_visit(visit_num: str, patient_num: str = "") -> str | None:
	key = _normalize_visit_num(visit_num)
	if not key:
		return None
	if key not in _PATIENT_BY_VISIT:
		patient = _clean_oracle_num(patient_num) or None
		patient_visit = _resolve_patient_visit(key, patient)
		if patient_visit:
			patient = patient or frappe.db.get_value("Patient Visit", patient_visit, "patient")
		_PATIENT_BY_VISIT[key] = patient
	return _PATIENT_BY_VISIT[key]


def _work_items(
	scan: dict,
	*,
	patient: str = "",
	limit: int = 0,
	suffix_conflicts: int = 1,
) -> list[list[str]]:
	items = list(scan.get("missing_free") or [])
	if cint(suffix_conflicts):
		items.extend(scan.get("missing_blocked") or [])

	if patient:
		filtered: list[list[str]] = []
		for item in items:
			key = item[0]
			visit_num = item[1]
			visit_patient = _patient_for_visit(visit_num)
			if visit_patient == patient:
				filtered.append(item)
		items = filtered

	items.sort(key=lambda item: item[0])
	if cint(limit):
		return items[: cint(limit)]
	return items


def _summary_message(progress: dict) -> str:
	dry = cint(progress.get("dry_run"))
	lines = [
		_("Reconcile Session Schedule finished."),
		"",
		_("Oracle {0}").format(ORACLE_TABLE),
		_("Session rows in Oracle: {0}").format(cint(progress.get("oracle_rows"))),
		_("Visits in Oracle: {0}").format(cint(progress.get("oracle_visits"))),
		_("Session Schedule in ERPNext: {0}").format(cint(progress.get("erpnext_schedules"))),
		_("Rows already matched by visit and sr number: {0}").format(
			cint(progress.get("matched_schedules"))
		),
		_("Missing - sr number still free on visit: {0}").format(cint(progress.get("missing_free"))),
		_("Missing - sr number used on another visit: {0}").format(
			cint(progress.get("missing_blocked"))
		),
		"",
		_("Session Schedule created: {0}").format(cint(progress.get("created"))),
		_("Created under a suffixed sr number ({0}): {1}").format(
			CONFLICT_SUFFIX, cint(progress.get("suffixed_sr_nums"))
		),
		_("Rows skipped - same visit, date and content already recorded: {0}").format(
			cint(progress.get("skipped_same_content"))
		),
	]
	if progress.get("skipped_conflict"):
		lines.append(
			_("Rows left alone - sr number conflict on visit: {0}").format(
				cint(progress.get("skipped_conflict"))
			)
		)
	if progress.get("skipped_no_visit"):
		lines.append(
			_("Rows skipped - no Patient Visit in ERPNext: {0}").format(
				cint(progress.get("skipped_no_visit"))
			)
		)
	if progress.get("skipped_no_patient"):
		lines.append(
			_("Rows skipped - no Patient in ERPNext: {0}").format(
				cint(progress.get("skipped_no_patient"))
			)
		)
	if progress.get("foreign_schedules"):
		lines.append("")
		lines.append(
			_(
				"Session schedules whose visit+sr Oracle gave to another visit "
				"(left untouched, please review): {0}"
			).format(cint(progress.get("foreign_schedules")))
		)
	if dry:
		lines.insert(1, _("DRY RUN - nothing was changed."))
	if progress.get("failed"):
		lines.extend(["", _("Failed records: {0}").format(cint(progress.get("failed")))])
		for error in progress.get("errors") or []:
			lines.append(f"• {error}")
	samples = progress.get("samples") or []
	if samples:
		lines.extend(["", _("Samples")])
		lines.extend(f"• {sample}" for sample in samples)
	return "\n".join(lines)


# ---------------------------------------------------------------------------
# Background job
# ---------------------------------------------------------------------------


def _queue_next(token: str, progress: dict, files: Any = None) -> None:
	frappe.enqueue(
		"healthcare.api.session_schedule_reconcile.run_session_schedule_reconcile",
		queue="long",
		timeout=7200,
		resume=1,
		token=token,
		dry_run=cint(progress.get("dry_run")),
		suffix_conflicts=cint(progress.get("suffix_conflicts")),
		files=files,
	)


def _run(
	token: str,
	resume: int,
	limit: int,
	dry_run: int = 0,
	suffix_conflicts: int = 1,
	patient: str = "",
	files: Any = None,
) -> dict[str, Any]:
	started = time.monotonic()
	progress = (_load_progress() if cint(resume) else {}) or _new_progress(limit)
	if cint(resume):
		limit = cint(progress.get("limit")) or cint(limit)
		dry_run = cint(progress.get("dry_run"))
		suffix_conflicts = cint(progress.get("suffix_conflicts"))
		patient = progress.get("patient") or patient
		files = progress.get("files") or files

	items = (_load_work().get("items") or []) if cint(resume) else []
	template_index = _build_healthcare_service_template_index()
	if not items:
		progress.update(
			{
				"state": "scanning",
				"limit": cint(limit),
				"dry_run": cint(dry_run),
				"suffix_conflicts": cint(suffix_conflicts),
				"patient": patient or "",
				"files": files or [],
				"index": 0,
				"processed": 0,
				"message": _("Comparing session schedules with Oracle…"),
			}
		)
		_set_progress(progress)

		scan = _scan()
		items = _work_items(
			scan,
			patient=patient,
			limit=limit,
			suffix_conflicts=suffix_conflicts,
		)
		_set_work({"items": items, "built_at": str(now_datetime())})
		progress.update(
			{
				"oracle_rows": scan["oracle_rows"],
				"oracle_visits": scan["oracle_visits"],
				"erpnext_schedules": scan["erpnext_schedules"],
				"matched_schedules": scan["matched_schedules"],
				"extra_schedules": scan["extra_schedules"],
				"foreign_schedules": scan["foreign_schedules"],
				"missing_free": len(scan["missing_free"]),
				"missing_blocked": len(scan["missing_blocked"]),
				"missing_total": len(scan["missing_free"]) + len(scan["missing_blocked"]),
				"total": len(items),
				"state": "running",
			}
		)
		frappe.db.commit()
		_set_progress(progress)

	if not items:
		frappe.db.commit()
		progress.update(
			{
				"state": "finished",
				"finished_at": str(now_datetime()),
				"message": _("ERPNext already has every session row Oracle recorded. Nothing to do."),
			}
		)
		_set_progress(progress)
		return {"state": "finished", "progress": progress}

	while True:
		offset = cint(progress.get("index"))
		chunk = items[offset : offset + IMPORT_CHUNK]
		if not chunk:
			break
		_process_chunk(
			chunk,
			progress,
			dry_run=cint(progress.get("dry_run")),
			suffix_conflicts=cint(progress.get("suffix_conflicts")),
			template_index=template_index,
		)
		progress["index"] = offset + len(chunk)
		progress["processed"] = cint(progress.get("index"))
		frappe.db.commit()
		_set_progress(progress)
		_refresh_lock(token)

		if time.monotonic() - started > TIME_BUDGET:
			progress["state"] = "queued"
			progress["message"] = _(
				"Still running in the background ({0} of {1} session rows processed)."
			).format(cint(progress.get("processed")), cint(progress.get("total")))
			_set_progress(progress)
			_queue_next(token, progress, files)
			return {"state": "queued", "handed_over": True, "progress": progress}

	frappe.db.commit()
	progress["processed"] = progress.get("total") or progress.get("processed")
	progress["state"] = "finished"
	progress["finished_at"] = str(now_datetime())
	progress["message"] = _summary_message(progress)
	_set_progress(progress)
	return {"state": "finished", "progress": progress}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


@frappe.whitelist()
def preview_session_schedule_reconcile(
	patient: str = "", limit: int = 0, files=None
) -> dict[str, Any]:
	"""Read-only answer to "does the session schedule register match Oracle?"."""
	_require_admin()
	files = normalize_files(files)
	with excel_source(files, tables=[ORACLE_TABLE]) as source:
		scan = _scan()
		items = _work_items(scan, patient=patient, limit=limit)
		sample_rows = [
			row
			for row in (_prepare_row(raw) for raw in _oracle_rows_by_keys([item[0] for item in items[:10]]))
			if row
		]
		item_keys = {item[0] for item in items}
		blocked_rows = [item for item in scan.get("missing_blocked") or [] if item[0] in item_keys]
		result: dict[str, Any] = {
			"ok": True,
			"as_of": str(nowdate()),
			"mode": "patient" if patient else "site",
			"oracle_table": f"{oracle_schema()}.{ORACLE_TABLE}",
			"oracle_rows": scan["oracle_rows"],
			"oracle_visits": scan["oracle_visits"],
			"erpnext_schedules": scan["erpnext_schedules"],
			"matched_schedules": scan["matched_schedules"],
			"extra_schedules": scan["extra_schedules"],
			"foreign_schedules": scan["foreign_schedules"],
			"missing_free": sum(1 for item in items if item[2] == "free"),
			"missing_blocked": sum(1 for item in items if item[2] == "blocked"),
			"missing_total": len(items),
			"visits_with_missing": len({item[1] for item in items}),
			"blocked_sample": [
				[item[0], item[1], item[3]] for item in blocked_rows[:10] if len(item) > 3
			],
			"samples": [
				{
					"key": row["legacy_record_key"],
					"visit": row.get("visit_num"),
					"sr_num": row.get("sr_num"),
					"date": _schedule_date_key(row),
					"serv_num": _cell_text(row.get("serv_num")),
				}
				for row in sample_rows
			],
		}
		if source is not None:
			result["oracle_table"] = source.describe(ORACLE_TABLE)
	result["in_sync"] = not cint(result["missing_total"])
	return result


@frappe.whitelist()
def start_session_schedule_reconcile(
	patient: str = "",
	limit: int = 0,
	dry_run: int = 0,
	suffix_conflicts: int = 1,
	files=None,
) -> dict[str, Any]:
	"""Queue one reconciliation of the session schedule register (button entry point)."""
	_require_admin()
	files = normalize_files(files)
	if _lock_held():
		return {
			"queued": False,
			"running": True,
			"message": _("A session schedule reconciliation is already running."),
			"status": _load_progress(),
		}

	progress = _new_progress(limit)
	progress.update(
		{
			"state": "queued",
			"dry_run": cint(dry_run),
			"suffix_conflicts": cint(suffix_conflicts),
			"patient": patient or "",
			"files": files,
			"message": (
				_("Queued. The uploaded Excel export is read in the background.")
				if files
				else _("Queued. Oracle is read in the background.")
			),
		}
	)
	_set_progress(progress)

	frappe.enqueue(
		"healthcare.api.session_schedule_reconcile.run_session_schedule_reconcile",
		queue="long",
		timeout=7200,
		limit=cint(limit),
		dry_run=cint(dry_run),
		suffix_conflicts=cint(suffix_conflicts),
		patient=patient or "",
		files=files,
	)
	return {"queued": True, "job_key": JOB_KEY, "status": progress}


@frappe.whitelist()
def get_session_schedule_reconcile_status() -> dict[str, Any]:
	"""Progress of the last / ongoing reconciliation (polled by the settings dialog)."""
	_require_admin()
	return _load_progress() or {
		"job_key": JOB_KEY,
		"state": "idle",
		"processed": 0,
		"total": 0,
	}


def run_session_schedule_reconcile(
	limit: int = 0,
	resume: int = 0,
	token: str | None = None,
	dry_run: int = 0,
	suffix_conflicts: int = 1,
	patient: str = "",
	files: Any = None,
) -> dict[str, Any]:
	"""Background entry point (also callable inline from the bench console)."""
	files = normalize_files(files)
	if cint(resume):
		if not _owns_lock(token):
			return {
				"state": "skipped",
				"message": _("This reconciliation run was replaced by a newer one."),
			}
	else:
		token = _acquire_lock()
		if not token:
			return {
				"state": "running",
				"message": _("A session schedule reconciliation is already running."),
			}

	outcome: dict[str, Any] = {}
	try:
		with excel_source(files, tables=[ORACLE_TABLE]):
			outcome = _run(
				token,
				cint(resume),
				cint(limit),
				cint(dry_run),
				cint(suffix_conflicts),
				patient or "",
				files,
			)
	except Exception:
		progress = _load_progress() or _new_progress()
		progress["state"] = "failed"
		progress["message"] = frappe.get_traceback()
		_record_errors(progress, [frappe.get_traceback()])
		_set_progress(progress)
		frappe.log_error(title="Session schedule reconciliation failed")
		raise
	finally:
		if not outcome.get("handed_over"):
			_release_lock(token)
	return outcome
