"""One-button Oracle -> ERPNext reconciliation for the patient warning messages.

Oracle keeps the legacy warnings / allergies in ``CLINIC2.PATIENT_WARNING_MESSAGES``
- one row per warning, ``WARNING_MESSAGE_NUM`` = the legacy transaction number.
ERPNext keeps the same warnings in ``Warning Message``, whose ``trans_id`` holds
that number (``autoname`` is ``field:trans_id``, so the document name *is* the
legacy number). The workbook import
(``healthcare.api.patient_warning_message_import``) only runs when somebody
exports the table by hand, so the register stops at the export date and drifts
from Oracle in three ways that this button repairs in one run:

* **missing** - a warning Oracle recorded that ERPNext never imported. On serene
  fourteen legacy warnings (570-583) are missing because the allergy import
  (``healthcare.api.patient_allergy_warning_import``) numbers its own records by
  continuing the numeric series, so app records already own those names.
* **incomplete** - the warning is there but Oracle holds values it lacks (cost
  center, high risk text, warning type / class, text).
* **duplicates** - the same warning entered twice, once in Oracle and once
  through Patient Medical History / the allergy register, so the patient warning
  popup and the allergy checklist show it twice.

What one run does
-----------------
1. Reads ``PATIENT_WARNING_MESSAGES`` (live from Oracle, or from its uploaded
   Excel export) and compares it, number by number, with ``tabWarning Message``.
2. A row counts as imported when a Warning Message of the *same patient* carries
   its number. Rows whose number is still free in ERPNext are simply created.
3. A row whose number is already the name of *another* patient's record is
   created under ``<num>-W`` (``-W-2`` if that is taken too), so both warnings
   survive: the live app record is never renamed, merged or deleted. Turn that
   off with *suffix_conflicts* to only report those rows.
4. Rows Oracle knows more about get their blanks filled (``fill_missing``). A
   value that is already there is never overwritten - for some legacy rows only
   ERPNext has the readable text while Oracle itself holds "???" - those
   differences are reported by the preview and left alone.
5. Duplicate copies (same patient, same words) are removed (``clean_duplicates``)
   and the legacy numbered record is kept. A copy that belongs to the phone
   warning workflow, carries an attachment, or holds data the kept record does
   not have is never deleted; an ``is_allergy`` flag is carried over to the kept
   record so the allergy register keeps working.

Execution model
---------------
The comparison is one pass over both sides (keyset pages of ``tabWarning
Message``, one Oracle query). The repair then runs in a self-chaining background
job on the ``long`` queue: it works through the work list in chunks, commits
after each chunk, keeps its progress in the cache (polled by the Healthcare
Settings dialog) and re-enqueues itself until the list is exhausted.

Usage::

    bench --site <site> execute healthcare.api.warning_message_reconcile.preview_warning_message_reconcile
    bench --site <site> execute healthcare.api.warning_message_reconcile.start_warning_message_reconcile
    bench --site <site> execute healthcare.api.warning_message_reconcile.get_warning_message_reconcile_status
    # inline (no queue), handy for a first smoke test on a real site:
    bench --site <site> execute healthcare.api.warning_message_reconcile.run_warning_message_reconcile --kwargs "{'dry_run': 1}"
"""

from __future__ import annotations

import re
import time
from html import unescape
from typing import Any, Iterable

import frappe
from frappe import _
from frappe.utils import cint, now_datetime

from healthcare.api.oracle_excel_source import excel_source, normalize_files
from healthcare.api.oracle_sync import _fetch_rows
from healthcare.api.patient_info_import import _cell_text, _clean_oracle_num, _require_admin
from healthcare.api.patient_warning_message_import import (
	_build_warning_message_fields,
	_parse_posting_datetime,
	_resolve_patient,
)

JOB_KEY = "warning_message_reconcile"
PROGRESS_KEY = "healthcare:warning_message_reconcile:progress"
WORK_KEY = "healthcare:warning_message_reconcile:work"
LOCK_KEY = "healthcare:warning_message_reconcile:lock"
PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6

ORACLE_TABLE = "PATIENT_WARNING_MESSAGES"
DOCTYPE = "Warning Message"
# Suffix used when an Oracle WARNING_MESSAGE_NUM is already the name of another
# patient's record. ``_numeric_key`` maps it back to the Oracle number, so the
# reconcile recognises its own rows on the next run.
CONFLICT_SUFFIX = "-W"

