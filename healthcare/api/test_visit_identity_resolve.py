# Copyright (c) 2026, Healthcare contributors
# See license.txt

from unittest.mock import patch

from frappe.tests import UnitTestCase

from healthcare.api.visit_diagnosis_sync import (
	_resolve_patient_visit,
	_resolve_patient_visit_by_identity,
)


class TestVisitIdentityResolve(UnitTestCase):
	"""When OP sync skips an Oracle visit as a duplicate, still resolve that ERPNext visit."""

	def test_identity_match_uses_legacy_visit_type_code(self):
		with patch(
			"healthcare.api.visit_diagnosis_sync.frappe.db.exists",
			side_effect=lambda dt, name=None, **kwargs: True
			if dt == "Patient" or dt == "DocType"
			else False,
		), patch(
			"healthcare.api.visit_diagnosis_sync.frappe.get_meta",
			side_effect=lambda dt: type(
				"M",
				(),
				{
					"has_field": lambda self, field: field
					in (
						{"old_visit_type_", "visit_type"}
						if dt == "Patient Visit"
						else {"legacy_code"}
					),
				},
			)(),
		), patch(
			"healthcare.api.visit_diagnosis_sync.frappe.db.get_value",
			side_effect=lambda *args, **kwargs: None,
		), patch(
			"healthcare.api.visit_diagnosis_sync.frappe.db.sql",
			return_value=[("1005338",)],
		):
			matched = _resolve_patient_visit_by_identity(
				"862361", "2026-10-29", "2"
			)
		self.assertEqual(matched, "1005338")

	def test_oracle_row_identity_fallback_when_case_no_missing(self):
		calls = {"remember": None}

		def fake_exists(dt, name=None, **kwargs):
			if dt == "Patient":
				return True
			if dt == "Patient Visit" and name == "859435":
				return False
			if dt == "DocType":
				return True
			return False

		def fake_get_value(dt, filters=None, fieldname="name", **kwargs):
			# No exact case_no / old_trans_num hit.
			return None

		with patch(
			"healthcare.api.visit_diagnosis_sync.frappe.db.exists", side_effect=fake_exists
		), patch(
			"healthcare.api.visit_diagnosis_sync.frappe.get_meta",
			side_effect=lambda dt: type(
				"M",
				(),
				{
					"has_field": lambda self, field: field
					in (
						{"case_no", "name", "old_trans_num", "old_visit_type_", "visit_type"}
						if dt == "Patient Visit"
						else {"legacy_code"}
					),
				},
			)(),
		), patch(
			"healthcare.api.visit_diagnosis_sync.frappe.db.get_value",
			side_effect=fake_get_value,
		), patch(
			"healthcare.api.visit_diagnosis_sync.frappe.db.sql",
			return_value=[("1005338",)],
		), patch(
			"healthcare.api.visit_diagnosis_sync._remember_oracle_visit_number",
			side_effect=lambda visit, num: calls.__setitem__("remember", (visit, num)),
		), patch(
			"healthcare.api.visit_diagnosis_sync.normalize_legacy_id",
			side_effect=lambda v: str(v).strip() if v else "",
		):
			matched = _resolve_patient_visit(
				"859435",
				"862361",
				oracle_row={
					"VISIT_NUM": "859435",
					"VISIT_DATE": "2026-10-29",
					"VISIT_TYPE_NUM": "2",
				},
				link_duplicate=True,
			)
		self.assertEqual(matched, "1005338")
		self.assertEqual(calls["remember"], ("1005338", "859435"))
