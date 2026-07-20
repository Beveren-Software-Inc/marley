# Add to healthcare/api/patient_appointment.py or create healthcare/api/daily_patient_visit.py

import frappe
from frappe import _
from frappe.utils import add_days, flt, getdate, today

from healthcare.api.patient_file_no_charge import _ensure_patient_customer
from healthcare.api.patient_visit_charge import (
	_existing_visit_charge_sales_order,
	maybe_create_patient_visit_charge_sales_order,
	visit_type_no_charges,
)
from healthcare.api.sales_order_cost_center import (
	apply_cost_center_to_sales_order,
	cost_center_from_visit_or_admission,
)
from healthcare.api.utils.api_utility import get_next_transaction_number
from healthcare.healthcare.editing_lock import assert_editing_allowed

DAILY_AUTO_VISIT_TYPE = "Daily Auto Visit"


def _line_amount(line) -> float:
	if isinstance(line, dict):
		return flt(line.get("amount"))
	return flt(getattr(line, "amount", 0))


def _setup_doc_name(setup):
	if isinstance(setup, dict):
		return setup.get("name")
	if isinstance(setup, str):
		return setup
	if hasattr(setup, "get"):
		return setup.get("name")
	return getattr(setup, "name", None)


def _effective_services_from_data(data: dict) -> list[dict]:
	services = data.get("services")
	if services is None:
		session = data.get("session")
		amount = data.get("amount")
		if session or amount:
			return [{"session": session, "amount": amount}]
		return []
	return services or []


def _validate_daily_patient_visit_setup_payload(data: dict, *, for_update: bool = False):
	data = data or {}

	patient = (data.get("patient") or "").strip()
	if not for_update and not patient:
		frappe.throw(_("Please select a patient."))
	if patient and not frappe.db.exists("Patient", patient):
		frappe.throw(_("Patient {0} was not found. Please select a valid patient.").format(patient))

	from_date = data.get("from_date")
	if not for_update and not from_date:
		frappe.throw(_("Start Date is required for Daily Auto Visit setup."))
	to_date = data.get("to_date")
	if from_date and to_date:
		if getdate(to_date) < getdate(from_date):
			frappe.throw(_("End Date cannot be before Start Date."))

	branch = (data.get("branch") or data.get("cost_center") or "").strip()
	if not for_update and not branch:
		frappe.throw(_("Branch is required. Select a branch from the top navigation bar."))

	practioner = data.get("practioner") or data.get("practitioner") or data.get("doctor")
	if practioner and not frappe.db.exists("Healthcare Practitioner", practioner):
		frappe.throw(_("Doctor/Practitioner {0} was not found.").format(practioner))

	admission = (data.get("admission") or "").strip()
	if admission and not frappe.db.exists("Inpatient Admission", admission):
		frappe.throw(_("Admission {0} was not found.").format(admission))

	if not for_update or "services" in data or "session" in data or "amount" in data:
		valid_lines = []
		for line in _effective_services_from_data(data):
			if not isinstance(line, dict):
				continue
			session = (line.get("session") or "").strip()
			amount = flt(line.get("amount"))
			if session or amount:
				valid_lines.append((session, amount))
		if not valid_lines:
			frappe.throw(_("Add at least one service with a session name or amount."))
		for _session, amount in valid_lines:
			if amount < 0:
				frappe.throw(_("Service amount cannot be negative."))


def _setup_total_amount(setup) -> float:
	"""Sum service line amounts; supports doc, dict, or setup name."""
	services = None
	if isinstance(setup, dict):
		services = setup.get("services")
	elif hasattr(setup, "services"):
		services = setup.services

	if services:
		return sum(_line_amount(line) for line in services)

	name = _setup_doc_name(setup)

	if name:
		rows = frappe.get_all(
			"Daily Patient Visit Setup Service",
			filters={"parent": name},
			fields=["amount"],
		)
		if rows:
			return sum(flt(row.amount) for row in rows)

	if isinstance(setup, dict):
		return flt(setup.get("amount"))
	return flt(getattr(setup, "amount", 0))


def _apply_services_to_doc(doc, data: dict):
    services = data.pop("services", None)
    if services is None:
        session = data.pop("session", None)
        amount = data.pop("amount", None)
        if session or amount:
            services = [{"session": session, "amount": amount}]
    else:
        data.pop("session", None)
        data.pop("amount", None)

    if services is None:
        return

    doc.set("services", [])
    for line in services or []:
        session = (line.get("session") or "").strip()
        amount = flt(line.get("amount"))
        if not session and not amount:
            continue
        doc.append("services", {"session": session, "amount": amount})


