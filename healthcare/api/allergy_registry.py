# Copyright (c) 2026, healthcare contributors
"""DOC-009 - one allergy view over every store that holds allergy data.

Allergies accumulated in five places over the life of this site:

    Patient.allergies                  free text, 1174 patients (migrated)
    Warning Message (is_allergy)       free text, 1172 patients (migrated)
    Patient Medical History.allergies  free text, clinician entered
    Patient Allergy (allergy_register) structured, go-forward capture
    Inpatient Admission.allergies      free text, per admission

Reading only one of them is unsafe: the doctor-facing alert banner read
Patient Medical History, which held a single record, so a patient with a
documented seafood allergy in Patient.allergies showed a blank panel.

This module reads all of them and never guesses. Free text stays free text -
parsing "According to pt:Allergic to antibiotics" into a structured allergen
and severity would be fabricating clinical data, so legacy entries are
returned verbatim and flagged is_legacy so the UI can label them.
"""

from __future__ import annotations

import re

import frappe
from frappe.utils import strip_html

# Text that means "asked, nothing found" rather than a real allergy. Kept
# deliberately tight - leftover clinical text after these phrases is treated as
# a real allergy, because a false negative here is a patient-safety event.
#
# "No known allergies As per pt:-Allergic to spicy food" must stay positive:
# the doctor recorded NKDA first, then added a real allergy.
_NEGATIVE_PHRASE = re.compile(
	r"""
	(?<![A-Za-z0-9])
	(?:
		[mn]\.?\s*k\.?\s*f\.?\s*d\.?\s*a\.?|
		[mn]\.?\s*k\.?\s*d\.?\s*a\.?|
		n\.?\s*f\.?\s*d\.?\s*a\.?|
		mkfda|nkfda|mkda|nkda|nfda|nka|
		not\s+known\s+(?:to\s+have\s+)?(?:any\s+)?(?:drug\s+|food\s+)*(?:allerg\w*|alerg\w*)|
		(?:no|not)\s+(?:known\s+)?(?:any\s+)?(?:drug\s+|food\s+)*(?:allerg\w*|alerg\w*)|
		no\s+known|
		not\s+allergic|
		denies(?:\s+any)?(?:\s+known)?(?:\s+drug)?\s+(?:allerg\w*|alerg\w*)|
		not\s+known|
		unknown|
		not\s+reported|
		none|
		nil|
		no|
		na
	)
	(?![A-Za-z0-9])
	""",
	re.I | re.X,
)

# "no known allergies EXCEPT penicillin" starts like a denial and ends in a real
# allergy. Any qualifier disqualifies the text from being read as negative -
# a false negative here is the one failure mode that can kill a patient.
_QUALIFIER = re.compile(
	r"\b(except|excepting|but|apart\s+from|other\s+than|besides|aside\s+from|however)\b",
	re.I,
)

_TRAILING_PUNCT = re.compile(r"^[\s,;:./\\-]+|[\s,;:./\\-]+$")


def _clean(value: str | None) -> str:
	return " ".join(strip_html(value or "").split()).strip()


def _strip_negative_allergy_phrases(text: str) -> str:
	remainder = text
	prev = None
	while remainder and remainder != prev:
		prev = remainder
		remainder = _NEGATIVE_PHRASE.sub(" ", remainder)
		remainder = _TRAILING_PUNCT.sub("", " ".join(remainder.split()))
	return remainder


def is_negative_allergy_text(value: str | None) -> bool:
	"""True when free text records the absence of allergies.

	NKDA / NKFDA / MKFDA / NFDA / "no known allergies" (including typos like
	"no allergfy") count as negative. If a real allergy was added later in the
	same note, the leftover text keeps this as a real allergy.
	"""
	text = _clean(value)
	if not text:
		return False
	if _QUALIFIER.search(text):
		return False
	return _strip_negative_allergy_phrases(text) == ""