ERP_PAGE = 50000  # keyset page over `tabWarning Message` (primary key scan)
IMPORT_CHUNK = 300  # work items handled per iteration
TIME_BUDGET = 15 * 60
SAMPLE_LIMIT = 15
ERROR_LIMIT = 5

# Fields the two sides are compared on. Values that only exist in Oracle are
# filled in; values that differ although both sides have one are only reported.
COMPARED_FIELDS = (
	"patient",
	"warning",
	"high_risk_text",
	"warning_message_type",
	"warning_message_class",
	"cost_center",
)
# Everything that may be filled from Oracle when ERPNext left it empty.
FILL_FIELDS = COMPARED_FIELDS + ("posting_date",)

_TAG = re.compile(r"<[^>]+>")
_SPACES = re.compile(r"\s+")
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
	current = frappe.cache().get(_lock_key())
	if isinstance(current, bytes):
		current = current.decode()
	return current == token


def _refresh_lock(token: str) -> None:
	if not _owns_lock(token):
		return
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
		"fill_missing": 1,
		"clean_duplicates": 1,
		"patient": "",
		"files": [],
		"index": 0,
		"processed": 0,
		"total": 0,
		# Oracle side
		"oracle_rows": 0,
		"oracle_rows_with_text": 0,
		"oracle_patients": 0,
		"blank_rows": 0,
		"unknown_patient": 0,
		# ERPNext side
		"erpnext_rows": 0,
		"matched": 0,
		"missing_free": 0,
		"missing_blocked": 0,
		"missing_total": 0,
		"fill_total": 0,
		"differs_total": 0,
		"duplicate_total": 0,
		"skipped_duplicates": 0,
		"extra_rows": 0,
		# Repair
		"created": 0,
		"suffixed_keys": 0,
		"filled": 0,
		"removed": 0,
		"skipped_existing": 0,
		"skipped_unchanged": 0,
		# Problems
		"failed": 0,
		"errors": [],
		"samples": [],
		"started_at": stamp,
		"updated_at": stamp,
	}


def _record_samples(progress: dict, samples: Iterable[str]) -> None:
	room = SAMPLE_LIMIT - len(progress.get("samples") or [])
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
	"""Oracle ``WARNING_MESSAGE_NUM`` behind a warning's ``trans_id``.

	``570`` and ``570-W`` both map to ``570``: the suffix is only there because
	another patient's record already owns the plain number. Names that are not a
	legacy number at all (``PMH-…``) map to ``""`` - they are app records.
	"""
	text = _clean_oracle_num(value)
	match = _SUFFIXED_KEY.match(text)
	if match:
		return match.group("number")
	return text if text.isdigit() else ""


def _norm_text(value: Any) -> str:
	"""Warning text without HTML noise, case or spacing differences."""
	text = unescape(_cell_text(value).replace("\r\n", "\n"))
	text = _TAG.sub(" ", text)
	return _SPACES.sub(" ", text).strip().lower()


def _is_blank(value: Any) -> bool:
	if value is None:
		return True
	if isinstance(value, str):
		return not value.strip()
	return False


def _same_value(field: str, have: Any, want: Any) -> bool:
	if field == "warning":
		return _norm_text(have) == _norm_text(want)
	if field == "posting_date":
		return str(_parse_posting_datetime(have) or "") == str(_parse_posting_datetime(want) or "")
	return str(have or "").strip() == str(want or "").strip()


# ---------------------------------------------------------------------------
# Comparison: Oracle PATIENT_WARNING_MESSAGES vs tabWarning Message
# ---------------------------------------------------------------------------


def _oracle_payload(raw: dict) -> dict:
	"""One Oracle row as the import helpers expect it (all values strings)."""
	return {
		"warning_message_num": _clean_oracle_num(raw.get("WARNING_MESSAGE_NUM")),
		"patient_num": raw.get("PATIENT_NUM"),
		"warning_message": raw.get("WARNING_MESSAGE"),
		"high_risk_text": raw.get("HIGH_RISK_TEXT"),
		"warning_message_type": raw.get("WARNING_MESSAGE_TYPE"),
		"warning_message_class": raw.get("WARNING_MESSAGE_CLASS"),
		"branch_num": raw.get("BRANCH_NUM"),
		"cr_date": raw.get("CR_DATE"),
		"sta_flg": raw.get("STA_FLG"),
	}


