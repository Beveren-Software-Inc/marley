# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import cint, strip_html

from healthcare.api.lab_test_doctor_review import follow_up_labels_from_doc, record_results_entered
from healthcare.healthcare.lab_test_result_rules import apply_rules_to_doc


LAB_RESULT_EDIT_ROLES = frozenset(
	(
		"Laboratory User",
		"LabTest Approver",
		"System Manager",
		"Healthcare Administrator",
		"Administrator",
	)
)

CEO_ROLE = "CEO"
GROUP_FINISHED_SR_STATUS = "completed-Request Status"


def _is_ceo_user() -> bool:
	return CEO_ROLE in frappe.get_roles(frappe.session.user)


def _is_group_lab_finished(doc) -> bool:
	if not cint(getattr(doc, "is_group_lab_test", 0)):
		return False
	service_request = getattr(doc, "service_request", None)
	if not service_request:
		return False
	sr_status = frappe.db.get_value("Service Request", service_request, "status")
	return sr_status == GROUP_FINISHED_SR_STATUS


def _plain_sample_details(value: str | None) -> str | None:
	"""Store collection notes as plain text, not rich-text HTML."""
	if value is None:
		return None
	text = strip_html(value).strip()
	return text or None


def _ensure_lab_result_edit_permission(doc=None):
	"""Laboratory User, LabTest Approver, or administrators may enter/adjust results."""
	if doc and _is_group_lab_finished(doc) and _is_ceo_user():
		return

	roles = set(frappe.get_roles(frappe.session.user))
	if roles & LAB_RESULT_EDIT_ROLES:
		return

	frappe.throw(
		_(
			"Only users with Laboratory User, LabTest Approver, System Manager, "
			"Healthcare Administrator, or Administrator role may enter or adjust Lab Test results."
		),
		frappe.PermissionError,
	)


def _ensure_lab_result_save_allowed(doc):
	"""Draft tests and reviewed (submitted) tests may have results updated."""
	if doc.docstatus == 2:
		frappe.throw(_("Cannot update a cancelled Lab Test"))
	if _is_group_lab_finished(doc) and not _is_ceo_user():
		frappe.throw(
			_(
				"This grouped lab request has been finished. Only users with the CEO role "
				"may edit lab results."
			),
			frappe.PermissionError,
		)
	if doc.docstatus == 0:
		return
	if doc.docstatus == 1 and doc.status == "Reviewed":
		return
	frappe.throw(
		_("Lab results cannot be changed while the test is in status {0}.").format(
			doc.status or doc.docstatus
		)
	)


@frappe.whitelist(allow_guest=False)
def get_lab_test_template_details(template):
	"""Return display/meta fields from a Lab Test Template for result-entry UI.

	Also returns normal_test_templates rows so the frontend can pre-populate
	an empty result entry table even before any results have been saved.
	"""
	if not template or not frappe.db.exists('Lab Test Template', template):
		return {}
	doc = frappe.get_doc('Lab Test Template', template)

	# Compound test rows (normal_test_templates child table on the template)
	compound_rows = []
	for r in (doc.get('normal_test_templates') or []):
		compound_rows.append({
			'lab_test_event': getattr(r, 'lab_test_event', '') or '',
			'lab_test_uom': getattr(r, 'lab_test_uom', '') or '',
			'normal_range': getattr(r, 'normal_range', '') or '',
		})

	return {
		'lab_test_template_type': doc.lab_test_template_type,
		'min_range': doc.get('min_range'),
		'max_range': doc.get('max_range'),
		'worksheet_instructions': doc.get('worksheet_instructions') or '',
		'sample_details': doc.get('sample_details') or '',
		'lab_test_uom': doc.get('lab_test_uom') or '',
		'normal_range': doc.get('lab_test_normal_range') or '',
		'normal_test_templates': compound_rows,
		'cost_center': doc.get('cost_center')
	}


# @frappe.whitelist()
# def get_lab_tests(
# 	limit=50,
# 	offset=0,
# 	patient=None,
# 	status=None,
# 	pending_review=False,
# 	is_outsourced=None,
# 	from_date=None,
# 	to_date=None,
# 	template=None,
# 	patient_type=None,
# 	by_nurse=None,
# ):
# 	"""Get list of Lab Tests with optional filters (patient, status, date range, OP/IP, template, outsourcing)."""
# 	from healthcare.api.common import get_permitted_cost_centers
# 	filters = {"docstatus": ["!=", 2]}  # Exclude cancelled

# 	if patient:
# 		filters["patient"] = patient

# 	if status:
# 		filters["status"] = status

# 	if pending_review:
# 		filters["status"] = ["in", ["Pending Review", "Submitted"]]

# 	if is_outsourced is not None:
# 		if isinstance(is_outsourced, str):
# 			is_outsourced = is_outsourced == "1"
# 		filters["is_outsourced"] = 1 if is_outsourced else 0

# 	if template:
# 		filters["template"] = template

# 	# Filter by nurse-specific lab tests based on template's by_nurse field
# 	if by_nurse is not None:
# 		if isinstance(by_nurse, str):
# 			by_nurse = by_nurse.lower() in ('1', 'true', 'yes')
# 		# Get templates that have by_nurse set to the desired value
# 		template_filters = {"by_nurse": 1 if by_nurse else 0}
# 		nurse_templates = frappe.get_all("Lab Test Template", filters=template_filters, pluck="name")
# 		if nurse_templates:
# 			filters["template"] = ["in", nurse_templates]
# 		else:
# 			# If no templates match the criteria, return empty result
# 			return []

# 	# OP / IP filter based on inpatient_record link
# 	if patient_type == "IP":
# 		filters["inpatient_record"] = ["is", "set"]
# 	elif patient_type == "OP":
# 		filters["inpatient_record"] = ["is", "not set"]

# 	# Date range filter — apply on result_date
# 	if from_date or to_date:
# 		if from_date and to_date:
# 			filters["result_date"] = ["between", [from_date, to_date]]
# 		elif from_date:
# 			filters["result_date"] = [">=", from_date]
# 		elif to_date:
# 			filters["result_date"] = ["<=", to_date]

# 	# ── Cost-centre User Permission enforcement ──────────────────────────────
# 	permitted_cc = get_permitted_cost_centers()
# 	if permitted_cc is not None:
# 		if not permitted_cc:
# 			return []
# 		filters["cost_center"] = ["in", permitted_cc]

# 	lab_tests = frappe.get_all(
# 		"Lab Test",
# 		filters=filters,
# 		fields=[
# 			"name",
# 			"docstatus",
# 			"patient",
# 			"patient_name",
# 			"practitioner",
# 			"practitioner_name",
# 			"lab_test_name",
# 			"template",
# 			"status",
# 			"result_date",
# 			"submitted_date",
# 			"approved_date",
# 			"invoiced",
# 			"department",
# 			"is_outsourced",
# 			"material_request",
# 			"amount",
# 			"grand_total",
# 			"cost_center",
# 			"min_range",
# 			"max_range",
# 			"results",
# 			"female_min_range",
# 			"female_max_range",
# 			"male_min_range",
# 			"male_max_range"

# 		],
# 		limit=limit,
# 		limit_start=offset,
# 		order_by="submitted_date desc, result_date desc",
# 	)

# 	for lab_test in lab_tests:
# 		if lab_test.patient and not lab_test.patient_name:
# 			lab_test["patient_name"] = (
# 				frappe.db.get_value("Patient", lab_test.patient, "patient_name") or lab_test.patient
# 			)
# 		if lab_test.practitioner and not lab_test.practitioner_name:
# 			lab_test["practitioner_name"] = (
# 				frappe.db.get_value("Healthcare Practitioner", lab_test.practitioner, "practitioner_name")
# 				or lab_test.practitioner
# 			)

# 	return lab_tests

_LAB_TEST_LIST_FIELDS = [
	"name",
	"docstatus",
	"patient",
	"cost_center",
	"patient_name",
	"practitioner",
	"practitioner_name",
	"lab_test_name",
	"template",
	"status",
	"creation",
	"result_date",
	"submitted_date",
	"approved_date",
	"invoiced",
	"department",
	"is_outsourced",
	"material_request",
	"amount",
	"grand_total",
	"cost_center",
	"custom_result",
	"service_request",
	"lab_test_group",
	"is_group_lab_test",
	"lab_technician",
	"lab_technician_name",
	"results",
	"gender",
	"result_flag",
	"is_legacy_import",
	"date",
]

_LAB_TEST_LINE_LIST_FIELDS = [
	"parent",
	"sr_num",
	"lab_group_num",
	"group_name",
	"lab_sub_num",
	"lab_result_value",
	"lab_amt_book",
	"lab_amt_add",
	"lab_amt_disc",
	"lab_amt_net",
	"sta_flg",
	"field1",
	"field2",
	"field3",
	"field4",
	"field5",
	"field6",
	"field7",
	"field8",
	"field9",
	"field10",
	"cr_id",
	"cr_date",
	"up_id",
	"up_date",
	"lab_04_remarks",
]


def _attach_legacy_lab_test_lines(lab_tests):
	"""Attach LAB 00-04 child rows for legacy imports (list API)."""
	legacy_names = [lt.name for lt in lab_tests if cint(lt.get("is_legacy_import"))]
	if not legacy_names:
		return lab_tests

	line_rows = frappe.get_all(
		"Lab Test Line",
		filters={"parent": ["in", legacy_names], "parenttype": "Lab Test"},
		fields=_LAB_TEST_LINE_LIST_FIELDS,
		order_by="parent asc, sr_num asc, idx asc",
	)
	by_parent: dict[str, list] = {}
	template_info_cache: dict[str, dict] = {}
	for row in line_rows:
		parent = row.pop("parent", None)
		if not parent:
			continue
		sub_template = (row.get("lab_sub_num") or "").strip()
		if sub_template:
			row["lab_sub_template_name"] = _lab_test_template_name(sub_template, template_info_cache)
		by_parent.setdefault(parent, []).append(row)

	for lab_test in lab_tests:
		if cint(lab_test.get("is_legacy_import")):
			lab_test["lab_test_lines"] = by_parent.get(lab_test.name, [])
	return lab_tests


