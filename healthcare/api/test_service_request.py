# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and Contributors
# See license.txt

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from healthcare.api.common import get_healthcare_portal_settings
from healthcare.api.service_request import (
	_display_unconfirmed_request_on_lab_page,
	get_lab_request_review,
	get_service_requests,
)


class TestServiceRequestUnconfirmedLabRequests(IntegrationTestCase):
	"""Lab page → *Display Unconfirmed Request on Lab Page* (Healthcare Settings)."""

	def _listing_filters(self, **kwargs):
		"""Filters ``get_service_requests`` passes to ``frappe.get_all``."""
		with (
			patch("frappe.get_all", return_value=[]) as get_all,
			patch("healthcare.api.common.resolve_cost_center_filter", return_value=None),
		):
			get_service_requests(**kwargs)
		return get_all.call_args_list[0].kwargs["filters"]

	def test_setting_off_keeps_booked_only_listing(self):
		with patch(
			"healthcare.api.service_request._display_unconfirmed_request_on_lab_page",
			return_value=False,
		):
			filters = self._listing_filters(
				template_dt="Lab Test Template", booked=1, include_unconfirmed=1
			)
		self.assertEqual(filters["booked"], 1)

	def test_setting_on_drops_the_booked_filter(self):
		with patch(
			"healthcare.api.service_request._display_unconfirmed_request_on_lab_page",
			return_value=True,
		):
			filters = self._listing_filters(
				template_dt="Lab Test Template", booked=1, include_unconfirmed=1
			)
		self.assertNotIn("booked", filters)

	def test_include_unconfirmed_is_ignored_for_other_template_types(self):
		with patch(
			"healthcare.api.service_request._display_unconfirmed_request_on_lab_page",
			return_value=True,
		):
			filters = self._listing_filters(
				template_dt="Observation Template", booked=1, include_unconfirmed=1
			)
		self.assertEqual(filters["booked"], 1)

	def test_setting_is_read_from_healthcare_settings(self):
		"""Healthcare Settings is a Single, so the value comes from ``tabSingles``."""
		with patch("frappe.db.get_single_value", return_value=1):
			self.assertTrue(_display_unconfirmed_request_on_lab_page())
		# Unsynced field / fresh site: ``get_single_value`` returns None → old behaviour.
		with patch("frappe.db.get_single_value", return_value=None):
			self.assertFalse(_display_unconfirmed_request_on_lab_page())

	def test_portal_settings_expose_the_flag(self):
		def _single_value(doctype, fieldname, *args, **kwargs):
			return 1 if fieldname == "display_unconfirmed_request_on_lab_page" else 0

		with (
			patch("frappe.db.get_single_value", side_effect=_single_value),
			patch("healthcare.healthcare.editing_lock.is_editing_locked", return_value=False),
		):
			settings = get_healthcare_portal_settings()
		self.assertTrue(settings["display_unconfirmed_request_on_lab_page"])

	def _fetch_with_row(self, row):
		"""Run the Lab page listing with a single stubbed row (template lookups stubbed)."""
		with (
			patch(
				"healthcare.api.service_request._display_unconfirmed_request_on_lab_page",
				return_value=True,
			),
			patch("frappe.get_all", return_value=[frappe._dict(row)]),
			patch("healthcare.api.common.resolve_cost_center_filter", return_value=None),
			patch(
				"healthcare.api.service_request._compute_lab_request_virtual_status",
				return_value="booked",
			),
			patch(
				"healthcare.api.common._by_nurse_lab_test_template_names",
				return_value=[],
			),
		):
			return get_service_requests(
				template_dt="Lab Test Template", booked=1, include_unconfirmed=1
			)

	def test_unpaid_rows_are_flagged_unconfirmed(self):
		result = self._fetch_with_row(
			{
				"name": "SR-UNPAID",
				"patient": "PAT-0001",
				"template_dt": "Lab Test Template",
				"template_dn": "TPL-0001",
				"booked": 0,
			}
		)
		rows = result["data"]
		self.assertEqual(len(rows), 1)
		self.assertEqual(rows[0]["unconfirmed"], 1)
		self.assertEqual(rows[0]["virtual_status"], "booked")

	def test_paid_but_not_booked_rows_stay_read_only(self):
		"""Payment accepted but not forwarded to the lab: no Lab Tests to act on."""
		result = self._fetch_with_row(
			{
				"name": "SR-PAID",
				"patient": "PAT-0001",
				"template_dt": "Lab Test Template",
				"template_dn": "TPL-0001",
				"booked": 0,
				"patient_accepted_cost": 1,
			}
		)
		rows = result["data"]
		self.assertEqual(len(rows), 1)
		self.assertEqual(rows[0]["unconfirmed"], 1)
		self.assertEqual(rows[0]["patient_accepted_cost"], 1)
		self.assertEqual(rows[0]["virtual_status"], "booked")

	def _review_request(self, *, setting, booked=0, patient_accepted_cost=0):
		"""Run ``get_lab_request_review`` against a stubbed Lab Request (no Lab Tests)."""
		doc = frappe._dict(
			{
				"name": "SR-UNPAID",
				"template_dt": "Lab Test Template",
				"template_dn": "TPL-0001",
				"booked": booked,
				"patient": None,
				"patient_name": None,
				"practitioner": None,
				"order_date": None,
				"order_time": None,
				"status": "open-Request Status",
				"patient_accepted_cost": patient_accepted_cost,
				"lab_request_items": '[{"kind": "single", "template": "TPL-0001"}]',
			}
		)
		with (
			patch(
				"healthcare.api.service_request._display_unconfirmed_request_on_lab_page",
				return_value=setting,
			),
			patch("frappe.db.exists", return_value=True),
			patch("frappe.get_doc", return_value=doc),
			patch(
				"healthcare.healthcare.lab_request_items.expand_lab_test_specs",
				return_value=[],
			),
			patch("healthcare.api.service_request._template_review_fields", return_value={}),
			patch(
				"healthcare.api.service_request._lab_sample_patient_label_fields",
				return_value={},
			),
			patch("frappe.get_all", return_value=[]),
		):
			return get_lab_request_review("SR-UNPAID")

	def test_review_of_unbooked_request_needs_the_setting(self):
		"""Setting off → only booked requests open (previous behaviour)."""
		with self.assertRaises(frappe.ValidationError):
			self._review_request(setting=False)

	def test_review_lists_tests_of_unbooked_request_when_setting_on(self):
		review = self._review_request(setting=True)
		self.assertEqual(review["unconfirmed"], 1)
		self.assertEqual(review["booked"], 0)
		self.assertEqual(review["status"], "Unconfirmed")
		self.assertEqual(review["test_count"], 1)
		self.assertEqual(review["groups"][0]["tests"][0]["template"], "TPL-0001")
		# No Lab Tests exist yet — the modal must not offer sample/result actions.
		self.assertIsNone(review["groups"][0]["tests"][0]["lab_test"])

	def test_review_flags_paid_but_not_booked_request(self):
		review = self._review_request(setting=True, patient_accepted_cost=1)
		self.assertEqual(review["unconfirmed"], 1)
		self.assertEqual(review["patient_accepted_cost"], 1)

	def test_review_of_booked_request_is_unchanged(self):
		review = self._review_request(setting=False, booked=1)
		self.assertEqual(review["unconfirmed"], 0)
		self.assertEqual(review["booked"], 1)
		self.assertEqual(review["status"], "Booked")


