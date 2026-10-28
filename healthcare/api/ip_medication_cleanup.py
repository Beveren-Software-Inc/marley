"""Create the Patient Medication Orders the IP_ADMISSION_MEDICINE import missed.

The legacy ``IP_ADMISSION_MEDICINE`` export is the source of truth. Each legacy line is
identified by its ``TRANS_NUM`` (stored on the PMO child row as ``reference_no``); lines
without a ``TRANS_NUM`` fall back to a ``medicine | start date | trans date | CR_ID`` key.
Admissions with no prescription at all — or with fewer lines than the sheet — are
reported and, on run, created/patched through the regular importer
(``import_patient_medication_order_for_admission``), so the same item lookup, frequency
handling and legacy-field mapping is used. Depot / long-acting lines (e.g. ``FLUANXOL
DEPOT`` given ``Q2W``) are flagged as ``Long Acting Medicine`` on the prescription line and
a ``Long Acting Medicine`` record is created for them, which is what drives the long-acting
give-out log. Nothing is deleted, unsigned prescriptions are left untouched and lines that
already exist are never duplicated.

Example finding (2026-07): admission 2210 (patient 860640) has 107 legacy lines and no
Patient Medication Order, because the admission was created in ERP while the
prescription import was already running.
"""

from __future__ import annotations

import re
from typing import Any

import frappe
from frappe import _

from healthcare.api.ip_admission_cleanup import _file_path_if_exists
from healthcare.api.op_injection_prescription_import import _map_long_acting_frequency
from healthcare.api.patient_info_import import _require_admin
from healthcare.api.patient_medication_order_import import (
	_clean_oracle_num,
	_existing_pmo_for_admission,
	_group_rows_by_admission,
	_normalize_oracle_medicine_num,
	_parse_date_value,
	_parse_file_rows,
	_safe_savepoint_name,
	import_patient_medication_order_for_admission,
	resolve_current_item_from_legacy,
)
from healthcare.api.visit_diagnosis_sync import _resolve_inpatient_admission

# The legacy export is uploaded as ``IP_ADMISSION_MEDICINE.xlsx`` (also .xls / .csv). Frappe
# appends a 12 character hash when the same name is uploaded twice, so files are matched on
# their normalised stem instead of the exact name.
SOURCE_FILE_STEMS = {"ipadmissionmedicine"}
PMO_CHILD_DOCTYPE = "Inpatient Medication Order Entry"
LAM_CHILD_DOCTYPE = "Subscription Medication Plan Item"
SAMPLE_LIMIT = 25

# Legacy depot / long-acting injections (frequency alone is not enough: weekly tablets
# such as methotrexate or vitamin D are weekly but are not long-acting injections).
LONG_ACTING_MEDICINE_NAME_HINTS = (
	"depot",
	"consta",
	"sustenna",
	"trinza",
	"maintena",
	"decanoas",
	"haldol dec",
	"xeplion",
	"invega",
)


def _source_file_stem(file_name: str) -> str:
	"""``IP_ADMISSION_MEDICINE.xlsx`` and Frappe's ``IP_ADMISSION_MEDICINE3ad06b3ad06b.xlsx``
	both normalise to the same stem, so a re-upload is still recognised."""
	stem = (file_name or "").rsplit("/", 1)[-1]
	if "." in stem:
		stem = stem.rsplit(".", 1)[0]
	stem = re.sub(r"[0-9a-f]{12}$", "", stem.lower())
	return re.sub(r"[^a-z0-9]", "", stem)


def _is_source_file_name(file_name: str) -> bool:
	return _source_file_stem(file_name) in SOURCE_FILE_STEMS


def _resolve_source_file_url(file_url: str | None = None) -> str | None:
	"""Uploaded file first, then the newest IP_ADMISSION_MEDICINE file on the server."""
	if file_url and _file_path_if_exists(file_url):
		return file_url

	files = frappe.get_all(
		"File",
		filters={"is_folder": 0, "file_name": ["like", "%IP_ADMISSION_MEDICINE%"]},
		fields=["file_name", "file_url"],
		order_by="creation desc",
		limit=50,
	)
	for row in files:
		if not _is_source_file_name(row.get("file_name")):
			continue
		if _file_path_if_exists(row.get("file_url")):
			return row.get("file_url")
	return None


