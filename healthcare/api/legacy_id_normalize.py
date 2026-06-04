"""Normalize Oracle legacy IDs with thousand-separator commas (e.g. 1,415 → 1415).

Inpatient Admission uses ``case_no`` as the canonical ID (``autoname: field:case_no``).
Document ``name`` should match ``case_no``; this module keeps them in sync.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.rename_doc import rename_doc

LEGACY_ID_BATCH_SIZE = 50
CACHE_ADMISSIONS = "healthcare:data_migration:comma_admission_ids:names"
CACHE_DISCHARGES = "healthcare:data_migration:comma_discharge_ids:names"
CACHE_TTL = 7200


def _require_admin() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def normalize_legacy_id(value) -> str | None:
	"""
	Strip thousand-separator commas from numeric legacy IDs.
	Returns normalized string, or None if no comma normalization applies.
	"""
	if value is None or value == "":
		return None
	text = str(value).strip()
	if "," not in text:
		return None
	candidate = text.replace(",", "").strip()
	if candidate.endswith(".0") and candidate[:-2].isdigit():
		candidate = candidate[:-2]
	if candidate.isdigit():
		return candidate
	return None


def _has_comma(value) -> bool:
	return value is not None and "," in str(value)


def _admission_target_id(name: str, case_no: str | None, admission_no_old: str | None) -> str | None:
	"""Target plain ID — ``case_no`` is canonical (checked first)."""
	for raw in (case_no, name, admission_no_old):
		normalized = normalize_legacy_id(raw)
		if normalized:
			return normalized
	return None


def _admission_needs_fix(
	name: str, case_no: str | None, admission_no_old: str | None, target: str
) -> bool:
	case_no = (case_no or "").strip()
	return (
		name != target
		or case_no != target
		or _has_comma(case_no)
		or _has_comma(name)
		or bool(normalize_legacy_id(admission_no_old))
	)


def _discharge_target_id(name: str, admission: str | None) -> str | None:
	"""Target plain ID — ``admission`` link is canonical (matches Inpatient Admission case_no)."""
	for raw in (admission, name):
		normalized = normalize_legacy_id(raw)
		if normalized:
			return normalized
	return None


def _discharge_needs_fix(name: str, admission: str | None, target: str) -> bool:
	admission = (admission or "").strip()
	return (
		name != target
		or admission != target
		or _has_comma(admission)
		or _has_comma(name)
	)


def _resolve_inpatient_admission_name(target: str) -> str | None:
	"""Resolve plain case_no to Inpatient Admission document name."""
	if frappe.db.exists("Inpatient Admission", target):
		return target
	return frappe.db.get_value("Inpatient Admission", {"case_no": target}, "name")


def _comma_inpatient_admission_names() -> list[str]:
	rows = frappe.db.sql(
		"""
		SELECT name, case_no, admission_no_old
		FROM `tabInpatient Admission`
		WHERE IFNULL(case_no, '') LIKE %s
		   OR name LIKE %s
		   OR IFNULL(admission_no_old, '') LIKE %s
		ORDER BY case_no, name
		""",
		("%,%", "%,%", "%,%"),
		as_dict=True,
	)
	seen: set[str] = set()
	out: list[str] = []
	for row in rows:
		name = row.name
		if name in seen:
			continue
		target = _admission_target_id(name, row.case_no, row.admission_no_old)
		if target and _admission_needs_fix(name, row.case_no, row.admission_no_old, target):
			seen.add(name)
			out.append(name)

	for row in frappe.db.sql(
		"""
		SELECT DISTINCT admission AS admission
		FROM `tabDischarge`
		WHERE name LIKE %s OR IFNULL(admission, '') LIKE %s
		""",
		("%,%", "%,%"),
		as_dict=True,
	):
		adm = (row.admission or "").strip()
		if not adm or adm in seen:
			continue
		admission_name = None
		if frappe.db.exists("Inpatient Admission", adm):
			admission_name = adm
		else:
			plain = normalize_legacy_id(adm)
			if plain and frappe.db.exists("Inpatient Admission", plain):
				admission_name = plain
			elif plain:
				admission_name = frappe.db.get_value(
					"Inpatient Admission", {"case_no": plain}, "name"
				)
		if admission_name and admission_name not in seen:
			meta = frappe.db.get_value(
				"Inpatient Admission",
				admission_name,
				["case_no", "admission_no_old"],
				as_dict=True,
			)
			if meta:
				target = _admission_target_id(
					admission_name, meta.case_no, meta.admission_no_old
				)
				if target and _admission_needs_fix(
					admission_name, meta.case_no, meta.admission_no_old, target
				):
					seen.add(admission_name)
					out.append(admission_name)

	return out


def _comma_discharge_names() -> list[str]:
	rows = frappe.db.sql(
		"""
		SELECT name, admission, docstatus
		FROM `tabDischarge`
		WHERE IFNULL(admission, '') LIKE %s
		   OR name LIKE %s
		ORDER BY admission, name
		""",
		("%,%", "%,%"),
		as_dict=True,
	)
	seen: set[str] = set()
	out: list[str] = []
	for row in rows:
		name = row.name
		if name in seen:
			continue
		target = _discharge_target_id(name, row.admission)
		if target and _discharge_needs_fix(name, row.admission, target):
			seen.add(name)
			out.append(name)
	return out


def _delete_duplicate_discharges_for_target(target: str, keep_name: str) -> list[str]:
	"""Remove other discharges already using plain ``target`` as name or admission link."""
	removed: list[str] = []
	dupes = frappe.db.sql(
		"""
		SELECT name
		FROM `tabDischarge`
		WHERE name = %(target)s
		   OR IFNULL(admission, '') = %(target)s
		""",
		{"target": target},
		as_dict=True,
	)
	for row in dupes:
		if row.name != keep_name:
			_force_delete_discharge(row.name)
			removed.append(row.name)
	return removed


def _sync_discharge_admission(name: str, target: str) -> None:
	"""Always align ``admission`` (canonical ID) with plain Inpatient Admission case_no."""
	admission = frappe.db.get_value("Discharge", name, "admission")
	if (admission or "").strip() != target:
		frappe.db.set_value("Discharge", name, "admission", target, update_modified=False)


def _force_delete_discharge(name: str) -> None:
	if not name or not frappe.db.exists("Discharge", name):
		return
	doc = frappe.get_doc("Discharge", name)
	if doc.docstatus == 1:
		doc.flags.ignore_permissions = True
		doc.cancel()
	frappe.delete_doc("Discharge", name, force=True, ignore_permissions=True)


def _delete_discharge_for_admission(admission_name: str) -> bool:
	discharge_name = frappe.db.get_value("Discharge", {"admission": admission_name}, "name")
	if not discharge_name:
		return False
	_force_delete_discharge(discharge_name)
	return True


def _delete_inpatient_admission(name: str) -> None:
	_delete_discharge_for_admission(name)
	frappe.delete_doc("Inpatient Admission", name, force=True, ignore_permissions=True)


def _delete_duplicate_admissions_for_target(target: str, keep_name: str) -> list[str]:
	"""Remove other admissions already using plain ``target`` as name or case_no."""
	removed: list[str] = []
	dupes = frappe.db.sql(
		"""
		SELECT name
		FROM `tabInpatient Admission`
		WHERE name = %(target)s
		   OR IFNULL(case_no, '') = %(target)s
		""",
		{"target": target},
		as_dict=True,
	)
	for row in dupes:
		if row.name != keep_name:
			_delete_inpatient_admission(row.name)
			removed.append(row.name)
	return removed


def _sync_admission_fields(name: str, target: str, admission_no_old: str | None) -> None:
	"""Always align ``case_no`` (canonical ID) with the plain target."""
	updates: dict = {}
	case_no = frappe.db.get_value("Inpatient Admission", name, "case_no")
	if (case_no or "").strip() != target:
		updates["case_no"] = target
	normalized_old = normalize_legacy_id(admission_no_old)
	if normalized_old and normalized_old != admission_no_old:
		updates["admission_no_old"] = normalized_old
	elif admission_no_old and "," in str(admission_no_old):
		updates["admission_no_old"] = target
	if updates:
		frappe.db.set_value("Inpatient Admission", name, updates, update_modified=False)


def _discharge_names_for_admission(admission_name: str, target: str) -> list[str]:
	keys = {admission_name, target}
	for value in (admission_name, target):
		if normalized := normalize_legacy_id(value):
			keys.add(normalized)
	names: set[str] = set()
	for key in keys:
		if not key:
			continue
		for field in ("admission", "name"):
			for row in frappe.get_all("Discharge", filters={field: key}, pluck="name"):
				names.add(row)
	return sorted(names)


def _repair_linked_discharges(admission_name: str, target: str) -> list[dict]:
	results = []
	for discharge_name in _discharge_names_for_admission(admission_name, target):
		try:
			results.append(normalize_one_discharge(discharge_name))
		except Exception:
			frappe.log_error(
				title=f"Comma ID repair discharge failed: {discharge_name}",
				message=frappe.get_traceback(),
			)
			results.append({"status": "error", "old_name": discharge_name})
	return results


def normalize_one_inpatient_admission(old_name: str) -> dict:
	meta = frappe.db.get_value(
		"Inpatient Admission",
		old_name,
		["case_no", "admission_no_old", "status"],
		as_dict=True,
	)
	if not meta:
		return {"status": "missing", "old_name": old_name}

	case_no = (meta.case_no or "").strip()
	target = _admission_target_id(old_name, meta.case_no, meta.admission_no_old)
	if not target:
		return {"status": "skip_no_target", "old_name": old_name, "case_no": case_no}

	if not _admission_needs_fix(old_name, meta.case_no, meta.admission_no_old, target):
		return {
			"status": "skip_no_change",
			"old_name": old_name,
			"case_no": case_no,
			"target": target,
		}

	removed_dupes = _delete_duplicate_admissions_for_target(target, keep_name=old_name)

	discharge_old = frappe.db.get_value("Discharge", {"admission": old_name}, "name")
	if discharge_old and frappe.db.exists("Discharge", target) and target != discharge_old:
		_force_delete_discharge(target)

	# Document name must match case_no (autoname). Rename when name differs from plain target.
	name_renamed = False
	if old_name != target:
		rename_doc("Inpatient Admission", old_name, target, force=True, ignore_permissions=True)
		name_renamed = True
		working_name = target
	else:
		working_name = old_name

	_sync_admission_fields(working_name, target, meta.admission_no_old)

	discharge_results = []
	if discharge_old and frappe.db.exists("Discharge", discharge_old):
		if discharge_old != target:
			rename_doc("Discharge", discharge_old, target, force=True, ignore_permissions=True)
		frappe.db.set_value("Discharge", target, "admission", target, update_modified=False)
		discharge_results.append({"status": "ok", "old_name": discharge_old, "target": target})
	else:
		discharge_results = _repair_linked_discharges(working_name, target)

	status = "ok" if name_renamed else "case_no_fixed"
	return {
		"status": status,
		"old_name": old_name,
		"target": target,
		"case_no_before": case_no,
		"case_no_after": target,
		"name_renamed": name_renamed,
		"removed_duplicates": removed_dupes,
		"had_discharge": bool(discharge_old),
		"discharges": discharge_results,
	}


def normalize_one_discharge(old_name: str) -> dict:
	meta = frappe.db.get_value(
		"Discharge",
		old_name,
		["admission", "docstatus"],
		as_dict=True,
	)
	if not meta:
		return {"status": "missing", "old_name": old_name}

	admission = (meta.admission or "").strip()
	target = _discharge_target_id(old_name, meta.admission)
	if not target:
		return {"status": "skip_no_target", "old_name": old_name, "admission": admission}

	if not _discharge_needs_fix(old_name, meta.admission, target):
		return {
			"status": "skip_no_change",
			"old_name": old_name,
			"admission": admission,
			"target": target,
		}

	ip_admission = _resolve_inpatient_admission_name(target)
	if not ip_admission:
		return {
			"status": "skip_no_inpatient",
			"old_name": old_name,
			"admission": admission,
			"target": target,
		}

	removed_dupes = _delete_duplicate_discharges_for_target(target, keep_name=old_name)

	name_renamed = False
	if old_name != target:
		rename_doc("Discharge", old_name, target, force=True, ignore_permissions=True)
		name_renamed = True
		working_name = target
	else:
		working_name = old_name

	_sync_discharge_admission(working_name, target)

	status = "ok" if name_renamed else "admission_fixed"
	return {
		"status": status,
		"old_name": old_name,
		"target": target,
		"admission_before": admission,
		"admission_after": target,
		"name_renamed": name_renamed,
		"removed_duplicates": removed_dupes,
		"inpatient_admission": ip_admission,
	}


def _run_comma_admission_batch(batch: list[str]) -> dict:
	ok = case_no_fixed = skip = errors = 0
	for old_name in batch:
		try:
			result = normalize_one_inpatient_admission(old_name)
			status = result.get("status")
			if status == "ok":
				ok += 1
			elif status == "case_no_fixed":
				case_no_fixed += 1
			elif status in ("skip_no_change", "skip_no_target", "missing"):
				skip += 1
			else:
				skip += 1
		except Exception:
			errors += 1
			frappe.log_error(
				title=f"Comma ID normalize admission failed: {old_name}",
				message=frappe.get_traceback(),
			)

	frappe.db.commit()
	return {
		"batch_count": len(batch),
		"ok": ok,
		"case_no_fixed": case_no_fixed,
		"skip": skip,
		"errors": errors,
	}


def run_comma_admission_batch_next() -> dict:
	"""Process the next batch by re-querying DB (fixed rows drop out automatically)."""
	pending = _comma_inpatient_admission_names()
	batch = pending[:LEGACY_ID_BATCH_SIZE]
	if not batch:
		return {
			"done": True,
			"batch_count": 0,
			"remaining": 0,
			"ok": 0,
			"case_no_fixed": 0,
			"skip": 0,
			"errors": 0,
		}

	result = _run_comma_admission_batch(batch)
	remaining = max(0, len(pending) - len(batch))
	result.update(
		{
			"done": remaining == 0,
			"remaining": remaining,
		}
	)
	return result


def _run_comma_discharge_batch(batch: list[str]) -> dict:
	ok = admission_fixed = skip = errors = 0
	for old_name in batch:
		try:
			result = normalize_one_discharge(old_name)
			status = result.get("status")
			if status == "ok":
				ok += 1
			elif status == "admission_fixed":
				admission_fixed += 1
			elif status in ("skip_no_change", "skip_no_target", "skip_no_inpatient", "missing"):
				skip += 1
			else:
				skip += 1
		except Exception:
			errors += 1
			frappe.log_error(
				title=f"Comma ID normalize discharge failed: {old_name}",
				message=frappe.get_traceback(),
			)

	frappe.db.commit()
	return {
		"batch_count": len(batch),
		"ok": ok,
		"admission_fixed": admission_fixed,
		"skip": skip,
		"errors": errors,
	}


def run_comma_discharge_batch_next() -> dict:
	"""Process the next batch by re-querying DB (fixed rows drop out automatically)."""
	pending = _comma_discharge_names()
	batch = pending[:LEGACY_ID_BATCH_SIZE]
	if not batch:
		return {
			"done": True,
			"batch_count": 0,
			"remaining": 0,
			"ok": 0,
			"admission_fixed": 0,
			"skip": 0,
			"errors": 0,
		}

	result = _run_comma_discharge_batch(batch)
	remaining = max(0, len(pending) - len(batch))
	result.update(
		{
			"done": remaining == 0,
			"remaining": remaining,
		}
	)
	return result


@frappe.whitelist()
def preview_comma_admission_ids() -> dict:
	_require_admin()
	names = _comma_inpatient_admission_names()
	sample = []
	for name in names[:10]:
		row = frappe.db.get_value(
			"Inpatient Admission",
			name,
			["case_no", "admission_no_old", "status"],
			as_dict=True,
		)
		target = _admission_target_id(
			name, row.case_no if row else None, row.admission_no_old if row else None
		)
		sample.append(
			{
				"name": name,
				"case_no": row.case_no if row else None,
				"target_case_no": target,
				"status": row.status if row else None,
			}
		)
	return {"count": len(names), "sample": sample}


@frappe.whitelist()
def preview_comma_discharge_ids() -> dict:
	_require_admin()
	names = _comma_discharge_names()
	sample = []
	for name in names[:10]:
		row = frappe.db.get_value(
			"Discharge",
			name,
			["admission", "docstatus"],
			as_dict=True,
		)
		target = _discharge_target_id(name, row.admission if row else None)
		sample.append(
			{
				"name": name,
				"admission": row.admission if row else None,
				"target_admission": target,
				"docstatus": row.docstatus if row else None,
			}
		)
	return {"count": len(names), "sample": sample}
