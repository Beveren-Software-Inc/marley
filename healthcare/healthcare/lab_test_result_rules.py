# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

"""Evaluate Lab Test Result Rule records against normal_test_items rows."""

from __future__ import annotations

import ast
import operator
import re
from typing import Any

import frappe
from frappe import _

_DECIMALS = 2

_ALLOWED_BINOPS = {
	ast.Add: operator.add,
	ast.Sub: operator.sub,
	ast.Mult: operator.mul,
	ast.Div: operator.truediv,
	ast.FloorDiv: operator.floordiv,
	ast.Mod: operator.mod,
	ast.Pow: operator.pow,
}
_ALLOWED_UNARYOPS = {
	ast.UAdd: operator.pos,
	ast.USub: operator.neg,
}


def _norm_key(value: str | None) -> str:
	return (value or "").strip().casefold()


def _parse_float(value) -> float | None:
	if value is None:
		return None
	text = str(value).strip()
	if not text:
		return None
	try:
		return float(text)
	except (TypeError, ValueError):
		return None


def _format_sum_validation_user_message(
	labels: list[str], total: float, target: float, tolerance: float
) -> str:
	"""Short, readable message for clinicians (not a raw exception string)."""
	low = target - tolerance
	high = target + tolerance
	total_s = _format_result(total)
	target_s = _format_result(target)
	low_s = _format_result(low)
	high_s = _format_result(high)

	if len(labels) <= 6:
		tests = ", ".join(labels)
	else:
		tests = ", ".join(labels[:5]) + _(", and {0} more").format(len(labels) - 5)

	return _(
		"The differential counts for this panel add up to {total}% "
		"(they should total {target}%, acceptable range {low}%–{high}%).\n\n"
		"Tests checked: {tests}.\n\n"
		"Adjust the results or update the Lab Test Result Rule so only the "
		"percentage differentials are included (usually five tests on a CBC)."
	).format(
		total=total_s,
		target=target_s,
		low=low_s,
		high=high_s,
		tests=tests,
	)


def _format_sum_validation_short_message(
	labels: list[str], total: float, target: float, tolerance: float
) -> str:
	"""One-line summary for toasts."""
	low = _format_result(target - tolerance)
	high = _format_result(target + tolerance)
	return _(
		"Differential total is {total}% (should be {target}%, range {low}%–{high}%)."
	).format(
		total=_format_result(total),
		target=_format_result(target),
		low=low,
		high=high,
	)


def _format_result(value: float) -> str:
	rounded = round(value, _DECIMALS)
	if rounded == int(rounded):
		return str(int(rounded))
	return f"{rounded:.{_DECIMALS}f}".rstrip("0").rstrip(".")


def _safe_eval_arithmetic(expr: str) -> float:
	node = ast.parse(expr.strip(), mode="eval").body
	return float(_eval_ast(node))


def _eval_ast(node):
	if isinstance(node, ast.Constant):
		if isinstance(node.value, (int, float)):
			return node.value
		raise ValueError(_("Invalid constant in formula"))
	# ast.Num removed in Python 3.12+; only reference it when present
	_ast_num = getattr(ast, "Num", None)
	if _ast_num is not None and isinstance(node, _ast_num):
		return node.n
	if isinstance(node, ast.BinOp):
		op_type = type(node.op)
		if op_type not in _ALLOWED_BINOPS:
			raise ValueError(_("Unsupported operator in formula"))
		left = _eval_ast(node.left)
		right = _eval_ast(node.right)
		return _ALLOWED_BINOPS[op_type](left, right)
	if isinstance(node, ast.UnaryOp):
		op_type = type(node.op)
		if op_type not in _ALLOWED_UNARYOPS:
			raise ValueError(_("Unsupported unary operator in formula"))
		return _ALLOWED_UNARYOPS[op_type](_eval_ast(node.operand))
	raise ValueError(_("Invalid expression in formula"))


def _aliases_from_row(row) -> list[str]:
	raw = (getattr(row, "aliases", None) or row.get("aliases") if isinstance(row, dict) else None) or ""
	return [a.strip() for a in raw.split(",") if a.strip()]


