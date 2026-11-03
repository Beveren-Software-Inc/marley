# Copyright (c) 2026, Healthcare contributors
# See license.txt

from unittest.mock import patch

from frappe.tests import IntegrationTestCase

from healthcare.api.clinical_note_reconcile import (
	HISTORY_TRANS_PREFIX,
	IP_DIAGNOSIS_FIELD,
	OP_TRANS_PREFIX,
	SOURCE_HISTORY,
	SOURCE_IP,
	SOURCE_OP,
	_append_errors,
	_coverage,
	_create_ip_note,
	_duplicate_history_count,
	_history_keys,
	_ip_fresh_name_count,
	_missing_samples,
	_new_progress,
	_record_errors,
	_row_key,
	_series_note_name,
	_source_entries,
	_summary_message,
	_table_rows,
	_text_key,
	_track_creation,
)


def _note(**kwargs) -> dict:
	"""One Clinical Note row in the shape ``_notes_by_patient`` returns."""
	note = {
		"name": "CN-0001",
		"patient": "849995",
		"trans_no": "",
		"reference_doc": "",
		"reference_name": "",
		"reference_doctype": "",
		"reference_document": "",
		"inpatient_admission": "",
		"clinical_note_type": "Doctor Progress Note",
	}
	note.update(kwargs)
	return note


def _op_row(visit: str, text: str = "Stable", **kwargs) -> dict:
	row = {"VISIT_NUM": visit, "VISIT_DIAGNOSIS_DETAIL": text}
	row.update(kwargs)
	return row


def _history_row(visit: str, cr_date: str, text: str = "Stable", **kwargs) -> dict:
	row = {"VISIT_NUM": visit, "CR_DATE": cr_date, "VISIT_DIAGNOSIS_DETAIL": text}
	row.update(kwargs)
	return row


def _ip_row(trans: str, text: str = "Morning round", **kwargs) -> dict:
	row = {"TRANS_NUM": trans, "DIAGNOSES_DESC": text, "ADMISSION_NUM": "2290"}
	row.update(kwargs)
	return row


class TestClinicalNoteCoverage(IntegrationTestCase):
	"""Which Oracle row does an existing Clinical Note already answer for?

	These are the lookups that decide whether a note is created twice or not at
	all, so they are pinned here instead of only being exercised against Oracle.
	"""

	def test_trans_no_prefixes_cover_their_source(self):
		notes = [
			_note(trans_no=f"{OP_TRANS_PREFIX}123"),
			_note(trans_no=f"{HISTORY_TRANS_PREFIX}123-2020-01-01-10-00-00"),
		]

		covered = _coverage(notes, {})

		self.assertEqual(covered[SOURCE_OP], {"123"})
		self.assertEqual(covered[SOURCE_HISTORY], {"123-2020-01-01-10-00-00"})
		self.assertEqual(covered[SOURCE_IP], set())

	def test_lower_case_prefixes_are_matched(self):
		covered = _coverage([_note(trans_no="opdx-777")], {})

		self.assertEqual(covered[SOURCE_OP], {"777"})

	def test_ip_note_is_matched_through_its_admission(self):
		notes = [
			_note(trans_no="135142", inpatient_admission="2290"),
			_note(name="CN-2", trans_no="135175", reference_doctype="Inpatient Admission"),
		]

		covered = _coverage(notes, {})

		self.assertEqual(covered[SOURCE_IP], {"135142", "135175"})

	def test_ip_trans_no_without_an_admission_is_not_coverage(self):
		# Clinical Note names are a numeric series, so a numeric trans_no alone
		# says nothing about which patient's IP note it is.
		covered = _coverage([_note(trans_no="135142")], {})

		self.assertEqual(covered[SOURCE_IP], set())

	def test_patient_visit_reference_covers_the_visit(self):
		notes = [_note(trans_no="CN-0004", reference_doc="Patient Visit", reference_name="PV-9")]

		covered = _coverage(notes, {"PV-9": "456"})

		self.assertEqual(covered[SOURCE_OP], {"456"})
		self.assertEqual(covered[SOURCE_HISTORY], set())

	def test_empty_history_covers_nothing(self):
		covered = _coverage([], {})

		self.assertEqual(covered, {SOURCE_OP: set(), SOURCE_HISTORY: set(), SOURCE_IP: set()})


