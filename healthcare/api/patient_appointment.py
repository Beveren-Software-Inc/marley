import frappe
from frappe import _
from frappe.utils import cint, cstr, flt, nowdate

from healthcare.api.sales_order_cost_center import (
	apply_cost_center_to_sales_order,
	cost_center_from_base_reference,
)
from healthcare.api.utils.api_utility import get_next_prefixed, get_next_transaction_number
from healthcare.healthcare.utils import get_appointment_billing_item_and_rate

@frappe.whitelist()
def get_all_appointments(limit=50, offset=0, status=None, patient=None,
                         search=None, practitioner=None,
                         date_from=None, date_to=None):
	"""Get all appointments (for receptionist) with server-side pagination."""
	filters = {}
	or_filters = {}

	if status:
		filters['status'] = status
	if patient:
		filters['patient'] = patient
	if practitioner:
		filters['practitioner'] = practitioner
	if date_from:
		filters['appointment_date'] = ['>=', date_from]
	if date_to:
		if 'appointment_date' in filters:
			filters['appointment_date'] = ['between', [date_from, date_to]]
		else:
			filters['appointment_date'] = ['<=', date_to]

	if search:
		search_term = f"%{search}%"
		or_filters = [
			['patient_name', 'like', search_term],
			['patient', 'like', search_term],
			['practitioner_name', 'like', search_term],
			['name', 'like', search_term],
			['temporary_patient_name', 'like', search_term],
			['temporary_mobile_no', 'like', search_term],
		]

	fields = [
		'name', 'patient', 'patient_name',
		'appointment_date', 'appointment_time', 'old_time',
		'status', 'appointment_type', 'department',
		'practitioner', 'practitioner_name', 'company', 'cost_center',
		'temporary_patient_name', 'temporary_mobile_no',
		'invoiced', 'ref_sales_invoice', 'remarks', 'notes',
	]

	count_args = {'doctype': 'Patient Appointment', 'filters': filters}
	fetch_args = dict(count_args, fields=fields, limit=limit, limit_start=offset,
		order_by='appointment_date desc, appointment_time desc')
	if or_filters:
		count_args['or_filters'] = or_filters
		fetch_args['or_filters'] = or_filters

	total_count = len(frappe.get_all(**count_args, fields=['name'], limit=0))
	appointments = frappe.get_all(**fetch_args)
	_enrich_appointments_with_sales_order(appointments)

	return {"data": appointments, "total_count": total_count}

@frappe.whitelist()
def update_appointment_ad_remark(appointment_name, remark):
	"""Reception: save or update the AD (administrative) remark on an appointment."""
	if not appointment_name:
		frappe.throw(_("Appointment is required"))
	if not frappe.db.exists("Patient Appointment", appointment_name):
		frappe.throw(_("Appointment {0} not found").format(appointment_name))
	frappe.db.set_value(
		"Patient Appointment",
		appointment_name,
		"remarks",
		(cstr(remark) or "").strip(),
		update_modified=True,
	)
	frappe.db.commit()
	return {
		"name": appointment_name,
		"remarks": (cstr(remark) or "").strip(),
	}


@frappe.whitelist()
def update_appointment_doctor_note(appointment_name, note):
	"""Doctor: save or update the clinical note on an appointment."""
	if not appointment_name:
		frappe.throw(_("Appointment is required"))
	if not frappe.db.exists("Patient Appointment", appointment_name):
		frappe.throw(_("Appointment {0} not found").format(appointment_name))
	frappe.db.set_value(
		"Patient Appointment",
		appointment_name,
		"notes",
		(cstr(note) or "").strip(),
		update_modified=True,
	)
	frappe.db.commit()
	return {
		"name": appointment_name,
		"notes": (cstr(note) or "").strip(),
	}


