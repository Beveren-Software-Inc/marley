# Copyright (c) 2026, Healthcare contributors
# See license.txt

from unittest.mock import patch

import hashlib

from frappe.tests import IntegrationTestCase

from healthcare.api.lab_test_reconcile import (
	DOCTYPE,
	JOB_KEY,
	ORACLE_DETAIL_TABLE,
	ORACLE_HEADER_TABLE,
	_classify,
	_chunks,
	_detail_payload,
	_duplicate_groups,
	_header_payload,
	_new_progress,
	_norm_text,
	_remove_duplicate,
	_summary_message,
	_target_fields,
	_work_items,
)


def _oracle_header(**kwargs) -> dict:
	"""One Oracle LAB_00_03 row as ``_fetch_rows`` returns it."""
	row = {
		"TRANS_NUM": "LAB/2026/00918",
		"TRANS_DATE": "2026-07-03 00:00:00",
		"DR_GL_CODE": "01-02-03-0001",
		"SUB_DR_GL_CODE": "860562",
		"TRANS_SOURCE": "IP",
		"VISIT_NUM": "",
		"STA_FLG": "2",
		"BRANCH_NUM": "1",
		"TRANS_REMARKS": "",
		"LAB_TEST_TYPE": "NUR",
		"CONFIRM": "N",
		"ADMISSION_NUM": "2320",
		"FIELD7": "",
	}
	row.update(kwargs)
	return row


def _oracle_line(**kwargs) -> dict:
	"""One Oracle LAB_00_04 row as ``_fetch_rows`` returns it."""
	row = {
		"TRANS_NUM": "LAB/2026/00918",
		"SR_NUM": "1",
		"LAB_GROUP_NUM": "LAB-007",
		"LAB_SUB_NUM": "LAB-007-001",
		"LAB_RESULT_VALUE": "0.88",
		"LAB_AMT_BOOK": "30",
		"LAB_AMT_ADD": "0",
		"LAB_AMT_DISC": "0",
		"LAB_AMT_NET": "30",
		"STA_FLG": "0",
		"CR_ID": "53",
		"CR_DATE": "2026-07-03 08:12:49",
		"UP_ID": "53",
		"UP_DATE": "2026-07-03 08:13:18",
		"LAB_04_REMARKS": "",
	}
	row.update(kwargs)
	return row


def _erp_row(**kwargs) -> dict:
	"""One ``tabLab Test`` row as ``_erpnext_rows`` returns it."""
	row = {
		"name": "LAB/2026/00918",
		"patient": "860562",
		"lab_test_name": "S.LITHIUM",
		"results": "",
		"lab_test_comment": "",
		"lab_test_type": "NUR",
		"branch_num": "1",
		"transaction_date": "2026-07-03",
		"cost_center": "Serene Hospital - SPH",
		"company": "Serene",
		"invoiced": 0,
		"service_request": "",
		"prescription": "",
		"reviewed_by": "",
		"doctor_reviewed_datetime": "",
		"is_legacy_import": 1,
		"docstatus": 1,
		"date": "2026-07-03",
		"has_custom_result": 1,
		"custom_md5": "",
		"creation": "2026-07-04 08:16:03.979364",
	}
	row.update(kwargs)
	return row


def _pin_lookups():
	"""Patient / cost centre / company lookups pinned to deterministic values."""
	return patch.multiple(
		"healthcare.api.lab_test_reconcile",
		_resolve_patient_context=lambda header, ensure_patient=False: {
			"patient": (header.get("sub_dr_gl_code") or "").strip() or None
		},
		_resolve_cost_center=lambda branch: "Serene Hospital - SPH",
		_default_company=lambda: "Serene",
		_has_attachment=lambda name: False,
	)


def _pin_naming():
	"""The test name of a lab whose result lines carry only a panel code."""
	return patch.multiple(
		"healthcare.api.lab_test_reconcile",
		_pick_primary_template=lambda detail_lines: None,
		_primary_lab_group=lambda detail_lines: "LAB-007",
	)


