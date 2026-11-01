"""Reconcile the legacy outpatient prescriptions with the Patient Medication Orders in ERP.

The legacy ``PATIENT_VISIT_PRESCRIPTION`` export (Oracle ``PVP``) is the source of truth for
outpatient prescriptions. Two things went wrong on the migration site:

* **Missing lines** - a visit whose prescription never imported (the import job was still
  queued / running, or the visit was worked on in ERP while the import queue was idle) or only
  imported partially. The visit is reported and, on run, created / completed through the regular
  importer (``import_patient_medication_order_for_visit``) or, for a partial visit, by appending
  the missing lines only - the same item lookup, frequency handling and legacy-field mapping is
  used, and a prescription that is already there is never duplicated.
* **Duplicate lines** - ``PATIENT_VISIT_PRESCRIPTION_HIS`` is a re-prescription log: the same
  ``PRESCIP_ID`` shows up once per edit, so importing it wrote the same prescription line 2-9
  times. Those lines are deleted when the same ``PRESCIP_ID`` is still present on a
  ``PATIENT_VISIT_PRESCRIPTION`` line (or when the visit is rebuilt from the sheet in the same
  run). The leftover HIS-only prescription is cancelled, so it can neither block the OP import
  nor show up as a duplicate prescription.

Nothing is deleted unless the line can be rebuilt: a HIS line whose ``PRESCIP_ID`` is missing
from both the sheet and the normal OP lines is kept and reported.

Example finding (2026-07): patient 849995 has 1,401 Oracle prescription lines and 1,401 lines in
ERP, but the numbers only match by coincidence - 78 lines are duplicated (73 ``PVP_HIS``
repeats + 5 after-discharge lines of admission 2338 that carry ward reference numbers) and 78
are missing (73 OP lines + 5 IP ``TRANS_TYPE=2`` discharge lines). This cleanup recovers 69 of
the 73 OP lines (10 visits) and removes the 74 ``PVP_HIS`` repeats; the 5 lines of visit 136827
post-date the exported workbook and need a fresh ``PATIENT_VISIT_PRESCRIPTION`` export, and the
IP discharge lines are created by ``healthcare.api.ip_medication_cleanup`` (Create Missing
Medication Orders), which reads ``IP_ADMISSION_MEDICINE``.

Usage (System Manager / Healthcare Administrator only):

    bench --site <site> execute healthcare.api.op_prescription_cleanup.preview_op_prescription_cleanup --kwargs "{'patient': '849995'}"
    bench --site <site> execute healthcare.api.op_prescription_cleanup.run_op_prescription_cleanup --kwargs "{'patient': '849995', 'dry_run': 1}"
    bench --site <site> execute healthcare.api.op_prescription_cleanup.run_op_prescription_cleanup --kwargs "{'patient': '849995'}"
"""

from __future__ import annotations

import re
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint

from healthcare.api.ip_admission_cleanup import _file_path_if_exists
from healthcare.api.patient_info_import import _require_admin
from healthcare.api.patient_medication_order_import import (
	_append_child_line,
	_clean_oracle_num,
	_safe_savepoint_name,
	_submit_and_complete_pmo,
)
from healthcare.api.patient_visit_prescription_common import (
	_bulk_visit_links,
	_chunked,
	load_import_queue_meta,
)
from healthcare.api.patient_visit_prescription_import import (
	QUEUE_JOB,
	_parse_excel_rows,
	_pmo_line_from_row,
	import_patient_medication_order_for_visit,
)

PMO_DOCTYPE = "Patient Medication Order"
PMO_CHILD_DOCTYPE = "Inpatient Medication Order Entry"
NORMAL_FLAG = "patient_visit_prescription"
HIS_FLAG = "patient_visit_prescription_his"
# Ticked on a prescription that was completed with lines only the Oracle
# ``PATIENT_VISIT_PRESCRIPTION_HIS`` (HS) table has.
FROM_HS_FLAG = "from_hs_tb"

