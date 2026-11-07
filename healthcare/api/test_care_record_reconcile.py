# Copyright (c) 2026, Healthcare contributors
# See license.txt

from frappe.tests import UnitTestCase

from healthcare.api.care_record_reconcile import (
	APPOINTMENT_COLUMNS,
	appointment_day,
	is_given,
	keep_earliest,
	latest_assessment,
	match_appointments,
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

	def test_a_dated_appointment_is_read_with_its_doctor_and_time(self):
		self.assertIn("APP_DATE", APPOINTMENT_COLUMNS)
		self.assertIn("DOC_CODE", APPOINTMENT_COLUMNS)
		self.assertIn("HH_TIME", APPOINTMENT_COLUMNS)
		self.assertEqual(appointment_day("2024-01-02 00:00:00"), "2024-01-02")
		self.assertEqual(appointment_day(""), "")
		self.assertEqual(appointment_day(None), "")

	def test_an_appointment_matches_on_patient_doctor_and_date_not_the_number(self):
		oracle = [
			{
				"app_num": "10",
				"patient": "1",
				"doctor": "d1",
				"day": "2024-01-02",
				"time": "09:00:00",
				"link": "1",
			},
			{
				"app_num": "11",
				"patient": "1",
				"doctor": "d1",
				"day": "2024-01-02",
				"time": "11:00:00",
				"link": "1",
			},
		]
		erp = [
			{
				"name": "10",
				"patients": ["2"],
				"doctors": ["d1"],
				"day": "2024-01-02",
				"time": "09:00:00",
			},
			{
				"name": "PA-OTHER",
				"patients": ["1"],
				"doctors": ["hp-1", "d1"],
				"day": "2024-01-02",
				"time": "09:00:00",
			},
		]
		entries = {key: present for key, _links, present in match_appointments(oracle, erp)}
		self.assertTrue(entries["10"])
		self.assertFalse(entries["11"])

	def test_one_stored_appointment_is_not_matched_twice(self):
		oracle = [
			{"app_num": "20", "patient": "1", "doctor": "d1", "day": "2024-01-02", "time": "09:00:00"},
			{"app_num": "21", "patient": "1", "doctor": "d1", "day": "2024-01-02", "time": "09:00:00"},
		]
		erp = [
			{"name": "PA-1", "patients": ["1"], "doctors": ["d1"], "day": "2024-01-02", "time": ""},
		]
		entries = {key: present for key, _links, present in match_appointments(oracle, erp)}
		self.assertTrue(entries["20"])
		self.assertFalse(entries["21"])

	def test_a_blank_date_is_not_an_appointment_row(self):
		entries = match_appointments(
			[{"app_num": "30", "patient": "1", "doctor": "d1", "day": "", "time": "09:00:00"}],
			[{"name": "30", "patients": ["1"], "doctors": ["d1"], "day": "2024-01-02", "time": "09:00:00"}],
		)
		self.assertEqual(entries, [])

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
