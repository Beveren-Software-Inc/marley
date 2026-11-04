"""Read the legacy Oracle tables from an Excel export instead of a live link.

Every Oracle -> ERPNext button in Healthcare Settings offers two ways to read
the legacy database:

* **Direct connection** - SQL*Plus reads CLINIC2 live, which is what the
  comparison and reconcile jobs always did.
* **Excel** - the legacy table is exported once and uploaded here. The rows are
  loaded into an in-memory SQLite database, so the very same SQL the reconcile
  code already runs answers from the workbook instead of Oracle. Nothing has to
  be rewritten per button, and a locked / unreachable Oracle account never
  blocks a reconciliation.

The export has to keep the Oracle column names (``USR_NUM``, ``ADMISSION_NUM``,
``VISIT_CD`` ...): running ``select * from CLINIC2.<table>`` in SQL Developer
and saving the result as .xlsx is exactly what this module expects.
"""

from __future__ import annotations

import contextlib
import re
import sqlite3
import threading
from datetime import date, datetime, time
from typing import Any, Iterator

import frappe
from frappe import _
from frappe.utils import cint

from healthcare.api.discharge_checklist_import import _excel_file_path

# ---------------------------------------------------------------------------
# Which Oracle tables each button needs
# ---------------------------------------------------------------------------

# ``required`` lists the columns that identify the table, so a workbook whose
# sheet is not named after the table can still be recognised.
ORACLE_SOURCES: dict[str, dict[str, Any]] = {
	"ip_admission": {
		"label": "IP Admission",
		"doctype": "Inpatient Admission",
		"tables": [
			{
				"table": "IP_ADMISSION_01",
				"label": "Admissions",
				"required": ["ADMISSION_NUM", "PATIENT_NUM"],
			}
		],
	},
	"op_visit": {
		"label": "OP Visit",
		"doctype": "Patient Visit",
		"tables": [
			{
				"table": "VISIT_00_01",
				"label": "Outpatient visits",
				"required": ["VISIT_NUM", "VISIT_PATIENT_NUM"],
			}
		],
	},
	"prescriptions": {
		"label": "Reconcile Prescriptions",
		"doctype": "Patient Medication Order",
		"tables": [
			{
				"table": "PATIENT_VISIT_PRESCRIPTION",
				"label": "OP prescriptions",
				"required": ["VISIT_CD", "MEDICINE_CD"],
			},
			{
				"table": "PATIENT_VISIT_PRESCRIPTION_HIS",
				"label": "HIS prescriptions",
				"required": ["VISIT_CD", "MEDICINE_CD"],
			},
			{
				"table": "IP_ADMISSION_MEDICINE",
				"label": "IP prescriptions",
				"required": ["ADMISSION_NUM", "MEDICINE_CD"],
			},
		],
	},
	"long_acting": {
		"label": "Reconcile Long Acting Medicine",
		"doctype": "Long Acting Medicine",
		"tables": [
			{
				"table": "VISIT_00_04",
				"label": "Long acting / depot injections",
				"required": ["PATIENT_NUM", "MEDICATION"],
			}
		],
	},
	"clinical_notes": {
		"label": "Clinical Notes",
		"doctype": "Clinical Note",
		"tables": [
			{
				"table": "VISIT_00_01",
				"label": "OP visit diagnosis",
				"required": ["VISIT_NUM", "VISIT_PATIENT_NUM"],
			},
			{
				"table": "VISIT_00_01_HISTORY",
				"label": "OP diagnosis history",
				"required": ["VISIT_NUM", "VISIT_PATIENT_NUM"],
			},
			{
				"table": "IP_ADMISSION_DIAGNOSES",
				"label": "IP doctor notes",
				"required": ["ADMISSION_NUM", "DIAGNOSES_DESC"],
			},
			{
				"table": "IP_ADMISSION_01",
				"label": "Admissions (patient of each admission)",
				"required": ["ADMISSION_NUM", "PATIENT_NUM"],
			},
		],
	},
	"nursing_notes": {
		"label": "Nursing Notes",
		"doctype": "Main Nursing Note",
		"tables": [
			{
				"table": "IP_NURSING",
				"label": "IP nursing notes",
				"required": ["TRANS_NUM", "ADMISSION_NUM"],
			},
		],
	},
	"warning_messages": {
		"label": "Warning Messages",
		"doctype": "Warning Message",
		"tables": [
			{
				"table": "PATIENT_WARNING_MESSAGES",
				"label": "Patient warning messages",
				"required": ["WARNING_MESSAGE_NUM", "PATIENT_NUM"],
			},
		],
	},
	"user": {
		"label": "User",
		"doctype": "Oracle User",
		"tables": [
			{
				"table": "USR_00_01",
				"label": "Legacy users",
				"required": ["USR_NUM"],
			}
		],
	},
	"lab_tests": {
		"label": "Lab Tests",
		"doctype": "Lab Test",
		"tables": [
			{
				"table": "LAB_00_03",
				"label": "Lab test headers",
				"required": ["TRANS_NUM", "SUB_DR_GL_CODE"],
			},
			{
				"table": "LAB_00_04",
				"label": "Lab test results",
				"required": ["TRANS_NUM", "LAB_SUB_NUM"],
			},
		],
	},
}


