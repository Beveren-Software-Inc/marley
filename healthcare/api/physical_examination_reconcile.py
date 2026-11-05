"""One-button Oracle -> ERPNext reconciliation for IP physical examinations.

Oracle keeps every inpatient physical exam in ``CLINIC2.IP_ADMISSION_PHY_EXAM`` -
one row per exam, ``TRANS_NO`` = the legacy transaction number.
ERPNext keeps the same exams in ``Physical Examination``, whose ``trans_no``
holds that number (``autoname`` is ``field:trans_no``). The workbook import
(``healthcare.api.ip_admission_phy_exam_import``) only runs when somebody
exports the table by hand, so the register stops at the export date. From July
2025 onward Oracle sometimes records the same admission exam twice under two
transaction numbers; ERPNext may already hold one copy while the second number is
still missing.

What one run does
-----------------
1. Reads ``IP_ADMISSION_PHY_EXAM`` (live from Oracle, or from its uploaded Excel
   export) and compares it, number by number, with ``tabPhysical Examination``.
2. A row counts as imported when an exam of the *same admission* carries its
   ``TRANS_NO``. Rows whose number is still free in ERPNext are created.
3. A row whose number is already the name of another admission's exam is created
   under ``<TRANS_NO>-P`` (``-P-2`` if that is taken too). Turn that off with
   *suffix_conflicts* to only report those rows.
4. Before creating, exam date and content (vitals plus phys signs / CVS / CNS /
   GIT / others) are compared with exams the admission already has. A row that
   duplicates an existing same-day exam is skipped so a second run never doubles
   the chart.
5. Existing exams are never edited or deleted: only what is missing is added.

Execution model
---------------
Same as nursing notes: one comparison pass, then a self-chaining background job
on the ``long`` queue with cache progress for the Healthcare Settings dialog.

Usage::

    bench --site <site> execute healthcare.api.physical_examination_reconcile.preview_physical_examination_reconcile
    bench --site <site> execute healthcare.api.physical_examination_reconcile.start_physical_examination_reconcile
    bench --site <site> execute healthcare.api.physical_examination_reconcile.get_physical_examination_reconcile_status
    bench --site <site> execute healthcare.api.physical_examination_reconcile.run_physical_examination_reconcile --kwargs "{'limit': 5}"
"""

from __future__ import annotations

import re
import time
from typing import Any, Iterable

import frappe
from frappe import _
from frappe.utils import cint, now_datetime, nowdate

from healthcare.api.ip_admission_phy_exam_import import (
	EXCEL_HEADER_MAP,
	upsert_physical_examination_from_row,
)
from healthcare.api.oracle_excel_source import excel_source, normalize_files, oracle_schema
from healthcare.api.oracle_sync import _fetch_rows, _query, _table_columns
from healthcare.api.patient_info_import import _cell_text, _clean_oracle_num, _require_admin
from healthcare.api.visit_diagnoses_op_import import _legacy_data_datetime
from healthcare.api.visit_diagnosis_sync import _resolve_inpatient_admission

JOB_KEY = "physical_examination_reconcile"
PROGRESS_KEY = "healthcare:physical_examination_reconcile:progress"
WORK_KEY = "healthcare:physical_examination_reconcile:work"
LOCK_KEY = "healthcare:physical_examination_reconcile:lock"
PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6

ORACLE_TABLE = "IP_ADMISSION_PHY_EXAM"
DOCTYPE = "Physical Examination"
ADMISSION_DOCTYPE = "Inpatient Admission"
CONFLICT_SUFFIX = "-P"

