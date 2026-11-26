"""Package-change quotation regressions using isolated in-memory documents."""

import copy
import ast
from pathlib import Path
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import frappe
from frappe.utils import flt

from healthcare.api import package_change_history as history
from healthcare.api import package_change_quotation as copies
from healthcare.api import package_charge_to_today as charges
from healthcare.api import room_package_pricing as pricing


class Doc(frappe._dict):
    def __init__(self, **values):
        super().__init__(values)
        object.__setattr__(self, "flags", frappe._dict())
        object.__setattr__(self, "permissions", [])
        object.__setattr__(self, "inserted", False)
        object.__setattr__(self, "submissions", 0)

    def check_permission(self, permission):
        self.permissions.append(permission)

    def as_dict(self):
        return dict(self)

    def set(self, field, value):
        self[field] = value

    def append(self, field, values):
        row = Doc(**values)
        self.setdefault(field, []).append(row)
        return row

    def set_missing_values(self, **kwargs):
        pass

    def calculate_taxes_and_totals(self):
        for row in self.get("items") or []:
            row.amount = flt(row.rate * row.qty, 2)
        self.grand_total = sum(row.amount for row in self.get("items") or [])

    def insert(self):
        self.name = "NEW-QUOTATION"
        object.__setattr__(self, "inserted", True)

    def save(self):
        object.__setattr__(self, "saved", True)

    def submit(self):
        if not frappe.flags.healthcare_skip_package_auto_so:
            raise AssertionError("An automatic full Sales Order could be created")
        self.docstatus = 1
        object.__setattr__(self, "submissions", self.submissions + 1)

    def reload(self):
        return self


