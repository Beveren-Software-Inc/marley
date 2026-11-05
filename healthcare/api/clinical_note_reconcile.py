"""One-button Oracle -> ERPNext reconciliation for doctor progress notes.

Why this exists
---------------
The Oracle side counts a patient's doctor progress notes in three tables:

* ``CLINIC2.VISIT_00_01.VISIT_DIAGNOSIS_DETAIL`` - the OP visit diagnosis, i.e.
  the "current" note of that visit,
* ``CLINIC2.VISIT_00_01_HISTORY.VISIT_DIAGNOSIS_DETAIL`` - every earlier version
  of that same OP diagnosis, i.e. the "history" of the note,
* ``CLINIC2.IP_ADMISSION_DIAGNOSES.DIAGNOSES_DESC`` - the IP admission notes.

ERPNext only ever wrote two of them into ``Clinical Note``:

* the OP note, built from ``Patient Visit.encounter_comment`` (filled from
  ``VISIT_00_01.VISIT_DIAGNOSIS_DETAIL`` by the OP visit import), and
* the IP note, built from ``IP_ADMISSION_DIAGNOSES`` by the IP clinical note
  import (``healthcare.api.ip_admission_clinical_note_import``).

``VISIT_00_01_HISTORY`` is imported into the ``VISIT_00_01_HISTORY`` staging
doctype only - it never becomes a Clinical Note. That is the table that was
missed: Oracle reports 3,134 doctor notes for patient 849995 (current + history
+ IP) while ERPNext holds 2,573.

What one run does
-----------------
1. Reads the three Oracle sources for one patient or for the whole site - no
   workbook and no Excel export in between.
2. Matches what already exists in ``Clinical Note``:

   ==================  ======================================================
   source              matched on
   ==================  ======================================================
   OP visit diagnosis  ``trans_no`` = ``OPDX-<VISIT_NUM>``, or any note that
                       references the Patient Visit of that visit number
                       (this is what the encounter_comment migration wrote)
   OP history          ``trans_no`` = ``OPHX-<visit>-<cr_date>[-n]``
   IP note             ``trans_no`` = the Oracle ``TRANS_NUM``, exactly how
                       the IP_ADMISSION_DIAGNOSES import stores it
   ==================  ======================================================

3. Creates only the notes that are missing (idempotent on ``trans_no`` / visit link).
4. Merges duplicate OP visit Clinical Notes left by earlier re-imports of the
   same Review Details text (same patient + visit + note body under a new
   synthetic ``trans_no``). The oldest note is kept; every ``trans_no`` is
   stored on ``merged_trans_nos``. Disable with ``remove_duplicates=0``.
5. Reports what could not be linked: patients that do not exist in ERPNext, OP
   rows whose Patient Visit was never imported, and history rows that only
   repeat the current diagnosis text (optionally skipped).

Execution model
---------------
A self-chaining background job on the ``long`` queue, like the prescription and
long-acting reconciles: it walks the patients in chunks, commits after each
chunk, keeps its progress in the cache (polled by the Healthcare Settings
dialog) and re-enqueues itself until the work list is exhausted.

Usage::

    bench --site <site> execute healthcare.api.clinical_note_reconcile.preview_clinical_note_reconcile
    bench --site <site> execute healthcare.api.clinical_note_reconcile.start_clinical_note_reconcile
    bench --site <site> execute healthcare.api.clinical_note_reconcile.get_clinical_note_reconcile_status
    # inline (no queue), handy for a first smoke test on a real site:
    bench --site <site> execute healthcare.api.clinical_note_reconcile.run_clinical_note_reconcile \
        --kwargs "{'patient': '849995', 'dry_run': 1}"
"""

from __future__ import annotations

import re
import time
from typing import Any, Iterable

import frappe
from frappe import _
from frappe.utils import cint, get_datetime, getdate, now_datetime

from healthcare.api.clinical_note import _get_or_create_clinical_note_type
from healthcare.api.discharge_checklist_import import _resolve_cost_center
from healthcare.api.ip_admission_clinical_note_import import (
	upsert_clinical_note_from_row as _upsert_ip_note,
)
from healthcare.api.oracle_excel_source import excel_source, normalize_files
from healthcare.api.oracle_sync import (
	_fetch_rows,
	_in_clause,
	_norm_key,
	_oracle_schema,
	_query,
	_sort_key,
	_table_columns,
)
from healthcare.api.patient_info_import import (
	_cell_text,
	_clean_oracle_num,
	_parse_datetime_value,
	_require_admin,
)
from healthcare.api.patient_visit_encounter_comment_clinical_note import (
	DOCTOR_PROGRESS_NOTE_TYPE,
	_note_html,
	_resolve_medical_role,
)
from healthcare.api.patient_visit_import import _resolve_practitioner_by_doctors_id
from healthcare.api.visit_00_01_history_import import _build_record_key, _normalize_visit_num
from healthcare.api.visit_diagnosis_sync import (
	_resolve_inpatient_admission,
	_resolve_patient_visit,
)

JOB_KEY = "clinical_note_reconcile"
PROGRESS_KEY = "healthcare:clinical_note_reconcile:progress"
WORK_KEY = "healthcare:clinical_note_reconcile:work"
LOCK_KEY = "healthcare:clinical_note_reconcile:lock"
PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6

OP_TABLE = "VISIT_00_01"
OP_HISTORY_TABLE = "VISIT_00_01_HISTORY"
IP_DIAGNOSES_TABLE = "IP_ADMISSION_DIAGNOSES"
IP_ADMISSION_TABLE = "IP_ADMISSION_01"

OP_DIAGNOSIS_FIELD = "VISIT_DIAGNOSIS_DETAIL"
IP_DIAGNOSIS_FIELD = "DIAGNOSES_DESC"
HISTORY_DOCTYPE = "VISIT_00_01_HISTORY"

# The tables an Excel upload has to provide (direct reads ignore this list).
ORACLE_TABLES = [OP_TABLE, OP_HISTORY_TABLE, IP_DIAGNOSES_TABLE, IP_ADMISSION_TABLE]

# Clinical Note.trans_no namespaces. The prefix keeps the reconciliation notes
# apart from the numbers ERPNext assigned itself, and makes a re-run cheap: the
# note already exists exactly when its key is present.
OP_TRANS_PREFIX = "OPDX-"
HISTORY_TRANS_PREFIX = "OPHX-"

SOURCE_OP = "op"
SOURCE_HISTORY = "history"
SOURCE_IP = "ip"
SOURCE_ORDER = (SOURCE_OP, SOURCE_HISTORY, SOURCE_IP)
SOURCE_LABELS = {
	SOURCE_OP: "OP visit diagnosis (VISIT_00_01)",
	SOURCE_HISTORY: "OP diagnosis history (VISIT_00_01_HISTORY)",
	SOURCE_IP: "IP doctor notes (IP_ADMISSION_DIAGNOSES)",
}

# Oracle is spoken to once per chunk (one query per source), so a chunk of 25
# patients keeps a run to a handful of round trips.
CHUNK = 25
TIME_BUDGET = 15 * 60
SAMPLE_LIMIT = 20
ERROR_LIMIT = 5
PREVIEW_SAMPLE_LIMIT = 20
PREVIEW_PATIENT_LIMIT = 25

_WHITESPACE = re.compile(r"\s+")


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


