from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import add_days, cint, getdate, nowdate

CEO_ROLES = frozenset({"CEO"})


def _require_ceo():
	if frappe.session.user in ("Guest", ""):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if frappe.session.user == "Administrator":
		return
	roles = set(frappe.get_roles(frappe.session.user))
	if not (roles & CEO_ROLES):
		frappe.throw(_("Only users with the CEO role may view IP Quotations."), frappe.PermissionError)


def _has_field(fieldname: str) -> bool:
	return bool(frappe.get_meta("Quotation").has_field(fieldname))


@frappe.whitelist()
def get_ip_quotations(
	from_date: str | None = None,
	to_date: str | None = None,
	status: str | None = "Draft",
	limit: int = 50,
	offset: int = 0,
):
	"""CEO-only list of package quotations for approval visibility."""
	_require_ceo()

	to_dt = getdate(to_date or nowdate())
	from_dt = getdate(from_date or add_days(to_dt, -30))
	if from_dt > to_dt:
		frappe.throw(_("From Date must be before To Date"))

	status = (status or "Draft").strip()
	conditions = ["q.docstatus < 2", "q.transaction_date BETWEEN %(from_date)s AND %(to_date)s"]
	params = {
		"from_date": from_dt,
		"to_date": to_dt,
		"limit": cint(limit) if cint(limit) > 0 else 50,
		"offset": max(cint(offset), 0),
	}

	# "Packaging quotations" in this project are Quotations linked to package.
	packaging_expr = "IFNULL(q.custom_package, '') != ''" if _has_field("custom_package") else "1=0"
	if _has_field("custom_packaging"):
		packaging_expr = f"({packaging_expr} OR IFNULL(q.custom_packaging, '') != '')"
	conditions.append(packaging_expr)

	if status and status.lower() != "all":
		conditions.append("q.status = %(status)s")
		params["status"] = status

	patient_name_expr = "''"
	if _has_field("custom_patient_name"):
		patient_name_expr = "q.custom_patient_name"
	elif _has_field("patient_name"):
		patient_name_expr = "q.patient_name"

	rows = frappe.db.sql(
		f"""
		SELECT
			q.name,
			q.transaction_date,
			q.status,
			q.patient,
			{patient_name_expr} AS patient_name,
			q.custom_inpatient_admission AS inpatient_admission,
			q.custom_package AS package_name,
			q.grand_total,
			q.currency
		FROM `tabQuotation` q
		WHERE {' AND '.join(conditions)}
		ORDER BY q.transaction_date DESC, q.modified DESC
		LIMIT %(limit)s OFFSET %(offset)s
		""",
		params,
		as_dict=True,
	)

	return [
		{
			"name": r.name,
			"date": r.transaction_date,
			"status": r.status,
			"patient": r.patient,
			"patient_name": r.patient_name,
			"inpatient_admission": r.inpatient_admission,
			"package_name": r.package_name,
			"grand_total": r.grand_total,
			"currency": r.currency,
		}
		for r in rows
	]

