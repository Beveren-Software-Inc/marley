# -*- coding: utf-8 -*-
# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _
from frappe.model.document import Document

try:
	import requests
except ImportError:
	requests = None


class DigitalWhatsappTemplate(Document):
	"""Digital WhatsApp Template DocType."""

	def autoname(self):
		"""Auto-generate name from template_name and language_code."""
		if self.template_name and self.language_code:
			self.name = f"{self.template_name}-{self.language_code}"
		elif self.template_name:
			# If language_code not set yet, use template_name only
			self.name = self.template_name

	def validate(self):
		"""Validate template before save."""
		# Set language code from language
		if not self.language_code or self.has_value_changed("language"):
			lang_code = frappe.db.get_value("Language", self.language) or "en"
			# Convert to format like en_US
			if "-" in lang_code:
				self.language_code = lang_code.replace("-", "_")
			elif "_" not in lang_code:
				# If just "en", default to "en_US"
				self.language_code = f"{lang_code}_US"
			else:
				self.language_code = lang_code

		# Generate actual_name from template_name
		if self.template_name and (not self.actual_name or self.has_value_changed("template_name")):
			self.actual_name = self.template_name.lower().replace(" ", "_").replace("-", "_")
		
		# Update name if language_code changed
		if self.template_name and self.language_code:
			new_name = f"{self.template_name}-{self.language_code}"
			if self.name != new_name:
				self.name = new_name

		# Validate body text length
		if self.body_text and len(self.body_text) > 1024:
			frappe.throw(_("Body text cannot exceed 1024 characters."))

		# Validate template name length
		if self.actual_name and len(self.actual_name) > 512:
			frappe.throw(_("Template name cannot exceed 512 characters."))

		# Validate footer length
		if self.footer_text and len(self.footer_text) > 60:
			frappe.throw(_("Footer text cannot exceed 60 characters."))

	def after_insert(self):
		"""Create template in Digital Connect after insert."""
		if not self.actual_name:
			self.actual_name = self.template_name.lower().replace(" ", "_").replace("-", "_")

		self.get_settings()
		components = self.build_components()

		payload = {
			"name": self.actual_name,
			"language": self.language_code,
			"category": self.category,
			"components": components,
		}

		if self.allow_category_change:
			payload["allow_category_change"] = True

		try:
			response = self.make_api_request("POST", f"{self._base_url}/v2/api/outgoing/template", payload)
			self.template_id = response.get("id")
			self.status = response.get("status", "PENDING")
			self.db_update()
			frappe.msgprint(
				_("Template created successfully. Status: {0}").format(self.status),
				indicator="green",
			)
		except Exception as e:
			frappe.throw(_("Failed to create template: {0}").format(str(e)))

	def on_update(self):
		"""Update template in Digital Connect when document is updated."""
		if self.is_new() or not self.template_id:
			return

		# Only update if template is in editable status
		if self.status not in ["APPROVED", "REJECTED", "PAUSED"]:
			frappe.msgprint(
				_("Template can only be edited when status is APPROVED, REJECTED, or PAUSED."),
				indicator="orange",
			)
			return

		self.get_settings()
		components = self.build_components()

		payload = {
			"templateId": self.template_id,
			"templateDetails": {
				"components": components,
			},
		}

		# Can only change category if template is not approved
		if self.status != "APPROVED":
			payload["templateDetails"]["category"] = self.category

		try:
			response = self.make_api_request("PUT", f"{self._base_url}/v2/api/outgoing/template", payload)
			# After update, status might change to PENDING for review
			frappe.msgprint(
				_("Template updated successfully. It will be reviewed again."),
				indicator="green",
			)
		except Exception as e:
			frappe.throw(_("Failed to update template: {0}").format(str(e)))

	def on_trash(self):
		"""Delete template from Digital Connect when document is deleted."""
		if not self.template_id:
			return

		self.get_settings()
		try:
			self.make_api_request(
				"DELETE",
				f"{self._base_url}/v2/api/outgoing/template?name={self.actual_name}",
				None,
			)
			frappe.msgprint(_("Template deleted successfully from Digital Connect."), indicator="green")
		except Exception as e:
			# If template not found on API, still allow local deletion
			if "not found" in str(e).lower() or "404" in str(e):
				frappe.msgprint(
					_("Template not found on Digital Connect. Deleted locally only."),
					indicator="orange",
				)
			else:
				frappe.throw(_("Failed to delete template: {0}").format(str(e)))

	def build_components(self):
		"""Build components array for API request."""
		components = []

		# Add header if exists
		if self.header_type:
			header = self.build_header_component()
			if header:
				components.append(header)

		# Add body (required)
		body = {
			"type": "BODY",
			"text": self.body_text,
		}

		# Add body example if sample values provided
		if self.body_sample_values:
			sample_values = [v.strip() for v in self.body_sample_values.split(",")]
			body["example"] = {"body_text": [sample_values]}

		components.append(body)

		# Add footer if exists
		if self.footer_text:
			components.append({"type": "FOOTER", "text": self.footer_text})

		# Add buttons if exists
		if self.buttons:
			button_components = self.build_button_components()
			if button_components:
				components.append(button_components)

		return components

	def build_header_component(self):
		"""Build header component based on header type."""
		if not self.header_type:
			return None

		header = {"type": "HEADER"}

		if self.header_type == "TEXT":
			header["format"] = "TEXT"
			header["text"] = self.header_text

			# Add example if sample values provided
			if self.header_sample_values:
				sample_values = [v.strip() for v in self.header_sample_values.split(",")]
				header["example"] = {"header_text": sample_values}
		else:
			# For IMAGE, VIDEO, DOCUMENT
			header["format"] = self.header_type
			# Note: Media upload would need to be handled separately
			# For now, we'll just set the format
			# In a full implementation, you'd need to upload media first and get handle
			if self.header_media:
				frappe.msgprint(
					_("Media header upload not yet implemented. Please use TEXT header for now."),
					indicator="orange",
				)

		return header

	def build_button_components(self):
		"""Build buttons component from child table."""
		if not self.buttons:
			return None

		buttons = []
		for button in self.buttons:
			button_obj = {
				"type": button.button_type,
				"text": button.button_text,
			}

			if button.button_type == "URL":
				url_obj = {}
				if button.url:
					url_obj["base_url"] = button.url
				if button.url_suffix_example:
					url_obj["url_suffix_example"] = button.url_suffix_example
				if url_obj:
					button_obj["url"] = url_obj

			elif button.button_type == "PHONE_NUMBER":
				if button.phone_number:
					button_obj["phone_number"] = button.phone_number

			elif button.button_type == "OTP":
				if button.otp_type:
					button_obj["otp_type"] = button.otp_type
				if button.otp_type == "ZERO_TAP" and button.zero_tap_terms_accepted:
					button_obj["zero_tap_terms_accepted"] = True

			buttons.append(button_obj)

		return {"type": "BUTTONS", "buttons": buttons}

	def get_settings(self):
		"""Get Digital Connect WhatsApp settings."""
		settings = frappe.get_single("Digital Connect Whatsap Settings")

		if not settings.enable:
			frappe.throw(_("Digital Connect WhatsApp integration is disabled."))

		api_key = settings.get_password("api_key")

		if not settings.base_url or not api_key:
			frappe.throw(_("Base URL and API Key are required in Digital Connect Whatsap Settings."))

		# Extract base URL - remove /v2/api/outgoing/message or /v2/api/outgoing/template
		base_url = settings.base_url
		if "/v2/api/outgoing/" in base_url:
			base_url = base_url.split("/v2/api/outgoing/")[0]
		self._base_url = base_url.rstrip("/")
		self._api_key = api_key
		self._headers = {
			"Content-Type": "application/json",
			"token": api_key,
		}

	def make_api_request(self, method, url, payload=None):
		"""Make API request to Digital Connect."""
		if requests is None:
			frappe.throw(_("Python requests library is not available on this site."))

		try:
			if method == "GET":
				response = requests.get(url, headers=self._headers, timeout=15)
			elif method == "POST":
				response = requests.post(
					url,
					headers=self._headers,
					data=json.dumps(payload) if payload else None,
					timeout=15,
				)
			elif method == "PUT":
				response = requests.put(
					url,
					headers=self._headers,
					data=json.dumps(payload) if payload else None,
					timeout=15,
				)
			elif method == "DELETE":
				response = requests.delete(url, headers=self._headers, timeout=15)
			else:
				frappe.throw(_("Unsupported HTTP method: {0}").format(method))

			# Try to parse JSON response
			try:
				data = response.json()
			except Exception:
				data = response.text

			if not response.ok:
				error_msg = data.get("error", {}).get("message", str(data)) if isinstance(data, dict) else str(data)
				frappe.throw(
					_("Digital Connect API returned HTTP {0}: {1}").format(
						response.status_code, error_msg
					)
				)

			return data

		except requests.exceptions.RequestException as e:
			frappe.throw(_("Failed to call Digital Connect API: {0}").format(str(e)))


