# Copyright (c) 2026, Healthcare contributors
# See license.txt

from frappe.tests import IntegrationTestCase

from healthcare.api.op_prescription_cleanup import (
	_build_his_plan,
	_build_import_plan,
	_format_message,
	_limit_his_plan,
	_normalize_code,
	_row_signature,
	_sheet_prescrip_ids,
	_source_file_stem,
)


def _visit(visit_cd: str, *prescrip_ids: str) -> dict:
	return {
		"visit_cd": visit_cd,
		"patient_file_no": "P1",
		"lines": [
			{"prescrip_id": prescrip_id, "medicine_cd": "5", "frequency": "HS"}
			for prescrip_id in prescrip_ids
		],
	}


def _covered(normal_pmos=None, children=None, his_pmos=None) -> dict:
	return {
		"normal_pmos": normal_pmos or [],
		"normal_children": children or [],
		"his_pmos": his_pmos or {},
	}


class TestOpPrescriptionCleanupPlan(IntegrationTestCase):
	"""Plan builders of the OP prescription reconciliation (PATIENT_VISIT_PRESCRIPTION).

	The importer itself is covered by the data migration tests; these tests pin the
	classification of a visit (missing / partial / complete) and which ``PVP_HIS`` lines are
	considered rebuildable, because they decide what the cleanup is allowed to delete.
	"""

	def test_source_file_stem_recognises_hashed_uploads(self):
		self.assertEqual(_source_file_stem("PATIENT_VISIT_PRESCRIPTION.xlsx"), "patientvisitprescription")
		self.assertEqual(
			_source_file_stem("PATIENT_VISIT_PRESCRIPTION3ad06b3ad06b.xlsx"),
			"patientvisitprescription",
		)
		self.assertEqual(
			_source_file_stem("/files/PATIENT_VISIT_PRESCRIPTION (1).xls"),
			"patientvisitprescription1",
		)
		# The re-prescription log must never be taken for the normal OP source.
		self.assertNotEqual(
			_source_file_stem("PATIENT_VISIT_PRESCRIPTION_HIS.xlsx"),
			"patientvisitprescription",
		)

	def test_row_signature_ignores_zero_padding(self):
		self.assertEqual(_row_signature("0166879", "0509494"), "166879|509494")
		self.assertEqual(_row_signature(166879, 509494), "166879|509494")
		self.assertEqual(_row_signature(None, "583"), "|583")
		self.assertEqual(_normalize_code("0000"), "0")

	def test_sheet_prescrip_ids_skips_blank_ids(self):
		payload = _visit("1", "10", "11")
		payload["lines"].append({"prescrip_id": None, "medicine_cd": "5"})
		self.assertEqual(_sheet_prescrip_ids(payload), {"10", "11"})

	def test_visit_without_prescription_is_created(self):
		grouped = {"1": _visit("1", "10", "11")}
		coverage = {"1": _covered()}

		imports, stats = _build_import_plan(grouped, coverage)

		self.assertEqual(stats["missing_visits"], 1)
		self.assertEqual(stats["missing_lines"], 2)
		self.assertEqual(stats["complete_visits"], 0)
		self.assertEqual(len(imports), 1)
		self.assertEqual(imports[0]["mode"], "create")
		self.assertEqual(len(imports[0]["rows"]), 2)

	def test_complete_visit_is_left_alone(self):
		grouped = {"1": _visit("1", "10", "11")}
		coverage = {
			"1": _covered(
				normal_pmos=["PMO-1"],
				children=[
					{"name": "c1", "prescrip_id": "10", "medicine_no": "5"},
					{"name": "c2", "prescrip_id": "11", "medicine_no": "5"},
				],
			)
		}

		imports, stats = _build_import_plan(grouped, coverage)

		self.assertEqual(imports, [])
		self.assertEqual(stats["complete_visits"], 1)

	def test_partial_visit_appends_only_the_missing_lines(self):
		grouped = {"1": _visit("1", "10", "11")}
		coverage = {
			"1": _covered(
				normal_pmos=["PMO-1"],
				children=[{"name": "c1", "prescrip_id": "10", "medicine_no": "5"}],
			)
		}

		imports, stats = _build_import_plan(grouped, coverage)

		self.assertEqual(stats["partial_visits"], 1)
		self.assertEqual(stats["partial_lines"], 1)
		self.assertEqual(imports[0]["mode"], "append")
		self.assertEqual(imports[0]["pmo"], "PMO-1")
		self.assertEqual([row["prescrip_id"] for row in imports[0]["rows"]], ["11"])

	def test_his_line_duplicating_a_normal_line_is_deleted(self):
		grouped = {"1": _visit("1", "10", "11")}
		coverage = {
			"1": _covered(
				normal_pmos=["PMO-1"],
				children=[
					{"name": "c1", "prescrip_id": "10", "medicine_no": "5"},
					{"name": "c2", "prescrip_id": "11", "medicine_no": "5"},
				],
				his_pmos={
					"HIS-1": [
						{"name": "h1", "prescrip_id": "10"},
						{"name": "h2", "prescrip_id": "10"},
					]
				},
			)
		}

		plan = _build_his_plan(grouped, coverage, imports=[])

		self.assertEqual(plan["pmos"], 1)
		self.assertEqual(plan["lines"], 2)
		self.assertEqual([child for _pmo, child in plan["delete"]], ["h1", "h2"])
		self.assertEqual(plan["cancel"], ["HIS-1"])
		self.assertEqual(plan["kept_lines"], 0)

	def test_his_line_that_cannot_be_rebuilt_is_kept(self):
		grouped = {"1": _visit("1", "10")}
		coverage = {
			"1": _covered(
				normal_pmos=["PMO-1"],
				children=[{"name": "c1", "prescrip_id": "10", "medicine_no": "5"}],
				his_pmos={
					"HIS-1": [
						{"name": "h1", "prescrip_id": "10"},
						{"name": "h2", "prescrip_id": "99"},
					]
				},
			)
		}

		plan = _build_his_plan(grouped, coverage, imports=[])

		self.assertEqual([child for _pmo, child in plan["delete"]], ["h1"])
		self.assertEqual(plan["kept_lines"], 1)
		self.assertEqual(plan["cancel"], [])

	def test_his_lines_of_a_visit_being_rebuilt_are_all_deleted(self):
		grouped = {"2": _visit("2", "20", "21")}
		coverage = {
			"2": _covered(his_pmos={"HIS-2": [{"name": "h1", "prescrip_id": "20"}]}),
		}
		imports, _stats = _build_import_plan(grouped, coverage)

		plan = _build_his_plan(grouped, coverage, imports)

		self.assertEqual([child for _pmo, child in plan["delete"]], ["h1"])
		self.assertEqual(plan["cancel"], ["HIS-2"])

	def test_his_prescription_without_lines_is_cancelled(self):
		grouped = {"1": _visit("1", "10")}
		coverage = {"1": _covered(normal_pmos=["PMO-1"], children=[], his_pmos={"HIS-1": []})}

		plan = _build_his_plan(grouped, coverage, imports=[])

		self.assertEqual(plan["delete"], [])
		self.assertEqual(plan["cancel"], ["HIS-1"])

	def test_limit_his_plan_keeps_only_the_selected_visits(self):
		plan = {
			"delete": [("PMO-1", "c1"), ("PMO-2", "c2")],
			"cancel": ["PMO-1", "PMO-2"],
			"delete_by_visit": {"1": [("PMO-1", "c1")], "2": [("PMO-2", "c2")]},
			"cancel_by_visit": {"1": ["PMO-1"], "2": ["PMO-2"]},
		}

		limited = _limit_his_plan(plan, {"2"})

		self.assertEqual(limited["delete"], [("PMO-2", "c2")])
		self.assertEqual(limited["cancel"], ["PMO-2"])

	def test_dry_run_message_reports_the_plan(self):
		plan = {
			"file_url": "/files/PATIENT_VISIT_PRESCRIPTION.xlsx",
			"scope_patient": "849995",
			"source_visits": 98,
			"source_lines": 402,
			"complete_visits": 88,
			"missing_visits": 10,
			"missing_lines": 69,
			"partial_visits": 0,
			"partial_lines": 0,
			"his_pmos": 7,
			"his_lines": 74,
			"his_duplicate_lines": 74,
			"his_pmos_to_cancel": 7,
			"his_lines_kept": 0,
			"unresolved_visits": 0,
		}

		message = _format_message(plan, None)

		self.assertIn("dry run", message)
		self.assertIn("849995", message)
		self.assertIn("10 (69 lines)", message)
		self.assertIn("Duplicate PVP_HIS lines to delete: 74", message)