def _display_name_for_template(template: str) -> str:
	if not template:
		return ""
	if frappe.db.exists("Lab Test Template", template):
		return (
			frappe.db.get_value("Lab Test Template", template, "lab_test_name") or template
		)
	return template


def _event_names_from_rule_event(row) -> list[str]:
	"""Identifiers used to match a child test's result (template name, display name, aliases)."""
	tpl = (getattr(row, "lab_test_event", None) or row.get("lab_test_event") or "").strip()
	if not tpl:
		return []
	names = [tpl]
	display = _display_name_for_template(tpl)
	if display and display not in names:
		names.append(display)
	for alias in _aliases_from_row(row):
		if alias not in names:
			names.append(alias)
	return names


def get_group_child_templates(parent_template: str) -> list[dict[str, str]]:
	"""Child Lab Test Templates that belong to a panel (CBC, Lipid, etc.)."""
	if not parent_template or not frappe.db.exists("Lab Test Template", parent_template):
		return []

	seen: set[str] = set()
	children: list[dict[str, str]] = []

	def _add(template_name: str):
		if not template_name or template_name in seen:
			return
		seen.add(template_name)
		children.append(
			{
				"lab_test_event": template_name,
				"lab_test_name": _display_name_for_template(template_name),
			}
		)

	for row in frappe.get_all(
		"Lab Test Template",
		filters={"lab_group": parent_template, "disabled": 0},
		fields=["name"],
		order_by="lab_test_name asc",
	):
		_add(row.name)

	parent_doc = frappe.get_doc("Lab Test Template", parent_template)
	for row in parent_doc.get("lab_test_group_templates") or []:
		if (row.template_or_new_line or "").strip() == "Add Test" and row.lab_test_template:
			_add(row.lab_test_template)

	return children


def _absorb_lab_test_result_into_values(lt, values: dict[str, float], allowed_templates: set[str] | None = None) -> None:
	"""Add one Lab Test document's numeric result into the formula variable map."""
	if not lt:
		return
	tpl = (getattr(lt, "template", None) or "").strip()
	if allowed_templates and tpl and tpl not in allowed_templates:
		display_tpl = _display_name_for_template(tpl)
		lab_name = (getattr(lt, "lab_test_name", None) or "").strip()
		allowed_names = {_norm_key(t) for t in allowed_templates}
		allowed_names.update(_norm_key(_display_name_for_template(t)) for t in allowed_templates)
		if _norm_key(tpl) not in allowed_names and _norm_key(display_tpl) not in allowed_names:
			if not lab_name or _norm_key(lab_name) not in allowed_names:
				return

	val = _parse_float(getattr(lt, "custom_result", None))
	if val is None:
		for item in lt.normal_test_items or []:
			val = _parse_float(getattr(item, "result_value", None))
			if val is not None:
				break
	if val is None:
		return

	for key in filter(
		None,
		[
			tpl,
			_display_name_for_template(tpl),
			getattr(lt, "lab_test_name", None),
		],
	):
		values[key] = val