@frappe.whitelist()
def fetch_templates(category=None, status=None, language=None, name=None):
	"""Fetch templates from Digital Connect API.

	Args:
		category: Filter by category (AUTHENTICATION, MARKETING, UTILITY)
		status: Filter by status (PENDING, APPROVED, REJECTED, PAUSED)
		language: Filter by language code
		name: Filter by template name or content
	"""
	settings = frappe.get_single("Digital Connect Whatsap Settings")

	if not settings.enable:
		frappe.throw(_("Digital Connect WhatsApp integration is disabled."))

	api_key = settings.get_password("api_key")

	if not settings.base_url or not api_key:
		frappe.throw(_("Base URL and API Key are required in Digital Connect Whatsap Settings."))

	# Extract base URL
	base_url = settings.base_url
	if "/v2/api/outgoing/" in base_url:
		base_url = base_url.split("/v2/api/outgoing/")[0]
	base_url = base_url.rstrip("/")
	url = f"{base_url}/v2/api/outgoing/template"

	# Build query parameters
	params = {}
	if category:
		params["category"] = category
	if status:
		params["status"] = status
	if language:
		params["language"] = language
	if name:
		params["name_or_content"] = name

	headers = {
		"Content-Type": "application/json",
		"token": api_key,
	}

	if requests is None:
		frappe.throw(_("Python requests library is not available on this site."))

	try:
		response = requests.get(url, headers=headers, params=params, timeout=15)
		response.raise_for_status()

		try:
			data = response.json()
		except Exception:
			data = {"data": [], "paging": {}}

		# Process templates and sync to local database
		synced_count = 0
		for template in data.get("data", []):
			# Check if template exists locally
			filters = {"actual_name": template.get("name")}
			if template.get("language"):
				filters["language_code"] = template.get("language")

			existing = frappe.db.get_value("Digital Whatsapp Template", filters)

			if existing:
				# Update existing template
				doc = frappe.get_doc("Digital Whatsapp Template", existing)
				doc.status = template.get("status", "PENDING")
				doc.template_id = template.get("id")
				doc.category = template.get("category")
				# Update components if available
				if template.get("components"):
					update_template_components(doc, template.get("components"))
				doc.save(ignore_permissions=True)
			else:
				# Create new template
				doc = frappe.new_doc("Digital Whatsapp Template")
				doc.template_name = template.get("name", "Unknown")
				doc.actual_name = template.get("name")
				doc.status = template.get("status", "PENDING")
				doc.template_id = template.get("id")
				doc.category = template.get("category")
				doc.language_code = template.get("language", "en_US")
				# Set language from language code
				lang_code = template.get("language", "en_US").replace("_", "-")
				lang_doc = frappe.db.get_value("Language", {"language_code": lang_code})
				if lang_doc:
					doc.language = lang_doc
				# Update components
				if template.get("components"):
					update_template_components(doc, template.get("components"))
				doc.insert(ignore_permissions=True)

			synced_count += 1

		frappe.msgprint(
			_("Successfully fetched and synced {0} template(s) from Digital Connect.").format(
				synced_count
			),
			indicator="green",
		)

		return {"status": "success", "synced_count": synced_count, "data": data}

	except requests.exceptions.RequestException as e:
		frappe.throw(_("Failed to fetch templates from Digital Connect: {0}").format(str(e)))


