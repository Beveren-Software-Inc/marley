"""Repair legacy Inpatient Admission values from the IP_ADMISSION_01 Excel.

The Excel is the source of truth for the legacy branch (``BRANCH_NUM`` mapped to a
Cost Center), ``admission_date`` and ``admission_time``. The admission transfer and
the transfer balance imports rewrote those fields on the already imported admission
(see ``ip_admission_transfer_bal_import``), so this cleanup re-applies the Excel values.

``admitted_datetime`` is never touched: it keeps the real start of the stay.
"""

from __future__ import annotations

import os
from collections.abc import Iterable
from datetime import datetime
from typing import Any

import frappe
from frappe import _
from frappe.utils import get_datetime, getdate

from healthcare.api.discharge_checklist_import import _resolve_cost_center
from healthcare.api.ip_admission_discharge_import import CACHE_KEYS, _parse_excel_rows
from healthcare.api.patient_info_import import _cell_text, _require_admin

SOURCE_FILE_NAMES = ("IP_ADMISSION_01.xlsx", "IP_ADMISSION_01.xls")
TRANSFER_EVENT_DOCTYPE = "Transfer Admission Event"
QUERY_CHUNK_SIZE = 500
SET_VALUE_BATCH_SIZE = 200
SAMPLE_LIMIT = 20


def _chunks(values: list[str], size: int) -> Iterable[list[str]]:
	for start in range(0, len(values), size):
		yield values[start : start + size]


def _file_path_if_exists(file_url: str | None) -> str | None:
	if not file_url:
		return None
	from frappe.utils.file_manager import get_file_path

	file_name = frappe.db.get_value("File", {"file_url": file_url}, "name")
	if not file_name:
		return None
	path = get_file_path(file_name)
	return path if path and os.path.exists(path) else None


def _resolve_source_file_url(file_url: str | None = None) -> str | None:
	"""Uploaded file first, then the cached import file, then any IP_ADMISSION_01 File."""
	candidates: list[str] = []
	if file_url:
		candidates.append(file_url)
	cached = frappe.cache().get_value(CACHE_KEYS["file_url"])
	if cached:
		candidates.append(cached)
	for candidate in candidates:
		if _file_path_if_exists(candidate):
			return candidate

	files = frappe.get_all(
		"File",
		filters={"file_name": ["in", list(SOURCE_FILE_NAMES)], "is_folder": 0},
		fields=["file_url"],
		order_by="creation desc",
		limit=20,
	)
	for row in files:
		found = _file_path_if_exists(row.get("file_url"))
		if found:
			return row.get("file_url")
	return None


def _snapshot_cutoff(rows: list[dict]) -> datetime | None:
	"""Latest legacy UP_DATE / ADMISSION_DATE in the Excel = import snapshot."""
	latest: datetime | None = None
	for row in rows:
		for key in ("up_date", "admission_date"):
			value = row.get(key)
			if not value:
				continue
			dt = value if isinstance(value, datetime) else get_datetime(value)
			if dt and (latest is None or dt > latest):
				latest = dt
	return latest


def _late_transfer_targets(names: list[str], cutoff: datetime | None) -> dict[str, str]:
	"""Latest branch transfer per admission that happened after the Excel snapshot.

	Branches moved after the export are legitimate and must not be reverted.
	"""
	if not names or not cutoff:
		return {}
	targets: dict[str, str] = {}
	for chunk in _chunks(names, QUERY_CHUNK_SIZE):
		events = frappe.get_all(
			TRANSFER_EVENT_DOCTYPE,
			filters={
				"inpatient_admission": ["in", chunk],
				"transfer_datetime": [">", cutoff],
			},
			fields=["inpatient_admission", "to_cost_center", "transfer_datetime"],
			order_by="transfer_datetime desc",
		)
		for event in events:
			admission = event.get("inpatient_admission")
			if admission and admission not in targets and event.get("to_cost_center"):
				targets[admission] = event["to_cost_center"]
	return targets


def _load_admissions(names: list[str]) -> dict[str, dict]:
	records: dict[str, dict] = {}
	for chunk in _chunks(names, QUERY_CHUNK_SIZE):
		for row in frappe.get_all(
			"Inpatient Admission",
			filters={"name": ["in", chunk]},
			fields=["name", "patient", "cost_center", "admission_date", "admission_time"],
		):
			records[row["name"]] = row
	return records


def _norm_time(value: Any) -> str:
	return _cell_text(value).strip().lower()


def _new_stats(excel_rows: int) -> dict[str, int]:
	return {
		"excel_rows": excel_rows,
		"matched_admissions": 0,
		"missing_admissions": 0,
		"missing_branch": 0,
		"branch_drift": 0,
		"branch_from_later_transfer": 0,
		"admission_date_drift": 0,
		"admission_time_drift": 0,
		"unchanged": 0,
	}