class TestClinicalNoteHistoryKeys(IntegrationTestCase):
	"""VISIT_00_01_HISTORY keys - the table ERPNext never imported."""

	def test_keys_follow_the_history_import_helpers(self):
		keys = [
			key
			for key, _row in _history_keys(
				[
					_history_row("123", "2020-01-01 10:00:00"),
					_history_row("124", "2020-02-02 09:30:00"),
				]
			)
		]

		self.assertEqual(keys, ["123-2020-01-01-10-00-00", "124-2020-02-02-09-30-00"])

	def test_same_visit_and_timestamp_get_a_suffix(self):
		keys = [
			key
			for key, _row in _history_keys(
				[
					_history_row("123", "2020-01-01 10:00:00"),
					_history_row("123", "2020-01-01 10:00:00"),
					_history_row("123", "2020-01-01 10:00:00"),
				]
			)
		]

		self.assertEqual(
			keys,
			[
				"123-2020-01-01-10-00-00",
				"123-2020-01-01-10-00-00-2",
				"123-2020-01-01-10-00-00-3",
			],
		)

	def test_rows_without_a_visit_number_are_dropped(self):
		keys = [key for key, _row in _history_keys([_history_row("", "2020-01-01")])]

		self.assertEqual(keys, [])

	def test_duplicate_history_means_the_same_text_as_the_current_diagnosis(self):
		rows = {
			SOURCE_OP: [_op_row("123", "Fever\n  cough")],
			SOURCE_HISTORY: [
				_history_row("123", "2020-01-01", "fever cough"),
				_history_row("123", "2020-01-02", "Rash"),
				_history_row("124", "2020-01-03", "fever cough"),
			],
		}

		self.assertEqual(_duplicate_history_count(rows), 1)

	def test_blank_history_text_is_never_a_duplicate(self):
		rows = {
			SOURCE_OP: [_op_row("123", "")],
			SOURCE_HISTORY: [_history_row("123", "2020-01-01", "  ")],
		}

		self.assertEqual(_duplicate_history_count(rows), 0)


class TestClinicalNoteSources(IntegrationTestCase):
	def test_source_keys(self):
		self.assertEqual(_row_key(SOURCE_OP, _op_row("123")), "123")
		self.assertEqual(_row_key(SOURCE_IP, _ip_row("135142")), "135142")

	def test_history_entries_carry_the_record_keys(self):
		entries = _source_entries(SOURCE_HISTORY, [_history_row("123", "2020-01-01 10:00:00")])

		self.assertEqual([key for key, _row in entries], ["123-2020-01-01-10-00-00"])

	def test_missing_samples_only_list_uncovered_rows(self):
		rows = {
			SOURCE_OP: [_op_row("123"), _op_row("456")],
			SOURCE_HISTORY: [_history_row("123", "2020-01-01 10:00:00")],
			SOURCE_IP: [],
		}
		covered = {SOURCE_OP: {"123"}, SOURCE_HISTORY: set(), SOURCE_IP: set()}

		samples = _missing_samples(rows, covered, 10)

		self.assertEqual(
			[(sample["source"], sample["key"]) for sample in samples],
			[(SOURCE_OP, "456"), (SOURCE_HISTORY, "123-2020-01-01-10-00-00")],
		)

	def test_samples_respect_the_limit(self):
		rows = {SOURCE_OP: [_op_row("1"), _op_row("2"), _op_row("3")], SOURCE_HISTORY: [], SOURCE_IP: []}

		samples = _missing_samples(rows, {source: set() for source in rows}, 2)

		self.assertEqual([sample["key"] for sample in samples], ["1", "2"])

	def test_text_matching_ignores_case_and_spacing(self):
		self.assertEqual(_text_key("Fever\n  cough"), _text_key("fever cough"))
		self.assertEqual(_text_key("   "), "")

	def test_ip_fresh_name_count_ignores_patients_without_ip_rows(self):
		self.assertEqual(_ip_fresh_name_count({SOURCE_IP: []}, {SOURCE_IP: set()}, "849995"), 0)


