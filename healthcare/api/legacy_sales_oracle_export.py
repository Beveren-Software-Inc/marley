"""Export INV_00_01 / INV_00_02 (SAL IP+OP) from Oracle to Excel for reconcile upload.

When SQL*Plus / the Oracle container is available, this writes two workbooks
under private/files with Oracle column names so
``oracle_excel_source`` recognises the sheets. Prefer SQL Developer + the
scripts in ``healthcare/api/sql/pharmacy_dispensed_extraction.sql`` when the
export is large.
"""

from __future__ import annotations

import os
from typing import Any

import frappe
from frappe import _

from healthcare.api.oracle_sync import _query, test_oracle_connection
from healthcare.api.patient_info_import import _require_admin

HEADER_TABLE = "INV_00_01"
DETAIL_TABLE = "INV_00_02"
TRANS_TYPE = "SAL"


def _schema() -> str:
	from healthcare.api.oracle_excel_source import oracle_schema

	return oracle_schema()


def _write_xlsx(rows: list[dict[str, Any]], path: str, sheet_name: str) -> int:
	try:
		import openpyxl
	except ImportError:
		frappe.throw(_("openpyxl is required to write Excel files."))

	wb = openpyxl.Workbook()
	ws = wb.active
	ws.title = (sheet_name or "Sheet1")[:31]
	if not rows:
		wb.save(path)
		return 0
	columns = list(rows[0].keys())
	ws.append(columns)
	for row in rows:
		ws.append([row.get(col) for col in columns])
	wb.save(path)
	return len(rows)


def _attach_file(path: str, label: str) -> dict[str, str]:
	file_name = os.path.basename(path)
	with open(path, "rb") as handle:
		content = handle.read()
	file_doc = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": file_name,
			"is_private": 1,
			"content": content,
		}
	)
	file_doc.insert(ignore_permissions=True)
	return {
		"file_url": file_doc.file_url,
		"file_name": file_doc.file_name,
		"label": label,
	}


@frappe.whitelist()
def export_pharmacy_dispensed_excel():
	"""Pull SAL IP/OP headers + lines from Oracle into two Excel File uploads."""
	_require_admin()
	conn = test_oracle_connection()
	if not conn.get("ok"):
		frappe.throw(
			_(
				"Oracle is not reachable from this site ({0}). "
				"Export INV_00_01 and INV_00_02 from SQL Developer using "
				"healthcare/api/sql/pharmacy_dispensed_extraction.sql, then upload "
				"those workbooks on the Legacy Sales / Pharmacy Dispensed reconcile button."
			).format(conn.get("banner") or conn.get("dsn") or _("no connection")),
			title=_("Oracle unavailable"),
		)

	schema = _schema()
	folder = frappe.get_site_path("private", "files", "oracle_exports")
	os.makedirs(folder, exist_ok=True)

	headers = _query(
		f"""
		SELECT * FROM {schema}.{HEADER_TABLE}
		WHERE TRANS_TYPE_NUM = '{TRANS_TYPE}'
		AND TRANS_SOURCE IN ('IP', 'OP')
		ORDER BY TRANS_NUM
		"""
	)
	header_path = os.path.join(folder, f"{HEADER_TABLE}_SAL_IP_OP.xlsx")
	header_count = _write_xlsx(headers, header_path, HEADER_TABLE)

	details = _query(
		f"""
		SELECT d.*
		FROM {schema}.{DETAIL_TABLE} d
		JOIN {schema}.{HEADER_TABLE} h
		  ON d.TRANS_NUM = h.TRANS_NUM
		 AND d.TRANS_TYPE_NUM = h.TRANS_TYPE_NUM
		WHERE h.TRANS_TYPE_NUM = '{TRANS_TYPE}'
		AND h.TRANS_SOURCE IN ('IP', 'OP')
		ORDER BY d.TRANS_NUM, d.SR_NUM
		"""
	)
	detail_path = os.path.join(folder, f"{DETAIL_TABLE}_SAL_IP_OP.xlsx")
	detail_count = _write_xlsx(details, detail_path, DETAIL_TABLE)

	frappe.db.commit()
	return {
		"ok": True,
		"headers": header_count,
		"lines": detail_count,
		"files": [
			_attach_file(header_path, _("Pharmacy headers (INV_00_01)")),
			_attach_file(detail_path, _("Pharmacy lines (INV_00_02)")),
		],
		"message": _(
			"Exported {0} SAL IP/OP headers and {1} lines. "
			"Reference snapshot expects about 43,709 OP + 73,321 IP headers."
		).format(header_count, detail_count),
	}