# ``PATIENT_VISIT_PRESCRIPTION.xlsx`` is re-uploaded under a hashed name, so files are matched on
# their normalised stem. ``PATIENT_VISIT_PRESCRIPTION_HIS.xlsx`` normalises differently and is
# never picked up as the normal source.
SOURCE_FILE_STEMS = {"patientvisitprescription"}
SOURCE_FILE_PATTERN = "PATIENT_VISIT_PRESCRIPTION%"
SAMPLE_LIMIT = 25

PMO_FIELDS = (
	"name",
	"visit_cd",
	"patient_encounter",
	"patient",
	"docstatus",
	"status",
	NORMAL_FLAG,
	HIS_FLAG,
)
CHILD_FIELDS = ("name", "parent", "idx", "prescrip_id", "medicine_no", "drug", "drug_name")


def _source_file_stem(file_name: str) -> str:
	"""``PATIENT_VISIT_PRESCRIPTION.xlsx`` and Frappe's ``PATIENT_VISIT_PRESCRIPTION3ad06b.xlsx``
	both normalise to the same stem, so a re-upload is still recognised."""
	stem = (file_name or "").rsplit("/", 1)[-1]
	if "." in stem:
		stem = stem.rsplit(".", 1)[0]
	stem = re.sub(r"[0-9a-f]{12}$", "", stem.lower())
	return re.sub(r"[^a-z0-9]", "", stem)


def _resolve_source_file_url(file_url: str | None = None) -> tuple[str | None, str | None]:
	"""Uploaded file first, then the workbook the pending import queue was parsed from, then the
	newest PATIENT_VISIT_PRESCRIPTION file stored on the server."""
	if file_url and _file_path_if_exists(file_url):
		return file_url, "uploaded"

	queued = (load_import_queue_meta(QUEUE_JOB) or {}).get("file_url")
	if queued and _file_path_if_exists(queued):
		return queued, "queue"

	files = frappe.get_all(
		"File",
		filters={"is_folder": 0, "file_name": ["like", SOURCE_FILE_PATTERN]},
		fields=["file_url", "file_name"],
		order_by="creation desc",
		limit=50,
	)
	for row in files:
		if _source_file_stem(row.get("file_name")) not in SOURCE_FILE_STEMS:
			continue
		if _file_path_if_exists(row.get("file_url")):
			return row.get("file_url"), "server"
	return None, None


def _normalize_code(value: Any) -> str:
	"""Prescription / medicine codes compared without Oracle zero-padding."""
	code = _clean_oracle_num(value)
	if code.isdigit():
		return code.lstrip("0") or "0"
	return code


def _row_signature(prescrip_id: Any, medicine_code: Any) -> str:
	return f"{_normalize_code(prescrip_id)}|{_normalize_code(medicine_code)}"


def _visit_lines(payload: dict) -> list[dict]:
	return (payload or {}).get("lines") or []


def _sheet_prescrip_ids(payload: dict) -> set[str]:
	return {
		_normalize_code(row.get("prescrip_id"))
		for row in _visit_lines(payload)
		if _normalize_code(row.get("prescrip_id"))
	}


def _filter_groups_by_patient(grouped: dict[str, dict], patient: str | None) -> dict[str, dict]:
	patient = (patient or "").strip()
	if not patient:
		return grouped

	kept = {
		visit_cd: payload
		for visit_cd, payload in grouped.items()
		if (payload.get("patient_file_no") or "") == patient
	}
	# Rows exported with an empty PATIENT_FILE_NO are resolved from the Patient Visit.
	without_number = [
		visit_cd
		for visit_cd, payload in grouped.items()
		if visit_cd not in kept and not payload.get("patient_file_no")
	]
	if not without_number:
		return kept

	visit_links = _bulk_visit_links(without_number)
	visit_names = {name for name in visit_links.values() if name}
	matches: set[str] = set()
	for chunk in _chunked(sorted(visit_names)):
		matches.update(
			frappe.get_all(
				"Patient Visit",
				filters={"name": ["in", chunk], "patient": patient},
				pluck="name",
			)
		)
	for visit_cd, visit_name in visit_links.items():
		if visit_name and visit_name in matches:
			kept[visit_cd] = grouped[visit_cd]
	return kept


