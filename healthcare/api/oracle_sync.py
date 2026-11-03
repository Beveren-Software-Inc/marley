"""Oracle -> ERPNext data sync: live comparison and insert-only import.

Covered tables
--------------
1. **IP Admission**

	Oracle  CLINIC2.IP_ADMISSION_01.ADMISSION_NUM
	ERPNext tabInpatient Admission.case_no

2. **OP Visit**

	Oracle  CLINIC2.VISIT_00_01.VISIT_NUM
	ERPNext tabPatient Visit.case_no

Rules of the road
-----------------
* Comparison is strictly read-only against Oracle (SELECT only).
* Import only ever *creates* records that exist in Oracle but not in ERPNext.
  Records that only exist in ERPNext are never touched or deleted - the ERPNext
  database also holds visits / admissions created directly by the hospital staff.

Oracle access goes through SQL*Plus (SQL*Net), either inside the Docker
container that hosts the database or through a locally installed client. The
connection can be overridden per site in site_config.json:

	{
		"oracle_docker_container": "oracle-free",   # "" -> use a local sqlplus
		"oracle_user": "sys",
		"oracle_password": "change-me",             # omit -> use $ORACLE_PWD in container
		"oracle_role": "sysdba",                    # "" -> no SYSDBA
		"oracle_dsn": "//localhost:1521/FREEPDB1",
		"oracle_schema": "CLINIC2"
	}
"""

from __future__ import annotations

import csv
import io
import shlex
import shutil
import subprocess
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, now_datetime

from healthcare.api.ip_admission_discharge_import import (
	_upsert_discharge,
	upsert_admission_discharge_from_row,
)
from healthcare.api.patient_info_import import _clean_oracle_num, _require_admin
from healthcare.api.patient_visit_import import upsert_patient_visit_from_row
from healthcare.healthcare.doctype.inpatient_admission.inpatient_admission import (
	ACTIVE_ADMISSION_STATUSES,
)

DEFAULT_CONTAINER = "oracle-free"
DEFAULT_DSN = "//localhost:1521/FREEPDB1"

ORACLE_SYNC_TIMEOUT = 300
INLINE_IMPORT_LIMIT = 200
SAMPLE_LIMIT = 50
PROGRESS_CACHE_PREFIX = "healthcare:oracle_sync:progress:"
PROGRESS_TTL = 7200

IP_ADMISSION_SYNC = frappe._dict(
	{
		"key": "ip_admission",
		"label": "IP Admission",
		"doctype": "Inpatient Admission",
		"oracle_table": "IP_ADMISSION_01",
		"oracle_key": "ADMISSION_NUM",
		"frappe_key": "case_no",
	}
)

OP_VISIT_SYNC = frappe._dict(
	{
		"key": "op_visit",
		"label": "OP Visit",
		"doctype": "Patient Visit",
		"oracle_table": "VISIT_00_01",
		"oracle_key": "VISIT_NUM",
		"frappe_key": "case_no",
	}
)

# Oracle VISIT_00_01 column -> row key used by healthcare.api.patient_visit_import.
OP_VISIT_COLUMN_MAP = {
	"VISIT_NUM": "case_no",
	"VISIT_DATE": "encounter_date",
	"VISIT_TYPE_NUM": "old_visit_type_",
	"VISIT_DOCTOR_NUM": "visit_doctor_num",
	"VISIT_PATIENT_NUM": "patient",
	"VISIT_DIAGNOSIS_DETAIL": "encounter_comment",
	"VISIT_DOCTOR_CHECKED_YN": "visit_doctor_checked",
	"VISIT_ALLERGIES_HISTORY": "visit_allergies_history",
	"VISIT_MEDICAL_HISTORY": "medical_history",
	"VISIT_PATIENT_SERIAL": "patient_serial",
	"SRV_TRANS_NUM": "srv_trans_no",
	"LAB_TRANS_NUM": "lab_trans_no",
	"IP_ADMISSION_NUM": "ip_admission_no",
	"RV_NUM": "rv_no",
	"BRANCH_NUM": "cost_center",
	"OP_VAT_NUM": "op_vat_no",
	"PATIENT_WEIGHT": "patient_weight",
	"VISIT_BP_1": "visit_bp_1",
	"VISIT_BP_2": "visit_bp2",
	"PRINT_COUNT": "print_count",
	"DAILY_TRANS_NUM": "daily_transfer_no",
}

