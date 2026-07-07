# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt
import frappe
from frappe import _
from frappe.utils import cint

# Patient History page: invoice / billing figures only for these roles
PATIENT_HISTORY_BILLING_ROLES = frozenset(
	{
		"Healthcare Administrator",
		"Administrator",
		"System Manager",
		"Receptionist",
	}
)


def user_can_view_patient_history_billing() -> bool:
	return bool(PATIENT_HISTORY_BILLING_ROLES & set(frappe.get_roles(frappe.session.user)))


# Portal/API: paging through every Patient without a search term is restricted to this role (GDPR-style minimisation).
DATA_OFFICER_ROLE = "Data Officer"


def user_can_browse_full_patient_directory() -> bool:
	return DATA_OFFICER_ROLE in frappe.get_roles(frappe.session.user)


@frappe.whitelist()
def search_patients(search=None, limit=20):
	"""Search patients by name, patient ID, file number, or CPR/ID number."""
	search = (search or "").strip()
	if not search:
		return []
	
	# Convert limit to integer (it comes as string from URL params)
	limit = int(limit) if limit else 20
	
	patients = frappe.db.sql("""
		SELECT 
			p.name,
			p.patient_name,
			p.file_no as file_number,
			p.mobile,
			p.email,
			p.sex,
			p.id_number,
			p.category
		FROM `tabPatient` p
		WHERE 
			p.patient_name LIKE %(search)s
			OR p.name LIKE %(search)s
			OR p.file_no LIKE %(search)s
			OR p.id_number LIKE %(search)s
		ORDER BY p.patient_name
		LIMIT %(limit)s
	""", {
		'search': f'%{search}%',
		'limit': limit
	}, as_dict=True)
	
	return [{'name': p.name, 'patient_name': p.patient_name or p.name, 'file_number': p.file_number, 'mobile': p.mobile, 'email': p.email, 'sex': p.sex, 'id_number': p.id_number, 'category': p.category} for p in patients]


@frappe.whitelist()
def get_patient_display_name(patient: str | None = None) -> dict:
	"""Display name for portal patient search bar (clinical roles often lack REST read on Patient)."""
	patient = (patient or "").strip()
	if not patient:
		return {"name": "", "patient_name": "", "file_number": ""}
	if not frappe.db.exists("Patient", patient):
		return {"name": patient, "patient_name": patient, "file_number": ""}
	row = frappe.db.get_value("Patient", patient, ["patient_name", "file_no"], as_dict=True) or {}
	patient_name = row.get("patient_name") or patient
	file_number = row.get("file_no") or patient
	return {"name": patient, "patient_name": patient_name, "file_number": file_number}


@frappe.whitelist()
def get_patients(limit=20, offset=0, search=None):
	"""Get list of patients with server-side pagination."""
	limit = int(limit) if limit else 20
	offset = int(offset) if offset else 0

	search = (search or "").strip()
	search = search if search else None

	if search:
		search_param = f'%{search}%'
		where_clause = """
			WHERE p.patient_name LIKE %(search)s
				OR p.name LIKE %(search)s
				OR p.file_no LIKE %(search)s
				OR p.id_number LIKE %(search)s
				OR p.mobile LIKE %(search)s
		"""

		total_count = frappe.db.sql(
			f"SELECT COUNT(*) as cnt FROM `tabPatient` p {where_clause}",
			{'search': search_param},
			as_dict=True,
		)[0].cnt

		patients = frappe.db.sql(
			f"""SELECT p.name, p.patient_name, p.file_no as file_number,
				p.mobile, p.email, p.sex, p.id_number, p.category
			FROM `tabPatient` p {where_clause}
			ORDER BY p.patient_name
			LIMIT %(limit)s OFFSET %(offset)s""",
			{'search': search_param, 'limit': limit, 'offset': offset},
			as_dict=True,
		)

		data = [
			{'name': p.name, 'patient_name': p.patient_name or p.name,
			 'file_number': p.file_number, 'mobile': p.mobile, 'email': p.email,
			 'sex': p.sex, 'id_number': p.id_number, 'category': p.category}
			for p in patients
		]
		return {"data": data, "total_count": total_count}
	else:
		if not user_can_browse_full_patient_directory():
			return {"data": [], "total_count": 0, "full_directory_restricted": True}

		total_count = frappe.db.count('Patient')

		patients = frappe.get_all(
			'Patient',
			fields=['name', 'patient_name', 'file_no', 'mobile', 'email', 'sex', 'id_number', 'category'],
			limit=limit,
			limit_start=offset,
			order_by='patient_name',
		)
		patient_names = [p.name for p in patients]

		appointment_map = get_latest_appointment_status(patient_names)
		inpatient_map = get_latest_inpatient_status(patient_names)

		data = [
			{'name': p.name, 'patient_name': p.patient_name or p.name,
			 'file_number': p.file_no, 'mobile': p.mobile, 'email': p.email,
			 'sex': p.sex, 'id_number': p.id_number, 'category': p.category,
			 'appointment_status': appointment_map.get(p.name),
			 'inpatient_status': inpatient_map.get(p.name)}
			for p in patients
		]
		return {"data": data, "total_count": total_count}

