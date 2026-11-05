# Copyright (c) 2026, Healthcare contributors
# See license.txt

from frappe.tests import UnitTestCase

from healthcare.api.oracle_excel_source import (
	ORACLE_SOURCES,
	_cell_text,
	_column_name,
	_match_table,
	_order_columns,
	_sort_rows,
	normalize_files,
	oracle_table_signatures,
	to_sqlite,
)


class TestOracleExcelSourceRegistry(UnitTestCase):
	"""The tables each Oracle -> ERPNext button offers for an Excel upload."""

	def test_every_button_has_at_least_one_table(self):
		for key, source in ORACLE_SOURCES.items():
			with self.subTest(button=key):
				self.assertTrue(source["tables"], f"{key} has no Oracle table")

	def test_prescriptions_need_the_three_legacy_tables(self):
		tables = [table["table"] for table in ORACLE_SOURCES["prescriptions"]["tables"]]
		self.assertEqual(
			tables,
			["PATIENT_VISIT_PRESCRIPTION", "PATIENT_VISIT_PRESCRIPTION_HIS", "IP_ADMISSION_MEDICINE"],
		)

	def test_user_button_points_at_the_legacy_user_table(self):
		self.assertEqual(ORACLE_SOURCES["user"]["tables"][0]["table"], "USR_00_01")

	def test_nursing_notes_button_points_at_ip_nursing(self):
		tables = ORACLE_SOURCES["nursing_notes"]["tables"]

		self.assertEqual(ORACLE_SOURCES["nursing_notes"]["doctype"], "Main Nursing Note")
		self.assertEqual([table["table"] for table in tables], ["IP_NURSING"])
		self.assertEqual(tables[0]["required"], ["TRANS_NUM", "ADMISSION_NUM"])

	def test_warning_messages_button_points_at_patient_warning_messages(self):
		tables = ORACLE_SOURCES["warning_messages"]["tables"]

		self.assertEqual(ORACLE_SOURCES["warning_messages"]["doctype"], "Warning Message")
		self.assertEqual([table["table"] for table in tables], ["PATIENT_WARNING_MESSAGES"])
		self.assertEqual(tables[0]["required"], ["WARNING_MESSAGE_NUM", "PATIENT_NUM"])

	def test_patients_button_points_at_patient_info_01(self):
		tables = ORACLE_SOURCES["patients"]["tables"]
		self.assertEqual(ORACLE_SOURCES["patients"]["doctype"], "Patient")
		self.assertEqual([table["table"] for table in tables], ["PATIENT_INFO_01"])

	def test_insurance_register_button_points_at_patient_info_01(self):
		tables = ORACLE_SOURCES["insurance_register"]["tables"]
		self.assertEqual(ORACLE_SOURCES["insurance_register"]["doctype"], "Insurance Patient Register")
		self.assertEqual([table["table"] for table in tables], ["PATIENT_INFO_01"])

	def test_lab_tests_button_points_at_the_lab_header_and_result_tables(self):
		tables = ORACLE_SOURCES["lab_tests"]["tables"]

		self.assertEqual(ORACLE_SOURCES["lab_tests"]["doctype"], "Lab Test")
		self.assertEqual([table["table"] for table in tables], ["LAB_00_03", "LAB_00_04"])
		self.assertEqual(tables[0]["required"], ["TRANS_NUM", "SUB_DR_GL_CODE"])
		self.assertEqual(tables[1]["required"], ["TRANS_NUM", "LAB_SUB_NUM"])

	def test_session_schedule_button_points_at_visit_00_05(self):
		tables = ORACLE_SOURCES["session_schedule"]["tables"]

		self.assertEqual(ORACLE_SOURCES["session_schedule"]["doctype"], "Session Schedule")
		self.assertEqual([table["table"] for table in tables], ["VISIT_00_05"])
		self.assertEqual(tables[0]["required"], ["VISIT_NUM", "SR_NUM", "PATIENT_NUM"])

	def test_patient_history_button_points_at_ip_admission_02(self):
		tables = ORACLE_SOURCES["patient_history"]["tables"]

		self.assertEqual(ORACLE_SOURCES["patient_history"]["doctype"], "Patient History")
		self.assertEqual([table["table"] for table in tables], ["IP_ADMISSION_02"])
		self.assertEqual(tables[0]["required"], ["ADMISSION_NUM", "ATTRIB_NUM"])

	def test_discharge_button_points_at_ip_admission_01(self):
		tables = ORACLE_SOURCES["discharge"]["tables"]
		self.assertEqual(ORACLE_SOURCES["discharge"]["doctype"], "Discharge")
		self.assertEqual(tables[0]["table"], "IP_ADMISSION_01")
		self.assertIn("ADMISION_STATUS", tables[0]["required"])
		self.assertFalse(tables[0].get("optional"))
		self.assertEqual(tables[1]["table"], "IP_ADMISSION_04")
		self.assertTrue(tables[1].get("optional"))

	def test_insurance_claims_button_points_at_insurance_tables(self):
		tables = ORACLE_SOURCES["insurance_claims"]["tables"]
		self.assertEqual(ORACLE_SOURCES["insurance_claims"]["doctype"], "Insurance Claim")
		self.assertEqual([table["table"] for table in tables], ["INSURANCE_00_01", "INSURANCE_00_02"])
		self.assertFalse(tables[0].get("optional"))
		self.assertTrue(tables[1].get("optional"))

	def test_signatures_use_the_columns_the_queries_filter_on(self):
		signatures = oracle_table_signatures()
		self.assertIn("ADMISSION_NUM", signatures["IP_ADMISSION_01"])
		self.assertIn("VISIT_CD", signatures["PATIENT_VISIT_PRESCRIPTION"])
		self.assertIn("USR_NUM", signatures["USR_00_01"])