def _entry(source: str, text: str, recorded_on=None, **extra) -> dict:
	entry = {
		"source": source,
		"text": text,
		"recorded_on": recorded_on,
		"is_legacy": True,
		"negative": is_negative_allergy_text(text),
		"category": None,
		"allergen": None,
		"reaction": None,
		"severity": None,
	}
	entry.update(extra)
	return entry


@frappe.whitelist()
def get_patient_allergies(patient: str) -> dict:
	"""Every allergy record for a patient, from every store.

	Returns entries plus the flags the UI needs to tell apart
	"no allergies recorded" from "nobody has asked yet".
	"""
	if not patient:
		return {"patient": None, "entries": [], "has_allergies": False, "checked": False}

	entries: list[dict] = []

	# Structured, go-forward register.
	for row in frappe.get_all(
		"Patient Allergy",
		filters={"parent": patient, "parenttype": "Patient"},
		fields=[
			"allergy_category",
			"allergen",
			"reaction",
			"severity",
			"is_drug_sensitivity",
			"onset_date",
			"notes",
		],
	):
		label = ", ".join(filter(None, [row.allergen, row.reaction]))
		entries.append(
			_entry(
				"Allergy Register",
				label or _clean(row.notes),
				row.onset_date,
				is_legacy=False,
				negative=False,
				category=row.allergy_category,
				allergen=row.allergen,
				reaction=row.reaction,
				severity=row.severity,
				is_drug_sensitivity=row.is_drug_sensitivity,
			)
		)

	# Free-text stores.
	text = _clean(frappe.db.get_value("Patient", patient, "allergies"))
	if text:
		entries.append(_entry("Patient Record", text))

	for row in frappe.get_all(
		"Warning Message",
		filters={"patient": patient, "is_allergy": 1},
		fields=["warning", "high_risk_text", "posting_date"],
		order_by="posting_date desc",
	):
		body = _clean(row.warning) or _clean(row.high_risk_text)
		if body:
			entries.append(_entry("Warning Message", body, row.posting_date))

	no_known = False
	for row in frappe.get_all(
		"Patient Medical History",
		filters={"patient": patient},
		fields=["name", "allergies", "no_known_allergies", "modified"],
		order_by="modified desc",
	):
		if row.no_known_allergies:
			no_known = True
		body = _clean(row.allergies)
		if body:
			entries.append(_entry("Medical History", body, row.modified))

	for row in frappe.get_all(
		"Inpatient Admission",
		filters={"patient": patient},
		fields=["name", "allergies", "creation"],
		order_by="creation desc",
	):
		body = _clean(row.allergies)
		if body:
			entries.append(_entry("Admission", body, row.creation))

	# Collapse identical text captured in more than one store, keeping the
	# structured entry when one exists.
	deduped: dict[str, dict] = {}
	for entry in entries:
		# Normalise punctuation/spacing so "pt:Allergic" and "pt: Allergic"
		# collapse into one row instead of showing the doctor the same allergy twice.
		key = re.sub(r"[^a-z0-9]+", "", (entry["text"] or "").lower())
		if not key:
			continue
		if key not in deduped or (deduped[key]["is_legacy"] and not entry["is_legacy"]):
			deduped[key] = entry
		elif entry["source"] not in deduped[key].get("also_in", []):
			deduped[key].setdefault("also_in", []).append(entry["source"])

	final = list(deduped.values())
	positive = [e for e in final if not e["negative"]]

	return {
		"patient": patient,
		"entries": final,
		"positive": positive,
		"has_allergies": bool(positive),
		"no_known_allergies": no_known or (bool(final) and not positive),
		# checked == somebody has recorded something either way
		"checked": bool(final) or no_known,
		"sources": sorted({e["source"] for e in final}),
	}


@frappe.whitelist()
def get_allergy_flags(patients: str | list) -> dict:
	"""Bulk {patient: {has_allergies, checked}} for list and banner views."""
	if isinstance(patients, str):
		patients = frappe.parse_json(patients) if patients.startswith("[") else [patients]
	return {p: {k: v for k, v in get_patient_allergies(p).items() if k in ("has_allergies", "checked")} for p in patients or []}