def _pmo_rows_by_visit(
	visit_cds: list[str], visit_links: dict[str, str | None]
) -> dict[str, list[dict]]:
	"""Every OP Patient Medication Order of the given visits, keyed by visit CD."""
	visit_set = set(visit_cds)
	rows: dict[str, dict] = {}
	base_filters = {"care_context": "Patient Visit", "docstatus": ["!=", 2]}

	for chunk in _chunked(sorted(visit_set)):
		for row in frappe.get_all(
			PMO_DOCTYPE, filters={**base_filters, "visit_cd": ["in", chunk]}, fields=PMO_FIELDS
		):
			rows[row.name] = row

	encounter_to_visit = {
		visit_name: visit_cd
		for visit_cd, visit_name in visit_links.items()
		if visit_name and visit_cd in visit_set
	}
	for chunk in _chunked(sorted(encounter_to_visit)):
		for row in frappe.get_all(
			PMO_DOCTYPE,
			filters={**base_filters, "patient_encounter": ["in", chunk]},
			fields=PMO_FIELDS,
		):
			rows[row.name] = row

	by_visit: dict[str, list[dict]] = {}
	for row in rows.values():
		visit_cd = row.get("visit_cd")
		if visit_cd not in visit_set:
			visit_cd = encounter_to_visit.get(row.get("patient_encounter") or "")
		if not visit_cd:
			continue
		by_visit.setdefault(visit_cd, []).append(row)
	return by_visit


def _children_by_pmo(pmo_names: list[str]) -> dict[str, list[dict]]:
	children: dict[str, list[dict]] = {}
	for chunk in _chunked(sorted(set(pmo_names))):
		for row in frappe.get_all(
			PMO_CHILD_DOCTYPE, filters={"parent": ["in", chunk]}, fields=CHILD_FIELDS
		):
			children.setdefault(row.parent, []).append(row)
	return children


def _build_coverage(
	grouped: dict[str, dict], visit_links: dict[str, str | None]
) -> dict[str, dict]:
	pmos_by_visit = _pmo_rows_by_visit(list(grouped), visit_links)
	children = _children_by_pmo(
		[row.name for rows in pmos_by_visit.values() for row in rows]
	)

	coverage: dict[str, dict] = {}
	for visit_cd, pmos in pmos_by_visit.items():
		normal = [row for row in pmos if cint(row.get(NORMAL_FLAG))]
		his = [row for row in pmos if cint(row.get(HIS_FLAG))]
		coverage[visit_cd] = {
			"normal_pmos": [row.name for row in normal],
			"normal_children": [child for row in normal for child in children.get(row.name, [])],
			"his_pmos": {row.name: children.get(row.name, []) for row in his},
		}
	return coverage


def _resolve_import_patients(
	imports: list[dict], visit_links: dict[str, str | None]
) -> dict[str, str]:
	"""Patient of every visit with lines to import (sheet number first, Patient Visit next)."""
	numbers = {
		_clean_oracle_num((item["payload"] or {}).get("patient_file_no")) for item in imports
	}
	numbers.discard("")
	existing: set[str] = set()
	for chunk in _chunked(sorted(numbers)):
		existing.update(frappe.get_all("Patient", filters={"name": ["in", chunk]}, pluck="name"))

	resolved: dict[str, str] = {}
	fallback: list[str] = []
	for item in imports:
		number = _clean_oracle_num((item["payload"] or {}).get("patient_file_no"))
		if number and number in existing:
			resolved[item["visit_cd"]] = number
		else:
			fallback.append(item["visit_cd"])

	if fallback:
		visit_names = {
			visit_links.get(visit_cd) for visit_cd in fallback if visit_links.get(visit_cd)
		}
		patient_by_visit_name: dict[str, str] = {}
		for chunk in _chunked(sorted(visit_names)):
			for row in frappe.get_all(
				"Patient Visit", filters={"name": ["in", chunk]}, fields=["name", "patient"]
			):
				if row.get("patient"):
					patient_by_visit_name[row.name] = row.get("patient")
		for visit_cd in fallback:
			patient = patient_by_visit_name.get(visit_links.get(visit_cd) or "")
			if patient:
				resolved[visit_cd] = patient
	return resolved


