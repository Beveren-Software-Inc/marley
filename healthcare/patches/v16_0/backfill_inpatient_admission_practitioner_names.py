"""Backfill missing doctor names on Inpatient Admission from Healthcare Practitioner.

Legacy/imported admissions store the practitioner id (``admission_by_doctor``,
``psychologist_doctor``, ``residents_doctor_no``) without the fetched ``*_name``
value, so the UI shows the id instead of the doctor's name. Copy
``practitioner_name`` for every admission where the name is empty; ids that do
not resolve to a practitioner are left untouched so the UI keeps its id fallback.
"""

from __future__ import annotations

import frappe

NAME_FIELDS = (
	("admission_by_doctor", "admission_doctor_name"),
	("psychologist_doctor", "psychologist_doctor_name"),
	("residents_doctor_no", "resident_doctor_name"),
)


def execute():
	if not frappe.db.table_exists("Inpatient Admission"):
		return

	for practitioner_field, name_field in NAME_FIELDS:
		if not frappe.db.has_column("Inpatient Admission", name_field):
			continue
		frappe.db.sql(
			f"""
			UPDATE `tabInpatient Admission` ia
			INNER JOIN `tabHealthcare Practitioner` hp
				ON hp.name = ia.`{practitioner_field}`
			SET ia.`{name_field}` = hp.practitioner_name
			WHERE IFNULL(ia.`{name_field}`, '') = ''
				AND IFNULL(hp.practitioner_name, '') != ''
			"""
		)

	frappe.db.commit()
