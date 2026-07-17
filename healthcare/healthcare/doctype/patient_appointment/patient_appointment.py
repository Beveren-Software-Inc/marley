# -*- coding: utf-8 -*-
# Copyright (c) 2015, ESS LLP and contributors
# For license information, please see license.txt


import datetime
import json

import frappe
from frappe import _
from frappe.core.doctype.sms_settings.sms_settings import send_sms
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc
from frappe.utils import cstr, flt, format_date, get_datetime, get_link_to_form, get_time, getdate, now_datetime

from erpnext.setup.doctype.employee.employee import is_holiday

from healthcare.healthcare.doctype.fee_validity.fee_validity import (
	check_fee_validity,
	get_fee_validity,
	manage_fee_validity,
)
from healthcare.healthcare.doctype.healthcare_settings.healthcare_settings import (
	get_income_account,
	get_receivable_account,
)
from healthcare.healthcare.utils import get_appointment_billing_item_and_rate


class MaximumCapacityError(frappe.ValidationError):
	pass


class OverlapError(frappe.ValidationError):
	pass


class PatientAppointment(Document):
	def validate(self):
		# pass
		#Uncomment later
		self.resolve_medical_department()
		self.validate_overlaps()
		self.validate_based_on_appointments_for()
		self.validate_service_unit()
		self.set_appointment_datetime()
		self.validate_customer_created()
		self.set_status()
		self.set_title()
		self.update_event()
		self.set_postition_in_queue()

	def on_update(self):
		if (
			not frappe.db.get_single_value("Healthcare Settings", "show_payment_popup")
			or not self.practitioner
		):
			update_fee_validity(self)
		self._create_visit_on_patient_arrived()

	def _create_visit_on_patient_arrived(self):
		"""Reception flow: marking the appointment 'Patient Arrived' auto-creates the
		Patient Visit (unbilled — reception completes billing as usual)."""
		if self.status != "Patient Arrived" or not self.patient:
			return
		before = self.get_doc_before_save()
		if before and before.status == "Patient Arrived":
			return
		if frappe.db.exists("Patient Visit", {"appointment": self.name, "docstatus": ["!=", 2]}):
			return
		try:
			visit = frappe.new_doc("Patient Visit")
			visit.patient = self.patient
			visit.patient_name = self.patient_name
			visit.appointment = self.name
			if self.get("appointment_type"):
				visit.appointment_type = self.appointment_type
			if self.get("practitioner"):
				visit.practitioner = self.practitioner
			if self.get("cost_center"):
				visit.cost_center = self.cost_center
			if self.get("company"):
				visit.company = self.company
			visit.encounter_date = frappe.utils.nowdate()
			visit.encounter_time = frappe.utils.nowtime()
			visit.status = "Open"
			visit.flags.ignore_mandatory = True
			visit.flags.ignore_permissions = True
			visit.insert()
			frappe.msgprint(
				frappe._("Patient Visit {0} created for arrived patient").format(visit.name),
				alert=True,
				indicator="green",
			)
		except Exception:
			frappe.log_error(
				message=frappe.get_traceback(),
				title=f"Auto visit on Patient Arrived failed: {self.name}",
			)

	def after_insert(self):
		if getattr(self.flags, "legacy_import", False):
			return
		self.update_prescription_details()
		self.set_payment_details()
		send_confirmation_msg(self)
		self.insert_calendar_event()

		if self.service_request:
			frappe.db.set_value(
				"Service Request", self.service_request, "status", "completed-Request Status"
			)

	def set_title(self):
		if self.practitioner:
			self.title = _("{0} with {1}").format(
				self.patient_name or self.patient, self.practitioner_name or self.practitioner
			)
		else:
			self.title = _("{0} at {1}").format(
				self.patient_name or self.patient, self.get(frappe.scrub(self.appointment_for))
			)

	def set_status(self):
		if not self.appointment_date:
			return

		today = getdate()
		appointment_date = getdate(self.appointment_date)

		# If appointment is created for today set status as Open else Scheduled
		if appointment_date == today:
			if self.status not in ["Checked In", "Checked Out", "Open", "Confirmed", "Patient Arrived"]:
				self.status = "Open"

		elif appointment_date > today and self.status not in ["Scheduled", "Confirmed", "Patient Arrived"]:
			self.status = "Scheduled"

		elif appointment_date < today and self.status not in ["No Show", "Patient Arrived"]:
			self.status = "No Show"

	def resolve_medical_department(self):
		"""Use Medical Department only; fix legacy ERPNext Department names on the appointment."""
		dept = (self.department or "").strip()
		if dept and frappe.db.exists("Medical Department", dept):
			return

		if self.practitioner:
			pract_dept = frappe.db.get_value(
				"Healthcare Practitioner", self.practitioner, "department"
			)
			if pract_dept and frappe.db.exists("Medical Department", pract_dept):
				self.department = pract_dept
				return

		if dept:
			by_label = frappe.db.get_value(
				"Medical Department", {"department": dept}, "name"
			)
			if by_label:
				self.department = by_label
				return
			self.department = None

	def _has_appointment_time(self) -> bool:
		return bool(cstr(self.appointment_time or "").strip())

	def validate_overlaps(self):
		if not self.appointment_date or not self._has_appointment_time():
			return

		if self.appointment_based_on_check_in:
			if frappe.db.exists(
				{
					"doctype": "Patient Appointment",
					"patient": self.patient,
					"appointment_date": self.appointment_date,
					"appointment_time": self.appointment_time,
					"appointment_based_on_check_in": True,
					"name": ["!=", self.name],
				}
			):
				frappe.throw(_("Patient already has an appointment booked for the same day!"), OverlapError)
			return

		if not self.practitioner:
			return

		end_time = datetime.datetime.combine(
			getdate(self.appointment_date), get_time(self.appointment_time)
		) + datetime.timedelta(minutes=flt(self.duration))

		# all appointments for both patient and practitioner overlapping the duration of this appointment
		overlapping_appointments = frappe.db.sql(
			"""
			SELECT
				name, practitioner, patient, appointment_time, duration, service_unit
			FROM
				`tabPatient Appointment`
			WHERE
				appointment_date=%(appointment_date)s AND name!=%(name)s AND status NOT IN ("Closed", "Cancelled") AND
				(practitioner=%(practitioner)s OR patient=%(patient)s) AND
				((appointment_time<%(appointment_time)s AND appointment_time + INTERVAL duration MINUTE>%(appointment_time)s) OR
				(appointment_time>%(appointment_time)s AND appointment_time<%(end_time)s) OR
				(appointment_time=%(appointment_time)s))
			""",
			{
				"appointment_date": self.appointment_date,
				"name": self.name,
				"practitioner": self.practitioner,
				"patient": self.patient,
				"appointment_time": self.appointment_time,
				"end_time": end_time.time(),
			},
			as_dict=True,
		)

		if not overlapping_appointments:
			return  # No overlaps, nothing to validate!

		if self.service_unit:  # validate service unit capacity if overlap enabled
			allow_overlap, service_unit_capacity = frappe.get_value(
				"Healthcare Service Unit", self.service_unit, ["overlap_appointments", "service_unit_capacity"]
			)
			if allow_overlap:
				service_unit_appointments = list(
					filter(
						lambda appointment: appointment["service_unit"] == self.service_unit
						and appointment["patient"] != self.patient,
						overlapping_appointments,
					)
				)  # if same patient already booked, it should be an overlap
				if len(service_unit_appointments) >= (service_unit_capacity or 1):
					frappe.throw(
						_("Not allowed, {} cannot exceed maximum capacity {}").format(
							frappe.bold(self.service_unit), frappe.bold(service_unit_capacity or 1)
						),
						MaximumCapacityError,
					)
				else:  # service_unit_appointments within capacity, remove from overlapping_appointments
					overlapping_appointments = [
						appointment
						for appointment in overlapping_appointments
						if appointment not in service_unit_appointments
					]

		if overlapping_appointments:
			frappe.throw(
				_("Not allowed, cannot overlap appointment {}").format(
					frappe.bold(", ".join([appointment["name"] for appointment in overlapping_appointments]))
				),
				OverlapError,
			)

	def validate_based_on_appointments_for(self):
		if self.appointment_for:
			# fieldname: practitioner / department / service_unit
			appointment_for_field = frappe.scrub(self.appointment_for)

			# validate if respective field is set
			# if not self.get(appointment_for_field):
			# 	frappe.throw(
			# 		_("Please enter {}").format(frappe.bold(self.appointment_for)),
			# 		frappe.MandatoryErrors,
			# 	)

			if self.appointment_for == "Practitioner":
				# appointments for practitioner are validated separately,
				# based on practitioner schedule
				return

			# validate if patient already has an appointment for the day
			booked_appointment = frappe.db.exists(
				"Patient Appointment",
				{
					"patient": self.patient,
					"status": ["!=", "Cancelled"],
					appointment_for_field: self.get(appointment_for_field),
					"appointment_date": self.appointment_date,
					"name": ["!=", self.name],
				},
			)

			if booked_appointment:
				frappe.throw(
					_("Patient already has an appointment {} booked for {} on {}").format(
						get_link_to_form("Patient Appointment", booked_appointment),
						frappe.bold(self.get(appointment_for_field)),
						frappe.bold(format_date(self.appointment_date)),
					),
					frappe.DuplicateEntryError,
				)
			if not self.appointment_based_on_check_in:
				self.appointment_based_on_check_in = True

	def validate_service_unit(self):
		if self.inpatient_record and self.service_unit:
			from healthcare.healthcare.doctype.inpatient_medication_entry.inpatient_medication_entry import (
				get_current_healthcare_service_unit,
			)

			is_inpatient_occupancy_unit = frappe.db.get_value(
				"Healthcare Service Unit", self.service_unit, "inpatient_occupancy"
			)
			service_unit = get_current_healthcare_service_unit(self.inpatient_record)
			if is_inpatient_occupancy_unit and service_unit != self.service_unit:
				msg = (
					_("Patient {0} is not admitted in the service unit {1}").format(
						frappe.bold(self.patient), frappe.bold(self.service_unit)
					)
					+ "<br>"
				)
				msg += _(
					"Appointment for service units with Inpatient Occupancy can only be created against the unit where patient has been admitted."
				)
				frappe.throw(msg, title=_("Invalid Healthcare Service Unit"))

	def set_appointment_datetime(self):
		if not self.appointment_date:
			self.appointment_datetime = None
			return

		self.appointment_datetime = f"{self.appointment_date} {self.appointment_time or '00:00:00'}"

	def set_payment_details(self):
		if frappe.db.get_single_value("Healthcare Settings", "show_payment_popup"):
			details = get_appointment_billing_item_and_rate(self)
			self.db_set("billing_item", details.get("service_item"))
			if not self.paid_amount:
				self.db_set("paid_amount", details.get("practitioner_charge"))

	def validate_customer_created(self):
		if frappe.db.get_single_value("Healthcare Settings", "show_payment_popup"):
			if not frappe.db.get_value("Patient", self.patient, "customer"):
				msg = _("Please set a Customer linked to the Patient")
				msg += " <b><a href='/app/Form/Patient/{0}'>{0}</a></b>".format(self.patient)
				frappe.throw(msg, title=_("Customer Not Found"))

	def update_prescription_details(self):
		if self.procedure_prescription:
			frappe.db.set_value(
				"Procedure Prescription", self.procedure_prescription, "appointment_booked", 1
			)
			if self.procedure_template:
				comments = frappe.db.get_value(
					"Procedure Prescription", self.procedure_prescription, "comments"
				)
				if comments:
					frappe.db.set_value("Patient Appointment", self.name, "notes", comments)

	def insert_calendar_event(self):
		if not self.practitioner or not self.appointment_date or not self._has_appointment_time():
			return

		starts_on = datetime.datetime.combine(
			getdate(self.appointment_date), get_time(self.appointment_time)
		)
		ends_on = starts_on + datetime.timedelta(minutes=flt(self.duration))
		google_calendar = frappe.db.get_value(
			"Healthcare Practitioner", self.practitioner, "google_calendar"
		)
		if not google_calendar:
			google_calendar = frappe.db.get_single_value("Healthcare Settings", "default_google_calendar")

		if self.appointment_type:
			color = frappe.db.get_value("Appointment Type", self.appointment_type, "color")
		else:
			color = ""

		event = frappe.get_doc(
			{
				"doctype": "Event",
				"subject": f"{self.title} - {self.company}",
				"event_type": "Private",
				"color": color,
				"send_reminder": 1,
				"starts_on": starts_on,
				"ends_on": ends_on,
				"status": "Open",
				"all_day": 0,
				"sync_with_google_calendar": 1 if self.add_video_conferencing and google_calendar else 0,
				"add_video_conferencing": 1 if self.add_video_conferencing and google_calendar else 0,
				"google_calendar": google_calendar,
				"description": f"{self.title} - {self.company}",
				"pulled_from_google_calendar": 0,
			}
		)
		participants = []

		if self.practitioner:
			participants.append(
				{"reference_doctype": "Healthcare Practitioner", "reference_docname": self.practitioner}
			)

		patient_for_event = self.patient
		if not patient_for_event:
			patient_for_event = frappe.db.get_single_value("Healthcare Settings", "default_patient")
		if patient_for_event:
			participants.append({"reference_doctype": "Patient", "reference_docname": patient_for_event})

		event.update({"event_participants": participants})

		event.insert(ignore_permissions=True)

		event.reload()
		if self.add_video_conferencing and not event.google_meet_link:
			frappe.msgprint(
				_("Could not add conferencing to this Appointment, please contact System Manager"),
				indicator="error",
				alert=True,
			)

		self.db_set({"event": event.name, "google_meet_link": event.google_meet_link})
		self.notify_update()

	@frappe.whitelist()
	def get_therapy_types(self):
		if not self.therapy_plan:
			return

		therapy_types = []
		doc = frappe.get_doc("Therapy Plan", self.therapy_plan)
		for entry in doc.therapy_plan_details:
			therapy_types.append(entry.therapy_type)

		return therapy_types

	def update_event(self):
		if self.event and self.appointment_date and self._has_appointment_time():
			event_doc = frappe.get_doc("Event", self.event)
			starts_on = datetime.datetime.combine(
				getdate(self.appointment_date), get_time(self.appointment_time)
			)
			ends_on = starts_on + datetime.timedelta(minutes=flt(self.duration))
			if (
				starts_on != event_doc.starts_on
				or self.add_video_conferencing != event_doc.add_video_conferencing
			):
				event_doc.starts_on = starts_on
				event_doc.ends_on = ends_on
				event_doc.add_video_conferencing = self.add_video_conferencing
				event_doc.save(ignore_permissions=True)
				event_doc.reload()
				self.google_meet_link = event_doc.google_meet_link

	def set_postition_in_queue(self):
		from frappe.query_builder.functions import Max

		if self.status != "Checked In" or self.position_in_queue:
			return

		appointment = frappe.qb.DocType("Patient Appointment")
		query = (
			frappe.qb.from_(appointment)
			.select(
				Max(appointment.position_in_queue).as_("max_position"),
			)
			.where((appointment.status == "Checked In") & (appointment.name != self.name))
		)

		if self.appointment_for == "Practitioner":
			query = query.where(
				(appointment.practitioner == self.practitioner)
				& (appointment.appointment_time == self.appointment_time)
				& (appointment.service_unit == self.service_unit)
			)
		else:
			query = query.where(appointment.appointment_date == self.appointment_date)
			if self.service_unit:
				query = query.where(appointment.service_unit == self.service_unit)
			if self.department:
				query = query.where(appointment.department == self.department)

		position = query.run(as_dict=True)
		max_position = position[0]["max_position"] if position and position[0].get("max_position") else 0

		self.position_in_queue = max_position + 1


