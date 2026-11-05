# Copyright (c) 2026, Healthcare contributors
# See license.txt

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from healthcare.api.warning_message_reconcile import (
	CONFLICT_SUFFIX,
	DOCTYPE,
	JOB_KEY,
	ORACLE_TABLE,
	_classify,
	_create_warning,
	_new_progress,
	_norm_text,
	_numeric_key,
	_remove_duplicate,
	_summary_message,
	_work_items,
)


def _oracle_row(**kwargs) -> dict:
	"""One Oracle PATIENT_WARNING_MESSAGES row as ``_fetch_rows`` returns it."""
	row = {
		"WARNING_MESSAGE_NUM": "570",
		"PATIENT_NUM": "P1",
		"WARNING_MESSAGE": "Patient had recent cardiac arrest",
		"HIGH_RISK_TEXT": "",
		"WARNING_MESSAGE_TYPE": "2",
		"WARNING_MESSAGE_CLASS": "1",
		"BRANCH_NUM": "1",
		"CR_DATE": "25-OCT-21",
		"STA_FLG": "1",
	}
	row.update(kwargs)
	return row


def _erp_row(**kwargs) -> dict:
	"""One ``tabWarning Message`` row as ``_erpnext_rows`` returns it."""
	row = {
		"name": "570",
		"trans_id": "570",
		"patient": "P1",
		"warning": "Patient had recent cardiac arrest",
		"high_risk_text": "",
		"warning_message_type": "2",
		"warning_message_class": "1",
		"cost_center": "Serene Hospital - SPH",
		"posting_date": "2021-10-25 00:00:00",
		"is_special_phone_warning": 0,
		"is_allergy": 0,
		"creation": "2026-07-02 08:16:03.979364",
	}
	row.update(kwargs)
	return row


def _patients():
	"""Pin the patient lookup to the test patients (they do not exist in the DB)."""
	return patch(
		"healthcare.api.warning_message_reconcile._resolve_patient",
		side_effect=lambda number: (number or "").strip() or None,
	)


def _classify_rows(oracle_rows, erp_rows) -> dict:
	"""``_classify`` with the patient lookup pinned to the test patients."""
	with _patients():
		return _classify(oracle_rows, erp_rows)


def _items(scan, **kwargs) -> list[list]:
	"""``_work_items`` with the patient lookup pinned to the test patients."""
	with _patients():
		return _work_items(scan, **kwargs)