def get_latest_appointment_status(patient_names: list[str]) -> dict:
	"""Return latest appointment status per patient"""
	if not patient_names:
		return {}

	data = frappe.db.sql("""
		SELECT pa.patient, pa.status
		FROM `tabPatient Appointment` pa
		INNER JOIN (
			SELECT patient, MAX(creation) AS max_creation
			FROM `tabPatient Appointment`
			WHERE patient IN %(patients)s
			GROUP BY patient
		) latest
		ON latest.patient = pa.patient AND latest.max_creation = pa.creation
	""", {"patients": patient_names}, as_dict=True)

	return {d.patient: d.status for d in data}

def get_latest_inpatient_status(patient_names: list[str]) -> dict:
	"""Return latest inpatient admission status per patient"""
	if not patient_names:
		return {}

	data = frappe.db.sql("""
		SELECT ip.patient, ip.status
		FROM `tabInpatient Admission` ip
		INNER JOIN (
			SELECT patient, MAX(creation) AS max_creation
			FROM `tabInpatient Admission`
			WHERE patient IN %(patients)s
			GROUP BY patient
		) latest
		ON latest.patient = ip.patient AND latest.max_creation = ip.creation
	""", {"patients": patient_names}, as_dict=True)

	return {d.patient: d.status for d in data}

@frappe.whitelist()
def check_patient_duplicate(patient_name=None, mobile=None, phone=None, category=None):
	"""Portal: check before create (full name + mobile; category is ignored)."""
	from healthcare.healthcare.doctype.patient.patient_duplicate import find_duplicate_patient

	dup = find_duplicate_patient(patient_name, mobile=mobile, phone=phone)
	if not dup:
		return {"duplicate": False}
	return {
		"duplicate": True,
		"patient": {
			"name": dup.get("name"),
			"patient_name": dup.get("patient_name"),
			"file_no": dup.get("file_no") or dup.get("name"),
		},
	}


ALL_CUSTOMER_GROUP_NAMES = frozenset({"All Customer Groups", "All Customer Group"})


def _is_group_customer_group(name):
	if not name:
		return True
	if name in ALL_CUSTOMER_GROUP_NAMES:
		return True
	return cint(frappe.db.get_value("Customer Group", name, "is_group"))


def _ensure_patient_customer_group_exists():
	from healthcare.healthcare.doctype.patient.patient import ensure_patient_customer_group_exists

	ensure_patient_customer_group_exists()


