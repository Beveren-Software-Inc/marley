"""One-button Oracle -> ERPNext reconciliation for IP patient vitals.

Oracle keeps every inpatient vital-signs row in ``CLINIC2.IP_PATIENT_VITALS``;
``TRANS_NUM`` is the legacy transaction number. ERPNext stores the same rows in
``Vital Signs``, whose ``trans_no`` holds that number (``autoname`` is
``field:trans_no``). The workbook import
(``healthcare.api.ip_patient_vitals_import``) only runs when somebody exports
the table by hand, so the register drifts from Oracle over time.

What one run does
-----------------
1. Reads ``IP_PATIENT_VITALS`` (live from Oracle, or from its Excel export)
   and compares it, number by number, with ``tabVital Signs``.
2. A row counts as imported when a vital-signs document of the *same admission*
   carries its ``TRANS_NUM``. Rows whose ``TRANS_NUM`` is still free in ERPNext
   are created via ``upsert_vital_signs_from_row`` (insert-only from this job:
   existing documents are never updated).
3. A row whose ``TRANS_NUM`` is already the name of another admission's record
   is created under ``<TRANS_NUM>-V`` (``-V-2`` if that is taken too).
4. Before creating, key vitals on the same admission and date are compared
   (blood pressure, pulse, temperature, SpO2, weight, height). A row whose
   measures already exist — double-entry from Jul 2 onward — is skipped.
5. Existing vital-signs rows are never edited or deleted.

Execution model matches ``main_nursing_note_reconcile``: site-wide scan, work
list in cache, self-chaining ``long`` queue job with lock and progress polling.

Usage::

    bench --site <site> execute healthcare.api.vital_signs_reconcile.preview_vital_signs_reconcile
    bench --site <site> execute healthcare.api.vital_signs_reconcile.start_vital_signs_reconcile
    bench --site <site> execute healthcare.api.vital_signs_reconcile.get_vital_signs_reconcile_status
    bench --site <site> execute healthcare.api.vital_signs_reconcile.run_vital_signs_reconcile --kwargs "{'limit': 5}"
"""

from __future__ import annotations

import re
import time
from typing import Any, Iterable

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, now_datetime, nowdate

from healthcare.api.ip_patient_vitals_import import (
	EXCEL_HEADER_MAP,
	_parse_signs_date,
	upsert_vital_signs_from_row,
)
from healthcare.api.oracle_excel_source import excel_source, normalize_files, oracle_schema
from healthcare.api.oracle_sync import _fetch_rows, _query
from healthcare.api.patient_info_import import _cell_text, _clean_oracle_num, _require_admin
from healthcare.api.visit_diagnosis_sync import _resolve_inpatient_admission

JOB_KEY = "vital_signs_reconcile"
PROGRESS_KEY = "healthcare:vital_signs_reconcile:progress"
WORK_KEY = "healthcare:vital_signs_reconcile:work"
LOCK_KEY = "healthcare:vital_signs_reconcile:lock"
PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6

ORACLE_TABLE = "IP_PATIENT_VITALS"
DOCTYPE = "Vital Signs"
ADMISSION_DOCTYPE = "Inpatient Admission"
CONFLICT_SUFFIX = "-V"

ERP_PAGE = 50000
IMPORT_CHUNK = 300
TIME_BUDGET = 15 * 60
SAMPLE_LIMIT = 15
ERROR_LIMIT = 5
_SUFFIXED_KEY = re.compile(r"^(?P<number>\d+)" + re.escape(CONFLICT_SUFFIX) + r"(?:-\d+)?$")

_VITAL_FINGERPRINT_FIELDS = (
	"bp_systolic",
	"bp_diastolic",
	"pulse",
	"temperature",
	"spo2",
	"weight",
	"height",
)


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
		"admission": "",
		"files": [],
		"index": 0,
		"processed": 0,
		"total": 0,
		"oracle_rows": 0,
		"oracle_admissions": 0,
		"erpnext_vitals": 0,
		"matched_vitals": 0,
		"missing_free": 0,
		"missing_blocked": 0,
		"missing_total": 0,
		"foreign_vitals": 0,
		"extra_vitals": 0,
		"created": 0,
		"suffixed_trans_nos": 0,
		"skipped_existing": 0,
		"skipped_same_content": 0,
		"skipped_conflict": 0,
		"skipped_no_admission": 0,
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