def _services_for_setup_names(names: list[str]) -> dict[str, list[dict]]:
    if not names:
        return {}
    rows = frappe.get_all(
        "Daily Patient Visit Setup Service",
        filters={"parent": ["in", names]},
        fields=["parent", "session", "amount", "name", "idx"],
        order_by="parent asc, idx asc",
    )
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        grouped.setdefault(row.parent, []).append(
            {"name": row.name, "session": row.session, "amount": flt(row.amount)}
        )
    return grouped


@frappe.whitelist()
def create_daily_patient_visit_setup(data):
    """Create a new Daily Patient Visit Setup document"""
    if isinstance(data, str):
        import json
        data = json.loads(data)

    data = dict(data or {})
    try:
        _validate_daily_patient_visit_setup_payload(data)

        practioner = data.get('practioner') or data.get('practitioner') or data.get('doctor')
        practitioner_name = data.get('practitioner_name')
        if practioner and not practitioner_name:
            practitioner_name = frappe.db.get_value(
                'Healthcare Practitioner', practioner, 'practitioner_name'
            )

        branch = (data.get('branch') or data.get('cost_center') or '').strip() or None
        doc = frappe.get_doc({
            'doctype': 'Daily Patient Visit Setup',
            'patient': data.get('patient'),
            'practioner': practioner,
            'practitioner_name': practitioner_name,
            'posting_date': data.get('posting_date') or today(),
            'admission': data.get('admission'),
            'discharge': data.get('discharge'),
            'from_date': data.get('from_date') or None,
            'to_date': data.get('to_date') or None,
            'time': data.get('time') or None,
            'branch': branch,
            'is_active': (
                frappe.utils.cint(data.get('is_active'))
                if 'is_active' in data
                else 1
            ),
        })
        _apply_services_to_doc(doc, data)
        doc.insert(ignore_permissions=True)
        frappe.db.commit()

        result = _serialize_daily_patient_visit_setup(doc)
        result["message"] = _(
            "Daily Auto Visit setup {0} created for {1}."
        ).format(doc.name, doc.patient_name or doc.patient)
        return result
    except frappe.ValidationError:
        raise
    except Exception:
        frappe.log_error(
            title="Create Daily Patient Visit Setup failed",
            message=frappe.get_traceback(),
        )
        frappe.throw(
            _("Could not create Daily Auto Visit setup. Please check the details and try again.")
        )

@frappe.whitelist()
def update_daily_patient_visit_setup(name, data):
    """Update an existing Daily Patient Visit Setup document"""
    assert_editing_allowed()
    if isinstance(data, str):
        import json
        data = json.loads(data)
    
    data = dict(data or {})
    if not name or not frappe.db.exists('Daily Patient Visit Setup', name):
        frappe.throw(_("Daily Auto Visit setup {0} was not found.").format(name or ""))

    try:
        _validate_daily_patient_visit_setup_payload(data, for_update=True)

        doc = frappe.get_doc('Daily Patient Visit Setup', name)
        practioner = data.pop('practioner', None) or data.pop('practitioner', None) or data.pop('doctor', None)
        if practioner is not None:
            doc.practioner = practioner
            doc.practitioner_name = (
                data.pop('practitioner_name', None)
                or frappe.db.get_value('Healthcare Practitioner', practioner, 'practitioner_name')
            )
        _apply_services_to_doc(doc, data)
        # Empty strings from UI should clear optional Date/Time fields
        if "to_date" in data and not data.get("to_date"):
            data["to_date"] = None
        if "time" in data and not data.get("time"):
            data["time"] = None
        if "cost_center" in data and "branch" not in data:
            data["branch"] = data.pop("cost_center") or None
        if "branch" in data and not data.get("branch"):
            data["branch"] = None
        doc.update(data)
        doc.save()
        frappe.db.commit()

        result = _serialize_daily_patient_visit_setup(doc)
        result["message"] = _("Daily Auto Visit setup {0} updated.").format(doc.name)
        return result
    except frappe.ValidationError:
        raise
    except Exception:
        frappe.log_error(
            title=f"Update Daily Patient Visit Setup failed: {name}",
            message=frappe.get_traceback(),
        )
        frappe.throw(
            _("Could not update Daily Auto Visit setup. Please check the details and try again.")
        )


