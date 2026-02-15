# -*- coding: utf-8 -*-
# Copyright (c) 2018, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt


import json
import re

import frappe
from frappe import _
from frappe.desk.reportview import get_match_cond
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc
from frappe.utils import get_datetime, get_link_to_form, getdate, now_datetime, today

from healthcare.healthcare.doctype.nursing_task.nursing_task import NursingTask
from healthcare.healthcare.utils import validate_nursing_tasks


class InpatientAdmission(Document):
	def after_insert(self):
		frappe.db.set_value("Patient", self.patient, "inpatient_record", self.name)
		frappe.db.set_value("Patient", self.patient, "inpatient_status", self.status)

		if self.admission_encounter:  # Update encounter
			frappe.db.set_value(
				"Patient Visit",
				self.admission_encounter,
				{"inpatient_record": self.name, "inpatient_status": self.status},
			)

			filters = {"order_group": self.admission_encounter, "docstatus": 1}
			medication_requests = frappe.get_all("Medication Request", filters, ["name"])
			service_requests = frappe.get_all("Service Request", filters, ["name"])

			for service_request in service_requests:
				frappe.db.set_value(
					"Service Request",
					service_request.name,
					{"inpatient_record": self.name, "inpatient_status": self.status},
				)

			for medication_request in medication_requests:
				frappe.db.set_value(
					"Medication Request",
					medication_request.name,
					{"inpatient_record": self.name, "inpatient_status": self.status},
				)

		if self.admission_nursing_checklist_template:
			NursingTask.create_nursing_tasks_from_template(
				template=self.admission_nursing_checklist_template,
				doc=self,
			)

	def validate(self):
		self.validate_dates()
		self.validate_already_scheduled_or_admitted()
		# Generate file number if this is the first encounter/inpatient record for the patient
		if self.patient and self.is_new():
			self.generate_file_number_for_patient()
		if self.status in ["Discharged", "Cancelled"]:
			frappe.db.set_value(
				"Patient", self.patient, {"inpatient_status": None, "inpatient_record": None}
			)
	
	def generate_file_number_for_patient(self):
		"""Generate sequential file number if this is the first encounter/inpatient record"""
		if not self.patient:
			return
		
		# Check if patient has any existing encounters or inpatient records
		# For new documents, self.name doesn't exist yet, so we just check for any existing records
		filters_encounter = {"patient": self.patient, "docstatus": ["!=", 2]}
		filters_inpatient = {"patient": self.patient, "docstatus": ["!=", 2]}
		
		# If this is not a new document, exclude it from the check
		if not self.is_new() and self.name:
			filters_encounter["name"] = ["!=", self.name]
			filters_inpatient["name"] = ["!=", self.name]
		
		existing_encounters = frappe.db.exists("Patient Visit", filters_encounter)
		existing_inpatient = frappe.db.exists("Inpatient Admission", filters_inpatient)
		
		# If no existing encounters or inpatient records, this is the first time
		if not existing_encounters and not existing_inpatient:
			# Get patient document
			patient_doc = frappe.get_doc("Patient", self.patient)
			
			# Only generate file number if patient doesn't have one
			if not patient_doc.get("file_no"):
				# Get the next sequential file number
				file_number = self.get_next_file_number()
				
				# Update patient's file_no field
				frappe.db.set_value("Patient", self.patient, "file_no", file_number)
	
	def get_next_file_number(self):
		"""Get the next sequential file number by checking the last number used"""
		# Get all patients with file_no values
		all_file_nos = frappe.db.get_all(
			"Patient",
			filters={"file_no": ["is", "set"]},
			fields=["file_no"],
			pluck="file_no"
		)
		
		if not all_file_nos:
			# No file numbers exist, start from 1
			return "1"
		
		# Extract numeric values from file_no
		max_number = 0
		for file_no in all_file_nos:
			if file_no:
				# Extract all numeric parts from the file_no
				numbers = re.findall(r'\d+', str(file_no))
				if numbers:
					# Get the last number found (in case there are multiple)
					# or the largest number if multiple numbers exist
					for num_str in numbers:
						try:
							num = int(num_str)
							if num > max_number:
								max_number = num
						except ValueError:
							continue
		
		# Increment by 1
		next_number = max_number + 1
		return str(next_number)

	def validate_dates(self):
		if (getdate(self.expected_discharge) < getdate(self.scheduled_date)) or (
			getdate(self.discharge_ordered_date) < getdate(self.scheduled_date)
		):
			frappe.throw(_("Expected and Discharge dates cannot be less than Admission Schedule date"))

		for entry in self.inpatient_occupancies:
			if (
				entry.check_in
				and entry.check_out
				and get_datetime(entry.check_in) > get_datetime(entry.check_out)
			):
				frappe.throw(
					_("Row #{0}: Check Out datetime cannot be less than Check In datetime").format(entry.idx)
				)

	def validate_already_scheduled_or_admitted(self):
		query = """
			select name, status
			from `tabInpatient Admission`
			where (status = 'Admitted' or status = 'Admission Scheduled')
			and name != %(name)s and patient = %(patient)s
			"""

		ip_record = frappe.db.sql(query, {"name": self.name, "patient": self.patient}, as_dict=1)

		if ip_record:
			msg = _(
				("Already {0} Patient {1} with Inpatient Admission ").format(ip_record[0].status, self.patient)
				+ """ <b><a href="/app/Form/Inpatient Admission/{0}">{0}</a></b>""".format(ip_record[0].name)
			)
			frappe.throw(msg)

	@frappe.whitelist()
	def admit(self, service_unit, check_in, expected_discharge=None):
		admit_patient(self, service_unit, check_in, expected_discharge)

	@frappe.whitelist()
	def discharge(self):
		discharge_patient(self)

	@frappe.whitelist()
	def transfer(self, service_unit, check_in, leave_from):
		if leave_from:
			patient_leave_service_unit(self, check_in, leave_from)
		if service_unit:
			transfer_patient(self, service_unit, check_in)


