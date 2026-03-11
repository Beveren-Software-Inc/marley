# -*- coding: utf-8 -*-
# Copyright (c) 2020, earthians and contributors
# For license information, please see license.txt

from __future__ import unicode_literals

import json

from six import string_types

import frappe
from frappe import _
from frappe.model.mapper import get_mapped_doc
from frappe.utils import now_datetime

from healthcare.controllers.service_request_controller import ServiceRequestController
from healthcare.healthcare.doctype.observation.observation import add_observation
from healthcare.healthcare.doctype.observation_template.observation_template import (
	get_observation_template_details,
)
from healthcare.healthcare.doctype.sample_collection.sample_collection import (
	set_component_observation_data,
)


class ServiceRequest(ServiceRequestController):
	def validate(self):
		super().validate()
		if self.template_dt and self.template_dn and not self.codification_table:
			template_doc = frappe.get_doc(self.template_dt, self.template_dn)
			codification_table = getattr(template_doc, "codification_table", None)
			if codification_table:
				for mcode in codification_table:
					self.append("codification_table", (frappe.copy_doc(mcode)).as_dict())

	def set_title(self):
		if frappe.flags.in_import and self.title:
			return
		self.title = f"{self.patient_name} - {self.template_dn}"

	def before_insert(self):
		self.status = "draft-Request Status"

		if self.amended_from:
			frappe.db.set_value("Service Request", self.amended_from, "status", "revoked-Request Status")

		if self.template_dt == "Observation Template" and self.template_dn:
			self.sample_collection_required = frappe.db.get_value(
				"Observation Template", self.template_dn, "sample_collection_required"
			)

	def set_order_details(self):
		pass
		if not self.template_dt and not self.template_dn:
			frappe.throw(
				_("Order Template Type and Order Template are mandatory to create Service Request"),
				title=_("Missing Mandatory Fields"),
			)

		template = frappe.get_doc(self.template_dt, self.template_dn)
		# set item code (template may have "item" or "item_code", e.g. IP Service Type)
		self.item_code = template.get("item") or template.get("item_code")

		if not self.patient_care_type and template.get("patient_care_type"):
			self.patient_care_type = template.patient_care_type

		if not self.staff_role and template.get("staff_role"):
			self.staff_role = template.staff_role

		if not self.intent:
			self.intent = frappe.db.get_single_value("Healthcare Settings", "default_intent")

		if not self.priority:
			self.priority = frappe.db.get_single_value("Healthcare Settings", "default_priority")

	def update_invoice_details(self, qty):
		"""
		updates qty_invoiced and set  billing status
		"""
		qty_invoiced = self.qty_invoiced + qty
		invoiced = 0
		if qty_invoiced == 0:
			status = "Pending"
		if qty_invoiced < self.quantity:
			status = "Partly Invoiced"
		else:
			invoiced = 1
			status = "Invoiced"

		self.db_set({"qty_invoiced": qty_invoiced, "billing_status": status})
		if self.template_dt == "Lab Test Template":
			dt = "Lab Test"
		elif self.template_dt == "Clinical Procedure Template":
			dt = "Clinical Procedure"
		elif self.template_dt == "Therapy Type":
			dt = "Therapy Session"
		elif self.template_dt == "Observation Template":
			dt = "Observation"
		dt_name = frappe.db.get_value(dt, {"service_request": self.name})
		frappe.db.set_value(dt, dt_name, "invoiced", invoiced)


def update_service_request_status(service_request, service_dt, service_dn, status=None, qty=1):
	# TODO: fix status updates from linked docs
	set_service_request_status(service_request, status)


@frappe.whitelist()
def set_service_request_status(service_request, status):
	frappe.db.set_value("Service Request", service_request, "status", status)


@frappe.whitelist()
def make_clinical_procedure(service_request):
	if isinstance(service_request, string_types):
		service_request = json.loads(service_request)
		service_request = frappe._dict(service_request)

	if (
		frappe.db.get_single_value("Healthcare Settings", "process_service_request_only_if_paid")
		and service_request.billing_status != "Invoiced"
	):
		frappe.throw(
			_("Service Request need to be invoiced before proceeding"),
			title=_("Payment Required"),
		)

	doc = frappe.new_doc("Clinical Procedure")
	doc.procedure_template = service_request.template_dn
	doc.service_request = service_request.name
	doc.company = service_request.company
	doc.patient = service_request.patient
	doc.patient_name = service_request.patient_name
	doc.patient_sex = service_request.patient_gender
	doc.patient_age = service_request.patient_age_data
	doc.inpatient_record = service_request.inpatient_record
	doc.practitioner = service_request.practitioner
	doc.start_date = service_request.occurrence_date
	doc.start_time = service_request.occurrence_time
	doc.medical_department = service_request.medical_department

	return doc


