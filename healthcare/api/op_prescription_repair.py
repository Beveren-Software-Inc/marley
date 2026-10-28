"""Repair OP visit prescriptions imported from PATIENT_VISIT_PRESCRIPTION(_HIS).

The first full OP import lost its Redis-backed work queue mid-run (2h cache TTL) and
reported success with the remaining visits unprocessed. This module re-imports only the
visits that still have no OP prescription, and removes the duplicate prescription the
two importers created for the same visit.

Nothing here rewrites the source workbooks; all work goes through the existing batched
import jobs so the run stays resumable.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint

from healthcare.api.data_migration_jobs import (
	_acquire_lock,
	_set_progress,
)
from healthcare.api.patient_info_import import _require_admin
from healthcare.api.patient_visit_prescription_common import (
	PMO_DOCTYPE,
	duplicate_legacy_visit_pmos,
	load_queue_list,
	missing_visits_for_legacy_source,
	save_import_queue,
	save_queue_list,
)

V1_JOB = "patient_visit_prescription_import"
HIS_JOB = "patient_visit_prescription_his_import"
DEDUPE_JOB = "op_prescription_duplicate_cleanup"
LINE_CLEANUP_JOB = "op_prescription_line_cleanup"
DEDUPE_QUEUE_FILE = "duplicates.json"
DUPLICATE_CLEANUP_BATCH_SIZE = 50
LINE_CLEANUP_BATCH_SIZE = 50
DEFAULT_V1_FILE = "PATIENT_VISIT_PRESCRIPTION.xlsx"
DEFAULT_HIS_FILE = "PATIENT_VISIT_PRESCRIPTION_HIS.xlsx"
KEEP_RULES = ("source", "richer")

# Every column a legacy visit prescription line is built from. Two lines carrying the same
# values are the same prescription: the Oracle exports fan out rows (one visit repeated up
# to ~20 times) and the import writes every repeat as its own line.
LINE_SIGNATURE_COLUMNS = (
	"medicine_no",
	"old_medicine_code",
	"medication",
	"dosage",
	"instructions",
	"dc",
	"redundancy_type",
	"username",
	"patient_frequency",
	"written_frequency",
	"date",
	"time",
	"quantity",
	"is_prn",
	"dose_term",
	"rate",
	"amount",
	"trans_num",
	"reference_no",
	"prescrip_id",
	"end_date",
	"uom",
	"route_of_administration",
	"medication_status",
	"is_pink",
	"is_long_acting_medicine",
)

LEGACY_VISIT_PMO_FILTER = """
		pmo.care_context = 'Patient Visit'
		AND IFNULL(pmo.legacy, 0) = 1
		AND pmo.docstatus != 2
		AND (
			IFNULL(pmo.patient_visit_prescription, 0) = 1
			OR IFNULL(pmo.patient_visit_prescription_his, 0) = 1
		)
