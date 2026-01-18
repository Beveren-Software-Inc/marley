// Copyright (c) 2025, Healthcare and contributors
// For license information, please see license.txt

frappe.ui.form.on('Inpatient Package Enrollment', {
	refresh: function(frm) {
		// Add any custom logic here if needed
	},
	
	package: function(frm) {
		if (frm.doc.package && frm.doc.start_date) {
			// Fetch package details and calculate expected discharge date
			frappe.call({
				method: 'frappe.client.get',
				args: {
					doctype: 'Inpatient Package',
					name: frm.doc.package
				},
				callback: function(r) {
					if (r.message && r.message.no_of_days && frm.doc.start_date) {
						let start_date = frappe.datetime.str_to_obj(frm.doc.start_date);
						let expected_date = frappe.datetime.add_days(start_date, r.message.no_of_days - 1);
						frm.set_value('expected_discharge_date', frappe.datetime.obj_to_str(expected_date));
						frm.set_value('package_rate', r.message.package_rate);
					}
				}
			});
		}
	},
	
	start_date: function(frm) {
		if (frm.doc.package && frm.doc.start_date) {
			// Recalculate expected discharge date when start date changes
			frm.trigger('package');
		}
	}
});
