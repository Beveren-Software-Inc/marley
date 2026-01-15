# -*- coding: utf-8 -*-
# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _
from frappe.exceptions import DuplicateEntryError
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
		
		# Set default header if missing (to ensure 3+ components for Digital Connect)
		# Only set defaults for new templates or if header is completely empty
		if self.is_new() or (not self.header_type and not self.header_text):
			if not self.header_type:
				self.header_type = "TEXT"
			if not self.header_text and self.header_type == "TEXT":
				# Set a simple default header text
				self.header_text = "Notification"
		
		# Set default footer if missing (to ensure 3+ components for Digital Connect)
		if self.is_new() and not self.footer_text:
			self.footer_text = "Thank you"
		
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
		"""Skip automatic creation - user must manually register template via Register button."""
		# Don't automatically create in Digital Connect on save
		# User must click "Register" button to send for approval
		pass

	def on_update(self):
		"""Update template in Digital Connect when document is updated."""
		if self.is_new() or not self.template_id:
			return

		# Skip Digital Connect update if we're syncing from fetch
		# This prevents errors when syncing templates with fewer than 3 components
		if getattr(self, "_skip_digital_connect_update", False):
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

		# Digital Connect API requires at least 3 components for updates
		# If we have fewer, fetch existing template and merge components to meet requirement
		original_component_count = len(components)
		if len(components) < 3:
			try:
				# Fetch current template from Digital Connect to get all existing components
				fetch_url = f"{self._base_url}/v2/api/outgoing/template"
				fetch_params = {"name": self.actual_name, "language": self.language_code}
				fetch_response = requests.get(
					fetch_url, headers=self._headers, params=fetch_params, timeout=15
				)
				
				if fetch_response.ok:
					fetch_data = fetch_response.json()
					existing_templates = []
					if isinstance(fetch_data, dict):
						if "data" in fetch_data and isinstance(fetch_data.get("data"), list):
							existing_templates = fetch_data.get("data", [])
						elif "message" in fetch_data and isinstance(fetch_data.get("message"), dict):
							message_data = fetch_data.get("message", {})
							if "data" in message_data and isinstance(message_data.get("data"), list):
								existing_templates = message_data.get("data", [])
					
					# Find matching template
					for existing_template in existing_templates:
						if (
							existing_template.get("name") == self.actual_name
							and existing_template.get("language") == self.language_code
						):
							existing_components = existing_template.get("components", [])
							# Merge: use our updated components, but preserve any missing ones from existing
							# Create a map of component types we're updating
							our_component_types = {comp.get("type") for comp in components}
							
							# Add any existing components that we're not updating
							for existing_comp in existing_components:
								existing_comp_type = existing_comp.get("type")
								if existing_comp_type not in our_component_types:
									# We're not updating this component type, preserve it
									components.append(existing_comp)
							
							break
			except Exception as e:
				frappe.log_error(
					f"Failed to fetch existing template components for merge: {str(e)}",
					"Digital Connect Template Update"
				)

		# Validate we have at least 3 components
		if len(components) < 3:
			# If still less than 3 after merging, the original template might have had fewer than 3
			# Digital Connect API requires at least 3 components for updates
			component_types = [comp.get("type") for comp in components]
			missing = []
			if "HEADER" not in component_types:
				missing.append("HEADER")
			if "FOOTER" not in component_types:
				missing.append("FOOTER")
			if "BUTTONS" not in component_types:
				missing.append("BUTTONS")
			
			# Short error message to avoid truncation in Error Log (140 char limit)
			missing_str = ", ".join(missing) if missing else "HEADER, FOOTER, or BUTTONS"
			frappe.throw(
				_("Need 3+ components. Current: {0} ({1}). Add: {2}").format(
					len(components), 
					", ".join(component_types),
					missing_str
				)
			)

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
		status: Filter by status (PENDING, APPROVED, REJECTED, PAUSED).
			Note: Some Digital Connect tenants reject the `status` query param; in that case we retry
			without it and apply status filtering locally.
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
		# Ensure category is uppercase as per API docs (AUTHENTICATION, MARKETING, UTILITY)
		params["category"] = category.upper() if isinstance(category, str) else category
	if language:
		params["language"] = language
	if name:
		params["name_or_content"] = name
	# Per docs, `status` is supported, but some tenants return: "'status' is not allowed".
	# We'll attempt with status first, then retry without if needed.
	params_with_status = dict(params)
	if status:
		params_with_status["status"] = status

	headers = {
		"Content-Type": "application/json",
		"token": api_key,
	}

	if requests is None:
		frappe.throw(_("Python requests library is not available on this site."))

	try:
		# Log the request for debugging
		request_params = params_with_status if status else params
		frappe.log_error(
			f"Fetching templates - URL: {url}, Params: {request_params}",
			"Digital Connect Template Fetch Request"
		)
		
		response = requests.get(
			url, headers=headers, params=request_params, timeout=15
		)

		# Try to parse JSON / structured error even on non-2xx
		try:
			data = response.json()
		except Exception:
			# Fall back to raw text (may contain useful error details) or default structure
			data = response.text or {"data": [], "paging": {}}

		# If API returned an error, surface the message from Digital Connect
		if not response.ok:
			error_message = None
			if isinstance(data, dict):
				# Common Digital Connect error structure: { "error": { "message": "..." } }
				error_message = (
					data.get("error", {}).get("message")
					or data.get("message")
					or str(data)
				)
			else:
				error_message = str(data)

			# Adaptive fallback: some tenants don't allow filtering by status even though docs mention it.
			if (
				status
				and response.status_code == 400
				and "'status' is not allowed" in (error_message or "")
			):
				# Retry without status, then filter locally.
				response = requests.get(url, headers=headers, params=params, timeout=15)
				try:
					data = response.json()
				except Exception:
					data = response.text or {"data": [], "paging": {}}

				if not response.ok:
					error_message = None
					if isinstance(data, dict):
						error_message = (
							data.get("error", {}).get("message")
							or data.get("message")
							or str(data)
						)
					else:
						error_message = str(data)
					frappe.throw(
						_("Failed to fetch templates from Digital Connect (HTTP {0}): {1}").format(
							response.status_code, error_message
						)
					)
			else:
				frappe.throw(
					_("Failed to fetch templates from Digital Connect (HTTP {0}): {1}").format(
						response.status_code, error_message
					)
				)

		# Handle different response structures from Digital Connect API
		# Some tenants return: {"data": [...]}
		# Others return: {"message": {"data": [...]}}
		api_templates = []
		if isinstance(data, dict):
			# Try standard structure first: {"data": [...]}
			if "data" in data and isinstance(data.get("data"), list):
				api_templates = data.get("data", [])
			# Try nested structure: {"message": {"data": [...]}}
			elif "message" in data and isinstance(data.get("message"), dict):
				message_data = data.get("message", {})
				if "data" in message_data and isinstance(message_data.get("data"), list):
					api_templates = message_data.get("data", [])
			# If data is a list directly (unlikely but handle it)
			elif isinstance(data, list):
				api_templates = data
		
		# If we still couldn't find templates, log for debugging
		if not api_templates and isinstance(data, dict):
			frappe.log_error(
				f"Could not extract templates from response. Response keys: {list(data.keys()) if isinstance(data, dict) else 'N/A'}",
				"Digital Connect Template Fetch"
			)

		# If status filter was requested, apply it locally after fetching (works for both paths).
		if status:
			templates = [t for t in api_templates if isinstance(t, dict) and t.get("status") == status]
		else:
			templates = api_templates

		# Debug: Log how many templates were found
		total_templates = len(api_templates)
		filtered_templates = len(templates)
		frappe.log_error(
			f"Template fetch: Total from API: {total_templates}, After status filter: {filtered_templates}, "
			f"Category filter: {category or 'ALL'}, Status filter: {status or 'ALL'}",
			"Digital Connect Template Fetch Debug"
		)

		# If no templates found, provide helpful feedback with more details
		if not templates:
			response_info = f"Category: {category or 'ALL'}, Status: {status or 'ALL'}, Language: {language or 'ALL'}, Name: {name or 'ALL'}"
			# Show the actual response structure for debugging
			debug_info = f"API returned {total_templates} template(s) total."
			if total_templates > 0 and status:
				debug_info += f" After filtering by status='{status}', {filtered_templates} template(s) remain."
			
			frappe.msgprint(
				_("No templates found matching the filters. {0} {1}").format(response_info, debug_info),
				indicator="orange",
			)
			# Still return success but with 0 count
			return {"status": "success", "synced_count": 0, "data": data, "message": "No templates found", "total_from_api": total_templates}

		# Process templates and sync to local database
		synced_count = 0
		skipped_count = 0
		for template in templates:
			# Check if template exists locally - check by actual_name + language_code
			# Also check by generated name (template_name-language_code) to catch duplicates
			template_name = template.get("name")
			language_code = template.get("language", "en_US")
			
			if not template_name:
				frappe.log_error(
					f"Skipping template with missing name. Template data: {str(template)[:200]}",
					"Digital Connect Template Fetch"
				)
				skipped_count += 1
				continue
			
			# Check by actual_name and language_code
			filters = {"actual_name": template_name}
			if language_code:
				filters["language_code"] = language_code
			
			existing = frappe.db.get_value("Digital Whatsapp Template", filters)
			
			# Also check by generated name format (template_name-language_code)
			if not existing:
				generated_name = f"{template_name}-{language_code}"
				existing = frappe.db.get_value("Digital Whatsapp Template", generated_name)
			
			# Also check by template_id if available
			if not existing and template.get("id"):
				existing = frappe.db.get_value("Digital Whatsapp Template", {"template_id": template.get("id")})

			if existing:
				# Template already exists - just update it and skip
				try:
					doc = frappe.get_doc("Digital Whatsapp Template", existing)
					# Set a flag to indicate we're syncing from fetch (skip Digital Connect update)
					doc._skip_digital_connect_update = True
					doc.status = _extract_and_validate_status(template.get("status"))
					doc.template_id = template.get("id")
					doc.category = template.get("category")
					# Update components if available
					if template.get("components"):
						update_template_components(doc, template.get("components"))
					doc.save(ignore_permissions=True)
					synced_count += 1
				except Exception as e:
					# If update fails, just skip - template already exists
					frappe.log_error(
						f"Skipped updating existing template {template_name}: {str(e)}",
						"Digital Connect Template Fetch"
					)
					skipped_count += 1
				continue
			
			# Create new template
			try:
				doc = frappe.new_doc("Digital Whatsapp Template")
				# Set flag to skip Digital Connect updates during fetch sync
				doc._skip_digital_connect_update = True
				doc.template_name = template_name
				doc.actual_name = template_name
				doc.status = _extract_and_validate_status(template.get("status"))
				doc.template_id = template.get("id")  # Set ID before insert to skip after_insert hook
				doc.category = template.get("category") or "UTILITY"  # Default category if missing
				doc.language_code = language_code
				# Set language from language code
				lang_code = language_code.replace("_", "-")
				lang_doc = frappe.db.get_value("Language", {"language_code": lang_code})
				if lang_doc:
					doc.language = lang_doc
				# Update components
				if template.get("components"):
					update_template_components(doc, template.get("components"))
				doc.insert(ignore_permissions=True)
				synced_count += 1
			except frappe.exceptions.DuplicateEntryError:
				# Template already exists (duplicate key) - just skip it
				skipped_count += 1
				continue
			except Exception as e:
				# Other errors - log and skip
				frappe.log_error(
					f"Failed to create template {template_name}: {str(e)}",
					"Digital Connect Template Fetch"
				)
				skipped_count += 1
				continue

		# Show summary message
		if synced_count > 0:
			msg = _("Successfully fetched and synced {0} template(s) from Digital Connect.").format(synced_count)
			if skipped_count > 0:
				msg += " " + _("{0} template(s) skipped (already exist).").format(skipped_count)
			frappe.msgprint(msg, indicator="green")
		elif skipped_count > 0:
			frappe.msgprint(
				_("All {0} template(s) already exist locally. No new templates created.").format(skipped_count),
				indicator="blue",
			)

		return {"status": "success", "synced_count": synced_count, "skipped_count": skipped_count, "data": data}

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


