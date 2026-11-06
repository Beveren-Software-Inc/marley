# Copyright (c) 2026, Healthcare contributors
# See license.txt

from frappe.tests import UnitTestCase

from healthcare.api.medical_diagnosis_reconcile import (
	ip_identity,
	names_to_remove,
	normalize_stored_trans,
	op_identity,
)


class TestMedicalDiagnosisIdentity(UnitTestCase):
	def test_op_key_ignores_leading_zeros(self):
		self.assertEqual(
			op_identity("00860094", "01", "136827", "", "0509494"),
			op_identity("860094", "1", "136827", None, "509494"),
		)

	def test_stored_op_trans_num_matches_oracle_key(self):
		stored = "VD01/00860094/01/136827/0/0509494"
		self.assertEqual(normalize_stored_trans(stored), op_identity("860094", "1", "136827", "", "509494"))

	def test_ip_key_uses_the_legacy_prefix(self):
		self.assertEqual(ip_identity("00120"), "IPDX/120")
		self.assertEqual(normalize_stored_trans("IPDX/00120"), "IPDX/120")

	def test_duplicate_rows_keep_the_earliest(self):
		self.assertEqual(
			names_to_remove(
				[
					("VD-00020", "2026-05-02 10:00:00"),
					("VD-00010", "2026-05-01 10:00:00"),
					("VD-00030", "2026-05-03 10:00:00"),
				]
			),
			["VD-00020", "VD-00030"],
		)
