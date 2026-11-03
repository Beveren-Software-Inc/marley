"""Report and (optionally) remove duplicate Clinical Notes.

Clinical Notes are fed by two different legacy sources, so duplicates are reported per scope:

* ``visits``    - built from the Patient Visit "Review Details" (``encounter_comment`` /
                  Oracle ``VISIT_00_01.VISIT_DIAGNOSIS_DETAIL``) by
                  ``healthcare.api.patient_visit_encounter_comment_clinical_note``. Repeated
                  backfill runs duplicated these, so they are the default cleanup scope.
* ``inpatient`` - built from Oracle ``IP_ADMISSION_DIAGNOSES`` by
                  ``healthcare.api.ip_admission_clinical_note_import`` (note name = ``TRANS_NUM``).
                  A repeated text there is usually a genuine repeat inside Oracle (same note saved
                  2-3 times by the same user minutes apart), so these are only cleaned when
                  ``include_legacy_inpatient=1``. Copies typed inside ERPNext (``CN-*`` names)
                  are cleaned automatically because Oracle has no such row.

A duplicate is a note that is byte-identical to another note on patient + reference +
posting date + note text. Nothing is deleted unless every copy matches on COMPARED_FIELDS.
Locked, submitted and attachment-holding notes are always kept.

Such copies are one transaction stored several times (every import run numbered the note
again), so the kept note takes over the identity of the whole group before the other copies
go: ``merged_trans_nos`` lists every trans number the transaction was stored under and
``repeat_count`` the number of copies it had (3 = the same note came in three times).

Usage (System Manager / Healthcare Administrator only):

    bench --site <site> execute healthcare.api.clinical_note_duplicate_cleanup.preview_clinical_note_duplicates
    bench --site <site> execute healthcare.api.clinical_note_duplicate_cleanup.cleanup_clinical_note_duplicates --kwargs "{'dry_run': 1}"
    bench --site <site> execute healthcare.api.clinical_note_duplicate_cleanup.cleanup_clinical_note_duplicates --kwargs "{'dry_run': 0}"
    bench --site <site> execute healthcare.api.clinical_note_duplicate_cleanup.cleanup_clinical_note_duplicates --kwargs "{'scope': 'all', 'dry_run': 1}"
"""

from __future__ import annotations

import frappe
from frappe.utils import cint

DEFAULT_SAMPLE_LIMIT = 25
DEFAULT_COMMIT_EVERY = 200
DEFAULT_BATCH_SIZE = 500

SCOPE_VISITS = "visits"
SCOPE_INPATIENT = "inpatient"
SCOPE_ALL = "all"
SCOPES = (SCOPE_VISITS, SCOPE_INPATIENT, SCOPE_ALL)

# Patient Visit notes keep their link in reference_doc/reference_name, Inpatient Admission notes
# in reference_doctype/reference_document, so both pairs are coalesced into one reference.
REFERENCE_SQL = "IFNULL(reference_doc, IFNULL(reference_doctype, ''))"
REFERENCE_NAME_SQL = "IFNULL(reference_name, IFNULL(reference_document, IFNULL(inpatient_admission, '')))"

SCOPE_WHERE_SQL = {
	SCOPE_VISITS: f"AND {REFERENCE_SQL} = 'Patient Visit'",
	SCOPE_INPATIENT: (
		f"AND ({REFERENCE_SQL} = 'Inpatient Admission'"
		" OR (IFNULL(reference_doc, '') = '' AND IFNULL(inpatient_admission, '') <> ''))"
	),
	SCOPE_ALL: "",
}

# Groups are keyed on these values; keep in sync with _signature().
SIGNATURE_SQL = (
	"md5(concat_ws('|', ifnull(patient, ''), "
	f"{REFERENCE_SQL}, {REFERENCE_NAME_SQL}, "
	"date(posting_date), md5(note)))"
)

# If any of these differ inside a group the notes are not treated as copies.
COMPARED_FIELDS = (
	"patient",
	"reference_doc",
	"reference_name",
	"reference_doctype",
	"reference_document",
	"inpatient_admission",
	"posting_date",
	"note",
	"clinical_note_type",
	"medical_role",
	"practitioner",
	"cost_center",
	"username",
)


