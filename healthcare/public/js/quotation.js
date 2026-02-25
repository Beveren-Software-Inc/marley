frappe.ui.form.on(["Quotation"], {

    patient(frm) {
        if (!frm.doc.patient) return;

        // Fetch customer having same name as patient
        frappe.db.get_value(
            "Customer",
            { name: frm.doc.patient },   // same ID assumption
            "name"
        ).then(r => {
                console.log("Maniach", r);
            if (r.message && r.message.name) {
                frm.set_value("party_name", r.message.name);
            } else {
                frappe.msgprint(
                    __("No Customer found matching Patient {0}", [frm.doc.patient])
                );
            }

        });
    }

});