def _extract_and_validate_status(status_value):
	"""Extract and validate template status from API response.
	
	Args:
		status_value: Status value from API (could be string, int, or None)
	
	Returns:
		Valid status string: "", "PENDING", "APPROVED", "REJECTED", or "PAUSED"
	"""
	allowed_statuses = ["", "PENDING", "APPROVED", "REJECTED", "PAUSED"]
	
	if not status_value:
		return "PENDING"
	
	# Convert to string and check if it's a valid status
	status_str = str(status_value).strip().upper()
	
	# If it's a number (like HTTP status code 200), return PENDING
	if status_str.isdigit():
		return "PENDING"
	
	# Check if it matches an allowed status (case-insensitive)
	for allowed in allowed_statuses:
		if status_str == allowed.upper():
			return allowed
	
	# If not valid, default to PENDING
	return "PENDING"


@frappe.whitelist()
def register_template(template_name):
	"""Register a template in Digital Connect (send for approval).
	
	Args:
		template_name: Name of the template document to register
	"""
	doc = frappe.get_doc("Digital Whatsapp Template", template_name)
	
	# Check if already registered
	if doc.template_id:
		frappe.throw(_("Template is already registered in Digital Connect. Template ID: {0}").format(doc.template_id))
	
	# Validate required fields
	if not doc.actual_name:
		if doc.template_name:
			doc.actual_name = doc.template_name.lower().replace(" ", "_").replace("-", "_")
		else:
			frappe.throw(_("Template name is required."))
	
	if not doc.language_code:
		frappe.throw(_("Language code is required."))
	
	if not doc.category:
		frappe.throw(_("Category is required."))
	
	if not doc.body_text:
		frappe.throw(_("Body text is required."))
	
	# Get settings
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
	
	headers = {
		"Content-Type": "application/json",
		"token": api_key,
	}
	
	if requests is None:
		frappe.throw(_("Python requests library is not available on this site."))
	
	# Build components
	components = doc.build_components()
	
	# Validate we have at least 3 components (API requirement)
	if len(components) < 3:
		# Show what components are present and what's missing
		component_types = [comp.get("type") for comp in components]
		missing = []
		
		if "HEADER" not in component_types:
			if not doc.header_type:
				missing.append("HEADER (set Header Type and Header Text)")
			else:
				missing.append("HEADER (complete header configuration)")
		
		if "FOOTER" not in component_types:
			if not doc.footer_text:
				missing.append("FOOTER (set Footer Text)")
			else:
				missing.append("FOOTER")
		
		if "BUTTONS" not in component_types:
			if not doc.buttons or len(doc.buttons) == 0:
				missing.append("BUTTONS (add at least one button)")
			else:
				missing.append("BUTTONS (complete button configuration)")
		
		needed_count = 3 - len(components)
		missing_list = missing[:needed_count]
		missing_str = " or ".join(missing_list) if len(missing_list) > 1 else missing_list[0] if missing_list else ""
		
		error_msg = _(
			"Digital Connect requires at least 3 components. "
			"Current components ({0}): {1}. "
			"Please add at least {2} more component(s): {3}"
		).format(
			len(components),
			", ".join(component_types),
			needed_count,
			missing_str
		)
		
		frappe.throw(error_msg)
	
	# First, check if template already exists in Digital Connect
	try:
		check_url = f"{base_url}/v2/api/outgoing/template"
		check_params = {
			"name": doc.actual_name,
			"language": doc.language_code,
		}
		check_response = requests.get(
			check_url, headers=headers, params=check_params, timeout=15
		)
		
		if check_response.ok:
			try:
				check_data = check_response.json()
				existing_templates = []
				if isinstance(check_data, dict):
					if "data" in check_data and isinstance(check_data.get("data"), list):
						existing_templates = check_data.get("data", [])
					elif "message" in check_data and isinstance(check_data.get("message"), dict):
						message_data = check_data.get("message", {})
						if "data" in message_data and isinstance(message_data.get("data"), list):
							existing_templates = message_data.get("data", [])
				
				# Find matching template
				for existing_template in existing_templates:
					if (
						existing_template.get("name") == doc.actual_name
						and existing_template.get("language") == doc.language_code
					):
						# Link to existing template
						doc.template_id = existing_template.get("id")
						doc.status = existing_template.get("status", "PENDING")
						if existing_template.get("category") and not doc.category:
							doc.category = existing_template.get("category")
						if existing_template.get("components"):
							update_template_components(doc, existing_template.get("components"))
						doc.save(ignore_permissions=True)
						frappe.msgprint(
							_("Template linked to existing Digital Connect template. Status: {0}").format(doc.status),
							indicator="blue",
						)
						return {"status": "linked", "template_id": doc.template_id, "status": doc.status}
			except Exception:
				pass
	except Exception:
		pass
	
	# Create new template in Digital Connect
	payload = {
		"name": doc.actual_name,
		"language": doc.language_code,
		"category": doc.category,
		"components": components,
	}
	
	if doc.allow_category_change:
		payload["allow_category_change"] = True
	
	try:
		response = requests.post(
			f"{base_url}/v2/api/outgoing/template",
			headers=headers,
			data=json.dumps(payload),
			timeout=15,
		)
		
		if not response.ok:
			try:
				error_data = response.json()
				error_message = (
					error_data.get("message", {}).get("error", {}).get("message")
					or error_data.get("error", {}).get("message")
					or error_data.get("message")
					or str(error_data)
				)
			except Exception:
				error_message = response.text
			
			frappe.throw(
				_("Failed to register template in Digital Connect (HTTP {0}): {1}").format(
					response.status_code, error_message
				)
			)
		
		response_data = response.json()
		
		# Extract template ID and status from response
		# Handle different response structures
		template_id = None
		template_status = None
		
		# Try to extract from nested message structure first
		if isinstance(response_data, dict):
			if "message" in response_data and isinstance(response_data.get("message"), dict):
				message_data = response_data.get("message", {})
				template_id = message_data.get("id") or response_data.get("id")
				template_status = message_data.get("status") or response_data.get("status")
			else:
				template_id = response_data.get("id")
				template_status = response_data.get("status")
		
		# Validate and set status
		doc.template_id = template_id
		doc.status = _extract_and_validate_status(template_status)
		doc.save(ignore_permissions=True)
		
		frappe.msgprint(
			_("Template registered successfully in Digital Connect. Status: {0}").format(doc.status),
			indicator="green",
		)
		
		return {"status": "success", "template_id": doc.template_id, "status": doc.status}
		
	except requests.exceptions.RequestException as e:
		# Check if error is about template already existing
		error_str = str(e)
		if "already" in error_str.lower() or "duplicate" in error_str.lower() or "100" in error_str:
			# Try to fetch and link it
			try:
				check_url = f"{base_url}/v2/api/outgoing/template"
				check_params = {"name": doc.actual_name, "language": doc.language_code}
				check_response = requests.get(
					check_url, headers=headers, params=check_params, timeout=15
				)
				if check_response.ok:
					check_data = check_response.json()
					existing_templates = []
					if isinstance(check_data, dict):
						if "data" in check_data and isinstance(check_data.get("data"), list):
							existing_templates = check_data.get("data", [])
						elif "message" in check_data and isinstance(check_data.get("message"), dict):
							message_data = check_data.get("message", {})
							if "data" in message_data and isinstance(message_data.get("data"), list):
								existing_templates = message_data.get("data", [])
					
					for existing_template in existing_templates:
						if (
							existing_template.get("name") == doc.actual_name
							and existing_template.get("language") == doc.language_code
						):
							doc.template_id = existing_template.get("id")
							doc.status = _extract_and_validate_status(existing_template.get("status"))
							if existing_template.get("category") and not doc.category:
								doc.category = existing_template.get("category")
							if existing_template.get("components"):
								update_template_components(doc, existing_template.get("components"))
							doc.save(ignore_permissions=True)
							frappe.msgprint(
								_("Template already exists in Digital Connect. Linked to existing template. Status: {0}").format(doc.status),
								indicator="blue",
							)
							return {"status": "linked", "template_id": doc.template_id, "status": doc.status}
			except Exception:
				pass
		
		frappe.throw(_("Failed to register template: {0}").format(str(e)))