ERP_PAGE = 50000
IMPORT_CHUNK = 300
TIME_BUDGET = 15 * 60
SAMPLE_LIMIT = 15
ERROR_LIMIT = 5
_SUFFIXED_KEY = re.compile(r"^(?P<number>\d+)" + re.escape(CONFLICT_SUFFIX) + r"(?:-\d+)?$")


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
		"oracle_rows_with_text": 0,
		"oracle_admissions": 0,
		"blank_rows": 0,
		"erpnext_exams": 0,
		"matched_exams": 0,
		"missing_free": 0,
		"missing_blocked": 0,
		"missing_total": 0,
		"foreign_exams": 0,
		"extra_exams": 0,
		"created": 0,
		"suffixed_trans_nos": 0,
		"skipped_existing": 0,
		"skipped_same_content": 0,
		"skipped_conflict": 0,
		"skipped_no_admission": 0,
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


def _norm_vital(value: Any) -> str:
	return _cell_text(value).replace(",", "").strip().lower()


def _norm_exam_text(value: Any) -> str:
	text = _cell_text(value).replace("\r\n", "\n")
	text = re.sub(r"[ \t]+", " ", text)
	return text.strip().lower()


def _content_fingerprint(row: dict) -> str:
	parts = [
		_norm_vital(row.get("weight")),
		_norm_vital(row.get("height")),
		_norm_vital(row.get("blood_pressure")),
		_norm_vital(row.get("pulse")),
		_norm_vital(row.get("temp_pressure")),
		_norm_vital(row.get("resp_rate")),
		_norm_exam_text(row.get("phys_signs")),
		_norm_exam_text(row.get("cvs_resp")),
		_norm_exam_text(row.get("cns")),
		_norm_exam_text(row.get("git")),
		_norm_exam_text(row.get("others")),
	]
	return "|".join(parts)


def _content_fingerprint_from_erp(row: dict) -> str:
	return _content_fingerprint(
		{
			"weight": row.get("weight"),
			"height": row.get("height"),
			"blood_pressure": row.get("blood_pressure"),
			"pulse": row.get("pulse"),
			"temp_pressure": row.get("temp_pressure"),
			"resp_rate": row.get("resp_rate"),
			"phys_signs": row.get("skin_"),
			"cvs_resp": row.get("cvsresp"),
			"cns": row.get("cnc"),
			"git": row.get("git"),
			"others": row.get("others"),
		}
	)


def _exam_date(row: dict) -> str:
	for key in ("cr_date_time", "cr_date"):
		value = row.get(key)
		if value in (None, ""):
			continue
		formatted = _legacy_data_datetime(value) or _cell_text(value)
		if formatted:
			return formatted[:10]
	return ""


def _exam_date_erp(row: dict) -> str:
	return _cell_text(row.get("cr_date"))[:10]


def _oracle_trans_no(raw: dict) -> str:
	return _clean_oracle_num(raw.get("TRANS_NO") or raw.get("TRANS_NUM"))


def _oracle_column_names() -> set[str]:
	return {(col.get("name") or "").strip().upper() for col in _table_columns(ORACLE_TABLE)}


def _oracle_trans_column() -> str:
	"""IP_ADMISSION_PHY_EXAM uses TRANS_NO (not TRANS_NUM). Prefer what exists."""
	columns = _oracle_column_names()
	if "TRANS_NO" in columns:
		return "TRANS_NO"
	if "TRANS_NUM" in columns:
		return "TRANS_NUM"
	frappe.throw(
		_("Oracle table {0}.{1} has neither TRANS_NO nor TRANS_NUM.").format(
			oracle_schema(), ORACLE_TABLE
		)
	)


def _oracle_order_by(trans_col: str) -> str:
	columns = _oracle_column_names()
	parts = ["ADMISSION_NUM"]
	if "CR_DATE_TIME" in columns:
		parts.append("CR_DATE_TIME")
	elif "CR_DATE" in columns:
		parts.append("CR_DATE")
	parts.append(trans_col)
	return ", ".join(parts)


# ---------------------------------------------------------------------------
# Comparison
# ---------------------------------------------------------------------------


def _oracle_exam_index() -> dict[str, str]:
	trans_col = _oracle_trans_column()
	rows = _query(
		f"select {trans_col}, ADMISSION_NUM from {oracle_schema()}.{ORACLE_TABLE}"
	)
	index: dict[str, str] = {}
	for row in rows or []:
		num = _oracle_trans_no(row)
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
	total = cint(row.get("TOTAL"))
	return {
		"oracle_rows": total,
		"oracle_admissions": cint(row.get("ADMISSIONS")),
		"blank_rows": 0,
	}


