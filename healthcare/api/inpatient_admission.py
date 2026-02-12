# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import json
import re
import frappe
from frappe import _

try:
	from erpnext import get_default_currency
except ImportError:
	# Fallback if erpnext is not available
	def get_default_currency():
		return frappe.db.get_single_value('Global Defaults', 'default_currency') or 'BHD'


@frappe.whitelist()
def get_patient_active_admission(patient):
	"""Get patient's active admission (Admitted or Discharge Scheduled status)"""
	if not patient:
		frappe.throw(_("Patient is required"))
	
	# Get active admission (Admitted or Discharge Scheduled)
	admission = frappe.db.get_value(
		'Inpatient Admission',
		{
			'patient': patient,
			'status': ['in', ['Admitted', 'Discharge Scheduled']]
		},
		'name',
		order_by='scheduled_date desc'
	)
	
	if not admission:
		return None
	
	# Get full admission details
	record = frappe.get_doc('Inpatient Admission', admission)
	return {
		'name': record.name,
		'patient': record.patient,
		'patient_name': record.patient_name,
		'status': record.status
	}


@frappe.whitelist()
def get_inpatient_records(status=None, search=None, patient=None):
	"""Get list of Inpatient Admissions with optional status, search, and patient filter"""
	filters = {}
	if status:
		filters['status'] = status
	if patient:
		filters['patient'] = patient

	if search:
		# Search by admission number, patient name, or file number
		records = frappe.db.sql("""
			SELECT 
				ia.name,
				ia.patient,
				ia.patient_name,
				ia.status,
				ia.scheduled_date,
				ia.admitted_datetime,
				ia.expected_discharge,
				ia.admission_service_unit_type,
				ia.medical_department,
				ia.primary_practitioner,
				ia.secondary_practitioner,
				ia.admission_encounter,
				ia.expected_length_of_stay
			FROM `tabInpatient Admission` ia
			LEFT JOIN `tabPatient` p ON ia.patient = p.name
			WHERE 
				(%(patient)s IS NULL OR ia.patient = %(patient)s)
				AND (
					ia.name LIKE %(search)s
					OR ia.patient_name LIKE %(search)s
					OR ia.patient LIKE %(search)s
					OR p.file_no LIKE %(search)s
				)
		""", {
			'search': f'%{search}%',
			'patient': patient
		}, as_dict=True)
		
		# Apply status filter if provided
		if status:
			records = [r for r in records if r.status == status]
		
		# Sort by scheduled_date desc
		records.sort(key=lambda x: x.scheduled_date or '', reverse=True)
	else:
		records = frappe.get_all(
			'Inpatient Admission',
			filters=filters,
			fields=[
				'name',
				'patient',
				'patient_name',
				'status',
				'scheduled_date',
				'admitted_datetime',
				'expected_discharge',
				'admission_service_unit_type',
				'medical_department',
				'primary_practitioner',
				'secondary_practitioner',
				'admission_encounter',
				'expected_length_of_stay'
			],
			order_by='scheduled_date desc'
		)

	return records


@frappe.whitelist()
def get_inpatient_record(name):
	"""Get single Inpatient Admission by name"""
	if not name:
		frappe.throw(_("Inpatient Admission name is required"))

	record = frappe.get_doc('Inpatient Admission', name)
	
	# Get current occupancy (bed) information
	current_occupancy = None
	if record.inpatient_occupancies:
		for occupancy in record.inpatient_occupancies:
			if not occupancy.left:  # Current active occupancy
				service_unit_name = None
				if occupancy.service_unit:
					service_unit_name = frappe.db.get_value('Healthcare Service Unit', occupancy.service_unit, 'healthcare_service_unit_name')
				
				current_occupancy = {
					'service_unit': occupancy.service_unit,
					'service_unit_name': service_unit_name,
					'check_in': occupancy.check_in,
					'check_out': occupancy.check_out,
					'invoiced': occupancy.invoiced
				}
				break
	
	# Get charges information
	charges_info = {
		'admission_cost': record.admission_cost,
		'case_management_fee': record.case_management_fee,
		'room_charges': record.room_charges
	}
	
	return {
		'name': record.name,
		'patient': record.patient,
		'patient_name': record.patient_name,
		'status': record.status,
		'scheduled_date': record.scheduled_date,
		'admitted_datetime': record.admitted_datetime,
		'expected_discharge': record.expected_discharge,
		'admission_service_unit_type': record.admission_service_unit_type,
		'medical_department': record.medical_department,
		'primary_practitioner': record.primary_practitioner,
		'secondary_practitioner': record.secondary_practitioner,
		'admission_encounter': record.admission_encounter,
		'expected_length_of_stay': record.expected_length_of_stay,
		'current_occupancy': current_occupancy,
		'charges': charges_info
	}