def _serialize_patient_for_portal(patient_doc):
	relations = []
	for row in patient_doc.get("patient_relation") or []:
		relations.append(
			{
				"full_name": row.get("full_name"),
				"relation": row.get("relation"),
				"mobile_no": row.get("mobile_no"),
				"email": row.get("email"),
				"description": row.get("description"),
				"is_next_of_kin": cint(row.get("is_next_of_kin")),
			}
		)

	documents = []
	for row in patient_doc.get("patient_document") or []:
		documents.append(
			{
				"name": row.get("name"),
				"file_name": row.get("document_name") or row.get("file_name"),
				"document_type": row.get("document_type"),
				"transaction_no": row.get("transaction_no"),
				"upload_remarks": row.get("upload_remarks"),
				"document": row.get("document"),
			}
		)

	return {
		"name": patient_doc.name,
		"patient_name": patient_doc.patient_name,
		"file_no": getattr(patient_doc, "file_no", None) or patient_doc.name,
		"first_name": getattr(patient_doc, "first_name", None),
		"middle_name": getattr(patient_doc, "middle_name", None),
		"last_name": getattr(patient_doc, "last_name", None),
		"title": getattr(patient_doc, "title", None),
		"sex": getattr(patient_doc, "sex", None),
		"dob": getattr(patient_doc, "dob", None),
		"blood_group": getattr(patient_doc, "blood_group", None),
		"mobile": getattr(patient_doc, "mobile", None),
		"phone": getattr(patient_doc, "phone", None),
		"email": getattr(patient_doc, "email", None),
		"id_number": getattr(patient_doc, "id_number", None),
		"nationality": getattr(patient_doc, "nationality", None),
		"category": getattr(patient_doc, "category", None),
		"source": getattr(patient_doc, "source", None),
		"marital_status": getattr(patient_doc, "marital_status", None),
		"is_black_list": cint(getattr(patient_doc, "is_black_list", 0)),
		"remarks": getattr(patient_doc, "patient_details", None),
		"address": getattr(patient_doc, "address", None),
		"city": getattr(patient_doc, "city", None),
		"country": getattr(patient_doc, "country", None),
		"alternative_mobile_no_1": getattr(patient_doc, "alter_mobile_no", None),
		"alternative_mobile_no_2": getattr(patient_doc, "alter_2_mobile_no", None),
		"job_title": getattr(patient_doc, "job_title", None),
		"job_company": getattr(patient_doc, "job_company", None),
		"has_insurance": cint(getattr(patient_doc, "is_insurance", 0)),
		"insurance": getattr(patient_doc, "insurance", None),
		"insurance_type": getattr(patient_doc, "insurance_type", None),
		"insurance_company_no": getattr(patient_doc, "insurance_company_no", None),
		"insurance_policy": getattr(patient_doc, "insurance_policy_no", None),
		"ref_no": getattr(patient_doc, "ref_no", None),
		"insurance_register": getattr(patient_doc, "insurance_register", None),
		"patient_relation": relations,
		"patient_document": documents,
	}


@frappe.whitelist()
def get_patient_doc(patient=None):
	"""Full Patient record for portal edit form (bypasses REST read permission)."""
	patient = (patient or "").strip()
	if not patient or not frappe.db.exists("Patient", patient):
		frappe.throw(_("Patient not found"))
	patient_doc = frappe.get_doc("Patient", patient)
	return _serialize_patient_for_portal(patient_doc)


@frappe.whitelist()
def get_next_patient_file_no():
	"""Generate the next file number for a new Patient record."""
	from healthcare.api.utils.api_utility import get_next_transaction_number
	return get_next_transaction_number('Patient', fieldname='file_no')

@frappe.whitelist()
def create_patient(data):
	"""Create a new Patient"""

	if isinstance(data, str):
		import json
		data = json.loads(data)
	_validate_patient_payload(data)

	from healthcare.healthcare.doctype.patient.patient_duplicate import throw_if_duplicate_patient

	throw_if_duplicate_patient(
		data.get("patient_name") or data.get("first_name"),
		mobile=data.get("mobile"),
		phone=data.get("phone"),
	)

	from healthcare.healthcare.doctype.patient.patient import resolve_patient_customer_group

	category = data.get("category") or None
	customer_group = resolve_patient_customer_group(category)

	patient = frappe.get_doc({
		"doctype": "Patient",
		"customer_group": customer_group,
		"title": data.get("title") or None,
		# "first_name": data.get("first_name"),
		# "middle_name": data.get("middle_name") or "",
		# "last_name": data.get("last_name") or "",
		"patient_name": data.get("patient_name"),
		"file_no": data.get("file_no") or None,
		"sex": data.get("sex"),
		"dob": data.get("dob") or None,
		"blood_group": data.get("blood_group") or None,
		"mobile": data.get("mobile") or None,
		"phone": data.get("phone") or None,
		"email": data.get("email") or None,
		"id_number": data.get("id_number") or None,
		"nationality": data.get("nationality") or None,
		"category": category,
		"source": data.get("source") or None,
		"marital_status": data.get("marital_status") or None,
		"is_black_list": 1 if data.get("is_black_list") else 0,
		"patient_details": data.get("remarks") or None,
		"alter_mobile_no": data.get("alternative_mobile_no_1") or None,
		"alter_2_mobile_no": data.get("alternative_mobile_no_2") or None,
		
		"is_insurance": 1 if data.get("has_insurance") else 0,
		"insurance": data.get("insurance") or None,
		"insurance_policy_no": data.get("insurance_policy") or None,
		"insurance_company_no": data.get("insurance_company_no") or None,
		"insurance_valid_till": data.get("insurance_valid_till") or None,
		"ref_no": data.get("ref_no") or None,
		"insurance_type": data.get("insurance_type") or None,
		"address": (data.get("address_line1") or "").strip() or None,
		"city": (data.get("city") or "").strip() or None,
		"country": (data.get("country") or "").strip() or None,
	})

	patient.insert(ignore_permissions=True)

	_add_patient_relations(patient, data)
	_setup_patient_links(patient, data)
	_add_patient_documents(patient, data)

	result = {
		"name": patient.name,
		"patient_name": patient.patient_name,
		"file_no": patient.file_no or patient.name,
	}
	charge_file_no = data.get("charge_file_no")
	if charge_file_no is None:
		charge_file_no = 1
	if frappe.utils.cint(charge_file_no):
		try:
			from healthcare.api.patient_file_no_charge import create_patient_file_no_sales_order

			so_info = create_patient_file_no_sales_order(patient.name)
			result["sales_order"] = so_info.get("sales_order")
			result["file_no_charge_rate"] = so_info.get("rate")
		except Exception:
			frappe.log_error(frappe.get_traceback(), f"File no charge SO failed for {patient.name}")
			result["file_no_charge_error"] = _("File number charge order could not be created. Patient was saved.")

	return result