# Oracle column -> row key used by healthcare.api.ip_admission_discharge_import.
# Only columns that the importer actually reads are mapped.
IP_ADMISSION_COLUMN_MAP = {
	"ADMISSION_NUM": "case_no",
	"PATIENT_NUM": "patient",
	"ADMISSION_DATE": "admission_date",
	"BED_NUM": "bed_no",
	"ADMISSION_BY_CPR": "admission_by_cpr",
	"ADMISSION_BY_NM": "admission_by_nm",
	"ADMISSION_BY_DOCTOR": "admission_by_doctor",
	"ADMISSION_REASON": "admission_reason",
	"DOCTOR_INSTRUCTION": "admission_instructions",
	"FAMILY_HISTORY": "family_history",
	"DISCHARGE_DATE": "discharge_date",
	"DISCHARGE_BY_USER": "discharged_by_user",
	"USER_NAME": "user_name",
	"APPEND_DATE": "append_date",
	"SPEND_DAYS": "spend_daysduration",
	"DISCHARGE_TREATMENT_PLAN": "discharge_treatment_plan",
	"DISCHARGE_REASON": "discharge_reason",
	"ESCORT": "escort_no",
	"ESCORT_NAME": "escort_name",
	"FORWARD_FROM": "forward_from",
	"ADMISION_STATUS": "status",
	"ADMISSION_TIME": "admission_time",
	"BELONGING": "belonging",
	"ADMISSION_COST": "admission_cost",
	"ILLENSS_HISTORY": "illness_history",
	"MANAGMENT": "management",
	"PROGRESS": "progress",
	"DISCHARGE_DIAGNOSIS": "discharge_diagnosis",
	"DISCHARGE_INSTRUCTION": "discharge_instructions",
	"ADMISSION_TYPE": "admission_type",
	"RESIDENT_DOCTOR_NUM": "residents_doctor_no",
	"RESIDENT_DOCTOR_NUM_2": "resident_doctor_2",
	"IS_MED_SUPR_REQUIRED": "is_med_supr_required",
	"MED_SUPR_SERV_CODE": "med_supr_service_code",
	"FIELD3": "field3",
	"FIELD4": "field4",
	"FIELD5": "field5",
	"FIELD6": "field6",
	"FIELD7": "field7",
	"BRANCH_NUM": "cost_center",
	"CR_ID": "cr_id",
	"CR_DATE": "cr_date",
	"UP_ID": "up_id",
	"UP_DATE": "up_date",
	"DISCHARGE_TIME": "discharge_time",
	"TODAY_CHARGE": "today_charge",
	"IP_CASE_MNGMT_YN": "ip_case_management",
	"IP_CASE_MNGMT_FEE": "ip_case_management_fee",
	"ROOM_CHARGES": "room_charges",
	"IP_RE_ADMISSION_COUNT": "ip_re_admission_count",
	"FINAL_DISCHARGE_USER_ID": "final_discharge_user_id",
	"FINAL_DISCHARGE_USER_DATE": "final_discharge_date",
	"MANAGEMENT_IN_HOSPITAL": "management_in_hospital",
	"IS_DAMA_YN": "is_dama_yn",
	"FINAL_EXAM_MENTAL": "final_exam_mental_status_summary",
	"DISCHARGE_CONDITIONS": "discharge_conditions",
	"PROGNOSIS_INST": "prognosis",
	"RECEIVING_DOC": "receiving_doctor",
	"NEXT_APP_DATE": "next_appointment_date",
	"NEXT_APP_TIME": "next_appointment_time",
	"TODAY_CHARGE_OBS": "today_charge_obs",
	"SPECIAL_CARE_YN": "special_care",
	"PACKAGE_NUM": "package_num",
	"ROOM_SERV_NUM": "room_service_no",
	"ROOM_GL_CODE": "room_gl_code",
	"CASE_SERV_NUM": "case_service_no",
	"CASE_GL_CODE": "case_gl_code",
	"MODE_OF_ADMISSION": "mode_of_admission",
	"RELATION_TO_PATIENT": "contact_relationship",
	"RELATION_CONTACT_NUM": "contact_mobile",
	"RELATION_EMAIL": "contact_email",
	"PERSON_TO_CONTACT_IN_EMER": "guardian_name",
	"PERSON_TO_CONTACT_MOB": "emergency_mobile_no",
	"DISCHARGE_TYPE": "discharge_type",
	"DISCHARGE_RESPONSIBILITY": "discharge_responsibility",
	"DISCHARGE_CONSUL_DOC_NUM": "discharge_consultation_doc_no",
	"DAMA_TYPE": "dama_type",
	"DAMA_REASON": "dama_reason",
	"DAMA_GP_DOC_NUM": "dama_gp_doc_no",
	"DAMA_CONSU_DOC_NUM": "dama_consultation_doc_no",
	"DAMA_RECEP_DOC_NUM": "dama_reception_doc_no",
	"DAMA_NURSE_DOC_NUM": "dama_nurse_no",
	"DAMA_NURSE_DOC_NUM_2": "dama_nurse_no_2",
	"DAMA_RELATIONSHIP": "dama_relationship",
	"DAMA_NAME": "dama_name",
	"DAMA_CPR_ID": "dama_cpr_id",
	"DAMA_PHONE_CELL": "dama_phone_cell",
	"DAMA_EMAIL": "dama_email",
	"DISCHARGE_MEDIC_STOPED_WHY": "discharge_medic_stopped_why",
	"DISCHARGE_FLAG": "discharge_flag",
	"ADMISSION_NUM_MASTER": "admission_num_master",
	"ADMISSION_NUM_OLD": "admission_no_old",
	"REMARKS_AFTER_DISCHARGE": "remark",
}

