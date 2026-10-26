# Copyright (c) 2026, Healthcare contributors
# See license.txt

from io import BytesIO
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from healthcare.api.practitioner_name_import import (
	_build_update_plan,
	_name_fields,
	_parse_excel_rows,
	_parse_sheet_rows,
	_resolve_full_name,
	_sort_codes,
)


def _workbook_bytes(rows: list[list]) -> bytes:
	import openpyxl

	wb = openpyxl.Workbook()
	ws = wb.active
	ws.title = "Practitioners"
	for row in rows:
		ws.append(row)
	buffer = BytesIO()
	wb.save(buffer)
	return buffer.getvalue()


def _make_file(content: bytes) -> str:
	file_doc = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": "__test_practitioner_names.xlsx",
			"content": content,
			"is_private": 1,
		}
	).insert(ignore_permissions=True)
	return file_doc.file_url


class TestPractitionerNameImport(IntegrationTestCase):
	def test_parse_sheet_rows_skips_group_titles(self):
		import openpyxl

		wb = openpyxl.load_workbook(
			BytesIO(
				_workbook_bytes(
					[
						["Employee Code", "Name", "Department", "User Code", "Login Name"],
						["DOCTORS   —   2 total,  1 still here", None, None, None, None],
						[286, "BIBI ALAMERI", "DOCTORS", 211, "BIBI"],
						[195, "MAGDY ABDELHAMID  MAHMOUD", "DOCTORS", None, None],
					]
				)
			)
		)
		rows = _parse_sheet_rows(wb["Practitioners"])

		self.assertEqual(
			rows,
			[
				{
					"employee_code": "286",
					"full_name": "BIBI ALAMERI",
					"user_code": "211",
					"login_name": "BIBI",
				},
				{
					"employee_code": "195",
					"full_name": "MAGDY ABDELHAMID MAHMOUD",
					"user_code": "",
					"login_name": "",
				},
			],
		)

	def test_parse_excel_rows_keeps_fullest_name_per_code(self):
		content = _workbook_bytes(
			[
				["Employee Code", "Name", "User Code"],
				[9001, "TEST SHORT NAME LONGER", None],
				[9001, "TEST SHORT", 7001],
				[9001, "TEST SHORT NAME", None],
			]
		)
		file_url = _make_file(content)
		try:
			rows, sheet_row_counts = _parse_excel_rows(file_url)
		finally:
			frappe.delete_doc("File", frappe.db.get_value("File", {"file_url": file_url}), force=True)

		self.assertEqual(sheet_row_counts, {"Practitioners": 3})
		self.assertEqual(len(rows), 1)
		self.assertEqual(rows[0]["employee_code"], "9001")
		self.assertEqual(rows[0]["full_name"], "TEST SHORT NAME LONGER")
		self.assertEqual(rows[0]["user_code"], "7001")

	def test_name_fields_split_first_and_remaining(self):
		self.assertEqual(
			_name_fields("MAGDY ABDELHAMID MAHMOUD ABOU ALNASER"),
			{
				"first_name": "MAGDY",
				"last_name": "ABDELHAMID MAHMOUD ABOU ALNASER",
				"practitioner_name": "MAGDY ABDELHAMID MAHMOUD ABOU ALNASER",
			},
		)
		self.assertEqual(
			_name_fields("ANITHA"),
			{"first_name": "ANITHA", "last_name": "", "practitioner_name": "ANITHA"},
		)

	def test_employee_code_wins_over_user_code(self):
		full_name, source = _resolve_full_name(
			{"name": "100", "doctors_id": "100"},
			by_employee_code={"100": "EMPLOYEE NAME"},
			by_user_code={"100": {"USER NAME"}},
		)
		self.assertEqual((full_name, source), ("EMPLOYEE NAME", "employee_code"))

	def test_falls_back_to_user_code(self):
		full_name, source = _resolve_full_name(
			{"name": "107", "doctors_id": "107"},
			by_employee_code={},
			by_user_code={"107": {"NOUREEN AZMAT AZMAT"}},
		)
		self.assertEqual((full_name, source), ("NOUREEN AZMAT AZMAT", "user_code"))

	def test_ambiguous_user_code_is_skipped(self):
		full_name, source = _resolve_full_name(
			{"name": "50", "doctors_id": "50"},
			by_employee_code={},
			by_user_code={"50": {"ONE NAME", "ANOTHER NAME"}},
		)
		self.assertEqual((full_name, source), (None, "ambiguous"))

	def test_falls_back_to_login_name_of_linked_user(self):
		full_name, source = _resolve_full_name(
			{"name": "105", "doctors_id": "105", "user_id": "bib@clinic.example"},
			by_employee_code={},
			by_user_code={},
			by_login_name={"BIB": {"BIBI ALAMERI"}},
			login_keys_by_user={"bib@clinic.example": {"BIB@CLINIC.EXAMPLE", "BIB"}},
		)
		self.assertEqual((full_name, source), ("BIBI ALAMERI", "login_name"))

	def test_login_name_not_used_without_linked_user(self):
		full_name, source = _resolve_full_name(
			{"name": "105", "doctors_id": "105"},
			by_employee_code={},
			by_user_code={},
			by_login_name={"105": {"BIBI ALAMERI"}},
			login_keys_by_user={},
		)
		self.assertEqual((full_name, source), (None, None))

	def test_sort_codes_sorts_numerically(self):
		self.assertEqual(_sort_codes(["10", "9", "A1"]), ["9", "10", "A1"])

	def test_build_update_plan_only_fills_blank_names(self):
		rows = [
			{
				"employee_code": "9001",
				"full_name": "TEST FIRST LAST",
				"user_code": "",
				"login_name": "",
			},
			{
				"employee_code": "9002",
				"full_name": "TEST USERCODE NAME",
				"user_code": "7002",
				"login_name": "TEST",
			},
		]
		practitioners = [
			{"name": "9001", "doctors_id": "9001", "practitioner_name": None},
			{"name": "7002", "doctors_id": "7002", "practitioner_name": "7002"},
			{"name": "9999", "doctors_id": "9999", "practitioner_name": ""},
		]
		with patch(
			"healthcare.api.practitioner_name_import._practitioners_without_full_name",
			return_value=practitioners,
		):
			built = _build_update_plan(rows)

		self.assertEqual(
			built["matched_by"], {"employee_code": 1, "user_code": 1, "login_name": 0}
		)
		self.assertEqual(built["unmatched"], ["9999"])
		self.assertEqual(built["ambiguous"], [])
		self.assertEqual(
			[(item["practitioner"], item["first_name"], item["last_name"]) for item in built["plan"]],
			[("9001", "TEST", "FIRST LAST"), ("7002", "TEST", "USERCODE NAME")],
		)
