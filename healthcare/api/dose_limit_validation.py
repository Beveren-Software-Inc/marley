"""Validate medicine doses against Item.custom_maximum_dose_limit."""

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


def get_item_maximum_dose_limit(item_code: str) -> float | None:
	if not item_code:
		return None
	if not frappe.db.has_column("Item", "custom_maximum_dose_limit"):
		return None
	raw = frappe.db.get_value("Item", item_code, "custom_maximum_dose_limit")
	if raw is None or str(raw).strip() == "":
		return None
	return extract_dose_numeric(raw)


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


def evaluate_medicine_given_dose(
	*,
	admission_detail_name: str,
	medicine_code: str,
	dose,
	date_value=None,
	time_value=None,
	exclude_row_name: str | None = None,
) -> dict:
	"""Check single-dose ceiling and rolling 24-hour cumulative dose."""
	ceiling = get_item_maximum_dose_limit(medicine_code)
	entered_dose = extract_dose_numeric(dose)
	result = {
		"ok": True,
		"has_limit": ceiling is not None and ceiling > 0,
		"ceiling": ceiling,
		"entered_dose": entered_dose,
		"exceeds_single_dose": False,
		"exceeds_cumulative_24h": False,
		"prior_24h_dose": 0.0,
		"cumulative_24h_with_new_dose": entered_dose or 0.0,
		"medicine_code": medicine_code,
	}

	if not result["has_limit"] or entered_dose is None:
		return result

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
	result["exceeds_single_dose"] = entered_dose > ceiling
	result["exceeds_cumulative_24h"] = cumulative_with_new > ceiling
	result["ok"] = not (result["exceeds_single_dose"] or result["exceeds_cumulative_24h"])
	return result


def dose_limit_validation_message(evaluation: dict) -> str:
	if evaluation.get("ok"):
		return ""

	ceiling = evaluation.get("ceiling")
	entered = evaluation.get("entered_dose")
	lines: list[str] = []
	if evaluation.get("exceeds_single_dose"):
		lines.append(
			frappe._(
				"Entered dose ({0}) exceeds the maximum dose limit ({1}) for this medicine."
			).format(entered, ceiling)
		)
	if evaluation.get("exceeds_cumulative_24h"):
		lines.append(
			frappe._(
				"24-hour cumulative dose ({0}) would exceed the maximum dose limit ({1}). "
				"Doses already given in the last 24 hours: {2}."
			).format(
				evaluation.get("cumulative_24h_with_new_dose"),
				ceiling,
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
) -> dict:
	evaluation = evaluate_medicine_given_dose(
		admission_detail_name=admission_detail_name,
		medicine_code=medicine_code,
		dose=dose,
		date_value=date_value,
		time_value=time_value,
		exclude_row_name=exclude_row_name,
	)
	if evaluation.get("ok") or not evaluation.get("has_limit"):
		return evaluation

	if not allow_override:
		frappe.throw(
			dose_limit_validation_message(evaluation),
			title=frappe._("Maximum dose limit exceeded"),
		)
	if not (override_reason or "").strip():
		frappe.throw(
			frappe._("Override reason is required to exceed the maximum dose limit."),
			title=frappe._("Override reason required"),
		)
	evaluation["override_required"] = True
	return evaluation
