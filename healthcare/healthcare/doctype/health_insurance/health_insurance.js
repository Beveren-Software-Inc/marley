// Copyright (c) 2025, earthians Health Informatics Pvt. Ltd. and contributors
// For license information, please see license.txt

// frappe.ui.form.on("Health Insurance", {
// 	refresh(frm) {

// 	},
// });

frappe.ui.form.on("Health Insurance", {

    refresh(frm) {

        // Inclusive Fetch
        frm.add_custom_button("Fetch Inclusive Items", () => {

            frappe.call({
                method:
                    "healthcare.healthcare.doctype.health_insurance.health_insurance.fetch_inclusive_items",
                args: {
                    docname: frm.doc.name
                },
                freeze: true,
                callback() {
                    frm.reload_doc();
                }
            });

        }, "Actions");


        // Exclusive Fetch
        frm.add_custom_button("Fetch Exclusive Items", () => {

            frappe.call({
                method:
                    "healthcare.healthcare.doctype.health_insurance.health_insurance.fetch_exclusive_items",
                args: {
                    docname: frm.doc.name
                },
                freeze: true,
                callback() {
                    frm.reload_doc();
                }
            });

        }, "Actions");
    }
});