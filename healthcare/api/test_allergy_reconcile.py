# Copyright (c) 2026, Healthcare contributors
# See license.txt

from frappe.tests import IntegrationTestCase, UnitTestCase

from healthcare.api.allergy_reconcile import (
	DOCTYPE,
	JOB_KEY,
	PATIENT_TABLE,
	VISIT_TABLE,
	_dedupe_candidates,
	_norm_match_key,
	_new_progress,
	_summary_message,
	_work_items,
)


class TestAllergyReconcileKeys(UnitTestCase):
	def test_tables_and_job(self):
		self.assertEqual(PATIENT_TABLE, "PATIENT_INFO_01")
		self.assertEqual(VISIT_TABLE, "VISIT_00_01")
		self.assertEqual(DOCTYPE, "Warning Message")
		self.assertEqual(JOB_KEY, "allergy_reconcile")

	def test_norm_match_key_collapses_case_and_html(self):
		self.assertEqual(_norm_match_key("Allergic to Panadol"), "allergic to panadol")
		self.assertEqual(_norm_match_key("<p>Allergic to Panadol</p>"), "allergic to panadol")
		self.assertEqual(_norm_match_key("  allergic   to   panadol "), "allergic to panadol")
		self.assertEqual(_norm_match_key("-"), "")
		self.assertEqual(_norm_match_key("NONE"), "")


class TestAllergyReconcileDedupe(UnitTestCase):
	def test_same_words_keep_latest_visit(self):
		rows = [
			{
				"patient": "100",
				"text": "Penicillin",
				"source": "patient",
				"reference_doc": "Patient",
				"reference_name": "100",
				"visit": "",
				"sort_key": "",
			},
			{
				"patient": "100",
				"text": "penicillin",
				"source": "visit",
				"reference_doc": "Patient Visit",
				"reference_name": "V1",
				"visit": "V1",
				"sort_key": "2024-01-01",
			},
			{
				"patient": "100",
				"text": "PENICILLIN",
				"source": "visit",
				"reference_doc": "Patient Visit",
				"reference_name": "V2",
				"visit": "V2",
				"sort_key": "2025-06-01",
			},
		]
		out = _dedupe_candidates(rows)
		self.assertEqual(len(out), 1)
		self.assertEqual(out[0]["visit"], "V2")
		self.assertEqual(out[0]["source"], "visit")

	def test_different_texts_stay_separate(self):
		rows = [
			{
				"patient": "100",
				"text": "Penicillin",
				"source": "visit",
				"reference_doc": "Patient Visit",
				"reference_name": "V1",
				"visit": "V1",
				"sort_key": "2024-01-01",
			},
			{
				"patient": "100",
				"text": "Peanuts",
				"source": "visit",
				"reference_doc": "Patient Visit",
				"reference_name": "V2",
				"visit": "V2",
				"sort_key": "2024-02-01",
			},
		]
		out = _dedupe_candidates(rows)
		self.assertEqual(len(out), 2)
		self.assertEqual({row["match_key"] for row in out}, {"penicillin", "peanuts"})


class TestAllergyReconcileWorkList(IntegrationTestCase):
	def test_patient_filter_and_limit(self):
		scan = {
			"missing": [
				{"patient": "100", "match_key": "a", "text": "A", "action": "create"},
				{"patient": "200", "match_key": "b", "text": "B", "action": "create"},
				{"patient": "100", "match_key": "c", "text": "C", "action": "flag"},
			]
		}
		items = _work_items(scan, patient="100")
		self.assertEqual([item["match_key"] for item in items], ["a", "c"])
		items = _work_items(scan, limit=1)
		self.assertEqual(len(items), 1)


class TestAllergyReconcileSummary(IntegrationTestCase):
	def test_progress_defaults_and_summary(self):
		progress = _new_progress(limit=10)
		self.assertEqual(progress["job_key"], JOB_KEY)
		self.assertEqual(progress["limit"], 10)
		progress.update(
			{
				"allergy_texts": 5,
				"patients_with_allergy": 3,
				"created": 2,
				"flagged": 1,
			}
		)
		message = _summary_message(progress)
		self.assertIn(PATIENT_TABLE, message)
		self.assertIn(VISIT_TABLE, message)
		self.assertIn("Created: 2", message)
