// Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
// For license information, please see license.txt

// frappe.ui.form.on("Clinical Suicide Risk Assessment", {
// 	refresh(frm) {

// 	},
// });

frappe.ui.form.on('Clinical Risk Assessment', {
    validate(frm) {
        let score = 0;

        // Answers are Select fields: only an explicit Yes/No scores, an
        // unanswered question (blank) is never counted as a No.
        if (frm.doc.has_ideation === 'Yes') score++;
        if (frm.doc.has_plan === 'Yes') score++;
        if (frm.doc.has_history === 'Yes') score++;
        if (frm.doc.has_stressors === 'Yes') score++;
        if (frm.doc.has_support === 'No') score++;
        if (frm.doc.has_coping === 'No') score++;

        frm.set_value('risk_score', score);

        if (score <= 1) {
            frm.set_value('risk_level', 'Low');
        } else if (score <= 3) {
            frm.set_value('risk_level', 'Medium');
        } else {
            frm.set_value('risk_level', 'High');
        }

        // Emergency override
        if (frm.doc.plan_immediacy === "Immediate" || frm.doc.plan_immediacy === "Next 24 hours") {
            frm.set_value('risk_level', 'Emergency');
        }
    }
});