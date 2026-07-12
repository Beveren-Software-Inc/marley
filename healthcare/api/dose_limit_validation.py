"""Validate medicine doses against Item max-dose fields."""

from __future__ import annotations

import re

import frappe
from frappe.utils import add_to_date, flt, get_datetime, getdate, nowdate, now_datetime


def _normalize_row_time(value=None) -> str:
	if value is None:
		return now_datetime().strftime("%H:%M:%S")
	raw = str(value).strip() if value else ""
	if not raw:
		return now_datetime().strftime("%H:%M:%S")
	if " " in raw:
		raw = raw.split(" ")[-1]
	if "." in raw:
		raw = raw.split(".")[0]
	parts = raw.split(":")
	if len(parts) >= 2:
		try:
			hour = int(parts[0])
			minute = int(parts[1])
			second = int(parts[2]) if len(parts) > 2 else 0
			return f"{hour:02d}:{minute:02d}:{second:02d}"
		except ValueError:
			pass
	return raw[:8]


def extract_dose_numeric(value) -> float | None:
	"""Return the numeric portion of a dose string (e.g. ``50mg`` -> 50)."""
	if value is None or value == "":
		return None
	if isinstance(value, (int, float)):
		return flt(value)
	text = str(value).strip()
	if not text:
		return None
	match = re.search(r"\d+(?:\.\d+)?", text.replace(",", ""))
	if match:
		return flt(match.group())
	try:
		parsed = flt(text)
		return parsed if parsed != 0 or text in ("0", "0.0") else None
	except Exception:
		return None


def is_frequency_style_dosage(value) -> bool:
	"""True for schedule-like dosages such as ``1-0-1`` / ``1-1-1`` (not a single dose amount)."""
	if value is None:
		return False
	text = str(value).strip()
	if not text:
		return False
	return bool(re.match(r"^\d+(\.\d+)?\s*-\s*\d+", text))


def is_numeric_dose_input(value) -> bool:
	"""True when the value looks like a single dose amount (e.g. ``45``, ``45mg``), not a frequency."""
	if value is None or str(value).strip() == "":
		return False
	if is_frequency_style_dosage(value):
		return False
	return extract_dose_numeric(value) is not None


def _parse_item_dose_limit_detail(raw) -> dict | None:
	"""Parse Item max-dose text into absolute or weight-based (``mg/kg``) form."""
	if raw is None:
		return None
	text = str(raw).strip()
	if not text:
		return None
	lower = text.lower()
	if lower in ("not applicable", "n/a", "na", "-", "none"):
		return None

	weight_match = re.search(
		r"(\d+(?:\.\d+)?)\s*(mg|mcg|ug|µg|g|ml|iu)?\s*/\s*kg\b",
		text,
		flags=re.IGNORECASE,
	)
	if weight_match:
		amount = flt(weight_match.group(1))
		if amount <= 0:
			return None
		return {
			"raw": text,
			"amount": amount,
			"unit": (weight_match.group(2) or "").lower() or None,
			"weight_based": True,
		}

	parsed = extract_dose_numeric(text)
	if parsed is None or parsed <= 0:
		return None
	return {
		"raw": text,
		"amount": parsed,
		"unit": None,
		"weight_based": False,
	}


def _parse_item_dose_limit(raw) -> float | None:
	"""Absolute numeric ceiling only. Weight-based limits return None until weight is applied."""
	detail = _parse_item_dose_limit_detail(raw)
	if not detail or detail.get("weight_based"):
		return None
	return detail.get("amount")


def _read_item_dose_limit_raw(item_code: str, fieldname: str):
	if not item_code or not frappe.db.has_column("Item", fieldname):
		return None
	return frappe.db.get_value("Item", item_code, fieldname)


def _read_item_dose_limit(item_code: str, fieldname: str) -> float | None:
	return _parse_item_dose_limit(_read_item_dose_limit_raw(item_code, fieldname))


