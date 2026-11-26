"""Isolated admission quotation inclusion regressions; no database writes."""

import ast
import copy
from itertools import product
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

import frappe
from frappe.utils import cint, flt

from healthcare.api.test_package_change_quotation import Doc


class StoredDoc(Doc):
    def save(self, **kwargs):
        self.store.update(copy.deepcopy(dict(self)))


class AdmissionQuotationInclusionsTest(unittest.TestCase):
    def setUp(self):
        self.package = Doc(package_name="TEST-PACKAGE", package_rate=80, cost_center=None,
            custom_include_lab_tests=1, custom_include_observation=1,
            include_therapy_sessions=0, include_consultations=0)
        self.admission = Doc(name="TEST-ADM", patient="TEST-PATIENT", company="TEST-COMPANY")
        self.quotation = StoredDoc(name="TEST-Q", docstatus=0, items=[], custom_additional_services=[])
        self.store = {}
        object.__setattr__(self.quotation, "store", self.store)
        self.db = MagicMock()
        self.db.get_value.side_effect = lambda dt, *args, **kwargs: "TEST-CUSTOMER" if dt == "Patient" else None
        self.enabled = True
        self.frappe = SimpleNamespace(db=self.db, get_doc=self.get_doc,
            new_doc=lambda dt: self.quotation, throw=lambda message: self.fail(message), get_all=MagicMock())
        self.env = dict(frappe=self.frappe, cint=cint, flt=flt, _=lambda text: text,
            getdate=lambda: "2026-11-25", is_enhanced_workflow_enabled=lambda: self.enabled,
            _resolve_quotation_service_unit=lambda *a, **k: "TEST-ROOM",
            _resolve_package_quotation_item=lambda *a, **k: dict(item_code="ROOM", item_name="Room", room_label="Room", type_label="Room"),
            _inpatient_package_daily_rate=lambda package: package.package_rate,
            _combine_admission_and_case_management=lambda: False,
            _parse_admission_other_services=lambda services, package=None: list(dict.fromkeys(services or [])),
            _set_quotation_additional_services=lambda q, services: q.update(custom_additional_services=[Doc(healthcare_service_template=s) for s in services]),
            _active_admission_quotation_filters=lambda *a: {})
        source = Path(__file__).with_name("inpatient_admission.py").read_text()
        functions = [node for node in ast.parse(source).body if isinstance(node, ast.FunctionDef)
            and node.name in {"create_admission_quotation", "update_admission_quotation_other_services", "check_admission_quotation"}]
        for node in functions:
            node.decorator_list = []
        exec(compile(ast.Module(body=functions, type_ignores=[]), "inpatient_admission.py", "exec"), self.env)
        patcher = patch("healthcare.api.room_package_pricing.preserve_room_rate_precision")
        patcher.start()
        self.addCleanup(patcher.stop)

    def get_doc(self, doctype, name):
        return {"Inpatient Package": self.package, "Inpatient Admission": self.admission,
            "Quotation": self.quotation}[doctype]

    def create(self):
        return self.env["create_admission_quotation"]("TEST-ADM", "TEST-PACKAGE", 7, 560,
            other_services=["SERVICE-X"])

    def reopen(self):
        self.quotation = StoredDoc(**copy.deepcopy(self.store))
        object.__setattr__(self.quotation, "store", self.store)
        self.db.get_value.side_effect = None
        self.db.get_value.return_value = Doc(name="TEST-Q", docstatus=self.quotation.docstatus)
        return self.env["check_admission_quotation"]("TEST-ADM", "TEST-PACKAGE")

    def test_creation_and_reopen_all_four_combinations(self):
        for therapy, consultations in product((0, 1), repeat=2):
            with self.subTest(therapy=therapy, consultations=consultations):
                self.setUpCombination(therapy, consultations)
                self.create()
                result = self.reopen()
                self.assertEqual(result["include_therapy_sessions"], therapy)
                self.assertEqual(result["include_consultations"], consultations)
                self.assertEqual(result["include_lab_tests"], 1)
                self.assertEqual(result["include_observation"], 1)
                self.assertEqual(result["other_services"], ["SERVICE-X"])
                self.assertEqual(self.package.include_therapy_sessions, therapy)
                self.assertEqual(self.package.include_consultations, consultations)

    def setUpCombination(self, therapy, consultations):
        self.package.include_therapy_sessions = therapy
        self.package.include_consultations = consultations
        self.quotation = StoredDoc(name="TEST-Q", docstatus=0, items=[], custom_additional_services=[])
        object.__setattr__(self.quotation, "store", self.store)
        self.db.get_value.side_effect = lambda dt, *a, **k: "TEST-CUSTOMER" if dt == "Patient" else None

    def test_draft_update_persists_explicit_false_and_preserves_package(self):
        self.package.include_therapy_sessions = 1
        self.create()
        self.db.get_value.side_effect = None
        self.db.get_value.return_value = "TEST-Q"
        self.env["update_admission_quotation_other_services"]("TEST-ADM", "TEST-PACKAGE", ["SERVICE-X"],
            include_therapy_sessions=0, include_consultations=1)
        result = self.reopen()
        self.assertEqual(result["include_therapy_sessions"], 0)
        self.assertEqual(result["include_consultations"], 1)
        self.assertEqual(result["include_lab_tests"], 1)
        self.assertEqual(result["include_observation"], 1)
        self.assertEqual(self.package.include_therapy_sessions, 1)
        self.assertEqual(self.package.include_consultations, 0)

    def test_existing_creation_path_preserves_quotation_specific_settings(self):
        self.package.include_therapy_sessions = 1
        self.create()
        self.quotation.custom_include_therapy_sessions = 0
        self.quotation.custom_include_consultations = 1
        self.db.get_value.side_effect = lambda dt, *a, **k: "TEST-CUSTOMER" if dt == "Patient" else "TEST-Q"
        self.create()
        self.assertEqual(self.quotation.custom_include_therapy_sessions, 0)
        self.assertEqual(self.quotation.custom_include_consultations, 1)

    def test_omitted_update_flags_preserve_saved_values(self):
        self.package.include_therapy_sessions = self.package.include_consultations = 1
        self.create()
        self.db.get_value.side_effect = None
        self.db.get_value.return_value = "TEST-Q"
        self.env["update_admission_quotation_other_services"]("TEST-ADM", "TEST-PACKAGE", ["SERVICE-X"])
        self.assertEqual(self.quotation.custom_include_therapy_sessions, 1)
        self.assertEqual(self.quotation.custom_include_consultations, 1)

    def test_submitted_update_is_rejected_without_save(self):
        self.quotation.docstatus = 1
        self.db.get_value.side_effect = None
        self.db.get_value.return_value = "TEST-Q"
        self.frappe.throw = MagicMock(side_effect=ValueError)
        with self.assertRaises(ValueError):
            self.env["update_admission_quotation_other_services"]("TEST-ADM", "TEST-PACKAGE", [], include_consultations=1)
        self.assertEqual(self.store, {})

    def test_legacy_creation_does_not_enable_inclusions(self):
        self.enabled = False
        self.package.include_therapy_sessions = self.package.include_consultations = 1
        self.create()
        self.assertFalse(self.quotation.get("custom_include_therapy_sessions"))
        self.assertFalse(self.quotation.get("custom_include_consultations"))


if __name__ == "__main__":
    unittest.main()
