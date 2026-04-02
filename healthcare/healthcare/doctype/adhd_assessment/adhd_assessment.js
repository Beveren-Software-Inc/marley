// Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
// For license information, please see license.txt

// frappe.ui.form.on("ADHD Assessment", {
// 	refresh(frm) {

// 	},
// });

frappe.ui.form.on('ADHD Assessment', {
    template: function(frm) {
        if (!frm.doc.template) return;

        // Clear existing responses
        frm.clear_table("responses");

        // Fetch the selected template
        frappe.call({
            method: "frappe.client.get",
            args: {
                doctype: "ADHD Assessment Template",
                name: frm.doc.template
            },
            callback: function(r) {
                let template = r.message;

                if(template && template.questions) {
                    template.questions.forEach(q => {
                        let row = frm.add_child("responses");
                        row.question_no = q.question_no;
                        row.question = q.question;
                        row.part = q.part;
                        row.threshold_type = q.threshold_type;
                        row.is_screening_question = q.is_screening_question;
                    });
                    frm.refresh_field("responses");
                }
            }
        });
    }
});

// Optional: compute scores when response changes
frappe.ui.form.on('ADHD Assessment Response', {
    response: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        const score_map = {
            "Never": 0,
            "Rarely": 1,
            "Sometimes": 2,
            "Often": 3,
            "Very Often": 4
        };

        row.score = score_map[row.response] || 0;

        // Determine if positive (Part A rules)
        let is_positive = false;
        if(row.is_screening_question) {
            if(row.threshold_type === "Sometimes+" && row.score >= 2) {
                is_positive = true;
            }
            if(row.threshold_type === "Often+" && row.score >= 3) {
                is_positive = true;
            }
        }
        row.is_positive = is_positive ? 1 : 0;

        frm.refresh_field("responses");

        // Update overall Part A positive count
        update_part_a_result(frm);
    }
});

function update_part_a_result(frm) {
    let count = 0;
    frm.doc.responses.forEach(row => {
        if(row.is_screening_question && row.is_positive) {
            count++;
        }
    });
    frm.set_value("positive_count", count);
    frm.set_value("result", count >= 4 ? "Positive" : "Negative");
    frm.refresh_field("positive_count");
    frm.refresh_field("result");
}