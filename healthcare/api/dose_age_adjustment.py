# Copyright (c) 2026, healthcare contributors
"""DOC-124 - age and patient-category aware dose ceilings.

dose_limit_validation.py already resolves weight-based (mg/kg) limits. This adds
the missing dimensions: paediatric and geriatric patients, and patient category,
tighten the ceiling. Applied as a multiplier on top of the item limit so the
existing engine and its override/audit path stay intact.
"""

from __future__ import annotations

import frappe
from frappe.utils import cint, flt, getdate

# age band -> (label, multiplier applied to the adult ceiling)
AGE_BANDS = (
	(1, "Neonate/Infant", 0.25),
	(12, "Paediatric", 0.50),
	(18, "Adolescent", 0.75),
	(65, "Adult", 1.00),
	(200, "Geriatric", 0.75),
)


def _enabled() -> bool:
	return bool(
		frappe.db.get_single_value("Healthcare Settings", "apply_age_based_dose_limits")
	)


def get_patient_age_years(patient: str | None) -> int | None:
	if not patient:
		return None
	dob = frappe.db.get_value("Patient", patient, "dob")
	if not dob:
		return None
	today = getdate()
	dob = getdate(dob)
	years = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
	return max(years, 0)


def get_age_band(patient: str | None) -> tuple[str, float]:
	"""Return (band label, multiplier). Unknown age is treated as Adult."""
	age = get_patient_age_years(patient)
	if age is None:
		return "Unknown (treated as Adult)", 1.0
	for upper, label, factor in AGE_BANDS:
		if age < upper:
			return f"{label} ({age}y)", factor
	return "Geriatric", 0.75


def get_category_factor(patient: str | None) -> tuple[str, float]:
	"""Patient Category may carry its own dose factor (e.g. frail/high-risk cohorts)."""
	if not patient:
		return "", 1.0
	category = frappe.db.get_value("Patient", patient, "category")
	if not category:
		return "", 1.0
	factor = frappe.db.get_value("Patient Category", category, "dose_limit_factor")
	try:
		factor = flt(factor)
	except (TypeError, ValueError):
		factor = 0
	return category, factor if factor > 0 else 1.0


@frappe.whitelist()
def adjust_ceiling_for_patient(
	patient: str | None, ceiling: float | None
) -> dict:
	"""Apply age and category factors to an adult dose ceiling."""
	ceiling = flt(ceiling)
	if not ceiling or not _enabled():
		return {
			"ceiling": ceiling,
			"adjusted": False,
			"age_band": "",
			"category": "",
			"factor": 1.0,
		}

	band, age_factor = get_age_band(patient)
	category, cat_factor = get_category_factor(patient)
	factor = age_factor * cat_factor

	return {
		"ceiling": round(ceiling * factor, 4),
		"adult_ceiling": ceiling,
		"adjusted": factor != 1.0,
		"age_band": band,
		"category": category,
		"factor": factor,
	}


@frappe.whitelist()
def describe_patient_dose_context(patient: str) -> dict:
	"""Used by the SPA to show why a ceiling was tightened."""
	band, age_factor = get_age_band(patient)
	category, cat_factor = get_category_factor(patient)
	weight = None
	if frappe.db.has_column("Patient", "weight"):
		weight = frappe.db.get_value("Patient", patient, "weight")
	return {
		"patient": patient,
		"age_years": get_patient_age_years(patient),
		"age_band": band,
		"age_factor": age_factor,
		"category": category,
		"category_factor": cat_factor,
		"combined_factor": age_factor * cat_factor,
		"weight_kg": weight,
		"enabled": _enabled(),
	}