def _carries_hs_lines(rows: list[dict]) -> int:
	"""1 when any of the lines to write comes from the Oracle HS table."""
	return 1 if any(row.get(FROM_HS_FLAG) for row in rows) else 0


def _build_import_plan(
	grouped: dict[str, dict], coverage: dict[str, dict]
) -> tuple[list[dict], dict]:
	imports: list[dict] = []
	stats = {
		"missing_visits": 0,
		"missing_lines": 0,
		"partial_visits": 0,
		"partial_lines": 0,
		"complete_visits": 0,
	}

	for visit_cd, payload in grouped.items():
		rows = _visit_lines(payload)
		covered = coverage.get(visit_cd) or {}
		normal_children = covered.get("normal_children") or []
		present = {
			_row_signature(child.get("prescrip_id"), child.get("medicine_no"))
			for child in normal_children
		}
		missing = [
			row
			for row in rows
			if _row_signature(row.get("prescrip_id"), row.get("medicine_cd")) not in present
		]

		if not normal_children:
			stats["missing_visits"] += 1
			stats["missing_lines"] += len(rows)
			imports.append(
				{
					"visit_cd": visit_cd,
					"payload": payload,
					"rows": rows,
					"mode": "create",
					"pmo": None,
					FROM_HS_FLAG: _carries_hs_lines(rows),
				}
			)
		elif missing:
			stats["partial_visits"] += 1
			stats["partial_lines"] += len(missing)
			imports.append(
				{
					"visit_cd": visit_cd,
					"payload": payload,
					"rows": missing,
					"mode": "append",
					"pmo": covered["normal_pmos"][0],
					FROM_HS_FLAG: _carries_hs_lines(missing),
				}
			)
		else:
			stats["complete_visits"] += 1
	return imports, stats


def _build_his_plan(
	grouped: dict[str, dict], coverage: dict[str, dict], imports: list[dict]
) -> dict:
	"""HIS lines that can be removed because a normal OP line (or the sheet) still has them."""
	import_visits = {item["visit_cd"] for item in imports}
	normal_prescrip_ids: set[str] = set()
	for covered in coverage.values():
		for child in covered.get("normal_children") or []:
			prescrip_id = _normalize_code(child.get("prescrip_id"))
			if prescrip_id:
				normal_prescrip_ids.add(prescrip_id)

	to_delete: list[tuple[str, str]] = []
	to_cancel: list[str] = []
	delete_by_visit: dict[str, list[tuple[str, str]]] = {}
	cancel_by_visit: dict[str, list[str]] = {}
	his_pmos = his_lines = kept = 0

	for visit_cd, covered in coverage.items():
		sheet_ids = _sheet_prescrip_ids(grouped.get(visit_cd) or {})
		for pmo_name, children in (covered.get("his_pmos") or {}).items():
			his_pmos += 1
			his_lines += len(children)
			remaining = 0
			for child in children:
				prescrip_id = _normalize_code(child.get("prescrip_id"))
				rebuildable = False
				if visit_cd in import_visits and (not prescrip_id or prescrip_id in sheet_ids):
					# The visit is rebuilt from the sheet in this run.
					rebuildable = True
				elif prescrip_id and prescrip_id in normal_prescrip_ids:
					# The same PRESCRIP_ID is already imported from PATIENT_VISIT_PRESCRIPTION.
					rebuildable = True
				if rebuildable:
					to_delete.append((pmo_name, child.get("name")))
					delete_by_visit.setdefault(visit_cd, []).append((pmo_name, child.get("name")))
				else:
					remaining += 1
			kept += remaining
			if remaining == 0:
				to_cancel.append(pmo_name)
				cancel_by_visit.setdefault(visit_cd, []).append(pmo_name)

	return {
		"pmos": his_pmos,
		"lines": his_lines,
		"delete": to_delete,
		"cancel": to_cancel,
		"kept_lines": kept,
		"delete_by_visit": delete_by_visit,
		"cancel_by_visit": cancel_by_visit,
	}


