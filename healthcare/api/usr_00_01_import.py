"""Import the legacy Oracle user table (USR_00_01) into the Oracle User doctype.

Every legacy table keeps the person who created or last changed a row in its
``CR_ID`` / ``UP_ID`` columns. Those columns do not hold names: they hold
``USR_00_01.USR_NUM``. Importing this table is what turns a CR ID / CUP ID
(the legacy CR_ID / UP_ID values) into the name of the user; the helpers at the
bottom of this module do that lookup for any legacy row.

The legacy clear-text password column (``PSWD``) is never imported.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

import frappe
from frappe import _
from frappe.utils import get_datetime, now_datetime

from healthcare.api.discharge_checklist_import import _clean_oracle_num, _excel_file_path
from healthcare.healthcare.doctype.oracle_user.oracle_user import USER_GROUP_MAP, USER_NAME_CACHE_KEY

ORACLE_TABLE = "USR_00_01"

# Oracle column / Excel header -> Oracle User fieldname.
EXCEL_HEADER_MAP = {
	"USR_NUM": "user_num",
	"USER_NUM": "user_num",
	"USR_NO": "user_num",
	"USER_NO": "user_num",
	"LOG_NAM": "login_name",
	"LOG_NAME": "login_name",
	"LOGIN_NAME": "login_name",
	"USR_NAM": "user_name",
	"USR_NAME": "user_name",
	"USER_NAME": "user_name",
	"DISPLAY_NAME": "display_name",
	"DISPLAY_NAME_AR": "display_name_ar",
	"EMP_COD": "employee_code",
	"EMP_CODE": "employee_code",
	"EMPLOYEE_CODE": "employee_code",
	"USR_PER": "user_permission",
	"USER_PER": "user_permission",
	"USER_PERMISSION": "user_permission",
	"STA_FLG": "status_flag",
	"STATUS_FLAG": "status_flag",
	"GL_CODE": "gl_code",
	"GROUP_NUM": "group_num",
	"GROUP_NAME": "user_group",
	"USER_GROUP": "user_group",
	"IS_SPECIAL_USER": "is_special_user",
	"ALLOW_FOR_ISSUE_LETTER": "allow_for_issue_letter",
	"POSTING_RIGHTS": "posting_rights",
	"INV_EXPIRY_ALERT": "inventory_expiry_alert",
	"DOC_STAMP_INFO": "doc_stamp_info",
	"DESIGNATION_EN": "designation_en",
	"DESIGNATION_AR": "designation_ar",
	"CR_ID": "created_by_user_num",
	"CR_DATE": "created_on",
	"UP_ID": "updated_by_user_num",
	"UP_DATE": "updated_on",
}

# Legacy passwords are stored in clear text in USR_00_01.PSWD - never import them.
IGNORED_HEADERS = {"PSWD", "PASSWORD", "PWD"}

CORE_FIELDS = ("user_num", "login_name", "user_name", "display_name", "status_flag", "group_num")

USER_NAME_CACHE_TTL = 86400


def _require_admin() -> None:
	frappe.only_for(("System Manager", "Healthcare Administrator"))


def _schema() -> str:
	return (frappe.conf.get("oracle_schema") or "CLINIC2").strip().upper()


def _normalize_header(cell: Any) -> str:
	"""Excel header -> Oracle User fieldname ("" for password / unknown columns)."""
	if cell is None:
		return ""
	text = str(cell).strip().upper().replace(" ", "_").replace("-", "_")
	if not text or text in IGNORED_HEADERS:
		return ""
	return EXCEL_HEADER_MAP.get(text, "")


def _raw_header(cell: Any) -> str:
	if cell is None:
		return ""
	return str(cell).strip().upper().replace(" ", "_").replace("-", "_")


def _to_text(value: Any) -> str:
	if value is None:
		return ""
	return str(value).strip()


def _user_num(value: Any) -> int | None:
	"""USR_NUM in a cell; ``None`` when the cell has no user number.

	User number 0 is a real legacy user (ZAHID HUSAIN), so it is not "missing".
	"""
	text = _clean_oracle_num(value)
	if not text:
		return None
	try:
		return int(float(text))
	except (TypeError, ValueError):
		return None


def _to_int(value: Any) -> int:
	return _user_num(value) or 0


def _to_flag(value: Any) -> int:
	if value is None:
		return 0
	if isinstance(value, bool):
		return int(value)
	text = str(value).strip().upper()
	if not text:
		return 0
	if text in ("Y", "YES", "T", "TRUE"):
		return 1
	if text in ("N", "NO", "F", "FALSE"):
		return 0
	try:
		return 1 if int(float(text)) else 0
	except ValueError:
		return 0


def _to_datetime(value: Any) -> str | None:
	if value is None or value == "":
		return None
	if isinstance(value, datetime):
		return value.strftime("%Y-%m-%d %H:%M:%S")
	if isinstance(value, date):
		return value.strftime("%Y-%m-%d 00:00:00")
	text = str(value).strip()
	if not text:
		return None
	try:
		return get_datetime(text).strftime("%Y-%m-%d %H:%M:%S")
	except Exception:
		return None


def _row_values(user_num: int, row: dict[str, Any]) -> dict[str, Any]:
	"""Oracle User values for one Excel row (the legacy PSWD is not read)."""
	group_num = _to_int(row.get("group_num"))
	status_flag = _to_int(row.get("status_flag"))
	return {
		"user_num": user_num,
		"login_name": _to_text(row.get("login_name")),
		"user_name": _to_text(row.get("user_name")),
		"display_name": _to_text(row.get("display_name")),
		"display_name_ar": _to_text(row.get("display_name_ar")),
		"status_flag": status_flag,
		"is_active": 1 if status_flag == 1 else 0,
		"group_num": group_num,
		"user_group": _to_text(row.get("user_group")) or USER_GROUP_MAP.get(group_num, ""),
		"user_permission": _to_int(row.get("user_permission")),
		"employee_code": _clean_oracle_num(row.get("employee_code")),
		"designation_en": _to_text(row.get("designation_en")),
		"designation_ar": _to_text(row.get("designation_ar")),
		"is_special_user": _to_flag(row.get("is_special_user")),
		"allow_for_issue_letter": _to_flag(row.get("allow_for_issue_letter")),
		"posting_rights": _to_flag(row.get("posting_rights")),
		"inventory_expiry_alert": _to_flag(row.get("inventory_expiry_alert")),
		"gl_code": _to_text(row.get("gl_code")),
		"doc_stamp_info": _to_text(row.get("doc_stamp_info")),
		"created_by_user_num": _clean_oracle_num(row.get("created_by_user_num")),
		"created_on": _to_datetime(row.get("created_on")),
		"updated_by_user_num": _clean_oracle_num(row.get("updated_by_user_num")),
		"updated_on": _to_datetime(row.get("updated_on")),
	}


def _parse_user_rows(file_url: str) -> dict[str, Any]:
	"""Read every sheet of the USR_00_01 export and return normalised rows."""
	try:
		import openpyxl
	except ImportError:
		frappe.throw(
			_("openpyxl is required to read Excel files. Install it in the bench environment: pip install openpyxl")
		)

	path = _excel_file_path(file_url)
	wb = openpyxl.load_workbook(path, read_only=True, data_only=True)

	rows: dict[str, dict[str, Any]] = {}
	sheets: list[str] = []
	mapped_fields: set[str] = set()
	unmapped_columns: set[str] = set()
	ignored_columns: set[str] = set()
	excel_rows = skipped_without_user_num = duplicate_rows = 0

	for sheet_name in wb.sheetnames:
		ws = wb[sheet_name]
		rows_iter = ws.iter_rows(values_only=True)
		try:
			header_row = next(rows_iter)
		except StopIteration:
			continue

		headers = [_normalize_header(cell) for cell in header_row]
		if "user_num" not in headers:
			continue

		sheets.append(sheet_name)
		mapped_fields.update(header for header in headers if header)
		for cell in header_row:
			raw = _raw_header(cell)
			if not raw:
				continue
			if raw in IGNORED_HEADERS:
				ignored_columns.add(raw)
			elif raw not in EXCEL_HEADER_MAP:
				unmapped_columns.add(raw)

		for raw_row in rows_iter:
			if not raw_row or all(cell is None or str(cell).strip() == "" for cell in raw_row):
				continue
			excel_rows += 1
			line: dict[str, Any] = {}
			for idx, field in enumerate(headers):
				if not field or idx >= len(raw_row):
					continue
				line[field] = raw_row[idx]

			user_num = _user_num(line.get("user_num"))
			if user_num is None:
				skipped_without_user_num += 1
				continue
			key = str(user_num)
			if key in rows:
				duplicate_rows += 1
			rows[key] = _row_values(user_num, line)

	wb.close()

	return {
		"rows": list(rows.values()),
		"sheets": sheets,
		"excel_rows": excel_rows,
		"skipped_without_user_num": skipped_without_user_num,
		"duplicate_rows": duplicate_rows,
		"missing_columns": [field for field in CORE_FIELDS if field not in mapped_fields],
		"unmapped_columns": sorted(unmapped_columns),
		"ignored_columns": sorted(ignored_columns),
		"oracle_table": f"{_schema()}.{ORACLE_TABLE}",
		"read_from": "excel",
	}


def _rows_from_oracle() -> dict[str, Any]:
	"""Read USR_00_01 straight from Oracle (the direct connection).

	Only the columns the doctype maps are selected, so the legacy clear-text
	password column never leaves the legacy database.
	"""
	from healthcare.api.oracle_sync import _query, _table_columns

	schema = _schema()
	available = {str(column.get("name") or "").upper() for column in _table_columns(ORACLE_TABLE)}
	columns = [column for column in EXCEL_HEADER_MAP if column in available]
	if not columns:
		frappe.throw(
			_("Oracle table {0}.{1} has none of the known USR_00_01 columns.").format(
				schema, ORACLE_TABLE
			)
		)

	raw_rows = _query(f"select {', '.join(columns)} from {schema}.{ORACLE_TABLE}")

	rows: dict[str, dict[str, Any]] = {}
	skipped_without_user_num = duplicate_rows = 0
	for raw in raw_rows or []:
		line = {EXCEL_HEADER_MAP[column]: raw.get(column) for column in columns}
		user_num = _user_num(line.get("user_num"))
		if user_num is None:
			skipped_without_user_num += 1
			continue
		key = str(user_num)
		if key in rows:
			duplicate_rows += 1
		rows[key] = _row_values(user_num, line)

	return {
		"rows": list(rows.values()),
		"sheets": [f"{schema}.{ORACLE_TABLE}"],
		"excel_rows": len(raw_rows or []),
		"skipped_without_user_num": skipped_without_user_num,
		"duplicate_rows": duplicate_rows,
		"missing_columns": [],
		"unmapped_columns": [],
		"ignored_columns": [],
		"oracle_table": f"{schema}.{ORACLE_TABLE}",
		"read_from": "oracle",
	}


def _load_user_rows(file_url: str = "") -> dict[str, Any]:
	"""Rows from the uploaded Excel export, or live from Oracle when there is none."""
	file_url = (file_url or "").strip()
	if file_url:
		return _parse_user_rows(file_url)
	return _rows_from_oracle()


def _existing_user_nums(user_nums: list[int]) -> set[str]:
	if not user_nums:
		return set()
	return set(frappe.get_all("Oracle User", filters={"user_num": ["in", user_nums]}, pluck="name"))


def _preview_sample(rows: list[dict[str, Any]], limit: int = 10) -> list[dict[str, Any]]:
	sample: list[dict[str, Any]] = []
	for row in rows[:limit]:
		sample.append(
			{
				"user_num": row["user_num"],
				"login_name": row["login_name"],
				"user_name": row["user_name"],
				"display_name": row["display_name"],
				"user_group": row["user_group"],
				"is_active": row["is_active"],
			}
		)
	return sample


@frappe.whitelist()
def preview_user_00_01_import(file_url: str = "") -> dict[str, Any]:
	"""Count what importing USR_00_01 would create / update.

	``file_url`` reads the uploaded Excel export; without it the table is read
	straight from Oracle (the direct connection), so both ways of getting the
	legacy users start from the same preview.
	"""
	_require_admin()
	parsed = _load_user_rows(file_url)
	rows = parsed["rows"]
	if not rows:
		frappe.throw(
			_(
				"No rows with a user number (USR_NUM) were found. Upload the USR_00_01 Excel export including its header row."
			)
		)

	existing = _existing_user_nums([row["user_num"] for row in rows])
	to_create = [row for row in rows if str(row["user_num"]) not in existing]

	return {
		"ok": True,
		"oracle_table": parsed["oracle_table"],
		"doctype": "Oracle User",
		"read_from": parsed["read_from"],
		"sheets": parsed["sheets"],
		"excel_rows": parsed["excel_rows"],
		"valid_rows": len(rows),
		"to_create": len(to_create),
		"to_update": len(rows) - len(to_create),
		"skipped_without_user_num": parsed["skipped_without_user_num"],
		"duplicate_rows": parsed["duplicate_rows"],
		"missing_columns": parsed["missing_columns"],
		"unmapped_columns": parsed["unmapped_columns"],
		"ignored_columns": parsed["ignored_columns"],
		"sample": _preview_sample(rows),
	}


def _comparable(value: Any) -> str:
	"""Normalise a value so "same value" survives datetime / number casts."""
	if value is None:
		return ""
	if isinstance(value, datetime):
		return value.strftime("%Y-%m-%d %H:%M:%S")
	if isinstance(value, date):
		return f"{value.strftime('%Y-%m-%d')} 00:00:00"
	if isinstance(value, (int, float)):
		return _clean_oracle_num(value)
	return str(value).strip()


def _upsert_user(values: dict[str, Any], file_url: str) -> str:
	"""Create / update one Oracle User. Returns created / updated / unchanged."""
	name = str(values["user_num"])
	provenance = {"source_file_url": file_url, "imported_on": now_datetime()}

	if not frappe.db.exists("Oracle User", name):
		frappe.get_doc({"doctype": "Oracle User", **values, **provenance}).insert(ignore_permissions=True)
		return "created"

	doc = frappe.get_doc("Oracle User", name)
	changes = {
		field: value for field, value in values.items() if _comparable(doc.get(field)) != _comparable(value)
	}
	if not changes:
		frappe.db.set_value("Oracle User", name, provenance, update_modified=False)
		return "unchanged"

	doc.update(changes)
	doc.update(provenance)
	doc.save(ignore_permissions=True)
	return "updated"


@frappe.whitelist()
def import_user_00_01(file_url: str = "") -> dict[str, Any]:
	"""Import USR_00_01 into Oracle User (safe to run again).

	Without ``file_url`` the table is read straight from Oracle, exactly like the
	other Oracle -> ERPNext buttons when the direct connection is chosen.
	"""
	_require_admin()
	parsed = _load_user_rows(file_url)
	rows = parsed["rows"]
	source = (file_url or "").strip() or parsed["oracle_table"]
	if not rows:
		frappe.throw(
			_(
				"No rows with a user number (USR_NUM) were found. Upload the USR_00_01 Excel export including its header row."
			)
		)

	created = updated = unchanged = 0
	error_samples: list[str] = []

	for values in rows:
		savepoint = f"oracle_user_{values['user_num']}"[:60]
		try:
			frappe.db.savepoint(savepoint)
			status = _upsert_user(values, source)
			if status == "created":
				created += 1
			elif status == "updated":
				updated += 1
			else:
				unchanged += 1
		except Exception as error:
			frappe.db.rollback(save_point=savepoint)
			error_samples.append(f"{values['user_num']}: {error}")

	frappe.db.commit()
	frappe.cache().delete_value(USER_NAME_CACHE_KEY)

	message = _("USR_00_01 imported: {0} created, {1} updated, {2} unchanged, {3} failed.").format(
		created, updated, unchanged, len(error_samples)
	)

	return {
		"ok": not error_samples,
		"oracle_table": parsed["oracle_table"],
		"read_from": parsed["read_from"],
		"created": created,
		"updated": updated,
		"unchanged": unchanged,
		"errors": len(error_samples),
		"error_samples": error_samples[:10],
		"ignored_columns": parsed["ignored_columns"],
		"message": message,
	}


def get_user_name_map(force: bool = False) -> dict[str, str]:
	"""``USR_NUM`` (as text) -> name, for every imported Oracle user."""
	if not force:
		cached = frappe.cache().get_value(USER_NAME_CACHE_KEY)
		if cached:
			return cached

	names: dict[str, str] = {}
	for row in frappe.get_all(
		"Oracle User",
		fields=["user_num", "user_name", "display_name", "login_name"],
		limit_page_length=0,
		order_by="user_num asc",
	):
		name = _to_text(row.display_name) or _to_text(row.user_name) or _to_text(row.login_name)
		if row.user_num is None or not name:
			continue
		names[_clean_oracle_num(row.user_num)] = name

	frappe.cache().set_value(USER_NAME_CACHE_KEY, names, expires_in_sec=USER_NAME_CACHE_TTL)
	return names


def get_user_name(user_num: Any) -> str:
	"""Name behind a legacy ``CR_ID`` / ``CUP ID`` (``UP_ID``) value."""
	key = _clean_oracle_num(user_num)
	if not key:
		return ""
	return get_user_name_map().get(key, "")


def resolve_user_names(user_nums: Any) -> dict[str, str]:
	"""``{user_num: name}`` for the values that exist in Oracle User."""
	mapping = get_user_name_map()
	resolved: dict[str, str] = {}
	for value in user_nums or []:
		key = _clean_oracle_num(value)
		if key and key in mapping:
			resolved[key] = mapping[key]
	return resolved


def add_user_names(rows: list[dict], fields: tuple[str, ...] = ("cr_id", "up_id")) -> list[dict]:
	"""Attach ``<field>_name`` to legacy rows so a CR ID / CUP ID shows a person.

	Usage from any importer / report / list API::

		from healthcare.api.usr_00_01_import import add_user_names
		rows = add_user_names(rows, ("cr_id", "up_id", "notes_cr_id"))
	"""
	mapping = get_user_name_map()
	for row in rows:
		for field in fields:
			name = mapping.get(_clean_oracle_num(row.get(field)))
			if name:
				row[f"{field}_name"] = name
	return rows


@frappe.whitelist()
def get_oracle_user_name(user_num: str | int | None = None) -> str:
	"""Whitelisted lookup so a form can render a CR ID / CUP ID as the user's name."""
	return get_user_name(user_num)
