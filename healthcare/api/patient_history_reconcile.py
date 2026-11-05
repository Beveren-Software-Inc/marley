"""One-button Oracle -> ERPNext reconciliation for Patient History.

Oracle stores inpatient history form lines in ``CLINIC2.IP_ADMISSION_02`` (many
rows per admission, keyed by ``ATTRIB_NUM``). ERPNext holds one ``Patient
History`` per admission (``inpatient_admission``), with ``history_detail`` child
rows filled by ``attrib_num``. Workbook import
(``healthcare.api.ip_admission_02_import``) only runs when somebody exports the
table by hand, so admissions can exist in Oracle without a Patient History in
ERPNext.

What one run does
-----------------
1. Reads ``IP_ADMISSION_02`` (live Oracle or uploaded Excel) and compares it with
   ``tabPatient History`` by admission (not transaction number).
2. Admissions that already have a Patient History document are left alone. When
   the existing document's filled lines match Oracle (normalised text per
   ``attrib_num``), the admission is counted as already in sync.
3. Admissions with no Patient History are created via
   ``patient_history_import.process_admission_import`` (insert-only from this
   job: existing documents are never updated).
4. Existing Patient History rows are never edited or deleted.

Execution model matches ``main_nursing_note_reconcile``: site-wide scan, work
list in cache, self-chaining ``long`` queue job with lock and progress polling.

Usage::

    bench --site <site> execute healthcare.api.patient_history_reconcile.preview_patient_history_reconcile
    bench --site <site> execute healthcare.api.patient_history_reconcile.start_patient_history_reconcile
    bench --site <site> execute healthcare.api.patient_history_reconcile.get_patient_history_reconcile_status
    bench --site <site> execute healthcare.api.patient_history_reconcile.run_patient_history_reconcile --kwargs "{'limit': 5}"
"""

from __future__ import annotations

import re
import time
from typing import Any, Iterable

import frappe
from frappe import _
from frappe.utils import cint, now_datetime, nowdate, strip_html

from healthcare.api.ip_admission_02_import import (
	EXCEL_HEADER_MAP,
	_apply_date_if_missing,
	_build_import_row,
)
from healthcare.api.oracle_excel_source import excel_source, normalize_files, oracle_schema
from healthcare.api.oracle_sync import _fetch_rows, _query
from healthcare.api.patient_history_import import (
	_default_template_name,
	_template_detail_rows,
	process_admission_import,
)
from healthcare.api.patient_info_import import _cell_text, _clean_oracle_num, _require_admin
from healthcare.api.visit_diagnosis_sync import _resolve_inpatient_admission

JOB_KEY = "patient_history_reconcile"
PROGRESS_KEY = "healthcare:patient_history_reconcile:progress"
WORK_KEY = "healthcare:patient_history_reconcile:work"
LOCK_KEY = "healthcare:patient_history_reconcile:lock"
PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6

ORACLE_TABLE = "IP_ADMISSION_02"
DOCTYPE = "Patient History"
ADMISSION_DOCTYPE = "Inpatient Admission"

ERP_PAGE = 50000
IMPORT_CHUNK = 40
TIME_BUDGET = 15 * 60
SAMPLE_LIMIT = 15
ERROR_LIMIT = 5


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
		"patient": "",
		"admission": "",
		"files": [],
		"index": 0,
		"processed": 0,
		"total": 0,
		"oracle_rows": 0,
		"oracle_admissions": 0,
		"erpnext_histories": 0,
		"matched_histories": 0,
		"missing_admissions": 0,
		"missing_total": 0,
		"extra_histories": 0,
		"created": 0,
		"skipped_existing": 0,
		"skipped_same_content": 0,
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


def _sql_text(value: str) -> str:
	return "'" + str(value).replace("'", "''") + "'"


def _norm_field(value: Any) -> str:
	text = strip_html(_cell_text(value)).strip().lower()
	return re.sub(r"\s+", " ", text) if text else ""


def _attrib_names(template_name: str) -> dict[int, str]:
	return {
		cint(row.get("attrib_num")): row.get("attribute") or ""
		for row in _template_detail_rows(template_name)
		if cint(row.get("attrib_num"))
	}


def _line_fingerprint(attrib_num: int, description: Any, field_1: Any, note_2: Any) -> tuple[int, str, str, str]:
	return (
		attrib_num,
		_norm_field(description),
		_norm_field(field_1),
		_norm_field(note_2),
	)