def _read_item_dose_limit_detail(item_code: str, fieldname: str) -> dict | None:
	return _parse_item_dose_limit_detail(_read_item_dose_limit_raw(item_code, fieldname))


def get_patient_weight_kg(
	*,
	patient: str | None = None,
	patient_encounter: str | None = None,
	inpatient_record: str | None = None,
	patient_weight=None,
	admission: str | None = None,
) -> float | None:
	"""Resolve patient weight (kg) from explicit value, visit, admission, or latest vitals."""
	if patient_weight is not None and str(patient_weight).strip() != "":
		w = flt(patient_weight)
		if w > 0:
			return w

	visit = (patient_encounter or "").strip()
	if visit and frappe.db.exists("Patient Visit", visit):
		if frappe.db.has_column("Patient Visit", "patient_weight"):
			w = flt(frappe.db.get_value("Patient Visit", visit, "patient_weight"))
			if w > 0:
				return w
		if not patient:
			patient = frappe.db.get_value("Patient Visit", visit, "patient")

	admission_name = (inpatient_record or admission or "").strip()
	if admission_name and frappe.db.exists("Inpatient Admission", admission_name):
		if frappe.db.has_column("Inpatient Admission", "weight"):
			w = flt(frappe.db.get_value("Inpatient Admission", admission_name, "weight"))
			if w > 0:
				return w
		if not patient:
			patient = frappe.db.get_value("Inpatient Admission", admission_name, "patient")

	patient_name = (patient or "").strip()
	if patient_name and frappe.db.exists("DocType", "Vital Signs"):
		rows = frappe.get_all(
			"Vital Signs",
			filters={"patient": patient_name},
			fields=["weight"],
			order_by="modified desc",
			limit=1,
			ignore_permissions=True,
		)
		if rows and flt(rows[0].get("weight")) > 0:
			return flt(rows[0].get("weight"))

	return None


def resolve_dose_ceiling(detail: dict | None, patient_weight: float | None = None) -> dict:
	"""Compute an absolute ceiling from a parsed limit detail + optional weight."""
	result = {
		"ceiling": None,
		"weight_based": False,
		"requires_weight": False,
		"rate_per_kg": None,
		"patient_weight": patient_weight,
		"raw": None,
	}
	if not detail:
		return result

	result["raw"] = detail.get("raw")
	if detail.get("weight_based"):
		result["weight_based"] = True
		result["rate_per_kg"] = detail.get("amount")
		if patient_weight and patient_weight > 0:
			result["ceiling"] = flt(detail.get("amount")) * flt(patient_weight)
		else:
			result["requires_weight"] = True
		return result

	result["ceiling"] = detail.get("amount")
	return result


def get_item_max_dose_per_single_dose(
	item_code: str, patient_weight: float | None = None
) -> float | None:
	"""Max allowed per single administration (absolute). Weight-based needs patient_weight."""
	for fieldname in ("custom_max_dose_per_single_dose", "custom_maximum_dose_limit"):
		detail = _read_item_dose_limit_detail(item_code, fieldname)
		if not detail:
			continue
		resolved = resolve_dose_ceiling(detail, patient_weight)
		if resolved.get("ceiling") is not None:
			return resolved["ceiling"]
		if resolved.get("requires_weight"):
			return None
	return None


def get_item_max_dose_per_day(item_code: str, patient_weight: float | None = None) -> float | None:
	"""Max allowed cumulative dose in rolling 24 hours."""
	for fieldname in ("custom_max_dose_per_day", "custom_maximum_dose_limit"):
		detail = _read_item_dose_limit_detail(item_code, fieldname)
		if not detail:
			continue
		resolved = resolve_dose_ceiling(detail, patient_weight)
		if resolved.get("ceiling") is not None:
			return resolved["ceiling"]
		if resolved.get("requires_weight"):
			return None
	return None