@frappe.whitelist()
def delete_template(template_name):
	"""Delete a template from Digital Connect.
	
	Args:
		template_name: Name of the template document to delete
	"""
	doc = frappe.get_doc("Digital Whatsapp Template", template_name)
	
	if not doc.template_id:
		frappe.throw(_("Template is not registered in Digital Connect. Nothing to delete."))
	
	if not doc.actual_name:
		frappe.throw(_("Template actual_name is required for deletion."))
	
	# Get settings
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
	
	headers = {
		"Content-Type": "application/json",
		"token": api_key,
	}
	
	if requests is None:
		frappe.throw(_("Python requests library is not available on this site."))
	
	try:
		url = f"{base_url}/v2/api/outgoing/template?name={doc.actual_name}"
		response = requests.delete(url, headers=headers, timeout=15)
		
		if not response.ok:
			try:
				error_data = response.json()
				error_message = (
					error_data.get("message", {}).get("error", {}).get("message")
					or error_data.get("error", {}).get("message")
					or error_data.get("message")
					or str(error_data)
				)
			except Exception:
				error_message = response.text
			
			# If template not found, still consider it successful (already deleted)
			if "not found" in error_message.lower() or response.status_code == 404:
				# Clear local template_id and status
				doc.template_id = ""
				doc.status = ""
				doc.save(ignore_permissions=True)
				return {"status": "success", "message": "Template not found in Digital Connect. Cleared local reference."}
			
			frappe.throw(
				_("Failed to delete template from Digital Connect (HTTP {0}): {1}").format(
					response.status_code, error_message
				)
			)
		
		# Clear local template_id and status
		doc.template_id = ""
		doc.status = ""
		doc.save(ignore_permissions=True)
		
		return {"status": "success", "message": "Template deleted successfully from Digital Connect."}
		
	except requests.exceptions.RequestException as e:
		frappe.throw(_("Failed to delete template: {0}").format(str(e)))


