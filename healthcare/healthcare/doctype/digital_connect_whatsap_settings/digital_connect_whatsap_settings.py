# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import json
from typing import Any, Dict, List

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


def _normalize_delivery_status(status: str | None) -> str:
	value = (status or "").strip().lower()
	if not value:
		return "received"
	if value in {"sent", "message sent", "message_sent"}:
		return "sent"
	if value in {"delivered", "message delivered", "message_delivered"}:
		return "delivered"
	if value in {"read", "message read", "message_read"}:
		return "read"
	if value in {"failed", "message failed", "message_failed", "undelivered"}:
		return "failed"
	if value in {"received", "incoming", "message received", "message_received"}:
		return "received"
	return value


def _extract_error_message(data: Any) -> str | None:
	if isinstance(data, dict):
		message = data.get("message")
		if isinstance(message, dict):
			error_data = message.get("error")
			if isinstance(error_data, dict) and error_data.get("message"):
				return str(error_data.get("message"))
		error_data = data.get("error")
		if isinstance(error_data, dict) and error_data.get("message"):
			return str(error_data.get("message"))
		if message and isinstance(message, str):
			return message
	return None


def _extract_message_id_from_send_response(response_data: Any) -> str | None:
	if not isinstance(response_data, dict):
		return None

	candidates = [
		response_data,
		response_data.get("response"),
		response_data.get("response", {}).get("message"),
		response_data.get("message"),
	]
	for node in candidates:
		if not isinstance(node, dict):
			continue
		if node.get("message_id"):
			return str(node.get("message_id"))
		messages = node.get("messages")
		if isinstance(messages, list) and messages:
			first = messages[0]
			if isinstance(first, dict) and first.get("id"):
				return str(first.get("id"))
	return None


def _extract_conversation_id_from_send_response(response_data: Any) -> str | None:
	if not isinstance(response_data, dict):
		return None
	for node in [response_data, response_data.get("response"), response_data.get("response", {}).get("message")]:
		if not isinstance(node, dict):
			continue
		conversation = node.get("conversation")
		if isinstance(conversation, dict) and conversation.get("id"):
			return str(conversation.get("id"))
		if node.get("conversation_id"):
			return str(node.get("conversation_id"))
	return None