class TestServiceRequestHideFromUi(IntegrationTestCase):
	"""Lab Request listings must never return Service Requests flagged *Hide from UI*."""

	def _listing_filters(self, **kwargs):
		"""Filters ``get_service_requests`` passes to ``frappe.get_all``.

		The DB and the branch scope are stubbed so only the filter building is
		exercised (rows come back empty, so no per-row template lookups run).
		"""
		with (
			patch("frappe.get_all", return_value=[]) as get_all,
			patch("frappe.db.has_column", return_value=True),
			patch("healthcare.api.common.resolve_cost_center_filter", return_value=None),
		):
			get_service_requests(**kwargs)
		return get_all.call_args_list[0].kwargs["filters"]

	def test_hidden_lab_requests_are_excluded(self):
		filters = self._listing_filters(template_dt="Lab Test Template")
		self.assertEqual(filters["hide_from_ui"], ["!=", 1])

	def test_hidden_lab_requests_are_excluded_with_other_filters(self):
		filters = self._listing_filters(
			template_dt="Lab Test Template",
			booked=1,
			patient_care_type="OP",
			virtual_status="booked",
		)
		self.assertEqual(filters["hide_from_ui"], ["!=", 1])
		self.assertEqual(filters["booked"], 1)

	def test_include_hidden_from_ui_opts_back_in(self):
		filters = self._listing_filters(
			template_dt="Lab Test Template", include_hidden_from_ui=1
		)
		self.assertNotIn("hide_from_ui", filters)

	def test_non_lab_template_listings_are_untouched(self):
		for template_dt in ("Observation Template", "Therapy Type", None):
			with self.subTest(template_dt=template_dt):
				filters = self._listing_filters(template_dt=template_dt)
				self.assertNotIn("hide_from_ui", filters)

	def test_missing_column_is_tolerated(self):
		"""A site where the Check field has not been synced yet must still list."""
		with (
			patch("frappe.get_all", return_value=[]) as get_all,
			patch("frappe.db.has_column", return_value=False),
			patch("healthcare.api.common.resolve_cost_center_filter", return_value=None),
		):
			get_service_requests(template_dt="Lab Test Template")
		filters = get_all.call_args_list[0].kwargs["filters"]
		self.assertNotIn("hide_from_ui", filters)