@frappe.whitelist()
def schedule_inpatient(args):
	# Handle both JSON string and dict (Frappe API handler may parse JSON automatically)
	if isinstance(args, str):
		admission_order = json.loads(args)  # admission order via Encounter
	else:
		admission_order = args  # Already a dict
	# Validate required fields
	if not admission_order or not admission_order.get("patient"):
		frappe.throw(_("Patient is required"))
	
	# If no admission_encounter, then medical_department and primary_practitioner are required
	if not admission_order.get("admission_encounter"):
		if not admission_order.get("medical_department"):
			frappe.throw(_("Medical Department is required when creating admission without a Patient Visit"))
		if not admission_order.get("primary_practitioner"):
			frappe.throw(_("Primary Practitioner is required when creating admission without a Patient Visit"))

	inpatient_record = frappe.new_doc("Inpatient Admission")

	# Admission order details
	set_details_from_ip_order(inpatient_record, admission_order)

	# Set admission doctor from primary practitioner
	if admission_order.get("primary_practitioner"):
		inpatient_record.admission_by_doctor = admission_order["primary_practitioner"]
		# Fetch practitioner name
		practitioner_name = frappe.db.get_value(
			"Healthcare Practitioner",
			admission_order["primary_practitioner"],
			"practitioner_name"
		)
		if practitioner_name:
			inpatient_record.admission_doctor_name = practitioner_name

	# Patient details
	patient = frappe.get_doc("Patient", admission_order["patient"])
	inpatient_record.patient = patient.name
	inpatient_record.patient_name = patient.patient_name
	inpatient_record.gender = patient.sex
	inpatient_record.blood_group = patient.blood_group
	inpatient_record.dob = patient.dob
	inpatient_record.mobile = patient.mobile
	inpatient_record.email = patient.email
	inpatient_record.phone = patient.phone
	inpatient_record.scheduled_date = today()

	# Set encounter details (only if admission_encounter is provided)
	encounter = None
	if admission_order.get("admission_encounter"):
		try:
			encounter = frappe.get_doc("Patient Visit", admission_order["admission_encounter"])
			inpatient_record.admission_encounter = encounter.name
		except frappe.DoesNotExistError:
			# Patient Visit not found, continue without it
			encounter = None
	
	if encounter:
		if encounter.symptoms:  # Symptoms
			set_ip_child_records(inpatient_record, "chief_complaint", encounter.symptoms)

		if encounter.diagnosis:  # Diagnosis
			set_ip_child_records(inpatient_record, "diagnosis", encounter.diagnosis)

		if encounter.drug_prescription:  # Medication
			set_ip_child_records(inpatient_record, "drug_prescription", encounter.drug_prescription)

		if encounter.lab_test_prescription:  # Lab Tests
			set_ip_child_records(inpatient_record, "lab_test_prescription", encounter.lab_test_prescription)

		if encounter.procedure_prescription:  # Procedure Prescription
			set_ip_child_records(
				inpatient_record, "procedure_prescription", encounter.procedure_prescription
			)

		if encounter.therapies:  # Therapies
			inpatient_record.therapy_plan = encounter.therapy_plan
			set_ip_child_records(inpatient_record, "therapies", encounter.therapies)

	inpatient_record.status = "Admission Scheduled"
	inpatient_record.save(ignore_permissions=True)

	# Return created admission name for API consumers (frontend expects a name)
	return {"name": inpatient_record.name}