@frappe.whitelist()
def make_lab_test(service_request):
	if isinstance(service_request, string_types):
		service_request = json.loads(service_request)
		service_request = frappe._dict(service_request)

	if (
		frappe.db.get_single_value("Healthcare Settings", "process_service_request_only_if_paid")
		and service_request.billing_status != "Invoiced"
	):
		frappe.throw(
			_("Service Request need to be invoiced before proceeding"),
			title=_("Payment Required"),
		)

	doc = frappe.new_doc("Lab Test")
	doc.template = service_request.template_dn
	doc.service_request = service_request.name
	doc.company = service_request.company
	doc.patient = service_request.patient
	doc.patient_name = service_request.patient_name
	doc.patient_sex = service_request.patient_gender
	doc.patient_age = service_request.patient_age_data
	doc.inpatient_record = service_request.inpatient_record
	doc.email = service_request.patient_email
	doc.mobile = service_request.patient_mobile
	doc.practitioner = service_request.practitioner
	doc.requesting_department = service_request.medical_department
	doc.date = service_request.occurrence_date
	doc.time = service_request.occurrence_time
	doc.invoiced = service_request.invoiced
	# Propagate Cost Center from Service Request to Lab Test when available
	if getattr(service_request, "cost_center", None):
		doc.cost_center = service_request.cost_center

	return doc


@frappe.whitelist()
def book_lab_and_forward(service_request_name):
	"""
	Booked Lab: after patient has accepted cost, forward the lab request to the laboratory.
	Creates the Lab Test, marks Service Request as forwarded, and reflects approved amount on Patient Visit.
	"""
	if not service_request_name:
		frappe.throw(_("Service Request name is required"))
	sr = frappe.get_doc("Service Request", service_request_name)
	if sr.template_dt != "Lab Test Template":
		frappe.throw(_("Booked Lab is only for Lab Test Template requests."))
	if not sr.patient_accepted_cost:
		frappe.throw(_("Patient must accept cost before using Booked Lab."))
	if sr.booked:
		frappe.throw(_("This request has already been forwarded to the laboratory."))
	existing = frappe.db.get_value("Lab Test", {"service_request": sr.name, "docstatus": ["!=", 2]}, "name")
	if existing:
		frappe.throw(_("Lab Test {0} already exists for this request.").format(existing))

	# Create Lab Test (Booked Lab flow does not require prior invoicing)
	lab_test = frappe.new_doc("Lab Test")
	lab_test.template = sr.template_dn
	lab_test.service_request = sr.name
	lab_test.company = sr.company
	lab_test.patient = sr.patient
	lab_test.patient_name = sr.patient_name
	lab_test.patient_sex = sr.patient_gender
	lab_test.patient_age = sr.patient_age_data
	lab_test.inpatient_record = sr.inpatient_record
	lab_test.email = sr.patient_email
	lab_test.mobile = sr.patient_mobile
	lab_test.practitioner = sr.practitioner
	lab_test.requesting_department = sr.medical_department
	lab_test.date = sr.occurrence_date
	lab_test.time = sr.occurrence_time
	lab_test.invoiced = sr.get("invoiced") or 0
	# Propagate Cost Center from Service Request when set (Lab Test has Cost Center field)
	if getattr(sr, "cost_center", None):
		lab_test.cost_center = sr.cost_center
	lab_test.lab_test_name = frappe.db.get_value("Lab Test Template", sr.template_dn, "lab_test_name") or sr.template_dn
	lab_test.status = "Requested"
	lab_test.insert(ignore_permissions=True)

	# Mark Service Request as forwarded to lab
	sr.db_set("booked", 1)

	# Reflect approved amount on Patient Visit (order_group = encounter)
	if sr.order_group and frappe.db.exists("Patient Visit", sr.order_group):
		visit = frappe.get_doc("Patient Visit", sr.order_group)
		visit.append(
			"lab_tests_charges",
			{
				"test_code": lab_test.name,
				"test_name": lab_test.lab_test_name or sr.template_dn,
				"amount": sr.amount or 0,
				"net_amount": sr.amount or 0,
			},
		)
		visit.save(ignore_permissions=True)

	frappe.db.commit()
	return {"lab_test": lab_test.name, "patient_visit": sr.order_group}


