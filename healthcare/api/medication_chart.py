import frappe
from frappe import _
from frappe.utils import cint, cstr, getdate, nowdate, add_days

from healthcare.api.medicine_given import (
	is_daily_prescription_frequency,
	_date_in_range,
)


SESSION_WINDOWS = [
	("morning", "Morning", 5, 11),   # 05:00–10:59
	("noon", "Noon", 11, 15),        # 11:00–14:59
	("evening", "Evening", 15, 19),  # 15:00–18:59
	("night", "Night", 19, 24),      # 19:00–23:59
]


def _time_to_session(hour: int) -> str:
	for session_id, _label, start_h, end_h in SESSION_WINDOWS:
		if start_h <= hour < end_h:
			return session_id
	return "other"


def _get_sessions():
	return [
		{"id": session_id, "label": label, "order": idx}
		for idx, (session_id, label, _s, _e) in enumerate(SESSION_WINDOWS)
	]


def _frequency_schedule_hours(freq_name: str | None) -> list[int]:
	"""Hours from Prescription Frequency.dosage_strength (chart slots).

	Includes frequencies marked Daily, and any frequency that has schedule times
	(e.g. BD. / TDS.) even when the Daily checkbox is off.
	"""
	freq_name = (freq_name or "").strip()
	if not freq_name or not frappe.db.exists("Prescription Frequency", freq_name):
		return []

	times: list[int] = []
	try:
		doc = frappe.get_doc("Prescription Frequency", freq_name)
		for child in getattr(doc, "dosage_strength", []) or []:
			strength_time = getattr(child, "strength_time", None)
			if not strength_time:
				continue
			try:
				hour = int(str(strength_time).split(":")[0])
			except (TypeError, ValueError):
				continue
			if hour not in times:
				times.append(hour)
	except frappe.DoesNotExistError:
		return []

	if times:
		return times

	# Daily with no strength rows still participates (no due slots until times are set).
	if is_daily_prescription_frequency(freq_name):
		return []
	return []


def _frequency_on_daily_chart(freq_name: str | None) -> bool:
	"""Show on daily chart when Daily is checked or dosage_strength times exist."""
	freq_name = (freq_name or "").strip()
	if not freq_name:
		return False
	if is_daily_prescription_frequency(freq_name):
		return True
	return bool(_frequency_schedule_hours(freq_name))


