# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and Contributors
# See license.txt

from frappe.tests.utils import FrappeTestCase

from healthcare.healthcare.doctype.digi_whatsapp_notification_setup.digi_whatsapp_notification_setup import (
	_normalize_phone,
)


class TestDigiWhatsappNotificationSetup(FrappeTestCase):
	def test_normalize_phone(self):
		self.assertEqual(_normalize_phone("+254 740-743-521"), "254740743521")
		self.assertEqual(_normalize_phone(" 254740743521 "), "254740743521")
		self.assertEqual(_normalize_phone("abc"), "")
