"""Isolated package-change/charging regressions with in-memory records only."""

import ast
import copy
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import frappe
from frappe.utils import cint, cstr, flt, getdate

from healthcare.api import package_change_history as history
from healthcare.api import package_change_quotation as change_quotes
from healthcare.api import package_charge_to_today as charges
from healthcare.api import room_package_pricing as pricing


class Record(frappe._dict):
    def check_permission(self, permission):
        pass

    def save(self, **kwargs):
        pass


class PackageChangesTest(unittest.TestCase):
    def setUp(self):
        rounding = patch.object(
            frappe, "get_system_settings", return_value="Commercial Rounding"
        )
        rounding.start()
        self.addCleanup(rounding.stop)
        self.admission = Record(
            name="ISOLATED-ADMISSION",
            company="Serene",
            patient="ISOLATED-PATIENT",
            patient_name="Test Patient",
            status="Admitted",
            inpatient_package="Triple",
            standard_package=1,
            package_pricing_mode="Daily",
            rate_per_day=80,
            admission_date="2026-11-01",
            admission_service_unit_type="Triple Sharing",
        )
        self.comments = []
        self.ledger = [
            Record(
                name="OLD-DETAIL",
                from_date=getdate("2026-11-01"),
                to_date=getdate("2026-11-02"),
                total_days=2,
                transaction_amount=160,
                amount_per_day=80,
                inpatient_package="Triple",
            )
        ]
        self.orders = [Record(name="OLD-SO", rate=80, qty=2, amount=160, docstatus=1)]
        self.invoice = Record(name="OLD-SI", rate=80, qty=2, amount=160, docstatus=1)
        self.original = copy.deepcopy((self.ledger[0], self.orders[0], self.invoice))
        self.packages = {}
        for name, rate, week, month in [
            ("Triple", 80, 970, 2870),
            ("Double", 110, 1040, 3110),
        ]:
            self.packages[name] = Record(
                name=name,
                package_name=name,
                package_category=name,
                company="Serene",
                active=1,
                package_rate=rate,
                no_of_days=7,
                duration_pricing=[
                    Record(from_day=1, to_day=7, amount=week),
                    Record(from_day=1, to_day=30, amount=month),
                ],
            )
        self.admission.add_comment = self._comment
        self.db = MagicMock()
        self.db.exists.side_effect = self._exists
        self.db.has_column.return_value = True
        self.db.get_value.return_value = self.admission.name
        patches = [
            patch.object(frappe, "db", self.db, create=True),
            patch.object(frappe, "get_doc", side_effect=self._get_doc),
            patch.object(frappe, "get_all", side_effect=self._get_all),
            patch.object(frappe, "new_doc", side_effect=self._new_doc),
            patch.object(
                change_quotes,
                "create_package_change_quotation",
                return_value={
                    "new_quotation": "CHANGED-Q",
                    "source_quotation": "BASE-Q",
                    "planned_days": 7,
                    "quotation_days": 5,
                },
            ),
            patch.object(
                charges, "_find_admission_package_quotation", return_value=None
            ),
            patch.object(frappe, "throw", side_effect=ValueError),
            patch.object(pricing, "_", side_effect=lambda text: text),
            patch.object(charges, "_", side_effect=lambda text: text),
        ]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)
        # Execute the actual endpoint without importing unrelated API modules.
        source = Path(__file__).with_name("inpatient_admission.py").read_text()
        fn = next(
            n
            for n in ast.parse(source).body
            if isinstance(n, ast.FunctionDef) and n.name == "change_admission_package"
        )
        fn.decorator_list = []
        env = {
            "frappe": frappe,
            "cstr": cstr,
            "cint": cint,
            "flt": flt,
            "_": lambda text: text,
            "_assert_can_change_admission_package": MagicMock(),
            "assert_editing_allowed": MagicMock(),
            "_admission_package_is_editable": lambda doc: doc.status
            in ("Admitted", "Discharge Scheduled"),
            "_resolve_admission_package": lambda doc: (
                doc.inpatient_package or "",
                "admission",
            ),
            "_package_display_name": lambda name: name,
            "_sync_active_package_enrollment": MagicMock(),
            "get_admission_package_details": lambda name: {
                "admission": self.admission,
                "package_changes": history.get_package_changes(name),
            },
        }
        exec(
            compile(
                ast.Module(body=[fn], type_ignores=[]),
                str(Path(__file__).with_name("inpatient_admission.py")),
                "exec",
            ),
            env,
        )
        self.change = env["change_admission_package"]

    def _exists(self, doctype, filters):
        if doctype == "Comment":
            return bool(self.comments)
        if doctype == "Package Detail":
            return any(
                row.get("sales_order") == filters.get("sales_order")
                for row in self.ledger
            )
        return True

    def _get_doc(self, doctype, name):
        if doctype == "Inpatient Admission":
            return self.admission
        if doctype == "Inpatient Package":
            return self.packages[name]
        raise AssertionError("Unexpected document access: " + doctype)

    def _get_all(self, doctype, **kwargs):
        if doctype == "Comment":
            return list(reversed(self.comments))
        if doctype == "Inpatient Package":
            return list(self.packages.values())
        raise AssertionError("Unexpected list access: " + doctype)

    def _comment(self, comment_type, text):
        row = Record(
            name="COMMENT-" + str(len(self.comments) + 1),
            content=text,
            creation="2026-11-24 12:00:" + str(len(self.comments)).zfill(2),
            owner="tester@example.com",
            comment_email="tester@example.com",
        )
        self.comments.append(row)
        return row

    def _new_doc(self, doctype):
        self.assertEqual(doctype, "Package Detail")
        row = Record(meta=SimpleNamespace(has_field=lambda name: True))
        row.insert = lambda **kwargs: self.ledger.append(row)
        return row

    def _charge(self, date, discharge=False):
        quote = Record(
            name="HISTORICAL-Q", docstatus=1, company="Serene", currency="BHD"
        )
        quote["items"] = [
            Record(
                name="Q-ITEM",
                rate=999,
                qty=30,
                description="Inpatient Package",
                item_code="ROOM",
            )
        ]
        stub = SimpleNamespace(_resolve_quotation_service_unit=lambda name: None)

        def order(admission, **kwargs):
            row = Record(
                name="NEW-SO-" + str(len(self.orders)),
                rate=kwargs["amount_per_day"],
                qty=kwargs["days_to_charge"],
                amount=flt(kwargs["amount_per_day"] * kwargs["days_to_charge"], 2),
                docstatus=1,
            )
            self.orders.append(row)
            return row.name

        with (
            patch.dict(sys.modules, {"healthcare.api.inpatient_admission": stub}),
            patch.object(
                charges,
                "_days_already_billed",
                side_effect=lambda *args: sum(r.total_days for r in self.ledger),
            ),
            patch.object(
                charges,
                "_last_package_billed_to_date",
                side_effect=lambda *args: max(r.to_date for r in self.ledger),
            ),
            patch.object(
                charges, "_find_admission_package_quotation", return_value=quote
            ),
            patch.object(charges, "_package_line_ordered_qty", return_value=0),
            patch.object(
                charges,
                "_package_charge_item",
                return_value={"item_code": "ROOM", "item_name": "Room"},
            ),
            patch.object(charges, "_ms_catch_up_window", return_value={}),
            patch.object(
                charges, "_make_standalone_package_sales_order", side_effect=order
            ),
            patch.object(charges, "_sync_admission_days_billed"),
        ):
            if discharge:
                return charges.charge_pending_package_days_for_admission(
                    self.admission.name, as_of=date
                )
            return charges._charge_package_days(
                self.admission.name, as_of=date, throw_if_nothing=False
            )

    def test_daily_weekly_monthly_daily_and_retained_history(self):
        for mode in ["Weekly", "Monthly", "Daily"]:
            self.change(self.admission.name, "Triple", pricing_mode=mode)
        rows = history.get_package_changes(self.admission.name)
        self.assertEqual(len(rows), 3)
        self.assertEqual([r["new_mode"] for r in rows], ["Daily", "Monthly", "Weekly"])
        self.assertEqual(rows[-1]["previous_mode"], "Daily")
        self.assertAlmostEqual(rows[-1]["new_rate"], 970 / 7)
        self.assertEqual(rows[0]["changed_by"], "tester@example.com")
        self.assertEqual(self.admission.rate_per_day, 80)
        self.db.get_value.assert_any_call(
            "Inpatient Admission", self.admission.name, "name", for_update=True
        )
        self.db.commit.assert_not_called()

    def test_history_records_every_change_when_same_draft_is_reused(self):
        result = {
            "new_quotation": "SAME-DRAFT",
            "source_quotation": "SAME-DRAFT",
            "planned_days": 7,
            "quotation_days": 5,
            "quotation_reused": True,
        }
        with patch.object(
            change_quotes, "create_package_change_quotation", return_value=result
        ):
            self.change(self.admission.name, "Triple", pricing_mode="Weekly")
            self.change(self.admission.name, "Triple", pricing_mode="Monthly")
        rows = history.get_package_changes(self.admission.name)
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(row["quotation_reused"] for row in rows))
        self.assertTrue(all(row["new_quotation"] == "SAME-DRAFT" for row in rows))
        self.assertEqual([row["new_mode"] for row in rows], ["Monthly", "Weekly"])

    def test_multiple_packages_and_history(self):
        self.change(self.admission.name, "Double", pricing_mode="Weekly")
        self.change(self.admission.name, "Triple", pricing_mode="Monthly")
        rows = history.get_package_changes(self.admission.name)
        self.assertEqual(rows[0]["previous_package"], "Double")
        self.assertEqual(rows[0]["new_package"], "Triple")
        self.assertEqual(len(rows), 2)

    def test_charge_extension_discharge_and_no_duplicate(self):
        self.change(self.admission.name, "Triple", pricing_mode="Weekly")
        first = self._charge("2026-11-07")
        self.assertEqual(first["days_charged"], 5)
        self.assertAlmostEqual(first["amount_per_day"], 970 / 7)
        self.assertEqual(first["amount"], 692.86)
        self.assertEqual(self.ledger[-1].transaction_amount, self.orders[-1].amount)
        self.assertEqual(self.ledger[-1]._precision["main"]["amount_per_day"], 9)
        self.assertIsNone(self._charge("2026-11-07"))
        second = self._charge("2026-11-09")
        self.assertEqual(second["days_charged"], 2)
        self.assertEqual(second["amount"], 277.14)
        final = self._charge("2026-11-10", discharge=True)
        self.assertEqual(final["days_charged"], 1)
        self.assertEqual(final["amount"], 138.57)
        self.assertIsNone(self._charge("2026-11-10", discharge=True))
        self.assertEqual((self.ledger[0], self.orders[0], self.invoice), self.original)

    def test_daily_uses_room_category_weekly_uses_selected_package(self):
        self.admission.admission_service_unit_type = "Double Sharing"
        self.change(self.admission.name, "Triple", pricing_mode="Weekly")
        self.assertAlmostEqual(self.admission.rate_per_day, 970 / 7)
        self.change(self.admission.name, "Triple", pricing_mode="Daily")
        self.assertEqual(self.admission.inpatient_package, "Triple")
        self.assertEqual(self.admission.rate_per_day, 110)

    def test_history_captures_previous_effective_quotation_rate(self):
        quote = Record(name="OLD-Q")
        quote["items"] = [Record(rate=999, description="Inpatient Package")]
        with patch.object(
            charges, "_find_admission_package_quotation", return_value=quote
        ):
            self.change(self.admission.name, "Triple", pricing_mode="Weekly")
        self.assertEqual(
            history.get_package_changes(self.admission.name)[0]["previous_rate"], 999
        )

    def test_history_displays_selected_period_prices_not_daily_rates(self):
        self.admission.package_pricing_mode = "Weekly"
        self.admission.rate_per_day = 80
        self.change(self.admission.name, "Double", pricing_mode="Weekly")
        row = history.get_package_changes(self.admission.name)[0]
        self.assertEqual(row["previous_package_price"], 970)
        self.assertEqual(row["new_package_price"], 1040)
        self.assertEqual(row["previous_rate"], 80)
        self.packages["Double"].duration_pricing[0].amount = 2000
        self.change(self.admission.name, "Triple", pricing_mode="Weekly")
        self.assertEqual(
            history.get_package_changes(self.admission.name)[0][
                "previous_package_price"
            ],
            1040,
        )

    def test_legacy_history_reads_current_prices_without_rewriting_comments(self):
        import json

        payload = {
            "event": history.EVENT,
            "admission": self.admission.name,
            "previous_package": "Triple",
            "previous_mode": "Weekly",
            "previous_rate": 80,
            "new_package": "Double",
            "new_mode": "Weekly",
            "new_rate": 1040 / 7,
        }
        self._comment("Comment", "<pre>" + json.dumps(payload) + "</pre>")
        original_content = self.comments[0].content

        def rows(doctype, **kwargs):
            if doctype == "Comment":
                return self.comments
            if doctype == "Inpatient Package Duration":
                return [
                    Record(parent=name, from_day=1, to_day=7, amount=price)
                    for name, price in [("Triple", 970), ("Double", 1040)]
                ]
            raise AssertionError(doctype)

        with patch.object(frappe, "get_all", side_effect=rows):
            row = history.get_package_changes(self.admission.name)[0]
        self.assertEqual(row["previous_package_price"], 970)
        self.assertTrue(row["previous_price_from_current_config"])
        self.assertEqual(row["new_package_price"], 1040)
        self.assertEqual(self.comments[0].content, original_content)

    def test_audit_failure_is_not_swallowed(self):
        with patch.object(
            history,
            "record_package_change",
            side_effect=RuntimeError("audit unavailable"),
        ):
            with self.assertRaises(RuntimeError):
                self.change(self.admission.name, "Triple", pricing_mode="Weekly")
        self.db.commit.assert_not_called()

    def test_discharged_admission_rejected(self):
        self.admission.status = "Discharged"
        with self.assertRaises(ValueError):
            self.change(self.admission.name, "Double", pricing_mode="Weekly")
        self.assertFalse(self.comments)


