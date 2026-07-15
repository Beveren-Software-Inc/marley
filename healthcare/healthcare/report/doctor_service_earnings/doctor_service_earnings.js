// Copyright (c) 2026, Healthcare and contributors
// For license information, please see license.txt

frappe.query_reports["Doctor Service Earnings"] = {
	filters: [
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
			fieldname: "view",
			label: __("View"),
			fieldtype: "Select",
			options: "Summary by Doctor\nDetailed Lines",
			default: "Summary by Doctor",
		},
	],
};
