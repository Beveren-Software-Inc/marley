// Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.query_reports["Bed Occupancy"] = {
	filters: [
		{
			fieldname: "occupancy_status",
			label: __("Occupancy Status"),
			fieldtype: "Select",
			options: "\nVacant\nOccupied",
		},
		{
			fieldname: "service_unit",
			label: __("Room / Service Unit"),
			fieldtype: "Link",
			options: "Healthcare Service Unit",
			get_query: function () {
				return {
					filters: {
						inpatient_occupancy: 1,
						is_group: 0,
					},
				};
			},
		},
		{
			fieldname: "cost_center",
			label: __("Branch"),
			fieldtype: "Link",
			options: "Cost Center",
		},
	],

	formatter: function (value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);
		if (!data) return value;

		if (column.fieldname === "occupancy_status") {
			const status = (data.occupancy_status || "").trim();
			if (status === "Occupied") {
				return `<span style="color:#c2410c;font-weight:600">${value}</span>`;
			}
			if (status === "Vacant") {
				return `<span style="color:#047857;font-weight:600">${value}</span>`;
			}
		}

		if (column.fieldname === "admission" && data.admission) {
			return value;
		}

		return value;
	},
};