class StatementPackageFallbackTest(unittest.TestCase):
    def setUp(self):
        source = Path(__file__).with_name("reception_reports.py").read_text()
        fn = next(
            n
            for n in ast.parse(source).body
            if isinstance(n, ast.FunctionDef)
            and n.name == "_admission_package_quotation_lines"
        )
        env = {"frappe": frappe, "flt": flt}
        exec(
            compile(
                ast.Module(body=[fn], type_ignores=[]), "reception_reports.py", "exec"
            ),
            env,
        )
        self.fallback = env["_admission_package_quotation_lines"]

    def test_explicit_mode_quotation_is_estimate_not_duplicate_charge(self):
        def rows(doctype, **kwargs):
            if doctype == "Quotation":
                return [Record(name="Q", custom_package_pricing_mode="Weekly")]
            if doctype in ("Sales Order Item", "Package Detail"):
                return []
            raise AssertionError("Unexpected quotation fallback: " + doctype)

        with patch.object(frappe, "get_all", side_effect=rows):
            self.assertEqual(self.fallback("ADMISSION"), [])

    def test_standalone_charge_suppresses_historical_quotation_fallback(self):
        def rows(doctype, **kwargs):
            if doctype == "Quotation":
                return [Record(name="Q")]
            if doctype == "Sales Order Item":
                return []
            if doctype == "Package Detail":
                return [Record(quotation="Q", sales_order="SO")]
            if doctype == "Sales Order":
                return ["SO"]
            raise AssertionError("Duplicate estimate included: " + doctype)

        with patch.object(frappe, "get_all", side_effect=rows):
            self.assertEqual(self.fallback("ADMISSION"), [])