class TestClinicalNoteProgress(IntegrationTestCase):
	def test_progress_starts_with_the_counters_the_dialog_polls(self):
		progress = _new_progress("849995", limit=25)

		self.assertEqual(progress["job_key"], "clinical_note_reconcile")
		self.assertEqual(progress["state"], "queued")
		self.assertEqual(progress["patient"], "849995")
		self.assertEqual(progress["limit"], 25)
		self.assertEqual(progress["processed"], 0)
		self.assertEqual(progress["created"], 0)
		self.assertEqual(progress["created_fresh_name"], 0)

	def test_created_notes_are_counted_per_source(self):
		progress = _new_progress()

		_track_creation(progress, SOURCE_HISTORY, {"status": "created"}, "849995 history 1")
		_track_creation(progress, SOURCE_OP, {"status": "dry_run"}, "849995 OP visit 1")

		self.assertEqual(progress["created"], 2)
		self.assertEqual(progress["created_history"], 1)
		self.assertEqual(progress["created_op"], 1)
		self.assertEqual(progress["samples"], ["849995 history 1", "849995 OP visit 1"])

	def test_notes_created_under_a_fresh_name_are_counted_too(self):
		progress = _new_progress()

		_track_creation(
			progress, SOURCE_IP, {"status": "created", "fresh_name": "145638"}, "849995 IP note 1"
		)
		_track_creation(progress, SOURCE_IP, {"status": "created"}, "849995 IP note 2")

		self.assertEqual(progress["created"], 2)
		self.assertEqual(progress["created_ip"], 2)
		self.assertEqual(progress["created_fresh_name"], 1)

	def test_skips_are_kept_apart(self):
		progress = _new_progress()

		_track_creation(progress, SOURCE_IP, {"status": "skip_exists"})
		_track_creation(progress, SOURCE_IP, {"status": "skip_no_admission"})
		_track_creation(progress, SOURCE_OP, {"status": "skip_no_note"})

		self.assertEqual(progress["skipped_existing"], 1)
		self.assertEqual(progress["unresolved_admission"], 1)
		self.assertEqual(progress["skipped_other"], 1)
		self.assertEqual(progress["created"], 0)
		self.assertEqual(progress["created_fresh_name"], 0)
		self.assertEqual(progress["samples"], [])

	def test_summary_reports_the_gap_and_the_created_notes(self):
		progress = _new_progress()
		progress.update(
			{
				"dry_run": 1,
				"oracle_rows": 3154,
				"oracle_op": 802,
				"oracle_history": 134,
				"oracle_ip": 2218,
				"existing_notes": 3054,
				"created": 135,
				"created_history": 134,
				"created_op": 1,
			}
		)

		message = _summary_message(progress)

		self.assertIn("DRY RUN", message)
		self.assertIn("3154 (OP 802, history 134, IP 2218)", message)
		self.assertIn("Clinical Notes created: 135 (OP 1, history 134, IP 0)", message)

	def test_summary_mentions_the_fresh_names_and_the_duplicate_history(self):
		progress = _new_progress()
		progress.update({"created_fresh_name": 3, "skipped_duplicate_text": 71})

		message = _summary_message(progress)

		self.assertIn("fresh Clinical Note name", message)
		self.assertIn("another patient's note): 3", message)
		self.assertIn("repeat the current diagnosis: 71", message)


class TestClinicalNoteOracleReads(IntegrationTestCase):
	"""Reading Oracle is done through SQL*Plus, so one bad row fails a statement.

	``_table_rows`` retries key by key: a patient whose rows Oracle refuses to
	read must not take the other patients of the chunk with it.
	"""

	def test_empty_keys_never_reach_oracle(self):
		with patch("healthcare.api.clinical_note_reconcile._fetch_rows") as fetch:
			self.assertEqual(_table_rows("IP_ADMISSION_DIAGNOSES", "ADMISSION_NUM", []), [])

		fetch.assert_not_called()

	def test_one_unreadable_key_does_not_lose_the_chunk(self):
		where_seen: list[str] = []

		def fetch_rows(table, where="", order_by="", limit=0):
			where_seen.append(where)
			if " in (" in where:
				raise Exception("ORA-06502: character string buffer too small")
			if "= '2'" in where:
				raise Exception("ORA-06502: character string buffer too small")
			if "= '1'" not in where:
				return []
			return [{"ADMISSION_NUM": "1", "DIAGNOSES_DESC": "Morning round"}]

		errors: list[str] = []
		with (
			patch("healthcare.api.clinical_note_reconcile._fetch_rows", side_effect=fetch_rows),
			patch("healthcare.api.clinical_note_reconcile.frappe.log_error"),
		):
			rows = _table_rows("IP_ADMISSION_DIAGNOSES", "ADMISSION_NUM", ["1", "2", "3"], errors=errors)

		self.assertEqual(rows, [{"ADMISSION_NUM": "1", "DIAGNOSES_DESC": "Morning round"}])
		self.assertEqual(len(errors), 1)
		self.assertIn("ADMISSION_NUM=2", errors[0])
		# the batch attempt, then one per key
		self.assertEqual(len(where_seen), 4)

	def test_the_filter_is_kept_on_the_per_key_retry(self):
		where_seen: list[str] = []

		def fetch_rows(table, where="", order_by="", limit=0):
			where_seen.append(where)
			if " in (" in where:
				raise Exception("ORA-06502")
			return []

		with (
			patch("healthcare.api.clinical_note_reconcile._fetch_rows", side_effect=fetch_rows),
			patch("healthcare.api.clinical_note_reconcile.frappe.log_error"),
		):
			_table_rows(
				"IP_ADMISSION_DIAGNOSES",
				"ADMISSION_NUM",
				["2338"],
				extra_where="dbms_lob.getlength(DIAGNOSES_DESC) > 0",
				order_by="ADMISSION_NUM, TRANS_NUM",
			)

		self.assertIn("dbms_lob.getlength(DIAGNOSES_DESC) > 0", where_seen[-1])
		self.assertIn("ADMISSION_NUM = '2338'", where_seen[-1])

	def test_read_errors_are_not_counted_as_failed_patients(self):
		progress = _new_progress()

		_append_errors(progress, ["IP_ADMISSION_DIAGNOSES ADMISSION_NUM=2338: unreadable"])
		self.assertEqual(progress["failed"], 0)
		self.assertEqual(len(progress["errors"]), 1)

		_record_errors(progress, ["849995: boom"])
		self.assertEqual(progress["failed"], 1)
		self.assertEqual(len(progress["errors"]), 2)

	def test_errors_stay_capped(self):
		progress = _new_progress()

		_append_errors(progress, [f"error {index}" for index in range(50)])

		self.assertEqual(len(progress["errors"]), 5)


