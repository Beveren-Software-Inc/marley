"""One-button Oracle -> ERPNext reconciliation for the IP nursing notes.

Oracle keeps every inpatient nursing note in ``CLINIC2.IP_NURSING`` - one row
per shift entry, ``TRANS_NUM`` = the legacy transaction number. ERPNext keeps
the same notes in ``Main Nursing Note``, whose ``trans_no`` holds that
``TRANS_NUM`` (``autoname`` is ``field:trans_no``, so the document name *is* the
legacy number). The workbook import
(``healthcare.api.main_nursing_note_import``) only runs when somebody exports
the table by hand, so the register silently stops at the export date: on serene
Oracle holds 425,895 notes with text while ERPNext never imported the 2,454
rows of the tail - plus 3,360 rows whose ``TRANS_NUM`` an ERPNext note of
*another* admission already took (the in-app "next trans no" helper hands out
the highest number + 1, which Oracle had already used for a different patient).
A nursing note that exists in the legacy system but not in ERPNext is a record
that cannot be printed, audited or handed over - exactly what this button fixes.

What one run does
-----------------
1. Reads ``IP_NURSING`` (live from Oracle, or from its uploaded Excel export)
   and compares it, number by number, with ``tabMain Nursing Note``.
2. A row counts as imported when a note of the *same admission* carries its
   ``TRANS_NUM``. Rows whose ``TRANS_NUM`` is still free in ERPNext are simply
   created.
3. A row whose ``TRANS_NUM`` is already the name of another admission's note is
   created under ``<TRANS_NUM>-N`` (``-N-2`` if that is taken too), so both
   notes survive: the live app note is never renamed, merged or deleted. Turn
   that off with *suffix_conflicts* to only report those rows.
4. Before creating anything the note text is compared with the notes the
   admission already has (case, spacing and the importer's ``[HH:MM]`` prefix
   ignored). A row whose words are already on the shift note - the app appends
   text to the existing shift note - is skipped, so a second run never doubles
   the ward notes.
5. Existing notes are never edited or deleted: only what is missing is added,
   which makes a run idempotent (a second run finds nothing to do).

Execution model
---------------
The comparison is one pass over both sides (keyset pages of ``tabMain Nursing
Note``, one Oracle query). The import then runs in a self-chaining background
job on the ``long`` queue: it works through the missing rows in chunks, commits
after each chunk, keeps its progress in the cache (polled by the Healthcare
Settings dialog) and re-enqueues itself until the work list is exhausted.

Usage::

    bench --site <site> execute healthcare.api.main_nursing_note_reconcile.preview_main_nursing_note_reconcile
    bench --site <site> execute healthcare.api.main_nursing_note_reconcile.start_main_nursing_note_reconcile
    bench --site <site> execute healthcare.api.main_nursing_note_reconcile.get_main_nursing_note_reconcile_status
    # inline (no queue), handy for a first smoke test on a real site:
    bench --site <site> execute healthcare.api.main_nursing_note_reconcile.run_main_nursing_note_reconcile --kwargs "{'limit': 5}"
"""

from __future__ import annotations

import re
import time
from typing import Any, Iterable

import frappe
from frappe import _
from frappe.utils import cint, now_datetime, nowdate

from healthcare.api.main_nursing_note_import import (
	EXCEL_HEADER_MAP,
	_resolve_admission,
	upsert_main_nursing_note_from_row,
)
from healthcare.api.oracle_excel_source import excel_source, normalize_files, oracle_schema
from healthcare.api.oracle_sync import _fetch_rows, _query
from healthcare.api.patient_info_import import _cell_text, _clean_oracle_num, _require_admin
from healthcare.api.visit_diagnosis_sync import _resolve_inpatient_admission

JOB_KEY = "main_nursing_note_reconcile"
PROGRESS_KEY = "healthcare:main_nursing_note_reconcile:progress"
WORK_KEY = "healthcare:main_nursing_note_reconcile:work"
LOCK_KEY = "healthcare:main_nursing_note_reconcile:lock"
PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6