def _extract_status_events(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
	events: List[Dict[str, Any]] = []

	def parse_status_row(row: Dict[str, Any], parent: Dict[str, Any] | None = None):
		parent = parent or {}
		message_id = row.get("id") or row.get("message_id") or row.get("wamid")
		status = _normalize_delivery_status(row.get("status") or row.get("event"))
		if not message_id:
			return
		conversation_id = None
		if isinstance(row.get("conversation"), dict):
			conversation_id = row.get("conversation", {}).get("id")
		if not conversation_id and parent.get("conversation_id"):
			conversation_id = parent.get("conversation_id")
		error = None
		errors = row.get("errors")
		if isinstance(errors, list) and errors and isinstance(errors[0], dict):
			error = errors[0].get("title") or errors[0].get("message")

		events.append(
			{
				"kind": "status",
				"message_id": str(message_id),
				"status": status,
				"conversation_id": conversation_id,
				"to": row.get("recipient_id") or row.get("to") or parent.get("to"),
				"error": error,
				"timestamp": row.get("timestamp") or parent.get("timestamp"),
			}
		)

	def walk(node: Any, parent: Dict[str, Any] | None = None):
		if isinstance(node, dict):
			statuses = node.get("statuses")
			if isinstance(statuses, list):
				for row in statuses:
					if isinstance(row, dict):
						parse_status_row(row, node)
			if node.get("message_id") and node.get("status"):
				parse_status_row(node, parent)
			event_name = _normalize_delivery_status(node.get("event") if isinstance(node.get("event"), str) else None)
			if node.get("message_id") and event_name in {"sent", "delivered", "read", "failed"}:
				parse_status_row({"message_id": node.get("message_id"), "status": event_name, "to": node.get("to")}, node)
			for value in node.values():
				walk(value, node)
		elif isinstance(node, list):
			for row in node:
				walk(row, parent)

	walk(payload)

	seen = set()
	deduped = []
	for event in events:
		key = (event.get("message_id"), event.get("status"), event.get("timestamp"), event.get("error"))
		if key in seen:
			continue
		seen.add(key)
		deduped.append(event)
	return deduped


def _extract_incoming_events(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
	events: List[Dict[str, Any]] = []

	def parse_messages_block(node: Dict[str, Any]):
		messages = node.get("messages")
		if not isinstance(messages, list):
			return
		contacts = node.get("contacts") or []
		contact = contacts[0] if isinstance(contacts, list) and contacts and isinstance(contacts[0], dict) else {}
		profile_name = None
		if isinstance(contact.get("profile"), dict):
			profile_name = contact.get("profile", {}).get("name")
		from_contact = contact.get("wa_id")
		metadata = node.get("metadata") if isinstance(node.get("metadata"), dict) else {}
		to_number = metadata.get("display_phone_number")

		for msg in messages:
			if not isinstance(msg, dict):
				continue
			from_number = msg.get("from") or msg.get("wa_id") or from_contact
			message_id = msg.get("id") or msg.get("message_id")
			content_type = msg.get("type") or msg.get("message_type") or "text"
			text_body = (
				(msg.get("text") or {}).get("body")
				if isinstance(msg.get("text"), dict)
				else msg.get("body")
			)
			reply_to = None
			if isinstance(msg.get("context"), dict):
				reply_to = msg.get("context", {}).get("id")
			if not from_number and not message_id:
				continue
			events.append(
				{
					"kind": "incoming",
					"from": from_number,
					"to": to_number,
					"message_id": message_id,
					"status": "received",
					"content_type": content_type,
					"message": text_body or "",
					"profile_name": profile_name,
					"reply_to_message_id": reply_to,
				}
			)

	def walk(node: Any):
		if isinstance(node, dict):
			parse_messages_block(node)
			for value in node.values():
				walk(value)
		elif isinstance(node, list):
			for row in node:
				walk(row)

	walk(payload)
	return events


def _collect_webhook_events(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
	if not isinstance(payload, dict):
		return []
	return _extract_status_events(payload) + _extract_incoming_events(payload)


def _upsert_chat_from_webhook_event(event: Dict[str, Any], payload: Dict[str, Any]):
	message_id = event.get("message_id")
	existing_name = None
	if message_id:
		existing_name = frappe.db.get_value("Digital Whatsapp Chat", {"message_id": message_id}, "name")

	if existing_name:
		updates = {"status": event.get("status") or "received"}
		if event.get("conversation_id"):
			updates["conversation_id"] = event.get("conversation_id")
		for field, value in updates.items():
			frappe.db.set_value("Digital Whatsapp Chat", existing_name, field, value, update_modified=True)
		return existing_name

	doc = frappe.new_doc("Digital Whatsapp Chat")
	doc.label = f"WhatsApp {event.get('kind', 'event').title()}"
	doc.type = "Incoming" if event.get("kind") == "incoming" else "Outgoing"
	doc.status = event.get("status") or "received"
	doc.content_type = event.get("content_type") or "text"
	doc.message_type = "Manual"
	doc.message_id = message_id
	doc.conversation_id = event.get("conversation_id")
	doc.message = event.get("message") or event.get("error") or ""
	if doc.type == "Incoming":
		doc.set("from", event.get("from") or event.get("to"))
		doc.to = event.get("to")
	else:
		doc.to = event.get("to")
	if event.get("profile_name"):
		doc.profile_name = event.get("profile_name")
	if event.get("reply_to_message_id"):
		doc.is_reply = 1
		doc.reply_to_message_id = event.get("reply_to_message_id")
	doc.insert(ignore_permissions=True)
	return doc.name


@frappe.whitelist(allow_guest=True)
def digital_connect_webhook():
	"""Webhook endpoint for Digital Connect delivery and incoming events."""
	try:
		raw = frappe.request.get_data(as_text=True) or ""
	except Exception:
		raw = ""

	payload: Dict[str, Any] = {}
	if raw:
		try:
			payload = json.loads(raw)
		except Exception:
			payload = {}
	if not payload:
		form_dict = dict(getattr(frappe.local, "form_dict", {}) or {})
		if form_dict:
			payload = form_dict
	if not isinstance(payload, dict):
		payload = {}

	events = _collect_webhook_events(payload)
	updated_docs = []
	for event in events:
		try:
			updated_docs.append(_upsert_chat_from_webhook_event(event, payload))
		except Exception:
			frappe.log_error(frappe.get_traceback(), "Digital Connect Webhook Processing Error")

	return {
		"ok": True,
		"events_processed": len(events),
		"chat_docs": [name for name in updated_docs if name],
	}


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

	chat_doc = frappe.new_doc("Digital Whatsapp Chat")
	chat_doc.label = "WhatsApp Outgoing"
	chat_doc.type = "Outgoing"
	chat_doc.status = "queued"
	chat_doc.to = phone_number
	# Keep content_type aligned with doctype options.
	# Template is a message mode, not a content type in this schema.
	chat_doc.content_type = "text"
	chat_doc.message_type = "Template" if template_name else "Manual"
	chat_doc.message = body or ""
	if template_parameters:
		chat_doc.template_parameters = template_parameters
	chat_doc.insert(ignore_permissions=True)
	# frappe.throw(str(json.dumps(headers)))
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
		frappe.db.set_value("Digital Whatsapp Chat", chat_doc.name, "status", "failed", update_modified=True)
		error_message = None
		if isinstance(data, dict):
			error_message = _extract_error_message(data) or str(data)
		else:
			error_message = str(data)
		
		frappe.throw(
			_("Digital Connect returned HTTP {0}: {1}").format(
				response.status_code,
				error_message or data,
			)
		)

	message_id = _extract_message_id_from_send_response(data)
	conversation_id = _extract_conversation_id_from_send_response(data)
	update_values = {
		"status": "sent",
		"message_id": message_id,
		"conversation_id": conversation_id,
	}
	for fieldname, value in update_values.items():
		if value:
			frappe.db.set_value("Digital Whatsapp Chat", chat_doc.name, fieldname, value, update_modified=True)
	frappe.db.set_value("Digital Whatsapp Chat", chat_doc.name, "status", "sent", update_modified=True)

	return {
		"status": "success",
		"http_status": response.status_code,
		"response": data,
		"message_type": "template" if template_name else "text",
		"chat_name": chat_doc.name,
		"message_id": message_id,
	}
