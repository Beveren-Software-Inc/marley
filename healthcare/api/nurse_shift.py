import frappe
from frappe import _
from frappe.utils import add_days, get_datetime, getdate, now_datetime


def _time_to_seconds(value) -> int:
	if value is None:
		return 0
	if isinstance(value, str):
		parts = value.strip().split(":")
		if len(parts) < 2:
			return 0
		seconds = int(parts[0]) * 3600 + int(parts[1]) * 60
		if len(parts) > 2:
			seconds += int(float(parts[2]))
		return seconds
	if hasattr(value, "total_seconds"):
		return int(value.total_seconds())
	return 0


def _seconds_to_time_str(seconds: int) -> str:
	seconds = max(0, int(seconds))
	hours = (seconds // 3600) % 24
	minutes = (seconds % 3600) // 60
	return f"{hours:02d}:{minutes:02d}:00"


def get_current_nurse_shift(at=None):
	"""Return the Nurse Shift row active at ``at`` (defaults to now)."""
	at = get_datetime(at or now_datetime())
	now_secs = at.hour * 3600 + at.minute * 60 + at.second

	rows = frappe.get_all(
		"Nurse Shift",
		fields=["name", "nurse_shift", "from_time", "to_time"],
		order_by="from_time asc",
	)
	for row in rows:
		from_secs = _time_to_seconds(row.from_time)
		to_secs = _time_to_seconds(row.to_time)
		if from_secs == to_secs:
			continue
		if from_secs < to_secs:
			if from_secs <= now_secs < to_secs:
				return row
		elif now_secs >= from_secs or now_secs < to_secs:
			return row
	return None


def get_current_shift_window(at=None):
	"""Return (shift_row, window_start, window_end) for the active nurse shift."""
	at = get_datetime(at or now_datetime())
	shift = get_current_nurse_shift(at)
	if not shift:
		return None, None, None

	from_secs = _time_to_seconds(shift.from_time)
	to_secs = _time_to_seconds(shift.to_time)
	at_secs = at.hour * 3600 + at.minute * 60 + at.second
	base_date = getdate(at)

	if from_secs > to_secs and at_secs < to_secs:
		start_date = add_days(base_date, -1)
	else:
		start_date = base_date

	start_dt = get_datetime(f"{start_date} {_seconds_to_time_str(from_secs)}")
	if from_secs < to_secs:
		end_dt = get_datetime(f"{start_date} {_seconds_to_time_str(to_secs)}")
	else:
		end_dt = get_datetime(f"{add_days(start_date, 1)} {_seconds_to_time_str(to_secs)}")

	return shift, start_dt, end_dt


def task_belongs_to_shift(task_row, shift_row=None, window_start=None, window_end=None, at=None):
	"""True when a Nurse Task belongs to the given/current shift."""
	if not task_row:
		return False

	shift_row = shift_row or get_current_nurse_shift(at)
	if not shift_row:
		return True

	task_shift = (task_row.get("shift") if isinstance(task_row, dict) else getattr(task_row, "shift", None)) or ""
	if task_shift:
		return task_shift == shift_row.name

	if window_start is None or window_end is None:
		_, window_start, window_end = get_current_shift_window(at)
	if not window_start or not window_end:
		return True

	scheduled = get_datetime(
		task_row.get("scheduled_time") if isinstance(task_row, dict) else getattr(task_row, "scheduled_time", None)
	)
	if not scheduled:
		return False
	return window_start <= scheduled <= window_end


@frappe.whitelist()
def get_current_nurse_shift_info():
	"""Portal helper: active Nurse Shift and its datetime window."""
	shift, window_start, window_end = get_current_shift_window()
	if not shift:
		return {"shift": None, "window_start": None, "window_end": None}

	return {
		"shift": {
			"name": shift.name,
			"label": shift.nurse_shift or shift.name,
			"from_time": str(shift.from_time or ""),
			"to_time": str(shift.to_time or ""),
		},
		"window_start": str(window_start) if window_start else None,
		"window_end": str(window_end) if window_end else None,
	}


@frappe.whitelist()
def get_nurse_shifts(search=None):
	"""List Nurse Shift records for dropdowns."""
	filters = {}
	if search:
		filters["nurse_shift"] = ["like", f"%{search}%"]

	rows = frappe.get_all(
		"Nurse Shift",
		filters=filters or None,
		fields=["name", "nurse_shift", "from_time", "to_time"],
		order_by="from_time asc",
		limit=50,
	)
	return [
		{
			"name": row.name,
			"label": row.nurse_shift or row.name,
			"from_time": str(row.from_time or ""),
			"to_time": str(row.to_time or ""),
		}
		for row in rows
	]