def _scope_where(scope: str) -> str:
	if scope not in SCOPES:
		frappe.throw(f"Unknown scope {scope!r}; expected one of {', '.join(SCOPES)}")
	return SCOPE_WHERE_SQL[scope]


def _scope_of(reference: str) -> str:
	if reference == "Patient Visit":
		return SCOPE_VISITS
	if reference == "Inpatient Admission":
		return SCOPE_INPATIENT
	return "other"


def _looks_like_legacy_import(names: list[str]) -> bool:
	"""Legacy IP notes are named after the Oracle TRANS_NUM, UI-created ones are ``CN-*``."""
	return bool(names) and all(name.isdigit() for name in names)



def _require_admin() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def _note_preview(text: str | None, length: int = 90) -> str:
	flat = (text or "").replace("<br>", " ").replace("</p>", " ").replace("<p>", " ")
	flat = " ".join(flat.split())
	return flat if len(flat) <= length else flat[: length - 3] + "..."


def _patient_where(patient: str | None = None) -> tuple[str, list[str]]:
	patient = (patient or "").strip()
	if not patient:
		return "", []
	return " AND patient = %s", [patient]


def _run_sql(query: str, params: list | tuple | None = None, **kwargs):
	"""Run SQL; never pass ``None`` as values (MySQLdb wraps it as ``(None,)``)."""
	if params:
		return frappe.db.sql(query, tuple(params), **kwargs)
	return frappe.db.sql(query, **kwargs)


def _group_rows(
	scope: str = SCOPE_ALL,
	limit: int = 0,
	after_signature: str | None = None,
	patient: str | None = None,
) -> list[dict]:
	"""One row per duplicate group, member names comma separated (oldest first).

	``after_signature`` walks the groups in a stable order, so a background job can delete
	as it goes: an OFFSET would skip groups once the deletions shrink the result set.
	"""
	limit_sql = f"LIMIT {cint(limit)}" if cint(limit) else ""
	having = ["COUNT(*) > 1"]
	params: list[str] = []
	patient_sql, patient_params = _patient_where(patient)
	params.extend(patient_params)
	if after_signature:
		# The alias is resolved by MySQL; repeating the md5() expression in HAVING fails
		# because it mentions columns that are not grouped individually.
		having.append("signature > %s")
		params.append(after_signature)
		order_sql = "ORDER BY signature"
	else:
		order_sql = "ORDER BY copies DESC, posting_date DESC"
	query = f"""
		SELECT
			{SIGNATURE_SQL} AS signature,
			MIN(patient) AS patient,
			MIN({REFERENCE_SQL}) AS reference,
			MIN({REFERENCE_NAME_SQL}) AS reference_name,
			DATE(MIN(posting_date)) AS posting_date,
			COUNT(*) AS copies,
			GROUP_CONCAT(name ORDER BY creation, name SEPARATOR ',') AS names,
			GROUP_CONCAT(trans_no ORDER BY creation, name SEPARATOR ',') AS trans_nos,
			MIN(note) AS note
		FROM `tabClinical Note`
		WHERE docstatus < 2 {_scope_where(scope)}{patient_sql}
		GROUP BY {SIGNATURE_SQL}
		HAVING {' AND '.join(having)}
		{order_sql}
		{limit_sql}
		"""
	rows = _run_sql(query, params, as_dict=True)
	for row in rows:
		row["names"] = [name for name in (row.get("names") or "").split(",") if name]
		row["trans_nos"] = [number for number in (row.get("trans_nos") or "").split(",") if number]
		row["scope"] = _scope_of(row.get("reference") or "")
		row["legacy_import"] = _looks_like_legacy_import(row["names"])
		row["preview"] = _note_preview(row.pop("note", None))
	return rows