def get_item_maximum_dose_limit(item_code: str, patient_weight: float | None = None) -> float | None:
	"""Backward-compatible alias for single-dose ceiling."""
	return get_item_max_dose_per_single_dose(item_code, patient_weight)


def _resolve_single_and_daily_ceilings(medicine_code: str, patient_weight: float | None) -> dict:
	single_detail = _read_item_dose_limit_detail(
		medicine_code, "custom_max_dose_per_single_dose"
	) or _read_item_dose_limit_detail(medicine_code, "custom_maximum_dose_limit")
	daily_detail = _read_item_dose_limit_detail(
		medicine_code, "custom_max_dose_per_day"
	) or _read_item_dose_limit_detail(medicine_code, "custom_maximum_dose_limit")

	single = resolve_dose_ceiling(single_detail, patient_weight)
	daily = resolve_dose_ceiling(daily_detail, patient_weight)
	return {
		"single": single,
		"daily": daily,
		"has_limit_config": bool(single_detail or daily_detail),
		"requires_weight": bool(single.get("requires_weight") or daily.get("requires_weight")),
	}


def medicine_given_datetime(date_value, time_value=None):
	date_part = getdate(date_value) if date_value else getdate(nowdate())
	time_part = _normalize_row_time(time_value)
	return get_datetime(f"{date_part} {time_part}")


def get_cumulative_dose_24h(
	*,
	admission_detail_name: str,
	medicine_code: str,
	record_datetime,
	exclude_row_name: str | None = None,
) -> float:
	"""Sum numeric dose qty for the same drug in the rolling 24 hours ending at record_datetime."""
	if not admission_detail_name or not medicine_code or not record_datetime:
		return 0.0

	window_start = add_to_date(record_datetime, hours=-24)
	fields = ["name", "date", "time", "qty"]
	if frappe.db.has_column("Medicine Given", "dose"):
		fields.insert(3, "dose")
	rows = frappe.get_all(
		"Medicine Given",
		filters={
			"parent": admission_detail_name,
			"parenttype": "Admission Detail",
			"medicine_code": medicine_code,
		},
		fields=fields,
		ignore_permissions=True,
	)

	total = 0.0
	for row in rows:
		if exclude_row_name and row.name == exclude_row_name:
			continue
		row_dt = medicine_given_datetime(row.date, row.time)
		if row_dt < window_start or row_dt > record_datetime:
			continue
		dose_value = row.dose if (getattr(row, "dose", None) or "").strip() else row.qty
		total += extract_dose_numeric(dose_value) or 0.0
	return total


def evaluate_dose_against_item_limits(
	*,
	medicine_code: str,
	dose,
	patient_weight: float | None = None,
	skip_if_frequency_style: bool = False,
) -> dict:
	"""Check entered dose against Item single/daily ceilings (no 24h cumulative history)."""
	ceilings = _resolve_single_and_daily_ceilings(medicine_code, patient_weight)
	single = ceilings["single"]
	daily = ceilings["daily"]
	single_ceiling = single.get("ceiling")
	daily_ceiling = daily.get("ceiling")

	frequency_style = is_frequency_style_dosage(dose)
	entered_dose = None if (skip_if_frequency_style and frequency_style) else extract_dose_numeric(dose)

	result = {
		"ok": True,
		"has_limit": bool(ceilings["has_limit_config"]),
		"weight_based": bool(single.get("weight_based") or daily.get("weight_based")),
		"requires_weight": bool(ceilings["requires_weight"]),
		"patient_weight": patient_weight,
		"rate_per_kg": single.get("rate_per_kg") or daily.get("rate_per_kg"),
		"limit_raw": single.get("raw") or daily.get("raw"),
		"single_dose_ceiling": single_ceiling,
		"daily_dose_ceiling": daily_ceiling,
		"ceiling": single_ceiling,
		"maximum_dose_limit": single_ceiling,
		"max_dose_per_single_dose": single_ceiling,
		"max_dose_per_day": daily_ceiling,
		"entered_dose": entered_dose,
		"frequency_style_dosage": frequency_style,
		"exceeds_single_dose": False,
		"exceeds_cumulative_24h": False,
		"prior_24h_dose": 0.0,
		"cumulative_24h_with_new_dose": entered_dose or 0.0,
		"medicine_code": medicine_code,
	}

	if not result["has_limit"]:
		return result

	if result["requires_weight"]:
		# Only block when a numeric single dose was entered; frequency strings can't be checked yet.
		if entered_dose is not None:
			result["ok"] = False
		return result

	if entered_dose is None:
		return result

	if single_ceiling is not None:
		result["exceeds_single_dose"] = entered_dose > single_ceiling
	if daily_ceiling is not None:
		result["exceeds_cumulative_24h"] = entered_dose > daily_ceiling
		result["cumulative_24h_with_new_dose"] = entered_dose
	result["ok"] = not (result["exceeds_single_dose"] or result["exceeds_cumulative_24h"])
	return result