def _validate_patient_payload(data):

	if not data.get("first_name"):
		frappe.throw(_("First Name is required"))

	if not data.get("sex"):
		frappe.throw(_("Gender is required"))

	if not data.get("mobile") and not data.get("phone"):
		frappe.throw(_("At least one Contact No. is required"))

	if not data.get("source"):
		frappe.throw(_("Patient Referral or Source is required"))

	if not data.get("category"):
		frappe.throw(_("Patient type is required"))


from frappe.utils import cint
from healthcare.healthcare.editing_lock import assert_editing_allowed

def _parse_child_rows(data, key):
	rows = data.get(key) or []
	if isinstance(rows, str):
		import json
		rows = json.loads(rows) if rows.strip() else []
	return rows if isinstance(rows, list) else []


def _apply_patient_relations(patient, data, *, replace=False):
	if replace:
		patient.set("patient_relation", [])

	for row in _parse_child_rows(data, "patient_relation"):
		if not isinstance(row, dict):
			continue

		relation = (row.get("relation") or "").strip()
		mobile_no = (row.get("mobile_no") or "").strip() or None
		email = (row.get("email") or "").strip() or None
		description = (row.get("description") or "").strip() or None
		full_name = (row.get("full_name") or "").strip() or None
		is_next_of_kin = cint(row.get("is_next_of_kin"))

		if relation or mobile_no or email or full_name or is_next_of_kin:
			patient.append(
				"patient_relation",
				{
					"patient": patient.name,
					"relation": relation,
					"mobile_no": mobile_no,
					"email": email,
					"description": description,
					"full_name": full_name,
					"is_next_of_kin": is_next_of_kin,
				},
			)


def _add_patient_relations(patient, data):
	_apply_patient_relations(patient, data)
	if patient.get("patient_relation"):
		patient.save(ignore_permissions=True)

def _address_city_for_save(city):
	city = (city or "").strip()
	return city or "-"


def _address_city_for_display(city):
	city = (city or "").strip()
	return "" if city in ("-", "—", "N/A") else city


def _get_patient_linked_address_name(patient_name):
	primary = frappe.db.get_value("Patient", patient_name, "patient_primary_address")
	if primary:
		return primary

	rows = frappe.db.sql(
		"""
		SELECT a.name
		FROM `tabAddress` a
		INNER JOIN `tabDynamic Link` dl ON dl.parent = a.name AND dl.parenttype = 'Address'
		WHERE dl.link_doctype = 'Patient' AND dl.link_name = %s
		ORDER BY a.is_primary_address DESC, a.modified DESC
		LIMIT 1
		""",
		patient_name,
	)
	return rows[0][0] if rows else None


def _patient_address_payload(address_name=None, patient_doc=None):
	if address_name and frappe.db.exists("Address", address_name):
		addr = frappe.db.get_value(
			"Address",
			address_name,
			["name", "address_line1", "address_line2", "city", "state", "country", "pincode"],
			as_dict=True,
		)
		if addr:
			addr["city"] = _address_city_for_display(addr.get("city"))
			return addr

	if patient_doc:
		return {
			"name": None,
			"address_line1": patient_doc.get("address") or "",
			"address_line2": "",
			"city": patient_doc.get("city") or "",
			"state": "",
			"country": patient_doc.get("country") or "",
			"pincode": "",
		}

	return {
		"name": None,
		"address_line1": "",
		"address_line2": "",
		"city": "",
		"state": "",
		"country": "",
		"pincode": "",
	}