def _classify_rows(oracle_headers, erp_rows, details=None) -> dict:
	headers = {_header_payload(row)["trans_num"]: _header_payload(row) for row in oracle_headers}
	with _pin_lookups(), _pin_naming():
		return _classify(headers, erp_rows, details or {})


def _details(key="LAB/2026/00918", **kwargs) -> dict:
	return {key: [_detail_payload(_oracle_line(TRANS_NUM=key, **kwargs))]}


class TestLabTestReconcileMapping(IntegrationTestCase):
	"""Oracle LAB_00_03 / LAB_00_04 -> Lab Test.

	The job reads Oracle, but the decisions pinned here are the ones that decide
	whether a legacy lab test is stored once, twice, completed from Oracle or not
	at all.
	"""

	def test_button_reads_the_lab_header_and_result_tables(self):
		self.assertEqual(ORACLE_HEADER_TABLE, "LAB_00_03")
		self.assertEqual(ORACLE_DETAIL_TABLE, "LAB_00_04")
		self.assertEqual(DOCTYPE, "Lab Test")
		self.assertEqual(JOB_KEY, "lab_test_reconcile")

	def test_header_payload_uses_the_importer_keys(self):
		header = _header_payload(_oracle_header(VISIT_NUM="123", FIELD7="legacy"))

		self.assertEqual(header["trans_num"], "LAB/2026/00918")
		self.assertEqual(header["visit_num"], "123")
		self.assertEqual(header["sub_dr_gl_code"], "860562")
		self.assertEqual(header["admission_num"], "2320")
		self.assertEqual(header["branch_num"], "1")
		self.assertEqual(header["lab_test_type"], "NUR")
		self.assertEqual(header["oracle_field7"], "legacy")
		self.assertEqual(header["trans_remarks"], "")

	def test_detail_payload_uses_the_importer_keys(self):
		line = _detail_payload(_oracle_line(LAB_SUB_NUM="LAB-007-001", CR_ID="53"))

		self.assertEqual(line["trans_num"], "LAB/2026/00918")
		self.assertEqual(line["sr_num"], "1")
		self.assertEqual(line["lab_group_num"], "LAB-007")
		self.assertEqual(line["lab_sub_num"], "LAB-007-001")
		self.assertEqual(line["lab_result_value"], "0.88")
		self.assertEqual(line["cr_id"], "53")
		self.assertIsNone(line["group_name"])

	def test_chunks_split_the_keys_of_one_oracle_query(self):
		self.assertEqual(list(_chunks([], 2)), [])
		self.assertEqual(list(_chunks(["a"], 2)), [["a"]])
		self.assertEqual(list(_chunks(["a", "b", "c"], 2)), [["a", "b"], ["c"]])