def _limit_his_plan(his_plan: dict, visits: set[str]) -> dict:
	"""Keep only the HIS work of the given visits (bounded run)."""
	deletes = [
		entry for visit_cd, rows in (his_plan.get("delete_by_visit") or {}).items() if visit_cd in visits
		for entry in rows
	]
	cancels = [
		pmo for visit_cd, rows in (his_plan.get("cancel_by_visit") or {}).items() if visit_cd in visits
		for pmo in rows
	]
	return {**his_plan, "delete": deletes, "cancel": cancels}


def _build_plan(file_url: str | None = None, patient: str | None = None) -> dict:
	source_url, source_kind = _resolve_source_file_url(file_url)
	if not source_url:
		return {
			"ok": False,
			"needs_file": True,
			"message": _(
				"No PATIENT_VISIT_PRESCRIPTION workbook found. Upload the Oracle export and try again."
			),
		}

	parse_stats: dict = {}
	grouped, sheet_row_counts, raw_line_count = _parse_excel_rows(source_url, parse_stats)
	grouped = _filter_groups_by_patient(grouped, patient)
	visit_links = _bulk_visit_links(list(grouped))
	coverage = _build_coverage(grouped, visit_links)

	imports, import_stats = _build_import_plan(grouped, coverage)
	resolved_patients = _resolve_import_patients(imports, visit_links)
	for item in imports:
		item["patient"] = resolved_patients.get(item["visit_cd"])
		if not item["payload"].get("patient_file_no") and item["patient"]:
			# The visit is known but the export left PATIENT_FILE_NO empty.
			item["payload"]["patient_file_no"] = item["patient"]

	his_plan = _build_his_plan(grouped, coverage, imports)

	return {
		"ok": True,
		"file_url": source_url,
		"file_source": source_kind,
		"scope_patient": (patient or "").strip() or None,
		"source_visits": len(grouped),
		"source_lines": sum(len(_visit_lines(payload)) for payload in grouped.values()),
		"workbook_lines": raw_line_count,
		"sheet_row_counts": sheet_row_counts,
		"skipped_rows": cint(parse_stats.get("rows_without_visit")),
		**import_stats,
		"visits_to_import": len(imports),
		"lines_to_import": sum(len(item["rows"]) for item in imports),
		"unresolved_visits": sum(1 for item in imports if not item.get("patient")),
		"his_pmos": his_plan["pmos"],
		"his_lines": his_plan["lines"],
		"his_duplicate_lines": len(his_plan["delete"]),
		"his_pmos_to_cancel": len(his_plan["cancel"]),
		"his_lines_kept": his_plan["kept_lines"],
		"his_only_visits": sum(
			1
			for covered in coverage.values()
			if not covered.get("normal_pmos") and covered.get("his_pmos")
		),
		"plan_visits": sorted(
			{item["visit_cd"] for item in imports}
			| set(his_plan["delete_by_visit"])
			| set(his_plan["cancel_by_visit"])
		),
		"imports": imports,
		"his_plan": his_plan,
		"samples": _sample_lines(imports, his_plan),
	}


def _sample_lines(imports: list[dict], his_plan: dict) -> list[str]:
	samples: list[str] = []
	for item in imports[:SAMPLE_LIMIT]:
		patient = item.get("patient") or "-"
		if item["mode"] == "create":
			samples.append(
				f"{item['visit_cd']} · {patient}: {len(item['rows'])} lines (new prescription)"
			)
		else:
			samples.append(
				f"{item['visit_cd']} · {patient}: {len(item['rows'])} missing lines → {item['pmo']}"
			)

	deleted_by_pmo: dict[str, int] = {}
	for pmo_name, _child in his_plan["delete"]:
		deleted_by_pmo[pmo_name] = deleted_by_pmo.get(pmo_name, 0) + 1
	for pmo_name, count in list(deleted_by_pmo.items())[:SAMPLE_LIMIT]:
		visit_cd = frappe.db.get_value(PMO_DOCTYPE, pmo_name, "visit_cd") or "-"
		samples.append(f"{visit_cd}: {count} duplicate PVP_HIS lines removed from {pmo_name}")
	return samples


