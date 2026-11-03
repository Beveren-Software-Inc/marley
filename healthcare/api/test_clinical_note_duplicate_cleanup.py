# Copyright (c) 2026, Healthcare contributors
# See license.txt

from unittest.mock import patch

from frappe.tests import IntegrationTestCase

from healthcare.api.clinical_note_duplicate_cleanup import (
	SCOPE_INPATIENT,
	SCOPE_VISITS,
	_looks_like_legacy_import,
	_merge_payload,
	_new_result,
	_note_preview,
	_process_group,
	_scope_of,
	_signature,
)


def _member(name: str, trans_no: str = "", creation: str = "2026-07-05 12:00:00", **kwargs) -> dict:
	"""One Clinical Note row in the shape ``_load_group_members`` returns."""
	member = {
		"name": name,
		"trans_no": trans_no,
		"creation": creation,
		"owner": "Administrator",
		"docstatus": 0,
		"note_locked": 0,
		"patient": "849995",
		"reference_doc": "Patient Visit",
		"reference_name": "100547",
		"reference_doctype": "",
		"reference_document": "",
		"inpatient_admission": "",
		"posting_date": "2023-12-21 00:00:00",
		"note": "<p>Stable</p>",
		"clinical_note_type": "Doctor Progress Note",
		"medical_role": "",
		"practitioner": "205",
		"cost_center": "",
		"username": "",
	}
	member.update(kwargs)
	return member


def _group(**kwargs) -> dict:
	"""One duplicate group in the shape ``_group_rows`` returns."""
	group = {
		"signature": "d41d8cd98f00b204e9800998ecf8427e",
		"patient": "849995",
		"scope": SCOPE_VISITS,
		"reference": "Patient Visit",
		"reference_name": "100547",
		"posting_date": "2023-12-21",
		"copies": 3,
		"names": ["135634", "CN-42225", "CN-77016"],
		"trans_nos": ["135634", "187212", "222003"],
		"legacy_import": False,
		"preview": "Stable",
	}
	group.update(kwargs)
	return group


def _members(group: dict) -> dict[str, dict]:
	return {
		name: _member(name, number, creation=f"2026-07-0{index + 5} 12:00:00")
		for index, (name, number) in enumerate(zip(group["names"], group["trans_nos"]))
	}



