import frappe
from frappe import _
from frappe.utils import getdate, nowdate, add_days


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


@frappe.whitelist()
def get_daily_medication_chart(admission: str, date: str | None = None) -> dict:
	"""Return medications for an admission for a given day, grouped by session.

	Uses:
	- Patient Medication Order (care_context = Inpatient Admission, inpatient_record = admission, docstatus = 1)
	- Child table Inpatient Medication Order Entry (medication_orders)
	- Prescription Frequency (dosage_strength times) to derive sessions
	- Medicine Given rows from Admission Detail to mark administrations
	"""
	if not admission:
		frappe.throw(_("Inpatient Admission is required"))

	selected_date = getdate(date or nowdate())

	# Get all submitted medication orders for this admission
	prescriptions = frappe.get_all(
		"Patient Medication Order",
		filters={
			"inpatient_record": admission,
			"docstatus": 1,
		},
		fields=["name", "start_date", "end_date"],
	)
	if not prescriptions:
		return {"sessions": _get_sessions(), "rows": []}

	pmo_names = [p.name for p in prescriptions]
	print("hapa nafika kwelii", str(pmo_names))
	# Fetch medication rows (Inpatient Medication Order Entry)
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
		],
	)

	if not order_rows:
		return {"sessions": _get_sessions(), "rows": []}

	# Map frequencies to times (via fixtures or child table dosage_strength on Prescription Frequency)
	frequency_times: dict[str, list[int]] = {}
	for freq_name in {
		row.get("patient_frequency") for row in order_rows if row.get("patient_frequency")
	}:
		# Try to get dosage_strength child table if defined
		times: list[int] = []
		try:
			doc = frappe.get_doc("Prescription Frequency", freq_name)
			for child in getattr(doc, "dosage_strength", []) or []:
				if getattr(child, "strength_time", None):
					hour = int(str(child.strength_time).split(":")[0])
					times.append(hour)
		except frappe.DoesNotExistError:
			pass
		frequency_times[freq_name] = times

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

	# Index given by (medicine_code, session_id)
	given_index: dict[tuple[str, str], dict] = {}
	for row in given_rows:
		med_code = row.get("medicine_code")
		if not med_code or not row.get("time"):
			continue
		hour = int(str(row.time).split(":")[0])
		session_id = _time_to_session(hour)
		key = (med_code, session_id)
		# If multiple, keep the latest
		given_index[key] = {
			"name": row.name,
			"time": row.time,
			"user": row.user,
		}

	sessions = _get_sessions()

	rows_out = []
	for entry in order_rows:
		drug = entry.get("drug")
		if not drug:
			continue
		freq_name = entry.get("patient_frequency")
		times = frequency_times.get(freq_name, []) if freq_name else []

		slot_list = []
		for session_id, _label, _s, _e in SESSION_WINDOWS:
			# Is this session due? If any frequency time falls in this window
			due = False
			for h in times:
				if _s <= h < _e:
					due = True
					break
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

		rows_out.append(
			{
				"order_entry": entry.name,
				"prescription": entry.parent,
				"drug": drug,
				"drug_name": entry.get("drug_name"),
				"dosage": entry.get("dosage"),
				"dosage_form": entry.get("dosage_form"),
				"patient_frequency": freq_name,
				"slots": slot_list,
			}
		)

	return {
		"sessions": sessions,
		"rows": rows_out,
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


# Fallback: interval in days when Prescription Frequency has long_acting=1 but no reminder_interval_days.
# Used for known names only; other long-acting frequencies default to 7 if reminder_interval_days is not set.
DEFAULT_LONG_ACTING_INTERVAL_DAYS = {"Q1W": 7, "Q2W": 14, "Q3W": 21, "Q4W": 28}


def _get_long_acting_frequency_names_and_intervals():
	"""Return (list of frequency names with long_acting=1, dict name -> interval_days)."""
	rows = frappe.get_all(
		"Prescription Frequency",
		filters={"long_acting": 1},
		fields=["name"],
	)
	names = [r.name for r in rows if r.name]
	if not names:
		return [], {}

	intervals = {}
	for name in names:
		interval = None
		try:
			interval = frappe.db.get_value("Prescription Frequency", name, "reminder_interval_days")
		except Exception:
			pass
		if interval is not None and interval != "":
			try:
				intervals[name] = int(interval)
			except (TypeError, ValueError):
				intervals[name] = DEFAULT_LONG_ACTING_INTERVAL_DAYS.get(name, 7)
		else:
			intervals[name] = DEFAULT_LONG_ACTING_INTERVAL_DAYS.get(name, 7)
	return names, intervals


@frappe.whitelist()
def get_long_acting_medication_reminders(
	patient: str | None = None,
	admission: str | None = None,
	days_ahead: int | None = 7,
) -> list[dict]:
	"""Return long-acting medication reminders: doses due today, soon, or overdue.

	Long-acting = Prescription Frequency with long_acting checkbox checked.
	Interval in days = reminder_interval_days on the frequency if set, else a default (e.g. Q1W=7, Q2W=14, …).
	Next due date = last Medicine Given date (or order start_date) + interval.
	"""
	days_ahead = int(days_ahead or 7)
	today = getdate(nowdate())

	long_acting_names, long_acting_intervals = _get_long_acting_frequency_names_and_intervals()
	if not long_acting_names:
		return []

	# All submitted IP medication orders that have at least one long-acting frequency
	filters = {"care_context": "Inpatient Admission", "docstatus": 1}
	if patient:
		filters["patient"] = patient
	if admission:
		filters["inpatient_record"] = admission

	prescriptions = frappe.get_all(
		"Patient Medication Order",
		filters=filters,
		fields=["name", "patient", "patient_name", "inpatient_record", "start_date", "end_date"],
	)
	if not prescriptions:
		return []

	pmo_names = [p.name for p in prescriptions]
	# Order entries with long-acting frequency (from Prescription Frequency long_acting=1)
	order_entries = frappe.get_all(
		"Inpatient Medication Order Entry",
		filters={
			"parent": ["in", pmo_names],
			"patient_frequency": ["in", long_acting_names],
		},
		fields=["name", "parent", "drug", "drug_name", "dosage", "patient_frequency"],
	)
	if not order_entries:
		return []

	# Build prescription lookup
	pmo_by_name = {p.name: p for p in prescriptions}

	# Admission Detail names per admission
	admission_details = {}
	for p in prescriptions:
		adm = p.get("inpatient_record")
		if not adm:
			continue
		if adm not in admission_details:
			admission_details[adm] = frappe.db.get_value("Admission Detail", {"admission": adm}, "name")
	admission_details = {k: v for k, v in admission_details.items() if v}

	reminders = []
	for entry in order_entries:
		pmo = pmo_by_name.get(entry.parent)
		if not pmo or not pmo.get("inpatient_record"):
			continue
		adm = pmo.inpatient_record
		adm_detail = admission_details.get(adm)
		interval_days = long_acting_intervals.get(entry.patient_frequency)
		if not interval_days:
			continue

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

		# Only include if next_due is in range [today - 30, today + days_ahead] (show overdue up to 30 days)
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
			"frequency": entry.patient_frequency,
			"last_given_date": str(last_given_date),
			"next_due_date": str(next_due),
			"status": status,
		})

	# Sort: overdue first, then due_today, then due_soon by date
	def _sort_key(r):
		s = r["status"]
		d = getdate(r["next_due_date"])
		return (0 if s == "overdue" else 1 if s == "due_today" else 2, d)

	reminders.sort(key=_sort_key)
	return reminders