@frappe.whitelist()
def get_patient_address(patient):
	"""Return address fields for the portal patient edit form."""
	patient = (patient or "").strip()
	if not patient or not frappe.db.exists("Patient", patient):
		frappe.throw(_("Patient not found"))

	patient_doc = frappe.get_doc("Patient", patient)
	address_name = _get_patient_linked_address_name(patient)
	return _patient_address_payload(address_name, patient_doc)


@frappe.whitelist()
def save_patient_address(patient, data):
	"""Create or update a patient's primary address from the portal."""
	if isinstance(data, str):
		import json
		data = json.loads(data)

	patient = (patient or "").strip()
	if not patient or not frappe.db.exists("Patient", patient):
		frappe.throw(_("Patient not found"))

	address_line1 = (data.get("address_line1") or "").strip()
	if not address_line1:
		return {"name": None}

	patient_doc = frappe.get_doc("Patient", patient)
	city = _address_city_for_save(data.get("city"))
	country = (data.get("country") or "").strip()
	if not country:
		country = frappe.db.get_single_value("System Settings", "country")

	address_name = _get_patient_linked_address_name(patient)
	address_fields = {
		"address_line1": address_line1,
		"address_line2": data.get("address_line2"),
		"city": city,
		"state": data.get("state"),
		"country": country,
		"pincode": data.get("pincode"),
	}

	try:
		if address_name and frappe.db.exists("Address", address_name):
			addr = frappe.get_doc("Address", address_name)
			addr.update(address_fields)
			addr.is_primary_address = 1
			addr.save(ignore_permissions=True)
		else:
			addr = frappe.get_doc({
				"doctype": "Address",
				"address_title": patient_doc.patient_name or patient_doc.name,
				"address_type": "Billing",
				"is_primary_address": 1,
				"links": [{"link_doctype": "Patient", "link_name": patient_doc.name}],
				**address_fields,
			})
			addr.insert(ignore_permissions=True)
			address_name = addr.name

		frappe.db.set_value(
			"Patient",
			patient_doc.name,
			{
				"patient_primary_address": address_name,
				"address": address_line1,
				"city": (data.get("city") or "").strip() or None,
				"country": country,
			},
		)
	except Exception:
		frappe.log_error(frappe.get_traceback(), "Save Patient Address")
		frappe.throw(_("Could not save patient address"))

	return {"name": address_name}


def _setup_patient_links(patient, data):

	address_line1 = (data.get("address_line1") or "").strip()

	if address_line1:
		try:
			save_patient_address(patient.name, data)
		except Exception:
			frappe.log_error(frappe.get_traceback(), "Create Patient Address")

	# Customer Auto Link
	if frappe.db.get_single_value(
		"Healthcare Settings", "link_customer_to_patient"
	) and not patient.customer:
		try:
			from healthcare.healthcare.doctype.patient.patient import create_customer
			create_customer(patient)
		except Exception:
			pass

	# Contact
	try:
		patient.set_contact()
	except Exception:
		pass

def _apply_patient_documents(patient, data, *, replace=False):
	if replace:
		patient.set("patient_document", [])

	for row in _parse_child_rows(data, "patient_document") or _parse_child_rows(data, "documents"):
		if not isinstance(row, dict):
			continue

		display_name = (row.get("file_name") or "").strip()
		document_url = (row.get("document") or "").strip() or None
		document_type = (row.get("document_type") or "").strip() or None

		if not display_name and not document_url:
			continue

		if not display_name and document_url:
			display_name = document_url.split("/")[-1]

		patient.append(
			"patient_document",
			{
				"document_name": display_name,
				"file_name": document_type,
				"document_type": document_type,
				"transaction_no": row.get("transaction_no"),
				"upload_remarks": row.get("upload_remarks"),
				"document": document_url,
			},
		)


def _add_patient_documents(patient, data):
	_apply_patient_documents(patient, data)
	if patient.get("patient_document"):
		patient.save(ignore_permissions=True)