@frappe.whitelist()
def check_payment_reqd(patient):
	"""
	return True if patient need to be invoiced when show_payment_popup enabled or have no fee validity
	return False show_payment_popup is disabled
	"""
	show_payment_popup = frappe.db.get_single_value("Healthcare Settings", "show_payment_popup")
	free_follow_ups = frappe.db.get_single_value("Healthcare Settings", "enable_free_follow_ups")
	if show_payment_popup:
		if free_follow_ups:
			fee_validity = frappe.db.exists("Fee Validity", {"patient": patient, "status": "Active"})
			if fee_validity:
				return {"fee_validity": fee_validity}
		return True
	return False


@frappe.whitelist()
def invoice_appointment(appointment_name, discount_percentage=0, discount_amount=0):
	appointment_doc = frappe.get_doc("Patient Appointment", appointment_name)
	settings = frappe.get_single("Healthcare Settings")

	if settings.enable_free_follow_ups:
		fee_validity = check_fee_validity(appointment_doc)

		if fee_validity and fee_validity.status != "Active":
			fee_validity = None
		elif not fee_validity:
			if get_fee_validity(appointment_doc.name, appointment_doc.appointment_date):
				return
	else:
		fee_validity = None

	if settings.show_payment_popup and not appointment_doc.invoiced and not fee_validity:
		create_sales_invoice(appointment_doc, discount_percentage, discount_amount)
	update_fee_validity(appointment_doc)


