"""Import Patient History Import staging rows into Patient History.

Flow:
1. Read all Patient History Import rows (staging only — not Inpatient Admission list).
2. Group rows by ``admission`` (one Patient History per distinct admission value).
3. For each group: get or create Patient History with Default History Form template,
   ``inpatient_admission``, and ``patient`` from the import rows.
4. Seed ``history_detail`` from the template (all attributes with ``attrib_num``).
5. For each import row in the group, find the child row with the same ``attrib_num``
   and copy ``description``, ``field_1``, ``attribute_note_2``, etc. from the import row.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint, strip_html

PATIENT_HISTORY_IMPORT_BATCH_SIZE = 200


def _skip_care_episode_guard(doc) -> None:
	doc.flags.skip_care_episode_guard = True


def _require_admin():
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def _default_template_name() -> str:
	return "Default History Form"


def _template_detail_rows(template_name: str) -> list[dict]:
	if not frappe.db.exists("Patient History Template", template_name):
		frappe.throw(_("Patient History Template “{0}” was not found.").format(template_name))
	template = frappe.get_doc("Patient History Template", template_name)
	return [
		{
			"attribute": row.attribute or "",
			"description": "",
			"is_mendatory": 1 if row.is_mendatory else 0,
			"order_no": cint(row.order_no),
			"attrib_num": cint(row.attrib_num),
			"field_1": "",
			"attrib_note_2": "",
		}
		for row in (template.history_detail or [])
	]


def _resolve_inpatient_admission(admission_value: str) -> str | None:
	"""Map Patient History Import.admission to an Inpatient Admission name."""
	value = (admission_value or "").strip()
	if not value:
		return None
	if frappe.db.exists("Inpatient Admission", value):
		return value
	for field in ("admission_no_old", "case_no"):
		name = frappe.db.get_value("Inpatient Admission", {field: value}, "name")
		if name:
			return name
	return None


def _patient_from_import_rows(import_rows: list[dict], admission: str) -> str | None:
	for row in import_rows:
		patient = (row.get("patient") or "").strip()
		if patient and frappe.db.exists("Patient", patient):
			return patient
	return frappe.db.get_value("Inpatient Admission", admission, "patient")


def _index_by_attrib_num(history_detail) -> dict[int, int]:
	idx: dict[int, int] = {}
	for i, child in enumerate(history_detail):
		num = cint(child.attrib_num)
		if num:
			idx[num] = i
	return idx


def _seed_history_detail_from_template(ph, template_rows: list[dict]) -> dict[int, int]:
	"""Ensure every template attribute exists on Patient History; return attrib_num → row index."""
	if not (ph.history_detail or []):
		for row in template_rows:
			ph.append("history_detail", dict(row))
		return _index_by_attrib_num(ph.history_detail)

	idx = _index_by_attrib_num(ph.history_detail)
	for row in template_rows:
		num = cint(row.get("attrib_num"))
		if not num or num in idx:
			continue
		ph.append("history_detail", dict(row))
		idx[num] = len(ph.history_detail) - 1
	return idx


def _text_value(value) -> str:
	if not value:
		return ""
	if isinstance(value, str):
		return strip_html(value).strip()
	return str(value).strip()


def _description_value(value) -> str:
	"""Patient History Detail.description is a Text Editor (HTML)."""
	if not value:
		return ""
	text = str(value).strip()
	if not text:
		return ""
	if "<" in text and ">" in text:
		return text
	return text.replace("\n", "<br>")


def _apply_import_row(ph, import_row: dict, idx: dict[int, int]) -> bool:
	"""Fill one history_detail line from one Patient History Import row (matched by attrib_num)."""
	num = cint(import_row.get("attrib_num"))
	if not num or num not in idx:
		return False

	child = ph.history_detail[idx[num]]
	description = _description_value(import_row.get("description"))
	field_1 = _text_value(import_row.get("field_1"))
	attrib_note_2 = _text_value(import_row.get("attribute_note_2"))
	attribute = _text_value(import_row.get("attribute"))

	if attribute:
		child.attribute = attribute
	if description:
		child.description = description
	if field_1:
		child.field_1 = field_1
	if attrib_note_2:
		child.attrib_note_2 = attrib_note_2

	return True


def _get_or_create_patient_history(
	inpatient_admission: str,
	template_name: str,
	template_rows: list[dict],
	patient: str | None,
) -> tuple[frappe.model.document.Document, dict[int, int], bool]:
	existing = frappe.get_all(
		"Patient History",
		filters={"inpatient_admission": inpatient_admission},
		fields=["name"],
		limit=1,
		order_by="creation asc",
	)
	if existing:
		ph = frappe.get_doc("Patient History", existing[0].name)
		_skip_care_episode_guard(ph)
		ph.template = template_name
		if patient:
			ph.patient = patient
		idx = _seed_history_detail_from_template(ph, template_rows)
		return ph, idx, False

	ph = frappe.new_doc("Patient History")
	_skip_care_episode_guard(ph)
	ph.inpatient_admission = inpatient_admission
	ph.template = template_name
	if patient:
		ph.patient = patient
	for row in template_rows:
		ph.append("history_detail", dict(row))
	idx = _index_by_attrib_num(ph.history_detail)
	return ph, idx, True


def _apply_header_from_import_rows(ph, import_rows: list[dict]) -> None:
	for row in import_rows:
		cost_center = (row.get("cost_center") or "").strip()
		if cost_center and frappe.db.exists("Cost Center", cost_center):
			ph.cost_center = cost_center
			return


def process_admission_import(
	import_admission: str,
	import_rows: list[dict],
	template_name: str,
	template_rows: list[dict],
) -> dict:
	"""One Patient History per import ``admission``; child lines filled by ``attrib_num``."""
	inpatient_admission = _resolve_inpatient_admission(import_admission)
	if not inpatient_admission:
		return {
			"patient_history": None,
			"created": False,
			"updated_lines": 0,
			"skipped_lines": len(import_rows),
			"unresolved_admission": True,
		}

	patient = _patient_from_import_rows(import_rows, inpatient_admission)
	ph, idx, created = _get_or_create_patient_history(
		inpatient_admission, template_name, template_rows, patient
	)

	updated_lines = 0
	skipped_lines = 0
	_apply_header_from_import_rows(ph, import_rows)

	for row in import_rows:
		if _apply_import_row(ph, row, idx):
			updated_lines += 1
		else:
			skipped_lines += 1

	_skip_care_episode_guard(ph)
	if created:
		ph.insert(ignore_permissions=True)
	else:
		ph.save(ignore_permissions=True)

	return {
		"patient_history": ph.name,
		"created": created,
		"updated_lines": updated_lines,
		"skipped_lines": skipped_lines,
	}


def _fetch_import_rows() -> list[dict]:
	return frappe.get_all(
		"Patient History Import",
		fields=[
			"name",
			"admission",
			"patient",
			"attrib_num",
			"attribute",
			"description",
			"field_1",
			"attribute_note_2",
			"cost_center",
		],
		order_by="admission asc, attrib_num asc, creation asc",
	)


def _group_rows_by_import_admission(
	rows: list[dict],
) -> tuple[dict[str, list[dict]], list[dict]]:
	by_admission: dict[str, list[dict]] = {}
	unresolved: list[dict] = []
	for row in rows:
		admission = (row.get("admission") or "").strip()
		if not admission:
			unresolved.append(row)
			continue
		by_admission.setdefault(admission, []).append(row)
	return by_admission, unresolved


def _group_rows_by_import_key(rows: list[dict]) -> tuple[dict[str, list[dict]], list[dict]]:
	return _group_rows_by_import_admission(rows)


def _group_rows_by_admission(rows: list[dict]) -> tuple[dict[str, list[dict]], list[dict]]:
	return _group_rows_by_import_admission(rows)


@frappe.whitelist()
def run_patient_history_import_preview() -> dict:
	_require_admin()
	rows = _fetch_import_rows()
	by_admission, unresolved = _group_rows_by_import_admission(rows)
	resolvable = sum(
		1 for adm in by_admission if _resolve_inpatient_admission(adm)
	)
	return {
		"import_rows": len(rows),
		"admissions": len(by_admission),
		"import_groups": len(by_admission),
		"resolvable_admissions": resolvable,
		"unresolved_rows": len(unresolved),
		"template": _default_template_name(),
	}


def run_patient_history_import_batch(
	offset: int = 0,
	template_name: str | None = None,
	admission_keys: list[str] | None = None,
	by_admission: dict[str, list[dict]] | None = None,
) -> dict:
	template_name = template_name or _default_template_name()
	template_rows = _template_detail_rows(template_name)

	if admission_keys is None or by_admission is None:
		rows = _fetch_import_rows()
		by_admission, _unresolved = _group_rows_by_import_admission(rows)
		admission_keys = sorted(by_admission.keys())

	batch_keys = admission_keys[offset : offset + PATIENT_HISTORY_IMPORT_BATCH_SIZE]
	if not batch_keys:
		return {"processed": offset, "done": True, "batch_count": 0}

	frappe.flags.healthcare_patient_history_import = True
	try:
		return _run_patient_history_import_batch(
			offset=offset,
			template_name=template_name,
			admission_keys=admission_keys,
			by_admission=by_admission,
			batch_keys=batch_keys,
			template_rows=template_rows,
		)
	finally:
		frappe.flags.healthcare_patient_history_import = False


def _run_patient_history_import_batch(
	offset: int,
	template_name: str,
	admission_keys: list[str],
	by_admission: dict[str, list[dict]],
	batch_keys: list[str],
	template_rows: list[dict],
) -> dict:
	stats = {
		"created": 0,
		"updated": 0,
		"skipped_lines": 0,
		"unresolved_groups": 0,
	}
	errors: list[str] = []

	for import_admission in batch_keys:
		import_rows = by_admission.get(import_admission) or []
		if not import_rows:
			continue
		try:
			result = process_admission_import(
				import_admission, import_rows, template_name, template_rows
			)
			if result.get("unresolved_admission"):
				stats["unresolved_groups"] += 1
				continue
			if result["created"]:
				stats["created"] += 1
			else:
				stats["updated"] += 1
			stats["skipped_lines"] += result.get("skipped_lines") or 0
		except Exception:
			errors.append(f"{import_admission}: {frappe.get_traceback()}")
			frappe.log_error(title=f"Patient History import failed: {import_admission}")

	frappe.db.commit()

	processed = offset + len(batch_keys)
	done = processed >= len(admission_keys)
	return {
		"processed": processed,
		"done": done,
		"batch_count": len(batch_keys),
		"total_admissions": len(admission_keys),
		"stats": stats,
		"errors_in_batch": len(errors),
	}
