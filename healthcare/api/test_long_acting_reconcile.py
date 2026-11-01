# Copyright (c) 2026, Healthcare contributors
# See license.txt

from datetime import date

from frappe.tests import IntegrationTestCase

from healthcare.api.long_acting_reconcile import (
	ORACLE_TABLE,
	_give_out_key,
	_grouped_rows,
	_lam_refresh_changes,
	_medication_key,
	_missing_give_out_rows,
	_new_progress,
	_observed_interval_days,
	_prepare_row,
	_rows_without_medication,
	_search_lam,
	_summary_message,
)


def _row(day: str, trans: str = "1", **kwargs) -> dict:
	"""One Oracle VISIT_00_04 row in the shape the importer uses."""
	year, month, day_of_month = (int(part) for part in day.split("-"))
	row = {
		"trans_num": trans,
		"patient_num": "849995",
		"medication": "FLUANXOL DEPOT 100 MG/ML",
		"acting_date": date(year, month, day_of_month),
		"acting_time": "12:24:40",
	}
	row.update(kwargs)
	return row


def _lam(**kwargs) -> dict:
	record = {
		"name": "SMP-2026-00001",
		"patient": "849995",
		"status": "Inactive",
		"docstatus": 1,
		"start_date": date(2021, 3, 12),
		"end_date": date(2026, 6, 1),
		"next_run_date": date(2026, 6, 8),
		"frequency": "",
		"written_frequency": "",
	}
	record.update(kwargs)
	return record


class TestLongActingReconcileRows(IntegrationTestCase):
	"""Oracle VISIT_00_04 -> Long Acting Medicine mapping.

	The reconcile job talks to Oracle, but the decisions pinned here are the
	ones that decide whether an injection is stored once, twice or not at all.
	"""

	def test_oracle_table_is_visit_00_04(self):
		self.assertEqual(ORACLE_TABLE, "VISIT_00_04")

	def test_row_is_mapped_to_the_importer_row(self):
		row = _prepare_row(
			{
				"TRANS_NUM": "1181",
				"PATIENT_NUM": "849995",
				"ACTING_DATE": "2021-03-12 12:24:40",
				"MEDICATION": "VOLTAREN 75 mg/3ml",
				"DOSE": "VOLTAREN 75 mg/3ml",
				"FREQUENCY": "",
				"NEXT_DOSE": "",
				"CR_ID": "164",
				"UP_ID": "164",
				"BRANCH_NUM": "1",
				"IS_CANCELLED": "N",
				"CANCELLED_REMARKS": "",
			}
		)

		self.assertEqual(row["trans_num"], "1181")
		self.assertEqual(row["patient_num"], "849995")
		self.assertEqual(row["medication"], "VOLTAREN 75 mg/3ml")
		self.assertEqual(row["acting_date"], date(2021, 3, 12))
		self.assertEqual(row["acting_time"], "12:24:40")
		self.assertEqual(row["branch"], "1")
		self.assertEqual(row["cr_id"], "164")

	def test_row_without_time_gets_the_default_time(self):
		row = _prepare_row({"TRANS_NUM": "1", "PATIENT_NUM": "1", "ACTING_DATE": "2026-01-05"})
		self.assertEqual(row["acting_time"], "08:00:00")
		self.assertEqual(row["acting_date"], date(2026, 1, 5))

	def test_medication_matching_ignores_case_and_spacing(self):
		self.assertEqual(
			_medication_key("FLUANXOL DEPOT 100 MG/ML"), _medication_key("fluanxol depot 100mg/ml")
		)
		self.assertEqual(_medication_key("  "), "")

	def test_rows_without_medication_are_not_grouped(self):
		rows = [
			_row("2026-01-01", "1"),
			_row("2026-01-02", "2", medication=""),
			_row("2026-01-03", "3", medication="   "),
		]

		grouped = _grouped_rows(rows)

		self.assertEqual(len(grouped), 1)
		self.assertEqual(len(_rows_without_medication(rows)), 2)
		self.assertEqual(len(grouped["849995|FLUANXOL DEPOT 100 MG/ML"]), 1)

	def test_groups_are_sorted_by_date(self):
		rows = [
			_row("2026-03-01", "3"),
			_row("2026-01-01", "1"),
			_row("2026-02-01", "2"),
			_row("2026-02-01", "2"),
		]

		lines = _grouped_rows(rows)["849995|FLUANXOL DEPOT 100 MG/ML"]

		self.assertEqual([line["trans_num"] for line in lines], ["1", "2", "2", "3"])


