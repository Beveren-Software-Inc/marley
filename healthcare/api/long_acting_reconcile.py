"""One-button Oracle -> ERPNext reconciliation for Long Acting Medicine (depot / LAI).

Oracle keeps every long-acting injection that was actually given in
``CLINIC2.VISIT_00_04`` (one row per injection, ``TRANS_NUM`` = the legacy
transaction number). ERPNext keeps the same history twice:

* ``Long Acting Medicine`` - one record per patient + medication (the order,
  the frequency, the next dose date),
* ``Long Acting Medicine Give Out`` - one child row per injection, with
  ``trans_no`` holding the Oracle ``TRANS_NUM``.

The workbook import (``healthcare.api.op_injection_prescription_import``) and
the hourly Oracle sync both stop writing after a while, so the give-out history
silently ends in the past: ``end_date`` is already behind us, ``next_run_date``
points at a dose that was given months ago, ``long_acting_medicine_expire``
flips the record to *Inactive* and the nurse no longer sees when the next depot
is due. That is a live administration risk - a missed depot injection.

What one run does
-----------------
1. Reads **all** of ``VISIT_00_04`` from the Oracle database configured on the
   site (no workbook, no patient picker).
2. Groups the rows exactly like the importer: one group per
   ``patient|medication`` (``PATIENT_NUM`` + ``MEDICATION``).
3. For every group, finds the existing ``Long Acting Medicine`` of that patient
   and medication (matched on the child row's legacy medication name, ignoring
   case and spacing, and on the full ERPNext item name when the record was
   created in ERPNext instead of imported) and appends only the give-outs whose
   ``TRANS_NUM`` is still missing.
4. Refreshes the record from the complete Oracle history: ``start_date`` /
   ``end_date`` (first and last injection), ``frequency`` /
   ``written_frequency`` when they are still empty, ``next_run_date`` (last
   injection + the frequency interval, or Oracle ``NEXT_DOSE``), and reactivates
   a record whose next dose is still in the future so the nurse sees it again.
5. Patients / medications that never imported at all (no ``Long Acting
   Medicine``) are created through the regular importer
   (``import_op_injection_group``), which builds the Patient Medication Order,
   the long-acting line, the ``Long Acting Medicine`` and its give-outs.
6. Deletes give-out child rows whose parent ``Long Acting Medicine`` no longer
   exists (they are unreachable in the UI but still counted by any report that
   reads the child table).

Nothing is ever deleted except those orphaned child rows, no give-out is
appended twice, and the run is idempotent: a second run only finds what is
still missing. Two records that hold the same depot for the same patient are
reported (they may be two strengths or a re-import) but never merged or
cancelled automatically - that needs a human decision.

Execution model
---------------
A self-chaining background job on the ``long`` queue, like the prescription
reconcile: it works through the groups in chunks, commits after each chunk,
keeps its progress in the cache (polled by the Healthcare Settings dialog) and
re-enqueues itself until the work list is exhausted.

Usage::

    bench --site <site> execute healthcare.api.long_acting_reconcile.preview_long_acting_reconcile
    bench --site <site> execute healthcare.api.long_acting_reconcile.start_long_acting_reconcile
    bench --site <site> execute healthcare.api.long_acting_reconcile.get_long_acting_reconcile_status
    # inline (no queue), handy for a first smoke test on a real site:
    bench --site <site> execute healthcare.api.long_acting_reconcile.run_long_acting_reconcile --kwargs "{'dry_run': 1, 'limit': 20}"
"""

from __future__ import annotations

import time
from typing import Any, Iterable

import frappe
from frappe import _
from frappe.utils import add_days, cint, getdate, now_datetime, nowdate

from healthcare.api.op_injection_prescription_import import (
	VISIT_00_04_HEADER_MAP,
	_group_date_range,
	_group_key,
	_group_long_acting_frequency,
	_group_written_frequency,
	_is_cancelled_check,
	_is_completed_status,
	_resolve_patient,
	_row_effective_date,
	_sort_row_key,
	_give_out_fields,
	import_op_injection_group,
)
from healthcare.api.oracle_sync import _fetch_rows
from healthcare.api.patient_medication_order import _long_acting_frequency_interval_days
from healthcare.api.patient_info_import import _require_admin
from healthcare.api.patient_medication_order_import import (
	_cell_text,
	_clean_oracle_num,
	_parse_date_value,
)

JOB_KEY = "long_acting_reconcile"
PROGRESS_KEY = "healthcare:long_acting_reconcile:progress"
WORK_KEY = "healthcare:long_acting_reconcile:work"
LOCK_KEY = "healthcare:long_acting_reconcile:lock"
PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6