def collect_panel_result_values(
	panel_template: str,
	*,
	service_request: str | None = None,
	lab_test_group: str | None = None,
	patient: str | None = None,
	current_doc=None,
) -> dict[str, float]:
	"""Gather numeric results for all child tests in a panel (multiple linking strategies)."""
	values: dict[str, float] = {}
	if not panel_template:
		return values

	child_templates = [
		c["lab_test_event"] for c in get_group_child_templates(panel_template) if c.get("lab_test_event")
	]
	allowed = set(child_templates)
	if current_doc:
		_merge_lab_test_custom_result_into_values(current_doc, values)

	if not child_templates and not current_doc:
		return values

	seen_lab_tests: set[str] = set()

	def _absorb_name(lab_test_name: str | None, *, restrict_to_panel: bool = True):
		if not lab_test_name or lab_test_name in seen_lab_tests:
			return
		seen_lab_tests.add(lab_test_name)
		allowed_filter = (allowed or None) if restrict_to_panel else None
		_absorb_lab_test_result_into_values(
			frappe.get_doc("Lab Test", lab_test_name), values, allowed_filter
		)

	if service_request:
		# Multi-test service requests often mix singles + groups; include every
		# lab test on the request so formulas (e.g. Total Protein − Albumin) work.
		# Do not fall through to patient/group queries — they load other visits and
		# overwrite correct values (e.g. 91 − 78 = 13 instead of 20 − 78 = −58).
		for row in frappe.get_all(
			"Lab Test",
			filters={"service_request": service_request, "docstatus": ["!=", 2]},
			fields=["name"],
			order_by="modified asc",
		):
			_absorb_name(row.name, restrict_to_panel=False)
		return values

	for group_key in {k for k in (lab_test_group, panel_template) if k}:
		group_filters: dict[str, Any] = {
			"lab_test_group": group_key,
			"docstatus": ["!=", 2],
		}
		if patient:
			group_filters["patient"] = patient
		for row in frappe.get_all(
			"Lab Test",
			filters=group_filters,
			fields=["name"],
			order_by="modified asc",
		):
			_absorb_name(row.name)

	if patient:
		for tpl in child_templates:
			lt_name = frappe.db.get_value(
				"Lab Test",
				{"patient": patient, "template": tpl, "docstatus": ["!=", 2]},
				"name",
				order_by="modified desc",
			)
			if not lt_name:
				display = _display_name_for_template(tpl)
				if display:
					lt_name = frappe.db.get_value(
						"Lab Test",
						{"patient": patient, "lab_test_name": display, "docstatus": ["!=", 2]},
						"name",
						order_by="modified desc",
					)
			_absorb_name(lt_name)

	return values


def get_group_lab_test_result_values(
	service_request: str | None,
	child_templates: list[str],
	*,
	lab_test_group: str | None = None,
	patient: str | None = None,
) -> dict[str, float]:
	"""Backward-compatible wrapper — prefer collect_panel_result_values when panel is known."""
	if not child_templates:
		return {}
	panel = lab_test_group or ""
	return collect_panel_result_values(
		panel,
		service_request=service_request,
		lab_test_group=lab_test_group,
		patient=patient,
	)


def _merge_lab_test_custom_result_into_values(lab_test_doc, values: dict[str, float]) -> None:
	"""Include this Lab Test's custom_result in the variable map (portal inline entry)."""
	if not lab_test_doc:
		return
	val = _parse_float(getattr(lab_test_doc, "custom_result", None))
	if val is None:
		return
	for key in filter(
		None,
		[
			getattr(lab_test_doc, "template", None),
			_display_name_for_template(getattr(lab_test_doc, "template", None)),
			getattr(lab_test_doc, "lab_test_name", None),
		],
	):
		values[key] = val


def _template_for_event_label(label: str, panel_template: str) -> str | None:
	"""Resolve a rule event label (e.g. Globulin) to a Lab Test Template name."""
	if not label:
		return None
	label_n = _norm_key(label)
	for child in get_group_child_templates(panel_template):
		if label_n in (_norm_key(child["lab_test_event"]), _norm_key(child["lab_test_name"])):
			return child["lab_test_event"]
	if frappe.db.exists("Lab Test Template", label):
		return label
	return frappe.db.get_value("Lab Test Template", {"lab_test_name": label}, "name")


def _find_lab_test_for_panel_child(
	template: str,
	*,
	service_request: str | None = None,
	lab_test_group: str | None = None,
	patient: str | None = None,
	panel_template: str | None = None,
) -> str | None:
	"""Find a child Lab Test row using service request, group, or patient (try all)."""
	strategies: list[dict[str, Any]] = []
	if service_request:
		strategies.append({"service_request": service_request, "template": template})
	for group_key in {k for k in (lab_test_group, panel_template) if k}:
		strategies.append({"lab_test_group": group_key, "template": template})
	if patient:
		strategies.append({"patient": patient, "template": template})
		if panel_template:
			strategies.append({"patient": patient, "template": template, "lab_test_group": panel_template})

	for filt in strategies:
		filt["docstatus"] = ["!=", 2]
		name = frappe.db.get_value("Lab Test", filt, "name", order_by="modified desc")
		if name:
			return name

	if patient:
		display = _display_name_for_template(template)
		if display:
			return frappe.db.get_value(
				"Lab Test",
				{"patient": patient, "lab_test_name": display, "docstatus": ["!=", 2]},
				"name",
				order_by="creation desc",
			)
	return None