def _numeric_key(value: Any) -> str:
	text = _clean_oracle_num(value)
	match = _SUFFIXED_KEY.match(text)
	return match.group("number") if match else text


def _sql_text(value: str) -> str:
	return "'" + str(value).replace("'", "''") + "'"


def _norm_measure(value: Any) -> str:
	if value in (None, ""):
		return ""
	if isinstance(value, (int, float)):
		number = flt(value)
		return str(int(number)) if number == int(number) else str(number)
	text = str(value).strip().replace(",", "")
	try:
		number = flt(text)
		return str(int(number)) if number == int(number) else str(number)
	except (TypeError, ValueError):
		return text.lower()


def _signs_date_key(row: dict) -> str:
	signs_date = _parse_signs_date(row.get("record_date"))
	if signs_date:
		return str(signs_date)
	if row.get("cr_date"):
		try:
			return str(getdate(row.get("cr_date")))
		except Exception:
			pass
	return ""


def _vitals_fingerprint(row: dict) -> tuple[str, ...]:
	return (_signs_date_key(row),) + tuple(_norm_measure(row.get(field)) for field in _VITAL_FINGERPRINT_FIELDS)


def _vitals_fingerprint_from_doc(row: dict) -> tuple[str, ...]:
	date_key = ""
	if row.get("signs_date"):
		try:
			date_key = str(getdate(row.get("signs_date")))
		except Exception:
			date_key = str(row.get("signs_date"))[:10]
	return (date_key,) + tuple(_norm_measure(row.get(field)) for field in _VITAL_FINGERPRINT_FIELDS)


def _erpnext_admission_num(old_admission_no: str, inpatient_record: str) -> str:
	num = _clean_oracle_num(old_admission_no)
	if num:
		return num
	return _clean_oracle_num(inpatient_record)


# ---------------------------------------------------------------------------
# Comparison: Oracle IP_PATIENT_VITALS vs tabVital Signs
# ---------------------------------------------------------------------------


def _oracle_vital_index() -> dict[str, str]:
	rows = _query(
		f"select TRANS_NUM, ADMISSION_NUM from {oracle_schema()}.{ORACLE_TABLE} "
		"where TRANS_NUM is not null"
	)
	index: dict[str, str] = {}
	for row in rows or []:
		num = _clean_oracle_num(row.get("TRANS_NUM"))
		if not num:
			continue
		index[num] = _clean_oracle_num(row.get("ADMISSION_NUM"))
	return index


def _oracle_totals() -> dict:
	rows = _query(
		f"select count(*) as TOTAL, count(distinct ADMISSION_NUM) as ADMISSIONS "
		f"from {oracle_schema()}.{ORACLE_TABLE}"
	)
	row = (rows or [{}])[0]
	return {
		"oracle_rows": cint(row.get("TOTAL")),
		"oracle_admissions": cint(row.get("ADMISSIONS")),
	}


def _erpnext_page(after: str = "", limit: int = ERP_PAGE) -> list[tuple]:
	return frappe.db.sql(
		"""
		select name, trans_no, ifnull(old_admission_no, ''), ifnull(inpatient_record, '')
		from `tabVital Signs`
		where name > %s
		order by name asc
		limit %s
		""",
		(after, limit),
	)


def _scan() -> dict:
	totals = _oracle_totals()
	oracle = _oracle_vital_index()

	missing = set(oracle)
	blocked: dict[str, str] = {}
	matched = 0
	foreign_vitals = 0
	extra_vitals = 0
	erp_total = 0
	after = ""
	while True:
		rows = _erpnext_page(after)
		if not rows:
			break
		for _name, trans_no, old_admission_no, inpatient_record in rows:
			after = _name
			erp_total += 1
			key = _numeric_key(trans_no)
			admission = _erpnext_admission_num(old_admission_no, inpatient_record)
			owner = oracle.get(key)
			if owner is None:
				extra_vitals += 1
				continue
			if owner == admission:
				blocked.pop(key, None)
				if key in missing:
					missing.discard(key)
					matched += 1
				continue
			foreign_vitals += 1
			if key in missing:
				blocked.setdefault(key, admission)
		if len(rows) < ERP_PAGE:
			break

	missing_free = [[num, oracle[num]] for num in missing if num not in blocked]
	missing_blocked = [[num, oracle[num], blocked[num]] for num in blocked if num in missing]

	return {
		"oracle_rows": totals["oracle_rows"],
		"oracle_admissions": totals["oracle_admissions"],
		"erpnext_vitals": erp_total,
		"matched_vitals": matched,
		"extra_vitals": extra_vitals,
		"foreign_vitals": foreign_vitals,
		"missing_free": missing_free,
		"missing_blocked": missing_blocked,
	}