# ---------------------------------------------------------------------------
# Oracle plumbing (SQL*Plus over SQL*Net)
# ---------------------------------------------------------------------------


def _oracle_schema() -> str:
	return (frappe.conf.get("oracle_schema") or "CLINIC2").strip().upper()


def _login_spec(*, shell: bool) -> str:
	"""Build a SQL*Plus login string such as sys/pwd@//host:port/service as sysdba."""
	user = frappe.conf.get("oracle_user") or "sys"
	password = frappe.conf.get("oracle_password")
	dsn = frappe.conf.get("oracle_dsn") or DEFAULT_DSN
	role = (frappe.conf.get("oracle_role") or "sysdba").strip()

	if password is None:
		if not shell:
			frappe.throw(
				_(
					"Set oracle_password in site_config.json (there is no container "
					"environment to read $ORACLE_PWD from)."
				)
			)
		password_part = '"$ORACLE_PWD"'
	elif shell:
		password_part = shlex.quote(str(password))
	else:
		password_part = str(password)

	spec = f"{user}/{password_part}@{dsn}"
	if role:
		spec += f" as {role}"
	return spec


def _sqlplus_command() -> list[str]:
	container = frappe.conf.get("oracle_docker_container")
	if container is None:
		container = DEFAULT_CONTAINER
	container = str(container).strip()

	if container:
		if not shutil.which("docker"):
			frappe.throw(_("Docker is not available on this server; cannot reach the Oracle container."))
		return [
			"docker",
			"exec",
			"-i",
			container,
			"bash",
			"-lc",
			f"sqlplus -s {_login_spec(shell=True)}",
		]

	if shutil.which("sqlplus"):
		return ["sqlplus", "-s", _login_spec(shell=False)]

	frappe.throw(
		_("No Oracle client available. Install SQL*Plus or set oracle_docker_container in site_config.json.")
	)


def _oracle_error_message(output: str, stderr: str) -> str | None:
	for line in f"{output}\n{stderr}".splitlines():
		line = line.strip()
		if line.startswith(("ORA-", "SP2-", "PLS-", "TNS-")):
			return line
	return None


def _run_sql(statement: str, *, timeout: int = ORACLE_SYNC_TIMEOUT) -> str:
	"""Run one SELECT through SQL*Plus and return the raw CSV output."""
	statement = statement.strip().rstrip(";")
	script = "\n".join(
		[
			"set markup csv on quote on delimiter '|'",
			"set pagesize 0 feedback off heading on verify off trimspool on",
			"set linesize 32767 long 1048576 longchunksize 1048576",
			"whenever sqlerror exit sql.sqlcode",
			f"{statement};",
			"exit",
		]
	)

	try:
		proc = subprocess.run(
			_sqlplus_command(),
			input=script + "\n",
			capture_output=True,
			text=True,
			timeout=timeout,
		)
	except subprocess.TimeoutExpired:
		frappe.throw(_("Oracle query timed out after {0} seconds.").format(timeout))
	except OSError as exc:
		frappe.throw(_("Could not start the Oracle client: {0}").format(exc))

	output = (proc.stdout or "").strip()
	error = _oracle_error_message(output, (proc.stderr or "").strip())
	if error:
		frappe.throw(_("Oracle error: {0}").format(error), title=_("Oracle Sync"))
	return output


def _query(statement: str) -> list[dict[str, str]]:
	output = _run_sql(statement)
	if not output:
		return []
	reader = csv.DictReader(io.StringIO(output), delimiter="|", quotechar='"')
	return [
		{(key or "").strip().upper(): value for key, value in row.items()} for row in reader
	]


def _table_columns(table: str) -> list[dict[str, str]]:
	"""Column names and data types of an Oracle table (cached for an hour)."""
	cache = frappe.cache()
	cache_key = f"healthcare:oracle_sync:columns:{_oracle_schema()}.{table}"
	cached = cache.get_value(cache_key)
	if cached:
		return cached

	rows = _query(
		"select column_name, data_type from all_tab_columns "
		f"where owner = '{_oracle_schema()}' and table_name = '{table}' "
		"order by column_id"
	)
	columns = [
		{
			"name": (row.get("COLUMN_NAME") or "").strip(),
			"type": (row.get("DATA_TYPE") or "").strip().upper(),
		}
		for row in rows
		if row.get("COLUMN_NAME")
	]
	if not columns:
		frappe.throw(
			_("Oracle table {0}.{1} was not found or is not readable.").format(
				_oracle_schema(), table
			)
		)
	cache.set_value(cache_key, columns, expires_in_sec=3600)
	return columns