def _enrich_lab_test_rows(lab_tests, template_cache=None):
	"""Attach template ranges and display names to lab test list rows."""
	if template_cache is None:
		template_cache = {}

	for lab_test in lab_tests:
		lab_test["female_min_range"] = None
		lab_test["female_max_range"] = None
		lab_test["male_min_range"] = None
		lab_test["male_max_range"] = None
		lab_test["min_range"] = None
		lab_test["max_range"] = None

		if lab_test.template:
			if lab_test.template not in template_cache:
				template_cache[lab_test.template] = frappe.get_doc("Lab Test Template", lab_test.template)
			template_doc = template_cache[lab_test.template]
			lab_test["female_min_range"] = template_doc.get("female_min_range")
			lab_test["female_max_range"] = template_doc.get("female_max_range")
			lab_test["male_min_range"] = template_doc.get("male_min_range")
			lab_test["male_max_range"] = template_doc.get("male_max_range")
			lab_test["min_range"] = template_doc.get("min_range")
			lab_test["max_range"] = template_doc.get("max_range")

		if lab_test.patient and not lab_test.patient_name:
			lab_test["patient_name"] = (
				frappe.db.get_value("Patient", lab_test.patient, "patient_name") or lab_test.patient
			)
		if lab_test.practitioner and not lab_test.practitioner_name:
			lab_test["practitioner_name"] = (
				frappe.db.get_value("Healthcare Practitioner", lab_test.practitioner, "practitioner_name")
				or lab_test.practitioner
			)
		if lab_test.get("lab_technician") and not (lab_test.get("lab_technician_name") or "").strip():
			lab_test["lab_technician_name"] = (
				frappe.db.get_value("Healthcare Practitioner", lab_test.lab_technician, "practitioner_name")
				or lab_test.lab_technician
			)

	service_requests = {
		lt.service_request
		for lt in lab_tests
		if cint(lt.get("is_group_lab_test") or 0) and lt.get("service_request")
	}
	if service_requests:
		sr_status_map = {
			row.name: row.status
			for row in frappe.get_all(
				"Service Request",
				filters={"name": ["in", list(service_requests)]},
				fields=["name", "status"],
			)
		}
		for lab_test in lab_tests:
			if cint(lab_test.get("is_group_lab_test") or 0) and lab_test.get("service_request"):
				lab_test["service_request_status"] = sr_status_map.get(lab_test.service_request)

	return lab_tests


def _group_scope_filters(filters):
	"""Scope filters for fetching all siblings in a grouped lab request (no status/date)."""
	scope_keys = ("patient", "practitioner", "cost_center", "template", "is_outsourced", "docstatus")
	return {key: filters[key] for key in scope_keys if key in filters}


def _expand_grouped_lab_test_siblings(lab_tests, filters):
	"""When any grouped child matches, include all siblings under the same service request."""
	group_srs = {
		lt.service_request
		for lt in lab_tests
		if int(lt.get("is_group_lab_test") or 0) == 1 and lt.get("service_request")
	}
	if not group_srs:
		return lab_tests

	existing = {lt.name for lt in lab_tests}
	sibling_filters = _group_scope_filters(filters)
	sibling_filters["service_request"] = ["in", list(group_srs)]
	sibling_filters["is_group_lab_test"] = 1

	siblings = frappe.get_all(
		"Lab Test",
		filters=sibling_filters,
		fields=_LAB_TEST_LIST_FIELDS,
		order_by="creation asc",
	)
	new_rows = [row for row in siblings if row.name not in existing]
	if not new_rows:
		return lab_tests

	return lab_tests + new_rows


@frappe.whitelist()
def get_lab_tests(
	limit=50,
	offset=0,
	patient=None,
	status=None,
	pending_review=False,
	is_outsourced=None,
	from_date=None,
	to_date=None,
	template=None,
	patient_type=None,
	practitioner=None,
	by_nurse=None,
):
	"""Get list of Lab Tests with optional filters (patient, status, date range, practitioner, template, outsourcing)."""
	from healthcare.api.common import get_permitted_cost_centers
	filters = {"docstatus": ["!=", 2]}  # Exclude cancelled

	if patient:
		filters["patient"] = patient

	if status:
		filters["status"] = status

	if pending_review:
		filters["status"] = ["in", ["Pending Review", "Submitted"]]

	if is_outsourced is not None:
		if isinstance(is_outsourced, str):
			is_outsourced = is_outsourced == "1"
		filters["is_outsourced"] = 1 if is_outsourced else 0

	if template:
		filters["template"] = template

	# Filter by nurse-specific lab tests based on template's by_nurse field
	if by_nurse is not None:
		if isinstance(by_nurse, str):
			by_nurse = by_nurse.lower() in ('1', 'true', 'yes')
		# Get templates that have by_nurse set to the desired value
		template_filters = {"by_nurse": 1 if by_nurse else 0}
		nurse_templates = frappe.get_all("Lab Test Template", filters=template_filters, pluck="name")
		if nurse_templates:
			filters["template"] = ["in", nurse_templates]
		else:
			return {"data": [], "total_count": 0}

	# OP / IP filter based on inpatient_record link (legacy; prefer practitioner filter in portal)
	if patient_type == "IP":
		filters["inpatient_record"] = ["is", "set"]
	elif patient_type == "OP":
		filters["inpatient_record"] = ["is", "not set"]

	if practitioner:
		filters["practitioner"] = practitioner
	
	# Date range filter — apply on result_date
	if from_date or to_date:
		if from_date and to_date:
			filters["result_date"] = ["between", [from_date, to_date]]
		elif from_date:
			filters["result_date"] = [">=", from_date]
		elif to_date:
			filters["result_date"] = ["<=", to_date]

	# ── Cost-centre User Permission enforcement ──────────────────────────────
	permitted_cc = get_permitted_cost_centers()
	if permitted_cc is not None:
		if not permitted_cc:
			return {"data": [], "total_count": 0}
		filters["cost_center"] = ["in", permitted_cc]

	total_count = len(frappe.get_all("Lab Test", filters=filters, fields=["name"], limit=0))

	lab_tests = frappe.get_all(
		"Lab Test",
		filters=filters,
		fields=_LAB_TEST_LIST_FIELDS,
		limit=limit,
		limit_start=offset,
		order_by="creation desc",
	)

	lab_tests = _expand_grouped_lab_test_siblings(lab_tests, filters)
	template_cache = {}
	_enrich_lab_test_rows(lab_tests, template_cache)
	_attach_legacy_lab_test_lines(lab_tests)
	return {"data": lab_tests, "total_count": total_count}

# def _calculate_result_flag(result_value, patient_gender, female_min_range=None, female_max_range=None, 
#                            male_min_range=None, male_max_range=None, min_range=None, max_range=None):
#     """Calculate result flag based on value and reference ranges.
    
#     Returns:
#         str: One of 'Normal', 'High', 'Low', 'Critically High', 'Critically Low', or empty string
#     """
#     if not result_value:
#         return ""
    
#     # Try to convert result value to float
#     try:
#         val = float(result_value)
#     except (TypeError, ValueError):
#         # If it's not a numeric value, return empty (qualitative results handled separately)
#         return ""
    
#     # Select appropriate ranges based on patient gender
#     if patient_gender == "Female":
#         min_range = female_min_range if female_min_range is not None else min_range
#         max_range = female_max_range if female_max_range is not None else max_range
#     elif patient_gender == "Male":
#         min_range = male_min_range if male_min_range is not None else min_range
#         max_range = male_max_range if male_max_range is not None else max_range
    
#     # Check if we have valid ranges to compare against
#     if min_range is not None and max_range is not None:
#         # Check for critical values (2x normal range or 0.5x normal range)
#         if val > max_range * 2:
#             return "Critically High"
#         if val < min_range * 0.5:
#             return "Critically Low"
        
#         # Check normal range
#         if val > max_range:
#             return "High"
#         if val < min_range:
#             return "Low"
        
#         return "Normal"
    
#     # No valid ranges available
#     return ""

def _calculate_result_flag(result_value, patient_gender, female_min_range=None, female_max_range=None, 
                           male_min_range=None, male_max_range=None, min_range=None, max_range=None):
    """Calculate result flag based on value and reference ranges."""
    if not result_value:
        return ""
    
    # Try to convert result value to float
    try:
        val = float(result_value)
    except (TypeError, ValueError):
        return ""
    
    # Convert ranges to float, handling None and string values
    def to_float(val):
        if val is None:
            return None
        try:
            return float(val)
        except (TypeError, ValueError):
            return None
    
    # Select ranges based on patient gender
    if patient_gender == "Female":
        min_val = to_float(female_min_range) or to_float(min_range)
        max_val = to_float(female_max_range) or to_float(max_range)
    elif patient_gender == "Male":
        min_val = to_float(male_min_range) or to_float(min_range)
        max_val = to_float(male_max_range) or to_float(max_range)
    else:
        min_val = to_float(min_range)
        max_val = to_float(max_range)
    
    # Check if we have valid ranges
    if min_val is not None and max_val is not None:
        # Critical values (2x normal range or 0.5x normal range)
        if val > max_val * 2:
            return "Critically High"
        if val < min_val * 0.5:
            return "Critically Low"
        
        # Normal range check
        if val > max_val:
            return "High"
        if val < min_val:
            return "Low"
        
        return "Normal"
    
    return ""

def _parse_normal_range_text(normal_range):
	"""Parse '12.0 - 16.0' style normal range text into (min, max)."""
	if not normal_range:
		return None, None
	import re
	text = str(normal_range).strip()
	match = re.search(r"([\d.]+)\s*[-–]\s*([\d.]+)", text)
	if not match:
		return None, None
	try:
		return float(match.group(1)), float(match.group(2))
	except (TypeError, ValueError):
		return None, None


def _to_float_range(val):
	if val is None or val == "":
		return None
	try:
		return float(val)
	except (TypeError, ValueError):
		return None


def _reference_range_bounds(
	patient_gender=None,
	*,
	female_min_range=None,
	female_max_range=None,
	male_min_range=None,
	male_max_range=None,
	min_range=None,
	max_range=None,
	normal_range=None,
):
	"""Resolve min/max reference bounds from template fields and/or normal_range text."""
	gender = (patient_gender or "").strip()
	if gender == "Female":
		min_val = _to_float_range(female_min_range) or _to_float_range(min_range)
		max_val = _to_float_range(female_max_range) or _to_float_range(max_range)
	elif gender == "Male":
		min_val = _to_float_range(male_min_range) or _to_float_range(min_range)
		max_val = _to_float_range(male_max_range) or _to_float_range(max_range)
	else:
		min_val = _to_float_range(min_range)
		max_val = _to_float_range(max_range)

	if min_val is None or max_val is None:
		parsed_min, parsed_max = _parse_normal_range_text(normal_range)
		if min_val is None:
			min_val = parsed_min
		if max_val is None:
			max_val = parsed_max
	return min_val, max_val