ORACLE_TABLE = "VISIT_00_04"
LAM_DOCTYPE = "Long Acting Medicine"
GIVE_OUT_DOCTYPE = "Long Acting Medicine Give Out"
CHILD_DOCTYPE = "Subscription Medication Plan Item"

# One Oracle call per chunk, and a few ERPNext queries per group. The whole
# legacy history is ~4k injections, so the default chunk keeps a run short.
CHUNK = 40
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
		"processed": 0,
		"total": 0,
		"group_index": 0,
		# Oracle side
		"oracle_rows": 0,
		"oracle_groups": 0,
		"oracle_trans_nums": 0,
		"blank_medication_rows": 0,
		# ERPNext side
		"existing_give_outs": 0,
		"missing_give_outs": 0,
		"groups_with_lam": 0,
		"groups_without_lam": 0,
		# Repair
		"added_give_outs": 0,
		"created_lams": 0,
		"created_pmos": 0,
		"refreshed_lams": 0,
		"reactivated_lams": 0,
		"extended_lams": 0,
		"cleaned_orphans": 0,
		# Problems
		"duplicate_groups": 0,
		"duplicate_lams": [],
		"similar_matches": 0,
		"unresolved_patients": 0,
		"unresolved_rows": 0,
		"failed": 0,
		"errors": [],
		"samples": [],
		"dry_run": 0,
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
# Existing Long Acting Medicine records
# ---------------------------------------------------------------------------


def _medication_key(value: Any) -> str:
	"""Legacy medication text without case or spacing differences.

	Oracle keeps ``FLUANXOL DEPOT 100 MG/ML`` while the importer stored
	``FLUANXOL DEPOT 100 mg/ml``; ``100MG/ML`` and ``100 MG/ML`` are the same
	depot as well, so matching must ignore case and every space.
	"""
	text = _cell_text(value).upper()
	return "".join(text.split())


def _existing_lam_index() -> dict[str, dict]:
	"""Index of the Long Acting Medicine records, by patient + medication.

	``by_key`` is the exact ``patient|medication`` map. ``by_patient`` keeps every
	medication key of one patient, because a record created in ERPNext carries
	the full item name (``FLUANXOL DEPOT 100MG/ML 10 X 1ML SOLUTION FOR
	INJECTION``) while Oracle only stores ``FLUANXOL DEPOT 100 MG/ML``.
	"""
	lams = frappe.db.sql(
		f"""
		select name, patient, patient_name, status, docstatus, start_date, end_date,
			next_run_date, frequency, written_frequency
		from `tab{LAM_DOCTYPE}`
		where ifnull(patient, '') != '' and docstatus != 2
		""",
		as_dict=True,
	)
	if not lams:
		return {"by_key": {}, "by_patient": {}}
	by_name = {row["name"]: row for row in lams}
	for row in lams:
		row["give_outs"] = 0

	for row in frappe.db.sql(
		f"""
		select parent, count(*) c
		from `tab{GIVE_OUT_DOCTYPE}`
		group by parent
		""",
		as_dict=True,
	):
		if row.get("parent") in by_name:
			by_name[row["parent"]]["give_outs"] = cint(row.get("c"))

	by_key: dict[str, list[dict]] = {}
	by_patient: dict[str, list[tuple[str, dict]]] = {}
	for child in frappe.db.sql(
		f"""
		select parent, old_medication_name, drug_name, drug
		from `tab{CHILD_DOCTYPE}`
		where parenttype = %s and ifnull(parent, '') != ''
		""",
		(LAM_DOCTYPE,),
		as_dict=True,
	):
		lam = by_name.get(child.get("parent"))
		if not lam:
			continue
		for value in (child.get("old_medication_name"), child.get("drug_name"), child.get("drug")):
			key = _medication_key(value)
			if not key:
				continue
			bucket = by_key.setdefault(f"{lam['patient']}|{key}", [])
			if all(existing["name"] != lam["name"] for existing in bucket):
				bucket.append(lam)
			patient_bucket = by_patient.setdefault(lam["patient"], [])
			if all(
				existing_key != key or existing["name"] != lam["name"]
				for existing_key, existing in patient_bucket
			):
				patient_bucket.append((key, lam))
	return {"by_key": by_key, "by_patient": by_patient}