@frappe.whitelist()
def schedule_discharge(args):
	# Handle both dict and JSON string
	if isinstance(args, str):
		discharge_order = json.loads(args)
	elif isinstance(args, dict) and "args" in args:
		# Handle case where args is wrapped in another dict
		discharge_order = args["args"]
	else:
		discharge_order = args
	
	# Get inpatient_record_id from the discharge_order if provided, otherwise from patient
	if "inpatient_record" in discharge_order:
		inpatient_record_id = discharge_order["inpatient_record"]
	else:
		inpatient_record_id = frappe.db.get_value(
			"Patient", discharge_order["patient"], "inpatient_record"
		)

	if inpatient_record_id:
		inpatient_record = frappe.get_doc("Inpatient Admission", inpatient_record_id)
		
		# Don't check out yet - that happens on actual discharge
		# check_out_inpatient(inpatient_record)  # Commented out - only check out on actual discharge
		
		set_details_from_ip_order(inpatient_record, discharge_order)
		inpatient_record.status = "Discharge Scheduled"
		inpatient_record.save(ignore_permissions=True)

		frappe.db.set_value(
			"Patient", discharge_order["patient"], "inpatient_status", inpatient_record.status
		)
		if inpatient_record.discharge_encounter:
			frappe.db.set_value(
				"Patient Visit",
				inpatient_record.discharge_encounter,
				"inpatient_status",
				inpatient_record.status,
			)

		if inpatient_record.discharge_nursing_checklist_template:
			NursingTask.create_nursing_tasks_from_template(
				inpatient_record.discharge_nursing_checklist_template,
				inpatient_record,
				start_time=now_datetime(),
			)
		
		return inpatient_record


def set_details_from_ip_order(inpatient_record, ip_order):
	for key in ip_order:
		# Skip empty strings for optional fields like admission_encounter
		if key == "admission_encounter" and not ip_order[key]:
			continue
		inpatient_record.set(key, ip_order[key])


def set_ip_child_records(inpatient_record, inpatient_record_child, encounter_child):
	for item in encounter_child:
		table = inpatient_record.append(inpatient_record_child)
		for df in table.meta.get("fields"):
			table.set(df.fieldname, item.get(df.fieldname))


def check_out_inpatient(inpatient_record):
	if inpatient_record.inpatient_occupancies:
		for inpatient_occupancy in inpatient_record.inpatient_occupancies:
			if inpatient_occupancy.left != 1:
				inpatient_occupancy.left = True
				inpatient_occupancy.check_out = now_datetime()
				frappe.db.set_value(
					"Healthcare Service Unit", inpatient_occupancy.service_unit, "occupancy_status", "Vacant"
				)


def discharge_patient(inpatient_record):
	validate_nursing_tasks(inpatient_record)

	validate_inpatient_invoicing(inpatient_record)

	validate_incompleted_service_requests(inpatient_record)

	inpatient_record.discharge_datetime = now_datetime()
	inpatient_record.status = "Discharged"

	inpatient_record.save(ignore_permissions=True)


def validate_inpatient_invoicing(inpatient_record):
	if frappe.db.get_single_value("Healthcare Settings", "allow_discharge_despite_unbilled_services"):
		return

	pending_invoices = get_pending_invoices(inpatient_record)

	if pending_invoices:
		message = _("Cannot mark Inpatient Admission as Discharged since there are unbilled services. ")

		formatted_doc_rows = ""

		for doctype, docnames in pending_invoices.items():
			formatted_doc_rows += """
				<td>{0}</td>
				<td>{1}</td>
			</tr>""".format(
				doctype, docnames
			)

		message += """
			<table class='table'>
				<thead>
					<th>{0}</th>
					<th>{1}</th>
				</thead>
				{2}
			</table>
		""".format(
			_("Healthcare Service"), _("Documents"), formatted_doc_rows
		)

		frappe.throw(message, title=_("Unbilled Services"), is_minimizable=True, wide=True)


