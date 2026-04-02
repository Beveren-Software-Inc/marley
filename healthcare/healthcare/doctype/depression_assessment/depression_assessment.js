// Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
// For license information, please see license.txt

// frappe.ui.form.on("Depression Assessment", {
// 	refresh(frm) {

// 	},
// });
frappe.ui.form.on('Depression Assessment', {
    template: function(frm) {
        if (!frm.doc.template) return;

        // Clear existing responses
        frm.clear_table("responses");

        // Fetch the selected template
        frappe.call({
            method: "frappe.client.get",
            args: {
                doctype: "Depression Assessment Template",
                name: frm.doc.template
            },
            callback: function(r) {
                let template = r.message;

                if (template && template.questions) {
                    template.questions.forEach(q => {
                        let row = frm.add_child("responses");
                        row.question_no = q.question_no;
                        row.question = q.question;
                    });
                    frm.refresh_field("responses");
                }
            }
        });
    }
});

// Compute score when a response is selected
frappe.ui.form.on('Depression Assessment Response', {
    response: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        let score = parseInt(row.response);
        row.score = isNaN(score) ? 0 : score;

        frm.refresh_field("responses");

        // Update total score and depression level
        update_total_and_level(frm);
    }
});

// Function to compute total score and set level of depression
function update_total_and_level(frm) {
    let total = 0;
    frm.doc.responses.forEach(row => {
        total += row.score || 0;
    });
    frm.set_value("total_score", total);
    frm.set_value("level_of_depression", compute_depression_level(total));
    frm.refresh_field("total_score");
    frm.refresh_field("level_of_depression");
}

// Determine depression level based on total score
function compute_depression_level(total_score) {
    if (total_score <= 10) return "Normal";
    if (total_score <= 16) return "Mild mood disturbance";
    if (total_score <= 20) return "Borderline clinical depression";
    if (total_score <= 30) return "Moderate depression";
    if (total_score <= 40) return "Severe depression";
    return "Extreme depression";
}