def _apply_patient_scalar_fields(patient, data):
	first_name = (data.get("first_name") or "").strip()
	middle_name = (data.get("middle_name") or "").strip()
	last_name = (data.get("last_name") or "").strip()
	patient_name = (data.get("patient_name") or "").strip()
	if not patient_name:
		patient_name = " ".join(part for part in [first_name, middle_name, last_name] if part)

	scalar_map = {
		"title": "title",
		"first_name": "first_name",
		"middle_name": "middle_name",
		"last_name": "last_name",
		"sex": "sex",
		"dob": "dob",
		"blood_group": "blood_group",
		"mobile": "mobile",
		"phone": "phone",
		"email": "email",
		"id_number": "id_number",
		"nationality": "nationality",
		"category": "category",
		"source": "source",
		"marital_status": "marital_status",
		"job_title": "job_title",
		"job_company": "job_company",
		"insurance": "insurance",
		"insurance_type": "insurance_type",
		"insurance_company_no": "insurance_company_no",
		"ref_no": "ref_no",
		"insurance_register": "insurance_register",
	}

	for src, field in scalar_map.items():
		if src in data:
			patient.set(field, data.get(src) or None)

	if first_name or "first_name" in data:
		patient.first_name = first_name or None
	if middle_name or "middle_name" in data:
		patient.middle_name = middle_name or None
	if last_name or "last_name" in data:
		patient.last_name = last_name or None
	if patient_name:
		patient.patient_name = patient_name

	if "file_no" in data and data.get("file_no"):
		patient.file_no = data.get("file_no")

	if "remarks" in data:
		patient.patient_details = data.get("remarks") or None
	if "alternative_mobile_no_1" in data:
		patient.alter_mobile_no = data.get("alternative_mobile_no_1") or None
	if "alternative_mobile_no_2" in data:
		patient.alter_2_mobile_no = data.get("alternative_mobile_no_2") or None
	if "has_insurance" in data:
		patient.is_insurance = 1 if data.get("has_insurance") else 0
	if "insurance_policy" in data:
		patient.insurance_policy_no = data.get("insurance_policy") or None
	if "is_black_list" in data:
		patient.is_black_list = 1 if data.get("is_black_list") else 0

	from healthcare.healthcare.doctype.patient.patient import resolve_patient_customer_group

	if "category" in data or _is_group_customer_group(patient.customer_group):
		patient.customer_group = resolve_patient_customer_group(
			patient.category, patient.customer_group
		)


@frappe.whitelist()
def update_patient(patient, data):
	"""Update Patient from portal (bypasses REST write permission)."""
	assert_editing_allowed()
	if isinstance(data, str):
		import json
		data = json.loads(data)

	patient = (patient or "").strip()
	if not patient or not frappe.db.exists("Patient", patient):
		frappe.throw(_("Patient not found"))

	doc = frappe.get_doc("Patient", patient)
	_apply_patient_scalar_fields(doc, data)

	if "patient_relation" in data:
		_apply_patient_relations(doc, data, replace=True)
	if "patient_document" in data:
		_apply_patient_documents(doc, data, replace=True)

	doc.save(ignore_permissions=True)

	return {
		"name": doc.name,
		"patient_name": doc.patient_name,
		"file_no": getattr(doc, "file_no", None) or doc.name,
	}



@frappe.whitelist()
def get_patient_health_history_templates(search=None):
	"""Return list of Patient Health History Templates for dropdown (name + label)."""
	filters = {}
	if search:
		filters["template_name"] = ["like", f"%{search}%"]
	templates = frappe.get_all(
		"Patient Health History Template",
		filters=filters,
		fields=["name", "template_name"],
		limit=50,
		order_by="template_name",
	)
	return [{"name": t.name, "label": t.template_name or t.name} for t in templates]


@frappe.whitelist()
def get_patient_health_history_template_details(template_name: str):
	"""Return template doc with patient_history_details for creating PMH from template."""
	if not template_name:
		frappe.throw(_("Template is required"))
	doc = frappe.get_doc("Patient Health History Template", template_name)
	details = []
	for row in doc.patient_history_details or []:
		details.append({
			"attributes": row.attributes,
			"description": row.description or "",
			"yesno": row.yesno or "",
		})
	return {
		"name": doc.name,
		"template_name": doc.template_name,
		"patient_history_details": details,
	}