def update_template_components(doc, components):
	"""Update template document with components from API response."""
	for component in components:
		if component.get("type") == "HEADER":
			doc.header_type = component.get("format", "TEXT")
			if component.get("format") == "TEXT" and component.get("text"):
				doc.header_text = component.get("text")
				if component.get("example", {}).get("header_text"):
					doc.header_sample_values = ",".join(component.get("example", {}).get("header_text"))

		elif component.get("type") == "BODY":
			if component.get("text"):
				doc.body_text = component.get("text")
			if component.get("example", {}).get("body_text"):
				sample_values = component.get("example", {}).get("body_text", [])
				if sample_values and len(sample_values) > 0:
					doc.body_sample_values = ",".join(sample_values[0])

		elif component.get("type") == "FOOTER":
			if component.get("text"):
				doc.footer_text = component.get("text")

		elif component.get("type") == "BUTTONS":
			# Clear existing buttons
			doc.buttons = []
			for button in component.get("buttons", []):
				button_row = doc.append("buttons", {})
				button_row.button_type = button.get("type")
				button_row.button_text = button.get("text")
				if button.get("url"):
					if isinstance(button.get("url"), dict):
						button_row.url = button.get("url", {}).get("base_url")
						button_row.url_suffix_example = button.get("url", {}).get("url_suffix_example")
					else:
						button_row.url = button.get("url")
				if button.get("phone_number"):
					button_row.phone_number = button.get("phone_number")
				if button.get("otp_type"):
					button_row.otp_type = button.get("otp_type")
				if button.get("zero_tap_terms_accepted"):
					button_row.zero_tap_terms_accepted = button.get("zero_tap_terms_accepted")