class TestLabTestReconcileClassify(IntegrationTestCase):
	def test_matching_lab_counts_as_already_imported(self):
		scan = _classify_rows([_oracle_header()], [_erp_row()])

		self.assertEqual(scan["matched"], 1)
		self.assertEqual(scan["missing_total"], 0)
		self.assertEqual(scan["fills"], [])

	def test_missing_lab_is_reported_with_patient_and_date(self):
		scan = _classify_rows([_oracle_header()], [])

		self.assertEqual(scan["missing_total"], 1)
		self.assertEqual(scan["missing"], [["LAB/2026/00918", "860562", "2026-07-03"]])
		self.assertEqual(scan["matched"], 0)

	def test_blank_field_is_filled_from_oracle(self):
		scan = _classify_rows([_oracle_header(TRANS_REMARKS="FASTING")], [_erp_row()])

		self.assertEqual(scan["fills"], [["LAB/2026/00918", "860562", {"lab_test_comment": "FASTING"}]])
		self.assertEqual(scan["differs"], [])

	def test_existing_value_is_reported_not_overwritten(self):
		scan = _classify_rows(
			[_oracle_header(TRANS_REMARKS="FASTING")],
			[_erp_row(lab_test_comment="fasting, 8 hours")],
		)

		self.assertEqual(scan["fills"], [])
		self.assertEqual(scan["differs"], [["LAB/2026/00918", ["lab_test_comment"]]])

	def test_result_table_and_test_name_are_filled_when_oracle_has_them(self):
		scan = _classify_rows(
			[_oracle_header()],
			[_erp_row(lab_test_name="", has_custom_result=0)],
			_details(),
		)

		fields = sorted(scan["fills"][0][2])
		self.assertEqual(fields, ["custom_result", "lab_test_name", "results"])
		self.assertEqual(scan["fills"][0][2]["lab_test_name"], "LAB-007")
		self.assertEqual(scan["fills"][0][2]["results"], "0.88")

	def test_result_table_is_not_rewritten_when_it_is_already_there(self):
		details = _details()
		name = "LAB/2026/00918"
		with _pin_lookups(), _pin_naming():
			target = _target_fields(_header_payload(_oracle_header()), details[name])
		scan = _classify_rows(
			[_oracle_header()],
			[
				_erp_row(
					name=name,
					lab_test_name="LAB-007",
					results="0.88",
					custom_md5=hashlib.md5(target["custom_result"].encode("utf-8")).hexdigest(),
				)
			],
			details,
		)

		self.assertEqual(scan["fills"], [])
		self.assertEqual(scan["differs"], [])

	def test_legacy_row_without_oracle_row_is_counted_as_extra(self):
		scan = _classify_rows(
			[_oracle_header()],
			[_erp_row(), _erp_row(name="LAB/2025/01209", patient="853622")],
		)

		self.assertEqual(scan["extra_rows"], 1)
		self.assertEqual(scan["erpnext_rows"], 2)

	def test_app_record_with_its_own_name_is_not_extra(self):
		scan = _classify_rows(
			[_oracle_header()],
			[_erp_row(), _erp_row(name="LT-1163", patient="862384", is_legacy_import=0)],
		)

		self.assertEqual(scan["extra_rows"], 0)

	def test_lab_without_result_values_is_counted(self):
		scan = _classify_rows(
			[_oracle_header()],
			[_erp_row(lab_test_name="CBC")],
			_details(LAB_RESULT_VALUE=""),
		)

		self.assertEqual(scan["without_results"], 1)

	def test_patient_and_company_come_from_the_oracle_side(self):
		scan = _classify_rows(
			[_oracle_header()],
			[_erp_row(patient="", company="", cost_center="")],
		)

		self.assertEqual(
			scan["fills"],
			[
				[
					"LAB/2026/00918",
					"",
					{
						"patient": "860562",
						"cost_center": "Serene Hospital - SPH",
						"company": "Serene",
					},
				]
			],
		)



class TestLabTestReconcileDuplicates(IntegrationTestCase):
	"""A copy is only merged when the register is expected to keep the keeper."""

	def _groups(self, rows, oracle_numbers=None):
		with _pin_lookups():
			return _duplicate_groups(rows, oracle_numbers or {"LAB/2026/00918"})

	def test_copy_without_oracle_row_is_merged_into_the_legacy_one(self):
		duplicates, skipped = self._groups(
			[
				_erp_row(),
				_erp_row(
					name="LT-9001",
					is_legacy_import=0,
					has_custom_result=0,
					custom_md5="",
					docstatus=0,
					creation="2026-07-05 09:00:00",
				),
			]
		)

		self.assertEqual(duplicates, [["LT-9001", "LAB/2026/00918"]])
		self.assertEqual(skipped, 0)

	def test_two_legacy_rows_for_the_same_day_are_two_orders(self):
		duplicates, skipped = self._groups(
			[
				_erp_row(),
				_erp_row(name="LAB/2026/00919"),
			],
			{"LAB/2026/00918", "LAB/2026/00919"},
		)

		self.assertEqual(duplicates, [])
		self.assertEqual(skipped, 0)

	def test_copy_with_its_own_results_is_kept(self):
		duplicates, skipped = self._groups(
			[
				_erp_row(results="0.88"),
				_erp_row(name="LT-9001", is_legacy_import=0, results="1.20", docstatus=0),
			]
		)

		self.assertEqual(duplicates, [])
		self.assertEqual(skipped, 1)

	def test_invoiced_copy_is_protected(self):
		duplicates, skipped = self._groups(
			[
				_erp_row(results="0.88"),
				_erp_row(name="LT-9001", is_legacy_import=0, invoiced=1, docstatus=0),
			]
		)

		self.assertEqual(duplicates, [])
		self.assertEqual(skipped, 1)

	def test_copy_on_a_service_request_is_protected(self):
		duplicates, skipped = self._groups(
			[
				_erp_row(),
				_erp_row(name="LT-9001", is_legacy_import=0, service_request="SR-1", docstatus=0),
			]
		)

		self.assertEqual(duplicates, [])
		self.assertEqual(skipped, 1)

	def test_copy_that_holds_more_than_the_keeper_is_kept(self):
		duplicates, skipped = self._groups(
			[
				_erp_row(),
				_erp_row(name="LT-9001", is_legacy_import=0, lab_test_comment="repeat", docstatus=0),
			]
		)

		self.assertEqual(duplicates, [])
		self.assertEqual(skipped, 1)

	def test_copy_without_a_date_is_not_a_duplicate(self):
		duplicates, skipped = self._groups(
			[
				_erp_row(),
				_erp_row(name="LT-9001", is_legacy_import=0, date="", docstatus=0),
			]
		)

		self.assertEqual(duplicates, [])
		self.assertEqual(skipped, 0)


