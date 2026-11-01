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


def _group_rows(scope: str = SCOPE_ALL, limit: int = 0) -> list[dict]:
	"""One row per duplicate group, member names comma separated (oldest first)."""
	limit_sql = f"LIMIT {cint(limit)}" if cint(limit) else ""
	rows = frappe.db.sql(
		f"""
		SELECT
			MIN(patient) AS patient,
			MIN({REFERENCE_SQL}) AS reference,
			MIN({REFERENCE_NAME_SQL}) AS reference_name,
			DATE(MIN(posting_date)) AS posting_date,
			COUNT(*) AS copies,
			GROUP_CONCAT(name ORDER BY creation, name SEPARATOR ',') AS names,
			MIN(note) AS note
		FROM `tabClinical Note`
		WHERE docstatus < 2 {_scope_where(scope)}
		GROUP BY {SIGNATURE_SQL}
		HAVING COUNT(*) > 1
		ORDER BY copies DESC, posting_date DESC
		{limit_sql}
		""",
		as_dict=True,
	)
	for row in rows:
		row["names"] = [name for name in (row.get("names") or "").split(",") if name]
		row["scope"] = _scope_of(row.get("reference") or "")
		row["legacy_import"] = _looks_like_legacy_import(row["names"])
		row["preview"] = _note_preview(row.pop("note", None))
	return rows


def _group_count(scope: str = SCOPE_ALL) -> int:
	return int(
		frappe.db.sql(
			f"""
			SELECT COUNT(*) FROM (
				SELECT 1
				FROM `tabClinical Note`
				WHERE docstatus < 2 {_scope_where(scope)}
				GROUP BY {SIGNATURE_SQL}
				HAVING COUNT(*) > 1
			) dup
			"""
		)[0][0]
		or 0
	)


def _extra_copies(scope: str = SCOPE_ALL) -> int:
	return int(
		frappe.db.sql(
			f"""
			SELECT IFNULL(SUM(copies - 1), 0) FROM (
				SELECT COUNT(*) AS copies
				FROM `tabClinical Note`
				WHERE docstatus < 2 {_scope_where(scope)}
				GROUP BY {SIGNATURE_SQL}
				HAVING COUNT(*) > 1
			) dup
			"""
		)[0][0]
		or 0
	)