class TestWarningMessageReconcileMapping(IntegrationTestCase):
	"""Oracle PATIENT_WARNING_MESSAGES -> Warning Message.

	The job reads Oracle, but the decisions pinned here are the ones that decide
	whether a legacy warning is stored once, twice, under a suffixed name or not
	at all.
	"""

	def test_oracle_table_is_patient_warning_messages(self):
		self.assertEqual(ORACLE_TABLE, "PATIENT_WARNING_MESSAGES")
		self.assertEqual(DOCTYPE, "Warning Message")
		self.assertEqual(JOB_KEY, "warning_message_reconcile")
		self.assertEqual(CONFLICT_SUFFIX, "-W")

	def test_suffixed_key_maps_back_to_the_oracle_number(self):
		self.assertEqual(_numeric_key("570"), "570")
		self.assertEqual(_numeric_key("570-W"), "570")
		self.assertEqual(_numeric_key("570-W-2"), "570")
		self.assertEqual(_numeric_key("PMH-2026-0008"), "")

	def test_warning_text_comparison_ignores_html_escaping_case_and_spacing(self):
		self.assertEqual(
			_norm_text("Death wishes &amp; Suicidal ideation<br>Selfharm"),
			_norm_text("death wishes & suicidal ideation selfharm"),
		)
		self.assertEqual(
			_norm_text("K/C/O Asthma <br>CI for BB &amp; NSAIDs"),
			_norm_text("K/C/O Asthma CI for BB & NSAIDs"),
		)
		self.assertNotEqual(_norm_text("Allergic to Panadol"), _norm_text("Allergic to Brufen"))

	def test_matching_row_counts_as_already_imported(self):
		scan = _classify_rows([_oracle_row()], [_erp_row()])

		self.assertEqual(scan["matched"], 1)
		self.assertEqual(scan["missing_total"], 0)
		self.assertEqual(scan["fills"], [])

	def test_number_owned_by_another_patient_is_blocked_not_matched(self):
		scan = _classify_rows([_oracle_row()], [_erp_row(patient="100005", warning="anaphylactic")])

		self.assertEqual(scan["matched"], 0)
		self.assertEqual(scan["missing_blocked"], 1)
		self.assertEqual(scan["blocked_sample"], [["570", "P1", "570"]])

	def test_free_number_is_created_plainly(self):
		scan = _classify_rows([_oracle_row()], [])

		self.assertEqual(scan["missing_free"], 1)
		self.assertEqual(scan["missing_blocked"], 0)
		self.assertEqual(scan["missing"][0][:2], ["570", "free"])

	def test_blank_field_oracle_knows_about_is_filled(self):
		scan = _classify_rows([_oracle_row()], [_erp_row(cost_center="")])

		self.assertEqual(scan["fills"], [["570", "P1", {"cost_center": "Serene Hospital - SPH"}]])

	def test_values_that_differ_are_reported_but_never_overwritten(self):
		scan = _classify_rows(
			[_oracle_row(WARNING_MESSAGE="Allergic to NSAIDs")],
			[_erp_row(warning="Allergic to Brufen")],
		)

		self.assertEqual(scan["fills"], [])
		self.assertEqual(scan["differs"], [["570", ["warning"]]])

	def test_html_escaping_alone_is_not_a_difference(self):
		scan = _classify_rows(
			[_oracle_row(WARNING_MESSAGE="CI for BB & NSAIDs")],
			[_erp_row(warning="CI for BB &amp; NSAIDs")],
		)

		self.assertEqual(scan["differs"], [])

	def test_organisation_warning_without_patient_matches_its_own_row(self):
		scan = _classify_rows(
			[_oracle_row(PATIENT_NUM="", WARNING_MESSAGE="for doctors, review your LAB results.")],
			[_erp_row(patient="", warning="for doctors, review your LAB results.")],
		)

		self.assertEqual(scan["matched"], 1)
		self.assertEqual(scan["unknown_patient"], 1)


class TestWarningMessageReconcileDuplicates(IntegrationTestCase):
	def test_duplicate_keeps_the_legacy_numbered_row(self):
		legacy = _erp_row(name="569", trans_id="569", warning="Allergic to mefenamic acid")
		derived = _erp_row(
			name="1742",
			trans_id="1742",
			warning="allergic to mefenamic acid",
			warning_message_type="",
			warning_message_class="",
			cost_center="",
			is_allergy=1,
			creation="2026-07-02 13:52:06.891856",
		)

		scan = _classify_rows([_oracle_row(WARNING_MESSAGE_NUM="569")], [derived, legacy])

		self.assertEqual(scan["duplicates"], [["1742", "569", "P1"]])

	def test_phone_warning_copy_is_never_removed(self):
		legacy = _erp_row(name="569", trans_id="569", warning="Allergic to Panadol")
		phone = _erp_row(
			name="1750",
			trans_id="1750",
			warning="Allergic to Panadol",
			is_special_phone_warning=1,
			cost_center="",
			creation="2026-07-03 09:00:00.000000",
		)

		scan = _classify_rows([_oracle_row(WARNING_MESSAGE_NUM="569")], [legacy, phone])

		self.assertEqual(scan["duplicates"], [])
		self.assertEqual(scan["skipped_duplicates"], 1)

	def test_copy_holding_extra_data_is_kept(self):
		legacy = _erp_row(
			name="569", trans_id="569", warning="Allergic to Panadol", cost_center=""
		)
		richer = _erp_row(
			name="1751",
			trans_id="1751",
			warning="Allergic to Panadol",
			high_risk_text="carries an EpiPen",
			creation="2026-07-03 09:00:00.000000",
		)

		scan = _classify_rows([_oracle_row(WARNING_MESSAGE_NUM="569")], [legacy, richer])

		self.assertEqual(scan["duplicates"], [])
		self.assertEqual(scan["skipped_duplicates"], 1)

	def test_same_words_for_two_patients_are_not_duplicates(self):
		one = _erp_row(name="569", trans_id="569", warning="NKDA")
		other = _erp_row(name="700", trans_id="700", patient="P2", warning="NKDA")

		scan = _classify_rows([], [one, other])

		self.assertEqual(scan["duplicates"], [])

	def test_rows_without_patient_or_text_are_left_out(self):
		scan = _classify_rows(
			[],
			[
				_erp_row(name="163", trans_id="163", patient="", warning=""),
				_erp_row(name="167", trans_id="167", patient="", warning=""),
			],
		)

		self.assertEqual(scan["duplicates"], [])
		self.assertEqual(scan["skipped_duplicates"], 0)