def _append_missing_lines(pmo_name: str, rows: list[dict]) -> dict:
	"""Append only the missing lines of an already imported visit (never resets the table)."""
	doc = frappe.get_doc(PMO_DOCTYPE, pmo_name)
	present = {
		_row_signature(child.get("prescrip_id"), child.get("medicine_no"))
		for child in (doc.get("medication_orders") or [])
	}
	added = 0
	added_from_hs = False
	for row in rows:
		signature = _row_signature(row.get("prescrip_id"), row.get("medicine_cd"))
		if signature in present:
			continue
		_append_child_line(doc, _pmo_line_from_row(row))
		present.add(signature)
		added += 1
		added_from_hs = added_from_hs or bool(row.get(FROM_HS_FLAG))

	if not added:
		return {"status": "skip_no_new_lines", "pmo": pmo_name, "added_lines": 0}

	if added_from_hs:
		# The prescription now also holds lines only the Oracle HS table has, so it can be
		# found again later (``from_hs_tb = 1``). The field is ``allow_on_submit``.
		doc.from_hs_tb = 1
	doc.flags.ignore_validate = True
	_submit_and_complete_pmo(doc)
	return {
		"status": "updated",
		"pmo": pmo_name,
		"added_lines": added,
		"from_hs_tb": 1 if added_from_hs else 0,
		"lines": len(doc.get("medication_orders") or []),
	}


def _apply_imports(imports: list[dict]) -> dict:
	created = updated = skipped = added_lines = hs_flagged = 0
	failures: list[str] = []
	done: list[str] = []

	for item in imports:
		savepoint = _safe_savepoint_name("op_presc_cleanup", item["visit_cd"])
		try:
			frappe.db.savepoint(savepoint)
			if item["mode"] == "create":
				outcome = import_patient_medication_order_for_visit(item["payload"])
			else:
				outcome = _append_missing_lines(item["pmo"], item["rows"])
		except Exception:
			frappe.db.rollback(save_point=savepoint)
			failures.append(f"{item['visit_cd']}: {frappe.get_traceback()}")
			frappe.log_error(title=f"OP prescription cleanup failed: {item['visit_cd']}")
			continue

		status = outcome.get("status")
		if status in ("created", "updated", "ok"):
			# A prescription that received HS-table lines is flagged with ``from_hs_tb``
			# so the Oracle-only lines can be found (and removed) again later.
			hs_flagged += cint(item.get(FROM_HS_FLAG))
		if status == "created":
			created += 1
			added_lines += cint(outcome.get("lines"))
			done.append(f"{item['visit_cd']}: {outcome.get('name')} +{cint(outcome.get('lines'))} lines")
		elif status in ("updated", "ok"):
			updated += 1
			added_lines += cint(outcome.get("added_lines"))
			done.append(
				f"{item['visit_cd']}: {outcome.get('pmo') or outcome.get('name')} "
				f"+{cint(outcome.get('added_lines'))} lines"
			)
		else:
			skipped += 1
			done.append(f"{item['visit_cd']}: {status}")

	return {
		"created": created,
		"updated": updated,
		"skipped": skipped,
		"added_lines": added_lines,
		"hs_flagged": hs_flagged,
		"failures": failures,
		"done": done,
	}


