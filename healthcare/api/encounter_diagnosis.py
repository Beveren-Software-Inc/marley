# -*- coding: utf-8 -*-
# Copyright (c) 2020, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from healthcare.healthcare.editing_lock import assert_editing_allowed


@frappe.whitelist()
def get_encounter_diagnosis_symptoms(parent_doctype, parent_name):
	"""Get current diagnosis and symptoms/chief complaint for a Patient Visit or Inpatient Admission."""
	if parent_doctype not in ("Patient Visit", "Inpatient Admission"):
		frappe.throw(_("Parent must be Patient Visit or Inpatient Admission"))
	if not parent_name:
		return {"diagnosis": [], "symptoms": []}

	doc = frappe.get_doc(parent_doctype, parent_name)

	# Patient Visit may use standalone Medical Diagnosis Entry; legacy child table is optional.
	diagnosis = []
	if doc.doctype == "Patient Visit" and doc.get("name"):
		for row in frappe.get_all(
			"Medical Diagnosis Entry",
			filters={"visit_num": doc.name, "docstatus": ["<", 2]},
			fields=["name", "diagnosis"],
			order_by="posting_date desc, creation desc",
		):
			link = row.get("diagnosis") or row.get("name")
			if link:
				diagnosis.append({"name": link, "label": link})
	elif doc.meta.has_field("diagnosis") and doc.get("diagnosis"):
		for row in doc.get("diagnosis"):
			link = getattr(row, "diagnosis", None) or row.get("diagnosis") or row.get("name")
			if link:
				diagnosis.append({"name": link, "label": link})

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
	assert_editing_allowed()
	if parent_doctype not in ("Patient Visit", "Inpatient Admission"):
		frappe.throw(_("Parent must be Patient Visit or Inpatient Admission"))
	if not parent_name:
		frappe.throw(_("Parent name is required"))

	doc = frappe.get_doc(parent_doctype, parent_name)

	# Legacy child table on parent; Patient Visit may use Medical Diagnosis Entry instead.
	if doc.meta.has_field("diagnosis"):
		doc.set("diagnosis", [])
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