def _matrix_cell_eval(
	result_value,
	normal_range=None,
	*,
	patient_gender=None,
	female_min_range=None,
	female_max_range=None,
	male_min_range=None,
	male_max_range=None,
	min_range=None,
	max_range=None,
):
	"""Return flag + optional direction for matrix cell colouring."""
	neutral = {"flag": "neutral", "direction": None}
	if result_value is None or str(result_value).strip() == "":
		return neutral
	try:
		val = float(result_value)
	except (TypeError, ValueError):
		# Non-numeric text (e.g. "Positive") — leave uncoloured.
		return neutral
	min_val, max_val = _reference_range_bounds(
		patient_gender,
		female_min_range=female_min_range,
		female_max_range=female_max_range,
		male_min_range=male_min_range,
		male_max_range=male_max_range,
		min_range=min_range,
		max_range=max_range,
		normal_range=normal_range,
	)
	if min_val is None or max_val is None:
		return neutral
	if val < min_val:
		return {"flag": "abnormal", "direction": "low"}
	if val > max_val:
		return {"flag": "abnormal", "direction": "high"}
	return {"flag": "normal", "direction": None}


def _matrix_cell_eval_from_template_info(result_value, patient_gender, tpl_info, normal_range=None):
	return _matrix_cell_eval(
		result_value,
		normal_range,
		patient_gender=patient_gender,
		female_min_range=tpl_info.get("female_min_range"),
		female_max_range=tpl_info.get("female_max_range"),
		male_min_range=tpl_info.get("male_min_range"),
		male_max_range=tpl_info.get("male_max_range"),
		min_range=tpl_info.get("min_range"),
		max_range=tpl_info.get("max_range"),
	)


def _matrix_cell_from_result_flag(result_flag: str):
	flag_text = (result_flag or "").strip()
	if not flag_text or flag_text == "Normal":
		return {"flag": "normal", "direction": None}
	direction = None
	if flag_text in ("High", "Critically High"):
		direction = "high"
	elif flag_text in ("Low", "Critically Low"):
		direction = "low"
	return {"flag": "abnormal", "direction": direction}


def _matrix_history_cell(value, lab_test_name, cell_eval: dict):
	return {
		"value": value,
		"flag": cell_eval.get("flag") or "neutral",
		"direction": cell_eval.get("direction"),
		"lab_test": lab_test_name,
	}


def _template_analyte_cache(template_name: str, cache: dict) -> dict:
	"""Map template + event codes to human-readable analyte / panel names."""
	key = (template_name or "").strip()
	if not key:
		return {"panel_name": "", "events": {}}
	if key in cache:
		return cache[key]

	panel_name = (
		frappe.db.get_value("Lab Test Template", key, "lab_test_name")
		or frappe.db.get_value("Lab Test Template", key, "lab_test_code")
		or key
	)
	events: dict[str, str] = {}
	if frappe.db.exists("Lab Test Template", key):
		for row in frappe.get_all(
			"Normal Test Template",
			filters={"parent": key, "parenttype": "Lab Test Template"},
			fields=["lab_test_event"],
			order_by="idx asc",
		):
			event = (row.lab_test_event or "").strip()
			if not event:
				continue
			# lab_test_event is the stored analyte label (e.g. WBC) when configured on the template
			events[event.lower()] = event

	cache[key] = {"panel_name": panel_name, "events": events}
	return cache[key]


def _lab_test_template_info(template_id: str, cache: dict) -> dict:
	"""Resolve Lab Test Template display name and reference ranges (legacy lab_sub_num)."""
	empty = {
		"name": "",
		"female_min_range": None,
		"female_max_range": None,
		"male_min_range": None,
		"male_max_range": None,
		"min_range": None,
		"max_range": None,
	}
	key = (template_id or "").strip()
	if not key:
		return empty
	if key in cache:
		return cache[key]

	info = {**empty, "name": key}
	if frappe.db.exists("Lab Test Template", key):
		row = frappe.db.get_value(
			"Lab Test Template",
			key,
			[
				"lab_test_name",
				"lab_test_code",
				"female_min_range",
				"female_max_range",
				"male_min_range",
				"male_max_range",
				"min_range",
				"max_range",
			],
			as_dict=True,
		)
		if row:
			info["name"] = row.lab_test_name or row.lab_test_code or key
			info["female_min_range"] = row.female_min_range
			info["female_max_range"] = row.female_max_range
			info["male_min_range"] = row.male_min_range
			info["male_max_range"] = row.male_max_range
			info["min_range"] = row.min_range
			info["max_range"] = row.max_range
	cache[key] = info
	return info


def _lab_test_template_name(template_id: str, cache: dict) -> str:
	return (_lab_test_template_info(template_id, cache).get("name") or "").strip()


def _history_analyte_label(
	template_name: str,
	event_code: str,
	*,
	fallback_name: str = "",
	template_cache: dict,
) -> str:
	"""Prefer Lab Test Template analyte / panel name (e.g. WBC) over Oracle codes."""
	info = _template_analyte_cache(template_name, template_cache)
	code = (event_code or "").strip()
	fallback = (fallback_name or "").strip()

	if code:
		resolved = info["events"].get(code.lower())
		if resolved and resolved.lower() != code.lower():
			return resolved
		# Oracle-style codes (LAB-013-001) — use template panel name or Excel group name
		if code.upper().startswith("LAB-") and "-" in code[4:]:
			panel = (info.get("panel_name") or "").strip()
			if panel and panel.lower() != code.lower():
				return panel
			if fallback and fallback.lower() != code.lower():
				return fallback

	panel = (info.get("panel_name") or "").strip()
	if panel and (not code or panel.lower() != code.lower()):
		return panel
	if fallback:
		return fallback
	return code or panel or (template_name or "")


@frappe.whitelist()
def get_lab_test_history_matrix(
	patient=None,
	from_date=None,
	to_date=None,
	test_search=None,
	template=None,
):
	"""Pivot lab results for a patient: rows = test parameters, columns = result dates."""
	from datetime import timedelta

	from frappe.utils import format_timedelta, getdate

	from healthcare.api.common import get_permitted_cost_centers

	patient = (patient or "").strip()
	if not patient:
		frappe.throw(_("Patient is required"))

	permitted_cc = get_permitted_cost_centers()
	filters = {"patient": patient, "docstatus": ["!=", 2]}
	if template:
		filters["template"] = template
	if permitted_cc is not None:
		if not permitted_cc:
			return {"columns": [], "rows": [], "patient": patient, "patient_name": None}
		filters["cost_center"] = ["in", permitted_cc]

	lab_tests = frappe.get_all(
		"Lab Test",
		filters=filters,
		fields=[
			"name",
			"lab_test_name",
			"template",
			"status",
			"result_date",
			"date",
			"time",
			"creation",
			"custom_result",
			"results",
			"result_flag",
			"is_legacy_import",
		],
		order_by="result_date asc, creation asc",
	)

	legacy_names = [lt.name for lt in lab_tests if cint(lt.get("is_legacy_import"))]
	legacy_lines_by_parent: dict[str, list] = {}
	if legacy_names:
		for row in frappe.get_all(
			"Lab Test Line",
			filters={"parent": ["in", legacy_names], "parenttype": "Lab Test"},
			fields=[
				"parent",
				"lab_group_num",
				"group_name",
				"lab_sub_num",
				"lab_result_value",
				"sr_num",
			],
			order_by="parent asc, sr_num asc, idx asc",
		):
			parent = row.pop("parent", None)
			if parent:
				legacy_lines_by_parent.setdefault(parent, []).append(row)

	patient_name = frappe.db.get_value("Patient", patient, "patient_name")
	patient_gender = frappe.db.get_value("Patient", patient, "sex") or ""
	search_term = (test_search or "").strip().lower()

	def _format_time(value):
		if not value:
			return ""
		if isinstance(value, timedelta):
			return format_timedelta(value)
		return str(value).strip()

	def _effective_date(lt):
		raw = lt.result_date or lt.date
		if not raw and lt.creation:
			raw = getdate(lt.creation)
		if not raw:
			return None
		return getdate(raw)

	lab_tests.sort(key=lambda lt: (_effective_date(lt) or getdate("1900-01-01"), str(lt.creation or "")))

	from_d = getdate(from_date) if from_date else None
	to_d = getdate(to_date) if to_date else None

	# Apply date range on effective date
	if from_d or to_d:
		filtered = []
		for lt in lab_tests:
			eff = _effective_date(lt)
			if not eff:
				continue
			if from_d and eff < from_d:
				continue
			if to_d and eff > to_d:
				continue
			filtered.append(lt)
		lab_tests = filtered

	columns = []
	rows_map = {}
	template_cache: dict[str, dict] = {}
	template_info_cache: dict[str, dict] = {}

	for lt in lab_tests:
		col_key = lt.name
		eff_date = _effective_date(lt)
		columns.append(
			{
				"key": col_key,
				"date": str(eff_date) if eff_date else "",
				"time": _format_time(lt.time),
				"lab_test": lt.name,
				"lab_test_name": lt.lab_test_name or lt.template or lt.name,
				"status": lt.status,
			}
		)

		items = frappe.get_all(
			"Normal Test Result",
			filters={"parent": lt.name, "parenttype": "Lab Test"},
			fields=[
				"lab_test_name",
				"lab_test_event",
				"result_value",
				"lab_test_uom",
				"normal_range",
			],
			order_by="idx asc",
		)

		legacy_lines = legacy_lines_by_parent.get(lt.name) or []

		if legacy_lines:
			for line in legacy_lines:
				sub_template = (line.get("lab_sub_num") or "").strip()
				tpl_info = _lab_test_template_info(sub_template, template_info_cache)
				label = (tpl_info.get("name") or sub_template).strip()
				if not label:
					continue
				if search_term and search_term not in label.lower():
					if sub_template and search_term in sub_template.lower():
						pass
					else:
						continue
				# One history row per child line (lab_sub_num = Lab Test Template).
				sr_num = line.get("sr_num")
				if sub_template:
					row_key = sub_template.lower()
				elif sr_num is not None and sr_num != "":
					row_key = f"{lt.name}::sr::{sr_num}".lower()
				else:
					row_key = f"{lt.name}::line::{len(rows_map)}".lower()
				if row_key not in rows_map:
					rows_map[row_key] = {"key": row_key, "label": label, "uom": "", "cells": {}}
				value = (line.get("lab_result_value") or "").strip()
				if value:
					cell_eval = _matrix_cell_eval_from_template_info(value, patient_gender, tpl_info)
					rows_map[row_key]["cells"][col_key] = _matrix_history_cell(value, lt.name, cell_eval)
		elif items:
			for item in items:
				tpl_key = (lt.template or "").strip()
				tpl_info = _lab_test_template_info(tpl_key, template_info_cache) if tpl_key else {}
				event_code = (item.lab_test_event or "").strip()
				label_base = _history_analyte_label(
					tpl_key,
					event_code,
					fallback_name=item.lab_test_name or "",
					template_cache=template_cache,
				)
				if not label_base:
					continue
				if search_term and search_term not in label_base.lower():
					if event_code and search_term in event_code.lower():
						pass
					elif tpl_key and search_term in tpl_key.lower():
						pass
					else:
						continue
				uom = (item.lab_test_uom or "").strip()
				row_key = label_base.lower()
				label = f"{label_base} ({uom})" if uom else label_base
				if row_key not in rows_map:
					rows_map[row_key] = {"key": row_key, "label": label, "uom": uom, "cells": {}}
				value = (item.result_value or "").strip()
				if value:
					cell_eval = _matrix_cell_eval_from_template_info(
						value, patient_gender, tpl_info, item.normal_range
					)
					rows_map[row_key]["cells"][col_key] = _matrix_history_cell(value, lt.name, cell_eval)
		else:
			tpl_key = (lt.template or "").strip()
			tpl_info = _lab_test_template_info(tpl_key, template_info_cache) if tpl_key else {}
			label_base = _history_analyte_label(
				tpl_key,
				"",
				fallback_name=lt.lab_test_name or "",
				template_cache=template_cache,
			)
			if not label_base:
				label_base = (lt.lab_test_name or lt.template or lt.name or "").strip()
			if not label_base:
				continue
			if search_term and search_term not in label_base.lower():
				continue
			row_key = label_base.lower()
			if row_key not in rows_map:
				rows_map[row_key] = {"key": row_key, "label": label_base, "uom": "", "cells": {}}
			value = (lt.custom_result or lt.results or "").strip()
			if value:
				cell_eval = _matrix_cell_eval_from_template_info(value, patient_gender, tpl_info)
				if cell_eval["flag"] == "neutral" and lt.result_flag:
					try:
						float(value)
						cell_eval = _matrix_cell_from_result_flag(lt.result_flag)
					except (TypeError, ValueError):
						pass
				rows_map[row_key]["cells"][col_key] = _matrix_history_cell(value, lt.name, cell_eval)

	rows = sorted(rows_map.values(), key=lambda r: r["label"].lower())

	return {
		"columns": columns,
		"rows": rows,
		"patient": patient,
		"patient_name": patient_name,
	}


