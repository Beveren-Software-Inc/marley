# Copyright (c) 2026, Healthcare contributors
# See license.txt

from frappe.tests import IntegrationTestCase

from healthcare.api.ect_details_reconcile import (
	CONFLICT_SUFFIX,
	DOCTYPE,
	JOB_KEY,
	ORACLE_TABLE,
	_new_progress,
	_norm_measure,
	_numeric_key,
	_oracle_owner,
	_erp_owner,
	_prepare_row,
	_sql_text,
	_summary_message,
	_ect_fingerprint,
	_work_items,
)


def _scan(**kwargs) -> dict:
	scan = {"missing_free": [], "missing_blocked": []}
	scan.update(kwargs)
	return scan


def _row(**kwargs) -> dict:
	row = {
		"TRANS_NUM": "550123",
		"PATIENT_NUM": "10042",
		"ADMISSION_NUM": "2372",
		"VISIT_NUM": "",
		"TRANS_DATE": "2026-07-02",
		"GTCS_SECONDS": 45,
		"ENERGY_VALUE": "120",
		"IS_SUCCESS": "Y",
		"IS_REPEATED": "N",
		"BRANCH_NUM": "1",
	}
	row.update(kwargs)
	return row


class TestEctDetailsReconcileRows(IntegrationTestCase):
	def test_oracle_table_and_job_key(self):
		self.assertEqual(ORACLE_TABLE, "ECT_00_01")
		self.assertEqual(DOCTYPE, "ECT Details")
		self.assertEqual(JOB_KEY, "ect_details_reconcile")
		self.assertEqual(CONFLICT_SUFFIX, "-E")

	def test_row_is_mapped_to_the_importer_row(self):
		row = _prepare_row(_row())

		self.assertEqual(row["trans_num"], "550123")
		self.assertEqual(row["patient_num"], "10042")
		self.assertEqual(row["admission_num"], "2372")
		self.assertEqual(row["gtcs_seconds"], 45)
		self.assertEqual(row["energy_value"], "120")

	def test_row_without_trans_number_is_dropped(self):
		self.assertIsNone(_prepare_row(_row(TRANS_NUM="")))
		self.assertIsNone(_prepare_row(_row(TRANS_NUM=None)))

	def test_sql_literal_quotes_numbers(self):
		self.assertEqual(_sql_text("550123"), "'550123'")

	def test_suffixed_trans_number_maps_back_to_oracle_number(self):
		self.assertEqual(_numeric_key("550123"), "550123")
		self.assertEqual(_numeric_key(f"550123{CONFLICT_SUFFIX}"), "550123")
		self.assertEqual(_numeric_key(f"550123{CONFLICT_SUFFIX}-2"), "550123")

	def test_owner_keys_prefer_admission_then_visit(self):
		self.assertEqual(_oracle_owner({"ADMISSION_NUM": "2372", "VISIT_NUM": "9001"}), "2372")
		self.assertEqual(_oracle_owner({"ADMISSION_NUM": "", "VISIT_NUM": "9001"}), "@9001")
		self.assertEqual(
			_erp_owner("2372", "", "Inpatient Admission", "2372"),
			"2372",
		)
		self.assertEqual(
			_erp_owner("", "9001", "Patient Visit", "9001"),
			"@9001",
		)

	def test_same_content_fingerprint_ignores_formatting(self):
		left = _ect_fingerprint(_prepare_row(_row(GTCS_SECONDS="45.0", ENERGY_VALUE="120.0")))
		right = _ect_fingerprint(_prepare_row(_row(GTCS_SECONDS=45, ENERGY_VALUE=120)))

		self.assertEqual(left, right)
		self.assertEqual(_norm_measure("45.0"), "45")

	def test_different_measures_on_the_same_day_do_not_match(self):
		left = _ect_fingerprint(_prepare_row(_row(GTCS_SECONDS=45)))
		right = _ect_fingerprint(_prepare_row(_row(GTCS_SECONDS=60)))

		self.assertNotEqual(left, right)


class TestEctDetailsReconcileWorkList(IntegrationTestCase):
	def test_free_rows_are_imported_in_trans_number_order(self):
		scan = _scan(missing_free=[["550300", "2372"], ["550123", "2372"], ["550310", "2400"]])

		items = _work_items(scan)

		self.assertEqual([item[0] for item in items], ["550123", "550300", "550310"])
		self.assertEqual({item[2] for item in items}, {"free"})

	def test_blocked_rows_use_suffix_by_default(self):
		scan = _scan(
			missing_free=[["550300", "2372"]],
			missing_blocked=[["550123", "2372", "2356"], ["550124", "2372", "2363"]],
		)

		items = _work_items(scan)

		self.assertEqual([item[0] for item in items], ["550123", "550124", "550300"])
		self.assertEqual([item[2] for item in items], ["blocked", "blocked", "free"])

	def test_blocked_rows_are_left_out_when_suffix_is_off(self):
		scan = _scan(
			missing_free=[["550300", "2372"]],
			missing_blocked=[["550123", "2372", "2356"]],
		)

		items = _work_items(scan, suffix_conflicts=0)

		self.assertEqual([item[0] for item in items], ["550300"])

	def test_limit_keeps_the_first_rows(self):
		scan = _scan(missing_free=[["550301", "2372"], ["550299", "2372"], ["550300", "2372"]])

		items = _work_items(scan, limit=2)

		self.assertEqual([item[0] for item in items], ["550299", "550300"])


class TestEctDetailsReconcileSummary(IntegrationTestCase):
	def test_progress_starts_with_counters(self):
		progress = _new_progress(limit=10)

		self.assertEqual(progress["job_key"], JOB_KEY)
		self.assertEqual(progress["state"], "queued")
		self.assertEqual(progress["limit"], 10)
		self.assertEqual(progress["created"], 0)
		self.assertEqual(progress["suffix_conflicts"], 1)

	def test_summary_reports_dry_run_and_suffix(self):
		progress = _new_progress()
		progress.update(
			{
				"dry_run": 1,
				"oracle_rows": 5000,
				"created": 2,
				"suffixed_trans_nums": 1,
				"skipped_same_content": 3,
				"missing_blocked": 4,
			}
		)

		message = _summary_message(progress)

		self.assertIn("DRY RUN", message)
		self.assertIn(CONFLICT_SUFFIX, message)
		self.assertIn("5000", message)
