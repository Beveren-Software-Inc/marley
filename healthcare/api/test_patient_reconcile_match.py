# Copyright (c) 2026, Healthcare contributors
# See license.txt

from frappe.tests import UnitTestCase

from healthcare.api.patient_reconcile import (
	_find_id_match,
	_find_name_phone_match,
	_ids_similar,
	_index_patient_id,
)


class TestPatientIdentityMatch(UnitTestCase):
	def test_leading_zeros_are_the_same_cpr(self):
		self.assertTrue(_ids_similar("070304572", "70304572"))
		self.assertTrue(_ids_similar("CPR 070304572", "70304572"))

	def test_one_digit_off_is_similar(self):
		self.assertTrue(_ids_similar("1097255341", "1097255342"))
		self.assertTrue(_ids_similar("1097255341", "10972553410"))

	def test_different_cpr_is_not_similar(self):
		self.assertFalse(_ids_similar("1097255341", "27168200162"))
		self.assertFalse(_ids_similar("", "1097255341"))

	def test_short_numbers_must_match_exactly(self):
		self.assertFalse(_ids_similar("1234567", "1234568"))
		self.assertTrue(_ids_similar("1234567", "01234567"))

	def test_finds_exact_cpr_under_another_file_number(self):
		exact = {}
		near = {}
		row = {"name": "861448", "patient_name": "SAAD", "id_number": "070304572"}
		_index_patient_id(exact, near, row)
		found, exact_match = _find_id_match("70304572", exact, near)
		self.assertEqual(found["name"], "861448")
		self.assertTrue(exact_match)

	def test_finds_cpr_one_digit_off(self):
		exact = {}
		near = {}
		row = {"name": "100", "patient_name": "ALI", "id_number": "1097255341"}
		_index_patient_id(exact, near, row)
		found, exact_match = _find_id_match("1097255342", exact, near)
		self.assertEqual(found["name"], "100")
		self.assertFalse(exact_match)

	def test_same_name_and_phone_under_another_file_number(self):
		index = {}
		row = {
			"name": "861448",
			"patient_name": "SAAD FAHAD S ALNASSAR",
			"mobile": "74077733",
		}
		from healthcare.api.patient_reconcile import _index_name_phone

		_index_name_phone(index, row)
		found = _find_name_phone_match("SAAD FAHAD S ALNASSAR", ["0097374077733"], index)
		self.assertEqual(found["name"], "861448")