@frappe.whitelist()
def get_lab_test(name):
	"""Get single Lab Test by name (includes documents child table)."""
	if not name:
		frappe.throw(_("Lab Test name is required"))

	lab_test = frappe.get_doc('Lab Test', name)
	out = {
		'name': lab_test.name,
		'docstatus': lab_test.docstatus,
		'patient': lab_test.patient,
		'cost_center': lab_test.cost_center,
		'patient_name': lab_test.patient_name,
		'practitioner': lab_test.practitioner,
		'practitioner_name': getattr(lab_test, 'practitioner_name', None),
		'lab_test_name': lab_test.lab_test_name,
		'template': lab_test.template,
		'status': lab_test.status,
		'result_date': lab_test.result_date,
		'submitted_date': lab_test.submitted_date,
		'approved_date': getattr(lab_test, 'approved_date', None),
		'invoiced': lab_test.invoiced,
		'department': lab_test.department,
		'custom_result': getattr(lab_test, 'custom_result', None),
		'lab_test_comment': getattr(lab_test, 'lab_test_comment', None),
		'worksheet_instructions': getattr(lab_test, 'worksheet_instructions', None),
		'material_request': getattr(lab_test, 'material_request', None),
		'amount': getattr(lab_test, 'amount', None),
		'discount_margin': getattr(lab_test, 'discount_margin', None),
		'discount': getattr(lab_test, 'discount', None),
		'discount_amount': getattr(lab_test, 'discount_amount', None),
		'grand_total': getattr(lab_test, 'grand_total', None),
		'lab_technician': getattr(lab_test, 'lab_technician', None),
		'lab_technician_name': getattr(lab_test, 'lab_technician_name', None),
		'results_entered_datetime': getattr(lab_test, 'results_entered_datetime', None),
		'doctor_reviewed_datetime': getattr(lab_test, 'doctor_reviewed_datetime', None),
		'review_turnaround_hours': getattr(lab_test, 'review_turnaround_hours', None),
		'review_report_type': getattr(lab_test, 'review_report_type', None),
		'review_result_indicator': getattr(lab_test, 'review_result_indicator', None),
		'review_follow_up_actions': follow_up_labels_from_doc(lab_test),
		'review_follow_up_other': getattr(lab_test, 'review_follow_up_other', None),
		'review_comments': getattr(lab_test, 'review_comments', None),
		'review_prescription_message': getattr(lab_test, 'review_prescription_message', None),
		'patient_informed_of_report': getattr(lab_test, 'patient_informed_of_report', None),
		'archive_report_on_review': getattr(lab_test, 'archive_report_on_review', None),
		'create_task_on_review': getattr(lab_test, 'create_task_on_review', None),
		'reviewed_by': getattr(lab_test, 'reviewed_by', None),
		'reviewed_by_name': (
			frappe.db.get_value('User', lab_test.reviewed_by, 'full_name')
			if getattr(lab_test, 'reviewed_by', None)
			else None
		),
	}
	# Include documents child table (Patient Upload Document)
	documents = getattr(lab_test, 'documents', None) or []
	out['documents'] = [
		{
			'file_name': r.get('document_name') or r.get('file_name'),
			'document_type': r.get('document_type'),
			'transaction_no': r.get('transaction_no'),
			'upload_remarks': r.get('upload_remarks'),
			'document': r.get('document'),
		}
		for r in documents
	]
	# Include remarks child table (Remark)
	remarks_table = getattr(lab_test, 'remarks', None) or []
	out['remarks'] = [{'rrmark': getattr(r, 'rrmark', None) or ''} for r in remarks_table]
	# Include sample_instances child table
	sample_instances = getattr(lab_test, 'sample_instances', None) or []
	out['sample_instances'] = [
		{
			'sample': getattr(r, 'sample', None),
			'sample_qty': getattr(r, 'sample_qty', None),
			'sample_details': getattr(r, 'sample_details', None),
			'sample_collection': getattr(r, 'sample_collection', None),
		}
		for r in sample_instances
	]
	# Include normal_test_items child table (compound test results)
	normal_items = getattr(lab_test, 'normal_test_items', None) or []
	out['normal_test_items'] = [
		{
			'lab_test_name': getattr(r, 'lab_test_name', None) or '',
			'lab_test_event': getattr(r, 'lab_test_event', None) or '',
			'result_value': getattr(r, 'result_value', None) or '',
			'lab_test_uom': getattr(r, 'lab_test_uom', None) or '',
			'normal_range': getattr(r, 'normal_range', None) or '',
			'lab_test_comment': getattr(r, 'lab_test_comment', None) or '',
			'template': getattr(r, 'template', None) or '',
		}
		for r in normal_items
	]
	out['is_legacy_import'] = cint(getattr(lab_test, 'is_legacy_import', 0))
	line_rows = getattr(lab_test, 'lab_test_lines', None) or []
	out['lab_test_lines'] = [
		{
			'sr_num': getattr(r, 'sr_num', None) or '',
			'lab_group_num': getattr(r, 'lab_group_num', None) or '',
			'group_name': getattr(r, 'group_name', None) or '',
			'lab_sub_num': getattr(r, 'lab_sub_num', None) or '',
			'lab_result_value': getattr(r, 'lab_result_value', None) or '',
			'lab_amt_book': getattr(r, 'lab_amt_book', None),
			'lab_amt_add': getattr(r, 'lab_amt_add', None),
			'lab_amt_disc': getattr(r, 'lab_amt_disc', None),
			'lab_amt_net': getattr(r, 'lab_amt_net', None),
			'sta_flg': getattr(r, 'sta_flg', None),
			'cr_id': getattr(r, 'cr_id', None) or '',
			'cr_date': getattr(r, 'cr_date', None) or '',
			'up_id': getattr(r, 'up_id', None) or '',
			'up_date': getattr(r, 'up_date', None) or '',
			'lab_04_remarks': getattr(r, 'lab_04_remarks', None) or '',
		}
		for r in line_rows
	]
	return out


@frappe.whitelist()
def create_lab_material_request(items, company=None, schedule_date=None, cost_center=None):
	"""Create a Material Request for lab consumables.

	`items` is expected to be a JSON list of objects with:
	- item_code
	- qty
	- warehouse (optional)
	"""
	import json

	if isinstance(items, str):
		items = json.loads(items)

	if not items:
		frappe.throw(_("No items provided to create Material Request"))

	mr = frappe.new_doc("Material Request")
	mr.material_request_type = "Material Transfer"

	if company:
		mr.company = company

	for row in items:
		if not row.get("item_code") or not row.get("qty"):
			continue

		mr_item = mr.append("items")
		mr_item.item_code = row.get("item_code")
		mr_item.qty = row.get("qty")
		if row.get("warehouse"):
			mr_item.warehouse = row.get("warehouse")
		if schedule_date:
			mr_item.schedule_date = schedule_date
		if cost_center:
			mr_item.cost_center = cost_center

	if not mr.items:
		frappe.throw(_("No valid items to create Material Request"))

	mr.insert(ignore_permissions=True)
	return mr.name


@frappe.whitelist()
def request_lab_consumables(lab_test, items, company=None, schedule_date=None):
	"""Persist requested consumables on a Lab Test and create a Material Request.

	This is intended for use from the frontend React UI.
	"""
	import json

	if isinstance(items, str):
		items = json.loads(items)

	if not lab_test:
		frappe.throw(_("Lab Test is required"))

	if not items:
		frappe.throw(_("No items provided to request consumables"))

	doc = frappe.get_doc("Lab Test", lab_test)

	# Update requested_consumables child table on Lab Test
	doc.set("requested_consumables", [])
	for row in items:
		if not row.get("item_code") or not row.get("qty"):
			continue

		child = doc.append("requested_consumables", {})
		child.item_code = row.get("item_code")
		child.item_name = row.get("item_name")
		child.qty_per_test = row.get("qty")
		child.uom = row.get("uom")
		child.warehouse = row.get("warehouse")

	doc.save(ignore_permissions=True)

	# Use Lab Test company if not explicitly provided
	if not company:
		company = doc.company

	if not schedule_date:
		schedule_date = frappe.utils.today()

	# Pass Lab Test cost center through to Material Request items
	lab_cost_center = getattr(doc, "cost_center", None)

	mr_name = create_lab_material_request(
		items,
		company=company,
		schedule_date=schedule_date,
		cost_center=lab_cost_center,
	)

	# Link MR back to Lab Test
	if mr_name:
		frappe.db.set_value("Lab Test", doc.name, "material_request", mr_name)

	return mr_name


