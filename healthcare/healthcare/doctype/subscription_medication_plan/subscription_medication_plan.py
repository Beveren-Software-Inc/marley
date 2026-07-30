import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import formatdate


class SubscriptionMedicationPlan(Document):
	def before_insert(self):
		# Initialise next_run_date based on frequency for new docs
		if self.start_date and self.frequency:
			self.next_run_date = self._compute_next_run_date()

	def validate(self):
		# Recalculate next_run_date whenever start_date or frequency changes
		if self.start_date and self.frequency:
			self.next_run_date = self._compute_next_run_date()

	def on_submit(self):
		# mark as Active on submit if not manually set
		if self.status in (None, "", "Draft"):
			self.db_set("status", "Active")

	def _compute_next_run_date(self):
		"""Compute next_run_date from start_date and frequency.

		For now:
		- Monthly => +30 days
		- Every 2 Months => +60 days
		- Every 3 Months => +90 days
		"""
		if not self.start_date:
			return None

		from frappe.utils import add_days

		freq_map = {
			"Monthly": 30,
			"Every 2 Months": 60,
			"Every 3 Months": 90,
		}
		days = freq_map.get(self.frequency) or 30
		return add_days(self.start_date, days)

	@frappe.whitelist()
	def create_medication_order_now(self):
		"""Create a Patient Medication Order immediately from this plan."""
		if not self.patient:
			frappe.throw("Patient is required on Subscription Medication Plan")

		mo = frappe.new_doc("Patient Medication Order")
		mo.patient = self.patient
		mo.patient_name = self.patient_name
		mo.practitioner = self.practitioner
		mo.company = self.company
		mo.start_date = frappe.utils.getdate()

		for item in self.medications:
			if not getattr(item, "is_active", 0):
				continue
			row = mo.append("medication_orders")
			row.drug = item.drug
			row.drug_name = item.drug_name
			row.dosage = item.dosage
			row.dosage_form = item.dosage_form
			row.date = item.date or mo.start_date
			row.time = item.time
			row.instructions = item.instructions
			row.patient_frequency = item.patient_frequency

		mo.insert()
		# leave as Draft so pharmacist can review; change to submit() if needed

		return {
			"name": mo.name,
			"patient": mo.patient,
		}


@frappe.whitelist()
def get_subscription_medication_whatsapp_preview(name: str, template_name=None):
	"""Return WhatsApp preview data for a Subscription Medication Plan (phone, templates, filled message)."""
	if not name:
		frappe.throw(_("Subscription Medication Plan name is required"))
	if not frappe.db.exists("Subscription Medication Plan", name):
		frappe.throw(_("Subscription Medication Plan {0} does not exist").format(frappe.bold(name)))

	from healthcare.healthcare.doctype.patient_appointment.patient_appointment import (
		_get_company_country_isd,
		_render_whatsapp_template_preview,
	)

	doc = frappe.get_doc("Subscription Medication Plan", name)
	patient = frappe.get_doc("Patient", doc.patient) if doc.patient else None
	patient_name = doc.patient_name or (patient.patient_name if patient else doc.patient or name)
	templates = _get_subscription_whatsapp_templates(doc)

	selected_name = (template_name or "").strip() or None
	if not selected_name and len(templates) == 1:
		selected_name = templates[0]["name"]
	if selected_name and selected_name not in {t["name"] for t in templates}:
		frappe.throw(_("Template {0} is not available for this plan").format(selected_name))

	selected = None
	preview = None
	parameters = []
	fallback_body = _build_subscription_medication_message(doc, patient=patient)

	if selected_name:
		selected = next(t for t in templates if t["name"] == selected_name)
		parameters = _build_subscription_whatsapp_parameters(doc, selected_name)
		preview = _render_whatsapp_template_preview(selected_name, parameters)
	elif not templates:
		preview = {
			"header": "",
			"body": fallback_body,
			"footer": "",
			"template_name": "Free text",
			"actual_name": "",
		}

	country, country_isd = _get_company_country_isd(doc.get("company"))

	return {
		"plan": doc.name,
		"patient": doc.patient,
		"patient_name": patient_name,
		"phone_number": _resolve_subscription_patient_mobile(doc, patient=patient) or "",
		"country": country,
		"country_isd": country_isd,
		"templates": templates,
		"selected_template": selected_name,
		"parameters": parameters,
		"preview": preview,
		"fallback_body": fallback_body,
		"selected": selected,
	}