class TestOracleExcelSourceFiles(UnitTestCase):
	"""What the dialog posts to ``files``."""

	def test_nothing_uploaded(self):
		self.assertEqual(normalize_files(None), [])
		self.assertEqual(normalize_files(""), [])
		self.assertEqual(normalize_files("[]"), [])

	def test_json_from_the_browser(self):
		self.assertEqual(
			normalize_files('[{"table": "ip_admission_01", "file_url": "/private/files/a.xlsx"}]'),
			[{"table": "IP_ADMISSION_01", "file_url": "/private/files/a.xlsx"}],
		)

	def test_a_plain_url_is_accepted(self):
		self.assertEqual(
			normalize_files("/private/files/a.xlsx"),
			[{"table": "", "file_url": "/private/files/a.xlsx"}],
		)

	def test_entries_without_a_file_are_dropped(self):
		self.assertEqual(normalize_files([{"table": "VISIT_00_01"}]), [])


class TestOracleExcelSheetMatching(UnitTestCase):
	"""Named sheets win over the chooser's declared table."""

	def test_sheet_name_beats_declared_table(self):
		self.assertEqual(
			_match_table("IP_ADMISSION_01", "IP_ADMISSION_04", ["ADMISSION_NUM", "SR_NUM"]),
			"IP_ADMISSION_04",
		)

	def test_declared_table_only_for_a_lone_unidentified_sheet(self):
		# Opaque title + columns that identify no Oracle table.
		self.assertEqual(
			_match_table("IP_ADMISSION_01", "Sheet1", ["FOO", "BAR"], alone=True),
			"IP_ADMISSION_01",
		)
		self.assertEqual(
			_match_table("IP_ADMISSION_01", "Sheet1", ["FOO", "BAR"], alone=False),
			"",
		)

	def test_column_signature_identifies_a_sheet_without_declared(self):
		self.assertEqual(
			_match_table(
				"",
				"Sheet1",
				["ADMISSION_NUM", "PATIENT_NUM", "ADMISION_STATUS"],
				alone=True,
			),
			"IP_ADMISSION_01",
		)