def _apply_documents_to_doc(doc, documents):
	"""Replace doc.documents child table with the given list of dicts (Patient Upload Document shape)."""
	if documents is None:
		return
	if isinstance(documents, str):
		import json
		documents = json.loads(documents)
	doc.documents = []
	for row in (documents or []):
		if not isinstance(row, dict):
			continue
		if not (row.get('file_name') or row.get('document_name') or row.get('document')):
			continue
		user_label = row.get('file_name') or row.get('document_name') or ''
		doc_type = row.get('document_type') or None
		doc.append('documents', {
			'document_name': user_label,
			'file_name': doc_type if doc_type and frappe.db.exists('Document Type', doc_type) else None,
			'document_type': doc_type,
			'transaction_no': row.get('transaction_no') or None,
			'upload_remarks': row.get('upload_remarks') or None,
			'document': row.get('document') or None,
		})


def _lab_test_has_entered_results(doc) -> bool:
	if (getattr(doc, "custom_result", None) or "").strip():
		return True
	if (getattr(doc, "results", None) or "").strip():
		return True
	for row in doc.normal_test_items or []:
		if (getattr(row, "result_value", None) or "").strip():
			return True
	return False


def _lab_test_results_snapshot(doc) -> dict:
	"""Comparable snapshot of entered result fields (for change detection)."""
	normal = {}
	for row in doc.normal_test_items or []:
		key = (getattr(row, "lab_test_event", None) or getattr(row, "lab_test_name", None) or "").strip()
		normal[key] = {
			"result_value": (getattr(row, "result_value", None) or "").strip(),
			"lab_test_comment": (getattr(row, "lab_test_comment", None) or "").strip(),
		}
	return {
		"custom_result": (getattr(doc, "custom_result", None) or "").strip(),
		"results": (getattr(doc, "results", None) or "").strip(),
		"lab_test_comment": (getattr(doc, "lab_test_comment", None) or "").strip(),
		"normal_test_items": normal,
	}


# @frappe.whitelist()
# def save_and_submit_lab_test(
# 	name,
# 	custom_result=None,
# 	lab_test_comment=None,
# 	worksheet_instructions=None,
# 	documents=None,
# 	normal_test_items=None,
# 	amount=None,
# 	discount_margin=None,
# 	discount=None,
# 	discount_amount=None,
# 	lab_technician=None,
# 	submit: bool = False,
# ):
# 	"""Save custom result/comment/worksheet/documents/normal_test_items/pricing on Lab Test and optionally submit it."""
# 	_ensure_lab_result_edit_permission()

# 	if not name:
# 		frappe.throw(_("Lab Test name is required"))

# 	doc = frappe.get_doc("Lab Test", name)

# 	if lab_technician is not None:
# 		doc.lab_technician = lab_technician or None

# 	if custom_result is not None:
# 		doc.custom_result = custom_result
# 	if lab_test_comment is not None:
# 		doc.lab_test_comment = lab_test_comment
# 	if worksheet_instructions is not None:
# 		doc.worksheet_instructions = worksheet_instructions

# 	# Save editable normal test result rows (result_value + lab_test_comment per row)
# 	if normal_test_items is not None:
# 		if isinstance(normal_test_items, str):
# 			import json
# 			normal_test_items = json.loads(normal_test_items)
# 		# Build a lookup by lab_test_event so we can update existing rows in-place
# 		existing = {(r.get('lab_test_event') or r.get('lab_test_name') or ''): r for r in doc.normal_test_items or []}
# 		for item in (normal_test_items or []):
# 			event_key = item.get('lab_test_event') or item.get('lab_test_name') or ''
# 			if event_key in existing:
# 				row = existing[event_key]
# 				if item.get('result_value') is not None:
# 					row.result_value = item['result_value']
# 				if item.get('lab_test_comment') is not None:
# 					row.lab_test_comment = item['lab_test_comment']
# 			else:
# 				# New row (shouldn't happen normally but handle gracefully)
# 				doc.append('normal_test_items', {
# 					'lab_test_name': item.get('lab_test_name') or event_key,
# 					'lab_test_event': event_key,
# 					'result_value': item.get('result_value') or '',
# 					'lab_test_uom': item.get('lab_test_uom') or '',
# 					'normal_range': item.get('normal_range') or '',
# 					'lab_test_comment': item.get('lab_test_comment') or '',
# 					'template': item.get('template') or '',
# 				})

# 	# Pricing updates
# 	if amount is not None:
# 		doc.amount = amount
# 	if discount_margin is not None:
# 		doc.discount_margin = discount_margin
# 	if discount is not None:
# 		doc.discount = discount
# 	if discount_amount is not None:
# 		doc.discount_amount = discount_amount

# 	# Auto-populate doc.results from the result_value entries in normal_test_items
# 	if doc.normal_test_items:
# 		values = [
# 			str(r.result_value).strip()
# 			for r in doc.normal_test_items
# 			if r.result_value is not None and str(r.result_value).strip()
# 		]
# 		if values:
# 			doc.results = ", ".join(values)

# 	# Recompute grand_total whenever we have an amount
# 	if getattr(doc, "amount", None) is not None:
# 		base = doc.amount or 0
# 		disc_amt = doc.discount_amount or 0
# 		if doc.discount_margin == "Percentage" and doc.discount:
# 			disc_amt = (base * doc.discount) / 100.0
# 			doc.discount_amount = disc_amt
# 		doc.grand_total = base - (disc_amt or 0)

# 	_apply_documents_to_doc(doc, documents)
# 	if submit:
# 		if doc.docstatus == 0:
# 			doc.flags.ignore_permissions = True
# 			doc.save(ignore_permissions=True)
# 			doc.flags.ignore_permissions = True
# 			doc.submit()
# 		else:
# 			# If already submitted, just save changes
# 			doc.save(ignore_permissions=True)
# 	else:
# 		doc.save(ignore_permissions=True)