class TestLabTestReconcileRemoveDuplicate(IntegrationTestCase):
	def _row(self, **kwargs) -> dict:
		row = {
			"name": "LT-9001",
			"patient": "860562",
			"lab_test_name": "S.LITHIUM",
			"date": "2026-07-03",
			"results": "",
			"lab_test_comment": "",
			"lab_test_type": "NUR",
			"branch_num": "1",
			"transaction_date": "2026-07-03",
			"cost_center": "Serene Hospital - SPH",
			"company": "Serene",
			"has_custom_result": 0,
			"custom_md5": "",
			"invoiced": 0,
			"service_request": "",
			"prescription": "",
			"reviewed_by": "",
			"doctor_reviewed_datetime": "",
			"docstatus": 0,
		}
		row.update(kwargs)
		return row

	def test_draft_copy_is_deleted(self):
		rows = {"LT-9001": self._row(), "LAB/2026/00918": self._row(name="LAB/2026/00918")}
		with patch(
			"healthcare.api.lab_test_reconcile._recheck_row", side_effect=rows.get
		), patch("healthcare.api.lab_test_reconcile._has_attachment", return_value=False), patch(
			"healthcare.api.lab_test_reconcile.frappe.db.exists", return_value=True
		), patch("healthcare.api.lab_test_reconcile.frappe.delete_doc") as delete_doc:
			result = _remove_duplicate("LT-9001", "LAB/2026/00918", 0)

		self.assertEqual(result, {"action": "removed"})
		delete_doc.assert_called_once()

	def test_dry_run_deletes_nothing(self):
		rows = {"LT-9001": self._row(), "LAB/2026/00918": self._row(name="LAB/2026/00918")}
		with patch(
			"healthcare.api.lab_test_reconcile._recheck_row", side_effect=rows.get
		), patch("healthcare.api.lab_test_reconcile._has_attachment", return_value=False), patch(
			"healthcare.api.lab_test_reconcile.frappe.db.exists", return_value=True
		), patch("healthcare.api.lab_test_reconcile.frappe.delete_doc") as delete_doc:
			result = _remove_duplicate("LT-9001", "LAB/2026/00918", 1)

		self.assertEqual(result, {"action": "removed"})
		delete_doc.assert_not_called()

	def test_copy_that_changed_since_the_scan_is_kept(self):
		rows = {
			"LT-9001": self._row(lab_test_name="CBC"),
			"LAB/2026/00918": self._row(name="LAB/2026/00918"),
		}
		with patch(
			"healthcare.api.lab_test_reconcile._recheck_row", side_effect=rows.get
		), patch("healthcare.api.lab_test_reconcile.frappe.db.exists", return_value=True):
			self.assertEqual(
				_remove_duplicate("LT-9001", "LAB/2026/00918", 0),
				{"action": "skipped_changed"},
			)

	def test_copy_of_another_patient_is_kept(self):
		rows = {
			"LT-9001": self._row(patient="111111"),
			"LAB/2026/00918": self._row(name="LAB/2026/00918"),
		}
		with patch(
			"healthcare.api.lab_test_reconcile._recheck_row", side_effect=rows.get
		), patch("healthcare.api.lab_test_reconcile.frappe.db.exists", return_value=True):
			self.assertEqual(
				_remove_duplicate("LT-9001", "LAB/2026/00918", 0),
				{"action": "skipped_other_patient"},
			)

	def test_missing_keeper_is_skipped(self):
		with patch("healthcare.api.lab_test_reconcile.frappe.db.exists", return_value=False):
			self.assertEqual(
				_remove_duplicate("LT-9001", "LAB/2026/00918", 0),
				{"action": "skipped_missing"},
			)



