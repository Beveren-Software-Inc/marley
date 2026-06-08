import frappe
from frappe import _

from healthcare.api.assessment_portal_utils import (
	apply_care_context_fields,
	ensure_assessment_read_permission,
	enrich_assessment_row,
	list_assessments,
)

PANSS_RATING_FIELDS = [
	"p1", "p2", "p3", "p4", "p5", "p6", "p7",
	"n1", "n2", "n3", "n4", "n5", "n6", "n7",
	"g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8", "g9", "g10",
	"g11", "g12", "g13", "g14", "g15", "g16",
]

PANSS_RATING_SELECT_OPTIONS = {
	1: "1 Absent",
	2: "2 Minimal",
	3: "3 Mild",
	4: "4 Moderate",
	5: "5 Moderate Severe",
	6: "6 Severe",
	7: "7 Extreme",
}


def _panss_rating_to_select(score) -> str:
	"""Map portal numeric score (1–7) to PANSS Assessment Select option."""
	try:
		value = int(score)
	except (TypeError, ValueError):
		value = 1
	value = max(1, min(7, value))
	return PANSS_RATING_SELECT_OPTIONS[value]


def _panss_rating_from_select(value) -> int:
	"""Extract numeric score from Select value or raw number."""
	if value is None or value == "":
		return 1
	if isinstance(value, (int, float)):
		return max(1, min(7, int(value)))
	text = str(value).strip()
	if not text:
		return 1
	for option in PANSS_RATING_SELECT_OPTIONS.values():
		if text == option:
			return int(option.split()[0])
	try:
		return max(1, min(7, int(text.split()[0])))
	except (TypeError, ValueError, IndexError):
		return 1

DEFAULT_PANSS_HEADER = "Default PANSS Header"
DEFAULT_PANSS_FOOTER = "Default PANSS Footer"

DEFAULT_PANSS_HEADER_HTML = (
	"<p>The Positive and Negative Syndrome Scale (PANSS) measures symptom severity "
	"in schizophrenia and other psychotic disorders.</p>"
	"<p><strong>Rating scale:</strong> 1 = Absent, 2 = Minimal, 3 = Mild, 4 = Moderate, "
	"5 = Moderate severe, 6 = Severe, 7 = Extreme.</p>"
)

DEFAULT_PANSS_FOOTER_HTML = (
	"<p><strong>Scoring:</strong> Positive subscale (7–49), Negative subscale (7–49), "
	"General Psychopathology (16–112), PANSS Total (30–210).</p>"
	"<p>Composite Index = Positive total − Negative total.</p>"
	"<p><strong>Severity bands:</strong> Mild (&lt;58), Moderate (58–75), "
	"Moderate-Severe (76–95), Severe (&gt;95).</p>"
)