@frappe.whitelist()
def send_subscription_medication_reminder(
	name: str,
	channel: str = "whatsapp",
	phone_number: str = None,
	template_name: str = None,
	template_parameters=None,
):
	"""Send a reminder for a Subscription Medication Plan (monthly medication).

	channel: 'whatsapp' | 'sms' | 'email'
	Uses Digital Connect WhatsApp (same path as appointments / long-acting medicine).
	"""
	if not name:
		frappe.throw(_("Subscription Medication Plan name is required"))
	if not frappe.db.exists("Subscription Medication Plan", name):
		frappe.throw(_("Subscription Medication Plan {0} does not exist").format(frappe.bold(name)))

	channel = (channel or "whatsapp").lower()
	valid_channels = ("email", "whatsapp", "sms")
	if channel not in valid_channels:
		frappe.throw(_("Invalid channel '{0}'. Must be one of: {1}").format(channel, ", ".join(valid_channels)))

	doc = frappe.get_doc("Subscription Medication Plan", name)
	patient = frappe.get_doc("Patient", doc.patient) if doc.patient else None
	patient_name = doc.patient_name or (patient.patient_name if patient else doc.patient or name)

	if channel == "whatsapp":
		_send_subscription_medication_whatsapp(
			doc,
			patient,
			phone_override=phone_number,
			template_name=template_name,
			template_parameters=template_parameters,
		)
	elif channel == "sms":
		frappe.throw(_("SMS reminders for monthly medication are not configured yet. Use WhatsApp."))
	elif channel == "email":
		frappe.throw(_("Email reminders for monthly medication are not configured yet. Use WhatsApp."))

	return {"sent": True, "channel": channel, "patient": patient_name, "plan": doc.name}


def _resolve_subscription_patient_mobile(doc, patient=None, phone_override=None):
	from healthcare.healthcare.doctype.patient_appointment.patient_appointment import (
		_normalize_whatsapp_phone,
	)

	raw = (phone_override or "").strip()
	if not raw and patient:
		for field in ("mobile", "mobile_no", "mobile_no_1", "phone"):
			number = (getattr(patient, field, None) or "").strip()
			if number:
				raw = number
				break
	if not raw and doc.patient:
		values = (
			frappe.db.get_value(
				"Patient",
				doc.patient,
				["mobile", "mobile_no", "mobile_no_1", "phone"],
				as_dict=True,
			)
			or {}
		)
		for field in ("mobile", "mobile_no", "mobile_no_1", "phone"):
			number = (values.get(field) or "").strip()
			if number:
				raw = number
				break

	if not raw:
		return ""

	return _normalize_whatsapp_phone(raw, company=doc.get("company"))


def _get_subscription_whatsapp_templates(doc):
	"""Resolve approved WhatsApp templates for Subscription Medication Plan."""
	from healthcare.healthcare.doctype.patient_appointment.patient_appointment import (
		_count_template_variables,
	)

	seen = set()
	out = []

	def add_template(name, purpose=None):
		if not name or name in seen:
			return
		row = frappe.db.get_value(
			"Digital Whatsapp Template",
			name,
			[
				"name",
				"template_name",
				"actual_name",
				"status",
				"header_type",
				"header_text",
				"body_text",
				"footer_text",
				"field_names",
				"language_code",
			],
			as_dict=True,
		)
		if not row or row.status != "APPROVED":
			return
		seen.add(name)
		out.append(
			{
				"name": row.name,
				"template_name": row.template_name,
				"actual_name": row.actual_name,
				"purpose": purpose or "",
				"header_type": row.header_type,
				"header_text": row.header_text or "",
				"body_text": row.body_text or "",
				"footer_text": row.footer_text or "",
				"field_names": row.field_names or "",
				"language_code": row.language_code or "",
				"variable_count": _count_template_variables(
					row.header_text if row.header_type == "TEXT" else ""
				)
				+ _count_template_variables(row.body_text),
			}
		)

	if doc.get("whatsapp_template"):
		add_template(doc.whatsapp_template, purpose="Plan Template")

	if frappe.db.exists("DocType", "Digital Connect Whatsap Settings"):
		settings = frappe.get_single("Digital Connect Whatsap Settings")
		for row in settings.get("template_mapping") or []:
			if row.get("reference_document") == "Subscription Medication Plan" and row.get("template"):
				add_template(row.template, purpose=row.get("purpose") or "")

	if not out:
		for name in frappe.get_all(
			"Digital Whatsapp Template",
			filters={"for_doctype": "Subscription Medication Plan", "status": "APPROVED"},
			pluck="name",
		):
			add_template(name)

	return out


def _resolve_subscription_whatsapp_template(doc):
	"""Prefer plan template, then Digital Connect mapping, then for_doctype templates."""
	templates = _get_subscription_whatsapp_templates(doc)
	if not templates:
		return None
	if doc.get("whatsapp_template"):
		return doc.whatsapp_template
	if len(templates) == 1:
		return templates[0]["name"]
	return None


def _subscription_medications_summary(doc, limit=5):
	med_names = []
	for item in doc.get("medications") or []:
		if getattr(item, "is_active", 1) == 0:
			continue
		label = (getattr(item, "drug_name", None) or getattr(item, "drug", None) or "").strip()
		if label:
			med_names.append(label)
	text = ", ".join(med_names[:limit])
	if len(med_names) > limit:
		text += f" (+{len(med_names) - limit} more)"
	return text