class PackageQuotationCopyTest(unittest.TestCase):
    def setUp(self):
        self.admission = Doc(
            name="TEST-ADM",
            company="Serene",
            patient="TEST-PATIENT",
            admission_date="2026-11-01",
            expected_discharge="2026-11-07",
            admission_service_unit_type="Private Room",
        )
        self.source = Doc(
            name="ORIGINAL-Q",
            custom_inpatient_admission="TEST-ADM",
            custom_package="Triple",
            docstatus=1,
            party_name="TEST-CUSTOMER",
            company="Serene",
            custom_include_lab_tests=1,
            custom_include_observation=1,
            custom_include_therapy_sessions=1,
            custom_include_consultations=1,
            custom_additional_services=[Doc(healthcare_service_template="SERVICE-X")],
        )
        self.source["items"] = [
            Doc(
                name="PACKAGE-ROW",
                item_code="ROOM",
                item_name="Room",
                qty=7,
                rate=80,
                description="Inpatient Package: Triple (7 days)",
                ordered_qty=2,
            ),
            Doc(name="PAID-FEE", item_code="ASSESSMENT", qty=1, rate=50, ordered_qty=0),
            Doc(
                name="PENDING-FEE", item_code="DOCUMENT", qty=1, rate=10, ordered_qty=0
            ),
        ]
        self.original = copy.deepcopy(self.source.as_dict())
        self.copy = None
        self.billed_days = 2
        self.changes = []

        def item_for_package(*args, **kwargs):
            item = {
                "Double": "Double Sharing",
                "Triple": "Triple Sharing",
                "Royal": "Royal Suite",
            }.get(kwargs.get("package_name"), "Private Room")
            return {"item_code": item, "item_name": item, "type_label": item}

        self.item_resolver = MagicMock(side_effect=item_for_package)
        stub = SimpleNamespace(
            is_enhanced_workflow_enabled=lambda: False,
            _resolve_package_quotation_item=self.item_resolver,
        )
        self.db = MagicMock()
        self.db.get_value.side_effect = lambda doctype, name, field, **kwargs: {
            "package_name": name,
            "cost_center": "TEST-CC",
            "customer": "TEST-CUSTOMER",
        }.get(field)
        mocks = [
            patch.object(copies, "today", return_value="2026-11-24"),
            patch.object(
                copies,
                "_select_change_quotation",
                side_effect=lambda admission,
                previous,
                changes: charges._find_admission_package_quotation(
                    admission.name, previous, allow_draft=True
                ),
            ),
            patch.object(frappe, "db", self.db, create=True),
            patch.object(
                frappe, "get_system_settings", return_value="Commercial Rounding"
            ),
            patch.object(frappe, "throw", side_effect=ValueError),
            patch.object(copies, "_", side_effect=lambda text: text),
            patch.object(frappe, "copy_doc", side_effect=self._copy),
            patch.object(
                history, "get_package_changes", side_effect=lambda name: self.changes
            ),
            patch.object(
                charges, "_find_admission_package_quotation", return_value=self.source
            ),
            patch.object(
                charges,
                "_days_already_billed",
                side_effect=lambda name: self.billed_days,
            ),
            patch.object(
                copies, "_already_billed_items", return_value={"ASSESSMENT": 1}
            ),
            patch.object(pricing, "preserve_room_rate_precision"),
            patch.dict(sys.modules, {"healthcare.api.inpatient_admission": stub}),
        ]
        for mock in mocks:
            mock.start()
            self.addCleanup(mock.stop)

    def _copy(self, source, ignore_no_copy):
        self.assertFalse(ignore_no_copy)
        self.copy = Doc(**copy.deepcopy(source.as_dict()))
        self.copy.name = None
        self.copy["items"] = [Doc(**dict(row)) for row in self.copy.get("items")]
        return self.copy

    def test_copy_is_draft_with_remaining_days_new_rate_and_unbilled_items_only(self):
        result = copies.create_package_change_quotation(
            self.admission, "Triple", "Double", "Weekly", 1040 / 7
        )
        self.assertEqual(result["quotation_days"], 5)
        self.assertEqual(result["planned_days"], 7)
        self.assertEqual(result["source_quotation"], "ORIGINAL-Q")
        self.assertEqual(result["new_quotation"], "NEW-QUOTATION")
        self.assertEqual(self.copy.docstatus, 0)
        self.assertEqual(self.copy.custom_package, "Double")
        self.assertEqual(self.copy.custom_package_pricing_mode, "Weekly")
        self.assertEqual(self.copy.custom_package_daily_rate, 1040 / 7)
        rows = self.copy.get("items")
        self.assertEqual(
            [row.item_code for row in rows], ["Double Sharing", "DOCUMENT"]
        )
        self.assertEqual(rows[0].qty, 5)
        self.assertEqual(rows[0].rate, 1040 / 7)
        self.assertEqual(rows[0].amount, 742.86)
        self.assertEqual(rows[1].ordered_qty, 0)
        self.assertEqual(self.copy.custom_include_lab_tests, 1)
        self.assertEqual(self.copy.custom_include_observation, 1)
        self.assertEqual(self.copy.custom_include_therapy_sessions, 1)
        self.assertEqual(self.copy.custom_include_consultations, 1)
        self.assertEqual(
            self.copy.custom_additional_services[0].healthcare_service_template,
            "SERVICE-X",
        )
        self.assertIn("create", self.copy.permissions)
        self.assertEqual(self.source.as_dict(), self.original)

    def test_unbilled_draft_is_updated_and_reused_across_multiple_changes(self):
        self.source.docstatus = 0
        for row in self.source.get("items"):
            row.ordered_qty = 0
        self.billed_days = 0
        with (
            patch.object(copies, "_quotation_has_billing", return_value=False),
            patch.object(copies, "_already_billed_items", return_value={}),
        ):
            first = copies.create_package_change_quotation(
                self.admission, "Triple", "Double", "Weekly", 1040 / 7
            )
            second = copies.create_package_change_quotation(
                self.admission, "Double", "Royal", "Monthly", 4800 / 30
            )
        self.assertTrue(first["quotation_reused"])
        self.assertTrue(second["quotation_reused"])
        self.assertEqual(first["new_quotation"], "ORIGINAL-Q")
        self.assertEqual(second["new_quotation"], "ORIGINAL-Q")
        self.assertIsNone(self.copy)
        self.assertTrue(self.source.saved)
        self.assertEqual(self.source.custom_include_therapy_sessions, 1)
        self.assertEqual(self.source.custom_include_consultations, 1)
        self.assertEqual(self.source.custom_package, "Royal")
        self.assertEqual(self.source.custom_package_pricing_mode, "Monthly")
        self.assertEqual(self.source.custom_package_daily_rate, 160)
        self.assertEqual(self.source.get("items")[0].item_code, "Royal Suite")
        self.assertEqual(self.source.get("items")[0].name, "PACKAGE-ROW")
        self.assertEqual(self.source.get("items")[1].name, "PAID-FEE")
        self.assertEqual(self.source.get("items")[0].qty, 7)
        self.assertEqual(
            self.source.custom_additional_services[0].healthcare_service_template,
            "SERVICE-X",
        )
        self.assertEqual(self.source.custom_include_lab_tests, 1)
        self.assertEqual(self.source.custom_include_observation, 1)
        self.assertEqual(
            [row.item_code for row in self.source.get("items")],
            ["Royal Suite", "ASSESSMENT", "DOCUMENT"],
        )

    def test_draft_with_standalone_ledger_and_submitted_order_is_preserved(self):
        self.source.docstatus = 0
        ledger = Doc(
            name="PD", quotation="ORIGINAL-Q", sales_order="POSTED-SO", docstatus=0
        )
        order = Doc(name="POSTED-SO", docstatus=1)
        original_billing = copy.deepcopy((ledger.as_dict(), order.as_dict()))
        before = copy.deepcopy(self.source.as_dict())
        self.db.exists.side_effect = lambda dt, filters: (
            dt == "Package Detail" and filters.get("quotation") == ledger.quotation
        ) or (dt == "Sales Order" and order.docstatus == 1)
        result = copies.create_package_change_quotation(
            self.admission, "Triple", "Double", "Weekly", 1040 / 7
        )
        self.assertFalse(result["quotation_reused"])
        self.assertEqual(result["new_quotation"], "NEW-QUOTATION")
        self.assertEqual(self.source.as_dict(), before)
        self.assertFalse(self.source.inserted)
        self.assertEqual(self.copy.docstatus, 0)
        self.assertEqual((ledger.as_dict(), order.as_dict()), original_billing)

    def test_royal_copy_replaces_original_item_for_remaining_six_days(self):
        self.billed_days = 1
        copies.create_package_change_quotation(
            self.admission, "Triple", "Royal", "Weekly", 1500 / 7
        )
        row = self.copy.get("items")[0]
        self.assertEqual(row.item_code, "Royal Suite")
        self.assertEqual(row.qty, 6)
        self.assertEqual(row.rate, 1500 / 7)
        self.assertEqual(row.amount, 1285.71)

    def test_legacy_admission_uses_new_package_item_resolver(self):
        self.admission.admission_service_unit_type = None
        copies.create_package_change_quotation(
            self.admission, "Triple", "Double", "Weekly", 1040 / 7
        )
        self.assertEqual(self.copy.get("items")[0].item_code, "Double Sharing")
        self.assertEqual(self.item_resolver.call_args.kwargs["package_name"], "Double")

    def test_admission_without_original_quote_uses_existing_plan(self):
        with (
            patch.object(
                charges, "_find_admission_package_quotation", return_value=None
            ),
            patch.object(frappe, "new_doc", return_value=Doc(items=[])) as new_doc,
        ):
            result = copies.create_package_change_quotation(
                self.admission, None, "Double", "Weekly", 1040 / 7
            )
        self.assertEqual(result["quotation_days"], 5)
        self.assertIsNone(result["source_quotation"])
        new_doc.assert_called_once_with("Quotation")

    def test_second_change_does_not_subtract_billed_days_twice(self):
        self.admission.expected_discharge = None
        self.source.get("items")[0].qty = 5
        self.source.custom_package = "Double"
        self.billed_days = 4
        self.changes = [{"planned_days": 7, "new_quotation": "PREVIOUS-COPY"}]
        result = copies.create_package_change_quotation(
            self.admission, "Double", "Triple", "Monthly", 2870 / 30
        )
        self.assertEqual(result["quotation_days"], 3)
        self.assertEqual(self.copy.get("items")[0].amount, 287)

    def test_exhausted_plan_rejected_without_creating_quote(self):
        self.billed_days = 7
        with self.assertRaises(ValueError):
            copies.create_package_change_quotation(
                self.admission, "Triple", "Double", "Weekly", 1040 / 7
            )
        self.assertIsNone(self.copy)
        self.assertEqual(self.source.as_dict(), self.original)

    def test_extended_plan_uses_only_new_remaining_days(self):
        self.admission.expected_discharge = "2026-11-10"
        self.billed_days = 7
        result = copies.create_package_change_quotation(
            self.admission, "Triple", "Double", "Weekly", 1040 / 7
        )
        self.assertEqual(result["planned_days"], 10)
        self.assertEqual(result["quotation_days"], 3)