# 	return {
# 		"name": doc.name,
# 		"docstatus": doc.docstatus,
# 		"status": doc.status,
# 		"custom_result": getattr(doc, "custom_result", None),
# 		"lab_test_comment": getattr(doc, "lab_test_comment", None),
# 		"worksheet_instructions": getattr(doc, "worksheet_instructions", None),
# 		"amount": getattr(doc, "amount", None),
# 		"discount_margin": getattr(doc, "discount_margin", None),
# 		"discount": getattr(doc, "discount", None),
# 		"discount_amount": getattr(doc, "discount_amount", None),
# 		"grand_total": getattr(doc, "grand_total", None),
# 	}
@frappe.whitelist()
def save_and_submit_lab_test(
    name,
    custom_result=None,
    lab_test_comment=None,
    worksheet_instructions=None,
    documents=None,
    normal_test_items=None,
    amount=None,
    discount_margin=None,
    discount=None,
    discount_amount=None,
    lab_technician=None,
    submit: bool = False,
):
    """Save lab results on a draft Lab Test. Submit happens only on doctor review (submit arg is ignored)."""
    if not name:
        frappe.throw(_("Lab Test name is required"))

    doc = frappe.get_doc("Lab Test", name)
    _ensure_lab_result_edit_permission(doc)
    _ensure_lab_result_save_allowed(doc)

    prior_status = doc.status
    results_before = (
        _lab_test_results_snapshot(doc)
        if doc.docstatus == 1 and prior_status == "Reviewed"
        else None
    )
    if doc.docstatus == 1:
        doc.flags.ignore_validate_update_after_submit = True

    if lab_technician is not None:
        doc.lab_technician = lab_technician or None

    if custom_result is not None:
        doc.custom_result = custom_result
    if lab_test_comment is not None:
        doc.lab_test_comment = lab_test_comment
    if worksheet_instructions is not None:
        doc.worksheet_instructions = worksheet_instructions

    # Save editable normal test result rows (result_value + lab_test_comment per row)
    if normal_test_items is not None:
        if isinstance(normal_test_items, str):
            import json
            normal_test_items = json.loads(normal_test_items)
        # Build a lookup by lab_test_event so we can update existing rows in-place
        existing = {(r.get('lab_test_event') or r.get('lab_test_name') or ''): r for r in doc.normal_test_items or []}
        for item in (normal_test_items or []):
            event_key = item.get('lab_test_event') or item.get('lab_test_name') or ''
            if event_key in existing:
                row = existing[event_key]
                if item.get('result_value') is not None:
                    row.result_value = item['result_value']
                if item.get('lab_test_comment') is not None:
                    row.lab_test_comment = item['lab_test_comment']
            else:
                # New row (shouldn't happen normally but handle gracefully)
                doc.append('normal_test_items', {
                    'lab_test_name': item.get('lab_test_name') or event_key,
                    'lab_test_event': event_key,
                    'result_value': item.get('result_value') or '',
                    'lab_test_uom': item.get('lab_test_uom') or '',
                    'normal_range': item.get('normal_range') or '',
                    'lab_test_comment': item.get('lab_test_comment') or '',
                    'template': item.get('template') or '',
                })

    rule_feedback = {"warnings": [], "errors": [], "calculated_updates": []}
    if doc.template:
        # Validate formulas/sums; defer writing calculated siblings until after this doc is saved.
        rule_feedback = apply_rules_to_doc(doc, block_on_error=True, persist_siblings=False)

    # ========== ADD RESULT FLAG CALCULATION HERE ==========
    # Get patient gender
    patient_gender = None
    if doc.patient:
        patient_gender = frappe.db.get_value("Patient", doc.patient, "sex")
    
    # Get ranges from template if available
    female_min = female_max = male_min = male_max = template_min = template_max = None
    if doc.template:
        template_doc = frappe.get_doc("Lab Test Template", doc.template)
        female_min = template_doc.get("female_min_range")
        female_max = template_doc.get("female_max_range")
        male_min = template_doc.get("male_min_range")
        male_max = template_doc.get("male_max_range")
        template_min = template_doc.get("min_range")
        template_max = template_doc.get("max_range")
    
    # Determine which result value to use for flag calculation
    result_to_evaluate = custom_result
    
    # If no custom_result, try to get from normal_test_items
    if not result_to_evaluate and normal_test_items:
        for item in (normal_test_items or []):
            if item.get('result_value'):
                result_to_evaluate = item.get('result_value')
                break
    
    # If still no result, check doc's normal_test_items
    if not result_to_evaluate and doc.normal_test_items:
        for item in doc.normal_test_items:
            if item.result_value:
                result_to_evaluate = item.result_value
                break
    
    # Calculate and set result flag
    if result_to_evaluate:
        doc.result_flag = _calculate_result_flag(
            result_to_evaluate, patient_gender,
            female_min, female_max,
            male_min, male_max,
            template_min, template_max
        )
    else:
        doc.result_flag = ""
    # ========== END RESULT FLAG CALCULATION ==========

    # Pricing updates
    if amount is not None:
        doc.amount = amount
    if discount_margin is not None:
        doc.discount_margin = discount_margin
    if discount is not None:
        doc.discount = discount
    if discount_amount is not None:
        doc.discount_amount = discount_amount

    # Auto-populate doc.results from the result_value entries in normal_test_items
    if doc.normal_test_items:
        values = [
            str(r.result_value).strip()
            for r in doc.normal_test_items
            if r.result_value is not None and str(r.result_value).strip()
        ]
        if values:
            doc.results = ", ".join(values)

    # Recompute grand_total whenever we have an amount
    if getattr(doc, "amount", None) is not None:
        base = doc.amount or 0
        disc_amt = doc.discount_amount or 0
        if doc.discount_margin == "Percentage" and doc.discount:
            disc_amt = (base * doc.discount) / 100.0
            doc.discount_amount = disc_amt
        doc.grand_total = base - (disc_amt or 0)

    _apply_documents_to_doc(doc, documents)

    doc.flags.ignore_permissions = True
    doc.save(ignore_permissions=True)

    # Persist calculated siblings (e.g. Globulin) after inputs are committed.
    if doc.template and getattr(doc, "service_request", None):
        from healthcare.healthcare.lab_test_result_rules import (
            recalculate_panel_for_service_request,
        )

        panel_recalc = recalculate_panel_for_service_request(
            doc.service_request, triggering_lab_test=doc.name
        )
        rule_feedback["calculated_updates"] = panel_recalc.get("calculated_updates") or []
        # Drop pre-save formula warnings; siblings are committed before panel re-run.
        rule_feedback["warnings"] = [
            w
            for w in (rule_feedback.get("warnings") or [])
            if w.get("type") != "formula_missing_inputs"
        ]
        rule_feedback["warnings"].extend(panel_recalc.get("warnings") or [])
        if rule_feedback.get("calculated_updates"):
            rule_feedback["warnings"] = [
                w
                for w in (rule_feedback.get("warnings") or [])
                if w.get("type") != "formula_missing_inputs"
            ]
        # If panel re-run did not persist calculated fields, apply pre-save targets now.
        if not rule_feedback["calculated_updates"] and rule_feedback.get("calculated_targets"):
            from healthcare.healthcare.lab_test_result_rules import (
                _resolve_panel_template_and_rule,
                _sync_calculated_targets_to_lab_tests,
                rule_doc_to_dict,
            )

            panel_template, rule_doc = _resolve_panel_template_and_rule(doc)
            if rule_doc:
                rule_feedback["calculated_updates"] = _sync_calculated_targets_to_lab_tests(
                    doc,
                    rule_doc_to_dict(rule_doc),
                    rule_feedback.get("calculated_targets") or {},
                    service_request=getattr(doc, "service_request", None),
                    lab_test_group=getattr(doc, "lab_test_group", None) or panel_template,
                    persist=True,
                )
    elif doc.template and rule_feedback.get("calculated_targets"):
        from healthcare.healthcare.lab_test_result_rules import (
            _resolve_panel_template_and_rule,
            _sync_calculated_targets_to_lab_tests,
            rule_doc_to_dict,
        )

        panel_template, rule_doc = _resolve_panel_template_and_rule(doc)
        if rule_doc:
            rule_feedback["calculated_updates"] = _sync_calculated_targets_to_lab_tests(
                doc,
                rule_doc_to_dict(rule_doc),
                rule_feedback.get("calculated_targets") or {},
                service_request=getattr(doc, "service_request", None),
                lab_test_group=getattr(doc, "lab_test_group", None) or panel_template,
                persist=True,
            )

    # Results are saved as draft; document submit happens only on doctor review.
    if doc.docstatus == 0 and _lab_test_has_entered_results(doc):
        if doc.status not in ("Reviewed", "Rejected", "Cancelled"):
            frappe.db.set_value(
                "Lab Test",
                doc.name,
                "status",
                "Pending Review",
                update_modified=True,
            )
            doc.status = "Pending Review"
        record_results_entered(doc.name)

    if (
        doc.docstatus == 1
        and prior_status == "Reviewed"
        and results_before is not None
        and _lab_test_results_snapshot(doc) != results_before
    ):
        frappe.db.set_value(
            "Lab Test",
            doc.name,
            "status",
            "Pending Review",
            update_modified=True,
        )
        doc.status = "Pending Review"
        record_results_entered(doc.name)

    if submit and doc.docstatus == 0:
        frappe.msgprint(
            _(
                "Lab results were saved. The Lab Test will be submitted when a doctor completes the review."
            ),
            alert=True,
        )

    return {
        "name": doc.name,
        "docstatus": doc.docstatus,
        "status": doc.status,
        "custom_result": getattr(doc, "custom_result", None),
        "result_flag": getattr(doc, "result_flag", None),  # ADD THIS LINE
        "lab_test_comment": getattr(doc, "lab_test_comment", None),
        "worksheet_instructions": getattr(doc, "worksheet_instructions", None),
        "amount": getattr(doc, "amount", None),
        "discount_margin": getattr(doc, "discount_margin", None),
        "discount": getattr(doc, "discount", None),
        "discount_amount": getattr(doc, "discount_amount", None),
        "grand_total": getattr(doc, "grand_total", None),
        "rule_warnings": rule_feedback.get("warnings") or [],
        "rule_errors": rule_feedback.get("errors") or [],
        "calculated_updates": rule_feedback.get("calculated_updates") or [],
    }
    
@frappe.whitelist()
def recalculate_result_flags(lab_test_name=None):
    """Recalculate result flags for one or all lab tests."""
    
    filters = {}
    if lab_test_name:
        filters["name"] = lab_test_name
    
    lab_tests = frappe.get_all("Lab Test", filters=filters, fields=["name", "patient", "template", "custom_result"])
    
    updated = []
    for lt in lab_tests:
        doc = frappe.get_doc("Lab Test", lt.name)
        
        # Get patient gender
        patient_gender = frappe.db.get_value("Patient", doc.patient, "sex") if doc.patient else None
        
        # Get ranges from template
        female_min = female_max = male_min = male_max = template_min = template_max = None
        if doc.template:
            template_doc = frappe.get_doc("Lab Test Template", doc.template)
            female_min = template_doc.get("female_min_range")
            female_max = template_doc.get("female_max_range")
            male_min = template_doc.get("male_min_range")
            male_max = template_doc.get("male_max_range")
            template_min = template_doc.get("min_range")
            template_max = template_doc.get("max_range")
        
        # Get result value
        result_value = doc.custom_result
        if not result_value and doc.normal_test_items:
            for item in doc.normal_test_items:
                if item.result_value:
                    result_value = item.result_value
                    break
        
        # Calculate new flag
        new_flag = _calculate_result_flag(
            result_value, patient_gender,
            female_min, female_max,
            male_min, male_max,
            template_min, template_max
        )
        
        if doc.result_flag != new_flag:
            doc.db_set("result_flag", new_flag)
            updated.append({"name": doc.name, "old_flag": doc.result_flag, "new_flag": new_flag})
    
    return {"updated": updated, "count": len(updated)}

@frappe.whitelist()
def update_lab_test_remarks(name, remarks=None):
	"""Update the Remarks table on a Lab Test. remarks can be a list of dicts with key 'rrmark' (Remark child table)."""
	if not name:
		frappe.throw(_("Lab Test name is required"))
	doc = frappe.get_doc("Lab Test", name)
	if doc.docstatus == 2:
		frappe.throw(_("Cannot update a cancelled Lab Test"))
	if remarks is not None:
		if isinstance(remarks, str):
			import json
			remarks = json.loads(remarks)
		doc.remarks = []
		for row in (remarks or []):
			if not isinstance(row, dict):
				continue
			rrmark = (row.get("rrmark") or "").strip()
			if rrmark:
				doc.append("remarks", {"rrmark": rrmark})
	doc.save(ignore_permissions=True)
	out_remarks = [{"rrmark": getattr(r, "rrmark", None) or ""} for r in doc.remarks]
	return {"name": name, "remarks": out_remarks}


@frappe.whitelist()
def update_lab_test_basic(name, data=None):
	"""Update basic editable fields on a Lab Test (Draft only) from the React UI.

	Allowed fields:
	- template
	- practitioner
	- department
	- service_unit
	- date
	- time
	- status
	"""
	if not name:
		frappe.throw(_("Lab Test name is required"))

	if isinstance(data, str):
		import json
		data = json.loads(data)

	data = data or {}

	doc = frappe.get_doc("Lab Test", name)

	# Only allow editing in Draft
	if doc.docstatus != 0:
		frappe.throw(_("Only Draft lab tests can be edited from this screen"))

	allowed = {"template", "practitioner", "service_unit", "date", "time", "status",
			   "priority", "is_outsourced", "outsource_lab_name", "outsource_ref_no"}

	for key, value in data.items():
		if key in allowed and hasattr(doc, key):
			doc.set(key, value)

	# Auto-advance status when marking as outsourced
	if data.get("is_outsourced") and doc.status not in (
		"Testing in Progress", "Completed", "Pending Review", "Reviewed", "Approved", "Rejected", "Cancelled"
	):
		doc.status = "Testing in Progress"

	doc.save(ignore_permissions=True)

	return {
		"name": doc.name,
		"patient": doc.patient,
		"patient_name": getattr(doc, "patient_name", None),
		"template": doc.template,
		"lab_test_name": getattr(doc, "lab_test_name", None),
		"practitioner": doc.practitioner,
		"practitioner_name": getattr(doc, "practitioner_name", None),
		# "department": doc.department,
		"service_unit": getattr(doc, "service_unit", None),
		"date": getattr(doc, "date", None),
		"time": getattr(doc, "time", None),
		"status": doc.status,
		"is_outsourced": getattr(doc, "is_outsourced", 0),
		"outsource_lab_name": getattr(doc, "outsource_lab_name", None),
		"outsource_ref_no": getattr(doc, "outsource_ref_no", None),
	}