def _search_lam(index: dict, patient: str, medication: str) -> tuple[list[dict], str]:
	"""Candidates for one Oracle patient + medication, exact match first.

	When ERPNext created the record itself the medication text is the full item
	name, so the legacy name is a prefix of it (or the other way around). A
	containment match on names of at least 8 characters catches those without
	mixing up different strengths (``... 20 MG/ML`` is not inside ``... 100
	MG/ML``).
	"""
	key = _medication_key(medication)
	exact = (index.get("by_key") or {}).get(f"{patient}|{key}")
	if exact:
		return exact, "exact"
	if len(key) < 8:
		return [], ""

	similar: list[dict] = []
	seen: set[str] = set()
	for other_key, lam in (index.get("by_patient") or {}).get(patient, []):
		if len(other_key) < 8 or lam["name"] in seen:
			continue
		if key in other_key or other_key in key:
			seen.add(lam["name"])
			similar.append(lam)
	return similar, "similar" if similar else ""


def _pick_lam(candidates: list[dict]) -> dict | None:
	"""The record that carries the history: submitted first, then most give-outs."""
	if not candidates:
		return None
	return sorted(
		candidates,
		key=lambda row: (cint(row.get("docstatus")) == 1, cint(row.get("give_outs")), str(row.get("name"))),
		reverse=True,
	)[0]


def _existing_trans_nums_by_lam() -> dict[str, set[str]]:
	"""``trans_no`` values already recorded per Long Acting Medicine."""
	index: dict[str, set[str]] = {}
	for row in frappe.db.sql(
		f"""
		select g.parent, g.trans_no
		from `tab{GIVE_OUT_DOCTYPE}` g
		inner join `tab{LAM_DOCTYPE}` l on l.name = g.parent
		where ifnull(g.trans_no, '') != ''
		"""
	):
		index.setdefault(row[0], set()).add(_clean_oracle_num(row[1]))
	return index


def _give_out_key(row: dict) -> str:
	"""Oracle ``TRANS_NUM``; a composite key for the rare row without one."""
	num = _trans_num(row)
	if num:
		return num
	return "|".join(
		[
			_medication_key(row.get("medication")) or "__NO_MEDICATION__",
			str(row.get("acting_date") or ""),
			_clean_oracle_num(row.get("cr_id")),
		]
	)


def _missing_give_out_rows(lines: list[dict], existing: set[str]) -> list[dict]:
	"""Oracle rows whose injection is not recorded on this Long Acting Medicine yet."""
	missing: list[dict] = []
	seen: set[str] = set()
	for row in lines or []:
		key = _give_out_key(row)
		if not key or key in existing or key in seen:
			continue
		seen.add(key)
		missing.append(row)
	return missing


# ---------------------------------------------------------------------------
# Header refresh: dates, frequency, next dose, status
# ---------------------------------------------------------------------------


def _observed_interval_days(lines: list[dict]) -> int | None:
	"""Median gap between consecutive injections, when Oracle has no frequency.

	Depots are given monthly / every two weeks in practice; without a frequency
	the app schedules the next dose 7 days after the last one, which reads as
	"overdue" for a monthly depot. The observed rhythm is the best available
	estimate and is only used when the record has no frequency at all.
	"""
	dates = sorted(
		{
			_row_effective_date(row)
			for row in lines or []
			if _row_effective_date(row) and not _is_cancelled_check(row)
		}
	)
	gaps = [cint((later - earlier).days) for earlier, later in zip(dates, dates[1:])]
	gaps = [gap for gap in gaps if 1 <= gap <= 365]
	if not gaps:
		return None
	gaps.sort()
	middle = len(gaps) // 2
	if len(gaps) % 2:
		return gaps[middle]
	return int(round((gaps[middle - 1] + gaps[middle]) / 2))


def _oracle_next_dose(lines: list[dict]):
	"""Latest ``NEXT_DOSE`` Oracle stored for the group (rarely filled)."""
	values = [
		_parse_date_value(row.get("next_dose"))
		for row in lines or []
		if not _is_cancelled_check(row) and _parse_date_value(row.get("next_dose"))
	]
	return max(values) if values else None