class TestLongActingReconcileGiveOuts(IntegrationTestCase):
	"""Only the injections that are not on the record yet may be appended."""

	def test_existing_trans_numbers_are_skipped(self):
		lines = [_row("2026-07-01", "3955"), _row("2026-08-01", "3956")]
		missing = _missing_give_out_rows(lines, {"3955"})

		self.assertEqual([row["trans_num"] for row in missing], ["3956"])

	def test_duplicate_oracle_rows_are_added_once(self):
		lines = [_row("2026-07-01", "3955"), _row("2026-07-01", "3955")]
		missing = _missing_give_out_rows(lines, set())

		self.assertEqual(len(missing), 1)

	def test_row_without_trans_num_uses_the_composite_key(self):
		line = _row("2026-07-01", "", cr_id="164")
		line["trans_num"] = ""
		line["cr_id"] = "164"

		self.assertEqual(_give_out_key(line), "FLUANXOLDEPOT100MG/ML|2026-07-01|164")
		self.assertEqual(len(_missing_give_out_rows([line], {_give_out_key(line)})), 0)

	def test_cancelled_injections_are_still_history(self):
		lines = [_row("2026-07-01", "3955", is_cancelled="Y")]
		missing = _missing_give_out_rows(lines, set())

		self.assertEqual(len(missing), 1)


class TestLongActingReconcileNextDose(IntegrationTestCase):
	"""The next dose must follow the injections Oracle actually recorded."""

	def test_observed_interval_is_the_median_gap(self):
		lines = [
			_row("2026-01-01", "1"),
			_row("2026-01-29", "2"),
			_row("2026-02-26", "3"),
			_row("2026-03-26", "4"),
		]

		self.assertEqual(_observed_interval_days(lines), 28)

	def test_observed_interval_ignores_cancelled_rows(self):
		lines = [
			_row("2026-01-01", "1"),
			_row("2026-01-05", "2", is_cancelled="Y"),
			_row("2026-01-29", "3"),
		]

		self.assertEqual(_observed_interval_days(lines), 28)

	def test_end_date_and_next_dose_follow_the_last_injection(self):
		changes = _lam_refresh_changes(
			_lam(end_date=date(2026, 6, 1), next_run_date=date(2026, 6, 8)),
			[
				_row("2026-09-28", "3955"),
				_row("2026-10-26", "3956"),
			],
			today=date(2026, 11, 1),
		)

		self.assertEqual(changes["end_date"], date(2026, 10, 26))
		# No Oracle frequency: the observed rhythm of the two injections (28 days).
		self.assertEqual(changes["next_run_date"], date(2026, 11, 23))
		self.assertEqual(changes["status"], "Active")

	def test_next_dose_never_moves_backwards(self):
		changes = _lam_refresh_changes(
			_lam(next_run_date=date(2026, 12, 24)),
			[_row("2026-10-26", "3956")],
			today=date(2026, 11, 1),
		)

		self.assertNotIn("next_run_date", changes)

	def test_completed_in_oracle_completes_the_record(self):
		changes = _lam_refresh_changes(
			_lam(status="Active", next_run_date=date(2026, 7, 1)),
			[_row("2026-06-24", "3956", status="Completed")],
			today=date(2026, 11, 1),
		)

		self.assertEqual(changes["status"], "Completed")
		self.assertIsNone(changes["next_run_date"])

	def test_submitted_records_keep_the_draft_only_fields(self):
		changes = _lam_refresh_changes(
			_lam(docstatus=1, start_date=date(2021, 3, 12), written_frequency=""),
			[_row("2021-03-12", "1", frequency="Q4W")],
			today=date(2026, 11, 1),
		)

		self.assertNotIn("start_date", changes)
		self.assertNotIn("written_frequency", changes)
		# Frequency itself is allowed on submit, so it is still stored.
		self.assertEqual(changes["frequency"], "Monthly")

	def test_past_next_dose_does_not_reactivate_the_record(self):
		changes = _lam_refresh_changes(
			_lam(next_run_date=date(2026, 6, 8)),
			[_row("2026-06-01", "1")],
			today=date(2026, 11, 1),
		)

		self.assertNotIn("status", changes)

	def test_oracle_next_dose_wins_when_it_is_stored(self):
		changes = _lam_refresh_changes(
			_lam(next_run_date=date(2026, 6, 8)),
			[_row("2026-10-26", "3956", next_dose="2026-12-04")],
			today=date(2026, 11, 1),
		)

		self.assertEqual(changes["next_run_date"], date(2026, 12, 4))