def _patient_file_no_map(patient_ids):
    patient_ids = [p for p in patient_ids if p]
    if not patient_ids:
        return {}
    rows = frappe.get_all(
        'Patient',
        filters={'name': ('in', patient_ids)},
        fields=['name', 'file_no'],
    )
    return {row.name: row.file_no for row in rows}


def _serialize_daily_patient_visit_setup(doc):
    data = doc.as_dict() if hasattr(doc, 'as_dict') else dict(doc)
    patient = data.get('patient')
    if patient:
        data['file_no'] = frappe.db.get_value('Patient', patient, 'file_no')
    services = [
        {"name": row.name, "session": row.session, "amount": flt(row.amount)}
        for row in (doc.services if hasattr(doc, "services") else data.get("services") or [])
    ]
    data["services"] = services
    data["amount"] = _setup_total_amount(doc)
    if services:
        data["session"] = services[0].get("session")
    return data


@frappe.whitelist()
def get_daily_patient_visit_setup(name):
    """Get one Daily Patient Visit Setup for detail panel / edit."""
    if not name:
        frappe.throw(_('Setup name is required'))
    doc = frappe.get_doc('Daily Patient Visit Setup', name)
    return _serialize_daily_patient_visit_setup(doc)


@frappe.whitelist()
def get_daily_patient_visit_setups(patient=None, active_only=0, branch=None, limit=100):
    """List Daily Patient Visit Setup rows for UI."""
    filters = {}
    if patient:
        filters["patient"] = patient
    if str(active_only).lower() in ("1", "true", "yes"):
        filters["is_active"] = 1
    branch = (branch or "").strip()
    if branch:
        filters["branch"] = branch

    rows = frappe.get_all(
        "Daily Patient Visit Setup",
        filters=filters,
        fields=[
            "name",
            "patient",
            "patient_name",
            "practioner",
            "practitioner_name",
            "posting_date",
            "creation",
            "cr_date",
            "admission",
            "discharge",
            "from_date",
            "to_date",
            "time",
            "branch",
            "is_active",
        ],
        order_by="creation desc",
        limit_page_length=int(limit or 100),
    )
    file_map = _patient_file_no_map([row.get("patient") for row in rows])
    services_map = _services_for_setup_names([row.get("name") for row in rows if row.get("name")])
    for row in rows:
        row["file_no"] = file_map.get(row.get("patient"))
        services = services_map.get(row.get("name"), [])
        row["services"] = services
        row["amount"] = sum(flt(line.get("amount")) for line in services)
        row["session"] = services[0].get("session") if services else None
    return rows


@frappe.whitelist()
def stop_daily_patient_visit_setup(name):
    """Stop Daily Auto Visit for a setup by toggling is_active off."""
    if not name:
        frappe.throw(_("Setup name is required"))
    doc = frappe.get_doc("Daily Patient Visit Setup", name)
    doc.is_active = 0
    doc.save()
    frappe.db.commit()
    return {"name": doc.name, "is_active": doc.is_active}
def get_or_create_daily_session_charge_item():
    """
    Get or create the 'Daily Session Charge' item.
    Returns the item name.
    """
    item_name = "Daily Session Charge"
    
    # Check if item exists
    if frappe.db.exists('Item', item_name):
        return item_name
    
    # Create the item
    item = frappe.get_doc({
        'doctype': 'Item',
        'item_code': item_name,
        'item_name': item_name,
        'item_group': 'Services',
        'is_stock_item': 0,
        'standard_rate': 0,
        'description': 'Daily session charge for automatic patient visits'
    })
    item.insert(ignore_permissions=True)
    frappe.db.commit()
    
    return item_name
def add_op_charge_to_patient_visit(visit_name, amount, charge_date=None):
    """
    Add an OP charge to a Patient Visit.
    """
    if not charge_date:
        charge_date = today()
    
    # Get or create the daily session charge item
    item_code = get_or_create_daily_session_charge_item()
    
    # Get the Patient Visit document
    visit = frappe.get_doc('Patient Visit', visit_name)
    
    # Get op_charges, ensure it's a list (not None)
    op_charges = visit.get('charges')
    if op_charges is None:
        op_charges = []
    
    # Check if charge already exists for today to avoid duplicates
    existing_charge = False
    for charge in op_charges:
        if charge.charges_item == item_code and str(charge.date) == str(charge_date):
            existing_charge = True
            # Update amount if needed
            if charge.amount != amount:
                charge.amount = amount
                visit.save()
                frappe.db.commit()
            break
    
    if not existing_charge:
        # Add new charge to the op_charges table
        visit.append('charges', {
            'charges_item': item_code,
            'date': charge_date,
            'amount': amount
        })
        visit.save()
        frappe.db.commit()