ORACLE_TABLE = "IP_NURSING"
DOCTYPE = "Main Nursing Note"
ADMISSION_DOCTYPE = "Inpatient Admission"
# Suffix used when an Oracle TRANS_NUM is already the name of another
# admission's note. ``_numeric_key`` maps it back to the Oracle number, so the
# reconcile recognises its own rows on the next run.
CONFLICT_SUFFIX = "-N"

ERP_PAGE = 50000  # keyset page over `tabMain Nursing Note` (primary key scan)
IMPORT_CHUNK = 300  # Oracle rows read and imported per iteration
TIME_BUDGET = 15 * 60
SAMPLE_LIMIT = 15
ERROR_LIMIT = 5
_TIME_PREFIX = re.compile(r"^\[\d{2}:\d{2}\]\s*", re.MULTILINE)
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
	"""Redis key scoped to the site (``frappe.cache().set`` does not add the db prefix)."""
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
		# Oracle side
		"oracle_rows": 0,
		"oracle_rows_with_text": 0,
		"oracle_admissions": 0,
		"blank_rows": 0,
		# ERPNext side
		"erpnext_notes": 0,
		"matched_notes": 0,
		"missing_free": 0,
		"missing_blocked": 0,
		"missing_total": 0,
		"foreign_notes": 0,
		"extra_notes": 0,
		# Repair
		"created": 0,
		"suffixed_trans_nos": 0,
		"skipped_existing": 0,
		"skipped_same_text": 0,
		"skipped_conflict": 0,
		"skipped_no_admission": 0,
		"skipped_no_notes": 0,
		# Problems
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
	"""Oracle ``TRANS_NUM`` behind a note's ``trans_no``.

	``435297`` and ``435297-N`` both map to ``435297``: the suffix is only there
	because another admission's note already owns the plain number.
	"""
	text = _clean_oracle_num(value)
	match = _SUFFIXED_KEY.match(text)
	return match.group("number") if match else text


def _norm_text(value: Any) -> str:
	"""Note text without the importer's ``[HH:MM]`` prefix, case or spacing noise."""
	text = _cell_text(value).replace("\r\n", "\n")
	text = _TIME_PREFIX.sub("", text)
	text = re.sub(r"[ \t]+", " ", text)
	return text.strip().lower()


def _sql_text(value: str) -> str:
	"""A quoted literal: ``TRANS_NUM`` is a NUMBER in Oracle and TEXT in SQLite."""
	return "'" + str(value).replace("'", "''") + "'"


# ---------------------------------------------------------------------------
# Comparison: Oracle IP_NURSING vs tabMain Nursing Note
# ---------------------------------------------------------------------------


def _oracle_note_index() -> dict[str, str]:
	"""``TRANS_NUM`` -> ``ADMISSION_NUM`` for every Oracle note that has text.

	Rows whose ``NURSING_DESC`` is blank are the ones the workbook import skips
	as well, so they can never be "missing".
	"""
	rows = _query(
		f"select TRANS_NUM, ADMISSION_NUM from {oracle_schema()}.{ORACLE_TABLE} "
		"where trim(NURSING_DESC) is not null"
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
		f"select count(*) as TOTAL, "
		"sum(case when trim(NURSING_DESC) is not null then 1 else 0 end) as WITH_TEXT, "
		f"count(distinct ADMISSION_NUM) as ADMISSIONS from {oracle_schema()}.{ORACLE_TABLE}"
	)
	row = (rows or [{}])[0]
	total = cint(row.get("TOTAL"))
	with_text = cint(row.get("WITH_TEXT"))
	return {
		"oracle_rows": total,
		"oracle_rows_with_text": with_text,
		"oracle_admissions": cint(row.get("ADMISSIONS")),
		"blank_rows": max(total - with_text, 0),
	}


def _erpnext_page(after: str = "", limit: int = ERP_PAGE) -> list[tuple]:
	"""One keyset page of ``tabMain Nursing Note`` (primary-key range scan)."""
	return frappe.db.sql(
		"""
		select name, trans_no, ifnull(admission, '')
		from `tabMain Nursing Note`
		where name > %s
		order by name asc
		limit %s
		""",
		(after, limit),
	)