class TestLabTestReconcileWorkItems(IntegrationTestCase):
	def _scan(self) -> dict:
		return {
			"fills": [["LAB/2026/00886", "860562", {"custom_result": "<table/>"}]],
			"missing": [
				["LAB/2026/00918", "860562", "2026-07-03"],
				["LAB/2026/00920", "855832", ""],
			],
			"duplicates": [["LT-9001", "LAB/2026/00886"]],
		}

	def test_one_run_fills_creates_and_dedupes_in_that_order(self):
		items = _work_items(self._scan())

		self.assertEqual(
			[item[0] for item in items],
			["fill", "create", "create", "dedupe"],
		)
		self.assertEqual(items[0][1], "LAB/2026/00886")
		self.assertEqual(items[1], ["create", "LAB/2026/00918", "860562", "2026-07-03"])
		self.assertEqual(items[3], ["dedupe", "LT-9001", "LAB/2026/00886", ""])

	def test_patient_filter_limits_fills_and_missing_labs(self):
		items = _work_items(self._scan(), patient="860562")

		self.assertEqual([item[1] for item in items], ["LAB/2026/00886", "LAB/2026/00918", "LT-9001"])

	def test_the_two_switches_remove_their_work(self):
		items = _work_items(self._scan(), fill_missing=0, clean_duplicates=0)

		self.assertEqual([item[0] for item in items], ["create", "create"])

	def test_limit_takes_the_first_steps_only(self):
		items = _work_items(self._scan(), limit=2)

		self.assertEqual([item[1] for item in items], ["LAB/2026/00886", "LAB/2026/00918"])


class TestLabTestReconcileProgress(IntegrationTestCase):
	def test_new_progress_starts_at_zero(self):
		progress = _new_progress(5)

		self.assertEqual(progress["job_key"], JOB_KEY)
		self.assertEqual(progress["state"], "queued")
		self.assertEqual(progress["limit"], 5)
		for key in ("created", "filled", "removed", "missing_total", "duplicate_total"):
			self.assertEqual(progress[key], 0)

	def test_summary_counts_every_bucket(self):
		progress = _new_progress()
		progress.update(
			{
				"oracle_rows": 13466,
				"oracle_patients": 1921,
				"erpnext_rows": 14173,
				"matched": 13017,
				"missing_total": 449,
				"created": 12,
				"fill_total": 667,
				"filled": 10,
				"duplicate_total": 2,
				"removed": 1,
				"differs_total": 642,
				"skipped_duplicates": 3,
				"patients_created": 4,
			}
		)

		message = _summary_message(progress)

		self.assertIn("Created: 12 of 449", message)
		self.assertIn("Filled from Oracle: 10 of 667", message)
		self.assertIn("Duplicates removed: 1 of 2", message)
		self.assertIn("Patients created", message)
		self.assertIn("642 lab tests hold values that differ", message)
		self.assertIn("3 duplicate copies were kept", message)

	def test_dry_run_says_nothing_was_written(self):
		progress = _new_progress()
		progress["dry_run"] = 1

		self.assertIn("Dry run - nothing was written.", _summary_message(progress))

	def test_result_text_comparison_ignores_html_and_case(self):
		self.assertEqual(_norm_text("<b>S.LITHIUM</b>"), _norm_text(" s.lithium "))