def create_sales_invoice(appointment_doc, discount_percentage=0, discount_amount=0):
	sales_invoice = frappe.new_doc("Sales Invoice")
	sales_invoice.patient = appointment_doc.patient
	sales_invoice.customer = frappe.get_value("Patient", appointment_doc.patient, "customer")
	sales_invoice.appointment = appointment_doc.name
	sales_invoice.due_date = getdate()
	sales_invoice.company = appointment_doc.company
	sales_invoice.debit_to = get_receivable_account(appointment_doc.company)

	item = sales_invoice.append("items", {})
	item = get_appointment_item(appointment_doc, item)

	paid_amount = flt(appointment_doc.paid_amount)
	# Set discount amount and percentage if entered in payment popup
	if flt(discount_percentage):
		sales_invoice.additional_discount_percentage = flt(discount_percentage)
		paid_amount = flt(appointment_doc.paid_amount) - (
			flt(appointment_doc.paid_amount) * (flt(discount_percentage) / 100)
		)
	if flt(discount_amount):
		sales_invoice.discount_amount = flt(discount_amount)
		paid_amount = flt(appointment_doc.paid_amount) - flt(discount_amount)

	# Add payments if payment details are supplied else proceed to create invoice as Unpaid
	if appointment_doc.mode_of_payment and appointment_doc.paid_amount:
		sales_invoice.is_pos = 1
		payment = sales_invoice.append("payments", {})
		payment.mode_of_payment = appointment_doc.mode_of_payment
		payment.amount = paid_amount

	sales_invoice.set_missing_values(for_validate=True)
	sales_invoice.flags.ignore_mandatory = True
	sales_invoice.save(ignore_permissions=True)
	sales_invoice.submit()
	frappe.msgprint(_("Sales Invoice {0} created").format(sales_invoice.name), alert=True)
	frappe.db.set_value(
		"Patient Appointment",
		appointment_doc.name,
		{
			"invoiced": 1,
			"ref_sales_invoice": sales_invoice.name,
			"paid_amount": paid_amount,
		},
	)
	appointment_doc.notify_update()


@frappe.whitelist()
def update_fee_validity(appointment):
	if isinstance(appointment, str):
		appointment = json.loads(appointment)
		appointment = frappe.get_doc(appointment)

	if (
		not frappe.db.get_single_value("Healthcare Settings", "enable_free_follow_ups")
		or not appointment.practitioner
	):
		return

	fee_validity = manage_fee_validity(appointment)
	if fee_validity:
		frappe.msgprint(
			_("{0} has fee validity till {1}").format(
				frappe.bold(appointment.patient_name), format_date(fee_validity.valid_till)
			),
			alert=True,
		)


def check_is_new_patient(patient, name=None):
	filters = {"patient": patient, "status": ("!=", "Cancelled")}
	if name:
		filters["name"] = ("!=", name)

	has_previous_appointment = frappe.db.exists("Patient Appointment", filters)
	return not has_previous_appointment


def get_appointment_item(appointment_doc, item):
	details = get_appointment_billing_item_and_rate(appointment_doc)
	charge = appointment_doc.paid_amount or details.get("practitioner_charge")
	item.item_code = details.get("service_item")
	item.description = _("Consulting Charges: {0}").format(appointment_doc.practitioner)
	item.income_account = get_income_account(appointment_doc.practitioner, appointment_doc.company)
	item.cost_center = frappe.get_cached_value("Company", appointment_doc.company, "cost_center")
	item.rate = charge
	item.amount = charge
	item.qty = 1
	item.reference_dt = "Patient Appointment"
	item.reference_dn = appointment_doc.name
	return item