def _oracle_rows() -> list[dict]:
	"""Every ``PATIENT_WARNING_MESSAGES`` row that carries a warning number."""
	rows = _fetch_rows(ORACLE_TABLE, order_by="WARNING_MESSAGE_NUM") or []
	return [raw for raw in rows if _clean_oracle_num(raw.get("WARNING_MESSAGE_NUM"))]


_ERP_TEXT_FIELDS = (
	"trans_id",
	"patient",
	"warning",
	"high_risk_text",
	"warning_message_type",
	"warning_message_class",
	"cost_center",
)


def _erpnext_rows() -> list[dict]:
	"""The whole ``tabWarning Message`` register, keyset pages off the primary key."""
	text_columns = ", ".join(f"ifnull(`{field}`, '') as `{field}`" for field in _ERP_TEXT_FIELDS)
	select = (
		f"name, {text_columns}, posting_date, is_special_phone_warning, is_allergy, creation"
	)
	rows: list[dict] = []
	after = ""
	while True:
		page = frappe.db.sql(
			f"""
			select {select}
			from `tabWarning Message`
			where name > %s
			order by name asc
			limit %s
			""",
			(after, ERP_PAGE),
			as_dict=True,
		)
		if not page:
			break
		rows.extend(page)
		after = page[-1]["name"]
		if len(page) < ERP_PAGE:
			break
	return rows


def _has_attachment(name: str) -> bool:
	return bool(
		frappe.db.exists(
			"File", {"attached_to_doctype": DOCTYPE, "attached_to_name": name}
		)
	)


def _protected(row: dict) -> bool:
	"""Copies that carry a human workflow and must never be removed."""
	if cint(row.get("is_special_phone_warning")):
		return True
	return _has_attachment(row.get("name") or "")


def _conflicts_with(loser: dict, keeper: dict) -> bool:
	"""True when both hold different nonempty values - keep both, never delete."""
	for field in FILL_FIELDS:
		if _is_blank(loser.get(field)) or _is_blank(keeper.get(field)):
			continue
		if not _same_value(field, keeper.get(field), loser.get(field)):
			return True
	return False


def _richer_than(loser: dict, keeper: dict) -> bool:
	"""True when the copy holds a value the kept record does not - keep both."""
	for field in FILL_FIELDS:
		if _is_blank(loser.get(field)) or not _is_blank(keeper.get(field)):
			continue
		if not _same_value(field, keeper.get(field), loser.get(field)):
			return True
	return False


def _pick_keeper(rows: list[dict], oracle_numbers: set[str]) -> dict:
	"""The record a duplicate group keeps: the legacy one, then the allergy one."""

	def rank(row: dict) -> tuple:
		key = _numeric_key(row.get("name") or row.get("trans_id"))
		return (
			0 if key in oracle_numbers else 1,
			0 if cint(row.get("is_allergy")) else 1,
			str(row.get("creation") or ""),
			str(row.get("name") or ""),
		)

	return sorted(rows, key=rank)[0]


def _duplicate_groups(erp_rows: list[dict], oracle_numbers: set[str]) -> tuple[list[list[str]], int]:
	"""``[[copy to remove, record to keep], ...]`` plus the copies left alone."""
	groups: dict[tuple[str, str], list[dict]] = {}
	for row in erp_rows:
		patient = row.get("patient")
		text = _norm_text(row.get("warning"))
		if not patient or not text:
			continue
		groups.setdefault((patient, text), []).append(row)

	duplicates: list[list[str]] = []
	skipped = 0
	for group_key, rows in groups.items():
		if len(rows) < 2:
			continue
		patient = group_key[0]
		keeper = _pick_keeper(rows, oracle_numbers)
		for row in rows:
			if row is keeper:
				continue
			if _protected(row) or _conflicts_with(row, keeper) or _richer_than(row, keeper):
				skipped += 1
				continue
			duplicates.append([row.get("name"), keeper.get("name"), patient])
	return duplicates, skipped


