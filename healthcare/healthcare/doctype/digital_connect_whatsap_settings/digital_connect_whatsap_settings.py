# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _
from frappe.model.document import Document

try:
	import requests
except ImportError:
	requests = None


class DigitalConnectWhatsapSettings(Document):
	"""Settings for Digital Connect Whatsap integration."""

	pass


@frappe.whitelist()
def send_test_message(phone_number, body, preview_url=1):
	"""Send a simple TEXT test message via Digital Connect using current settings.

	Args:
		phone_number: Destination phone number in international format
		body: Text body to send
		preview_url: 1/0 flag whether to enable URL preview
	"""
	settings = frappe.get_single("Digital Connect Whatsap Settings")

	if not settings.enable:
		frappe.throw(_("Digital Connect Whatsap integration is disabled."))

	# Get the actual API key using get_password for password field
	api_key = settings.get_password("api_key")
	
	if not settings.base_url or not api_key:
		frappe.throw(_("Base URL and API Key are required in Digital Connect Whatsap Settings."))

	if requests is None:
		frappe.throw(_("Python requests library is not available on this site."))

	payload = {
		"phone_number": phone_number,
		"type": "text",
		"parameters": {
			"body": body,
			"preview_url": bool(preview_url),
		},
	}

	headers = {
		"Content-Type": "application/json",
		"token": api_key,
	}

	try:
		response = requests.post(
			settings.base_url,
			data=json.dumps(payload),
			headers=headers,
			timeout=15,
		)
	except Exception as exc:
		frappe.throw(_("Failed to call Digital Connect API: {0}").format(str(exc)))

	try:
		data = response.json()
	except Exception:
		data = response.text

	if not response.ok:
		frappe.throw(
			_("Digital Connect returned HTTP {0}: {1}").format(
				response.status_code,
				data,
			)
		)

	return {
		"status": "success",
		"http_status": response.status_code,
		"response": data,
	}