"""


def _find_uploaded_file(file_name: str) -> str | None:
	rows = frappe.get_all(
		"File",
		filters={"file_url": ["like", f"%{file_name}"]},
		fields=["file_url"],
		order_by="creation desc",
		limit=20,
	)
	for row in rows:
		if (row.file_url or "").lower().endswith(file_name.lower()):
			return row.file_url
	return None


def _resolve_source_file(file_url: str | None, default_name: str, label: str) -> str | None:
	if (file_url or "").strip():
		if not frappe.db.exists("File", {"file_url": file_url}):
			frappe.throw(
				_("The uploaded {0} file was not found. Please upload it again.").format(label)
			)
		return file_url
	return _find_uploaded_file(default_name)


def _source_summary(
	grouped: dict[str, dict], lines: int, missing: set[str], stats: dict | None = None
) -> dict:
	stats = stats or {}
	return {
		"visits": len(grouped),
		"medicine_lines": cint(lines),
		"missing_visits": len(missing),
		"missing_lines": sum(len((grouped[key] or {}).get("lines") or []) for key in missing),
		# Rows the workbook contains but the importer cannot use (no VISIT_CD). Reported so a
		# partially unreadable export never looks like a complete import.
		"raw_rows": cint(stats.get("raw_rows")),
		"skipped_rows": cint(stats.get("rows_without_visit")),
	}


def _load_legacy_pmos() -> list[dict]:
	return frappe.db.sql(
		f"""
		SELECT pmo.name, pmo.patient_encounter, pmo.visit_cd, pmo.patient,
			IFNULL(pmo.patient_visit_prescription, 0) AS normal_flag,
			IFNULL(pmo.patient_visit_prescription_his, 0) AS his_flag,
			IFNULL(line.line_count, 0) AS line_count
		FROM `tabPatient Medication Order` pmo
		LEFT JOIN (
			SELECT parent, COUNT(*) AS line_count
			FROM `tabInpatient Medication Order Entry`
			GROUP BY parent
		) line ON line.parent = pmo.name
		WHERE {LEGACY_VISIT_PMO_FILTER}
		""",
		as_dict=True,
	)


def duplicate_candidates(*, keep_rule: str = "source") -> list[dict]:
	"""Visits holding both a PATIENT_VISIT_PRESCRIPTION and a HIS prescription."""
	keep_rule = keep_rule if keep_rule in KEEP_RULES else "source"
	grouped: dict[str, list] = {}
	for row in _load_legacy_pmos():
		key = row.get("patient_encounter") or f"visit:{row.get('visit_cd') or row.get('name')}"
		grouped.setdefault(key, []).append(row)

	candidates: list[dict] = []
	for key, rows in grouped.items():
		source_rows = [row for row in rows if cint(row.get("normal_flag"))]
		his_rows = [row for row in rows if cint(row.get("his_flag"))]
		if not source_rows or not his_rows:
			continue
		source_rows.sort(key=lambda row: (-cint(row.get("line_count")), row.get("name")))
		his_rows.sort(key=lambda row: (-cint(row.get("line_count")), row.get("name")))
		keep, drop = source_rows[0], his_rows[0]
		if (
			keep_rule == "richer"
			and cint(his_rows[0].get("line_count")) > cint(source_rows[0].get("line_count"))
		):
			keep, drop = his_rows[0], source_rows[0]
		candidates.append(
			{
				"visit": key,
				"keep": keep.get("name"),
				"drop": drop.get("name"),
				"drop_source": "his" if cint(drop.get("his_flag")) else "source",
				"keep_lines": cint(keep.get("line_count")),
				"drop_lines": cint(drop.get("line_count")),
			}
		)
	return candidates


def build_repair_plan(
	visit_file_url: str | None = None,
	his_file_url: str | None = None,
	*,
	keep_rule: str = "source",
	persist: bool = False,
) -> dict:
	from healthcare.api.patient_visit_prescription_his_import import (
		VISIT_PRESCRIPTION_HIS_IMPORT_BATCH_SIZE,
		_parse_excel_rows as parse_his_rows,
	)
	from healthcare.api.patient_visit_prescription_import import (
		VISIT_PRESCRIPTION_IMPORT_BATCH_SIZE,
		_parse_excel_rows as parse_visit_rows,
	)

	v1_url = _resolve_source_file(
		visit_file_url, DEFAULT_V1_FILE, _("PATIENT_VISIT_PRESCRIPTION")
	)
	his_url = _resolve_source_file(
		his_file_url, DEFAULT_HIS_FILE, _("PATIENT_VISIT_PRESCRIPTION_HIS")
	)
	if not v1_url and not his_url:
		frappe.throw(
			_(
				"Upload the PATIENT_VISIT_PRESCRIPTION workbook (or keep a copy named {0} in the "
				"site files) to scan for missing prescriptions."
			).format(DEFAULT_V1_FILE)
		)

	plan: dict = {
		"keep_rule": keep_rule if keep_rule in KEEP_RULES else "source",
		"visit_file_url": v1_url,
		"his_file_url": his_url,
	}

	v1_missing: set[str] = set()
	v1_stats: dict = {}
	if v1_url:
		v1_grouped, _sheet_counts, v1_lines = parse_visit_rows(v1_url, v1_stats)
		v1_missing = missing_visits_for_legacy_source(v1_grouped, source_flag=None)
		plan["visit_source"] = _source_summary(v1_grouped, v1_lines, v1_missing, v1_stats)
		if persist:
			plan["visit_queue"] = save_import_queue(
				V1_JOB,
				file_url=v1_url,
				grouped={key: v1_grouped[key] for key in v1_missing},
				medicine_lines=plan["visit_source"]["missing_lines"],
				batch_size=VISIT_PRESCRIPTION_IMPORT_BATCH_SIZE,
				extra_meta={"mode": "gap_repair"},
			)
		del v1_grouped

	if his_url:
		his_stats: dict = {}
		his_grouped, _his_sheet_counts, his_lines = parse_his_rows(his_url, his_stats)
		his_missing_all = missing_visits_for_legacy_source(
			his_grouped, source_flag="patient_visit_prescription_his"
		)
		his_missing = his_missing_all - v1_missing
		plan["his_source"] = _source_summary(his_grouped, his_lines, his_missing, his_stats)
		plan["his_source"]["covered_by_visit_import"] = len(his_missing_all) - len(his_missing)
		if persist:
			plan["his_queue"] = save_import_queue(
				HIS_JOB,
				file_url=his_url,
				grouped={key: his_grouped[key] for key in his_missing},
				medicine_lines=plan["his_source"]["missing_lines"],
				batch_size=VISIT_PRESCRIPTION_HIS_IMPORT_BATCH_SIZE,
				extra_meta={"mode": "gap_repair"},
			)
		del his_grouped

	candidates = duplicate_candidates(keep_rule=plan["keep_rule"])
	plan["duplicates"] = {
		"visits": len(candidates),
		"source_records_removed": sum(1 for row in candidates if row["drop_source"] == "source"),
		"his_records_removed": sum(1 for row in candidates if row["drop_source"] == "his"),
		"lines_removed": sum(row["drop_lines"] for row in candidates),
		"sample": [
			{"visit": row["visit"], "keep": row["keep"], "drop": row["drop"]}
			for row in candidates[:10]
		],
	}
	if persist:
		save_queue_list(DEDUPE_JOB, DEDUPE_QUEUE_FILE, candidates)

	# Repeated medicine lines inside the surviving prescriptions (Oracle export fan-out).
	plan["line_duplicates"] = line_duplicate_summary()

	return plan



def _enqueue_gap_import(job: str, *, method: str, total_visits: int, medicine_lines: int) -> dict:
	_acquire_lock(job)
	_set_progress(
		job,
		0,
		total_visits=cint(total_visits),
		medicine_lines=cint(medicine_lines),
		resolvable_patients=None,
		resolvable_visits=None,
		existing_records=None,
		mode="gap_repair",
	)
	frappe.enqueue(
		method,
		offset=0,
		queue="long",
		timeout=3600,
		job_name=f"healthcare_{job}_gap_repair",
	)
	frappe.db.commit()
	return {"job": job, "visits": cint(total_visits), "medicine_lines": cint(medicine_lines)}


@frappe.whitelist()
def preview_op_prescription_repair(
	visit_file_url: str | None = None,
	his_file_url: str | None = None,
	keep_rule: str = "source",
) -> dict:
	"""Scan both workbooks and report the gap without writing anything."""
	_require_admin()
	plan = build_repair_plan(visit_file_url, his_file_url, keep_rule=keep_rule)
	plan["pending_duplicates"] = duplicate_legacy_visit_pmos().get("duplicate_groups", 0)
	return plan


@frappe.whitelist()
def start_op_prescription_repair(
	visit_file_url: str | None = None,
	his_file_url: str | None = None,
	keep_rule: str = "source",
	import_missing: int = 1,
	remove_duplicates: int = 1,
	dedupe_lines: int = 1,
) -> dict:
	"""Queue and start the gap import plus the duplicate cleanup in background jobs."""
	_require_admin()
	plan = build_repair_plan(
		visit_file_url,
		his_file_url,
		keep_rule=keep_rule,
		persist=True,
	)

	started: list[dict] = []
	if cint(import_missing):
		visit_source = plan.get("visit_source") or {}
		if visit_source.get("missing_visits"):
			started.append(
				_enqueue_gap_import(
					V1_JOB,
					method=(
						"healthcare.api.data_migration_jobs."
						"process_patient_visit_prescription_import_batch"
					),
					total_visits=visit_source.get("missing_visits"),
					medicine_lines=visit_source.get("missing_lines"),
				)
			)
		his_source = plan.get("his_source") or {}
		if his_source.get("missing_visits"):
			started.append(
				_enqueue_gap_import(
					HIS_JOB,
					method=(
						"healthcare.api.data_migration_jobs."
						"process_patient_visit_prescription_his_import_batch"
					),
					total_visits=his_source.get("missing_visits"),
					medicine_lines=his_source.get("missing_lines"),
				)
			)

	duplicates = plan.get("duplicates") or {}
	if cint(remove_duplicates) and duplicates.get("visits"):
		_acquire_lock(DEDUPE_JOB)
		_set_progress(
			DEDUPE_JOB,
			0,
			total_duplicates=cint(duplicates.get("visits")),
			keep_rule=plan.get("keep_rule"),
		)
		frappe.enqueue(
			"healthcare.api.data_migration_jobs.process_op_prescription_duplicate_cleanup_batch",
			offset=0,
			queue="long",
			timeout=3600,
			job_name="healthcare_op_prescription_duplicate_cleanup",
		)
		frappe.db.commit()
		started.append({"job": DEDUPE_JOB, "duplicates": cint(duplicates.get("visits"))})

	line_duplicates = plan.get("line_duplicates") or {}
	if cint(dedupe_lines) and line_duplicates.get("visits"):
		_acquire_lock(LINE_CLEANUP_JOB)
		_set_progress(
			LINE_CLEANUP_JOB,
			0,
			total_visits=cint(line_duplicates.get("visits")),
			total_lines=cint(line_duplicates.get("total_lines")),
			lines_expected=cint(line_duplicates.get("repeated_lines")),
		)
		frappe.enqueue(
			"healthcare.api.data_migration_jobs.process_op_prescription_line_cleanup_batch",
			offset=0,
			queue="long",
			timeout=3600,
			job_name="healthcare_op_prescription_line_cleanup",
		)
		frappe.db.commit()
		started.append({"job": LINE_CLEANUP_JOB, "visits": cint(line_duplicates.get("visits"))})

	if not started:
		return {
			"ok": True,
			"nothing_to_do": True,
			"message": _(
				"No missing prescriptions and no duplicate prescriptions were found. "
				"ERPNext already matches the uploaded workbooks."
			),
			"plan": plan,
			"started": [],
		}

	parts = []
	if any(item["job"] == V1_JOB for item in started):
		parts.append(
			_("{0} visit prescription(s) / {1} line(s) queued for import").format(
				(plan.get("visit_source") or {}).get("missing_visits", 0),
				(plan.get("visit_source") or {}).get("missing_lines", 0),
			)
		)
	if any(item["job"] == HIS_JOB for item in started):
		parts.append(
			_("{0} HIS visit prescription(s) / {1} line(s) queued for import").format(
				(plan.get("his_source") or {}).get("missing_visits", 0),
				(plan.get("his_source") or {}).get("missing_lines", 0),
			)
		)
	if any(item["job"] == DEDUPE_JOB for item in started):
		parts.append(
			_("{0} duplicate prescription(s) queued for removal").format(
				duplicates.get("visits", 0)
			)
		)
	if any(item["job"] == LINE_CLEANUP_JOB for item in started):
		parts.append(
			_("{0} repeated medicine line(s) queued for removal").format(
				line_duplicates.get("repeated_lines", 0)
			)
		)

	return {
		"ok": True,
		"message": _("OP prescription repair started: {0}.").format("; ".join(parts)),
		"plan": plan,
		"started": started,
	}



def _remove_duplicate_prescription(name: str) -> str:
	"""Cancel and (recoverably) delete one duplicate Patient Medication Order."""
	if not frappe.db.exists(PMO_DOCTYPE, name):
		return "missing"
	doc = frappe.get_doc(PMO_DOCTYPE, name)
	doc.flags.ignore_permissions = True
	doc.flags.ignore_validate_update_after_submit = True
	doc.flags.ignore_links = True
	if doc.docstatus == 1:
		doc.cancel()
	frappe.delete_doc(PMO_DOCTYPE, name, force=1, ignore_permissions=True)
	return "deleted"


def run_duplicate_cleanup_batch(*, offset: int = 0, batch_size: int = DUPLICATE_CLEANUP_BATCH_SIZE) -> dict:
	candidates = load_queue_list(DEDUPE_JOB, DEDUPE_QUEUE_FILE)
	total = len(candidates)
	offset = cint(offset)
	batch_size = max(cint(batch_size), 1)
	if not total:
		return {
			"processed": offset,
			"done": False,
			"batch_count": 0,
			"total": 0,
			"error": _(
				"No duplicate prescription queue found on disk. Run the OP prescription repair "
				"scan again to rebuild it."
			),
		}
	if offset >= total:
		return {"processed": offset, "done": True, "batch_count": 0, "total": total}

	batch = candidates[offset : offset + batch_size]
	removed = skipped = errors = 0
	for row in batch:
		keep = row.get("keep")
		drop = row.get("drop")
		try:
			# Never delete if the record we planned to keep is gone or was itself cancelled.
			if not keep or not drop or not frappe.db.exists(PMO_DOCTYPE, keep):
				skipped += 1
				continue
			if _remove_duplicate_prescription(drop) == "deleted":
				removed += 1
			else:
				skipped += 1
		except Exception:
			errors += 1
			frappe.log_error(title=f"OP prescription duplicate cleanup failed: {drop}")

	frappe.db.commit()
	processed = offset + len(batch)
	return {
		"processed": processed,
		"done": processed >= total,
		"batch_count": len(batch),
		"total": total,
		"removed": removed,
		"skipped": skipped,
		"errors": errors,
	}


def _line_signature_sql(alias: str = "line") -> str:
	parts = ", ".join(f"IFNULL({alias}.`{column}`, '')" for column in LINE_SIGNATURE_COLUMNS)
	return f"MD5(CONCAT_WS('|', {parts}))"


def line_duplicate_summary() -> dict:
	"""Repeated medicine lines still stored on legacy visit prescriptions."""
	row = frappe.db.sql(
		f"""
		SELECT COUNT(*) AS visits,
			IFNULL(SUM(total), 0) AS total_lines,
			IFNULL(SUM(kept), 0) AS kept_lines,
			IFNULL(SUM(total - kept), 0) AS repeated_lines
		FROM (
			SELECT line.parent,
				COUNT(*) AS total,
				COUNT(DISTINCT {_line_signature_sql()}) AS kept
			FROM `tabInpatient Medication Order Entry` line
			JOIN `tabPatient Medication Order` pmo ON pmo.name = line.parent
			WHERE {LEGACY_VISIT_PMO_FILTER}
			GROUP BY line.parent
			HAVING COUNT(*) > COUNT(DISTINCT {_line_signature_sql()})
		) grouped
		""",
		as_dict=True,
	)
	summary = (row or [{}])[0] or {}
	return {
		"visits": cint(summary.get("visits")),
		"total_lines": cint(summary.get("total_lines")),
		"kept_lines": cint(summary.get("kept_lines")),
		"repeated_lines": cint(summary.get("repeated_lines")),
	}


def list_visits_with_repeated_lines(*, limit: int, offset: int = 0) -> list[str]:
	rows = frappe.db.sql(
		f"""
		SELECT line.parent
		FROM `tabInpatient Medication Order Entry` line
		JOIN `tabPatient Medication Order` pmo ON pmo.name = line.parent
		WHERE {LEGACY_VISIT_PMO_FILTER}
		GROUP BY line.parent
		HAVING COUNT(*) > COUNT(DISTINCT {_line_signature_sql()})
		ORDER BY line.parent
		LIMIT %s OFFSET %s
		""",
		(cint(limit), cint(offset)),
		as_dict=True,
	)
	return [row.parent for row in rows if row.get("parent")]


def dedupe_legacy_visit_pmo_lines(name: str) -> dict:
	"""Keep the first copy of each identical medicine line on one visit prescription."""
	if not frappe.db.exists(PMO_DOCTYPE, name):
		return {"removed": 0, "status": "missing"}
	rows = frappe.db.sql(
		f"""
		SELECT line.name, {_line_signature_sql()} AS signature
		FROM `tabInpatient Medication Order Entry` line
		WHERE line.parent = %s
		ORDER BY line.idx ASC, line.name ASC
		""",
		name,
		as_dict=True,
	)
	if not rows:
		return {"removed": 0, "status": "no_lines"}

	seen: set[str] = set()
	to_delete: list[str] = []
	for row in rows:
		signature = row.get("signature")
		if signature in seen:
			to_delete.append(row.get("name"))
		else:
			seen.add(signature)
	if not to_delete:
		return {"removed": 0, "status": "clean"}

	frappe.db.delete("Inpatient Medication Order Entry", {"name": ("in", to_delete)})
	remaining = len(rows) - len(to_delete)
	# total_orders / completed_orders cache the line count and drive status.
	frappe.db.set_value(
		PMO_DOCTYPE,
		name,
		{"total_orders": remaining, "completed_orders": remaining},
		update_modified=False,
	)
	return {"removed": len(to_delete), "status": "cleaned", "remaining": remaining}


def run_line_cleanup_batch(*, offset: int = 0, batch_size: int = LINE_CLEANUP_BATCH_SIZE) -> dict:
	# Cleaned visits leave the duplicate set, so every batch reads from the start.
	_ = offset
	batch_size = max(cint(batch_size), 1)
	visits = list_visits_with_repeated_lines(limit=batch_size)
	if not visits:
		return {
			"processed": 0,
			"done": True,
			"batch_count": 0,
			"visits_cleaned": 0,
			"lines_removed": 0,
			"skipped": 0,
			"errors": 0,
		}

	cleaned = removed = skipped = errors = 0
	for name in visits:
		try:
			result = dedupe_legacy_visit_pmo_lines(name)
			if cint(result.get("removed")):
				cleaned += 1
				removed += cint(result.get("removed"))
			else:
				skipped += 1
		except Exception:
			errors += 1
			frappe.log_error(
				title="OP prescription line cleanup failed",
				message=frappe.as_json({"prescription": name, "error": frappe.get_traceback()}),
			)

	if errors and not cleaned:
		# Nothing moved: fail loudly instead of re-queueing the same visits forever.
		frappe.db.rollback()
		return {
			"processed": len(visits),
			"done": True,
			"batch_count": len(visits),
			"visits_cleaned": 0,
			"lines_removed": 0,
			"skipped": skipped,
			"errors": errors,
			"error": _(
				"Could not remove repeated lines from {0} prescription(s). See Error Log."
			).format(errors),
		}

	frappe.db.commit()
	return {
		"processed": len(visits),
		"done": len(visits) < batch_size,
		"batch_count": len(visits),
		"visits_cleaned": cleaned,
		"lines_removed": removed,
		"skipped": skipped,
		"errors": errors,
	}


@frappe.whitelist()
def get_op_prescription_repair_status() -> dict:
	"""Post-repair check: duplicates left + coverage of both work queues."""
	_require_admin()
	from healthcare.api.patient_visit_prescription_his_import import (
		_verify_queue_coverage as verify_his_queue,
	)
	from healthcare.api.patient_visit_prescription_import import (
		_verify_queue_coverage as verify_visit_queue,
	)

	duplicates = duplicate_legacy_visit_pmos()
	return {
		"duplicates_remaining": cint(duplicates.get("duplicate_groups")),
		"duplicate_sample": duplicates.get("sample") or [],
		"pending_duplicate_cleanup": len(load_queue_list(DEDUPE_JOB, DEDUPE_QUEUE_FILE)),
		"line_duplicates_remaining": line_duplicate_summary(),
		"visit_queue": verify_visit_queue(),
		"his_queue": verify_his_queue(),
	}

