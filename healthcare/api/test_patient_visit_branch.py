# Copyright (c) 2026, Healthcare contributors
# See license.txt

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from healthcare.api import daily_patient_visit
from healthcare.api.patient_visit_branch import (
	backfill_patient_visit_branch,
	branch_for_patient,
	branch_from_setups,
	candidate_names,
	is_legacy_visit,
	run_patient_visit_branch_backfill_batch,
)


class PatientVisitBranchTestBase(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		branches = frappe.get_all(
			"Cost Center", filters={"is_group": 0}, pluck="name", limit=2, order_by="name"
		)
		if len(branches) < 2:
			self.skipTest("Two leaf Cost Centers are required")
		self.branch_a, self.branch_b = branches

		patients = frappe.db.sql(
			"""
			SELECT p.name
			FROM `tabPatient` p
			WHERE NOT EXISTS (
				SELECT 1 FROM `tabDaily Patient Visit Setup` s WHERE s.patient = p.name
			)
			ORDER BY p.name
			LIMIT 1
			""",
			pluck=True,
		)
		if not patients:
			self.skipTest("A Patient without Daily Patient Visit Setup is required")
		self.patient = patients[0]

		if not frappe.db.exists("Patient Visit Type", "Daily Auto Visit"):
			frappe.get_doc(
				{"doctype": "Patient Visit Type", "visit_type": "Daily Auto Visit"}
			).insert(ignore_permissions=True)

	def make_setup(self, **kwargs):
		doc = frappe.get_doc(
			{
				"doctype": "Daily Patient Visit Setup",
				"patient": self.patient,
				"from_date": "2026-01-01",
				"to_date": "2026-12-31",
				"is_active": 1,
				**kwargs,
			}
		)
		doc.insert(ignore_permissions=True)
		return doc

	def make_visit(self, encounter_date="2026-05-05", **kwargs):
		doc = frappe.get_doc(
			{
				"doctype": "Patient Visit",
				"case_no": f"PVTEST-{frappe.generate_hash(length=8)}",
				"patient": self.patient,
				"encounter_date": encounter_date,
				"encounter_time": "09:00:00",
				"visit_type": "Daily Auto Visit",
				"status": "Open",
				**kwargs,
			}
		)
		doc.insert(ignore_permissions=True)
		return doc


class TestPatientVisitBranchResolution(PatientVisitBranchTestBase):
	def test_branch_from_covering_setup(self):
		self.make_setup(branch=self.branch_a)
		self.assertEqual(branch_for_patient(self.patient, "2026-05-05"), self.branch_a)

	def test_branch_outside_setup_range_falls_back_to_only_branch(self):
		self.make_setup(branch=self.branch_a, from_date="2026-01-01", to_date="2026-03-31")
		self.assertEqual(branch_for_patient(self.patient, "2026-05-05"), self.branch_a)

	def test_conflicting_branches_on_same_date_are_not_guessed(self):
		self.make_setup(branch=self.branch_a)
		self.make_setup(branch=self.branch_b)
		self.assertIsNone(branch_for_patient(self.patient, "2026-05-05"))

	def test_covering_setup_wins_over_other_branch(self):
		self.make_setup(branch=self.branch_a, from_date="2026-01-01", to_date="2026-06-30")
		self.make_setup(branch=self.branch_b, from_date="2026-07-01", to_date="2026-12-31")
		self.assertEqual(branch_for_patient(self.patient, "2026-05-05"), self.branch_a)
		self.assertEqual(branch_for_patient(self.patient, "2026-08-05"), self.branch_b)

	def test_branch_from_setups_returns_none_without_branch(self):
		self.assertIsNone(branch_from_setups([], "2026-05-05"))
		self.assertIsNone(branch_from_setups([{"branch": "", "from_date": None}], "2026-05-05"))

	def test_no_setup_returns_no_branch(self):
		self.assertIsNone(branch_for_patient(self.patient, "2026-05-05"))


class TestPatientVisitBranchBackfill(PatientVisitBranchTestBase):
	def test_backfill_sets_branch_from_setup(self):
		self.make_setup(branch=self.branch_a)
		visit = self.make_visit()

		result = backfill_patient_visit_branch(visit.name)

		self.assertEqual(result["status"], "ok")
		self.assertEqual(result["branch"], self.branch_a)
		self.assertEqual(result["source"], "setup")
		self.assertEqual(
			frappe.db.get_value("Patient Visit", visit.name, "cost_center"), self.branch_a
		)

	def test_backfill_skips_visit_that_already_has_branch(self):
		self.make_setup(branch=self.branch_a)
		visit = self.make_visit(cost_center=self.branch_b)

		result = backfill_patient_visit_branch(visit.name)

		self.assertEqual(result["status"], "skip_has_branch")
		self.assertEqual(
			frappe.db.get_value("Patient Visit", visit.name, "cost_center"), self.branch_b
		)

	def test_backfill_skips_legacy_visit(self):
		self.make_setup(branch=self.branch_a)
		visit = self.make_visit(old_trans_num="990001")

		result = backfill_patient_visit_branch(visit.name)

		self.assertEqual(result["status"], "skip_legacy")
		self.assertFalse(frappe.db.get_value("Patient Visit", visit.name, "cost_center"))

	def test_backfill_skips_visit_without_branch_source(self):
		visit = self.make_visit(cost_center=None)

		result = backfill_patient_visit_branch(visit.name)

		self.assertEqual(result["status"], "skip_no_source")
		self.assertFalse(frappe.db.get_value("Patient Visit", visit.name, "cost_center"))

	def test_run_batch_counts_updates_and_skips(self):
		self.make_setup(branch=self.branch_a)
		good = self.make_visit()
		legacy = self.make_visit(old_trans_num="990002")

		result = run_patient_visit_branch_backfill_batch([good.name, legacy.name])

		self.assertEqual(result["ok"], 1)
		self.assertEqual(result["skip_legacy"], 1)
		self.assertEqual(result["errors"], 0)
		self.assertEqual(frappe.db.get_value("Patient Visit", good.name, "cost_center"), self.branch_a)
		self.assertFalse(frappe.db.get_value("Patient Visit", legacy.name, "cost_center"))

	def test_candidate_names_excludes_legacy_and_already_filled(self):
		self.make_setup(branch=self.branch_a)
		good = self.make_visit()
		legacy = self.make_visit(old_trans_num="990003")
		filled = self.make_visit(cost_center=self.branch_b)

		names = candidate_names(patient=self.patient)

		self.assertIn(good.name, names)
		self.assertNotIn(legacy.name, names)
		self.assertNotIn(filled.name, names)


class TestLegacyVisitDetection(PatientVisitBranchTestBase):
	def test_oracle_markers_mark_visit_as_legacy(self):
		for field in ("old_trans_num", "inv_num", "year_month"):
			with self.subTest(field=field):
				self.assertTrue(is_legacy_visit({field: "123", "docstatus": 0, "visit_type": "X"}))

	def test_submitted_visit_without_visit_type_is_legacy(self):
		self.assertTrue(is_legacy_visit({"docstatus": 1, "visit_type": ""}))

	def test_draft_daily_auto_visit_is_not_legacy(self):
		self.assertFalse(is_legacy_visit({"docstatus": 0, "visit_type": "Daily Auto Visit"}))


class TestDailyAutoVisitCostCenterCreation(PatientVisitBranchTestBase):
	def _setup_row(self, name):
		return frappe.get_all(
			"Daily Patient Visit Setup",
			filters={"name": name},
			fields=[
				"name",
				"patient",
				"practioner",
				"admission",
				"from_date",
				"to_date",
				"time",
				"branch",
			],
		)[0]

	def test_created_daily_visit_copies_setup_branch(self):
		setup = self.make_setup(branch=self.branch_a)
		row = self._setup_row(setup.name)

		with (
			patch.object(daily_patient_visit, "visit_type_no_charges", return_value=True),
			patch.object(
				daily_patient_visit,
				"get_next_transaction_number",
				return_value=f"PVTEST-{frappe.generate_hash(length=8)}",
			),
		):
			visit_name = daily_patient_visit._create_daily_auto_visit_for_date(row, "2026-05-05")

		self.assertEqual(
			frappe.db.get_value("Patient Visit", visit_name, "cost_center"), self.branch_a
		)

	def test_existing_visit_without_branch_is_repaired(self):
		setup = self.make_setup(branch=self.branch_a)
		visit = self.make_visit()
		row = self._setup_row(setup.name)

		repaired = daily_patient_visit._ensure_daily_auto_visit_cost_center(
			row, visit.name, "2026-05-05"
		)

		self.assertTrue(repaired)
		self.assertEqual(
			frappe.db.get_value("Patient Visit", visit.name, "cost_center"), self.branch_a
		)