def _lam_refresh_changes(lam: dict, lines: list[dict], today=None) -> dict:
	"""Fields of ``lam`` that the complete Oracle history says should change."""
	today = getdate(today or nowdate())
	start_dt, end_dt = _group_date_range(lines)
	active = [row for row in lines if not _is_cancelled_check(row)] or list(lines or [])
	completed = bool(active) and all(_is_completed_status(row.get("status")) for row in active)

	frequency = _group_long_acting_frequency(lines)
	current_frequency = (lam.get("frequency") or "").strip()
	interval = _long_acting_frequency_interval_days(frequency or current_frequency)

	dates = [_row_effective_date(row) for row in active if _row_effective_date(row)]
	last_dt = max(dates) if dates else None
	if last_dt and not current_frequency and not frequency:
		interval = _observed_interval_days(active) or interval

	next_run = None
	if not completed:
		next_run = _oracle_next_dose(active)
		if not next_run and last_dt:
			next_run = add_days(last_dt, interval)

	current_next = getdate(lam["next_run_date"]) if lam.get("next_run_date") else None
	current_end = getdate(lam["end_date"]) if lam.get("end_date") else None
	current_start = getdate(lam["start_date"]) if lam.get("start_date") else None
	status = (lam.get("status") or "").strip()

	changes: dict[str, Any] = {}
	if start_dt and (not current_start or current_start > getdate(start_dt)) and cint(lam.get("docstatus")) == 0:
		changes["start_date"] = getdate(start_dt)
	if end_dt and (not current_end or current_end < getdate(end_dt)):
		changes["end_date"] = getdate(end_dt)
	if frequency and not current_frequency:
		changes["frequency"] = frequency
	if not (lam.get("written_frequency") or "").strip() and cint(lam.get("docstatus")) == 0:
		written = _group_written_frequency(lines)
		if written:
			changes["written_frequency"] = written

	if completed:
		if current_next is not None or status != "Completed":
			changes["next_run_date"] = None
			changes["status"] = "Completed"
	elif next_run:
		if not current_next or current_next < getdate(next_run):
			changes["next_run_date"] = getdate(next_run)
		if getdate(next_run) >= today and status in (None, "", "Draft", "Paused", "Inactive"):
			changes["status"] = "Active"
	return changes


# ---------------------------------------------------------------------------
# Repair
# ---------------------------------------------------------------------------


def _append_give_outs(lam_name: str, lines: list[dict], existing: set[str], dry_run: int = 0) -> int:
	"""Append the injections this record is missing; returns how many were added."""
	missing = _missing_give_out_rows(lines, existing)
	if not missing:
		return 0
	if dry_run:
		return len(missing)

	doc = frappe.get_doc(LAM_DOCTYPE, lam_name)
	for row in missing:
		doc.append("give_outs", _give_out_fields(row))
	doc.flags.ignore_permissions = True
	doc.save(ignore_permissions=True)
	existing.update(_give_out_key(row) for row in missing)
	return len(missing)


def _apply_lam_refresh(lam_name: str, lines: list[dict], dry_run: int = 0) -> dict:
	"""Extend the dates and the next dose of one record from the Oracle history."""
	doc = frappe.get_doc(LAM_DOCTYPE, lam_name)
	changes = _lam_refresh_changes(doc.as_dict(), lines)
	if not changes or dry_run:
		return changes
	for fieldname, value in changes.items():
		doc.set(fieldname, value)
	doc.flags.ignore_permissions = True
	doc.save(ignore_permissions=True)
	return changes


def _note_changes(progress: dict, changes: dict) -> None:
	if not changes:
		return
	progress["refreshed_lams"] = cint(progress.get("refreshed_lams")) + 1
	if changes.get("status") == "Active":
		progress["reactivated_lams"] = cint(progress.get("reactivated_lams")) + 1
	if "end_date" in changes:
		progress["extended_lams"] = cint(progress.get("extended_lams")) + 1


# ---------------------------------------------------------------------------
# One group
# ---------------------------------------------------------------------------


