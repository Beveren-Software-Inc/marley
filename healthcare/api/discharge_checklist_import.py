"""Import Oracle discharge checklist Excel into Discharge.discharge_checklist."""

from __future__ import annotations

import json
from datetime import date, datetime, time
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, get_datetime

DEFAULT_DISCHARGE_TEMPLATE = "Default Discharge Template"
DISCHARGE_CHECKLIST_IMPORT_BATCH_SIZE = 25
CACHE_KEYS = {
	"file_url": "healthcare:data_migration:discharge_checklist_import:file_url",
	"admissions": "healthcare:data_migration:discharge_checklist_import:admissions",
	"grouped": "healthcare:data_migration:discharge_checklist_import:grouped",
}
CACHE_TTL = 7200

EXCEL_HEADER_MAP = {
	"ADMISSION_NUM": "admission_num",
	"PATIENT_NUM": "patient_num",
	"SR_NUM": "sr_num",
	"ACTION_REQUIRED": "action_required",
	"DEPT_NAME": "dept_name",
	"ACTION_FLAG": "action_flag",
	"CR_ID": "cr_id",
	"CR_DATE": "cr_date",
	"UP_ID": "up_id",
	"UP_DATE": "up_date",
	"BRANCH_NUM": "branch_num",
	"AUTO_CR_DATE": "auto_cr_date",
}


def _require_admin() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def _clean_oracle_num(value: Any) -> str:
	if value is None or value == "":
		return ""
	if isinstance(value, float) and value == int(value):
		return str(int(value))
	if isinstance(value, (int,)):
		return str(value)
	return str(value).strip()


def _format_legacy_date(value: Any) -> str:
	if value is None or value == "":
		return ""
	if isinstance(value, datetime):
		return value.strftime("%Y-%m-%d %H:%M:%S")
	if isinstance(value, date):
		return value.strftime("%Y-%m-%d")
	if isinstance(value, time):
		return value.strftime("%H:%M:%S")
	text = str(value).strip()
	if not text:
		return ""
	try:
		return get_datetime(text).strftime("%Y-%m-%d %H:%M:%S")
	except Exception:
		return text


def _flag_to_check(value: Any) -> int:
	if value is None or value == "":
		return 0
	text = str(value).strip().upper()
	return 1 if text in ("Y", "YES", "1", "TRUE", "T") else 0


def _excel_file_path(file_url: str) -> str:
	if not file_url:
		frappe.throw(_("File URL is required."))
	file_name = frappe.db.get_value("File", {"file_url": file_url}, "name")
	if not file_name:
		frappe.throw(_("Uploaded file was not found. Please upload the Excel file again."))
	from frappe.utils.file_manager import get_file_path

	return get_file_path(file_name)


def _parse_excel_rows(file_url: str) -> list[dict]:
	try:
		import openpyxl
	except ImportError:
		frappe.throw(
			_("openpyxl is required to read Excel files. Install it in the bench environment: pip install openpyxl")
		)

	path = _excel_file_path(file_url)
	wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
	ws = wb.active
	rows_iter = ws.iter_rows(values_only=True)
	try:
		header_row = next(rows_iter)
	except StopIteration:
		return []

	headers = [
		EXCEL_HEADER_MAP.get(str(h).strip().upper(), str(h).strip().lower())
		if h is not None
		else ""
		for h in header_row
	]
	parsed: list[dict] = []
	for raw in rows_iter:
		if not raw or all(cell is None or str(cell).strip() == "" for cell in raw):
			continue
		row: dict[str, Any] = {}
		for idx, key in enumerate(headers):
			if not key or idx >= len(raw):
				continue
			row[key] = raw[idx]
		admission_num = _clean_oracle_num(row.get("admission_num"))
		if not admission_num:
			continue
		row["admission_num"] = admission_num
		row["patient_num"] = _clean_oracle_num(row.get("patient_num"))
		row["sr_num"] = _clean_oracle_num(row.get("sr_num"))
		parsed.append(row)
	return parsed


def _group_rows_by_admission(rows: list[dict]) -> tuple[dict[str, list[dict]], list[dict]]:
	grouped: dict[str, list[dict]] = {}
	unresolved: list[dict] = []
	for row in rows:
		key = row.get("admission_num") or ""
		if not key:
			unresolved.append(row)
			continue
		grouped.setdefault(key, []).append(row)
	return grouped, unresolved