def _group_count(scope: str = SCOPE_ALL, patient: str | None = None) -> int:
	patient_sql, patient_params = _patient_where(patient)
	return int(
		_run_sql(
			f"""
			SELECT COUNT(*) FROM (
				SELECT 1
				FROM `tabClinical Note`
				WHERE docstatus < 2 {_scope_where(scope)}{patient_sql}
				GROUP BY {SIGNATURE_SQL}
				HAVING COUNT(*) > 1
			) dup
			""",
			patient_params,
		)[0][0]
		or 0
	)


def _extra_copies(scope: str = SCOPE_ALL, patient: str | None = None) -> int:
	patient_sql, patient_params = _patient_where(patient)
	return int(
		_run_sql(
			f"""
			SELECT IFNULL(SUM(copies - 1), 0) FROM (
				SELECT COUNT(*) AS copies
				FROM `tabClinical Note`
				WHERE docstatus < 2 {_scope_where(scope)}{patient_sql}
				GROUP BY {SIGNATURE_SQL}
				HAVING COUNT(*) > 1
			) dup
			""",
			patient_params,
		)[0][0]
		or 0
	)


@frappe.whitelist()
def preview_clinical_note_duplicates(
	sample_limit=DEFAULT_SAMPLE_LIMIT, scope: str = SCOPE_ALL, patient: str = ""
) -> dict:
	"""Read-only duplicate report. Safe to call on production."""
	_require_admin()
	sample_limit = cint(sample_limit) or DEFAULT_SAMPLE_LIMIT
	patient = (patient or "").strip()
	patient_sql, patient_params = _patient_where(patient)
	where = f"{_scope_where(scope)}{patient_sql}"

	return {
		"scope": scope,
		"patient": patient,
		"total_notes": frappe.db.count(
			"Clinical Note",
			{"docstatus": ("<", 2), **({"patient": patient} if patient else {})},
		),
		"duplicate_groups": _group_count(scope, patient=patient),
		"extra_copies": _extra_copies(scope, patient=patient),
		"by_scope": {
			name: {
				"groups": _group_count(name, patient=patient),
				"extra_copies": _extra_copies(name, patient=patient),
			}
			for name in (SCOPE_VISITS, SCOPE_INPATIENT)
		},
		"by_size": _run_sql(
			f"""
			SELECT copies, COUNT(*) FROM (
				SELECT COUNT(*) AS copies
				FROM `tabClinical Note`
				WHERE docstatus < 2 {where}
				GROUP BY {SIGNATURE_SQL}
				HAVING COUNT(*) > 1
			) dup
			GROUP BY copies ORDER BY copies
			""",
			patient_params,
			as_list=True,
		),
		"by_reference": _run_sql(
			f"""
			SELECT IFNULL(reference, '(none)'), COUNT(*) FROM (
				SELECT MIN({REFERENCE_SQL}) AS reference
				FROM `tabClinical Note`
				WHERE docstatus < 2 {where}
				GROUP BY {SIGNATURE_SQL}
				HAVING COUNT(*) > 1
			) dup
			GROUP BY 1 ORDER BY 2 DESC
			""",
			patient_params,
			as_list=True,
		),
		"copies_created_per_day": _run_sql(
			f"""
			SELECT DATE(creation), COUNT(*) FROM `tabClinical Note`
			WHERE docstatus < 2 {patient_sql} AND {SIGNATURE_SQL} IN (
				SELECT h FROM (
					SELECT {SIGNATURE_SQL} AS h
					FROM `tabClinical Note`
					WHERE docstatus < 2 {where}
					GROUP BY h HAVING COUNT(*) > 1
				) g
			)
			GROUP BY 1 ORDER BY 1
			""",
			(patient_params + patient_params) if patient_params else None,
			as_list=True,
		),
		"sample": [
			{
				"patient": row["patient"],
				"scope": row["scope"],
				"reference": f"{row['reference'] or '(none)'} {row['reference_name']}".strip(),
				"posting_date": str(row["posting_date"]),
				"copies": row["copies"],
				"legacy_import": row["legacy_import"],
				"keep": row["names"][0],
				"delete": row["names"][1:],
				"trans_nos": row["trans_nos"],
				"merged_trans_nos": ", ".join(row["trans_nos"]),
				"note": row["preview"],
			}
			for row in _group_rows(scope=scope, limit=sample_limit, patient=patient)
		],
	}


