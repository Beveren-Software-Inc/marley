// Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.query_reports["DUR Report"] = {
	filters: [
		{
			fieldname: "cost_center",
			label: __("Branch"),
			fieldtype: "Link",
			options: "Cost Center",
		},
		{
			fieldname: "patient",
			label: __("Patient"),
			fieldtype: "Link",
			options: "Patient",
		},
		{
			fieldname: "practitioner",
			label: __("Practitioner"),
			fieldtype: "Link",
			options: "Healthcare Practitioner",
		},
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
		},
		{
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date",
		},
		{
			fieldname: "drug",
			label: __("Drug Name"),
			fieldtype: "Link",
			options: "Item",
			get_query: function () {
				return {
					filters: { is_stock_item: 1 },
				};
			},
		},
		
	],
};