def _reconcile_group(
	group_key: str,
	lines: list[dict],
	index: dict[str, list[dict]],
	trans_index: dict[str, set[str]],
	progress: dict,
	dry_run: int = 0,
	duplicate_keys: set[str] | None = None,
) -> None:
	"""(Re)build one Oracle ``patient|medication`` group inside ERPNext."""
	patient_num, medication = group_key.split("|", 1)
	patient = _resolve_patient(patient_num) if patient_num else None
	if not patient:
		progress["unresolved_patients"] = cint(progress.get("unresolved_patients")) + 1
		progress["unresolved_rows"] = cint(progress.get("unresolved_rows")) + len(lines)
		_record_samples(progress, [f"{group_key}: patient {patient_num or '?'} not found"])
		return

	candidates, match_kind = _search_lam(index, patient, medication)
	if match_kind == "similar":
		progress["similar_matches"] = cint(progress.get("similar_matches")) + 1
		names = ", ".join(sorted(row["name"] for row in candidates))
		_record_samples(progress, [f"{patient} · {medication} → {names} (matched by name)"])
	if len(candidates) > 1 and duplicate_keys is not None:
		duplicate_key = f"{patient}|{_medication_key(medication)}"
		if duplicate_key not in duplicate_keys:
			duplicate_keys.add(duplicate_key)
			names = ", ".join(sorted(row["name"] for row in candidates))
			if len(progress.get("duplicate_lams") or []) < SAMPLE_LIMIT:
				progress.setdefault("duplicate_lams", []).append(f"{patient} · {medication}: {names}")
		progress["duplicate_groups"] = len(duplicate_keys)

	lam = _pick_lam(candidates)
	if not lam:
		progress["groups_without_lam"] = cint(progress.get("groups_without_lam")) + 1
		if dry_run:
			progress["created_lams"] = cint(progress.get("created_lams")) + 1
			progress["added_give_outs"] = cint(progress.get("added_give_outs")) + len(
				_missing_give_out_rows(lines, set())
			)
			_record_samples(progress, [f"{patient} · {medication}: would create"])
			return
		try:
			result = import_op_injection_group(group_key, lines) or {}
		except Exception as exc:
			_record_errors(progress, [f"{patient} · {medication}: {exc}"])
			return
		if result.get("created_lam"):
			progress["created_lams"] = cint(progress.get("created_lams")) + 1
		if result.get("created_pmo"):
			progress["created_pmos"] = cint(progress.get("created_pmos")) + 1
		added = cint(result.get("give_outs_added"))
		progress["added_give_outs"] = cint(progress.get("added_give_outs")) + added
		if added:
			_record_samples(progress, [f"{patient} · {medication}: {result.get('lam')} (+{added})"])
		return

	progress["groups_with_lam"] = cint(progress.get("groups_with_lam")) + 1
	existing = trans_index.setdefault(lam["name"], set())
	added = _append_give_outs(lam["name"], lines, existing, dry_run=dry_run)
	if added:
		progress["added_give_outs"] = cint(progress.get("added_give_outs")) + added
		_record_samples(progress, [f"{patient} · {medication}: {lam['name']} (+{added})"])
	_note_changes(progress, _apply_lam_refresh(lam["name"], lines, dry_run=dry_run))


def _orphan_give_out_count() -> int:
	rows = frappe.db.sql(
		f"""
		select count(*)
		from `tab{GIVE_OUT_DOCTYPE}` g
		left join `tab{LAM_DOCTYPE}` l on l.name = g.parent
		where l.name is null
		"""
	)
	return cint(rows[0][0]) if rows else 0


def _delete_orphan_give_outs() -> int:
	"""Remove give-out rows whose Long Acting Medicine no longer exists."""
	removed = _orphan_give_out_count()
	if not removed:
		return 0
	frappe.db.sql(
		f"""
		delete g
		from `tab{GIVE_OUT_DOCTYPE}` g
		left join `tab{LAM_DOCTYPE}` l on l.name = g.parent
		where l.name is null
		"""
	)
	return removed


# ---------------------------------------------------------------------------
# Oracle rows -> importer rows
# ---------------------------------------------------------------------------


def _acting_time(value: Any) -> str | None:
	"""``ACTING_DATE`` is a DATE column, so the time of the injection is in it."""
	if value in (None, ""):
		return None
	text = _cell_text(value)
	if not text:
		return None
	parts = text.replace("T", " ").split(" ")
	for part in parts[1:]:
		if ":" in part:
			return part[:8]
	return "08:00:00"


def _prepare_row(raw: dict) -> dict | None:
	"""One ``VISIT_00_04`` row in the row shape ``op_injection_prescription_import`` uses."""
	row: dict[str, Any] = {}
	for name, value in (raw or {}).items():
		key = VISIT_00_04_HEADER_MAP.get(str(name or "").strip().upper(), str(name or "").strip().lower())
		row[key] = value

	raw_acting = row.get("acting_date")
	row["patient_num"] = _clean_oracle_num(row.get("patient_num"))
	row["trans_num"] = _clean_oracle_num(row.get("trans_num"))
	row["medication"] = _cell_text(row.get("medication"))
	row["acting_date"] = _parse_date_value(raw_acting)
	row["acting_time"] = _acting_time(raw_acting)
	return row


def _map_rows(raw_rows: Iterable[dict]) -> list[dict]:
	rows: list[dict] = []
	for raw in raw_rows or []:
		row = _prepare_row(raw)
		if row:
			rows.append(row)
	return rows


def _fetch_oracle_rows(limit: int = 0) -> list[dict]:
	"""Every long-acting injection Oracle stored, oldest first."""
	rows = _fetch_rows(
		ORACLE_TABLE,
		order_by="PATIENT_NUM, MEDICATION, ACTING_DATE, TRANS_NUM",
	)
	mapped = _map_rows(rows)
	if limit:
		return mapped[: cint(limit)]
	return mapped