def _classify(oracle_rows: list[dict], erp_rows: list[dict]) -> dict:
	"""Compare the two registers row by row and sort every row into a bucket."""
	by_number: dict[str, list[dict]] = {}
	for row in erp_rows:
		key = _numeric_key(row.get("name") or row.get("trans_id"))
		if key:
			by_number.setdefault(key, []).append(row)

	oracle_numbers: set[str] = set()
	oracle_patients: set[str] = set()
	missing: list[list] = []
	missing_free = 0
	missing_blocked = 0
	blocked_sample: list[list[str]] = []
	matched = 0
	fills: list[list] = []
	differs: list[list[str]] = []
	unknown_patient = 0
	blank_rows = 0

	for raw in oracle_rows:
		number = _clean_oracle_num(raw.get("WARNING_MESSAGE_NUM"))
		if not number or number in oracle_numbers:
			continue
		oracle_numbers.add(number)
		patient = _resolve_patient(raw.get("PATIENT_NUM"))
		if patient:
			oracle_patients.add(patient)
		else:
			unknown_patient += 1
		if not _cell_text(raw.get("WARNING_MESSAGE")):
			blank_rows += 1

		payload = _oracle_payload(raw)
		rows = by_number.get(number) or []
		same_patient = [
			row
			for row in rows
			if (patient and row.get("patient") == patient)
			or (not patient and not (row.get("patient") or ""))
		]
		if same_patient:
			matched += 1
			row = same_patient[0]
			fields = _build_warning_message_fields(payload)
			fill = {
				field: fields[field]
				for field in FILL_FIELDS
				if field in fields
				and _is_blank(row.get(field))
				and not _is_blank(fields[field])
			}
			if fill:
				fills.append([row.get("name"), patient, fill])
			changed = [
				field
				for field in COMPARED_FIELDS
				if field not in fill
				and field in fields
				and not _is_blank(row.get(field))
				and not _is_blank(fields[field])
				and not _same_value(field, row.get(field), fields[field])
			]
			if changed:
				differs.append([row.get("name"), changed])
			continue

		kind = "blocked" if rows else "free"
		if kind == "blocked":
			missing_blocked += 1
			if len(blocked_sample) < 10:
				blocked_sample.append([number, patient or "", rows[0].get("name") or ""])
		else:
			missing_free += 1
		missing.append([number, kind, payload])

	duplicates, skipped_duplicates = _duplicate_groups(erp_rows, oracle_numbers)
	extra_rows = sum(len(rows) for key, rows in by_number.items() if key not in oracle_numbers)

	return {
		"oracle_rows": len(oracle_rows),
		"oracle_rows_with_text": len(oracle_rows) - blank_rows,
		"oracle_patients": len(oracle_patients),
		"blank_rows": blank_rows,
		"unknown_patient": unknown_patient,
		"erpnext_rows": len(erp_rows),
		"matched": matched,
		"missing": missing,
		"missing_free": missing_free,
		"missing_blocked": missing_blocked,
		"missing_total": len(missing),
		"fills": fills,
		"differs": differs,
		"duplicates": duplicates,
		"skipped_duplicates": skipped_duplicates,
		"extra_rows": extra_rows,
		"blocked_sample": blocked_sample,
	}


def _scan() -> dict:
	return _classify(_oracle_rows(), _erpnext_rows())



# ---------------------------------------------------------------------------
# Work list and repair
# ---------------------------------------------------------------------------


def _work_items(
	scan: dict,
	*,
	patient: str = "",
	limit: int = 0,
	suffix_conflicts: int = 1,
	fill_missing: int = 1,
	clean_duplicates: int = 1,
) -> list[list]:
	"""What one run has to do, in the order it has to be done."""
	patient = (patient or "").strip()
	items: list[list] = []

	if cint(fill_missing):
		for name, row_patient, changes in scan["fills"]:
			if patient and row_patient != patient:
				continue
			items.append(["fill", name, row_patient or "", changes])

	for number, kind, payload in scan["missing"]:
		if patient and _resolve_patient(payload.get("patient_num")) != patient:
			continue
		if kind == "blocked" and not cint(suffix_conflicts):
			continue
		items.append(["create", number, kind, payload])

	if cint(clean_duplicates):
		for entry in scan["duplicates"]:
			remove, keeper = entry[0], entry[1]
			row_patient = entry[2] if len(entry) > 2 else ""
			if patient and row_patient != patient:
				continue
			items.append(["dedupe", remove, keeper, ""])

	if cint(limit):
		items = items[: cint(limit)]
	return items


