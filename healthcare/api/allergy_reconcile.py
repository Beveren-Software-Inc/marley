"""One-button Oracle -> ERPNext reconciliation for allergy Warning Messages.

Allergies reach ERPNext from more than ``PATIENT_WARNING_MESSAGES``:

* Patient master ``ALLERGIES_HISTORY`` (Oracle ``PATIENT_INFO_01`` /
  ``Patient.allergies``), and
* Visit allergy text (Oracle ``VISIT_00_01.VISIT_ALLERGIES_HISTORY`` /
  ``Patient Visit.visit_allergies_history``).

Those free-text fields must become ``Warning Message`` rows with
``is_allergy`` ticked so the patient popup and allergy checklist see them.
The Warning Messages reconcile does *not* read these fields — this button does.

What one run does
-----------------
1. Collects non-empty allergy text per patient from:

   * ERPNext ``Patient.allergies`` and ``Patient Visit.visit_allergies_history``
     (always — visits already imported), and
   * Oracle / Excel ``PATIENT_INFO_01.ALLERGIES_HISTORY`` and
     ``VISIT_00_01.VISIT_ALLERGIES_HISTORY`` when a live link or upload is used.

2. Deduplicates by patient + normalised plain text (latest non-empty visit wins
   the reference link when several visits share the same words).
3. Skips when that patient already has a Warning Message with the same words.
   If the words match but ``is_allergy`` is off, only the flag is turned on —
   the warning text is never overwritten.
4. Creates missing rows as Medical / Allergy with ``is_allergy`` and
   ``from_patient`` set. Non-allergy warnings are never edited or deleted.

Usage::

    bench --site <site> execute healthcare.api.allergy_reconcile.preview_allergy_reconcile
    bench --site <site> execute healthcare.api.allergy_reconcile.start_allergy_reconcile
    bench --site <site> execute healthcare.api.allergy_reconcile.get_allergy_reconcile_status
"""

from __future__ import annotations

import re
import time
from html import unescape
from typing import Any, Iterable

import frappe
from frappe import _
from frappe.utils import cint, now_datetime, nowdate, strip_html

from healthcare.api.oracle_excel_source import current_source, excel_source, normalize_files, oracle_schema
from healthcare.api.oracle_sync import _fetch_rows
from healthcare.api.patient_info_import import (
	LEGACY_ALLERGY_WARNING_CLASS,
	LEGACY_ALLERGY_WARNING_TYPE,
	_cell_text,
	_clean_oracle_num,
	_legacy_allergy_warning_html,
	_normalize_allergy_text,
	_require_admin,
)
from healthcare.api.warning_message import allocate_warning_trans_id

JOB_KEY = "allergy_reconcile"
PROGRESS_KEY = "healthcare:allergy_reconcile:progress"
WORK_KEY = "healthcare:allergy_reconcile:work"
LOCK_KEY = "healthcare:allergy_reconcile:lock"
PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6

PATIENT_TABLE = "PATIENT_INFO_01"
VISIT_TABLE = "VISIT_00_01"
DOCTYPE = "Warning Message"
VISIT_ALLERGY_CLASS = "VISIT_00_01"

IMPORT_CHUNK = 200
TIME_BUDGET = 15 * 60
SAMPLE_LIMIT = 15
ERROR_LIMIT = 5
ERP_PAGE = 5000

_TAG = re.compile(r"<[^>]+>")
_SPACES = re.compile(r"\s+")


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
	return (frappe.cache().get_value(_lock_key()) or b"").decode() == token


def _refresh_lock(token: str) -> None:
	frappe.cache().set(_lock_key(), token.encode(), ex=LOCK_TTL)


def _release_lock(token: str | None) -> None:
	if _owns_lock(token):
		frappe.cache().delete(_lock_key())


def _lock_held() -> bool:
	return bool(frappe.cache().get_value(_lock_key()))