def get_pending_invoices(inpatient_record):
	pending_invoices = {}
	if inpatient_record.inpatient_occupancies:
		service_unit_names = False
		for inpatient_occupancy in inpatient_record.inpatient_occupancies:
			if not inpatient_occupancy.invoiced:
				if is_service_unit_billable(inpatient_occupancy.service_unit):
					if service_unit_names:
						service_unit_names += ", " + inpatient_occupancy.service_unit
					else:
						service_unit_names = inpatient_occupancy.service_unit
		if service_unit_names:
			pending_invoices["Inpatient Occupancy"] = service_unit_names

	docs = ["Patient Appointment", "Patient Visit", "Lab Test", "Clinical Procedure"]

	for doc in docs:
		doc_name_list = get_unbilled_inpatient_docs(doc, inpatient_record)
		if doc_name_list:
			pending_invoices = get_pending_doc(doc, doc_name_list, pending_invoices)

	return pending_invoices


def get_pending_doc(doc, doc_name_list, pending_invoices):
	if doc_name_list:
		doc_ids = False
		for doc_name in doc_name_list:
			doc_link = get_link_to_form(doc, doc_name.name)
			if doc_ids:
				doc_ids += ", " + doc_link
			else:
				doc_ids = doc_link
		if doc_ids:
			pending_invoices[doc] = doc_ids

	return pending_invoices


def get_unbilled_inpatient_docs(doc, inpatient_record):
	filters = {
		"patient": inpatient_record.patient,
		"inpatient_record": inpatient_record.name,
		"docstatus": 1,
	}
	if doc in ["Service Request", "Medication Request"]:
		filters.update(
			{
				"billing_status": "Pending",
			}
		)
	else:
		if doc == "Patient Visit":
			filters.update(
				{
					"appointment": "",
				}
			)
		else:
			del filters["docstatus"]
		filters.update(
			{
				"invoiced": 0,
			}
		)
	if doc in ["Lab Test", "Clinical Procedure"]:
		filters.update(
			{
				"service_request": "",
			}
		)

	return frappe.db.get_list(
		doc,
		filters={
			"patient": inpatient_record.patient,
			"inpatient_record": inpatient_record.name,
			"docstatus": 1,
			"invoiced": 0,
		},
	)


def admit_patient(inpatient_record, service_unit, check_in, expected_discharge=None):
	validate_nursing_tasks(inpatient_record)

	inpatient_record.admitted_datetime = check_in
	inpatient_record.status = "Admitted"
	inpatient_record.expected_discharge = expected_discharge
	# Set cost center from the service unit (hospital) so future charges use it
	service_unit_cost_center = frappe.db.get_value("Healthcare Service Unit", service_unit, "cost_center")
	if service_unit_cost_center:
		inpatient_record.cost_center = service_unit_cost_center

	inpatient_record.set("inpatient_occupancies", [])
	transfer_patient(inpatient_record, service_unit, check_in)

	frappe.db.set_value(
		"Patient",
		inpatient_record.patient,
		{"inpatient_status": "Admitted", "inpatient_record": inpatient_record.name},
	)


def transfer_patient(inpatient_record, service_unit, check_in):
	item_line = inpatient_record.append("inpatient_occupancies", {})
	item_line.service_unit = service_unit
	item_line.check_in = check_in

	inpatient_record.save(ignore_permissions=True)

	frappe.db.set_value("Healthcare Service Unit", service_unit, "occupancy_status", "Occupied")


def patient_leave_service_unit(inpatient_record, check_out, leave_from):
	if inpatient_record.inpatient_occupancies:
		for inpatient_occupancy in inpatient_record.inpatient_occupancies:
			if inpatient_occupancy.left != 1 and inpatient_occupancy.service_unit == leave_from:
				inpatient_occupancy.left = True
				inpatient_occupancy.check_out = check_out
				frappe.db.set_value(
					"Healthcare Service Unit", inpatient_occupancy.service_unit, "occupancy_status", "Vacant"
				)
	inpatient_record.save(ignore_permissions=True)


def _get_current_occupancy_service_unit(inpatient_record):
	"""Return the first non-left service unit (current bed), if any."""
	if not inpatient_record.inpatient_occupancies:
		return None
	for occ in inpatient_record.inpatient_occupancies:
		if occ.left != 1 and occ.service_unit:
			return occ.service_unit
	return None


