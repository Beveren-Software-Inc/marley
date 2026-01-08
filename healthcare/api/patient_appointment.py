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
		offset=offset,
		order_by='appointment_date desc, appointment_time desc'
	)
	
	return appointments

