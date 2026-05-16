import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	custom_fields = {
		"Lab Test": [
			{
				"fieldname": "doctor_review_section",
				"fieldtype": "Section Break",
				"label": "Doctor Review",
				"collapsible": 1,
				"insert_after": "reviewed_by",
			},
			{
				"fieldname": "results_entered_datetime",
				"fieldtype": "Datetime",
				"label": "Results Entered At",
				"read_only": 1,
				"insert_after": "doctor_review_section",
			},
			{
				"fieldname": "doctor_reviewed_datetime",
				"fieldtype": "Datetime",
				"label": "Doctor Reviewed At",
				"read_only": 1,
				"insert_after": "results_entered_datetime",
			},
			{
				"fieldname": "review_turnaround_hours",
				"fieldtype": "Float",
				"label": "Review Turnaround (Hours)",
				"read_only": 1,
				"precision": 3,
				"insert_after": "doctor_reviewed_datetime",
			},
			{
				"fieldname": "review_report_type",
				"fieldtype": "Select",
				"label": "Review Report Type",
				"options": "\nPathology\nRadiology\nMicrobiology\nOther",
				"insert_after": "review_turnaround_hours",
			},
			{
				"fieldname": "review_result_indicator",
				"fieldtype": "Select",
				"label": "Result Indicator",
				"options": (
					"\nNormal\nNormal, but unexpected\nSatisfactory\nBorderline\n"
					"Abnormal, but expected\nAbnormal\nSpecimen lost / unusable\n"
					"Not responded to invitation\nPositive\nNegative\nUnknown"
				),
				"insert_after": "review_report_type",
			},
			{
				"fieldname": "review_follow_up_actions",
				"fieldtype": "Small Text",
				"label": "Follow-up Actions (JSON)",
				"insert_after": "review_result_indicator",
			},
			{
				"fieldname": "review_follow_up_other",
				"fieldtype": "Small Text",
				"label": "Other Follow-up Detail",
				"insert_after": "review_follow_up_actions",
			},
			{
				"fieldname": "review_comments",
				"fieldtype": "Text",
				"label": "Review Comments",
				"insert_after": "review_follow_up_other",
			},
			{
				"fieldname": "review_prescription_message",
				"fieldtype": "Small Text",
				"label": "Message for Next Prescription",
				"insert_after": "review_comments",
			},
			{
				"fieldname": "column_break_review_opts",
				"fieldtype": "Column Break",
				"insert_after": "review_prescription_message",
			},
			{
				"fieldname": "patient_informed_of_report",
				"fieldtype": "Check",
				"label": "Patient Informed of Report",
				"default": "1",
				"insert_after": "column_break_review_opts",
			},
			{
				"fieldname": "archive_report_on_review",
				"fieldtype": "Check",
				"label": "Archive Report",
				"default": "0",
				"insert_after": "patient_informed_of_report",
			},
			{
				"fieldname": "create_task_on_review",
				"fieldtype": "Check",
				"label": "Create Task on Review",
				"default": "0",
				"insert_after": "archive_report_on_review",
			},
		]
	}
	create_custom_fields(custom_fields, update=True)

	# Backfill results_entered_datetime for tests already awaiting review
	frappe.db.sql(
		"""
		UPDATE `tabLab Test`
		SET results_entered_datetime = submitted_date
		WHERE docstatus = 1
			AND results_entered_datetime IS NULL
			AND submitted_date IS NOT NULL
			AND status IN ('Pending Review', 'Submitted', 'Completed', 'Reviewed', 'Rejected')
		"""
	)