@frappe.whitelist()
def preview_clinical_note_duplicates(sample_limit=DEFAULT_SAMPLE_LIMIT, scope: str = SCOPE_ALL) -> dict:
	"""Read-only duplicate report. Safe to call on production."""
	_require_admin()
	sample_limit = cint(sample_limit) or DEFAULT_SAMPLE_LIMIT
	where = _scope_where(scope)

	return {
		"scope": scope,
		"total_notes": frappe.db.count("Clinical Note", {"docstatus": ("<", 2)}),
		"duplicate_groups": _group_count(scope),
		"extra_copies": _extra_copies(scope),
		"by_scope": {
			name: {"groups": _group_count(name), "extra_copies": _extra_copies(name)}
			for name in (SCOPE_VISITS, SCOPE_INPATIENT)
		},
		"by_size": frappe.db.sql(
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
			as_list=True,
		),
		"by_reference": frappe.db.sql(
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
			as_list=True,
		),
		"copies_created_per_day": frappe.db.sql(
			f"""
			SELECT DATE(creation), COUNT(*) FROM `tabClinical Note`
			WHERE docstatus < 2 AND {SIGNATURE_SQL} IN (
				SELECT h FROM (
					SELECT {SIGNATURE_SQL} AS h
					FROM `tabClinical Note`
					WHERE docstatus < 2 {where}
					GROUP BY h HAVING COUNT(*) > 1
				) g
			)
			GROUP BY 1 ORDER BY 1
			""",
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
				"note": row["preview"],
			}
			for row in _group_rows(scope=scope, limit=sample_limit)
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
		dict.fromkeys(("name", "creation", "owner", "docstatus", "note_locked", *COMPARED_FIELDS))
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


@frappe.whitelist()
def cleanup_clinical_note_duplicates(
	dry_run=1,
	scope: str = SCOPE_VISITS,
	include_legacy_inpatient=0,
	match_posting_time=1,
	limit=0,
	commit_every=DEFAULT_COMMIT_EVERY,
	page=DEFAULT_BATCH_SIZE,
) -> dict:
	"""Delete extra copies, keeping the oldest (and any locked) note of each identical group.

	``dry_run=1`` (default) only reports what would be deleted.
	Locked, submitted and attachment-holding notes are never deleted.

	``scope`` defaults to ``visits`` (Patient Visit "Review Details" duplicates). Inpatient
	notes are only cleaned when the scope includes them *and* either the copies were created
	inside ERPNext (``CN-*`` names) or ``include_legacy_inpatient=1`` is passed - repeated IP
	texts are normally genuine repeats in Oracle ``IP_ADMISSION_DIAGNOSES``.

	``match_posting_time=1`` (default) requires identical posting time to the minute;
	pass ``0`` to treat same-day copies typed minutes apart as duplicates as well.
	"""
	_require_admin()
	dry_run = cint(dry_run)
	include_legacy_inpatient = cint(include_legacy_inpatient)
	match_posting_time = cint(match_posting_time)
	commit_every = cint(commit_every) or DEFAULT_COMMIT_EVERY
	page = cint(page) or DEFAULT_BATCH_SIZE

	result = {
		"dry_run": dry_run,
		"scope": scope,
		"include_legacy_inpatient": include_legacy_inpatient,
		"match_posting_time": match_posting_time,
		"groups_scanned": 0,
		"notes_deleted": 0,
		"skipped_inpatient_legacy": 0,
		"skipped_locked": 0,
		"skipped_attachment": 0,
		"skipped_variance": 0,
		"skipped_submitted": 0,
		"errors": 0,
		"actions": [],
	}

	groups = _group_rows(scope=scope, limit=limit)
	deleted_since_commit = 0

	for start in range(0, len(groups), page):
		chunk = groups[start : start + page]
		names = [name for group in chunk for name in group["names"]]
		members_by_name = {member["name"]: member for member in _load_group_members(names)}
		with_files = _attachment_holders(names)

		for group in chunk:
			result["groups_scanned"] += 1

			# Repeated IP text is normally a real repeat in Oracle IP_ADMISSION_DIAGNOSES, so the
			# legacy copies are left alone unless the caller explicitly asks for them.
			if (
				group["scope"] == SCOPE_INPATIENT
				and group["legacy_import"]
				and not include_legacy_inpatient
			):
				result["skipped_inpatient_legacy"] += 1
				continue

			members = [members_by_name[name] for name in group["names"] if name in members_by_name]
			if len(members) < 2:
				result["skipped_variance"] += 1
				continue

			if len({_signature(member, match_posting_time) for member in members}) > 1:
				result["skipped_variance"] += 1
				continue

			locked_names = {member["name"] for member in members if cint(member.get("note_locked"))}
			keep = min(locked_names) if locked_names else members[0]["name"]

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

				action = {
					"patient": group["patient"],
					"scope": group["scope"],
					"reference": f"{group['reference'] or '(none)'} {group['reference_name']}".strip(),
					"posting_date": str(group["posting_date"]),
					"keep": keep,
					"delete": name,
				}

				if dry_run:
					result["notes_deleted"] += 1
					if len(result["actions"]) < DEFAULT_SAMPLE_LIMIT:
						result["actions"].append(action)
					continue

				try:
					frappe.delete_doc("Clinical Note", name, ignore_permissions=True, ignore_missing=True)
					result["notes_deleted"] += 1
					deleted_since_commit += 1
					if len(result["actions"]) < DEFAULT_SAMPLE_LIMIT:
						result["actions"].append(action)
					if deleted_since_commit >= commit_every:
						frappe.db.commit()
						deleted_since_commit = 0
				except Exception:
					frappe.db.rollback()
					deleted_since_commit = 0
					result["errors"] += 1
					frappe.log_error(
						title=f"Clinical Note duplicate cleanup failed: {name}",
						message=frappe.get_traceback(),
					)

	if not dry_run:
		frappe.db.commit()

	result["duplicate_groups_remaining"] = _group_count(scope)
	result["extra_copies_remaining"] = _extra_copies(scope)
	return result