def _serialize_patient_medical_history(doc):
	"""Serialize Patient Medical History for portal APIs."""
	return {
		"name": doc.name,
		"patient": doc.patient,
		"patient_name": getattr(doc, "patient_name", None),
		"template": doc.get("template"),
		"inpatient_admission": doc.get("inpatient_admission"),
		"status": doc.get("status") or "Active",
		"creation": str(doc.creation) if doc.creation else None,
		"heart_disease": doc.get("heart_disease") or "",
		"diabetes": doc.get("diabetes") or "",
		"asthma": doc.get("asthma") or "",
		"strokes": doc.get("strokes") or "",
		"other_ongoing_illness": doc.get("other_ongoing_illness") or "",
		"previous_surgical_history": doc.get("previous_surgical_history") or "",
		"current_and_past_medications": doc.get("current_and_past_medications") or "",
		"no_known_allergies": cint(doc.get("no_known_allergies")),
		"allergies": doc.get("allergies") or "",
		"patient_visit": doc.get("patient_visit"),
		"social_history": doc.get("social_history") or "",
		"addiction": cint(doc.get("addiction")),
		"smoking": cint(doc.get("smoking")),
		"patient_history_details": [
			{
				"attributes": row.attributes,
				"description": row.description,
				"yesno": row.yesno,
			}
			for row in (doc.patient_history_details or [])
		],
	}


def _patient_medical_history_summary(doc) -> str:
	"""Short label for list views (no template name)."""
	parts = []
	for label, field in (
		("Heart", "heart_disease"),
		("Diabetes", "diabetes"),
		("Asthma", "asthma"),
		("Strokes", "strokes"),
	):
		val = doc.get(field) if isinstance(doc, dict) else getattr(doc, field, None)
		if val == "Yes":
			parts.append(label)
	if cint(
		doc.get("no_known_allergies") if isinstance(doc, dict) else getattr(doc, "no_known_allergies", 0)
	):
		parts.append("NKDA")
	elif doc.get("allergies") if isinstance(doc, dict) else getattr(doc, "allergies", None):
		parts.append("Allergies")
	if cint(doc.get("addiction") if isinstance(doc, dict) else getattr(doc, "addiction", 0)):
		parts.append("Addiction")
	if cint(doc.get("smoking") if isinstance(doc, dict) else getattr(doc, "smoking", 0)):
		parts.append("Smoking")
	return ", ".join(parts) if parts else "Past medical history"


@frappe.whitelist()
def get_patient_medical_histories(patient):
	"""Return list of all Patient Medical History records for a patient."""
	if not patient:
		return []
	records = frappe.get_all(
		"Patient Medical History",
		filters={"patient": patient},
		fields=[
			"name",
			"patient",
			"patient_name",
			"template",
			"inpatient_admission",
			"status",
			"creation",
			"heart_disease",
			"diabetes",
			"asthma",
			"strokes",
			"allergies",
			"addiction",
			"smoking",
		],
		order_by="creation desc",
	)
	for row in records:
		row["summary"] = _patient_medical_history_summary(row)
	return records


@frappe.whitelist()
def get_patient_medical_history_detail(name):
	"""Return full Patient Medical History document with details rows."""
	if not name:
		frappe.throw(_("Name is required"))
	doc = frappe.get_doc("Patient Medical History", name)
	payload = _serialize_patient_medical_history(doc)
	payload["summary"] = _patient_medical_history_summary(doc)
	return payload


@frappe.whitelist()
def get_patient_medical_history(patient: str):
	"""Return latest Patient Medical History for a patient."""
	if not patient:
		frappe.throw(_("Patient is required"))

	records = frappe.get_all(
		"Patient Medical History",
		filters={"patient": patient},
		fields=["name"],
		order_by="creation desc",
		limit_page_length=1,
	)

	if not records:
		patient_doc = frappe.get_doc("Patient", patient)
		return {
			"name": None,
			"patient": patient_doc.name,
			"patient_name": patient_doc.patient_name,
			"template": None,
			"inpatient_admission": None,
			"creation": None,
			"heart_disease": "",
			"diabetes": "",
			"asthma": "",
			"strokes": "",
			"other_ongoing_illness": "",
			"previous_surgical_history": "",
			"current_and_past_medications": "",
			"no_known_allergies": 0,
			"allergies": "",
			"patient_visit": None,
			"social_history": "",
			"addiction": 0,
			"smoking": 0,
			"patient_history_details": [],
			"summary": "",
		}

	doc = frappe.get_doc("Patient Medical History", records[0].name)
	payload = _serialize_patient_medical_history(doc)
	payload["summary"] = _patient_medical_history_summary(doc)
	return payload