def _ensure_panss_terms_record(terms_label: str, description: str) -> str:
	if frappe.db.exists("PANSS Terms", terms_label):
		return terms_label

	doc = frappe.get_doc(
		{
			"doctype": "PANSS Terms",
			"terms": terms_label,
			"description": description,
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def ensure_default_panss_terms() -> tuple[str, str]:
	"""Create default header/footer PANSS Terms if missing."""
	header = _ensure_panss_terms_record(DEFAULT_PANSS_HEADER, DEFAULT_PANSS_HEADER_HTML)
	footer = _ensure_panss_terms_record(DEFAULT_PANSS_FOOTER, DEFAULT_PANSS_FOOTER_HTML)
	return header, footer


def _practitioner_user_id(practitioner: str | None) -> str | None:
	if not practitioner:
		return None
	return frappe.db.get_value("Healthcare Practitioner", practitioner, "user_id")


def _serialize_panss_assessment(doc) -> dict:
	row = enrich_assessment_row(doc.as_dict())
	if row.get("practitioner") and not row.get("practitioner_name"):
		row["practitioner_name"] = frappe.db.get_value(
			"Healthcare Practitioner",
			row["practitioner"],
			"practitioner_name",
		)
	for field in PANSS_RATING_FIELDS:
		if row.get(field) is not None:
			row[field] = _panss_rating_from_select(row[field])
	return row


def _apply_panss_ratings(doc, data: dict):
	for field in PANSS_RATING_FIELDS:
		if data.get(field) is not None:
			setattr(doc, field, _panss_rating_to_select(data.get(field, 1)))
		elif doc.meta.get_field(field).reqd and not doc.get(field):
			setattr(doc, field, _panss_rating_to_select(1))


def _calculate_panss_totals(doc):
	positive_total = sum(
		_panss_rating_from_select(getattr(doc, field, None)) for field in PANSS_RATING_FIELDS[:7]
	)
	negative_total = sum(
		_panss_rating_from_select(getattr(doc, field, None)) for field in PANSS_RATING_FIELDS[7:14]
	)
	general_total = sum(
		_panss_rating_from_select(getattr(doc, field, None)) for field in PANSS_RATING_FIELDS[14:]
	)
	panss_total = positive_total + negative_total + general_total
	composite_index = positive_total - negative_total

	doc.positive_total = positive_total
	doc.negative_total = negative_total
	doc.general_total = general_total
	doc.panss_total = panss_total
	doc.composite_index = composite_index

	if panss_total < 58:
		doc.severity_band = "Mild"
	elif panss_total <= 75:
		doc.severity_band = "Moderate"
	elif panss_total <= 95:
		doc.severity_band = "Moderate-Severe"
	else:
		doc.severity_band = "Severe"


@frappe.whitelist()
def get_panss_terms():
	"""Fetch PANSS terms for header and footer."""
	ensure_default_panss_terms()

	terms_data = {
		"header_description": "",
		"footer_description": "",
		"general_instructions": "",
		"scoring_instructions": "",
	}

	header_terms = frappe.db.get_value("PANSS Terms", DEFAULT_PANSS_HEADER, "description")
	if header_terms:
		terms_data["header_description"] = header_terms
		terms_data["general_instructions"] = header_terms

	footer_terms = frappe.db.get_value("PANSS Terms", DEFAULT_PANSS_FOOTER, "description")
	if footer_terms:
		terms_data["footer_description"] = footer_terms
		terms_data["scoring_instructions"] = footer_terms

	return terms_data


@frappe.whitelist()
def get_panss_assessment(name: str | None = None):
	name = (name or "").strip()
	if not name:
		frappe.throw(_("PANSS Assessment is required"))
	doc = ensure_assessment_read_permission("PANSS Assessment", name)
	return _serialize_panss_assessment(doc)


@frappe.whitelist()
def calculate_panss_scores(data):
	"""Calculate PANSS scores from ratings."""
	try:
		if isinstance(data, str):
			data = frappe.parse_json(data)

		positive_scores = [
			_panss_rating_from_select(data.get(field, 1)) for field in PANSS_RATING_FIELDS[:7]
		]
		negative_scores = [
			_panss_rating_from_select(data.get(field, 1)) for field in PANSS_RATING_FIELDS[7:14]
		]
		general_scores = [
			_panss_rating_from_select(data.get(field, 1)) for field in PANSS_RATING_FIELDS[14:]
		]

		positive_total = sum(positive_scores)
		negative_total = sum(negative_scores)
		general_total = sum(general_scores)
		panss_total = positive_total + negative_total + general_total
		composite_index = positive_total - negative_total

		if panss_total < 58:
			severity_band = "Mild"
		elif panss_total <= 75:
			severity_band = "Moderate"
		elif panss_total <= 95:
			severity_band = "Moderate-Severe"
		else:
			severity_band = "Severe"

		return {
			"success": True,
			"positive_total": positive_total,
			"negative_total": negative_total,
			"general_total": general_total,
			"panss_total": panss_total,
			"composite_index": composite_index,
			"severity_band": severity_band,
		}
	except Exception as e:
		return {"success": False, "message": str(e)}


@frappe.whitelist()
def create_panss_assessment(data):
	"""Create a new PANSS Assessment record."""
	try:
		if isinstance(data, str):
			data = frappe.parse_json(data)

		doc = frappe.new_doc("PANSS Assessment")
		doc.patient = data.get("patient")
		doc.assessment_date = data.get("assessment_date")
		header_terms, footer_terms = ensure_default_panss_terms()
		doc.header_terms = header_terms
		doc.footer_terms = footer_terms
		doc.clinical_notes = data.get("clinical_notes") or data.get("notes")

		apply_care_context_fields(doc, data)

		if data.get("practitioner") and doc.meta.has_field("rater"):
			user_id = _practitioner_user_id(data.get("practitioner"))
			if user_id:
				doc.rater = user_id

		for row in data.get("responses", []) or []:
			code = (row.get("item_code") or "").strip()
			if code in PANSS_RATING_FIELDS:
				data[code] = row.get("score", 1)

		_apply_panss_ratings(doc, data)
		_calculate_panss_totals(doc)

		doc.insert(ignore_permissions=True)
		frappe.db.commit()
		return {"success": True, "name": doc.name}
	except Exception as e:
		frappe.logger().error(f"Error creating PANSS assessment: {str(e)}")
		return {"success": False, "message": str(e)}


@frappe.whitelist()
def get_panss_assessments(
	patient=None, practitioner=None, date_from=None, date_to=None, search=None
):
	"""Fetch PANSS assessments with optional filters."""
	return list_assessments(
		"PANSS Assessment",
		patient=patient,
		practitioner=practitioner,
		date_from=date_from,
		date_to=date_to,
		fields=[
			"name", "patient", "patient_name", "assessment_date",
			"practitioner", "practitioner_name", "rater",
			"positive_total", "negative_total", "general_total",
			"panss_total", "composite_index", "severity_band", "docstatus", "clinical_notes",
			"inpatient_admission", "patient_visit",
		],
	)