def _trans_num(row: dict) -> str:
	value = row.get("trans_num")
	if isinstance(value, float) and value.is_integer():
		value = int(value)
	return _clean_oracle_num(value)


def _oracle_trans_nums(rows: Iterable[dict]) -> set[str]:
	return {num for num in (_trans_num(row) for row in rows) if num}


def _grouped_rows(rows: Iterable[dict]) -> dict[str, list[dict]]:
	"""Oracle rows grouped like the importer, without the rows that have no medication.

	A ``VISIT_00_04`` row with an empty ``MEDICATION`` cannot become a Long
	Acting Medicine (there is nothing to name the record after), so those rows
	are counted separately and never reconciled.
	"""
	grouped: dict[str, list[dict]] = {}
	for row in rows or []:
		if not _cell_text(row.get("medication")):
			continue
		grouped.setdefault(_group_key(row.get("patient_num"), row.get("medication")), []).append(row)
	for key in grouped:
		grouped[key].sort(key=_sort_row_key)
	return grouped


def _rows_without_medication(rows: Iterable[dict]) -> list[dict]:
	return [row for row in rows or [] if not _cell_text(row.get("medication"))]


# ---------------------------------------------------------------------------
# Preview: does ERPNext match Oracle?
# ---------------------------------------------------------------------------


def _preview_stats(rows: list[dict], limit: int = 0) -> dict:
	"""Read-only comparison of the Oracle history with ERPNext (no writes)."""
	grouped = _grouped_rows(rows)
	if limit:
		grouped = dict(sorted(grouped.items())[: cint(limit)])

	index = _existing_lam_index()
	trans_index = _existing_trans_nums_by_lam()
	oracle_nums = _oracle_trans_nums(row for lines in grouped.values() for row in lines)
	erp_nums: set[str] = set()
	for nums in trans_index.values():
		erp_nums.update(nums)

	missing_groups: list[str] = []
	duplicate_groups: list[str] = []
	similar_matches: list[str] = []
	seen_duplicates: set[str] = set()
	missing_rows = 0
	unresolved_rows = 0
	matched: set[str] = set()
	for group_key, lines in grouped.items():
		patient_num, medication = group_key.split("|", 1)
		patient = _resolve_patient(patient_num) if patient_num else None
		if not patient:
			unresolved_rows += len(lines)
			continue
		candidates, match_kind = _search_lam(index, patient, medication)
		duplicate_key = f"{patient}|{_medication_key(medication)}"
		if len(candidates) > 1 and duplicate_key not in seen_duplicates:
			seen_duplicates.add(duplicate_key)
			names = ", ".join(sorted(row["name"] for row in candidates))
			duplicate_groups.append(f"{patient} · {medication}: {names}")
		if candidates and match_kind == "similar":
			similar_matches.append(f"{patient} · {medication} → {candidates[0]['name']}")
		lam = _pick_lam(candidates)
		if not lam:
			missing_groups.append(f"{patient} · {medication} ({len(lines)})")
			missing_rows += len(lines)
			continue
		matched.add(lam["name"])
		missing_rows += len(_missing_give_out_rows(lines, trans_index.get(lam["name"], set())))

	return {
		"oracle_table": ORACLE_TABLE,
		"oracle_rows": sum(len(lines) for lines in grouped.values()),
		"oracle_groups": len(grouped),
		"oracle_patients": len({row.get("patient_num") for row in rows if row.get("patient_num")}),
		"oracle_trans_nums": len(oracle_nums),
		"rows_without_medication": len(_rows_without_medication(rows)),
		"lam_total": frappe.db.count(LAM_DOCTYPE),
		"lam_matched": len(matched),
		"lam_give_outs": sum(len(nums) for nums in trans_index.values()),
		"missing_groups": len(missing_groups),
		"missing_group_sample": missing_groups[:SAMPLE_LIMIT],
		"missing_give_outs": missing_rows,
		"missing_trans_nums": len(oracle_nums - erp_nums),
		"missing_trans_sample": sorted(oracle_nums - erp_nums, key=lambda value: (len(value), value))[
			:SAMPLE_LIMIT
		],
		"duplicate_groups": len(duplicate_groups),
		"duplicate_group_sample": duplicate_groups[:SAMPLE_LIMIT],
		"similar_groups": len(similar_matches),
		"similar_group_sample": similar_matches[:SAMPLE_LIMIT],
		"orphan_give_outs": _orphan_give_out_count(),
		"unresolved_rows": unresolved_rows,
	}