@frappe.whitelist()
def get_patient_summary(patient):
	"""Get basic patient demographic information for header cards"""
	if not patient:
		frappe.throw(_("Patient is required"))

	patient_doc = frappe.get_doc('Patient', patient)

	# Try to get blacklist info from the latest Patient Visit
	is_blacklist = 0
	last_visit = frappe.db.get_value(
		'Patient Visit',
		{'patient': patient},
		['is_blacklist'],
		as_dict=True,
		order_by='creation desc'
	)
	if last_visit and 'is_blacklist' in last_visit:
		is_blacklist = last_visit.get('is_blacklist') or 0

	id_number = getattr(patient_doc, "id_number", None) or getattr(patient_doc, "national_id", None)

	data = {
		'name': patient_doc.name,
		'patient_name': patient_doc.patient_name,
		'file_no': getattr(patient_doc, 'file_no', None) or patient_doc.name,
		'id_number': id_number,
		'dob': getattr(patient_doc, 'dob', None),
		'sex': getattr(patient_doc, 'sex', None),
		'marital_status': getattr(patient_doc, 'marital_status', None),
		'mobile': getattr(patient_doc, 'mobile', None),
		'category': getattr(patient_doc, 'category', None),
		'is_blacklist': is_blacklist,
		"remarks": getattr(patient_doc, 'patient_details', None),
	}

	# Include patient_document child table (Patient Upload Document) for demographics / history
	try:
		documents = []
		for row in (patient_doc.get("patient_document") or []):
			documents.append({
				"name": getattr(row, "name", None),
				"document_name": getattr(row, "document_name", None),
				"file_name": getattr(row, "file_name", None),
				"document_type": getattr(row, "document_type", None),
				"transaction_no": getattr(row, "transaction_no", None),
				"upload_remarks": getattr(row, "upload_remarks", None),
				"document": getattr(row, "document", None),
			})
		data["documents"] = documents
	except Exception:
		data["documents"] = []

	return data


@frappe.whitelist()
def get_patient_history_summary(patient):
	"""Get counts and invoice summary for Patient History page: visits, admissions, paid totals, unbilled, amount to pay."""
	if not patient:
		frappe.throw(_("Patient is required"))

	# Visit count (excluding cancelled)
	visit_count = frappe.db.count(
		"Patient Visit",
		filters={"patient": patient, "docstatus": ["!=", 2]}
	)

	# Admission count (all statuses)
	admission_count = frappe.db.count(
		"Inpatient Admission",
		filters={"patient": patient}
	)

	billing_allowed = user_can_view_patient_history_billing()

	# Invoice / unbilled stats (only for authorised roles — not computed otherwise)
	paid_invoice_count = 0
	paid_invoice_total = 0.0
	amount_to_pay = 0.0
	unbilled_count = 0

	if billing_allowed:
		try:
			if "patient" in (frappe.db.get_table_columns("Sales Invoice") or []):
				invoices = frappe.get_all(
					"Sales Invoice",
					filters={"patient": patient, "docstatus": 1},
					fields=["name", "grand_total", "outstanding_amount"]
				)
				paid_invoice_count = len(invoices)
				paid_invoice_total = sum((float(inv.grand_total or 0) for inv in invoices))
				amount_to_pay = sum((float(inv.outstanding_amount or 0) for inv in invoices))
		except Exception:
			pass

		try:
			pv_columns = frappe.db.get_table_columns("Patient Visit") or []
			if "invoice_created" in pv_columns:
				unbilled_count = frappe.db.count(
					"Patient Visit",
					filters={"patient": patient, "docstatus": 1, "invoice_created": 0}
				)
			elif "invoiced" in pv_columns:
				unbilled_count = frappe.db.count(
					"Patient Visit",
					filters={"patient": patient, "docstatus": 1, "invoiced": 0}
				)
		except Exception:
			pass

	out = {
		"visit_count": cint(visit_count),
		"admission_count": cint(admission_count),
		"billing_summary_allowed": billing_allowed,
	}
	if billing_allowed:
		out.update(
			{
				"paid_invoice_count": cint(paid_invoice_count),
				"paid_invoice_total": float(paid_invoice_total),
				"unbilled_count": cint(unbilled_count),
				"amount_to_pay": float(amount_to_pay),
			}
		)
	return out
