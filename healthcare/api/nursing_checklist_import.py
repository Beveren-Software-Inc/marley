"""Import Oracle nursing discharge checklist Excel into Discharge.nursing_checklist."""

from __future__ import annotations

import json
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint

from healthcare.api.discharge_checklist_import import (
	_clean_oracle_num,
	_excel_file_path,
	_fill_checklist_row,
	_group_rows_by_admission,
	_index_checklist_by_sr,
	_maybe_update_admission_cost_center,
	_normalize_action,
	_resolve_department,
	_resolve_discharge_name,
	_resolve_inpatient_admission,
)

DEFAULT_NURSING_TEMPLATE = "Default Nursing Discharge Checklist"
DEFAULT_NURSING_DEPARTMENT_LABEL = "Nursing"
NURSING_CHECKLIST_IMPORT_BATCH_SIZE = 25
CACHE_KEYS = {
	"file_url": "healthcare:data_migration:nursing_checklist_import:file_url",
	"admissions": "healthcare:data_migration:nursing_checklist_import:admissions",
	"grouped": "healthcare:data_migration:nursing_checklist_import:grouped",
}
CACHE_TTL = 7200

EXCEL_HEADER_MAP = {
	"ADMISSION": "admission_num",
	"ADMISSION_NUM": "admission_num",
	"PATIENT": "patient_num",
	"PATIENT_NUM": "patient_num",
	"SR_NUM": "sr_num",
	"SR_NO": "sr_num",
	"ACTION_REQUIRED": "action_required",
	"ACTION": "action_flag",
	"ACTION_FLAG": "action_flag",
	"DESCRIPTION": "description",
	"COST_CENTER": "cost_center",
	"BRANCH_NUM": "cost_center",
	"CR_ID": "cr_id",
	"CR_DATE": "cr_date",
	"UP_ID": "up_id",
	"UP_DATE": "up_date",
	"AUTO_CR_DATE": "auto_cr_date",
}


def _require_admin() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def _normalize_header(cell: Any) -> str:
	if cell is None:
		return ""
	text = str(cell).strip().upper().replace(" ", "_")
	return EXCEL_HEADER_MAP.get(text, text.lower())


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

	headers = [_normalize_header(h) for h in header_row]
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
		parsed.append(row)
	return parsed


def _action_from_nursing_task_row(task) -> str:
	activity = (getattr(task, "activity", None) or "").strip()
	if not activity:
		return (getattr(task, "description", None) or "").strip()
	if frappe.db.exists("Healthcare Activity", activity):
		return (
			frappe.db.get_value("Healthcare Activity", activity, "description") or activity
		)
	return activity


def _nursing_department_link() -> str | None:
	return _resolve_department(DEFAULT_NURSING_DEPARTMENT_LABEL)


def _template_nursing_seed_rows(template_name: str = DEFAULT_NURSING_TEMPLATE) -> list[dict]:
	if frappe.db.exists("Nursing Checklist Template", template_name):
		template = frappe.get_doc("Nursing Checklist Template", template_name)
		tasks = template.tasks or []
		if not tasks:
			frappe.throw(
				_("Nursing Checklist Template “{0}” has no tasks.").format(template_name)
			)
		return [
			{
				"action_required": _action_from_nursing_task_row(row),
				"department_name": DEFAULT_NURSING_DEPARTMENT_LABEL,
				"sr_num": str(idx),
			}
			for idx, row in enumerate(tasks, start=1)
		]

	if frappe.db.exists("Discharge Nursing Template", template_name):
		template = frappe.get_doc("Discharge Nursing Template", template_name)
		rows = template.discharge_checklist or []
		if not rows:
			frappe.throw(
				_("Discharge Nursing Template “{0}” has no checklist rows.").format(
					template_name
				)
			)
		return [
			{
				"action_required": row.action_required,
				"department_name": DEFAULT_NURSING_DEPARTMENT_LABEL,
				"sr_num": str(idx),
			}
			for idx, row in enumerate(rows, start=1)
		]

	frappe.throw(_("Nursing template “{0}” was not found.").format(template_name))


def apply_nursing_template_to_discharge(
	discharge_doc,
	template_name: str = DEFAULT_NURSING_TEMPLATE,
) -> int:
	"""Replace nursing_checklist (Discharge Checklist Details rows) from template."""
	template_rows = _template_nursing_seed_rows(template_name)
	dept_link = _nursing_department_link()

	discharge_doc.nurse_discharge_template = template_name
	discharge_doc.set("nursing_checklist", [])
	for trow in template_rows:
		discharge_doc.append(
			"nursing_checklist",
			{
				"action_required": trow["action_required"],
				"department_name": trow.get("department_name") or DEFAULT_NURSING_DEPARTMENT_LABEL,
				"department": dept_link,
				"sr_num": trow["sr_num"],
				"click": 0,
			},
		)
	return len(template_rows)


def _find_nursing_row(checklist, line: dict, by_sr: dict[int, Any]):
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