def _build_subscription_whatsapp_param_map(doc):
	from frappe.utils import cstr

	practitioner_name = ""
	if doc.get("practitioner"):
		practitioner_name = (
			frappe.db.get_value("Healthcare Practitioner", doc.practitioner, "practitioner_name")
			or doc.practitioner
		)

	return {
		"patient_name": cstr(doc.patient_name or doc.patient or ""),
		"patient": cstr(doc.patient or ""),
		"frequency": cstr(doc.frequency or "Monthly"),
		"next_run_date": formatdate(doc.next_run_date) if doc.next_run_date else "",
		"start_date": formatdate(doc.start_date) if doc.start_date else "",
		"end_date": formatdate(doc.end_date) if doc.end_date else "",
		"medications": _subscription_medications_summary(doc),
		"medications_summary": _subscription_medications_summary(doc),
		"practitioner_name": cstr(practitioner_name),
		"practitioner": cstr(doc.practitioner or ""),
		"company": cstr(doc.company or ""),
		"plan": cstr(doc.name or ""),
		"status": cstr(doc.status or ""),
	}


def _build_subscription_whatsapp_parameters(doc, template_name):
	"""Build ordered parameter values for a WhatsApp template."""
	import re

	from frappe.utils import cstr
	from healthcare.healthcare.doctype.patient_appointment.patient_appointment import (
		_count_template_variables,
	)

	template = frappe.get_doc("Digital Whatsapp Template", template_name)
	param_map = _build_subscription_whatsapp_param_map(doc)
	header_count = (
		_count_template_variables(template.header_text) if template.header_type == "TEXT" else 0
	)
	body_count = _count_template_variables(template.body_text)
	total = header_count + body_count

	field_names = []
	if template.field_names:
		field_names = [x.strip() for x in re.split(r"[,\n;]+", template.field_names) if x.strip()]

	defaults = [
		param_map["patient_name"],
		param_map["frequency"],
		param_map["next_run_date"],
		param_map["medications_summary"],
		param_map["practitioner_name"],
	]

	values = []
	for i in range(total):
		if i < len(field_names):
			key = field_names[i]
			if key in param_map:
				values.append(cstr(param_map[key]))
			else:
				raw = doc.get(key) if hasattr(doc, "get") else None
				values.append("" if raw is None else cstr(raw))
		elif i < len(defaults):
			values.append(cstr(defaults[i]))
		else:
			values.append("")
	return values


def _build_subscription_medication_message(doc, patient=None):
	patient_name = doc.patient_name or (patient.patient_name if patient else None) or doc.patient or "Patient"
	next_date = formatdate(doc.next_run_date) if doc.next_run_date else "soon"
	frequency = doc.frequency or "Monthly"
	meds_text = _subscription_medications_summary(doc)

	if meds_text:
		return _(
			"Dear {0}, this is a reminder for your {1} medication refill. "
			"Please visit the pharmacy to collect: {2}. Next due: {3}."
		).format(patient_name, frequency.lower(), meds_text, next_date)

	return _(
		"Dear {0}, this is a reminder for your {1} medication refill. "
		"Please visit the pharmacy to collect your medicines. Next due: {2}."
	).format(patient_name, frequency.lower(), next_date)


def _send_subscription_medication_whatsapp(
	doc,
	patient=None,
	phone_override=None,
	template_name=None,
	template_parameters=None,
):
	from healthcare.healthcare.doctype.digital_connect_whatsap_settings.digital_connect_whatsap_settings import (
		send_test_message,
	)
	from healthcare.healthcare.doctype.patient_appointment.patient_appointment import (
		_normalize_whatsapp_phone,
	)

	override = (phone_override or "").strip()
	if override:
		phone = _normalize_whatsapp_phone(override, company=doc.get("company"))
	else:
		phone = _resolve_subscription_patient_mobile(doc, patient=patient)

	if not phone:
		frappe.throw(
			_("Patient {0} has no mobile number. Enter a number to send WhatsApp.").format(
				doc.patient_name or (patient.patient_name if patient else doc.patient) or doc.name
			)
		)

	resolved_template = (template_name or "").strip() or _resolve_subscription_whatsapp_template(doc)
	if not resolved_template:
		mapped = _get_subscription_whatsapp_templates(doc)
		if len(mapped) == 1:
			resolved_template = mapped[0]["name"]
		elif len(mapped) > 1:
			frappe.throw(_("Multiple WhatsApp templates found. Please select one."))

	if resolved_template:
		if template_parameters is None:
			template_parameters = _build_subscription_whatsapp_parameters(doc, resolved_template)
		elif isinstance(template_parameters, str):
			stripped = template_parameters.strip()
			if stripped.startswith("["):
				try:
					parsed = frappe.parse_json(stripped)
					if isinstance(parsed, list):
						template_parameters = parsed
				except Exception:
					pass

		result = send_test_message(
			phone_number=phone,
			template_name=resolved_template,
			template_parameters=template_parameters or [],
		)
	else:
		body = _build_subscription_medication_message(doc, patient=patient)
		result = send_test_message(phone_number=phone, body=body, preview_url=1)

	chat_name = result.get("chat_name") if isinstance(result, dict) else None
	if chat_name:
		frappe.db.set_value(
			"Digital Whatsapp Chat",
			chat_name,
			{
				"reference_doctype": "Subscription Medication Plan",
				"reference_name": doc.name,
			},
			update_modified=True,
		)

	return result