def _new_progress(limit: int = 0) -> dict:
	stamp = str(now_datetime())
	return {
		"job_key": JOB_KEY,
		"state": "queued",
		"limit": cint(limit),
		"dry_run": 0,
		"patient": "",
		"files": [],
		"index": 0,
		"processed": 0,
		"total": 0,
		"allergy_texts": 0,
		"patients_with_allergy": 0,
		"erpnext_allergy_warnings": 0,
		"matched": 0,
		"missing_total": 0,
		"created": 0,
		"flagged": 0,
		"skipped_existing": 0,
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


def _norm_match_key(value: Any) -> str:
	"""Case-folded plain text used to decide 'same allergy words'."""
	text = _normalize_allergy_text(value)
	if not text:
		return ""
	plain = strip_html(unescape(text))
	plain = _TAG.sub(" ", plain)
	plain = _SPACES.sub(" ", plain).strip().lower()
	return plain


# ---------------------------------------------------------------------------
# Collect allergy texts (ERPNext + optional Oracle)
# ---------------------------------------------------------------------------


def _oracle_table_available(table: str) -> bool:
	source = current_source()
	if source is not None:
		return bool(source.has_table(table))
	return True


def _collect_oracle_patient_allergies() -> list[dict[str, str]]:
	"""PATIENT_INFO_01.ALLERGIES_HISTORY -> [{patient, text, source}]."""
	if not _oracle_table_available(PATIENT_TABLE):
		return []
	try:
		rows = _fetch_rows(PATIENT_TABLE)
	except Exception:
		frappe.log_error(title="Allergy reconcile: PATIENT_INFO_01 read failed")
		return []

	out: list[dict[str, str]] = []
	for row in rows or []:
		patient = _clean_oracle_num(
			row.get("FILE_NO") or row.get("PATIENT_NUM") or row.get("PATIENT_FILE_NO") or row.get("C")
		)
		text = _normalize_allergy_text(
			row.get("ALLERGIES_HISTORY") or row.get("ALLERGIES") or row.get("allergies")
		)
		if not patient or not text:
			continue
		out.append(
			{
				"patient": patient,
				"text": text,
				"source": "patient",
				"reference_doc": "Patient",
				"reference_name": patient,
				"visit": "",
				"sort_key": "",
			}
		)
	return out


def _collect_oracle_visit_allergies() -> list[dict[str, str]]:
	"""VISIT_00_01.VISIT_ALLERGIES_HISTORY -> [{patient, text, visit, ...}]."""
	if not _oracle_table_available(VISIT_TABLE):
		return []
	try:
		rows = _fetch_rows(VISIT_TABLE)
	except Exception:
		frappe.log_error(title="Allergy reconcile: VISIT_00_01 read failed")
		return []

	out: list[dict[str, str]] = []
	for row in rows or []:
		patient = _clean_oracle_num(
			row.get("VISIT_PATIENT_NUM") or row.get("PATIENT_NUM") or row.get("PATIENT_FILE_NO")
		)
		visit = _clean_oracle_num(row.get("VISIT_NUM"))
		text = _normalize_allergy_text(
			row.get("VISIT_ALLERGIES_HISTORY") or row.get("visit_allergies_history")
		)
		if not patient or not text:
			continue
		sort_key = _cell_text(row.get("VISIT_DATE") or row.get("CR_DATE") or "")
		out.append(
			{
				"patient": patient,
				"text": text,
				"source": "visit",
				"reference_doc": "Patient Visit",
				"reference_name": visit,
				"visit": visit,
				"sort_key": sort_key,
			}
		)
	return out


def _collect_erpnext_patient_allergies(patient_filter: str = "") -> list[dict[str, str]]:
	filters: dict[str, Any] = {}
	if patient_filter:
		filters["name"] = patient_filter
	out: list[dict[str, str]] = []
	after = ""
	while True:
		clause = list(filters.items())
		if after:
			clause.append(["name", ">", after])
		rows = frappe.get_all(
			"Patient",
			filters=clause,
			fields=["name", "allergies"],
			order_by="name asc",
			limit_page_length=ERP_PAGE,
		)
		if not rows:
			break
		for row in rows:
			text = _normalize_allergy_text(row.get("allergies"))
			if not text:
				continue
			patient = row["name"]
			out.append(
				{
					"patient": patient,
					"text": text,
					"source": "patient",
					"reference_doc": "Patient",
					"reference_name": patient,
					"visit": "",
					"sort_key": "",
				}
			)
		after = rows[-1]["name"]
		if len(rows) < ERP_PAGE:
			break
	return out


def _collect_erpnext_visit_allergies(patient_filter: str = "") -> list[dict[str, str]]:
	filters: dict[str, Any] = [["visit_allergies_history", "is", "set"]]
	if patient_filter:
		filters.append(["patient", "=", patient_filter])
	out: list[dict[str, str]] = []
	after = ""
	while True:
		page_filters = list(filters)
		if after:
			page_filters.append(["name", ">", after])
		rows = frappe.get_all(
			"Patient Visit",
			filters=page_filters,
			fields=["name", "patient", "visit_allergies_history", "visit_date", "creation"],
			order_by="name asc",
			limit_page_length=ERP_PAGE,
		)
		if not rows:
			break
		for row in rows:
			text = _normalize_allergy_text(row.get("visit_allergies_history"))
			patient = (row.get("patient") or "").strip()
			if not text or not patient:
				continue
			sort_key = str(row.get("visit_date") or row.get("creation") or "")
			out.append(
				{
					"patient": patient,
					"text": text,
					"source": "visit",
					"reference_doc": "Patient Visit",
					"reference_name": row["name"],
					"visit": row["name"],
					"sort_key": sort_key,
				}
			)
		after = rows[-1]["name"]
		if len(rows) < ERP_PAGE:
			break
	return out


def _patient_exists(patient: str) -> bool:
	return bool(patient) and frappe.db.exists("Patient", patient)


def _dedupe_candidates(rows: list[dict[str, str]]) -> list[dict[str, str]]:
	"""One entry per patient + normalised text; latest visit wins the reference."""
	best: dict[tuple[str, str], dict[str, str]] = {}
	for row in rows:
		patient = (row.get("patient") or "").strip()
		text = _normalize_allergy_text(row.get("text"))
		key = _norm_match_key(text)
		if not patient or not key:
			continue
		slot = (patient, key)
		prev = best.get(slot)
		if not prev:
			best[slot] = {**row, "text": text, "match_key": key}
			continue
		# Prefer visit over patient master when both hold the same words and the
		# visit is newer; otherwise keep whichever has the later sort_key.
		prev_sort = prev.get("sort_key") or ""
		new_sort = row.get("sort_key") or ""
		if new_sort >= prev_sort and row.get("source") == "visit":
			best[slot] = {**row, "text": text, "match_key": key}
		elif not prev_sort and new_sort:
			best[slot] = {**row, "text": text, "match_key": key}
	return sorted(best.values(), key=lambda r: (r["patient"], r["match_key"]))


def _existing_allergy_index(patients: Iterable[str] | None = None) -> dict[str, list[dict]]:
	"""patient -> list of {name, match_key, is_allergy} for their Warning Messages."""
	index: dict[str, list[dict]] = {}
	patient_list = [p for p in (patients or []) if p]
	if patient_list:
		# Chunked IN queries for large patient sets.
		chunk = 500
		rows: list[dict] = []
		for i in range(0, len(patient_list), chunk):
			part = patient_list[i : i + chunk]
			rows.extend(
				frappe.get_all(
					DOCTYPE,
					filters={"patient": ("in", part)},
					fields=["name", "patient", "warning", "is_allergy"],
				)
			)
	else:
		after = ""
		rows = []
		while True:
			page_filters = []
			if after:
				page_filters.append(["name", ">", after])
			batch = frappe.get_all(
				DOCTYPE,
				filters=page_filters or None,
				fields=["name", "patient", "warning", "is_allergy"],
				order_by="name asc",
				limit_page_length=ERP_PAGE,
			)
			if not batch:
				break
			rows.extend(batch)
			after = batch[-1]["name"]
			if len(batch) < ERP_PAGE:
				break

	for row in rows:
		patient = (row.get("patient") or "").strip()
		key = _norm_match_key(row.get("warning"))
		if not patient or not key:
			continue
		index.setdefault(patient, []).append(
			{
				"name": row["name"],
				"match_key": key,
				"is_allergy": cint(row.get("is_allergy")),
			}
		)
	return index


def _scan(patient: str = "") -> dict[str, Any]:
	patient = (patient or "").strip()
	collected: list[dict[str, str]] = []
	collected.extend(_collect_erpnext_patient_allergies(patient))
	collected.extend(_collect_erpnext_visit_allergies(patient))
	# Oracle / Excel (same texts often already on Patient / Visit — dedupe later).
	collected.extend(_collect_oracle_patient_allergies())
	collected.extend(_collect_oracle_visit_allergies())
	if patient:
		collected = [row for row in collected if row.get("patient") == patient]

	candidates = _dedupe_candidates(collected)
	# Drop rows for patients that do not exist in ERPNext.
	resolvable = [row for row in candidates if _patient_exists(row["patient"])]
	unresolved = len(candidates) - len(resolvable)

	existing = _existing_allergy_index({row["patient"] for row in resolvable})
	allergy_warning_count = sum(
		1
		for rows in existing.values()
		for row in rows
		if cint(row.get("is_allergy"))
	)

	missing: list[dict[str, str]] = []
	matched = 0
	for row in resolvable:
		hits = [
			hit
			for hit in existing.get(row["patient"]) or []
			if hit["match_key"] == row["match_key"]
		]
		if hits:
			matched += 1
			# Still work the row if every hit lacks is_allergy (flag-only fix).
			if any(cint(hit.get("is_allergy")) for hit in hits):
				continue
			row = {**row, "action": "flag", "existing_name": hits[0]["name"]}
			missing.append(row)
			continue
		missing.append({**row, "action": "create"})

	return {
		"allergy_texts": len(resolvable),
		"patients_with_allergy": len({row["patient"] for row in resolvable}),
		"erpnext_allergy_warnings": allergy_warning_count,
		"matched": matched,
		"missing": missing,
		"missing_total": len(missing),
		"unresolved_patients": unresolved,
		"oracle_table": f"{oracle_schema()}.{PATIENT_TABLE} + {VISIT_TABLE}",
	}


def _work_items(scan: dict, *, patient: str = "", limit: int = 0) -> list[dict[str, str]]:
	items = list(scan.get("missing") or [])
	patient = (patient or "").strip()
	if patient:
		items = [item for item in items if item.get("patient") == patient]
	items.sort(key=lambda item: (item.get("patient") or "", item.get("match_key") or ""))
	if cint(limit) > 0:
		items = items[: cint(limit)]
	return items


# ---------------------------------------------------------------------------
# Create / flag
# ---------------------------------------------------------------------------


def _ensure_allergy_warning(item: dict[str, str], *, dry_run: int = 0) -> dict[str, Any]:
	patient = (item.get("patient") or "").strip()
	text = _normalize_allergy_text(item.get("text"))
	if not patient or not text:
		return {"status": "skip_empty"}
	if not _patient_exists(patient):
		return {"status": "skip_no_patient", "patient": patient}

	action = item.get("action") or "create"
	if action == "flag":
		name = item.get("existing_name") or ""
		if not name:
			return {"status": "skip_no_existing"}
		if cint(dry_run):
			return {"status": "dry_run_flag", "name": name}
		if not cint(frappe.db.get_value(DOCTYPE, name, "is_allergy")):
			frappe.db.set_value(DOCTYPE, name, "is_allergy", 1, update_modified=False)
		return {"status": "flagged", "name": name}

	if cint(dry_run):
		return {"status": "dry_run", "patient": patient}

	warning_class = (
		VISIT_ALLERGY_CLASS if item.get("source") == "visit" else LEGACY_ALLERGY_WARNING_CLASS
	)
	fields: dict[str, Any] = {
		"doctype": DOCTYPE,
		"trans_id": allocate_warning_trans_id(),
		"type_of_warning": "Medical",
		"patient": patient,
		"warning": _legacy_allergy_warning_html(text),
		"warning_message_type": LEGACY_ALLERGY_WARNING_TYPE,
		"warning_message_class": warning_class,
		"is_allergy": 1,
		"from_patient": 1,
	}
	ref_doc = (item.get("reference_doc") or "").strip()
	ref_name = (item.get("reference_name") or "").strip()
	if ref_doc and ref_name:
		fields["reference_doc"] = ref_doc
		fields["reference_name"] = ref_name

	doc = frappe.get_doc(fields)
	doc.flags.ignore_links = True
	doc.flags.ignore_validate = True
	doc.flags.ignore_mandatory = True
	doc.insert(ignore_permissions=True)
	return {"status": "created", "name": doc.name, "patient": patient}


def _process_chunk(chunk: list[dict[str, str]], progress: dict, *, dry_run: int = 0) -> None:
	for item in chunk:
		try:
			result = _ensure_allergy_warning(item, dry_run=dry_run)
		except Exception:
			_record_errors(progress, [frappe.get_traceback()])
			frappe.log_error(title="Allergy reconcile row failed")
			continue

		status = result.get("status")
		if status == "created" or status == "dry_run":
			progress["created"] = cint(progress.get("created")) + 1
			_record_samples(
				progress,
				[f"{item.get('patient')}: {(item.get('text') or '')[:80]}"],
			)
		elif status == "flagged" or status == "dry_run_flag":
			progress["flagged"] = cint(progress.get("flagged")) + 1
		elif status == "skip_no_patient":
			progress["skipped_no_patient"] = cint(progress.get("skipped_no_patient")) + 1
		else:
			progress["skipped_existing"] = cint(progress.get("skipped_existing")) + 1


def _summary_message(progress: dict) -> str:
	lines = [
		_("Reconcile Allergies finished."),
		_("Allergy texts found: {0} (across {1} patient(s))").format(
			cint(progress.get("allergy_texts")),
			cint(progress.get("patients_with_allergy")),
		),
		_("Allergy Warning Messages already in ERPNext: {0}").format(
			cint(progress.get("erpnext_allergy_warnings"))
		),
		_("Already matched by text: {0}").format(cint(progress.get("matched"))),
		_("Created: {0}").format(cint(progress.get("created"))),
		_("Flagged is_allergy on existing warning: {0}").format(cint(progress.get("flagged"))),
		_("Skipped (no patient): {0}").format(cint(progress.get("skipped_no_patient"))),
		_("Failed: {0}").format(cint(progress.get("failed"))),
		_("Sources: Patient.allergies, Patient Visit.visit_allergies_history, "
		  "Oracle {0} + {1}").format(PATIENT_TABLE, VISIT_TABLE),
	]
	samples = progress.get("samples") or []
	if samples:
		lines.extend(["", _("Samples")])
		lines.extend(f"• {sample}" for sample in samples)
	errors = progress.get("errors") or []
	if errors:
		lines.extend(["", _("Errors (first {0})").format(len(errors))])
		lines.extend(f"• {error}" for error in errors)
	return "\n".join(lines)


# ---------------------------------------------------------------------------
# Background job
# ---------------------------------------------------------------------------


def _queue_next(token: str, progress: dict, files: Any = None) -> None:
	frappe.enqueue(
		"healthcare.api.allergy_reconcile.run_allergy_reconcile",
		queue="long",
		timeout=7200,
		resume=1,
		token=token,
		dry_run=cint(progress.get("dry_run")),
		files=files,
	)


def _run(
	token: str,
	resume: int,
	limit: int,
	dry_run: int = 0,
	patient: str = "",
	files: Any = None,
) -> dict[str, Any]:
	started = time.monotonic()
	progress = (_load_progress() if cint(resume) else {}) or _new_progress(limit)
	if cint(resume):
		limit = cint(progress.get("limit")) or cint(limit)
		dry_run = cint(progress.get("dry_run"))
		patient = progress.get("patient") or patient
		files = progress.get("files") or files

	items = (_load_work().get("items") or []) if cint(resume) else []
	if not items:
		progress.update(
			{
				"state": "scanning",
				"limit": cint(limit),
				"dry_run": cint(dry_run),
				"patient": patient or "",
				"files": files or [],
				"index": 0,
				"processed": 0,
				"message": _("Collecting allergy text from visits, patients and Oracle…"),
			}
		)
		_set_progress(progress)

		scan = _scan(patient=patient)
		items = _work_items(scan, patient=patient, limit=limit)
		_set_work({"items": items, "built_at": str(now_datetime())})
		progress.update(
			{
				"allergy_texts": scan["allergy_texts"],
				"patients_with_allergy": scan["patients_with_allergy"],
				"erpnext_allergy_warnings": scan["erpnext_allergy_warnings"],
				"matched": scan["matched"],
				"missing_total": len(items),
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
					"Every allergy text on patients and visits already has an "
					"is_allergy Warning Message."
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
		_process_chunk(chunk, progress, dry_run=cint(dry_run))
		progress["index"] = offset + len(chunk)
		progress["processed"] = cint(progress.get("index"))
		frappe.db.commit()
		_set_progress(progress)
		_refresh_lock(token)

		if time.monotonic() - started > TIME_BUDGET:
			progress["state"] = "queued"
			progress["message"] = _("Still running ({0} of {1}).").format(
				cint(progress.get("processed")), cint(progress.get("total"))
			)
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
def preview_allergy_reconcile(patient: str = "", limit: int = 0, files=None) -> dict[str, Any]:
	"""Read-only: which allergy texts still need an is_allergy Warning Message?"""
	_require_admin()
	files = normalize_files(files)
	# Excel upload only needs VISIT_00_01; patient allergies come from
	# Patient.allergies (and live PATIENT_INFO_01 when Oracle is direct).
	with excel_source(files, tables=[VISIT_TABLE]) as source:
		scan = _scan(patient=patient)
		items = _work_items(scan, patient=patient, limit=limit)
		result: dict[str, Any] = {
			"ok": True,
			"as_of": str(nowdate()),
			"mode": "patient" if patient else "site",
			"oracle_table": scan["oracle_table"],
			"allergy_texts": scan["allergy_texts"],
			"oracle_rows": scan["allergy_texts"],
			"patients_with_allergy": scan["patients_with_allergy"],
			"erpnext_allergy_warnings": scan["erpnext_allergy_warnings"],
			"erpnext_rows": scan["erpnext_allergy_warnings"],
			"matched": scan["matched"],
			"missing_total": len(items),
			"unresolved_patients": scan["unresolved_patients"],
			"samples": [
				{
					"patient": item.get("patient"),
					"text": (item.get("text") or "")[:120],
					"admission": item.get("visit") or "",
					"number": item.get("action") or "create",
				}
				for item in items[:10]
			],
		}
		if source is not None and source.has_table(VISIT_TABLE):
			result["oracle_table"] = (
				f"{source.describe(VISIT_TABLE)} + Patient.allergies (ERPNext)"
			)
	result["in_sync"] = not cint(result["missing_total"])
	return result


@frappe.whitelist()
def start_allergy_reconcile(
	patient: str = "", limit: int = 0, dry_run: int = 0, files=None
) -> dict[str, Any]:
	"""Queue one allergy reconciliation."""
	_require_admin()
	files = normalize_files(files)
	if _lock_held():
		return {
			"queued": False,
			"running": True,
			"message": _("An allergy reconciliation is already running."),
			"status": _load_progress(),
		}

	progress = _new_progress(limit)
	progress.update(
		{
			"state": "queued",
			"dry_run": cint(dry_run),
			"patient": patient or "",
			"files": files,
			"message": (
				_("Queued. The uploaded Excel export is read in the background.")
				if files
				else _("Queued. Visits, patients and Oracle are read in the background.")
			),
		}
	)
	_set_progress(progress)

	frappe.enqueue(
		"healthcare.api.allergy_reconcile.run_allergy_reconcile",
		queue="long",
		timeout=7200,
		limit=cint(limit),
		dry_run=cint(dry_run),
		patient=patient or "",
		files=files,
	)
	return {"queued": True, "job_key": JOB_KEY, "status": progress}


@frappe.whitelist()
def get_allergy_reconcile_status() -> dict[str, Any]:
	"""Progress of the last / ongoing allergy reconciliation."""
	_require_admin()
	return _load_progress() or {
		"job_key": JOB_KEY,
		"state": "idle",
		"processed": 0,
		"total": 0,
	}


def run_allergy_reconcile(
	limit: int = 0,
	resume: int = 0,
	token: str | None = None,
	dry_run: int = 0,
	patient: str = "",
	files: Any = None,
) -> dict[str, Any]:
	"""Background entry point (also callable from the bench console)."""
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
				"message": _("An allergy reconciliation is already running."),
			}

	outcome: dict[str, Any] = {}
	try:
		with excel_source(files, tables=[VISIT_TABLE]):
			outcome = _run(token, cint(resume), cint(limit), cint(dry_run), patient or "", files)
	except Exception:
		progress = _load_progress() or _new_progress()
		progress["state"] = "failed"
		progress["message"] = frappe.get_traceback()
		_record_errors(progress, [frappe.get_traceback()])
		_set_progress(progress)
		frappe.log_error(title="Allergy reconciliation failed")
		raise
	finally:
		if not outcome.get("handed_over"):
			_release_lock(token)
	return outcome
