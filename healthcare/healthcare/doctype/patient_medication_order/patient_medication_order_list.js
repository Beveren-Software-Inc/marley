frappe.listview_settings['Patient Medication Order'] = {
	add_fields: ["status"],
	filters: [["status", "!=", "Cancelled"]],
	get_indicator: function(doc) {
		if (doc.status === "Signed") {
			return [__("Signed"), "purple", "status,=,Signed"];
		} else if (doc.status === "Unsigned") {
			return [__("Unsigned"), "orange", "status,=,Unsigned"];
		} else if (doc.status === "Draft") {
			return [__("Draft"), "grey", "status,=,Draft"];
		} else if (doc.status === "Pending") {
			return [__("Pending"), "orange", "status,=,Pending"];
		} else if (doc.status === "In Process") {
			return [__("In Process"), "blue", "status,=,In Process"];
		} else if (doc.status === "Completed") {
			return [__("Completed"), "green", "status,=,Completed"];
		}
	}
};