def _align_values_to_rule_event_names(values: dict[str, float], rules: dict[str, Any]) -> None:
	"""Copy numeric results onto rule event labels so formulas match (e.g. TOTAL PROTEIN)."""
	by_norm = {_norm_key(k): v for k, v in values.items() if k}

	def _copy_to_label(label: str):
		if not label or label in values:
			return
		val = by_norm.get(_norm_key(label))
		if val is not None:
			values[label] = val

	for row in rules.get("sum_events") or []:
		for nm in _event_names_from_rule_event(row):
			_copy_to_label(nm)

	for line in rules.get("rule_lines") or []:
		for nm in (
			line.get("target_event"),
			line.get("numerator_event"),
			line.get("denominator_event"),
		):
			_copy_to_label((nm or "").strip())
		for part in re.split(r"[\s+\-*/()]+", line.get("formula") or ""):
			part = part.strip()
			if part and _norm_key(part) in by_norm:
				_copy_to_label(part)


def _merge_panel_sibling_values(
	values: dict[str, float],
	panel_template: str,
	*,
	service_request: str | None = None,
	lab_test_group: str | None = None,
	patient: str | None = None,
	current_doc=None,
) -> None:
	"""Load custom_result from each child lab test in the panel (for formulas and sums)."""
	if not panel_template:
		return
	values.update(
		collect_panel_result_values(
			panel_template,
			service_request=service_request,
			lab_test_group=lab_test_group,
			patient=patient,
			current_doc=current_doc,
		)
	)


def _persist_calculated_lab_test_result(lt_name: str, formatted: str) -> None:
	"""Save calculated result on a Lab Test document (reliable for Text Editor fields)."""
	if not lt_name:
		return
	text = str(formatted).strip() if formatted is not None else ""
	lt = frappe.get_doc("Lab Test", lt_name)
	lt.custom_result = text
	if lt.meta.has_field("results"):
		lt.results = text
	if text and (lt.status or "") in ("", "Requested"):
		lt.status = "Pending Review"
	if text:
		try:
			from healthcare.api.lab_test import _calculate_result_flag

			patient_gender = (
				frappe.db.get_value("Patient", lt.patient, "sex") if lt.patient else None
			)
			template_doc = frappe.get_doc("Lab Test Template", lt.template) if lt.template else None
			if template_doc:
				lt.result_flag = _calculate_result_flag(
					text,
					patient_gender,
					template_doc.get("female_min_range"),
					template_doc.get("female_max_range"),
					template_doc.get("male_min_range"),
					template_doc.get("male_max_range"),
					template_doc.get("min_range"),
					template_doc.get("max_range"),
				)
		except Exception:
			frappe.log_error(
				title="Lab result flag on calculated test",
				message=frappe.get_traceback(),
			)
	lt.flags.ignore_permissions = True
	if lt.docstatus == 1:
		lt.flags.ignore_validate_update_after_submit = True
	lt.save(ignore_permissions=True)
	if text and lt.docstatus == 0:
		try:
			from healthcare.api.lab_test_doctor_review import record_results_entered

			record_results_entered(lt.name)
		except Exception:
			pass


def _sync_calculated_targets_to_lab_tests(
	doc,
	rules: dict[str, Any],
	calculated: dict[str, str],
	*,
	service_request: str | None = None,
	lab_test_group: str | None = None,
	persist: bool = True,
) -> list[dict[str, str]]:
	"""Write formula/ratio results onto sibling Lab Test custom_result fields."""
	panel_template = (rules.get("lab_test_template") or "").strip()
	updates: list[dict[str, str]] = []
	if not panel_template or not calculated:
		return updates
	patient = getattr(doc, "patient", None)
	group_key = lab_test_group or panel_template
	for target_label, formatted in calculated.items():
		tpl = _template_for_event_label(target_label, panel_template)
		if not tpl:
			continue
		if _norm_key(tpl) == _norm_key(doc.template or ""):
			doc.custom_result = formatted
			if persist and doc.name:
				_persist_calculated_lab_test_result(doc.name, formatted)
			updates.append(
				{
					"name": doc.name,
					"lab_test_name": getattr(doc, "lab_test_name", None) or target_label,
					"custom_result": formatted,
				}
			)
			continue
		lt_name = _find_lab_test_for_panel_child(
			tpl,
			service_request=service_request,
			lab_test_group=group_key,
			patient=patient,
			panel_template=panel_template,
		)
		if lt_name and lt_name != doc.name:
			if persist:
				_persist_calculated_lab_test_result(lt_name, formatted)
			updates.append(
				{
					"name": lt_name,
					"lab_test_name": frappe.db.get_value("Lab Test", lt_name, "lab_test_name")
					or target_label,
					"custom_result": formatted,
				}
			)
	return updates


