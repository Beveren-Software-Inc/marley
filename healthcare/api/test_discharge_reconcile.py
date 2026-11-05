# Copyright (c) 2026, Healthcare contributors
# See license.txt

from frappe.tests import IntegrationTestCase, UnitTestCase

from healthcare.api.discharge_reconcile import (
	DOCTYPE,
	JOB_KEY,
	ORACLE_TABLE,
	_is_oracle_discharged,
	_new_progress,
	_summary_message,
	_work_items,
)
from healthcare.api.oracle_sync import _row_from_oracle, _status_label


def _scan(**kwargs) -> dict:
	scan = {"missing_discharges": []}
	scan.update(kwargs)
	return scan


class TestDischargeReconcileOracleRow(UnitTestCase):
	def test_discharged_status_from_oracle_code(self):
		raw = {"ADMISION_STATUS": "2", "ADMISSION_NUM": "5001", "PATIENT_NUM": "1001"}
		self.assertTrue(_is_oracle_discharged(raw))
		self.assertEqual(_status_label("2"), "Discharged")

	def test_admitted_row_is_not_discharged(self):
		raw = {"ADMISION_STATUS": "1", "ADMISSION_NUM": "5002", "PATIENT_NUM": "1002"}
		self.assertFalse(_is_oracle_discharged(raw))

	def test_discharge_date_implies_discharged(self):
		raw = {
			"ADMISION_STATUS": "1",
			"ADMISSION_NUM": "5003",
			"PATIENT_NUM": "1003",
			"DISCHARGE_DATE": "2024-06-01 00:00:00",
		}
		row = _row_from_oracle(raw)
		self.assertTrue(_is_oracle_discharged(raw))
		self.assertEqual(row["case_no"], "5003")


class TestDischargeReconcileWorkList(IntegrationTestCase):
	def test_missing_admissions_are_sorted_numerically(self):
		scan = _scan(missing_discharges=[["5010", "100"], ["5002", "101"], ["5009", "102"]])
		items = _work_items(scan)
		self.assertEqual([item[0] for item in items], ["5002", "5009", "5010"])

	def test_limit_keeps_the_first_rows(self):
		scan = _scan(missing_discharges=[["5003", "1"], ["5001", "2"], ["5002", "3"]])
		items = _work_items(scan, limit=2)
		self.assertEqual([item[0] for item in items], ["5001", "5002"])

	def test_empty_scan_has_nothing_to_do(self):
		self.assertEqual(_work_items(_scan()), [])


class TestDischargeReconcileSummary(IntegrationTestCase):
	def test_progress_starts_with_expected_counters(self):
		progress = _new_progress(limit=10)
		self.assertEqual(progress["job_key"], JOB_KEY)
		self.assertEqual(progress["state"], "queued")
		self.assertEqual(progress["limit"], 10)
		self.assertEqual(progress["oracle_discharged"], 0)
		self.assertEqual(progress["created"], 0)

	def test_summary_mentions_oracle_table(self):
		progress = _new_progress()
		progress.update({"oracle_discharged": 100, "missing_discharges": 5, "created": 2})
		message = _summary_message(progress)
		self.assertIn(ORACLE_TABLE, message)
		self.assertIn("Discharge", message)