@frappe.whitelist()
def transfer_to_another_cost_center(
	inpatient_admission,
	to_cost_center,
	to_service_unit=None,
	reason=None,
	transfer_datetime=None,
):
	"""
	Transfer an inpatient admission from current cost center (hospital) to another.
	Creates a Transfer Admission Event for audit trail, checks out from current bed,
	updates admission cost_center, and optionally checks in to a bed in the new cost center.
	"""
	inpatient_record = frappe.get_doc("Inpatient Admission", inpatient_admission)
	if inpatient_record.status != "Admitted":
		frappe.throw(
			_("Only Admitted patients can be transferred to another cost center. Current status: {0}").format(
				inpatient_record.status
			)
		)

	company = inpatient_record.company
	# Resolve current cost center from admission or from current bed
	from_cost_center = inpatient_record.cost_center
	from_service_unit = _get_current_occupancy_service_unit(inpatient_record)
	if not from_cost_center and from_service_unit:
		from_cost_center = frappe.db.get_value("Healthcare Service Unit", from_service_unit, "cost_center")
	if not from_cost_center:
		frappe.throw(_("Current cost center could not be determined for this admission."))

	to_cost_center = to_cost_center.strip()
	if to_cost_center == from_cost_center:
		frappe.throw(_("Target cost center must be different from current cost center."))

	# Validate to_cost_center belongs to same company
	cc_company = frappe.db.get_value("Cost Center", to_cost_center, "company")
	if cc_company and cc_company != company:
		frappe.throw(
			_("Cost Center {0} belongs to company {1}. Admission is under {2}.").format(
				to_cost_center, cc_company, company
			)
		)

	# If target bed provided, validate it is in the target cost center and vacant
	if to_service_unit:
		su_cost_center = frappe.db.get_value("Healthcare Service Unit", to_service_unit, "cost_center")
		if su_cost_center != to_cost_center:
			frappe.throw(
				_("Service Unit {0} is not in cost center {1}.").format(to_service_unit, to_cost_center)
			)
		occupancy_status = frappe.db.get_value("Healthcare Service Unit", to_service_unit, "occupancy_status")
		if occupancy_status == "Occupied":
			frappe.throw(_("Service Unit {0} is already occupied.").format(to_service_unit))
		inpatient_occupancy = frappe.db.get_value(
			"Healthcare Service Unit", to_service_unit, "inpatient_occupancy"
		)
		if not inpatient_occupancy:
			frappe.throw(_("Service Unit {0} is not an inpatient unit.").format(to_service_unit))

	transfer_dt = get_datetime(transfer_datetime) if transfer_datetime else now_datetime()

	# 1) Check out from current bed(s) – leave all current occupancies
	if inpatient_record.inpatient_occupancies:
		for occ in inpatient_record.inpatient_occupancies:
			if occ.left != 1 and occ.service_unit:
				occ.left = True
				occ.check_out = transfer_dt
				frappe.db.set_value(
					"Healthcare Service Unit", occ.service_unit, "occupancy_status", "Vacant"
				)

	# 2) Update admission cost center
	inpatient_record.cost_center = to_cost_center
	inpatient_record.save(ignore_permissions=True)

	# 3) If target service unit provided, check in there
	if to_service_unit:
		transfer_patient(inpatient_record, to_service_unit, transfer_dt)

	# 4) Create audit trail
	event = frappe.get_doc(
		{
			"doctype": "Transfer Admission Event",
			"inpatient_admission": inpatient_admission,
			"patient": inpatient_record.patient,
			"patient_name": inpatient_record.patient_name,
			"transfer_datetime": transfer_dt,
			"from_cost_center": from_cost_center,
			"to_cost_center": to_cost_center,
			"from_service_unit": from_service_unit or None,
			"to_service_unit": to_service_unit or None,
			"transferred_by": frappe.session.user,
			"reason": reason or None,
			"company": company,
		}
	)
	event.insert(ignore_permissions=True)

	frappe.db.commit()
	return {
		"transfer_admission_event": event.name,
		"inpatient_admission": inpatient_admission,
		"cost_center": to_cost_center,
		"to_service_unit": to_service_unit,
	}


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def get_leave_from(doctype, txt, searchfield, start, page_len, filters):
	docname = filters["docname"]

	query = """select io.service_unit
		from `tabInpatient Occupancy` io, `tabInpatient Admission` ir
		where io.parent = '{docname}' and io.parentfield = 'inpatient_occupancies'
		and io.left!=1 and io.parent = ir.name"""

	return frappe.db.sql(
		query.format(
			**{"docname": docname, "searchfield": searchfield, "mcond": get_match_cond(doctype)}
		),
		{"txt": "%%%s%%" % txt, "_txt": txt.replace("%", ""), "start": start, "page_len": page_len},
	)


