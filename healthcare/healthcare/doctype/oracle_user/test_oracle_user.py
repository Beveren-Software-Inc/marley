# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from healthcare.api.usr_00_01_import import (
	USER_NAME_CACHE_KEY,
	_to_flag,
	_to_int,
	_user_num,
	get_user_name,
	get_user_name_map,
)


class IntegrationTestOracleUser(IntegrationTestCase):
	def tearDown(self):
		frappe.cache().delete_value(USER_NAME_CACHE_KEY)
		super().tearDown()

	def test_user_num_zero_is_a_real_user(self):
		# USR_NUM 0 is a real legacy user, so it must not be treated as missing.
		self.assertEqual(_user_num(0), 0)
		self.assertEqual(_user_num("0"), 0)
		self.assertEqual(_user_num(305.0), 305)
		self.assertIsNone(_user_num(None))
		self.assertIsNone(_user_num(""))

	def test_legacy_cell_values(self):
		self.assertEqual(_to_int("305.0"), 305)
		self.assertEqual(_to_flag("Y"), 1)
		self.assertEqual(_to_flag("N"), 0)
		self.assertEqual(_to_flag(1), 1)
		self.assertEqual(_to_flag(None), 0)

	def test_status_flag_drives_is_active_and_name_lookup(self):
		doc = frappe.get_doc(
			{
				"doctype": "Oracle User",
				"user_num": 999921,
				"login_name": "TESTUSR",
				"user_name": "Test User",
				"display_name": "Test User Display",
				"status_flag": 1,
				"group_num": 3,
			}
		).insert(ignore_permissions=True)

		self.assertEqual(doc.name, "999921")
		self.assertEqual(doc.is_active, 1)
		self.assertEqual(doc.user_group, "GP")
		self.assertEqual(get_user_name(999921), "Test User Display")
		self.assertEqual(get_user_name("999921"), "Test User Display")
		self.assertEqual(get_user_name_map(force=True).get("999921"), "Test User Display")

	def test_inactive_user_is_not_active(self):
		doc = frappe.get_doc(
			{
				"doctype": "Oracle User",
				"user_num": 999922,
				"user_name": "Retired User",
				"status_flag": 0,
			}
		).insert(ignore_permissions=True)

		self.assertEqual(doc.is_active, 0)
