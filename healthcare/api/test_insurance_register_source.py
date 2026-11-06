# Copyright (c) 2026, Healthcare contributors
# See license.txt

import frappe
from frappe.tests import UnitTestCase

from healthcare.api.insurance_register_reconcile import (
	ORACLE_CHILD,
	ORACLE_MASTER,
	_oracle_insured_index,
	_uploaded_register_tables,
)


class TestInsuranceRegisterSource(UnitTestCase):
	def test_upload_accepts_either_insurance_table(self):
		self.assertEqual(
			_uploaded_register_tables([{"table": "INSURANCE_00_01", "file_url": "/a.xlsx"}]),
			[ORACLE_MASTER],
		)
		self.assertEqual(
			_uploaded_register_tables([{"table": "insurance_00_02", "file_url": "/b.xlsx"}]),
			[ORACLE_CHILD],
		)

	def test_upload_rejects_patient_info(self):
		with self.assertRaises(frappe.ValidationError):
			_uploaded_register_tables([{"table": "PATIENT_INFO_01", "file_url": "/c.xlsx"}])

	def test_claim_header_and_unmatched_line_both_count(self):
		import healthcare.api.insurance_register_reconcile as mod

		def fetch(table, **kwargs):
			if table == ORACLE_MASTER:
				return [{"PATIENT_NUM": "100", "TRANS_NUM": "9"}]
			return [{"TRANS_NUM": "9"}, {"TRANS_NUM": "8"}]

		original = (mod._fetch_rows, mod._table_ready, mod._patients_by_claim_trans)
		mod._fetch_rows = fetch
		mod._table_ready = lambda table: True
		mod._patients_by_claim_trans = lambda trans: {"8": "200"} if trans == ["8"] else {}
		try:
			index = _oracle_insured_index()
		finally:
			mod._fetch_rows, mod._table_ready, mod._patients_by_claim_trans = original

		self.assertEqual(set(index), {"100", "200"})

	def test_lines_only_do_not_read_patient_info(self):
		import healthcare.api.insurance_register_reconcile as mod

		seen = []

		def fetch(table, **kwargs):
			seen.append(table)
			return [{"TRANS_NUM": "8"}]

		original = (mod._fetch_rows, mod._table_ready, mod._patients_by_claim_trans)
		mod._fetch_rows = fetch
		mod._table_ready = lambda table: table == ORACLE_CHILD
		mod._patients_by_claim_trans = lambda trans: {"8": "300"}
		try:
			index = _oracle_insured_index()
		finally:
			mod._fetch_rows, mod._table_ready, mod._patients_by_claim_trans = original

		self.assertEqual(seen, [ORACLE_CHILD])
		self.assertEqual(set(index), {"300"})
