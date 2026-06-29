# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and Contributors
# See license.txt

from frappe.tests.utils import FrappeTestCase

from healthcare.healthcare.doctype.digital_whatsapp_template.digital_whatsapp_template import (
	_extract_error_message,
	_extract_templates_from_response,
)


class TestDigitalWhatsappTemplate(FrappeTestCase):
	def test_extract_templates_from_digital_connect_envelope(self):
		response = {
			"success": True,
			"status": "success",
			"message": {
				"data": [
					{
						"id": "123",
						"name": "appointment_reminder",
						"language": "en_US",
						"category": "UTILITY",
						"status": "APPROVED",
						"components": [],
					}
				],
				"paging": {"after": None},
			},
		}
		templates = _extract_templates_from_response(response)
		self.assertEqual(len(templates), 1)
		self.assertEqual(templates[0]["name"], "appointment_reminder")

	def test_extract_templates_when_message_is_list(self):
		response = {
			"success": True,
			"status": "success",
			"message": [
				{
					"name": "hello_world",
					"language": "en_US",
					"category": "UTILITY",
					"status": "APPROVED",
				}
			],
		}
		templates = _extract_templates_from_response(response)
		self.assertEqual(len(templates), 1)
		self.assertEqual(templates[0]["name"], "hello_world")

	def test_extract_error_message_when_message_is_string(self):
		response = {"success": False, "status": "error", "message": "Invalid API key"}
		self.assertEqual(_extract_error_message(response), "Invalid API key")