def _select_list(table: str) -> str:
	"""SELECT list that renders DATE/TIMESTAMP columns as ISO strings.

	CLOBs are selected as they are: ``dbms_lob.substr(col, 32000, 1)`` looks
	harmless but the value has to fit the 4000-byte VARCHAR2 of a SQL context,
	so on a multibyte database (AL32UTF8) any note longer than ~2000 Arabic
	characters fails the *whole* statement with ORA-06502. SQL*Plus prints the
	LOB itself (``set long`` / ``longchunksize`` in ``_run_sql``), and because
	the legacy note columns hold at most 4000 characters it stays on one line.
	"""
	parts: list[str] = []
	for column in _table_columns(table):
		name = column["name"]
		if column["type"] == "DATE" or column["type"].startswith("TIMESTAMP"):
			parts.append(f"to_char({name}, 'YYYY-MM-DD HH24:MI:SS') as {name}")
		else:
			parts.append(name)
	return ", ".join(parts)


def _fetch_rows(
	table: str, where: str = "", order_by: str = "", limit: int = 0
) -> list[dict[str, str]]:
	statement = f"select {_select_list(table)} from {_oracle_schema()}.{table}"
	if where:
		statement += f" where {where}"
	if order_by:
		statement += f" order by {order_by}"
	if limit:
		statement = f"select * from ({statement}) where rownum <= {cint(limit)}"
	return _query(statement)


# ---------------------------------------------------------------------------
# Value helpers
# ---------------------------------------------------------------------------


def _norm_key(value: Any) -> str:
	"""Normalise an Oracle NUMBER / ERPNext Data key for set comparison."""
	text = _clean_oracle_num(value).strip().replace(",", "")
	if not text:
		return ""
	try:
		number = float(text)
	except (TypeError, ValueError):
		return text.upper()
	return str(int(number)) if number.is_integer() else str(number)


def _key_literal(value: str) -> str:
	"""Render a normalised key as a safe SQL literal."""
	if value.lstrip("-").isdigit():
		return value
	return "'" + value.replace("'", "''") + "'"


def _in_clause(keys: list[str]) -> str:
	return ", ".join(_key_literal(key) for key in keys)


def _sort_key(value: str) -> tuple[int, float, str]:
	try:
		return (0, float(value), "")
	except (TypeError, ValueError):
		return (1, 0.0, value)


def _status_label(raw_status: Any) -> str:
	"""Oracle ADMISION_STATUS: 1 = Admitted, 2 = Discharged."""
	text = str(raw_status or "").strip().lower()
	return "Discharged" if text in ("2", "2.0", "discharged", "discharge") else "Admitted"


# ---------------------------------------------------------------------------
# Comparison (read only)
# ---------------------------------------------------------------------------


def _oracle_admission_keys() -> set[str]:
	rows = _query(
		f"select {IP_ADMISSION_SYNC.oracle_key} from "
		f"{_oracle_schema()}.{IP_ADMISSION_SYNC.oracle_table} "
		f"where {IP_ADMISSION_SYNC.oracle_key} is not null"
	)
	return {key for key in (_norm_key(row.get(IP_ADMISSION_SYNC.oracle_key)) for row in rows) if key}


def _erpnext_admission_keys() -> set[str]:
	values = frappe.db.sql_list(
		"select case_no from `tabInpatient Admission` where ifnull(case_no, '') != ''"
	)
	return {key for key in (_norm_key(value) for value in values) if key}


def _admission_rows_for_keys(keys: list[str]) -> list[dict[str, str]]:
	if not keys:
		return []
	return _fetch_rows(
		IP_ADMISSION_SYNC.oracle_table,
		where=f"{IP_ADMISSION_SYNC.oracle_key} in ({_in_clause(keys)})",
		order_by=IP_ADMISSION_SYNC.oracle_key,
	)


def _patient_names(patient_ids: list[str]) -> dict[str, str]:
	unique = [patient for patient in {*patient_ids} if patient]
	if not unique:
		return {}
	rows = frappe.db.sql(
		"select name, patient_name from `tabPatient` where name in %(names)s",
		{"names": tuple(unique)},
		as_dict=True,
	)
	return {row.get("name"): row.get("patient_name") for row in rows}