class TestWarningMessageReconcileWorkItems(IntegrationTestCase):
	def test_blocked_rows_are_left_out_when_the_suffix_is_turned_off(self):
		scan = _classify_rows([_oracle_row()], [_erp_row(patient="100005")])

		self.assertEqual(_items(scan, suffix_conflicts=0), [])
		self.assertEqual([item[0] for item in _items(scan, suffix_conflicts=1)], ["create"])

	def test_fills_can_be_switched_off(self):
		scan = _classify_rows([_oracle_row()], [_erp_row(cost_center="")])

		self.assertEqual([item[0] for item in _items(scan)], ["fill"])
		self.assertEqual(_items(scan, fill_missing=0), [])

	def test_duplicates_can_be_switched_off(self):
		scan = _classify_rows(
			[],
			[
				_erp_row(name="569", trans_id="569", warning="Panadol"),
				_erp_row(
					name="1750",
					trans_id="1750",
					warning="Panadol",
					creation="2026-07-03 09:00:00.000000",
				),
			],
		)

		self.assertEqual([item[0] for item in _items(scan)], ["dedupe"])
		self.assertEqual(_items(scan, clean_duplicates=0), [])

	def test_limit_keeps_the_first_items(self):
		scan = _classify_rows(
			[_oracle_row(WARNING_MESSAGE_NUM="900"), _oracle_row(WARNING_MESSAGE_NUM="901")], []
		)

		self.assertEqual(len(_items(scan, limit=1)), 1)

	def test_patient_filter_limits_the_missing_rows(self):
		scan = _classify_rows(
			[
				_oracle_row(WARNING_MESSAGE_NUM="900", PATIENT_NUM="P1"),
				_oracle_row(WARNING_MESSAGE_NUM="901", PATIENT_NUM="P2"),
			],
			[],
		)

		items = _items(scan, patient="P2")

		self.assertEqual([item[1] for item in items], ["901"])

	def test_progress_starts_with_the_counters_the_dialog_polls(self):
		progress = _new_progress()

		for key in (
			"oracle_rows",
			"erpnext_rows",
			"missing_total",
			"fill_total",
			"duplicate_total",
			"created",
			"filled",
			"removed",
		):
			self.assertIn(key, progress)
		self.assertEqual(progress["state"], "queued")
		self.assertEqual(progress["processed"], 0)

	def test_summary_reports_the_dry_run_the_fills_and_the_duplicates(self):
		progress = _new_progress()
		progress.update(
			{
				"dry_run": 1,
				"oracle_rows": 573,
				"missing_total": 14,
				"missing_blocked": 14,
				"created": 14,
				"suffixed_keys": 14,
				"fill_total": 3,
				"filled": 3,
				"duplicate_total": 2,
				"removed": 2,
			}
		)

		message = _summary_message(progress)

		self.assertIn("Dry run", message)
		self.assertIn("Created: 14 of 14", message)
		self.assertIn("Filled from Oracle: 3 of 3", message)
		self.assertIn("Duplicates removed: 2 of 2", message)
		self.assertIn(CONFLICT_SUFFIX, message)



