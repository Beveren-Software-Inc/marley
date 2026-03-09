import frappe
from frappe import _
from frappe.utils import nowdate, nowtime, cint, flt


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
	allow_override: int | None = 0,
	override_reason: str | None = None,
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
		prescription_frequency = None

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
			prescription_frequency = child.patient_frequency
		elif pmo and getattr(pmo, "medication_orders", None):
			first = pmo.medication_orders[0]
			drug_code = getattr(first, "drug", None)
			drug_name = getattr(first, "drug_name", None)
			prescription_frequency = getattr(first, "patient_frequency", None)

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

		# Frequency-based maximum per day check using Prescription Frequency
		if prescription_frequency:
			freq_per_day = frappe.db.get_value(
				"Prescription Frequency",
				prescription_frequency,
				"frequency_in_a_day",
			)
			freq_per_day = cint(freq_per_day or 0)
			if freq_per_day > 0:
				already_given = frappe.db.count(
					"Medicine Given",
					{
						"parent": admission_detail.name,
						"parenttype": "Admission Detail",
						"medicine_code": drug_code,
						"date": row.date,
					},
				)
				print("Uko aje", freq_per_day)
				# This new row would be the (already_given + 1)-th administration today
				if already_given + 1 > freq_per_day:
					if not cint(allow_override):
						frappe.throw(
							_(
								"Frequency limit reached for this medicine.\n"
								"Prescribed frequency: {0} times per day.\n"
								"Already recorded doses today for this admission: {1}.\n"
								"Please review the prescription or consult the prescriber before giving an extra dose."
							).format(freq_per_day, already_given),
							title=_("Dose frequency exceeded"),
						)
					# Override allowed, but require a justification
					if not override_reason:
						frappe.throw(
							_("Override reason is required to exceed prescribed daily frequency."),
							title=_("Override reason required"),
						)

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


@frappe.whitelist()
def delete_medicine_given(name: str) -> dict:
	"""Delete a Medicine Given row (child of Admission Detail)."""
	if not name:
		frappe.throw(_("Row name is required"))

	parenttype, parent = frappe.db.get_value(
		"Medicine Given", name, ["parenttype", "parent"], as_dict=False
	) or (None, None)

	if not parent:
		frappe.throw(_("Medicine Given row {0} does not exist").format(frappe.bold(name)))

	if parenttype != "Admission Detail":
		frappe.throw(_("Cannot delete Medicine Given row not linked to Admission Detail"))

	frappe.delete_doc("Medicine Given", name)

	return {"deleted": name}


@frappe.whitelist()
def reconcile_discharge_medicines(admission: str) -> dict:
	"""Compute remaining medicines for an admission and create a draft Stock Entry to return them.

	Remaining = total ordered (Patient Medication Order) - total given (Medicine Given).
	"""
	if not admission:
		frappe.throw(_("Admission (Inpatient Admission) is required"))

	# Get all submitted medication orders for this admission
	order_names = frappe.get_all(
		"Patient Medication Order",
		filters={"inpatient_record": admission, "docstatus": 1},
		pluck="name",
	)
	if not order_names:
		return {"stock_entry": None, "items": []}

	# Sum ordered quantity per drug from Inpatient Medication Order Entry
	ordered: dict[str, float] = {}
	order_rows = frappe.get_all(
		"Inpatient Medication Order Entry",
		filters={"parent": ["in", order_names]},
		fields=["drug", "quantity"],
	)
	for row in order_rows:
		drug = row.get("drug")
		if not drug:
			continue
		qty = flt(row.get("quantity") or 0)
		if qty <= 0:
			continue
		ordered[drug] = ordered.get(drug, 0.0) + qty

	if not ordered:
		return {"stock_entry": None, "items": []}

	# Sum given quantity per drug from Medicine Given
	admission_detail_name = frappe.db.get_value("Admission Detail", {"admission": admission}, "name")
	given: dict[str, float] = {}
	if admission_detail_name:
		given_rows = frappe.get_all(
			"Medicine Given",
			filters={"parent": admission_detail_name, "parenttype": "Admission Detail"},
			fields=["medicine_code", "qty"],
		)
		for row in given_rows:
			drug = row.get("medicine_code")
			if not drug:
				continue
			qty = flt(row.get("qty") or 0)
			if qty <= 0:
				continue
			given[drug] = given.get(drug, 0.0) + qty

	# Compute remaining quantities
	pending: dict[str, float] = {}
	for drug, total_ordered in ordered.items():
		total_given = given.get(drug, 0.0)
		remaining = flt(total_ordered) - flt(total_given)
		if remaining > 0:
			pending[drug] = remaining

	if not pending:
		return {"stock_entry": None, "items": []}

	# Create a draft Stock Entry (Material Receipt) back to a default warehouse
	admission_doc = frappe.get_doc("Inpatient Admission", admission)
	company = admission_doc.company or frappe.defaults.get_user_default("Company")
	if not company:
		frappe.throw(_("Company is required to create Stock Entry for reconciliation"))

	# Try company default warehouse, fallback to Stock Settings
	warehouse = frappe.db.get_value("Company", company, "default_warehouse") or frappe.db.get_single_value(
		"Stock Settings", "default_warehouse"
	)
	if not warehouse:
		frappe.throw(
			_(
				"Default warehouse is not set on Company or Stock Settings. "
				"Please configure a default warehouse before reconciling medicines."
			)
		)

	stock_entry = frappe.new_doc("Stock Entry")
	stock_entry.purpose = "Material Receipt"
	stock_entry.set_stock_entry_type()
	stock_entry.to_warehouse = warehouse
	stock_entry.company = company
	cost_center = frappe.get_cached_value("Company", company, "cost_center")

	items_summary: list[dict] = []

	for drug, qty in pending.items():
		item_row = stock_entry.append("items", {})
		item_row.item_code = drug
		item_row.item_name = frappe.db.get_value("Item", drug, "item_name") or drug
		item_row.uom = frappe.db.get_value("Item", drug, "stock_uom")
		item_row.stock_uom = item_row.uom
		item_row.t_warehouse = warehouse
		item_row.qty = qty
		item_row.conversion_factor = 1
		if cost_center:
			item_row.cost_center = cost_center

		items_summary.append({"item_code": drug, "qty": qty})

	stock_entry.insert()

	return {
		"stock_entry": stock_entry.name,
		"items": items_summary,
	}



