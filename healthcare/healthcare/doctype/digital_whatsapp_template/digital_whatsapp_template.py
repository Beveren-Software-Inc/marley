# -*- coding: utf-8 -*-
# Copyright (c) 2026, Healthcare and contributors
# For license information, please see license.txt

import json
import re

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
		# Set language code from language, but don't overwrite an explicitly-set value
		if not self.language_code or (
			self.has_value_changed("language") and not self.has_value_changed("language_code")
		):
			lang_code = frappe.db.get_value("Language", self.language, "language_code") or self.language or "en"
			# WhatsApp uses underscores (en_US) while Frappe uses hyphens (en-US)
			if "-" in lang_code:
				self.language_code = lang_code.replace("-", "_")
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


def _get_digital_connect_settings():
	"""Get and validate Digital Connect settings.
	
	Returns:
		tuple: (settings, api_key, base_url)
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
	
	return settings, api_key, base_url


def _build_template_api_url(base_url):
	"""Build the template API URL.
	
	Args:
		base_url: Base URL for Digital Connect API
		
	Returns:
		str: Full API URL for templates
	"""
	return f"{base_url}/v2/api/outgoing/template"


def _strip_template_filters(category=None, language=None, name=None, status=None):
	"""Treat blank / ALL as no filter."""

	def clean(value):
		if value is None:
			return None
		text = str(value).strip()
		if not text or text.upper() == "ALL":
			return None
		return text

	return clean(category), clean(language), clean(name), clean(status)


def _build_template_query_params(category=None, language=None, name=None, status=None):
	"""Build query parameters for template API request.
	
	Args:
		category: Filter by category
		language: Filter by language code
		name: Filter by template name or content
		status: Filter by status
		
	Returns:
		tuple: (params, params_with_status)
	"""
	category, language, name, status = _strip_template_filters(category, language, name, status)
	params = {}
	if category:
		params["category"] = category.upper() if isinstance(category, str) else category
	if language:
		params["language"] = language
	if name:
		params["name_or_content"] = name
	
	# Per docs, `status` is supported, but some tenants return: "'status' is not allowed".
	# We'll attempt with status first, then retry without if needed.
	params_with_status = dict(params)
	if status:
		params_with_status["status"] = status.upper() if isinstance(status, str) else status
	
	return params, params_with_status


DEFAULT_TEMPLATE_PAGE_SIZE = 100


def _extract_paging(data):
	"""Read paging metadata from Digital Connect list responses."""
	if not isinstance(data, dict):
		return {}
	for container in (data, data.get("message") if isinstance(data.get("message"), dict) else None):
		if isinstance(container, dict) and isinstance(container.get("paging"), dict):
			return container["paging"]
	return {}


def _looks_like_template_dict(item):
	return isinstance(item, dict) and any(
		key in item
		for key in (
			"name",
			"language",
			"components",
			"status",
			"category",
			"id",
			"whatsapp_template_id",
			"template_name",
		)
	)


def _looks_like_template_list(items):
	if not isinstance(items, list) or not items:
		return False
	return any(_looks_like_template_dict(item) for item in items)


def _collect_template_list(node, depth=0):
	"""Find the templates array inside varying API response shapes."""
	if depth > 6:
		return []
	if isinstance(node, list):
		return node if _looks_like_template_list(node) else []
	if not isinstance(node, dict):
		return []

	for key in ("data", "templates", "message_templates", "results", "items", "records"):
		found = _collect_template_list(node.get(key), depth + 1)
		if found:
			return found

	message = node.get("message")
	if isinstance(message, list):
		found = _collect_template_list(message, depth + 1)
		if found:
			return found
	if isinstance(message, dict):
		found = _collect_template_list(message, depth + 1)
		if found:
			return found

	if isinstance(node.get("response"), dict):
		found = _collect_template_list(node["response"], depth + 1)
		if found:
			return found

	return []


def _describe_response_for_log(data):
	if not isinstance(data, dict):
		return str(type(data))
	parts = [f"keys={list(data.keys())}"]
	message = data.get("message")
	if isinstance(message, dict):
		parts.append(f"message.keys={list(message.keys())}")
	elif isinstance(message, list):
		parts.append(f"message=list(len={len(message)})")
	elif isinstance(message, str):
		parts.append(f"message={message[:200]}")
	return ", ".join(parts)


def _fetch_all_templates_from_api(url, headers, base_params, status=None):
	"""Fetch all template pages from Digital Connect."""
	all_templates = []
	seen = set()
	params = dict(base_params)
	params.setdefault("limit", DEFAULT_TEMPLATE_PAGE_SIZE)
	offset = 0
	use_offset = True

	for _ in range(100):
		if use_offset:
			params["offset"] = offset
		data = _make_template_api_request(url, headers, params, status if offset == 0 and use_offset else None)
		batch = _extract_templates_from_response(data)

		# Some tenants use `name` instead of `name_or_content` for search.
		if not batch and offset == 0 and base_params.get("name_or_content") and "name" not in params:
			alt_params = dict(base_params)
			alt_params["name"] = alt_params.pop("name_or_content")
			alt_params.setdefault("limit", DEFAULT_TEMPLATE_PAGE_SIZE)
			alt_params["offset"] = 0
			data = _make_template_api_request(url, headers, alt_params, status)
			batch = _extract_templates_from_response(data)
			if batch:
				params = alt_params
				base_params = alt_params
				use_offset = True
				offset = 0

		for template in batch:
			if not isinstance(template, dict):
				continue
			key = str(template.get("id") or f"{template.get('name')}::{template.get('language')}")
			if key in seen:
				continue
			seen.add(key)
			all_templates.append(template)

		paging = _extract_paging(data)
		after_cursor = paging.get("after")
		if after_cursor:
			params = dict(base_params)
			params.setdefault("limit", DEFAULT_TEMPLATE_PAGE_SIZE)
			params["after"] = after_cursor
			params.pop("offset", None)
			use_offset = False
			if not batch:
				break
			continue

		if len(batch) < params.get("limit", DEFAULT_TEMPLATE_PAGE_SIZE):
			break

		offset += len(batch)
		params = dict(base_params)
		params.setdefault("limit", DEFAULT_TEMPLATE_PAGE_SIZE)
		use_offset = True

	return all_templates


def _extract_error_message(data):
	"""Extract error message from API response.
	
	Args:
		data: Response data (dict or string)
		
	Returns:
		str: Error message or None
	"""
	if isinstance(data, str):
		return data.strip() or None
	if not isinstance(data, dict):
		return str(data)

	error = data.get("error")
	if isinstance(error, dict):
		msg = error.get("message")
		if msg:
			return str(msg)
	elif isinstance(error, str) and error.strip():
		return error

	message = data.get("message")
	if isinstance(message, str) and message.strip():
		return message
	if isinstance(message, dict):
		nested_error = message.get("error")
		if isinstance(nested_error, dict) and nested_error.get("message"):
			return str(nested_error.get("message"))
		if isinstance(nested_error, str) and nested_error.strip():
			return nested_error
		if message.get("message"):
			return str(message.get("message"))

	detail = data.get("detail")
	if isinstance(detail, str) and detail.strip():
		return detail

	return str(data)


def _strip_disallowed_query_param(params, error_message):
	"""Remove a query param Digital Connect rejected, e.g. \"'offset' is not allowed\"."""
	if not error_message:
		return False
	match = re.search(r"'([^']+)'\s+is not allowed", error_message, re.I)
	if not match:
		return False
	param = match.group(1)
	if param in params:
		params.pop(param)
		return True
	return False


