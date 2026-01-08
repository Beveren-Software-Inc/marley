import frappe
from frappe import _

@frappe.whitelist()
def get_practitioner_appointments(limit=50, offset=0, status=None):
	"""Get appointments for the current user's healthcare practitioner"""
	user = frappe.session.user
	
	# Get the healthcare practitioner linked to the current user
	practitioner = frappe.db.get_value('Healthcare Practitioner', {'user_id': user}, 'name')
	
	if not practitioner:
		return []
	
	# Build filters
	filters = {'practitioner': practitioner}
	if status:
		filters['status'] = status
	
	# Get appointments
	appointments = frappe.get_all(
		'Patient Appointment',
		filters=filters,
		fields=[
			'name',
			'patient',
			'patient_name',
			'appointment_date',
			'appointment_time',
			'status',
			'appointment_type',
			'department',
			'practitioner',
			'practitioner_name'
		],
		limit=limit,
		limit_start=offset,
		order_by='appointment_date desc, appointment_time desc'
	)
	
	return appointments

@frappe.whitelist()
def get_all_appointments(limit=50, offset=0, status=None, patient=None):
	"""Get all appointments (for receptionist)"""
	filters = {}
	if status:
		filters['status'] = status
	if patient:
		filters['patient'] = patient
	
	appointments = frappe.get_all(
		'Patient Appointment',
		filters=filters,
		fields=[
			'name',
			'patient',
			'patient_name',
			'appointment_date',
			'appointment_time',
			'status',
			'appointment_type',
			'department',
			'practitioner',
			'practitioner_name'
		],
		limit=limit,
		limit_start=offset,
		order_by='appointment_date desc, appointment_time desc'
	)
	
	return appointments

@frappe.whitelist()
def create_appointment(data):
	"""Create a new Patient Appointment"""
	if isinstance(data, str):
		import json
		data = json.loads(data)
	
	# Create the appointment document
	appointment = frappe.get_doc({
		'doctype': 'Patient Appointment',
		'patient': data.get('patient'),
		'appointment_type': data.get('appointment_type'),
		'appointment_date': data.get('appointment_date'),
		'appointment_time': data.get('appointment_time'),
		'practitioner': data.get('practitioner'),
		'appointment_for': 'Practitioner',
		'status': 'Scheduled'
	})
	
	appointment.insert()
	frappe.db.commit()
	
	# Get practitioner name
	practitioner_name = None
	if appointment.practitioner:
		practitioner_name = frappe.db.get_value('Healthcare Practitioner', appointment.practitioner, 'practitioner_name')
	
	return {
		'name': appointment.name,
		'patient': appointment.patient,
		'patient_name': appointment.patient_name,
		'appointment_date': appointment.appointment_date,
		'appointment_time': appointment.appointment_time,
		'status': appointment.status,
		'appointment_type': appointment.appointment_type,
		'practitioner': appointment.practitioner,
		'practitioner_name': practitioner_name
	}

