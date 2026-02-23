# -*- coding: utf-8 -*-
# Copyright (c) 2020, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _


@frappe.whitelist()
def get_encounter_diagnosis_symptoms(parent_doctype, parent_name):
	"""Get current diagnosis and symptoms/chief complaint for a Patient Visit or Inpatient Admission."""
	if parent_doctype not in ("Patient Visit", "Inpatient Admission"):
		frappe.throw(_("Parent must be Patient Visit or Inpatient Admission"))
	if not parent_name:
		return {"diagnosis": [], "symptoms": []}

	doc = frappe.get_doc(parent_doctype, parent_name)

	# Patient Visit has 'diagnosis' and 'symptoms'; Inpatient Admission has 'diagnosis' and 'chief_complaint'
	diagnosis = []
	if doc.get("diagnosis"):
		for row in doc.diagnosis:
			diagnosis.append({"name": row.diagnosis, "label": row.diagnosis or row.name})

	symptoms = []
	symptom_field = "symptoms" if parent_doctype == "Patient Visit" else "chief_complaint"
	if doc.get(symptom_field):
		for row in doc.get(symptom_field):
			complaint = getattr(row, "complaint", None) or row.name
			symptoms.append({"name": complaint, "label": complaint})

	return {"diagnosis": diagnosis, "symptoms": symptoms}


@frappe.whitelist()
def update_encounter_diagnosis_symptoms(parent_doctype, parent_name, diagnosis=None, symptoms=None):
	"""Update diagnosis and symptoms/chief complaint on a Patient Visit or Inpatient Admission."""
	if parent_doctype not in ("Patient Visit", "Inpatient Admission"):
		frappe.throw(_("Parent must be Patient Visit or Inpatient Admission"))
	if not parent_name:
		frappe.throw(_("Parent name is required"))

	doc = frappe.get_doc(parent_doctype, parent_name)

	# Clear and set diagnosis (both doctypes use field "diagnosis", child table Patient Encounter Diagnosis)
	doc.diagnosis = []
	if diagnosis:
		if isinstance(diagnosis, str):
			import json
			diagnosis = json.loads(diagnosis)
		for d in diagnosis:
			name = d if isinstance(d, str) else d.get("name") or d.get("diagnosis")
			if name:
				doc.append("diagnosis", {"diagnosis": name})

	# Clear and set symptoms (Patient Visit: "symptoms", Inpatient Admission: "chief_complaint")
	symptom_field = "symptoms" if parent_doctype == "Patient Visit" else "chief_complaint"
	doc.set(symptom_field, [])
	if symptoms:
		if isinstance(symptoms, str):
			import json
			symptoms = json.loads(symptoms)
		for s in symptoms:
			name = s if isinstance(s, str) else s.get("name") or s.get("complaint")
			if name:
				doc.append(symptom_field, {"complaint": name})

	doc.save(ignore_permissions=True)
	return {"ok": True}