def _import_rows_fingerprint(import_rows: list[dict]) -> tuple[tuple[int, str, str, str], ...]:
	parts: list[tuple[int, str, str, str]] = []
	for row in import_rows:
		num = cint(row.get("attrib_num"))
		if not num:
			continue
		fp = _line_fingerprint(
			num,
			row.get("description"),
			row.get("field_1"),
			row.get("attribute_note_2"),
		)
		if any(fp[1:]):
			parts.append(fp)
	return tuple(sorted(parts))


def _history_fingerprint_from_doc(inpatient_admission: str) -> tuple[tuple[int, str, str, str], ...]:
	name = frappe.db.get_value(
		DOCTYPE,
		{"inpatient_admission": inpatient_admission},
		"name",
		order_by="creation asc",
	)
	if not name:
		return tuple()
	rows = frappe.get_all(
		"Patient History Detail",
		filters={"parent": name},
		fields=["attrib_num", "description", "field_1", "attrib_note_2"],
		limit_page_length=0,
	)
	parts: list[tuple[int, str, str, str]] = []
	for row in rows:
		num = cint(row.get("attrib_num"))
		if not num:
			continue
		fp = _line_fingerprint(
			num,
			row.get("description"),
			row.get("field_1"),
			row.get("attrib_note_2"),
		)
		if any(fp[1:]):
			parts.append(fp)
	return tuple(sorted(parts))


def _prepare_row(raw: dict, *, attrib_names: dict[int, str]) -> dict | None:
	row: dict[str, Any] = {}
	for name, value in (raw or {}).items():
		key = EXCEL_HEADER_MAP.get(str(name or "").strip().upper(), str(name or "").strip().lower())
		row[key] = value

	admission_num = _clean_oracle_num(row.get("admission_num"))
	attrib_num = _clean_oracle_num(row.get("attrib_num"))
	if not admission_num or not attrib_num:
		return None

	row["admission_num"] = admission_num
	row["admission_num_old"] = _clean_oracle_num(row.get("admission_num_old"))
	row["patient_num"] = _clean_oracle_num(row.get("patient_num"))
	row["attrib_num"] = attrib_num
	row["ip_admission_form_id"] = _clean_oracle_num(row.get("ip_admission_form_id"))
	row["cr_id"] = _clean_oracle_num(row.get("cr_id"))
	row["up_id"] = _clean_oracle_num(row.get("up_id"))
	row["branch_num"] = _clean_oracle_num(row.get("branch_num"))
	return _build_import_row(row, attrib_names=attrib_names)


def _oracle_rows_by_admissions(admission_nums: list[str]) -> list[dict]:
	if not admission_nums:
		return []
	where = "ADMISSION_NUM in (" + ", ".join(_sql_text(num) for num in admission_nums) + ")"
	return _fetch_rows(ORACLE_TABLE, where=where, order_by="ADMISSION_NUM, ATTRIB_NUM")


# ---------------------------------------------------------------------------
# Comparison: Oracle IP_ADMISSION_02 vs tabPatient History
# ---------------------------------------------------------------------------


def _oracle_admission_index() -> dict[str, str]:
	"""``ADMISSION_NUM`` -> ``PATIENT_NUM`` for every admission with form lines."""
	rows = _query(
		f"select ADMISSION_NUM, PATIENT_NUM from {oracle_schema()}.{ORACLE_TABLE} "
		"where ATTRIB_NUM is not null"
	)
	index: dict[str, str] = {}
	for row in rows or []:
		num = _clean_oracle_num(row.get("ADMISSION_NUM"))
		if not num:
			continue
		if num not in index:
			index[num] = _clean_oracle_num(row.get("PATIENT_NUM"))
	return index


def _oracle_totals() -> dict:
	rows = _query(
		f"select count(*) as TOTAL, count(distinct ADMISSION_NUM) as ADMISSIONS "
		f"from {oracle_schema()}.{ORACLE_TABLE} where ATTRIB_NUM is not null"
	)
	row = (rows or [{}])[0]
	return {
		"oracle_rows": cint(row.get("TOTAL")),
		"oracle_admissions": cint(row.get("ADMISSIONS")),
	}


def _erpnext_page(after: str = "", limit: int = ERP_PAGE) -> list[tuple]:
	return frappe.db.sql(
		"""
		select name, ifnull(inpatient_admission, '')
		from `tabPatient History`
		where name > %s
		order by name asc
		limit %s
		""",
		(after, limit),
	)


