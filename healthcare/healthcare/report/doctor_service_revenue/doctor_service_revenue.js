// Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.query_reports["Doctor Service Revenue"] = {
	filters: [
		{
			fieldname: "source",
			label: __("Source"),
			fieldtype: "Select",
			options: "Sales Invoice\nSales Order",
			default: "Sales Invoice",
			reqd: 1,
			on_change: function () {
				frappe.query_report.refresh();
			},
		},
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			default: frappe.datetime.add_months(frappe.datetime.get_today(), -1),
			reqd: 1,
		},
		{
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date",
			default: frappe.datetime.get_today(),
			reqd: 1,
		},
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			default: frappe.defaults.get_user_default("Company"),
		},
		{
			fieldname: "practitioner",
			label: __("Doctor"),
			fieldtype: "Link",
			options: "Healthcare Practitioner",
		},
		{
			fieldname: "cost_center",
			label: __("Branch / Cost Center"),
			fieldtype: "Link",
			options: "Cost Center",
		},
		{
			fieldname: "item_code",
			label: __("Service"),
			fieldtype: "Link",
			options: "Item",
		},
		{
			fieldname: "exclude_medicines",
			label: __("Exclude Medicines"),
			fieldtype: "Check",
			default: 1,
		},
		{
			fieldname: "exclude_inpatient",
			label: __("Exclude Inpatient Admission / IP Services"),
			fieldtype: "Check",
			default: 1,
		},
		{
			fieldname: "paid_only",
			label: __("Paid Only"),
			fieldtype: "Check",
			default: 1,
		},
		{
			fieldname: "view",
			label: __("View"),
			fieldtype: "Select",
			options: "Summary by Doctor\nDetailed Lines",
			default: "Summary by Doctor",
			on_change: function () {
				frappe.query_report.refresh();
			},
		},
	],
};
