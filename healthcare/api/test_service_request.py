# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and Contributors
# See license.txt

from unittest.mock import patch

from frappe.tests import IntegrationTestCase

from healthcare.api.service_request import get_service_requests


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