class TestClinicalNoteDuplicateMerge(IntegrationTestCase):
	def test_merge_payload_keeps_every_trans_number_on_one_note(self):
		payload = _merge_payload(
			[
				_member("135634", "135634"),
				_member("CN-42225", "187212", creation="2026-07-06 02:06:10"),
				_member("CN-77016", "222003", creation="2026-07-06 10:22:47"),
			]
		)
		self.assertEqual(payload["merged_trans_nos"], "135634, 187212, 222003")
		self.assertEqual(payload["repeat_count"], 3)

	def test_merge_payload_falls_back_to_the_note_name(self):
		payload = _merge_payload([_member("CN-0001"), _member("CN-0002")])
		self.assertEqual(payload["merged_trans_nos"], "CN-0001, CN-0002")

	def test_merge_payload_never_repeats_a_number(self):
		payload = _merge_payload([_member("CN-0001", "42"), _member("CN-0002", "42")])
		self.assertEqual(payload["merged_trans_nos"], "42")
		self.assertEqual(payload["repeat_count"], 2)

	def test_a_locked_note_is_the_one_kept(self):
		group = _group(names=["CN-1", "CN-2"], trans_nos=["1", "2"])
		members = {
			"CN-1": _member("CN-1", "1", creation="2026-07-05 10:00:00"),
			"CN-2": _member("CN-2", "2", creation="2026-07-06 10:00:00", note_locked=1),
		}
		result = _new_result(1, SCOPE_VISITS, 0, 1)

		deleted = _process_group(
			group,
			members,
			set(),
			include_legacy_inpatient=0,
			match_posting_time=1,
			dry_run=1,
			result=result,
		)

		self.assertEqual(deleted, 1)
		self.assertEqual(result["actions"][0]["keep"], "CN-2")
		self.assertEqual(result["actions"][0]["delete"], ["CN-1"])
		self.assertEqual(result["actions"][0]["merged_trans_nos"], "1, 2")

	def test_attachment_holder_and_locked_copy_are_never_deleted(self):
		group = _group(names=["CN-1", "CN-2", "CN-3"], trans_nos=["1", "2", "3"])
		members = {
			"CN-1": _member("CN-1", "1", creation="2026-07-05 10:00:00"),
			"CN-2": _member("CN-2", "2", creation="2026-07-06 10:00:00", note_locked=1),
			"CN-3": _member("CN-3", "3", creation="2026-07-07 10:00:00"),
		}
		result = _new_result(0, SCOPE_VISITS, 0, 1)

		with patch("frappe.db.set_value") as set_value, patch("frappe.delete_doc") as delete_doc:
			deleted = _process_group(
				group,
				members,
				{"CN-3"},
				include_legacy_inpatient=0,
				match_posting_time=1,
				dry_run=0,
				result=result,
			)

		self.assertEqual(deleted, 1)
		self.assertEqual(result["skipped_attachment"], 1)
		set_value.assert_called_once()
		delete_doc.assert_called_once()
		self.assertEqual(delete_doc.call_args.args[1], "CN-1")

	def test_every_trans_number_is_stored_before_a_copy_is_deleted(self):
		group = _group()
		members = _members(group)
		result = _new_result(0, SCOPE_VISITS, 0, 1)
		calls: list[tuple] = []

		def fake_set_value(doctype, name, values, **kwargs):
			calls.append(("set", name, values["merged_trans_nos"], values["repeat_count"]))

		def fake_delete(doctype, name, **kwargs):
			calls.append(("delete", name))

		with patch("frappe.db.set_value", side_effect=fake_set_value), patch(
			"frappe.delete_doc", side_effect=fake_delete
		):
			deleted = _process_group(
				group,
				members,
				set(),
				include_legacy_inpatient=0,
				match_posting_time=1,
				dry_run=0,
				result=result,
			)

		self.assertEqual(deleted, 2)
		self.assertEqual(calls[0], ("set", "135634", "135634, 187212, 222003", 3))
		self.assertEqual([call[1] for call in calls[1:]], ["CN-42225", "CN-77016"])
	def test_group_with_a_different_posting_time_is_left_alone(self):
		group = _group(names=["CN-1", "CN-2"], trans_nos=["1", "2"])
		members = {
			"CN-1": _member("CN-1", "1", posting_date="2023-12-21 00:00:00"),
			"CN-2": _member("CN-2", "2", posting_date="2023-12-21 09:30:00"),
		}
		result = _new_result(0, SCOPE_VISITS, 0, 1)

		deleted = _process_group(
			group,
			members,
			set(),
			include_legacy_inpatient=0,
			match_posting_time=1,
			dry_run=1,
			result=result,
		)

		self.assertEqual(deleted, 0)
		self.assertEqual(result["skipped_variance"], 1)

	def test_same_day_copies_are_merged_when_the_time_is_ignored(self):
		group = _group(names=["CN-1", "CN-2"], trans_nos=["1", "2"])
		members = {
			"CN-1": _member("CN-1", "1", posting_date="2023-12-21 00:00:00"),
			"CN-2": _member("CN-2", "2", posting_date="2023-12-21 09:30:00"),
		}
		result = _new_result(1, SCOPE_VISITS, 0, 0)

		deleted = _process_group(
			group,
			members,
			set(),
			include_legacy_inpatient=0,
			match_posting_time=0,
			dry_run=1,
			result=result,
		)

		self.assertEqual(deleted, 1)

	def test_legacy_inpatient_copies_are_kept_unless_asked_for(self):
		group = _group(
			scope=SCOPE_INPATIENT,
			reference="Inpatient Admission",
			names=["135634", "135700"],
			trans_nos=["135634", "135700"],
			legacy_import=True,
		)
		members = _members(group)
		result = _new_result(0, SCOPE_INPATIENT, 0, 1)

		deleted = _process_group(
			group,
			members,
			set(),
			include_legacy_inpatient=0,
			match_posting_time=1,
			dry_run=0,
			result=result,
		)
		self.assertEqual(deleted, 0)
		self.assertEqual(result["skipped_inpatient_legacy"], 1)

		result = _new_result(0, SCOPE_INPATIENT, 1, 1)
		deleted = _process_group(
			group,
			members,
			set(),
			include_legacy_inpatient=1,
			match_posting_time=1,
			dry_run=1,
			result=result,
		)
		self.assertEqual(deleted, 1)

	def test_dry_run_reports_without_touching_anything(self):
		group = _group()
		members = _members(group)
		result = _new_result(1, SCOPE_VISITS, 0, 1)

		with patch("frappe.db.set_value") as set_value, patch("frappe.delete_doc") as delete_doc:
			deleted = _process_group(
				group,
				members,
				set(),
				include_legacy_inpatient=0,
				match_posting_time=1,
				dry_run=1,
				result=result,
			)

		self.assertEqual(deleted, 2)
		self.assertEqual(result["groups_merged"], 1)
		self.assertEqual(result["notes_deleted"], 2)
		self.assertEqual(result["actions"][0]["repeat_count"], 3)
		set_value.assert_not_called()
		delete_doc.assert_not_called()

	def test_scope_and_legacy_naming(self):
		self.assertEqual(_scope_of("Patient Visit"), SCOPE_VISITS)
		self.assertEqual(_scope_of("Inpatient Admission"), SCOPE_INPATIENT)
		self.assertEqual(_scope_of(""), "other")
		self.assertTrue(_looks_like_legacy_import(["135634"]))
		self.assertFalse(_looks_like_legacy_import(["135634", "CN-42225"]))
		self.assertFalse(_looks_like_legacy_import([]))

	def test_signature_can_ignore_the_posting_time(self):
		early = _member("CN-1", "1", posting_date="2023-12-21 00:00:00")
		late = _member("CN-1", "1", posting_date="2023-12-21 09:30:00")

		self.assertNotEqual(_signature(early, True), _signature(late, True))
		self.assertEqual(_signature(early, False), _signature(late, False))

	def test_note_preview_flattens_html(self):
		self.assertEqual(_note_preview("<p>Stable<br>and well</p>"), "Stable and well")