class TestOracleExcelCellValues(UnitTestCase):
	"""Excel cells have to read like the SQL*Plus CSV the modules expect."""

	def test_empty_cell(self):
		self.assertEqual(_cell_text(None), "")

	def test_numbers_lose_the_trailing_zero(self):
		self.assertEqual(_cell_text(305.0), "305")
		self.assertEqual(_cell_text(305), "305")
		self.assertEqual(_cell_text(1.5), "1.5")

	def test_dates_keep_the_oracle_format(self):
		from datetime import date, datetime

		self.assertEqual(_cell_text(datetime(2024, 1, 2, 9, 30)), "2024-01-02 09:30:00")
		self.assertEqual(_cell_text(date(2024, 1, 2)), "2024-01-02")

	def test_headers_become_oracle_column_names(self):
		self.assertEqual(_column_name("Admission Num"), "ADMISSION_NUM")
		self.assertEqual(_column_name(" usr_num "), "USR_NUM")
		self.assertEqual(_column_name("Visit-CD"), "VISIT_CD")


class TestOracleExcelSqlTranslation(UnitTestCase):
	"""The Oracle SELECT the reconcile modules run is answered by SQLite."""

	def test_schema_prefix_and_to_char_are_removed(self):
		sql, order_by, limit = to_sqlite(
			"select to_char(ADMISSION_DATE, 'YYYY-MM-DD HH24:MI:SS') as ADMISSION_DATE "
			"from CLINIC2.IP_ADMISSION_01 where ADMISSION_NUM in (1, 2) order by ADMISSION_NUM"
		)
		self.assertEqual(
			sql,
			"select ADMISSION_DATE as ADMISSION_DATE from IP_ADMISSION_01 where ADMISSION_NUM in (1, 2)",
		)
		self.assertEqual(order_by, "ADMISSION_NUM")
		self.assertEqual(limit, 0)

	def test_rownum_limit_and_order_by(self):
		sql, order_by, limit = to_sqlite(
			"select * from (select VISIT_CD from CLINIC2.PATIENT_VISIT_PRESCRIPTION "
			"where VISIT_CD in (7)) where rownum <= 25"
		)
		self.assertEqual(sql, "select VISIT_CD from PATIENT_VISIT_PRESCRIPTION where VISIT_CD in (7)")
		self.assertEqual(order_by, "")
		self.assertEqual(limit, 25)

	def test_count_and_group_by_are_kept(self):
		sql, _order_by, _limit = to_sqlite(
			"select VISIT_PATIENT_NUM as PATIENT_NUM, count(*) as CNT from CLINIC2.VISIT_00_01 "
			"where VISIT_DIAGNOSIS_DETAIL is not null group by VISIT_PATIENT_NUM"
		)
		self.assertIn("count(*) as CNT", sql)
		self.assertIn("group by VISIT_PATIENT_NUM", sql)
		self.assertNotIn("CLINIC2", sql)


class TestOracleExcelOrdering(UnitTestCase):
	"""Oracle sorts NUMBER columns numerically; the upload has to do the same."""

	def test_order_columns_read_the_direction(self):
		self.assertEqual(
			_order_columns("VISIT_CD, TRANS_DATE desc"), [("VISIT_CD", False), ("TRANS_DATE", True)]
		)

	def test_legacy_numbers_sort_numerically(self):
		rows = [
			{"TRANS_NUM": "10"},
			{"TRANS_NUM": "9"},
			{"TRANS_NUM": "100"},
		]
		_sort_rows(rows, "TRANS_NUM")
		self.assertEqual([row["TRANS_NUM"] for row in rows], ["9", "10", "100"])

	def test_dates_sort_as_text(self):
		rows = [{"ACTING_DATE": "2024-02-05 00:00:00"}, {"ACTING_DATE": "2024-01-05 00:00:00"}]
		_sort_rows(rows, "ACTING_DATE")
		self.assertEqual(rows[0]["ACTING_DATE"], "2024-01-05 00:00:00")
