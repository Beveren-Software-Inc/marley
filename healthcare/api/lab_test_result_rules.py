# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

import json

import frappe

from healthcare.healthcare.lab_test_result_rules import (
	apply_rules,
	get_enabled_rule_doc,
	get_group_child_templates,
	rule_doc_to_dict,
)


@frappe.whitelist()
def get_lab_test_result_rules(template):
	"""Return rule configuration for a Lab Test Template (for result-entry UI)."""
	if not template:
		return {}
	rule_doc = get_enabled_rule_doc(template)
	if not rule_doc:
		return {}
	return rule_doc_to_dict(rule_doc)


@frappe.whitelist()
def get_group_child_sum_events(parent_template):
	"""Return child Lab Test Templates for populating Sum Events on a panel rule."""
	return get_group_child_templates(parent_template)


@frappe.whitelist()
def get_template_sum_events(template):
	"""Backward-compatible alias — loads group child tests, not compound rows."""
	return get_group_child_templates(template)


@frappe.whitelist()
def apply_lab_test_result_rules(
	template, normal_test_items=None, service_request=None, lab_test_group=None, patient=None
):
	"""Apply formula/sum/ratio rules to normal_test_items and return updated rows + messages."""
	if isinstance(normal_test_items, str):
		normal_test_items = json.loads(normal_test_items or "[]")
	items = normal_test_items or []
	if not template:
		return {
			"items": items,
			"warnings": [],
			"errors": [],
			"readonly_events": [],
		}
	rule_doc = get_enabled_rule_doc(template)
	rules = rule_doc_to_dict(rule_doc) if rule_doc else None
	return apply_rules(
		template,
		items,
		rule_doc=rules,
		service_request=service_request or None,
		lab_test_group=lab_test_group or None,
		patient=patient or None,
	)


@frappe.whitelist()
def recalculate_panel_for_service_request(service_request):
	"""Re-apply panel formulas for every lab test on a service request."""
	from healthcare.healthcare.lab_test_result_rules import recalculate_panel_for_service_request as _recalc

	return _recalc(service_request)