@frappe.whitelist()
def update_template(template_name):
	"""Update a template in Digital Connect.
	
	Args:
		template_name: Name of the template document to update
	"""
	doc = frappe.get_doc("Digital Whatsapp Template", template_name)
	
	if not doc.template_id:
		frappe.throw(_("Template is not registered in Digital Connect. Please register it first."))
	
	# Only update if template is in editable status
	if doc.status not in ["APPROVED", "REJECTED", "PAUSED"]:
		frappe.throw(
			_("Template can only be edited when status is APPROVED, REJECTED, or PAUSED. Current status: {0}").format(doc.status)
		)
	
	# Use the existing on_update logic by calling it programmatically
	# But we need to trigger it manually since we're calling from a whitelisted function
	doc.get_settings()
	components = doc.build_components()
	
	# Digital Connect API requires at least 3 components for updates
	# If we have fewer, fetch existing template and merge components to meet requirement
	original_component_count = len(components)
	if len(components) < 3:
		try:
			# Fetch current template from Digital Connect to get all existing components
			fetch_url = f"{doc._base_url}/v2/api/outgoing/template"
			fetch_params = {"name": doc.actual_name, "language": doc.language_code}
			fetch_response = requests.get(
				fetch_url, headers=doc._headers, params=fetch_params, timeout=15
			)
			
			if fetch_response.ok:
				fetch_data = fetch_response.json()
				existing_templates = []
				if isinstance(fetch_data, dict):
					if "data" in fetch_data and isinstance(fetch_data.get("data"), list):
						existing_templates = fetch_data.get("data", [])
					elif "message" in fetch_data and isinstance(fetch_data.get("message"), dict):
						message_data = fetch_data.get("message", {})
						if "data" in message_data and isinstance(message_data.get("data"), list):
							existing_templates = message_data.get("data", [])
				
				# Find matching template
				for existing_template in existing_templates:
					if (
						existing_template.get("name") == doc.actual_name
						and existing_template.get("language") == doc.language_code
					):
						existing_components = existing_template.get("components", [])
						# Merge: use our updated components, but preserve any missing ones from existing
						# Create a map of component types we're updating
						our_component_types = {comp.get("type") for comp in components}
						
						# Add any existing components that we're not updating
						for existing_comp in existing_components:
							existing_comp_type = existing_comp.get("type")
							if existing_comp_type not in our_component_types:
								# We're not updating this component type, preserve it
								components.append(existing_comp)
						
						break
		except Exception as e:
			frappe.log_error(
				f"Failed to fetch existing template components for merge: {str(e)}",
				"Digital Connect Template Update"
			)

	# Validate we have at least 3 components
	if len(components) < 3:
		# If still less than 3 after merging, the original template might have had fewer than 3
		# Digital Connect API requires at least 3 components for updates
		component_types = [comp.get("type") for comp in components]
		missing = []
		if "HEADER" not in component_types:
			if not doc.header_type:
				missing.append("HEADER (set Header Type and Header Text)")
			else:
				missing.append("HEADER (complete header configuration)")
		if "FOOTER" not in component_types:
			if not doc.footer_text:
				missing.append("FOOTER (set Footer Text)")
			else:
				missing.append("FOOTER")
		if "BUTTONS" not in component_types:
			if not doc.buttons or len(doc.buttons) == 0:
				missing.append("BUTTONS (add at least one button)")
			else:
				missing.append("BUTTONS (complete button configuration)")
		
		needed_count = 3 - len(components)
		missing_list = missing[:needed_count]
		missing_str = " or ".join(missing_list) if len(missing_list) > 1 else missing_list[0] if missing_list else ""
		
		error_msg = _(
			"Digital Connect requires at least 3 components. "
			"Current components ({0}): {1}. "
			"Please add at least {2} more component(s): {3}"
		).format(
			len(components),
			", ".join(component_types),
			needed_count,
			missing_str
		)
		
		frappe.throw(error_msg)

	payload = {
		"templateId": doc.template_id,
		"templateDetails": {
			"components": components,
		},
	}

	# Can only change category if template is not approved
	if doc.status != "APPROVED":
		payload["templateDetails"]["category"] = doc.category

	try:
		response = doc.make_api_request("PUT", f"{doc._base_url}/v2/api/outgoing/template", payload)
		# After update, status might change to PENDING for review
		doc.status = "PENDING"
		doc.save(ignore_permissions=True)
		
		return {"status": "success", "message": "Template updated successfully. It will be reviewed again."}
	except Exception as e:
		frappe.throw(_("Failed to update template: {0}").format(str(e)))