class AdmissionQuotationLookupTest(unittest.TestCase):
    def test_modify_package_keeps_services_on_package_quote_not_assessment_quote(self):
        source = Path(__file__).with_name("inpatient_admission.py").read_text()
        fn = next(
            n
            for n in ast.parse(source).body
            if isinstance(n, ast.FunctionDef) and n.name == "check_admission_quotation"
        )
        fn.decorator_list = []
        env = {
            "frappe": frappe,
            "cint": cint,
            "_active_admission_quotation_filters": lambda name, package: {
                "custom_inpatient_admission": name,
                "custom_package": package,
                "docstatus": ["<", 2],
            },
        }
        exec(
            compile(
                ast.Module(body=[fn], type_ignores=[]), "inpatient_admission.py", "exec"
            ),
            env,
        )
        quote = Record(
            name="PACKAGE-Q",
            docstatus=0,
            custom_package="Triple",
            custom_package_pricing_mode="Weekly",
            custom_include_lab_tests=1,
            custom_include_observation=1,
            custom_additional_services=[
                Record(healthcare_service_template="SERVICE-X")
            ],
        )
        quote.check_permission = MagicMock()
        candidates = [Record(name="ASSESSMENT-Q", docstatus=0), quote]
        db = MagicMock()
        db.get_value.return_value = None
        with (
            patch.object(frappe, "db", db, create=True),
            patch.object(
                frappe,
                "get_all",
                side_effect=lambda dt, **kwargs: candidates
                if dt == "Quotation"
                else ["PACKAGE-Q"],
            ),
            patch.object(frappe, "get_doc", return_value=quote) as get_doc,
        ):
            result = env["check_admission_quotation"](
                "ADMISSION", "Double", admission_quotation=True
            )
        self.assertEqual(result["quotation_name"], "PACKAGE-Q")
        self.assertEqual(result["package_name"], "Triple")
        self.assertEqual(result["other_services"], ["SERVICE-X"])
        self.assertEqual(result["include_lab_tests"], 1)
        self.assertEqual(result["include_observation"], 1)
        get_doc.assert_called_once_with("Quotation", "PACKAGE-Q")


if __name__ == "__main__":
    unittest.main()
