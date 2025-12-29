// Copyright (c) 2025, earthians Health Informatics Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("Discharge", {
	admission: function(frm) {
		if (frm.doc.admission) {
			load_history_from_inpatient_admission(frm);
		} else {
			frm.clear_table('history_details');
			frm.refresh_field('history_details');
		}
	},
	history_form_details_template: function(frm) {
		if (frm.doc.history_form_details_template) {
			load_history_form_details_template(frm);
		} else {
			// If template is cleared but admission exists, reload from admission
			if (frm.doc.admission) {
				load_history_from_inpatient_admission(frm);
			} else {
				frm.clear_table('history_details');
				frm.refresh_field('history_details');
			}
		}
	}
});

let load_history_from_inpatient_admission = function(frm) {
	if (!frm.doc.admission) {
		return;
	}
	
	frappe.call({
		method: 'frappe.client.get',
		args: {
			doctype: 'Inpatient Admission',
			name: frm.doc.admission
		},
		callback: function(r) {
			if (r.message && r.message.history_attributes) {
				// Clear existing items
				frm.clear_table('history_details');
				
				// Add items from Inpatient Admission
				r.message.history_attributes.forEach(function(item) {
					let row = frm.add_child('history_details');
					row.attribute = item.attribute;
					row.description_on_admission = item.description_on_admission || '';
					row.description_on_discharge = '';
				});
				
				// Set template if available
				if (r.message.history_form_details_template) {
					frm.set_value('history_form_details_template', r.message.history_form_details_template);
				}
				
				frm.refresh_field('history_details');
			}
		}
	});
}

let load_history_form_details_template = function(frm) {
	if (!frm.doc.history_form_details_template) {
		return;
	}
	
	frappe.call({
		method: 'frappe.client.get',
		args: {
			doctype: 'History Form Details Template',
			name: frm.doc.history_form_details_template
		},
		callback: function(r) {
			if (r.message && r.message.attributes) {
				// If admission exists, preserve description_on_admission values
				let existing_details = {};
				if (frm.doc.history_details && frm.doc.history_details.length > 0) {
					frm.doc.history_details.forEach(function(item) {
						if (item.attribute) {
							existing_details[item.attribute] = item.description_on_admission || '';
						}
					});
				}
				
				// Clear existing items
				frm.clear_table('history_details');
				
				// Add attributes from template
				r.message.attributes.forEach(function(item) {
					let row = frm.add_child('history_details');
					row.attribute = item.attribute;
					// Preserve existing description_on_admission if available
					row.description_on_admission = existing_details[item.attribute] || '';
					row.description_on_discharge = '';
				});
				
				frm.refresh_field('history_details');
			}
		}
	});
}