@frappe.whitelist()
def get_practitioner_appointments(limit=50, offset=0, status=None,
                                  search=None, date_from=None, date_to=None):
    """Get appointments for the current user's healthcare practitioner with server-side pagination."""
    user = frappe.session.user

    practitioner = frappe.db.get_value('Healthcare Practitioner', {'user_id': user}, 'name')

    elevated_roles = {'System Manager', 'Healthcare Administrator', 'CEO'}
    user_roles = set(frappe.get_roles(user))
    has_elevated_role = bool(elevated_roles & user_roles)

    if not practitioner:
        if not has_elevated_role:
            return {"data": [], "total_count": 0}
        filters = {}
    else:
        filters = {'practitioner': practitioner}

    if status:
        filters['status'] = status
    if date_from:
        filters['appointment_date'] = ['>=', date_from]
    if date_to:
        if 'appointment_date' in filters:
            filters['appointment_date'] = ['between', [date_from, date_to]]
        else:
            filters['appointment_date'] = ['<=', date_to]

    or_filters = {}
    if search:
        search_term = f"%{search}%"
        or_filters = {
            'patient_name': ['like', search_term],
            'patient': ['like', search_term],
            'practitioner_name': ['like', search_term],
            'name': ['like', search_term],
        }

    fields = [
        'name', 'patient', 'patient_name',
        'appointment_date', 'appointment_time', 'old_time',
        'status', 'appointment_type', 'department',
        'practitioner', 'practitioner_name', 'cost_center',
        'remarks', 'notes',
    ]

    count_args = {'doctype': 'Patient Appointment', 'filters': filters}
    fetch_args = dict(count_args, fields=fields, limit=limit, limit_start=offset,
        order_by='appointment_date desc, appointment_time desc')
    if or_filters:
        count_args['or_filters'] = or_filters
        fetch_args['or_filters'] = or_filters

    total_count = len(frappe.get_all(**count_args, fields=['name'], limit=0))
    appointments = frappe.get_all(**fetch_args)

    return {"data": appointments, "total_count": total_count}

@frappe.whitelist()
def get_appointment_cost_center_options():
	"""Cost centers for the create-appointment form (respects User Permission on Cost Center)."""
	from healthcare.api.common import get_permitted_cost_centers

	permitted = get_permitted_cost_centers()
	restricted = permitted is not None
	print("Huku ndio cost center options", str(permitted))
	if permitted is None:
		rows = frappe.get_all(
			"Cost Center",
			filters={"is_group": 0},
			fields=["name", "cost_center_name"],
			order_by="name asc",
			limit_page_length=200,
		)
		default_cc = rows[0].name if len(rows) == 1 else ""
	elif not permitted:
		rows = []
		default_cc = ""
	else:
		rows = frappe.get_all(
			"Cost Center",
			filters={"name": ["in", permitted]},
			fields=["name", "cost_center_name"],
			order_by="name asc",
		)
		default_cc = permitted[0]

	return {
		"cost_centers": [
			{"name": r.name, "label": (r.cost_center_name or r.name)} for r in rows
		],
		"default_cost_center": default_cc or "",
		"restricted": restricted,
		"locked": restricted and len(rows) == 1,
	}