@frappe.whitelist()
def compare_ip_admissions(sample_limit: int = SAMPLE_LIMIT) -> dict:
	"""Read-only diff between Oracle IP_ADMISSION_01 and tabInpatient Admission."""
	_require_admin()
	sample_limit = max(cint(sample_limit) or SAMPLE_LIMIT, 0)

	oracle_keys = _oracle_admission_keys()
	erpnext_keys = _erpnext_admission_keys()

	missing_keys = sorted(oracle_keys - erpnext_keys, key=_sort_key)
	extra_keys = sorted(erpnext_keys - oracle_keys, key=_sort_key)

	sample_keys = missing_keys[:sample_limit] if sample_limit else missing_keys
	rows = _admission_rows_for_keys(sample_keys)

	patient_ids = [_clean_oracle_num(row.get("PATIENT_NUM")) for row in rows]
	patients = _patient_names(patient_ids)

	missing: list[dict[str, Any]] = []
	for row in rows:
		patient = _clean_oracle_num(row.get("PATIENT_NUM"))
		missing.append(
			{
				"case_no": _clean_oracle_num(row.get("ADMISSION_NUM")),
				"patient": patient,
				"patient_name": patients.get(patient) or _("(patient not found in ERPNext)"),
				"patient_exists": patient in patients if patient else False,
				"admission_date": (row.get("ADMISSION_DATE") or "")[:19],
				"discharge_date": (row.get("DISCHARGE_DATE") or "")[:19],
				"status": _status_label(row.get("ADMISION_STATUS")),
				"bed_num": _clean_oracle_num(row.get("BED_NUM")),
			}
		)

	return {
		"label": IP_ADMISSION_SYNC.label,
		"doctype": IP_ADMISSION_SYNC.doctype,
		"oracle_table": f"{_oracle_schema()}.{IP_ADMISSION_SYNC.oracle_table}",
		"oracle_key": IP_ADMISSION_SYNC.oracle_key,
		"frappe_key": IP_ADMISSION_SYNC.frappe_key,
		"source_count": len(oracle_keys),
		"target_count": len(erpnext_keys),
		"missing_count": len(missing_keys),
		"extra_count": len(extra_keys),
		"missing_keys": sample_keys,
		"extra_keys": extra_keys[:sample_limit] if sample_limit else extra_keys,
		"missing": missing,
		"importable_count": sum(1 for row in missing if row["patient_exists"]),
		"blocked_count": sum(1 for row in missing if not row["patient_exists"]),
		"sample_limited": len(missing_keys) > len(sample_keys),
		"checked_at": str(now_datetime()),
	}


# ---------------------------------------------------------------------------
# Import (insert missing only)
# ---------------------------------------------------------------------------


def _row_from_oracle(raw: dict[str, str]) -> dict[str, Any]:
	"""Convert an Oracle IP_ADMISSION_01 row into the importer's row format."""
	row: dict[str, Any] = {}
	for oracle_column, row_key in IP_ADMISSION_COLUMN_MAP.items():
		row[row_key] = raw.get(oracle_column)

	row["case_no"] = _clean_oracle_num(raw.get("ADMISSION_NUM"))
	row["patient"] = _clean_oracle_num(raw.get("PATIENT_NUM"))
	return row


def _set_progress(job_key: str, payload: dict[str, Any]) -> None:
	frappe.cache().set_value(f"{PROGRESS_CACHE_PREFIX}{job_key}", payload, expires_in_sec=PROGRESS_TTL)


def _blocking_admission(patient: str) -> dict | None:
	"""An open local admission that would stop us from admitting the patient again."""
	if not patient:
		return None
	rows = frappe.get_all(
		"Inpatient Admission",
		filters={"patient": patient, "status": ["in", list(ACTIVE_ADMISSION_STATUSES)]},
		fields=["name", "case_no", "status"],
		order_by="admission_date desc",
		limit=1,
	)
	return rows[0] if rows else None


def _resolve_blocker(blocker: dict) -> bool:
	"""Discharge a blocking local admission when Oracle already has it discharged."""
	case_no = _clean_oracle_num(blocker.get("case_no") or blocker.get("name"))
	if not case_no:
		return False
	rows = _admission_rows_for_keys([case_no])
	if not rows or _status_label(rows[0].get("ADMISION_STATUS")) != "Discharged":
		return False

	payload = _row_from_oracle(rows[0])
	if not payload.get("patient"):
		return False

	# Reuse the discharge path of the Excel importer: it fills the draft Discharge
	# document the staff already created and submits it, which moves the admission
	# to Discharged. Admissions that Oracle still keeps open are never touched.
	_upsert_discharge(payload, case_no, payload["patient"])
	return (
		frappe.db.get_value("Inpatient Admission", case_no, "status") not in ACTIVE_ADMISSION_STATUSES
	)


@frappe.whitelist()
def get_import_status(job_key: str = "ip_admission") -> dict:
	"""Progress of the last/ongoing import run (polled by the settings dialog)."""
	_require_admin()
	return frappe.cache().get_value(f"{PROGRESS_CACHE_PREFIX}{job_key}") or {
		"state": "idle",
		"job_key": job_key,
		"processed": 0,
		"total": 0,
	}