# ---------------------------------------------------------------------------
# Job
# ---------------------------------------------------------------------------


def _queue_next(token: str) -> None:
	frappe.enqueue(
		"healthcare.api.long_acting_reconcile.run_long_acting_reconcile",
		queue="long",
		timeout=7200,
		resume=1,
		token=token,
	)


def _build_group_keys(grouped: dict[str, list[dict]], limit: int = 0) -> list[str]:
	keys = sorted(grouped)
	if limit:
		return keys[: cint(limit)]
	return keys


def _process_chunk(
	group_keys: list[str],
	grouped: dict[str, list[dict]],
	index: dict[str, list[dict]],
	trans_index: dict[str, set[str]],
	progress: dict,
	dry_run: int = 0,
	duplicate_keys: set[str] | None = None,
) -> None:
	duplicate_keys = duplicate_keys if duplicate_keys is not None else set()
	for key in group_keys:
		lines = grouped.get(key) or []
		if not lines:
			continue
		try:
			_reconcile_group(
				key,
				lines,
				index,
				trans_index,
				progress,
				dry_run=dry_run,
				duplicate_keys=duplicate_keys,
			)
		except Exception:
			frappe.db.rollback()
			_record_errors(progress, [f"{key}: {frappe.get_traceback()}"])
			frappe.log_error(title=f"Long acting reconcile failed: {key}")
		progress["processed"] = cint(progress.get("processed")) + 1


def _run(token: str, resume: int, limit: int, dry_run: int = 0) -> dict[str, Any]:
	started = time.monotonic()
	progress = (_load_progress() if cint(resume) else {}) or _new_progress(limit)
	progress["dry_run"] = cint(progress.get("dry_run")) if cint(resume) else cint(dry_run)

	rows = _fetch_oracle_rows()
	grouped = _grouped_rows(rows)
	group_keys = _build_group_keys(grouped, limit or cint(progress.get("limit")))
	_set_work({"group_keys": group_keys, "limit": cint(limit), "built_at": str(now_datetime())})

	progress["state"] = "running"
	progress["oracle_rows"] = len(rows)
	progress["oracle_groups"] = len(grouped)
	progress["oracle_trans_nums"] = len(_oracle_trans_nums(rows))
	progress["blank_medication_rows"] = len(_rows_without_medication(rows))
	progress["total"] = len(group_keys)
	if not cint(resume):
		progress["cleaned_orphans"] = (
			_orphan_give_out_count() if cint(dry_run) else _delete_orphan_give_outs()
		)
		frappe.db.commit()
	_set_progress(progress)

	index = _existing_lam_index()
	trans_index = _existing_trans_nums_by_lam()
	oracle_nums = _oracle_trans_nums(row for lines in grouped.values() for row in lines)
	erp_nums: set[str] = set()
	for nums in trans_index.values():
		erp_nums.update(nums)
	progress["existing_give_outs"] = len(erp_nums)
	progress["missing_give_outs"] = len(oracle_nums - erp_nums)
	duplicate_keys: set[str] = set()

	while True:
		offset = cint(progress.get("group_index"))
		chunk = group_keys[offset : offset + CHUNK]
		if not chunk:
			break
		_process_chunk(
			chunk,
			grouped,
			index,
			trans_index,
			progress,
			dry_run=cint(progress.get("dry_run")),
			duplicate_keys=duplicate_keys,
		)
		progress["group_index"] = offset + len(chunk)
		progress["processed"] = cint(progress.get("group_index"))
		frappe.db.commit()
		_set_progress(progress)
		_refresh_lock(token)

		if time.monotonic() - started > TIME_BUDGET:
			progress["state"] = "queued"
			progress["message"] = _(
				"Still running in the background ({0} of {1} patient/medication groups processed)."
			).format(progress.get("processed") or 0, progress.get("total") or 0)
			_set_progress(progress)
			_queue_next(token)
			return {"state": "queued", "handed_over": True, "progress": progress}

	frappe.db.commit()
	progress["processed"] = progress.get("total") or progress.get("processed")
	progress["state"] = "finished"
	progress["finished_at"] = str(now_datetime())
	progress["message"] = _summary_message(progress)
	_set_progress(progress)
	return {"state": "finished", "progress": progress}


