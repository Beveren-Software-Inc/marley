import frappe
from frappe import _
from frappe.utils import nowdate, nowtime, cint


def _get_or_create_admission_detail(admission: str):
	"""Return Admission Detail doc for an Inpatient Admission, creating it if missing."""
	if not admission:
		frappe.throw(_("Admission is required"))

	admission_detail_name = frappe.db.get_value("Admission Detail", {"admission": admission}, "name")
	if admission_detail_name:
		return frappe.get_doc("Admission Detail", admission_detail_name)

	# Create a new Admission Detail and satisfy mandatory fields
	admission_doc = frappe.get_doc("Inpatient Admission", admission)

	doc = frappe.new_doc("Admission Detail")
	doc.admission = admission
	# Mandatory fields on Admission Detail
	if hasattr(doc, "file_no"):
		doc.file_no = admission_doc.patient
	if hasattr(doc, "patient_name"):
		doc.patient_name = admission_doc.patient_name

	doc.insert()
	return doc


@frappe.whitelist()
def create_medicine_given(
	admission: str,
	medication_order: str | None = None,
	order_entry: str | None = None,
	item_code: str | None = None,
	qty: float | int | None = None,
	date: str | None = None,
	time: str | None = None,
	frequency: int | None = None,
	dose_notes: str | None = None,
) -> dict:
	"""Create a Medicine Given row on Admission Detail from a Patient Medication Order.

	This is used by Doctor / Nurse UI when recording each administration.
	"""
	if not admission:
		frappe.throw(_("Admission (Inpatient Admission) is required"))

	if not medication_order and not item_code:
		frappe.throw(_("Either Patient Medication Order or Item Code is required"))

	pmo = None
	if medication_order:
		# Validate and fetch the medication order
		pmo = frappe.get_doc("Patient Medication Order", medication_order)

		if pmo.care_context != "Inpatient Admission" or not pmo.inpatient_record:
			frappe.throw(
				_("Patient Medication Order {0} is not linked to an Inpatient Admission.").format(
					frappe.bold(pmo.name)
				)
			)

		if pmo.inpatient_record != admission:
			frappe.throw(
				_(
					"Patient Medication Order {0} belongs to admission {1}, "
					"but you are recording medicine for admission {2}."
				).format(frappe.bold(pmo.name), frappe.bold(pmo.inpatient_record), frappe.bold(admission))
			)

	# Derive a sensible default quantity:
	# - if caller passed qty, use it
	# - otherwise fall back to 1
	if qty is None:
		qty = 1

	# Resolve date / time defaults
	date = date or nowdate()
	time = time or nowtime()

	admission_detail = _get_or_create_admission_detail(admission)

	row = admission_detail.append("table_yrwe", {})
	row.date = date
	row.time = time
	row.qty = qty
	row.unit = None
	row.frequency = frequency
	row.dose_notes = dose_notes
	row.medicine_given_timing = None
	row.user = frappe.session.user

	# Custom link field we added on Medicine Given child table
	if hasattr(row, "medication_order") and pmo:
		row.medication_order = pmo.name

	# Satisfy mandatory medicine fields using the selected medication order row
	if hasattr(row, "medicine_code"):
		drug_code = None
		drug_name = None

		if item_code:
			drug_code = item_code
			drug_name = frappe.db.get_value("Item", item_code, "item_name")
		elif order_entry and pmo:
			# Validate that the child row belongs to this Patient Medication Order
			child_parent = frappe.db.get_value("Inpatient Medication Order Entry", order_entry, "parent")
			if child_parent != pmo.name:
				frappe.throw(
					_(
						"Selected medication row {0} does not belong to Patient Medication Order {1}."
					).format(frappe.bold(order_entry), frappe.bold(pmo.name))
				)
			child = frappe.get_doc("Inpatient Medication Order Entry", order_entry)
			drug_code = child.drug
			drug_name = child.drug_name
		elif pmo and getattr(pmo, "medication_orders", None):
			first = pmo.medication_orders[0]
			drug_code = getattr(first, "drug", None)
			drug_name = getattr(first, "drug_name", None)

		if not drug_code:
			frappe.throw(
				_(
					"Please select a medicine (either from prescription or direct item)."
				)
			)

		row.medicine_code = drug_code
		if hasattr(row, "medicine_name"):
			row.medicine_name = drug_name or frappe.db.get_value("Item", drug_code, "item_name")

		# Try to populate unit from Item stock_uom if present
		if hasattr(row, "unit") and not row.unit:
			stock_uom = frappe.db.get_value("Item", drug_code, "stock_uom")
			row.unit = stock_uom

	admission_detail.save()

	return {
		"admission_detail": admission_detail.name,
		"row_name": row.name,
	}


@frappe.whitelist()
def get_medicine_given(admission: str, limit: int | None = 50, offset: int | None = 0) -> list[dict]:
	"""Return Medicine Given rows for a specific Inpatient Admission (via Admission Detail)."""
	if not admission:
		frappe.throw(_("Admission (Inpatient Admission) is required"))

	admission_detail_name = frappe.db.get_value("Admission Detail", {"admission": admission}, "name")
	if not admission_detail_name:
		return []

	limit = cint(limit or 50)
	offset = cint(offset or 0)

	rows = frappe.get_all(
		"Medicine Given",
		filters={"parent": admission_detail_name, "parenttype": "Admission Detail"},
		fields=[
			"name",
			"date",
			"time",
			"medicine_code",
			"medicine_name",
			"qty",
			"unit",
			"frequency",
			"dose_notes",
			"user",
			"modified",
		],
		order_by="date desc, time desc, modified desc",
		limit=limit,
		start=offset,
	)

	return rows


