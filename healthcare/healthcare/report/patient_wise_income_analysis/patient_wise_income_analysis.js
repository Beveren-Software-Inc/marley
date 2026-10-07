// Copyright (c) 2026, Healthcare and contributors
// For license information, please see license.txt

frappe.query_reports["Patient Wise Income Analysis"] = {
	filters: [
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			default: frappe.datetime.year_start(),
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
			fieldname: "period",
			label: __("Period"),
			fieldtype: "Select",
			options: "Yearly\nQuarterly\nMonthly",
			default: "Yearly",
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
			fieldname: "cost_center",
			label: __("Branch / Cost Center"),
			fieldtype: "Link",
			options: "Cost Center",
		},
		{
			fieldname: "source",
			label: __("Billing Source"),
			fieldtype: "Select",
			options: "Sales Invoice\nSales Order",
			default: "Sales Invoice",
			reqd: 1,
		},
		{
			fieldname: "limit",
			label: __("Limit"),
			fieldtype: "Int",
			default: 100,
			reqd: 1,
			description: __("Top patients by net income (scroll table for loaded rows)"),
		},
		{
			fieldname: "paid_only",
			label: __("Paid Only"),
			fieldtype: "Check",
			default: 0,
		},
		{
			fieldname: "exclude_medicines",
			label: __("Exclude Medicines"),
			fieldtype: "Check",
			default: 0,
		},
	],
};
