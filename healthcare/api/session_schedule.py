import frappe
from frappe import _
from frappe.utils import today


@frappe.whitelist()
def get_session_schedules(limit: int = 50, offset: int = 0, patient: str = None, admission_number: str = None):
	"""
	Fetch session schedules with optional filtering by patient or admission number.
	"""
	filters = {}
	if patient:
		filters['patient_num'] = patient
	if admission_number:
		filters['admission_number'] = admission_number

	schedules = frappe.get_list(
		'Session Schedule',
		filters=filters,
		fields=['name', 'date', 'admission_number', 'patient_num', 'session_type', 'session_name', 
				'transaction_status', 'company', 'doctor', 'doctor_name', 'cost_center', 'invoice_no', 'doc_code',
				'from_time', 'to_time'],
		limit_page_length=limit,
		limit_start=offset,
		order_by='date desc'
	)

	return schedules


@frappe.whitelist()
def create_session_schedule(data: dict):
	"""
	Create a new Session Schedule record.
	"""
	if not data:
		frappe.throw(_("No data provided"))

	try:
		session_schedule = frappe.new_doc('Session Schedule')
		
		# Map the data to the doctype fields
		session_schedule.date = data.get('date')
		session_schedule.session_type = data.get('session_type')
		session_schedule.session_name = data.get('session_name')
		session_schedule.company = data.get('company')
		session_schedule.doctor = data.get('doctor')
		session_schedule.cost_center = data.get('cost_center')
		session_schedule.from_time = data.get('from_time')
		session_schedule.to_time = data.get('to_time')
		session_schedule.admission_number = data.get('admission_number')
		session_schedule.transaction_status = 'Draft'

		# Insert and return the created document
		session_schedule.insert(ignore_permissions=True)
		frappe.db.commit()

		return {
			'name': session_schedule.name,
			'date': session_schedule.date,
			'admission_number': session_schedule.admission_number,
			'patient_num': session_schedule.patient_num,
			'session_type': session_schedule.session_type,
			'session_name': session_schedule.session_name,
			'transaction_status': session_schedule.transaction_status,
			'company': session_schedule.company,
			'doctor': session_schedule.doctor,
			'doctor_name': session_schedule.doctor_name,
			'cost_center': session_schedule.cost_center,
			'invoice_no': session_schedule.invoice_no,
			'doc_code': session_schedule.doc_code,
			'from_time': session_schedule.from_time,
			'to_time': session_schedule.to_time,
		}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), 'create_session_schedule')
		frappe.throw(str(e))


@frappe.whitelist()
def update_session_schedule_status(session_schedule_name: str, status: str):
	"""
	Update the status of a Session Schedule.
	"""
	if not session_schedule_name or not status:
		frappe.throw(_("Session Schedule name and status are required"))

	session_schedule = frappe.get_doc('Session Schedule', session_schedule_name)
	session_schedule.transaction_status = status
	session_schedule.save()
	frappe.db.commit()

	return {
		'name': session_schedule.name,
		'transaction_status': session_schedule.transaction_status,
	}
