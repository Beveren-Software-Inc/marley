# Copyright (c) 2026, Healthcare contributors
# See license.txt

from frappe.tests import IntegrationTestCase

from healthcare.api.patient_history_reconcile import (
	DOCTYPE,
	JOB_KEY,
	ORACLE_TABLE,
	_import_rows_fingerprint,
	_line_fingerprint,
	_new_progress,
	_prepare_row,
	_sql_text,
	_summary_message,
	_work_items,
)


def _scan(**kwargs) -> dict:
	scan = {"missing_admissions": []}
	scan.update(kwargs)
	return scan


def _row(**kwargs) -> dict:
	row = {
		"ADMISSION_NUM": "2372",
		"PATIENT_NUM": "10042",
		"ATTRIB_NUM": "12",
		"ATT_NOTES": "Previous admission in 2020",
		"FIELD1": "Yes",
		"ATT_NOTES2": "",
		"BRANCH_NUM": "1",
	}
	row.update(kwargs)
	return row


class TestPatientHistoryReconcileRows(IntegrationTestCase):
	"""Oracle IP_ADMISSION_02 -> Patient History matching helpers."""

	def test_oracle_table_is_ip_admission_02(self):
		self.assertEqual(ORACLE_TABLE, "IP_ADMISSION_02")
		self.assertEqual(DOCTYPE, "Patient History")
		self.assertEqual(JOB_KEY, "patient_history_reconcile")

	def test_row_is_mapped_to_import_shape(self):
		row = _prepare_row(_row(), attrib_names={12: "Past psychiatric history"})

		self.assertEqual(row["admission"], "2372")
		self.assertEqual(row["patient"], "10042")
		self.assertEqual(row["attrib_num"], 12)
		self.assertEqual(row["description"], "Previous admission in 2020")
		self.assertEqual(row["field_1"], "Yes")
		self.assertEqual(row["attribute"], "Past psychiatric history")

	def test_oracle_numbers_lose_their_decimal_tail(self):
		row = _prepare_row(
			_row(ADMISSION_NUM=2372.0, ATTRIB_NUM=12.0, BRANCH_NUM=" 1 "),
			attrib_names={12: "Past psychiatric history"},
		)

		self.assertEqual(row["admission"], "2372")
		self.assertEqual(row["attrib_num"], 12)

	def test_row_without_admission_or_attrib_is_dropped(self):
		self.assertIsNone(_prepare_row(_row(ADMISSION_NUM=""), attrib_names={}))
		self.assertIsNone(_prepare_row(_row(ATTRIB_NUM=""), attrib_names={}))

	def test_sql_literal_quotes_numbers_and_escapes_quotes(self):
		self.assertEqual(_sql_text("2372"), "'2372'")
		self.assertEqual(_sql_text("O'Brien"), "'O''Brien'")

	def test_same_content_fingerprint_ignores_case_and_spacing(self):
		left = _import_rows_fingerprint(
			[
				{
					"attrib_num": 12,
					"description": "  Previous admission ",
					"field_1": "YES",
					"attribute_note_2": "",
				}
			]
		)
		right = _import_rows_fingerprint(
			[
				{
					"attrib_num": 12,
					"description": "previous admission",
					"field_1": "yes",
					"attribute_note_2": "",
				}
			]
		)

		self.assertEqual(left, right)
		self.assertEqual(
			_line_fingerprint(12, "A", "B", "C"),
			(12, "a", "b", "c"),
		)

	def test_blank_lines_are_ignored_in_the_fingerprint(self):
		fp = _import_rows_fingerprint(
			[
				{"attrib_num": 1, "description": "", "field_1": "", "attribute_note_2": ""},
				{"attrib_num": 2, "description": "Note", "field_1": "", "attribute_note_2": ""},
			]
		)

		self.assertEqual(fp, ((2, "note", "", ""),))


class TestPatientHistoryReconcileWorkList(IntegrationTestCase):
	def test_missing_admissions_are_processed_in_number_order(self):
		scan = _scan(
			missing_admissions=[["2400", "10001"], ["2372", "10042"], ["2399", "10055"]],
		)

		items = _work_items(scan)

		self.assertEqual([item[0] for item in items], ["2372", "2399", "2400"])

	def test_limit_keeps_the_first_admissions(self):
		scan = _scan(
			missing_admissions=[["2400", "10001"], ["2372", "10042"], ["2399", "10055"]],
		)

		items = _work_items(scan, limit=2)

		self.assertEqual([item[0] for item in items], ["2372", "2399"])

	def test_an_empty_scan_has_nothing_to_do(self):
		self.assertEqual(_work_items(_scan()), [])


class TestPatientHistoryReconcileSummary(IntegrationTestCase):
	def test_progress_starts_with_the_counters_the_dialog_polls(self):
		progress = _new_progress(limit=25)

		self.assertEqual(progress["job_key"], JOB_KEY)
		self.assertEqual(progress["state"], "queued")
		self.assertEqual(progress["limit"], 25)
		self.assertEqual(progress["processed"], 0)
		self.assertEqual(progress["created"], 0)
		self.assertEqual(progress["files"], [])

	def test_summary_reports_the_dry_run_and_missing_admissions(self):
		progress = _new_progress()
		progress.update(
			{
				"dry_run": 1,
				"oracle_rows": 90000,
				"oracle_admissions": 12000,
				"erpnext_histories": 11800,
				"matched_histories": 11800,
				"missing_admissions": 200,
				"created": 5,
				"skipped_same_content": 2,
			}
		)

		message = _summary_message(progress)

		self.assertIn("DRY RUN", message)
		self.assertIn("90000", message)
		self.assertIn("200", message)