def _existing_reference_nos() -> set[str]:
	"""Legacy TRANS_NUM values already stored on any non-cancelled PMO line."""
	return {
		str(row[0]).strip()
		for row in frappe.db.sql(
			f"""
			select distinct line.reference_no
			from `tab{PMO_CHILD_DOCTYPE}` line
			inner join `tabPatient Medication Order` pmo on pmo.name = line.parent
			where ifnull(line.reference_no, '') != '' and pmo.docstatus != 2
			"""
		)
	}


def _existing_lines_by_admission() -> dict[str, int]:
	return {
		row[0]: int(row[1])
		for row in frappe.db.sql(
			f"""
			select pmo.inpatient_record, count(*)
			from `tab{PMO_CHILD_DOCTYPE}` line
			inner join `tabPatient Medication Order` pmo on pmo.name = line.parent
			where pmo.docstatus != 2 and ifnull(pmo.inpatient_record, '') != ''
			group by pmo.inpatient_record
			"""
		)
	}


def _existing_long_acting_medicines_by_admission() -> dict[str, int]:
	"""Long Acting Medicine records already linked to a prescription line of the admission."""
	return {
		row[0]: int(row[1])
		for row in frappe.db.sql(
			f"""
			select pmo.inpatient_record, count(distinct lam.name)
			from `tabLong Acting Medicine` lam
			inner join `tab{LAM_CHILD_DOCTYPE}` item
				on item.parent = lam.name and item.parenttype = 'Long Acting Medicine'
			inner join `tab{PMO_CHILD_DOCTYPE}` line on line.name = item.medication_order_entry
			inner join `tabPatient Medication Order` pmo on pmo.name = line.parent
			where ifnull(pmo.inpatient_record, '') != '' and pmo.docstatus != 2
			group by pmo.inpatient_record
			"""
		)
	}


def _looks_like_long_acting_medicine(item_name: str) -> bool:
	name = (item_name or "").lower()
	return any(hint in name for hint in LONG_ACTING_MEDICINE_NAME_HINTS)


def _long_acting_row(row: dict, item_cache: dict[str, tuple[str, str]]) -> dict | None:
	"""The row flagged as Long Acting Medicine when it is a legacy depot / depot-like line."""
	label = _map_long_acting_frequency(row.get("frequency"))
	if not label:
		return None
	code = _normalize_oracle_medicine_num(row.get("medicine_num"))
	if code not in item_cache:
		mapping = resolve_current_item_from_legacy(code) or {}
		item_cache[code] = ((mapping.get("item") or "").strip(), (mapping.get("item_name") or "").strip())
	item, item_name = item_cache[code]
	if not _looks_like_long_acting_medicine(item_name):
		return None
	return {
		**row,
		"is_long_acting_medicine": 1,
		"medication_type": "Long Acting Medicine",
		"long_acting_frequency": label,
		"long_acting_medicine_name": item_name,
		"drug": item or None,
		"drug_name": item_name or None,
	}


def _prepare_long_acting_rows(rows: list[dict]) -> list[dict]:
	"""Flag depot lines so the importer marks them long-acting and a LAM record is created."""
	item_cache: dict[str, tuple[str, str]] = {}
	return [_long_acting_row(row, item_cache) or row for row in rows]


def _create_missing_long_acting_medicines(pmo_name: str | None) -> list[str]:
	"""Create the Long Acting Medicine records for the prescription's long-acting lines."""
	if not pmo_name:
		return []
	from healthcare.api.patient_medication_order import _create_long_acting_medicine_for_entries

	doc = frappe.get_doc("Patient Medication Order", pmo_name)
	return _create_long_acting_medicine_for_entries(doc) or []


def _medicine_token(value: Any) -> str:
	code = _normalize_oracle_medicine_num(value) or ""
	return code.lstrip("0") or code


def _row_key(row: dict) -> str:
	"""(medicine, start date, trans date, CR_ID) key for lines without a TRANS_NUM."""
	start = _parse_date_value(row.get("start_date")) or _parse_date_value(row.get("trans_date"))
	return "|".join(
		[
			_medicine_token(row.get("medicine_num")),
			str(start or ""),
			str(_parse_date_value(row.get("trans_date")) or ""),
			_clean_oracle_num(row.get("cr_id")),
		]
	)


def _pmo_line_keys(admission_name: str) -> set[str]:
	"""Same fallback key built from the child rows already stored for the admission."""
	name = _existing_pmo_for_admission(admission_name)
	if not name:
		return set()
	doc = frappe.get_doc("Patient Medication Order", name)
	return {
		"|".join(
			[
				_medicine_token(child.medicine_no),
				str(child.date or ""),
				str(child.trans_date or ""),
				(child.cr_id or "").strip(),
			]
		)
		for child in (doc.get("medication_orders") or [])
	}