# ---------------------------------------------------------------------------
# Repair: create the vital-signs rows ERPNext is missing
# ---------------------------------------------------------------------------


def _prepare_row(raw: dict) -> dict | None:
	row: dict[str, Any] = {}
	for name, value in (raw or {}).items():
		key = EXCEL_HEADER_MAP.get(str(name or "").strip().upper(), str(name or "").strip().lower())
		row[key] = value

	trans_num = _clean_oracle_num(row.get("trans_num"))
	if not trans_num:
		return None
	row["trans_num"] = trans_num
	row["patient_file_no"] = _clean_oracle_num(row.get("patient_file_no"))
	row["visit_num"] = _clean_oracle_num(row.get("visit_num"))
	row["admission_num"] = _clean_oracle_num(row.get("admission_num"))
	row["admission_num_old"] = _clean_oracle_num(row.get("admission_num_old"))
	row["branch_num"] = _clean_oracle_num(row.get("branch_num"))
	row["cr_id"] = _clean_oracle_num(row.get("cr_id"))
	row["up_id"] = _clean_oracle_num(row.get("up_id"))
	row["remarks"] = _cell_text(row.get("remarks"))
	return row


def _oracle_rows_by_numbers(numbers: list[str]) -> list[dict]:
	if not numbers:
		return []
	where = "TRANS_NUM in (" + ", ".join(_sql_text(num) for num in numbers) + ")"
	return _fetch_rows(ORACLE_TABLE, where=where, order_by="ADMISSION_NUM, RECORD_DATE, TRANS_NUM")


def _resolve_admission(row: dict) -> str | None:
	admission_num = row.get("admission_num") or ""
	old_num = row.get("admission_num_old") or ""
	for candidate in (admission_num, old_num):
		if not candidate:
			continue
		resolved = _resolve_inpatient_admission(candidate, row.get("patient_file_no"))
		if resolved:
			return resolved
	return None


def _existing_vitals(admission: str) -> tuple[set[str], set[tuple[str, ...]]]:
	rows = frappe.get_all(
		DOCTYPE,
		filters={"inpatient_record": admission},
		fields=["trans_no", *_VITAL_FINGERPRINT_FIELDS, "signs_date"],
		limit_page_length=0,
	)
	numbers = {_numeric_key(row.get("trans_no")) for row in rows if row.get("trans_no")}
	fingerprints = {_vitals_fingerprint_from_doc(row) for row in rows}
	return numbers, fingerprints


def _free_suffixed_trans_no(trans_num: str) -> str:
	candidate = f"{trans_num}{CONFLICT_SUFFIX}"
	index = 2
	while frappe.db.exists(DOCTYPE, candidate):
		candidate = f"{trans_num}{CONFLICT_SUFFIX}-{index}"
		index += 1
	return candidate


def _row_label(row: dict) -> str:
	date = _signs_date_key(row) or "?"
	bp = "/".join(
		filter(
			None,
			(_norm_measure(row.get("bp_systolic")), _norm_measure(row.get("bp_diastolic"))),
		)
	)
	parts = [f"BP {bp}" if bp else "", f"P {_norm_measure(row.get('pulse'))}"]
	return f"{row.get('trans_num')} · {date} · {' '.join(p for p in parts if p)}"


