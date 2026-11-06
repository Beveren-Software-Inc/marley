# Copyright (c) 2026, Healthcare contributors
# See license.txt

import frappe
from frappe.tests import UnitTestCase

from healthcare.api.insurance_register_reconcile import (
	ORACLE_MASTER,
	_oracle_insured_index,
	_uploaded_register_tables,
)


class TestInsuranceRegisterSource(UnitTestCase):
	def test_upload_requires_the_claim_header(self):
		self.assertEqual(
			_uploaded_register_tables([{"table": "INSURANCE_00_01", "file_url": "/a.xlsx"}]),
			[ORACLE_MASTER],
		)

	def test_upload_rejects_claim_lines_and_patient_info(self):
		for table in ("INSURANCE_00_02", "PATIENT_INFO_01"):
			with self.assertRaises(frappe.ValidationError):
				_uploaded_register_tables([{"table": table, "file_url": "/b.xlsx"}])

	def test_index_is_one_patient_per_claim_header(self):
		import healthcare.api.insurance_register_reconcile as mod

		def fetch(table, **kwargs):
			self.assertEqual(table, ORACLE_MASTER)
			return [
				{"PATIENT_NUM": "100", "TRANS_NUM": "9"},
				{"PATIENT_NUM": "100", "TRANS_NUM": "10"},
				{"PATIENT_NUM": "200", "TRANS_NUM": "11"},
			]

		original = mod._fetch_rows
		mod._fetch_rows = fetch
		try:
			index = _oracle_insured_index()
		finally:
			mod._fetch_rows = original

		self.assertEqual(set(index), {"100", "200"})
