# Copyright (c) 2026, Healthcare contributors
# See license.txt

from frappe.tests import UnitTestCase

from healthcare.api.care_record_reconcile import (
	is_given,
	keep_earliest,
	latest_assessment,
)


class TestCareRecordReconcile(UnitTestCase):
	def test_only_a_given_dose_is_a_medicine_given(self):
		self.assertTrue(is_given("Y"))
		self.assertTrue(is_given(" yes "))
		self.assertFalse(is_given("N"))
		self.assertFalse(is_given(""))
		self.assertFalse(is_given(None))

	def test_one_assessment_per_admission_keeps_the_latest_transaction(self):
		chosen = latest_assessment(
			[
				("2290", "10"),
				("2290", "15"),
				("2290", "8"),
				("3001", "4"),
			]
		)
		self.assertEqual(chosen, {"2290": "15", "3001": "4"})

	def test_repeated_rows_keep_the_earliest(self):
		self.assertEqual(
			keep_earliest(
				[
					("MG-3", "2026-05-03 10:00:00"),
					("MG-1", "2026-05-01 10:00:00"),
					("MG-2", "2026-05-02 10:00:00"),
				]
			),
			["MG-2", "MG-3"],
		)