def _erpnext_page(after: str = "", limit: int = ERP_PAGE) -> list[tuple]:
	return frappe.db.sql(
		"""
		select name, trans_no, ifnull(inpatient_admission, '')
		from `tabPhysical Examination`
		where name > %s
		order by name asc
		limit %s
		""",
		(after, limit),
	)


def _scan() -> dict:
	totals = _oracle_totals()
	oracle = _oracle_exam_index()

	missing = set(oracle)
	blocked: dict[str, str] = {}
	matched = 0
	foreign_exams = 0
	extra_exams = 0
	erp_total = 0
	after = ""
	while True:
		rows = _erpnext_page(after)
		if not rows:
			break
		for name, trans_no, admission in rows:
			after = name
			erp_total += 1
			key = _numeric_key(trans_no)
			admission = _clean_oracle_num(admission)
			owner = oracle.get(key)
			if owner is None:
				extra_exams += 1
				continue
			if owner == admission:
				blocked.pop(key, None)
				if key in missing:
					missing.discard(key)
					matched += 1
				continue
			foreign_exams += 1
			if key in missing:
				blocked.setdefault(key, admission)
		if len(rows) < ERP_PAGE:
			break

	missing_free = [[num, oracle[num]] for num in missing if num not in blocked]
	missing_blocked = [[num, oracle[num], blocked[num]] for num in blocked if num in missing]

	return {
		"oracle_rows": totals["oracle_rows"],
		"oracle_rows_with_text": len(oracle),
		"oracle_admissions": totals["oracle_admissions"],
		"blank_rows": totals["blank_rows"],
		"erpnext_exams": erp_total,
		"matched_exams": matched,
		"extra_exams": extra_exams,
		"foreign_exams": foreign_exams,
		"missing_free": missing_free,
		"missing_blocked": missing_blocked,
	}


# ---------------------------------------------------------------------------
# Repair
# ---------------------------------------------------------------------------


def _prepare_row(raw: dict) -> dict | None:
	row: dict[str, Any] = {}
	for name, value in (raw or {}).items():
		key = EXCEL_HEADER_MAP.get(str(name or "").strip().upper(), str(name or "").strip().lower())
		row[key] = value

	trans_no = _clean_oracle_num(row.get("trans_no"))
	if not trans_no:
		return None
	row["trans_no"] = trans_no
	row["admission_num"] = _clean_oracle_num(row.get("admission_num"))
	row["admission_num_old"] = _clean_oracle_num(row.get("admission_num_old"))
	row["patient_num"] = _clean_oracle_num(row.get("patient_num"))
	row["branch_num"] = _clean_oracle_num(row.get("branch_num"))
	row["cr_id"] = _clean_oracle_num(row.get("cr_id"))
	row["up_id"] = _clean_oracle_num(row.get("up_id"))
	return row


def _oracle_rows_by_numbers(numbers: list[str]) -> list[dict]:
	if not numbers:
		return []
	trans_col = _oracle_trans_column()
	literal = ", ".join(_sql_text(num) for num in numbers)
	where = f"{trans_col} in ({literal})"
	return _fetch_rows(ORACLE_TABLE, where=where, order_by=_oracle_order_by(trans_col))


def _existing_examinations(admission: str) -> tuple[set[str], set[tuple[str, str]]]:
	rows = frappe.get_all(
		DOCTYPE,
		filters={"inpatient_admission": admission},
		fields=[
			"trans_no",
			"cr_date",
			"weight",
			"height",
			"blood_pressure",
			"pulse",
			"temp_pressure",
			"resp_rate",
			"skin_",
			"cvsresp",
			"cnc",
			"git",
			"others",
		],
		limit_page_length=0,
	)
	numbers = {_numeric_key(row.get("trans_no")) for row in rows if row.get("trans_no")}
	content_keys: set[tuple[str, str]] = set()
	for row in rows:
		date = _exam_date_erp(row)
		if not date:
			continue
		content_keys.add((date, _content_fingerprint_from_erp(row)))
	return numbers, content_keys


