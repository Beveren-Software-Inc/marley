# Copyright (c) 2026, Healthcare and contributors

import frappe
from frappe.tests.utils import FrappeTestCase

from healthcare.healthcare.doctype.patient.patient_duplicate import (
	find_duplicate_patient,
	normalize_mobile,
	normalize_patient_name,
	throw_if_duplicate_patient,
)


class TestPatientDuplicate(FrappeTestCase):
	def setUp(self):
		frappe.db.delete("Patient", {"patient_name": ["like", "_Test Dup %"]})
		for cat in ("Regular", "VIP"):
			if not frappe.db.exists("Patient Category", cat):
				frappe.get_doc({"doctype": "Patient Category", "patient_category": cat}).insert(
					ignore_permissions=True
				)

	def tearDown(self):
		frappe.db.delete("Patient", {"patient_name": ["like", "_Test Dup %"]})

	def test_normalize_patient_name(self):
		self.assertEqual(normalize_patient_name("  John   Doe  "), "john doe")

	def test_normalize_mobile(self):
		self.assertEqual(normalize_mobile("+973 1234-5678"), "97312345678")

	def test_find_duplicate_by_name_and_mobile(self):
		existing = frappe.get_doc(
			{
				"doctype": "Patient",
				"first_name": "_Test Dup One",
				"patient_name": "_Test Dup One",
				"sex": "Male",
				"category": "Regular",
				"mobile": "+973 1111 2222",
			}
		).insert(ignore_permissions=True)

		dup = find_duplicate_patient("  _test dup one ", mobile="973-1111-2222")
		self.assertIsNotNone(dup)
		self.assertEqual(dup["name"], existing.name)

	def test_duplicate_even_when_category_differs(self):
		frappe.get_doc(
			{
				"doctype": "Patient",
				"first_name": "_Test Dup Cat",
				"patient_name": "_Test Dup Cat",
				"sex": "Male",
				"category": "Regular",
				"mobile": "33334444",
			}
		).insert(ignore_permissions=True)

		dup = find_duplicate_patient("_Test Dup Cat", mobile="3333 4444")
		self.assertIsNotNone(dup)

	def test_no_duplicate_when_mobile_differs(self):
		frappe.get_doc(
			{
				"doctype": "Patient",
				"first_name": "_Test Dup Two",
				"patient_name": "_Test Dup Two",
				"sex": "Male",
				"category": "Regular",
				"mobile": "11112222",
			}
		).insert(ignore_permissions=True)

		dup = find_duplicate_patient("_Test Dup Two", mobile="99998888")
		self.assertIsNone(dup)

	def test_throw_on_duplicate_insert(self):
		frappe.get_doc(
			{
				"doctype": "Patient",
				"first_name": "_Test Dup Three",
				"patient_name": "_Test Dup Three",
				"sex": "Male",
				"category": "Regular",
				"mobile": "55556666",
			}
		).insert(ignore_permissions=True)

		with self.assertRaises(frappe.DuplicateEntryError):
			throw_if_duplicate_patient("_Test Dup Three", mobile="5555 6666")