def _resolve_inpatient_admission(admission_num: str, patient_num: str | None = None) -> str | None:
	adm = (admission_num or "").strip()
	if not adm:
		return None
	if frappe.db.exists("Inpatient Admission", adm):
		return adm

	for field in ("admission_no_old", "case_no"):
		name = frappe.db.get_value("Inpatient Admission", {field: adm}, "name")
		if name:
			return name

	pat = _clean_oracle_num(patient_num)
	if pat and frappe.db.exists("Patient", pat):
		for field in ("admission_no_old", "case_no"):
			name = frappe.db.get_value(
				"Inpatient Admission", {"patient": pat, field: adm}, "name"
			)
			if name:
				return name

	return None


def _resolve_discharge_name(admission_name: str) -> str | None:
	if not admission_name:
		return None
	if frappe.db.exists("Discharge", admission_name):
		return admission_name
	return frappe.db.get_value("Discharge", {"admission": admission_name}, "name")


def _resolve_department(dept_name: str | None) -> str | None:
	text = (dept_name or "").strip()
	if not text:
		return None
	if frappe.db.exists("Department", text):
		return text
	return frappe.db.get_value("Department", {"department_name": text}, "name") or frappe.db.get_value(
		"Department", {"name": text}, "name"
	)


def _resolve_cost_center(branch_label: str | None) -> str | None:
	text = (branch_label or "").strip()
	if not text:
		return None
	for doctype in ("Cost Center", "Branch"):
		if frappe.db.exists(doctype, text):
			return text
		name = frappe.db.get_value(doctype, {"cost_center_name": text}, "name")
		if name:
			return name
	return None


def _template_checklist_seed_rows(template_name: str = DEFAULT_DISCHARGE_TEMPLATE) -> list[dict]:
	if not frappe.db.exists("Discharge Template", template_name):
		frappe.throw(_("Discharge Template “{0}” was not found.").format(template_name))
	template = frappe.get_doc("Discharge Template", template_name)
	rows = template.discharge_checklist or []
	if not rows:
		frappe.throw(
			_("Discharge Template “{0}” has no checklist rows. Add the 9 actions first.").format(
				template_name
			)
		)
	return [
		{
			"action_required": row.action_required,
			"department": row.department,
			"sr_num": str(idx + 1),
		}
		for idx, row in enumerate(rows)
	]


def _index_checklist_by_sr(checklist) -> dict[int, Any]:
	idx: dict[int, Any] = {}
	for child in checklist:
		sr = cint(child.sr_num)
		if sr:
			idx[sr] = child
	return idx


def _normalize_action(text: str) -> str:
	return "".join(ch for ch in (text or "").lower() if ch.isalnum())


def _find_checklist_row(checklist, line: dict, by_sr: dict[int, Any]):
	sr = cint(line.get("sr_num"))
	if sr and sr in by_sr:
		return by_sr[sr]
	action = _normalize_action(line.get("action_required") or "")
	if not action:
		return None
	for child in checklist:
		if _normalize_action(child.action_required) == action:
			return child
		if action in _normalize_action(child.action_required):
			return child
	return None


def _fill_checklist_row(child, line: dict) -> None:
	if line.get("action_required"):
		child.action_required = line.get("action_required")
	dept = (line.get("dept_name") or "").strip()
	if dept:
		child.department_name = dept
		resolved_dept = _resolve_department(dept)
		if resolved_dept:
			child.department = resolved_dept
	if line.get("sr_num"):
		child.sr_num = _clean_oracle_num(line.get("sr_num"))
	child.click = _flag_to_check(line.get("action_flag"))
	child.cr_id = _clean_oracle_num(line.get("cr_id"))
	child.cr_date = _format_legacy_date(line.get("cr_date"))
	child.up_id = _clean_oracle_num(line.get("up_id"))
	child.up_date = _format_legacy_date(line.get("up_date"))
	child.auto_create = _format_legacy_date(line.get("auto_cr_date"))
	cr_dt = line.get("cr_date")
	if cr_dt:
		try:
			child.date_time = get_datetime(cr_dt)
		except Exception:
			pass


def _maybe_update_admission_cost_center(admission_name: str, branch_label: str | None) -> None:
	cc = _resolve_cost_center(branch_label)
	if not cc or not admission_name:
		return
	if frappe.db.exists("Inpatient Admission", admission_name):
		frappe.db.set_value("Inpatient Admission", admission_name, "cost_center", cc, update_modified=False)


