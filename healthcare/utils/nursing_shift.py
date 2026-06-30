"""Nursing shift helpers (Morning / Evening / Night) from clock time."""

from __future__ import annotations

from datetime import datetime, time

from frappe.utils import get_datetime, get_time

# 06:00–13:59 Morning, 14:00–21:59 Evening, 22:00–05:59 Night
NURSING_SHIFT_WINDOWS = (
	("Morning", 6, 14),
	("Evening", 14, 22),
	("Night", 22, 6),
)

NURSING_SHIFTS = tuple(label for label, _start, _end in NURSING_SHIFT_WINDOWS)


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