def _make_template_api_request(url, headers, params, status=None):
	"""Make API request to fetch templates with adaptive retry logic.
	
	Args:
		url: API URL
		headers: Request headers
		params: Query parameters (without status)
		status: Optional status filter
		
	Returns:
		dict: Parsed JSON response data
	"""
	if requests is None:
		frappe.throw(_("Python requests library is not available on this site."))

	current_params = dict(params or {})
	if status:
		current_params["status"] = status

	for attempt in range(8):
		frappe.logger("digital_connect").info(
			"Fetching templates (attempt %s) - URL: %s, Params: %s",
			attempt + 1,
			url,
			current_params,
		)

		response = requests.get(url, headers=headers, params=current_params, timeout=15)

		try:
			data = response.json()
		except Exception:
			data = response.text or {"data": [], "paging": {}}

		if response.ok:
			if isinstance(data, dict) and data.get("success") is False:
				frappe.throw(
					_("Digital Connect returned an error: {0}").format(
						_extract_error_message(data) or _("Unknown error")
					)
				)
			return data if isinstance(data, dict) else {"data": data}

		error_message = _extract_error_message(data) or response.text

		if response.status_code == 400 and _strip_disallowed_query_param(current_params, error_message):
			continue

		frappe.throw(
			_("Failed to fetch templates from Digital Connect (HTTP {0}): {1}").format(
				response.status_code, error_message
			)
		)

	frappe.throw(_("Failed to fetch templates from Digital Connect after removing unsupported query parameters."))