def cancel_appointment(appointment_id):
	appointment = frappe.get_doc("Patient Appointment", appointment_id)
	if appointment.service_request:
		frappe.db.set_value(
			"Service Request", appointment.service_request, "status", "active-Request Status"
		)

	if appointment.invoiced:
		sales_invoice = check_sales_invoice_exists(appointment)
		if sales_invoice and cancel_sales_invoice(sales_invoice):
			msg = _("Appointment {0} and Sales Invoice {1} cancelled").format(
				appointment.name, sales_invoice.name
			)
		else:
			msg = _("Appointment Cancelled. Please review and cancel the invoice {0}").format(
				sales_invoice.name
			)
		if frappe.db.get_single_value("Healthcare Settings", "enable_free_follow_ups"):
			fee_validity = frappe.db.get_value("Fee Validity", {"patient_appointment": appointment.name})
			if fee_validity:
				frappe.db.set_value("Fee Validity", fee_validity, "status", "Cancelled")

	else:
		fee_validity = manage_fee_validity(appointment) if appointment.patient else None
		msg = _("Appointment Cancelled.")
		if fee_validity:
			msg += _("Fee Validity {0} updated.").format(fee_validity.name)

	if appointment.event:
		event_doc = frappe.get_doc("Event", appointment.event)
		event_doc.status = "Cancelled"
		event_doc.save(ignore_permissions=True)

	frappe.msgprint(msg)


def cancel_sales_invoice(sales_invoice):
	if frappe.db.get_single_value("Healthcare Settings", "show_payment_popup"):
		if len(sales_invoice.items) == 1:
			if sales_invoice.docstatus.is_submitted():
				sales_invoice.cancel()
			return True
	return False


def check_sales_invoice_exists(appointment):
	sales_invoice = frappe.db.get_value(
		"Sales Invoice Item",
		{"reference_dt": "Patient Appointment", "reference_dn": appointment.name},
		"parent",
	)

	if sales_invoice:
		sales_invoice = frappe.get_doc("Sales Invoice", sales_invoice)
		return sales_invoice
	return False


@frappe.whitelist()
def get_availability_data(date, practitioner, appointment):
	"""
	Get availability data of 'practitioner' on 'date'
	:param date: Date to check in schedule
	:param practitioner: Name of the practitioner
	:return: dict containing a list of available slots, list of appointments and time of appointments
	"""

	date = getdate(date)
	weekday = date.strftime("%A")

	practitioner_doc = frappe.get_doc("Healthcare Practitioner", practitioner)

	check_employee_wise_availability(date, practitioner_doc)

	if practitioner_doc.practitioner_schedules:
		slot_details = get_available_slots(practitioner_doc, date)
	else:
		display_name = practitioner_doc.practitioner_name or practitioner
		return {
			"slot_details": [],
			"fee_validity": "Disabled",
			"user_message": _(
				"{0} has no practitioner schedule. Open the Healthcare Practitioner record and add entries under Practitioner Schedules, or use Custom time to book."
			).format(display_name),
		}

	if not slot_details:
		# Practitioner has no schedule for this weekday; return empty slots so UI can show a message
		return {"slot_details": [], "fee_validity": "Disabled"}

	if isinstance(appointment, str):
		s = appointment.strip()
		if s.lower() in ("", "new"):
			appointment = frappe.new_doc("Patient Appointment")
		elif s.startswith("{"):
			appointment = json.loads(appointment)
			appointment = frappe.get_doc(appointment)
		else:
			appointment = frappe.get_doc("Patient Appointment", appointment)
	elif appointment is None:
		appointment = frappe.new_doc("Patient Appointment")

	fee_validity = "Disabled"
	if frappe.db.get_single_value("Healthcare Settings", "enable_free_follow_ups"):
		fee_validity = check_fee_validity(appointment, date, practitioner)
		if not fee_validity and not getattr(appointment, "__islocal", True):
			name = getattr(appointment, "name", None)
			if name:
				fee_validity = get_fee_validity(name, date) or None

	if getattr(appointment, "invoiced", False):
		fee_validity = "Disabled"

	return {"slot_details": slot_details, "fee_validity": fee_validity}


def check_employee_wise_availability(date, practitioner_doc):
	employee = None
	if practitioner_doc.employee:
		employee = practitioner_doc.employee
	elif practitioner_doc.user_id:
		employee = frappe.db.get_value("Employee", {"user_id": practitioner_doc.user_id}, "name")

	if employee:
		# check holiday
		if is_holiday(employee, date):
			frappe.throw(_("{0} is a holiday".format(date)), title=_("Not Available"))

		# check leave status
		if "hrms" in frappe.get_installed_apps():
			leave_record = frappe.db.sql(
				"""select half_day from `tabLeave Application`
				where employee = %s and %s between from_date and to_date
				and docstatus = 1""",
				(employee, date),
				as_dict=True,
			)
			if leave_record:
				if leave_record[0].half_day:
					frappe.throw(
						_("{0} is on a Half day Leave on {1}").format(practitioner_doc.name, date),
						title=_("Not Available"),
					)
				else:
					frappe.throw(
						_("{0} is on Leave on {1}").format(practitioner_doc.name, date), title=_("Not Available")
					)


def get_available_slots(practitioner_doc, date):
	available_slots = slot_details = []
	weekday = date.strftime("%A")
	practitioner = practitioner_doc.name

	for schedule_entry in practitioner_doc.practitioner_schedules:
		validate_practitioner_schedules(schedule_entry, practitioner)
		practitioner_schedule = frappe.get_doc("Practitioner Schedule", schedule_entry.schedule)

		if practitioner_schedule and not practitioner_schedule.disabled:
			available_slots = []
			for time_slot in practitioner_schedule.time_slots:
				if weekday == time_slot.day:
					available_slots.append(time_slot)

			if available_slots:
				appointments = []
				allow_overlap = 0
				service_unit_capacity = 0
				# fetch all appointments to practitioner by service unit
				filters = {
					"practitioner": practitioner,
					"service_unit": schedule_entry.service_unit,
					"appointment_date": date,
					"status": ["not in", ["Cancelled"]],
				}

				if schedule_entry.service_unit:
					slot_name = f"{schedule_entry.schedule}"
					allow_overlap, service_unit_capacity = frappe.get_value(
						"Healthcare Service Unit",
						schedule_entry.service_unit,
						["overlap_appointments", "service_unit_capacity"],
					)
					if not allow_overlap:
						# fetch all appointments to service unit
						filters.pop("practitioner")
				else:
					slot_name = schedule_entry.schedule
					# fetch all appointments to practitioner without service unit
					filters["practitioner"] = practitioner
					filters.pop("service_unit")

				appointments = frappe.get_all(
					"Patient Appointment",
					filters=filters,
					fields=["name", "appointment_time", "duration", "status", "appointment_date"],
				)

				slot_details.append(
					{
						"slot_name": slot_name,
						"service_unit": schedule_entry.service_unit,
						"avail_slot": available_slots,
						"appointments": appointments,
						"allow_overlap": allow_overlap,
						"service_unit_capacity": service_unit_capacity,
						"tele_conf": practitioner_schedule.allow_video_conferencing,
					}
				)
	return slot_details


