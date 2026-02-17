// Copyright (c) 2025, earthians Health Informatics Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("Discharge", {
	refresh: function(frm) {
		// Sync Follow Up Date from Next Appointment Date when empty (for CRM Patient Follow Up)
		if (!frm.doc.follow_up_date && frm.doc.next_appointment_date) {
			frm.set_value("follow_up_date", frm.doc.next_appointment_date);
		}
	},
	next_appointment_date: function(frm) {
		if (frm.doc.next_appointment_date && !frm.doc.follow_up_date) {
			frm.set_value("follow_up_date", frm.doc.next_appointment_date);
		}
	},
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
	},
	discharge_template: function(frm) {

        if (!frm.doc.discharge_template) {
            return;
        }

        // clear existing rows
        frm.clear_table('discharge_checklist');

        frappe.call({
            method: "frappe.client.get",
            args: {
                doctype: "Discharge Template",
                name: frm.doc.discharge_template
            },
            callback: function(r) {

                if (!r.message) return;

                let template = r.message;

                (template.discharge_checklist || []).forEach(row => {

                    let child = frm.add_child('discharge_checklist');

                    // auto-fill only required fields
                    child.action_required = row.action_required;
                    child.department = row.department;

                });

                frm.refresh_field('discharge_checklist');
            }
        });
    },

	before_save: function(frm) {
		
		// only set if still empty
		if (!frm.doc.follow_up_date) {
			
			frappe.db.get_single_value(
				"Healthcare Settings",
				"follow_up_reminder_after_discharge"
			).then(days => {
				console.log("Okay, got days for follow up reminder after discharge:", days);
				if (days) {
					let follow_up = frappe.datetime.add_days(
						frappe.datetime.get_today(),
						days
					);
					frm.set_value("follow_up_date", follow_up);
				}
			});
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