def oracle_table_signatures() -> dict[str, set[str]]:
	"""Table name -> the columns that identify its export."""
	signatures: dict[str, set[str]] = {}
	for source in ORACLE_SOURCES.values():
		for table in source["tables"]:
			signatures[table["table"]] = set(table["required"])
	return signatures


def known_oracle_tables() -> set[str]:
	return set(oracle_table_signatures())


@frappe.whitelist()
def get_oracle_sources() -> dict[str, dict[str, Any]]:
	"""What each Oracle -> ERPNext button reads, and from which tables.

	The chooser dialog uses this to tell the user which Oracle table has to be
	exported before an Excel upload can be used.
	"""
	return {
		key: {
			"label": _(source["label"]),
			"doctype": source["doctype"],
			"tables": [
				{
					"table": table["table"],
					"label": _(table["label"]),
					"required": list(table["required"]),
					"hint": _("SELECT * FROM {0}.{1}").format(
						oracle_schema(), table["table"]
					),
				}
				for table in source["tables"]
			],
		}
		for key, source in ORACLE_SOURCES.items()
	}


def oracle_schema() -> str:
	return (frappe.conf.get("oracle_schema") or "CLINIC2").strip().upper()


# ---------------------------------------------------------------------------
# Excel reading
# ---------------------------------------------------------------------------


def normalize_files(files: Any) -> list[dict[str, str]]:
	"""Normalise what the dialog posts: a url, a list, or [{table, file_url}]."""
	if not files:
		return []
	if isinstance(files, str):
		try:
			files = frappe.parse_json(files)
		except (TypeError, ValueError):
			files = [files]
	if isinstance(files, dict):
		files = [files]
	if not isinstance(files, list):
		return []

	entries: list[dict[str, str]] = []
	for item in files:
		if isinstance(item, str):
			entries.append({"table": "", "file_url": item})
			continue
		if not isinstance(item, dict):
			continue
		url = item.get("file_url") or item.get("url")
		if not url:
			continue
		entries.append(
			{
				"table": str(item.get("table") or "").strip().upper(),
				"file_url": str(url),
			}
		)
	return entries


def _cell_text(value: Any) -> str:
	"""One Excel cell as the text SQL*Plus would have printed for it."""
	if value is None:
		return ""
	if isinstance(value, datetime):
		return value.strftime("%Y-%m-%d %H:%M:%S")
	if isinstance(value, date):
		return value.strftime("%Y-%m-%d")
	if isinstance(value, time):
		return value.strftime("%H:%M:%S")
	if isinstance(value, bool):
		return "1" if value else "0"
	if isinstance(value, float):
		return str(int(value)) if value.is_integer() else repr(value)
	return str(value).strip()