def evaluate_medicine_given_dose(
	*,
	admission_detail_name: str,
	medicine_code: str,
	dose,
	date_value=None,
	time_value=None,
	exclude_row_name: str | None = None,
	patient_weight: float | None = None,
	patient: str | None = None,
	admission: str | None = None,
) -> dict:
	"""Check single-dose ceiling and rolling 24-hour cumulative dose."""
	if patient_weight is None:
		if not admission and admission_detail_name:
			admission = frappe.db.get_value("Admission Detail", admission_detail_name, "admission")
		patient_weight = get_patient_weight_kg(
			patient=patient,
			inpatient_record=admission,
			admission=admission,
			patient_weight=patient_weight,
		)

	result = evaluate_dose_against_item_limits(
		medicine_code=medicine_code,
		dose=dose,
		patient_weight=patient_weight,
		skip_if_frequency_style=False,
	)

	if result.get("requires_weight") or not result.get("has_limit") or result.get("entered_dose") is None:
		return result

	entered_dose = result["entered_dose"]
	single_ceiling = result.get("single_dose_ceiling")
	daily_ceiling = result.get("daily_dose_ceiling")

	record_datetime = medicine_given_datetime(date_value, time_value)
	prior_24h = get_cumulative_dose_24h(
		admission_detail_name=admission_detail_name,
		medicine_code=medicine_code,
		record_datetime=record_datetime,
		exclude_row_name=exclude_row_name,
	)
	cumulative_with_new = prior_24h + entered_dose

	result["prior_24h_dose"] = prior_24h
	result["cumulative_24h_with_new_dose"] = cumulative_with_new
	result["exceeds_single_dose"] = (
		single_ceiling is not None and entered_dose > single_ceiling
	)
	result["exceeds_cumulative_24h"] = (
		daily_ceiling is not None and cumulative_with_new > daily_ceiling
	)
	result["ok"] = not (result["exceeds_single_dose"] or result["exceeds_cumulative_24h"])
	return result


def dose_limit_validation_message(evaluation: dict) -> str:
	if evaluation.get("ok"):
		return ""

	lines: list[str] = []
	if evaluation.get("requires_weight"):
		raw = evaluation.get("limit_raw") or "mg/kg"
		rate = evaluation.get("rate_per_kg")
		rate_bit = f" ({rate} mg/kg)" if rate else f" ({raw})"
		lines.append(
			frappe._(
				"This medicine has a weight-based maximum dose{0}. "
				"Check patient weight (kg) to validate the dose."
			).format(rate_bit)
		)
		return "\n".join(lines)

	entered = evaluation.get("entered_dose")
	single_ceiling = evaluation.get("single_dose_ceiling")
	daily_ceiling = evaluation.get("daily_dose_ceiling")
	if evaluation.get("exceeds_single_dose"):
		extra = ""
		if evaluation.get("weight_based") and evaluation.get("patient_weight"):
			extra = frappe._(" (based on patient weight {0} kg)").format(
				evaluation.get("patient_weight")
			)
		lines.append(
			frappe._(
				"Entered dose ({0}) exceeds the maximum single dose ({1}) for this medicine{2}."
			).format(entered, single_ceiling, extra)
		)
	if evaluation.get("exceeds_cumulative_24h"):
		lines.append(
			frappe._(
				"24-hour cumulative dose ({0}) would exceed the maximum daily dose ({1}). "
				"Doses already given in the last 24 hours: {2}."
			).format(
				evaluation.get("cumulative_24h_with_new_dose"),
				daily_ceiling,
				evaluation.get("prior_24h_dose"),
			)
		)
	return "\n".join(lines)


