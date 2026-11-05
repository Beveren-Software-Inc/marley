# Copyright (c) 2026, Healthcare contributors
# See license.txt

from frappe.tests import IntegrationTestCase

from healthcare.api.vital_signs_reconcile import (
	CONFLICT_SUFFIX,
	DOCTYPE,
	JOB_KEY,
	ORACLE_TABLE,
	_new_progress,
	_norm_measure,
	_numeric_key,
	_prepare_row,
	_sql_text,
	_summary_message,
	_vitals_fingerprint,
	_work_items,
)


def _scan(**kwargs) -> dict:
	scan = {"missing_free": [], "missing_blocked": []}
	scan.update(kwargs)
	return scan


def _row(**kwargs) -> dict:
	row = {
		"TRANS_NUM": "881234",
		"PATIENT_FILE_NO": "10042",
		"ADMISSION_NUM": "2372",
		"RECORD_DATE": "2026-07-02 00:00:00",
		"BP_SYSTOLIC": 120,
		"BP_DIASTOLIC": 80,
		"PULSE": 72,
		"TEMPERATURE": 36.6,
		"SPO2": 98,
		"WEIGHT": 70,
		"HEIGHT": 175,
		"BRANCH_NUM": "1",
	}
	row.update(kwargs)
	return row


class TestVitalSignsReconcileRows(IntegrationTestCase):
	"""Oracle IP_PATIENT_VITALS -> Vital Signs matching helpers."""

	def test_oracle_table_is_ip_patient_vitals(self):
		self.assertEqual(ORACLE_TABLE, "IP_PATIENT_VITALS")
		self.assertEqual(DOCTYPE, "Vital Signs")
		self.assertEqual(JOB_KEY, "vital_signs_reconcile")

	def test_row_is_mapped_to_the_importer_row(self):
		row = _prepare_row(_row())

		self.assertEqual(row["trans_num"], "881234")
		self.assertEqual(row["patient_file_no"], "10042")
		self.assertEqual(row["admission_num"], "2372")
		self.assertEqual(row["record_date"], "2026-07-02 00:00:00")
		self.assertEqual(row["bp_systolic"], 120)
		self.assertEqual(row["pulse"], 72)

	def test_oracle_numbers_lose_their_decimal_tail(self):
		row = _prepare_row(_row(TRANS_NUM=881234.0, ADMISSION_NUM="2372.0", BRANCH_NUM=" 1 "))

		self.assertEqual(row["trans_num"], "881234")
		self.assertEqual(row["admission_num"], "2372")
		self.assertEqual(row["branch_num"], "1")

	def test_row_without_trans_number_is_dropped(self):
		self.assertIsNone(_prepare_row(_row(TRANS_NUM="")))
		self.assertIsNone(_prepare_row(_row(TRANS_NUM=None)))

	def test_sql_literal_quotes_numbers_and_escapes_quotes(self):
		self.assertEqual(_sql_text("881234"), "'881234'")
		self.assertEqual(_sql_text("O'Brien"), "'O''Brien'")

	def test_suffixed_trans_number_maps_back_to_the_oracle_number(self):
		self.assertEqual(_numeric_key("881234"), "881234")
		self.assertEqual(_numeric_key(" 881234 "), "881234")
		self.assertEqual(_numeric_key(881234.0), "881234")
		self.assertEqual(_numeric_key(f"881234{CONFLICT_SUFFIX}"), "881234")
		self.assertEqual(_numeric_key(f"881234{CONFLICT_SUFFIX}-2"), "881234")

	def test_same_content_fingerprint_ignores_formatting(self):
		left = _vitals_fingerprint(_prepare_row(_row(BP_SYSTOLIC="120.0", PULSE="72")))
		right = _vitals_fingerprint(_prepare_row(_row(BP_SYSTOLIC=120, PULSE=72.0)))

		self.assertEqual(left, right)
		self.assertEqual(_norm_measure("120.0"), "120")
		self.assertEqual(_norm_measure(None), "")

	def test_different_vitals_on_the_same_day_do_not_match(self):
		left = _vitals_fingerprint(_prepare_row(_row(PULSE=72)))
		right = _vitals_fingerprint(_prepare_row(_row(PULSE=88)))

		self.assertNotEqual(left, right)


class TestVitalSignsReconcileWorkList(IntegrationTestCase):
	def test_free_rows_are_imported_in_trans_number_order(self):
		scan = _scan(missing_free=[["881300", "2372"], ["881234", "2372"], ["881310", "2400"]])

		items = _work_items(scan)

		self.assertEqual([item[0] for item in items], ["881234", "881300", "881310"])
		self.assertEqual({item[2] for item in items}, {"free"})

	def test_blocked_rows_are_imported_under_a_suffix_by_default(self):
		scan = _scan(
			missing_free=[["881300", "2372"]],
			missing_blocked=[["881234", "2372", "2356"], ["881235", "2372", "2363"]],
		)

		items = _work_items(scan)

		self.assertEqual([item[0] for item in items], ["881234", "881235", "881300"])
		self.assertEqual([item[2] for item in items], ["blocked", "blocked", "free"])

	def test_blocked_rows_are_left_out_when_the_suffix_is_turned_off(self):
		scan = _scan(
			missing_free=[["881300", "2372"]],
			missing_blocked=[["881234", "2372", "2356"]],
		)

		items = _work_items(scan, suffix_conflicts=0)

		self.assertEqual([item[0] for item in items], ["881300"])

	def test_limit_keeps_the_first_rows(self):
		scan = _scan(missing_free=[["881301", "2372"], ["881299", "2372"], ["881300", "2372"]])

		items = _work_items(scan, limit=2)

		self.assertEqual([item[0] for item in items], ["881299", "881300"])

	def test_an_empty_scan_has_nothing_to_do(self):
		self.assertEqual(_work_items(_scan()), [])


class TestVitalSignsReconcileSummary(IntegrationTestCase):
	def test_progress_starts_with_the_counters_the_dialog_polls(self):
		progress = _new_progress(limit=25)

		self.assertEqual(progress["job_key"], JOB_KEY)
		self.assertEqual(progress["state"], "queued")
		self.assertEqual(progress["limit"], 25)
		self.assertEqual(progress["processed"], 0)
		self.assertEqual(progress["created"], 0)
		self.assertEqual(progress["suffix_conflicts"], 1)
		self.assertEqual(progress["files"], [])

	def test_summary_reports_the_dry_run_and_the_suffixed_rows(self):
		progress = _new_progress()
		progress.update(
			{
				"dry_run": 1,
				"oracle_rows": 120000,
				"oracle_admissions": 31000,
				"erpnext_vitals": 118000,
				"matched_vitals": 118000,
				"missing_free": 1500,
				"missing_blocked": 500,
				"created": 3,
				"suffixed_trans_nos": 1,
				"skipped_same_content": 2,
			}
		)

		message = _summary_message(progress)

		self.assertIn("DRY RUN", message)
		self.assertIn("120000", message)
		self.assertIn(CONFLICT_SUFFIX, message)
		self.assertIn("500", message)