def _scan() -> dict:
	"""Exact, number-by-number comparison of the two registers.

	Returns the Oracle rows ERPNext is missing, split into the ones whose
	``TRANS_NUM`` is still free (``missing_free``) and the ones an ERPNext note
	of another admission already uses (``missing_blocked``). Only the missing
	and the blocked numbers are kept, so the site-wide scan stays small.
	"""
	totals = _oracle_totals()
	oracle = _oracle_note_index()

	missing = set(oracle)
	blocked: dict[str, str] = {}
	matched = 0
	foreign_notes = 0
	extra_notes = 0
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
				extra_notes += 1
				continue
			if owner == admission:
				blocked.pop(key, None)
				if key in missing:
					missing.discard(key)
					matched += 1
				continue
			foreign_notes += 1
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
		"erpnext_notes": erp_total,
		"matched_notes": matched,
		"extra_notes": extra_notes,
		"foreign_notes": foreign_notes,
		"missing_free": missing_free,
		"missing_blocked": missing_blocked,
	}


# ---------------------------------------------------------------------------
# Repair: create the notes ERPNext is missing
# ---------------------------------------------------------------------------


def _prepare_row(raw: dict) -> dict | None:
	"""One ``IP_NURSING`` row in the shape ``main_nursing_note_import`` expects."""
	row: dict[str, Any] = {}
	for name, value in (raw or {}).items():
		key = EXCEL_HEADER_MAP.get(str(name or "").strip().upper(), str(name or "").strip().lower())
		row[key] = value

	trans_num = _clean_oracle_num(row.get("trans_num"))
	if not trans_num:
		return None
	row["trans_num"] = trans_num
	row["admission_num"] = _clean_oracle_num(row.get("admission_num"))
	row["admission_num_old"] = _clean_oracle_num(row.get("admission_num_old"))
	row["branch_num"] = _clean_oracle_num(row.get("branch_num"))
	row["shift_code"] = _cell_text(row.get("shift_code")).strip()
	row["user_name"] = _cell_text(row.get("user_name")).strip()
	row["nursing_desc"] = _cell_text(row.get("nursing_desc"))
	return row


def _oracle_rows_by_numbers(numbers: list[str]) -> list[dict]:
	"""The Oracle rows of these ``TRANS_NUM``s (quoted: NUMBER in Oracle, TEXT in SQLite)."""
	if not numbers:
		return []
	where = "TRANS_NUM in (" + ", ".join(_sql_text(num) for num in numbers) + ")"
	return _fetch_rows(ORACLE_TABLE, where=where, order_by="ADMISSION_NUM, NURSING_DATE, TRANS_NUM")


def _existing_notes(admission: str) -> tuple[set[str], str]:
	"""Oracle numbers already on this admission's notes, plus their normalised text."""
	rows = frappe.get_all(
		DOCTYPE,
		filters={"admission": admission},
		fields=["trans_no", "nursing_notes"],
		limit_page_length=0,
	)
	numbers = {_numeric_key(row.get("trans_no")) for row in rows if row.get("trans_no")}
	blob = "\n".join(filter(None, (_norm_text(row.get("nursing_notes")) for row in rows)))
	return numbers, blob


def _free_suffixed_trans_no(trans_num: str) -> str:
	"""``<TRANS_NUM>-N`` (``-N-2`` ... ) - a name that leaves the other note alone."""
	candidate = f"{trans_num}{CONFLICT_SUFFIX}"
	index = 2
	while frappe.db.exists(DOCTYPE, candidate):
		candidate = f"{trans_num}{CONFLICT_SUFFIX}-{index}"
		index += 1
	return candidate


def _row_label(row: dict) -> str:
	text = _cell_text(row.get("nursing_desc")).replace("\n", " ").strip()
	date = _cell_text(row.get("nursing_date"))[:10]
	return f"{row.get('trans_num')} · {date} · {text[:70]}"