@frappe.whitelist()
def create_appointment(data):
	"""Create a new Patient Appointment"""
	if isinstance(data, str):
		import json
		data = json.loads(data)
	number = get_next_transaction_number('Patient Appointment')
	explicit_duration = None
	if data.get('duration') is not None:
		explicit_duration = cint(data.get('duration'))
		if explicit_duration < 1:
			explicit_duration = None

	# Create the appointment document
	doc_fields = {
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
		'cost_center': data.get('cost_center') or None,
		'trans_no': number,
	}
	if explicit_duration:
		doc_fields['duration'] = explicit_duration

	appointment = frappe.get_doc(doc_fields)

	if appointment.practitioner:
		pract_dept = frappe.db.get_value(
			'Healthcare Practitioner', appointment.practitioner, 'department'
		)
		if pract_dept and frappe.db.exists('Medical Department', pract_dept):
			appointment.department = pract_dept
	
	appointment.insert(ignore_permissions=True)

	# fetch_from on duration can still overwrite on insert until fetch_if_empty is synced
	if explicit_duration and appointment.duration != explicit_duration:
		frappe.db.set_value(
			'Patient Appointment',
			appointment.name,
			'duration',
			explicit_duration,
			update_modified=False,
		)
		appointment.duration = explicit_duration

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
def link_walk_in_appointment_to_patient(appointment_name, patient):
	"""Attach a registered Patient to a walk-in appointment and clear temporary fields."""
	if not appointment_name:
		frappe.throw(_("Appointment name is required"))
	if not patient:
		frappe.throw(_("Patient is required"))
	if not frappe.db.exists("Patient Appointment", appointment_name):
		frappe.throw(_("Patient Appointment {0} not found").format(appointment_name))
	if not frappe.db.exists("Patient", patient):
		frappe.throw(_("Patient {0} not found").format(patient))

	doc = frappe.get_doc("Patient Appointment", appointment_name)
	if doc.patient:
		frappe.throw(
			_("Appointment {0} is already linked to patient {1}").format(
				appointment_name, doc.patient
			)
		)
	if not (doc.temporary_patient_name or "").strip():
		frappe.throw(
			_("Appointment {0} is not a walk-in (no temporary patient name)").format(
				appointment_name
			)
		)

	doc.patient = patient
	doc.temporary_patient_name = None
	doc.temporary_mobile_no = None
	# validate() resolves department; ignore_links covers sites with stale DocField options
	doc.flags.ignore_links = True
	doc.save(ignore_permissions=True)
	frappe.db.commit()

	patient_name = frappe.db.get_value("Patient", patient, "patient_name")
	return {
		"name": doc.name,
		"patient": doc.patient,
		"patient_name": patient_name or doc.patient_name,
		"status": doc.status,
		"temporary_patient_name": doc.temporary_patient_name,
		"temporary_mobile_no": doc.temporary_mobile_no,
	}


def _enrich_appointments_with_sales_order(appointments):
	if not appointments:
		return
	names = [a.name for a in appointments]
	rows = frappe.get_all(
		"Sales Order",
		filters={
			"custom_base_reference": "Patient Appointment",
			"custom_base_reference_name": ["in", names],
			"docstatus": ["<", 2],
		},
		fields=["name", "custom_base_reference_name"],
		order_by="creation desc",
	)
	so_by_apt = {}
	for row in rows:
		key = row.custom_base_reference_name
		if key and key not in so_by_apt:
			so_by_apt[key] = row.name
	for apt in appointments:
		apt["sales_order"] = so_by_apt.get(apt.name)


def _find_appointment_sales_order(appointment_name):
	return frappe.db.get_value(
		"Sales Order",
		{
			"custom_base_reference": "Patient Appointment",
			"custom_base_reference_name": appointment_name,
			"docstatus": ["<", 2],
		},
		"name",
		order_by="creation desc",
	)


def _appointment_billing_item_and_rate(appointment_doc):
	item_code = frappe.db.get_single_value(
		"Healthcare Settings", "default_patient_appointment_item"
	)
	if not item_code:
		frappe.throw(
			_(
				"Set <b>Default Patient Appointment Item</b> in "
				"<a href='/app/Form/Healthcare Settings'>Healthcare Settings</a>."
			),
			title=_("Missing Configuration"),
		)
	if not frappe.db.exists("Item", item_code):
		frappe.throw(_("Item {0} does not exist").format(item_code))

	billing_rate = flt(appointment_doc.paid_amount)
	if billing_rate <= 0:
		try:
			details = get_appointment_billing_item_and_rate(appointment_doc)
			billing_rate = flt(details.get("practitioner_charge"))
		except Exception:
			billing_rate = 0
	if billing_rate <= 0:
		billing_rate = flt(frappe.db.get_value("Item", item_code, "standard_rate"))

	return item_code, billing_rate