def _resolve_setup_cost_center(setup):
	"""Prefer setup.branch (Cost Center); fall back to linked admission branch."""
	raw = _setup_field(setup, "branch")
	branch = (raw or "").strip() if raw else None
	if branch:
		return branch
	admission = _setup_field(setup, "admission")
	if admission and frappe.db.exists("Inpatient Admission", admission):
		return cost_center_from_visit_or_admission("Inpatient Admission", admission)
	return None


def _setup_field(setup, field):
	if isinstance(setup, dict):
		return setup.get(field)
	return getattr(setup, field, None)


def _visit_dates_for_setup(setup, current_date):
	"""All dates from setup from_date through min(to_date or today, current_date).

	If to_date is blank, the setup stays open-ended while active and runs through today.
	"""
	return _visit_dates_in_range(setup, None, current_date)


def _visit_dates_in_range(setup, range_from, range_to):
	"""Dates to create for a setup, clipped to an optional requested range and not past today."""
	today_date = getdate(today())
	setup_start = getdate(_setup_field(setup, "from_date")) if _setup_field(setup, "from_date") else None
	if not setup_start:
		return []

	setup_end_raw = _setup_field(setup, "to_date")
	setup_end = getdate(setup_end_raw) if setup_end_raw else today_date

	req_start = getdate(range_from) if range_from else setup_start
	req_end = getdate(range_to) if range_to else today_date

	start = max(setup_start, req_start)
	end = min(setup_end, req_end, today_date)

	if start > end:
		return []

	dates = []
	cursor = start
	while cursor <= end:
		dates.append(cursor)
		cursor = add_days(cursor, 1)
	return dates


def _existing_daily_auto_visit_dates(patient, from_date, to_date):
	rows = frappe.get_all(
		'Patient Visit',
		filters={
			'patient': patient,
			'visit_type': DAILY_AUTO_VISIT_TYPE,
			'encounter_date': ['between', [from_date, to_date]],
		},
		pluck='encounter_date',
	)
	return {getdate(row) for row in rows if row}


def _process_setup_visit_dates(setup, visit_dates) -> dict:
	"""Create missing Daily Auto Visits (and orders) for the given dates. Skip existing."""
	created = skipped_existing = billed_existing = errors = 0
	if not visit_dates:
		return {
			"created": 0,
			"skipped_existing": 0,
			"billed_existing": 0,
			"errors": 0,
		}

	patient = _setup_field(setup, "patient")
	existing_dates = _existing_daily_auto_visit_dates(patient, visit_dates[0], visit_dates[-1])

	for visit_date in visit_dates:
		try:
			if visit_date in existing_dates:
				visit_name = _get_daily_auto_visit_name(patient, visit_date)
				if visit_name:
					_ensure_daily_auto_visit_billing(setup, visit_name, visit_date)
					billed_existing += 1
				skipped_existing += 1
				continue
			_create_daily_auto_visit_for_date(setup, visit_date)
			existing_dates.add(visit_date)
			created += 1
		except Exception:
			errors += 1
			frappe.log_error(
				title=f"Daily auto visit failed: {_setup_field(setup, 'name')} @ {visit_date}",
				message=frappe.get_traceback(),
			)

	return {
		"created": created,
		"skipped_existing": skipped_existing,
		"billed_existing": billed_existing,
		"errors": errors,
	}