@frappe.whitelist()
def get_template_insights(template_id, start_date, end_date, granularity="DAILY"):
	"""Get template insights/analytics from Digital Connect API.

	Args:
		template_id: Template ID
		start_date: Start date (format: DD-MM-YYYY)
		end_date: End date (format: DD-MM-YYYY)
		granularity: Granularity (DAILY)
	"""
	settings = frappe.get_single("Digital Connect Whatsap Settings")

	if not settings.enable:
		frappe.throw(_("Digital Connect WhatsApp integration is disabled."))

	api_key = settings.get_password("api_key")

	if not settings.base_url or not api_key:
		frappe.throw(_("Base URL and API Key are required in Digital Connect Whatsap Settings."))

	# Extract base URL
	base_url = settings.base_url
	if "/v2/api/outgoing/" in base_url:
		base_url = base_url.split("/v2/api/outgoing/")[0]
	base_url = base_url.rstrip("/")
	url = f"{base_url}/v2/api/outgoing/template/insights"

	params = {
		"fields": "analytics",
		"start": start_date,
		"end": end_date,
		"granularity": granularity,
	}

	headers = {
		"Content-Type": "application/json",
		"token": api_key,
	}

	if requests is None:
		frappe.throw(_("Python requests library is not available on this site."))

	try:
		response = requests.get(url, headers=headers, params=params, timeout=15)
		response.raise_for_status()

		try:
			data = response.json()
		except Exception:
			data = response.text

		return {"status": "success", "data": data}

	except requests.exceptions.RequestException as e:
		frappe.throw(_("Failed to get template insights: {0}").format(str(e)))