def _column_name(value: Any) -> str:
	"""Excel header -> Oracle column name (``Case No`` -> ``CASE_NO``)."""
	text = re.sub(r"[^0-9A-Za-z_]+", "_", str(value or "").strip())
	return text.strip("_").upper()


def read_excel_sheets(file_url: str) -> dict[str, dict[str, Any]]:
	"""Every sheet of the workbook: ``{title: {columns, rows}}``.

	The first non-empty row is the header row; its cells become the Oracle
	column names of the rows below.
	"""
	try:
		import openpyxl
	except ImportError:
		frappe.throw(
			_(
				"openpyxl is required to read Excel files. Install it in the bench environment: pip install openpyxl"
			)
		)

	path = _excel_file_path(file_url)
	workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)

	sheets: dict[str, dict[str, Any]] = {}
	for sheet in workbook.worksheets:
		rows_iter = sheet.iter_rows(values_only=True)
		headers: list[str] | None = None
		rows: list[dict[str, Any]] = []
		for raw in rows_iter:
			values = list(raw or ())
			if headers is None:
				if not any(str(value or "").strip() for value in values):
					continue
				headers = _unique_columns([_column_name(value) for value in values])
				continue
			if not any(str(value or "").strip() for value in values):
				continue
			rows.append(
				{
					headers[index]: value
					for index, value in enumerate(values)
					if index < len(headers) and headers[index]
				}
			)
		if headers:
			sheets[sheet.title] = {"columns": headers, "rows": rows}
	workbook.close()
	return sheets


def _unique_columns(columns: list[str]) -> list[str]:
	seen: dict[str, int] = {}
	unique: list[str] = []
	for column in columns:
		if not column:
			unique.append("")
			continue
		count = seen.get(column, 0) + 1
		seen[column] = count
		unique.append(column if count == 1 else f"{column}_{count}")
	return unique


def _match_table(declared: str, sheet_title: str, columns: list[str]) -> str:
	"""Which Oracle table this sheet holds ("" when it cannot be told)."""
	known = known_oracle_tables()
	if declared:
		return declared

	candidate = _column_name(sheet_title)
	if candidate in known:
		return candidate
	for table in known:
		if table in candidate:
			return table

	# Last resort: the sheet is not named after its table, so recognise the
	# table by the columns it must have.
	present = set(columns)
	matches = [table for table, required in oracle_table_signatures().items() if required <= present]
	if len(matches) == 1:
		return matches[0]
	longest = max((len(oracle_table_signatures()[table]) for table in matches), default=0)
	best = [table for table in matches if len(oracle_table_signatures()[table]) == longest]
	return best[0] if len(best) == 1 else ""


# ---------------------------------------------------------------------------
# SQL translation (the reconcile modules keep their Oracle SQL verbatim)
# ---------------------------------------------------------------------------

_ROWNUM_RE = re.compile(
	r"^\s*select\s+\*\s+from\s*\((.*)\)\s*where\s+rownum\s*<=\s*(\d+)\s*$", re.I | re.S
)
_ORDER_BY_RE = re.compile(r"\border\s+by\s+(.+)$", re.I | re.S)
_TO_CHAR_RE = re.compile(
	r"to_char\s*\(\s*([A-Za-z0-9_.]+)\s*,\s*'[^']*'\s*\)\s+as\s+([A-Za-z0-9_]+)", re.I
)


def to_sqlite(statement: str) -> tuple[str, str, int]:
	"""Oracle SELECT -> (SQLite SQL, order by clause, row limit)."""
	text = (statement or "").strip().rstrip(";").strip()

	limit = 0
	match = _ROWNUM_RE.match(text)
	if match:
		limit = cint(match.group(2))
		text = match.group(1).strip()

	# Oracle sorts NUMBER columns numerically; SQLite would sort the text. The
	# clause is dropped here and re-applied in Python so both agree.
	order_by = ""
	match = _ORDER_BY_RE.search(text)
	if match:
		order_by = match.group(1).strip()
		text = text[: match.start()].strip()

	schema = oracle_schema()
	if schema:
		text = re.sub(rf"\b{re.escape(schema)}\s*\.\s*", "", text, flags=re.I)
	text = _TO_CHAR_RE.sub(lambda m: f"{m.group(1)} as {m.group(2)}", text)
	return text, order_by, limit