def _scan() -> dict:
	totals = _oracle_totals()
	oracle = _oracle_admission_index()

	erp_admissions_with_ph: set[str] = set()
	erp_total = 0
	after = ""
	while True:
		rows = _erpnext_page(after)
		if not rows:
			break
		for name, inpatient_admission in rows:
			after = name
			erp_total += 1
			if inpatient_admission:
				erp_admissions_with_ph.add(inpatient_admission)
		if len(rows) < ERP_PAGE:
			break

	missing_admissions: list[list[str]] = []
	matched = 0
	unresolved = 0
	for admission_num, patient_num in oracle.items():
		erp_adm = _resolve_admission_number(admission_num, patient_num)
		if not erp_adm:
			unresolved += 1
			continue
		if erp_adm in erp_admissions_with_ph:
			matched += 1
		else:
			missing_admissions.append([admission_num, patient_num])

	missing_admissions.sort(key=lambda item: cint(item[0]))

	return {
		"oracle_rows": totals["oracle_rows"],
		"oracle_admissions": totals["oracle_admissions"],
		"erpnext_histories": erp_total,
		"matched_histories": matched,
		"unresolved_admissions": unresolved,
		"missing_admissions": missing_admissions,
		"extra_histories": max(erp_total - matched, 0),
	}


# ---------------------------------------------------------------------------
# Repair: create Patient History documents ERPNext is missing
# ---------------------------------------------------------------------------


def _group_import_rows(
	raw_rows: list[dict], *, attrib_names: dict[int, str]
) -> dict[str, list[dict]]:
	by_admission: dict[str, list[dict]] = {}
	for raw in raw_rows:
		prepared = _prepare_row(raw, attrib_names=attrib_names)
		if not prepared:
			continue
		admission = prepared.get("admission") or prepared.get("admission_num") or ""
		if admission:
			by_admission.setdefault(admission, []).append(prepared)
	return by_admission


def _admission_label(admission_num: str, import_rows: list[dict]) -> str:
	filled = sum(
		1
		for row in import_rows
		if _norm_field(row.get("description"))
		or _norm_field(row.get("field_1"))
		or _norm_field(row.get("attribute_note_2"))
	)
	return f"admission {admission_num} · {filled} filled lines"


def _process_chunk(items: list[list[str]], progress: dict, *, dry_run: int = 0) -> None:
	template_name = _default_template_name()
	template_rows = _template_detail_rows(template_name)
	attrib_names = _attrib_names(template_name)

	admission_nums = [item[0] for item in items]
	grouped = _group_import_rows(_oracle_rows_by_admissions(admission_nums), attrib_names=attrib_names)

	for admission_num, patient_num in items:
		import_rows = grouped.get(admission_num) or []
		if not import_rows:
			continue

		erp_adm = _resolve_admission_number(admission_num, patient_num)
		if not erp_adm:
			progress["skipped_no_admission"] = cint(progress.get("skipped_no_admission")) + 1
			_record_samples(
				progress,
				[f"{admission_num}: no Inpatient Admission in ERPNext"],
			)
			continue

		ph_name = frappe.db.get_value(
			DOCTYPE,
			{"inpatient_admission": erp_adm},
			"name",
			order_by="creation asc",
		)
		if ph_name:
			oracle_fp = _import_rows_fingerprint(import_rows)
			existing_fp = _history_fingerprint_from_doc(erp_adm)
			if oracle_fp and existing_fp and oracle_fp == existing_fp:
				progress["skipped_same_content"] = cint(progress.get("skipped_same_content")) + 1
				continue
			progress["skipped_existing"] = cint(progress.get("skipped_existing")) + 1
			_record_samples(
				progress,
				[f"{admission_num}: Patient History exists ({ph_name}) — left unchanged"],
			)
			continue

		progress["created"] = cint(progress.get("created")) + 1
		_record_samples(progress, [f"{erp_adm} · {_admission_label(admission_num, import_rows)}"])
		if cint(dry_run):
			continue

		frappe.flags.healthcare_patient_history_import = True
		try:
			result = process_admission_import(
				admission_num,
				import_rows,
				template_name,
				template_rows,
			)
		except Exception:
			_record_errors(progress, [f"{admission_num}: {frappe.get_traceback()}"])
			progress["created"] = cint(progress.get("created")) - 1
			continue
		finally:
			frappe.flags.healthcare_patient_history_import = False

		if result.get("unresolved_admission"):
			progress["skipped_no_admission"] = cint(progress.get("skipped_no_admission")) + 1
			progress["created"] = cint(progress.get("created")) - 1
			continue
		if not result.get("created"):
			progress["skipped_existing"] = cint(progress.get("skipped_existing")) + 1
			progress["created"] = cint(progress.get("created")) - 1
			continue

		ph_name = result.get("patient_history")
		if ph_name:
			try:
				_apply_date_if_missing(ph_name, import_rows)
			except Exception:
				_record_errors(progress, [f"{admission_num}: date backfill failed"])