@frappe.whitelist()
def get_package_details(admission_no):
	"""Get Package Details for an Inpatient Admission"""
	if not admission_no:
		frappe.throw(_("Admission No is required"))

	# Get company from Inpatient Admission
	inpatient_record = frappe.get_doc('Inpatient Admission', admission_no)
	company = inpatient_record.company if hasattr(inpatient_record, 'company') and inpatient_record.company else frappe.defaults.get_user_default("Company")
	
	# Get company default currency
	default_currency = frappe.db.get_value('Company', company, 'default_currency') if company else None
	if not default_currency:
		from erpnext import get_default_currency
		default_currency = get_default_currency() or 'SAR'

	packages = frappe.get_all(
		'Package Detail',
		filters={'admission_no': admission_no},
		fields=[
			'name',
			'admission_no',
			'from_date',
			'to_date',
			'total_days',
			'transaction_amount',
			'currency',
			'vch_status',
			'remarks'
		]
	)

	# Return packages with default currency info
	return {
		'packages': packages,
		'default_currency': default_currency
	}


@frappe.whitelist()
def get_service_units(service_unit_type=None, occupancy_status=None, search=None, room_category=None):
	"""Get Healthcare Service Units with optional filters and search.

	Used by the React Admit Patient modal to pick a room/bed.
	We always restrict this to inpatient units that are currently vacant.
	"""
	# Always restrict to inpatient occupancy units
	filters = {"inpatient_occupancy": 1}
	if service_unit_type:
		filters['service_unit_type'] = service_unit_type
	if occupancy_status:
		filters['occupancy_status'] = occupancy_status
	if room_category:
		filters['room_category'] = room_category
	# If search is provided, search by name
	if search:
		query = """
			SELECT 
				name,
				healthcare_service_unit_name,
				service_unit_type,
				occupancy_status,
				company,
				room_category
			FROM `tabHealthcare Service Unit`
			WHERE 
				inpatient_occupancy = 1
				AND (healthcare_service_unit_name LIKE %(search)s
				OR name LIKE %(search)s)
		"""
		params = {'search': f'%{search}%'}
		
		# Add filters
		if service_unit_type:
			query += " AND service_unit_type = %(service_unit_type)s"
			params['service_unit_type'] = service_unit_type
		if occupancy_status:
			query += " AND occupancy_status = %(occupancy_status)s"
			params['occupancy_status'] = occupancy_status
		if room_category:
			query += " AND room_category = %(room_category)s"
			params['room_category'] = room_category
		
		units = frappe.db.sql(query, params, as_dict=True)
		
		# Limit results
		units = units[:50]
	else:
		units = frappe.get_all(
			'Healthcare Service Unit',
			filters=filters,
			fields=[
				'name',
				'healthcare_service_unit_name',
				'service_unit_type',
				'occupancy_status',
				'company',
				'room_category'
			],
			limit=50
		)

	return units