def validate_practitioner_schedules(schedule_entry, practitioner):
	if schedule_entry.schedule:
		if not schedule_entry.service_unit:
			frappe.throw(
				_(
					"Practitioner {0} does not have a Service Unit set against the Practitioner Schedule {1}."
				).format(
					get_link_to_form("Healthcare Practitioner", practitioner),
					frappe.bold(schedule_entry.schedule),
				),
				title=_("Service Unit Not Found"),
			)

	else:
		frappe.throw(
			_("Practitioner {0} does not have a Practitioner Schedule assigned.").format(
				get_link_to_form("Healthcare Practitioner", practitioner)
			),
			title=_("Practitioner Schedule Not Found"),
		)


@frappe.whitelist()
def update_status(appointment_id, status, notes=None, checkout_time=None):
	updates = {"status": status}
	if status == "Checked Out":
		updates["checkout"] = get_datetime(checkout_time) if checkout_time else now_datetime()
	frappe.db.set_value("Patient Appointment", appointment_id, updates, update_modified=True)
	if notes is not None and cstr(notes).strip():
		prev = frappe.db.get_value("Patient Appointment", appointment_id, "notes") or ""
		add = cstr(notes).strip()
		merged = f"{prev}\n{add}".strip() if prev else add
		frappe.db.set_value("Patient Appointment", appointment_id, "notes", merged)
	appointment_booked = True
	if status == "Cancelled":
		appointment_booked = False
		cancel_appointment(appointment_id)

	procedure_prescription = frappe.db.get_value(
		"Patient Appointment", appointment_id, "procedure_prescription"
	)
	if procedure_prescription:
		frappe.db.set_value(
			"Procedure Prescription", procedure_prescription, "appointment_booked", appointment_booked
		)

	result = {}
	if status == "Patient Arrived":
		patient = frappe.db.get_value("Patient Appointment", appointment_id, "patient")
		if not patient:
			frappe.throw(
				_("Register the walk-in patient before marking as arrived."),
				title=_("Registration required"),
				exc=frappe.ValidationError,
			)
		result["patient_visit"] = get_or_create_encounter_from_appointment(appointment_id)

	return result


def send_confirmation_msg(doc):
	if frappe.db.get_single_value("Healthcare Settings", "send_appointment_confirmation"):
		message = frappe.db.get_single_value("Healthcare Settings", "appointment_confirmation_msg")
		try:
			send_message(doc, message)
		except Exception:
			frappe.log_error(frappe.get_traceback(), _("Appointment Confirmation Message Not Sent"))
			frappe.msgprint(_("Appointment Confirmation Message Not Sent"), indicator="orange")


@frappe.whitelist()
def make_encounter(source_name, target_doc=None):
	doc = get_mapped_doc(
		"Patient Appointment",
		source_name,
		{
			"Patient Appointment": {
				"doctype": "Patient Visit",
				"field_map": [
					["appointment", "name"],
					["patient", "patient"],
					["practitioner", "practitioner"],
					["medical_department", "department"],
					["patient_sex", "patient_sex"],
					["invoiced", "invoiced"],
					["company", "company"],
				],
			}
		},
		target_doc,
	)
	return doc


def _prepare_patient_visit_from_appointment(doc, appointment):
	"""Set required Patient Visit fields before insert (case_no is the document name)."""
	from healthcare.api.utils.api_utility import get_next_transaction_number
	from healthcare.healthcare.doctype.patient_visit.open_visit_guard import (
		ensure_patient_can_open_new_visit,
	)

	if not doc.case_no:
		doc.case_no = get_next_transaction_number("Patient Visit", fieldname="case_no")
	if not doc.encounter_date:
		doc.encounter_date = appointment.appointment_date
	if not doc.encounter_time:
		doc.encounter_time = appointment.appointment_time or get_time("00:00:00")
	if not doc.status:
		doc.status = "Open"
	if not doc.visit_type:
		doc.visit_type = "New Visit"

	ensure_patient_can_open_new_visit(appointment.patient)
	return doc


def get_or_create_encounter_from_appointment(appointment_id):
	"""Return an existing Patient Visit for the appointment, or create one."""
	existing = frappe.db.get_value("Patient Visit", {"appointment": appointment_id}, "name")
	if existing:
		_link_appointment_patient_visit(appointment_id, existing)
		return existing

	appointment = frappe.get_doc("Patient Appointment", appointment_id)
	if not appointment.patient:
		frappe.throw(
			_("Register this walk-in as a patient before creating a patient visit."),
			title=_("Patient required"),
		)
	doc = make_encounter(appointment_id)
	_prepare_patient_visit_from_appointment(doc, appointment)
	doc.insert()
	frappe.db.commit()
	_link_appointment_patient_visit(appointment_id, doc.name)
	return doc.name


def _link_appointment_patient_visit(appointment_id, patient_visit):
	if not appointment_id or not patient_visit:
		return
	current = frappe.db.get_value("Patient Appointment", appointment_id, "patient_visit")
	if current == patient_visit:
		return
	frappe.db.set_value(
		"Patient Appointment",
		appointment_id,
		"patient_visit",
		patient_visit,
		update_modified=False,
	)


@frappe.whitelist()
def get_patient_visit_for_appointment(appointment_id):
	"""Resolve linked Patient Visit for an appointment (field or reverse lookup)."""
	appointment_id = cstr(appointment_id).strip()
	if not appointment_id:
		return None

	visit = frappe.db.get_value("Patient Appointment", appointment_id, "patient_visit")
	if visit:
		return visit

	visit = frappe.db.get_value("Patient Visit", {"appointment": appointment_id}, "name")
	if visit:
		_link_appointment_patient_visit(appointment_id, visit)
	return visit


@frappe.whitelist()
def create_encounter_from_appointment(appointment_id):
	"""Create a Patient Visit (encounter) from an appointment; returns the new doc name for opening in UI."""
	return get_or_create_encounter_from_appointment(appointment_id)


@frappe.whitelist()
def reschedule_appointment(
	appointment_id, appointment_date, appointment_time=None, duration=None, service_unit=None
):
	"""Reschedule an appointment to a new date and time (and optional slot duration/service_unit)."""
	doc = frappe.get_doc("Patient Appointment", appointment_id)
	doc.appointment_date = appointment_date
	doc.appointment_time = appointment_time or "00:00:00"
	if duration is not None:
		doc.duration = duration
	if service_unit is not None:
		doc.service_unit = service_unit
	doc.flags.ignore_validate_update_after_submit = True
	doc.save()
	frappe.db.commit()
	return {"name": doc.name, "appointment_date": doc.appointment_date, "appointment_time": doc.appointment_time}