def _process_chunk(
	items: list[list[str]],
	progress: dict,
	*,
	dry_run: int = 0,
	suffix_conflicts: int = 1,
) -> None:
	"""Create the notes of one chunk of missing Oracle rows."""
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
		existing_numbers, blob = _existing_notes(admission)
		for row in rows:
			trans_num = row["trans_num"]
			if trans_num in existing_numbers:
				progress["skipped_existing"] = cint(progress.get("skipped_existing")) + 1
				continue
			text = _norm_text(row.get("nursing_desc"))
			if text and text in blob:
				progress["skipped_same_text"] = cint(progress.get("skipped_same_text")) + 1
				continue

			create_num = trans_num
			if frappe.db.exists(DOCTYPE, trans_num):
				if not cint(suffix_conflicts):
					progress["skipped_conflict"] = cint(progress.get("skipped_conflict")) + 1
					_record_samples(progress, [f"{_row_label(row)} (trans no taken)"])
					continue
				create_num = _free_suffixed_trans_no(trans_num)

			progress["created"] = cint(progress.get("created")) + 1
			if create_num != trans_num:
				progress["suffixed_trans_nos"] = cint(progress.get("suffixed_trans_nos")) + 1
			_record_samples(progress, [f"{create_num} · admission {admission} · {_row_label(row)}"])
			if cint(dry_run):
				continue

			try:
				result = upsert_main_nursing_note_from_row({**row, "trans_num": create_num})
			except Exception:
				_record_errors(progress, [f"{create_num}: {frappe.get_traceback()}"])
				continue
			status = (result or {}).get("status")
			if status == "skip_no_admission":
				progress["skipped_no_admission"] = cint(progress.get("skipped_no_admission")) + 1
				progress["created"] = cint(progress.get("created")) - 1
			elif status == "skip_no_notes":
				progress["skipped_no_notes"] = cint(progress.get("skipped_no_notes")) + 1
				progress["created"] = cint(progress.get("created")) - 1
			elif status not in ("created", "updated"):
				_record_errors(progress, [f"{create_num}: {status or 'unexpected result'}"])
				progress["created"] = cint(progress.get("created")) - 1


# ---------------------------------------------------------------------------
# Work list and filters
# ---------------------------------------------------------------------------

_ADMISSION_NAMES: dict[str, str | None] = {}


def _resolve_admission_number(admission_num: str) -> str | None:
	"""Oracle ``ADMISSION_NUM`` -> ``Inpatient Admission`` name (cached per run)."""
	key = _cell_text(admission_num).strip()
	if not key:
		return None
	if key not in _ADMISSION_NAMES:
		_ADMISSION_NAMES[key] = _resolve_inpatient_admission(key)
	return _ADMISSION_NAMES[key]