@frappe.whitelist()
def report_inpatient_duplicates(limit=0) -> dict:
	"""Inpatient duplicates with their creator/time, for clinical review.

	Repeated Doctor Progress Notes for an admission usually mirror repeated rows in Oracle
	``IP_ADMISSION_DIAGNOSES`` (same note saved 2-3 times by the same user), so they are
	flagged ``oracle_source_likely`` and kept. Groups whose copies were typed inside ERPNext
	(``CN-*`` names) are flagged ``erpnext_entry`` and can be cleaned with
	``cleanup_clinical_note_duplicates(scope='inpatient')``.
	"""
	_require_admin()

	groups = _group_rows(scope=SCOPE_INPATIENT, limit=limit)
	names = [name for group in groups for name in group["names"]]
	members_by_name = {member["name"]: member for member in _load_group_members(names)} if names else {}

	rows = []
	for group in groups:
		members = [members_by_name[name] for name in group["names"] if name in members_by_name]
		rows.append(
			{
				"patient": group["patient"],
				"patient_name": frappe.db.get_value("Patient", group["patient"], "patient_name"),
				"admission": group["reference_name"],
				"posting_date": str(group["posting_date"]),
				"copies": group["copies"],
				"classification": "oracle_source_likely" if group["legacy_import"] else "erpnext_entry",
				"note": group["preview"],
				"copies_detail": [
					{
						"name": member["name"],
						"clinical_note_type": member.get("clinical_note_type"),
						"owner": member.get("owner"),
						"created": str(member.get("creation") or ""),
					}
					for member in members
				],
			}
		)

	return {
		"groups": len(rows),
		"extra_copies": sum(row["copies"] - 1 for row in rows),
		"oracle_source_likely": sum(1 for row in rows if row["classification"] == "oracle_source_likely"),
		"erpnext_entry": sum(1 for row in rows if row["classification"] == "erpnext_entry"),
		"rows": rows,
	}


def _load_group_members(names: list[str]) -> list[dict]:
	placeholders = ", ".join(["%s"] * len(names))
	fields = ", ".join(
		dict.fromkeys(
			("name", "creation", "owner", "docstatus", "note_locked", "trans_no", *COMPARED_FIELDS)
		)
	)
	return frappe.db.sql(
		f"""
		SELECT {fields}
		FROM `tabClinical Note`
		WHERE name IN ({placeholders})
		ORDER BY creation, name
		""",
		tuple(names),
		as_dict=True,
	)


def _signature(member: dict, match_posting_time: bool = True) -> tuple:
	values = []
	for field in COMPARED_FIELDS:
		value = member.get(field)
		if field == "posting_date":
			value = str(value or "")
			value = value[:16] if match_posting_time else value[:10]
		values.append(value or "")
	return tuple(values)


def _attachment_holders(names: list[str]) -> set[str]:
	if not names:
		return set()
	placeholders = ", ".join(["%s"] * len(names))
	rows = frappe.db.sql(
		f"""
		SELECT DISTINCT attached_to_name FROM `tabFile`
		WHERE attached_to_doctype = 'Clinical Note' AND attached_to_name IN ({placeholders})
		""",
		tuple(names),
	)
	return {row[0] for row in rows}


def _merge_payload(members: list[dict]) -> dict:
	"""One transaction, one note: keep every trans number the copies were stored under.

	The oldest member comes first (``_load_group_members`` orders by creation), so the
	surviving note's own number leads and the numbers of the copies follow it.
	"""
	numbers: list[str] = []
	for member in members:
		number = str(member.get("trans_no") or "").strip() or str(member.get("name") or "").strip()
		if number and number not in numbers:
			numbers.append(number)
	return {"merged_trans_nos": ", ".join(numbers), "repeat_count": len(members)}