def _build_changes(file_url: str | None = None) -> dict:
	"""Compare the Excel with the stored admissions. Returns the pending updates."""
	_require_admin()

	source_url = _resolve_source_file_url(file_url)
	if not source_url:
		return {
			"ok": False,
			"needs_file": True,
			"message": _(
				"IP_ADMISSION_01 Excel was not found on the server. Upload the file and run the cleanup again."
			),
		}

	rows = _parse_excel_rows(source_url)
	cutoff = _snapshot_cutoff(rows)
	admissions = _load_admissions([row["case_no"] for row in rows if row.get("case_no")])
	late_targets = _late_transfer_targets(list(admissions), cutoff)
	stats = _new_stats(len(rows))
	changes: list[dict] = []

	for row in rows:
		admission = row.get("case_no")
		record = admissions.get(admission)
		if not record:
			stats["missing_admissions"] += 1
			continue
		if row.get("patient") and record.get("patient") and row["patient"] != record["patient"]:
			stats["missing_admissions"] += 1
			continue
		stats["matched_admissions"] += 1

		updates: dict[str, Any] = {}
		reasons: list[str] = []

		# Branch: a transfer made after the export decides the current branch,
		# otherwise the Excel BRANCH_NUM is authoritative.
		source_branch = _resolve_cost_center(row.get("cost_center"))
		late_target = late_targets.get(admission)
		target_branch = late_target or source_branch
		current_branch = (record.get("cost_center") or "").strip()
		if target_branch and current_branch != target_branch:
			updates["cost_center"] = target_branch
			if not current_branch:
				reasons.append("missing_branch")
				stats["missing_branch"] += 1
			elif late_target:
				reasons.append("branch_from_later_transfer")
				stats["branch_from_later_transfer"] += 1
			else:
				reasons.append("branch_drift")
				stats["branch_drift"] += 1

		source_date = row.get("admission_date")
		if source_date:
			source_date = getdate(source_date)
			current_date = getdate(record["admission_date"]) if record.get("admission_date") else None
			if current_date != source_date:
				updates["admission_date"] = source_date
				reasons.append("admission_date_drift")
				stats["admission_date_drift"] += 1

		source_time = _cell_text(row.get("admission_time"))
		if source_time and _norm_time(record.get("admission_time")) != _norm_time(source_time):
			updates["admission_time"] = source_time
			reasons.append("admission_time_drift")
			stats["admission_time_drift"] += 1

		if not updates:
			stats["unchanged"] += 1
			continue

		changes.append(
			{
				"admission": admission,
				"patient": record.get("patient"),
				"reasons": reasons,
				"updates": updates,
				"current": {
					"cost_center": record.get("cost_center"),
					"admission_date": record.get("admission_date"),
					"admission_time": record.get("admission_time"),
				},
			}
		)

	return {
		"ok": True,
		"file_url": source_url,
		"cutoff": cutoff,
		"stats": stats,
		"changes": changes,
	}


def _sample_line(change: dict) -> str:
	current = change.get("current") or {}
	updates = change.get("updates") or {}
	parts: list[str] = []
	if "cost_center" in updates:
		parts.append(f"{_('branch')} {current.get('cost_center') or '-'} → {updates['cost_center']}")
	if "admission_date" in updates:
		parts.append(
			f"{_('admission date')} {current.get('admission_date') or '-'} → {updates['admission_date']}"
		)
	if "admission_time" in updates:
		parts.append(
			f"{_('admission time')} {current.get('admission_time') or '-'} → {updates['admission_time']}"
		)
	return f"{change.get('admission')}: " + "; ".join(parts)


@frappe.whitelist()
def preview_ip_admission_cleanup(file_url: str | None = None) -> dict:
	"""Report the legacy branch / admission date / admission time that would be restored."""
	result = _build_changes(file_url)
	if not result.get("ok"):
		return result

	stats = result["stats"]
	changes = result["changes"]
	cutoff = result.get("cutoff")
	return {
		"ok": True,
		"file_url": result.get("file_url"),
		"snapshot_date": str(cutoff) if cutoff else None,
		"total_changes": len(changes),
		"excel_rows": stats["excel_rows"],
		"matched_admissions": stats["matched_admissions"],
		"missing_admissions": stats["missing_admissions"],
		"missing_branch": stats["missing_branch"],
		"branch_drift": stats["branch_drift"],
		"branch_from_later_transfer": stats["branch_from_later_transfer"],
		"admission_date_drift": stats["admission_date_drift"],
		"admission_time_drift": stats["admission_time_drift"],
		"unchanged": stats["unchanged"],
		"samples": [_sample_line(change) for change in changes[:SAMPLE_LIMIT]],
	}


@frappe.whitelist()
def run_ip_admission_cleanup(file_url: str | None = None) -> dict:
	"""Restore branch, admission_date and admission_time from the IP_ADMISSION_01 Excel."""
	result = _build_changes(file_url)
	if not result.get("ok"):
		return result

	changes = result["changes"]
	for index, change in enumerate(changes, start=1):
		frappe.db.set_value(
			"Inpatient Admission",
			change["admission"],
			change["updates"],
			update_modified=False,
		)
		if index % SET_VALUE_BATCH_SIZE == 0:
			frappe.db.commit()
	frappe.db.commit()

	stats = result["stats"]
	message = _(
		"Cleanup IP Admission finished.\n\n"
		"Excel rows: {0}\nMatched admissions: {1}\nUpdated admissions: {2}\n\n"
		"Branch restored (missing): {3}\nBranch restored (wrong branch): {4}\n"
		"Branch from later transfer: {5}\nAdmission date restored: {6}\n"
		"Admission time restored: {7}\nUnchanged: {8}\nNot found: {9}\n\n"
		"Sheet: {10}"
	).format(
		stats["excel_rows"],
		stats["matched_admissions"],
		len(changes),
		stats["missing_branch"],
		stats["branch_drift"],
		stats["branch_from_later_transfer"],
		stats["admission_date_drift"],
		stats["admission_time_drift"],
		stats["unchanged"],
		stats["missing_admissions"],
		result.get("file_url") or "-",
	)
	return {
		"ok": True,
		"file_url": result.get("file_url"),
		"updated": len(changes),
		**stats,
		"message": message,
	}