def _allowed_admissions(patient: str = "", admission: str = "") -> set[str] | None:
	"""Admissions a run is limited to, or None for the whole site."""
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
	"""Oracle numbers to import, as ``[TRANS_NUM, admission_num, kind]``."""
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
		_("Reconcile Nursing Notes finished."),
		"",
		_("Oracle {0}").format(ORACLE_TABLE),
		_("Notes in Oracle: {0} ({1} without text, skipped)").format(
			cint(progress.get("oracle_rows")), cint(progress.get("blank_rows"))
		),
		_("Admissions in Oracle: {0}").format(cint(progress.get("oracle_admissions"))),
		_("Nursing Notes in ERPNext: {0}").format(cint(progress.get("erpnext_notes"))),
		_("Notes already matched by trans number: {0}").format(cint(progress.get("matched_notes"))),
		_("Missing - trans number still free: {0}").format(cint(progress.get("missing_free"))),
		_("Missing - trans number used by another admission: {0}").format(
			cint(progress.get("missing_blocked"))
		),
		"",
		_("Nursing Notes created: {0}").format(cint(progress.get("created"))),
		_("Created under a suffixed trans number ({0}): {1}").format(
			CONFLICT_SUFFIX, cint(progress.get("suffixed_trans_nos"))
		),
		_("Rows skipped - words already on the admission's notes: {0}").format(
			cint(progress.get("skipped_same_text"))
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
	if progress.get("skipped_no_notes"):
		lines.append(
			_("Rows skipped - no note text: {0}").format(cint(progress.get("skipped_no_notes")))
		)
	if progress.get("foreign_notes"):
		lines.append("")
		lines.append(
			_(
				"Nursing Notes whose trans number Oracle gave to another admission "
				"(left untouched, please review): {0}"
			).format(cint(progress.get("foreign_notes")))
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
		"healthcare.api.main_nursing_note_reconcile.run_main_nursing_note_reconcile",
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
		# A handover re-enqueues the job without the original arguments, so the
		# run it continues is described by the progress record itself.
		limit = cint(progress.get("limit")) or cint(limit)
		dry_run = cint(progress.get("dry_run"))
		suffix_conflicts = cint(progress.get("suffix_conflicts"))
		patient = progress.get("patient") or patient
		admission = progress.get("admission") or admission
		files = progress.get("files") or files

	items = (_load_work().get("items") or []) if cint(resume) else []
	if not items:
		# First pass - or a resumed run whose work list expired from the cache.
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
				"message": _("Comparing the nursing notes with Oracle…"),
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
				"erpnext_notes": scan["erpnext_notes"],
				"matched_notes": scan["matched_notes"],
				"extra_notes": scan["extra_notes"],
				"foreign_notes": scan["foreign_notes"],
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
				"message": _("ERPNext already has every nursing note Oracle recorded. Nothing to do."),
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
				"Still running in the background ({0} of {1} nursing notes processed)."
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
def preview_main_nursing_note_reconcile(
	patient: str = "", admission: str = "", limit: int = 0, files=None
) -> dict[str, Any]:
	"""Read-only answer to "does the nursing note register match Oracle?"."""
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
			"erpnext_notes": scan["erpnext_notes"],
			"matched_notes": scan["matched_notes"],
			"extra_notes": scan["extra_notes"],
			"foreign_notes": scan["foreign_notes"],
			"missing_free": sum(1 for item in items if item[2] == "free"),
			"missing_blocked": sum(1 for item in items if item[2] == "blocked"),
			"missing_total": len(items),
			"admissions_with_missing": len({item[1] for item in items}),
			"blocked_sample": [[num, adm, claimant] for num, adm, claimant in blocked_rows[:10]],
			"samples": [
				{
					"number": row["trans_num"],
					"admission": row.get("admission_num"),
					"date": _cell_text(row.get("nursing_date"))[:10],
					"text": _cell_text(row.get("nursing_desc")).replace("\n", " ")[:160],
				}
				for row in sample_rows
			],
		}
		if source is not None:
			result["oracle_table"] = source.describe(ORACLE_TABLE)
	result["in_sync"] = not cint(result["missing_total"])
	return result


@frappe.whitelist()
def start_main_nursing_note_reconcile(
	patient: str = "",
	admission: str = "",
	limit: int = 0,
	dry_run: int = 0,
	suffix_conflicts: int = 1,
	files=None,
) -> dict[str, Any]:
	"""Queue one reconciliation of the nursing note register (button entry point)."""
	_require_admin()
	files = normalize_files(files)
	if _lock_held():
		return {
			"queued": False,
			"running": True,
			"message": _("A nursing note reconciliation is already running."),
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
		"healthcare.api.main_nursing_note_reconcile.run_main_nursing_note_reconcile",
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
def get_main_nursing_note_reconcile_status() -> dict[str, Any]:
	"""Progress of the last / ongoing reconciliation (polled by the settings dialog)."""
	_require_admin()
	return _load_progress() or {
		"job_key": JOB_KEY,
		"state": "idle",
		"processed": 0,
		"total": 0,
	}


def run_main_nursing_note_reconcile(
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
				"message": _("A nursing note reconciliation is already running."),
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
		frappe.log_error(title="Nursing note reconciliation failed")
		raise
	finally:
		if not outcome.get("handed_over"):
			_release_lock(token)
	return outcome