def is_service_unit_billable(service_unit):
	service_unit_doc = frappe.qb.DocType("Healthcare Service Unit")
	service_unit_type = frappe.qb.DocType("Healthcare Service Unit Type")
	result = (
		frappe.qb.from_(service_unit_doc)
		.left_join(service_unit_type)
		.on(service_unit_doc.service_unit_type == service_unit_type.name)
		.select(service_unit_type.is_billable)
		.where(service_unit_doc.name == service_unit)
	).run(as_dict=1)
	return result[0].get("is_billable", 0)


@frappe.whitelist()
def set_ip_order_cancelled(inpatient_record, reason, encounter=None):
	inpatient_record = frappe.get_doc("Inpatient Admission", inpatient_record)
	if inpatient_record.status == "Admission Scheduled":
		inpatient_record.status = "Cancelled"
		inpatient_record.reason_for_cancellation = reason
		inpatient_record.save(ignore_permissions=True)
		encounter_name = encounter if encounter else inpatient_record.admission_encounter
		if encounter_name:
			frappe.db.set_value(
				"Patient Visit", encounter_name, {"inpatient_status": None, "inpatient_record": None}
			)


@frappe.whitelist()
def check_and_generate_file_number(patient):
	"""
	Check if this is the first encounter or inpatient record for the patient.
	If yes, generate file number (patient name) and update patient's file_no field.
	Returns the file_number (patient name).
	"""
	if not patient:
		return {"file_number": None}
	
	# Check if patient has any existing encounters or inpatient records
	existing_encounters = frappe.db.exists("Patient Visit", {"patient": patient, "docstatus": ["!=", 2]})
	existing_inpatient = frappe.db.exists("Inpatient Admission", {"patient": patient, "docstatus": ["!=", 2]})
	
	# If no existing encounters or inpatient records, this is the first time
	if not existing_encounters and not existing_inpatient:
		# Get patient document
		patient_doc = frappe.get_doc("Patient", patient)
		
		# File number is the patient's name (which is auto-generated)
		file_number = patient_doc.name
		
		# Update patient's file_no field if it's empty
		if not patient_doc.get("file_no"):
			frappe.db.set_value("Patient", patient, "file_no", file_number)
		
		return {"file_number": file_number}
	else:
		# Patient already has encounters or inpatient records, return existing file number
		patient_doc = frappe.get_doc("Patient", patient)
		return {"file_number": patient_doc.name}


def validate_incompleted_service_requests(inpatient_record):
	filters = {
		"patient": inpatient_record.patient,
		"inpatient_record": inpatient_record.name,
		"docstatus": 1,
		"status": ["not in", ["completed-Request Status"]],
	}

	service_requests = frappe.db.get_list("Service Request", filters=filters, pluck="name")
	if service_requests and len(service_requests) > 0:
		service_requests = [
			get_link_to_form("Service Request", service_request) for service_request in service_requests
		]
		message = _("There are Orders yet to be carried out<br> {0}")

		frappe.throw(message.format(", ".join(service_requests)))


@frappe.whitelist()
def create_discharge_from_inpatient_admission(source_name, target_doc=None):
	"""Create Discharge document from Inpatient Admission"""
	def set_missing_values(source, target):
		target.admission = source.name
		target.discharge_date = now_datetime()
		# Copy discharge-related fields from Inpatient Admission if available
		if source.discharge_instructions:
			target.discharge_instructions = source.discharge_instructions
		if source.discharge_note:
			target.discharge_diagnosis = source.discharge_note
		if source.followup_date:
			target.next_appointment_date = source.followup_date
		if source.discharge_practitioner:
			target.discharged_by_user = source.discharge_practitioner
		# Copy history form details template and attributes
		if source.history_form_details_template:
			target.history_form_details_template = source.history_form_details_template
		if source.history_attributes:
			for attr in source.history_attributes:
				target_row = target.append("history_details")
				target_row.attribute = attr.attribute
				target_row.description_on_admission = attr.description_on_admission or ""
				target_row.description_on_discharge = ""

	doc = get_mapped_doc(
		"Inpatient Admission",
		source_name,
		{
			"Inpatient Admission": {
				"doctype": "Discharge",
				"field_map": {
					"patient": "file_no",
					"patient_name": "patient_name",
				},
			}
		},
		target_doc,
		set_missing_values,
	)

	return doc
