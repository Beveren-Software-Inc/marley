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
			'practitioner_name',
			'company',
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
		'patient': data.get('patient') or None,
		'appointment_type': data.get('appointment_type'),
		'appointment_date': data.get('appointment_date'),
		'appointment_time': data.get('appointment_time'),
		'practitioner': data.get('practitioner'),
		'appointment_for': 'Practitioner',
		'status': 'Scheduled',
		'temporary_patient_name': data.get('temporary_patient_name'),
		'temporary_mobile_no': data.get('temporary_mobile_no'),
		'notes': data.get('notes'),
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
 
@frappe.whitelist()
def check_practitioner_availability(practitioner, date):
    """
    Check if a practitioner is available on a specific date.
    Returns {'available': True/False, 'leave_details': {...} if on leave}
    """
    try:
        # Get the employee linked to this healthcare practitioner
        employee = frappe.db.get_value('Healthcare Practitioner', practitioner, 'employee')
        
        if not employee:
            # No employee linked, assume available
            return {'available': True}
        
        # Check if there's any leave application for this employee on the given date
        # with status 'Approved' or 'Open'
        leave_exists = frappe.db.exists('Leave Application', {
            'employee': employee,
            'from_date': ('<=', date),
            'to_date': ('>=', date),
            'status': ['in', ['Approved', 'Open']]
        })
        
        if leave_exists:
            leave_record = frappe.db.get_value('Leave Application', leave_exists, 
                ['leave_type', 'status', 'from_date', 'to_date'], as_dict=True)
            return {
                'available': False,
                'leave_details': {
                    'leave_type': leave_record.get('leave_type') if leave_record else 'Unknown',
                    'status': leave_record.get('status') if leave_record else 'Approved',
                    'from_date': leave_record.get('from_date') if leave_record else date,
                    'to_date': leave_record.get('to_date') if leave_record else date
                }
            }
        
        return {'available': True}
        
    except Exception as e:
        frappe.log_error(f"Error checking practitioner availability: {str(e)}", "Appointment List")
        # Default to available if there's an error
        return {'available': True}