class TestWarningMessageReconcileWrites(IntegrationTestCase):
	"""The write path against real documents (the test runner rolls them back)."""

	def _insert(self, name: str, **fields) -> str:
		doc = frappe.get_doc({"doctype": DOCTYPE, "name": name, "trans_id": name, **fields})
		doc.flags.ignore_validate = True
		doc.flags.ignore_links = True
		doc.insert(ignore_permissions=True)
		return doc.name

	def test_missing_warning_is_created_with_its_oracle_number(self):
		number = "990001"

		result = _create_warning(
			number,
			{
				"warning_message_num": number,
				"patient_num": "",
				"warning_message": "Legacy warning text",
				"warning_message_type": "2",
				"warning_message_class": "1",
				"branch_num": "",
				"cr_date": "25-OCT-21",
				"sta_flg": "1",
			},
			0,
		)

		self.assertEqual(result["name"], number)
		self.assertFalse(result["suffixed"])
		self.assertEqual(
			frappe.db.get_value(DOCTYPE, number, ["trans_id", "warning", "warning_message_type"]),
			(number, "Legacy warning text", "2"),
		)

	def test_taken_number_is_created_under_the_suffix(self):
		number = "990010"
		self._insert(number, patient="", warning="an app record owns this number")

		result = _create_warning(
			number,
			{"warning_message_num": number, "patient_num": "", "warning_message": "Legacy text"},
			0,
		)

		self.assertEqual(result["name"], f"{number}{CONFLICT_SUFFIX}")
		self.assertTrue(result["suffixed"])
		self.assertEqual(_numeric_key(result["name"]), number)

	def test_dry_run_creates_nothing(self):
		number = "990020"
		result = _create_warning(number, {"warning_message_num": number}, 1)

		self.assertEqual(result["name"], number)
		self.assertFalse(frappe.db.exists(DOCTYPE, number))

	def test_duplicate_copy_is_removed_and_the_allergy_flag_carried_over(self):
		keeper = self._insert("990030", patient="", warning="Allergic to Panadol", is_allergy=0)
		copy = self._insert("990031", patient="", warning="allergic to panadol", is_allergy=1)

		result = _remove_duplicate(copy, keeper, 0)

		self.assertEqual(result["action"], "removed")
		self.assertFalse(frappe.db.exists(DOCTYPE, copy))
		self.assertEqual(frappe.db.get_value(DOCTYPE, keeper, "is_allergy"), 1)

	def test_phone_warning_copy_is_not_removed(self):
		keeper = self._insert("990040", patient="", warning="Allergic to Panadol")
		phone = self._insert(
			"990041", patient="", warning="Allergic to Panadol", is_special_phone_warning=1
		)

		result = _remove_duplicate(phone, keeper, 0)

		self.assertEqual(result["action"], "skipped_protected")
		self.assertTrue(frappe.db.exists(DOCTYPE, phone))

	def test_copy_that_changed_since_the_scan_is_not_removed(self):
		keeper = self._insert("990050", patient="", warning="Allergic to Panadol")
		copy = self._insert("990051", patient="", warning="Allergic to Brufen")

		result = _remove_duplicate(copy, keeper, 0)

		self.assertEqual(result["action"], "skipped_changed")
		self.assertTrue(frappe.db.exists(DOCTYPE, copy))

	def test_dry_run_removes_nothing(self):
		keeper = self._insert("990060", patient="", warning="Allergic to Panadol")
		copy = self._insert("990061", patient="", warning="Allergic to Panadol")

		result = _remove_duplicate(copy, keeper, 1)

		self.assertEqual(result["action"], "removed")
		self.assertTrue(frappe.db.exists(DOCTYPE, copy))