def _free_suffixed_key(number: str) -> str:
	"""``<num>-W`` (``-W-2``, ``-W-3``…) that no record is using yet."""
	candidate = f"{number}{CONFLICT_SUFFIX}"
	index = 2
	while frappe.db.exists(DOCTYPE, candidate):
		candidate = f"{number}{CONFLICT_SUFFIX}-{index}"
		index += 1
	return candidate


def _create_warning(number: str, payload: dict, dry_run: int) -> dict:
	fields = _build_warning_message_fields(dict(payload, warning_message_num=number))
	name = number if not frappe.db.exists(DOCTYPE, number) else _free_suffixed_key(number)
	result = {"action": "created", "name": name, "suffixed": name != number}
	if cint(dry_run):
		return result

	doc = frappe.get_doc({"doctype": DOCTYPE, "name": name, **fields, "trans_id": name})
	doc.flags.ignore_validate = True
	doc.flags.ignore_mandatory = True
	doc.flags.ignore_links = True
	doc.flags.ignore_permissions = True
	doc.flags.legacy_import = True
	doc.insert(ignore_permissions=True)
	result["name"] = doc.name
	return result


def _fill_warning(name: str, changes: dict, dry_run: int) -> dict:
	"""Fill the fields ERPNext left empty; a value that is there is never replaced."""
	if not frappe.db.exists(DOCTYPE, name):
		return {"action": "skipped_missing"}
	current = frappe.db.get_value(DOCTYPE, name, list(changes.keys()), as_dict=True) or {}
	update = {
		field: value
		for field, value in changes.items()
		if _is_blank(current.get(field)) and not _is_blank(value)
	}
	if not update:
		return {"action": "skipped_unchanged"}
	if not cint(dry_run):
		frappe.db.set_value(DOCTYPE, name, update, update_modified=False)
	return {"action": "filled", "fields": sorted(update.keys())}



def _remove_duplicate(remove: str, keeper: str, dry_run: int) -> dict:
	"""Delete one duplicate copy - only after re-checking that it still is one."""
	if not frappe.db.exists(DOCTYPE, keeper) or not frappe.db.exists(DOCTYPE, remove):
		return {"action": "skipped_missing"}

	fields = list(FILL_FIELDS) + ["is_special_phone_warning", "is_allergy"]
	loss = frappe.db.get_value(DOCTYPE, remove, fields, as_dict=True) or {}
	keep = frappe.db.get_value(DOCTYPE, keeper, fields, as_dict=True) or {}
	if (loss.get("patient") or "") != (keep.get("patient") or ""):
		return {"action": "skipped_other_patient"}
	if _norm_text(loss.get("warning")) != _norm_text(keep.get("warning")):
		return {"action": "skipped_changed"}
	if cint(loss.get("is_special_phone_warning")) or _has_attachment(remove):
		return {"action": "skipped_protected"}
	if _richer_than(loss, keep):
		return {"action": "skipped_richer"}

	if not cint(dry_run):
		if cint(loss.get("is_allergy")) and not cint(keep.get("is_allergy")):
			# The kept (legacy) record inherits the allergy flag, so the allergy
			# register and the warning popup keep flagging the patient.
			frappe.db.set_value(DOCTYPE, keeper, "is_allergy", 1, update_modified=False)
		frappe.delete_doc(DOCTYPE, remove, ignore_permissions=True, force=True)
	return {"action": "removed"}


