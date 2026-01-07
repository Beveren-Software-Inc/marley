// Copyright (c) 2025, earthians Health Informatics Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("Suicidal Patient Assessment", {
	refresh(frm) {
		// Add button to open IP Risk Analysis if linked
		if (frm.doc.ip_risk_analysis_reference) {
			frm.add_custom_button(__('Open IP Risk Analysis'), function() {
				frappe.set_route('Form', 'IP Risk Analysis', frm.doc.ip_risk_analysis_reference);
			}, __('View'));
		}
		
		// Auto-fetch patient details when admission is selected
		if (frm.doc.admission_no && !frm.doc.patient) {
			frappe.db.get_value('Inpatient Admission', frm.doc.admission_no, 'patient', (r) => {
				if (r && r.patient) {
					frm.set_value('patient', r.patient);
				}
			});
		}
	},
	
	admission_no: function(frm) {
		if (frm.doc.admission_no) {
			frappe.db.get_value('Inpatient Admission', frm.doc.admission_no, ['patient', 'branch'], (r) => {
				if (r) {
					if (r.patient) frm.set_value('patient', r.patient);
					if (r.branch) frm.set_value('branch', r.branch);
				}
			});
		}
	},
	
	patient: function(frm) {
		if (frm.doc.patient) {
			frappe.db.get_value('Patient', frm.doc.patient, ['patient_name', 'sex'], (r) => {
				if (r) {
					if (r.patient_name) frm.set_value('patient_name', r.patient_name);
				}
			});
		}
	}
});