def _new_result(
	dry_run: int, scope: str, include_legacy_inpatient: int, match_posting_time: int
) -> dict:
	return {
		"dry_run": dry_run,
		"scope": scope,
		"include_legacy_inpatient": include_legacy_inpatient,
		"match_posting_time": match_posting_time,
		"groups_scanned": 0,
		"groups_merged": 0,
		"notes_deleted": 0,
		"skipped_inpatient_legacy": 0,
		"skipped_locked": 0,
		"skipped_attachment": 0,
		"skipped_variance": 0,
		"skipped_submitted": 0,
		"errors": 0,
		"actions": [],
	}


def _append_action(result: dict, action: dict) -> None:
	if len(result["actions"]) < DEFAULT_SAMPLE_LIMIT:
		result["actions"].append(action)


def _process_group(
	group: dict,
	members_by_name: dict[str, dict],
	with_files: set[str],
	*,
	include_legacy_inpatient: int,
	match_posting_time: int,
	dry_run: int,
	result: dict,
) -> int:
	"""Merge one identical group; returns the number of notes deleted (or to delete)."""
	result["groups_scanned"] += 1

	# Repeated IP text is normally a real repeat in Oracle IP_ADMISSION_DIAGNOSES, so the
	# legacy copies are left alone unless the caller explicitly asks for them.
	if group["scope"] == SCOPE_INPATIENT and group["legacy_import"] and not include_legacy_inpatient:
		result["skipped_inpatient_legacy"] += 1
		return 0

	members = [members_by_name[name] for name in group["names"] if name in members_by_name]
	if len(members) < 2:
		result["skipped_variance"] += 1
		return 0

	if len({_signature(member, match_posting_time) for member in members}) > 1:
		result["skipped_variance"] += 1
		return 0

	locked_names = {member["name"] for member in members if cint(member.get("note_locked"))}
	keep = min(locked_names) if locked_names else members[0]["name"]

	deletable: list[str] = []
	for member in members:
		name = member["name"]
		if name == keep:
			continue
		if name in locked_names:
			result["skipped_locked"] += 1
			continue
		if name in with_files:
			result["skipped_attachment"] += 1
			continue
		if cint(member.get("docstatus")) == 1:
			result["skipped_submitted"] += 1
			continue
		deletable.append(name)

	payload = _merge_payload(members)
	action = {
		"patient": group["patient"],
		"scope": group["scope"],
		"reference": f"{group['reference'] or '(none)'} {group['reference_name']}".strip(),
		"posting_date": str(group["posting_date"]),
		"keep": keep,
		"delete": deletable,
		"merged_trans_nos": payload["merged_trans_nos"],
		"repeat_count": payload["repeat_count"],
	}

	if dry_run:
		result["groups_merged"] += 1
		result["notes_deleted"] += len(deletable)
		_append_action(result, action)
		return len(deletable)

	# The surviving note must carry every trans number before a copy is deleted, so the
	# transaction stays complete even if the delete fails half way.
	try:
		frappe.db.set_value("Clinical Note", keep, payload, update_modified=False)
		result["groups_merged"] += 1
	except Exception:
		frappe.db.rollback()
		result["errors"] += 1
		frappe.log_error(
			title=f"Clinical Note duplicate merge failed: {keep}",
			message=frappe.get_traceback(),
		)
		return 0

	deleted = 0
	for name in deletable:
		try:
			frappe.delete_doc("Clinical Note", name, ignore_permissions=True, ignore_missing=True)
			deleted += 1
		except Exception:
			frappe.db.rollback()
			deleted = 0
			result["errors"] += 1
			frappe.log_error(
				title=f"Clinical Note duplicate cleanup failed: {name}",
				message=frappe.get_traceback(),
			)
	result["notes_deleted"] += deleted
	_append_action(result, action)
	return deleted


def _process_page(
	groups: list[dict],
	*,
	include_legacy_inpatient: int,
	match_posting_time: int,
	dry_run: int,
	result: dict,
	commit_every: int = 0,
) -> None:
	names = [name for group in groups for name in group["names"]]
	members_by_name = {member["name"]: member for member in _load_group_members(names)} if names else {}
	with_files = _attachment_holders(names)

	since_commit = 0
	for group in groups:
		since_commit += _process_group(
			group,
			members_by_name,
			with_files,
			include_legacy_inpatient=include_legacy_inpatient,
			match_posting_time=match_posting_time,
			dry_run=dry_run,
			result=result,
		)
		if not dry_run and commit_every and since_commit >= commit_every:
			frappe.db.commit()
			since_commit = 0