@frappe.whitelist()
def create_and_submit_discharge(admission_name, discharge_data):
	"""Create and submit a Discharge document from Inpatient Admission"""
	try:
		# Check if discharge already exists
		existing_discharge = frappe.db.get_value('Discharge', {'admission': admission_name}, 'name')
		if existing_discharge:
			frappe.throw(_("Discharge already exists for this admission: {0}").format(
				frappe.get_desk_link("Discharge", existing_discharge)
			))
		
		# Create discharge document using the mapped doc function
		from healthcare.healthcare.doctype.inpatient_admission.inpatient_admission import create_discharge_from_inpatient_admission
		
		discharge_doc = create_discharge_from_inpatient_admission(admission_name)
		
		# Update discharge document with provided data
		if isinstance(discharge_data, str):
			discharge_data = json.loads(discharge_data)
		
		# Update fields from discharge_data
		for key, value in discharge_data.items():
			if hasattr(discharge_doc, key) and value is not None and value != '':
				discharge_doc.set(key, value)
		
		# Save the discharge document
		discharge_doc.save(ignore_permissions=True)
		
		# Submit the discharge document (this will update the admission status)
		discharge_doc.submit()
		
		return {
			'name': discharge_doc.name,
			'message': 'Discharge created and submitted successfully'
		}
	except frappe.ValidationError as e:
		# Handle specific validation errors with user-friendly messages
		error_message = str(e)
		
		# Check if it's an unbilled services error
		if "unbilled services" in error_message.lower():
			# Extract unbilled services from the error message
			# Try to extract service names from the error message
			services = []
			# Look for service unit names or document names in the error
			service_pattern = r'Inpatient Occupancy\s+([^\s\n]+)'
			matches = re.findall(service_pattern, error_message)
			if matches:
				services.extend(matches)
			
			# Look for Healthcare Service Documents
			if "Healthcare Service" in error_message and "Documents" in error_message:
				services.append("Healthcare Service Documents")
			
			if services:
				services_list = ", ".join(services)
				user_message = _(
					"Cannot discharge patient because there are unbilled services that need to be invoiced first. "
					"Please ensure all services are billed before discharging the patient. "
					"Unbilled services include: {0}. "
					"Please create invoices for these services and try again."
				).format(services_list)
			else:
				user_message = _(
					"Cannot discharge patient because there are unbilled services that need to be invoiced first. "
					"Please ensure all services (including Inpatient Occupancy and Healthcare Services) are billed before discharging the patient. "
					"Please create invoices for all unbilled services and try again."
				)
			
			frappe.log_error(f"Error creating discharge: {error_message}", "Create Discharge Error")
			frappe.throw(user_message, title=_("Unbilled Services"))
		else:
			# For other validation errors, use the original message but clean it up
			frappe.log_error(f"Error creating discharge: {error_message}", "Create Discharge Error")
			# Remove HTML tags and clean up the message
			clean_message = re.sub(r'<[^>]+>', '', error_message)
			clean_message = re.sub(r'\s+', ' ', clean_message).strip()
			frappe.throw(_("Cannot complete discharge: {0}").format(clean_message))
	except Exception as e:
		frappe.log_error(f"Error creating discharge: {str(e)}", "Create Discharge Error")
		frappe.throw(_("Failed to create discharge: {0}").format(str(e)))


@frappe.whitelist()
def admit_patient(name, service_unit, check_in, expected_discharge=None):
	"""Admit a patient - wrapper for the DocType method"""
	if not name:
		frappe.throw(_("Inpatient Admission name is required"))
	if not service_unit:
		frappe.throw(_("Service Unit is required"))
	if not check_in:
		frappe.throw(_("Check In datetime is required"))

	record = frappe.get_doc('Inpatient Admission', name)
	record.admit(service_unit, check_in, expected_discharge)
	frappe.db.commit()

	return {
		'success': True,
		'message': _('Patient admitted successfully'),
		'name': record.name
	}


# @frappe.whitelist()
# def create_admission_sales_order(admission_name, package_name, days, total_amount, service_unit=None):
# 	"""Create a Sales Order for admission with package"""
# 	from frappe.utils import getdate, flt
	
# 	if not admission_name:
# 		frappe.throw(_("Inpatient Admission name is required"))
# 	if not package_name:
# 		frappe.throw(_("Package name is required"))
# 	if not days or days <= 0:
# 		frappe.throw(_("Number of days must be greater than 0"))
# 	if not total_amount or total_amount <= 0:
# 		frappe.throw(_("Total amount must be greater than 0"))
# 	if not service_unit:
# 		frappe.throw(_("Service Unit (room) is required"))
	
