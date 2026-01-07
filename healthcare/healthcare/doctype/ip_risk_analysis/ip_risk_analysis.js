// Copyright (c) 2025, earthians Health Informatics Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("IP Risk Analysis", {
	refresh(frm) {
		// Add button to create Suicidal Patient Assessment
		if (frm.doc.admission_no && !frm.is_new()) {
			frm.add_custom_button(__('Create Suicidal Assessment'), function() {
				create_suicidal_assessment(frm);
			}, __('Actions'));
		}
		
		// If suicidal assessment exists, add button to open it
		if (frm.doc.suicidal_patient_assessment) {
			frm.add_custom_button(__('Open Suicidal Assessment'), function() {
				frappe.set_route('Form', 'Suicidal Patient Assessment', frm.doc.suicidal_patient_assessment);
			}, __('View'));
		}
	},
	
	create_suicidal_assessment: function(frm) {
		create_suicidal_assessment(frm);
	}
});

function create_suicidal_assessment(frm) {
	if (!frm.doc.admission_no) {
		frappe.msgprint(__('Please select an Admission No first'));
		return;
	}
	
	frappe.model.with_doc('Inpatient Admission', frm.doc.admission_no, function() {
		frappe.db.get_value('Inpatient Admission', frm.doc.admission_no, ['patient', 'branch'], function(r) {
			if (r) {
				let doc = frappe.model.get_new_doc('Suicidal Patient Assessment');
				doc.admission_no = frm.doc.admission_no;
				doc.patient = r.patient;
				doc.assessment_date = frappe.datetime.get_today();
				doc.ip_risk_analysis_reference = frm.doc.name;
				
				frappe.set_route('Form', 'Suicidal Patient Assessment', doc.name);
			}
		});
	});
}