def _resolve_admission(lines: list[dict]) -> str | None:
	first = lines[0] if lines else {}
	patient_hint = _clean_oracle_num(first.get("patient_num")) or None
	name = _resolve_inpatient_admission(_clean_oracle_num(first.get("admission_num")), patient_hint)
	if name:
		return name
	old_admission_no = _clean_oracle_num(first.get("old_admission_no"))
	if old_admission_no:
		return _resolve_inpatient_admission(old_admission_no, patient_hint)
	return None


def _admission_fields(admission_name: str) -> dict[str, Any]:
	return (
		frappe.db.get_value(
			"Inpatient Admission",
			admission_name,
			["patient", "patient_name", "admission_date"],
			as_dict=True,
		)
		or {}
	)


def _build_plan(file_url: str | None = None) -> dict:
	source_url = _resolve_source_file_url(file_url)
	if not source_url:
		return {
			"ok": False,
			"needs_file": True,
			"message": _(
				"No IP_ADMISSION_MEDICINE file found on the server. Upload the legacy prescription export."
			),
		}

	rows, skipped_rows = _parse_file_rows(source_url)
	grouped, unresolved_rows = _group_rows_by_admission(rows)

	resolved: dict[str, dict] = {}
	unresolved_admissions: list[dict] = []
	for key in sorted(grouped):
		lines = grouped[key]
		admission_name = _resolve_admission(lines)
		if not admission_name:
			unresolved_admissions.append({"admission_key": key, "lines": len(lines)})
			continue
		bucket = resolved.setdefault(
			admission_name, {"admission_key": key, "admission": admission_name, "rows": []}
		)
		bucket["rows"].extend(lines)

	plan: list[dict] = []
	admissions_without_patient = 0
	existing_reference_nos = _existing_reference_nos()
	existing_lines_by_admission = _existing_lines_by_admission()
	existing_long_acting = _existing_long_acting_medicines_by_admission()
	fallback_keys: dict[str, set[str]] = {}

	def _is_missing(row: dict, admission_name: str) -> bool:
		trans_no = _clean_oracle_num(row.get("trans_no"))
		if trans_no:
			return trans_no not in existing_reference_nos
		return _row_key(row) not in fallback_keys[admission_name]

	for admission_name, bucket in resolved.items():
		fields = _admission_fields(admission_name)
		if not fields.get("patient"):
			admissions_without_patient += 1
			continue
		if any(not _clean_oracle_num(row.get("trans_no")) for row in bucket["rows"]):
			fallback_keys[admission_name] = _pmo_line_keys(admission_name)
		missing = [row for row in bucket["rows"] if _is_missing(row, admission_name)]
		if not missing:
			continue
		missing = _prepare_long_acting_rows(missing)
		long_acting_rows = [row for row in missing if row.get("is_long_acting_medicine")]
		plan.append(
			{
				"admission_key": bucket["admission_key"],
				"admission": admission_name,
				"patient": fields.get("patient"),
				"patient_name": fields.get("patient_name"),
				"existing_pmo": _existing_pmo_for_admission(admission_name),
				"existing_lines": existing_lines_by_admission.get(admission_name, 0),
				"sheet_lines": len(bucket["rows"]),
				"missing_lines": len(missing),
				"long_acting_lines": len(long_acting_rows),
				"long_acting_examples": [
					f"{row.get('long_acting_medicine_name')} · {row.get('long_acting_frequency')}"
					for row in long_acting_rows[:5]
				],
				"existing_long_acting_medicines": existing_long_acting.get(admission_name, 0),
				"missing_rows": missing,
			}
		)

	plan.sort(key=lambda item: item["missing_lines"], reverse=True)
	long_acting_lines = sum(item["long_acting_lines"] for item in plan)
	existing_long_acting_medicines = sum(item["existing_long_acting_medicines"] for item in plan)

	return {
		"ok": True,
		"file_url": source_url,
		"file_rows": len(rows) + skipped_rows,
		"medicine_lines": len(rows),
		"rows_without_admission": len(unresolved_rows) + skipped_rows,
		"admissions_in_file": len(grouped),
		"resolved_admissions": len(resolved),
		"unresolved_admissions": len(unresolved_admissions),
		"admissions_without_patient": admissions_without_patient,
		"complete_admissions": len(resolved) - len(plan) - admissions_without_patient,
		"gaps": len(plan),
		"missing_lines": sum(item["missing_lines"] for item in plan),
		"long_acting_lines": long_acting_lines,
		"long_acting_medicines_existing": existing_long_acting_medicines,
		"plan": plan,
	}