def import_discharge_checklist_for_admission(
	admission_key: str,
	excel_lines: list[dict],
	template_name: str = DEFAULT_DISCHARGE_TEMPLATE,
) -> dict:
	"""Apply Oracle checklist lines to one Discharge (matched by admission / patient)."""
	patient_num = (excel_lines[0].get("patient_num") if excel_lines else "") or ""
	admission_name = _resolve_inpatient_admission(admission_key, patient_num)
	if not admission_name:
		return {"status": "skip_no_admission", "admission_key": admission_key}

	discharge_name = _resolve_discharge_name(admission_name)
	if not discharge_name:
		return {
			"status": "skip_no_discharge",
			"admission_key": admission_key,
			"admission": admission_name,
		}

	branch = (excel_lines[0].get("branch_num") if excel_lines else "") or ""
	_maybe_update_admission_cost_center(admission_name, branch)

	template_rows = _template_checklist_seed_rows(template_name)
	doc = frappe.get_doc("Discharge", discharge_name)
	doc.discharge_template = template_name
	doc.discharge_checklist = []

	for trow in template_rows:
		doc.append(
			"discharge_checklist",
			{
				"action_required": trow["action_required"],
				"department": trow.get("department"),
				"sr_num": trow["sr_num"],
				"click": 0,
			},
		)

	by_sr = _index_checklist_by_sr(doc.discharge_checklist)
	matched = 0
	for line in excel_lines:
		child = _find_checklist_row(doc.discharge_checklist, line, by_sr)
		if not child:
			continue
		_fill_checklist_row(child, line)
		matched += 1

	doc.flags.ignore_validate = True
	doc.save(ignore_permissions=True)

	return {
		"status": "ok",
		"admission_key": admission_key,
		"admission": admission_name,
		"discharge": discharge_name,
		"lines": len(excel_lines),
		"matched": matched,
		"checklist_rows": len(doc.discharge_checklist),
	}


def parse_and_cache_excel(file_url: str) -> dict:
	rows = _parse_excel_rows(file_url)
	grouped, unresolved = _group_rows_by_admission(rows)
	admission_keys = sorted(grouped.keys())

	frappe.cache().set_value(CACHE_KEYS["file_url"], file_url, expires_in_sec=CACHE_TTL)
	frappe.cache().set_value(CACHE_KEYS["admissions"], admission_keys, expires_in_sec=CACHE_TTL)
	# Serialize for redis cache compatibility
	frappe.cache().set_value(
		CACHE_KEYS["grouped"],
		json.dumps(grouped, default=str),
		expires_in_sec=CACHE_TTL,
	)

	resolvable = sum(
		1
		for key in admission_keys
		if _resolve_inpatient_admission(key, (grouped[key][0].get("patient_num") if grouped[key] else ""))
	)
	return {
		"excel_rows": len(rows),
		"admissions": len(admission_keys),
		"unresolved_rows": len(unresolved),
		"resolvable_admissions": resolvable,
		"template": DEFAULT_DISCHARGE_TEMPLATE,
	}


def _load_cached_grouped() -> dict[str, list[dict]]:
	raw = frappe.cache().get_value(CACHE_KEYS["grouped"])
	if not raw:
		return {}
	if isinstance(raw, dict):
		return raw
	return json.loads(raw)


@frappe.whitelist()
def preview_discharge_checklist_import(file_url: str) -> dict:
	_require_admin()
	return parse_and_cache_excel(file_url)


def run_discharge_checklist_import_batch(offset: int = 0) -> dict:
	admission_keys = frappe.cache().get_value(CACHE_KEYS["admissions"]) or []
	grouped = _load_cached_grouped()
	if not admission_keys or not grouped:
		return {"processed": offset, "done": True, "batch_count": 0}

	batch_keys = admission_keys[offset : offset + DISCHARGE_CHECKLIST_IMPORT_BATCH_SIZE]
	if not batch_keys:
		return {"processed": offset, "done": True, "batch_count": 0}

	ok = skip_no_admission = skip_no_discharge = 0
	errors: list[str] = []

	for key in batch_keys:
		lines = grouped.get(key) or []
		try:
			result = import_discharge_checklist_for_admission(key, lines)
			status = result.get("status")
			if status == "ok":
				ok += 1
			elif status == "skip_no_admission":
				skip_no_admission += 1
			elif status == "skip_no_discharge":
				skip_no_discharge += 1
		except Exception:
			errors.append(f"{key}: {frappe.get_traceback()}")
			frappe.log_error(title=f"Discharge checklist import failed: {key}")

	frappe.db.commit()
	processed = offset + len(batch_keys)
	return {
		"processed": processed,
		"done": len(batch_keys) < DISCHARGE_CHECKLIST_IMPORT_BATCH_SIZE,
		"batch_count": len(batch_keys),
		"ok": ok,
		"skip_no_admission": skip_no_admission,
		"skip_no_discharge": skip_no_discharge,
		"errors": len(errors),
	}