@frappe.whitelist()
def create_lab_test(data):
	"""Create a new Lab Test"""
	if isinstance(data, str):
		import json
		data = json.loads(data)
	
	# Validate required fields
	if not data.get('patient'):
		frappe.throw(_("Patient is required"))
	if not data.get('cost_center'):
		frappe.throw(_("Cost Center is required"))

	# Optional but recommended clinical context: either inpatient admission or patient visit
	# (only enforce when the fields exist in payload, so older callers are not broken)
	if not data.get('inpatient_record') and not data.get('patient_visit'):
		frappe.msgprint(
			_("It is recommended to link a Lab Test to either a Patient Visit or an Inpatient Admission for better context."),
			title=_("Missing Clinical Context"),
			indicator="orange",
		)
	
	# Fetch patient details
	patient = frappe.get_doc('Patient', data.get('patient'))
	patient_sex = patient.sex if patient.sex else None
	
	if not patient_sex:
		frappe.throw(_("Patient gender is required. Please update the patient record with gender information."))
	
	# Get naming series
	naming_series = frappe.db.get_value('Lab Test', {'naming_series': 'HLC-LAB-.YYYY.-'}, 'naming_series')
	if not naming_series:
		naming_series = 'HLC-LAB-.YYYY.-'
	
	# Create the lab test
	lab_test = frappe.get_doc({
		'doctype': 'Lab Test',
		'patient': data.get('patient'),
		'patient_sex': patient_sex,
		'cost_center': data.get('cost_center'),
		'template': data.get('template'),
		'practitioner': data.get('practitioner'),
		'date': data.get('date') or frappe.utils.today(),
		'time': data.get('time') or frappe.utils.now_time(),
		# 'department': data.get('department'),
		'service_unit': data.get('service_unit'),
		'status': data.get('status') or 'Draft',
		'naming_series': naming_series
	})
	
	lab_test.insert(ignore_permissions=True)

	# Append documents if provided (same child table as Patient/Discharge/Admission)
	documents = data.get('documents')
	if documents:
		if isinstance(documents, str):
			import json
			documents = json.loads(documents)
		for row in (documents or []):
			if not isinstance(row, dict):
				continue
			if not (row.get('file_name') or row.get('document_name') or row.get('document')):
				continue
			# file_name in Patient Upload Document is Link to "Document Type"; use document_name (Data) for display/filename
			user_label = row.get('file_name') or row.get('document_name') or ''
			doc_type = row.get('document_type') or None
			lab_test.append('documents', {
				'document_name': user_label,
				'file_name': doc_type if doc_type and frappe.db.exists('Document Type', doc_type) else None,
				'document_type': doc_type,
				'transaction_no': row.get('transaction_no') or None,
				'upload_remarks': row.get('upload_remarks') or None,
				'document': row.get('document') or None,
			})
		if lab_test.documents:
			lab_test.save(ignore_permissions=True)

	# Return the created lab test
	return {
		'name': lab_test.name,
		'patient': lab_test.patient,
		'patient_name': frappe.db.get_value('Patient', lab_test.patient, 'patient_name') or lab_test.patient,
		'practitioner': lab_test.practitioner,
		'practitioner_name': lab_test.practitioner_name if lab_test.practitioner else None,
		'lab_test_name': lab_test.lab_test_name,
		'template': lab_test.template,
		'status': lab_test.status
	}

@frappe.whitelist()
def update_lab_test_status(lab_test_name: str, new_status: str, **kwargs):
	"""
	Legacy entry point — forwards to structured doctor review when review fields are sent.
	"""
	from healthcare.api.lab_test_doctor_review import submit_doctor_lab_test_review

	if kwargs.get("review_result_indicator"):
		return submit_doctor_lab_test_review(
			lab_test_name=lab_test_name,
			new_status=new_status,
			**kwargs,
		)

	frappe.throw(
		_(
			"Lab test review requires result indicator and follow-up actions. "
			"Please complete the review form."
		)
	)


SAMPLE_COLLECTION_EDITABLE_LAB_TEST_STATUSES = frozenset(
	{
		"Awaiting sample collection",
		"Sample Collection in Progress",
		"Sample Collected",
		"Sample collection in progress",
	}
)


def _lab_test_allows_sample_collection_edit(lab_test) -> bool:
	status = (getattr(lab_test, "status", None) or "").strip()
	return status in SAMPLE_COLLECTION_EDITABLE_LAB_TEST_STATUSES


def _valid_lab_test_sample(sample_name) -> str | None:
	"""Return sample name only when it exists on Lab Test Sample (avoids bogus defaults like Urine)."""
	if not sample_name:
		return None
	sample_name = str(sample_name).strip()
	if not sample_name or not frappe.db.exists("Lab Test Sample", sample_name):
		return None
	return sample_name


def _observation_row_has_content(obs: dict, fallback_sample=None) -> bool:
	sample = _valid_lab_test_sample(obs.get("sample") or fallback_sample)
	if sample:
		return True
	if (obs.get("specimen") or "").strip():
		return True
	if frappe.utils.flt(obs.get("sample_qty") or 0) > 0:
		return True
	if obs.get("observation_template"):
		return True
	return False


def _serialize_observation_sample_rows(sample_doc) -> list[dict]:
	rows = []
	for obs in sample_doc.get("observation_sample_collection") or []:
		sample = _valid_lab_test_sample(obs.get("sample"))
		if not sample and not _observation_row_has_content(obs.as_dict() if hasattr(obs, "as_dict") else dict(obs)):
			continue
		rows.append(
			{
				"sample": sample,
				"sample_type": obs.get("sample_type"),
				"uom": obs.get("uom"),
				"status": obs.get("status"),
				"observation_template": obs.get("observation_template"),
				"collection_date_time": str(obs.get("collection_date_time") or ""),
				"sample_qty": obs.get("sample_qty"),
				"collection_point": obs.get("collection_point"),
				"collected_by": obs.get("collected_by"),
				"specimen": obs.get("specimen"),
			}
		)
	return rows


def _scrub_invalid_observation_sample_rows(sample_doc):
	"""Remove child rows with invalid sample links (e.g. doctype default 'Urine' with no real data)."""
	remove_rows = []
	for obs in sample_doc.get("observation_sample_collection") or []:
		sample = (obs.get("sample") or "").strip()
		if not sample or frappe.db.exists("Lab Test Sample", sample):
			continue
		if not _observation_row_has_content(obs):
			remove_rows.append(obs)
		else:
			obs.sample = ""
	for obs in remove_rows:
		sample_doc.remove(obs)


def _apply_observation_rows(sample_doc, observation_rows, fallback_sample=None, fallback_qty=0):
	if observation_rows is None:
		return
	if isinstance(observation_rows, str):
		import json

		observation_rows = json.loads(observation_rows)

	valid_fallback_sample = _valid_lab_test_sample(fallback_sample)
	sample_doc.set("observation_sample_collection", [])
	for obs in observation_rows or []:
		if not isinstance(obs, dict):
			continue
		if not _observation_row_has_content(obs, valid_fallback_sample):
			continue

		sample_val = _valid_lab_test_sample(obs.get("sample") or valid_fallback_sample)
		status = (obs.get("status") or "Open").strip()
		if status not in ("Open", "Collected"):
			status = "Open"

		row_data = {
			# Explicit empty string prevents the child-table default ("Urine") when no sample is set.
			"sample": sample_val or "",
			"sample_type": obs.get("sample_type") or "",
			"uom": obs.get("uom") or "",
			"status": status,
			"observation_template": obs.get("observation_template") or "",
			"collection_date_time": obs.get("collection_date_time") or frappe.utils.now_datetime(),
			"sample_qty": frappe.utils.flt(obs.get("sample_qty") or fallback_qty or 0),
			"collection_point": obs.get("collection_point") or "",
			"collected_by": obs.get("collected_by") or "",
			"specimen": obs.get("specimen") or "",
		}
		sample_doc.append("observation_sample_collection", row_data)


@frappe.whitelist()
def get_sample_collection_for_lab_sample(lab_test_name: str, row_index: int):
	"""Return Sample Collection data for editing a lab test sample_instances row."""
	if not lab_test_name:
		frappe.throw(_("Lab Test name is required"))

	try:
		row_index = int(row_index)
	except Exception:
		frappe.throw(_("Row index is required"), title=_("Invalid Input"))

	doc = frappe.get_doc("Lab Test", lab_test_name)
	rows = doc.get("sample_instances") or []
	if row_index < 0 or row_index >= len(rows):
		frappe.throw(_("Invalid sample instance row"), title=_("Invalid Row"))

	row = rows[row_index]
	if not getattr(row, "sample_collection", None):
		frappe.throw(_("No sample collection linked to this row"))

	if not _lab_test_allows_sample_collection_edit(doc):
		frappe.throw(
			_(
				"Sample collection can only be edited while the Lab Test is still in the sample collection workflow."
			),
			frappe.PermissionError,
		)

	if not frappe.db.exists("Sample Collection", row.sample_collection):
		frappe.throw(_("Sample Collection {0} not found").format(row.sample_collection))

	sample_doc = frappe.get_doc("Sample Collection", row.sample_collection)
	if getattr(sample_doc, "docstatus", 0) >= 1:
		frappe.throw(_("Submitted Sample Collection records cannot be edited from the portal"))

	referring_practitioner_name = None
	if sample_doc.referring_practitioner:
		referring_practitioner_name = frappe.db.get_value(
			"Healthcare Practitioner",
			sample_doc.referring_practitioner,
			"practitioner_name",
		)

	return {
		"sample_collection": sample_doc.name,
		"sample": sample_doc.sample or getattr(row, "sample", None),
		"sample_qty": sample_doc.sample_qty if sample_doc.sample_qty is not None else getattr(row, "sample_qty", None),
		"sample_details": _plain_sample_details(
			sample_doc.sample_details or getattr(row, "sample_details", None)
		),
		"collection_point": sample_doc.collection_point,
		"referring_practitioner": sample_doc.referring_practitioner,
		"referring_practitioner_name": referring_practitioner_name,
		"observation_rows": _serialize_observation_sample_rows(sample_doc),
		"lab_test_status": doc.status,
	}