class TestLongActingReconcileMatching(IntegrationTestCase):
	"""Finding the record that already holds the history of one depot."""

	def test_exact_medication_name_matches(self):
		lam = _lam()
		index = {
			"by_key": {"849995|FLUANXOLDEPOT100MG/ML": [lam]},
			"by_patient": {"849995": [("FLUANXOLDEPOT100MG/ML", lam)]},
		}

		candidates, match_kind = _search_lam(index, "849995", "FLUANXOL DEPOT 100 mg/ml")

		self.assertEqual(match_kind, "exact")
		self.assertEqual([row["name"] for row in candidates], ["SMP-2026-00001"])

	def test_full_item_name_matches_the_legacy_name(self):
		lam = _lam()
		index = {
			"by_key": {},
			"by_patient": {
				"861648": [
					(
						"FLUANXOLDEPOT100MG/ML10X1MLSOLUTIONFORINJECTION",
						lam,
					)
				]
			},
		}

		candidates, match_kind = _search_lam(index, "861648", "FLUANXOL DEPOT 100 MG/ML")

		self.assertEqual(match_kind, "similar")
		self.assertEqual([row["name"] for row in candidates], ["SMP-2026-00001"])

	def test_a_different_strength_is_not_a_match(self):
		lam = _lam()
		index = {
			"by_key": {},
			"by_patient": {"849995": [("FLUANXOLDEPOT100MG/ML", lam)]},
		}

		candidates, match_kind = _search_lam(index, "849995", "FLUANXOL DEPOT 20 MG/ML")

		self.assertEqual(candidates, [])
		self.assertEqual(match_kind, "")

	def test_short_names_are_never_matched_by_containment(self):
		lam = _lam()
		index = {"by_key": {}, "by_patient": {"849995": [("HALDOL", lam)]}}

		candidates, match_kind = _search_lam(index, "849995", "HALDOL")

		self.assertEqual(candidates, [])
		self.assertEqual(match_kind, "")


class TestLongActingReconcileSummary(IntegrationTestCase):
	def test_progress_starts_with_the_counters_the_dialog_polls(self):
		progress = _new_progress(limit=25)

		self.assertEqual(progress["job_key"], "long_acting_reconcile")
		self.assertEqual(progress["state"], "queued")
		self.assertEqual(progress["limit"], 25)
		self.assertEqual(progress["processed"], 0)
		self.assertEqual(progress["added_give_outs"], 0)

	def test_summary_reports_the_dry_run_and_the_duplicates(self):
		progress = _new_progress()
		progress.update(
			{
				"dry_run": 1,
				"oracle_rows": 3927,
				"oracle_groups": 661,
				"missing_give_outs": 208,
				"added_give_outs": 208,
				"duplicate_groups": 1,
				"duplicate_lams": ["849995 · FLUANXOL: SMP-1, SMP-2"],
			}
		)

		message = _summary_message(progress)

		self.assertIn("DRY RUN", message)
		self.assertIn("3927 in 661", message)
		self.assertIn("Give-outs added: 208", message)
		self.assertIn("SMP-1, SMP-2", message)
