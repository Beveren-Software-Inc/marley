# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and Contributors
# See license.txt

# import frappe
from frappe.tests import IntegrationTestCase, UnitTestCase

from healthcare.healthcare.doctype.long_acting_medicine.long_acting_medicine import (
	_injection_side_from_row,
	_last_injection_side,
	_normalize_injection_given_on,
)


# On IntegrationTestCase, the doctype test records and all
# link-field test record dependencies are recursively loaded
# Use these module variables to add/remove to/from that list
EXTRA_TEST_RECORD_DEPENDENCIES = []  # eg. ["User"]
IGNORE_TEST_RECORD_DEPENDENCIES = []  # eg. ["User"]



class IntegrationTestLongActingMedicine(IntegrationTestCase):
	"""
	Integration tests for LongActingMedicine.
	Use this class for testing interactions between multiple components.
	"""

	pass


class TestLongActingInjectionSide(UnitTestCase):
	"""Injection side must survive the legacy register (RT_FLAG / LT_FLAG) per give-out."""

	def test_side_from_flags(self):
		self.assertEqual(_injection_side_from_row({"lt_flag": "1", "rt_flag": "0"}), "LT")
		self.assertEqual(_injection_side_from_row({"lt_flag": "0", "rt_flag": "1"}), "RT")

	def test_no_side_recorded(self):
		self.assertIsNone(_injection_side_from_row({"lt_flag": None, "rt_flag": None}))
		self.assertIsNone(_injection_side_from_row({"lt_flag": "", "rt_flag": ""}))
		self.assertIsNone(_injection_side_from_row({"lt_flag": "0", "rt_flag": "0"}))
		self.assertIsNone(_injection_side_from_row(None))

	def test_last_side_uses_newest_injection_only(self):
		give_outs = [
			{"date": "2024-01-01", "lt_flag": "1", "rt_flag": None},
			{"date": "2024-02-01", "lt_flag": None, "rt_flag": "1"},
		]
		# Rows may arrive oldest-first; the newest row still wins.
		self.assertEqual(_last_injection_side(give_outs), "RT")
		self.assertEqual(_last_injection_side(list(reversed(give_outs))), "RT")

	def test_last_side_none_when_newest_unflagged(self):
		# An older flagged row must not be used: alternating from stale data picks the wrong side.
		give_outs = [
			{"date": "2024-01-01", "lt_flag": "1", "rt_flag": None},
			{"date": "2024-02-01", "lt_flag": None, "rt_flag": None},
		]
		self.assertIsNone(_last_injection_side(give_outs))

	def test_normalize_injection_given_on(self):
		self.assertEqual(_normalize_injection_given_on("left"), "LT")
		self.assertEqual(_normalize_injection_given_on(" R "), "RT")
		self.assertIsNone(_normalize_injection_given_on(""))
		self.assertIsNone(_normalize_injection_given_on(None))

