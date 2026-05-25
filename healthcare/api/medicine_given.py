import json
import frappe
from frappe import _
from frappe.utils import nowdate, nowtime, now_datetime, cint, flt, getdate
from healthcare.api.utils.api_utility import get_next_transaction_number


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

	doc.insert(ignore_permissions=True)
	return doc


def _safe_time_text(value) -> str:
	if not value:
		return ""
	return str(value).strip()


def _time_to_minutes(value) -> int:
	t = _safe_time_text(value)
	if not t:
		return -1
	parts = t.split(":")
	if len(parts) < 2:
		return -1
	try:
		hh = int(parts[0])
		mm = int(parts[1])
	except Exception:
		return -1
	return hh * 60 + mm


def _date_in_range(target_date, start_date=None, end_date=None) -> bool:
	if not target_date:
		return False
	d = getdate(target_date)
	if start_date and d < getdate(start_date):
		return False
	if end_date and d > getdate(end_date):
		return False
	return True


def _has_given_for_scheduled_slot(admission_detail_name: str, date_value, medicine_code: str, medication_order: str, scheduled_time: str) -> bool:
	"""Return True if there is already a given row for this medicine slot.

	Primary match: medicine_given_timing == scheduled_time.
	Fallback match: same hour in `time` when medicine_given_timing is empty.
	"""
	if not admission_detail_name or not medicine_code:
		return False

	filters = {
		"parent": admission_detail_name,
		"parenttype": "Admission Detail",
		"date": getdate(date_value),
		"medicine_code": medicine_code,
	}
	if medication_order:
		filters["medication_order"] = medication_order

	given_rows = frappe.get_all(
		"Medicine Given",
		filters=filters,
		fields=["name", "time", "medicine_given_timing"],
		ignore_permissions=True,
	)
	if not given_rows:
		return False

	scheduled_minutes = _time_to_minutes(scheduled_time)
	for row in given_rows:
		given_timing = _safe_time_text(row.get("medicine_given_timing"))
		if given_timing and scheduled_time and given_timing == scheduled_time:
			return True

		# Backward compatibility: legacy rows did not set medicine_given_timing.
		row_minutes = _time_to_minutes(row.get("time"))
		if row_minutes >= 0 and scheduled_minutes >= 0 and (row_minutes // 60) == (scheduled_minutes // 60):
			return True

	return False


def _has_missed_row_for_slot(admission_detail_name: str, date_value, medicine_code: str, medication_order: str, scheduled_time: str) -> bool:
	filters = {
		"parent": admission_detail_name,
		"parenttype": "Admission Detail",
		"date": getdate(date_value),
		"medicine_code": medicine_code,
		"medicine_given_timing": scheduled_time,
	}
	if medication_order:
		filters["medication_order"] = medication_order
	return bool(frappe.db.exists("Missed Medicine", filters))


def _create_missed_row(
	admission_detail,
	*,
	date_value,
	scheduled_time: str,
	medicine_code: str,
	medicine_name: str | None,
	medication_order: str | None,
	qty,
	unit,
	frequency,
	is_prn,
):
	row = admission_detail.append("missed_medicine", {})
	row.date = getdate(date_value)
	row.time = nowtime()
	row.medicine_code = medicine_code
	if hasattr(row, "medicine_name"):
		row.medicine_name = medicine_name or frappe.db.get_value("Item", medicine_code, "item_name")
	row.medication_order = medication_order
	row.qty = qty or 1
	row.unit = unit or frappe.db.get_value("Item", medicine_code, "stock_uom")
	row.frequency = frequency
	row.medicine_given_timing = scheduled_time
	row.user = frappe.session.user
	if hasattr(row, "is_prn"):
		row.is_prn = cint(is_prn)
	row.dose_notes = (
		f"Missed auto-detected by scheduler. Scheduled at {scheduled_time}. "
		f"Created on {now_datetime().strftime('%Y-%m-%d %H:%M:%S')}."
	)


def _get_latest_active_inpatient_medication_order(admission: str) -> str | None:
	"""Return latest submitted inpatient PMO for this admission."""
	rows = frappe.get_all(
		"Patient Medication Order",
		filters={"inpatient_record": admission},
		fields=["name"],
		order_by="modified desc, creation desc",
		limit=1,
		ignore_permissions=True,
	)
	return rows[0].name if rows else None


def _create_missed_medicine_for_admission(admission_name: str, grace_minutes: int = 60) -> int:
	"""Create missed rows for one admission. Returns number of created rows."""
	today = getdate(nowdate())
	now_minutes = _time_to_minutes(nowtime())
	if now_minutes < 0:
		return 0

	admission_detail = _get_or_create_admission_detail(admission_name)

	# Ensure we only check the latest prescription linked to the current inpatient admission.
	latest_pmo = _get_latest_active_inpatient_medication_order(admission_name)
	if not latest_pmo:
		return 0

	entry_filters = {"parent": latest_pmo}
	# Do not create missed entries for stopped medicines.
	if frappe.db.has_column("Inpatient Medication Order Entry", "stopped"):
		entry_filters["stopped"] = ["in", [0, ""]]
	if frappe.db.has_column("Inpatient Medication Order Entry", "reason_stopped"):
		entry_filters["reason_stopped"] = ["in", ["", None]]
	if frappe.db.has_column("Inpatient Medication Order Entry", "transferred_to_visit"):
		entry_filters["transferred_to_visit"] = ["is", "not set"]
	if frappe.db.has_column("Inpatient Medication Order Entry", "returned_to_store"):
		entry_filters["returned_to_store"] = ["in", [0, ""]]

	entries = frappe.get_all(
		"Inpatient Medication Order Entry",
		filters=entry_filters,
		fields=[
			"name",
			"parent",
			"drug",
			"drug_name",
			"quantity",
			"uom",
			"date",
			"end_date",
			"time",
			"patient_frequency",
			"is_prn",
		],
		ignore_permissions=True,
	)

	created_rows = 0
	for e in entries:
		drug = e.get("drug")
		scheduled_time = _safe_time_text(e.get("time"))
		if not drug or not scheduled_time:
			continue
		if cint(e.get("is_prn")):
			continue
		if not _date_in_range(today, e.get("date"), e.get("end_date")):
			continue

		scheduled_minutes = _time_to_minutes(scheduled_time)
		if scheduled_minutes < 0:
			continue
		if now_minutes < (scheduled_minutes + cint(grace_minutes)):
			continue

		if _has_given_for_scheduled_slot(
			admission_detail.name, today, drug, e.get("parent"), scheduled_time
		):
			continue
		if _has_missed_row_for_slot(
			admission_detail.name, today, drug, e.get("parent"), scheduled_time
		):
			continue

		_create_missed_row(
			admission_detail,
			date_value=today,
			scheduled_time=scheduled_time,
			medicine_code=drug,
			medicine_name=e.get("drug_name"),
			medication_order=e.get("parent"),
			qty=flt(e.get("quantity") or 1),
			unit=e.get("uom"),
			frequency=None,
			is_prn=e.get("is_prn"),
		)
		created_rows += 1

	if created_rows > 0:
		admission_detail.save(ignore_permissions=True)

	return created_rows


def create_missed_medicine_for_active_admissions(grace_minutes: int = 60) -> dict:
	"""Scheduler job: find missed due doses and write them to Admission Detail.missed_medicine.

	Run this every 2 hours via scheduler.
	"""
	active_admissions = frappe.get_all(
		"Inpatient Admission",
		filters={"status": ["in", ["Admitted", "Discharge Scheduled"]]},
		fields=["name"],
		ignore_permissions=True,
	)
	if not active_admissions:
		return {"processed_admissions": 0, "created_rows": 0}

	created_rows = 0
	for adm in active_admissions:
		created_rows += _create_missed_medicine_for_admission(adm.name, grace_minutes=cint(grace_minutes))

	return {"processed_admissions": len(active_admissions), "created_rows": created_rows}


@frappe.whitelist()
def check_missed_medicine_now(admission: str, grace_minutes: int = 60) -> dict:
	"""Manual trigger from UI for one admission."""
	if not admission:
		frappe.throw(_("Admission (Inpatient Admission) is required"))
	created_rows = _create_missed_medicine_for_admission(admission, grace_minutes=cint(grace_minutes))
	return {"admission": admission, "created_rows": created_rows}


@frappe.whitelist()
def create_medicine_given(
	admission: str,
	medication_order: str | None = None,
	order_entry: str | None = None,
	item_code: str | None = None,
	unit: str | None = None,
	qty: float | int | None = None,
	date: str | None = None,
	time: str | None = None,
	frequency: int | None = None,
	dose_notes: str | None = None,
	allow_override: int | None = 0,
	override_reason: str | None = None,
	is_prn: int | None = 0,
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
	row.unit = (unit or "").strip() or None
	row.frequency = frequency
	row.dose_notes = dose_notes
	row.medicine_given_timing = None
	row.user = frappe.session.user
	if hasattr(row, "is_prn"):
		row.is_prn = cint(is_prn)

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
			if hasattr(child, "uom") and not row.unit:
				row.unit = child.uom
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
					# Record override audit fields on the row
					if hasattr(row, "override_exceeded_frequency"):
						row.override_exceeded_frequency = 1
					if hasattr(row, "override_reason"):
						row.override_reason = override_reason
					if hasattr(row, "override_user"):
						row.override_user = frappe.session.user
					if hasattr(row, "override_timestamp"):
						row.override_timestamp = now_datetime()

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
def get_missed_medicine(admission: str, limit: int | None = 50, offset: int | None = 0) -> list[dict]:
	"""Return Missed Medicine rows for a specific Inpatient Admission (via Admission Detail)."""
	if not admission:
		frappe.throw(_("Admission (Inpatient Admission) is required"))

	admission_detail_name = frappe.db.get_value("Admission Detail", {"admission": admission}, "name")
	if not admission_detail_name:
		return []

	limit = cint(limit or 50)
	offset = cint(offset or 0)

	rows = frappe.get_all(
		"Missed Medicine",
		filters={"parent": admission_detail_name, "parenttype": "Admission Detail"},
		fields=[
			"name",
			"date",
			"time",
			"medicine_code",
			"medicine_name",
			"medication_order",
			"qty",
			"unit",
			"medicine_given_timing",
			"dose_notes",
			"user",
			"modified",
		],
		order_by="date desc, medicine_given_timing desc, modified desc",
		limit=limit,
		start=offset,
	)
	return rows


@frappe.whitelist()
def convert_missed_medicine_to_given(name: str, given_late_reason: str | None = None) -> dict:
	"""Move one Missed Medicine row to Medicine Given and remove it from missed_medicine."""
	if not name:
		frappe.throw(_("Missed medicine row name is required"))

	missed = frappe.db.get_value(
		"Missed Medicine",
		name,
		["parenttype", "parent"],
		as_dict=True,
	)
	if not missed or not missed.get("parent"):
		frappe.throw(_("Missed medicine row not found"))
	if missed.get("parenttype") != "Admission Detail":
		frappe.throw(_("Missed medicine row is not linked to Admission Detail"))

	admission_detail = frappe.get_doc("Admission Detail", missed.parent)
	source = None
	for row in admission_detail.get("missed_medicine") or []:
		if row.name == name:
			source = row
			break
	if not source:
		frappe.throw(_("Missed medicine row not found in parent Admission Detail"))

	given = admission_detail.append("table_yrwe", {})
	given.date = source.date or getdate(nowdate())
	given.time = nowtime()
	given.medicine_code = source.medicine_code
	if hasattr(given, "medicine_name"):
		given.medicine_name = source.medicine_name
	if hasattr(given, "medication_order"):
		given.medication_order = source.medication_order
	given.qty = source.qty
	given.unit = source.unit
	given.frequency = source.frequency
	given.user = frappe.session.user
	given.medicine_given_timing = source.medicine_given_timing
	if hasattr(given, "is_prn"):
		given.is_prn = source.is_prn

	notes = []
	if source.dose_notes:
		notes.append(f"Missed reason: {source.dose_notes}")
	if given_late_reason:
		notes.append(f"Given late reason: {given_late_reason}")
	notes.append(f"Converted from missed on {now_datetime().strftime('%Y-%m-%d %H:%M:%S')}")
	given.dose_notes = " | ".join(notes)

	# Remove from missed table in the same parent document transaction.
	remaining = [r for r in (admission_detail.get("missed_medicine") or []) if r.name != name]
	admission_detail.set("missed_medicine", remaining)
	admission_detail.save(ignore_permissions=True)

	return {
		"admission_detail": admission_detail.name,
		"given_row_name": given.name,
		"removed_missed_row_name": name,
	}


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
		filters={"inpatient_record": admission},
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

	stock_entry.insert(ignore_permissions=True)

	return {
		"stock_entry": stock_entry.name,
		"items": items_summary,
	}


def _get_reconciliation_remaining_per_entry(admission: str) -> list[dict]:
	"""For an admission, compute remaining quantity per Inpatient Medication Order Entry using FIFO allocation of Medicine Given."""
	# Exclude transfer-created PMOs: those always have patient_encounter set (linked to a follow-up visit).
	# Original inpatient PMOs never have patient_encounter, regardless of care_context value.
	order_names = frappe.get_all(
		"Patient Medication Order",
		filters={"inpatient_record": admission, "patient_encounter": ["is", "not set"]},
		pluck="name",
	)
	
	if not order_names:
		return []

	filters = {"parent": ["in", order_names]}
	if frappe.db.has_column("Inpatient Medication Order Entry", "transferred_to_visit"):
		filters["transferred_to_visit"] = ["is", "not set"]
	if frappe.db.has_column("Inpatient Medication Order Entry", "returned_to_store"):
		filters["returned_to_store"] = ["in", [0, ""]]
	fields = ["name", "parent", "drug", "drug_name", "quantity", "date", "creation", "reason_stopped"]
	if frappe.db.has_column("Inpatient Medication Order Entry", "returned_to_store"):
		fields.append("returned_to_store")
	entries = frappe.get_all(
		"Inpatient Medication Order Entry",
		filters=filters,
		fields=fields,
		order_by="date asc, creation asc",
	)
	if not entries:
		return []

	admission_detail_name = frappe.db.get_value("Admission Detail", {"admission": admission}, "name")
	given_rows = []
	if admission_detail_name:
		given_rows = frappe.get_all(
			"Medicine Given",
			filters={"parent": admission_detail_name, "parenttype": "Admission Detail"},
			fields=["medicine_code", "qty"],
			order_by="date asc, time asc, creation asc",
		)

	# Per-drug: list of (entry_name, quantity); per-drug given to allocate
	from collections import defaultdict
	entries_by_drug = defaultdict(list)
	for e in entries:
		drug = e.get("drug")
		if not drug or flt(e.get("quantity"), 0) <= 0:
			continue
		entries_by_drug[drug].append({"name": e["name"], "parent": e["parent"], "quantity": flt(e["quantity"]), "date": e.get("date"), "creation": e.get("creation"), "drug_name": e.get("drug_name")})

	given_by_drug = defaultdict(lambda: 0)
	for g in given_rows:
		drug = g.get("medicine_code")
		if drug:
			given_by_drug[drug] += flt(g.get("qty") or 0)

	# FIFO: for each drug, consume "given" from first entries first
	remaining_per_entry = {}
	for drug, entry_list in entries_by_drug.items():
		to_allocate = given_by_drug.get(drug, 0)
		for ent in entry_list:
			allocated = min(ent["quantity"], to_allocate)
			to_allocate -= allocated
			rem = ent["quantity"] - allocated
			row_data = {
			"name": ent["name"],
			"parent": ent["parent"],
			"drug": drug,
			"drug_name": ent.get("drug_name"),
			"quantity": ent["quantity"],
			"remaining": rem,
		}
		if "reason_stopped" in ent:
			row_data["reason_stopped"] = ent.get("reason_stopped") or ""
		if "returned_to_store" in ent:
			row_data["returned_to_store"] = cint(ent.get("returned_to_store"))
		remaining_per_entry[ent["name"]] = row_data

	return [v for v in remaining_per_entry.values() if flt(v.get("remaining"), 0) > 0]


@frappe.whitelist()
def get_discharge_reconciliation_rows(admission: str) -> list[dict]:
	"""Return list of Inpatient Medication Order Entry rows that have remaining (not yet given) quantity for medicine reconciliation on discharge."""
	if not admission:
		frappe.throw(_("Admission (Inpatient Admission) is required"))
	
	rows = _get_reconciliation_remaining_per_entry(admission)
	return rows


@frappe.whitelist()
def get_discharge_transfer_rows(admission: str) -> list[dict]:
	"""Return prescribed medication order entries for transfer on discharge.

	Unlike reconciliation, this does not compare against Medicine Given.
	It returns original inpatient prescription rows that are not yet transferred.
	"""
	if not admission:
		frappe.throw(_("Admission (Inpatient Admission) is required"))

	order_names = frappe.get_all(
		"Patient Medication Order",
		filters={"inpatient_record": admission, "patient_encounter": ["is", "not set"]},
		pluck="name",
	)
	if not order_names:
		return []
	
	filters = {"parent": ["in", order_names]}
	if frappe.db.has_column("Inpatient Medication Order Entry", "transferred_to_visit"):
		filters["transferred_to_visit"] = ["is", "not set"]

	fields = [
		"name",
		"parent",
		"drug",
		"drug_name",
		"quantity",
		"reason_stopped",
		"dosage",
		"no_of_days",
		"dosage_form",
		"instructions",
		"date",
		"time",
		"patient_frequency",
		"is_pink",
		"reference_no",
		"route_of_administration",
		"is_long_acting_medicine",
		"end_date",
		"creation",
	]
	if frappe.db.has_column("Inpatient Medication Order Entry", "medication_type"):
		fields.append("medication_type")

	rows = frappe.get_all(
		"Inpatient Medication Order Entry",
		filters=filters,
		fields=fields,
		order_by="date asc, creation asc",
	)
	print("Rows rows", str(rows))
	result = []
	for row in rows:
		# if flt(row.get("quantity"), 0) <= 0:
		# 	continue
		result.append(row)

	return result


def _get_warehouse_for_admission(admission: str):
	admission_doc = frappe.get_doc("Inpatient Admission", admission)
	company = admission_doc.company or frappe.defaults.get_user_default("Company")
	if not company:
		frappe.throw(_("Company is required to create Stock Entry"))
	warehouse = frappe.db.get_value("Company", company, "default_warehouse") or frappe.db.get_single_value(
		"Stock Settings", "default_warehouse"
	)
	if not warehouse:
		frappe.throw(_("Default warehouse is not set. Please configure before reconciling medicines."))
	return warehouse, company


def _get_return_warehouse_for_admission(admission: str):
	"""Warehouse for returning medicines to store (discharge reconciliation). Uses Healthcare Settings Default Return Medicine only."""
	warehouse = frappe.db.get_single_value("Healthcare Settings", "default_return_medicine")
	if not warehouse:
		frappe.throw(
			_("Default Return Medicine warehouse is not set. Please set it in Healthcare Settings to return medicines to store.")
		)
	admission_doc = frappe.get_doc("Inpatient Admission", admission)
	company = admission_doc.company or frappe.defaults.get_user_default("Company")
	if not company:
		frappe.throw(_("Company is required to create Stock Entry"))
	return warehouse, company


@frappe.whitelist()
def stop_medication_on_discharge(admission: str, order_entry_name: str, reason_stopped: str = "") -> dict:
	"""Mark one medication order entry as stopped: save reason_stopped on the prescription child table. Use return_stopped_medications_to_store to create the stock entry for all stopped items."""
	if not admission or not order_entry_name:
		frappe.throw(_("Admission and order entry name are required"))

	order_names = frappe.get_all(
		"Patient Medication Order",
		filters={"inpatient_record": admission, "docstatus": 1, "patient_encounter": ["is", "not set"]},
		pluck="name",
	)
	if not order_names:
		frappe.throw(_("No medication orders found for this admission."))
	parent = frappe.db.get_value("Inpatient Medication Order Entry", order_entry_name, "parent")
	if not parent or parent not in order_names:
		frappe.throw(_("Order entry {0} does not belong to this admission.").format(frappe.bold(order_entry_name)))

	frappe.db.set_value("Inpatient Medication Order Entry", order_entry_name, "reason_stopped", (reason_stopped or "").strip())
	frappe.db.commit()
	return {"message": "Reason saved. Use 'Return selected' to create stock entry for all stopped medicines."}


def _get_stopped_entries_with_remaining(admission: str) -> list[dict]:
	"""Return order entries for this admission that have reason_stopped set, not yet returned_to_store, with their remaining qty (FIFO)."""
	order_names = frappe.get_all(
		"Patient Medication Order",
		filters={"inpatient_record": admission, "docstatus": 1, "patient_encounter": ["is", "not set"]},
		pluck="name",
	)
	if not order_names:
		return []
	filters = {"parent": ["in", order_names], "reason_stopped": ["!=", ""]}
	if frappe.db.has_column("Inpatient Medication Order Entry", "returned_to_store"):
		filters["returned_to_store"] = ["in", [0, ""]]
	if frappe.db.has_column("Inpatient Medication Order Entry", "transferred_to_visit"):
		filters["transferred_to_visit"] = ["is", "not set"]
	fields = ["name", "parent", "drug", "drug_name", "quantity", "date", "creation"]
	stopped_entries = frappe.get_all(
		"Inpatient Medication Order Entry",
		filters=filters,
		fields=fields,
		order_by="date asc, creation asc",
	)
	if not stopped_entries:
		return []
	# Get remaining qty for each entry using same FIFO as full list (all entries for admission)
	all_rows = _get_reconciliation_remaining_per_entry(admission)
	remaining_by_name = {r["name"]: flt(r.get("remaining"), 0) for r in all_rows}
	result = []
	for e in stopped_entries:
		rem = remaining_by_name.get(e["name"], 0)
		if rem > 0:
			result.append({
				"name": e["name"],
				"drug": e.get("drug"),
				"drug_name": e.get("drug_name"),
				"remaining": rem,
			})
	return result


@frappe.whitelist()
def return_stopped_medications_to_store(admission: str, order_entry_names: str | list | None = None) -> dict:
	"""Create one Stock Entry (Material Receipt) for medications to return.
	If order_entry_names is provided: return only those entries; each must have reason_stopped set.
	If not provided: return all that have reason_stopped set and not yet returned."""
	if not admission:
		frappe.throw(_("Admission is required"))

	if order_entry_names is not None:
		names = order_entry_names if isinstance(order_entry_names, list) else json.loads(order_entry_names or "[]")
	else:
		names = None

	if names is not None:
		if not names:
			return {"stock_entry": None, "message": "No medicines selected to return."}
		# Validate each has reason_stopped; get remaining for each
		order_names = frappe.get_all(
			"Patient Medication Order",
			filters={"inpatient_record": admission, "patient_encounter": ["is", "not set"]},
			pluck="name",
		)
		entries = frappe.get_all(
			"Inpatient Medication Order Entry",
			filters={"name": ["in", names], "parent": ["in", order_names]},
			fields=["name", "drug", "drug_name", "quantity", "date", "creation", "reason_stopped"],
		)
		if len(entries) != len(names):
			frappe.throw(_("One or more selected entries do not belong to this admission."))
		# Require reason_stopped for each
		missing = [e.get("drug_name") or e.get("drug") or e.get("name") for e in entries if not (e.get("reason_stopped") or "").strip()]
		if missing:
			frappe.throw(_("Reason stopped is required for each medicine being returned. Missing for: {0}").format(", ".join(missing)))
		# Get remaining qty for these entries (FIFO)
		all_rows = _get_reconciliation_remaining_per_entry(admission)
		remaining_by_name = {r["name"]: flt(r.get("remaining"), 0) for r in all_rows}
		stopped = []
		for e in entries:
			rem = remaining_by_name.get(e["name"], 0)
			if rem > 0:
				stopped.append({"name": e["name"], "drug": e.get("drug"), "drug_name": e.get("drug_name"), "remaining": rem})
	else:
		stopped = _get_stopped_entries_with_remaining(admission)

	if not stopped:
		return {"stock_entry": None, "message": "No medicines with remaining quantity to return."}

	warehouse, company = _get_return_warehouse_for_admission(admission)
	cost_center = frappe.get_cached_value("Company", company, "cost_center")

	# Aggregate by drug (same drug can appear in multiple entries)
	from collections import defaultdict
	qty_by_drug = defaultdict(lambda: 0)
	entry_names_by_drug = defaultdict(list)
	for row in stopped:
		drug = row.get("drug")
		if drug:
			qty_by_drug[drug] += flt(row.get("remaining"), 0)
			entry_names_by_drug[drug].append(row["name"])

	stock_entry = frappe.new_doc("Stock Entry")
	stock_entry.purpose = "Material Receipt"
	stock_entry.set_stock_entry_type()
	stock_entry.to_warehouse = warehouse
	stock_entry.company = company

	items_summary = []
	for drug, qty in qty_by_drug.items():
		if qty <= 0:
			continue
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

	stock_entry.insert(ignore_permissions=True)

	# Mark all stopped entries that were included as returned_to_store
	if frappe.db.has_column("Inpatient Medication Order Entry", "returned_to_store"):
		all_entry_names = [row["name"] for row in stopped]
		for name in all_entry_names:
			frappe.db.set_value("Inpatient Medication Order Entry", name, "returned_to_store", 1)
		frappe.db.commit()

	return {"stock_entry": stock_entry.name, "items": items_summary}


@frappe.whitelist()
def transfer_medications_on_discharge(admission: str, order_entry_names: str | list) -> dict:
	"""Create a Patient Visit (Follow-up for the Psychiatrist) and a new Patient Medication Order linked to it and to the admission, with the selected order entries copied over."""
	if not admission:
		frappe.throw(_("Admission is required"))
	if not order_entry_names:
		frappe.throw(_("At least one order entry must be selected to transfer"))

	names = order_entry_names if isinstance(order_entry_names, list) else json.loads(order_entry_names or "[]")
	if not names:
		frappe.throw(_("At least one order entry must be selected to transfer"))

	admission_doc = frappe.get_doc("Inpatient Admission", admission)
	patient = admission_doc.patient
	patient_name = admission_doc.patient_name
	practitioner = getattr(admission_doc, "primary_practitioner", None) or getattr(admission_doc, "secondary_practitioner", None)
	company = admission_doc.company or frappe.defaults.get_user_default("Company")
	if not company:
		frappe.throw(_("Company is required"))

	# Validate entries belong to original inpatient PMOs only (patient_encounter not set)
	order_names = frappe.get_all(
		"Patient Medication Order",
		filters={"inpatient_record": admission, "patient_encounter": ["is", "not set"]},
		pluck="name",
	)
	entries = frappe.get_all(
		"Inpatient Medication Order Entry",
		filters={"name": ["in", names], "parent": ["in", order_names]},
		fields=["name", "parent", "drug", "drug_name", "dosage", "no_of_days", "dosage_form", "instructions", "date", "time", "patient_frequency", "is_pink", "reference_no", "route_of_administration", "is_long_acting_medicine", "end_date"],
	)
	if len(entries) != len(names):
		frappe.throw(_("One or more selected entries do not belong to this admission."))

	# Create Patient Visit: type Follow-up for the Psychiatrist
	visit_type = "Follow-up for the Psychiatrist"
	pv = frappe.new_doc("Patient Visit")
	pv.patient = patient
	pv.patient_name = patient_name
	pv.visit_type = visit_type
	pv.status = "Open"
	pv.encounter_date = getdate(nowdate())
	pv.inpatient_record = admission
	if practitioner:
		pv.practitioner = practitioner
	pv.company = company
	pv.insert(ignore_permissions=True)
	frappe.db.commit()

	# Build medication_orders list from selected entries for create_patient_medication_order
	from healthcare.api.patient_medication_order import create_patient_medication_order

	medication_orders = []
	for e in entries:
		medication_orders.append({
			"drug": e.get("drug"),
			"dosage": e.get("dosage"),
			"no_of_days": e.get("no_of_days"),
			"dosage_form": e.get("dosage_form"),
			"instructions": e.get("instructions") or "",
			"date": e.get("date"),
			"time": e.get("time") or "00:00:00",
			"patient_frequency": e.get("patient_frequency"),
			"is_pink": cint(e.get("is_pink")),
			"reference_no": e.get("reference_no") or "",
			"route_of_administration": e.get("route_of_administration"),
			"is_long_acting_medicine": cint(e.get("is_long_acting_medicine")),
			"end_date": e.get("end_date"),
		})

	start_date = nowdate()
	result = create_patient_medication_order(
		patient=patient,
		care_context="Patient Visit",
		company=company,
		start_date=start_date,
		patient_encounter=pv.name,
		inpatient_record=None,
		practitioner=practitioner,
		medication_orders=medication_orders,
	)
	pmo_name = result.get("name")

	# NOTE: we intentionally do NOT set inpatient_record on the new PMO.
	# The Patient Visit already carries inpatient_record → admission so the trail is preserved.
	# Back-linking the PMO would make its entries reappear in reconciliation (same admission query).

	# Mark these order entries as transferred so they no longer appear in reconciliation list
	if frappe.db.has_column("Inpatient Medication Order Entry", "transferred_to_visit"):
		for name in names:
			frappe.db.set_value("Inpatient Medication Order Entry", name, "transferred_to_visit", pv.name)
		frappe.db.commit()

	return {
		"patient_visit": pv.name,
		"patient_medication_order": pmo_name,
	}

@frappe.whitelist()
def create_visit_and_prescription_on_discharge(
	admission: str,
	medication_orders=None,
	patient_encounter: str | None = None,
	after_discharge: bool | str | None = None,
	doctors_signature: str | None = None,
) -> dict:
	"""Create a Patient Visit and a Patient Medication Order from discharge transfer medicines."""
	if not admission:
		frappe.throw(_("Admission is required"))

	admission_doc = frappe.get_doc("Inpatient Admission", admission)
	patient = admission_doc.patient
	patient_name = admission_doc.patient_name
	practitioner = getattr(admission_doc, "primary_practitioner", None) or getattr(admission_doc, "secondary_practitioner", None)
	company = admission_doc.company or frappe.defaults.get_user_default("Company")
	if not company:
		frappe.throw(_("Company is required"))

	if isinstance(medication_orders, str):
		medication_orders = json.loads(medication_orders or "[]")
	if not medication_orders:
		frappe.throw(_("At least one medication order is required"))

	if patient_encounter:
		pv = frappe.get_doc("Patient Visit", patient_encounter)
		if pv.patient != patient:
			frappe.throw(_("Selected Patient Visit does not belong to this patient"))
	else:
		visit_type = "Follow-up for the Psychiatrist"
		pv = frappe.new_doc("Patient Visit")
		pv.case_no = get_next_transaction_number('Patient Visit', fieldname='case_no')
		pv.patient = patient
		pv.patient_name = patient_name
		pv.visit_type = visit_type
		pv.status = "Open"
		pv.encounter_date = getdate(nowdate())
		pv.inpatient_record = admission
		if practitioner:
			pv.practitioner = practitioner
		pv.company = company
		pv.during_discharge = 1
		pv.status='Completed'
		pv.insert(ignore_permissions=True)
		pv.submit()
		frappe.db.commit()

	from healthcare.api.patient_medication_order import create_patient_medication_order

	result = create_patient_medication_order(
		patient=patient,
		care_context="Patient Visit",
		company=company,
		start_date=nowdate(),
		patient_encounter=pv.name,
		practitioner=practitioner,
		medication_orders=medication_orders,
		after_discharge=bool(str(after_discharge).lower() in ['1', 'true', 'yes']),
		doctors_signature=doctors_signature,
	)
	return {
		"patient_visit": pv.name,
		"patient_medication_order": result.get("name"),
	}