@frappe.whitelist()
def make_therapy_session(service_request):
	if isinstance(service_request, string_types):
		service_request = json.loads(service_request)
		service_request = frappe._dict(service_request)

	if (
		frappe.db.get_single_value("Healthcare Settings", "process_service_request_only_if_paid")
		and service_request.billing_status != "Invoiced"
	):
		frappe.throw(
			_("Service Request need to be invoiced before proceeding"),
			title=_("Payment Required"),
		)

	doc = frappe.new_doc("Therapy Session")
	doc.therapy_type = service_request.template_dn
	doc.service_request = service_request.name
	doc.company = service_request.company
	doc.patient = service_request.patient
	doc.patient_name = service_request.patient_name
	doc.gender = service_request.patient_gender
	doc.patient_age = service_request.patient_age_data
	doc.practitioner = service_request.practitioner
	doc.department = service_request.medical_department
	doc.start_date = service_request.occurrence_date
	doc.start_time = service_request.occurrence_time
	doc.invoiced = service_request.invoiced

	return doc


@frappe.whitelist()
def make_observation(service_request):
	if isinstance(service_request, string_types):
		service_request = json.loads(service_request)
		service_request = frappe._dict(service_request)

	if (
		frappe.db.get_single_value("Healthcare Settings", "process_service_request_only_if_paid")
		and service_request.billing_status != "Invoiced"
	):
		frappe.throw(
			_("Service Request need to be invoiced before proceeding"),
			title=_("Payment Required"),
		)

	patient = frappe.get_doc("Patient", service_request.patient)
	template = frappe.get_doc("Observation Template", service_request.template_dn)

	sample_collection = ""
	name_ref_in_child = check_observation_sample_exist(service_request)

	if name_ref_in_child:
		return name_ref_in_child[0], name_ref_in_child[1], "New"
	else:
		exist_sample_collection = frappe.db.exists(
			"Sample Collection",
			{
				"reference_name": service_request.order_group,
				"docstatus": 0,
				"patient": service_request.patient,
			},
		)

	if template.has_component:
		if exist_sample_collection:
			sample_collection = frappe.get_doc("Sample Collection", exist_sample_collection)
		else:
			sample_collection = create_sample_collection(patient, service_request)

		# parent
		observation = create_observation(service_request)

		save_sample_collection = False
		(
			sample_reqd_component_obs,
			non_sample_reqd_component_obs,
		) = get_observation_template_details(service_request.template_dn)
		if len(non_sample_reqd_component_obs) > 0:
			for comp in non_sample_reqd_component_obs:
				add_observation(
					patient=service_request.patient,
					template=comp,
					doc="Patient Visit",
					docname=service_request.order_group,
					parent=observation.name,
				)

		if len(sample_reqd_component_obs) > 0:
			save_sample_collection = True
			obs_template = frappe.get_doc("Observation Template", service_request.template_dn)
			data = set_component_observation_data(service_request.template_dn)
			# append parent template
			sample_collection.append(
				"observation_sample_collection",
				{
					"observation_template": service_request.template_dn,
					"sample": obs_template.sample,
					"sample_type": obs_template.sample_type,
					"container_closure_color": frappe.db.get_value(
						"Observation Template",
						service_request.template_dn,
						"container_closure_color",
					),
					"component_observations": json.dumps(data),
					"uom": obs_template.uom,
					"status": "Open",
					"sample_qty": obs_template.sample_qty,
					"component_observation_parent": observation.name,
					"service_request": service_request.name,
				},
			)

		if save_sample_collection:
			sample_collection.save(ignore_permissions=True)

	else:
		if template.get("sample_collection_required"):
			if exist_sample_collection:
				sample_collection = frappe.get_doc("Sample Collection", exist_sample_collection)
				sample_collection.append(
					"observation_sample_collection",
					{
						"observation_template": service_request.template_dn,
						"sample": template.sample,
						"sample_type": template.sample_type,
						"container_closure_color": frappe.db.get_value(
							"Observation Template",
							service_request.template_dn,
							"container_closure_color",
						),
						"uom": template.uom,
						"status": "Open",
						"sample_qty": template.sample_qty,
						"service_request": service_request.name,
					},
				)
				sample_collection.save(ignore_permissions=True)
			else:
				sample_collection = create_sample_collection(patient, service_request, template)
				sample_collection.save(ignore_permissions=True)
		else:
			observation = create_observation(service_request)

	diagnostic_report = frappe.db.exists(
		"Diagnostic Report", {"docname": service_request.order_group}
	)
	if not diagnostic_report:
		insert_diagnostic_report(service_request, sample_collection.name if sample_collection else None)

	if sample_collection:
		if diagnostic_report and not frappe.db.get_value(
			"Diagnostic Report", diagnostic_report, "sample_collection"
		):
			frappe.db.set_value(
				"Diagnostic Report", diagnostic_report, "sample_collection", sample_collection.name
			)
		return sample_collection.name, "Sample Collection"
	elif observation:
		return observation.name, "Observation"