def _new_progress(
	patient: str = "",
	limit: int = 0,
	dry_run: int = 0,
	skip_duplicate_text: int = 0,
	remove_duplicates: int = 1,
) -> dict:
	stamp = str(now_datetime())
	return {
		"job_key": JOB_KEY,
		"state": "queued",
		"patient": patient or "",
		"limit": cint(limit),
		"dry_run": cint(dry_run),
		"skip_duplicate_text": cint(skip_duplicate_text),
		"remove_duplicates": cint(remove_duplicates),
		"index": 0,
		"processed": 0,
		"total": 0,
		# Visit-scope duplicate cleanup (re-imported OP Review Details copies)
		"duplicate_groups_before": 0,
		"duplicate_extra_copies_before": 0,
		"duplicate_groups_merged": 0,
		"duplicate_notes_deleted": 0,
		"duplicate_cleanup_errors": 0,
		# Oracle side (rows per source, as the Oracle dev counts them)
		"oracle_op": 0,
		"oracle_history": 0,
		"oracle_ip": 0,
		"oracle_rows": 0,
		# ERPNext side
		"existing_notes": 0,
		# Result
		"created": 0,
		"created_op": 0,
		"created_history": 0,
		"created_ip": 0,
		"skipped_existing": 0,
		"skipped_duplicate_text": 0,
		"skipped_no_patient": 0,
		"skipped_other": 0,
		"created_fresh_name": 0,
		"unresolved_visit": 0,
		"unresolved_admission": 0,
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


def _append_errors(progress: dict, errors: Iterable[str]) -> None:
	"""Only fills ``errors`` - for problems that are not a failed patient."""
	for error in errors or []:
		text = str(error or "").strip()
		if not text:
			continue
		if len(progress.get("errors") or []) < ERROR_LIMIT:
			progress.setdefault("errors", []).append(text[:800])


def _record_errors(progress: dict, errors: Iterable[str]) -> None:
	for error in errors or []:
		text = str(error or "").strip()
		if not text:
			continue
		progress["failed"] = cint(progress.get("failed")) + 1
		_append_errors(progress, [text])


# ---------------------------------------------------------------------------
# Oracle side
# ---------------------------------------------------------------------------


def _non_empty_filter(table: str, column: str) -> str:
	"""``trim(col) is not null``, counted the way the Oracle dev counts it.

	TRIM() only accepts VARCHAR2, so a CLOB column is measured by length.
	"""
	column = column.upper()
	column_type = ""
	for info in _table_columns(table):
		if info["name"].upper() == column:
			column_type = info["type"]
			break
	if column_type in ("CLOB", "NCLOB"):
		return f"dbms_lob.getlength({column}) > 0"
	return f"trim({column}) is not null"


def _text_key(value: Any) -> str:
	"""Whitespace / case insensitive key used to spot a note stored twice."""
	text = _cell_text(value)
	if not text:
		return ""
	return _WHITESPACE.sub(" ", text).strip().lower()


def _oracle_patient_counts() -> dict[str, dict[str, int]]:
	"""Rows per source per patient - three grouped queries, no note text."""
	schema = _oracle_schema()
	buckets: dict[str, dict[str, int]] = {}

	def add(rows: Iterable[dict], source: str) -> None:
		for row in rows:
			patient = _norm_key(row.get("PATIENT_NUM"))
			if not patient:
				continue
			bucket = buckets.setdefault(
				patient, {SOURCE_OP: 0, SOURCE_HISTORY: 0, SOURCE_IP: 0, "total": 0}
			)
			bucket[source] += cint(row.get("CNT"))
			bucket["total"] += cint(row.get("CNT"))

	add(
		_query(
			f"select VISIT_PATIENT_NUM as PATIENT_NUM, count(*) as CNT "
			f"from {schema}.{OP_TABLE} "
			f"where {_non_empty_filter(OP_TABLE, OP_DIAGNOSIS_FIELD)} "
			"group by VISIT_PATIENT_NUM"
		),
		SOURCE_OP,
	)
	add(
		_query(
			f"select VISIT_PATIENT_NUM as PATIENT_NUM, count(*) as CNT "
			f"from {schema}.{OP_HISTORY_TABLE} "
			f"where {_non_empty_filter(OP_HISTORY_TABLE, OP_DIAGNOSIS_FIELD)} "
			"group by VISIT_PATIENT_NUM"
		),
		SOURCE_HISTORY,
	)
	add(
		_query(
			f"select a.PATIENT_NUM as PATIENT_NUM, count(*) as CNT "
			f"from {schema}.{IP_DIAGNOSES_TABLE} d "
			f"join {schema}.{IP_ADMISSION_TABLE} a "
			"on a.ADMISSION_NUM = d.ADMISSION_NUM "
			f"where {_non_empty_filter(IP_DIAGNOSES_TABLE, IP_DIAGNOSIS_FIELD)} "
			"group by a.PATIENT_NUM"
		),
		SOURCE_IP,
	)
	return buckets


def _admission_owner(patients: list[str]) -> dict[str, str]:
	"""Oracle ADMISSION_NUM -> patient number, for the IP notes of these patients."""
	if not patients:
		return {}
	rows = _query(
		f"select ADMISSION_NUM, PATIENT_NUM from {_oracle_schema()}.{IP_ADMISSION_TABLE} "
		f"where PATIENT_NUM in ({_in_clause(patients)}) and ADMISSION_NUM is not null"
	)
	owner: dict[str, str] = {}
	for row in rows:
		admission = _norm_key(row.get("ADMISSION_NUM"))
		patient = _norm_key(row.get("PATIENT_NUM"))
		if admission and patient:
			owner[admission] = patient
	return owner


def _table_rows(
	table: str,
	key_field: str,
	keys: list[str],
	extra_where: str = "",
	order_by: str = "",
	errors: list[str] | None = None,
) -> list[dict]:
	"""``_fetch_rows`` for these keys; one unreadable key cannot sink the chunk.

	The Oracle client is driven through SQL*Plus, so a data problem in a single
	patient's rows fails the whole statement. Retrying key by key keeps the other
	patients of the chunk in the report.
	"""
	if not keys:
		return []

	where = f"{key_field} in ({_in_clause(keys)})"
	if extra_where:
		where = f"{where} and {extra_where}"
	try:
		return _fetch_rows(table, where=where, order_by=order_by)
	except Exception:
		frappe.log_error(
			title=_("Clinical note reconcile: Oracle read failed"),
			message=frappe.get_traceback(),
		)

	rows: list[dict] = []
	for key in keys:
		key_where = f"{key_field} = '{_clean_oracle_num(key)}'"
		if extra_where:
			key_where = f"{key_where} and {extra_where}"
		try:
			rows.extend(_fetch_rows(table, where=key_where, order_by=order_by))
		except Exception:
			if errors is not None:
				errors.append(f"{table} {key_field}={key}: could not be read from Oracle")
			frappe.log_error(
				title=_("Clinical note reconcile: Oracle read failed for {0} {1}").format(
					key_field, key
				),
				message=frappe.get_traceback(),
			)
	return rows


def _chunk_rows(
	patients: list[str], errors: list[str] | None = None
) -> dict[str, dict[str, list[dict]]]:
	"""Oracle rows (with note text) for a chunk of patients, grouped per patient.

	``errors`` collects the keys Oracle refused to read, so the caller can report
	them without losing the rest of the chunk.
	"""
	grouped: dict[str, dict[str, list[dict]]] = {
		patient: {SOURCE_OP: [], SOURCE_HISTORY: [], SOURCE_IP: []} for patient in patients
	}
	if not patients:
		return grouped

	for source, table in ((SOURCE_OP, OP_TABLE), (SOURCE_HISTORY, OP_HISTORY_TABLE)):
		rows = _table_rows(
			table,
			"VISIT_PATIENT_NUM",
			patients,
			extra_where=_non_empty_filter(table, OP_DIAGNOSIS_FIELD),
			order_by="VISIT_PATIENT_NUM, VISIT_NUM",
			errors=errors,
		)
		for row in rows:
			bucket = grouped.get(_norm_key(row.get("VISIT_PATIENT_NUM")))
			if bucket is not None:
				bucket[source].append(row)

	owner = _admission_owner(patients)
	if owner:
		rows = _table_rows(
			IP_DIAGNOSES_TABLE,
			"ADMISSION_NUM",
			sorted(owner),
			extra_where=_non_empty_filter(IP_DIAGNOSES_TABLE, IP_DIAGNOSIS_FIELD),
			order_by="ADMISSION_NUM, TRANS_NUM",
			errors=errors,
		)
		for row in rows:
			patient = owner.get(_norm_key(row.get("ADMISSION_NUM")))
			if patient and patient in grouped:
				grouped[patient][SOURCE_IP].append(row)

	return grouped


# ---------------------------------------------------------------------------
# ERPNext side - what is already stored
# ---------------------------------------------------------------------------


def _notes_by_patient(patients: list[str]) -> dict[str, list[dict]]:
	grouped: dict[str, list[dict]] = {patient: [] for patient in patients}
	if not patients:
		return grouped

	rows = frappe.db.sql(
		"""
		SELECT
			name,
			patient,
			IFNULL(trans_no, '') AS trans_no,
			IFNULL(reference_doc, '') AS reference_doc,
			IFNULL(reference_name, '') AS reference_name,
			IFNULL(reference_doctype, '') AS reference_doctype,
			IFNULL(reference_document, '') AS reference_document,
			IFNULL(inpatient_admission, '') AS inpatient_admission,
			IFNULL(clinical_note_type, '') AS clinical_note_type
		FROM `tabClinical Note`
		WHERE docstatus != 2 AND patient IN %(patients)s
		""",
		{"patients": tuple(patients)},
		as_dict=True,
	)
	for row in rows:
		grouped.setdefault(row.get("patient"), []).append(row)
	return grouped


def _visit_case_nos(patients: list[str]) -> dict[str, dict[str, str]]:
	"""patient -> {Patient Visit name: normalised legacy visit number}."""
	grouped: dict[str, dict[str, str]] = {patient: {} for patient in patients}
	if not patients:
		return grouped

	rows = frappe.db.sql(
		"""
		SELECT name, patient, IFNULL(case_no, '') AS case_no
		FROM `tabPatient Visit`
		WHERE patient IN %(patients)s
		""",
		{"patients": tuple(patients)},
		as_dict=True,
	)
	for row in rows:
		patient = row.get("patient")
		if patient not in grouped:
			continue
		visit_number = _norm_key(row.get("case_no")) or _norm_key(row.get("name"))
		if visit_number:
			grouped[patient][row.get("name")] = visit_number
	return grouped


def _staged_history_names(patients: list[str]) -> dict[str, set[str]]:
	"""Record keys of the ``VISIT_00_01_HISTORY`` staging rows per patient."""
	grouped: dict[str, set[str]] = {patient: set() for patient in patients}
	if not patients:
		return grouped

	try:
		rows = frappe.db.sql(
			"""
			SELECT name, patient
			FROM `tabVISIT_00_01_HISTORY`
			WHERE patient IN %(patients)s
			""",
			{"patients": tuple(patients)},
			as_dict=True,
		)
	except Exception:
		return grouped

	for row in rows:
		patient = row.get("patient")
		if patient in grouped and row.get("name"):
			grouped[patient].add(row.get("name"))
	return grouped


def _coverage(notes: list[dict], visit_map: dict[str, str]) -> dict[str, set[str]]:
	"""Oracle keys that already have a Clinical Note."""
	covered: dict[str, set[str]] = {SOURCE_OP: set(), SOURCE_HISTORY: set(), SOURCE_IP: set()}

	for note in notes or []:
		trans_no = (note.get("trans_no") or "").strip()
		upper = trans_no.upper()
		if upper.startswith(OP_TRANS_PREFIX):
			key = _norm_key(trans_no[len(OP_TRANS_PREFIX) :])
			if key:
				covered[SOURCE_OP].add(key)
		elif upper.startswith(HISTORY_TRANS_PREFIX):
			key = trans_no[len(HISTORY_TRANS_PREFIX) :].strip()
			if key:
				covered[SOURCE_HISTORY].add(key)
		elif trans_no and (
			(note.get("inpatient_admission") or "").strip()
			or note.get("reference_doctype") == "Inpatient Admission"
			or note.get("reference_doc") == "Inpatient Admission"
		):
			# The IP import stores the Oracle TRANS_NUM as the note's trans_no.
			key = _norm_key(trans_no)
			if key:
				covered[SOURCE_IP].add(key)

		# Notes written before this reconciliation (the encounter_comment
		# migration) carry ERPNext's own number, so they are matched through the
		# Patient Visit they reference.
		for doctype_field, name_field in (
			("reference_doc", "reference_name"),
			("reference_doctype", "reference_document"),
		):
			if (note.get(doctype_field) or "") != "Patient Visit":
				continue
			visit_number = visit_map.get((note.get(name_field) or "").strip())
			if visit_number:
				covered[SOURCE_OP].add(visit_number)

	return covered


def _history_keys(rows: list[dict]) -> list[tuple[str, dict]]:
	"""``(record_key, row)`` for every Oracle history row.

	The keys are built with the same helper the ``VISIT_00_01_HISTORY`` import
	uses, so several saved versions of one visit (same visit number, same
	``CR_DATE``) get the ``-2``, ``-3``... suffixes in the order Oracle returns
	them.
	"""
	seen: dict[str, int] = {}
	keyed: list[tuple[str, dict]] = []
	for row in rows or []:
		visit_number = _normalize_visit_num(row.get("VISIT_NUM"))
		if not visit_number:
			continue
		base = _build_record_key(visit_number, row.get("CR_DATE"))
		index = seen.get(base, 0)
		seen[base] = index + 1
		keyed.append((_build_record_key(visit_number, row.get("CR_DATE"), duplicate_index=index), row))
	return keyed


# ---------------------------------------------------------------------------
# ERPNext side - creating the missing notes
# ---------------------------------------------------------------------------

_PATIENT_VISIT_FIELDS = (
	"patient_name",
	"practitioner",
	"cost_center",
	"inpatient_record",
	"encounter_date",
	"encounter_time",
	"username",
	"user_name",
	"create_user_id",
)


def _clinical_note_with_trans_no(trans_no: str, patient: str | None = None) -> str | None:
	"""The Clinical Note that already stores ``trans_no`` (optionally per patient).

	The lookup is scoped to the patient whenever one is given: Clinical Note
	names are a numeric series on this site, so a name-only check would match
	an unrelated patient's note whose name happens to be the same number.
	"""
	if not trans_no:
		return None
	if patient:
		return frappe.db.get_value(
			"Clinical Note", {"trans_no": trans_no, "patient": patient}, "name"
		)
	if frappe.db.exists("Clinical Note", trans_no):
		return trans_no
	return frappe.db.get_value("Clinical Note", {"trans_no": trans_no}, "name")


def _series_note_name() -> str:
	"""Next free number of the Clinical Note name series.

	The IP import names a note after the Oracle ``TRANS_NUM``. On this site the
	Clinical Note names are also a plain numeric series, so a ``TRANS_NUM`` can
	already be the name of an unrelated note; such a row keeps the Oracle number
	in ``trans_no`` and takes a fresh name from the series instead.
	"""
	max_name = frappe.db.sql(
		"""
		SELECT MAX(CAST(name AS UNSIGNED))
		FROM `tabClinical Note`
		WHERE name REGEXP '^[0-9]+$'
		"""
	)
	candidate = cint((max_name or [[0]])[0][0])
	while True:
		candidate += 1
		if not frappe.db.exists("Clinical Note", str(candidate)):
			return str(candidate)


def _patient_visit_fields(visit: str | None) -> dict:
	if not visit:
		return {}
	meta = frappe.get_meta("Patient Visit")
	fields = [field for field in _PATIENT_VISIT_FIELDS if meta.has_field(field)]
	if not fields:
		return {}
	return frappe.db.get_value("Patient Visit", visit, fields, as_dict=True) or {}


def _visit_username(data: dict) -> str | None:
	for field in ("username", "user_name", "create_user_id"):
		value = data.get(field)
		text = str(value).strip() if value not in (None, "") else ""
		if text:
			return text
	return None


def _visit_posting_datetime(data: dict):
	encounter_date = data.get("encounter_date")
	if not encounter_date:
		return None
	encounter_time = data.get("encounter_time") or "00:00:00"
	try:
		return get_datetime(f"{getdate(encounter_date)} {encounter_time}")
	except Exception:
		try:
			return get_datetime(getdate(encounter_date))
		except Exception:
			return None


def _apply_legacy_flags(doc) -> None:
	doc.flags.ignore_permissions = True
	doc.flags.ignore_mandatory = True
	doc.flags.ignore_links = True
	doc.flags.ignore_validate = True
	doc.flags.legacy_import = True


def _first_cell(row: dict, names: Iterable[str]) -> str:
	for name in names:
		text = _cell_text(row.get(name))
		if text:
			return text
	return ""


def _ip_row_from_oracle(row: dict) -> dict:
	"""Oracle ``IP_ADMISSION_DIAGNOSES`` row -> the shape the IP note importer reads."""
	return {
		"trans_num": _clean_oracle_num(row.get("TRANS_NUM")),
		"admission_num": _clean_oracle_num(row.get("ADMISSION_NUM")),
		"admission_num_old": _clean_oracle_num(row.get("ADMISSION_NUM_OLD")),
		"diagnoses_flag": _first_cell(row, ("DIAGNOSES_FLAG", "DIAGNOSIS_FLAG")),
		"diagnoses_desc": _cell_text(row.get(IP_DIAGNOSIS_FIELD)),
		"diagnoses_date": _first_cell(row, ("DIAGNOSIS_DATE", "DIAGNOSES_DATE")),
		"diagnoses_time_from": _first_cell(row, ("FROM_TIME", "DIAGNOSES_TIME")),
		"diagnoses_time_to": _first_cell(row, ("TO_TIME", "DIAGNOSES_TIME_TO")),
		"user_name": _first_cell(row, ("USER_NAME", "USER_ID")),
		"cost_center_raw": _first_cell(row, ("BRANCH_NUM", "COST_CENTER")),
		"cr_id": _clean_oracle_num(row.get("CR_ID")),
		"up_id": _clean_oracle_num(row.get("UP_ID")),
		"cr_date": _cell_text(row.get("CR_DATE")),
		"up_date": _cell_text(row.get("UP_DATE")),
	}


def _create_op_note(
	patient: str, row: dict, *, patient_name: str | None = None, dry_run: int = 0
) -> dict:
	visit_number = _norm_key(row.get("VISIT_NUM"))
	if not visit_number:
		return {"status": "skip_no_visit"}

	text = _cell_text(row.get(OP_DIAGNOSIS_FIELD))
	if not text:
		return {"status": "skip_no_note"}

	trans_no = f"{OP_TRANS_PREFIX}{visit_number}"
	if _clinical_note_with_trans_no(trans_no, patient):
		return {"status": "skip_exists", "trans_no": trans_no}

	visit = _resolve_patient_visit(visit_number, patient)
	visit_data = _patient_visit_fields(visit)
	practitioner = (visit_data.get("practitioner") or "").strip() or (
		_resolve_practitioner_by_doctors_id(row.get("VISIT_DOCTOR_NUM"))
	)

	fields: dict[str, Any] = {
		"doctype": "Clinical Note",
		"trans_no": trans_no,
		"patient": patient,
		"patient_name": visit_data.get("patient_name") or patient_name,
		"clinical_note_type": DOCTOR_PROGRESS_NOTE_TYPE,
		"medical_role": _resolve_medical_role(practitioner),
		"practitioner": practitioner,
		"posting_date": (
			_parse_datetime_value(row.get("VISIT_DATE"))
			or _visit_posting_datetime(visit_data)
			or now_datetime()
		),
		"note": _note_html(text),
		"cost_center": (visit_data.get("cost_center") or "").strip()
		or _resolve_cost_center(row.get("BRANCH_NUM")),
		"username": _visit_username(visit_data),
		"cr_id": _clean_oracle_num(row.get("CR_ID")),
		"cr_date": _cell_text(row.get("CR_DATE")),
		"up_id": _clean_oracle_num(row.get("UP_ID")),
		"up_date": _cell_text(row.get("UP_DATE")),
	}

	if visit:
		fields["reference_doc"] = "Patient Visit"
		fields["reference_name"] = visit
		fields["reference_doctype"] = "Patient Visit"
		fields["reference_document"] = visit

	admission = (visit_data.get("inpatient_record") or "").strip()
	if not (admission and frappe.db.exists("Inpatient Admission", admission)):
		admission = _resolve_inpatient_admission(
			_clean_oracle_num(row.get("IP_ADMISSION_NUM")), patient
		)
	if admission:
		fields["inpatient_admission"] = admission

	if cint(dry_run):
		return {"status": "dry_run", "trans_no": trans_no, "visit": visit}

	_get_or_create_clinical_note_type(DOCTOR_PROGRESS_NOTE_TYPE)
	doc = frappe.get_doc({key: value for key, value in fields.items() if value not in (None, "")})
	_apply_legacy_flags(doc)
	doc.insert()
	return {"status": "created", "trans_no": doc.name, "visit": visit}


def _create_history_note(
	patient: str,
	row: dict,
	record_key: str,
	*,
	patient_name: str | None = None,
	staged: bool = False,
	dry_run: int = 0,
) -> dict:
	"""``VISIT_00_01_HISTORY`` row -> Clinical Note (the table ERPNext never wrote)."""
	visit_number = _normalize_visit_num(row.get("VISIT_NUM"))
	text = _cell_text(row.get(OP_DIAGNOSIS_FIELD))
	if not visit_number or not text:
		return {"status": "skip_no_note"}

	trans_no = f"{HISTORY_TRANS_PREFIX}{record_key}"
	if _clinical_note_with_trans_no(trans_no, patient):
		return {"status": "skip_exists", "trans_no": trans_no}

	visit = _resolve_patient_visit(visit_number, patient)
	visit_data = _patient_visit_fields(visit)
	practitioner = (visit_data.get("practitioner") or "").strip() or None

	posting_date = (
		_parse_datetime_value(row.get("CR_DATE"))
		or _parse_datetime_value(row.get("UP_DATE"))
		or _parse_datetime_value(row.get("VISIT_DATE"))
		or _visit_posting_datetime(visit_data)
		or now_datetime()
	)

	fields: dict[str, Any] = {
		"doctype": "Clinical Note",
		"trans_no": trans_no,
		"patient": patient,
		"patient_name": visit_data.get("patient_name") or patient_name,
		"clinical_note_type": DOCTOR_PROGRESS_NOTE_TYPE,
		"medical_role": _resolve_medical_role(practitioner),
		"practitioner": practitioner,
		"posting_date": posting_date,
		"note": _note_html(text),
		"cost_center": (visit_data.get("cost_center") or "").strip() or None,
		"username": _visit_username(visit_data),
		"cr_id": _clean_oracle_num(row.get("CR_ID")),
		"cr_date": _cell_text(row.get("CR_DATE")),
		"up_id": _clean_oracle_num(row.get("UP_ID")),
		"up_date": _cell_text(row.get("UP_DATE")),
	}

	if staged:
		fields["reference_doc"] = HISTORY_DOCTYPE
		fields["reference_name"] = record_key
		fields["reference_doctype"] = HISTORY_DOCTYPE
		fields["reference_document"] = record_key

	admission = (visit_data.get("inpatient_record") or "").strip()
	if admission and frappe.db.exists("Inpatient Admission", admission):
		fields["inpatient_admission"] = admission

	if cint(dry_run):
		return {"status": "dry_run", "trans_no": trans_no, "visit": visit}

	_get_or_create_clinical_note_type(DOCTOR_PROGRESS_NOTE_TYPE)
	doc = frappe.get_doc({key: value for key, value in fields.items() if value not in (None, "")})
	_apply_legacy_flags(doc)
	doc.insert()
	return {"status": "created", "trans_no": doc.name, "visit": visit}


def _create_ip_note(patient: str, row: dict, *, dry_run: int = 0) -> dict:
	"""``IP_ADMISSION_DIAGNOSES`` row -> Clinical Note, through the IP importer."""
	trans_num = _clean_oracle_num(row.get("TRANS_NUM"))
	if not trans_num:
		return {"status": "skip_no_trans_num"}
	if not _cell_text(row.get(IP_DIAGNOSIS_FIELD)):
		return {"status": "skip_no_note"}

	# The IP import names the note after the Oracle TRANS_NUM, so an existing
	# note of *this* patient is an existing note whatever else it holds.
	if _clinical_note_with_trans_no(trans_num, patient):
		return {"status": "skip_exists", "trans_no": trans_num}

	# Clinical Note names are a numeric series here too, so that number is
	# sometimes already the name of an unrelated note. Such a row keeps the
	# Oracle number in ``trans_no`` and is created under a fresh series name;
	# the other note is never touched.
	fresh_name = _series_note_name() if frappe.db.exists("Clinical Note", trans_num) else None

	admission = _resolve_inpatient_admission(_clean_oracle_num(row.get("ADMISSION_NUM")), patient)
	if not admission:
		return {"status": "skip_no_admission", "trans_no": trans_num}

	if cint(dry_run):
		return {"status": "dry_run", "trans_no": trans_num, "fresh_name": fresh_name}

	result = _upsert_ip_note(_ip_row_from_oracle(row), create_name=fresh_name)
	if fresh_name:
		result["fresh_name"] = fresh_name
	return result


# ---------------------------------------------------------------------------
# Per patient reconcile
# ---------------------------------------------------------------------------


def _track_creation(progress: dict, source: str, result: dict, sample: str = "") -> None:
	status = (result or {}).get("status")
	created_key = f"created_{source}"
	if status in ("created", "dry_run"):
		progress["created"] = cint(progress.get("created")) + 1
		progress[created_key] = cint(progress.get(created_key)) + 1
		if (result or {}).get("fresh_name"):
			progress["created_fresh_name"] = cint(progress.get("created_fresh_name")) + 1
		if sample:
			_record_samples(progress, [sample])
		return
	if status == "skip_exists":
		progress["skipped_existing"] = cint(progress.get("skipped_existing")) + 1
		return
	if status in ("skip_no_admission", "skip_no_trans_num"):
		progress["unresolved_admission"] = cint(progress.get("unresolved_admission")) + 1
		return
	progress["skipped_other"] = cint(progress.get("skipped_other")) + 1


def _reconcile_patient(
	patient: str,
	rows: dict[str, list[dict]],
	notes: list[dict],
	visit_map: dict[str, str],
	staged: set[str],
	progress: dict,
	*,
	dry_run: int = 0,
	skip_duplicate_text: int = 0,
) -> None:
	rows = rows or {source: [] for source in SOURCE_ORDER}

	# Oracle side of the report: every row read for this patient, per source.
	for source in SOURCE_ORDER:
		key = f"oracle_{source}"
		progress[key] = cint(progress.get(key)) + len(rows.get(source) or [])
	progress["oracle_rows"] = (
		cint(progress.get("oracle_op"))
		+ cint(progress.get("oracle_history"))
		+ cint(progress.get("oracle_ip"))
	)

	if not frappe.db.exists("Patient", patient):
		# A Clinical Note without a Patient cannot be filed anywhere, so the rows
		# stay in the report until the patient itself is imported.
		progress["skipped_no_patient"] = cint(progress.get("skipped_no_patient")) + sum(
			len(rows.get(source) or []) for source in SOURCE_ORDER
		)
		return

	patient_name = frappe.db.get_value("Patient", patient, "patient_name")
	covered = _coverage(notes, visit_map)
	progress["existing_notes"] = cint(progress.get("existing_notes")) + len(notes or [])

	current_text: dict[str, str] = {}
	for row in rows[SOURCE_OP]:
		visit_number = _norm_key(row.get("VISIT_NUM"))
		if visit_number and visit_number not in current_text:
			current_text[visit_number] = _text_key(row.get(OP_DIAGNOSIS_FIELD))

	# 1. OP visit diagnosis (VISIT_00_01) - usually already there as the note
	#    built from Patient Visit.encounter_comment.
	for row in rows[SOURCE_OP]:
		visit_number = _norm_key(row.get("VISIT_NUM"))
		if visit_number and visit_number in covered[SOURCE_OP]:
			progress["skipped_existing"] = cint(progress.get("skipped_existing")) + 1
			continue
		result = _create_op_note(patient, row, patient_name=patient_name, dry_run=dry_run)
		if visit_number:
			covered[SOURCE_OP].add(visit_number)
		if result.get("status") in ("created", "dry_run") and not result.get("visit"):
			progress["unresolved_visit"] = cint(progress.get("unresolved_visit")) + 1
		_track_creation(progress, SOURCE_OP, result, sample=f"{patient} OP visit {visit_number}")

	# 2. OP diagnosis history (VISIT_00_01_HISTORY) - the table ERPNext missed.
	for record_key, row in _history_keys(rows[SOURCE_HISTORY]):
		if record_key in covered[SOURCE_HISTORY]:
			progress["skipped_existing"] = cint(progress.get("skipped_existing")) + 1
			continue
		if cint(skip_duplicate_text):
			visit_number = _normalize_visit_num(row.get("VISIT_NUM"))
			text = _text_key(row.get(OP_DIAGNOSIS_FIELD))
			if text and current_text.get(visit_number) == text:
				progress["skipped_duplicate_text"] = (
					cint(progress.get("skipped_duplicate_text")) + 1
				)
				continue
		result = _create_history_note(
			patient,
			row,
			record_key,
			patient_name=patient_name,
			staged=record_key in staged,
			dry_run=dry_run,
		)
		covered[SOURCE_HISTORY].add(record_key)
		_track_creation(
			progress, SOURCE_HISTORY, result, sample=f"{patient} history {record_key}"
		)

	# 3. IP doctor notes (IP_ADMISSION_DIAGNOSES) - keyed like the IP import.
	for row in rows[SOURCE_IP]:
		trans_num = _norm_key(row.get("TRANS_NUM"))
		if trans_num and trans_num in covered[SOURCE_IP]:
			progress["skipped_existing"] = cint(progress.get("skipped_existing")) + 1
			continue
		result = _create_ip_note(patient, row, dry_run=dry_run)
		if trans_num:
			covered[SOURCE_IP].add(trans_num)
		_track_creation(progress, SOURCE_IP, result, sample=f"{patient} IP note {trans_num}")


# ---------------------------------------------------------------------------
# Diff (read only)
# ---------------------------------------------------------------------------


def _row_key(source: str, row: dict) -> str:
	if source == SOURCE_IP:
		return _norm_key(row.get("TRANS_NUM"))
	return _norm_key(row.get("VISIT_NUM"))


def _row_text(source: str, row: dict) -> str:
	return _cell_text(
		row.get(IP_DIAGNOSIS_FIELD if source == SOURCE_IP else OP_DIAGNOSIS_FIELD)
	)


def _row_posting_text(source: str, row: dict) -> str:
	if source == SOURCE_IP:
		return _first_cell(row, ("DIAGNOSIS_DATE", "DIAGNOSES_DATE", "CR_DATE"))
	if source == SOURCE_HISTORY:
		return _first_cell(row, ("CR_DATE", "UP_DATE", "VISIT_DATE"))
	return _first_cell(row, ("VISIT_DATE", "CR_DATE"))


def _source_entries(source: str, rows: list[dict]) -> list[tuple[str, dict]]:
	"""``(comparison key, row)`` - the key ``_coverage`` stores for this source."""
	if source == SOURCE_HISTORY:
		return _history_keys(rows)
	return [(_row_key(source, row), row) for row in rows or []]


def _missing_samples(
	rows: dict[str, list[dict]], covered: dict[str, set[str]], limit: int
) -> list[dict]:
	samples: list[dict] = []
	room = max(cint(limit), 0)
	for source in SOURCE_ORDER:
		for key, row in _source_entries(source, rows.get(source) or []):
			if len(samples) >= room:
				return samples
			if key and key in covered.get(source, set()):
				continue
			samples.append(
				{
					"source": source,
					"label": SOURCE_LABELS.get(source, source),
					"key": key,
					"posting_date": _row_posting_text(source, row),
					"text": _row_text(source, row)[:200],
				}
			)
	return samples


def _ip_fresh_name_count(
	rows: dict[str, list[dict]], covered: dict[str, set[str]], patient: str
) -> int:
	"""Missing IP keys whose Clinical Note name already belongs to someone else.

	The IP import names each note after the Oracle ``TRANS_NUM``. Clinical Note
	names are a numeric series on this site, so some of those numbers are taken
	by an unrelated patient's note; such a row keeps the number in ``trans_no``
	and is created under a fresh series name instead.
	"""
	missing = [
		key
		for key, _row in _source_entries(SOURCE_IP, rows.get(SOURCE_IP) or [])
		if key and key not in covered.get(SOURCE_IP, set())
	]
	if not missing:
		return 0
	owners = frappe.get_all(
		"Clinical Note", filters={"name": ("in", missing)}, fields=["name", "patient"]
	)
	return sum(1 for row in owners if (row.get("patient") or "") != patient)


def _duplicate_history_count(rows: dict[str, list[dict]]) -> int:
	"""History rows that only repeat their visit's current diagnosis text."""
	current: dict[str, str] = {}
	for row in rows.get(SOURCE_OP) or []:
		visit_number = _norm_key(row.get("VISIT_NUM"))
		if visit_number and visit_number not in current:
			current[visit_number] = _text_key(row.get(OP_DIAGNOSIS_FIELD))

	count = 0
	for _key, row in _history_keys(rows.get(SOURCE_HISTORY) or []):
		visit_number = _normalize_visit_num(row.get("VISIT_NUM"))
		text = _text_key(row.get(OP_DIAGNOSIS_FIELD))
		if text and current.get(visit_number) == text:
			count += 1
	return count


def _erpnext_note_counts(patients: Iterable[str]) -> dict[str, dict]:
	patients = [patient for patient in patients or [] if patient]
	if not patients:
		return {}
	rows = frappe.db.sql(
		"""
		SELECT
			patient,
			COUNT(*) AS notes,
			SUM(CASE WHEN clinical_note_type = %(note_type)s THEN 1 ELSE 0 END) AS doctor_notes
		FROM `tabClinical Note`
		WHERE docstatus != 2 AND patient IN %(patients)s
		GROUP BY patient
		""",
		{"patients": tuple(patients), "note_type": DOCTOR_PROGRESS_NOTE_TYPE},
		as_dict=True,
	)
	return {row.get("patient"): row for row in rows}


def _site_erpnext_totals() -> dict:
	rows = frappe.db.sql(
		"""
		SELECT
			COUNT(*) AS notes,
			SUM(CASE WHEN clinical_note_type = %s THEN 1 ELSE 0 END) AS doctor_notes,
			COUNT(DISTINCT patient) AS patients
		FROM `tabClinical Note`
		WHERE docstatus != 2
		""",
		(DOCTOR_PROGRESS_NOTE_TYPE,),
		as_dict=True,
	)
	data = (rows or [{}])[0] or {}
	return {
		"clinical_notes": cint(data.get("notes")),
		"doctor_progress_notes": cint(data.get("doctor_notes")),
		"patients": cint(data.get("patients")),
	}


def _patient_diff(patient: str, sample_limit: int = PREVIEW_SAMPLE_LIMIT) -> dict:
	rows = (_chunk_rows([patient]).get(patient) or {}) if patient else {}
	notes = _notes_by_patient([patient]).get(patient) or []
	visit_map = _visit_case_nos([patient]).get(patient) or {}
	covered = _coverage(notes, visit_map)
	patient_name = frappe.db.get_value("Patient", patient, "patient_name") if patient else ""

	sources: list[dict] = []
	totals = {"oracle": 0, "erpnext": 0, "missing": 0}
	for source in SOURCE_ORDER:
		entries = _source_entries(source, rows.get(source) or [])
		oracle_count = len(entries)
		present = sum(1 for key, _row in entries if key and key in covered[source])
		sources.append(
			{
				"key": source,
				"label": SOURCE_LABELS[source],
				"oracle_count": oracle_count,
				"erpnext_count": present,
				"missing_count": oracle_count - present,
			}
		)
		totals["oracle"] += oracle_count
		totals["erpnext"] += present
		totals["missing"] += oracle_count - present

	return {
		"ok": True,
		"mode": "patient",
		"patient": patient,
		"patient_name": patient_name or "",
		"patient_exists": bool(patient and patient_name),
		"patient_visits": len(visit_map),
		"sources": sources,
		"totals": totals,
		"erpnext": {
			"clinical_notes": len(notes),
			"doctor_progress_notes": sum(
				1
				for note in notes
				if note.get("clinical_note_type") == DOCTOR_PROGRESS_NOTE_TYPE
			),
			"patient_visits": len(visit_map),
		},
		"duplicate_history_rows": _duplicate_history_count(rows),
		"ip_fresh_name_count": _ip_fresh_name_count(rows, covered, patient),
		"samples": _missing_samples(rows, covered, sample_limit),
		"as_of": str(now_datetime()),
	}


def _site_diff(patient_limit: int = PREVIEW_PATIENT_LIMIT) -> dict:
	counts = _oracle_patient_counts()
	totals = {source: 0 for source in SOURCE_ORDER}
	oracle_total = 0
	for bucket in counts.values():
		for source in SOURCE_ORDER:
			totals[source] += cint(bucket.get(source))
		oracle_total += cint(bucket.get("total"))

	limit = max(cint(patient_limit), 0) or PREVIEW_PATIENT_LIMIT
	ordered = sorted(
		counts.items(), key=lambda item: (-cint(item[1].get("total")), _sort_key(item[0]))
	)
	top = ordered[:limit]
	patients = [patient for patient, _bucket in top]

	names: dict[str, str] = {}
	if patients:
		for row in frappe.get_all(
			"Patient", filters={"name": ("in", patients)}, fields=["name", "patient_name"]
		):
			names[row.get("name")] = row.get("patient_name") or ""
	note_counts = _erpnext_note_counts(patients)

	rows_out: list[dict] = []
	for patient, bucket in top:
		count_row = note_counts.get(patient) or {}
		rows_out.append(
			{
				"patient": patient,
				"patient_name": names.get(patient, ""),
				"patient_exists": patient in names,
				"op": cint(bucket.get(SOURCE_OP)),
				"history": cint(bucket.get(SOURCE_HISTORY)),
				"ip": cint(bucket.get(SOURCE_IP)),
				"total": cint(bucket.get("total")),
				"erpnext_notes": cint(count_row.get("notes")),
				"erpnext_doctor_notes": cint(count_row.get("doctor_notes")),
			}
		)

	return {
		"ok": True,
		"mode": "site",
		"sources": [
			{"key": source, "label": SOURCE_LABELS[source], "oracle_count": totals[source]}
			for source in SOURCE_ORDER
		],
		"totals": {"oracle": oracle_total, "erpnext": None, "missing": None},
		"erpnext": _site_erpnext_totals(),
		"patients_in_oracle": len(counts),
		"rows": rows_out,
		"truncated": len(ordered) > len(rows_out),
		"as_of": str(now_datetime()),
	}


# ---------------------------------------------------------------------------
# Job
# ---------------------------------------------------------------------------


def _queue_next(token: str, files: Any = None) -> None:
	frappe.enqueue(
		"healthcare.api.clinical_note_reconcile.run_clinical_note_reconcile",
		queue="long",
		timeout=7200,
		resume=1,
		token=token,
		files=files,
	)


def _build_patient_list(patient: str, limit: int = 0) -> list[str]:
	if patient:
		return [patient]

	counts = _oracle_patient_counts()
	ordered = sorted(
		counts, key=lambda key: (-cint(counts[key].get("total")), _sort_key(key))
	)
	if cint(limit):
		ordered = ordered[: cint(limit)]
	return ordered


def _process_chunk(
	patients: list[str], progress: dict, dry_run: int, skip_duplicate_text: int
) -> None:
	read_errors: list[str] = []
	try:
		rows_by_patient = _chunk_rows(patients, read_errors)
	except Exception:
		frappe.db.rollback()
		_record_errors(progress, [f"Oracle read failed: {frappe.get_traceback()}"])
		frappe.log_error(title="Clinical note reconcile: Oracle read failed")
		return
	if read_errors:
		_append_errors(progress, read_errors)

	notes = _notes_by_patient(patients)
	visits = _visit_case_nos(patients)
	staged = _staged_history_names(patients)

	for patient in patients:
		try:
			_reconcile_patient(
				patient,
				rows_by_patient.get(patient) or {},
				notes.get(patient) or [],
				visits.get(patient) or {},
				staged.get(patient) or set(),
				progress,
				dry_run=dry_run,
				skip_duplicate_text=skip_duplicate_text,
			)
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			_record_errors(progress, [f"{patient}: {frappe.get_traceback()}"])
			frappe.log_error(title=f"Clinical note reconcile failed: {patient}")
		progress["processed"] = cint(progress.get("processed")) + 1


def _run_visit_duplicate_cleanup(progress: dict, patients: list[str]) -> None:
	"""Merge re-imported OP visit clinical notes (same patient+visit+text, new trans_no).

	Cleanup is always limited to the reconcile work list from ``_build_patient_list``.
	A ``limit=1`` (or single-patient) run must never merge notes for other patients.
	"""
	from healthcare.api.clinical_note_duplicate_cleanup import (
		SCOPE_VISITS,
		cleanup_clinical_note_duplicates,
		_extra_copies,
		_group_count,
	)

	dry_run = cint(progress.get("dry_run"))
	work_patients = [(p or "").strip() for p in (patients or []) if (p or "").strip()]
	scoped = bool((progress.get("patient") or "").strip() or cint(progress.get("limit")))
	# Full-site reconcile (no patient, no limit): one site-wide pass.
	# Limited / single-patient runs: only the patients on this work list.
	targets = work_patients if scoped else [""]

	groups_before = 0
	extras_before = 0
	for target in targets:
		groups_before += _group_count(SCOPE_VISITS, patient=target)
		extras_before += _extra_copies(SCOPE_VISITS, patient=target)
	progress["duplicate_groups_before"] = groups_before
	progress["duplicate_extra_copies_before"] = extras_before
	if not groups_before:
		return

	progress["message"] = _("Merging duplicate OP visit clinical notes...")
	_set_progress(progress)

	merged = 0
	deleted = 0
	cleanup_errors = 0
	# Same calendar day is enough: OP re-imports usually share midnight posting_date.
	for target in targets:
		outcome = cleanup_clinical_note_duplicates(
			dry_run=dry_run,
			scope=SCOPE_VISITS,
			match_posting_time=0,
			patient=target,
		)
		merged += cint(outcome.get("groups_merged"))
		deleted += cint(outcome.get("notes_deleted"))
		cleanup_errors += cint(outcome.get("errors"))
	progress["duplicate_groups_merged"] = merged
	progress["duplicate_notes_deleted"] = deleted
	progress["duplicate_cleanup_errors"] = cleanup_errors
	if cleanup_errors:
		# Do not bump ``failed`` — that counter is for patient reconcile failures only.
		_append_errors(
			progress,
			[
				_("OP visit clinical note duplicate cleanup reported {0} error(s).").format(
					cleanup_errors
				)
			],
		)


def _run(
	token: str,
	resume: int,
	patient: str = "",
	limit: int = 0,
	dry_run: int = 0,
	skip_duplicate_text: int = 0,
	remove_duplicates: int = 1,
	files: Any = None,
) -> dict[str, Any]:
	"""Read the three Oracle note sources live, or from the uploaded Excel."""
	progress = _load_progress() if cint(resume) else None
	files = normalize_files(files) or (progress or {}).get("files") or None
	with excel_source(files, tables=ORACLE_TABLES):
		return _run_with_source(
			token,
			resume,
			patient,
			limit,
			dry_run,
			skip_duplicate_text,
			remove_duplicates,
			files,
		)


def _run_with_source(
	token: str,
	resume: int,
	patient: str = "",
	limit: int = 0,
	dry_run: int = 0,
	skip_duplicate_text: int = 0,
	remove_duplicates: int = 1,
	files: Any = None,
) -> dict[str, Any]:
	started = time.monotonic()

	if cint(resume):
		progress = _load_progress() or _new_progress(
			patient, limit, dry_run, skip_duplicate_text, remove_duplicates
		)
		patients = (_load_work() or {}).get("patients") or []
	else:
		progress = _new_progress(
			patient, limit, dry_run, skip_duplicate_text, remove_duplicates
		)
		patients = _build_patient_list(patient, limit)
		_set_work({"patients": patients, "built_at": str(now_datetime())})

	progress["state"] = "running"
	progress["total"] = len(patients)
	progress["message"] = _("Reading Oracle and comparing with Clinical Notes...")
	_set_progress(progress)

	while True:
		offset = cint(progress.get("index"))
		chunk = patients[offset : offset + CHUNK]
		if not chunk:
			break
		_process_chunk(
			chunk,
			progress,
			cint(progress.get("dry_run")),
			cint(progress.get("skip_duplicate_text")),
		)
		progress["index"] = offset + len(chunk)
		frappe.db.commit()
		_set_progress(progress)
		_refresh_lock(token)

		if time.monotonic() - started > TIME_BUDGET:
			progress["state"] = "queued"
			progress["message"] = _(
				"Still running in the background ({0} of {1} patients processed)."
			).format(progress.get("processed") or 0, progress.get("total") or 0)
			_set_progress(progress)
			_queue_next(token, files)
			return {"state": "queued", "handed_over": True, "progress": progress}

	frappe.db.commit()
	if cint(progress.get("remove_duplicates")):
		try:
			_run_visit_duplicate_cleanup(progress, patients)
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			progress["duplicate_cleanup_errors"] = cint(progress.get("duplicate_cleanup_errors")) + 1
			_append_errors(progress, [f"duplicate cleanup: {frappe.get_traceback()}"])
			frappe.log_error(title="Clinical note reconcile duplicate cleanup failed")

	progress["processed"] = cint(progress.get("total")) or cint(progress.get("processed"))
	progress["state"] = "finished"
	progress["finished_at"] = str(now_datetime())
	progress["message"] = _summary_message(progress)
	_set_progress(progress)
	return {"state": "finished", "progress": progress}


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------


def _summary_message(progress: dict) -> str:
	dry = cint(progress.get("dry_run"))
	lines = [
		_("Reconcile Doctor Progress Notes finished."),
		"",
		_("Oracle"),
		_("Progress notes in Oracle: {0} (OP {1}, history {2}, IP {3})").format(
			cint(progress.get("oracle_rows")),
			cint(progress.get("oracle_op")),
			cint(progress.get("oracle_history")),
			cint(progress.get("oracle_ip")),
		),
		_("Clinical Notes already in ERPNext for these patients: {0}").format(
			cint(progress.get("existing_notes"))
		),
		"",
		_("Result"),
		_("Clinical Notes created: {0} (OP {1}, history {2}, IP {3})").format(
			cint(progress.get("created")),
			cint(progress.get("created_op")),
			cint(progress.get("created_history")),
			cint(progress.get("created_ip")),
		),
		_("Already present, left untouched: {0}").format(
			cint(progress.get("skipped_existing"))
		),
	]
	if cint(progress.get("skipped_duplicate_text")):
		lines.append(
			_("History rows skipped because they repeat the current diagnosis: {0}").format(
				cint(progress.get("skipped_duplicate_text"))
			)
		)
	if cint(progress.get("unresolved_visit")):
		lines.append(
			_("Notes not linked to a Patient Visit (visit not imported yet): {0}").format(
				cint(progress.get("unresolved_visit"))
			)
		)
	if cint(progress.get("unresolved_admission")):
		lines.append(
			_("IP notes skipped (Inpatient Admission not imported yet): {0}").format(
				cint(progress.get("unresolved_admission"))
			)
		)
	if cint(progress.get("skipped_no_patient")):
		lines.append(
			_("Oracle rows skipped (patient does not exist in ERPNext): {0}").format(
				cint(progress.get("skipped_no_patient"))
			)
		)
	if cint(progress.get("created_fresh_name")):
		lines.append(
			_(
				"IP notes created under a fresh Clinical Note name (the Oracle trans number is already the name of another patient's note): {0}"
			).format(cint(progress.get("created_fresh_name")))
		)
	if cint(progress.get("skipped_other")):
		lines.append(
			_("Other rows skipped (no note text / no trans number): {0}").format(
				cint(progress.get("skipped_other"))
			)
		)
	if cint(progress.get("remove_duplicates")):
		lines.extend(
			[
				"",
				_("OP visit clinical note duplicates"),
				_("Duplicate groups found: {0} ({1} extra copies)").format(
					cint(progress.get("duplicate_groups_before")),
					cint(progress.get("duplicate_extra_copies_before")),
				),
				_("Groups merged: {0}; extra notes removed: {1}").format(
					cint(progress.get("duplicate_groups_merged")),
					cint(progress.get("duplicate_notes_deleted")),
				),
			]
		)
		if cint(progress.get("duplicate_cleanup_errors")):
			lines.append(
				_("Duplicate cleanup errors: {0}").format(
					cint(progress.get("duplicate_cleanup_errors"))
				)
			)
	if dry:
		lines.insert(1, _("DRY RUN - nothing was changed."))
	if progress.get("failed"):
		lines.extend(["", _("Failed patients: {0}").format(cint(progress.get("failed")))])
		for error in progress.get("errors") or []:
			lines.append(f"• {error}")
	elif progress.get("errors"):
		lines.extend(["", _("Warnings")])
		for error in progress.get("errors") or []:
			lines.append(f"• {error}")
	samples = progress.get("samples") or []
	if samples:
		lines.extend(["", _("Samples")])
		lines.extend(f"• {sample}" for sample in samples)
	return "\n".join(lines)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


@frappe.whitelist()
def preview_clinical_note_reconcile(
	patient: str = "", sample_limit: int = PREVIEW_SAMPLE_LIMIT, files=None
) -> dict[str, Any]:
	"""Read-only answer to \"do the doctor progress notes match Oracle?\".

	With ``patient`` it compares that one patient note by note and lists the
	missing ones; without it, it returns the three Oracle totals plus the
	busiest patients (with their ERPNext note counts) so the gap is visible
	before anything is created.
	"""
	_require_admin()
	patient = (patient or "").strip()
	with excel_source(files, tables=ORACLE_TABLES):
		if patient:
			return _patient_diff(patient, sample_limit=sample_limit)
		return _site_diff()


@frappe.whitelist()
def start_clinical_note_reconcile(
	patient: str = "",
	dry_run: int = 0,
	skip_duplicate_text: int = 0,
	remove_duplicates: int = 1,
	limit: int = 0,
	files=None,
) -> dict[str, Any]:
	"""Queue one reconciliation (the Healthcare Settings button entry point)."""
	_require_admin()
	files = normalize_files(files)
	if _lock_held():
		return {
			"queued": False,
			"running": True,
			"message": _("A doctor progress note reconciliation is already running."),
			"status": _load_progress(),
		}

	progress = _new_progress(
		(patient or "").strip(),
		limit,
		dry_run,
		skip_duplicate_text,
		remove_duplicates,
	)
	progress["state"] = "queued"
	progress["files"] = files
	progress["message"] = (
		_("Queued. The uploaded Excel export is read in the background.")
		if files
		else _("Queued. Oracle is read in the background.")
	)
	_set_progress(progress)

	frappe.enqueue(
		"healthcare.api.clinical_note_reconcile.run_clinical_note_reconcile",
		queue="long",
		timeout=7200,
		patient=(patient or "").strip(),
		limit=cint(limit),
		dry_run=cint(dry_run),
		skip_duplicate_text=cint(skip_duplicate_text),
		remove_duplicates=cint(remove_duplicates),
		files=files,
	)
	return {"queued": True, "job_key": JOB_KEY, "status": progress}


@frappe.whitelist()
def get_clinical_note_reconcile_status() -> dict[str, Any]:
	"""Progress of the last / ongoing reconciliation (polled by the settings dialog)."""
	_require_admin()
	return _load_progress() or {
		"job_key": JOB_KEY,
		"state": "idle",
		"processed": 0,
		"total": 0,
	}


def run_clinical_note_reconcile(
	patient: str = "",
	limit: int = 0,
	resume: int = 0,
	token: str | None = None,
	dry_run: int = 0,
	skip_duplicate_text: int = 0,
	remove_duplicates: int = 1,
) -> dict[str, Any]:
	"""Background entry point (also callable inline from the bench console)."""
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
				"message": _("A doctor progress note reconciliation is already running."),
			}

	outcome: dict[str, Any] = {}
	try:
		outcome = _run(
			token,
			cint(resume),
			patient=(patient or "").strip(),
			limit=cint(limit),
			dry_run=cint(dry_run),
			skip_duplicate_text=cint(skip_duplicate_text),
			remove_duplicates=cint(remove_duplicates),
		)
	except Exception:
		progress = _load_progress() or _new_progress()
		progress["state"] = "failed"
		progress["message"] = frappe.get_traceback()
		_record_errors(progress, [frappe.get_traceback()])
		_set_progress(progress)
		frappe.log_error(title="Clinical note reconcile failed")
		raise
	finally:
		if not outcome.get("handed_over"):
			_release_lock(token)
	return outcome