def _process_chunk(chunk: list[list], progress: dict, dry_run: int = 0) -> None:
	created = suffixed = filled = removed = 0
	skipped_existing = skipped_unchanged = 0
	errors: list[str] = []
	samples: list[str] = []

	for item in chunk:
		op, key = item[0], item[1]
		try:
			if op == "create":
				result = _create_warning(key, item[3] or {}, dry_run)
				if result["action"] == "created":
					created += 1
					if result.get("suffixed"):
						suffixed += 1
					samples.append(
						_("created {0}").format(result.get("name") or key)
						if not cint(dry_run)
						else _("would create {0}").format(result.get("name") or key)
					)
				else:
					skipped_existing += 1
			elif op == "fill":
				result = _fill_warning(key, item[3] or {}, dry_run)
				if result["action"] == "filled":
					filled += 1
					samples.append(
						_("{0}: filled {1}").format(key, ", ".join(result.get("fields") or []))
					)
				else:
					skipped_unchanged += 1
			elif op == "dedupe":
				result = _remove_duplicate(key, item[2] or "", dry_run)
				if result["action"] == "removed":
					removed += 1
					samples.append(_("{0}: duplicate of {1}").format(key, item[2] or ""))
				else:
					skipped_unchanged += 1
		except Exception:
			errors.append(_("{0} {1}: {2}").format(op, key, frappe.get_traceback()))
			frappe.log_error(title=f"Warning message reconciliation failed: {op} {key}")

	progress["created"] = cint(progress.get("created")) + created
	progress["suffixed_keys"] = cint(progress.get("suffixed_keys")) + suffixed
	progress["filled"] = cint(progress.get("filled")) + filled
	progress["removed"] = cint(progress.get("removed")) + removed
	progress["skipped_existing"] = cint(progress.get("skipped_existing")) + skipped_existing
	progress["skipped_unchanged"] = cint(progress.get("skipped_unchanged")) + skipped_unchanged
	_record_samples(progress, samples[:SAMPLE_LIMIT])
	_record_errors(progress, errors)





def _summary_message(progress: dict) -> str:
	lines = [
		_("Warning Message reconciliation finished."),
		"",
		_("Oracle warnings: {0} ({1} with text, {2} patients)").format(
			cint(progress.get("oracle_rows")),
			cint(progress.get("oracle_rows_with_text")),
			cint(progress.get("oracle_patients")),
		),
		_("Warning Messages in ERPNext: {0} ({1} match Oracle)").format(
			cint(progress.get("erpnext_rows")), cint(progress.get("matched"))
		),
		"",
		_("Created: {0} of {1} missing ({2} free, {3} whose number another patient owns)").format(
			cint(progress.get("created")),
			cint(progress.get("missing_total")),
			cint(progress.get("missing_free")),
			cint(progress.get("missing_blocked")),
		),
		_("Filled from Oracle: {0} of {1} incomplete warnings").format(
			cint(progress.get("filled")), cint(progress.get("fill_total"))
		),
		_("Duplicates removed: {0} of {1}").format(
			cint(progress.get("removed")), cint(progress.get("duplicate_total"))
		),
	]
	if cint(progress.get("suffixed_keys")):
		lines.append(
			_("{0} warnings were created as <num>{1} because an app record owns the number.").format(
				cint(progress.get("suffixed_keys")), CONFLICT_SUFFIX
			)
		)
	if cint(progress.get("differs_total")):
		lines.append(
			_("{0} warnings hold values that differ from Oracle and were left untouched.").format(
				cint(progress.get("differs_total"))
			)
		)
	if cint(progress.get("skipped_duplicates")):
		lines.append(
			_("{0} duplicate copies were kept (phone warning, attachment or extra data).").format(
				cint(progress.get("skipped_duplicates"))
			)
		)
	if cint(progress.get("skipped_unchanged")):
		lines.append(
			_("Skipped (nothing left to write): {0}").format(cint(progress.get("skipped_unchanged")))
		)
	if cint(progress.get("failed")):
		lines.append(_("Failed: {0}").format(cint(progress.get("failed"))))
	if cint(progress.get("dry_run")):
		lines.insert(1, _("Dry run - nothing was written."))

	samples = progress.get("samples") or []
	if samples:
		lines.extend(["", _("Samples")])
		lines.extend(f"• {sample}" for sample in samples)
	errors = progress.get("errors") or []
	if errors:
		lines.extend(["", _("Errors")])
		lines.extend(f"• {error}" for error in errors)
	return "\n".join(lines)


# ---------------------------------------------------------------------------
# Background job
# ---------------------------------------------------------------------------