def build_event_index(items) -> dict[str, Any]:
	"""Map normalized event name -> row (dict or Document)."""
	index: dict[str, Any] = {}
	for row in items or []:
		if isinstance(row, dict):
			keys = [
				row.get("lab_test_event"),
				row.get("lab_test_name"),
			]
		else:
			keys = [getattr(row, "lab_test_event", None), getattr(row, "lab_test_name", None)]
		for key in keys:
			if key and _norm_key(key) not in index:
				index[_norm_key(key)] = row
	return index


def get_numeric_values(items) -> dict[str, float]:
	"""Map canonical event label (first matching key) -> float."""
	values: dict[str, float] = {}
	for row in items or []:
		if isinstance(row, dict):
			label = (row.get("lab_test_event") or row.get("lab_test_name") or "").strip()
			raw = row.get("result_value")
		else:
			label = (getattr(row, "lab_test_event", None) or getattr(row, "lab_test_name", None) or "").strip()
			raw = getattr(row, "result_value", None)
		val = _parse_float(raw)
		if label and val is not None:
			values[label] = val
	return values


def resolve_event_value(event_name: str, index: dict[str, Any], values: dict[str, float]) -> float | None:
	if not event_name:
		return None
	key = _norm_key(event_name)
	for label, val in values.items():
		if _norm_key(label) == key:
			return val
	row = index.get(key)
	if not row:
		return None
	if isinstance(row, dict):
		return _parse_float(row.get("result_value"))
	return _parse_float(getattr(row, "result_value", None))


def substitute_formula(formula: str, values: dict[str, float]) -> str | None:
	"""Replace event names with numeric literals; return None if a name is missing."""
	text = (formula or "").strip()
	if not text:
		return None
	for name in sorted(values.keys(), key=len, reverse=True):
		val = values.get(name)
		if val is None:
			continue
		text = re.sub(r"\b" + re.escape(name) + r"\b", f"({val})", text, flags=re.IGNORECASE)
	if re.search(r"[a-zA-Z_]", text):
		return None
	return text


def evaluate_formula(formula: str, values: dict[str, float]) -> float | None:
	expr = substitute_formula(formula, values)
	if not expr:
		return None
	try:
		return _safe_eval_arithmetic(expr)
	except (ValueError, SyntaxError, ZeroDivisionError, TypeError, OverflowError):
		return None


def _rule_lookup_template_candidates(template: str) -> list[str]:
	"""Template names that may own a Lab Test Result Rule for this test."""
	if not template:
		return []
	seen: set[str] = set()
	ordered: list[str] = []

	def _add(value: str | None):
		v = (value or "").strip()
		if v and v not in seen:
			seen.add(v)
			ordered.append(v)

	_add(template)
	meta = frappe.db.get_value(
		"Lab Test Template",
		template,
		["name", "lab_test_code", "lab_test_name", "lab_group"],
		as_dict=True,
	)
	if meta:
		for field in (meta.name, meta.lab_test_code, meta.lab_test_name, meta.lab_group):
			_add(field)
		if meta.lab_group:
			group = frappe.db.get_value(
				"Lab Test Template",
				meta.lab_group,
				["name", "lab_test_code", "lab_test_name"],
				as_dict=True,
			)
			if group:
				for field in (group.name, group.lab_test_code, group.lab_test_name):
					_add(field)
	return ordered


def get_enabled_rule_doc(template: str):
	if not template:
		return None
	name = None
	for candidate in _rule_lookup_template_candidates(template):
		name = frappe.db.get_value(
			"Lab Test Result Rule",
			{"lab_test_template": candidate, "enabled": 1},
			"name",
		)
		if name:
			break
	if not name:
		return None
	return frappe.get_doc("Lab Test Result Rule", name)


