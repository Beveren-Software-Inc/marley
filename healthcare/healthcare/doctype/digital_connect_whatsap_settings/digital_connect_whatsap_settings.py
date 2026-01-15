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
def send_test_message(phone_number, body=None, preview_url=1, template_name=None, template_parameters=None):
	"""Send a test message via Digital Connect - either plain text or template message.

	Args:
		phone_number: Destination phone number in international format
		body: Text body to send (for plain text messages)
		preview_url: 1/0 flag whether to enable URL preview (for plain text)
		template_name: Name of the template document to use (for template messages)
		template_parameters: Comma-separated values for template variables
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

	# Extract base URL
	base_url = settings.base_url
	if "/v2/api/outgoing/" in base_url:
		base_url = base_url.split("/v2/api/outgoing/")[0]
	base_url = base_url.rstrip("/")
	
	headers = {
		"Content-Type": "application/json",
		"token": api_key,
	}

	# Determine message type and build payload
	if template_name:
		# Template message
		template_doc = frappe.get_doc("Digital Whatsapp Template", template_name)
		
		if template_doc.status != "APPROVED":
			frappe.throw(_("Template must be APPROVED to send. Current status: {0}").format(template_doc.status))
		
		if not template_doc.template_id:
			frappe.throw(_("Template is not registered in Digital Connect. Please register it first."))
		
		# Count variables in template text (format: {{1}}, {{2}}, etc.)
		import re
		
		def count_variables(text):
			"""Count number of variables in template text."""
			if not text:
				return 0
			# Find all patterns like {{1}}, {{2}}, etc.
			matches = re.findall(r'\{\{(\d+)\}\}', text)
			if not matches:
				return 0
			# Get the highest number to determine total variables
			max_var = max([int(m) for m in matches])
			return max_var
		
		# Count variables in header and body
		header_var_count = 0
		if template_doc.header_type == "TEXT" and template_doc.header_text:
			header_var_count = count_variables(template_doc.header_text)
		
		body_var_count = 0
		if template_doc.body_text:
			body_var_count = count_variables(template_doc.body_text)
		
		total_var_count = header_var_count + body_var_count
		
		# Parse template parameters
		param_values = []
		if template_parameters:
			param_values = [p.strip() for p in template_parameters.split(",") if p.strip()]
		
		# Validate parameter count
		if len(param_values) != total_var_count:
			frappe.throw(
				_("Template requires {0} parameter(s) (Header: {1}, Body: {2}), but {3} provided. "
				  "Please provide comma-separated values matching the template variables.").format(
					total_var_count, header_var_count, body_var_count, len(param_values)
				)
			)
		
		# Build template components with parameters
		components = []
		param_index = 0
		
		# Build header component if template has header with variables
		if template_doc.header_type == "TEXT" and template_doc.header_text and header_var_count > 0:
			header_comp = {
				"type": "header",
				"parameters": []
			}
			# Add parameters for header variables
			for i in range(header_var_count):
				if param_index < len(param_values):
					header_comp["parameters"].append({
						"type": "text",
						"text": param_values[param_index]
					})
					param_index += 1
			components.append(header_comp)
		
		# Build body component with remaining parameters
		body_comp = {
			"type": "body",
			"parameters": []
		}
		# Add parameters for body variables
		for i in range(body_var_count):
			if param_index < len(param_values):
				body_comp["parameters"].append({
					"type": "text",
					"text": param_values[param_index]
				})
				param_index += 1
		components.append(body_comp)
		
		# Build template message payload - Digital Connect expects parameters with template info
		# Language must be a JSON object with "code" field
		payload = {
			"phone_number": phone_number,
			"type": "template",
			"parameters": {
				"name": template_doc.actual_name,
				"language": {
					"code": template_doc.language_code
				},
				"components": components
			}
		}
		
		url = f"{base_url}/v2/api/outgoing/message"
	else:
		# Plain text message
		if not body:
			frappe.throw(_("Message body is required for plain text messages."))
		
		payload = {
			"phone_number": phone_number,
			"type": "text",
			"parameters": {
				"body": body,
				"preview_url": bool(preview_url),
			},
		}
		
		url = settings.base_url
	
	try:
		response = requests.post(
			url,
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
		error_message = None
		if isinstance(data, dict):
			error_message = (
				data.get("message", {}).get("error", {}).get("message")
				or data.get("error", {}).get("message")
				or data.get("message")
				or str(data)
			)
		else:
			error_message = str(data)
		
		frappe.throw(
			_("Digital Connect returned HTTP {0}: {1}").format(
				response.status_code,
				error_message or data,
			)
		)

	return {
		"status": "success",
		"http_status": response.status_code,
		"response": data,
		"message_type": "template" if template_name else "text",
	}
