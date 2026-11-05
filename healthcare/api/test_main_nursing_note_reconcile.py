# Copyright (c) 2026, Healthcare contributors
# See license.txt

from frappe.tests import IntegrationTestCase

from healthcare.api.main_nursing_note_reconcile import (
	CONFLICT_SUFFIX,
	DOCTYPE,
	JOB_KEY,
	ORACLE_TABLE,
	_new_progress,
	_norm_text,
	_numeric_key,
	_prepare_row,
	_sql_text,
	_summary_message,
	_work_items,
)


def _scan(**kwargs) -> dict:
	"""The matching side of the comparison, in the shape ``_scan`` returns."""
	scan = {"missing_free": [], "missing_blocked": []}
	scan.update(kwargs)
	return scan


def _row(**kwargs) -> dict:
	"""One Oracle IP_NURSING row as the driver hands it over (upper case keys)."""
	row = {
		"TRANS_NUM": "435297",
		"ADMISSION_NUM": "2372",
		"NURSING_DATE": "2026-03-04 00:00:00",
		"NURSING_TIME": "06:00:00",
		"NURSING_DESC": "Patient slept well",
		"USER_NAME": "nurse1",
		"BRANCH_NUM": "1",
		"SHIFT_CODE": "MOR",
		"CR_ID": "164",
	}
	row.update(kwargs)
	return row


class TestMainNursingNoteReconcileRows(IntegrationTestCase):
	"""Oracle IP_NURSING -> Main Nursing Note.

	The job reads Oracle, but the decisions pinned here are the ones that decide
	whether a ward note is stored once, twice or not at all.
	"""

	def test_oracle_table_is_ip_nursing(self):
		self.assertEqual(ORACLE_TABLE, "IP_NURSING")
		self.assertEqual(DOCTYPE, "Main Nursing Note")
		self.assertEqual(JOB_KEY, "main_nursing_note_reconcile")

	def test_row_is_mapped_to_the_importer_row(self):
		row = _prepare_row(_row())

		self.assertEqual(row["trans_num"], "435297")
		self.assertEqual(row["admission_num"], "2372")
		self.assertEqual(row["nursing_date"], "2026-03-04 00:00:00")
		self.assertEqual(row["nursing_time"], "06:00:00")
		self.assertEqual(row["nursing_desc"], "Patient slept well")
		self.assertEqual(row["user_name"], "nurse1")
		self.assertEqual(row["branch_num"], "1")
		self.assertEqual(row["shift_code"], "MOR")
		self.assertEqual(row["cr_id"], "164")

	def test_oracle_numbers_lose_their_decimal_tail(self):
		row = _prepare_row(_row(TRANS_NUM=435297.0, ADMISSION_NUM="2372.0", BRANCH_NUM=" 1 "))

		self.assertEqual(row["trans_num"], "435297")
		self.assertEqual(row["admission_num"], "2372")
		self.assertEqual(row["branch_num"], "1")

	def test_row_without_trans_number_is_dropped(self):
		self.assertIsNone(_prepare_row(_row(TRANS_NUM="")))
		self.assertIsNone(_prepare_row(_row(TRANS_NUM=None)))

	def test_sql_literal_quotes_numbers_and_escapes_quotes(self):
		# TRANS_NUM is a NUMBER in Oracle but TEXT in the uploaded Excel.
		self.assertEqual(_sql_text("435297"), "'435297'")
		self.assertEqual(_sql_text("O'Brien"), "'O''Brien'")

	def test_suffixed_trans_number_maps_back_to_the_oracle_number(self):
		self.assertEqual(_numeric_key("435297"), "435297")
		self.assertEqual(_numeric_key(" 435297 "), "435297")
		self.assertEqual(_numeric_key(435297.0), "435297")
		self.assertEqual(_numeric_key(f"435297{CONFLICT_SUFFIX}"), "435297")
		self.assertEqual(_numeric_key(f"435297{CONFLICT_SUFFIX}-2"), "435297")
		self.assertEqual(_numeric_key(""), "")

	def test_note_text_comparison_ignores_the_importer_prefix_and_case(self):
		self.assertEqual(
			_norm_text("[06:00] Patient Slept   Well"),
			_norm_text("patient slept well"),
		)
		self.assertEqual(_norm_text("[06:00] Patient Slept Well"), "patient slept well")
		self.assertEqual(
			_norm_text("[06:00] Shift start\n[14:00] Handover done"),
			"shift start\nhandover done",
		)
		self.assertEqual(_norm_text(None), "")


class TestMainNursingNoteReconcileWorkList(IntegrationTestCase):
	"""Which Oracle numbers one run imports, and in which order."""

	def test_free_rows_are_imported_in_trans_number_order(self):
		scan = _scan(missing_free=[["435300", "2372"], ["435297", "2372"], ["435310", "2400"]])

		items = _work_items(scan)

		self.assertEqual([item[0] for item in items], ["435297", "435300", "435310"])
		self.assertEqual({item[2] for item in items}, {"free"})

	def test_blocked_rows_are_imported_under_a_suffix_by_default(self):
		scan = _scan(
			missing_free=[["435300", "2372"]],
			missing_blocked=[["435297", "2372", "2356"], ["435298", "2372", "2363"]],
		)

		items = _work_items(scan)

		self.assertEqual([item[0] for item in items], ["435297", "435298", "435300"])
		self.assertEqual([item[2] for item in items], ["blocked", "blocked", "free"])

	def test_blocked_rows_are_left_out_when_the_suffix_is_turned_off(self):
		scan = _scan(
			missing_free=[["435300", "2372"]],
			missing_blocked=[["435297", "2372", "2356"]],
		)

		items = _work_items(scan, suffix_conflicts=0)

		self.assertEqual([item[0] for item in items], ["435300"])

	def test_limit_keeps_the_first_rows(self):
		scan = _scan(missing_free=[["435301", "2372"], ["435299", "2372"], ["435300", "2372"]])

		items = _work_items(scan, limit=2)

		self.assertEqual([item[0] for item in items], ["435299", "435300"])

	def test_an_empty_scan_has_nothing_to_do(self):
		self.assertEqual(_work_items(_scan()), [])


class TestMainNursingNoteReconcileSummary(IntegrationTestCase):
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
				"oracle_rows": 425895,
				"blank_rows": 0,
				"oracle_admissions": 31000,
				"erpnext_notes": 422535,
				"matched_notes": 422535,
				"missing_free": 2454,
				"missing_blocked": 3360,
				"created": 3,
				"suffixed_trans_nos": 1,
				"skipped_same_text": 2,
			}
		)

		message = _summary_message(progress)

		self.assertIn("DRY RUN", message)
		self.assertIn("425895", message)
		self.assertIn(CONFLICT_SUFFIX, message)
		self.assertIn("3360", message)
