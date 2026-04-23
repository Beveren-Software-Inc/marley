# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and Contributors
# See license.txt

from frappe.tests.utils import FrappeTestCase
from healthcare.healthcare.doctype.digital_connect_whatsap_settings.digital_connect_whatsap_settings import (
	_collect_webhook_events,
	_extract_message_id_from_send_response,
	_normalize_delivery_status,
)


class TestDigitalConnectWhatsapSettings(FrappeTestCase):
	def test_extract_message_id_from_send_response(self):
		response = {
			"status": "success",
			"http_status": 200,
			"response": {
				"message": {
					"messaging_product": "whatsapp",
					"messages": [{"id": "wamid.HBgMMjU0NzQwNzQzNTIxFQIAERgSNzVEM0M3RjMwMEI0Mjc0QUY3AA=="}],
				}
			},
		}
		self.assertEqual(
			_extract_message_id_from_send_response(response),
			"wamid.HBgMMjU0NzQwNzQzNTIxFQIAERgSNzVEM0M3RjMwMEI0Mjc0QUY3AA==",
		)

	def test_collect_webhook_events_extracts_status_and_incoming(self):
		payload = {
			"entry": [
				{
					"changes": [
						{
							"value": {
								"contacts": [{"wa_id": "254740743521", "profile": {"name": "Test User"}}],
								"messages": [
									{
										"id": "wamid.incoming",
										"from": "254740743521",
										"type": "text",
										"text": {"body": "Hello"},
									}
								],
								"statuses": [
									{
										"id": "wamid.outgoing",
										"status": "delivered",
										"recipient_id": "254740743521",
									}
								],
							}
						}
					]
				}
			]
		}
		events = _collect_webhook_events(payload)
		self.assertTrue(any(e.get("kind") == "incoming" and e.get("message_id") == "wamid.incoming" for e in events))
		self.assertTrue(any(e.get("kind") == "status" and e.get("message_id") == "wamid.outgoing" for e in events))

	def test_normalize_delivery_status(self):
		self.assertEqual(_normalize_delivery_status("Message Delivered"), "delivered")
		self.assertEqual(_normalize_delivery_status("read"), "read")
		self.assertEqual(_normalize_delivery_status("failed"), "failed")