def _natural_key(value: Any) -> tuple[int, float, str]:
	"""Numbers sort as numbers, everything else as trimmed upper-case text."""
	text = str(value if value is not None else "").strip().replace(",", "")
	try:
		return (0, float(text), "")
	except (TypeError, ValueError):
		return (1, 0.0, text.upper())


def _order_columns(order_by: str) -> list[tuple[str, bool]]:
	columns: list[tuple[str, bool]] = []
	for part in (order_by or "").split(","):
		tokens = [token for token in part.replace('"', " ").split() if token]
		if not tokens:
			continue
		column = tokens[0].split(".")[-1].upper()
		descending = tokens[-1].lower() == "desc"
		columns.append((column, descending))
	return columns


def _sort_rows(rows: list[dict[str, str]], order_by: str) -> None:
	# Stable sorts, applied from the last key to the first.
	for column, descending in reversed(_order_columns(order_by)):
		rows.sort(key=lambda row, name=column: _natural_key(row.get(name)), reverse=descending)


def _sqlite_text(value: Any) -> str:
	if value is None:
		return ""
	if isinstance(value, float):
		return str(int(value)) if value.is_integer() else repr(value)
	return str(value)


# ---------------------------------------------------------------------------
# The source itself
# ---------------------------------------------------------------------------


