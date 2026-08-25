import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_fullname, now_datetime


def _primary_role(user=None):
	user = user or frappe.session.user
	roles = frappe.get_roles(user)
	for role in ("Receptionist", "Doctor", "Physician", "Nurse", "Healthcare Administrator", "System Manager"):
		if role in roles:
			return role
	return roles[0] if roles else ""


class ReportRequest(Document):
	def before_insert(self):
		user = frappe.session.user
		if not self.requester:
			self.requester = user
		if not self.requester_name:
			self.requester_name = get_fullname(user) or user
		if not self.requester_role:
			self.requester_role = _primary_role(user)
		if not self.status:
			self.status = "Pending"
		if not self.request_date:
			self.request_date = frappe.utils.today()
		self._fill_patient_fields()
		if not self.get("audit_trail"):
			user = frappe.session.user
			self.append(
				"audit_trail",
				{
					"action": "Created",
					"user": user,
					"user_full_name": get_fullname(user) or user,
					"action_on": now_datetime(),
					"details": "Report request created",
				},
			)

	def validate(self):
		self._fill_patient_fields()
		if self.status == "Rejected" and not (self.reject_reason or "").strip():
			frappe.throw(_("Reject reason is required."))

	def _fill_patient_fields(self):
		if not self.patient:
			return
		patient = frappe.db.get_value(
			"Patient",
			self.patient,
			["patient_name", "file_no", "uid", "id_number"],
			as_dict=True,
		)
		if not patient:
			return
		self.patient_name = patient.patient_name or self.patient_name
		self.file_no = patient.file_no or self.file_no
		self.id_number = patient.uid or patient.id_number or self.id_number

	def add_audit(self, action, details=None):
		user = frappe.session.user
		self.append(
			"audit_trail",
			{
				"action": action,
				"user": user,
				"user_full_name": get_fullname(user) or user,
				"action_on": now_datetime(),
				"details": details,
			},
		)
		if self.name:
			self.db_update()
			for row in self.get("audit_trail") or []:
				if row.is_new():
					row.db_insert()
