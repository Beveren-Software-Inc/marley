# Copyright (c) 2026, healthcare contributors
"""OP clinical timeline: visit → progress notes + prescriptions side by side."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import getdate

from healthcare.api.clinical_note import _enrich_clinical_note_row
from healthcare.api.patient_admission_clinical_bundle import _user_can_read_bundle
from healthcare.api.patient_medication_order import get_medication_orders


def _date_key(val) -> str | None:
	if not val:
		return None
	try:
		return str(getdate(val))
	except Exception:
		return None


def _visits_for_patient(patient: str, limit: int = 100) -> list[dict]:
	rows = frappe.get_all(
		"Patient Visit",
		filters={"patient": patient},
		fields=[
			"name",
			"patient",
			"patient_name",
			"encounter_date",
			"status",
			"visit_type",
			"practitioner",
			"practitioner_name",
			"cost_center",
		],
		order_by="encounter_date desc, creation desc",
		limit_page_length=limit,
	)
	# Prefer display name from link if blank
	for row in rows:
		if not row.get("practitioner_name") and row.get("practitioner"):
			row["practitioner_name"] = (
				frappe.db.get_value("Healthcare Practitioner", row["practitioner"], "practitioner_name")
				or row["practitioner"]
			)
	return rows


def _progress_notes_for_patient(patient: str, limit: int = 200) -> list[dict]:
	note_type = "Doctor Progress Note"
	if not frappe.db.exists("Clinical Note Type", note_type):
		note_type = None
	filters: dict = {"patient": patient}
	if note_type:
		filters["clinical_note_type"] = note_type
	# Prefer OP-linked notes; still load all patient progress notes so orphans can match by date
	notes = frappe.get_all(
		"Clinical Note",
		filters=filters,
		fields=[
			"name",
			"patient",
			"posting_date",
			"practitioner",
			"user",
			"username",
			"clinical_note_type",
			"note",
			"reference_doctype",
			"reference_document",
			"inpatient_admission",
			"creation",
		],
		order_by="posting_date desc, creation desc",
		limit_page_length=limit,
	)
	# Drop IP-admission scoped notes from OP timeline
	out = []
	for note in notes:
		if note.get("inpatient_admission"):
			continue
		if note.get("reference_doctype") == "Inpatient Admission":
			continue
		_enrich_clinical_note_row(note)
		out.append(note)
	return out


def _prescriptions_for_patient(patient: str, limit: int = 200) -> list[dict]:
	"""Visit-linked / OP medication orders with child lines."""
	orders = get_medication_orders(limit=limit, offset=0, patient=patient) or []
	out = []
	for o in orders:
		if o.get("care_context") == "Inpatient Admission":
			continue
		if o.get("inpatient_record") and not o.get("patient_encounter"):
			continue
		out.append(o)
	return out


def _serialize_prescription(order: dict) -> dict:
	meds = []
	for e in order.get("medication_orders") or []:
		meds.append(
			{
				"drug": e.get("drug"),
				"drug_name": e.get("drug_name") or e.get("drug"),
				"dosage": e.get("dosage") or e.get("dose"),
				"uom": e.get("uom"),
				"frequency": e.get("patient_frequency") or e.get("written_frequency") or e.get("frequency"),
				"instructions": e.get("instructions") or e.get("comment"),
				"status": e.get("status"),
			}
		)
	return {
		"name": order.get("name"),
		"posting_date": order.get("posting_date"),
		"status": order.get("status"),
		"practitioner": order.get("practitioner") or order.get("healthcare_practitioner"),
		"healthcare_practitioner_name": order.get("healthcare_practitioner_name")
		or order.get("practitioner"),
		"patient_encounter": order.get("patient_encounter"),
		"care_context": order.get("care_context"),
		"medications": meds,
	}


@frappe.whitelist()
def get_op_clinical_timeline(patient=None, limit=100):
	"""Visit-aligned OP clinical history: each episode has progress notes + prescriptions."""
	if not _user_can_read_bundle():
		frappe.throw(_("Not permitted to view clinical history"), frappe.PermissionError)

	patient = (patient or "").strip()
	if not patient:
		frappe.throw(_("Patient is required"))
	if not frappe.db.exists("Patient", patient):
		frappe.throw(_("Patient {0} not found").format(patient))

	limit = cint_safe(limit, 100)
	visits = _visits_for_patient(patient, limit=limit)
	notes = _progress_notes_for_patient(patient, limit=max(limit * 2, 200))
	prescriptions = _prescriptions_for_patient(patient, limit=max(limit * 2, 200))

	visit_ids = {v["name"] for v in visits}
	visit_date = {v["name"]: _date_key(v.get("encounter_date")) for v in visits}
	date_to_visits: dict[str, list[str]] = {}
	for vid, d in visit_date.items():
		if d:
			date_to_visits.setdefault(d, []).append(vid)

	notes_by_visit: dict[str, list[dict]] = {v["name"]: [] for v in visits}
	rx_by_visit: dict[str, list[dict]] = {v["name"]: [] for v in visits}
	orphan_notes: list[dict] = []
	orphan_rx: list[dict] = []

	for note in notes:
		ref_doc = (note.get("reference_document") or "").strip()
		ref_dt = (note.get("reference_doctype") or "").strip()
		attached = False
		if ref_doc and ref_doc in visit_ids and (not ref_dt or ref_dt == "Patient Visit"):
			notes_by_visit[ref_doc].append(note)
			attached = True
		elif ref_doc and ref_doc in visit_ids:
			notes_by_visit[ref_doc].append(note)
			attached = True
		if attached:
			continue
		# Date fallback: match encounter date
		dk = _date_key(note.get("posting_date") or note.get("creation"))
		candidates = date_to_visits.get(dk or "", [])
		if len(candidates) == 1:
			notes_by_visit[candidates[0]].append(note)
		elif candidates:
			# Prefer visit whose practitioner matches note practitioner
			prac = (note.get("practitioner") or "").strip()
			matched = None
			for vid in candidates:
				v = next((x for x in visits if x["name"] == vid), None)
				if v and prac and v.get("practitioner") == prac:
					matched = vid
					break
			notes_by_visit[matched or candidates[0]].append(note)
		else:
			orphan_notes.append(note)

	for order in prescriptions:
		enc = (order.get("patient_encounter") or "").strip()
		ser = _serialize_prescription(order)
		if enc and enc in visit_ids:
			rx_by_visit[enc].append(ser)
			continue
		dk = _date_key(order.get("posting_date") or order.get("creation"))
		candidates = date_to_visits.get(dk or "", [])
		if candidates:
			rx_by_visit[candidates[0]].append(ser)
		else:
			orphan_rx.append(ser)

	episodes: list[dict] = []
	for v in visits:
		vid = v["name"]
		nlist = notes_by_visit.get(vid) or []
		rlist = rx_by_visit.get(vid) or []
		episodes.append(
			{
				"visit": vid,
				"encounter_date": v.get("encounter_date"),
				"status": v.get("status"),
				"visit_type": v.get("visit_type"),
				"practitioner": v.get("practitioner"),
				"practitioner_name": v.get("practitioner_name"),
				"patient_name": v.get("patient_name"),
				"cost_center": v.get("cost_center"),
				"progress_notes": nlist,
				"prescriptions": rlist,
				"has_clinical": bool(nlist or rlist),
			}
		)

	# Synthetic date-only episodes for orphans
	orphan_by_date: dict[str, dict] = {}
	for note in orphan_notes:
		dk = _date_key(note.get("posting_date") or note.get("creation")) or "unknown"
		bucket = orphan_by_date.setdefault(
			dk,
			{
				"visit": None,
				"encounter_date": dk if dk != "unknown" else None,
				"status": None,
				"visit_type": None,
				"practitioner": None,
				"practitioner_name": None,
				"patient_name": None,
				"cost_center": None,
				"progress_notes": [],
				"prescriptions": [],
				"has_clinical": True,
				"orphan": True,
			},
		)
		bucket["progress_notes"].append(note)
	for ser in orphan_rx:
		dk = _date_key(ser.get("posting_date")) or "unknown"
		bucket = orphan_by_date.setdefault(
			dk,
			{
				"visit": None,
				"encounter_date": dk if dk != "unknown" else None,
				"status": None,
				"visit_type": None,
				"practitioner": None,
				"practitioner_name": None,
				"patient_name": None,
				"cost_center": None,
				"progress_notes": [],
				"prescriptions": [],
				"has_clinical": True,
				"orphan": True,
			},
		)
		bucket["prescriptions"].append(ser)

	for dk, bucket in sorted(orphan_by_date.items(), key=lambda x: x[0] or "", reverse=True):
		episodes.append(bucket)

	# Keep chronological: visits already desc; append orphans by date — re-sort all
	def _sort_key(ep: dict):
		d = _date_key(ep.get("encounter_date")) or ""
		return (d, ep.get("visit") or "")

	episodes.sort(key=_sort_key, reverse=True)

	patient_name = None
	if visits:
		patient_name = visits[0].get("patient_name")
	if not patient_name:
		patient_name = frappe.db.get_value("Patient", patient, "patient_name") or patient

	return {
		"patient": patient,
		"patient_name": patient_name,
		"episodes": episodes,
		"episode_count": len(episodes),
		"has_data": bool(episodes),
	}


def cint_safe(val, default=0) -> int:
	try:
		return int(val)
	except (TypeError, ValueError):
		return default