@frappe.whitelist()
def cleanup_clinical_note_duplicates(
	dry_run=1,
	scope: str = SCOPE_VISITS,
	include_legacy_inpatient=0,
	match_posting_time=1,
	limit=0,
	commit_every=DEFAULT_COMMIT_EVERY,
	page=DEFAULT_BATCH_SIZE,
	patient: str = "",
) -> dict:
	"""Delete extra copies, keeping the oldest (and any locked) note of each identical group.

	``dry_run=1`` (default) only reports what would be deleted.
	Locked, submitted and attachment-holding notes are never deleted.

	The surviving note takes over the identity of the whole group before a copy is removed:
	``merged_trans_nos`` receives every trans number of the group and ``repeat_count`` the
	number of copies, so one transaction stays readable as one note.

	``scope`` defaults to ``visits`` (Patient Visit "Review Details" duplicates). Inpatient
	notes are only cleaned when the scope includes them *and* either the copies were created
	inside ERPNext (``CN-*`` names) or ``include_legacy_inpatient=1`` is passed - repeated IP
	texts are normally genuine repeats in Oracle ``IP_ADMISSION_DIAGNOSES``.

	``match_posting_time=1`` (default) requires identical posting time to the minute;
	pass ``0`` to treat same-day copies typed minutes apart as duplicates as well.

	``patient`` optionally limits the cleanup to one patient file number.
	"""
	_require_admin()
	dry_run = cint(dry_run)
	include_legacy_inpatient = cint(include_legacy_inpatient)
	match_posting_time = cint(match_posting_time)
	commit_every = cint(commit_every) or DEFAULT_COMMIT_EVERY
	page = cint(page) or DEFAULT_BATCH_SIZE
	patient = (patient or "").strip()

	result = _new_result(dry_run, scope, include_legacy_inpatient, match_posting_time)
	result["patient"] = patient

	groups = _group_rows(scope=scope, limit=limit, patient=patient)
	for start in range(0, len(groups), page):
		_process_page(
			groups[start : start + page],
			include_legacy_inpatient=include_legacy_inpatient,
			match_posting_time=match_posting_time,
			dry_run=dry_run,
			result=result,
			commit_every=commit_every,
		)

	if not dry_run:
		frappe.db.commit()

	result["duplicate_groups_remaining"] = _group_count(scope, patient=patient)
	result["extra_copies_remaining"] = _extra_copies(scope, patient=patient)
	return result


def run_cleanup_batch(
	offset=0,
	after_signature: str | None = None,
	batch_size: int = DEFAULT_BATCH_SIZE,
	scope: str = SCOPE_VISITS,
	include_legacy_inpatient=0,
	match_posting_time=1,
	dry_run=0,
) -> dict:
	"""One background batch: the next page of duplicate groups, in signature order.

	The groups are walked by signature instead of OFFSET because deleting the copies takes
	the group out of the result set - an offset would skip every group that moved up.
	"""
	batch_size = max(cint(batch_size), 1)
	include_legacy_inpatient = cint(include_legacy_inpatient)
	match_posting_time = cint(match_posting_time)
	dry_run = cint(dry_run)

	groups = _group_rows(scope=scope, limit=batch_size, after_signature=after_signature)
	result = _new_result(dry_run, scope, include_legacy_inpatient, match_posting_time)
	_process_page(
		groups,
		include_legacy_inpatient=include_legacy_inpatient,
		match_posting_time=match_posting_time,
		dry_run=dry_run,
		result=result,
	)
	if not dry_run:
		frappe.db.commit()

	samples = result.pop("actions")
	outcome = {
		"processed": cint(offset) + len(groups),
		"batch_count": len(groups),
		"done": len(groups) < batch_size,
		"last_signature": groups[-1]["signature"] if groups else after_signature,
		"total": _group_count(scope),
		"sample": samples,
	}
	outcome.update(result)
	return outcome