@frappe.whitelist()
def get_daily_medication_chart(admission: str, date: str | None = None) -> dict:
	"""Return medications for an admission for a given day, grouped by session.

	Uses:
	- Patient Medication Order (inpatient_record = admission, submitted)
	- Child table Inpatient Medication Order Entry (medication_orders)
	- Prescription Frequency schedule times (Daily flag and/or dosage_strength) for sessions
	- Medicine Given rows from Admission Detail to mark administrations

	Frequencies with no schedule times and Daily unchecked (e.g. Q3W) are excluded.
	"""
	if not admission:
		frappe.throw(_("Inpatient Admission is required"))

	selected_date = getdate(date or nowdate())

	# All current clinical medication orders for this admission (not only the latest).
	prescriptions = _get_current_inpatient_medication_orders(admission)
	# Daily chart wants chronological order for rows
	prescriptions = sorted(prescriptions, key=lambda p: str(p.get("creation") or ""))
	if not prescriptions:
		return {"sessions": _get_sessions(), "rows": [], "prn_rows": []}

	pmo_by_name = {p.name: p for p in prescriptions}
	pmo_names = list(pmo_by_name.keys())
	order_rows = frappe.get_all(
		"Inpatient Medication Order Entry",
		filters={"parent": ["in", pmo_names]},
		fields=[
			"name",
			"parent",
			"drug",
			"drug_name",
			"dosage",
			"dosage_form",
			"patient_frequency",
			"date",
			"end_date",
			"medication_status",
			"stopped",
			"reason_stopped",
			"is_prn",
			"medication_type",
			"instructions",
		],
		order_by="parent asc, idx asc",
	)

	if not order_rows:
		return {"sessions": _get_sessions(), "rows": [], "prn_rows": []}

	# Map frequencies → session hours from dosage_strength.
	frequency_times: dict[str, list[int]] = {}
	for freq_name in {
		row.get("patient_frequency") for row in order_rows if row.get("patient_frequency")
	}:
		if not _frequency_on_daily_chart(freq_name):
			continue
		frequency_times[freq_name] = _frequency_schedule_hours(freq_name)

	# Get admission detail and medicine given rows for that day
	admission_detail_name = frappe.db.get_value("Admission Detail", {"admission": admission}, "name")
	given_rows = []
	if admission_detail_name:
		given_rows = frappe.get_all(
			"Medicine Given",
			filters={
				"parent": admission_detail_name,
				"parenttype": "Admission Detail",
				"date": selected_date,
			},
			fields=["name", "medicine_code", "medicine_name", "time", "user"],
		)

	# Index given by (medicine_code, session_id) for scheduled doses
	given_index: dict[tuple[str, str], dict] = {}
	for row in given_rows:
		med_code = row.get("medicine_code")
		if not med_code or not row.get("time"):
			continue
		hour = int(str(row.time).split(":")[0])
		session_id = _time_to_session(hour)
		key = (med_code, session_id)
		given_index[key] = {
			"name": row.name,
			"time": row.time,
			"user": row.user,
		}

	sessions = _get_sessions()

	rows_out = []
	prn_rows_out = []
	for entry in order_rows:
		drug = entry.get("drug")
		if not drug:
			continue
		status = (entry.get("medication_status") or "").strip()
		if (
			cint(entry.get("stopped"))
			or (entry.get("reason_stopped") or "").strip()
			or status in ("Discontinued", "On Hold")
		):
			continue

		pmo = pmo_by_name.get(entry.parent) or {}
		if not _date_in_range(
			selected_date,
			entry.get("date") or pmo.get("start_date"),
			entry.get("end_date") or pmo.get("end_date"),
		):
			continue

		freq_name = entry.get("patient_frequency")
		if not _frequency_on_daily_chart(freq_name):
			continue

		is_prn = cint(entry.get("is_prn")) or (cstr(entry.get("medication_type") or "").strip() == "PRN")
		times = frequency_times.get(freq_name, []) if freq_name else []

		slot_list = []
		for session_id, _label, _s, _e in SESSION_WINDOWS:
			due = any(_s <= h < _e for h in times)
			given_info = given_index.get((drug, session_id))
			slot_list.append(
				{
					"session_id": session_id,
					"due": bool(due),
					"given": bool(given_info),
					"given_time": given_info.get("time") if given_info else None,
					"given_by": given_info.get("user") if given_info else None,
				}
			)

		row_payload = {
			"order_entry": entry.name,
			"prescription": entry.parent,
			"drug": drug,
			"drug_name": entry.get("drug_name"),
			"dosage": entry.get("dosage"),
			"dosage_form": entry.get("dosage_form"),
			"patient_frequency": freq_name,
			"instructions": entry.get("instructions") or "",
			"is_prn": 1 if is_prn else 0,
			"slots": slot_list,
		}
		# PRN still follows frequency sessions — shown in a separate section only
		if is_prn:
			prn_rows_out.append(row_payload)
		else:
			rows_out.append(row_payload)

	return {
		"sessions": sessions,
		"rows": rows_out,
		"prn_rows": prn_rows_out,
	}


@frappe.whitelist()
def get_medication_sheet(admission: str, from_date: str | None = None, to_date: str | None = None) -> list[dict]:
	"""Flat list of medication administrations vs. orders for reporting.

	For now this returns Medicine Given rows joined with basic item info for the admission.
	It can be extended later to also include \"due but not given\" rows.
	"""
	if not admission:
		frappe.throw(_("Inpatient Admission is required"))

	admission_detail_name = frappe.db.get_value("Admission Detail", {"admission": admission}, "name")
	if not admission_detail_name:
		return []

	filters = {
		"parent": admission_detail_name,
		"parenttype": "Admission Detail",
	}
	if from_date:
		filters["date"] = [">=", getdate(from_date)]
	if to_date:
		# if both set, convert to between; if only to_date, override
		if "date" in filters and isinstance(filters["date"], list):
			filters["date"] = ["between", [getdate(from_date), getdate(to_date)]]
		else:
			filters["date"] = ["<=", getdate(to_date)]

	rows = frappe.get_all(
		"Medicine Given",
		filters=filters,
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
	)

	return rows


def _user_display_name(user_id: str | None) -> str:
	if not user_id:
		return ""
	full_name = frappe.db.get_value("User", user_id, "full_name")
	if full_name:
		return full_name
	practitioner = frappe.db.get_value(
		"Healthcare Practitioner", {"user_id": user_id}, "practitioner_name"
	)
	return practitioner or user_id


