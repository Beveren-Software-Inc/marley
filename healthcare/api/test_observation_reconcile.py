# Copyright (c) 2026, Healthcare contributors
# See license.txt

from unittest.mock import MagicMock, patch

from frappe.tests import IntegrationTestCase

from healthcare.api.observation_reconcile import (
	DOCTYPE,
	JOB_KEY,
	ORACLE_TABLE,
	_classify,
	_chunks,
	_create_observation,
	_duplicate_groups,
	_fill_observation,
	_new_progress,
	_norm_text,
	_oracle_payload,
	_remove_duplicate,
	_summary_message,
	_work_items,
)


def _oracle_row(**kwargs) -> dict:
	"""One CLINIC2.IP_OBSERVATION_LEVEL row as ``_fetch_rows`` returns it."""
	row = {
		"TRANS_NUM": "1164",
		"ADMISSION_NUM": "2346",
		"OBS_CODE": "2",
		"OBS_LEVEL": "",
		"NOTES": "",
		"START_DATE": "2026-08-01 00:00:00",
		"DC_DATE": "",
		"CR_ID": "274",
		"CR_DATE": "2026-08-01 09:12:00",
		"UP_ID": "",
		"UP_DATE": "",
		"BRANCH_NUM": "1",
		"SERV_AMT": "",
	}
	row.update(kwargs)
	return row


def _erp_row(**kwargs) -> dict:
	"""One ``tabObservation`` row as ``_erpnext_rows`` returns it."""
	row = {
		"name": "1164",
		"trans_no": "1164",
		"patient": "860848",
		"admission_no": "2346",
		"obs_code": "2",
		"observation_level": "Intermittent Observation",
		"obs_level": "Intermittent Observation",
		"note": "",
		"cost_center": "Serene Hospital - SPH",
		"duration": "30 M",
		"start_date": "2026-08-01",
		"dc_date": "",
		"serv_amount": 0,
		"amount": 0,
		"invoiced": 0,
		"sales_invoice": "",
		"service_request": "",
		"order_created": "",
		"docstatus": 1,
		"creation": "2026-08-02 08:16:03.979364",
	}
	row.update(kwargs)
	return row


def _pin_lookups(patients=None, level_defaults=None):
	"""Admission / cost centre / level master lookups pinned to fixed values."""
	index = {"2346": "860848"} if patients is None else patients
	defaults = level_defaults or {}
	return patch.multiple(
		"healthcare.api.observation_reconcile",
		_admission_index=lambda nums: dict(index),
		_resolve_cost_center=lambda branch: "Serene Hospital - SPH",
		_level_exists=lambda level: bool(level),
		_level_defaults=lambda level: dict(defaults),
		_has_attachment=lambda name: False,
	)


def _classify_rows(oracle_rows, erp_rows) -> dict:
	headers = {_oracle_payload(row)["trans_num"]: _oracle_payload(row) for row in oracle_rows}
	with _pin_lookups():
		return _classify(headers, erp_rows)


class TestObservationReconcileMapping(IntegrationTestCase):
	"""Oracle IP_OBSERVATION_LEVEL -> Observation.

	The job reads Oracle, but the decisions pinned here are the ones that decide
	whether a legacy observation is stored once, twice, completed from Oracle or
	not at all.
	"""

	def test_button_reads_the_observation_level_table(self):
		self.assertEqual(ORACLE_TABLE, "IP_OBSERVATION_LEVEL")
		self.assertEqual(DOCTYPE, "Observation")
		self.assertEqual(JOB_KEY, "observation_reconcile")

	def test_oracle_payload_uses_the_importer_keys(self):
		payload = _oracle_payload(
			_oracle_row(TRANS_NUM="1164.0", ADMISSION_NUM="2346.0", CR_ID="274.0")
		)

		self.assertEqual(payload["trans_num"], "1164")
		self.assertEqual(payload["admission_num"], "2346")
		self.assertEqual(payload["obs_code"], "2")
		self.assertEqual(payload["obs_level"], "")
		self.assertEqual(payload["cr_id"], "274")
		self.assertEqual(payload["branch_num"], "1")
		self.assertEqual(payload["start_date"], "2026-08-01 00:00:00")

	def test_oracle_payload_keeps_the_note_text(self):
		payload = _oracle_payload(_oracle_row(NOTES=" Active suicidal ideation. "))

		self.assertEqual(payload["notes"], "Active suicidal ideation.")

	def test_chunks_split_the_keys_of_one_oracle_query(self):
		self.assertEqual(list(_chunks([], 2)), [])
		self.assertEqual(list(_chunks(["a"], 2)), [["a"]])
		self.assertEqual(list(_chunks(["a", "b", "c"], 2)), [["a", "b"], ["c"]])


