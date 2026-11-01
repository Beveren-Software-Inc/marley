# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase
from unittest.mock import patch

from healthcare.api.prescription_type_mapping import (
	CACHE_KEY,
	apply_resolved_prescription_type,
	clear_redundancy_type_cache,
	get_redundancy_type_map,
	inactive_type,
	is_legacy_line_discontinued,
	is_legacy_prescription_line,
	map_redundancy_type,
	resolve_prescription_type,
)

LEGACY_CODE = 9871


class TestPrescriptionTypeMapping(IntegrationTestCase):
	"""Legacy Oracle lines only carry ``redundancy_type`` (no Prescription Type).

	The ``Prescription Type`` doctype is the mapping used to display / group those
	lines; nothing is written back to the prescription line. These tests cover the
	resolution order (coded type wins) and the cache invalidation hooks.
	"""

	def setUp(self):
		clear_redundancy_type_cache()
		# Unique per test method: ``prescription_type`` is the doc name, so reusing a name
		# collides with records left behind by the previous test on the same site.
		suffix = self._testMethodName
		self.type_a = f"AA Test Legacy A {suffix}"
		self.type_b = f"AA Test Legacy B {suffix}"
		self.addCleanup(clear_redundancy_type_cache)
		self.addCleanup(self._delete_mappings)

	def _delete_mappings(self):
		for name in (self.type_a, self.type_b):
			frappe.delete_doc(
				"Prescription Type", name, ignore_permissions=True, force=True, ignore_missing=True
			)

	def _mapping(self, prescription_type: str | None = None):
		return frappe.get_doc(
			{
				"doctype": "Prescription Type",
				"prescription_type": prescription_type or self.type_a,
				"redundancy_type": LEGACY_CODE,
			}
		).insert(ignore_permissions=True)

	def test_maps_legacy_code_through_prescription_type(self):
		self._mapping()

		self.assertEqual(map_redundancy_type(LEGACY_CODE), self.type_a)
		# Codes arrive from Oracle as strings in imported rows.
		self.assertEqual(map_redundancy_type(str(LEGACY_CODE)), self.type_a)

	def test_unknown_and_blank_codes_map_to_nothing(self):
		self.assertEqual(map_redundancy_type(None), "")
		self.assertEqual(map_redundancy_type(""), "")
		self.assertEqual(map_redundancy_type("not-a-code"), "")
		self.assertEqual(map_redundancy_type(LEGACY_CODE), "")

	def test_coded_medication_type_wins_over_legacy_code(self):
		self._mapping()

		self.assertEqual(resolve_prescription_type("STAT", LEGACY_CODE), "STAT")
		self.assertEqual(resolve_prescription_type("", LEGACY_CODE), self.type_a)
		self.assertEqual(resolve_prescription_type(None, LEGACY_CODE), self.type_a)

	def test_allowed_filter_drops_types_the_target_doctype_does_not_offer(self):
		self._mapping()

		self.assertEqual(resolve_prescription_type("", LEGACY_CODE, allowed={self.type_a}), self.type_a)
		self.assertEqual(resolve_prescription_type("", LEGACY_CODE, allowed={"STAT"}), "")
		# An explicit coded value is never filtered — it is already stored on the line.
		self.assertEqual(
			resolve_prescription_type("Contraindicated", LEGACY_CODE, allowed={"STAT"}), "Contraindicated"
		)

	def test_saving_the_mapping_clears_the_cached_map(self):
		mapping = self._mapping()
		self.assertEqual(get_redundancy_type_map().get(LEGACY_CODE), self.type_a)
		self.assertTrue(frappe.cache.get_value(CACHE_KEY), "map should be cached after the first read")

		# ``on_update`` clears the cache, so the new code is resolved immediately.
		mapping.redundancy_type = LEGACY_CODE + 1
		mapping.save(ignore_permissions=True)

		self.assertFalse(frappe.cache.get_value(CACHE_KEY), "saving must drop the cached map")
		self.assertEqual(map_redundancy_type(LEGACY_CODE + 1), self.type_a)
		self.assertEqual(map_redundancy_type(LEGACY_CODE), "")

	def test_trashing_the_mapping_drops_the_resolved_type(self):
		mapping = self._mapping()
		self.assertEqual(map_redundancy_type(LEGACY_CODE), self.type_a)

		mapping.delete(ignore_permissions=True)

		self.assertNotIn(LEGACY_CODE, get_redundancy_type_map())
		self.assertEqual(map_redundancy_type(LEGACY_CODE), "")

	def test_apply_sets_resolved_type_on_rows(self):
		self._mapping()
		rows = [
			frappe._dict(medication_type="", redundancy_type=str(LEGACY_CODE)),
			frappe._dict(medication_type="STAT", redundancy_type=LEGACY_CODE),
			frappe._dict(medication_type="", redundancy_type=None),
		]

		apply_resolved_prescription_type(rows)

		self.assertEqual(
			[row["resolved_prescription_type"] for row in rows],
			[self.type_a, "STAT", ""],
		)

	def test_apply_ignores_empty_input(self):
		self.assertEqual(apply_resolved_prescription_type([]), [])
		self.assertEqual(apply_resolved_prescription_type(None), None)

	def test_legacy_line_without_a_redundancy_code_resolves_to_nothing(self):
		"""A missing code is not a Regular prescription — the type stays blank."""
		self._mapping()

		self.assertEqual(resolve_prescription_type("", None), "")
		self.assertEqual(resolve_prescription_type("", ""), "")
		# A code the mapping does not know is blank too.
		self.assertEqual(resolve_prescription_type("", LEGACY_CODE + 500), "")

	def test_dc_note_marks_a_legacy_line_discontinued(self):
		# Oracle's ``dc`` column is a free-text end note — the real values on site include
		# "CHANGED", "dose increased", "by.Dr.AK" and bare dates, not just "DC".
		for dc in (
			"DC",
			"DC by: ABRAR",
			"DC 3/10/2016",
			"D/c",
			"d/c by nurse",
			"stopped",
			"discontinued",
			"CHANGED",
			"increased",
			"decreased",
			"DOSE INCREASED",
			"Dose decreased",
			"by.Dr.AK",
			"29/1/2017",
			"3.2.2016 gradual",
			"once daily",
		):
			self.assertTrue(is_legacy_line_discontinued({"dc": dc}), dc)
		# Blank / placeholder values are not a DC note.
		for dc in (None, "", "  ", "-", "--", ".", "0", "no", "n/a", "none"):
			self.assertFalse(is_legacy_line_discontinued({"dc": dc}), dc)
		# The Select status is an explicit discontinuation as well.
		self.assertTrue(is_legacy_line_discontinued({"medication_status": "Discontinued"}))
		self.assertFalse(is_legacy_line_discontinued({"medication_status": "Active"}))
		self.assertFalse(is_legacy_line_discontinued(None))

	def test_oracle_line_with_a_dc_note_is_inactive_even_without_the_legacy_flag(self):
		"""PMO 2810 style: legacy = 0, redundancy_type 2, empty medication_type, dc note."""
		with patch(
			"healthcare.api.prescription_type_mapping.get_redundancy_type_map",
			return_value={2: "Regular - Med (Active)"},
		):
			row = frappe._dict(
				legacy=0,
				medication_type="",
				redundancy_type="2",
				dc="DOSE INCREASED",
			)
			apply_resolved_prescription_type([row])

		self.assertEqual(row["resolved_prescription_type"], "Regular - Med (Inactive)")
		self.assertEqual(row["is_legacy_line"], 1)

	def test_inactive_type_is_the_twin_of_a_regular_type(self):
		self.assertEqual(inactive_type("Regular - Med (Active)"), "Regular - Med (Inactive)")
		self.assertEqual(inactive_type("Regular - Psy (Active)"), "Regular - Psy (Inactive)")
		# Already inactive / non-Regular types are left alone.
		self.assertEqual(inactive_type("Regular - Med (Inactive)"), "Regular - Med (Inactive)")
		self.assertEqual(inactive_type("STAT"), "STAT")
		self.assertEqual(inactive_type(""), "")

	def test_dc_legacy_line_resolves_to_the_inactive_twin(self):
		mapping = {1: "STAT", 2: "Regular - Med (Active)", 3: "PRN", 5: "Regular - Psy (Active)"}
		with patch(
			"healthcare.api.prescription_type_mapping.get_redundancy_type_map",
			return_value=mapping,
		):
			# DC'd Regular lines were stopped → Inactive.
			self.assertEqual(
				resolve_prescription_type("", 2, discontinued=True), "Regular - Med (Inactive)"
			)
			self.assertEqual(
				resolve_prescription_type("", 5, discontinued=True), "Regular - Psy (Inactive)"
			)
			# Without the DC the mapped Active type is unchanged.
			self.assertEqual(resolve_prescription_type("", 2), "Regular - Med (Active)")
			self.assertEqual(resolve_prescription_type("", 5), "Regular - Psy (Active)")
			# STAT / PRN have no Inactive twin.
			self.assertEqual(resolve_prescription_type("", 1, discontinued=True), "STAT")
			self.assertEqual(resolve_prescription_type("", 3, discontinued=True), "PRN")
			# A coded Prescription Type on the line always wins over the DC rewrite.
			self.assertEqual(
				resolve_prescription_type("Regular - Med (Active)", 2, discontinued=True),
				"Regular - Med (Active)",
			)

	def test_apply_marks_legacy_lines_and_dc_lines_inactive(self):
		mapping = {2: "Regular - Med (Active)", 5: "Regular - Psy (Active)"}
		with patch(
			"healthcare.api.prescription_type_mapping.get_redundancy_type_map",
			return_value=mapping,
		):
			rows = [
				frappe._dict(medication_type="", redundancy_type="2", dc="DC by: ABRAR"),
				frappe._dict(medication_type="", redundancy_type="5", dc=""),
				frappe._dict(medication_type="", redundancy_type=None, dc=None),
				frappe._dict(medication_type="PRN", redundancy_type=None, medicine_no="500203"),
			]

			apply_resolved_prescription_type(rows)

		self.assertEqual(
			[(row["resolved_prescription_type"], row["is_legacy_line"]) for row in rows],
			[
				("Regular - Med (Inactive)", 1),
				("Regular - Psy (Active)", 1),
				("", 0),
				# A coded Prescription Type means the line is typed, not an untyped import.
				("PRN", 0),
			],
		)

	def test_is_legacy_prescription_line(self):
		# An Oracle marker plus no coded Prescription Type — the PMO ``legacy`` flag is not
		# needed (rows synced by the current import carry legacy = 0).
		self.assertTrue(is_legacy_prescription_line({"redundancy_type": "2"}))
		self.assertTrue(is_legacy_prescription_line({"redundancy_type": "2", "medication_type": ""}))
		self.assertTrue(is_legacy_prescription_line({"medicine_no": "500203"}))
		self.assertTrue(is_legacy_prescription_line({"old_medicine_code": "666"}))
		self.assertTrue(is_legacy_prescription_line({"trans_num": "60530"}))
		self.assertFalse(is_legacy_prescription_line({"medication_type": "STAT"}))
		# A coded type on an imported line makes it a typed line again.
		self.assertFalse(
			is_legacy_prescription_line({"redundancy_type": "2", "medication_type": "Regular - Med (Active)"})
		)
		self.assertFalse(is_legacy_prescription_line({"redundancy_type": "", "medicine_no": " "}))
		self.assertFalse(is_legacy_prescription_line(None))
