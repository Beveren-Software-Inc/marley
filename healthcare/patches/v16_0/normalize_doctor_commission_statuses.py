import frappe


def execute():
	"""Doctor commission is approved by submitting, not by creating Additional Salary.

	The old flow used Reviewed / Salary Created, which are no longer Select options
	on Doctor Commission Payroll (Generated / Approved) and Commission Payslip
	(Draft / Submitted / Paid), so existing rows are moved onto the new values.
	"""
	frappe.db.sql(
		"""UPDATE `tabDoctor Commission Payroll`
		   SET status = CASE docstatus
		       WHEN 1 THEN 'Approved'
		       WHEN 2 THEN 'Cancelled'
		       ELSE 'Generated'
		   END
		   WHERE status IN ('Reviewed', 'Salary Created')"""
	)
	frappe.db.sql(
		"""UPDATE `tabCommission Payslip`
		   SET status = CASE docstatus
		       WHEN 1 THEN 'Submitted'
		       WHEN 2 THEN 'Cancelled'
		       ELSE 'Draft'
		   END
		   WHERE status IN ('Reviewed', 'Approved')"""
	)