@frappe.whitelist()
def get_template_library(category=None, language=None):
	"""Get template library from Digital Connect.
	
	Args:
		category: Filter by category (AUTHENTICATION, MARKETING, UTILITY)
		language: Filter by language code
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
	
	# Template library endpoint (assuming it exists - adjust if different)
	# If Digital Connect doesn't have a library endpoint, we can use the regular template endpoint
	url = f"{base_url}/v2/api/outgoing/template/library"
	
	headers = {
		"Content-Type": "application/json",
		"token": api_key,
	}
	
	if requests is None:
		frappe.throw(_("Python requests library is not available on this site."))
	
	# Build query parameters
	params = {}
	if category:
		params["category"] = category.upper() if isinstance(category, str) else category
	if language:
		params["language"] = language
	
	try:
		response = requests.get(url, headers=headers, params=params, timeout=15)
		
		# If library endpoint doesn't exist, fall back to regular template endpoint
		if response.status_code == 404:
			# Try regular template endpoint instead
			url = f"{base_url}/v2/api/outgoing/template"
			response = requests.get(url, headers=headers, params=params, timeout=15)
		
		if not response.ok:
			try:
				error_data = response.json()
				error_message = (
					error_data.get("message", {}).get("error", {}).get("message")
					or error_data.get("error", {}).get("message")
					or error_data.get("message")
					or str(error_data)
				)
			except Exception:
				error_message = response.text
			
			frappe.throw(
				_("Failed to get template library from Digital Connect (HTTP {0}): {1}").format(
					response.status_code, error_message
				)
			)
		
		data = response.json()
		
		# Extract templates from response (handle different structures)
		templates = []
		if isinstance(data, dict):
			if "data" in data and isinstance(data.get("data"), list):
				templates = data.get("data", [])
			elif "message" in data and isinstance(data.get("message"), dict):
				message_data = data.get("message", {})
				if "data" in message_data and isinstance(message_data.get("data"), list):
					templates = message_data.get("data", [])
			elif "templates" in data and isinstance(data.get("templates"), list):
				templates = data.get("templates", [])
		
		return {"status": "success", "templates": templates}
		
	except requests.exceptions.RequestException as e:
		frappe.throw(_("Failed to get template library: {0}").format(str(e)))