def _sample_line(item: dict) -> str:
	name = item.get("patient_name") or item.get("patient") or "-"
	line = (
		f"{item['admission']} · {item['patient']} {name}: "
		f"{item['existing_lines']} existing / {item['sheet_lines']} sheet "
		f"→ {item['missing_lines']} to create"
	)
	if item.get("long_acting_lines"):
		line += f" ({item['long_acting_lines']} long-acting)"
	return line


@frappe.whitelist()
def preview_ip_medication_cleanup(file_url: str | None = None) -> dict:
	"""Report the admissions whose prescription is missing (or short) in ERP."""
	_require_admin()
	result = _build_plan(file_url)
	if not result.get("ok"):
		return result

	plan = result.pop("plan")
	long_acting_samples = [
		f"{item['admission']} · {item['patient']}: {example}"
		for item in plan
		for example in item.get("long_acting_examples") or []
	]
	return {
		**result,
		"samples": [_sample_line(item) for item in plan[:SAMPLE_LIMIT]],
		"long_acting_samples": long_acting_samples[:SAMPLE_LIMIT],
	}


@frappe.whitelist()
def run_ip_medication_cleanup(file_url: str | None = None) -> dict:
	"""Create/complete the missing Patient Medication Orders from the legacy sheet."""
	_require_admin()
	result = _build_plan(file_url)
	if not result.get("ok"):
		return result

	plan = result.pop("plan")
	created = completed = added_lines = skipped_lines = 0
	long_acting_lines = long_acting_created = long_acting_failures = 0
	failures: list[str] = []
	done: list[str] = []

	for item in plan:
		savepoint = _safe_savepoint_name("ip_med_cleanup", item["admission_key"])
		try:
			frappe.db.savepoint(savepoint)
			outcome = import_patient_medication_order_for_admission(
				item["admission_key"], item["missing_rows"]
			)
		except Exception:
			frappe.db.rollback(save_point=savepoint)
			failures.append(f"{item['admission']}: {frappe.get_traceback()}")
			frappe.log_error(title=f"IP medication cleanup failed: {item['admission']}")
			continue

		if outcome.get("status") == "ok":
			if outcome.get("created"):
				created += 1
			else:
				completed += 1
			added_lines += int(outcome.get("added_lines") or 0)
			skipped_lines += int(outcome.get("skipped_lines") or 0)
			long_acting_lines += int(item.get("long_acting_lines") or 0)
			lam_names: list[str] = []
			try:
				lam_names = _create_missing_long_acting_medicines(outcome.get("pmo"))
			except Exception:
				long_acting_failures += 1
				failures.append(f"{item['admission']} (long acting): {frappe.get_traceback()}")
				frappe.log_error(
					title=f"IP medication cleanup long acting failed: {item['admission']}"
				)
			long_acting_created += len(lam_names)
			line = f"{item['admission']}: {outcome.get('pmo')} +{outcome.get('added_lines') or 0} lines"
			if lam_names:
				line += f", Long Acting Medicine {', '.join(lam_names)}"
			done.append(line)
		else:
			failures.append(f"{item['admission']}: {outcome.get('status')}")

	frappe.db.commit()

	message = _(
		"Create missing medication orders finished.\n\n"
		"Sheet: {0}\nAdmissions with a gap: {1}\nPrescriptions created: {2}\n"
		"Prescriptions completed: {3}\nMedicine lines added: {4}\nDuplicates skipped: {5}\n"
		"Long-acting lines: {6}\nLong Acting Medicine created: {7}\nFailed: {8}"
	).format(
		result.get("file_url") or "-",
		len(plan),
		created,
		completed,
		added_lines,
		skipped_lines,
		long_acting_lines,
		long_acting_created,
		len(failures),
	)
	if done:
		message += "\n\n" + "\n".join(done[:SAMPLE_LIMIT])
	if failures:
		message += "\n\n" + _("Errors") + ":\n" + "\n".join(failures[:5])

	return {
		**result,
		"ok": not failures,
		"gaps": len(plan),
		"created": created,
		"completed": completed,
		"added_lines": added_lines,
		"skipped_lines": skipped_lines,
		"long_acting_lines": long_acting_lines,
		"long_acting_medicines_created": long_acting_created,
		"long_acting_failures": long_acting_failures,
		"failures": len(failures),
		"message": message,
	}