def _apply_his_cleanup(his_plan: dict) -> dict:
	deleted = cancelled = 0
	failures: list[str] = []
	affected: dict[str, int] = {}

	for pmo_name, child_name in his_plan["delete"]:
		affected.setdefault(pmo_name, 0)
		try:
			frappe.db.delete(PMO_CHILD_DOCTYPE, {"name": child_name})
			deleted += 1
			affected[pmo_name] += 1
		except Exception:
			failures.append(f"{pmo_name} line {child_name}: {frappe.get_traceback()}")
			frappe.log_error(title=f"OP prescription cleanup line failed: {pmo_name}")

	# Keep the parent counters in step with the lines that are left.
	for pmo_name in affected:
		try:
			remaining = frappe.db.count(PMO_CHILD_DOCTYPE, {"parent": pmo_name})
			frappe.db.set_value(
				PMO_DOCTYPE,
				pmo_name,
				{"total_orders": remaining, "completed_orders": remaining},
				update_modified=False,
			)
		except Exception:
			failures.append(f"{pmo_name} totals: {frappe.get_traceback()}")
			frappe.log_error(title=f"OP prescription cleanup totals failed: {pmo_name}")

	for pmo_name in his_plan["cancel"]:
		savepoint = _safe_savepoint_name("op_presc_his_cancel", pmo_name)
		try:
			frappe.db.savepoint(savepoint)
			doc = frappe.get_doc(PMO_DOCTYPE, pmo_name)
			if doc.docstatus == 1:
				doc.flags.ignore_permissions = True
				doc.flags.ignore_validate = True
				doc.cancel()
				# set_status() only persists while the document is submitted.
				frappe.db.set_value(
					PMO_DOCTYPE, pmo_name, "status", "Cancelled", update_modified=False
				)
			cancelled += 1
		except Exception:
			frappe.db.rollback(save_point=savepoint)
			failures.append(f"{pmo_name}: {frappe.get_traceback()}")
			frappe.log_error(title=f"OP prescription cleanup cancel failed: {pmo_name}")

	return {"deleted_lines": deleted, "cancelled_pmos": cancelled, "failures": failures}


def _remaining_note(plan: dict) -> str:
	remaining = cint(plan.get("remaining_visits"))
	if not remaining:
		return ""
	return "\n\n" + _(
		"{0} more visits are still queued — run Reconcile OP Prescriptions again to continue."
	).format(remaining)


def _format_message(plan: dict, applied: dict | None) -> str:
	scope = plan.get("scope_patient") or _("all patients")
	if not applied:
		return _(
			"OP prescription reconciliation (dry run - nothing changed).\n\n"
			"Sheet: {0}\nScope: {1}\nSource visits: {2} ({3} prescription lines)\n\n"
			"Visits already complete: {4}\nVisits with no prescription: {5} ({6} lines)\n"
			"Visits with missing lines: {7} ({8} lines)\n"
			"Visits covered only by PVP_HIS (rebuilt): {15}\n\n"
			"PVP_HIS prescriptions in scope: {9} ({10} lines)\n"
			"Duplicate PVP_HIS lines to delete: {11}\n"
			"PVP_HIS prescriptions to cancel: {12}\n"
			"PVP_HIS lines kept (not rebuildable): {13}\n"
			"Visits without a patient: {14}"
		).format(
			plan.get("file_url") or "-",
			scope,
			plan.get("source_visits") or 0,
			plan.get("source_lines") or 0,
			plan.get("complete_visits") or 0,
			plan.get("missing_visits") or 0,
			plan.get("missing_lines") or 0,
			plan.get("partial_visits") or 0,
			plan.get("partial_lines") or 0,
			plan.get("his_pmos") or 0,
			plan.get("his_lines") or 0,
			plan.get("his_duplicate_lines") or 0,
			plan.get("his_pmos_to_cancel") or 0,
			plan.get("his_lines_kept") or 0,
			plan.get("unresolved_visits") or 0,
			plan.get("his_only_visits") or 0,
		) + _remaining_note(plan)

	message = _(
		"OP prescription reconciliation finished.\n\n"
		"Sheet: {0}\nScope: {1}\n\n"
		"Prescriptions created: {2} ({3} lines)\nPrescriptions completed: {4}\n"
		"Visits skipped: {5}\nDuplicate PVP_HIS lines deleted: {6}\n"
		"PVP_HIS prescriptions cancelled: {7}\nFailed: {8}"
	).format(
		plan.get("file_url") or "-",
		scope,
		applied.get("created") or 0,
		applied.get("added_lines") or 0,
		applied.get("updated") or 0,
		applied.get("skipped") or 0,
		applied.get("deleted_lines") or 0,
		applied.get("cancelled_pmos") or 0,
		applied.get("failures") or 0,
	)

	done = applied.get("done") or []
	if done:
		message += "\n\n" + "\n".join(done[:SAMPLE_LIMIT])
	return message + _remaining_note(plan)


