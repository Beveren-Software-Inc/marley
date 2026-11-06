# Copyright (c) 2026, Healthcare contributors
# See license.txt

from frappe.tests import UnitTestCase

from healthcare.api.care_record_reconcile import (
	is_given,
	keep_earliest,
	latest_assessment,
	medicine_given_index,
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

	def test_sheet_23_doses_are_included_and_a_repeated_number_stays_with_the_main_sheet(self):
		main = medicine_given_index(
			[{"TRANS_NUM": "10", "PATIENT_NUM": "1", "ADMISSION_NUM": "2", "GIVEN_YN": "Y"}]
		)
		extra = medicine_given_index(
			[
				{"TRANS_NUM": "10", "PATIENT_NUM": "9", "ADMISSION_NUM": "9", "GIVEN_YN": "Y"},
				{"TRANS_NUM": "20", "PATIENT_NUM": "3", "ADMISSION_NUM": "4", "GIVEN_YN": "Y"},
				{"TRANS_NUM": "21", "PATIENT_NUM": "3", "ADMISSION_NUM": "4", "GIVEN_YN": "N"},
			]
		)
		merged = dict(main)
		for key, links in extra.items():
			merged.setdefault(key, links)
		self.assertEqual(merged["10"], ["1", "2"])
		self.assertEqual(merged["20"], ["3", "4"])
		self.assertNotIn("21", merged)

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