def _import_ip_admission_rows(
	keys: list[str], *, job_key: str = "ip_admission", resolve_blockers: int = 0
) -> dict[str, Any]:
	total = len(keys)
	result: dict[str, Any] = {
		"created": 0,
		"skipped": [],
		"blocked": [],
		"errors": [],
		"processed": 0,
		"total": total,
		"rows": [],
	}
	_set_progress(job_key, {"state": "running", "processed": 0, "total": total, "created": 0})

	for index, key in enumerate(keys, start=1):
		try:
			rows = _admission_rows_for_keys([key])
			if not rows:
				result["skipped"].append({"case_no": key, "reason": "vanished_in_oracle"})
			else:
				payload = _row_from_oracle(rows[0])
				blocker = _blocking_admission(payload.get("patient"))
				if blocker and cint(resolve_blockers) and _resolve_blocker(blocker):
					blocker = None

				if blocker:
					result["blocked"].append(
						{
							"case_no": key,
							"reason": "active_admission_exists",
							"blocking_admission": blocker.get("name"),
							"blocking_status": blocker.get("status"),
						}
					)
				else:
					outcome = upsert_admission_discharge_from_row(payload) or {}
					status = outcome.get("status") or "unknown"
					if status == "skip_no_patient":
						result["skipped"].append({"case_no": key, "reason": "patient_not_found"})
					else:
						result["created"] += 1
						result["rows"].append(
							{
								"case_no": key,
								"action": status,
								"discharge_action": outcome.get("discharge_action"),
							}
						)
		except Exception as exc:  # noqa: BLE001 - one bad row must not stop the run
			frappe.db.rollback()
			frappe.log_error(title=f"Oracle sync import failed: {key}", message=frappe.get_traceback())
			result["errors"].append({"case_no": key, "error": str(exc)})

		result["processed"] = index
		if index % 25 == 0:
			frappe.db.commit()
		_set_progress(
			job_key,
			{
				"state": "running",
				"processed": index,
				"total": total,
				"created": result["created"],
			},
		)

	frappe.db.commit()
	result["state"] = "finished"
	_set_progress(
		job_key,
		{
			"state": "finished",
			"processed": total,
			"total": total,
			"created": result["created"],
			"result": result,
		},
	)
	return result


@frappe.whitelist()
def import_ip_admissions(dry_run: int = 1, limit: int = 0, resolve_blockers: int = 0) -> dict:
	"""Create the Inpatient Admissions that Oracle has and ERPNext does not."""
	_require_admin()
	dry_run = cint(dry_run)
	limit = cint(limit)
	resolve_blockers = cint(resolve_blockers)

	missing_keys = sorted(_oracle_admission_keys() - _erpnext_admission_keys(), key=_sort_key)
	if limit:
		missing_keys = missing_keys[:limit]

	if dry_run:
		rows = _admission_rows_for_keys(missing_keys[:SAMPLE_LIMIT])
		patients = _patient_names([_clean_oracle_num(row.get("PATIENT_NUM")) for row in rows])
		preview = []
		for row in rows:
			patient = _clean_oracle_num(row.get("PATIENT_NUM"))
			blocker = _blocking_admission(patient)
			preview.append(
				{
					"case_no": _clean_oracle_num(row.get("ADMISSION_NUM")),
					"patient": patient,
					"patient_name": patients.get(patient) or "",
					"admission_date": (row.get("ADMISSION_DATE") or "")[:19],
					"status": _status_label(row.get("ADMISION_STATUS")),
					"blocking_admission": (blocker or {}).get("name"),
				}
			)
		return {"dry_run": True, "total": len(missing_keys), "preview": preview}

	if not missing_keys:
		_set_progress("ip_admission", {"state": "finished", "processed": 0, "total": 0, "created": 0})
		return {
			"queued": False,
			"result": {
				"created": 0,
				"skipped": [],
				"blocked": [],
				"errors": [],
				"total": 0,
				"state": "finished",
			},
		}

	if len(missing_keys) > INLINE_IMPORT_LIMIT:
		_set_progress("ip_admission", {"state": "queued", "processed": 0, "total": len(missing_keys)})
		frappe.enqueue(
			"healthcare.api.oracle_sync.run_ip_admission_import",
			queue="long",
			timeout=7200,
			keys=missing_keys,
			resolve_blockers=resolve_blockers,
		)
		return {"queued": True, "total": len(missing_keys), "job_key": "ip_admission"}

	return {
		"queued": False,
		"result": _import_ip_admission_rows(missing_keys, resolve_blockers=resolve_blockers),
	}


def run_ip_admission_import(keys: list[str] | None = None, resolve_blockers: int = 0) -> dict:
	"""Background entry point (also callable from the bench console)."""
	keys = keys or sorted(_oracle_admission_keys() - _erpnext_admission_keys(), key=_sort_key)
	return _import_ip_admission_rows(keys, resolve_blockers=resolve_blockers)