def _process_chunk(
	items: list[list[str]],
	progress: dict,
	*,
	dry_run: int = 0,
	suffix_conflicts: int = 1,
) -> None:
	numbers = [item[0] for item in items]
	prepared = [row for row in (_prepare_row(raw) for raw in _oracle_rows_by_numbers(numbers)) if row]

	by_admission: dict[str, list[dict]] = {}
	for row in prepared:
		admission = _resolve_admission(row)
		if not admission:
			progress["skipped_no_admission"] = cint(progress.get("skipped_no_admission")) + 1
			_record_samples(
				progress,
				[f"{row['trans_num']}: no Inpatient Admission for {row.get('admission_num') or '?'}"],
			)
			continue
		by_admission.setdefault(admission, []).append(row)

	for admission, rows in by_admission.items():
		existing_numbers, fingerprints = _existing_vitals(admission)
		for row in rows:
			trans_num = row["trans_num"]
			if trans_num in existing_numbers:
				progress["skipped_existing"] = cint(progress.get("skipped_existing")) + 1
				continue
			fingerprint = _vitals_fingerprint(row)
			if fingerprint[0] and fingerprint in fingerprints:
				progress["skipped_same_content"] = cint(progress.get("skipped_same_content")) + 1
				continue

			create_num = trans_num
			if frappe.db.exists(DOCTYPE, trans_num):
				if not cint(suffix_conflicts):
					progress["skipped_conflict"] = cint(progress.get("skipped_conflict")) + 1
					_record_samples(progress, [f"{_row_label(row)} (trans no taken)"])
					continue
				create_num = _free_suffixed_trans_no(trans_num)

			if frappe.db.exists(DOCTYPE, create_num):
				progress["skipped_existing"] = cint(progress.get("skipped_existing")) + 1
				continue

			progress["created"] = cint(progress.get("created")) + 1
			if create_num != trans_num:
				progress["suffixed_trans_nos"] = cint(progress.get("suffixed_trans_nos")) + 1
			_record_samples(progress, [f"{create_num} · admission {admission} · {_row_label(row)}"])
			if cint(dry_run):
				fingerprints.add(fingerprint)
				existing_numbers.add(trans_num)
				continue

			try:
				result = upsert_vital_signs_from_row({**row, "trans_num": create_num})
			except Exception:
				_record_errors(progress, [f"{create_num}: {frappe.get_traceback()}"])
				progress["created"] = cint(progress.get("created")) - 1
				continue
			status = (result or {}).get("status")
			if status == "skip_no_admission":
				progress["skipped_no_admission"] = cint(progress.get("skipped_no_admission")) + 1
				progress["created"] = cint(progress.get("created")) - 1
			elif status == "skip_no_patient":
				progress["skipped_no_patient"] = cint(progress.get("skipped_no_patient")) + 1
				progress["created"] = cint(progress.get("created")) - 1
			elif status == "updated":
				progress["skipped_existing"] = cint(progress.get("skipped_existing")) + 1
				progress["created"] = cint(progress.get("created")) - 1
			elif status != "created":
				_record_errors(progress, [f"{create_num}: {status or 'unexpected result'}"])
				progress["created"] = cint(progress.get("created")) - 1
			else:
				fingerprints.add(fingerprint)
				existing_numbers.add(_numeric_key(create_num))


# ---------------------------------------------------------------------------
# Work list and filters
# ---------------------------------------------------------------------------

_ADMISSION_NAMES: dict[str, str | None] = {}


def _resolve_admission_number(admission_num: str) -> str | None:
	key = _cell_text(admission_num).strip()
	if not key:
		return None
	if key not in _ADMISSION_NAMES:
		_ADMISSION_NAMES[key] = _resolve_inpatient_admission(key)
	return _ADMISSION_NAMES[key]


def _allowed_admissions(patient: str = "", admission: str = "") -> set[str] | None:
	if admission:
		return {admission}
	if patient:
		return set(frappe.get_all(ADMISSION_DOCTYPE, filters={"patient": patient}, pluck="name"))
	return None


def _work_items(
	scan: dict,
	*,
	patient: str = "",
	admission: str = "",
	limit: int = 0,
	suffix_conflicts: int = 1,
) -> list[list[str]]:
	items = [[num, admission_num, "free"] for num, admission_num in scan.get("missing_free") or []]
	if cint(suffix_conflicts):
		items.extend(
			[num, admission_num, "blocked"]
			for num, admission_num, _claimant in scan.get("missing_blocked") or []
		)

	allowed = _allowed_admissions(patient, admission)
	if allowed is not None:
		items = [item for item in items if _resolve_admission_number(item[1]) in allowed]

	items.sort(key=lambda item: cint(item[0]))
	if cint(limit):
		return items[: cint(limit)]
	return items


