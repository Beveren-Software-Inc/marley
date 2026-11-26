# Copyright (c) 2026, healthcare contributors

from healthcare.api.oracle_clean_check import CLEAN_CHECKS, _normalize_row


def test_clean_checks_cover_core_entities():
	keys = {key for key, _label, _dt, _fn in CLEAN_CHECKS}
	for expected in (
		"patients",
		"ip_admission",
		"op_visit",
		"prescriptions",
		"clinical_notes",
		"ect_details",
		"lab_tests",
		"legacy_sales",
	):
		assert expected in keys


def test_normalize_missing_total():
	row = _normalize_row(
		"vitals",
		"Vital Signs",
		"Vital Signs",
		{"oracle_rows": 100, "matched_vitals": 90, "missing_total": 10, "in_sync": False},
	)
	assert row["status"] == "missing"
	assert row["missing_count"] == 10
	assert row["oracle_count"] == 100
	assert row["erpnext_count"] == 90


def test_normalize_in_sync():
	row = _normalize_row(
		"patients",
		"Patients",
		"Patient",
		{"oracle_patients": 5, "erpnext_patients": 5, "missing_patients": 0, "in_sync": True},
	)
	assert row["status"] == "ok"
	assert row["in_sync"] is True


def test_normalize_error():
	row = _normalize_row("x", "X", "X", None, error="boom")
	assert row["status"] == "error"
	assert row["detail"] == "boom"