def apply_dose_limit_override_audit(row, evaluation: dict, override_reason: str) -> None:
	if frappe.db.has_column("Medicine Given", "override_exceeded_dose_limit"):
		row.override_exceeded_dose_limit = 1 if evaluation.get("exceeds_single_dose") else 0
	if frappe.db.has_column("Medicine Given", "override_exceeded_cumulative_24h"):
		row.override_exceeded_cumulative_24h = 1 if evaluation.get("exceeds_cumulative_24h") else 0
	if hasattr(row, "override_reason"):
		row.override_reason = override_reason
	if hasattr(row, "override_user"):
		row.override_user = frappe.session.user
	if hasattr(row, "override_timestamp"):
		from frappe.utils import now_datetime

		row.override_timestamp = now_datetime()


def validate_medicine_given_dose_or_throw(
	*,
	admission_detail_name: str,
	medicine_code: str,
	dose,
	date_value=None,
	time_value=None,
	allow_override: int | bool = 0,
	override_reason: str | None = None,
	exclude_row_name: str | None = None,
	patient_weight=None,
	patient: str | None = None,
	admission: str | None = None,
) -> dict:
	evaluation = evaluate_medicine_given_dose(
		admission_detail_name=admission_detail_name,
		medicine_code=medicine_code,
		dose=dose,
		date_value=date_value,
		time_value=time_value,
		exclude_row_name=exclude_row_name,
		patient_weight=flt(patient_weight) if patient_weight not in (None, "") else None,
		patient=patient,
		admission=admission,
	)
	if evaluation.get("ok") or not evaluation.get("has_limit"):
		return evaluation

	# Weight-based limit with no weight: soft block (same as exceed — needs attention / override)
	if not allow_override:
		frappe.throw(
			dose_limit_validation_message(evaluation),
			title=frappe._("Maximum dose limit exceeded")
			if not evaluation.get("requires_weight")
			else frappe._("Patient weight required"),
		)
	if not (override_reason or "").strip():
		frappe.throw(
			frappe._("Override reason is required to exceed the maximum dose limit."),
			title=frappe._("Override reason required"),
		)
	evaluation["override_required"] = True
	return evaluation


@frappe.whitelist()
def preview_prescription_dose_validation(
	medicine_code: str,
	dose,
	patient: str | None = None,
	patient_encounter: str | None = None,
	inpatient_record: str | None = None,
	patient_weight=None,
) -> dict:
	"""Preview max-dose checks while creating/editing a prescription dosage."""
	if not medicine_code:
		frappe.throw(frappe._("Medicine code is required"))
	if dose is None or str(dose).strip() == "":
		return {
			"ok": True,
			"has_limit": False,
			"message": "",
		}

	weight = get_patient_weight_kg(
		patient=patient,
		patient_encounter=patient_encounter,
		inpatient_record=inpatient_record,
		patient_weight=patient_weight,
	)
	evaluation = evaluate_dose_against_item_limits(
		medicine_code=medicine_code,
		dose=dose,
		patient_weight=weight,
		skip_if_frequency_style=True,
	)
	return {
		**evaluation,
		"parsed_dose": evaluation.get("entered_dose"),
		"message": dose_limit_validation_message(evaluation),
	}