class TestObservationReconcileClassify(IntegrationTestCase):
	def test_matching_observation_counts_as_already_imported(self):
		scan = _classify_rows([_oracle_row()], [_erp_row()])

		self.assertEqual(scan["matched"], 1)
		self.assertEqual(scan["missing_total"], 0)
		self.assertEqual(scan["fills"], [])

	def test_missing_observation_is_reported_with_patient_and_date(self):
		scan = _classify_rows([_oracle_row()], [])

		self.assertEqual(scan["missing"], [["1164", "860848", "2026-08-01"]])
		self.assertEqual(scan["matched"], 0)

	def test_blank_discharge_date_is_filled_from_oracle(self):
		scan = _classify_rows([_oracle_row(DC_DATE="2026-08-19 11:30:00")], [_erp_row()])

		self.assertEqual(len(scan["fills"]), 1)
		name, patient, changes = scan["fills"][0]
		self.assertEqual((name, patient), ("1164", "860848"))
		self.assertEqual(list(changes), ["dc_date"])
		self.assertEqual(str(changes["dc_date"]), "2026-08-19 11:30:00")
		self.assertEqual(scan["differs"], [])

	def test_blank_note_is_filled_from_oracle(self):
		scan = _classify_rows([_oracle_row(NOTES="Risk of fall")], [_erp_row()])

		self.assertEqual(scan["fills"], [["1164", "860848", {"note": "Risk of fall"}]])

	def test_existing_value_is_reported_not_overwritten(self):
		scan = _classify_rows(
			[_oracle_row(NOTES="Risk of fall")],
			[_erp_row(note="<p>Risk of fall, high</p>")],
		)

		self.assertEqual(scan["fills"], [])
		self.assertEqual(scan["differs"], [["1164", ["note"]]])

	def test_level_and_code_are_filled_when_oracle_has_them(self):
		scan = _classify_rows(
			[_oracle_row(OBS_CODE="4")],
			[_erp_row(obs_code="", observation_level="", obs_level="")],
		)

		changes = scan["fills"][0][2]
		self.assertEqual(sorted(changes), ["obs_code", "obs_level", "observation_level"])
		self.assertEqual(changes["obs_code"], "4")
		self.assertEqual(changes["observation_level"], "One to One (Within In Arm's Length)")
		self.assertEqual(changes["obs_level"], "One to One (Within In Arm's Length)")

	def test_obs_level_follows_the_level_link_the_record_already_has(self):
		scan = _classify_rows(
			[_oracle_row(OBS_CODE="4")],
			[_erp_row(obs_code="", observation_level="General Observation", obs_level="")],
		)

		self.assertEqual(scan["fills"][0][2], {"obs_code": "4", "obs_level": "General Observation"})
		self.assertEqual(scan["differs"], [["1164", ["observation_level"]]])

	def test_serv_amount_is_filled_when_erpnext_left_it_zero(self):
		scan = _classify_rows([_oracle_row(SERV_AMT="315")], [_erp_row()])

		self.assertEqual(scan["fills"], [["1164", "860848", {"serv_amount": 315.0, "amount": 315.0}]])

	def test_zero_serv_amount_is_not_a_value_to_write(self):
		scan = _classify_rows([_oracle_row(SERV_AMT="0")], [_erp_row()])

		self.assertEqual(scan["fills"], [])
		self.assertEqual(scan["differs"], [])

	def test_duration_comes_from_the_observation_level(self):
		headers = {_oracle_payload(_oracle_row())["trans_num"]: _oracle_payload(_oracle_row())}
		with _pin_lookups(level_defaults={"duration": "60 M", "amount": 60.0}):
			scan = _classify(headers, [_erp_row(duration="", amount=0)])

		self.assertEqual(scan["fills"], [["1164", "860848", {"amount": 60.0, "duration": "60 M"}]])


	def test_observation_without_oracle_row_is_counted_as_extra(self):
		scan = _classify_rows(
			[_oracle_row()],
			[_erp_row(), _erp_row(name="HLC-OBS-2026-00012", trans_no="")],
		)

		self.assertEqual(scan["extra_rows"], 1)
		self.assertEqual(scan["erpnext_rows"], 2)

	def test_patients_come_from_the_admissions_of_the_oracle_rows(self):
		scan = _classify_rows(
			[_oracle_row(), _oracle_row(TRANS_NUM="1165", ADMISSION_NUM="9876")],
			[],
		)

		self.assertEqual(scan["oracle_rows"], 2)
		self.assertEqual(scan["oracle_patients"], 1)



