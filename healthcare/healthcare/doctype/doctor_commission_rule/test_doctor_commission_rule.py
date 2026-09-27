# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from healthcare.api.doctor_commission import (
	calculate_line_commission,
	match_base_commission_rule,
	match_commission_rule,
	match_doctor_period_rule,
)

# Two doctors and a branch used by every test below.
DOCTOR_ONE = "HLC-PRAC-0001"
DOCTOR_TWO = "HLC-PRAC-0002"
BRANCH = "Main - Branch"
ON_DATE = "2026-01-15"


def _rule(name, practitioners=None, **kwargs):
	"""A Doctor Commission Rule as ``load_active_commission_rules`` returns it."""
	rule = {
		"name": name,
		"priority": 10,
		"valid_from": None,
		"valid_to": None,
		"item_code": None,
		"item_group": None,
		"cost_centers": [],
		"practitioners": practitioners if practitioners is not None else [],
		"calculation_type": "Percent of Amount",
		"commission_percent": 10,
	}
	rule.update(kwargs)
	return frappe._dict(rule)


class IntegrationTestDoctorCommissionRule(IntegrationTestCase):
	"""A rule scoped to doctors from the Practitioner Multiselect child table."""

	def test_rule_listed_doctors_only_applies_to_those_doctors(self):
		doctor_rule = _rule("DCR-0001", practitioners=[DOCTOR_ONE])
		default_rule = _rule("DCR-0002")

		self.assertEqual(
			match_commission_rule([doctor_rule, default_rule], DOCTOR_ONE, BRANCH, None, None, ON_DATE),
			doctor_rule,
		)
		self.assertEqual(
			match_commission_rule([doctor_rule, default_rule], DOCTOR_TWO, BRANCH, None, None, ON_DATE),
			default_rule,
		)

	def test_rule_listing_several_doctors_covers_all_of_them(self):
		rule = _rule("DCR-0001", practitioners=[DOCTOR_ONE, DOCTOR_TWO])

		for practitioner in (DOCTOR_ONE, DOCTOR_TWO):
			self.assertEqual(
				match_commission_rule([rule], practitioner, BRANCH, None, None, ON_DATE), rule
			)

	def test_rule_without_doctors_applies_to_every_doctor(self):
		default_rule = _rule("DCR-0001")

		for practitioner in (DOCTOR_ONE, DOCTOR_TWO):
			self.assertEqual(
				match_commission_rule([default_rule], practitioner, BRANCH, None, None, ON_DATE),
				default_rule,
			)

	def test_doctor_rule_beats_a_higher_priority_generic_rule(self):
		"""Being limited to a doctor makes a rule more specific than a broad one."""
		doctor_rule = _rule("DCR-0001", practitioners=[DOCTOR_ONE], priority=1)
		generic_rule = _rule("DCR-0002", priority=100)

		self.assertEqual(
			match_commission_rule([doctor_rule, generic_rule], DOCTOR_ONE, BRANCH, None, None, ON_DATE),
			doctor_rule,
		)

	def test_service_and_branch_filters_narrow_a_doctor_rule(self):
		doctor_rule = _rule("DCR-0001", practitioners=[DOCTOR_ONE])
		item_rule = _rule("DCR-0002", practitioners=[DOCTOR_ONE], item_code="CONSULT")
		branch_rule = _rule("DCR-0003", practitioners=[DOCTOR_ONE], cost_centers=["Other - Branch"])

		# The service-specific rule wins for that service, the plain one for others.
		self.assertEqual(
			match_commission_rule(
				[doctor_rule, item_rule], DOCTOR_ONE, BRANCH, "CONSULT", None, ON_DATE
			),
			item_rule,
		)
		self.assertEqual(
			match_commission_rule([doctor_rule, item_rule], DOCTOR_ONE, BRANCH, "X-RAY", None, ON_DATE),
			doctor_rule,
		)

		# A branch-scoped rule is out of scope for another branch.
		self.assertEqual(
			match_commission_rule([doctor_rule, branch_rule], DOCTOR_ONE, BRANCH, None, None, ON_DATE),
			doctor_rule,
		)
		self.assertEqual(
			match_commission_rule(
				[doctor_rule, branch_rule], DOCTOR_ONE, "Other - Branch", None, None, ON_DATE
			),
			branch_rule,
		)

	def test_rules_outside_their_validity_are_skipped(self):
		old_rule = _rule("DCR-0001", valid_from="2026-01-01", valid_to="2026-01-31", priority=1)
		future_rule = _rule("DCR-0002", valid_from="2026-02-01", priority=100)

		self.assertEqual(
			match_commission_rule([future_rule, old_rule], DOCTOR_ONE, BRANCH, None, None, ON_DATE),
			old_rule,
		)
		self.assertIsNone(
			match_commission_rule([future_rule], DOCTOR_ONE, BRANCH, None, None, ON_DATE)
		)

	def test_base_rule_matching_ignores_the_service_filters(self):
		"""Free-case counting matches on the doctor and branch only."""
		item_rule = _rule("DCR-0001", practitioners=[DOCTOR_ONE], item_code="CONSULT")
		default_rule = _rule("DCR-0002", priority=50)

		self.assertEqual(
			match_base_commission_rule([item_rule, default_rule], DOCTOR_ONE, BRANCH, ON_DATE),
			item_rule,
		)
		self.assertEqual(
			match_base_commission_rule([item_rule, default_rule], DOCTOR_TWO, BRANCH, ON_DATE),
			default_rule,
		)

	def test_doctor_rule_for_the_period_covers_lines_it_did_not_match(self):
		"""A line in another branch or for another service still earns the doctor's rule."""
		rule = _rule(
			"DCR-0001",
			practitioners=[DOCTOR_ONE],
			cost_centers=["Other - Branch"],
			item_code="CONSULT",
			commission_percent=40,
		)

		# The line itself is out of the rule's scope ...
		self.assertIsNone(match_commission_rule([rule], DOCTOR_ONE, BRANCH, "X-RAY", None, ON_DATE))
		# ... but the doctor is on the rule for the period, so the rule still governs it.
		self.assertEqual(match_doctor_period_rule([rule], DOCTOR_ONE), rule)

	def test_period_rule_leaves_doctors_it_does_not_list_to_the_default(self):
		"""Only the Default Commission % / Healthcare Settings stays for unlisted doctors."""
		doctor_rule = _rule("DCR-0001", practitioners=[DOCTOR_ONE])

		self.assertEqual(match_doctor_period_rule([doctor_rule], DOCTOR_ONE), doctor_rule)
		self.assertIsNone(match_doctor_period_rule([doctor_rule], DOCTOR_TWO))

	def test_rule_without_doctors_covers_every_doctor_for_the_period(self):
		generic_rule = _rule("DCR-0001")

		for practitioner in (DOCTOR_ONE, DOCTOR_TWO):
			self.assertEqual(match_doctor_period_rule([generic_rule], practitioner), generic_rule)

	def test_period_rule_prefers_the_doctor_specific_rule(self):
		"""Same specificity order as a line match: listed doctor beats higher priority."""
		doctor_rule = _rule("DCR-0001", practitioners=[DOCTOR_ONE], priority=1)
		generic_rule = _rule("DCR-0002", priority=100)

		self.assertEqual(
			match_doctor_period_rule([doctor_rule, generic_rule], DOCTOR_ONE), doctor_rule
		)
		self.assertEqual(match_doctor_period_rule([doctor_rule, generic_rule], DOCTOR_TWO), generic_rule)

	def test_period_rule_ignores_a_rule_that_defines_no_amount(self):
		"""An empty rule must not zero the commission — the Default % is used instead."""
		empty_rule = _rule("DCR-0001", practitioners=[DOCTOR_ONE], commission_percent=0)
		fixed_rule = _rule("DCR-0002", practitioners=[DOCTOR_ONE], calculation_type="Fixed Per Case")

		self.assertIsNone(match_doctor_period_rule([empty_rule], DOCTOR_ONE))
		self.assertEqual(match_doctor_period_rule([fixed_rule], DOCTOR_ONE), fixed_rule)

	def test_rule_percent_is_used_ahead_of_the_default_percent(self):
		"""Precedence: the rule's %, then the Default Commission % as the last resort."""
		rule = _rule("DCR-0001", practitioners=[DOCTOR_ONE], commission_percent=40)
		matched = match_doctor_period_rule([rule], DOCTOR_ONE)

		self.assertEqual(
			calculate_line_commission(matched, 100, 1, default_percent=20),
			(40.0, "Percent of Amount", 40.0),
		)
		self.assertEqual(
			calculate_line_commission(None, 100, 1, default_percent=20),
			(20.0, "Percent of Amount (Default)", 20.0),
		)

