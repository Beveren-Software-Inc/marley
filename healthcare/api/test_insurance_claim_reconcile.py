# Copyright (c) 2026, Healthcare contributors
# See license.txt

from frappe.tests import IntegrationTestCase, UnitTestCase

from healthcare.api.insurance_claim_reconcile import (
	DOCTYPE,
	JOB_KEY,
	ORACLE_MASTER,
	_new_progress,
	_summary_message,
	_trans_key,
	_work_items,
)


def _scan(**kwargs) -> dict:
	scan = {"missing_claims": []}
	scan.update(kwargs)
	return scan


class TestInsuranceClaimReconcileKeys(UnitTestCase):
	def test_oracle_tables(self):
		self.assertEqual(ORACLE_MASTER, "INSURANCE_00_01")
		self.assertEqual(DOCTYPE, "Insurance Claim")
		self.assertEqual(JOB_KEY, "insurance_claim_reconcile")

	def test_trans_key_normalises_numbers(self):
		self.assertEqual(_trans_key("881234"), "881234")
		self.assertEqual(_trans_key(881234.0), "881234")
		self.assertEqual(_trans_key(" 881234 "), "881234")


class TestInsuranceClaimReconcileWorkList(IntegrationTestCase):
	def test_missing_trans_numbers_are_sorted(self):
		scan = _scan(missing_claims=[["90010", "100"], ["90002", "101"], ["90009", "102"]])
		items = _work_items(scan)
		self.assertEqual([item[0] for item in items], ["90002", "90009", "90010"])

	def test_patient_filter(self):
		scan = _scan(
			missing_claims=[["90001", "100"], ["90002", "200"], ["90003", "100"]],
		)
		items = _work_items(scan, patient="100")
		self.assertEqual([item[0] for item in items], ["90001", "90003"])

	def test_limit(self):
		scan = _scan(missing_claims=[["90003", "1"], ["90001", "2"], ["90002", "3"]])
		items = _work_items(scan, limit=1)
		self.assertEqual([item[0] for item in items], ["90001"])


class TestInsuranceClaimReconcileSummary(IntegrationTestCase):
	def test_progress_defaults(self):
		progress = _new_progress(limit=25)
		self.assertEqual(progress["job_key"], JOB_KEY)
		self.assertEqual(progress["limit"], 25)
		self.assertEqual(progress["created"], 0)

	def test_summary_includes_master_table(self):
		progress = _new_progress()
		progress.update({"oracle_claims": 500, "missing_claims": 10, "created": 3})
		message = _summary_message(progress)
		self.assertIn(ORACLE_MASTER, message)