def _extract_templates_from_response(data):
	"""Extract templates list from API response (handles different response structures).
	
	Args:
		data: API response data
		
	Returns:
		list: List of template dictionaries
	"""
	api_templates = _collect_template_list(data)
	
	# Log if we couldn't extract templates
	if not api_templates and isinstance(data, dict):
		frappe.log_error(
			f"Could not extract templates from response. {_describe_response_for_log(data)}",
			"Digital Connect Template Fetch",
		)
	
	return api_templates


def _filter_templates_by_status(templates, status):
	"""Filter templates by status if status filter is provided.
	
	Args:
		templates: List of template dictionaries
		status: Status to filter by (optional)
		
	Returns:
		list: Filtered templates
	"""
	if status:
		return [t for t in templates if isinstance(t, dict) and t.get("status") == status]
	return templates


def _find_existing_template(template_name, language_code, template_id=None):
	"""Find existing template in local database.
	
	Args:
		template_name: Template name from API
		language_code: Language code
		template_id: Template ID from Digital Connect (optional)
		
	Returns:
		str or None: Existing template name if found, None otherwise
	"""
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
	if not existing and template_id:
		existing = frappe.db.get_value("Digital Whatsapp Template", {"template_id": template_id})
	
	return existing


def _update_existing_template(existing_name, template_data):
	"""Update existing template with data from API.
	
	Args:
		existing_name: Name of existing template document
		template_data: Template data from API
		
	Returns:
		bool: True if successful, False otherwise
	"""
	try:
		doc = frappe.get_doc("Digital Whatsapp Template", existing_name)
		# Set a flag to indicate we're syncing from fetch (skip Digital Connect update)
		doc._skip_digital_connect_update = True
		doc.status = _extract_and_validate_status(template_data.get("status"))
		doc.template_id = template_data.get("id")
		doc.category = template_data.get("category")
		# Update components if available
		if template_data.get("components"):
			update_template_components(doc, template_data.get("components"))
		doc.save(ignore_permissions=True)
		return True
	except Exception as e:
		frappe.log_error(
			f"Skipped updating existing template {template_data.get('name')}: {str(e)}",
			"Digital Connect Template Fetch"
		)
		return False


def _create_new_template(template_data):
	"""Create new template from API data.
	
	Args:
		template_data: Template data from API
		
	Returns:
		bool: True if successful, False otherwise
	"""
	template_name = template_data.get("name")
	language_code = template_data.get("language", "en_US")
	
	try:
		doc = frappe.new_doc("Digital Whatsapp Template")
		# Set flag to skip Digital Connect updates during fetch sync
		doc._skip_digital_connect_update = True
		doc.template_name = template_name
		doc.actual_name = template_name
		doc.status = _extract_and_validate_status(template_data.get("status"))
		doc.template_id = template_data.get("id")  # Set ID before insert to skip after_insert hook
		doc.category = template_data.get("category") or "UTILITY"  # Default category if missing
		doc.language_code = language_code
		# Set language from language code
		lang_code = language_code.replace("_", "-")
		lang_doc = frappe.db.get_value("Language", {"language_code": lang_code})
		if lang_doc:
			doc.language = lang_doc
		# Update components
		if template_data.get("components"):
			update_template_components(doc, template_data.get("components"))
		doc.insert(ignore_permissions=True)
		return True
	except frappe.exceptions.DuplicateEntryError:
		# Template already exists (duplicate key) - just skip it
		return False
	except Exception as e:
		frappe.log_error(
			f"Failed to create template {template_name}: {str(e)}",
			"Digital Connect Template Fetch"
		)
		return False


def _sync_templates_to_local(templates):
	"""Sync templates from API to local database.
	
	Args:
		templates: List of template dictionaries from API
		
	Returns:
		tuple: (synced_count, skipped_count)
	"""
	synced_count = 0
	skipped_count = 0
	
	for template in templates:
		template_name = template.get("name")
		language_code = template.get("language", "en_US")
		template_id = template.get("id")
		
		if not template_name:
			frappe.log_error(
				f"Skipping template with missing name. Template data: {str(template)[:200]}",
				"Digital Connect Template Fetch"
			)
			skipped_count += 1
			continue
		
		# Find existing template
		existing = _find_existing_template(template_name, language_code, template_id)
		
		if existing:
			# Update existing template
			if _update_existing_template(existing, template):
				synced_count += 1
			else:
				skipped_count += 1
		else:
			# Create new template
			if _create_new_template(template):
				synced_count += 1
			else:
				skipped_count += 1
	
	return synced_count, skipped_count