def _get_latest_inpatient_medication_order(admission: str) -> dict | None:
	"""Latest submitted inpatient PMO for this admission (current medication)."""
	rows = _get_current_inpatient_medication_orders(admission)
	return rows[0] if rows else None


def _get_current_inpatient_medication_orders(admission: str) -> list[dict]:
	"""All current signed clinical PMOs for an admission (same as Current Prescription).

	Includes Signed / In Process (and legacy Pending), excludes Unsigned, Cancelled,
	Completed, Stopped, and Nursing Pharmacy Give Out.
	Ordered newest first.
	"""
	if not admission:
		return []

	from healthcare.api.patient_medication_order import _is_current_signed_clinical_pmo

	filters = {
		"inpatient_record": admission,
		"docstatus": 1,
		"status": ["not in", ["Cancelled", "Completed", "Stopped", "Unsigned", "Draft"]],
	}
	pmo_meta = frappe.get_meta("Patient Medication Order")
	if pmo_meta.has_field("nursing_pharmacy_giveout"):
		filters["nursing_pharmacy_giveout"] = ["!=", 1]
	if pmo_meta.has_field("is_pharmacy_give_out"):
		filters["is_pharmacy_give_out"] = ["!=", 1]
	if pmo_meta.has_field("after_discharge"):
		filters["after_discharge"] = ["!=", 1]

	rows = frappe.get_all(
		"Patient Medication Order",
		filters=filters,
		fields=[
			"name",
			"start_date",
			"end_date",
			"posting_date",
			"modified",
			"creation",
			"status",
			"new_system",
			"doctors_signature",
		],
		order_by="creation desc",
	)
	return [row for row in rows if _is_current_signed_clinical_pmo(row)]


def _admin_in_date_range(row_date, from_date, to_date) -> bool:
	if not row_date:
		return True
	d = getdate(row_date)
	if from_date and d < getdate(from_date):
		return False
	if to_date and d > getdate(to_date):
		return False
	return True