# ---------------------------------------------------------------------------
# Work list and filters
# ---------------------------------------------------------------------------

_ADMISSION_NAMES: dict[tuple[str, str], str | None] = {}


def _resolve_admission_number(admission_num: str, patient_num: str = "") -> str | None:
	key = (_cell_text(admission_num).strip(), _cell_text(patient_num).strip())
	if not key[0]:
		return None
	if key not in _ADMISSION_NAMES:
		_ADMISSION_NAMES[key] = _resolve_inpatient_admission(key[0], key[1] or None)
	return _ADMISSION_NAMES[key]


def _allowed_admissions(patient: str = "", admission: str = "") -> set[str] | None:
	if admission:
		return {admission}
	if patient:
		return set(frappe.get_all(ADMISSION_DOCTYPE, filters={"patient": patient}, pluck="name"))
	return None


def _allowed_oracle_admissions(patient: str = "", admission: str = "") -> set[str] | None:
	allowed = _allowed_admissions(patient, admission)
	if allowed is None:
		return None
	oracle_nums: set[str] = set()
	for erp_adm in allowed:
		for field in ("name", "admission_no_old", "case_no"):
			value = frappe.db.get_value(ADMISSION_DOCTYPE, erp_adm, field)
			if value:
				oracle_nums.add(_clean_oracle_num(value))
	return oracle_nums


def _work_items(
	scan: dict,
	*,
	patient: str = "",
	admission: str = "",
	limit: int = 0,
) -> list[list[str]]:
	items = [list(item) for item in scan.get("missing_admissions") or []]

	allowed = _allowed_oracle_admissions(patient, admission)
	if allowed is not None:
		items = [item for item in items if item[0] in allowed]

	if cint(limit):
		return items[: cint(limit)]
	return items


