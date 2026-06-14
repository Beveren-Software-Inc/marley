"""Backfill Patient History.date from Patient History Import CR Date (by admission)."""

from __future__ import annotations

import re

import frappe
from frappe.utils import get_datetime

PATIENT_HISTORY_DATE_BATCH_SIZE = 100
_LEGACY_US_DATETIME = re.compile(
	r"^(\d{1,2})/(\d{1,2})/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$"
)


def _require_admin() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def _skip_care_episode_guard(doc) -> None:
	doc.flags.skip_care_episode_guard = True


def _format_datetime(value) -> str | None:
	if not value:
		return None
	try:
		return get_datetime(value).strftime("%Y-%m-%d %H:%M:%S")
	except Exception:
		return None


def _parse_legacy_datetime(value) -> str | None:
	text = (value or "").strip() if value else ""
	if not text:
		return None

	dt = _format_datetime(text)
	if dt:
		return dt

	match = _LEGACY_US_DATETIME.match(text)
	if match:
		month, day, year, hour, minute, second = match.groups()
		try:
			parts = [int(year), int(month), int(day)]
			if hour is not None:
				parts.extend([int(hour), int(minute), int(second or 0)])
				return get_datetime(
					f"{parts[0]}-{parts[1]:02d}-{parts[2]:02d} {parts[3]:02d}:{parts[4]:02d}:{parts[5]:02d}"
				).strftime("%Y-%m-%d %H:%M:%S")
			return get_datetime(f"{parts[0]}-{parts[1]:02d}-{parts[2]:02d}").strftime(
				"%Y-%m-%d %H:%M:%S"
			)
		except Exception:
			return None
	return None


def _admission_match_tokens(admission: str) -> list[str]:
	admission = (admission or "").strip()
	if not admission:
		return []
	tokens = {admission}
	row = frappe.db.get_value(
		"Inpatient Admission",
		admission,
		["name", "case_no", "admission_no_old"],
		as_dict=True,
	)
	if row:
		for value in row.values():
			text = (value or "").strip()
			if text:
				tokens.add(text)
	return sorted(tokens)


def find_import_cr_date_for_admission(admission: str) -> str | None:
	"""Pick CR Date from one Patient History Import row for this admission."""
	tokens = _admission_match_tokens(admission)
	if not tokens:
		return None

	rows = frappe.get_all(
		"Patient History Import",
		filters=[["cr_date", "is", "set"]],
		or_filters=[
			["admission", "in", tokens],
			["old_admission_no", "in", tokens],
		],
		fields=["cr_date"],
		order_by="creation asc",
		limit=1,
	)
	if not rows:
		return None
	return _parse_legacy_datetime(rows[0].get("cr_date"))


def find_admission_datetime(admission: str) -> str | None:
	"""Use Inpatient Admission date when import CR Date is missing."""
	row = frappe.db.get_value(
		"Inpatient Admission",
		admission,
		["admitted_datetime", "admission_date"],
		as_dict=True,
	)
	if not row:
		return None
	return _format_datetime(row.get("admitted_datetime")) or _format_datetime(
		row.get("admission_date")
	)


def find_patient_history_date_for_admission(admission: str) -> tuple[str | None, str | None]:
	"""Return (datetime string, source) where source is import or admission."""
	dt = find_import_cr_date_for_admission(admission)
	if dt:
		return dt, "import"
	dt = find_admission_datetime(admission)
	if dt:
		return dt, "admission"
	return None, None


def _count_patient_history_missing_date() -> int:
	return frappe.db.count(
		"Patient History",
		{"inpatient_admission": ["is", "set"], "date": ["is", "not set"]},
	)


def _patient_history_names_missing_date(limit: int | None = None) -> list[str]:
	kwargs: dict = {
		"doctype": "Patient History",
		"filters": [
			["inpatient_admission", "is", "set"],
			["date", "is", "not set"],
		],
		"pluck": "name",
		"order_by": "name asc",
	}
	if limit:
		kwargs["limit_page_length"] = limit
	return frappe.get_all(**kwargs)


@frappe.whitelist()
def run_patient_history_date_backfill_preview() -> dict:
	_require_admin()
	total_with_admission = frappe.db.count(
		"Patient History", {"inpatient_admission": ["is", "set"]}
	)
	missing_date = _count_patient_history_missing_date()

	can_update = 0
	from_import = 0
	from_admission = 0
	no_date = 0
	sample = _patient_history_names_missing_date(limit=500)
	for name in sample:
		admission = frappe.db.get_value("Patient History", name, "inpatient_admission")
		dt, source = find_patient_history_date_for_admission(admission)
		if not dt:
			no_date += 1
			continue
		can_update += 1
		if source == "import":
			from_import += 1
		elif source == "admission":
			from_admission += 1

	return {
		"total_with_admission": total_with_admission,
		"missing_date": missing_date,
		"sample_checked": len(sample),
		"sample_can_update": can_update,
		"sample_from_import": from_import,
		"sample_from_admission": from_admission,
		"sample_no_date": no_date,
	}


def apply_patient_history_date_from_import(name: str) -> dict:
	"""Set Patient History.date from import CR Date or Inpatient Admission date."""
	admission = frappe.db.get_value("Patient History", name, "inpatient_admission")
	if not admission:
		return {"status": "skip_no_admission", "name": name}

	dt, source = find_patient_history_date_for_admission(admission)
	if not dt:
		return {"status": "skip_no_date", "name": name, "admission": admission}

	ph = frappe.get_doc("Patient History", name)
	_skip_care_episode_guard(ph)
	ph.date = dt
	ph.save(ignore_permissions=True)

	return {
		"status": "updated",
		"name": name,
		"date": dt,
		"source": source,
	}


def run_patient_history_date_backfill_batch(offset: int = 0) -> dict:
	"""Process the next batch of records still missing date.

	Always reads the first N remaining rows. Offsets into a refetched list skip
	records once earlier rows are updated and drop out of the missing-date query.
	"""
	remaining_before = _count_patient_history_missing_date()
	names = _patient_history_names_missing_date(limit=PATIENT_HISTORY_DATE_BATCH_SIZE)
	if not names:
		return {
			"processed": offset,
			"done": True,
			"batch_count": 0,
			"remaining": 0,
			"stats": {"updated": 0, "from_import": 0, "from_admission": 0, "no_date": 0, "errors": 0},
		}

	stats = {"updated": 0, "from_import": 0, "from_admission": 0, "no_date": 0, "errors": 0}

	for name in names:
		try:
			result = apply_patient_history_date_from_import(name)
			status = result.get("status")
			if status == "updated":
				stats["updated"] += 1
				if result.get("source") == "import":
					stats["from_import"] += 1
				elif result.get("source") == "admission":
					stats["from_admission"] += 1
			elif status == "skip_no_date":
				stats["no_date"] += 1
		except Exception:
			stats["errors"] += 1
			frappe.log_error(title=f"Patient History date backfill failed: {name}")

	frappe.db.commit()

	processed = offset + len(names)
	remaining_after = _count_patient_history_missing_date()
	no_progress = stats["updated"] == 0 and remaining_after >= remaining_before
	done = remaining_after == 0 or no_progress
	return {
		"processed": processed,
		"done": done,
		"batch_count": len(names),
		"remaining": remaining_after,
		"stats": stats,
	}