def create_daily_auto_visit_sales_order(visit_name, amount, charge_date=None, cost_center=None):
    """Create a submitted Sales Order for a daily auto visit charge."""
    amount = flt(amount)
    if amount <= 0:
        return None

    visit = frappe.get_doc('Patient Visit', visit_name)
    item_code = get_or_create_daily_session_charge_item()
    existing = _existing_visit_charge_sales_order(visit.name, item_code)
    if existing:
        so = frappe.get_doc('Sales Order', existing)
        if so.docstatus == 0:
            so.flags.ignore_permissions = True
            so.submit()
        return {'sales_order': so.name, 'existing': True}

    customer = _ensure_patient_customer(visit.patient)
    company = visit.company or frappe.defaults.get_user_default('company') or frappe.db.get_single_value(
        'Global Defaults', 'default_company'
    )
    if not company:
        frappe.throw(_('Default Company is not set'))

    billing_date = getdate(charge_date or visit.encounter_date or today())
    visit_label = visit.case_no or visit.name

    so = frappe.new_doc('Sales Order')
    so.company = company
    so.customer = customer
    so.patient = visit.patient
    if hasattr(so, 'custom_patient'):
        so.custom_patient = visit.patient
    if hasattr(so, 'custom_patient_name'):
        so.custom_patient_name = visit.patient_name

    so.custom_reference_type = 'Patient Visit'
    so.custom_reference_name = visit.name
    so.custom_base_reference = 'Patient Visit'
    so.custom_base_reference_name = visit.name
    so.transaction_date = billing_date
    so.delivery_date = billing_date
    so.ignore_pricing_rule = 1
    so.append(
        'items',
        {
            'item_code': item_code,
            'item_name': item_code,
            'description': _('Daily auto visit charge: {0}').format(visit_label),
            'qty': 1,
            'rate': amount,
            'price_list_rate': amount,
        },
    )

    cc = (cost_center or visit.cost_center or '').strip() or None
    apply_cost_center_to_sales_order(so, cc)
    so.insert(ignore_permissions=True)
    so.flags.ignore_permissions = True
    so.submit()
    return {'sales_order': so.name, 'existing': False}


def _get_daily_auto_visit_name(patient, visit_date):
    return frappe.db.get_value(
        'Patient Visit',
        {
            'patient': patient,
            'encounter_date': visit_date,
            'visit_type': DAILY_AUTO_VISIT_TYPE,
        },
        'name',
    )


def _ensure_daily_auto_visit_billing(setup, visit_name, visit_date):
    if visit_type_no_charges(DAILY_AUTO_VISIT_TYPE):
        return
    cost_center = _resolve_setup_cost_center(setup)
    amount = _setup_total_amount(setup)
    if amount > 0:
        add_op_charge_to_patient_visit(visit_name, amount, visit_date)
        item_code = get_or_create_daily_session_charge_item()
        if not _existing_visit_charge_sales_order(visit_name, item_code):
            create_daily_auto_visit_sales_order(
                visit_name,
                amount,
                charge_date=visit_date,
                cost_center=cost_center,
            )
    else:
        maybe_create_patient_visit_charge_sales_order(
            visit_name,
            visit_type=DAILY_AUTO_VISIT_TYPE,
            cost_center=cost_center,
        )


def _create_daily_auto_visit_for_date(setup, visit_date):
    cost_center = _resolve_setup_cost_center(setup)
    visit_fields = {
        'doctype': 'Patient Visit',
        'patient': _setup_field(setup, 'patient'),
        'case_no': get_next_transaction_number('Patient Visit', fieldname='case_no'),
        'encounter_date': visit_date,
        'encounter_time': _setup_field(setup, 'time') or '00:00:00',
        'visit_type': DAILY_AUTO_VISIT_TYPE,
        'status': 'Open',
    }
    practioner = _setup_field(setup, 'practioner')
    if practioner:
        visit_fields['practitioner'] = practioner
    admission = _setup_field(setup, 'admission')
    if admission and frappe.db.exists('Inpatient Admission', admission):
        visit_fields['inpatient_record'] = admission
    if cost_center:
        visit_fields['cost_center'] = cost_center

    visit = frappe.get_doc(visit_fields)
    visit.insert(ignore_permissions=True)

    if visit_type_no_charges(DAILY_AUTO_VISIT_TYPE):
        return visit.name

    amount = _setup_total_amount(setup)
    if amount > 0:
        add_op_charge_to_patient_visit(visit.name, amount, visit_date)
        create_daily_auto_visit_sales_order(
            visit.name,
            amount,
            charge_date=visit_date,
            cost_center=cost_center,
        )
    else:
        maybe_create_patient_visit_charge_sales_order(
            visit.name,
            visit_type=DAILY_AUTO_VISIT_TYPE,
            cost_center=cost_center,
        )

    return visit.name