def rule_doc_to_dict(rule_doc) -> dict[str, Any]:
	sum_events = []
	for row in rule_doc.sum_events or []:
		sum_events.append(
			{
				"lab_test_event": row.lab_test_event,
				"aliases": row.aliases or "",
			}
		)
	lines = []
	for row in rule_doc.rule_lines or []:
		lines.append(
			{
				"rule_type": row.rule_type,
				"target_event": row.target_event,
				"formula": row.formula or "",
				"source_events": row.source_events or "",
				"numerator_event": row.numerator_event or "",
				"denominator_event": row.denominator_event or "",
				"readonly": bool(row.readonly),
			}
		)
	return {
		"name": rule_doc.name,
		"lab_test_template": rule_doc.lab_test_template,
		"enabled": bool(rule_doc.enabled),
		"sum_events": sum_events,
		"sum_events_configured": bool(sum_events),
		"sum_target": rule_doc.sum_target if rule_doc.sum_target is not None else 100,
		"sum_tolerance": rule_doc.sum_tolerance if rule_doc.sum_tolerance is not None else 0.5,
		"sum_block_save": bool(rule_doc.sum_block_save),
		"rule_lines": lines,
	}


def apply_rules(
	template: str,
	items: list[dict],
	*,
	rule_doc=None,
	block_on_error: bool = False,
	service_request: str | None = None,
	lab_test_group: str | None = None,
	patient: str | None = None,
	current_doc=None,
) -> dict[str, Any]:
	"""Apply configured rules to a list of normal_test_item dicts (mutates copies in returned items)."""
	out_items = [dict(row) for row in (items or [])]
	index = build_event_index(out_items)
	values = get_numeric_values(out_items)
	warnings: list[dict[str, Any]] = []
	errors: list[dict[str, Any]] = []
	readonly_events: set[str] = set()
	calculated_targets: dict[str, str] = {}

	if rule_doc is None:
		rule_doc = get_enabled_rule_doc(template)
	if not rule_doc:
		return {
			"items": out_items,
			"warnings": warnings,
			"errors": errors,
			"readonly_events": [],
			"calculated_targets": calculated_targets,
		}

	rules = rule_doc if isinstance(rule_doc, dict) else rule_doc_to_dict(rule_doc)
	panel_template = (rules.get("lab_test_template") or "").strip()

	if current_doc:
		_merge_lab_test_custom_result_into_values(current_doc, values)

	# Load all panel child results (same as CBC sum — needed for formulas too).
	_merge_panel_sibling_values(
		values,
		panel_template,
		service_request=service_request,
		lab_test_group=lab_test_group,
		patient=patient,
		current_doc=current_doc,
	)
	_align_values_to_rule_event_names(values, rules)

	# Sum validation
	sum_event_defs = rules.get("sum_events") or []
	if not sum_event_defs and not rules.get("rule_lines"):
		warnings.append(
			{
				"type": "sum_validation_config",
				"message": _(
					"Lab Test Result Rule for this panel has no child tests listed. "
					"Open the rule in Desk, click Load Group Child Tests, "
					"and keep only the tests that must add up to {0} (e.g. the five differentials on CBC)."
				).format(rules.get("sum_target") or 100),
				"ok": False,
				"block_save": False,
			}
		)
	if sum_event_defs:
		parts: list[float] = []
		labels: list[str] = []
		missing: list[str] = []
		for ev in sum_event_defs:
			names = _event_names_from_rule_event(ev)
			if not names:
				continue
			label = _display_name_for_template(names[0]) or names[0]
			val = None
			for candidate in names:
				val = resolve_event_value(candidate, index, values)
				if val is not None:
					break
			if val is None:
				missing.append(label)
			else:
				parts.append(val)
				labels.append(label)
		if missing and parts:
			warnings.append(
				{
					"type": "sum_validation_missing",
					"message": _(
						"Could not find results for: {0}. Enter results on each child lab test "
						"in this group, or check that the correct child tests are listed on the rule."
					).format(", ".join(missing)),
					"ok": False,
					"block_save": False,
				}
			)
		elif parts and not missing:
			total = sum(parts)
			target = float(rules.get("sum_target") or 100)
			tolerance = float(rules.get("sum_tolerance") or 0.5)
			diff = abs(total - target)
			msg = _format_sum_validation_user_message(labels, total, target, tolerance)
			short_msg = _format_sum_validation_short_message(labels, total, target, tolerance)
			entry = {
				"type": "sum_validation",
				"message": msg,
				"short_message": short_msg,
				"title": _("Differential count check"),
				"total": total,
				"target": target,
				"tolerance": tolerance,
				"ok": diff <= tolerance,
				"block_save": bool(rules.get("sum_block_save")),
			}
			if diff > tolerance:
				if entry["block_save"]:
					errors.append(entry)
				else:
					warnings.append(entry)

	# Formula and ratio lines
	for line in rules.get("rule_lines") or []:
		target = (line.get("target_event") or "").strip()
		if not target:
			continue
		result_val = None
		rule_type = line.get("rule_type") or "Formula"
		if rule_type == "Ratio":
			num = resolve_event_value(line.get("numerator_event") or "", index, values)
			den = resolve_event_value(line.get("denominator_event") or "", index, values)
			if num is not None and den not in (None, 0):
				result_val = num / den
		else:
			formula = line.get("formula") or ""
			result_val = evaluate_formula(formula, values)
			if result_val is None and formula.strip():
				found = ", ".join(sorted({str(k) for k in values.keys() if values.get(k) is not None})[:12])
				warnings.append(
					{
						"type": "formula_missing_inputs",
						"message": _(
							"Could not calculate {0}. Formula: {1}. "
							"Results found for: {2}. "
							"Save Total Protein and Albumin first (same patient), then save again."
						).format(
							target,
							formula,
							found or _("none yet"),
						),
						"ok": False,
						"block_save": False,
					}
				)

		if result_val is None:
			continue

		formatted = _format_result(result_val)
		calculated_targets[target] = formatted
		values[target] = float(result_val)
		row = index.get(_norm_key(target))
		if row is None:
			out_items.append(
				{
					"lab_test_event": target,
					"lab_test_name": target,
					"result_value": formatted,
					"lab_test_uom": "",
					"normal_range": "",
					"lab_test_comment": "",
				}
			)
			index[_norm_key(target)] = out_items[-1]
		else:
			if isinstance(row, dict):
				row["result_value"] = formatted
			else:
				row.result_value = formatted

		if line.get("readonly"):
			readonly_events.add(target)

	# Rebuild readonly list after all calculations
	for line in rules.get("rule_lines") or []:
		if line.get("readonly") and line.get("target_event"):
			readonly_events.add(line["target_event"].strip())

	if block_on_error and errors:
		err = errors[0]
		frappe.throw(
			err.get("short_message") or err.get("message") or _("Lab result validation failed"),
			title=err.get("title") or _("Results not saved"),
			exc=frappe.ValidationError,
		)

	return {
		"items": out_items,
		"warnings": warnings,
		"errors": errors,
		"readonly_events": sorted(readonly_events),
		"calculated_targets": calculated_targets,
	}