def _show_fetch_summary(synced_count, skipped_count, total_templates, category, status, language, name):
	"""Show summary message after fetching templates.
	
	Args:
		synced_count: Number of templates synced
		skipped_count: Number of templates skipped
		total_templates: Total templates from API
		category: Category filter used
		status: Status filter used
		language: Language filter used
		name: Name filter used
	"""
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
	elif total_templates == 0:
		response_info = f"Category: {category or 'ALL'}, Status: {status or 'ALL'}, Language: {language or 'ALL'}, Name: {name or 'ALL'}"
		msg = _("No templates were returned from Digital Connect. {0}").format(response_info)
		if category or status or language or name:
			msg += " " + _("Try leaving all filters blank to fetch every template.")
		frappe.msgprint(msg, indicator="orange")


@frappe.whitelist()
def fetch_templates(category=None, status=None, language=None, name=None):
	"""Fetch templates from Digital Connect API.

	All filters are optional — leave them blank to fetch every template your API key can access.

	Args:
		category: Filter by category (AUTHENTICATION, MARKETING, UTILITY)
		status: Filter by status (PENDING, APPROVED, REJECTED, PAUSED).
			Note: Some Digital Connect tenants reject the `status` query param; in that case we retry
			without it and apply status filtering locally.
		language: Filter by language code (e.g. en_US)
		name: Filter by template name or content
	"""
	try:
		category, language, name, status = _strip_template_filters(category, language, name, status)

		# Get settings
		settings, api_key, base_url = _get_digital_connect_settings()
		
		# Build API URL and parameters
		url = _build_template_api_url(base_url)
		params, params_with_status = _build_template_query_params(category, language, name, status)
		
		headers = {
			"Content-Type": "application/json",
			"token": api_key,
		}
		
		# Fetch all pages from API
		api_templates = _fetch_all_templates_from_api(url, headers, params, status)

		# Some tenants ignore or mishandle category query params — retry and filter locally.
		if not api_templates and category:
			params_without_category, _ = _build_template_query_params(None, language, name, status)
			unfiltered = _fetch_all_templates_from_api(url, headers, params_without_category, status)
			category_upper = category.upper()
			api_templates = [
				template
				for template in unfiltered
				if str(template.get("category") or "").upper() == category_upper
			]
		
		# Filter by status if needed
		templates = _filter_templates_by_status(api_templates, status)
		
		# Debug logging
		total_templates = len(api_templates)
		filtered_templates = len(templates)
		frappe.logger("digital_connect").info(
			"Template fetch: total=%s filtered=%s category=%s status=%s",
			total_templates,
			filtered_templates,
			category or "ALL",
			status or "ALL",
		)
		
		# If no templates found, show message and return
		if not templates:
			_show_fetch_summary(0, 0, total_templates, category, status, language, name)
			return {
				"status": "success",
				"synced_count": 0,
				"skipped_count": 0,
				"data": {"data": api_templates},
				"message": "No templates found",
				"total_from_api": total_templates
			}
		
		# Sync templates to local database
		synced_count, skipped_count = _sync_templates_to_local(templates)
		
		# Show summary
		_show_fetch_summary(synced_count, skipped_count, total_templates, category, status, language, name)
		
		return {
			"status": "success",
			"synced_count": synced_count,
			"skipped_count": skipped_count,
			"data": {"data": api_templates},
			"total_from_api": total_templates
		}
	
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
	
	# Template library endpoint (if unavailable we fall back to the regular template list).
	library_url = f"{base_url}/v2/api/outgoing/template/library"
	template_url = f"{base_url}/v2/api/outgoing/template"

	if requests is None:
		frappe.throw(_("Python requests library is not available on this site."))

	headers = {
		"Content-Type": "application/json",
		"token": api_key,
	}
	params, _status = _build_template_query_params(category, language, None, None)

	try:
		templates = []
		for endpoint in (library_url, template_url):
			try:
				templates = _fetch_all_templates_from_api(endpoint, headers, params)
			except Exception as exc:
				frappe.log_error(f"Template library fetch failed for {endpoint}: {exc}", "Digital Connect Template Fetch")
				templates = []
			if templates:
				break

		return {"status": "success", "templates": templates}

	except requests.exceptions.RequestException as e:
		frappe.throw(_("Failed to get template library: {0}").format(str(e)))