@frappe.whitelist()
def process_daily_patient_visits():
	"""
	Scheduler function that runs daily to create patient visits
	for active daily visit setups. Backfills any missing dates in the setup range.
	"""
	current_date = today()
	setups = frappe.get_all(
		'Daily Patient Visit Setup',
		filters={
			'is_active': 1,
			'from_date': ('<=', current_date),
		},
		or_filters=[
			['to_date', 'is', 'not set'],
			['to_date', '>=', current_date],
		],
		fields=[
			'name',
			'patient',
			'practioner',
			'admission',
			'from_date',
			'to_date',
			'time',
			'branch',
		]
	)
	services_map = _services_for_setup_names([row.get("name") for row in setups if row.get("name")])
	for setup in setups:
		try:
			if not setup.patient:
				continue
			setup["services"] = services_map.get(setup.name, [])
			setup["amount"] = sum(flt(line.get("amount")) for line in setup["services"])

			visit_dates = _visit_dates_for_setup(setup, current_date)
			_process_setup_visit_dates(setup, visit_dates)
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			frappe.log_error(
				title=f"Failed to create daily visit for setup {setup.name}",
				message=frappe.get_traceback(),
			)

	# Deactivate setups where to_date < current_date
	expired_setups = frappe.get_all(
		'Daily Patient Visit Setup',
		filters={
			'is_active': 1,
			'to_date': ('<', current_date)
		},
		fields=['name']
	)

	for expired in expired_setups:
		try:
			doc = frappe.get_doc('Daily Patient Visit Setup', expired.name)
			doc.is_active = 0
			doc.save()
			frappe.db.commit()
		except Exception as e:
			frappe.log_error(f"Failed to deactivate setup {expired.name}: {str(e)}", "Daily Patient Visit")


@frappe.whitelist()
def run_daily_patient_visits_backfill(from_date, to_date, setup_name=None, include_stopped=0):
	"""Manually create Daily Auto Visits + sales orders for a date range (missed / catch-up)."""
	if not from_date or not to_date:
		frappe.throw(_("From Date and To Date are required"))

	range_from = getdate(from_date)
	range_to = getdate(to_date)
	if range_to < range_from:
		frappe.throw(_("To Date cannot be before From Date"))
	if range_from > getdate(today()):
		frappe.throw(_("From Date cannot be in the future"))
	if range_to > getdate(today()):
		range_to = getdate(today())

	filters: dict = {
		"from_date": ("<=", range_to),
	}
	or_filters = None
	if setup_name:
		filters = {"name": setup_name}
	else:
		if not frappe.utils.cint(include_stopped):
			filters["is_active"] = 1
		or_filters = [
			["to_date", "is", "not set"],
			["to_date", ">=", range_from],
		]

	setups = frappe.get_all(
		"Daily Patient Visit Setup",
		filters=filters,
		or_filters=or_filters,
		fields=[
			"name",
			"patient",
			"patient_name",
			"practioner",
			"admission",
			"from_date",
			"to_date",
			"time",
			"branch",
			"is_active",
		],
	)

	if setup_name and not setups:
		frappe.throw(_("Daily Patient Visit Setup {0} not found or does not overlap this date range").format(setup_name))

	services_map = _services_for_setup_names([row.name for row in setups])
	created = skipped_existing = billed_existing = errors = 0
	setups_processed = 0
	setups_skipped = 0

	for setup in setups:
		if not setup.patient:
			setups_skipped += 1
			continue
		setup["services"] = services_map.get(setup.name, [])
		setup["amount"] = sum(flt(line.get("amount")) for line in setup["services"])
		visit_dates = _visit_dates_in_range(setup, range_from, range_to)
		if not visit_dates:
			setups_skipped += 1
			continue
		try:
			result = _process_setup_visit_dates(setup, visit_dates)
			created += result["created"]
			skipped_existing += result["skipped_existing"]
			billed_existing += result["billed_existing"]
			errors += result["errors"]
			setups_processed += 1
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			errors += 1
			frappe.log_error(
				title=f"Daily auto visit backfill failed: {setup.name}",
				message=frappe.get_traceback(),
			)

	return {
		"ok": True,
		"from_date": str(range_from),
		"to_date": str(range_to),
		"setups_matched": len(setups),
		"setups_processed": setups_processed,
		"setups_skipped": setups_skipped,
		"visits_created": created,
		"visits_already_existed": skipped_existing,
		"existing_billed": billed_existing,
		"errors": errors,
	}