@frappe.whitelist()
def create_sales_order_from_appointment(appointment_name, create_sales_invoice=0):
	"""Create (or reuse) a draft Sales Order for a checked-out appointment.

	Uses ``default_patient_appointment_item`` from Healthcare Settings.
	Optional ``create_sales_invoice`` submits the order, creates and submits a Sales Invoice,
	and marks the appointment invoiced.
	"""
	if not appointment_name:
		frappe.throw(_("Appointment name is required"))

	create_sales_invoice = cint(create_sales_invoice)

	appointment = frappe.get_doc("Patient Appointment", appointment_name)
	if not appointment.patient:
		frappe.throw(_("Register a patient on this appointment before billing."))
	if appointment.status != "Checked Out":
		frappe.throw(
			_("Appointment must be Checked Out before creating a Sales Order."),
			title=_("Not Checked Out"),
		)

	existing_so = _find_appointment_sales_order(appointment_name)
	if existing_so and not create_sales_invoice:
		so = frappe.get_doc("Sales Order", existing_so)
		return {
			"sales_order": so.name,
			"sales_order_status": so.status,
			"existing": True,
			"sales_invoice": appointment.ref_sales_invoice,
			"invoiced": cint(appointment.invoiced),
		}

	if appointment.invoiced and appointment.ref_sales_invoice:
		return {
			"sales_order": existing_so,
			"sales_order_status": frappe.db.get_value("Sales Order", existing_so, "status")
			if existing_so
			else None,
			"existing": True,
			"sales_invoice": appointment.ref_sales_invoice,
			"invoiced": 1,
		}

	company = appointment.company or frappe.defaults.get_user_default("Company")
	if not company:
		frappe.throw(_("Company is required on the appointment or user defaults."))

	customer = frappe.db.get_value("Patient", appointment.patient, "customer")
	if not customer:
		frappe.throw(
			_("Patient {0} has no Customer linked. Link a customer on the patient record first.").format(
				appointment.patient
			)
		)

	item_code, billing_rate = _appointment_billing_item_and_rate(appointment)

	if existing_so:
		so_name = existing_so
	else:
		so = frappe.new_doc("Sales Order")
		so.company = company
		so.patient = appointment.patient
		so.customer = customer
		so.transaction_date = nowdate()
		so.delivery_date = nowdate()
		so.ignore_pricing_rule = 1

		pname = appointment.patient_name or frappe.db.get_value(
			"Patient", appointment.patient, "patient_name"
		)
		if pname and hasattr(so, "custom_patient_name"):
			so.custom_patient_name = pname
		if hasattr(so, "custom_patient"):
			so.custom_patient = appointment.patient

		so.custom_base_reference = "Patient Appointment"
		so.custom_base_reference_name = appointment.name

		pract = appointment.practitioner_name or appointment.practitioner or ""
		desc = _("Appointment {0}").format(appointment.name)
		if pract:
			desc = _("Appointment {0} — {1}").format(appointment.name, pract)

		so.append(
			"items",
			{
				"item_code": item_code,
				"qty": 1,
				"rate": billing_rate,
				"price_list_rate": billing_rate,
				"description": desc,
			},
		)

		cc = cost_center_from_base_reference("Patient Appointment", appointment.name)
		if not cc and appointment.company:
			cc = frappe.get_cached_value("Company", appointment.company, "cost_center")
		apply_cost_center_to_sales_order(so, cc)

		so.insert(ignore_permissions=True)
		so_name = so.name

	result = {
		"sales_order": so_name,
		"sales_order_status": frappe.db.get_value("Sales Order", so_name, "status"),
		"existing": bool(existing_so),
		"sales_invoice": None,
		"invoiced": 0,
	}

	if create_sales_invoice:
		so_doc = frappe.get_doc("Sales Order", so_name)
		if so_doc.docstatus == 0:
			so_doc.submit()

		from erpnext.selling.doctype.sales_order.sales_order import make_sales_invoice

		si = make_sales_invoice(so_name)
		if hasattr(si, "patient"):
			si.patient = appointment.patient
		if hasattr(si, "appointment"):
			si.appointment = appointment.name
		si.flags.ignore_mandatory = True
		si.save(ignore_permissions=True)
		si.submit()

		frappe.db.set_value(
			"Patient Appointment",
			appointment_name,
			{"invoiced": 1, "ref_sales_invoice": si.name},
			update_modified=True,
		)
		result["sales_invoice"] = si.name
		result["invoiced"] = 1

	frappe.db.commit()
	return result


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