# ---------------------------------------------------------------------------
# OP Visit (VISIT_00_01 -> Patient Visit)
# ---------------------------------------------------------------------------


def _oracle_visit_keys() -> set[str]:
	rows = _query(
		f"select {OP_VISIT_SYNC.oracle_key} from "
		f"{_oracle_schema()}.{OP_VISIT_SYNC.oracle_table} "
		f"where {OP_VISIT_SYNC.oracle_key} is not null"
	)
	return {key for key in (_norm_key(row.get(OP_VISIT_SYNC.oracle_key)) for row in rows) if key}


def _erpnext_visit_keys() -> set[str]:
	values = frappe.db.sql_list(
		"select case_no from `tabPatient Visit` where ifnull(case_no, '') != ''"
	)
	return {key for key in (_norm_key(value) for value in values) if key}


def _visit_rows_for_keys(keys: list[str]) -> list[dict[str, str]]:
	if not keys:
		return []
	return _fetch_rows(
		OP_VISIT_SYNC.oracle_table,
		where=f"{OP_VISIT_SYNC.oracle_key} in ({_in_clause(keys)})",
		order_by=OP_VISIT_SYNC.oracle_key,
	)


def _row_from_oracle_visit(raw: dict[str, str]) -> dict[str, Any]:
	"""Convert an Oracle VISIT_00_01 row into the Patient Visit importer row format."""
	row: dict[str, Any] = {}
	for oracle_column, row_key in OP_VISIT_COLUMN_MAP.items():
		row[row_key] = raw.get(oracle_column)

	row["case_no"] = _clean_oracle_num(raw.get("VISIT_NUM"))
	row["patient"] = _clean_oracle_num(raw.get("VISIT_PATIENT_NUM"))
	return row


@frappe.whitelist()
def compare_op_visits(sample_limit: int = SAMPLE_LIMIT) -> dict:
	"""Read-only diff between Oracle VISIT_00_01 and tabPatient Visit."""
	_require_admin()
	sample_limit = max(cint(sample_limit) or SAMPLE_LIMIT, 0)

	oracle_keys = _oracle_visit_keys()
	erpnext_keys = _erpnext_visit_keys()

	missing_keys = sorted(oracle_keys - erpnext_keys, key=_sort_key)
	extra_keys = sorted(erpnext_keys - oracle_keys, key=_sort_key)

	sample_keys = missing_keys[:sample_limit] if sample_limit else missing_keys
	rows = _visit_rows_for_keys(sample_keys)

	patient_ids = [_clean_oracle_num(row.get("VISIT_PATIENT_NUM")) for row in rows]
	patients = _patient_names(patient_ids)

	missing: list[dict[str, Any]] = []
	for row in rows:
		patient = _clean_oracle_num(row.get("VISIT_PATIENT_NUM"))
		missing.append(
			{
				"case_no": _clean_oracle_num(row.get("VISIT_NUM")),
				"patient": patient,
				"patient_name": patients.get(patient) or _("(patient not found in ERPNext)"),
				"patient_exists": patient in patients if patient else False,
				"encounter_date": (row.get("VISIT_DATE") or "")[:19],
				"visit_type": _clean_oracle_num(row.get("VISIT_TYPE_NUM")),
				"doctor": _clean_oracle_num(row.get("VISIT_DOCTOR_NUM")),
				"branch": _clean_oracle_num(row.get("BRANCH_NUM")),
			}
		)

	return {
		"label": OP_VISIT_SYNC.label,
		"doctype": OP_VISIT_SYNC.doctype,
		"oracle_table": f"{_oracle_schema()}.{OP_VISIT_SYNC.oracle_table}",
		"oracle_key": OP_VISIT_SYNC.oracle_key,
		"frappe_key": OP_VISIT_SYNC.frappe_key,
		"source_count": len(oracle_keys),
		"target_count": len(erpnext_keys),
		"missing_count": len(missing_keys),
		"extra_count": len(extra_keys),
		"missing_keys": sample_keys,
		"extra_keys": extra_keys[:sample_limit] if sample_limit else extra_keys,
		"missing": missing,
		"importable_count": len(missing_keys),
		"sample_limited": len(missing_keys) > len(sample_keys),
		"checked_at": str(now_datetime()),
	}