@frappe.whitelist()
def update_sample_collection_for_lab_sample(
	lab_test_name: str,
	row_index: int,
	sample_details: str | None = None,
	collection_point: str | None = None,
	referring_practitioner: str | None = None,
	observation_rows: str | list | None = None,
	sample_qty: float | int | str | None = None,
):
	"""Update an existing Sample Collection linked to a lab test sample_instances row."""
	if not lab_test_name:
		frappe.throw(_("Lab Test name is required"))

	try:
		row_index = int(row_index)
	except Exception:
		frappe.throw(_("Row index is required"), title=_("Invalid Input"))

	sample_qty_value = None
	if sample_qty is not None and sample_qty != "":
		sample_qty_value = frappe.utils.flt(sample_qty)

	doc = frappe.get_doc("Lab Test", lab_test_name)
	if not _lab_test_allows_sample_collection_edit(doc):
		frappe.throw(
			_(
				"Sample collection can only be edited while the Lab Test is still in the sample collection workflow."
			),
			frappe.PermissionError,
		)

	rows = doc.get("sample_instances") or []
	if row_index < 0 or row_index >= len(rows):
		frappe.throw(_("Invalid sample instance row"), title=_("Invalid Row"))

	row = rows[row_index]
	if not getattr(row, "sample_collection", None):
		frappe.throw(_("No sample collection linked to this row"))

	if not frappe.db.exists("Sample Collection", row.sample_collection):
		frappe.throw(_("Sample Collection {0} not found").format(row.sample_collection))

	sample_doc = frappe.get_doc("Sample Collection", row.sample_collection)
	if getattr(sample_doc, "docstatus", 0) >= 1:
		frappe.throw(_("Submitted Sample Collection records cannot be edited from the portal"))

	if sample_qty_value is not None:
		sample_doc.sample_qty = sample_qty_value
		row.sample_qty = sample_qty_value

	if sample_details is not None:
		sample_details = _plain_sample_details(sample_details)
		sample_doc.sample_details = sample_details
		row.sample_details = sample_details

	if collection_point is not None:
		sample_doc.collection_point = collection_point

	if referring_practitioner is not None:
		sample_doc.referring_practitioner = referring_practitioner or None

	if observation_rows is not None:
		_apply_observation_rows(
			sample_doc,
			observation_rows,
			fallback_sample=getattr(row, "sample", None),
			fallback_qty=sample_doc.sample_qty,
		)
	else:
		_scrub_invalid_observation_sample_rows(sample_doc)

	sample_doc.save(ignore_permissions=True)
	doc.save(ignore_permissions=True)

	return {"sample_collection": sample_doc.name}


@frappe.whitelist()
def create_sample_collection_for_lab_sample(
	lab_test_name: str,
	row_index: int,
	sample_details: str | None = None,
	collection_point: str | None = None,
	referring_practitioner: str | None = None,
	observation_rows: str | list | None = None,
	sample_qty: float | int | str | None = None,
):
	"""Create (or return existing) Sample Collection for a specific sample_instances row on Lab Test.

	row_index is 0-based index into lab_test.sample_instances.
	When the Lab Test has no sample rows yet, a row is created from sample_qty / sample_details.
	"""
	if not lab_test_name:
		frappe.throw(_("Lab Test name is required"))

	try:
		row_index = int(row_index)
	except Exception:
		frappe.throw(_("Row index is required"), title=_("Invalid Input"))

	sample_qty_value = None
	if sample_qty is not None and sample_qty != "":
		sample_qty_value = frappe.utils.flt(sample_qty)

	doc = frappe.get_doc("Lab Test", lab_test_name)
	rows = doc.get("sample_instances") or []

	if not rows and (sample_details or sample_qty_value is not None):
		child = doc.append("sample_instances", {})
		if sample_qty_value is not None:
			child.sample_qty = sample_qty_value
		if sample_details:
			child.sample_details = _plain_sample_details(sample_details)
		doc.save(ignore_permissions=True)
		rows = doc.get("sample_instances") or []
		row_index = 0

	if row_index < 0 or row_index >= len(rows):
		frappe.throw(_("Invalid sample instance row"), title=_("Invalid Row"))

	row = rows[row_index]

	# If already linked, just return existing Sample Collection
	if getattr(row, "sample_collection", None) and frappe.db.exists("Sample Collection", row.sample_collection):
		return {"sample_collection": row.sample_collection}

	if sample_qty_value is not None:
		row.sample_qty = sample_qty_value
	if sample_details:
		sample_details = _plain_sample_details(sample_details)
		row.sample_details = sample_details

	row_details = sample_details or _plain_sample_details(getattr(row, "sample_details", None))
	if not getattr(row, "sample", None) and not row_details:
		frappe.throw(_("Sample or collection details is required on the selected row"))

	if not doc.patient:
		frappe.throw(_("Patient is required on Lab Test"))

	patient = frappe.get_doc("Patient", doc.patient)

	sample_doc = frappe.new_doc("Sample Collection")
	sample_doc.patient = patient.name
	sample_doc.patient_age = patient.get_age()
	sample_doc.patient_sex = patient.sex
	if getattr(row, "sample", None):
		sample_doc.sample = row.sample
		# UOM from Lab Test Sample
		uom = frappe.db.get_value("Lab Test Sample", row.sample, "sample_uom")
		if uom:
			sample_doc.sample_uom = uom
	sample_doc.sample_qty = frappe.utils.flt(getattr(row, "sample_qty", 0) or 0)
	# Prefer explicit sample_details from caller, fall back to row (plain text only)
	sample_doc.sample_details = sample_details or _plain_sample_details(getattr(row, "sample_details", None))
	if doc.company:
		sample_doc.company = doc.company
	if collection_point:
		sample_doc.collection_point = collection_point
	if referring_practitioner:
		sample_doc.referring_practitioner = referring_practitioner

	_apply_observation_rows(
		sample_doc,
		observation_rows,
		fallback_sample=getattr(row, "sample", None),
		fallback_qty=getattr(row, "sample_qty", 0),
	)
	_scrub_invalid_observation_sample_rows(sample_doc)

	sample_doc.save(ignore_permissions=True)

	# Link back to sample_instances row (and keep latest details in row)
	row.sample_collection = sample_doc.name
	if sample_details:
		row.sample_details = sample_details

	# Update Lab Test status based on how many sample instances are linked
	rows = doc.get("sample_instances") or []
	total = len(rows)
	linked = 0
	for r in rows:
		if getattr(r, "sample_collection", None):
			linked += 1

	if linked <= 0:
		# No samples collected yet
		doc.status = "Awaiting sample collection"
	elif linked < total:
		# At least one collected, but not all
		doc.status = "Sample Collection in Progress"
	else:
		# All samples have a Sample Collection
		doc.status = "Sample Collected"

	doc.save(ignore_permissions=True)

	return {"sample_collection": sample_doc.name}


# healthcare/api/lab_test.py

import frappe
from frappe import _

@frappe.whitelist()
def get_lab_tests_by_inpatient_record(inpatient_record: str):
    """
    Get all lab tests for a specific inpatient admission
    """
    if not inpatient_record:
        frappe.throw(_("Inpatient record is required"))
    
    lab_tests = frappe.get_all(
        "Lab Test",
        filters={
            "inpatient_record": inpatient_record,
            "docstatus": ("!=", 2)  # Not cancelled
        },
        fields=[
            "name", "patient", "patient_name", "lab_test_name", "template",
            "status", "date", "result_date", "submitted_date", "approved_date",
            "practitioner", "practitioner_name", "department", "invoiced",
            "amount", "grand_total", "results", "descriptive_result", "lab_test_comment"
        ],
        order_by="date desc"
    )
    
    return lab_tests


@frappe.whitelist()
def get_lab_test_by_id(name: str):
    """
    Get a single lab test by ID with all details
    """
    if not name:
        frappe.throw(_("Lab test name is required"))
    
    doc = frappe.get_doc("Lab Test", name)
    
    # Get normal test items
    normal_items = []
    for item in doc.normal_test_items:
        normal_items.append({
            "lab_test_name": item.lab_test_name,
            "lab_test_event": item.lab_test_event,
            "result_value": item.result_value,
            "min_range": item.min_range,
            "max_range": item.max_range,
            "result_date": item.result_date,
            "in_range": item.in_range,
            "allow_edit": item.allow_edit
        })
    
    # Get sensitivity test items
    sensitivity_items = []
    for item in doc.sensitivity_test_items:
        sensitivity_items.append({
            "antibiotic": item.antibiotic,
            "sensitivity": item.sensitivity,
            "antibiotic_sensitivity": item.antibiotic_sensitivity
        })
    
    return {
        "name": doc.name,
        "patient": doc.patient,
        "patient_name": doc.patient_name,
        "lab_test_name": doc.lab_test_name,
        "template": doc.template,
        "status": doc.status,
        "date": doc.date,
        "result_date": doc.result_date,
        "submitted_date": doc.submitted_date,
        "approved_date": doc.approved_date,
        "practitioner": doc.practitioner,
        "practitioner_name": doc.practitioner_name,
        "department": doc.department,
        "inpatient_record": doc.inpatient_record,
        "service_unit": doc.service_unit,
        "invoiced": doc.invoiced,
        "amount": doc.amount,
        "grand_total": doc.grand_total,
        "results": doc.results,
        "descriptive_result": doc.descriptive_result,
        "lab_test_comment": doc.lab_test_comment,
        "normal_test_items": normal_items,
        "sensitivity_test_items": sensitivity_items
    }


@frappe.whitelist(allow_guest=False)
def finish_group_lab_tests(service_request_name: str):
	"""Mark grouped lab request as finished only if all child tests are completed."""
	if not service_request_name:
		frappe.throw(_("Service Request name is required"))

	if not frappe.db.exists("Service Request", service_request_name):
		frappe.throw(_("Service Request not found"))

	lab_tests = frappe.get_all(
		"Lab Test",
		filters={"service_request": service_request_name, "docstatus": ["!=", 2]},
		fields=["name", "docstatus", "status", "is_group_lab_test"],
		order_by="creation asc",
	)

	if not lab_tests:
		frappe.throw(_("No Lab Tests found for this Service Request"))

	grouped = [lt for lt in lab_tests if int(lt.get("is_group_lab_test") or 0) == 1]
	if not grouped:
		frappe.throw(_("This Service Request is not a grouped lab request"))

	current_sr_status = frappe.db.get_value("Service Request", service_request_name, "status")
	if current_sr_status == GROUP_FINISHED_SR_STATUS:
		return {
			"ok": True,
			"service_request": service_request_name,
			"finished": True,
			"already_finished": True,
		}

	done_statuses = {"Completed", "Pending Review", "Reviewed", "Rejected"}
	incomplete = [
		lt.get("name")
		for lt in grouped
		if lt.get("status") not in done_statuses
	]

	if incomplete:
		frappe.throw(_("Cannot finish group. Pending tests: {0}").format(", ".join(incomplete)))

	frappe.db.set_value(
		"Service Request",
		service_request_name,
		"status",
		"completed-Request Status",
		update_modified=True,
	)

	return {"ok": True, "service_request": service_request_name, "finished": True}