def _free_suffixed_trans_no(trans_no: str) -> str:
	candidate = f"{trans_no}{CONFLICT_SUFFIX}"
	index = 2
	while frappe.db.exists(DOCTYPE, candidate):
		candidate = f"{trans_no}{CONFLICT_SUFFIX}-{index}"
		index += 1
	return candidate


def _resolve_admission(row: dict) -> str | None:
	admission_num = row.get("admission_num") or row.get("admission_num_old") or ""
	return _resolve_inpatient_admission(admission_num, row.get("patient_num"))


def _row_label(row: dict) -> str:
	date = _exam_date(row)
	text = _norm_exam_text(row.get("phys_signs"))[:70]
	return f"{row.get('trans_no')} · {date} · {text}"


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
				[f"{row['trans_no']}: no Inpatient Admission for {row.get('admission_num') or '?'}"],
			)
			continue
		by_admission.setdefault(admission, []).append(row)

	for admission, rows in by_admission.items():
		existing_numbers, content_keys = _existing_examinations(admission)
		for row in rows:
			trans_no = row["trans_no"]
			if trans_no in existing_numbers:
				progress["skipped_existing"] = cint(progress.get("skipped_existing")) + 1
				continue
			date = _exam_date(row)
			fingerprint = _content_fingerprint(row)
			if date and (date, fingerprint) in content_keys:
				progress["skipped_same_content"] = cint(progress.get("skipped_same_content")) + 1
				continue

			create_no = trans_no
			if frappe.db.exists(DOCTYPE, trans_no):
				if not cint(suffix_conflicts):
					progress["skipped_conflict"] = cint(progress.get("skipped_conflict")) + 1
					_record_samples(progress, [f"{_row_label(row)} (trans no taken)"])
					continue
				create_no = _free_suffixed_trans_no(trans_no)

			progress["created"] = cint(progress.get("created")) + 1
			if create_no != trans_no:
				progress["suffixed_trans_nos"] = cint(progress.get("suffixed_trans_nos")) + 1
			_record_samples(progress, [f"{create_no} · admission {admission} · {_row_label(row)}"])
			if cint(dry_run):
				content_keys.add((date, fingerprint))
				continue

			try:
				result = upsert_physical_examination_from_row({**row, "trans_no": create_no})
			except Exception:
				_record_errors(progress, [f"{create_no}: {frappe.get_traceback()}"])
				continue
			status = (result or {}).get("status")
			if status == "skip_no_admission":
				progress["skipped_no_admission"] = cint(progress.get("skipped_no_admission")) + 1
				progress["created"] = cint(progress.get("created")) - 1
			elif status == "skip_no_patient":
				progress["created"] = cint(progress.get("created")) - 1
				_record_errors(progress, [f"{create_no}: no patient"])
			elif status not in ("created", "updated"):
				_record_errors(progress, [f"{create_no}: {status or 'unexpected result'}"])
				progress["created"] = cint(progress.get("created")) - 1
			else:
				existing_numbers.add(_numeric_key(create_no))
				if date:
					content_keys.add((date, fingerprint))


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
		_("Reconcile Physical Examinations finished."),
		"",
		_("Oracle {0}").format(ORACLE_TABLE),
		_("Exams in Oracle: {0}").format(cint(progress.get("oracle_rows"))),
		_("Admissions in Oracle: {0}").format(cint(progress.get("oracle_admissions"))),
		_("Physical Examinations in ERPNext: {0}").format(cint(progress.get("erpnext_exams"))),
		_("Exams already matched by trans number: {0}").format(cint(progress.get("matched_exams"))),
		_("Missing - trans number still free: {0}").format(cint(progress.get("missing_free"))),
		_("Missing - trans number used by another admission: {0}").format(
			cint(progress.get("missing_blocked"))
		),
		"",
		_("Physical Examinations created: {0}").format(cint(progress.get("created"))),
		_("Created under a suffixed trans number ({0}): {1}").format(
			CONFLICT_SUFFIX, cint(progress.get("suffixed_trans_nos"))
		),
		_("Rows skipped - same date and content already on admission: {0}").format(
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
	if progress.get("foreign_exams"):
		lines.extend(
			[
				"",
				_(
					"Physical Examinations whose trans number Oracle gave to another admission "
					"(left untouched, please review): {0}"
				).format(cint(progress.get("foreign_exams"))),
			]
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
		"healthcare.api.physical_examination_reconcile.run_physical_examination_reconcile",
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
				"message": _("Comparing physical examinations with Oracle…"),
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
				"oracle_rows_with_text": scan["oracle_rows_with_text"],
				"oracle_admissions": scan["oracle_admissions"],
				"blank_rows": scan["blank_rows"],
				"erpnext_exams": scan["erpnext_exams"],
				"matched_exams": scan["matched_exams"],
				"extra_exams": scan["extra_exams"],
				"foreign_exams": scan["foreign_exams"],
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
				"message": _(
					"ERPNext already has every physical examination Oracle recorded. Nothing to do."
				),
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
				"Still running in the background ({0} of {1} physical examinations processed)."
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
def preview_physical_examination_reconcile(
	patient: str = "", admission: str = "", limit: int = 0, files=None
) -> dict[str, Any]:
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
			"oracle_rows_with_text": scan["oracle_rows_with_text"],
			"oracle_admissions": scan["oracle_admissions"],
			"blank_rows": scan["blank_rows"],
			"erpnext_exams": scan["erpnext_exams"],
			"matched_exams": scan["matched_exams"],
			"extra_exams": scan["extra_exams"],
			"foreign_exams": scan["foreign_exams"],
			"missing_free": sum(1 for item in items if item[2] == "free"),
			"missing_blocked": sum(1 for item in items if item[2] == "blocked"),
			"missing_total": len(items),
			"admissions_with_missing": len({item[1] for item in items}),
			"blocked_sample": [[num, adm, claimant] for num, adm, claimant in blocked_rows[:10]],
			"samples": [
				{
					"number": row["trans_no"],
					"admission": row.get("admission_num"),
					"date": _exam_date(row),
					"text": _norm_exam_text(row.get("phys_signs"))[:160],
				}
				for row in sample_rows
			],
		}
		if source is not None:
			result["oracle_table"] = source.describe(ORACLE_TABLE)
	result["in_sync"] = not cint(result["missing_total"])
	return result


@frappe.whitelist()
def start_physical_examination_reconcile(
	patient: str = "",
	admission: str = "",
	limit: int = 0,
	dry_run: int = 0,
	suffix_conflicts: int = 1,
	files=None,
) -> dict[str, Any]:
	_require_admin()
	files = normalize_files(files)
	if _lock_held():
		return {
			"queued": False,
			"running": True,
			"message": _("A physical examination reconciliation is already running."),
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
		"healthcare.api.physical_examination_reconcile.run_physical_examination_reconcile",
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
def get_physical_examination_reconcile_status() -> dict[str, Any]:
	_require_admin()
	return _load_progress() or {
		"job_key": JOB_KEY,
		"state": "idle",
		"processed": 0,
		"total": 0,
	}


def run_physical_examination_reconcile(
	limit: int = 0,
	resume: int = 0,
	token: str | None = None,
	dry_run: int = 0,
	suffix_conflicts: int = 1,
	patient: str = "",
	admission: str = "",
	files: Any = None,
) -> dict[str, Any]:
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
				"message": _("A physical examination reconciliation is already running."),
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
		frappe.log_error(title="Physical examination reconciliation failed")
		raise
	finally:
		if not outcome.get("handed_over"):
			_release_lock(token)
	return outcome