def _import_op_visit_rows(keys: list[str], *, job_key: str = "op_visit") -> dict[str, Any]:
	total = len(keys)
	result: dict[str, Any] = {
		"created": 0,
		"updated": 0,
		"skipped": [],
		"errors": [],
		"processed": 0,
		"total": total,
		"rows": [],
	}
	_set_progress(job_key, {"state": "running", "processed": 0, "total": total, "created": 0})

	for index, key in enumerate(keys, start=1):
		try:
			rows = _visit_rows_for_keys([key])
			if not rows:
				result["skipped"].append({"case_no": key, "reason": "vanished_in_oracle"})
			else:
				payload = _row_from_oracle_visit(rows[0])
				outcome = upsert_patient_visit_from_row(payload) or {}
				status = outcome.get("status") or "unknown"
				if status in ("skip_no_patient", "skip_no_date"):
					result["skipped"].append({"case_no": key, "reason": status})
				elif status == "updated":
					# Should be rare on a missing-only import; still count it.
					result["updated"] += 1
					result["rows"].append({"case_no": key, "action": status})
				elif status == "created":
					result["created"] += 1
					result["rows"].append({"case_no": key, "action": status})
				else:
					result["skipped"].append({"case_no": key, "reason": status})
		except Exception as exc:  # noqa: BLE001 - one bad row must not stop the run
			frappe.db.rollback()
			frappe.log_error(title=f"Oracle OP visit sync failed: {key}", message=frappe.get_traceback())
			result["errors"].append({"case_no": key, "error": str(exc)})

		result["processed"] = index
		if index % 25 == 0:
			frappe.db.commit()
		_set_progress(
			job_key,
			{
				"state": "running",
				"processed": index,
				"total": total,
				"created": result["created"],
				"updated": result["updated"],
			},
		)

	frappe.db.commit()
	result["state"] = "finished"
	_set_progress(
		job_key,
		{
			"state": "finished",
			"processed": total,
			"total": total,
			"created": result["created"],
			"updated": result["updated"],
			"result": result,
		},
	)
	return result


@frappe.whitelist()
def import_op_visits(dry_run: int = 1, limit: int = 0) -> dict:
	"""Create the Patient Visits that Oracle has and ERPNext does not."""
	_require_admin()
	dry_run = cint(dry_run)
	limit = cint(limit)

	missing_keys = sorted(_oracle_visit_keys() - _erpnext_visit_keys(), key=_sort_key)
	if limit:
		missing_keys = missing_keys[:limit]

	if dry_run:
		rows = _visit_rows_for_keys(missing_keys[:SAMPLE_LIMIT])
		patients = _patient_names([_clean_oracle_num(row.get("VISIT_PATIENT_NUM")) for row in rows])
		preview = []
		for row in rows:
			patient = _clean_oracle_num(row.get("VISIT_PATIENT_NUM"))
			preview.append(
				{
					"case_no": _clean_oracle_num(row.get("VISIT_NUM")),
					"patient": patient,
					"patient_name": patients.get(patient) or "",
					"encounter_date": (row.get("VISIT_DATE") or "")[:19],
				}
			)
		return {"dry_run": True, "total": len(missing_keys), "preview": preview}

	if not missing_keys:
		_set_progress("op_visit", {"state": "finished", "processed": 0, "total": 0, "created": 0})
		return {
			"queued": False,
			"result": {
				"created": 0,
				"updated": 0,
				"skipped": [],
				"errors": [],
				"total": 0,
				"state": "finished",
			},
		}

	if len(missing_keys) > INLINE_IMPORT_LIMIT:
		_set_progress("op_visit", {"state": "queued", "processed": 0, "total": len(missing_keys)})
		frappe.enqueue(
			"healthcare.api.oracle_sync.run_op_visit_import",
			queue="long",
			timeout=7200,
			keys=missing_keys,
		)
		return {"queued": True, "total": len(missing_keys), "job_key": "op_visit"}

	return {"queued": False, "result": _import_op_visit_rows(missing_keys)}


def run_op_visit_import(keys: list[str] | None = None) -> dict:
	"""Background entry point (also callable from the bench console)."""
	keys = keys or sorted(_oracle_visit_keys() - _erpnext_visit_keys(), key=_sort_key)
	return _import_op_visit_rows(keys)


# ---------------------------------------------------------------------------
# Diagnostics
# ---------------------------------------------------------------------------


@frappe.whitelist()
def test_oracle_connection() -> dict:
	"""Cheap connectivity probe used by the settings dialog."""
	_require_admin()
	rows = _query(
		"select banner_full as banner, "
		"sys_context('USERENV', 'DB_NAME') as db_name, "
		"sys_context('USERENV', 'CON_NAME') as container_name "
		"from v$version where rownum = 1"
	)
	row = rows[0] if rows else {}
	container = frappe.conf.get("oracle_docker_container")
	return {
		"ok": bool(row),
		"driver": "sqlplus",
		"docker_container": container if container is not None else DEFAULT_CONTAINER,
		"dsn": frappe.conf.get("oracle_dsn") or DEFAULT_DSN,
		"schema": _oracle_schema(),
		"database": row.get("DB_NAME"),
		"container_name": row.get("CONTAINER_NAME"),
		"banner": (row.get("BANNER") or "").splitlines()[0] if row.get("BANNER") else "",
	}
