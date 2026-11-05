# Copyright (c) 2026, Healthcare contributors
# See license.txt

from frappe.tests import IntegrationTestCase

from healthcare.api.physical_examination_reconcile import (
	CONFLICT_SUFFIX,
	DOCTYPE,
	JOB_KEY,
	ORACLE_TABLE,
	_content_fingerprint,
	_new_progress,
	_numeric_key,
	_prepare_row,
	_sql_text,
	_summary_message,
	_work_items,
)


def _scan(**kwargs) -> dict:
	scan = {"missing_free": [], "missing_blocked": []}
	scan.update(kwargs)
	return scan


def _row(**kwargs) -> dict:
	row = {
		"TRANS_NO": "88120",
		"ADMISSION_NUM": "2372",
		"CR_DATE_TIME": "2026-07-02 10:30:00",
		"WEIGHT": "72",
		"HEIGHT": "175",
		"BLOOD_PRESSURE": "120/80",
		"PULSE": "72",
		"TEMPRESSURE": "36.6",
		"RESP_RATE": "18",
		"PHYS_SIGNS": "Normal gait",
		"CVS_RESP": "S1 S2 normal",
		"CNS": "Alert",
		"GIT": "Soft",
		"OTHERS": "None",
		"PATIENT_NUM": "1001",
		"BRANCH_NUM": "1",
	}
	row.update(kwargs)
	return row


class TestPhysicalExaminationReconcileRows(IntegrationTestCase):
	def test_oracle_table_and_job_key(self):
		self.assertEqual(ORACLE_TABLE, "IP_ADMISSION_PHY_EXAM")
		self.assertEqual(DOCTYPE, "Physical Examination")
		self.assertEqual(JOB_KEY, "physical_examination_reconcile")
		self.assertEqual(CONFLICT_SUFFIX, "-P")

	def test_row_is_mapped_to_the_importer_row(self):
		row = _prepare_row(_row())

		self.assertEqual(row["trans_no"], "88120")
		self.assertEqual(row["admission_num"], "2372")
		self.assertEqual(row["patient_num"], "1001")
		self.assertEqual(row["phys_signs"], "Normal gait")
		self.assertEqual(row["cvs_resp"], "S1 S2 normal")
		self.assertEqual(row["cns"], "Alert")

	def test_trans_num_header_also_maps(self):
		row = _prepare_row(_row(TRANS_NO=None, TRANS_NUM="88121"))

		self.assertEqual(row["trans_no"], "88121")

	def test_row_without_trans_number_is_dropped(self):
		self.assertIsNone(_prepare_row(_row(TRANS_NO="", TRANS_NUM="")))
		self.assertIsNone(_prepare_row(_row(TRANS_NO=None, TRANS_NUM=None)))

	def test_sql_literal_quotes_numbers(self):
		self.assertEqual(_sql_text("88120"), "'88120'")

	def test_suffixed_trans_number_maps_back_to_oracle_number(self):
		self.assertEqual(_numeric_key("88120"), "88120")
		self.assertEqual(_numeric_key(f"88120{CONFLICT_SUFFIX}"), "88120")
		self.assertEqual(_numeric_key(f"88120{CONFLICT_SUFFIX}-2"), "88120")

	def test_content_fingerprint_ignores_case_and_spacing(self):
		base = _prepare_row(_row())
		variant = _prepare_row(_row(PHYS_SIGNS="  normal   GAIT  ", CVS_RESP="s1 s2 NORMAL"))

		self.assertEqual(_content_fingerprint(base), _content_fingerprint(variant))


class TestPhysicalExaminationReconcileWorkList(IntegrationTestCase):
	def test_free_rows_are_imported_in_trans_number_order(self):
		scan = _scan(missing_free=[["88122", "2372"], ["88120", "2372"], ["88125", "2400"]])

		items = _work_items(scan)

		self.assertEqual([item[0] for item in items], ["88120", "88122", "88125"])

	def test_blocked_rows_use_suffix_by_default(self):
		scan = _scan(
			missing_free=[["88130", "2372"]],
			missing_blocked=[["88120", "2372", "2356"]],
		)

		items = _work_items(scan)

		self.assertEqual([item[0] for item in items], ["88120", "88130"])
		self.assertEqual([item[2] for item in items], ["blocked", "free"])

	def test_blocked_rows_are_left_out_when_suffix_is_off(self):
		scan = _scan(
			missing_free=[["88130", "2372"]],
			missing_blocked=[["88120", "2372", "2356"]],
		)

		items = _work_items(scan, suffix_conflicts=0)

		self.assertEqual([item[0] for item in items], ["88130"])


class TestPhysicalExaminationReconcileSummary(IntegrationTestCase):
	def test_progress_starts_with_expected_counters(self):
		progress = _new_progress(limit=10)

		self.assertEqual(progress["job_key"], JOB_KEY)
		self.assertEqual(progress["skipped_same_content"], 0)
		self.assertEqual(progress["erpnext_exams"], 0)

	def test_summary_mentions_same_content_skips(self):
		progress = _new_progress()
		progress.update(
			{
				"dry_run": 1,
				"oracle_rows": 5000,
				"oracle_admissions": 800,
				"erpnext_exams": 4980,
				"matched_exams": 4970,
				"missing_free": 15,
				"missing_blocked": 5,
				"created": 2,
				"suffixed_trans_nos": 1,
				"skipped_same_content": 17,
			}
		)

		message = _summary_message(progress)

		self.assertIn("DRY RUN", message)
		self.assertIn(CONFLICT_SUFFIX, message)
		self.assertIn("17", message)