def _resolve_panel_template_and_rule(doc):
	"""Panel template + rule doc for a child or parent lab test."""
	template = (getattr(doc, "template", None) or "").strip()
	if not template:
		return "", None
	panel_template = (
		frappe.db.get_value("Lab Test Template", template, "lab_group") or template
	).strip()
	rule_doc = get_enabled_rule_doc(template)
	if not rule_doc and panel_template != template:
		rule_doc = get_enabled_rule_doc(panel_template)
	if rule_doc:
		panel_template = (rule_doc.lab_test_template or panel_template or template).strip()
	return panel_template, rule_doc


def apply_rules_to_doc(doc, *, block_on_error: bool = True, persist_siblings: bool = True) -> dict[str, Any]:
	"""Apply rules for this lab test (compound rows and/or group child results)."""
	empty = {
		"warnings": [],
		"errors": [],
		"readonly_events": [],
		"calculated_targets": {},
		"calculated_updates": [],
	}
	if not doc.template:
		return empty

	panel_template, rule_doc = _resolve_panel_template_and_rule(doc)
	if not rule_doc:
		return empty

	items = []
	for row in doc.normal_test_items or []:
		items.append(
			{
				"lab_test_event": row.lab_test_event,
				"lab_test_name": row.lab_test_name,
				"result_value": row.result_value,
				"lab_test_uom": row.lab_test_uom,
				"normal_range": row.normal_range,
				"lab_test_comment": row.lab_test_comment,
				"template": row.template,
			}
		)

	rules_dict = rule_doc_to_dict(rule_doc)

	result = apply_rules(
		doc.template,
		items,
		rule_doc=rule_doc,
		block_on_error=block_on_error,
		service_request=getattr(doc, "service_request", None),
		lab_test_group=getattr(doc, "lab_test_group", None) or panel_template,
		patient=getattr(doc, "patient", None),
		current_doc=doc,
	)
	calculated_updates = _sync_calculated_targets_to_lab_tests(
		doc,
		rules_dict,
		result.get("calculated_targets") or {},
		service_request=getattr(doc, "service_request", None),
		lab_test_group=getattr(doc, "lab_test_group", None) or panel_template,
		persist=persist_siblings,
	)
	result["calculated_updates"] = calculated_updates
	result["calculated_targets"] = result.get("calculated_targets") or {}
	by_event = {
		_norm_key(r.get("lab_test_event") or r.get("lab_test_name")): r for r in result["items"]
	}
	for row in doc.normal_test_items or []:
		key = _norm_key(row.lab_test_event or row.lab_test_name)
		updated = by_event.get(key)
		if updated and updated.get("result_value") is not None:
			row.result_value = updated["result_value"]

	# Append any new calculated rows not already on the doc
	existing = {_norm_key(r.lab_test_event or r.lab_test_name) for r in doc.normal_test_items or []}
	for item in result["items"]:
		key = _norm_key(item.get("lab_test_event") or item.get("lab_test_name"))
		if key and key not in existing:
			doc.append(
				"normal_test_items",
				{
					"lab_test_name": item.get("lab_test_name") or item.get("lab_test_event"),
					"lab_test_event": item.get("lab_test_event") or item.get("lab_test_name"),
					"result_value": item.get("result_value") or "",
					"lab_test_uom": item.get("lab_test_uom") or "",
					"normal_range": item.get("normal_range") or "",
					"lab_test_comment": item.get("lab_test_comment") or "",
					"template": item.get("template") or doc.template,
					"require_result_value": 1,
				},
			)

	return result


