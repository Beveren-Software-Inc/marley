# Copyright (c) 2026, Healthcare contributors
# See license.txt

from frappe.tests import UnitTestCase

from healthcare.api.oracle_sync import _claim_op_visits_by_identity


class TestOpVisitIdentityMatch(UnitTestCase):
	"""A visit opened in ERPNext keeps a new case number. Patient, date and type still match it."""

	def test_same_patient_date_and_type_is_the_same_visit(self):
		# Oracle 859520 is SALEM FAHAD M ALDOSSARY on 31 Oct 2026, type 2 (Followup).
		# ERPNext already has that visit as case 1005378.
		slots = {("860092", "2026-10-31", "2"): ["1005378"]}
		rows = [
			{
				"VISIT_NUM": "859520",
				"VISIT_PATIENT_NUM": "860092",
				"VISIT_DAY": "2026-10-31",
				"VISIT_TYPE_NUM": "2",
			}
		]
		claimed_oracle, claimed_erp = _claim_op_visits_by_identity(rows, slots)
		self.assertEqual(claimed_oracle, {"859520"})
		self.assertEqual(claimed_erp, {"1005378"})

	def test_numeric_text_still_matches(self):
		slots = {("860092", "2026-10-31", "2"): ["1005378"]}
		rows = [
			{
				"VISIT_NUM": "859520.0",
				"VISIT_PATIENT_NUM": "860092.0",
				"VISIT_DAY": "2026-10-31 00:00:00",
				"VISIT_TYPE_NUM": "2.0",
			}
		]
		claimed_oracle, claimed_erp = _claim_op_visits_by_identity(rows, slots)
		self.assertEqual(claimed_oracle, {"859520"})
		self.assertEqual(claimed_erp, {"1005378"})

	def test_different_visit_type_stays_missing(self):
		slots = {("860092", "2026-10-31", "1"): ["1005378"]}
		rows = [
			{
				"VISIT_NUM": "859520",
				"VISIT_PATIENT_NUM": "860092",
				"VISIT_DAY": "2026-10-31",
				"VISIT_TYPE_NUM": "2",
			}
		]
		claimed_oracle, claimed_erp = _claim_op_visits_by_identity(rows, slots)
		self.assertEqual(claimed_oracle, set())
		self.assertEqual(claimed_erp, set())

	def test_different_date_stays_missing(self):
		slots = {("860092", "2026-09-07", "2"): ["1003232"]}
		rows = [
			{
				"VISIT_NUM": "859520",
				"VISIT_PATIENT_NUM": "860092",
				"VISIT_DAY": "2026-10-31",
				"VISIT_TYPE_NUM": "2",
			}
		]
		claimed_oracle, claimed_erp = _claim_op_visits_by_identity(rows, slots)
		self.assertEqual(claimed_oracle, set())
		self.assertEqual(claimed_erp, set())

	def test_one_erpnext_visit_covers_only_one_oracle_visit(self):
		slots = {("860092", "2026-10-31", "2"): ["1005378"]}
		rows = [
			{
				"VISIT_NUM": "859521",
				"VISIT_PATIENT_NUM": "860092",
				"VISIT_DAY": "2026-10-31",
				"VISIT_TYPE_NUM": "2",
			},
			{
				"VISIT_NUM": "859520",
				"VISIT_PATIENT_NUM": "860092",
				"VISIT_DAY": "2026-10-31",
				"VISIT_TYPE_NUM": "2",
			},
		]
		claimed_oracle, claimed_erp = _claim_op_visits_by_identity(rows, slots)
		self.assertEqual(claimed_oracle, {"859520"})
		self.assertEqual(claimed_erp, {"1005378"})