@frappe.whitelist()
def get_appointment_whatsapp_preview(appointment_name, template_name=None):
	"""Return WhatsApp preview data for an appointment (phone, templates, filled message)."""
	if not appointment_name:
		frappe.throw(_("Appointment name is required"))

	doc = frappe.get_doc("Patient Appointment", appointment_name)
	templates = _get_appointment_whatsapp_templates(doc)
	if not templates:
		frappe.throw(
			_(
				"No WhatsApp template mapped for Patient Appointment. "
				"Add one under Digital Connect Whatsap Settings → Template Mapping."
			)
		)

	selected_name = template_name or (templates[0]["name"] if len(templates) == 1 else None)
	if selected_name and selected_name not in {t["name"] for t in templates}:
		frappe.throw(_("Template {0} is not available for this appointment").format(selected_name))

	selected = None
	preview = None
	parameters = []
	if selected_name:
		selected = next(t for t in templates if t["name"] == selected_name)
		parameters = _build_appointment_whatsapp_parameters(doc, selected_name)
		preview = _render_whatsapp_template_preview(selected_name, parameters)

	branch_info = _get_digiconnect_branch_info(doc.get("cost_center"))
	country, country_isd = _get_company_country_isd(doc.get("company"))

	return {
		"appointment": doc.name,
		"patient": doc.patient,
		"patient_name": doc.patient_name or doc.get("temporary_patient_name") or doc.patient,
		"phone_number": _resolve_appointment_mobile_for_reminder(doc) or "",
		"country": country,
		"country_isd": country_isd,
		"templates": templates,
		"selected_template": selected_name,
		"parameters": parameters,
		"preview": preview,
		"branch": branch_info,
		"selected": selected,
	}


@frappe.whitelist()
def send_appointment_reminder_manual(
	appointment_name,
	channel="sms",
	phone_number=None,
	template_name=None,
	template_parameters=None,
):
	"""Send a reminder for a single appointment via the chosen channel.

	channel: 'email' | 'whatsapp' | 'sms'
	For WhatsApp, optional phone_number / template_name / template_parameters override defaults.
	"""
	if not appointment_name:
		frappe.throw(_("Appointment name is required"))

	doc = frappe.get_doc("Patient Appointment", appointment_name)
	channel = (channel or "sms").lower()
	valid_channels = ("email", "whatsapp", "sms")
	if channel not in valid_channels:
		frappe.throw(_("Invalid channel '{0}'. Must be one of: {1}").format(channel, ", ".join(valid_channels)))

	# UI/user override: normalize lightly (don't stack a second country code).
	# Default path: resolve already returns a normalized number.
	override = (phone_number or "").strip()
	if override:
		patient_mobile = _normalize_whatsapp_phone(override, company=doc.get("company"))
	else:
		patient_mobile = _resolve_appointment_mobile_for_reminder(doc)
	if channel == "whatsapp":
		from healthcare.healthcare.doctype.digital_connect_whatsap_settings.digital_connect_whatsap_settings import (
			send_test_message,
		)

		if not patient_mobile:
			frappe.throw(_("Patient has no mobile number. Enter a number to send WhatsApp."))

		resolved_template = (template_name or "").strip() or doc.get("whatsapp_template")
		if not resolved_template:
			mapped = _get_appointment_whatsapp_templates(doc)
			if len(mapped) == 1:
				resolved_template = mapped[0]["name"]
			elif len(mapped) > 1:
				frappe.throw(_("Multiple WhatsApp templates found. Please select one."))

		if resolved_template:
			if template_parameters is None:
				params_list = _build_appointment_whatsapp_parameters(doc, resolved_template)
				template_parameters = params_list
			elif isinstance(template_parameters, str):
				# Prefer JSON list from UI; fall back to comma-separated for older callers
				stripped = template_parameters.strip()
				if stripped.startswith("["):
					try:
						parsed = frappe.parse_json(stripped)
						if isinstance(parsed, list):
							template_parameters = parsed
					except Exception:
						pass

			result = send_test_message(
				phone_number=patient_mobile,
				template_name=resolved_template,
				template_parameters=template_parameters or [],
			)
		else:
			body = _(
				"Dear {0}, you have an appointment on {1} at {2} with {3}. Please arrive on time."
			).format(
				doc.patient_name or doc.patient,
				format_date(doc.appointment_date),
				doc.appointment_time or "-",
				doc.practitioner_name or "your doctor",
			)
			result = send_test_message(phone_number=patient_mobile, body=body, preview_url=1)
		chat_name = result.get("chat_name") if isinstance(result, dict) else None
		if chat_name:
			frappe.db.set_value(
				"Digital Whatsapp Chat",
				chat_name,
				{"reference_doctype": "Patient Appointment", "reference_name": doc.name},
				update_modified=True,
			)
	elif channel == "sms":
		if not patient_mobile:
			frappe.throw(_("Patient has no mobile number. Enter a temporary mobile on the appointment or update the patient."))
		message = frappe.db.get_single_value("Healthcare Settings", "appointment_reminder_msg") or _(
			"Dear {0}, you have an appointment on {1}. Please arrive on time."
		).format(
			doc.patient_name or doc.get("temporary_patient_name") or doc.patient or _("Patient"),
			format_date(doc.appointment_date),
		)
		# Walk-ins have no Patient doc — send SMS directly with resolved mobile
		if doc.patient:
			send_message(doc, message)
		else:
			context = {"doc": doc, "alert": doc, "comments": None}
			rendered = frappe.render_template(message, context)
			try:
				send_sms([patient_mobile], rendered)
			except Exception:
				frappe.msgprint(_("SMS not sent, please check SMS Settings"), alert=True)
				raise
	elif channel == "email":
		patient_email = frappe.db.get_value("Patient", doc.patient, "email") if doc.patient else None
		if not patient_email:
			frappe.throw(_("Patient has no email address. Walk-in appointments cannot receive email reminders until a patient file is linked."))
		frappe.sendmail(
			recipients=[patient_email],
			subject=_("Appointment Reminder"),
			message=_(
				"Dear {0}, this is a reminder for your appointment on {1} at {2} with {3}."
			).format(
				doc.patient_name or doc.get("temporary_patient_name") or doc.patient,
				format_date(doc.appointment_date),
				doc.appointment_time or "-",
				doc.practitioner_name or "your doctor",
			),
		)

	return {"sent": True, "channel": channel, "appointment": doc.name}