def _fill_nursing_row(child, line: dict) -> None:
	"""Map Oracle nursing Excel columns onto Discharge Checklist Details."""
	checklist_line = {
		"action_required": line.get("action_required"),
		"dept_name": DEFAULT_NURSING_DEPARTMENT_LABEL,
		"sr_num": line.get("sr_num"),
		"action_flag": line.get("action_flag"),
		"cr_id": line.get("cr_id"),
		"cr_date": line.get("cr_date"),
		"up_id": line.get("up_id"),
		"up_date": line.get("up_date"),
		"auto_cr_date": line.get("auto_cr_date"),
	}
	_fill_checklist_row(child, checklist_line)

	desc = line.get("description")
	if desc not in (None, ""):
		child.description = desc


def import_nursing_checklist_for_admission(
	admission_key: str,
	excel_lines: list[dict],
	template_name: str = DEFAULT_NURSING_TEMPLATE,
) -> dict:
	"""Apply Oracle nursing checklist lines to one Discharge."""
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

	branch = (excel_lines[0].get("cost_center") if excel_lines else "") or ""
	_maybe_update_admission_cost_center(admission_name, branch)

	doc = frappe.get_doc("Discharge", discharge_name)
	apply_nursing_template_to_discharge(doc, template_name)

	by_sr = _index_checklist_by_sr(doc.nursing_checklist)
	matched = 0
	for line in excel_lines:
		child = _find_nursing_row(doc.nursing_checklist, line, by_sr)
		if not child:
			continue
		_fill_nursing_row(child, line)
		matched += 1

	doc.flags.ignore_validate = True
	doc.flags.ignore_links = True
	doc.save(ignore_permissions=True)

	return {
		"status": "ok",
		"admission_key": admission_key,
		"admission": admission_name,
		"discharge": discharge_name,
		"lines": len(excel_lines),
		"matched": matched,
		"checklist_rows": len(doc.nursing_checklist),
	}


def parse_and_cache_excel(file_url: str) -> dict:
	rows = _parse_excel_rows(file_url)
	grouped, unresolved = _group_rows_by_admission(rows)
	admission_keys = sorted(grouped.keys())

	frappe.cache().set_value(CACHE_KEYS["file_url"], file_url, expires_in_sec=CACHE_TTL)
	frappe.cache().set_value(CACHE_KEYS["admissions"], admission_keys, expires_in_sec=CACHE_TTL)
	frappe.cache().set_value(
		CACHE_KEYS["grouped"],
		json.dumps(grouped, default=str),
		expires_in_sec=CACHE_TTL,
	)

	resolvable = sum(
		1
		for key in admission_keys
		if _resolve_inpatient_admission(
			key, (grouped[key][0].get("patient_num") if grouped[key] else "")
		)
	)
	return {
		"excel_rows": len(rows),
		"admissions": len(admission_keys),
		"unresolved_rows": len(unresolved),
		"resolvable_admissions": resolvable,
		"template": DEFAULT_NURSING_TEMPLATE,
	}


def _load_cached_grouped() -> dict[str, list[dict]]:
	raw = frappe.cache().get_value(CACHE_KEYS["grouped"])
	if not raw:
		return {}
	if isinstance(raw, dict):
		return raw
	return json.loads(raw)


@frappe.whitelist()
def preview_nursing_checklist_import(file_url: str) -> dict:
	_require_admin()
	return parse_and_cache_excel(file_url)


def run_nursing_checklist_import_batch(offset: int = 0) -> dict:
	admission_keys = frappe.cache().get_value(CACHE_KEYS["admissions"]) or []
	grouped = _load_cached_grouped()
	if not admission_keys or not grouped:
		return {"processed": offset, "done": True, "batch_count": 0}

	batch_keys = admission_keys[offset : offset + NURSING_CHECKLIST_IMPORT_BATCH_SIZE]
	if not batch_keys:
		return {"processed": offset, "done": True, "batch_count": 0}

	ok = skip_no_admission = skip_no_discharge = 0
	errors: list[str] = []

	for key in batch_keys:
		lines = grouped.get(key) or []
		try:
			result = import_nursing_checklist_for_admission(key, lines)
			status = result.get("status")
			if status == "ok":
				ok += 1
			elif status == "skip_no_admission":
				skip_no_admission += 1
			elif status == "skip_no_discharge":
				skip_no_discharge += 1
		except Exception:
			errors.append(f"{key}: {frappe.get_traceback()}")
			frappe.log_error(title=f"Nursing checklist import failed: {key}")

	frappe.db.commit()
	processed = offset + len(batch_keys)
	return {
		"processed": processed,
		"done": len(batch_keys) < NURSING_CHECKLIST_IMPORT_BATCH_SIZE,
		"batch_count": len(batch_keys),
		"ok": ok,
		"skip_no_admission": skip_no_admission,
		"skip_no_discharge": skip_no_discharge,
		"errors": len(errors),
	}