def _summary_message(progress: dict) -> str:
	dry = cint(progress.get("dry_run"))
	lines = [
		_("Reconcile Vital Signs finished."),
		"",
		_("Oracle {0}").format(ORACLE_TABLE),
		_("Vital-signs rows in Oracle: {0}").format(cint(progress.get("oracle_rows"))),
		_("Admissions in Oracle: {0}").format(cint(progress.get("oracle_admissions"))),
		_("Vital Signs in ERPNext: {0}").format(cint(progress.get("erpnext_vitals"))),
		_("Rows already matched by trans number: {0}").format(cint(progress.get("matched_vitals"))),
		_("Missing - trans number still free: {0}").format(cint(progress.get("missing_free"))),
		_("Missing - trans number used by another admission: {0}").format(
			cint(progress.get("missing_blocked"))
		),
		"",
		_("Vital Signs created: {0}").format(cint(progress.get("created"))),
		_("Created under a suffixed trans number ({0}): {1}").format(
			CONFLICT_SUFFIX, cint(progress.get("suffixed_trans_nos"))
		),
		_("Rows skipped - same admission, date and vitals already recorded: {0}").format(
			cint(progress.get("skipped_same_content"))
		),
	]
	if progress.get("skipped_conflict"):
		lines.append(
			_("Rows left alone - trans number used by another admission: {0}").format(
				cint(progress.get("skipped_conflict"))
			)
		)
	if progress.get("skipped_no_admission"):
		lines.append(
			_("Rows skipped - no Inpatient Admission in ERPNext: {0}").format(
				cint(progress.get("skipped_no_admission"))
			)
		)
	if progress.get("skipped_no_patient"):
		lines.append(
			_("Rows skipped - no Patient in ERPNext: {0}").format(cint(progress.get("skipped_no_patient")))
		)
	if progress.get("foreign_vitals"):
		lines.append("")
		lines.append(
			_(
				"Vital Signs whose trans number Oracle gave to another admission "
				"(left untouched, please review): {0}"
			).format(cint(progress.get("foreign_vitals")))
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
		"healthcare.api.vital_signs_reconcile.run_vital_signs_reconcile",
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
	admission: str = "",
	files: Any = None,
) -> dict[str, Any]:
	started = time.monotonic()
	progress = (_load_progress() if cint(resume) else {}) or _new_progress(limit)
	if cint(resume):
		limit = cint(progress.get("limit")) or cint(limit)
		dry_run = cint(progress.get("dry_run"))
		suffix_conflicts = cint(progress.get("suffix_conflicts"))
		patient = progress.get("patient") or patient
		admission = progress.get("admission") or admission
		files = progress.get("files") or files

	items = (_load_work().get("items") or []) if cint(resume) else []
	if not items:
		progress.update(
			{
				"state": "scanning",
				"limit": cint(limit),
				"dry_run": cint(dry_run),
				"suffix_conflicts": cint(suffix_conflicts),
				"patient": patient or "",
				"admission": admission or "",
				"files": files or [],
				"index": 0,
				"processed": 0,
				"message": _("Comparing vital signs with Oracle…"),
			}
		)
		_set_progress(progress)

		scan = _scan()
		items = _work_items(
			scan,
			patient=patient,
			admission=admission,
			limit=limit,
			suffix_conflicts=suffix_conflicts,
		)
		_set_work({"items": items, "built_at": str(now_datetime())})
		progress.update(
			{
				"oracle_rows": scan["oracle_rows"],
				"oracle_admissions": scan["oracle_admissions"],
				"erpnext_vitals": scan["erpnext_vitals"],
				"matched_vitals": scan["matched_vitals"],
				"extra_vitals": scan["extra_vitals"],
				"foreign_vitals": scan["foreign_vitals"],
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
				"message": _("ERPNext already has every vital-signs row Oracle recorded. Nothing to do."),
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
		)
		progress["index"] = offset + len(chunk)
		progress["processed"] = cint(progress.get("index"))
		frappe.db.commit()
		_set_progress(progress)
		_refresh_lock(token)

		if time.monotonic() - started > TIME_BUDGET:
			progress["state"] = "queued"
			progress["message"] = _(
				"Still running in the background ({0} of {1} vital-signs rows processed)."
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
def preview_vital_signs_reconcile(
	patient: str = "", admission: str = "", limit: int = 0, files=None
) -> dict[str, Any]:
	"""Read-only answer to "does the vital-signs register match Oracle?"."""
	_require_admin()
	files = normalize_files(files)
	with excel_source(files, tables=[ORACLE_TABLE]) as source:
		scan = _scan()
		items = _work_items(scan, patient=patient, admission=admission, limit=limit)
		sample_rows = [
			row
			for row in (_prepare_row(raw) for raw in _oracle_rows_by_numbers([item[0] for item in items[:10]]))
			if row
		]
		allowed = _allowed_admissions(patient, admission)
		blocked_rows = [
			row
			for row in scan["missing_blocked"]
			if allowed is None or _resolve_admission_number(row[1]) in allowed
		]
		result: dict[str, Any] = {
			"ok": True,
			"as_of": str(nowdate()),
			"mode": "admission" if admission else ("patient" if patient else "site"),
			"oracle_table": f"{oracle_schema()}.{ORACLE_TABLE}",
			"oracle_rows": scan["oracle_rows"],
			"oracle_admissions": scan["oracle_admissions"],
			"erpnext_vitals": scan["erpnext_vitals"],
			"matched_vitals": scan["matched_vitals"],
			"extra_vitals": scan["extra_vitals"],
			"foreign_vitals": scan["foreign_vitals"],
			"missing_free": sum(1 for item in items if item[2] == "free"),
			"missing_blocked": sum(1 for item in items if item[2] == "blocked"),
			"missing_total": len(items),
			"admissions_with_missing": len({item[1] for item in items}),
			"blocked_sample": [[num, adm, claimant] for num, adm, claimant in blocked_rows[:10]],
			"samples": [
				{
					"number": row["trans_num"],
					"admission": row.get("admission_num"),
					"date": _signs_date_key(row),
					"bp": "/".join(
						filter(
							None,
							(
								_norm_measure(row.get("bp_systolic")),
								_norm_measure(row.get("bp_diastolic")),
							),
						)
					),
					"pulse": _norm_measure(row.get("pulse")),
				}
				for row in sample_rows
			],
		}
		if source is not None:
			result["oracle_table"] = source.describe(ORACLE_TABLE)
	result["in_sync"] = not cint(result["missing_total"])
	return result


@frappe.whitelist()
def start_vital_signs_reconcile(
	patient: str = "",
	admission: str = "",
	limit: int = 0,
	dry_run: int = 0,
	suffix_conflicts: int = 1,
	files=None,
) -> dict[str, Any]:
	"""Queue one reconciliation of the vital-signs register (button entry point)."""
	_require_admin()
	files = normalize_files(files)
	if _lock_held():
		return {
			"queued": False,
			"running": True,
			"message": _("A vital signs reconciliation is already running."),
			"status": _load_progress(),
		}

	progress = _new_progress(limit)
	progress.update(
		{
			"state": "queued",
			"dry_run": cint(dry_run),
			"suffix_conflicts": cint(suffix_conflicts),
			"patient": patient or "",
			"admission": admission or "",
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
		"healthcare.api.vital_signs_reconcile.run_vital_signs_reconcile",
		queue="long",
		timeout=7200,
		limit=cint(limit),
		dry_run=cint(dry_run),
		suffix_conflicts=cint(suffix_conflicts),
		patient=patient or "",
		admission=admission or "",
		files=files,
	)
	return {"queued": True, "job_key": JOB_KEY, "status": progress}


@frappe.whitelist()
def get_vital_signs_reconcile_status() -> dict[str, Any]:
	"""Progress of the last / ongoing reconciliation (polled by the settings dialog)."""
	_require_admin()
	return _load_progress() or {
		"job_key": JOB_KEY,
		"state": "idle",
		"processed": 0,
		"total": 0,
	}


def run_vital_signs_reconcile(
	limit: int = 0,
	resume: int = 0,
	token: str | None = None,
	dry_run: int = 0,
	suffix_conflicts: int = 1,
	patient: str = "",
	admission: str = "",
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
				"message": _("A vital signs reconciliation is already running."),
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
				admission or "",
				files,
			)
	except Exception:
		progress = _load_progress() or _new_progress()
		progress["state"] = "failed"
		progress["message"] = frappe.get_traceback()
		_record_errors(progress, [frappe.get_traceback()])
		_set_progress(progress)
		frappe.log_error(title="Vital signs reconciliation failed")
		raise
	finally:
		if not outcome.get("handed_over"):
			_release_lock(token)
	return outcome
