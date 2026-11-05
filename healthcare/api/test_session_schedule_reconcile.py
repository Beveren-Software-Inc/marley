# Copyright (c) 2026, Healthcare contributors
# See license.txt

from frappe.tests import IntegrationTestCase

from healthcare.api.session_schedule_reconcile import (
	CONFLICT_SUFFIX,
	DOCTYPE,
	JOB_KEY,
	ORACLE_TABLE,
	_content_fingerprint,
	_legacy_record_key,
	_new_progress,
	_norm_text,
	_prepare_row,
	_sql_text,
	_sr_numeric_key,
	_summary_message,
	_work_items,
)


def _scan(**kwargs) -> dict:
	scan = {"missing_free": [], "missing_blocked": []}
	scan.update(kwargs)
	return scan


def _row(**kwargs) -> dict:
	row = {
		"VISIT_NUM": "45001",
		"SR_NUM": "881234",
		"PATIENT_NUM": "10042",
		"SERV_NUM": "PSY-001",
		"CR_DATE": "2026-07-02 09:30:00",
		"DOC_REMARKS": "Session notes",
		"FEEDBACK_REMARKS": "",
		"BRANCH_NUM": "1",
	}
	row.update(kwargs)
	return row


class TestSessionScheduleReconcileRows(IntegrationTestCase):
	"""Oracle VISIT_00_05 -> Session Schedule matching helpers."""

	def test_oracle_table_is_visit_00_05(self):
		self.assertEqual(ORACLE_TABLE, "VISIT_00_05")
		self.assertEqual(DOCTYPE, "Session Schedule")
		self.assertEqual(JOB_KEY, "session_schedule_reconcile")

	def test_row_is_mapped_to_the_importer_row(self):
		row = _prepare_row(_row())

		self.assertEqual(row["visit_num"], "45001")
		self.assertEqual(row["sr_num"], "881234")
		self.assertEqual(row["patient_num"], "10042")
		self.assertEqual(row["legacy_record_key"], "45001::881234")

	def test_row_without_visit_or_sr_is_dropped(self):
		self.assertIsNone(_prepare_row(_row(VISIT_NUM="")))
		self.assertIsNone(_prepare_row(_row(SR_NUM="")))

	def test_sql_literal_quotes_values_and_escapes_quotes(self):
		self.assertEqual(_sql_text("881234"), "'881234'")
		self.assertEqual(_sql_text("O'Brien"), "'O''Brien'")

	def test_suffixed_sr_number_maps_back_to_the_oracle_number(self):
		self.assertEqual(_sr_numeric_key("881234"), "881234")
		self.assertEqual(_sr_numeric_key(f"881234{CONFLICT_SUFFIX}"), "881234")
		self.assertEqual(_sr_numeric_key(f"881234{CONFLICT_SUFFIX}-2"), "881234")

	def test_legacy_record_key_joins_visit_and_sr(self):
		self.assertEqual(_legacy_record_key("45001", "881234"), "45001::881234")

	def test_same_content_fingerprint_ignores_formatting(self):
		left = _content_fingerprint(_prepare_row(_row(DOC_REMARKS="  Session notes  ")))
		right = _content_fingerprint(_prepare_row(_row(DOC_REMARKS="session notes")))

		self.assertEqual(left, right)
		self.assertEqual(_norm_text(None), "")

	def test_different_notes_on_the_same_day_do_not_match(self):
		left = _content_fingerprint(_prepare_row(_row(DOC_REMARKS="First note")))
		right = _content_fingerprint(_prepare_row(_row(DOC_REMARKS="Second note")))

		self.assertNotEqual(left, right)


class TestSessionScheduleReconcileWorkList(IntegrationTestCase):
	def test_free_rows_are_imported_in_key_order(self):
		scan = _scan(
			missing_free=[
				["45001::881300", "45001", "free"],
				["45001::881234", "45001", "free"],
				["45002::881310", "45002", "free"],
			]
		)

		items = _work_items(scan)

		self.assertEqual([item[0] for item in items], ["45001::881234", "45001::881300", "45002::881310"])
		self.assertEqual({item[2] for item in items}, {"free"})

	def test_blocked_rows_are_imported_under_a_suffix_by_default(self):
		scan = _scan(
			missing_free=[["45001::881300", "45001", "free"]],
			missing_blocked=[["45001::881234", "45001", "blocked", "45099"]],
		)

		items = _work_items(scan)

		self.assertEqual([item[0] for item in items], ["45001::881234", "45001::881300"])
		self.assertEqual([item[2] for item in items], ["blocked", "free"])

	def test_blocked_rows_are_left_out_when_the_suffix_is_turned_off(self):
		scan = _scan(
			missing_free=[["45001::881300", "45001", "free"]],
			missing_blocked=[["45001::881234", "45001", "blocked", "45099"]],
		)

		items = _work_items(scan, suffix_conflicts=0)

		self.assertEqual([item[0] for item in items], ["45001::881300"])

	def test_limit_keeps_the_first_rows(self):
		scan = _scan(
			missing_free=[
				["45001::881301", "45001", "free"],
				["45001::881299", "45001", "free"],
				["45001::881300", "45001", "free"],
			]
		)

		items = _work_items(scan, limit=2)

		self.assertEqual([item[0] for item in items], ["45001::881299", "45001::881300"])

	def test_an_empty_scan_has_nothing_to_do(self):
		self.assertEqual(_work_items(_scan()), [])


class TestSessionScheduleReconcileSummary(IntegrationTestCase):
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
				"oracle_rows": 12000,
				"oracle_visits": 3100,
				"erpnext_schedules": 11800,
				"matched_schedules": 11800,
				"missing_free": 150,
				"missing_blocked": 50,
				"created": 3,
				"suffixed_sr_nums": 1,
				"skipped_same_content": 2,
			}
		)

		message = _summary_message(progress)

		self.assertIn("DRY RUN", message)
		self.assertIn("12000", message)
		self.assertIn(CONFLICT_SUFFIX, message)
		self.assertIn("50", message)