# 	# Get admission record
# 	admission = frappe.get_doc('Inpatient Admission', admission_name)
# 	patient = admission.patient
# 	company = admission.company or frappe.defaults.get_user_default("Company")
	
# 	if not company:
# 		frappe.throw(_("Company is required. Please set company in admission or user defaults."))
	
# 	# Get patient customer
# 	customer = frappe.db.get_value('Patient', patient, 'customer')
# 	if not customer:
# 		frappe.throw(_("Patient {0} does not have a linked customer").format(patient))
	
# 	# Get package details
# 	package = frappe.get_doc('Inpatient Package', package_name)
	
# 	# Get service unit (room) name
# 	service_unit_name = frappe.db.get_value('Healthcare Service Unit', service_unit, 'healthcare_service_unit_name')
# 	if not service_unit_name:
# 		service_unit_name = service_unit
	
# 	# Get or create item for the service unit (room)
# 	item_code = service_unit_name
	
# 	# Check if item exists
# 	item_exists = frappe.db.exists('Item', item_code)
	
# 	if not item_exists:
# 		# Create the item
# 		# Get default item group for healthcare
# 		item_group = frappe.db.get_value('Item Group', {'name': 'Services'}) or frappe.db.get_value('Item Group', {'name': 'All Item Groups'})
# 		if not item_group:
# 			# Try to get any item group
# 			item_group = frappe.db.get_value('Item Group', {}, 'name')
		
# 		# Get default UOM
# 		uom = frappe.db.exists("UOM", "Unit") or frappe.db.get_single_value("Stock Settings", "stock_uom") or "Unit"
		
# 		# Create item
# 		item = frappe.get_doc({
# 			"doctype": "Item",
# 			"item_code": item_code,
# 			"item_name": service_unit_name,
# 			"item_group": item_group or "All Item Groups",
# 			"description": f"Room: {service_unit_name}",
# 			"is_sales_item": 1,
# 			"is_service_item": 1,
# 			"is_purchase_item": 0,
# 			"is_stock_item": 0,
# 			"show_in_website": 0,
# 			"is_pro_applicable": 0,
# 			"disabled": 0,
# 			"stock_uom": uom,
# 		})
# 		item.insert(ignore_permissions=True, ignore_mandatory=True)
	
# 	# Create Sales Order
# 	sales_order = frappe.new_doc("Sales Order")
# 	sales_order.patient = patient
# 	sales_order.customer = customer
# 	sales_order.company = company
# 	sales_order.transaction_date = getdate()
# 	sales_order.delivery_date = getdate()
	
# 	# Add item for package (using service unit/room name as item)
# 	item_row = sales_order.append("items", {})
# 	item_row.item_code = item_code
# 	item_row.item_name = service_unit_name
# 	item_row.description = f"Inpatient Package: {package.package_name} - Room: {service_unit_name} ({days} days)"
# 	item_row.qty = 1
# 	item_row.rate = flt(total_amount)
# 	item_row.amount = flt(total_amount)
	
# 	# Set cost center if available
# 	if package.cost_center:
# 		item_row.cost_center = package.cost_center
	
# 	# Link to admission if field exists
# 	if hasattr(sales_order, 'inpatient_admission'):
# 		sales_order.inpatient_admission = admission_name
	
# 	# Set missing values
# 	sales_order.set_missing_values(for_validate=True)
	
# 	# Save and submit the Sales Order
# 	sales_order.flags.ignore_mandatory = True
# 	sales_order.save(ignore_permissions=True)
# 	sales_order.submit()
	
# 	return {
# 		'success': True,
# 		'sales_order_name': sales_order.name,
# 		'message': _('Sales Order {0} created and submitted successfully').format(sales_order.name)
# 	}