def _queue_next(token: str, progress: dict, files: Any = None) -> None:
	frappe.enqueue(
		"healthcare.api.warning_message_reconcile.run_warning_message_reconcile",
		queue="long",
		timeout=7200,
		resume=1,
		token=token,
		dry_run=cint(progress.get("dry_run")),
		files=files,
	)


def _apply_scan(progress: dict, scan: dict, items: list[list]) -> None:
	progress.update(
		{
			"oracle_rows": scan["oracle_rows"],
			"oracle_rows_with_text": scan["oracle_rows_with_text"],
			"oracle_patients": scan["oracle_patients"],
			"blank_rows": scan["blank_rows"],
			"unknown_patient": scan["unknown_patient"],
			"erpnext_rows": scan["erpnext_rows"],
			"matched": scan["matched"],
			"missing_free": scan["missing_free"],
			"missing_blocked": scan["missing_blocked"],
			"missing_total": scan["missing_total"],
			"fill_total": len(scan["fills"]),
			"differs_total": len(scan["differs"]),
			"duplicate_total": len(scan["duplicates"]),
			"skipped_duplicates": scan["skipped_duplicates"],
			"extra_rows": scan["extra_rows"],
			"total": len(items),
			"state": "running",
		}
	)


def _run(
	token: str,
	resume: int,
	limit: int,
	dry_run: int = 0,
	suffix_conflicts: int = 1,
	fill_missing: int = 1,
	clean_duplicates: int = 1,
	patient: str = "",
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
		fill_missing = cint(progress.get("fill_missing"))
		clean_duplicates = cint(progress.get("clean_duplicates"))
		patient = progress.get("patient") or patient
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
				"fill_missing": cint(fill_missing),
				"clean_duplicates": cint(clean_duplicates),
				"patient": patient or "",
				"files": files or [],
				"index": 0,
				"processed": 0,
				"message": _("Comparing the warning messages with Oracle…"),
			}
		)
		_set_progress(progress)

		scan = _scan()
		items = _work_items(
			scan,
			patient=patient,
			limit=limit,
			suffix_conflicts=suffix_conflicts,
			fill_missing=fill_missing,
			clean_duplicates=clean_duplicates,
		)
		_set_work({"items": items, "built_at": str(now_datetime())})
		_apply_scan(progress, scan, items)
		frappe.db.commit()
		_set_progress(progress)

	if not items:
		frappe.db.commit()
		progress.update(
			{
				"state": "finished",
				"finished_at": str(now_datetime()),
				"message": _(
					"ERPNext already has every warning Oracle recorded and no duplicates were found. Nothing to do."
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
		_process_chunk(chunk, progress, dry_run=cint(progress.get("dry_run")))
		progress["index"] = offset + len(chunk)
		progress["processed"] = cint(progress.get("index"))
		frappe.db.commit()
		_set_progress(progress)
		_refresh_lock(token)

		if time.monotonic() - started > TIME_BUDGET:
			progress["state"] = "queued"
			progress["message"] = _(
				"Still running in the background ({0} of {1} steps processed)."
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


def _preview_payload(scan: dict, items: list[list]) -> dict[str, Any]:
	"""The dialog's numbers. The work counts describe the run a filter leaves."""
	creates = [item for item in items if item[0] == "create"]
	fills = [item for item in items if item[0] == "fill"]
	dedupes = [item for item in items if item[0] == "dedupe"]
	# Samples come from the rows the run will actually touch.
	missing_by_number = {item[1]: item for item in creates}
	samples = [
		{
			"number": number,
			"patient": _resolve_patient(payload.get("patient_num")) or "",
			"text": _cell_text(payload.get("warning_message")).replace("\n", " ")[:160],
			"kind": kind,
		}
		for number, kind, payload in scan["missing"]
		if number in missing_by_number
	][:10]
	fill_names = {item[1] for item in fills}
	fill_samples = [
		{"name": name, "patient": patient, "fields": sorted(changes.keys())}
		for name, patient, changes in scan["fills"]
		if name in fill_names
	][:10]
	remove_names = {item[1] for item in dedupes}
	duplicate_samples = [
		{"remove": entry[0], "keeper": entry[1]}
		for entry in scan["duplicates"]
		if entry[0] in remove_names
	][:10]
	result: dict[str, Any] = {
		"oracle_rows": scan["oracle_rows"],
		"oracle_rows_with_text": scan["oracle_rows_with_text"],
		"oracle_patients": scan["oracle_patients"],
		"blank_rows": scan["blank_rows"],
		"unknown_patient": scan["unknown_patient"],
		"erpnext_rows": scan["erpnext_rows"],
		"matched": scan["matched"],
		"missing_free": sum(1 for item in creates if item[2] == "free"),
		"missing_blocked": sum(1 for item in creates if item[2] == "blocked"),
		"missing_total": len(creates),
		"fill_total": len(fills),
		"differs_total": len(scan["differs"]),
		"duplicate_total": len(dedupes),
		"skipped_duplicates": scan["skipped_duplicates"],
		"extra_rows": scan["extra_rows"],
		"work_total": len(items),
		"register_missing_total": scan["missing_total"],
		"blocked_sample": scan["blocked_sample"],
		"samples": samples,
		"fill_sample": fill_samples,
		"duplicate_sample": duplicate_samples,
	}
	result["in_sync"] = not (
		result["missing_total"] or result["fill_total"] or result["duplicate_total"]
	)
	result["has_work"] = bool(items)
	return result


@frappe.whitelist()
def preview_warning_message_reconcile(patient: str = "", limit: int = 0, files=None) -> dict[str, Any]:
	"""Read-only answer to "does the warning register match Oracle?"."""
	_require_admin()
	files = normalize_files(files)
	with excel_source(files, tables=[ORACLE_TABLE]) as source:
		scan = _scan()
		items = _work_items(scan, patient=patient, limit=limit, suffix_conflicts=1)
		result = _preview_payload(scan, items)
		if source is not None:
			result["oracle_table"] = source.describe(ORACLE_TABLE)
	return result


@frappe.whitelist()
def start_warning_message_reconcile(
	patient: str = "",
	limit: int = 0,
	dry_run: int = 0,
	suffix_conflicts: int = 1,
	fill_missing: int = 1,
	clean_duplicates: int = 1,
	files=None,
) -> dict[str, Any]:
	"""Queue one reconciliation of the warning register (button entry point)."""
	_require_admin()
	files = normalize_files(files)
	if _lock_held():
		return {
			"queued": False,
			"running": True,
			"message": _("A warning message reconciliation is already running."),
			"status": _load_progress(),
		}

	progress = _new_progress(limit)
	progress.update(
		{
			"state": "queued",
			"dry_run": cint(dry_run),
			"suffix_conflicts": cint(suffix_conflicts),
			"fill_missing": cint(fill_missing),
			"clean_duplicates": cint(clean_duplicates),
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
		"healthcare.api.warning_message_reconcile.run_warning_message_reconcile",
		queue="long",
		timeout=7200,
		limit=cint(limit),
		dry_run=cint(dry_run),
		suffix_conflicts=cint(suffix_conflicts),
		fill_missing=cint(fill_missing),
		clean_duplicates=cint(clean_duplicates),
		patient=patient or "",
		files=files,
	)
	return {"queued": True, "job_key": JOB_KEY, "status": progress}


@frappe.whitelist()
def get_warning_message_reconcile_status() -> dict[str, Any]:
	"""Progress of the last / ongoing reconciliation (polled by the settings dialog)."""
	_require_admin()
	return _load_progress() or {
		"job_key": JOB_KEY,
		"state": "idle",
		"processed": 0,
		"total": 0,
	}


def run_warning_message_reconcile(
	limit: int = 0,
	resume: int = 0,
	token: str | None = None,
	dry_run: int = 0,
	suffix_conflicts: int = 1,
	fill_missing: int = 1,
	clean_duplicates: int = 1,
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
				"message": _("A warning message reconciliation is already running."),
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
				cint(fill_missing),
				cint(clean_duplicates),
				patient or "",
				files,
			)
	except Exception:
		progress = _load_progress() or _new_progress()
		progress["state"] = "failed"
		progress["message"] = frappe.get_traceback()
		_record_errors(progress, [frappe.get_traceback()])
		_set_progress(progress)
		frappe.log_error(title="Warning message reconciliation failed")
		raise
	finally:
		if not outcome.get("handed_over"):
			_release_lock(token)
	return outcome