class ActivePackageQuotationTest(unittest.TestCase):
    def test_active_draft_is_preferred_over_old_submitted_quote(self):
        quote = Doc(
            name="NEW-Q",
            docstatus=0,
            custom_inpatient_admission="ADM",
            custom_package="Double",
        )
        with (
            patch.object(history, "active_change_quotation", return_value="NEW-Q"),
            patch.object(frappe, "get_doc", return_value=quote),
            patch.object(
                frappe,
                "get_all",
                side_effect=AssertionError("Historical quotation lookup must not run"),
            ),
        ):
            self.assertIs(
                charges._find_admission_package_quotation("ADM", "Double"), quote
            )
            self.assertIsNone(
                charges._find_admission_package_quotation(
                    "ADM", "Double", allow_draft=False
                )
            )

    def test_charge_submits_new_quote_and_maps_only_charge_days(self):
        admission = Doc(name="ADM", status="Admitted", package_pricing_mode="Weekly")
        package = Doc(name="Double")
        quote = Doc(name="NEW-Q", docstatus=0)
        preview = {
            "package_changed": True,
            "change_quotation": "NEW-Q",
            "can_charge": True,
            "days_to_charge": 3,
            "amount_per_day": 1040 / 7,
            "amount": 445.71,
            "quotation_remaining_days": 5,
            "from_date": "2026-11-03",
            "to_date": "2026-11-05",
        }
        db = MagicMock()
        db.exists.return_value = True
        with (
            patch.object(frappe, "db", db, create=True),
            patch.object(frappe, "flags", frappe._dict(), create=True),
            patch.object(
                frappe,
                "get_doc",
                side_effect=lambda dt, name: admission
                if dt == "Inpatient Admission"
                else package,
            ),
            patch.object(charges, "_resolve_package_name", return_value="Double"),
            patch.object(charges, "_is_open_daily_package", return_value=True),
            patch.object(charges, "_charge_window", return_value=preview),
            patch.object(
                charges, "_find_admission_package_quotation", return_value=quote
            ),
            patch.object(charges, "_ms_catch_up_window", return_value={}),
            patch.object(
                charges, "_make_partial_package_sales_order", return_value="NEW-SO"
            ) as partial,
            patch.object(
                charges,
                "_make_standalone_package_sales_order",
                side_effect=AssertionError("Must map the active quotation"),
            ),
            patch.object(charges, "record_partial_package_charge") as ledger,
            patch.object(charges, "_days_already_billed", return_value=5),
            patch.object(charges, "_", side_effect=lambda text: text),
        ):
            result = charges._charge_package_days("ADM", as_of="2026-11-05")
        self.assertEqual(quote.docstatus, 1)
        self.assertEqual(quote.submissions, 1)
        self.assertEqual(partial.call_args.args[0].name, "NEW-Q")
        self.assertEqual(partial.call_args.kwargs["days_to_charge"], 3)
        self.assertEqual(ledger.call_args.kwargs["quotation"].name, "NEW-Q")
        self.assertEqual(result["quotation"], "NEW-Q")
        self.assertEqual(result["sales_order"], "NEW-SO")

    def test_billed_fee_lookup_does_not_double_count_invoice_and_order(self):
        stub = SimpleNamespace(
            _admission_sales_orders=lambda name: [Doc(name="SO")],
            _admission_sales_invoices=lambda name, orders: [Doc(name="SI")],
        )

        def rows(doctype, **kwargs):
            if doctype == "Sales Order Item":
                return [Doc(item_code="FEE", qty=1)]
            return [
                Doc(item_code="FEE", qty=1, sales_order="SO"),
                Doc(item_code="DIRECT-FEE", qty=1),
            ]

        with (
            patch.dict(sys.modules, {"healthcare.api.reception_reports": stub}),
            patch.object(frappe, "get_all", side_effect=rows),
        ):
            self.assertEqual(
                copies._already_billed_items("ADM", {"FEE", "DIRECT-FEE"}),
                {"FEE": 1, "DIRECT-FEE": 1},
            )


