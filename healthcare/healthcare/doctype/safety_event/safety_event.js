// Copyright (c) 2026, Beveren Software Inc. and contributors
// For license information, please see license.txt

frappe.ui.form.on('Safety Event', {
	refresh: function(frm) {
		// Set default values
		if (frm.is_new()) {
			frm.set_value('report_date', frappe.datetime.get_today());
			frm.set_value('event_discovery_date', frappe.datetime.get_today());
		}
	},
	
	risk_probability: function(frm) {
		calculate_risk_score(frm);
	},
	
	risk_severity: function(frm) {
		calculate_risk_score(frm);
	},
	
	affected_person: function(frm) {
		// Clear patient-related fields if affected person is not Patient
		if (frm.doc.affected_person !== 'Patient') {
			frm.set_value('number_of_patients', 0);
			frm.set_value('patient', '');
			frm.set_value('patient_cpr', '');
			frm.set_value('patient_file_no', '');
			frm.set_value('patient_gender', '');
			frm.set_value('risk_probability', '');
			frm.set_value('risk_severity', '');
			frm.set_value('risk_score', '');
			frm.set_value('risk_rate', '');
		}
	},
	
	anonymous_reporter: function(frm) {
		// Clear reporter fields if anonymous
		if (frm.doc.anonymous_reporter) {
			frm.set_value('reporter_first_name', '');
			frm.set_value('reporter_middle_name', '');
			frm.set_value('reporter_last_name', '');
			frm.set_value('reporter_mobile', '');
			frm.set_value('reporter_email', '');
			frm.set_value('reporter_position_title', '');
		}
	},
	
	patient: function(frm) {
		// Fetch patient details if patient is selected
		if (frm.doc.patient) {
			frappe.db.get_value('Patient', frm.doc.patient, ['sex', 'name'], (r) => {
				if (r) {
					if (r.sex) {
						frm.set_value('patient_gender', r.sex);
					}
					// You can fetch CPR and File No if they exist in Patient doctype
					// frm.set_value('patient_cpr', r.cpr);
					// frm.set_value('patient_file_no', r.file_number);
				}
			});
		}
	}
});

function calculate_risk_score(frm) {
	if (frm.doc.affected_person === 'Patient' && frm.doc.risk_probability && frm.doc.risk_severity) {
		// Extract numeric values
		let prob_value = parseInt(frm.doc.risk_probability.split(' - ')[0]) || parseInt(frm.doc.risk_probability);
		let severity_value = parseInt(frm.doc.risk_severity.split(' - ')[0]) || parseInt(frm.doc.risk_severity);
		
		if (prob_value && severity_value) {
			let risk_score = prob_value * severity_value;
			frm.set_value('risk_score', risk_score);
			
			// Determine risk rate
			let risk_rate = '';
			if (risk_score >= 1 && risk_score <= 8) {
				risk_rate = 'Low Risk (1-8)';
			} else if (risk_score >= 9 && risk_score <= 15) {
				risk_rate = 'Medium Risk (9-15)';
			} else if (risk_score >= 16 && risk_score <= 25) {
				risk_rate = 'High Risk (16-25)';
			}
			
			frm.set_value('risk_rate', risk_rate);
		}
	}
}



