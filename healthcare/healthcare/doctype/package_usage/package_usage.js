// Copyright (c) 2025, Healthcare and contributors
// For license information, please see license.txt

frappe.ui.form.on('Package Usage', {
	refresh: function(frm) {
		// Add any custom logic here if needed
	},
	
	package_enrollment: function(frm) {
		if (frm.doc.package_enrollment) {
			// Fetch enrollment details
			frappe.call({
				method: 'frappe.client.get',
				args: {
					doctype: 'Inpatient Package Enrollment',
					name: frm.doc.package_enrollment
				},
				callback: function(r) {
					if (r.message) {
						frm.set_value('patient', r.message.patient);
						frm.set_value('package', r.message.package);
					}
				}
			});
		}
	},
	
	service_type: function(frm) {
		if (frm.doc.service_type) {
			// Set options for reference based on service type
			let options = '';
			if (frm.doc.service_type === 'Room') {
				options = 'Healthcare Service Unit';
			} else if (frm.doc.service_type === 'Service') {
				options = 'Service Request';
			} else if (frm.doc.service_type === 'Procedure') {
				options = 'Clinical Procedure Template';
			} else if (frm.doc.service_type === 'Item') {
				options = 'Item';
			}
			
			if (options) {
				frm.set_df_property('reference', 'options', options);
				frm.refresh_field('reference');
			}
		}
	}
});