def _get_appointment_whatsapp_templates(doc):
	"""Resolve approved WhatsApp templates for Patient Appointment from settings mapping."""
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
				"variable_count": _count_template_variables(row.header_text if row.header_type == "TEXT" else "")
				+ _count_template_variables(row.body_text),
			}
		)

	if doc.get("whatsapp_template"):
		add_template(doc.whatsapp_template, purpose="Appointment Template")

	if frappe.db.exists("DocType", "Digital Connect Whatsap Settings"):
		settings = frappe.get_single("Digital Connect Whatsap Settings")
		for row in settings.get("template_mapping") or []:
			if row.get("reference_document") == "Patient Appointment" and row.get("template"):
				add_template(row.template, purpose=row.get("purpose") or "")

	if not out:
		for name in frappe.get_all(
			"Digital Whatsapp Template",
			filters={"for_doctype": "Patient Appointment", "status": "APPROVED"},
			pluck="name",
		):
			add_template(name)

	return out


def _count_template_variables(text):
	import re

	if not text:
		return 0
	matches = re.findall(r"\{\{(\d+)\}\}", text)
	if not matches:
		return 0
	return max(int(m) for m in matches)


def _get_digiconnect_branch_info(cost_center):
	"""Return branch contacts/prefix from DigiConnect Branch for a cost center."""
	info = {"branch": cost_center or "", "branch_label": "", "branch_prefix": "", "contacts": ""}
	if cost_center:
		info["branch_label"] = (
			frappe.db.get_value("Cost Center", cost_center, "cost_center_name") or cost_center
		)
	if not cost_center or not frappe.db.exists("DocType", "Digital Connect Whatsap Settings"):
		return info

	settings = frappe.get_single("Digital Connect Whatsap Settings")
	for row in settings.get("branch_wise_contact") or []:
		if row.get("branch") == cost_center:
			info["branch_prefix"] = (row.get("branch_prefix") or "").strip()
			info["contacts"] = (row.get("contacts") or "").strip()
			if info["branch_prefix"]:
				info["branch_label"] = info["branch_prefix"]
			break
	return info


def _format_appointment_datetime_whatsapp(doc):
	"""Format like: TUE 07-JUL-2026 at 10:00 AM"""
	if not doc.appointment_date:
		return ""
	d = getdate(doc.appointment_date)
	date_part = f"{d.strftime('%a').upper()} {d.strftime('%d-%b-%Y').upper()}"
	time_raw = doc.appointment_time or doc.get("old_time")
	if not time_raw:
		return date_part
	try:
		t = get_time(time_raw)
		hour = t.hour
		minute = t.minute
		ampm = "PM" if hour >= 12 else "AM"
		hour12 = hour % 12 or 12
		return f"{date_part} at {hour12}:{minute:02d} {ampm}"
	except Exception:
		return f"{date_part} at {time_raw}"


def _build_appointment_whatsapp_param_map(doc):
	"""Build a lookup of common appointment WhatsApp template parameters."""
	branch = _get_digiconnect_branch_info(doc.get("cost_center"))
	patient_name = (
		doc.patient_name or doc.get("temporary_patient_name") or doc.patient or ""
	)
	practitioner = doc.practitioner_name or doc.practitioner or ""
	datetime_str = _format_appointment_datetime_whatsapp(doc)
	contacts = branch.get("contacts") or ""
	branch_label = branch.get("branch_label") or branch.get("branch") or ""

	values = {
		"patient_name": patient_name,
		"patient": patient_name,
		"practitioner_name": practitioner,
		"practitioner": practitioner,
		"doctor": practitioner,
		"doctor_name": practitioner,
		"branch": branch_label,
		"cost_center": branch_label,
		"branch_prefix": branch.get("branch_prefix") or branch_label,
		"branch_contacts": contacts,
		"contacts": contacts,
		"appointment_datetime": datetime_str,
		"appointment_date_time": datetime_str,
		"date_time": datetime_str,
		"datetime": datetime_str,
		"appointment_date": format_date(doc.appointment_date) if doc.appointment_date else "",
		"appointment_time": cstr(doc.appointment_time or ""),
		"company": doc.company or "",
	}
	# Also expose raw appointment fields
	for key in (
		"name",
		"department",
		"service_unit",
		"appointment_type",
		"status",
		"notes",
	):
		if key not in values:
			values[key] = cstr(doc.get(key) or "")
	return values


def _build_appointment_whatsapp_parameters(doc, template_name):
	"""Build ordered parameter values for a WhatsApp template."""
	import re

	template = frappe.get_doc("Digital Whatsapp Template", template_name)
	param_map = _build_appointment_whatsapp_param_map(doc)
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
		param_map["practitioner_name"],
		param_map["branch"],
		param_map["appointment_datetime"],
		param_map["branch_contacts"],
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


def _render_whatsapp_template_preview(template_name, parameters):
	"""Replace {{n}} placeholders with parameter values for UI preview."""
	import re

	template = frappe.get_doc("Digital Whatsapp Template", template_name)
	params = list(parameters or [])

	def fill(text, offset=0):
		if not text:
			return ""

		def repl(match):
			idx = int(match.group(1)) - 1
			abs_idx = offset + idx
			if 0 <= abs_idx < len(params):
				return cstr(params[abs_idx])
			return match.group(0)

		return re.sub(r"\{\{(\d+)\}\}", repl, text)

	header_offset = 0
	header_text = ""
	if template.header_type == "TEXT" and template.header_text:
		header_count = _count_template_variables(template.header_text)
		header_text = fill(template.header_text, 0)
		header_offset = header_count

	body_text = fill(template.body_text or "", header_offset)
	return {
		"header": header_text,
		"body": body_text,
		"footer": template.footer_text or "",
		"template_name": template.template_name,
		"actual_name": template.actual_name,
	}


@frappe.whitelist()
def send_appointment_reminders_bulk(appointment_names=None, channel="sms"):
	"""Send reminders for multiple appointments.

	appointment_names: JSON list of appointment names
	"""
	if isinstance(appointment_names, str):
		appointment_names = frappe.parse_json(appointment_names)
	if not appointment_names:
		return {"sent": 0, "failed": 0}

	sent = 0
	failed = 0
	for name in appointment_names:
		try:
			send_appointment_reminder_manual(name, channel=channel)
			sent += 1
		except Exception:
			frappe.log_error(frappe.get_traceback(), f"Appointment reminder failed: {name}")
			failed += 1
	return {"sent": sent, "failed": failed}


def _resolve_appointment_mobile_for_reminder(doc):
	"""Resolve mobile for WhatsApp: Patient first, then appointment temporary number.

	Normalizes local numbers using the company's country ISD code
	(e.g. Kenya 0740743521 → 254740743521).
	"""
	raw = ""
	if doc.patient:
		values = frappe.db.get_value(
			"Patient",
			doc.patient,
			["mobile", "mobile_no", "mobile_no_1", "phone"],
			as_dict=True,
		) or {}
		for field in ("mobile", "mobile_no", "mobile_no_1", "phone"):
			number = (values.get(field) or "").strip()
			if number:
				raw = number
				break

	if not raw:
		raw = (doc.get("temporary_mobile_no") or "").strip()

	if not raw:
		return ""

	return _normalize_whatsapp_phone(raw, company=doc.get("company"))


