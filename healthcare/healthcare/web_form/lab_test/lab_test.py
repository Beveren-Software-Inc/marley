import frappe


def get_context(context):
	context.read_only = 1


def get_list_context(context):
	context.row_template = "erpnext/templates/includes/healthcare/lab_test_row_template.html"
	context.get_list = get_lab_test_list


def get_lab_test_list(
	doctype, txt, filters, limit_start, limit_page_length=20, order_by="modified desc"
):
	patient = get_patient()
	lab_tests = frappe.db.sql(
		"""select * from `tabLab Test`
		where patient = %s order by result_date""",
		patient,
		as_dict=True,
	)
	return lab_tests


def get_patient():
	return frappe.get_value("Patient", {"email": frappe.session.user}, "name")


_LAB_PRINT_STAFF_ROLES = (
	"Laboratory User",
	"Lab Technologist",
	"Lab Technician",
	"LabTest Approver",
	"Physician",
	"Nurse",
	"Healthcare Administrator",
	"System Manager",
	"Administrator",
)

_LAB_TECH_MEDICAL_ROLES = ("Lab Technologist", "Lab Technician")


def _user_is_lab_print_staff(user: str) -> bool:
	"""True when the user may print Lab Tests from portal/printview (not only the patient)."""
	if not user or user == "Guest":
		return False
	roles = set(frappe.get_roles(user))
	if roles.intersection(_LAB_PRINT_STAFF_ROLES):
		return True
	# Medical Role on Healthcare Practitioner (Lab Technologist / Lab Technician).
	try:
		practitioners = frappe.get_all(
			"Healthcare Practitioner",
			filters={"user_id": user, "status": "Active"},
			fields=["name", "medical_role"],
			limit=5,
		)
	except Exception:
		return False
	for p in practitioners or []:
		role = (p.get("medical_role") or "").strip()
		if role in _LAB_TECH_MEDICAL_ROLES:
			return True
	return False


def has_website_permission(doc, ptype, user, verbose=False):
	"""Used by /printview when DocType print/read permission alone is not enough.

	Patients may view/print their own Lab Tests.
	Lab staff (Laboratory User / Lab Technologist / etc.) may print from the portal UI.
	Without this, desk print can work while portal /printview shows Not Permitted.
	"""
	if user and doc.patient and doc.patient == get_patient():
		return True
	if _user_is_lab_print_staff(user or frappe.session.user):
		return True
	return False