@frappe.whitelist()
def get_medication_sheet_detail(
	admission: str, from_date: str | None = None, to_date: str | None = None
) -> dict:
	"""Prescription medicines for an IP admission with given / missed administration rows.

	Uses all current signed/active Patient Medication Orders for the admission
	(not only the latest), matching Current Prescription behaviour.
	"""
	if not admission:
		frappe.throw(_("Inpatient Admission is required"))

	from_date_parsed = getdate(from_date) if from_date else None
	to_date_parsed = getdate(to_date) if to_date else None

	admission_doc = frappe.get_cached_doc("Inpatient Admission", admission)
	patient = admission_doc.patient
	patient_name = admission_doc.patient_name or patient

	current_pmos = _get_current_inpatient_medication_orders(admission)
	if not current_pmos:
		return {
			"admission": admission,
			"patient": patient,
			"patient_name": patient_name,
			"prescription": None,
			"prescriptions": [],
			"from_date": str(from_date_parsed) if from_date_parsed else None,
			"to_date": str(to_date_parsed) if to_date_parsed else None,
			"medicines": [],
		}

	# Newest first from helper; keep that order for header display
	pmo_by_name = {p.name: p for p in current_pmos}
	pmo_names = [p.name for p in current_pmos]
	primary_prescription = pmo_names[0]

	from healthcare.api.medication_order_display import (
		medication_entry_display_fields,
		medication_entry_drug_key,
	)

	entry_fields = [
		"name",
		"parent",
		"drug",
		"drug_name",
		"medication",
		"old_medicine_code",
		"old_medicine_name",
		"medicine_no",
		"written_frequency",
		"instructions",
		"dosage",
		"dosage_form",
		"uom",
		"old_unit",
		"patient_frequency",
		"medication_type",
		"is_pink",
		"route_of_administration",
		"date",
		"end_date",
		"time",
		"stopped",
		"reason_stopped",
	]
	order_entries = frappe.get_all(
		"Inpatient Medication Order Entry",
		filters={"parent": ["in", pmo_names]},
		fields=entry_fields,
		order_by="parent asc, idx asc",
	)

	admission_detail_name = frappe.db.get_value("Admission Detail", {"admission": admission}, "name")
	given_rows: list[dict] = []
	missed_rows: list[dict] = []
	if admission_detail_name:
		given_fields = [
			"name",
			"date",
			"time",
			"medicine_code",
			"medicine_name",
			"old_medicine_code",
			"qty",
			"unit",
			"frequency",
			"dose_notes",
			"user",
			"medication_order",
		]
		given_rows = frappe.get_all(
			"Medicine Given",
			filters={"parent": admission_detail_name, "parenttype": "Admission Detail"},
			fields=given_fields,
			order_by="date desc, time desc, modified desc",
		)
		missed_fields = [
			"name",
			"date",
			"time",
			"medicine_code",
			"medicine_name",
			"old_medicine_code",
			"medication_order",
			"qty",
			"unit",
			"medicine_given_timing",
			"dose_notes",
			"user",
		]
		missed_rows = frappe.get_all(
			"Missed Medicine",
			filters={"parent": admission_detail_name, "parenttype": "Admission Detail"},
			fields=missed_fields,
			order_by="date desc, medicine_given_timing desc, modified desc",
		)

	def _rows_for_drug(drug_key: str, prescription: str) -> list[dict]:
		admins: list[dict] = []
		for row in given_rows:
			med_code = row.get("medicine_code") or row.get("old_medicine_code")
			if med_code != drug_key:
				continue
			mo = row.get("medication_order")
			if mo and mo != prescription:
				continue
			if not _admin_in_date_range(row.get("date"), from_date_parsed, to_date_parsed):
				continue
			admins.append(
				{
					"kind": "given",
					"name": row.name,
					"date": str(row.date) if row.date else None,
					"time": str(row.time) if row.time else None,
					"given": True,
					"qty": row.get("qty"),
					"unit": row.get("unit"),
					"given_by": row.get("user"),
					"given_by_name": _user_display_name(row.get("user")),
					"remarks": row.get("dose_notes") or "",
					"timing_label": None,
				}
			)
		for row in missed_rows:
			med_code = row.get("medicine_code") or row.get("old_medicine_code")
			if med_code != drug_key:
				continue
			mo = row.get("medication_order")
			if mo and mo != prescription:
				continue
			if not _admin_in_date_range(row.get("date"), from_date_parsed, to_date_parsed):
				continue
			admins.append(
				{
					"kind": "missed",
					"name": row.name,
					"date": str(row.date) if row.date else None,
					"time": str(row.time) if row.time else None,
					"given": False,
					"qty": row.get("qty"),
					"unit": row.get("unit"),
					"given_by": row.get("user"),
					"given_by_name": _user_display_name(row.get("user")),
					"remarks": row.get("dose_notes") or "",
					"timing_label": row.get("medicine_given_timing"),
				}
			)
		admins.sort(
			key=lambda r: (r.get("date") or "", r.get("time") or ""),
			reverse=True,
		)
		return admins

	medicines_out: list[dict] = []
	seen_drugs: set[tuple[str, str]] = set()

	for entry in order_entries:
		if cint(entry.get("stopped")) or (entry.get("reason_stopped") or "").strip():
			continue
		drug_key = medication_entry_drug_key(entry)
		if not drug_key:
			continue
		prescription = entry.get("parent")
		key = (prescription, drug_key)
		if key in seen_drugs:
			continue
		seen_drugs.add(key)

		pmo = pmo_by_name.get(prescription)
		display = medication_entry_display_fields(
			entry,
			parent_start_date=pmo.start_date if pmo else None,
			parent_end_date=pmo.end_date if pmo else None,
		)

		medicines_out.append(
			{
				"order_entry": entry.name,
				"prescription": prescription,
				"drug": drug_key,
				"drug_name": display["display_drug_name"],
				"dosage": display["display_dosage"],
				"uom": (entry.get("uom") or entry.get("old_unit") or "").strip() or None,
				"dosage_form": entry.get("dosage_form"),
				"patient_frequency": display["display_frequency"],
				"medication_type": entry.get("medication_type") or "",
				"is_pink": cint(entry.get("is_pink")),
				"route_of_administration": entry.get("route_of_administration"),
				"start_date": display["display_start_date"],
				"end_date": display["display_end_date"],
				"instructions": entry.get("instructions"),
				"written_frequency": entry.get("written_frequency"),
				"old_medicine_code": entry.get("old_medicine_code"),
				"old_medicine_name": entry.get("old_medicine_name"),
				"medication": entry.get("medication"),
				"is_legacy": display["is_legacy"],
				"administrations": _rows_for_drug(drug_key, prescription),
			}
		)

	return {
		"admission": admission,
		"patient": patient,
		"patient_name": patient_name,
		"prescription": primary_prescription,
		"prescriptions": pmo_names,
		"from_date": str(from_date_parsed) if from_date_parsed else None,
		"to_date": str(to_date_parsed) if to_date_parsed else None,
		"medicines": medicines_out,
	}


