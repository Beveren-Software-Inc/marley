from datetime import datetime, time

import frappe
from frappe import _
from frappe.utils import add_days, get_datetime, get_time, getdate, now_datetime

# 06:00–13:59 Morning, 14:00–21:59 Evening, 22:00–05:59 Night
NURSING_SHIFT_WINDOWS = (
	("Morning", 6, 14),
	("Evening", 14, 22),
	("Night", 22, 6),
)


def _hour_in_window(hour: int, start_h: int, end_h: int) -> bool:
	if start_h < end_h:
		return start_h <= hour < end_h
	return hour >= start_h or hour < end_h


def get_nursing_shift_for_time(value: time | str | None) -> str:
	"""Return Morning, Evening, or Night for a time value."""
	if value is None:
		value = datetime.now().time()
	elif isinstance(value, str):
		value = get_time(value) or datetime.now().time()

	hour = value.hour
	for label, start_h, end_h in NURSING_SHIFT_WINDOWS:
		if _hour_in_window(hour, start_h, end_h):
			return label
	return "Morning"


def get_nursing_shift_for_datetime(value: datetime | str | None = None) -> str:
	if value is None:
		value = datetime.now()
	elif isinstance(value, str):
		value = get_datetime(value) or datetime.now()
	return get_nursing_shift_for_time(value.time())


def get_nursing_shift_window(at=None) -> tuple[str, datetime, datetime]:
	"""Return (Morning|Evening|Night, window_start, window_end) for today at ``at``.

	Night spans midnight: 22:00 → next day 06:00.
	"""
	at = get_datetime(at or now_datetime())
	label = get_nursing_shift_for_datetime(at)
	base = getdate(at)
	hour = at.hour

	if label == "Morning":
		start_dt = get_datetime(f"{base} 06:00:00")
		end_dt = get_datetime(f"{base} 13:59:59")
	elif label == "Evening":
		start_dt = get_datetime(f"{base} 14:00:00")
		end_dt = get_datetime(f"{base} 21:59:59")
	elif hour >= 22:
		start_dt = get_datetime(f"{base} 22:00:00")
		end_dt = get_datetime(f"{add_days(base, 1)} 05:59:59")
	else:
		start_dt = get_datetime(f"{add_days(base, -1)} 22:00:00")
		end_dt = get_datetime(f"{base} 05:59:59")

	return label, start_dt, end_dt



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
	"""True when a Nurse Task falls in today's Morning / Evening / Night window."""
	if not task_row:
		return False

	if window_start is None or window_end is None:
		_, window_start, window_end = get_nursing_shift_window(at)
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
	"""Portal helper: today's Morning / Evening / Night window (same as nursing notes)."""
	label, window_start, window_end = get_nursing_shift_window()
	from_time = {
		"Morning": "06:00:00",
		"Evening": "14:00:00",
		"Night": "22:00:00",
	}.get(label, "")
	to_time = {
		"Morning": "14:00:00",
		"Evening": "22:00:00",
		"Night": "06:00:00",
	}.get(label, "")

	return {
		"shift": {
			"name": label,
			"label": label,
			"from_time": from_time,
			"to_time": to_time,
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