class PackageItemResolverTest(unittest.TestCase):
    def setUp(self):
        source = Path(__file__).with_name("inpatient_admission.py").read_text()
        fn = next(
            row
            for row in ast.parse(source).body
            if isinstance(row, ast.FunctionDef)
            and row.name == "_resolve_package_quotation_item"
        )
        self.types = [
            Doc(name=name)
            for name in [
                "Triple Sharing",
                "Double Sharing",
                "Private Room",
                "Royal Suite",
            ]
        ]
        self.packages = {
            "Royal": Doc(name="Royal", package_category="Royal Suits"),
            "Single/Private": Doc(
                name="Single/Private", package_category="Private Room"
            ),
            "VIP Package": Doc(name="VIP Package", package_category="VIP"),
        }
        env = {
            "frappe": frappe,
            "_": lambda text: text,
            "_item_code_from_healthcare_service_unit_type": lambda name: name,
            "_item_code_from_healthcare_service_unit": MagicMock(
                side_effect=AssertionError("Old room must not choose the package item")
            ),
        }
        exec(
            compile(
                ast.Module(body=[fn], type_ignores=[]), "inpatient_admission.py", "exec"
            ),
            env,
        )
        self.resolve = env["_resolve_package_quotation_item"]
        db = MagicMock()
        db.get_value.side_effect = lambda doctype, name, field, **kwargs: name
        mocks = [
            patch.object(frappe, "db", db, create=True),
            patch.object(
                frappe, "get_doc", side_effect=lambda dt, name: self.packages[name]
            ),
            patch.object(
                frappe, "get_all", side_effect=lambda *args, **kwargs: self.types
            ),
            patch.object(frappe, "throw", side_effect=ValueError),
            patch.object(pricing, "_", side_effect=lambda text: text),
        ]
        for mock in mocks:
            mock.start()
            self.addCleanup(mock.stop)

    def test_royal_package_uses_royal_item_without_changing_admission_room(self):
        admission = Doc(admission_service_unit_type="Triple Sharing")
        result = self.resolve(
            admission, "OLD-ROOM", "Triple Sharing", package_name="Royal"
        )
        self.assertEqual(result["item_code"], "Royal Suite")
        self.assertEqual(admission.admission_service_unit_type, "Triple Sharing")

    def test_private_package_uses_private_item(self):
        result = self.resolve(
            Doc(admission_service_unit_type="Triple Sharing"),
            package_name="Single/Private",
        )
        self.assertEqual(result["item_code"], "Private Room")

    def test_vip_and_custom_keep_existing_room_item_resolution(self):
        admission = Doc(admission_service_unit_type="Triple Sharing")
        for package in ["VIP Package", "__custom__"]:
            self.assertEqual(
                self.resolve(admission, package_name=package)["item_code"],
                "Triple Sharing",
            )

    def test_legacy_admission_with_no_room_type_still_resolves_royal_item(self):
        self.assertEqual(
            self.resolve(Doc(), package_name="Royal")["item_code"], "Royal Suite"
        )

    def test_missing_category_mapping_does_not_reuse_original_item(self):
        self.types = [Doc(name="Triple Sharing")]
        with self.assertRaises(ValueError):
            self.resolve(
                Doc(admission_service_unit_type="Triple Sharing"), package_name="Royal"
            )