@frappe.whitelist()
def preview_op_prescription_cleanup(
	file_url: str | None = None, patient: str | None = None
) -> dict:
	"""Report the OP prescriptions and PVP_HIS duplicates that would be repaired."""
	_require_admin()
	plan = _build_plan(file_url=file_url, patient=patient)
	if not plan.get("ok"):
		return plan

	plan["message"] = _format_message(plan, None)
	for key in ("imports", "his_plan", "sheet_row_counts", "plan_visits"):
		plan.pop(key, None)
	return plan


@frappe.whitelist()
def run_op_prescription_cleanup(
	file_url: str | None = None,
	patient: str | None = None,
	dry_run: int = 0,
	fix_missing: int = 1,
	drop_his_duplicates: int = 1,
	limit: int = 0,
) -> dict:
	"""Create the missing OP prescriptions and drop the duplicated PVP_HIS lines.

	``limit`` caps the number of visits touched by one call (0 = the whole plan) so a large
	site can be reconciled in several bounded runs instead of one request that times out.
	"""
	_require_admin()
	dry_run = cint(dry_run)
	limit = cint(limit)
	plan = _build_plan(file_url=file_url, patient=patient)
	if not plan.get("ok"):
		return plan

	imports = plan.pop("imports")
	his_plan = plan.pop("his_plan")
	plan.pop("sheet_row_counts", None)
	plan_visits = plan.pop("plan_visits", [])
	plan["remaining_visits"] = 0

	if dry_run:
		# A dry run always reports the whole plan; ``limit`` only bounds the real run.
		plan["applied"] = 0
		plan["message"] = _format_message(plan, None)
		return plan

	if limit and len(plan_visits) > limit:
		selected = set(plan_visits[:limit])
		imports = [item for item in imports if item["visit_cd"] in selected]
		his_plan = _limit_his_plan(his_plan, selected)
		plan["remaining_visits"] = len(plan_visits) - limit

	# Duplicates first: cancelling the leftover HIS prescriptions clears the visits the normal
	# OP import has to (re)create.
	his_result = (
		_apply_his_cleanup(his_plan)
		if cint(drop_his_duplicates)
		else {"deleted_lines": 0, "cancelled_pmos": 0, "failures": []}
	)
	import_result = (
		_apply_imports(imports)
		if cint(fix_missing)
		else {
			"created": 0,
			"updated": 0,
			"skipped": 0,
			"added_lines": 0,
			"failures": [],
			"done": [],
		}
	)
	frappe.db.commit()

	failures = import_result["failures"] + his_result["failures"]
	applied = {
		"created": import_result["created"],
		"updated": import_result["updated"],
		"skipped": import_result["skipped"],
		"added_lines": import_result["added_lines"],
		"deleted_lines": his_result["deleted_lines"],
		"cancelled_pmos": his_result["cancelled_pmos"],
		"failures": len(failures),
		"done": import_result["done"],
	}

	plan["applied"] = 1
	plan["created"] = import_result["created"]
	plan["updated"] = import_result["updated"]
	plan["skipped"] = import_result["skipped"]
	plan["added_lines"] = import_result["added_lines"]
	plan["deleted_his_lines"] = his_result["deleted_lines"]
	plan["cancelled_his_pmos"] = his_result["cancelled_pmos"]
	plan["failed"] = len(failures)
	plan["ok"] = not failures
	plan["message"] = _format_message(plan, applied)
	if failures:
		plan["errors"] = failures[:5]
	return plan