@frappe.whitelist()
def get_long_acting_medication_reminders(
	patient: str | None = None,
	admission: str | None = None,
	days_ahead: int | None = 7,
) -> list[dict]:
	"""Return long-acting medication reminders: doses due today, soon, or overdue.

	Long-acting = is_long_acting_medicine=1 directly on the Inpatient Medication
	Order Entry child row. Interval is read from long_acting_frequency on that
	same row (Weekly/Biweekly/Monthly/Every 2 Months/Every 3 Months).
	Next due date = last Medicine Given date (or order start_date) + interval.
	"""
	from healthcare.api.patient_medication_order import _long_acting_frequency_interval_days

	days_ahead = int(days_ahead or 7)
	today = getdate(nowdate())

	pmo_filters = {"care_context": "Inpatient Admission", "docstatus": 1}
	if patient:
		pmo_filters["patient"] = patient
	if admission:
		pmo_filters["inpatient_record"] = admission

	prescriptions = frappe.get_all(
		"Patient Medication Order",
		filters=pmo_filters,
		fields=["name", "patient", "patient_name", "inpatient_record", "start_date"],
	)
	if not prescriptions:
		return []

	pmo_names = [p.name for p in prescriptions]

	# Build field list; include long_acting_frequency only if the column exists
	entry_fields = ["name", "parent", "drug", "drug_name", "dosage", "patient_frequency"]
	if frappe.db.has_column("Inpatient Medication Order Entry", "long_acting_frequency"):
		entry_fields.append("long_acting_frequency")

	# Filter directly on is_long_acting_medicine=1 — no Prescription Frequency lookup needed
	order_entries = frappe.get_all(
		"Inpatient Medication Order Entry",
		filters={
			"parent": ["in", pmo_names],
			"is_long_acting_medicine": 1,
		},
		fields=entry_fields,
	)
	if not order_entries:
		return []

	pmo_by_name = {p.name: p for p in prescriptions}

	# Admission Detail per admission (needed to query Medicine Given)
	admission_details = {}
	for p in prescriptions:
		adm = p.get("inpatient_record")
		if adm and adm not in admission_details:
			admission_details[adm] = frappe.db.get_value(
				"Admission Detail", {"admission": adm}, "name"
			)
	admission_details = {k: v for k, v in admission_details.items() if v}

	reminders = []
	for entry in order_entries:
		pmo = pmo_by_name.get(entry.parent)
		if not pmo or not pmo.get("inpatient_record"):
			continue

		adm = pmo.inpatient_record
		adm_detail = admission_details.get(adm)

		# Interval from long_acting_frequency on the child row itself
		long_acting_freq = entry.get("long_acting_frequency") or ""
		interval_days = _long_acting_frequency_interval_days(long_acting_freq)

		# Last given date for this drug in this admission
		last_given_date = None
		if adm_detail:
			last_rows = frappe.get_all(
				"Medicine Given",
				filters={
					"parent": adm_detail,
					"parenttype": "Admission Detail",
					"medicine_code": entry.drug,
				},
				fields=["date"],
				order_by="date desc",
				limit=1,
			)
			if last_rows and last_rows[0].get("date"):
				last_given_date = getdate(last_rows[0].date)

		if last_given_date is None:
			last_given_date = getdate(pmo.start_date) if pmo.start_date else today

		next_due = add_days(last_given_date, interval_days)

		# Show overdue up to 30 days back; ignore doses not yet due beyond the window
		if next_due > add_days(today, days_ahead) and next_due > today:
			continue
		if next_due < add_days(today, -30):
			continue

		if next_due < today:
			status = "overdue"
		elif next_due == today:
			status = "due_today"
		else:
			status = "due_soon"

		reminders.append({
			"patient": pmo.patient,
			"patient_name": pmo.get("patient_name"),
			"admission": adm,
			"prescription": entry.parent,
			"order_entry": entry.name,
			"drug": entry.drug,
			"drug_name": entry.drug_name or entry.drug,
			"dosage": entry.dosage,
			"frequency": long_acting_freq or entry.get("patient_frequency") or "Long Acting",
			"last_given_date": str(last_given_date),
			"next_due_date": str(next_due),
			"status": status,
		})

	def _sort_key(r):
		s = r["status"]
		d = getdate(r["next_due_date"])
		return (0 if s == "overdue" else 1 if s == "due_today" else 2, d)

	reminders.sort(key=_sort_key)
	return reminders