class ExcelOracleSource:
	"""Uploaded Oracle exports, queried with the SQL the reconcile code runs."""

	def __init__(self, files: Any = None, tables: list[str] | None = None):
		self.files = normalize_files(files)
		self.tables = [str(table or "").strip().upper() for table in tables or [] if table]
		self._data: dict[str, dict[str, Any]] = {}
		self._sources: dict[str, str] = {}
		self._loaded = False
		self._db: sqlite3.Connection | None = None

	# -- loading ---------------------------------------------------------
	def load(self) -> "ExcelOracleSource":
		if self._loaded:
			return self
		if not self.files:
			frappe.throw(_("Please upload the Oracle Excel export first."))
		for entry in self.files:
			self._load_file(entry["file_url"], entry["table"])
		self._loaded = True
		if not self._data:
			frappe.throw(
				_(
					"No sheet of the uploaded workbook matches an Oracle table. Save the export as "
					"Excel with the Oracle column names (SELECT * FROM {0}.<table>) and name the "
					"sheet after the table, then upload it again."
				).format(oracle_schema()),
				title=_("Oracle Excel Upload"),
			)
		self._check_required_columns()
		return self

	def _check_required_columns(self) -> None:
		"""Every export has to carry the columns that identify its table."""
		signatures = oracle_table_signatures()
		problems: list[str] = []
		for table, sheet in self._data.items():
			required = signatures.get(table)
			if not required:
				continue
			missing = sorted(required - set(sheet["columns"]))
			if missing:
				problems.append(f"{table}: {', '.join(missing)}")

		if problems:
			frappe.throw(
				_(
					"The uploaded Excel export is missing Oracle columns ({0}). Export the whole "
					"table - SELECT * FROM {1}.<table> in SQL Developer, saved as .xlsx - so every "
					"column is there."
				).format("; ".join(problems), oracle_schema()),
				title=_("Oracle Excel Upload"),
			)

	def _load_file(self, file_url: str, table: str) -> None:
		for title, sheet in read_excel_sheets(file_url).items():
			target = _match_table(table, title, sheet["columns"])
			if not target:
				continue
			bucket = self._data.setdefault(target, {"columns": [], "rows": []})
			for column in sheet["columns"]:
				if column and column not in bucket["columns"]:
					bucket["columns"].append(column)
			bucket["rows"].extend(sheet["rows"])
			self._sources.setdefault(target, file_url)

	# -- introspection ---------------------------------------------------
	def has_table(self, table: str) -> bool:
		self.load()
		return str(table or "").upper() in self._data

	def columns(self, table: str) -> list[str]:
		self.load()
		return list(self._data.get(str(table or "").upper(), {}).get("columns") or [])

	def describe(self, table: str) -> str:
		table = str(table or "").upper()
		file_url = self._sources.get(table) or ""
		name = file_url.split("/")[-1] if file_url else ""
		return f"{table} (Excel: {name})" if name else table

	def missing_tables(self) -> list[str]:
		"""Requested tables that no uploaded file provided."""
		self.load()
		return [table for table in self.tables if table and table not in self._data]

	def loaded_tables(self) -> list[str]:
		self.load()
		return sorted(self._data)

	# -- querying --------------------------------------------------------
	def query(self, statement: str) -> list[dict[str, str]]:
		self.load()
		sql, order_by, limit = to_sqlite(statement)
		try:
			cursor = self._connection().execute(sql)
			columns = [(column[0] or "").upper() for column in cursor.description or []]
			rows = [
				{name: _sqlite_text(value) for name, value in zip(columns, raw)}
				for raw in cursor.fetchall()
			]
		except sqlite3.Error as exc:
			frappe.throw(
				_(
					"The uploaded Excel export cannot answer this query: {0}<br><br>Upload "
					"the full table (SELECT * FROM {1}.&lt;table&gt; in SQL Developer, saved as "
					".xlsx) so every Oracle column is present. Tables loaded: {2}"
				).format(exc, oracle_schema(), ", ".join(self.loaded_tables()) or _("(none)")),
				title=_("Oracle Excel Upload"),
			)

		if order_by:
			_sort_rows(rows, order_by)
		if limit:
			rows = rows[:limit]
		return rows

	def _connection(self) -> sqlite3.Connection:
		if self._db is None:
			self._db = sqlite3.connect(":memory:")
			for table, sheet in self._data.items():
				self._create_table(table, sheet)
		return self._db

	def _create_table(self, table: str, sheet: dict[str, Any]) -> None:
		columns = [column for column in sheet.get("columns") or [] if column]
		connection = self._db
		if not columns or connection is None:
			return

		def quote(name: str) -> str:
			return '"' + name.replace('"', '""') + '"'

		# TEXT affinity: Oracle numbers and dates arrive as text, so a numeric
		# literal in the WHERE clause has to be compared as text as well.
		column_list = ", ".join(quote(column) for column in columns)
		column_defs = ", ".join(f"{quote(column)} TEXT" for column in columns)
		placeholders = ", ".join("?" for _ in columns)
		connection.execute(f'create table "{table}" ({column_defs})')

		rows = sheet.get("rows") or []
		if rows:
			connection.executemany(
				f'insert into "{table}" ({column_list}) values ({placeholders})',
				[tuple(_cell_text(row.get(column)) for column in columns) for row in rows],
			)
		connection.commit()


# ---------------------------------------------------------------------------
# Active source (per thread, so concurrent jobs never share a workbook)
# ---------------------------------------------------------------------------

_ACTIVE = threading.local()


def current_source() -> ExcelOracleSource | None:
	"""The Excel source in use, or None when the buttons read Oracle live."""
	return getattr(_ACTIVE, "source", None)


@contextlib.contextmanager
def excel_source(
	files: Any = None, *, tables: list[str] | None = None
) -> Iterator[ExcelOracleSource | None]:
	"""Make every Oracle query in this block answer from the uploaded Excel."""
	if not files:
		yield None
		return

	source = ExcelOracleSource(files, tables=tables).load()
	missing = source.missing_tables()
	if missing:
		frappe.throw(
			_("The upload is missing the Oracle table(s): {0}").format(", ".join(missing)),
			title=_("Oracle Excel Upload"),
		)

	previous = getattr(_ACTIVE, "source", None)
	_ACTIVE.source = source
	try:
		yield source
	finally:
		_ACTIVE.source = previous