class TestClinicalNoteIpNames(IntegrationTestCase):
	"""Clinical Note names are a numeric series, so an Oracle ``TRANS_NUM`` can
	already be the name of an unrelated note.

	Such a row keeps the Oracle number in ``trans_no`` and is created under a
	fresh series name - the other note is never touched.
	"""

	def test_the_series_name_follows_the_highest_number(self):
		with (
			patch("healthcare.api.clinical_note_reconcile.frappe.db.sql", return_value=[[145637]]),
			patch("healthcare.api.clinical_note_reconcile.frappe.db.exists", return_value=False),
		):
			self.assertEqual(_series_note_name(), "145638")

	def test_the_series_name_skips_numbers_that_are_taken(self):
		taken = {"145638"}

		def exists(doctype, name=None, *args, **kwargs):
			return name in taken

		with (
			patch("healthcare.api.clinical_note_reconcile.frappe.db.sql", return_value=[[145637]]),
			patch("healthcare.api.clinical_note_reconcile.frappe.db.exists", side_effect=exists),
		):
			self.assertEqual(_series_note_name(), "145639")

	def test_a_free_trans_num_stays_the_name(self):
		seen = {}

		def upsert(payload, create_name=None):
			seen["create_name"] = create_name
			seen["trans_num"] = payload.get("trans_num")
			return {"status": "created", "trans_no": payload.get("trans_num")}

		with (
			patch(
				"healthcare.api.clinical_note_reconcile._clinical_note_with_trans_no",
				return_value=None,
			),
			patch("healthcare.api.clinical_note_reconcile.frappe.db.exists", return_value=False),
			patch(
				"healthcare.api.clinical_note_reconcile._resolve_inpatient_admission",
				return_value="2290",
			),
			patch("healthcare.api.clinical_note_reconcile._upsert_ip_note", side_effect=upsert),
		):
			result = _create_ip_note(
				"298756", {"TRANS_NUM": "135142", "ADMISSION_NUM": "2290", IP_DIAGNOSIS_FIELD: "Round"}
			)

		self.assertIsNone(seen["create_name"])
		self.assertEqual(seen["trans_num"], "135142")
		self.assertNotIn("fresh_name", result)

	def test_a_taken_trans_num_takes_a_fresh_name(self):
		seen = {}

		def upsert(payload, create_name=None):
			seen["create_name"] = create_name
			return {"status": "created", "trans_no": payload.get("trans_num"), "name": create_name}

		with (
			patch(
				"healthcare.api.clinical_note_reconcile._clinical_note_with_trans_no",
				return_value=None,
			),
			patch("healthcare.api.clinical_note_reconcile.frappe.db.exists", return_value=True),
			patch(
				"healthcare.api.clinical_note_reconcile._series_note_name", return_value="145638"
			),
			patch(
				"healthcare.api.clinical_note_reconcile._resolve_inpatient_admission",
				return_value="2290",
			),
			patch("healthcare.api.clinical_note_reconcile._upsert_ip_note", side_effect=upsert),
		):
			result = _create_ip_note(
				"298756", {"TRANS_NUM": "135131", "ADMISSION_NUM": "2290", IP_DIAGNOSIS_FIELD: "Round"}
			)

		self.assertEqual(seen["create_name"], "145638")
		self.assertEqual(result["fresh_name"], "145638")

	def test_an_existing_note_of_the_patient_is_left_alone(self):
		with (
			patch(
				"healthcare.api.clinical_note_reconcile._clinical_note_with_trans_no",
				return_value="135131",
			),
			patch("healthcare.api.clinical_note_reconcile._upsert_ip_note") as upsert,
		):
			result = _create_ip_note(
				"298756", {"TRANS_NUM": "135131", "ADMISSION_NUM": "2290", IP_DIAGNOSIS_FIELD: "Round"}
			)

		self.assertEqual(result["status"], "skip_exists")
		upsert.assert_not_called()