class DraftReuseGuardTest(unittest.TestCase):
    def setUp(self):
        self.quote = Doc(
            name="Q",
            docstatus=0,
            custom_inpatient_admission="ADM",
            custom_package="Triple",
        )
        self.quote["items"] = [Doc(name="QI", item_code="ROOM", qty=7, ordered_qty=0)]
        self.db = MagicMock()
        self.db.exists.return_value = False
        self.stub = SimpleNamespace(_admission_sales_invoices=lambda admission: [])
        mocks = [
            patch.object(frappe, "db", self.db, create=True),
            patch.object(frappe, "get_all", return_value=[]),
            patch.object(frappe, "get_doc", return_value=self.quote),
            patch.object(frappe, "throw", side_effect=ValueError),
            patch.object(copies, "_", side_effect=lambda text: text),
            patch.dict(sys.modules, {"healthcare.api.reception_reports": self.stub}),
        ]
        for mock in mocks:
            mock.start()
            self.addCleanup(mock.stop)

    def test_clean_draft_has_no_billing(self):
        self.assertFalse(copies._quotation_has_billing(self.quote, "ADM"))

    def test_package_detail_blocks_reuse_regardless_of_status_or_cancelled_order(self):
        self.db.exists.side_effect = lambda dt, filters: dt == "Package Detail"
        self.assertTrue(copies._quotation_has_billing(self.quote, "ADM"))
        self.db.exists.assert_called_once_with("Package Detail", {"quotation": "Q"})

    def test_non_cancelled_order_linked_by_quotation_item_blocks_reuse(self):
        frappe.get_all.return_value = [Doc(name="SOI", parent="SO")]
        self.db.exists.side_effect = lambda dt, filters: dt == "Sales Order"
        self.assertTrue(copies._quotation_has_billing(self.quote, "ADM"))
        self.assertIn(
            ["quotation_item", "in", ["QI"]],
            frappe.get_all.call_args.kwargs["or_filters"],
        )

    def test_invoice_via_cancelled_order_still_blocks_reuse(self):
        def rows(dt, **kwargs):
            return (
                [Doc(name="SOI", parent="CANCELLED-SO")]
                if dt == "Sales Order Item"
                else ["LIVE-SI"]
            )

        frappe.get_all.side_effect = rows
        self.assertTrue(copies._quotation_has_billing(self.quote, "ADM"))

    def test_direct_invoice_quotation_item_reference_blocks_reuse(self):
        self.db.exists.side_effect = (
            lambda dt, filters: dt == "Sales Invoice Item"
            and filters.get("reference_dt") == "Quotation Item"
        )
        self.assertTrue(copies._quotation_has_billing(self.quote, "ADM"))

    def test_direct_invoice_header_quotation_reference_blocks_reuse(self):
        self.db.exists.side_effect = (
            lambda dt, filters: dt == "Sales Invoice"
            and filters.get("custom_reference_name") == "Q"
        )
        self.assertTrue(copies._quotation_has_billing(self.quote, "ADM"))

    def test_unattributed_admission_package_invoice_blocks_reuse(self):
        self.stub._admission_sales_invoices = lambda name: [Doc(name="SI")]
        frappe.get_all.side_effect = (
            lambda dt, **kwargs: ["SI"]
            if dt == "Sales Invoice"
            else []
            if dt == "Sales Order Item"
            else [
                Doc(
                    sales_order=None,
                    so_detail=None,
                    reference_dt=None,
                    reference_dn=None,
                )
            ]
        )
        self.assertTrue(copies._quotation_has_billing(self.quote, "ADM"))

    def test_invoice_proven_to_belong_to_another_quote_does_not_block_reuse(self):
        self.stub._admission_sales_invoices = lambda name: [Doc(name="SI")]

        def rows(dt, **kwargs):
            if dt == "Sales Invoice":
                return ["SI"]
            if dt == "Sales Order Item":
                return (
                    [
                        Doc(
                            name="OLD-SOI",
                            parent="OLD-SO",
                            prevdoc_docname="OLD-Q",
                            quotation_item="OLD-QI",
                        )
                    ]
                    if "prevdoc_docname" in kwargs.get("fields", [])
                    else []
                )
            if dt == "Sales Invoice Item":
                return [
                    Doc(
                        sales_order="OLD-SO",
                        so_detail="OLD-SOI",
                        reference_dt=None,
                        reference_dn=None,
                    )
                ]
            return []

        frappe.get_all.side_effect = rows
        self.assertFalse(copies._quotation_has_billing(self.quote, "ADM"))

    def test_multiple_untracked_drafts_stop_before_any_write(self):
        frappe.get_all.return_value = [
            Doc(name="Q", custom_package="Triple"),
            Doc(name="Q2", custom_package="Double"),
        ]
        with self.assertRaises(ValueError):
            copies._select_change_quotation(Doc(name="ADM"), "Triple", [])
        frappe.get_doc.assert_not_called()
        self.assertIn("Q2", frappe.throw.call_args.args[0])

    def test_history_explicitly_identifies_active_draft_despite_older_drafts(self):
        result = copies._select_change_quotation(
            Doc(name="ADM"), "Triple", [{"new_quotation": "Q"}]
        )
        self.assertIs(result, self.quote)
        frappe.get_all.assert_not_called()
        self.db.get_value.assert_called_once_with(
            "Quotation", "Q", "name", for_update=True
        )

    def test_unique_draft_is_selected(self):
        frappe.get_all.return_value = [Doc(name="Q", custom_package="Triple")]
        result = copies._select_change_quotation(Doc(name="ADM"), "Triple", [])
        self.assertIs(result, self.quote)

    def test_cancelled_active_quote_is_never_updated(self):
        self.quote.docstatus = 2
        with self.assertRaises(ValueError):
            copies._select_change_quotation(
                Doc(name="ADM"), "Triple", [{"new_quotation": "Q"}]
            )
        self.assertFalse(self.quote.inserted)


if __name__ == "__main__":
    unittest.main()