def recalculate_panel_for_service_request(
	service_request: str, triggering_lab_test: str | None = None
) -> dict[str, Any]:
	"""Re-run panel formulas for all lab tests on one service request (after sibling saves)."""
	empty: dict[str, Any] = {"calculated_updates": [], "warnings": []}
	if not service_request:
		return empty

	lab_test_names = frappe.get_all(
		"Lab Test",
		filters={"service_request": service_request, "docstatus": ["!=", 2]},
		pluck="name",
	)
	if not lab_test_names:
		return empty

	rule_doc = panel_template = None
	triggering = None
	if triggering_lab_test and triggering_lab_test in lab_test_names:
		triggering = frappe.get_doc("Lab Test", triggering_lab_test)
		panel_template, rule_doc = _resolve_panel_template_and_rule(triggering)
	if not rule_doc:
		for lt_name in lab_test_names:
			doc = frappe.get_doc("Lab Test", lt_name)
			panel_template, rule_doc = _resolve_panel_template_and_rule(doc)
			if rule_doc:
				triggering = doc
				break
	if not rule_doc or not triggering:
		return empty

	rules_dict = rule_doc_to_dict(rule_doc)
	result = apply_rules(
		triggering.template,
		[],
		rule_doc=rule_doc,
		service_request=service_request,
		lab_test_group=getattr(triggering, "lab_test_group", None) or panel_template,
		patient=triggering.patient,
		current_doc=triggering,
	)
	updates = _sync_calculated_targets_to_lab_tests(
		triggering,
		rules_dict,
		result.get("calculated_targets") or {},
		service_request=service_request,
		lab_test_group=getattr(triggering, "lab_test_group", None) or panel_template,
	)
	return {
		"calculated_updates": updates,
		"warnings": result.get("warnings") or [],
	}