class TestObservationReconcileDuplicates(IntegrationTestCase):
	"""A copy is only merged when the register is expected to keep the keeper."""

	def _groups(self, rows, oracle_numbers=None):
		with _pin_lookups():
			return _duplicate_groups(rows, oracle_numbers or {"1164"})

	def test_copy_without_oracle_row_is_merged_into_the_legacy_one(self):
		duplicates, skipped = self._groups(
			[
				_erp_row(),
				_erp_row(name="HLC-OBS-2026-00012", trans_no="", docstatus=0, creation="2026-08-05 09:00:00"),
			]
		)

		self.assertEqual(duplicates, [["HLC-OBS-2026-00012", "1164"]])
		self.assertEqual(skipped, 0)

	def test_two_legacy_rows_for_the_same_day_are_two_orders(self):
		duplicates, skipped = self._groups(
			[_erp_row(), _erp_row(name="1165", trans_no="1165")],
			{"1164", "1165"},
		)

		self.assertEqual(duplicates, [])
		self.assertEqual(skipped, 0)

	def test_copy_with_its_own_note_is_kept(self):
		duplicates, skipped = self._groups(
			[
				_erp_row(note="<p>Risk of fall</p>"),
				_erp_row(name="HLC-OBS-2026-00012", trans_no="", note="<p>Elopement risk</p>", docstatus=0),
			]
		)

		self.assertEqual(duplicates, [])
		self.assertEqual(skipped, 1)

	def test_copy_with_the_same_note_is_merged(self):
		duplicates, skipped = self._groups(
			[
				_erp_row(note="<p>Risk of fall</p>"),
				_erp_row(name="HLC-OBS-2026-00012", trans_no="", note="risk of FALL", docstatus=0),
			]
		)

		self.assertEqual(duplicates, [["HLC-OBS-2026-00012", "1164"]])
		self.assertEqual(skipped, 0)

	def test_invoiced_copy_is_protected(self):
		duplicates, skipped = self._groups(
			[_erp_row(), _erp_row(name="HLC-OBS-2026-00012", trans_no="", invoiced=1, docstatus=0)]
		)

		self.assertEqual(duplicates, [])
		self.assertEqual(skipped, 1)

	def test_copy_on_an_order_is_protected(self):
		duplicates, skipped = self._groups(
			[
				_erp_row(),
				_erp_row(name="HLC-OBS-2026-00012", trans_no="", order_created="SO-1", docstatus=0),
			]
		)

		self.assertEqual(duplicates, [])
		self.assertEqual(skipped, 1)

	def test_copy_on_a_sales_invoice_is_protected(self):
		duplicates, skipped = self._groups(
			[
				_erp_row(),
				_erp_row(name="HLC-OBS-2026-00012", trans_no="", sales_invoice="SI-1", docstatus=0),
			]
		)

		self.assertEqual(duplicates, [])
		self.assertEqual(skipped, 1)

	def test_copy_with_an_attachment_is_protected(self):
		with _pin_lookups(), patch(
			"healthcare.api.observation_reconcile._has_attachment", return_value=True
		):
			duplicates, skipped = _duplicate_groups(
				[_erp_row(), _erp_row(name="HLC-OBS-2026-00012", trans_no="", docstatus=0)],
				{"1164"},
			)

		self.assertEqual(duplicates, [])
		self.assertEqual(skipped, 1)

	def test_copy_that_holds_more_than_the_keeper_is_kept(self):
		duplicates, skipped = self._groups(
			[
				_erp_row(dc_date=""),
				_erp_row(
					name="HLC-OBS-2026-00012",
					trans_no="",
					dc_date="2026-08-10 10:00:00",
					docstatus=0,
				),
			]
		)

		self.assertEqual(duplicates, [])
		self.assertEqual(skipped, 1)

	def test_copy_without_a_level_is_not_a_duplicate(self):
		duplicates, skipped = self._groups(
			[
				_erp_row(),
				_erp_row(
					name="HLC-OBS-2026-00012", trans_no="", observation_level="", docstatus=0
				),
			]
		)

		self.assertEqual(duplicates, [])
		self.assertEqual(skipped, 0)

	def test_copy_without_a_start_date_is_not_a_duplicate(self):
		duplicates, skipped = self._groups(
			[_erp_row(), _erp_row(name="HLC-OBS-2026-00012", trans_no="", start_date="", docstatus=0)]
		)

		self.assertEqual(duplicates, [])
		self.assertEqual(skipped, 0)