def _summary_message(progress: dict) -> str:
	dry = cint(progress.get("dry_run"))
	lines = [
		_("Reconcile Long Acting Medicine finished."),
		"",
		_("Oracle {0}").format(ORACLE_TABLE),
		_("Injections in Oracle: {0} in {1} patient/medication groups").format(
			cint(progress.get("oracle_rows")), cint(progress.get("oracle_groups"))
		),
		_("Give-outs already in ERPNext: {0}").format(cint(progress.get("existing_give_outs"))),
		_("Injections missing in ERPNext: {0}").format(cint(progress.get("missing_give_outs"))),
		"",
		_("Repair"),
		_("Long Acting Medicine records matched: {0}").format(cint(progress.get("groups_with_lam"))),
		_("Long Acting Medicine records created: {0}").format(cint(progress.get("created_lams"))),
		_("Give-outs added: {0}").format(cint(progress.get("added_give_outs"))),
		_("Records refreshed (dates / frequency / next dose): {0}").format(
			cint(progress.get("refreshed_lams"))
		),
		_("Records extended to the last injection: {0}").format(cint(progress.get("extended_lams"))),
		_("Records reactivated (next dose still due): {0}").format(
			cint(progress.get("reactivated_lams"))
		),
		_("Orphan give-out rows removed: {0}").format(cint(progress.get("cleaned_orphans"))),
	]
	if progress.get("groups_without_lam"):
		lines.append(
			_("Patient/medication groups with no Long Acting Medicine: {0}").format(
				cint(progress.get("groups_without_lam"))
			)
		)
	if progress.get("duplicate_groups"):
		lines.append("")
		lines.append(
			_("Duplicate Long Acting Medicine records (left untouched, please review): {0}").format(
				cint(progress.get("duplicate_groups"))
			)
		)
		lines.extend(f"• {row}" for row in (progress.get("duplicate_lams") or []))
	if progress.get("unresolved_patients"):
		lines.append(
			_("Patients not found in ERPNext: {0} ({1} injections skipped)").format(
				cint(progress.get("unresolved_patients")), cint(progress.get("unresolved_rows"))
			)
		)
	if progress.get("blank_medication_rows"):
		lines.append(
			_("Oracle rows without a medication name (skipped): {0}").format(
				cint(progress.get("blank_medication_rows"))
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
# Public API
# ---------------------------------------------------------------------------


@frappe.whitelist()
def preview_long_acting_reconcile(limit: int = 0) -> dict[str, Any]:
	"""Read-only answer to "does the Long Acting Medicine list match Oracle?"."""
	_require_admin()
	rows = _fetch_oracle_rows(limit)
	stats = _preview_stats(rows, limit=limit)
	stats["ok"] = True
	stats["as_of"] = str(nowdate())
	stats["in_sync"] = not stats["missing_groups"] and not stats["missing_give_outs"]
	return stats


@frappe.whitelist()
def start_long_acting_reconcile(limit: int = 0, dry_run: int = 0) -> dict[str, Any]:
	"""Queue one reconciliation of the whole Long Acting Medicine history (button entry point)."""
	_require_admin()
	if _lock_held():
		return {
			"queued": False,
			"running": True,
			"message": _("A Long Acting Medicine reconciliation is already running."),
			"status": _load_progress(),
		}

	progress = _new_progress(limit)
	progress["state"] = "queued"
	progress["dry_run"] = cint(dry_run)
	progress["message"] = _("Queued. Oracle is read in the background.")
	_set_progress(progress)

	frappe.enqueue(
		"healthcare.api.long_acting_reconcile.run_long_acting_reconcile",
		queue="long",
		timeout=7200,
		limit=cint(limit),
		dry_run=cint(dry_run),
	)
	return {"queued": True, "job_key": JOB_KEY, "status": progress}


@frappe.whitelist()
def get_long_acting_reconcile_status() -> dict[str, Any]:
	"""Progress of the last / ongoing reconciliation (polled by the settings dialog)."""
	_require_admin()
	return _load_progress() or {
		"job_key": JOB_KEY,
		"state": "idle",
		"processed": 0,
		"total": 0,
	}


def run_long_acting_reconcile(
	limit: int = 0, resume: int = 0, token: str | None = None, dry_run: int = 0
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
				"message": _("A Long Acting Medicine reconciliation is already running."),
			}

	outcome: dict[str, Any] = {}
	try:
		outcome = _run(token, cint(resume), cint(limit), cint(dry_run))
	except Exception:
		progress = _load_progress() or _new_progress()
		progress["state"] = "failed"
		progress["message"] = frappe.get_traceback()
		_record_errors(progress, [frappe.get_traceback()])
		_set_progress(progress)
		frappe.log_error(title="Long Acting Medicine reconciliation failed")
		raise
	finally:
		if not outcome.get("handed_over"):
			_release_lock(token)
	return outcome
