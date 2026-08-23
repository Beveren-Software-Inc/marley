import frappe
from frappe.model.document import Document
from frappe.utils import cint, get_datetime, getdate, now_datetime


class PatientSafetyEvent(Document):
	def before_insert(self):
		if not self.reported_by and not cint(self.is_anonymous):
			self.reported_by = frappe.session.user
		if cint(self.is_anonymous):
			self.reported_by = None

	def validate(self):
		self._sync_event_datetime()
		self._sync_event_type_label()
		self._compute_risk()
		if cint(self.is_anonymous):
			self.reporter_first_name = None
			self.reporter_middle_name = None
			self.reporter_last_name = None
			self.reporter_mobile = None
			self.reporter_email = None
			self.reporter_position = None
			self.reported_by = None

	def _sync_event_datetime(self):
		if self.event_discovery_date:
			time_part = self.event_discovery_time or "00:00:00"
			try:
				self.event_datetime = get_datetime(f"{getdate(self.event_discovery_date)} {time_part}")
			except Exception:
				self.event_datetime = now_datetime()
		elif not self.event_datetime:
			self.event_datetime = now_datetime()

	def _classification_label(self) -> str:
		if self.event_category == "Clinical":
			label = self.clinical_event_type or "Clinical"
			if self.clinical_event_type == "Other" and self.other_event_specify:
				label = f"Clinical — {self.other_event_specify}"
			return label
		if self.event_category == "Non Clinical":
			label = self.non_clinical_event_type or "Non Clinical"
			if self.non_clinical_event_type == "Other" and self.other_event_specify:
				label = f"Non Clinical — {self.other_event_specify}"
			return label
		if self.event_category == "Sentinel Events":
			return self.sentinel_event_type or "Sentinel Event"
		if self.event_category == "Other":
			return (self.other_event_specify or "").strip() or "Other"
		return self.report_type or "Patient Safety Event"

	def _sync_event_type_label(self):
		"""Ensure a Patient Safety Event Type row exists for list/filter (legacy link)."""
		label = (self._classification_label() or "").strip()
		if not label:
			return
		# Prefer matching existing type; create if missing so Link stays valid.
		if frappe.db.exists("Patient Safety Event Type", label):
			self.event_type = label
			return
		# Truncate to reasonable Data length for naming
		safe_name = label[:140]
		if not frappe.db.exists("Patient Safety Event Type", safe_name):
			doc = frappe.get_doc(
				{
					"doctype": "Patient Safety Event Type",
					"event_type": safe_name,
				}
			)
			doc.insert(ignore_permissions=True)
		self.event_type = safe_name

	def _compute_risk(self):
		prob = cint(self.risk_probability)
		impact = cint(self.risk_impact)
		if not prob or not impact:
			self.risk_score = None
			self.risk_rate = None
			return
		score = prob * impact
		self.risk_score = score
		if score <= 8:
			self.risk_rate = "Low Risk"
		elif score <= 15:
			self.risk_rate = "Medium Risk"
		else:
			self.risk_rate = "High Risk"