@frappe.whitelist()
def create_admission_quotation(admission_name, package_name, days, total_amount, service_unit=None):
	"""Create a Draft Quotation for admission with package"""
	from frappe.utils import getdate, flt
	print("hapa nafika")
	if not admission_name:
		frappe.throw(_("Inpatient Admission name is required"))
	if not package_name:
		frappe.throw(_("Package name is required"))
	if not days or days <= 0:
		frappe.throw(_("Number of days must be greater than 0"))
	if not total_amount or total_amount <= 0:
		frappe.throw(_("Total amount must be greater than 0"))
	if not service_unit:
		frappe.throw(_("Service Unit (room) is required"))
	
	# Get admission record
	admission = frappe.get_doc('Inpatient Admission', admission_name)
	patient = admission.patient
	company = admission.company or frappe.defaults.get_user_default("Company")
	
	if not company:
		frappe.throw(_("Company is required. Please set company in admission or user defaults."))
	
	# Get patient customer
	customer = frappe.db.get_value('Patient', patient, 'customer')
	if not customer:
		frappe.throw(_("Patient {0} does not have a linked customer").format(patient))
	
	# Get package details
	package = frappe.get_doc('Inpatient Package', package_name)
	
	# Get service unit (room) name
	service_unit_name = frappe.db.get_value(
		'Healthcare Service Unit',
		service_unit,
		'healthcare_service_unit_name'
	) or service_unit
	
	item_code = service_unit_name
	
	# Check if item exists
	if not frappe.db.exists('Item', item_code):
		
		item_group = (
			frappe.db.get_value('Item Group', {'name': 'Services'}) or
			frappe.db.get_value('Item Group', {'name': 'All Item Groups'}) or
			frappe.db.get_value('Item Group', {}, 'name')
		)
		
		uom = (
			frappe.db.exists("UOM", "Unit") or
			frappe.db.get_single_value("Stock Settings", "stock_uom") or
			"Unit"
		)
		
		item = frappe.get_doc({
			"doctype": "Item",
			"item_code": item_code,
			"item_name": service_unit_name,
			"item_group": item_group or "All Item Groups",
			"description": f"Room: {service_unit_name}",
			"is_sales_item": 1,
			"is_service_item": 1,
			"is_purchase_item": 0,
			"is_stock_item": 0,
			"stock_uom": uom,
			"disabled": 0,
		})
		item.insert(ignore_permissions=True, ignore_mandatory=True)
	
	# ✅ Create Quotation instead of Sales Order
	quotation = frappe.new_doc("Quotation")
	quotation.patient = patient
	quotation.customer = customer
	quotation.company = company
	quotation.transaction_date = getdate()
	quotation.valid_till = getdate()
	quotation.custom_package = package_name
	quotation.custom_inpatient_admission= admission_name
	
	# Add item
	item_row = quotation.append("items", {})
	item_row.item_code = item_code
	item_row.item_name = service_unit_name
	item_row.description = (
		f"Inpatient Package: {package.package_name} - "
		f"Room: {service_unit_name} ({days} days)"
	)
	item_row.qty = 1
	item_row.rate = flt(total_amount)
	item_row.amount = flt(total_amount)
	
	if package.cost_center:
		item_row.cost_center = package.cost_center
	
	# Link to admission if field exists
	if hasattr(quotation, 'inpatient_admission'):
		quotation.inpatient_admission = admission_name
	
	# Set missing values
	quotation.set_missing_values(for_validate=True)
	
	# ✅ Save only (Draft)
	quotation.flags.ignore_mandatory = True
	quotation.save(ignore_permissions=True)
	
	return {
		'success': True,
		'quotation_name': quotation.name,
		'message': _('Quotation {0} created successfully (Draft)').format(quotation.name)
	}


@frappe.whitelist()
def check_admission_quotation(admission_name, package_name):
	"""Check if a quotation already exists for this admission and package"""
	
	if not admission_name or not package_name:
		return {'exists': False}
	
	# Check for existing quotation
	existing = frappe.db.get_value(
		'Quotation',
		{
			'custom_inpatient_admission': admission_name,
			'custom_package': package_name,
			'docstatus': ['<', 2]  # Not cancelled
		},
		['name'],
		as_dict=True
	)
	
	if existing:
		return {
			'exists': True,
			'quotation_name': existing.name
		}
	
	return {'exists': False}