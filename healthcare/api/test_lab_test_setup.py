# Copyright (c) 2026, Healthcare contributors
# See license.txt

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from healthcare.api import lab_test_setup
from healthcare.api.lab_test_setup import (
	format_child_lab_code,
	format_lab_code,
	get_next_lab_test_code,
	next_child_lab_code,
	next_top_level_lab_code,
)


def _names_patch(names: list[str]):
	return patch.object(lab_test_setup, "_lab_template_names", return_value=list(names))


class TestLabTestCodeGeneration(IntegrationTestCase):
	def test_top_level_code_follows_highest_number(self):
		with _names_patch(["LAB-001", "LAB-129", "LAB-129-001", "wq", "001"]):
			self.assertEqual(next_top_level_lab_code(), "LAB-130")

	def test_top_level_code_ignores_child_codes(self):
		with _names_patch(["LAB-007", "LAB-007-004", "LAB-007-005"]):
			self.assertEqual(next_top_level_lab_code(), "LAB-008")

	def test_top_level_code_starts_at_one_when_empty(self):
		with _names_patch([]):
			self.assertEqual(next_top_level_lab_code(), "LAB-001")

	def test_child_code_follows_highest_child_number(self):
		with _names_patch(["LAB-129-001", "LAB-129-002", "LAB-129-007", "LAB-130-001"]):
			self.assertEqual(next_child_lab_code("LAB-129"), "LAB-129-008")

	def test_child_code_starts_at_one(self):
		with _names_patch(["LAB-130"]):
			self.assertEqual(next_child_lab_code("LAB-130"), "LAB-130-001")

	def test_child_code_without_parent(self):
		self.assertEqual(next_child_lab_code(""), "")

	def test_get_next_lab_test_code_uses_parent_group(self):
		with patch.object(lab_test_setup, "next_child_lab_code", return_value="LAB-129-002") as child:
			self.assertEqual(get_next_lab_test_code("LAB-129"), "LAB-129-002")
		child.assert_called_once_with("LAB-129")

	def test_get_next_lab_test_code_without_parent(self):
		with patch.object(lab_test_setup, "next_top_level_lab_code", return_value="LAB-130") as top:
			self.assertEqual(get_next_lab_test_code(), "LAB-130")
		top.assert_called_once_with()

	def test_code_formatting_keeps_three_digits_and_grows(self):
		self.assertEqual(format_lab_code(2), "LAB-002")
		self.assertEqual(format_lab_code(129), "LAB-129")
		self.assertEqual(format_lab_code(1000), "LAB-1000")
		self.assertEqual(format_child_lab_code("LAB-129", 3), "LAB-129-003")


class TestLabGroupAutoChild(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		self.item_group = frappe.get_all(
			"Item Group", filters={"is_group": 0}, pluck="name", limit=1
		)
		self.item_group = self.item_group[0] if self.item_group else None

	def _make_template(self, **kwargs):
		doc = frappe.get_doc(
			{
				"doctype": "Lab Test Template",
				"lab_test_name": kwargs.pop("lab_test_name", "Test Panel"),
				"is_group": kwargs.pop("is_group", 0),
				"lab_test_template_type": kwargs.pop("lab_test_template_type", "Single"),
				"lab_test_rate": kwargs.pop("lab_test_rate", 12.5),
				"op_rate": kwargs.pop("op_rate", 10),
				"lab_item_group": self.item_group,
				"is_billable": 0,
				**kwargs,
			}
		)
		doc.insert(ignore_permissions=True)
		return doc

	def test_new_group_creates_first_child_from_group_details(self):
		group = self._make_template(
			lab_test_name="Cardiac Markers",
			is_group=1,
			lab_test_template_type="Grouped",
			op_rate=15,
			lab_test_description="Cardiac panel",
		)

		child_name = f"{group.name}-001"
		self.assertTrue(frappe.db.exists("Lab Test Template", child_name))

		child = frappe.get_doc("Lab Test Template", child_name)
		self.assertEqual(child.lab_group, group.name)
		self.assertEqual(child.is_group, 0)
		self.assertEqual(child.lab_test_name, "Cardiac Markers")
		self.assertEqual(child.lab_test_code, child_name)
		self.assertEqual(child.no, child_name)
		self.assertEqual(child.lab_test_template_type, "Single")
		self.assertEqual(child.lab_test_rate, 12.5)
		self.assertEqual(child.op_rate, 15)

		linked = frappe.get_all(
			"Lab Test Template", filters={"lab_group": group.name}, pluck="name", limit=0
		)
		self.assertEqual(linked, [child_name])

	def test_new_child_gets_next_code_under_group(self):
		group = self._make_template(lab_test_name="Renal Panel", is_group=1)

		child = self._make_template(
			lab_test_name="Urea",
			lab_group=group.name,
		)
		self.assertEqual(child.name, f"{group.name}-002")
		self.assertEqual(child.lab_test_code, f"{group.name}-002")

	def test_new_template_without_code_gets_next_top_level_code(self):
		doc = self._make_template(lab_test_name="Vitamin D")

		self.assertRegex(doc.name, r"^LAB-\d{3,}$")
		self.assertEqual(doc.no, doc.name)
		self.assertEqual(doc.lab_test_code, doc.name)
