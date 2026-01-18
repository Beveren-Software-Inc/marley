// Copyright (c) 2025, Healthcare and contributors
// For license information, please see license.txt

frappe.ui.form.on('Inpatient Package', {
	refresh: function(frm) {
		// Set query for reference field based on service_type
		frm.set_query('reference', 'services', function(doc, cdt, cdn) {
			let row = locals[cdt][cdn];
			let filters = {};
			
			// Return appropriate doctype based on service_type
			// Note: We'll handle the doctype selection via set_df_property in service_type change
			return {
				filters: filters
			};
		});
	}
});

frappe.ui.form.on('Inpatient Package Service', {
	service_type: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		// Clear reference when service type changes
		frappe.model.set_value(cdt, cdn, 'reference', '');
		
		// Set reference_doctype based on service type for Dynamic Link
		let doctype = '';
		if (row.service_type === 'Room') {
			doctype = 'Healthcare Service Unit';
		} else if (row.service_type === 'Service') {
			doctype = 'Service Request';
		} else if (row.service_type === 'Procedure') {
			doctype = 'Clinical Procedure Template';
		} else if (row.service_type === 'Item') {
			doctype = 'Item';
		}
		
		if (doctype) {
			frappe.model.set_value(cdt, cdn, 'reference_doctype', doctype);
			frm.refresh_field('services');
		}
	},
	
	is_unlimited: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (row.is_unlimited) {
			frappe.model.set_value(cdt, cdn, 'quantity_days', 0);
		}
	},
	
	quantity_days: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (row.quantity_days > 0) {
			frappe.model.set_value(cdt, cdn, 'is_unlimited', 0);
		}
	}
});