def _summary_message(progress: dict) -> str:
	dry = cint(progress.get("dry_run"))
	lines = [
		_("Reconcile Patient History finished."),
		"",
		_("Oracle {0}").format(ORACLE_TABLE),
		_("History lines in Oracle: {0}").format(cint(progress.get("oracle_rows"))),
		_("Admissions in Oracle: {0}").format(cint(progress.get("oracle_admissions"))),
		_("Patient History in ERPNext: {0}").format(cint(progress.get("erpnext_histories"))),
		_("Admissions already with a Patient History: {0}").format(cint(progress.get("matched_histories"))),
		_("Admissions missing a Patient History: {0}").format(cint(progress.get("missing_admissions"))),
		"",
		_("Patient History created: {0}").format(cint(progress.get("created"))),
		_("Admissions skipped - equivalent history already recorded: {0}").format(
			cint(progress.get("skipped_same_content"))
		),
	]
	if progress.get("skipped_existing"):
		lines.append(
			_("Admissions skipped - a Patient History exists but was not changed: {0}").format(
				cint(progress.get("skipped_existing"))
			)
		)
	if progress.get("skipped_no_admission"):
		lines.append(
			_("Admissions skipped - no Inpatient Admission in ERPNext: {0}").format(
				cint(progress.get("skipped_no_admission"))
			)
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
		"healthcare.api.patient_history_reconcile.run_patient_history_reconcile",
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
	admission: str = "",
	files: Any = None,
) -> dict[str, Any]:
	started = time.monotonic()
	progress = (_load_progress() if cint(resume) else {}) or _new_progress(limit)
	if cint(resume):
		limit = cint(progress.get("limit")) or cint(limit)
		dry_run = cint(progress.get("dry_run"))
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
				"patient": patient or "",
				"admission": admission or "",
				"files": files or [],
				"index": 0,
				"processed": 0,
				"message": _("Comparing patient history with Oracle…"),
			}
		)
		_set_progress(progress)

		scan = _scan()
		items = _work_items(scan, patient=patient, admission=admission, limit=limit)
		_set_work({"items": items, "built_at": str(now_datetime())})
		progress.update(
			{
				"oracle_rows": scan["oracle_rows"],
				"oracle_admissions": scan["oracle_admissions"],
				"erpnext_histories": scan["erpnext_histories"],
				"matched_histories": scan["matched_histories"],
				"missing_admissions": len(scan["missing_admissions"]),
				"missing_total": len(items),
				"extra_histories": scan["extra_histories"],
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
				"message": _("ERPNext already has Patient History for every Oracle admission. Nothing to do."),
			}
		)
		_set_progress(progress)
		return {"state": "finished", "progress": progress}

	while True:
		offset = cint(progress.get("index"))
		chunk = items[offset : offset + IMPORT_CHUNK]
		if not chunk:
			break
		_process_chunk(chunk, progress, dry_run=cint(progress.get("dry_run")))
		progress["index"] = offset + len(chunk)
		progress["processed"] = cint(progress.get("index"))
		frappe.db.commit()
		_set_progress(progress)
		_refresh_lock(token)

		if time.monotonic() - started > TIME_BUDGET:
			progress["state"] = "queued"
			progress["message"] = _(
				"Still running in the background ({0} of {1} admissions processed)."
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
def preview_patient_history_reconcile(
	patient: str = "", admission: str = "", limit: int = 0, files=None
) -> dict[str, Any]:
	"""Read-only answer to "does Patient History match Oracle IP_ADMISSION_02?"."""
	_require_admin()
	files = normalize_files(files)
	with excel_source(files, tables=[ORACLE_TABLE]) as source:
		scan = _scan()
		items = _work_items(scan, patient=patient, admission=admission, limit=limit)
		template_name = _default_template_name()
		attrib_names = _attrib_names(template_name)
		sample_admissions = [item[0] for item in items[:10]]
		grouped = _group_import_rows(
			_oracle_rows_by_admissions(sample_admissions), attrib_names=attrib_names
		)
		result: dict[str, Any] = {
			"ok": True,
			"as_of": str(nowdate()),
			"mode": "admission" if admission else ("patient" if patient else "site"),
			"oracle_table": f"{oracle_schema()}.{ORACLE_TABLE}",
			"oracle_rows": scan["oracle_rows"],
			"oracle_admissions": scan["oracle_admissions"],
			"erpnext_histories": scan["erpnext_histories"],
			"matched_histories": scan["matched_histories"],
			"extra_histories": scan["extra_histories"],
			"missing_admissions": len(items),
			"missing_total": len(items),
			"unresolved_admissions": scan.get("unresolved_admissions"),
			"samples": [
				{
					"admission": adm,
					"patient": patient_num,
					"filled_lines": len(grouped.get(adm) or []),
				}
				for adm, patient_num in items[:10]
			],
		}
		if source is not None:
			result["oracle_table"] = source.describe(ORACLE_TABLE)
	result["in_sync"] = not cint(result["missing_total"])
	return result


@frappe.whitelist()
def start_patient_history_reconcile(
	patient: str = "",
	admission: str = "",
	limit: int = 0,
	dry_run: int = 0,
	files=None,
) -> dict[str, Any]:
	"""Queue one Patient History reconciliation (button entry point)."""
	_require_admin()
	files = normalize_files(files)
	if _lock_held():
		return {
			"queued": False,
			"running": True,
			"message": _("A Patient History reconciliation is already running."),
			"status": _load_progress(),
		}

	progress = _new_progress(limit)
	progress.update(
		{
			"state": "queued",
			"dry_run": cint(dry_run),
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
		"healthcare.api.patient_history_reconcile.run_patient_history_reconcile",
		queue="long",
		timeout=7200,
		limit=cint(limit),
		dry_run=cint(dry_run),
		patient=patient or "",
		admission=admission or "",
		files=files,
	)
	return {"queued": True, "job_key": JOB_KEY, "status": progress}


@frappe.whitelist()
def get_patient_history_reconcile_status() -> dict[str, Any]:
	"""Progress of the last / ongoing reconciliation (polled by the settings dialog)."""
	_require_admin()
	return _load_progress() or {
		"job_key": JOB_KEY,
		"state": "idle",
		"processed": 0,
		"total": 0,
	}


def run_patient_history_reconcile(
	limit: int = 0,
	resume: int = 0,
	token: str | None = None,
	dry_run: int = 0,
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
				"message": _("A Patient History reconciliation is already running."),
			}

	outcome: dict[str, Any] = {}
	try:
		with excel_source(files, tables=[ORACLE_TABLE]):
			outcome = _run(
				token,
				cint(resume),
				cint(limit),
				cint(dry_run),
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
		frappe.log_error(title="Patient History reconciliation failed")
		raise
	finally:
		if not outcome.get("handed_over"):
			_release_lock(token)
	return outcome