def _get_company_country_isd(company=None):
	"""Return (country_name, isd_digits) from Company.country via frappe country_info."""
	country = None
	if company:
		country = frappe.db.get_value("Company", company, "country")
	if not country:
		country = frappe.db.get_single_value("Global Defaults", "country")
	if not country:
		return "", ""

	try:
		from frappe.geo.country_info import get_country_info

		info = get_country_info(country) or {}
		isd = (info.get("isd") or "").strip()
	except Exception:
		isd = ""

	isd_digits = "".join(ch for ch in isd if ch.isdigit())
	return country or "", isd_digits


def _normalize_whatsapp_phone(phone, company=None):
	"""Normalize a phone number to international digits without '+' .

	Examples (company country Kenya / +254):
	- 0740743521 → 254740743521
	- 740743521 → 254740743521
	- +254 740 743 521 → 254740743521
	- 254740743521 → 254740743521

	If the user already typed an international number (+… / 00… / full E.164),
	do **not** prepend the company ISD again (avoids 973254740743521).
	"""
	if not phone:
		return ""

	import re

	text = str(phone).strip()
	# Explicit international markers — trust the country code the user entered.
	had_intl_prefix = text.startswith("+") or text.startswith("00")
	digits = re.sub(r"\D", "", text)
	if not digits:
		return ""

	# Strip international access prefix 00…
	while digits.startswith("00") and len(digits) > 2:
		digits = digits[2:]
		had_intl_prefix = True

	_country, isd = _get_company_country_isd(company)
	if not isd:
		# No country context — strip leading zeros only for local-looking numbers
		if not had_intl_prefix and digits.startswith("0"):
			digits = digits.lstrip("0")
		return digits

	# Already in international form for this company
	if digits.startswith(isd):
		return digits

	# User supplied another country's number with + / 00 — keep as-is
	if had_intl_prefix:
		return digits

	# Local numbers often start with trunk prefix 0 (e.g. 07…)
	if digits.startswith("0"):
		digits = digits.lstrip("0")
		if not digits:
			return ""
		if digits.startswith(isd):
			return digits
		return f"{isd}{digits}"

	# No trunk 0: short numbers are treated as local (prepend company ISD).
	# Longer digit strings usually already include a country calling code
	# (e.g. 254740743521) — do not prepend again.
	if len(digits) >= 11:
		return digits

	return f"{isd}{digits}"


def send_appointment_reminder():
	if frappe.db.get_single_value("Healthcare Settings", "send_appointment_reminder"):
		remind_before = datetime.datetime.strptime(
			frappe.db.get_single_value("Healthcare Settings", "remind_before"), "%H:%M:%S"
		)
		reminder_dt = datetime.datetime.now() + datetime.timedelta(
			hours=remind_before.hour, minutes=remind_before.minute, seconds=remind_before.second
		)

		appointment_list = frappe.db.get_all(
			"Patient Appointment",
			{
				"appointment_datetime": ["between", (datetime.datetime.now(), reminder_dt)],
				"reminded": 0,
				"status": ["!=", "Cancelled"],
			},
		)

		for appointment in appointment_list:
			doc = frappe.get_doc("Patient Appointment", appointment.name)
			message = frappe.db.get_single_value("Healthcare Settings", "appointment_reminder_msg")
			send_message(doc, message)
			frappe.db.set_value("Patient Appointment", doc.name, "reminded", 1)


def send_message(doc, message):
	patient_mobile = frappe.db.get_value("Patient", doc.patient, "mobile")
	if patient_mobile:
		context = {"doc": doc, "alert": doc, "comments": None}
		if doc.get("_comments"):
			context["comments"] = json.loads(doc.get("_comments"))

		# jinja to string convertion happens here
		message = frappe.render_template(message, context)
		number = [patient_mobile]
		try:
			send_sms(number, message)
		except Exception as e:
			frappe.msgprint(_("SMS not sent, please check SMS Settings"), alert=True)


@frappe.whitelist()
def get_events(start, end, filters=None):
	"""Returns events for Gantt / Calendar view rendering.

	:param start: Start date-time.
	:param end: End date-time.
	:param filters: Filters (JSON).
	"""
	from frappe.desk.calendar import get_event_conditions
	from frappe.desk.reportview import build_match_conditions

	conditions = get_event_conditions("Patient Appointment", filters)
	match_conditions = build_match_conditions("Patient Appointment")

	if match_conditions:
		conditions += "and" + match_conditions

	data = frappe.db.sql(
		"""
		select
		`tabPatient Appointment`.name, `tabPatient Appointment`.patient,
		`tabPatient Appointment`.practitioner, `tabPatient Appointment`.status,
		`tabPatient Appointment`.duration,
		timestamp(`tabPatient Appointment`.appointment_date, `tabPatient Appointment`.appointment_time) as 'start',
		`tabAppointment Type`.color
		from
		`tabPatient Appointment`
		left join `tabAppointment Type` on `tabPatient Appointment`.appointment_type=`tabAppointment Type`.name
		where
		(`tabPatient Appointment`.appointment_date between %(start)s and %(end)s)
		and `tabPatient Appointment`.status != 'Cancelled' and `tabPatient Appointment`.docstatus < 2 {conditions}""".format(
			conditions=conditions
		),
		{"start": start, "end": end},
		as_dict=True,
		update={"allDay": 0},
	)

	for item in data:
		item.end = item.start + datetime.timedelta(minutes=item.duration)

	return data


@frappe.whitelist()
def get_procedure_prescribed(patient):
	return frappe.db.sql(
		"""
			SELECT
				pp.name, pp.procedure, pp.parent, ct.practitioner,
				ct.encounter_date, pp.practitioner, pp.date, pp.department
			FROM
				`tabPatient Visit` ct, `tabProcedure Prescription` pp
			WHERE
				ct.patient=%(patient)s and pp.parent=ct.name and pp.appointment_booked=0
			ORDER BY
				ct.creation desc
		""",
		{"patient": patient},
	)


@frappe.whitelist()
def get_prescribed_therapies(patient):
	return frappe.db.sql(
		"""
			SELECT
				t.therapy_type, t.name, t.parent, e.practitioner,
				e.encounter_date, e.therapy_plan, e.medical_department
			FROM
				`tabPatient Visit` e, `tabTherapy Plan Detail` t
			WHERE
				e.patient=%(patient)s and t.parent=e.name
			ORDER BY
				e.creation desc
		""",
		{"patient": patient},
	)


def update_appointment_status():
	# update the status of appointments daily
	appointments = frappe.get_all(
		"Patient Appointment", {"status": ("not in", ["Closed", "Cancelled", "Confirmed"])}
	)

	for appointment in appointments:
		appointment_doc = frappe.get_doc("Patient Appointment", appointment.name)
		appointment_doc.set_status()
		appointment_doc.save()
