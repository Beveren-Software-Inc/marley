"""Isolated room-pricing regressions; no database writes or migrated metadata required."""

import sys
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import frappe
from frappe.utils import getdate

from healthcare.api import room_package_pricing as pricing
from healthcare.api import package_charge_to_today as charges
from healthcare.controllers.quotation import create_sales_order_from_package_quotation


class RoomPackagePricingTest(unittest.TestCase):
    def setUp(self):
        rounding = patch.object(
            frappe, "get_system_settings", return_value="Commercial Rounding"
        )
        rounding.start()
        self.addCleanup(rounding.stop)
        self.package = frappe._dict(
            name="Triple",
            package_category="Triple",
            package_rate=80,
            active=1,
            company="Serene",
            duration_pricing=[
                frappe._dict(from_day=1, to_day=7, amount=970),
                frappe._dict(from_day=1, to_day=30, amount=2870),
            ],
        )
        self.mocks = [
            patch.object(frappe, "get_all", return_value=[self.package]),
            patch.object(frappe, "get_doc", return_value=self.package),
            patch.object(pricing, "_", side_effect=lambda text: text),
            patch.object(frappe, "throw", side_effect=ValueError),
        ]
        for mock in self.mocks:
            mock.start()
            self.addCleanup(mock.stop)

    def test_daily_triple(self):
        self.assertEqual(
            pricing.resolve_room_package_price("Daily", "Triple", 5)["total_price"],
            400,
        )

    def test_daily_double(self):
        self.package.name = "Double"
        self.package.package_category = "Double"
        self.package.package_rate = 110
        self.assertEqual(
            pricing.resolve_room_package_price("Daily", "Double", 5)["total_price"],
            550,
        )

    def test_weekly_examples(self):
        for days, expected in [(7, 970.00), (8, 1108.57), (9, 1247.14), (14, 1940.00)]:
            result = pricing.resolve_room_package_price("Weekly", "Triple", days)
            self.assertEqual(result["total_price"], expected)
            self.assertAlmostEqual(result["daily_rate"], 970 / 7)

    def test_monthly_examples(self):
        for days, expected in [(30, 2870.00), (31, 2965.67), (35, 3348.33)]:
            result = pricing.resolve_room_package_price("Monthly", "Triple", days)
            self.assertEqual(result["total_price"], expected)
            self.assertAlmostEqual(result["daily_rate"], 2870 / 30)

    def test_rounded_total_does_not_truncate_quotation_rate(self):
        result = pricing.resolve_room_package_price("Weekly", "Triple", 9)
        self.assertAlmostEqual(
            pricing.discounted_package_daily_rate(result, 9, 1247.14), 970 / 7
        )
        self.assertAlmostEqual(
            pricing.discounted_package_daily_rate(result, 9, 1122.43, 10), 970 / 7 * 0.9
        )

    def test_weekly_never_switches_to_monthly(self):
        self.assertEqual(
            pricing.resolve_room_package_price("Weekly", "Triple", 35)["period_days"],
            7,
        )

    def test_daily_default_not_used(self):
        default = frappe._dict(
            name="Daily (default)", package_category="Daily", package_rate=150
        )
        with patch.object(frappe, "get_all", return_value=[default, self.package]):
            self.assertEqual(
                pricing.resolve_room_package_price("Daily", "Triple", 1)["daily_rate"],
                80,
            )

    def test_missing_duration_rejected(self):
        self.package.duration_pricing = []
        with self.assertRaises(ValueError):
            pricing.resolve_room_package_price("Weekly", "Triple", 7)

    def test_selected_package_independent_of_room_type(self):
        for room in ("Triple Sharing", "Private Room", "Royal Suite", None):
            result = pricing.resolve_room_package_price(
                "Weekly", "Triple", 7, "Serene", room
            )
            self.assertEqual(result["package_name"], "Triple")
            self.assertAlmostEqual(result["total_price"], 970)
            frappe.get_doc.assert_called_with("Inpatient Package", "Triple")

    def test_different_company_rejected(self):
        with self.assertRaises(ValueError):
            pricing.resolve_room_package_price("Weekly", "Triple", 7, "Another Company")

    def test_inactive_package_rejected(self):
        self.package.active = 0
        with self.assertRaises(ValueError):
            pricing.resolve_room_package_price("Weekly", "Triple", 7)

    def test_invalid_mode_rejected(self):
        with self.assertRaises(ValueError):
            pricing.resolve_room_package_price("Automatic", "Triple", 1)

    def test_monthly_rate_precision(self):
        class Doc(dict):
            pass

        row = Doc(rate=2870 / 30, price_list_rate=2870 / 30)
        doc = Doc(custom_package_pricing_mode="Monthly", items=[row])
        pricing.preserve_room_rate_precision(doc)
        self.assertEqual(doc._precision["items"]["rate"], 9)
        self.assertEqual(row._precision["main"]["rate"], 9)
        self.assertEqual(round(round(row["rate"], 9) * 35, 2), 3348.33)

    def test_invoice_restores_precise_source_rate_and_two_decimal_package_amounts(self):
        class Doc(dict):
            def __getattr__(self, name):
                if name in self:
                    return self[name]
                raise AttributeError(name)

        source = Doc(
            rate=970 / 7,
            price_list_rate=970 / 7,
            description="Inpatient Package: Triple",
        )
        row = Doc(
            rate=138.571,
            price_list_rate=138.571,
            sales_order="SO",
            so_detail="SO-ITEM",
            description=source.description,
        )
        doc = Doc(doctype="Sales Invoice", items=[row])
        order = Doc(
            custom_reference_type="Inpatient Admission",
            custom_reference_name="ADMISSION",
        )
        with (
            patch.object(frappe, "db", MagicMock(), create=True) as db,
            patch.object(frappe, "get_doc", return_value=source),
            patch.object(frappe, "get_cached_doc", return_value=order),
        ):
            db.get_value.return_value = "Weekly"
            pricing.preserve_room_rate_precision(doc)
        self.assertEqual(row.rate, source.rate)
        self.assertEqual(row._precision["main"]["rate"], 9)
        self.assertEqual(row._precision["main"]["amount"], 2)

    def test_medical_supervision_amount_precision_is_not_changed(self):
        class Doc(dict):
            def __getattr__(self, name):
                if name in self:
                    return self[name]
                raise AttributeError(name)

        room = Doc(rate=970 / 7, description="Inpatient Package: Triple")
        supervision = Doc(rate=10.125, description="Medical Supervision")
        doc = Doc(custom_package_pricing_mode="Weekly", items=[room, supervision])
        pricing.preserve_room_rate_precision(doc)
        self.assertEqual(supervision.rate, 10.125)
        self.assertNotIn("amount", supervision._precision["main"])

    def test_legacy_precision_unchanged(self):
        class Doc(dict):
            pass

        doc = Doc(items=[])
        pricing.preserve_room_rate_precision(doc)
        self.assertFalse(hasattr(doc, "_precision"))

    def test_explicit_quotation_does_not_bill_planned_days(self):
        doc = frappe._dict(
            doctype="Quotation", docstatus=1, custom_package_pricing_mode="Weekly"
        )
        with patch.object(frappe, "new_doc") as new_doc:
            create_sales_order_from_package_quotation(doc)
            new_doc.assert_not_called()

    def test_open_ended_actual_days_and_repeat_charge(self):
        admission = frappe._dict(
            name="TEST-ADMISSION",
            package_pricing_mode="Weekly",
            admission_date="2026-11-01",
        )
        package = frappe._dict(name="Triple", no_of_days=7)
        stub = SimpleNamespace(_resolve_quotation_service_unit=lambda name: None)
        with (
            patch.dict(sys.modules, {"healthcare.api.inpatient_admission": stub}),
            patch.object(charges, "_days_already_billed", return_value=7),
            patch.object(charges, "has_package_change", return_value=False),
            patch.object(
                charges, "_find_admission_package_quotation", return_value=None
            ),
            patch.object(charges, "_amount_per_day", return_value=970 / 7),
            patch.object(
                charges, "_package_charge_item", return_value={"item_code": "ROOM"}
            ),
            patch.object(
                charges,
                "_last_package_billed_to_date",
                return_value=getdate("2026-11-07"),
            ),
        ):
            result = charges._charge_window(admission, package, as_of="2026-11-09")
            self.assertEqual(result["days_to_charge"], 2)
            self.assertEqual(result["amount"], round(970 / 7 * 2, 2))
            with patch.object(
                charges,
                "_last_package_billed_to_date",
                return_value=getdate("2026-11-09"),
            ):
                self.assertEqual(
                    charges._charge_window(admission, package, as_of="2026-11-09")[
                        "days_to_charge"
                    ],
                    0,
                )


if __name__ == "__main__":
    unittest.main()
