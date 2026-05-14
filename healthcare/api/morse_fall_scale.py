import json

import frappe
from frappe import _
from frappe.utils import nowdate

from healthcare.api.utils.api_utility import get_next_transaction_number


@frappe.whitelist()
def create_morse_fall_scale(data):
	"""Create a Morse Fall Scale doc through backend API."""
	if isinstance(data, str):
		data = json.loads(data)

	if not data:
		frappe.throw(_("Morse Fall Scale data is required"))

	required_fields = ["admission_no", "patient_no"]
	for field in required_fields:
		if not data.get(field):
			frappe.throw(_("{0} is required").format(field.replace("_", " ").title()))

	trans_no = get_next_transaction_number("Morse Fall Scale", fieldname="trans_no")

	doc = frappe.get_doc(
		{
			"doctype": "Morse Fall Scale",
			"trans_no": trans_no,
			"admission_no": data.get("admission_no"),
			"patient_no": data.get("patient_no"),
			"orderer_number": data.get("orderer_number"),
			"company": data.get("company"),
			"date": data.get("date") or nowdate(),
			"written_admission": data.get("written_admission"),
			"cost_center": data.get("cost_center"),
		}
	)

	if data.get("morse_fall_scale_detail") and isinstance(data.get("morse_fall_scale_detail"), list):
		for row in data.get("morse_fall_scale_detail"):
			if isinstance(row, dict):
				doc.append("morse_fall_scale_detail", row)

	doc.insert(ignore_permissions=True)
	frappe.db.commit()

	return {
		"name": doc.name,
		"admission_no": doc.admission_no,
		"patient_no": doc.patient_no,
		"orderer_number": doc.orderer_number,
		"company": doc.company,
		"total_points": doc.total_points,
		"modified": doc.modified,
		"morse_fall_scale_detail": doc.morse_fall_scale_detail,
	}