def create_sample_collection(patient, service_request, template=None):
	sample_collection = frappe.new_doc("Sample Collection")
	sample_collection.patient = patient.name
	sample_collection.patient_age = patient.get_age()
	sample_collection.patient_sex = patient.sex
	sample_collection.company = service_request.company
	sample_collection.reference_doc = service_request.source_doc
	sample_collection.reference_name = service_request.order_group
	if template:
		sample_collection.append(
			"observation_sample_collection",
			{
				"observation_template": service_request.template_dn,
				"sample": template.sample,
				"sample_type": template.sample_type,
				"container_closure_color": frappe.db.get_value(
					"Observation Template", service_request.template_dn, "container_closure_color"
				),
				"uom": template.uom,
				"sample_qty": template.sample_qty,
				"service_request": service_request.name,
			},
		)
		sample_collection.save(ignore_permissions=True)
	return sample_collection


def create_observation(service_request):
	doc = frappe.new_doc("Observation")
	doc.posting_datetime = now_datetime()
	doc.patient = service_request.patient
	doc.observation_template = service_request.template_dn
	doc.reference_doctype = "Patient Visit"
	doc.reference_docname = service_request.order_group
	doc.service_request = service_request.name
	doc.insert()
	return doc


def insert_diagnostic_report(doc, sample_collection=None):
	diagnostic_report = frappe.new_doc("Diagnostic Report")
	diagnostic_report.company = doc.company
	diagnostic_report.patient = doc.patient
	diagnostic_report.ref_doctype = doc.source_doc
	diagnostic_report.docname = doc.order_group
	diagnostic_report.practitioner = doc.practitioner
	diagnostic_report.sample_collection = sample_collection
	diagnostic_report.save(ignore_permissions=True)


def check_observation_sample_exist(service_request):
	name_ref_in_child = frappe.db.get_value(
		"Observation Sample Collection",
		{
			"service_request": service_request.name,
			"parenttype": "Sample Collection",
			"docstatus": ["!=", 2],
		},
		"parent",
	)
	if name_ref_in_child:
		return name_ref_in_child, "Sample Collection"
	else:
		exist_observation = frappe.db.exists(
			"Observation",
			{
				"service_request": service_request.name,
				"parent_observation": "",
				"docstatus": ["!=", 2],
			},
		)
		if exist_observation:
			return exist_observation, "Observation"


@frappe.whitelist()
def make_appointment(source_name, target_doc=None, ignore_permissions=False):
	def postprocess(source, target):
		set_missing_values(source, target)

	def set_missing_values(source, target):
		target.department = frappe.db.get_value(
			"Healthcare Practitioner", source.referred_to_practitioner, "department"
		)

	doclist = get_mapped_doc(
		"Service Request",
		source_name,
		{
			"Service Request": {
				"doctype": "Patient Appointment",
				"field_map": {
					"name": "service_request",
					"referred_to_practitioner": "practitioner",
					"template_dn": "appointment_type",
					"source_doc": "reference_doctype",
					"order_group": "reference_docname",
				},
				"field_no_map": ["naming_series", "status"],
			},
		},
		target_doc,
		postprocess,
		ignore_permissions=ignore_permissions,
	)

	return doclist
